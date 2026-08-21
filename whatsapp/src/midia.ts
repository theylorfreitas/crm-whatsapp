import type { SupabaseClient } from '@supabase/supabase-js'
import type { Zapper } from './zapper.js'

// Onde a mídia recebida pelo WhatsApp vai parar.
//
// Por que copiar em vez de guardar a URL do provedor antigo: a URL que ele devolve aponta
// pra `localhost:3000` (a porta de DENTRO do contêiner) e exige a chave da
// API. O navegador não alcança nem uma coisa nem outra, e mandar a chave pro
// front deixaria qualquer visitante enviando mensagem pelo número do cliente.
//
// O arquivo original do WhatsApp também não serve de arquivo morto: some em
// poucos dias. Copiar é o que faz a conversa de três meses atrás ainda ter a
// foto quando alguém abrir.

export const BUCKET = 'whatsapp-media'

/** O que o CRM aceita em `crm_messages.media_kind`. */
export type TipoDeMidia = 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha'

/**
 * `figurinha` é um tipo à parte e não um `imagem` qualquer.
 *
 * Pelo mimetype as duas são idênticas — figurinha chega como `image/webp`, e
 * webp também é formato de foto. A diferença é de LEITURA: no WhatsApp a
 * figurinha aparece pequena, sem moldura e com o fundo transparente, e uma
 * figurinha desenhada como foto vira um quadrado enorme com fundo recortado no
 * meio da conversa. Só o provedor sabe qual é qual, por isso vem de fora.
 */
export function tipoDeMidia(mime: string, figurinha = false): TipoDeMidia {
  if (figurinha) return 'figurinha'
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'documento'
}

/** O que uma mensagem carrega de arquivo, sem o vocabulário de nenhum provedor. */
export interface ArquivoDaMensagem {
  /** URL direta, quando o provedor entrega uma que abre. */
  mediaUrl: string | null
  /** Id pra pedir o arquivo ao provedor, quando ele não veio por URL. */
  mediaId: string | null
  mediaMimetype: string | null
  figurinha: boolean
}

/** Extensão a partir do mimetype, que é o que o provedor antigo entrega de confiável. */
function extensao(mime: string): string {
  const conhecidos: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  }
  const conhecido = conhecidos[mime]
  if (conhecido) return conhecido
  // Sobrou o subtipo cru ("vnd.ms-excel", "3gpp"): limpa e corta, porque isso
  // vira nome de arquivo no Storage.
  const bruto = (mime.split('/')[1] ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 5)
  return bruto.length > 0 ? bruto : 'bin'
}

export interface MidiaGuardada {
  path: string
  kind: TipoDeMidia
}

/**
 * Busca no provedor antigo e guarda no Storage. Devolve `null` quando não deu — e não
 * lança: uma foto que falhou não pode fazer a mensagem inteira se perder, o
 * texto ainda vale.
 *
 * O caminho começa com o clientId porque é ele que a política do Storage
 * confere pra decidir quem pode ver o arquivo.
 */
export async function guardarMidia(
  db: SupabaseClient,
  zap: Zapper,
  clientId: string,
  urlDaMidia: string,
  mimetypeSugerido: string | null,
  figurinha = false,
): Promise<MidiaGuardada | null> {
  const baixado = await zap.baixarMidia(urlDaMidia).catch(() => null)
  if (!baixado) return null

  // O content-type da resposta é mais confiável que o do webhook, mas quando
  // o servidor responde o genérico o do webhook é que diz algo.
  const mime =
    baixado.mimetype === 'application/octet-stream' && mimetypeSugerido ? mimetypeSugerido : baixado.mimetype

  return guardarBytes(db, clientId, baixado.bytes, mime, figurinha)
}

/**
 * O caminho ÚNICO por onde toda mídia recebida entra no CRM.
 *
 * Existe porque havia dois: o webhook guardava pela URL do evento e a
 * importação também — e a URL do evento é o `.enc` cifrado, que baixa 200 e
 * entrega lixo. O resultado era mídia nenhuma no histórico e mídia quebrada ao
 * vivo, com as duas correções tendo que ser feitas em dois lugares.
 *
 * A ordem aqui é a que funciona: pede primeiro o endereço em claro pelo id, e
 * só cai na URL crua quando não há id — que é o caso dos provedores que já
 * entregam o arquivo aberto.
 */
export async function guardarArquivoDaMensagem(
  db: SupabaseClient,
  zap: Zapper,
  clientId: string,
  sessao: string,
  arquivo: ArquivoDaMensagem,
): Promise<MidiaGuardada | null> {
  if (arquivo.mediaId) {
    const emClaro = await zap.urlDaMidia(sessao, arquivo.mediaId)
    if (emClaro) {
      return guardarMidia(db, zap, clientId, emClaro.url, emClaro.mimetype ?? arquivo.mediaMimetype, arquivo.figurinha)
    }
  }
  if (!arquivo.mediaUrl) return null
  return guardarMidia(db, zap, clientId, arquivo.mediaUrl, arquivo.mediaMimetype, arquivo.figurinha)
}

/**
 * Guarda bytes que JÁ estão na mão. Separado de `guardarMidia` porque cada
 * canal busca o arquivo de um jeito — o provedor antigo entrega por URL, a Cloud API
 * entrega um id que exige duas idas — mas o que se faz com os bytes depois é
 * idêntico, e duplicar isso duplicaria também a regra do caminho no Storage.
 */
export async function guardarBytes(
  db: SupabaseClient,
  clientId: string,
  bytes: Buffer,
  mimetype: string,
  figurinha = false,
): Promise<MidiaGuardada | null> {
  const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensao(mimetype)}`

  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimetype,
    upsert: false,
  })
  if (error) return null

  return { path, kind: tipoDeMidia(mimetype, figurinha) }
}

/**
 * Traz de volta do Storage o arquivo que o atendente anexou, pra ponte poder
 * mandar pro WhatsApp. O caminho é o que está em `crm_messages.media_path`.
 */
export async function lerDoStorage(
  db: SupabaseClient,
  path: string,
): Promise<{ bytes: Buffer; mimetype: string; filename: string } | null> {
  const { data, error } = await db.storage.from(BUCKET).download(path)
  if (error || !data) return null

  const bytes = Buffer.from(await data.arrayBuffer())
  if (bytes.length === 0) return null

  return {
    bytes,
    // O `type` do Blob vem do content-type que o Storage guardou no upload.
    mimetype: data.type && data.type !== 'application/octet-stream' ? data.type : 'application/octet-stream',
    filename: path.split('/').pop() ?? 'arquivo',
  }
}

/**
 * A foto de perfil do contato, copiada pro Storage.
 *
 * Diferente da mídia, esta URL é do CDN do WhatsApp e é buscada SEM a chave do
 * provedor antigo — mas tem validade no próprio endereço (`oe=...`). Guardar a URL daria
 * uma lista bonita hoje e cheia de avatar quebrado na semana que vem.
 *
 * Devolve `null` em silêncio quando o contato não tem foto ou a escondeu por
 * privacidade — que é comum, e não é falha.
 */
export async function guardarFotoDePerfil(
  db: SupabaseClient,
  clientId: string,
  urlDaFoto: string,
): Promise<string | null> {
  const res = await fetch(urlDaFoto).catch(() => null)
  if (!res?.ok) return null

  const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0]!
  if (!mime.startsWith('image/')) return null

  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length === 0) return null

  const path = `${clientId}/avatares/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensao(mime)}`
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
  return error ? null : path
}

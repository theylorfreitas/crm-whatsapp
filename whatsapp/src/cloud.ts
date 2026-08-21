import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cortarTitulo, LIMITE_DA_LINHA, LIMITE_DO_TITULO, MAX_BOTOES } from './zap.js'
import type { Botao, LinhaDaLista, ResultadoRico } from './zap.js'

// Cliente da Cloud API oficial da Meta.
//
// POR QUE ELE EXISTE. Botão interativo mandado pela conexão de QR Code não
// chega: medimos com as três formas lado a lado pro mesmo número, e só o texto
// puro foi entregue — botão e lista pararam no servidor da Meta, com o provedor antigo
// respondendo 201 e id de mensagem nos dois. Não é o payload; é a Meta
// descartando mensagem interativa de remetente não oficial. A Cloud API é o
// único caminho em que botão exposto é recurso suportado.
//
// O QUE ELE NÃO É. Não é um segundo jeito de mandar pelo mesmo número. Um
// número migrado pra Cloud API SAI do WhatsApp comum: não abre mais no celular,
// não parea por QR, e o provedor antigo deixa de alcançá-lo. É troca, não adição — por
// isso a configuração é tudo-ou-nada, e não uma escolha por mensagem.
//
// O vocabulário aqui é o mesmo do Waha de propósito (`enviarBotoes`,
// `ResultadoRico`, `Botao`), pra que o motor de fluxos fale com os dois sem
// saber qual está atrás.

/** Onde a Meta atende. A versão entra na URL e é fixada na configuração. */
const HOST = 'https://graph.facebook.com'

const TIMEOUT_MS = 20_000

export interface CloudConfig {
  token: string
  /** O ID do número no painel da Meta — NÃO é o telefone. */
  phoneId: string
  versao: string
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** O código da Meta. 131047 = fora da janela de 24h, e assim por diante. */
    readonly codigo?: number,
  ) {
    super(message)
  }
}

interface Registro {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
}

/**
 * A Cloud API quer só dígitos: DDI + DDD + número, sem `+`, sem `@c.us`.
 * Mandar o chatId do provedor antigo aqui faz a Meta recusar com "invalid parameter".
 */
export function paraNumeroCloud(telefone: string): string {
  const so = telefone.split('@')[0]!.replace(/\D/g, '')
  return so.length <= 11 ? `55${so}` : so
}

export class CloudApi {
  constructor(
    private readonly cfg: CloudConfig,
    private readonly log?: Registro,
  ) {}

  private async chamar(corpo: Record<string, unknown>): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${HOST}/${this.cfg.versao}/${this.cfg.phoneId}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.token}`,
        },
        body: JSON.stringify(corpo),
      })

      const dados = (await res.json().catch(() => null)) as {
        messages?: { id?: string }[]
        error?: { message?: string; code?: number; error_data?: { details?: string } }
      } | null

      if (!res.ok) {
        const erro = dados?.error
        // `error_data.details` é onde a Meta diz o que de fato estava errado;
        // `message` sozinho costuma ser genérico ("Invalid parameter").
        const texto = erro?.error_data?.details ?? erro?.message ?? `A Meta respondeu ${res.status}.`
        throw new CloudError(texto, res.status, erro?.code)
      }

      // O id vem como `wamid.XXXX` e é o que o CRM guarda em external_id — é
      // por ele que o webhook de status casa com a mensagem já gravada.
      return dados?.messages?.[0]?.id ?? null
    } finally {
      clearTimeout(timer)
    }
  }

  /** A Meta está alcançável e o token vale? Usado no /health. */
  async vivo(): Promise<boolean> {
    try {
      const res = await fetch(`${HOST}/${this.cfg.versao}/${this.cfg.phoneId}?fields=id`, {
        headers: { Authorization: `Bearer ${this.cfg.token}` },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async enviarTexto(telefone: string, texto: string): Promise<string | null> {
    return this.chamar({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraNumeroCloud(telefone),
      type: 'text',
      // Sem isto a Meta não transforma link em prévia clicável.
      text: { preview_url: true, body: texto },
    })
  }

  /**
   * Os botões expostos — o motivo de tudo isto existir.
   *
   * Três é o teto da Meta e ela RECUSA a mensagem inteira no quarto, então o
   * corte não pode ser silencioso aqui: recusamos e quem chama cai pra lista,
   * que cabe todas. Cortar entregaria uma pergunta com metade das respostas.
   */
  async enviarBotoes(
    telefone: string,
    conteudo: { corpo: string; cabecalho?: string; rodape?: string; botoes: Botao[] },
  ): Promise<ResultadoRico> {
    // Só `reply` vira botão de resposta. Link e ligação existem na Cloud API
    // como outro tipo de mensagem (cta_url), que não se mistura com estes na
    // mesma bolha — quem chama trata isso.
    const respostas = conteudo.botoes.filter((b) => b.type === 'reply')
    if (respostas.length === 0 || respostas.length > MAX_BOTOES) return { entregue: false }

    const interactive: Record<string, unknown> = {
      type: 'button',
      body: { text: conteudo.corpo },
      action: {
        buttons: respostas.map((b, i) => ({
          type: 'reply',
          reply: {
            // O id volta no toque, em `interactive.button_reply.id`. É ele que
            // casa a resposta com a opção do fluxo — sem depender do rótulo,
            // que pode repetir e que a Meta corta em 20.
            id: b.id ?? `btn_${i}`,
            title: cortarTitulo(b.text, LIMITE_DO_TITULO),
          },
        })),
      },
    }
    if (conteudo.cabecalho?.trim()) interactive.header = { type: 'text', text: conteudo.cabecalho }
    if (conteudo.rodape?.trim()) interactive.footer = { text: conteudo.rodape }

    const id = await this.chamar({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraNumeroCloud(telefone),
      type: 'interactive',
      interactive,
    })
    return { entregue: true, id }
  }

  /** A lista, pro menu que não cabe em três botões. */
  async enviarLista(
    telefone: string,
    conteudo: { corpo: string; cabecalho?: string; rodape?: string; textoDoBotao: string; linhas: LinhaDaLista[] },
  ): Promise<ResultadoRico> {
    if (conteudo.linhas.length === 0) return { entregue: false }

    const interactive: Record<string, unknown> = {
      type: 'list',
      body: { text: conteudo.corpo },
      action: {
        button: cortarTitulo(conteudo.textoDoBotao, LIMITE_DO_TITULO),
        sections: [
          {
            title: 'Opções',
            rows: conteudo.linhas.map((l) => ({
              id: l.rowId,
              title: cortarTitulo(l.title, LIMITE_DA_LINHA),
              ...(l.description ? { description: l.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    }
    if (conteudo.cabecalho?.trim()) interactive.header = { type: 'text', text: conteudo.cabecalho }
    if (conteudo.rodape?.trim()) interactive.footer = { text: conteudo.rodape }

    const id = await this.chamar({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraNumeroCloud(telefone),
      type: 'interactive',
      interactive,
    })
    return { entregue: true, id }
  }

  /**
   * Arquivo por URL pública. A Meta baixa o arquivo ela mesma, então a URL tem
   * que ser alcançável da internet — o Storage assinado serve; `localhost` não.
   */
  async enviarMidiaPorUrl(
    telefone: string,
    url: string,
    kind: 'imagem' | 'audio' | 'video' | 'documento',
    legenda: string,
    filename?: string,
  ): Promise<string | null> {
    const tipo = kind === 'imagem' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'document'
    const midia: Record<string, unknown> = { link: url }
    // Áudio não aceita legenda; documento usa `filename` pro nome que aparece.
    if (tipo !== 'audio' && legenda.trim()) midia.caption = legenda
    if (tipo === 'document') midia.filename = filename ?? url.split('/').pop() ?? 'arquivo'

    return this.chamar({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraNumeroCloud(telefone),
      type: tipo,
      [tipo]: midia,
    })
  }

  /**
   * Manda arquivo que está na nossa mão — o anexo que o atendente escolheu.
   *
   * São DUAS idas: sobe o arquivo pra Meta, que devolve um id, e só então manda
   * a mensagem citando esse id. Não dá pra mandar bytes na mesma chamada, e
   * mandar por `link` exigiria que o nosso Storage fosse público pra internet
   * inteira — o preço de economizar uma ida seria abrir os arquivos de todos os
   * clientes.
   */
  async enviarMidiaPorBytes(
    telefone: string,
    arquivo: { bytes: Buffer; mimetype: string; filename: string; kind: 'imagem' | 'audio' | 'video' | 'documento' },
    legenda: string,
  ): Promise<string | null> {
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', arquivo.mimetype)
    form.append('file', new Blob([new Uint8Array(arquivo.bytes)], { type: arquivo.mimetype }), arquivo.filename)

    const subida = await fetch(`${HOST}/${this.cfg.versao}/${this.cfg.phoneId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}` },
      body: form,
    })
    const dados = (await subida.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
    if (!subida.ok || !dados?.id) {
      throw new CloudError(dados?.error?.message ?? `A Meta recusou o arquivo (${subida.status}).`, subida.status)
    }

    const tipo =
      arquivo.kind === 'imagem' ? 'image' : arquivo.kind === 'video' ? 'video' : arquivo.kind === 'audio' ? 'audio' : 'document'
    const midia: Record<string, unknown> = { id: dados.id }
    if (tipo !== 'audio' && legenda.trim()) midia.caption = legenda
    if (tipo === 'document') midia.filename = arquivo.filename

    return this.chamar({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: paraNumeroCloud(telefone),
      type: tipo,
      [tipo]: midia,
    })
  }

  /**
   * Baixa o arquivo de uma mídia recebida.
   *
   * São DUAS idas: o webhook traz só um id, `/{id}` devolve uma URL, e a URL
   * exige o mesmo token pra ser baixada — ela não é pública. Quem tentar abrir
   * essa URL no navegador recebe 401, o que faz parecer que o arquivo sumiu.
   */
  async baixarMidia(id: string): Promise<{ bytes: Buffer; mimetype: string } | null> {
    try {
      const meta = (await (
        await fetch(`${HOST}/${this.cfg.versao}/${id}`, {
          headers: { Authorization: `Bearer ${this.cfg.token}` },
        })
      ).json()) as { url?: string; mime_type?: string } | null
      if (!meta?.url) return null

      const arquivo = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.cfg.token}` } })
      if (!arquivo.ok) return null
      const bytes = Buffer.from(await arquivo.arrayBuffer())
      if (bytes.length === 0) return null
      return { bytes, mimetype: meta.mime_type ?? arquivo.headers.get('content-type') ?? 'application/octet-stream' }
    } catch {
      return null
    }
  }

  /**
   * Marca como lida e mostra "digitando…".
   *
   * A Cloud API não tem "digitando" solto: ele viaja junto do recibo de
   * leitura, e some sozinho em 25 segundos ou quando a resposta sai. Falhar
   * aqui não pode impedir o envio — o aviso é enfeite, a mensagem não.
   */
  async digitando(idDaMensagem: string): Promise<void> {
    try {
      await fetch(`${HOST}/${this.cfg.versao}/${this.cfg.phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: idDaMensagem,
          typing_indicator: { type: 'text' },
        }),
      })
    } catch {
      this.log?.warn({ idDaMensagem }, 'não deu pra mostrar "digitando"')
    }
  }
}

// ─── O que chega ────────────────────────────────────────────────────────────

/** Uma mensagem recebida, já no vocabulário do CRM. */
export interface RecebidaCloud {
  externalId: string
  /**
   * O ID do NOSSO número que recebeu — `metadata.phone_number_id`.
   *
   * É o que diz de qual conexão do sistema este evento é. A Meta não sabe o que é
   * uma "conexão" nossa; sem isto, um sistema com dois clientes na Cloud API
   * entregaria a mensagem de um na conversa do outro.
   */
  numeroDaMeta: string | null
  telefone: string
  nome: string | null
  /** O texto — ou o ID DO BOTÃO, quando foi um toque. Ver `textoDoRecebido`. */
  texto: string
  timestamp: number
  midia: { id: string; mimetype: string; kind: 'imagem' | 'audio' | 'video' | 'documento' } | null
}

/**
 * O que o cliente disse — inclusive quando ele TOCOU num botão.
 *
 * O toque não vem como texto: vem em `interactive.button_reply.id`, que é
 * exatamente o id que nós mandamos. Ler o `title` em vez do `id` funcionaria
 * até o dia em que dois botões tivessem o mesmo rótulo, ou em que a Meta
 * cortasse o título em 20 e ele deixasse de bater com o fluxo.
 */
export function textoDoRecebido(m: Record<string, unknown>): string {
  const tipo = m.type as string | undefined

  if (tipo === 'interactive') {
    const i = m.interactive as
      | { type?: string; button_reply?: { id?: string }; list_reply?: { id?: string } }
      | undefined
    const id = i?.button_reply?.id ?? i?.list_reply?.id
    if (id) return id
  }

  // Botão de template antigo chega por outro caminho, com o payload que foi
  // definido na criação do template.
  if (tipo === 'button') {
    const b = m.button as { payload?: string; text?: string } | undefined
    if (b?.payload) return b.payload
    if (b?.text) return b.text
  }

  const texto = m.text as { body?: string } | undefined
  if (texto?.body) return texto.body

  // Legenda de imagem/vídeo/documento é o que a pessoa escreveu junto.
  for (const k of ['image', 'video', 'document', 'audio'] as const) {
    const midia = m[k] as { caption?: string } | undefined
    if (midia?.caption) return midia.caption
  }

  return ''
}

/**
 * Desembrulha o webhook da Meta.
 *
 * O formato é aninhado em quatro níveis — `entry[].changes[].value.messages[]`
 * — e o mesmo pacote pode trazer mensagem, status de entrega e erro juntos.
 * Devolver uma lista simples é o que deixa o resto da ponte não saber disso.
 */
export function mensagensDoWebhook(corpo: unknown): RecebidaCloud[] {
  const raiz = corpo as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] } | null
  const saida: RecebidaCloud[] = []

  for (const entrada of raiz?.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value
      if (!valor) continue

      const contatos = (valor.contacts ?? []) as { wa_id?: string; profile?: { name?: string } }[]
      const mensagens = (valor.messages ?? []) as Record<string, unknown>[]
      const meta = valor.metadata as { phone_number_id?: string } | undefined

      for (const m of mensagens) {
        const de = m.from as string | undefined
        const id = m.id as string | undefined
        if (!de || !id) continue

        const contato = contatos.find((c) => c.wa_id === de)
        saida.push({
          externalId: id,
          numeroDaMeta: meta?.phone_number_id ?? null,
          telefone: de,
          nome: contato?.profile?.name?.trim() || null,
          texto: textoDoRecebido(m),
          // A Meta manda em segundos; o resto do CRM usa milissegundos.
          timestamp: Number(m.timestamp ?? 0) * 1000 || Date.now(),
          midia: midiaDoRecebido(m),
        })
      }
    }
  }
  return saida
}

/**
 * O pacote veio mesmo da Meta?
 *
 * A rota do webhook é pública por obrigação: a Meta não manda token, cabeçalho
 * secreto nem nada que a gente escolha. O que ela manda é uma ASSINATURA do
 * corpo, feita com o segredo do app — e conferir isso é a única coisa que
 * separa "mensagem do cliente" de "qualquer um que descobriu a URL". Sem a
 * conferência, dá pra injetar conversa falsa no CRM de um cliente e disparar o
 * fluxo dele à vontade.
 *
 * Compara sobre os BYTES CRUS. Reserializar o JSON muda espaço e ordem de
 * chave, e a assinatura deixa de bater mesmo com o conteúdo idêntico.
 *
 * A comparação é em tempo constante: `===` em string vaza, pelo tempo que
 * demora, quantos caracteres do começo estavam certos — e isso basta pra
 * descobrir a assinatura tentativa por tentativa.
 */
export function assinaturaConfere(cru: Buffer, cabecalho: string | undefined, segredo: string): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false
  const esperado = createHmac('sha256', segredo).update(cru).digest('hex')
  const recebido = cabecalho.slice('sha256='.length)
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(recebido, 'utf8')
  // timingSafeEqual estoura com tamanhos diferentes, e o tamanho não é segredo.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** O que a Meta fez com uma mensagem NOSSA depois de aceitá-la. */
export interface StatusCloud {
  externalId: string
  /** sent, delivered, read, failed. */
  status: string
  para: string | null
  /** Só em `failed`. O código é o que diz o motivo de verdade. */
  erros: { codigo: number | null; titulo: string; detalhe: string | null }[]
}

/**
 * Os status de entrega do webhook.
 *
 * Vêm no MESMO pacote e no MESMO campo (`messages`) que as mensagens
 * recebidas — a diferença está só em `value.statuses` contra `value.messages`.
 *
 * Sem ler isto, uma mensagem que a Meta ACEITOU (respondeu `wamid`) e depois
 * não entregou é invisível: do nosso lado deu tudo certo, e o cliente nunca
 * recebeu. O motivo real só existe aqui, no código do erro.
 */
export function statusDoWebhook(corpo: unknown): StatusCloud[] {
  const raiz = corpo as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] } | null
  const saida: StatusCloud[] = []

  for (const entrada of raiz?.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const lista = (mudanca.value?.statuses ?? []) as {
        id?: string
        status?: string
        recipient_id?: string
        errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[]
      }[]

      for (const s of lista) {
        if (!s.id) continue
        saida.push({
          externalId: s.id,
          status: s.status ?? 'desconhecido',
          para: s.recipient_id ?? null,
          erros: (s.errors ?? []).map((e) => ({
            codigo: e.code ?? null,
            titulo: e.title ?? e.message ?? 'erro sem título',
            detalhe: e.error_data?.details ?? null,
          })),
        })
      }
    }
  }
  return saida
}

function midiaDoRecebido(m: Record<string, unknown>): RecebidaCloud['midia'] {
  const mapa = {
    image: 'imagem',
    video: 'video',
    audio: 'audio',
    document: 'documento',
  } as const

  for (const [chave, kind] of Object.entries(mapa)) {
    const midia = m[chave] as { id?: string; mime_type?: string } | undefined
    // O arquivo NÃO vem no webhook: vem um id, e o binário se busca depois em
    // /{id} com o token. Guardar só o id aqui é o que mantém o webhook rápido
    // — a Meta desiste do webhook que demora e reenvia tudo de novo.
    if (midia?.id) return { id: midia.id, mimetype: midia.mime_type ?? 'application/octet-stream', kind }
  }
  return null
}

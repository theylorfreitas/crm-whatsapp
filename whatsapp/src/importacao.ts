import type { SupabaseClient } from '@supabase/supabase-js'
import type { FastifyBaseLogger } from 'fastify'
import { ehConversaIndividual } from './zap.js'
import type { Zapper } from './zapper.js'
import { guardarArquivoDaMensagem, guardarFotoDePerfil } from './midia.js'
import { ehFigurinha } from './uazapi.js'

// Trazer as conversas que já estavam no aparelho para dentro do CRM.
//
// Por que isso é preciso: o webhook só entrega o que chega DEPOIS do
// pareamento. Sem importação, um número com dois anos de histórico entra no
// CRM com a tela de Chats vazia, e o atendente perde o contexto inteiro de
// quem já era cliente.
//
// O que NÃO dá pra prometer: o WhatsApp não guarda o histórico no servidor. O
// que existe é o que estiver no aparelho pareado, e a mídia antiga
// frequentemente já foi apagada do servidor — nesses casos a mensagem entra
// com o texto e sem o arquivo, que é melhor do que não entrar.

/** Teto por importação. Sem limite, um número antigo puxaria dezenas de
 *  milhares de mensagens e a primeira importação nunca terminaria. */
export interface LimitesDaImportacao {
  conversas: number
  mensagensPorConversa: number
}

export const LIMITES_PADRAO: LimitesDaImportacao = {
  conversas: 100,
  mensagensPorConversa: 400,
}

/**
 * A sincronização que roda toda vez que alguém abre o CRM.
 *
 * Puxa pouco de cada conversa de propósito: o webhook já traz o que chega ao
 * vivo, e isto existe pra tapar o buraco de quando a ponte esteve fora do ar —
 * o WhatsApp não reentrega o que perdeu. Buscar 200 mensagens de 50 conversas
 * a cada abertura seria varrer o mesmo histórico repetidas vezes por dia.
 */
export const LIMITES_SINCRONIZACAO: LimitesDaImportacao = {
  conversas: 30,
  mensagensPorConversa: 25,
}

export interface ResultadoDaImportacao {
  conversas: number
  mensagens: number
  midias: number
  /** Mensagens que já estavam no banco e ganharam o arquivo que faltava. */
  reparadas: number
  pulados: number
}

/**
 * O horário da mensagem, de segundos pra ISO.
 *
 * Existe porque a conta estava sendo feita errada em dois lugares:
 * `MensagemDoAparelho.timestamp` é em SEGUNDOS, e `new Date(n)` lê
 * MILISSEGUNDOS. Um horário de 2026 virava 21 de janeiro de 1970, e o
 * histórico inteiro entrava datado na origem do tempo — com a conversa
 * ordenada errado na lista e o separador de dia mentindo em toda tela.
 *
 * Não dava erro em lugar nenhum: 1970 é uma data válida.
 */
function paraIso(segundos: number): string {
  return new Date(segundos * 1000).toISOString()
}

/** Antes disto, nenhuma mensagem de WhatsApp existe: é conta de segundo lida como milissegundo. */
const EPOCA_IMPOSSIVEL = Date.parse('2010-01-01T00:00:00Z')

/** O pedaço de uma mensagem já gravada que interessa pra decidir se ela está inteira. */
interface LinhaGravada {
  id: string
  external_id: string
  media_kind: string | null
  body: string | null
  sent_at: string
}

export async function importarHistorico(
  db: SupabaseClient,
  zap: Zapper,
  log: FastifyBaseLogger,
  entrada: { sessao: string; clientId: string; connectionId: string; limites?: LimitesDaImportacao },
): Promise<ResultadoDaImportacao> {
  const limites = entrada.limites ?? LIMITES_PADRAO
  const resultado: ResultadoDaImportacao = { conversas: 0, mensagens: 0, midias: 0, reparadas: 0, pulados: 0 }

  const conversas = await zap.listarConversas(entrada.sessao, limites.conversas)

  for (const conversa of conversas) {
    // Grupo não é atendimento — mesma regra do webhook.
    if (conversa.grupo || !ehConversaIndividual(conversa.chatId)) {
      resultado.pulados++
      continue
    }

    try {
      // O provedor já resolveu o número quando sabe dele. Só vale insistir por
      // conta própria quando não veio: o `chatId` de uma conta com
      // endereçamento novo é um `@lid`, e tirar dígitos dali grava um id
      // interno no lugar do telefone.
      const telefone = conversa.telefone ?? (await zap.resolverTelefone(entrada.sessao, conversa.chatId))
      const mensagens = await zap.listarMensagens(
        entrada.sessao,
        conversa.chatId,
        limites.mensagensPorConversa,
      )
      if (mensagens.length === 0) continue

      const chatId = await acharOuAbrirConversa(db, {
        clientId: entrada.clientId,
        connectionId: entrada.connectionId,
        telefone,
        nome: conversa.nome ?? telefone,
      })
      if (!chatId) continue
      resultado.conversas++

      await guardarAvatarDaConversa(db, zap, entrada.sessao, entrada.clientId, conversa.chatId, chatId)

      // O que JÁ está gravado, numa consulta só. Sem isto, cada sincronização
      // rebaixaria toda foto e todo áudio do trecho pra depois o índice único
      // recusar o insert — trabalho e banda jogados fora, e o Storage enchendo
      // de cópias órfãs do mesmo arquivo.
      //
      // Guarda o ESTADO e não só o id: uma mensagem que já está no banco pode
      // estar lá incompleta. Foi o que aconteceu quando a mídia era buscada
      // pela URL cifrada do WhatsApp — o texto entrou, o arquivo não, e nada
      // reparava depois porque o id já constava como visto.
      const jaGravadas = new Map(
        (
          await db
            .from('crm_messages')
            .select('id, external_id, media_kind, body, sent_at')
            .eq('chat_id', chatId)
            .in(
              'external_id',
              mensagens.map((m) => m.externalId).filter((id): id is string => !!id),
            )
        ).data?.map((r) => [r.external_id as string, r as LinhaGravada]) ?? [],
      )

      let novasNestaConversa = 0
      let consertadasNestaConversa = 0
      for (const m of mensagens) {
        // Sem id do WhatsApp não há como evitar duplicar numa reimportação, e
        // uma conversa duplicada é pior do que uma mensagem a menos.
        if (!m.externalId) {
          resultado.pulados++
          continue
        }

        const gravada = jaGravadas.get(m.externalId)
        if (gravada) {
          // Uma linha já gravada pode estar torta de duas maneiras, e as duas
          // aconteceram: sem o arquivo (a mídia era buscada na URL cifrada) e
          // com a data em 1970 (segundo lido como milissegundo). Nenhuma se
          // repara sozinha, porque o id já constava como visto.
          const semArquivo = !gravada.media_kind && !!(m.mediaUrl || m.mediaId)
          const dataImpossivel = m.timestamp > 0 && Date.parse(gravada.sent_at) < EPOCA_IMPOSSIVEL
          if (!semArquivo && !dataImpossivel) continue

          const conserto: Record<string, unknown> = {}

          if (semArquivo) {
            const guardada = await guardarArquivoDaMensagem(db, zap, entrada.clientId, entrada.sessao, {
              mediaUrl: m.mediaUrl,
              mediaId: m.mediaId,
              mediaMimetype: m.mediaMimetype,
              figurinha: ehFigurinha(m.tipoCru),
            })
            if (guardada) {
              conserto.media_path = guardada.path
              conserto.media_kind = guardada.kind
              // A legenda também não entrava: ela vem em `content.caption`, e
              // a leitura antiga só olhava `text`.
              if (!gravada.body?.trim()) conserto.body = m.texto
              resultado.midias++
            }
          }
          if (dataImpossivel) conserto.sent_at = paraIso(m.timestamp)

          if (Object.keys(conserto).length === 0) continue
          const { error } = await db.from('crm_messages').update(conserto).eq('id', gravada.id)
          if (error) {
            log.warn({ err: error, chatId }, 'não deu pra consertar uma mensagem já gravada')
            continue
          }
          resultado.reparadas++
          consertadasNestaConversa++
          continue
        }

        let mediaPath: string | null = null
        let mediaKind: string | null = null
        if (m.mediaUrl || m.mediaId) {
          const guardada = await guardarArquivoDaMensagem(db, zap, entrada.clientId, entrada.sessao, {
            mediaUrl: m.mediaUrl,
            mediaId: m.mediaId,
            mediaMimetype: m.mediaMimetype,
            figurinha: ehFigurinha(m.tipoCru),
          })
          if (guardada) {
            mediaPath = guardada.path
            mediaKind = guardada.kind
            resultado.midias++
          }
        }

        const { error } = await db.from('crm_messages').insert({
          client_id: entrada.clientId,
          chat_id: chatId,
          direction: m.fromMe ? 'saida' : 'entrada',
          body: m.texto,
          media_path: mediaPath,
          media_kind: mediaKind,
          external_id: m.externalId,
          status: 'entregue',
          sent_at: paraIso(m.timestamp),
          imported_at: new Date().toISOString(),
        })

        // 23505 = já existe: a importação rodou de novo. É o caso normal, não
        // é erro — o índice único em (client_id, external_id) é justamente o
        // que deixa reimportar sem duplicar.
        if (error && error.code === '23505') continue
        if (error) {
          log.warn({ err: error, chatId }, 'mensagem do histórico recusada')
          continue
        }
        resultado.mensagens++
        novasNestaConversa++
      }

      // Só mexe no resumo quando entrou ou foi consertado algo. Numa
      // sincronização em que nada era novo, reescrever a prévia com a última
      // mensagem que o provedor listou podia sobrescrever a que o webhook
      // acabou de gravar por uma mais antiga — a conversa "voltava no tempo"
      // na lista. O conserto conta porque `last_message_at` herdou a mesma
      // data de 1970 das mensagens, e é por ela que a lista se ordena.
      if (novasNestaConversa > 0 || consertadasNestaConversa > 0) await atualizarResumo(db, chatId, mensagens)
    } catch (e) {
      // Uma conversa problemática não pode derrubar a importação inteira.
      log.warn({ err: e, chat: conversa.chatId }, 'conversa do histórico pulada')
      resultado.pulados++
    }
  }

  // Varre o que ficou sem foto. Uma conversa pode ter nascido pelo caminho ao
  // vivo antes desta importação, ou ter falhado a busca no meio — e sem uma
  // segunda passada a lista fica com metade dos contatos como iniciais.
  await sincronizarAvatares(db, zap, log, entrada.sessao, entrada.clientId)

  log.info({ ...resultado, sessao: entrada.sessao }, 'importação do histórico concluída')
  return resultado
}

/**
 * Busca a foto das conversas que ainda não têm.
 *
 * Só olha quem nunca foi verificado (`avatar_checked_at` nulo): quem já foi e
 * não tinha foto escondeu por privacidade, e insistir seria bater no WhatsApp
 * de graça a cada importação.
 */
export async function sincronizarAvatares(
  db: SupabaseClient,
  zap: Zapper,
  log: FastifyBaseLogger,
  sessao: string,
  clientId: string,
): Promise<number> {
  const { data: pendentes } = await db
    .from('crm_chats')
    .select('id, phone')
    .eq('client_id', clientId)
    .is('avatar_checked_at', null)
    .not('phone', 'is', null)
    .limit(200)

  let achadas = 0
  for (const chat of pendentes ?? []) {
    // A conversa guarda o telefone, não o chatId do WhatsApp. Reconstruir com
    // `@c.us` funciona mesmo em conta com endereçamento novo: o WhatsApp
    // resolve o número pro contato certo.
    const antes = await db.from('crm_chats').select('avatar_path').eq('id', chat.id).maybeSingle()
    await guardarAvatarDaConversa(db, zap, sessao, clientId, `${chat.phone}@c.us`, chat.id)
    const depois = await db.from('crm_chats').select('avatar_path').eq('id', chat.id).maybeSingle()
    if (!antes.data?.avatar_path && depois.data?.avatar_path) achadas++
  }

  if ((pendentes ?? []).length > 0) {
    log.info({ verificadas: pendentes?.length, achadas, clientId }, 'fotos de perfil sincronizadas')
  }
  return achadas
}

/**
 * Busca a foto de perfil real e guarda no Storage.
 *
 * Só tenta quando a conversa ainda não tem foto: pedir de novo a cada
 * importação custaria uma ida ao WhatsApp por contato, e a foto quase nunca
 * muda. `avatar_checked_at` registra a tentativa mesmo quando não veio nada,
 * pra não ficar perguntando eternamente por quem escondeu a foto.
 */
export async function guardarAvatarDaConversa(
  db: SupabaseClient,
  zap: Zapper,
  sessao: string,
  clientId: string,
  chatIdNoWhatsapp: string,
  chatId: string,
): Promise<void> {
  try {
    const { data: atual } = await db.from('crm_chats').select('avatar_path').eq('id', chatId).maybeSingle()
    if (atual?.avatar_path) return

    const url = await zap.fotoDePerfil(sessao, chatIdNoWhatsapp)
    const path = url ? await guardarFotoDePerfil(db, clientId, url) : null

    await db
      .from('crm_chats')
      .update({ avatar_checked_at: new Date().toISOString(), ...(path ? { avatar_path: path } : {}) })
      .eq('id', chatId)
  } catch {
    // Avatar é enfeite: a conversa vale sem ele.
  }
}

async function acharOuAbrirConversa(
  db: SupabaseClient,
  dados: { clientId: string; connectionId: string; telefone: string; nome: string },
): Promise<string | null> {
  // `maybeSingle()` daria erro se houvesse mais de uma linha, e o erro
  // descartado viraria "não existe" — abrindo outra conversa e piorando a
  // duplicação a cada rodada. `limit(1)` responde "existe?" sem se importar
  // com quantas.
  const { data: existentes } = await db
    .from('crm_chats')
    .select('id')
    .eq('client_id', dados.clientId)
    .eq('phone', dados.telefone)
    .order('created_at', { ascending: true })
    .limit(1)
  if (existentes?.[0]) return existentes[0].id

  const { data: criada, error } = await db
    .from('crm_chats')
    .insert({
      client_id: dados.clientId,
      connection_id: dados.connectionId,
      contact_name: dados.nome,
      phone: dados.telefone,
      // 'resolvido' de propósito: histórico importado não é fila de
      // atendimento. Entrar como 'aguardando' encheria a aba de pendências com
      // conversas de meses atrás que ninguém precisa responder.
      status: 'resolvido',
      unread_count: 0,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = uma mensagem ao vivo abriu a mesma conversa enquanto a
    // importação rodava. É o caso comum de conectar e receber junto; usa a que
    // já existe em vez de perder o histórico dessa conversa.
    if (error.code !== '23505') return null
    const { data: concorrente } = await db
      .from('crm_chats')
      .select('id')
      .eq('client_id', dados.clientId)
      .eq('phone', dados.telefone)
      .order('created_at', { ascending: true })
      .limit(1)
    return concorrente?.[0]?.id ?? null
  }
  return criada.id
}

/** Deixa a lista de conversas mostrando a última mensagem, não uma linha vazia. */
async function atualizarResumo(
  db: SupabaseClient,
  chatId: string,
  mensagens: { texto: string; timestamp: number; tipoCru?: string | null }[],
): Promise<void> {
  const ultima = mensagens.reduce((a, b) => (b.timestamp > a.timestamp ? b : a))
  await db
    .from('crm_chats')
    .update({
      last_message_at: paraIso(ultima.timestamp),
      last_message_preview: ultima.texto.slice(0, 120) || previaDeMidia(ultima.tipoCru),
    })
    .eq('id', chatId)
}

/**
 * O que a lista de conversas mostra quando a última mensagem é só arquivo.
 *
 * "📎 Mídia" para tudo era o que havia, e não diz nada: quem bate o olho na
 * lista quer saber se o cliente mandou um áudio pra ouvir ou uma foto pra
 * olhar. É a mesma pista que o WhatsApp dá.
 */
function previaDeMidia(tipoCru: string | null | undefined): string {
  const t = (tipoCru ?? '').toLowerCase()
  if (t.startsWith('sticker')) return '💟 Figurinha'
  if (t.startsWith('image') || t.startsWith('album')) return '📷 Foto'
  if (t.startsWith('video')) return '🎬 Vídeo'
  if (t.startsWith('audio') || t.startsWith('ptt')) return '🎤 Áudio'
  if (t.startsWith('document')) return '📄 Documento'
  return '📎 Mídia'
}

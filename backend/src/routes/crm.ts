import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthHooks } from '../plugins/auth.js'

// Rotas do CRM que precisam do servidor: falar com a ponte de WhatsApp,
// com a Graph API da Meta, e receber webhooks de fora.
//
// Regra que vale pra todas: credencial só existe aqui dentro (variável de
// ambiente + integration_secrets). Quando falta, a rota responde
// `configured: false` com o motivo — o front mostra "conecte X" em vez de
// fingir que funcionou.

const BRIDGE_TIMEOUT_MS = 10_000

// A versão da Graph API vai na URL. Fixar evita que a Meta lançar a próxima
// mude o formato debaixo de nós sem ninguém pedir.
const META_VERSAO = 'v21.0'

function bridgeUrl(): string | null {
  const url = process.env.WHATSAPP_BRIDGE_URL?.trim()
  return url && url.length > 0 ? url.replace(/\/$/, '') : null
}

// A sessão é procurada por `instance_id` e, quando ele é nulo, pelo `id` da
// conexão (ver o `instance_id ?? connection.id` espalhado abaixo). Só que `id`
// é uuid: comparar a coluna com um nome de sessão comum faz o Postgres abortar
// a consulta inteira com 22P02, e aí nem o casamento por `instance_id` sobra.
// Por isso o ramo do `id` só entra quando o valor é mesmo um uuid.
function filtroDeSessao(sessao: string): string {
  const porInstancia = `instance_id.eq.${sessao}`
  return z.string().uuid().safeParse(sessao).success ? `${porInstancia},id.eq.${sessao}` : porInstancia
}

// Foto, áudio e figurinha chegam do WhatsApp com o texto vazio. A lista de
// conversas precisa de ALGUMA linha, senão a conversa aparece em branco e
// parece defeito.
function rotuloDeMidia(kind: string | undefined): string {
  switch (kind) {
    case 'imagem':
      return '📷 Imagem'
    case 'audio':
      return '🎤 Áudio'
    case 'video':
      return '🎬 Vídeo'
    case 'documento':
      return '📎 Documento'
    default:
      return ''
  }
}

// Anexo é outra ordem de grandeza: a ponte baixa do Storage, converte pra
// base64 e sobe pro provedor. Um vídeo de 15 MB não cabe nos 10 segundos que
// bastam para uma mensagem de texto.
const BRIDGE_TIMEOUT_MIDIA_MS = 120_000

// Abrir sessão é o mais lento de todos: a instância é criada na conta e pareada antes
// de gerar o QR, e com outro número já conectado demora ainda mais. Desistir em
// 10s devolvia "quadrado vazio" justamente pra quem estava ligando o 2º chip.
const BRIDGE_TIMEOUT_SESSAO_MS = 45_000

async function bridgeFetch(path: string, init?: RequestInit, timeoutMs = BRIDGE_TIMEOUT_MS): Promise<Response> {
  const base = bridgeUrl()
  if (!base) throw new Error('bridge-not-configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.WHATSAPP_BRIDGE_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_BRIDGE_TOKEN}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

export function crmRoutes(app: FastifyInstance, auth: AuthHooks) {
  // Dono age em nome de qualquer cliente; cliente só no próprio workspace.
  async function resolveClientId(req: FastifyRequest, explicit?: string): Promise<string | null> {
    if (req.user?.role === 'owner') return explicit ?? req.user.clientId ?? null
    return req.user?.clientId ?? null
  }

  // O dono opera dentro de qualquer workspace; o usuário de cliente só no
  // próprio. Quem manda é o client_id do REGISTRO, não o do requisitante —
  // senão o dono (que não tem client_id) não conseguiria agir em lugar nenhum.
  function canAct(req: FastifyRequest, clientId: string): boolean {
    return req.user?.role === 'owner' || req.user?.clientId === clientId
  }

  async function connectionFor(req: FastifyRequest, connectionId: string) {
    const { data } = await app.supabaseService
      .from('crm_connections')
      .select('id, client_id, name, kind, status, instance_id, phone, uazapi_instance')
      .eq('id', connectionId)
      .single()
    if (!data || !canAct(req, data.client_id)) return null
    return data
  }

  // ─── Conexão oficial (Cloud API da Meta) ────────────────────────────────
  //
  // Os dois canais convivem, e a escolha é POR CONEXÃO. Botão de resposta
  // rápida só é entregue pela conta oficial — pelo QR Code ele some sem erro
  // nenhum. Em troca, o número da conta oficial SAI do WhatsApp comum: não abre
  // no celular e não pareia por QR. Cliente que não pode pagar esse preço fica
  // no QR, que funciona hoje.

  /**
   * O estado real de uma conexão oficial, perguntado à Meta.
   *
   * Não dá pra confiar no que está gravado: o token pode ter sido revogado, a
   * empresa pode ter caído em restrição, o cartão pode ter falhado. Tudo isso
   * acontece sem avisar ninguém, e o sintoma é o bot ficar mudo — a API aceita
   * a mensagem, devolve um id, e o cliente nunca recebe.
   *
   * `health_status` é a única fonte que enumera o que trava, e por entidade.
   */
  async function estadoDaOficial(connectionId: string) {
    const { data: conexao } = await app.supabaseService
      .from('crm_connections')
      .select('cloud_phone_id')
      .eq('id', connectionId)
      .maybeSingle()

    const { data: segredo } = await app.supabaseService
      .from('crm_connection_secrets')
      .select('cloud_token')
      .eq('connection_id', connectionId)
      .maybeSingle()

    if (!conexao?.cloud_phone_id || !segredo?.cloud_token) {
      return {
        status: 'desconectada' as const,
        qrCode: null,
        configured: false,
        detail: 'Falta o ID do número e o token do painel da Meta.',
      }
    }

    const saude = await saudeNaMeta(conexao.cloud_phone_id, segredo.cloud_token)
    await app.supabaseService
      .from('crm_connections')
      .update({
        status: saude.ok ? 'conectada' : 'erro',
        status_detail: saude.detail,
        ...(saude.telefone ? { phone: saude.telefone } : {}),
        ...(saude.nome ? { device_name: saude.nome } : {}),
        ...(saude.ok ? { connected_at: new Date().toISOString() } : {}),
      })
      .eq('id', connectionId)

    return {
      status: saude.ok ? ('conectada' as const) : ('erro' as const),
      qrCode: null,
      configured: true,
      detail: saude.detail,
      deviceName: saude.nome,
    }
  }

  /**
   * Pergunta à Meta se este número pode falar, e o que trava quando não pode.
   *
   * A resposta vem por ENTIDADE — número, conta, empresa, app — e é normal só
   * uma delas estar bloqueada. Juntar tudo numa frase só é o que faz a tela
   * dizer o problema em vez de "erro".
   */
  async function saudeNaMeta(phoneId: string, token: string) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${META_VERSAO}/${phoneId}?fields=display_phone_number,verified_name,health_status`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS) },
      )
      const body = (await res.json().catch(() => null)) as {
        display_phone_number?: string
        verified_name?: string
        health_status?: {
          can_send_message?: string
          entities?: { entity_type?: string; can_send_message?: string; errors?: { error_description?: string }[] }[]
        }
        error?: { message?: string }
      } | null

      if (!res.ok) {
        return { ok: false, detail: body?.error?.message ?? `A Meta respondeu ${res.status}.`, telefone: null, nome: null }
      }

      const telefone = body?.display_phone_number?.replace(/\D/g, '') ?? null
      const nome = body?.verified_name ?? null
      const saude = body?.health_status

      if (saude?.can_send_message === 'AVAILABLE') return { ok: true, detail: null, telefone, nome }

      // Só as entidades que de fato travam, e só o motivo — o resto é ruído.
      const travas = (saude?.entities ?? [])
        .filter((e) => e.can_send_message === 'BLOCKED')
        .flatMap((e) => (e.errors ?? []).map((x) => x.error_description).filter(Boolean))
      return {
        ok: false,
        detail: travas.length > 0 ? travas.join(' · ') : 'A Meta não liberou este número para enviar mensagens.',
        telefone,
        nome,
      }
    } catch {
      return { ok: false, detail: 'Não deu pra falar com a Meta.', telefone: null, nome: null }
    }
  }

  const CloudBody = z.object({
    // O ID do NÚMERO no painel — não é o telefone.
    phoneId: z.string().trim().min(5),
    // Token permanente do usuário do sistema.
    token: z.string().trim().min(20),
    wabaId: z.string().trim().optional(),
  })

  /**
   * Liga uma conexão à Cloud API.
   *
   * VALIDA ANTES DE GRAVAR. Guardar uma credencial que não funciona deixa a
   * conexão marcada como oficial e muda o canal de envio dela — o cliente
   * perderia o WhatsApp e o erro só apareceria na primeira mensagem que não
   * chegasse. Aqui o erro aparece no botão "Conectar".
   */
  app.post('/crm/connections/:id/cloud', { preHandler: auth.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = CloudBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Preencha o ID do número e o token.' })

    const connection = await connectionFor(req, id)
    if (!connection) return reply.code(404).send({ error: 'Conexão não encontrada.' })

    const saude = await saudeNaMeta(parsed.data.phoneId, parsed.data.token)
    // Credencial inválida é recusa; número bloqueado NÃO é — a Meta pode estar
    // travando por verificação pendente, e quem configurou precisa conseguir
    // salvar pra destravar depois sem redigitar tudo. A tela mostra o motivo.
    if (!saude.telefone && !saude.ok) {
      return reply.code(422).send({ error: saude.detail ?? 'A Meta recusou estas credenciais.' })
    }

    const { error: erroSegredo } = await app.supabaseService
      .from('crm_connection_secrets')
      .upsert({ connection_id: id, cloud_token: parsed.data.token }, { onConflict: 'connection_id' })
    if (erroSegredo) return reply.code(500).send({ error: 'Não deu pra guardar o token.' })

    await app.supabaseService
      .from('crm_connections')
      .update({
        kind: 'oficial',
        cloud_phone_id: parsed.data.phoneId,
        cloud_waba_id: parsed.data.wabaId ?? null,
        status: saude.ok ? 'conectada' : 'erro',
        status_detail: saude.detail,
        ...(saude.telefone ? { phone: saude.telefone } : {}),
        ...(saude.nome ? { device_name: saude.nome } : {}),
        ...(saude.ok ? { connected_at: new Date().toISOString() } : {}),
      })
      .eq('id', id)

    return { status: saude.ok ? 'conectada' : 'erro', detail: saude.detail, phone: saude.telefone, name: saude.nome }
  })

  /** Desliga a conexão oficial: apaga o token e devolve a conexão ao QR Code. */
  app.post('/crm/connections/:id/cloud/remover', { preHandler: auth.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const connection = await connectionFor(req, id)
    if (!connection) return reply.code(404).send({ error: 'Conexão não encontrada.' })

    await app.supabaseService.from('crm_connection_secrets').delete().eq('connection_id', id)
    await app.supabaseService
      .from('crm_connections')
      .update({
        kind: 'uazapi',
        cloud_phone_id: null,
        cloud_waba_id: null,
        status: 'desconectada',
        status_detail: null,
        disconnected_at: new Date().toISOString(),
      })
      .eq('id', id)
    return { ok: true }
  })

  // ─── Conexões de WhatsApp ───────────────────────────────────────────────

  const SessionBody = z.object({ connectionId: z.string().uuid(), clientId: z.string().uuid().optional() })

  app.post('/crm/connections/session', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = SessionBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const connection = await connectionFor(req, parsed.data.connectionId)
    if (!connection) return reply.code(404).send({ error: 'Conexão não encontrada.' })
    const clientId = connection.client_id

    // Conexão oficial não tem QR pra ler: ela se liga pelas credenciais do
    // painel da Meta. O que responde por ela é a Meta, não a ponte.
    if (connection.kind === 'oficial') return estadoDaOficial(connection.id)

    if (!bridgeUrl()) {
      await app.supabaseService
        .from('crm_connections')
        .update({ status: 'desconectada', status_detail: 'Falta WHATSAPP_BRIDGE_URL no servidor.' })
        .eq('id', connection.id)
      return {
        status: 'desconectada',
        qrCode: null,
        configured: false,
        detail: 'O serviço de QR ainda não está configurado no servidor (WHATSAPP_BRIDGE_URL).',
      }
    }

    try {
      const res = await bridgeFetch(
        '/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ instanceId: connection.instance_id ?? connection.id, name: connection.name }),
        },
        BRIDGE_TIMEOUT_SESSAO_MS,
      )
      const body = (await res.json().catch(() => ({}))) as {
        qr?: string
        status?: string
        detail?: string
        phone?: string | null
        deviceName?: string | null
      }
      if (!res.ok) {
        await app.supabaseService
          .from('crm_connections')
          .update({ status: 'erro', status_detail: body.detail ?? `A ponte respondeu ${res.status}.` })
          .eq('id', connection.id)
        return { status: 'erro', qrCode: null, configured: true, detail: body.detail ?? `A ponte respondeu ${res.status}.` }
      }
      const status = body.status === 'connected' ? 'conectada' : 'conectando'
      await app.supabaseService
        .from('crm_connections')
        .update({
          status,
          status_detail: null,
          instance_id: connection.instance_id ?? connection.id,
          ...(body.phone ? { phone: body.phone } : {}),
          ...(body.deviceName ? { device_name: body.deviceName } : {}),
        })
        .eq('id', connection.id)
      return {
        status,
        qrCode: body.qr ?? null,
        configured: true,
        detail: null,
        deviceName: body.deviceName ?? null,
      }
    } catch (e) {
      const detail = (e as Error).message === 'bridge-not-configured'
        ? 'O serviço de QR ainda não está configurado no servidor (WHATSAPP_BRIDGE_URL).'
        : 'Não deu pra falar com o serviço de QR.'
      await app.supabaseService.from('crm_connections').update({ status: 'erro', status_detail: detail }).eq('id', connection.id)
      return { status: 'erro', qrCode: null, configured: !!bridgeUrl(), detail }
    }
  })

  /**
   * EXCLUIR UMA CONEXÃO, DEVOLVENDO A VAGA DO PLANO.
   *
   * Esta rota não existia. A tela apagava a linha direto do navegador, por
   * Supabase, e ninguém avisava o serviço de WhatsApp — a instância seguia
   * viva na conta paga, na fatura e ocupando o teto de números do plano.
   *
   * O estrago só aparece na segunda ou terceira vez: o teto enche, criar um
   * número novo passa a ser recusado, e o CRM mostra "não está configurada no
   * servidor" com o banco de conexões VAZIO. Ninguém liga uma coisa à outra,
   * porque de dentro do produto não há nada ocupando lugar nenhum.
   *
   * A ORDEM IMPORTA: a instância sai primeiro, a linha depois. É da linha que
   * saem o servidor e o token da instância, então apagá-la antes deixaria a
   * vaga presa para sempre, sem nem como descobrir qual instância era.
   *
   * E SE A PONTE NÃO RESPONDER, NADA É APAGADO. É deliberado, e é o contrário
   * do que costuma se fazer: seguir em frente aqui é justamente o que produz a
   * instância órfã. Melhor a conexão continuar na tela, com o motivo escrito,
   * do que sumir da tela e continuar cobrando.
   */
  app.delete('/crm/connections/:id', { preHandler: auth.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const connection = await connectionFor(req, id)
    if (!connection) return reply.code(404).send({ error: 'Conexão não encontrada.' })

    // Conexão oficial não tem instância na uazapi: o que ela tem é um token da
    // Meta, e ele sai com a linha (o cofre cascateia).
    //
    // Sem instância anotada também não há vaga a devolver, e aí a ponte não
    // precisa estar de pé pra excluir. Sem esta segunda condição, uma conexão
    // que nunca chegou a parear (ou que já teve a instância apagada no painel
    // da uazapi) ficava impossível de remover enquanto o serviço de WhatsApp
    // estivesse fora do ar — e é justamente quando ele está fora do ar que dá
    // vontade de apagar a conexão e começar de novo.
    const podeTerVaga = connection.kind !== 'oficial' && Boolean(connection.uazapi_instance)
    if (podeTerVaga) {
      if (!bridgeUrl()) {
        return reply.code(503).send({
          error:
            'O serviço de WhatsApp não está configurado neste servidor, então não dá pra liberar a vaga deste número. ' +
            'A conexão não foi excluída.',
        })
      }
      try {
        const res = await bridgeFetch(`/instancias/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as { detail?: string }
          return reply.code(502).send({
            error: corpo.detail ?? 'Não deu pra liberar este número no servidor de WhatsApp. A conexão não foi excluída.',
          })
        }
      } catch {
        return reply.code(502).send({
          error: 'O serviço de WhatsApp não respondeu. A conexão não foi excluída pra não deixar o número preso no seu plano.',
        })
      }
    }

    const { error } = await app.supabaseService.from('crm_connections').delete().eq('id', id)
    if (error) return reply.code(500).send({ error: `O número foi liberado, mas a conexão não saiu da lista: ${error.message}` })

    req.log.warn({ conexao: id, cliente: connection.client_id }, 'conexão de WhatsApp excluída')
    return { ok: true }
  })

  app.get('/crm/connections/:id/status', { preHandler: auth.requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const connection = await connectionFor(req, id)
    if (!connection) return reply.code(404).send({ error: 'Conexão não encontrada.' })

    // Quem responde pela conexão oficial é a Meta. A ponte pode estar fora do
    // ar sem que isso a afete — ela não passa por lá pra enviar.
    if (connection.kind === 'oficial') return estadoDaOficial(connection.id)

    if (!bridgeUrl()) {
      return {
        status: connection.status,
        qrCode: null,
        configured: false,
        detail: 'O serviço de QR ainda não está configurado no servidor (WHATSAPP_BRIDGE_URL).',
      }
    }
    try {
      const res = await bridgeFetch(`/sessions/${connection.instance_id ?? connection.id}`)
      const body = (await res.json().catch(() => ({}))) as {
        status?: string
        phone?: string
        deviceName?: string | null
        qr?: string
      }
      const status = body.status === 'connected' ? 'conectada' : body.status === 'connecting' ? 'conectando' : 'desconectada'
      await app.supabaseService
        .from('crm_connections')
        .update({
          status,
          ...(body.phone ? { phone: body.phone } : {}),
          ...(body.deviceName ? { device_name: body.deviceName } : {}),
          ...(status === 'conectada' ? { connected_at: new Date().toISOString(), status_detail: null } : {}),
        })
        .eq('id', connection.id)
      return { status, qrCode: body.qr ?? null, configured: true, detail: null, deviceName: body.deviceName ?? null }
    } catch {
      return { status: 'erro', qrCode: null, configured: true, detail: 'Não deu pra falar com o serviço de QR.' }
    }
  })

  /**
   * Põe as conversas em dia. Chamada sozinha quando o CRM abre — não há botão.
   *
   * Na primeira vez varre o aparelho inteiro; depois só o trecho recente de
   * cada conversa, pra tapar o que a ponte perdeu enquanto esteve fora do ar.
   * Responde na hora: a leitura roda em segundo plano na ponte.
   *
   * Sem `requireAuth` de conexão específica: sincroniza TODAS as conectadas do
   * workspace, porque quem abre o CRM quer a caixa de entrada inteira em dia,
   * não a de um chip escolhido a dedo.
   */
  const SyncBody = z.object({ clientId: z.string().uuid().optional() })

  app.post('/crm/connections/sync', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = SyncBody.safeParse(req.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const clientId = await resolveClientId(req, parsed.data.clientId)
    if (!clientId) return reply.code(400).send({ error: 'Workspace não identificado.' })
    if (!bridgeUrl()) return { ok: false, detail: 'Serviço de WhatsApp não configurado.', sincronizadas: 0 }

    const { data: connections } = await app.supabaseService
      .from('crm_connections')
      .select('id, instance_id')
      .eq('client_id', clientId)
      .eq('kind', 'uazapi')
      .eq('status', 'conectada')

    let sincronizadas = 0
    for (const c of connections ?? []) {
      try {
        const res = await bridgeFetch('/sincronizar', {
          method: 'POST',
          body: JSON.stringify({ instanceId: c.instance_id ?? c.id }),
        })
        if (res.ok) sincronizadas++
      } catch {
        // Uma conexão fora do ar não pode impedir a sincronização das outras.
      }
    }
    return { ok: true, sincronizadas }
  })

  app.post('/crm/connections/logout', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = SessionBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const connection = await connectionFor(req, parsed.data.connectionId)
    if (!connection) return reply.code(404).send({ error: 'Conexão não encontrada.' })

    if (bridgeUrl()) {
      await bridgeFetch(`/sessions/${connection.instance_id ?? connection.id}`, { method: 'DELETE' }).catch(() => null)
    }
    await app.supabaseService
      .from('crm_connections')
      .update({ status: 'desconectada', disconnected_at: new Date().toISOString() })
      .eq('id', connection.id)
    return { ok: true }
  })

  // ─── Atendimento concluído ──────────────────────────────────────────────

  /**
   * A tela acabou de marcar a conversa como resolvida; roda o fluxo disso.
   *
   * Por que passa por aqui e não pela ponte direto: a ponte só aceita chamada
   * com o token de serviço, que não pode chegar ao navegador. Aqui o `requireAuth`
   * confere que quem pede é dono da conversa, e o token fica no servidor.
   *
   * Responde `ok` mesmo quando nada dispara. Não ter fluxo configurado é o caso
   * normal, e a tela não deveria mostrar erro por isso.
   */
  const FinalizadoBody = z.object({ chatId: z.string().uuid() })

  app.post('/crm/chats/atendimento-finalizado', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = FinalizadoBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })

    const { data: chat } = await app.supabaseService
      .from('crm_chats')
      .select('id, client_id, connection_id')
      .eq('id', parsed.data.chatId)
      .single()
    if (!chat || !canAct(req, chat.client_id)) return reply.code(404).send({ error: 'Conversa não encontrada.' })
    if (!chat.connection_id || !bridgeUrl()) return { ok: true, disparou: false }

    try {
      const res = await bridgeFetch('/gatilho-de-conversa', {
        method: 'POST',
        body: JSON.stringify({
          clientId: chat.client_id,
          chatId: chat.id,
          connectionId: chat.connection_id,
          qual: 'atendimento_finalizado',
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { disparou?: boolean }
      return { ok: true, disparou: !!body.disparou }
    } catch {
      return { ok: true, disparou: false }
    }
  })

  // ─── Envio de mensagem ──────────────────────────────────────────────────

  const SendBody = z.object({ messageId: z.string().uuid(), chatId: z.string().uuid() })

  app.post('/crm/messages/send', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = SendBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const { data: chat } = await app.supabaseService
      .from('crm_chats')
      .select('id, client_id, phone, connection_id')
      .eq('id', parsed.data.chatId)
      .single()
    if (!chat || !canAct(req, chat.client_id)) return reply.code(404).send({ error: 'Conversa não encontrada.' })

    const { data: message } = await app.supabaseService
      .from('crm_messages')
      .select('id, body, client_id, media_path, media_kind, buttons')
      .eq('id', parsed.data.messageId)
      .single()
    if (!message || message.client_id !== chat.client_id) return reply.code(404).send({ error: 'Mensagem não encontrada.' })

    async function fail(detail: string) {
      await app.supabaseService.from('crm_messages').update({ status: 'falhou' }).eq('id', parsed.data!.messageId)
      return { delivered: false, detail }
    }

    if (!bridgeUrl()) {
      return fail('A mensagem foi salva na conversa, mas não saiu: falta configurar a conexão de WhatsApp no servidor.')
    }
    if (!chat.connection_id) {
      return fail('A mensagem foi salva, mas esta conversa não tem conexão de WhatsApp escolhida.')
    }

    const { data: connection } = await app.supabaseService
      .from('crm_connections')
      .select('id, instance_id, status')
      .eq('id', chat.connection_id)
      .single()
    if (!connection || connection.status !== 'conectada') {
      return fail('A mensagem foi salva, mas a conexão de WhatsApp está desconectada.')
    }

    try {
      const res = await bridgeFetch('/messages', {
        method: 'POST',
        body: JSON.stringify({
          instanceId: connection.instance_id ?? connection.id,
          to: chat.phone,
          text: message.body,
          // Quando a mensagem tem anexo, o texto vira legenda do arquivo.
          ...(message.media_path ? { mediaPath: message.media_path, mediaKind: message.media_kind } : {}),
          // Botões escolhidos pelo atendente. A ponte cai pro texto sozinha se
          // o motor não souber mandá-los.
          ...(message.buttons ? { buttons: message.buttons } : {}),
        }),
      },
      message.media_path ? BRIDGE_TIMEOUT_MIDIA_MS : BRIDGE_TIMEOUT_MS,
    )
      if (!res.ok) {
        // O motivo da ponte diz muito mais que o número do status ("arquivo
        // grande demais", "sessão fora do ar") — é o que a tela vai mostrar.
        const erro = (await res.json().catch(() => ({}))) as { detail?: string }
        return fail(erro.detail ?? `A conexão recusou o envio (${res.status}).`)
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string }
      await app.supabaseService
        .from('crm_messages')
        .update({ status: 'enviada', external_id: body.id ?? null })
        .eq('id', parsed.data.messageId)
      return { delivered: true, detail: null }
    } catch {
      return fail('Não deu pra falar com a conexão de WhatsApp.')
    }
  })

  // ─── Disparo em massa ───────────────────────────────────────────────────

  const StartBody = z.object({ broadcastId: z.string().uuid() })

  app.post('/crm/broadcasts/start', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = StartBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const { data: broadcast } = await app.supabaseService
      .from('crm_broadcasts')
      .select('id, client_id, connection_id, status, total_count')
      .eq('id', parsed.data.broadcastId)
      .single()
    if (!broadcast || !canAct(req, broadcast.client_id)) return reply.code(404).send({ error: 'Disparo não encontrado.' })
    if (broadcast.total_count === 0) return { started: false, detail: 'Este disparo não tem nenhum destinatário.' }

    if (!broadcast.connection_id) {
      return { started: false, detail: 'Escolha a conexão de WhatsApp que vai enviar antes de começar.' }
    }
    const { data: connection } = await app.supabaseService
      .from('crm_connections')
      .select('status')
      .eq('id', broadcast.connection_id)
      .single()

    if (!bridgeUrl()) {
      await app.supabaseService.from('crm_broadcasts').update({ status: 'agendado' }).eq('id', broadcast.id)
      return {
        started: false,
        detail: 'Disparo pronto e na fila. Ele começa assim que a conexão de WhatsApp estiver configurada no servidor.',
      }
    }
    if (connection?.status !== 'conectada') {
      return { started: false, detail: 'A conexão escolhida está desconectada — conecte o WhatsApp e tente de novo.' }
    }

    await app.supabaseService
      .from('crm_broadcasts')
      .update({ status: 'enviando', started_at: new Date().toISOString() })
      .eq('id', broadcast.id)
    // A entrega em si é do worker da ponte, que respeita o ritmo configurado
    // e vai atualizando crm_broadcast_targets.
    await bridgeFetch('/broadcasts', {
      method: 'POST',
      body: JSON.stringify({ broadcastId: broadcast.id }),
    }).catch(() => null)
    return { started: true, detail: null }
  })

  // ─── Meta / Facebook Ads ────────────────────────────────────────────────

  function metaConfigured(): boolean {
    return !!process.env.META_APP_ID?.trim() && !!process.env.META_APP_SECRET?.trim()
  }

  async function metaToken(clientId: string): Promise<string | null> {
    const { data } = await app.supabaseService
      .from('integration_secrets')
      .select('secret')
      .eq('client_id', clientId)
      .eq('provider', 'meta')
      .maybeSingle()
    return data?.secret ?? null
  }

  // Até 5 anos: o teto de 90 dias travava quem anunciou há mais tempo — a
  // conta tinha gasto, a tela mostrava zero, e parecia defeito.
  const MetaBody = z.object({ clientId: z.string().uuid().optional(), days: z.number().int().min(1).max(1825).optional() })

  app.post('/crm/meta/sync-assets', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = MetaBody.safeParse(req.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const clientId = await resolveClientId(req, parsed.data.clientId)
    if (!clientId) return reply.code(403).send({ error: 'Sem workspace associado.' })

    if (!metaConfigured()) {
      return { configured: false, synced: 0, detail: 'Falta META_APP_ID/META_APP_SECRET no servidor.' }
    }
    const token = await metaToken(clientId)
    if (!token) {
      return { configured: false, synced: 0, detail: 'Faça login na Meta para autorizar o acesso às contas.' }
    }

    try {
      const [accounts, pages] = await Promise.all([
        fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name&access_token=${encodeURIComponent(token)}`),
        fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name&access_token=${encodeURIComponent(token)}`),
      ])
      const accountsBody = (await accounts.json().catch(() => ({}))) as { data?: { id: string; name: string }[]; error?: { message: string } }
      const pagesBody = (await pages.json().catch(() => ({}))) as { data?: { id: string; name: string }[] }
      if (accountsBody.error) {
        return { configured: true, synced: 0, detail: `A Meta recusou: ${accountsBody.error.message}` }
      }

      const rows = [
        ...(accountsBody.data ?? []).map((a) => ({
          client_id: clientId,
          kind: 'conta_anuncio' as const,
          external_id: a.id,
          name: a.name,
          synced_at: new Date().toISOString(),
        })),
        ...(pagesBody.data ?? []).map((p) => ({
          client_id: clientId,
          kind: 'pagina' as const,
          external_id: p.id,
          name: p.name,
          synced_at: new Date().toISOString(),
        })),
      ]
      if (rows.length > 0) {
        // upsert sem tocar em `selected`: quem escolhe o que entra no painel
        // é o usuário, e sincronizar não pode desfazer essa escolha.
        await app.supabaseService.from('crm_meta_assets').upsert(rows, { onConflict: 'client_id,kind,external_id' })
      }
      return { configured: true, synced: rows.length, detail: null }
    } catch {
      return { configured: true, synced: 0, detail: 'Não deu pra falar com a API da Meta.' }
    }
  })

  app.post('/crm/meta/sync-insights', { preHandler: auth.requireAuth }, async (req, reply) => {
    const parsed = MetaBody.safeParse(req.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const clientId = await resolveClientId(req, parsed.data.clientId)
    if (!clientId) return reply.code(403).send({ error: 'Sem workspace associado.' })
    const days = parsed.data.days ?? 30

    if (!metaConfigured()) {
      return { configured: false, synced: 0, detail: 'Falta META_APP_ID/META_APP_SECRET no servidor.' }
    }
    const token = await metaToken(clientId)
    if (!token) return { configured: false, synced: 0, detail: 'Faça login na Meta para autorizar o acesso às contas.' }

    const { data: assets } = await app.supabaseService
      .from('crm_meta_assets')
      .select('external_id, name')
      .eq('client_id', clientId)
      .eq('kind', 'conta_anuncio')
      .eq('selected', true)
    if (!assets || assets.length === 0) {
      return { configured: true, synced: 0, detail: 'Escolha em "Perfis e contas" quais contas entram no painel.' }
    }

    // A Meta recusa (#3018) qualquer início além de 37 meses. Pedir mais que
    // isso não devolvia dado nenhum — então limitamos e avisamos, em vez de
    // deixar a conta parecer vazia.
    const LIMITE_META_DIAS = 1120
    const diasUsados = Math.min(days, LIMITE_META_DIAS)
    const encurtado = diasUsados < days

    const since = new Date(Date.now() - diasUsados * 86400_000).toISOString().slice(0, 10)
    const until = new Date().toISOString().slice(0, 10)
    let synced = 0
    const recusas: string[] = []
    for (const asset of assets) {
      try {
        const url =
          `https://graph.facebook.com/v21.0/${asset.external_id}/insights` +
          `?level=campaign&time_increment=1&fields=campaign_id,campaign_name,spend,impressions,clicks,objective` +
          `&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${encodeURIComponent(token)}`
        const res = await fetch(url)
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string }
          data?: {
            campaign_id: string
            campaign_name: string
            spend?: string
            impressions?: string
            clicks?: string
            objective?: string
            date_start: string
          }[]
        }
        // Erro da Meta não pode virar "nenhuma veiculação": eram coisas
        // diferentes aparecendo com a mesma cara, e a busca pelo defeito ia
        // parar no lugar errado.
        if (body.error?.message) recusas.push(`${asset.name}: ${body.error.message}`)
        const rows = (body.data ?? []).map((d) => ({
          client_id: clientId,
          account_external_id: asset.external_id,
          campaign_id: d.campaign_id,
          name: d.campaign_name,
          objective: d.objective ?? null,
          spend: Number(d.spend ?? 0),
          impressions: Number(d.impressions ?? 0),
          clicks: Number(d.clicks ?? 0),
          day: d.date_start,
          synced_at: new Date().toISOString(),
        }))
        if (rows.length > 0) {
          await app.supabaseService.from('crm_meta_campaigns').upsert(rows, { onConflict: 'client_id,campaign_id,day' })
          synced += rows.length
        }
      } catch {
        // uma conta que falhou não derruba as outras
      }
    }
    // Ordem dos avisos: erro real primeiro, depois o corte de período, e só
    // então "não teve veiculação" — que é o único que NÃO é problema.
    let detail: string | null = null
    if (recusas.length > 0) detail = `A Meta recusou: ${recusas.join(' · ')}`
    else if (synced === 0)
      detail =
        `Nenhuma veiculação nos últimos ${diasUsados} dias nas contas incluídas no painel.` +
        (encurtado ? ' A Meta não deixa consultar além de ~37 meses, então o período foi encurtado.' : '')
    else if (encurtado) detail = 'Período encurtado para ~37 meses — é o máximo que a Meta permite consultar.'

    return { configured: true, synced, detail }
  })

  // ─── Webhook de entrada (público, autenticado pelo token da URL) ────────

  app.post('/public/crm/webhook/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const payload = (req.body ?? {}) as Record<string, unknown>

    const { data: hook } = await app.supabaseService
      .from('crm_webhooks')
      .select('id, client_id, target, mapping, kanban_column_id, connection_id, active, received_count')
      .eq('token', token)
      .maybeSingle()
    if (!hook) return reply.code(404).send({ error: 'Webhook não encontrado.' })
    if (!hook.active) return reply.code(409).send({ error: 'Webhook desativado.' })

    // O mapeamento diz qual campo do POST vira qual campo do CRM.
    const mapping = (hook.mapping ?? {}) as Record<string, string>
    const pick = (field: string): string | null => {
      const source = mapping[field]
      if (!source) return null
      const value = source.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], payload)
      return value === undefined || value === null ? null : String(value)
    }

    const name = pick('name') ?? 'Sem nome'
    const email = pick('email')
    const phone = pick('phone')

    /**
     * A CONVERSA DESTE LEAD, quando o webhook tem conexão e o lead tem número.
     *
     * Sem isto a escolha de conexão na tela seria decorativa. É a conversa que
     * liga o lead que entrou pelo formulário ao WhatsApp: é nela que a etiqueta
     * gruda, é o `kanban_card_id` dela que impede o cartão duplicado, e é ela
     * que um fluxo precisa pra ter com quem falar.
     */
    async function conversaDoLead(): Promise<string | null> {
      const digitos = (phone ?? '').replace(/\D/g, '')
      if (!hook || !hook.connection_id || digitos.length < 8) return null

      const { data: existentes } = await app.supabaseService
        .from('crm_chats')
        .select('id')
        .eq('client_id', hook.client_id)
        .eq('phone', digitos)
        .limit(1)
      if (existentes?.[0]) return existentes[0].id

      const { data: criada, error } = await app.supabaseService
        .from('crm_chats')
        .insert({
          client_id: hook.client_id,
          connection_id: hook.connection_id,
          contact_name: name,
          phone: digitos,
          // 'atendendo' e não 'aguardando': quem chegou por formulário não
          // mandou mensagem nenhuma. Pôr na fila de espera faria o atendente
          // procurar uma pergunta que não existe.
          status: 'atendendo',
          last_message_at: new Date().toISOString(),
          last_message_preview: `Entrou por webhook: ${name}`,
        })
        .select('id')
        .single()
      if (error) {
        req.log.warn({ err: error }, 'webhook não conseguiu abrir a conversa do lead')
        return null
      }
      return criada.id
    }

    try {
      if (hook.target === 'contato') {
        await app.supabaseService
          .from('crm_contacts')
          .insert({ client_id: hook.client_id, name, email, phone, organization: pick('organization') })
      } else if (hook.target === 'kanban' && hook.kanban_column_id) {
        const { data: column } = await app.supabaseService
          .from('crm_kanban_columns')
          .select('kanban_id')
          .eq('id', hook.kanban_column_id)
          .single()
        if (column) {
          const { data: cartao } = await app.supabaseService
            .from('crm_kanban_cards')
            .insert({
              client_id: hook.client_id,
              kanban_id: column.kanban_id,
              column_id: hook.kanban_column_id,
              title: name,
              description: [email, phone].filter(Boolean).join(' · ') || null,
            })
            .select('id')
            .single()

          // Amarra o cartão à conversa. É o que faz clicar no cartão abrir o
          // WhatsApp daquela pessoa, e o que impede a próxima passagem pelo
          // bloco Kanban de criar um segundo cartão do mesmo lead.
          const chatId = await conversaDoLead()
          if (chatId && cartao) {
            await app.supabaseService.from('crm_chats').update({ kanban_card_id: cartao.id }).eq('id', chatId)
          }
        }
      } else {
        await conversaDoLead()
        await app.supabaseService.from('crm_leads').insert({
          client_id: hook.client_id,
          name,
          email,
          phone,
          organization: pick('organization'),
          origin: pick('origin') ?? 'Webhook',
          // 'novo' é o valor que a constraint de crm_leads aceita
          status: 'novo',
        })
      }

      await app.supabaseService
        .from('crm_webhooks')
        .update({
          received_count: (hook.received_count ?? 0) + 1,
          last_received_at: new Date().toISOString(),
          last_payload: payload,
        })
        .eq('id', hook.id)

      await app.supabaseService.from('crm_notifications').insert({
        client_id: hook.client_id,
        message: `Webhook recebeu um novo registro: ${name}`,
      })

      return { ok: true }
    } catch (e) {
      req.log.error({ err: e }, 'falha ao processar webhook de entrada')
      return reply.code(500).send({ error: 'Não deu pra gravar o registro.' })
    }
  })

  // ─── Mensagem chegando pela ponte ──────────────────────────────────────
  // A ponte na VPS chama esta rota quando um contato manda mensagem. O
  // segredo compartilhado (WHATSAPP_BRIDGE_TOKEN) é obrigatório: sem ele
  // configurado a rota fica fechada, e não meio aberta.

  const InboundBody = z.object({
    instanceId: z.string(),
    from: z.string(),
    name: z.string().optional(),
    text: z.string().default(''),
    externalId: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    // O caminho no bucket whatsapp-media. A ponte copia o arquivo pra lá
    // porque a URL do provedor não é alcançável pelo navegador e some em poucos
    // dias — ver 0025_whatsapp_midia_e_historico.sql.
    mediaPath: z.string().optional(),
    mediaKind: z.enum(['imagem', 'audio', 'video', 'documento']).optional(),
    // 'saida' = escrita pelo celular, fora do CRM. Entra na conversa igual,
    // mas não conta como não lida nem devolve o atendimento pra fila.
    direction: z.enum(['entrada', 'saida']).default('entrada'),
    // Os botões que vieram na mensagem, pro CRM mostrar o mesmo que o celular.
    buttons: z
      .array(
        z.object({
          type: z.string(),
          text: z.string(),
          url: z.string().optional(),
          copyCode: z.string().optional(),
          phoneNumber: z.string().optional(),
        }),
      )
      .optional(),
  })

  app.post('/public/crm/whatsapp/inbound', async (req, reply) => {
    const expected = process.env.WHATSAPP_BRIDGE_TOKEN?.trim()
    if (!expected) return reply.code(503).send({ error: 'Recepção de mensagens não configurada no servidor.' })
    const header = req.headers.authorization
    if (header !== `Bearer ${expected}`) return reply.code(401).send({ error: 'Token inválido.' })

    const parsed = InboundBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Payload inválido.' })
    const { instanceId, from, name, text, externalId, mediaUrl, mediaPath, mediaKind, direction, buttons } = parsed.data
    const recebida = direction === 'entrada'

    const { data: connection, error: erroConexao } = await app.supabaseService
      .from('crm_connections')
      .select('id, client_id')
      .or(filtroDeSessao(instanceId))
      .maybeSingle()
    // Sem olhar o erro, uma falha de banco vira "Instância desconhecida." e a
    // mensagem some em silêncio, e é assim que o 22P02 acima se disfarça de
    // sessão não cadastrada.
    if (erroConexao) {
      req.log.error({ err: erroConexao, instanceId }, 'busca da conexão falhou no inbound')
      return reply.code(500).send({ error: 'Não deu pra identificar a instância.' })
    }
    if (!connection) return reply.code(404).send({ error: 'Instância desconhecida.' })

    const now = new Date().toISOString()
    // Foto e áudio chegam com `body` vazio. Sem isto a lista de conversas
    // mostraria uma linha em branco, que parece conversa quebrada.
    const preview = text.trim().length > 0 ? text.slice(0, 120) : rotuloDeMidia(mediaKind)

    // `maybeSingle()` NÃO serve aqui. Ele devolve erro quando encontra mais de
    // uma linha, e o erro descartado virava "não achei" — cada mensagem abria
    // outra conversa, para sempre. `limit(1)` responde a pergunta que
    // realmente importa ("existe?") sem se importar com quantas.
    const { data: encontradas } = await app.supabaseService
      .from('crm_chats')
      .select('id, status')
      .eq('client_id', connection.client_id)
      .eq('phone', from)
      .order('created_at', { ascending: true })
      .limit(1)
    const existing = encontradas?.[0] ?? null
    const statusDaConversa = existing?.status ?? null

    let chatId = existing?.id
    const conversaNova = !chatId
    // A conversa recém-criada já nasce com a prévia e o contador certos; só as
    // que já existiam precisam ser atualizadas depois de gravar a mensagem.
    let precisaAtualizarResumo = false
    if (!chatId) {
      const { data: created, error } = await app.supabaseService
        .from('crm_chats')
        .insert({
          client_id: connection.client_id,
          connection_id: connection.id,
          contact_name: name || from,
          phone: from,
          // Conversa que nasce de uma mensagem NOSSA não é fila de espera:
          // quem começou fomos nós, e ninguém está aguardando resposta.
          status: recebida ? 'aguardando' : 'atendendo',
          unread_count: recebida ? 1 : 0,
          last_message_at: now,
          last_message_preview: preview,
        })
        .select('id')
        .single()

      if (error) {
        // 23505 = o índice único pegou uma corrida: duas mensagens do mesmo
        // contato chegaram juntas e as duas acharam a conversa inexistente.
        // Quem perdeu a corrida usa a conversa que o outro acabou de abrir.
        if (error.code !== '23505') {
          req.log.error({ err: error, from }, 'não deu pra abrir a conversa')
          return reply.code(500).send({ error: 'Não deu pra abrir a conversa.' })
        }
        const { data: concorrente } = await app.supabaseService
          .from('crm_chats')
          .select('id')
          .eq('client_id', connection.client_id)
          .eq('phone', from)
          .order('created_at', { ascending: true })
          .limit(1)
        if (!concorrente?.[0]) return reply.code(500).send({ error: 'Não deu pra abrir a conversa.' })
        chatId = concorrente[0].id
        precisaAtualizarResumo = true
      } else {
        chatId = created.id
      }
    } else {
      precisaAtualizarResumo = true
    }

    // A mensagem é gravada ANTES de mexer no resumo da conversa, e é essa
    // ordem que faz o eco funcionar. Todo envio nosso volta pelo webhook com o
    // mesmo id do WhatsApp; o índice único recusa a cópia com 23505, e aí a
    // conversa NÃO leva prévia nem contador de novo. Na ordem inversa, cada
    // mensagem que sai daqui contaria duas vezes.
    const { error: erroMensagem } = await app.supabaseService.from('crm_messages').insert({
      client_id: connection.client_id,
      chat_id: chatId,
      direction,
      body: text,
      media_url: mediaUrl ?? null,
      media_path: mediaPath ?? null,
      buttons: buttons ?? null,
      media_kind: mediaKind ?? null,
      external_id: externalId ?? null,
      status: 'entregue',
      sent_at: now,
    })

    if (erroMensagem) {
      // 23505 = já está gravada. É o caso normal do eco do próprio envio, não
      // é falha: responder ok evita o provedor reenviar para sempre.
      if (erroMensagem.code === '23505') return { ok: true, chatId, conversaNova: false, duplicada: true }
      req.log.error({ err: erroMensagem, from }, 'não deu pra gravar a mensagem')
      return reply.code(500).send({ error: 'Não deu pra gravar a mensagem.' })
    }

    // O CLIENTE VOLTOU DEPOIS DE A CONVERSA TER SIDO FECHADA.
    //
    // Isto ficava parado: o contador subia, a prévia mudava, e a conversa
    // continuava marcada como 'resolvido' — ou seja, fora da fila de quem
    // atende. A mensagem chegava e ninguém via.
    const reaberta = recebida && statusDaConversa === 'resolvido'

    if (precisaAtualizarResumo) {
      if (recebida) {
        // Somar no banco, não aqui. Ler `unread_count` e escrever `+1` perde
        // contagem quando duas mensagens chegam juntas: as duas leem 5 e as
        // duas escrevem 6.
        await app.supabaseService.rpc('crm_registrar_recebida', {
          p_chat_id: chatId,
          p_preview: preview,
          p_em: now,
        })
        if (reaberta) {
          // Os mesmos três campos que o botão "reabrir" da tela limpa: deixar
          // `resolved_by_name` para trás faria o cabeçalho da conversa dizer
          // "Resolvido por Fulano" numa conversa que voltou pra fila.
          await app.supabaseService
            .from('crm_chats')
            .update({ status: 'aguardando', resolved_by_name: null, resolved_at: null })
            .eq('id', chatId)
        }
      } else {
        // Responder já é ter lido. Quando a resposta sai do celular, zerar as
        // não lidas aqui evita o atendente voltar pro CRM e encontrar um
        // badge vermelho numa conversa que ele mesmo acabou de resolver.
        //
        // 'aguardando' também deixa de valer: alguém assumiu.
        await app.supabaseService
          .from('crm_chats')
          .update({
            last_message_at: now,
            last_message_preview: preview,
            unread_count: 0,
            ...(statusDaConversa === 'aguardando' ? { status: 'atendendo' } : {}),
          })
          .eq('id', chatId)
      }
    }

    // `conversaNova` é o que diz pra ponte ir buscar a foto de perfil. Buscar
    // a cada mensagem seria uma ida ao WhatsApp por linha de conversa.
    // `reaberta` é o que aciona o fluxo de conversa finalizada: quem sabe que a
    // conversa estava fechada é esta rota, que leu o status antes de mexer nele.
    return { ok: true, chatId, conversaNova, reaberta }
  })
}

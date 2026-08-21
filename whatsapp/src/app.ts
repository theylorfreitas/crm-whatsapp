import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { WhatsappEnv } from './config/env.js'
import { ehConversaIndividual, MAX_BOTOES } from './zap.js'
import { Uazapi, UazapiError, lerRecebida, ehMensagemNova, ehFigurinha } from './uazapi.js'
import { ContasUazapi, ErroDaUazapi, enderecoDoWebhook } from './uazapi.contas.js'
import { Zapper } from './zapper.js'
import { Disparos } from './broadcast.js'
import { MotorDeFluxos } from './fluxos.js'
import { guardarArquivoDaMensagem, guardarBytes, lerDoStorage, tipoDeMidia } from './midia.js'
import { assinaturaConfere, CloudError, mensagensDoWebhook, statusDoWebhook } from './cloud.js'
import { Canais } from './canais.js'
import { VigiaDeSessoes } from './vigia.js'
import { enderecoPublicoAtual } from './config/enderecoPublico.js'
import {
  importarHistorico,
  guardarAvatarDaConversa,
  sincronizarAvatares,
  LIMITES_PADRAO,
  LIMITES_SINCRONIZACAO,
} from './importacao.js'

// A ponte de WhatsApp: traduz o que o backend do CRM pede pro que o provedor antigo
// entende, nos dois sentidos.
//
//   backend  →  /sessions, /messages, /broadcasts   →  ponte  →  API do provedor antigo
//   provedor antigo     →  /zap/webhook                       →  ponte  →  /public/crm/whatsapp/inbound
//
// Por que existir em vez de o backend falar com o provedor antigo direto: o backend não
// pode ficar parado 4 horas cadenciando um disparo, e o formato do webhook do
// provedor antigo muda entre motores (WEBJS/NOWEB). Isolar aqui deixa uma peça só pra
// mexer quando o provedor antigo mudar.

// A conexão é achada pelo `instance_id` ou, quando ele é nulo, pelo `id` — que
// é uuid. Comparar `id` com um nome de sessão comum derruba a consulta inteira
// com 22P02, então o ramo do `id` só entra quando o valor é mesmo um uuid.
function filtroDeSessao(sessao: string): string {
  const porInstancia = `instance_id.eq.${sessao}`
  return z.string().uuid().safeParse(sessao).success ? `${porInstancia},id.eq.${sessao}` : porInstancia
}

/**
 * O texto que substitui os botões quando o motor não sabe mandá-los.
 *
 * Cada botão vira uma linha com o que ele faria: o link à mostra, o telefone
 * legível, o código copiável sozinho numa linha. É pior que o botão, mas o
 * cliente ainda consegue agir — que é o ponto.
 */
function textoDeReserva(corpo: string, botoes: { type: string; text: string; url?: string; phoneNumber?: string; copyCode?: string }[]): string {
  const partes = corpo.trim() ? [corpo.trim()] : []
  const respostas = botoes.filter((b) => b.type === 'reply')
  if (respostas.length > 0) {
    partes.push(respostas.map((b, i) => `*${i + 1}* - ${b.text}`).join('\n'))
  }
  for (const b of botoes) {
    if (b.type === 'url' && b.url) partes.push(`${b.text}: ${b.url}`)
    if (b.type === 'call' && b.phoneNumber) partes.push(`${b.text}: ${b.phoneNumber}`)
    if (b.type === 'copy' && b.copyCode) partes.push(`${b.text}:\n${b.copyCode}`)
  }
  return partes.join('\n\n')
}

export function buildWhatsappBridge(env: WhatsappEnv): FastifyInstance {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : true,
  })

  // O corpo CRU, guardado junto do já interpretado.
  //
  // A assinatura da Meta é feita sobre os bytes que ela mandou. Reserializar o
  // objeto pra conferir mudaria espaço e ordem de chave, e a assinatura
  // deixaria de bater com o conteúdo idêntico — o que pareceria ataque e
  // derrubaria todo webhook legítimo.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, corpo, done) => {
    const bytes = corpo as Buffer
    ;(req as FastifyRequest & { cru?: Buffer }).cru = bytes
    if (bytes.length === 0) return done(null, undefined)
    try {
      done(null, JSON.parse(bytes.toString('utf8')))
    } catch (e) {
      done(e as Error, undefined)
    }
  })

  // O cliente da conexão não oficial. Substituiu o provedor antigo porque o provedor antigo não
  // entrega botão — medido dos dois lados, com número pareado por QR e o mesmo
  // aparelho de destino: pelo provedor antigo só o texto chegava; pela uazapi chegaram
  // texto, botões e botão de copiar, tocáveis.
  //
  // Ele é SEM ESTADO: quem sabe o servidor e o token de cada conexão é o
  // `Canais`. Por isso toda chamada recebe a conta — o sistema tem clientes em
  // servidores diferentes da uazapi ao mesmo tempo.
  const uaz = new Uazapi()

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // Cria, pareia e apaga instância na conta paga. O admin token vive só aqui.
  const contas = new ContasUazapi(db, env.UAZAPI_SERVER, env.UAZAPI_ADMIN_TOKEN, app.log)

  // Quem decide o canal de cada conexão. Já foi variável de ambiente e estava
  // errado: ligar a Cloud API pelo `.env` trocava o canal do sistema INTEIRO — o
  // primeiro cliente ganharia botão e todos os outros perderiam o WhatsApp no
  // mesmo instante.
  const canais = new Canais(db, env, app.log)

  // Fala com o WhatsApp sabendo só o nome da conexão: pergunta ao `Canais` de
  // quem é a sessão e chama o provedor. É o que deixou o motor de fluxos, o
  // disparo e a importação continuarem falando "sessão" sem nunca ver um token.
  const zap = new Zapper(canais, app.log)

  // Levanta sozinho a sessão de QR que cair. Sem ele, uma queda às 3h da manhã
  // só era percebida quando alguém abrisse a tela de Conexões — e até lá a tela
  // dizia "conectada" num número fora do ar.
  const vigia = new VigiaDeSessoes(
    db,
    zap,
    app.log,
    (conexaoId) => apontarAVolta(conexaoId),
    // O endereço que o webhook DEVERIA ter hoje. Sem URL pública, `null`: aí o
    // vigia não tem como julgar o que está lá, e aceita qualquer webhook em vez
    // de ficar reapontando às cegas.
    (conexaoId) =>
      (() => {
        const publico = enderecoPublicoAtual(env.WHATSAPP_BRIDGE_PUBLIC_URL)
        return publico ? enderecoDoWebhook(publico, conexaoId, env.WHATSAPP_BRIDGE_TOKEN) : null
      })(),
    // E se esse endereço RESPONDE. Sem isto o vigia comparava dois textos e se
    // dava por satisfeito: com o túnel morto, o webhook gravado batia com o do
    // ambiente, os dois apontavam pro nada, e a conexão ficava verde e surda.
    (url) => enderecoResponde(url),
  )
  app.addHook('onReady', async () => vigia.iniciar())
  app.addHook('onClose', async () => vigia.parar())

  const disparos = new Disparos(db, zap, app.log)
  const fluxos = new MotorDeFluxos(
    db,
    zap,
    app.log,
    canais,
    env.WHATSAPP_MENU_INTERATIVO,
    env.WHATSAPP_MENU_ENQUETE,
    env.WHATSAPP_FLUXO_ESPERA_MIN,
  )

  // O motor precisa de um batimento próprio: uma execução pode ficar parada
  // dois dias esperando o cliente, e quem venceu o prazo não tem ninguém pra
  // acordá-lo. A fila também é consumida aqui — a tela só GRAVA o pedido de
  // disparo, e o disparo em si nunca pode depender de a tela estar aberta.
  const BATIMENTO_MS = 15_000
  const batimento = setInterval(() => {
    void fluxos.processarFila().catch((e) => app.log.error({ err: e }, 'fila de fluxos falhou'))
    void fluxos.processarExpirados().catch((e) => app.log.error({ err: e }, 'expiração de fluxos falhou'))
    // Quem parou por RELÓGIO, e não por esperar alguém: o Intervalo
    // Inteligente. Sem isto, um "aguarde 2 horas" dormiria pra sempre.
    void fluxos.processarDormentes().catch((e) => app.log.error({ err: e }, 'despertar de fluxos falhou'))
  }, BATIMENTO_MS)
  app.addHook('onClose', async () => clearInterval(batimento))

  // ─── Autenticação ────────────────────────────────────────────────────────
  // Quem alcança esta porta manda mensagem pelo número dos clientes. O
  // segredo é obrigatório, não opcional.

  function exigirToken(req: FastifyRequest, reply: FastifyReply, done: () => void) {
    if (req.headers.authorization !== `Bearer ${env.WHATSAPP_BRIDGE_TOKEN}`) {
      reply.code(401).send({ detail: 'Token inválido.' })
      return
    }
    done()
  }

  /** O tipo de mídia do CRM no vocabulário da uazapi. */
  function paraTipoUazapi(kind: string): 'image' | 'video' | 'audio' | 'document' {
    if (kind === 'imagem') return 'image'
    if (kind === 'video') return 'video'
    if (kind === 'audio') return 'audio'
    return 'document'
  }

  function erroDoEnvio(e: unknown): { code: number; detail: string } {
    if (e instanceof UazapiError) {
      // 401/403 aqui é quase sempre instância apagada ou token trocado — e o
      // atendente precisa saber que a saída é reconectar, não tentar de novo.
      if (e.status === 401 || e.status === 403) {
        return { code: 409, detail: 'Esta conexão perdeu o acesso ao WhatsApp. Reconecte pelo QR Code.' }
      }
      return { code: 502, detail: e.message }
    }
    if (e instanceof CloudError) {
      // 131047 e 131026 são os dois que o atendente vai encontrar de verdade:
      // a janela de 24h fechou, ou o número não tem WhatsApp. Traduzir aqui
      // evita que ele leia um código da Meta e não saiba o que fazer.
      if (e.codigo === 131047) {
        return {
          code: 422,
          detail: 'Passaram 24h desde a última mensagem do cliente. Só um modelo aprovado pode reabrir a conversa.',
        }
      }
      if (e.codigo === 131026) return { code: 422, detail: 'Este número não tem WhatsApp.' }
      return { code: 502, detail: e.message }
    }
    const msg = (e as Error).message ?? ''
    if (/abort/i.test(msg)) return { code: 504, detail: 'O serviço de WhatsApp demorou demais pra responder.' }
    return { code: 502, detail: 'Não deu pra falar com o serviço de WhatsApp.' }
  }

  // ─── Saúde ───────────────────────────────────────────────────────────────

  // O canal é POR CONEXÃO, então não há um "serviço do sistema" pra reportar: cada
  // conexão fala com o servidor da uazapi dela, ou direto com a Meta. O que dá
  // pra afirmar aqui é que a ponte está de pé e sabe criar instância.
  app.get('/health', async () => ({ ok: true, uazapi: contas.configurado }))

  // ─── Sessões ─────────────────────────────────────────────────────────────

  const SessionBody = z.object({ instanceId: z.string().min(1), name: z.string().optional() })

  app.post('/sessions', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = SessionBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    const sessao = parsed.data.instanceId

    try {
      // A conexão precisa existir: é dela que sai o id que vai no webhook, e é
      // nela que o servidor e o token da instância ficam guardados.
      const { data: conexao } = await db
        .from('crm_connections')
        .select('id, name')
        .or(filtroDeSessao(sessao))
        .maybeSingle()
      if (!conexao) return reply.code(404).send({ status: 'disconnected', qr: null, detail: 'Conexão desconhecida.' })

      // Cria a instância na conta paga se ainda não existir; reusa se existir.
      // Sem o reuso, cada clique em "Conectar" abriria uma instância nova e a
      // anterior ficaria pendurada na assinatura, cobrando.
      // A RECUSA DA UAZAPI CHEGA INTEIRA ATÉ AQUI, e vale a linha extra. Antes
      // qualquer falha ao criar a instância virava `null` e saía como "não está
      // configurada no servidor" — uma frase que manda conferir variável de
      // ambiente. Quando a conta bateu no limite do plano, foi isso que a tela
      // disse, e as variáveis estavam todas certas. `ErroDaUazapi` traz o motivo
      // de verdade, com os números, e o `null` volta a significar só o que ele
      // sempre devia ter significado: falta configuração mesmo.
      let conta: Awaited<ReturnType<typeof contas.garantir>>
      try {
        conta = await contas.garantir(conexao.id, parsed.data.name ?? conexao.name)
      } catch (e) {
        if (e instanceof ErroDaUazapi) {
          req.log.warn({ sessao, err: e }, 'a uazapi recusou preparar o número')
          return reply.code(e.codigo).send({ status: 'disconnected', qr: null, detail: e.message })
        }
        throw e
      }
      if (!conta) {
        return reply.code(503).send({
          status: 'disconnected',
          qr: null,
          detail: 'A conexão com o WhatsApp não está configurada no servidor. Avise o suporte.',
        })
      }
      canais.esquecer(sessao)

      // O webhook é apontado ANTES do pareamento. Depois seria tarde: as
      // primeiras mensagens chegariam enquanto a instância ainda não sabe pra
      // onde mandar, e o WhatsApp não reentrega o que já entregou.
      //
      // E ele PARA A CONEXÃO se não der. Já falhou em silêncio uma vez: a
      // ponte tinha subido antes de a URL pública existir no ambiente, o aviso
      // foi só pro log, o número pareou e ficou entregando pra lugar nenhum.
      // Uma conexão assim manda mensagem e nunca recebe — e o sintoma aparece
      // dias depois, como "o fluxo não responde", longe da causa.
      const apontou = await apontarAVolta(conexao.id)

      if (!apontou) {
        app.log.error(
          { sessao, temUrlPublica: !!enderecoPublicoAtual(env.WHATSAPP_BRIDGE_PUBLIC_URL) },
          'sem webhook: a instância não teria pra onde entregar o que chegar — pareamento recusado',
        )
        return reply.code(503).send({
          status: 'disconnected',
          qr: null,
          detail: 'O servidor ainda não consegue receber mensagens deste número. Avise o suporte antes de parear.',
        })
      }

      const situacao = await uaz.situacao(conta)
      // Já pareado: não há QR a mostrar, e pedir um derrubaria a sessão viva.
      if (situacao.status === 'connected') {
        await gravarPareamento(conexao.id, situacao)
        return { status: situacao.status, qr: null, phone: situacao.phone, deviceName: situacao.deviceName, detail: null }
      }

      const qr = await uaz.qr(conta)
      return {
        status: qr ? 'connecting' : situacao.status,
        qr,
        phone: situacao.phone,
        deviceName: situacao.deviceName,
        detail: qr ? null : 'O WhatsApp não devolveu o código. Tente de novo em alguns segundos.',
      }
    } catch (e) {
      const { code, detail } = erroDoEnvio(e)
      req.log.error({ err: e, sessao }, 'falha ao abrir sessão')
      return reply.code(code).send({ status: 'disconnected', qr: null, detail })
    }
  })

  app.get('/sessions/:id', { preHandler: exigirToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const conta = (await canais.canalDe(id)).uazapi
      // Sem conta guardada, a instância nunca foi criada — que é exatamente
      // "desconectada", e não um erro de infraestrutura.
      if (!conta) return { status: 'disconnected', phone: null, deviceName: null, qr: null }

      const situacao = await uaz.situacao(conta)
      // Esta é a rota que a tela de Conexões fica perguntando enquanto alguém
      // escaneia — e por isso é ela que PRECISA gravar. O evento `connection`
      // do webhook grava também, mas depender só dele sai caro: sem
      // webhook apontado, o número pareou e o banco continuou dizendo
      // "desconectada" — a tela em vermelho num WhatsApp que funcionava.
      if (situacao.status === 'connected') await gravarPareamento(id, situacao)

      // O QR só é pedido quando falta parear. Pedir com a sessão viva faria a
      // uazapi gerar um código novo e DERRUBAR o número já conectado.
      const qr = situacao.status === 'connected' ? null : await uaz.qr(conta).catch(() => null)
      return { status: situacao.status, phone: situacao.phone, deviceName: situacao.deviceName, qr }
    } catch (e) {
      if (e instanceof UazapiError && e.status === 404) {
        return { status: 'disconnected', phone: null, deviceName: null, qr: null }
      }
      const { code, detail } = erroDoEnvio(e)
      return reply.code(code).send({ status: 'disconnected', phone: null, deviceName: null, qr: null, detail })
    }
  })

  /**
   * Aponta o webhook desta conexão pra esta ponte.
   *
   * Um lugar só monta essa URL, e ele é usado pelo pareamento e pelo vigia. Já
   * esteve escrito em dois lugares, e é exatamente o tipo de coisa que se
   * desencontra em silêncio: uma conexão pareada por um caminho ficaria
   * apontando pra um endereço que o outro caminho já trocou.
   */
  async function apontarAVolta(conexaoId: string): Promise<boolean> {
    const publico = enderecoPublicoAtual(env.WHATSAPP_BRIDGE_PUBLIC_URL)
    if (!publico) return false
    if (!(await enderecoResponde(publico))) return false
    const conta = (await canais.canalDe(conexaoId)).uazapi
    if (!conta) return false
    return contas.apontarWebhook(conta, publico, conexaoId, env.WHATSAPP_BRIDGE_TOKEN)
  }

  /**
   * O endereço público desta ponte responde MESMO?
   *
   * A uazapi aceita qualquer URL de webhook sem testar se ela existe: manda um
   * `enabled: true` e devolve 200 pra um endereço que não resolve em DNS. Então
   * "o webhook foi apontado" nunca significou "as mensagens vão chegar", e o
   * pareamento passava batido pela trava que existe justamente pra isso.
   *
   * Foi o que aconteceu: um túnel de desenvolvimento morreu, o endereço morto
   * continuou no ambiente, o número pareou com sucesso e nenhuma mensagem
   * chegou. O sintoma aparece dias depois, como "o CRM não recebe nada", longe
   * da causa — e não há erro em log nenhum, porque do ponto de vista de todo
   * mundo tudo deu certo.
   *
   * Uma requisição na própria ponte fecha o buraco: se ela não volta, o
   * endereço não serve, e é melhor recusar o pareamento agora do que entregar
   * um WhatsApp que só fala e nunca ouve.
   *
   * O resultado é guardado por um minuto: esta função roda a cada pareamento e
   * a cada rodada do vigia, e não faz sentido atravessar a internet toda vez.
   */
  const ecoPorOrigem = new Map<string, { quando: number; responde: boolean }>()

  /**
   * Este endereço responde MESMO? Vale pra qualquer URL, não só a do ambiente.
   *
   * O vigia precisa perguntar sobre a URL que está GRAVADA na instância, que
   * nem sempre é a do ambiente. Uma função só pra cada uma se desencontraria na
   * primeira vez que as duas divergissem, que é justamente o caso interessante.
   *
   * A resposta é guardada por origem e por um minuto: isto roda a cada
   * pareamento e a cada rodada do vigia, e não faz sentido atravessar a
   * internet toda vez pra perguntar a mesma coisa.
   */
  async function enderecoResponde(url: string): Promise<boolean> {
    let origem: string
    try {
      origem = new URL(url).origin
    } catch {
      return false
    }
    const guardado = ecoPorOrigem.get(origem)
    if (guardado && Date.now() - guardado.quando < 60_000) return guardado.responde

    const r = await fetch(`${origem}/health`, { signal: AbortSignal.timeout(8_000) }).catch(() => null)
    const responde = !!r?.ok
    if (!responde) {
      app.log.error(
        { endereco: origem, status: r?.status ?? 'sem resposta' },
        'o endereço público não responde: a uazapi não teria como entregar mensagem nenhuma',
      )
    }
    ecoPorOrigem.set(origem, { quando: Date.now(), responde })
    return responde
  }


  /**
   * Grava que a conexão está pareada, com o número que o aparelho realmente tem.
   *
   * O TELEFONE VEM DO PROVEDOR, não do cadastro. Quem cria a conexão digita um
   * número esperado; quem escaneia o QR pode ser outro aparelho — e foi o que
   * aconteceu aqui, com o cadastro dizendo um número e o chip pareado sendo
   * outro. O que vale é o que está no aparelho: é dele que as mensagens saem, e
   * é por ele que o cliente responde.
   *
   * Idempotente de propósito: é chamada a cada consulta de status enquanto a
   * tela de Conexões está aberta.
   */
  async function gravarPareamento(sessao: string, situacao: { phone: string | null; deviceName: string | null }): Promise<void> {
    const { data, error } = await db
      .from('crm_connections')
      .update({
        status: 'conectada',
        status_detail: null,
        connected_at: new Date().toISOString(),
        ...(situacao.phone ? { phone: situacao.phone } : {}),
      })
      .or(filtroDeSessao(sessao))
      .select('id')
      .maybeSingle()

    if (error) {
      app.log.error({ err: error, sessao }, 'não deu pra gravar o pareamento')
      return
    }
    // Pareou: traz o histórico do aparelho sozinho, uma vez só.
    if (data?.id) void importarUmaVez(sessao, app.log)
  }

  // ─── Importação do histórico ─────────────────────────────────────────────

  /**
   * Importa o histórico da sessão — mas só na PRIMEIRA vez que ela conecta.
   *
   * O `session.status: connected` não serve de gatilho sozinho: com
   * `WHATSAPP_RESTART_ALL_SESSIONS` o provedor antigo reconecta a cada restart do
   * contêiner, e sem a marca no banco o CRM reimportaria tudo toda vez,
   * rebaixando cada mídia de novo. `history_imported_at` é o que faz acontecer
   * uma vez e só — apagar essa coluna força reimportar.
   */
  /**
   * Quanto tempo depois de parear "nenhuma conversa" ainda significa "cedo".
   *
   * Medido, não chutado: num pareamento real deste sistema a uazapi devolveu lista
   * VAZIA por mais de quatro minutos e só então começou a entregar as
   * conversas, aos poucos. Quinze minutos era apertado demais pra esse
   * comportamento, e quem pagava era justamente o número cheio de histórico —
   * o que mais demora a sincronizar.
   */
  const JANELA_DE_SINCRONIA_MS = 30 * 60_000

  /**
   * ZERO CONVERSAS NÃO CONTA COMO IMPORTADO. Devolve true se soltou a marca.
   *
   * `importarHistorico` devolve `{conversas: 0}` sem erro nenhum quando o
   * aparelho ainda não sincronizou: nenhum `catch` dispara e a marca fica
   * gravada. Como é ela que impede a segunda tentativa, a conexão ficava
   * condenada a nunca mais importar — com a tela mostrando um CRM vazio num
   * WhatsApp cheio de conversa, e sem nada em lugar nenhum explicando por quê.
   *
   * Soltar a marca devolve a tentativa pra próxima checagem, que acontece de
   * segundos em segundos enquanto a tela de Conexões está aberta. Na prática o
   * histórico entra sozinho, sem ninguém clicar nada.
   *
   * A JANELA É FECHADA, e é ela que impede o outro extremo: um número
   * legitimamente sem conversa nenhuma tentaria pra sempre.
   *
   * ESTÁ AQUI, E NÃO DENTRO DE QUEM IMPORTA, porque a regra já existiu em um
   * só dos dois caminhos. `/sincronizar` carimbava a marca na primeira vez e
   * não a soltava nunca: bastava alguém abrir o CRM nos segundos seguintes ao
   * pareamento — que é exatamente o que se faz depois de escanear o QR — pra
   * queimar a importação completa contra um provedor ainda vazio. O sintoma é
   * o pior possível: conectou, e o CRM fica vazio para sempre, sem erro.
   */
  async function soltarMarcaSeVeioVazio(
    conexao: { id: string; connected_at?: string | null },
    conversas: number,
    sessao: string,
    log: typeof app.log,
  ): Promise<boolean> {
    if (conversas > 0) return false
    const pareouHaPouco =
      !!conexao.connected_at && Date.now() - new Date(conexao.connected_at).getTime() < JANELA_DE_SINCRONIA_MS
    if (!pareouHaPouco) return false

    await db.from('crm_connections').update({ history_imported_at: null }).eq('id', conexao.id)
    log.info({ sessao }, 'nenhuma conversa ainda: o aparelho segue sincronizando, tentaremos de novo')
    return true
  }

  async function importarUmaVez(sessao: string, log: typeof app.log): Promise<void> {
    try {
      const { data: conexao } = await db
        .from('crm_connections')
        .select('id, client_id, history_imported_at, connected_at')
        .or(filtroDeSessao(sessao))
        .maybeSingle()
      if (!conexao || conexao.history_imported_at) return

      // O APARELHO ACABOU DE PAREAR E AINDA NÃO TEM NADA PRA DAR.
      //
      // Este trecho existe por causa de um pareamento real que terminou com
      // zero conversas na tela: a marca de importado foi carimbada 77
      // MILISSEGUNDOS depois de conectar. O WhatsApp entrega o histórico do
      // aparelho alguns segundos DEPOIS de a sessão subir, então perguntar no
      // mesmo instante devolve uma lista vazia — e vazia não é erro, é só
      // cedo.
      //
      // A espera é curta de propósito: ela não precisa cobrir o pior caso,
      // porque quem cobre o pior caso é a repetição lá embaixo. Só evita que a
      // primeira tentativa seja inútil por construção.
      await new Promise((r) => setTimeout(r, 8_000))

      // Marca ANTES de começar. A importação leva minutos e outro
      // `session.status` pode chegar no meio — sem isto, duas importações
      // rodariam em paralelo sobre as mesmas conversas.
      const { error } = await db
        .from('crm_connections')
        .update({ history_imported_at: new Date().toISOString() })
        .eq('id', conexao.id)
        .is('history_imported_at', null)
      if (error) return

      log.info({ sessao }, 'primeira conexão — importando o histórico do aparelho')
      const resultado = await importarHistorico(db, zap, log, {
        sessao,
        clientId: conexao.client_id,
        connectionId: conexao.id,
      })

      if (await soltarMarcaSeVeioVazio(conexao, resultado.conversas, sessao, log)) return

      log.info({ sessao, ...resultado }, 'histórico importado')
    } catch (e) {
      // Falhar aqui não pode derrubar o webhook: o canal ao vivo vale mais que
      // o histórico. Soltar a marca deixa a próxima conexão tentar de novo, em
      // vez de condenar essa conexão a nunca mais importar.
      log.error({ err: e, sessao }, 'importação automática falhou')
      await db.from('crm_connections').update({ history_imported_at: null }).or(filtroDeSessao(sessao))
    }
  }

  const ImportBody = z.object({
    instanceId: z.string().min(1),
    conversas: z.coerce.number().int().min(1).max(200).optional(),
    mensagensPorConversa: z.coerce.number().int().min(1).max(1000).optional(),
  })

  app.post('/import', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = ImportBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    const sessao = parsed.data.instanceId

    const { data: conexao } = await db
      .from('crm_connections')
      .select('id, client_id')
      .or(filtroDeSessao(sessao))
      .maybeSingle()
    if (!conexao) return reply.code(404).send({ detail: 'Conexão desconhecida.' })

    const conta = (await canais.canalDe(sessao)).uazapi
    const situacao = conta ? await uaz.situacao(conta).catch(() => null) : null
    if (situacao?.status !== 'connected') {
      return reply.code(409).send({ detail: 'O número precisa estar conectado para importar o histórico.' })
    }

    // Sem await de propósito: puxar dezenas de conversas leva minutos, e o
    // backend desiste da chamada em 10 segundos. Quem acompanha o resultado é
    // a tela de Chats, onde as conversas vão aparecendo.
    void importarHistorico(db, zap, app.log, {
      sessao,
      clientId: conexao.client_id,
      connectionId: conexao.id,
      limites: {
        conversas: parsed.data.conversas ?? LIMITES_PADRAO.conversas,
        mensagensPorConversa: parsed.data.mensagensPorConversa ?? LIMITES_PADRAO.mensagensPorConversa,
      },
    }).catch((e) => app.log.error({ err: e, sessao }, 'importação do histórico falhou'))

    return { ok: true, iniciada: true }
  })

  /**
   * Sincronização leve, para rodar toda vez que alguém abre o CRM.
   *
   * Não é a importação completa: puxa poucas mensagens das conversas recentes,
   * e o que já está gravado é pulado ANTES de baixar mídia. Existe pra tapar o
   * buraco de quando a ponte esteve fora do ar — o WhatsApp não reentrega o que
   * perdeu, e sem isto essas mensagens sumiam para sempre.
   *
   * Uma de cada vez por sessão: abrir três abas do CRM dispararia três
   * varreduras simultâneas sobre as mesmas conversas.
   */
  const sincronizando = new Set<string>()

  app.post('/sincronizar', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = z.object({ instanceId: z.string().min(1) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    const sessao = parsed.data.instanceId

    if (sincronizando.has(sessao)) return { ok: true, jaEmAndamento: true }

    const { data: conexao } = await db
      .from('crm_connections')
      .select('id, client_id, history_imported_at, connected_at')
      .or(filtroDeSessao(sessao))
      .maybeSingle()
    if (!conexao) return reply.code(404).send({ detail: 'Conexão desconhecida.' })

    const situacao = await zap.situacao(sessao).catch(() => null)
    if (situacao?.status !== 'connected') {
      return { ok: true, iniciada: false, detail: 'O número não está conectado.' }
    }

    // Nunca importou = primeira vez, e aí vale a varredura completa. Depois
    // disso, só o alcance curto.
    const primeiraVez = !conexao.history_imported_at
    sincronizando.add(sessao)

    void (async () => {
      try {
        if (primeiraVez) {
          await db
            .from('crm_connections')
            .update({ history_imported_at: new Date().toISOString() })
            .eq('id', conexao.id)
        }
        const resultado = await importarHistorico(db, zap, app.log, {
          sessao,
          clientId: conexao.client_id,
          connectionId: conexao.id,
          limites: primeiraVez ? LIMITES_PADRAO : LIMITES_SINCRONIZACAO,
        })

        // A varredura completa acontece UMA vez. Gastá-la contra um provedor
        // que ainda não recebeu nada do aparelho é perder o histórico fundo —
        // as conversas até entram depois, mas pela sincronização leve, que traz
        // 25 mensagens de cada em vez de 400.
        if (primeiraVez) await soltarMarcaSeVeioVazio(conexao, resultado.conversas, sessao, app.log)
      } catch (e) {
        app.log.error({ err: e, sessao }, 'sincronização falhou')
      } finally {
        sincronizando.delete(sessao)
      }
    })()

    return { ok: true, iniciada: true, completa: primeiraVez }
  })

  // Preenche as fotos que faltaram, sem reimportar mensagem nenhuma. Serve
  // pra conversa que nasceu ao vivo antes da importação e pro contato que
  // colocou foto depois.
  app.post('/avatares', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = z.object({ instanceId: z.string().min(1) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    const sessao = parsed.data.instanceId

    const { data: conexao } = await db
      .from('crm_connections')
      .select('client_id')
      .or(filtroDeSessao(sessao))
      .maybeSingle()
    if (!conexao) return reply.code(404).send({ detail: 'Conexão desconhecida.' })

    void sincronizarAvatares(db, zap, app.log, sessao, conexao.client_id).catch((e) =>
      app.log.error({ err: e, sessao }, 'sincronização de fotos falhou'),
    )
    return { ok: true, iniciada: true }
  })

  app.delete('/sessions/:id', { preHandler: exigirToken }, async (req) => {
    const { id } = req.params as { id: string }
    const conta = (await canais.canalDe(id)).uazapi
    // Já sem conta = já desconectada. Responder ok é o certo: quem clicou em
    // "Desconectar" quer o número fora, e ele está.
    if (!conta) return { ok: true }

    await uaz.desconectar(conta).catch((e) => req.log.warn({ err: e, sessao: id }, 'a uazapi recusou desconectar'))
    canais.esquecer(id)
    return { ok: true }
  })

  /**
   * APAGA A INSTÂNCIA NA CONTA PAGA. Não é o mesmo que desconectar.
   *
   * `DELETE /sessions/:id` (acima) desliga o aparelho e MANTÉM a instância, que
   * é o certo pra quem vai parear de novo depois. Esta aqui devolve a vaga.
   *
   * Ela não existia, e `ContasUazapi.apagar` estava escrito e nunca era
   * chamado: excluir uma conexão no CRM apagava a linha do banco direto do
   * navegador, sem ninguém avisar este serviço. A instância seguia viva, na
   * fatura e ocupando o teto de números do plano. Duas exclusões depois, a
   * conta estava cheia e o QR Code não abria mais — com o banco de conexões
   * vazio, o que torna o problema invisível de dentro do produto.
   *
   * A conexão precisa AINDA EXISTIR quando esta rota é chamada: é dela que
   * saem o servidor e o token da instância. Por isso quem exclui chama esta
   * rota primeiro e só depois apaga a linha.
   */
  app.delete('/instancias/:id', { preHandler: exigirToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const conta = (await canais.canalDe(id)).uazapi
    // Sem conta guardada, nunca houve instância: não há vaga pra devolver, e a
    // exclusão da conexão pode seguir.
    if (!conta) return { ok: true, apagada: false }

    const apagada = await contas.apagar(conta)
    if (!apagada) {
      return reply.code(502).send({
        ok: false,
        detail:
          'Não deu pra remover este número do servidor de WhatsApp. Ele continuaria ocupando uma vaga do seu plano, ' +
          'então a exclusão foi cancelada. Tente de novo em alguns minutos.',
      })
    }
    canais.esquecer(id)
    req.log.info({ conexao: id }, 'instância uazapi apagada: vaga devolvida ao plano')
    return { ok: true, apagada: true }
  })

  // ─── Gatilho de mudança de estado da conversa ────────────────────────────
  //
  // Quem marca uma conversa como concluída é o painel, e o painel escreve
  // direto no banco pelo Supabase — não passa por aqui. Sem esta rota, o
  // "Fluxo de atendimento finalizado" ficaria configurável e nunca dispararia
  // quando o atendente fecha a conversa pela tela, só quando um bloco de fluxo
  // a fechava. A mesma configuração valendo num caminho e não no outro é
  // exatamente o defeito que o cliente vê como "não funciona".
  const GatilhoBody = z.object({
    clientId: z.string().uuid(),
    chatId: z.string().uuid(),
    connectionId: z.string().uuid().nullable(),
    qual: z.enum(['conversa_finalizada', 'atendimento_finalizado']),
  })

  app.post('/gatilho-de-conversa', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = GatilhoBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    const { clientId, chatId, connectionId, qual } = parsed.data
    try {
      const disparou = await fluxos.gatilhoDeConversa(clientId, chatId, connectionId, qual)
      return { ok: true, disparou }
    } catch (e) {
      // Fluxo com problema não pode fazer a tela achar que não conseguiu
      // resolver a conversa: ela já está resolvida no banco.
      req.log.error({ err: e, chatId, qual }, 'gatilho de conversa falhou')
      return { ok: false, disparou: false }
    }
  })

  // ─── Envio ───────────────────────────────────────────────────────────────

  const MessageBody = z.object({
    instanceId: z.string().min(1),
    to: z.string().min(1),
    text: z.string().default(''),
    // Caminho no bucket whatsapp-media. Quando vem, o texto vira legenda.
    mediaPath: z.string().optional(),
    mediaKind: z.enum(['imagem', 'audio', 'video', 'documento']).optional(),
    // Botões de verdade. Só o atendente escolhe mandar — daí ser opcional.
    buttons: z
      .array(
        z.object({
          type: z.enum(['reply', 'url', 'call', 'copy']),
          text: z.string().min(1),
          id: z.string().optional(),
          url: z.string().optional(),
          phoneNumber: z.string().optional(),
          copyCode: z.string().optional(),
        }),
      )
      .max(MAX_BOTOES)
      .optional(),
    footer: z.string().optional(),
  })

  app.post('/messages', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = MessageBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    const { instanceId, to, text, mediaPath, mediaKind, buttons, footer } = parsed.data

    // Sem arquivo, texto vazio não é mensagem. COM arquivo, é: uma foto sem
    // legenda é um envio legítimo.
    if (!mediaPath && !text.trim()) return reply.code(400).send({ detail: 'Mensagem vazia.' })

    try {
      // Por qual canal ESTA conexão fala. Resolvido por conexão, não por
      // ambiente: o sistema tem cliente na Cloud API e cliente no QR ao mesmo tempo.
      const { cloud, uazapi: conta } = await canais.canalDe(instanceId)

      // Nenhum dos dois: a conexão existe mas não está pareada nem configurada.
      // Dizer isso é melhor que estourar um erro de rede confuso lá na frente.
      if (!cloud && !conta) {
        return reply.code(409).send({ detail: 'Esta conexão não está conectada. Leia o QR Code na tela de Conexões.' })
      }

      if (buttons?.length) {
        // OS DOIS CANAIS ENTREGAM BOTÃO AGORA. Era aqui que morava a exceção
        // triste do provedor antigo: ele respondia 201 e a chave PIX do atendente sumia no
        // caminho, com a tela dizendo "enviada".
        const r = cloud
          ? await cloud.enviarBotoes(to, { corpo: text, rodape: footer, botoes: buttons })
          : await uaz.enviarBotoes(conta!, to, { corpo: text, rodape: footer, botoes: buttons })

        // Só cai aqui quando o formato foi RECUSADO (mais de três botões, por
        // exemplo). O texto ainda sai, e quem chamou fica sabendo que foi assim.
        if (r.entregue) return { id: r.id, comBotoes: true }
        const reserva = textoDeReserva(text, buttons)
        const id = cloud ? await cloud.enviarTexto(to, reserva) : await uaz.enviarTexto(conta!, to, reserva)
        return { id, comBotoes: false }
      }

      if (mediaPath) {
        const arquivo = await lerDoStorage(db, mediaPath)
        if (!arquivo) return reply.code(422).send({ detail: 'O arquivo anexado não foi encontrado no armazenamento.' })

        // `figurinha` só existe na LEITURA: é o que distingue a bolha pequena
        // e transparente da foto, na tela do atendente. No envio ela não tem
        // par — o atendente anexa arquivo, não figurinha — e vai como imagem,
        // que é o que o webp é do lado de lá.
        const cru = mediaKind ?? tipoDeMidia(arquivo.mimetype)
        const kind = cru === 'figurinha' ? 'imagem' : cru
        const id = cloud
          ? await cloud.enviarMidiaPorBytes(to, { ...arquivo, kind }, text)
          : await uaz.enviarMidiaPorBytes(conta!, to, arquivo.bytes, arquivo.mimetype, paraTipoUazapi(kind), text, arquivo.filename)
        return { id }
      }

      const id = cloud ? await cloud.enviarTexto(to, text) : await uaz.enviarTexto(conta!, to, text)
      return { id }
    } catch (e) {
      const { code, detail } = erroDoEnvio(e)
      req.log.error({ err: e, instanceId, mediaPath }, 'falha ao enviar')
      return reply.code(code).send({ detail })
    }
  })

  // ─── Disparo em massa ────────────────────────────────────────────────────

  app.post('/broadcasts', { preHandler: exigirToken }, async (req, reply) => {
    const parsed = z.object({ broadcastId: z.string().uuid() }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ detail: 'Dados inválidos.' })
    if (disparos.emAndamento(parsed.data.broadcastId)) {
      return { ok: true, detail: 'Este disparo já está em andamento.' }
    }
    disparos.iniciar(parsed.data.broadcastId)
    return { ok: true, detail: null }
  })

  // ─── Mensagem chegando (webhook do provedor antigo) ─────────────────────────────────

  // ─── Mensagem chegando (webhook da uazapi) ───────────────────────────────
  //
  // A uazapi não manda cabeçalho que a gente escolha, então o segredo vai na
  // query — junto com o id da CONEXÃO. Identificar pela conexão, e não pelo
  // telefone, é o que impede dois clientes do sistema com o mesmo número
  // cadastrado de receberem a conversa um do outro.

  app.post('/uazapi/webhook', async (req, reply) => {
    const { token, conexao: conexaoId } = req.query as { token?: string; conexao?: string }
    if (token !== env.WHATSAPP_BRIDGE_TOKEN) return reply.code(401).send({ error: 'token inválido' })
    if (!conexaoId) return reply.code(400).send({ error: 'sem conexão na URL' })

    const evento = req.body as { EventType?: string; message?: Record<string, unknown>; instance?: Record<string, unknown> }
    const sessao = conexaoId

    // ─── A instância mudou de estado ──────────────────────────────────────
    if (evento.EventType === 'connection') {
      // O aviso diz QUE mudou; quem diz PRA QUÊ é o provedor. Ler o estado de
      // volta em vez de confiar no formato do corpo custa uma chamada num
      // evento que acontece poucas vezes por dia — e sobrevive à uazapi
      // mudando o desenho do envelope, que é o tipo de quebra que só aparece
      // no dia em que o número cai e a tela insiste que está tudo bem.
      const conta = (await canais.canalDe(sessao)).uazapi
      const situacao = conta
        ? await uaz.situacao(conta).catch(() => null)
        : null

      if (!situacao) {
        req.log.warn({ sessao }, 'aviso de conexão sem conseguir conferir o estado — nada foi gravado')
        return { ok: true }
      }

      // Pareou? Grava o número do aparelho e traz o histórico. Quem liga um
      // chip espera achar as conversas dele lá dentro, sem lembrar de botão.
      if (situacao.status === 'connected') {
        await gravarPareamento(sessao, situacao)
        return { ok: true }
      }

      // Caiu. Gravar direto poupa a tela de ficar perguntando: se o celular
      // sair do ar às 3h, a Conexões já mostra o vermelho quando alguém abrir.
      const { error } = await db
        .from('crm_connections')
        .update({
          status: situacao.status === 'connecting' ? 'conectando' : 'desconectada',
          ...(situacao.status === 'disconnected' ? { disconnected_at: new Date().toISOString() } : {}),
        })
        .or(filtroDeSessao(sessao))
      if (error) req.log.error({ err: error, sessao }, 'não deu pra gravar o status da instância')
      return { ok: true }
    }

    // Só mensagem NOVA. `messages_update` chega a cada recibo de leitura e a
    // cada edição, com o mesmo envelope — tratá-lo como mensagem faria o fluxo
    // responder de novo toda vez que o cliente ABRISSE a conversa.
    if (!ehMensagemNova(evento)) return { ok: true }

    const recebida = lerRecebida(evento)
    if (!recebida) return { ok: true }
    // Grupo, status e canal não são conversa de atendimento.
    if (recebida.grupo || !ehConversaIndividual(recebida.chatId)) return { ok: true }

    // Mensagem que SAIU do aparelho continua entrando, como 'saida': é o
    // atendente respondendo pelo celular, fora do CRM. Descartar deixava a
    // conversa contando metade da história. O que impede o eco do nosso
    // próprio envio de virar linha repetida é o índice único em
    // (client_id, external_id).
    const enviar: Record<string, unknown> = {
      instanceId: sessao,
      from: recebida.telefone,
      // Numa mensagem que sai, o nome é o de quem RECEBEU visto pelo aparelho
      // — nem sempre o do contato. Deixar de fora evita renomear a conversa
      // pelo lado errado.
      name: !recebida.fromMe ? (recebida.nome ?? undefined) : undefined,
      // O RÓTULO, não o id. O que fica gravado aqui é o que o atendente lê na
      // conversa: quem tocou em "Achei caro" tem que aparecer dizendo isso, e
      // não `o_9xday7pi`. Quem casa a resposta com o menu é o motor, logo
      // abaixo, e esse continua usando o id.
      text: recebida.rotulo,
      externalId: recebida.externalId ?? undefined,
      direction: recebida.fromMe ? 'saida' : 'entrada',
    }

    if (recebida.mediaUrl || recebida.mediaId) {
      // A cópia pro Storage precisa do dono do arquivo, e quem sabe disso é a
      // conexão. Uma consulta por mídia recebida é aceitável; por mensagem de
      // texto seria desperdício, por isso está aqui dentro.
      const { data: dono } = await db.from('crm_connections').select('client_id').eq('id', sessao).maybeSingle()
      if (dono?.client_id) {
        const guardada = await guardarArquivoDaMensagem(db, zap, dono.client_id, sessao, {
          mediaUrl: recebida.mediaUrl,
          mediaId: recebida.mediaId,
          mediaMimetype: recebida.mediaMimetype,
          figurinha: ehFigurinha(recebida.tipoCru),
        })
        if (guardada) {
          enviar.mediaPath = guardada.path
          enviar.mediaKind = guardada.kind
        } else {
          req.log.warn({ sessao, tipo: recebida.tipoCru }, 'não deu pra guardar a mídia recebida')
        }
      }
    }

    const res = await fetch(`${env.BACKEND_URL.replace(/\/$/, '')}/public/crm/whatsapp/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.WHATSAPP_BRIDGE_TOKEN}` },
      body: JSON.stringify(enviar),
    }).catch(() => null)

    if (!res?.ok) {
      // Responder 200 mesmo assim: a uazapi reenvia em caso de erro, e uma
      // mensagem que o backend recusou por formato seria reenviada pra sempre.
      req.log.error({ status: res?.status, sessao, from: recebida.telefone }, 'backend recusou a mensagem recebida')
      return { ok: true }
    }

    const corpoDoBackend = (await res.json().catch(() => null)) as {
      chatId?: string
      conversaNova?: boolean
      reaberta?: boolean
    } | null

    // Só mensagem RECEBIDA aciona fluxo. O eco do que nós mesmos mandamos
    // responderia ao próprio menu e o fluxo andaria sozinho até o fim.
    if (!recebida.fromMe && corpoDoBackend?.chatId) {
      try {
        // Quem já está esperando tem prioridade: se um fluxo mandou o menu,
        // esta resposta é dele. Só quando ninguém espera é que vale procurar
        // um gatilho novo.
        const consumida = await fluxos.aoReceberMensagem(corpoDoBackend.chatId, recebida.texto)
        if (!consumida) {
          const { data: dono } = await db.from('crm_connections').select('client_id, id').eq('id', sessao).maybeSingle()
          let acionou = dono?.client_id
            ? await fluxos.gatilhoPorMensagem(dono.client_id, corpoDoBackend.chatId, recebida.texto, !!corpoDoBackend.conversaNova)
            : false

          // A conversa estava fechada e o cliente voltou. Depois da palavra
          // chave, de propósito: quem reabre escrevendo "quero o plano" disse o
          // que quer, e o fluxo de reabertura por cima disso ignoraria a pessoa.
          if (!acionou && corpoDoBackend.reaberta && dono?.client_id) {
            acionou = await fluxos.gatilhoDeConversa(
              dono.client_id,
              corpoDoBackend.chatId,
              dono.id,
              'conversa_finalizada',
            )
          }

          // Tocou num botão e não caiu em execução nenhuma nem acionou fluxo
          // novo: o menu daquele botão já tinha encerrado. O botão continua
          // tocável no WhatsApp pra sempre, e ficar calado aqui é o que faz
          // parecer que "o botão parou de funcionar".
          if (!acionou && recebida.doBotao) await fluxos.avisarBotaoVencido(corpoDoBackend.chatId)
        }
      } catch (e) {
        // Fluxo com problema não pode derrubar o recebimento: a mensagem já
        // está gravada, e é isso que não pode se perder.
        req.log.error({ err: e, chatId: corpoDoBackend.chatId }, 'motor de fluxos falhou nesta mensagem')
      }
    }

    if (corpoDoBackend?.conversaNova && corpoDoBackend.chatId) {
      const { data: dono } = await db.from('crm_connections').select('client_id').eq('id', sessao).maybeSingle()
      if (dono?.client_id) {
        void guardarAvatarDaConversa(db, zap, sessao, dono.client_id, recebida.chatId, corpoDoBackend.chatId)
      }
    }

    return { ok: true }
  })


  // ─── Webhook da Cloud API oficial ────────────────────────────────────────
  //
  // Rota separada da do provedor antigo, e não um `if` dentro dela: o pacote da Meta não
  // se parece em nada com o do provedor antigo — vem aninhado em
  // `entry[].changes[].value.messages[]`, mistura mensagem com status de
  // entrega no mesmo corpo, e mídia chega como id que precisa de duas idas pra
  // virar arquivo. Um `if` no meio da outra rota misturaria dois formatos que
  // não têm um campo em comum.
  //
  // As duas rotas convivem no código, mas NÃO no ar: o número está no provedor antigo ou
  // na Cloud API, nunca nos dois.

  /**
   * A verificação da Meta. Ela chama uma vez com GET e espera o `sistema.challenge`
   * de volta, cru. Sem isso ela não registra o webhook e nunca entrega
   * mensagem nenhuma depois — e o sintoma é um bot mudo, sem erro em lugar
   * algum.
   */
  app.get('/cloud/webhook', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    const esperado = env.WHATSAPP_CLOUD_VERIFY_TOKEN
    if (!esperado) return reply.code(503).send({ detail: 'WHATSAPP_CLOUD_VERIFY_TOKEN não configurado.' })
    if (q['sistema.mode'] === 'subscribe' && q['sistema.verify_token'] === esperado) {
      // Texto puro, não JSON: a Meta compara byte a byte com o que mandou.
      return reply.type('text/plain').send(q['sistema.challenge'] ?? '')
    }
    return reply.code(403).send({ detail: 'verificação recusada' })
  })

  app.post('/cloud/webhook', async (req) => {
    // RECEBER NÃO DEPENDE DE ENVIAR. A rota funciona mesmo sem a Cloud API
    // configurada pro envio: é assim que dá pra ligar o webhook e ver o que a
    // Meta está fazendo ANTES de trocar o canal de um cliente — e trocar o
    // canal derruba a conexão por QR dele.

    // ── Isto veio mesmo da Meta? ──
    //
    // A rota é pública por obrigação (a Meta não manda token nem cabeçalho que
    // a gente escolha), então a assinatura é a ÚNICA barreira. Sem ela,
    // qualquer um que descubra a URL injeta conversa falsa no CRM de um cliente
    // e dispara o fluxo dele.
    //
    // Sem segredo configurado a rota só OBSERVA — registra e não age. É o que
    // deixa ligar o webhook pra diagnosticar sem abrir essa porta.
    const cru = (req as FastifyRequest & { cru?: Buffer }).cru
    const assinada =
      !!env.WHATSAPP_CLOUD_APP_SECRET &&
      !!cru &&
      assinaturaConfere(cru, req.headers['x-sistema-signature-256'] as string | undefined, env.WHATSAPP_CLOUD_APP_SECRET)

    if (env.WHATSAPP_CLOUD_APP_SECRET && !assinada) {
      // 200 mesmo assim: responder erro faria a Meta reenviar em laço, e depois
      // de algumas falhas ela DESATIVA a assinatura do webhook inteiro. O
      // pacote é descartado aqui, que é o que importa.
      req.log.warn({ ip: req.ip }, 'webhook com assinatura inválida — descartado')
      return { ok: true }
    }

    // O que a Meta fez com o que MANDAMOS. Vem no mesmo pacote das mensagens
    // recebidas, e é a única fonte da verdade sobre entrega: uma mensagem que
    // ela aceitou (respondeu `wamid`) e depois não entregou é invisível sem
    // isto — do nosso lado deu tudo certo, e o cliente nunca recebeu.
    for (const s of statusDoWebhook(req.body)) {
      const dados = { id: s.externalId, para: s.para, situacao: s.status, erros: s.erros }
      if (s.status === 'failed') req.log.error(dados, 'a Meta NÃO entregou esta mensagem')
      else req.log.info(dados, 'situação da mensagem na Meta')
    }

    // Responder 200 SEMPRE, e cedo. A Meta desiste do webhook que demora e
    // reenvia o lote inteiro; pior, depois de algumas falhas ela desativa a
    // assinatura. Erro nosso vira log, não status HTTP.
    const recebidas = mensagensDoWebhook(req.body)
    if (recebidas.length === 0) return { ok: true }
    for (const m of recebidas) {
      req.log.info({ de: m.telefone, nome: m.nome, texto: m.texto.slice(0, 80) }, 'mensagem recebida pela Cloud API')
    }
    // Daqui pra baixo a ponte AGE — grava no CRM e empurra o fluxo. Só com a
    // assinatura conferida: um pacote forjado viraria mensagem de verdade na
    // conversa de um cliente.
    if (!assinada) {
      req.log.warn({ quantas: recebidas.length }, 'sem WHATSAPP_CLOUD_APP_SECRET: só observando, nada foi gravado')
      return { ok: true }
    }

    for (const m of recebidas) {
      try {
        // De QUAL conexão do sistema é este evento. A Meta não sabe o que é uma
        // conexão nossa: ela diz de qual número dela veio. Sem casar por aqui,
        // um sistema com dois clientes na Cloud API entregaria a mensagem de um na
        // conversa do outro.
        const conexao = m.numeroDaMeta ? await canais.porNumeroDaMeta(m.numeroDaMeta) : null
        if (!conexao) {
          req.log.warn({ numeroDaMeta: m.numeroDaMeta }, 'webhook de um número que nenhuma conexão reivindica')
          continue
        }
        const cloud = await canais.cloudDe(conexao.id)

        const enviar: Record<string, unknown> = {
          instanceId: conexao.id,
          from: m.telefone,
          name: m.nome ?? undefined,
          text: m.texto,
          externalId: m.externalId,
          direction: 'entrada',
        }

        if (m.midia && cloud) {
          const arquivo = await cloud.baixarMidia(m.midia.id)
          const guardada = arquivo ? await guardarBytes(db, conexao.clientId, arquivo.bytes, arquivo.mimetype) : null
          if (guardada) {
            enviar.mediaPath = guardada.path
            enviar.mediaKind = guardada.kind
          } else {
            req.log.warn({ midia: m.midia.id }, 'não deu pra baixar a mídia da Cloud API')
          }
        }

        const res = await fetch(`${env.BACKEND_URL.replace(/\/$/, '')}/public/crm/whatsapp/inbound`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.WHATSAPP_BRIDGE_TOKEN}` },
          body: JSON.stringify(enviar),
        }).catch(() => null)

        if (!res?.ok) {
          req.log.error({ status: res?.status, de: m.telefone }, 'backend recusou a mensagem da Cloud API')
          continue
        }

        const doBackend = (await res.json().catch(() => null)) as
          | { chatId?: string; conversaNova?: boolean; reaberta?: boolean }
          | null
        if (!doBackend?.chatId) continue

        // "digitando…" enquanto o fluxo pensa. Na Cloud API ele só viaja junto
        // do recibo de leitura DESTA mensagem, por isso vai aqui e não lá
        // dentro do motor.
        if (cloud) void cloud.digitando(m.externalId)

        const consumida = await fluxos.aoReceberMensagem(doBackend.chatId, m.texto)
        if (!consumida) {
          const acionou = await fluxos.gatilhoPorMensagem(
            conexao.clientId,
            doBackend.chatId,
            m.texto,
            !!doBackend.conversaNova,
          )
          if (!acionou && doBackend.reaberta) {
            await fluxos.gatilhoDeConversa(conexao.clientId, doBackend.chatId, conexao.id, 'conversa_finalizada')
          }
        }
      } catch (e) {
        req.log.error({ err: e, de: m.telefone }, 'falha ao tratar mensagem da Cloud API')
      }
    }

    return { ok: true }
  })

  return app
}

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FastifyBaseLogger } from 'fastify'
import type { Botao, LinhaDaLista, ResultadoRico } from './zap.js'
import type { Zapper } from './zapper.js'
import type { Presenca } from './uazapi.js'
import { acharOpcao } from './entender.js'
import { cortarTitulo, soDigitos, LIMITE_DA_OPCAO, LIMITE_DA_PERGUNTA, MAX_BOTOES } from './zap.js'
import type { Canais } from './canais.js'

// O motor de fluxos. Percorre o desenho feito no editor e conversa com o
// cliente de verdade pelo WhatsApp.
//
// A regra que manda em tudo aqui: UM FLUXO PARA NO MEIO. Ele manda o menu e
// fica parado — pode ser um minuto, pode ser dois dias. Então nada de estado em
// memória: onde parou e o que espera vivem em `crm_flow_runs`, e a ponte pode
// reiniciar no meio de uma conversa sem perder nada.
//
// A segunda regra: GRAVAMOS O QUE MANDAMOS, aqui mesmo.
//
// Já foi o contrário — o WhatsApp devolvia todo envio pelo webhook e bastava
// deixar o caminho de recebimento gravar. Não vale mais: o motor NOWEB nasce do
// `messages.upsert` do Baileys, e ele NÃO dispara para o que a própria API
// envia. O eco só existe pro que o dono digita no celular. Sem gravar aqui, o
// atendente abriria a conversa e veria as respostas do cliente sem nenhuma das
// perguntas que o fluxo fez.
//
// Gravar duas vezes não é risco: o índice único em (client_id, external_id)
// recusa a segunda, então um motor que ainda ecoe não duplica a linha.

// ─── O desenho, do jeito que o editor grava ─────────────────────────────────

interface ConteudoDoBloco {
  kind: string
  text?: string
  mediaUrl?: string
  fileName?: string
  delaySeconds?: number
}

interface OpcaoDeMenu {
  id: string
  label: string
  description?: string
  /**
   * Ausente = `resposta`. Só a resposta devolve algo ao fluxo — link, telefone
   * e código copiável agem no aparelho do cliente e não continuam a conversa.
   */
  kind?: 'resposta' | 'url' | 'telefone' | 'copiar'
  value?: string
}

interface BotaoDeCartao {
  id: string
  kind: 'resposta' | 'url' | 'telefone'
  label: string
  value?: string
}

interface CartaoDoCarrossel {
  id: string
  text: string
  imageUrl?: string
  buttons?: BotaoDeCartao[]
}

interface BlocoDoFluxo {
  id: string
  kind: string
  title: string
  data: {
    items?: ConteudoDoBloco[]
    text?: string
    options?: OpcaoDeMenu[]
    /** Lista ou botões, escolhido na tela. Vazio = decide pela quantidade. */
    menuFormat?: 'lista' | 'botoes'
    /**
     * MORTO — não leia. Era a caixinha antiga, que o motor nunca obedeceu.
     *
     * Fica declarado só pra ninguém achar que basta usá-lo: há blocos gravados
     * com `menuMode: 'lista'` de quando a caixinha existia e não fazia nada.
     * Passar a obedecê-lo hoje trocaria em silêncio o formato de fluxos que
     * estão no ar há meses, sem ninguém ter pedido.
     */
    menuMode?: 'lista' | 'botoes'
    imageUrl?: string
    footer?: string
    buttonLabel?: string
    cards?: CartaoDoCarrossel[]
    pixKey?: string
    pixRecipient?: string
    amount?: string
    tags?: string[]
    targetFlowId?: string | null
    departmentId?: string | null
    kanbanId?: string | null
    expireValue?: number
    expireUnit?: string
    waitForever?: boolean
    conditions?: { id?: string; variable: string; operator: string; value: string }[]
    /** Todas as condições (E) ou qualquer uma (OU). Vazio = todas. */
    matchAll?: boolean
    delayMinSeconds?: number
    delayMaxSeconds?: number

    // OS NOMES ABAIXO SÃO OS DA TELA, LETRA POR LETRA.
    //
    // Esta é a costura mais frágil do sistema: a tela grava JSON livre em
    // `crm_flows.graph` e o motor lê esse JSON, sem tipo compartilhado entre os
    // dois — a ponte e o front não compilam juntos. Errar um nome aqui não dá
    // erro em lugar nenhum: o campo vem `undefined`, o bloco "roda" e não faz
    // nada.
    //
    // É assim que o Intervalo Inteligente fica sem esperar: o motor lê
    // `delaySeconds`; a tela grava `intervalValue`/`intervalUnit`. Um fluxo com
    // "aguarde 1 hora antes de cobrar" cobrava no mesmo segundo. O mesmo valia
    // pra Atribuir (`assignedTo` × `assigneeEmail`) e pro prazo do Aguarda
    // Resposta (`expireValue` × `waitValue`).
    //
    // `scripts/_conferir-campos-do-fluxo.mjs` compara as duas listas e acusa
    // quem se separou. Rode-o depois de mexer em qualquer um dos dois lados.

    // ── Aguarda resposta ──
    waitValue?: number
    waitUnit?: string
    bufferEnabled?: boolean
    bufferSeconds?: number

    // ── Menu ──
    saveToVariable?: string

    // ── Intervalo inteligente ──
    scheduleKind?: 'intervalo' | 'data' | 'horarios'
    intervalValue?: number
    intervalUnit?: string
    scheduleDate?: string
    /** Janelas por dia da semana: 0=domingo, no relógio de quem atende. */
    scheduleHours?: { weekday: number; from: string; to: string }[]

    // ── Manipulador de variáveis ──
    varName?: string
    varOperation?: 'definir' | 'somar' | 'subtrair' | 'incrementar' | 'limpar'
    varValue?: string

    // ── Controlador de chat ──
    chatState?: 'aguardando' | 'atendendo' | 'resolvido'
    chatAction?: 'resolver' | 'reabrir' | 'transferir' | 'pausar_bot' | 'retomar_bot'

    // ── Atribuir atendimento ──
    assigneeEmail?: string

    // ── Kanban ──
    kanbanAction?: 'adicionar' | 'mover'
    kanbanColumnId?: string | null

    // ── Distribuidor ──
    saidas?: { id: string; label: string }[]
    preventRepeat?: boolean

    // ── Notificação ──
    notifyName?: string
    notifyCountry?: string
    notifyPhone?: string
    channel?: 'painel' | 'email' | 'whatsapp'

    // ── Integração HTTP ──
    httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url?: string
    /** JSON de cabeçalhos, como a pessoa digitou. Texto livre de propósito. */
    headers?: string
    body?: string
    /** { variavelDoFluxo: 'caminho.na.resposta' } */
    responseMap?: Record<string, string>

    // ── Bloco de IA ──
    aiProvider?: 'gpt' | 'gemini'
    aiAuth?: 'manual' | 'global'
    aiApiKey?: string
    aiModel?: string
    aiPrompt?: string
    aiUserMessage?: string
    aiSaveTo?: string
    aiAutoReply?: boolean
    aiKeepContext?: boolean
    aiContextTurns?: number
    aiConditions?: { id: string; label: string }[]

    // ── Pixel do Facebook ──
    pixelId?: string | null
    pixelEvent?: string
    currency?: string

    // ── Venda aprovada ──
    productId?: string | null
    saleCustomerTemplate?: string
    saleAmountTemplate?: string
    saleCurrencyTemplate?: string

    // ── Pagamento (gateway) ──
    gateway?: string
    openAmount?: boolean
    customerName?: string
    customerPhone?: string

    // ── Kie.ai ──
    kieApiKey?: string
    kieKind?: 'audio' | 'imagem' | 'musica' | 'video'
    kieModel?: string
    kieSaveTo?: string
  }
}

interface LigacaoDoFluxo {
  id: string
  from: string
  fromPort: string
  to: string
}

interface DesenhoDoFluxo {
  nodes: BlocoDoFluxo[]
  edges: LigacaoDoFluxo[]
}

/** Para onde o fluxo fala, e onde o que ele falou fica gravado. */
interface ConversaDoFluxo {
  sessao: string
  phone: string
  chatId: string
  clientId: string
  /**
   * A linha em `crm_connections`. NÃO é o mesmo que `sessao`, que é o nome da
   * instância no provedor: quando `instance_id` está preenchido, os dois valores
   * diferem. Quem procura configuração por conexão precisa deste.
   */
  connectionId: string | null
}

interface Execucao {
  id: string
  client_id: string
  flow_id: string
  chat_id: string
  current_block_id: string | null
  waiting_block_id: string | null
  variables: Record<string, string>
  /** Quantas vezes seguidas o menu já voltou sem o cliente acertar uma opção. */
  reperguntas?: number
}

/** Teto de blocos por rodada. Um ciclo A→B→A martelaria o WhatsApp sem isto. */
const MAX_BLOCOS_POR_RODADA = 60

/**
 * Quantas vezes o menu volta antes de o fluxo desistir.
 *
 * Dois é de propósito. Reperguntar sem teto vira laço: o cliente escreve, o
 * menu volta, ele escreve de novo — e o número fica mandando a mesma mensagem
 * pro mesmo destinatário, que é o padrão que derruba número não oficial. Na
 * terceira vez o problema não é a resposta dele: é o menu, ou é gente que ele
 * precisa.
 */
const MAX_REPERGUNTAS = 2

/** O recado que vai antes do menu repetido. */
const RECADO_DA_REPERGUNTA = 'Não consegui entender sua resposta. Escolha uma das opções abaixo:'

/** Pausa entre mensagens do mesmo bloco, quando o desenho não define uma. */
const PAUSA_PADRAO_MS = 1200

/**
 * Até aqui a pausa acontece dentro do laço; passando disso, a execução vai
 * dormir no banco.
 *
 * A ponte é UMA para todos os clientes do sistema. Segurá-la parada num "aguarde
 * 2 horas" pararia o atendimento de todo mundo junto — e um restart no meio
 * perderia a espera sem deixar rastro. Trinta segundos é o maior tempo que
 * vale a simplicidade de esperar em memória.
 */
const PAUSA_NO_LACO_MS = 30_000

/** Teto de espera de um Intervalo. O mesmo do agendamento (migração 0024). */
const MAX_DIAS_DE_ESPERA = 31

export class MotorDeFluxos {
  /** Execuções em andamento nesta ponte, pra não rodar a mesma duas vezes. */
  private readonly emAndamento = new Set<string>()

  constructor(
    private readonly db: SupabaseClient,
    private readonly zap: Zapper,
    private readonly log: FastifyBaseLogger,
    /**
     * Quem sabe por qual canal cada conexão fala. Um cliente pode estar na
     * Cloud API e o vizinho no QR Code — e a escolha é dele, não do sistema.
     */
    private readonly canais: Canais,
    /**
     * Menu como BOTÃO de verdade. Hoje é `true`, e essa é a mudança que a
     * troca de provedor comprou.
     *
     * Ficou `false` por meses porque o provedor antigo não entregava: ele respondia 201
     * com id de mensagem e o aparelho do cliente nunca recebia nada. Pela
     * uazapi chega — medido com número pareado por QR e o mesmo aparelho de
     * destino: texto, botões e botão de copiar, todos tocáveis.
     *
     * Ver WHATSAPP_MENU_INTERATIVO: desligar volta ao texto numerado, que o
     * `entender.ts` continua lendo com folga.
     */
    private readonly interativo = true,
    /**
     * Enquete no menu. Ver WHATSAPP_MENU_ENQUETE: continua `false`.
     *
     * Ela existia como a única forma TOCÁVEL que atravessava o QR Code, agora
     * que o botão atravessa, ela perdeu o motivo — e nunca foi boa: parece
     * votação, o cliente vê "1 voto" ao lado da opção e pode trocar depois de
     * o fluxo já ter seguido.
     */
    private readonly enquete = false,
    /**
     * Teto de espera, em minutos, pros blocos que não definem prazo próprio.
     * Ver WHATSAPP_FLUXO_ESPERA_MIN. Zero devolve o comportamento antigo:
     * esperar pra sempre.
     */
    private readonly esperaMaximaMin = 2880,
  ) {}

  // ─── Por onde a mensagem sai ──────────────────────────────────────────────
  //
  // Um lugar só decide o canal. Espalhar a escolha pelos doze pontos de envio
  // faria com que esquecer um deixasse uma mensagem saindo pelo canal errado —
  // e o sintoma seria uma frase sumindo no meio da conversa.

  /** Botão interativo chega por este canal? Só a Cloud API garante que sim. */
  private async interativoVale(conversa: ConversaDoFluxo): Promise<boolean> {
    return (await this.canais.cloudDe(conversa.sessao)) ? true : this.interativo
  }

  private async texto(conversa: ConversaDoFluxo, texto: string): Promise<string | null> {
    const cloud = await this.canais.cloudDe(conversa.sessao)
    if (cloud) return cloud.enviarTexto(conversa.phone, texto)
    return this.zap.enviarTexto(conversa.sessao, conversa.phone, texto)
  }

  private async botoes(
    conversa: ConversaDoFluxo,
    conteudo: { corpo: string; cabecalho?: string; rodape?: string; imagemUrl?: string; botoes: Botao[] },
  ): Promise<ResultadoRico> {
    const cloud = await this.canais.cloudDe(conversa.sessao)
    if (cloud) return cloud.enviarBotoes(conversa.phone, conteudo)
    return this.zap.enviarBotoes(conversa.sessao, conversa.phone, conteudo)
  }

  private async lista(
    conversa: ConversaDoFluxo,
    conteudo: { corpo: string; rodape?: string; textoDoBotao: string; linhas: LinhaDaLista[] },
  ): Promise<ResultadoRico> {
    const cloud = await this.canais.cloudDe(conversa.sessao)
    if (cloud) return cloud.enviarLista(conversa.phone, conteudo)
    return this.zap.enviarLista(conversa.sessao, conversa.phone, {
      titulo: conteudo.corpo,
      textoDoBotao: conteudo.textoDoBotao,
      rodape: conteudo.rodape,
      linhas: conteudo.linhas,
    })
  }

  private async midia(
    conversa: ConversaDoFluxo,
    url: string,
    kind: 'imagem' | 'audio' | 'video' | 'documento',
    legenda: string,
    filename?: string,
  ): Promise<string | null> {
    const cloud = await this.canais.cloudDe(conversa.sessao)
    if (cloud) return cloud.enviarMidiaPorUrl(conversa.phone, url, kind, legenda, filename)
    return this.zap.enviarMidiaPorUrl(conversa.sessao, conversa.phone, url, kind, legenda)
  }

  /**
   * A pausa com "digitando…" — ou "gravando áudio…" — no celular do cliente.
   *
   * O TIPO SEGUE O CONTEÚDO QUE VEM DEPOIS, e isso não é detalhe de acabamento:
   * ninguém digita uma nota de voz. Um áudio precedido de "digitando…" é a
   * única parte da pausa que denuncia o robô, justamente na hora em que ela
   * existe para fazer o contrário.
   *
   * Na Cloud API o aviso só viaja junto do recibo de leitura de uma mensagem
   * que o cliente mandou, ele só existe no tipo `text` e some sozinho em 25s —
   * não dá pra segurar pelo tempo que o cartão pediu nem pedir "gravando". Lá a
   * pausa é pausa mesmo: o que importa é que as frases não saiam todas
   * empilhadas no mesmo instante.
   */
  private async pausar(conversa: ConversaDoFluxo, ms: number, tipo: Presenca = 'composing'): Promise<void> {
    if (await this.canais.cloudDe(conversa.sessao)) return dormir(ms)
    return this.zap.presenca(conversa.sessao, conversa.phone, ms, tipo)
  }

  // ─── Entrada 1: a fila ────────────────────────────────────────────────────

  /** Pega o que está 'pendente' e começa a rodar. */
  async processarFila(): Promise<void> {
    const { data: pendentes } = await this.db
      .from('crm_flow_runs')
      .select('id, client_id, flow_id, chat_id, current_block_id, waiting_block_id, variables')
      .eq('status', 'pendente')
      .not('chat_id', 'is', null)
      .order('created_at')
      .limit(20)

    for (const run of (pendentes ?? []) as Execucao[]) {
      await this.rodar(run).catch((e) => this.log.error({ err: e, run: run.id }, 'execução de fluxo falhou'))
    }
  }

  // ─── Entrada 2: chegou mensagem ───────────────────────────────────────────

  /**
   * Entrega a mensagem ao fluxo que estava esperando esta conversa.
   *
   * Devolve `true` quando o fluxo consumiu a resposta — é o que diz ao webhook
   * que a mensagem já teve dono.
   */
  async aoReceberMensagem(chatId: string, texto: string): Promise<boolean> {
    const { data: parados } = await this.db
      .from('crm_flow_runs')
      .select('id, client_id, flow_id, chat_id, current_block_id, waiting_block_id, variables, reperguntas')
      .eq('chat_id', chatId)
      .eq('status', 'aguardando')
      .order('created_at', { ascending: false })
      .limit(1)

    const run = (parados ?? [])[0] as Execucao | undefined
    if (!run?.waiting_block_id) return false

    const desenho = await this.carregarDesenho(run.flow_id)
    if (!desenho) return false

    const bloco = desenho.nodes.find((n) => n.id === run.waiting_block_id)
    if (!bloco) return false

    const { porta, variavel, valor } = this.casarResposta(bloco, texto)
    const destino = this.destinoDe(desenho, bloco.id, porta)

    const variables = { ...(run.variables ?? {}) }
    // `valor`, e NÃO `texto`. A mesma regra da bolha vale para a variável: o que
    // fica guardado é o que a pessoa APERTOU. Guardando o texto cru, um toque em
    // botão salvava o id, e a mensagem seguinte saía escrita "Você escolheu
    // o_uburi88i" na cara do cliente.
    if (variavel) variables[variavel] = valor

    // A resposta não casou com opção nenhuma e o desenho não tem saída de
    // 'fallback' ligada — que é o caso de quase todo fluxo desenhado na tela.
    //
    // O QUE ACONTECIA AQUI: o motor encerrava a execução. Uma palavra fora do
    // menu e o atendimento morria calado, sem uma linha explicando ao cliente.
    // Ele mandava "bom dia" antes de escolher e perdia o fluxo inteiro.
    //
    // Agora o menu volta, com um recado antes. Depois de MAX_REPERGUNTAS o
    // motor para de insistir: repetir sem fim é o padrão que derruba número não
    // oficial, e na terceira vez o problema não é a resposta do cliente.
    if (!destino && porta === 'fallback') {
      // A PALAVRA-CHAVE GANHA DE "não entendi".
      //
      // Este é o ponto onde a automação parecia ignorar a configuração: com uma
      // execução parada num menu, TODA mensagem da conversa era lida como
      // resposta àquele menu. Quem escrevia a palavra-chave recebia "não
      // consegui entender sua resposta" e o mesmo menu de volta — a regra estava
      // certa, o fluxo estava ativo, e nada disparava, porque a mensagem nunca
      // chegava a ser avaliada como gatilho.
      //
      // A ordem certa não é uma coisa antes da outra, é uma DEPOIS da outra: as
      // opções do menu continuam ganhando, sempre, senão um rótulo que por acaso
      // contenha a palavra-chave sequestraria a escolha da pessoa. Só quando
      // nada no menu casa é que vale perguntar se ela mudou de assunto.
      const { data: c } = await this.db
        .from('crm_chats')
        .select('connection_id, bot_paused')
        .eq('id', run.chat_id)
        .maybeSingle()

      if (c?.connection_id && !c.bot_paused) {
        const outroFluxo = await this.regraQueBate(run.client_id, c.connection_id, texto)
        if (outroFluxo) {
          // Encerra esta execução para a de lá poder nascer: há um índice único
          // por conversa e fluxo, e sem isto o disparo seria recusado calado —
          // exatamente o sintoma que se está consertando.
          await this.db
            .from('crm_flow_runs')
            .update({
              status: 'cancelado',
              status_detail: 'A pessoa escreveu uma palavra-chave e foi levada para o fluxo dela.',
              waiting_block_id: null,
              waiting_since: null,
              expires_at: null,
            })
            .eq('id', run.id)
          this.log.info(
            { run: run.id, deFluxo: run.flow_id, paraFluxo: outroFluxo },
            'palavra-chave no meio de um menu: trocando de fluxo',
          )
          // `false` = não consumida. Quem chamou segue para o gatilho, que agora
          // acha a regra e começa o fluxo certo.
          return false
        }
      }

      const jaVoltou = run.reperguntas ?? 0
      if (jaVoltou < MAX_REPERGUNTAS) {
        const repetiu = await this.repetirMenu(run, bloco, variables, jaVoltou)
        // Se não deu pra repetir (conversa sem conexão, por exemplo), cai no
        // encerramento lá embaixo em vez de ficar esperando pra sempre.
        if (repetiu) return true
      } else {
        // Esgotou a paciência: se o desenho tem saída de timeout, é por ela que
        // se sai — é onde o desenhista pôs "falar com atendente".
        const saida = this.destinoDe(desenho, bloco.id, 'timeout')
        if (saida) {
          await this.db
            .from('crm_flow_runs')
            .update({
              status: 'executando',
              current_block_id: saida,
              waiting_block_id: null,
              waiting_since: null,
              expires_at: null,
              reperguntas: 0,
              variables,
            })
            .eq('id', run.id)
          await this.rodar({ ...run, current_block_id: saida, waiting_block_id: null, reperguntas: 0, variables }).catch(
            (e) => this.log.error({ err: e, run: run.id }, 'execução de fluxo falhou ao desistir do menu'),
          )
          return true
        }
      }
    }

    if (!destino) {
      // Saída sem ligação: o desenho acaba aqui. Encerrar é honesto — deixar
      // 'aguardando' faria o fluxo comer todas as respostas seguintes do
      // cliente numa execução que não anda mais, e nenhum gatilho novo
      // conseguiria começar nesta conversa.
      await this.encerrar(run.id, 'concluido', `A saída "${porta}" não leva a nenhum bloco.`)
      return true
    }

    await this.db
      .from('crm_flow_runs')
      .update({
        status: 'executando',
        current_block_id: destino,
        waiting_block_id: null,
        waiting_since: null,
        expires_at: null,
        // Zera: o contador é de teimosia SEGUIDA, não de erros na conversa
        // toda. Quem errou uma vez e acertou merece as duas chances de novo no
        // próximo menu.
        reperguntas: 0,
        variables,
      })
      .eq('id', run.id)

    await this.rodar({ ...run, current_block_id: destino, waiting_block_id: null, variables }).catch((e) =>
      this.log.error({ err: e, run: run.id }, 'execução de fluxo falhou depois da resposta'),
    )
    return true
  }

  /**
   * Manda o recado e o menu de novo, sem sair do bloco.
   *
   * Devolve `false` quando não deu pra mandar — aí quem chamou decide o que
   * fazer, em vez de deixar a execução parada esperando uma resposta a uma
   * pergunta que ninguém recebeu.
   *
   * O prazo de espera é REARMADO junto. Sem isso, o cliente que errasse perto
   * do fim do prazo veria o menu voltar e, segundos depois, a conversa sair
   * pelo timeout — punido por ter respondido.
   */
  private async repetirMenu(
    run: Execucao,
    bloco: BlocoDoFluxo,
    variables: Record<string, string>,
    jaVoltou: number,
  ): Promise<boolean> {
    const carregada = await this.carregarConversa(run.chat_id)
    if (!carregada?.sessao || !carregada.phone) return false
    const conversa: ConversaDoFluxo = { ...carregada, clientId: run.client_id }

    try {
      const id = await this.texto(conversa, RECADO_DA_REPERGUNTA)
      await this.registrar(conversa, id, RECADO_DA_REPERGUNTA)
      await dormir(PAUSA_PADRAO_MS)
      await this.enviarMenu(bloco, conversa, variables)
    } catch (e) {
      this.log.error({ err: e, run: run.id }, 'não deu pra repetir o menu')
      return false
    }

    await this.db
      .from('crm_flow_runs')
      .update({
        reperguntas: jaVoltou + 1,
        waiting_since: new Date().toISOString(),
        expires_at: bloco.data.waitForever ? null : this.calcularExpiracao(bloco.data),
        variables,
      })
      .eq('id', run.id)

    this.log.info({ run: run.id, bloco: bloco.id, vez: jaVoltou + 1 }, 'menu repetido: a resposta não casou')
    return true
  }

  // ─── Entrada 3: quem esperou demais ───────────────────────────────────────

  /**
   * Alguém tocou num botão de um menu que já acabou.
   *
   * O botão do WhatsApp NÃO EXPIRA na tela do cliente: ele fica tocável no
   * histórico da conversa pra sempre. Do nosso lado a execução pode ter
   * encerrado — por prazo, por o fluxo ter chegado ao fim, ou por alguém ter
   * cancelado. Quando isso acontece, o toque chega e não casa com nada.
   *
   * O QUE ACONTECIA: nada. Silêncio absoluto. A pessoa via a escolha dela sair
   * na conversa e não recebia resposta nenhuma — indistinguível, do lado dela,
   * de ter sido ignorada por quem atende. Foi a reclamação que trouxe este
   * método: "clico no botão e não funciona mais".
   *
   * Não reabrimos o fluxo sozinhos: recomeçar um atendimento que já terminou é
   * decisão de quem desenhou, não nossa. O que se deve é dizer que chegou.
   */
  async avisarBotaoVencido(chatId: string): Promise<void> {
    const carregada = await this.carregarConversa(chatId)
    if (!carregada?.sessao || !carregada.phone) return

    const { data: chat } = await this.db.from('crm_chats').select('client_id').eq('id', chatId).maybeSingle()
    if (!chat?.client_id) return

    const conversa: ConversaDoFluxo = { ...carregada, clientId: chat.client_id }
    const aviso = 'Recebemos sua escolha, mas esse menu já foi encerrado. Escreva sua dúvida que a gente continua daqui. 🙂'
    try {
      const id = await this.zap.enviarTexto(conversa.sessao, conversa.phone, aviso)
      await this.registrar(conversa, id, aviso)
    } catch (e) {
      this.log.warn({ err: e, chatId }, 'não deu pra avisar que o menu tinha encerrado')
    }
  }

  /**
   * Acorda quem dormiu e continua de onde parou.
   *
   * Diferente de `processarExpirados`: lá o prazo VENCEU e a saída é a de
   * timeout — o cliente não respondeu. Aqui o prazo CHEGOU, que era o
   * combinado, e a saída é a normal do bloco.
   */
  async processarDormentes(): Promise<void> {
    const { data: acordando } = await this.db
      .from('crm_flow_runs')
      .select('id, client_id, flow_id, chat_id, current_block_id, waiting_block_id, variables, reperguntas')
      .eq('status', 'dormindo')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .limit(20)

    for (const run of (acordando ?? []) as Execucao[]) {
      const desenho = await this.carregarDesenho(run.flow_id)
      const destino = desenho && run.current_block_id ? this.destinoDe(desenho, run.current_block_id, 'default') : null

      if (!destino) {
        await this.encerrar(run.id, 'concluido', 'A espera terminou e o bloco não leva a lugar nenhum.')
        continue
      }

      // Só sai de 'dormindo' quem AINDA estava dormindo. Duas pontes rodando
      // o mesmo batimento pegariam a mesma execução e a rodariam em dobro —
      // duas vezes cada mensagem, no celular do cliente.
      const { data: tomou } = await this.db
        .from('crm_flow_runs')
        .update({ status: 'executando', current_block_id: destino, expires_at: null })
        .eq('id', run.id)
        .eq('status', 'dormindo')
        .select('id')
        .maybeSingle()
      if (!tomou) continue

      await this.rodar({ ...run, current_block_id: destino }).catch((e) =>
        this.log.error({ err: e, run: run.id }, 'execução de fluxo falhou ao acordar'),
      )
    }
  }

  /** Segue pela saída de timeout de quem passou do prazo. */
  async processarExpirados(): Promise<void> {
    const { data: vencidos } = await this.db
      .from('crm_flow_runs')
      .select('id, client_id, flow_id, chat_id, current_block_id, waiting_block_id, variables')
      .eq('status', 'aguardando')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .limit(20)

    for (const run of (vencidos ?? []) as Execucao[]) {
      const desenho = await this.carregarDesenho(run.flow_id)
      const destino = desenho && run.waiting_block_id ? this.destinoDe(desenho, run.waiting_block_id, 'timeout') : null

      if (!destino) {
        await this.encerrar(run.id, 'concluido', 'O cliente não respondeu no prazo e não há saída de timeout.')
        continue
      }
      await this.db
        .from('crm_flow_runs')
        .update({ status: 'executando', current_block_id: destino, waiting_block_id: null, expires_at: null })
        .eq('id', run.id)
      await this.rodar({ ...run, current_block_id: destino, waiting_block_id: null }).catch((e) =>
        this.log.error({ err: e, run: run.id }, 'execução de fluxo falhou no timeout'),
      )
    }
  }

  // ─── O laço ───────────────────────────────────────────────────────────────

  private async rodar(run: Execucao): Promise<void> {
    if (this.emAndamento.has(run.id)) return
    this.emAndamento.add(run.id)
    try {
      const desenho = await this.carregarDesenho(run.flow_id)
      if (!desenho) return this.encerrar(run.id, 'falhou', 'O fluxo não tem desenho gravado.')

      const carregada = await this.carregarConversa(run.chat_id)
      if (!carregada) return this.encerrar(run.id, 'falhou', 'A conversa não existe mais.')
      const conversa: ConversaDoFluxo = { ...carregada, clientId: run.client_id }
      if (!conversa.sessao || !conversa.phone) {
        return this.encerrar(run.id, 'falhou', 'Esta conversa não tem conexão de WhatsApp conectada.')
      }

      let atual = run.current_block_id ?? this.primeiroBloco(desenho)
      if (!atual) return this.encerrar(run.id, 'concluido', 'O fluxo não tem bloco de Início ligado a nada.')

      // OS DADOS DO CONTATO ENTRAM COMO VARIÁVEIS, SEMPRE.
      //
      // A tela oferece `{full_name}`, `{first_name}` e `{phone_number}` num
      // botão do editor de mensagem, e elas nunca existiram aqui: o motor só
      // tinha o que o próprio fluxo guardou. Toda mensagem escrita com o nome
      // do cliente saía com o nome VAZIO.
      //
      // As do fluxo vêm por último, e ganham: uma variável que o fluxo gravou
      // é mais específica que o cadastro, e alguém pode querer chamar a sua
      // de "full_name".
      const variables = { ...(await this.contextoDoContato(conversa, {})), ...(run.variables ?? {}) }
      await this.db.from('crm_flow_runs').update({ status: 'executando' }).eq('id', run.id)

      for (let passo = 0; passo < MAX_BLOCOS_POR_RODADA; passo++) {
        const bloco = desenho.nodes.find((n) => n.id === atual)
        if (!bloco) return this.encerrar(run.id, 'falhou', 'O desenho mudou no meio da execução.')

        await this.db
          .from('crm_flow_runs')
          .update({ current_block_id: bloco.id, last_step_at: new Date().toISOString(), variables })
          .eq('id', run.id)

        const resultado = await this.executarBloco(bloco, run, conversa, variables)

        if (resultado.tipo === 'espera') {
          await this.db
            .from('crm_flow_runs')
            .update({
              status: 'aguardando',
              waiting_block_id: bloco.id,
              waiting_since: new Date().toISOString(),
              expires_at: resultado.expiraEm,
              variables,
            })
            .eq('id', run.id)
          return
        }
        if (resultado.tipo === 'dorme') {
          // `waiting_block_id` fica NULO de propósito: ninguém está sendo
          // esperado. O que a acorda é `processarDormentes`, e ela continua
          // pela saída normal deste bloco — não pela de timeout.
          await this.db
            .from('crm_flow_runs')
            .update({
              status: 'dormindo',
              current_block_id: bloco.id,
              waiting_block_id: null,
              waiting_since: null,
              expires_at: resultado.acordarEm,
              variables,
            })
            .eq('id', run.id)
          this.log.info({ run: run.id, bloco: bloco.title, ate: resultado.acordarEm }, 'fluxo dormindo até a hora')
          return
        }

        if (resultado.tipo === 'fim') return this.encerrar(run.id, 'concluido', resultado.motivo)

        const destino = this.destinoDe(desenho, bloco.id, resultado.porta)
        if (!destino) {
          return this.encerrar(run.id, 'concluido', `"${bloco.title}" não está ligado a nenhum bloco seguinte.`)
        }
        atual = destino
      }

      await this.encerrar(run.id, 'falhou', 'O fluxo passou do limite de blocos — provavelmente há um ciclo.')
    } finally {
      this.emAndamento.delete(run.id)
    }
  }

  // ─── O que cada bloco faz ─────────────────────────────────────────────────

  private async executarBloco(
    bloco: BlocoDoFluxo,
    run: Execucao,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<
    | { tipo: 'segue'; porta: string }
    // Espera UMA PESSOA responder. Mensagem que chega é a resposta.
    | { tipo: 'espera'; expiraEm: string | null }
    // Espera O RELÓGIO. Mensagem que chega no meio NÃO é resposta a nada, e o
    // fluxo continua de onde parou quando a hora chegar. Ver a migração 0040.
    | { tipo: 'dorme'; acordarEm: string }
    | { tipo: 'fim'; motivo: string }
  > {
    const d = bloco.data

    switch (bloco.kind) {
      case 'inicio':
        return { tipo: 'segue', porta: 'default' }

      case 'mensagem':
      case 'template':
        await this.enviarConteudos(bloco, conversa, variables)
        return { tipo: 'segue', porta: 'default' }

      case 'menu': {
        // Mídia solta sai antes; o texto do menu vai DENTRO da mensagem com
        // botões. Mandar por fora faria o cliente ler a mesma pergunta duas
        // vezes — uma no balão e outra em cima dos botões.
        if ((d.items ?? []).length > 0) await this.enviarConteudos(bloco, conversa, variables)
        await this.enviarMenu(bloco, conversa, variables)
        return { tipo: 'espera', expiraEm: this.calcularExpiracao(d) }
      }

      case 'carrossel': {
        await this.enviarCarrossel(bloco, conversa, variables)
        // Um cartão com botão de resposta espera a escolha; só de link, não há
        // o que esperar, e parar aqui prenderia a conversa pra sempre.
        const esperaEscolha = (d.cards ?? []).some((c) => (c.buttons ?? []).some((b) => b.kind === 'resposta'))
        return esperaEscolha ? { tipo: 'espera', expiraEm: this.calcularExpiracao(d) } : { tipo: 'segue', porta: 'default' }
      }

      case 'pix': {
        await this.enviarPix(bloco, conversa, variables)
        return { tipo: 'segue', porta: 'default' }
      }

      case 'aguarda':
        await this.enviarConteudos(bloco, conversa, variables)
        // O prazo é `waitValue`/`waitUnit`, e não `expireValue` — este bloco
        // tem o campo próprio dele ("Tempo máximo aguardando a resposta"). O
        // motor lia o do menu, então "aguarde 15 dias" virava o padrão geral e
        // a saída de timeout disparava muito antes do combinado.
        return {
          tipo: 'espera',
          expiraEm: d.waitForever
            ? null
            : this.calcularExpiracao({ expireValue: d.waitValue, expireUnit: d.waitUnit }),
        }

      case 'intervalo': {
        // O QUE ACONTECIA AQUI: nada. Ele lia `delaySeconds`, que a tela nunca
        // gravou — ela grava `intervalValue`/`intervalUnit`, `scheduleDate` ou
        // `scheduleHours`. Um fluxo com "aguarde 1 hora antes de cobrar"
        // cobrava no mesmo segundo, e nada em lugar nenhum dava erro.
        const acordarEm = this.quandoAcordar(d)
        if (!acordarEm) return { tipo: 'segue', porta: 'default' }

        const faltaMs = acordarEm.getTime() - Date.now()
        if (faltaMs <= 0) return { tipo: 'segue', porta: 'default' }

        // Pausa curta acontece aqui mesmo: dormir alguns segundos dentro do
        // laço é mais simples e mais exato que ir ao banco e voltar.
        if (faltaMs <= PAUSA_NO_LACO_MS) {
          await dormir(faltaMs)
          return { tipo: 'segue', porta: 'default' }
        }

        // Pausa longa NÃO pode segurar a ponte: ela é uma só pra todos os
        // clientes, e um "aguarde 2 dias" pararia o atendimento de todo mundo.
        // A execução vai dormir no banco e o relógio acorda ela.
        return { tipo: 'dorme', acordarEm: acordarEm.toISOString() }
      }

      case 'etiqueta': {
        const novas = d.tags ?? []
        if (novas.length > 0) {
          const { data: chat } = await this.db.from('crm_chats').select('tags').eq('id', conversa.chatId).maybeSingle()
          const atuais: string[] = chat?.tags ?? []
          const juntas = Array.from(new Set([...atuais, ...novas]))
          await this.db.from('crm_chats').update({ tags: juntas }).eq('id', conversa.chatId)
        }
        return { tipo: 'segue', porta: 'default' }
      }

      case 'departamento':
        if (d.departmentId) await this.db.from('crm_chats').update({ department_id: d.departmentId }).eq('id', conversa.chatId)
        return { tipo: 'segue', porta: 'default' }

      case 'atribuir':
        // Lia `assignedTo`/`assignedName`; a tela grava `assigneeEmail`. O
        // bloco gravava dois nulos e marcava "atendendo" sem dono — a conversa
        // saía da fila e não ficava com ninguém.
        if (d.assigneeEmail) await this.atribuir(bloco, conversa, d.assigneeEmail)
        return { tipo: 'segue', porta: 'default' }

      case 'condicional': {
        const condicoes = d.conditions ?? []
        // Sem condição nenhuma, a resposta é SIM: o bloco não tem por que
        // barrar ninguém, e mandar pro 'nao' faria um bloco recém-criado
        // desviar o fluxo inteiro sem que ninguém tivesse pedido.
        if (condicoes.length === 0) return { tipo: 'segue', porta: 'sim' }

        const contexto = await this.contextoDoContato(conversa, variables)
        const testar = (c: { variable: string; operator: string; value: string }) =>
          avaliar(this.valorDaCondicao(c.variable, contexto), c.operator, trocarVariaveis(c.value ?? '', contexto))

        // O 'ou' da tela era ignorado: o motor usava `.every()` sempre. Quem
        // escolhia "qualquer condição" via o fluxo exigir todas — e o desvio
        // ficava mudo, porque um condicional que dá 'nao' não é erro nenhum.
        const passou = d.matchAll === false ? condicoes.some(testar) : condicoes.every(testar)
        return { tipo: 'segue', porta: passou ? 'sim' : 'nao' }
      }

      case 'manipulador': {
        const nome = (d.varName ?? '').trim()
        if (!nome) return { tipo: 'segue', porta: 'default' }

        const atual = variables[nome] ?? ''
        const pedido = trocarVariaveis(d.varValue ?? '', variables)
        const numero = (t: string) => Number(String(t).replace(',', '.')) || 0

        switch (d.varOperation ?? 'definir') {
          case 'somar':
            variables[nome] = String(numero(atual) + numero(pedido))
            break
          case 'subtrair':
            variables[nome] = String(numero(atual) - numero(pedido))
            break
          case 'incrementar':
            variables[nome] = String(numero(atual) + 1)
            break
          case 'limpar':
            delete variables[nome]
            break
          default:
            variables[nome] = pedido
        }
        // Grava já: o laço só persiste as variáveis no bloco seguinte, e uma
        // queda no meio perderia a conta que o bloco acabou de fazer.
        await this.db.from('crm_flow_runs').update({ variables }).eq('id', run.id)
        return { tipo: 'segue', porta: 'default' }
      }

      case 'controle': {
        const patch: Record<string, unknown> = {}
        const acao = d.chatAction
        if (acao === 'resolver') patch.status = 'resolvido'
        else if (acao === 'reabrir') patch.status = 'aguardando'
        else if (acao === 'pausar_bot') patch.bot_paused = true
        else if (acao === 'retomar_bot') patch.bot_paused = false
        else if (d.chatState) patch.status = d.chatState

        if (Object.keys(patch).length > 0) {
          const { error } = await this.db.from('crm_chats').update(patch).eq('id', conversa.chatId)
          if (error) this.log.warn({ err: error, acao }, 'controlador de chat não conseguiu gravar')
          // Resolver aqui é a mesma coisa que resolver pelo painel, então tem
          // que acionar o mesmo fluxo de atendimento concluído. Sem isto, quem
          // fecha a conversa pelo bot não recebe a pesquisa de satisfação e
          // quem fecha pela tela recebe — a mesma configuração valendo em um
          // caminho e não no outro.
          if (patch.status === 'resolvido') {
            await this.gatilhoDeConversa(
              run.client_id,
              conversa.chatId,
              conversa.connectionId,
              'atendimento_finalizado',
              // O fluxo que está rodando agora não pode se acionar de volta:
              // um fluxo cujo último bloco resolve a conversa entraria em laço.
              run.flow_id,
            )
          }
        }
        return { tipo: 'segue', porta: 'default' }
      }

      case 'kanban': {
        await this.moverNoKanban(bloco, conversa)
        return { tipo: 'segue', porta: 'default' }
      }

      case 'notificacao': {
        await this.notificar(bloco, conversa, variables)
        return { tipo: 'segue', porta: 'default' }
      }

      case 'distribuidor': {
        const porta = await this.proximaSaidaDoRodizio(bloco, conversa, run)
        if (!porta) return { tipo: 'fim', motivo: 'Distribuidor sem saídas configuradas.' }
        return { tipo: 'segue', porta }
      }

      case 'integracao': {
        const deuCerto = await this.chamarApi(bloco, conversa, variables, run)
        return { tipo: 'segue', porta: deuCerto ? 'default' : 'falha' }
      }

      case 'ia': {
        const resposta = await this.rodarIa(bloco, conversa, variables, run)
        // A IA não serve só pra responder: ela CLASSIFICA, e cada
        // classificação é uma saída desenhada no fluxo ("é comprovante", "é
        // dúvida", "quer cancelar"). Mandar tudo pela saída única desperdiça
        // metade do bloco.
        if (resposta === null) return { tipo: 'segue', porta: 'falha' }
        return { tipo: 'segue', porta: this.portaDaIa(bloco, resposta) }
      }

      case 'pixel': {
        await this.dispararPixel(bloco, conversa, variables)
        return { tipo: 'segue', porta: 'default' }
      }

      case 'venda': {
        await this.registrarVenda(bloco, conversa, variables)
        return { tipo: 'segue', porta: 'default' }
      }

      case 'conexao': {
        if (!d.targetFlowId) return { tipo: 'fim', motivo: 'Conexão de Fluxo sem destino escolhido.' }
        await this.iniciar(run.client_id, d.targetFlowId, conversa.chatId, 'fluxo')
        return { tipo: 'fim', motivo: 'Seguiu para outro fluxo.' }
      }

      case 'kieai': {
        const deuCerto = await this.gerarComKie(bloco, conversa, variables, run)
        return { tipo: 'segue', porta: deuCerto ? 'default' : 'falha' }
      }

      case 'pagamento': {
        // O gateway ainda não está ligado, e este é o único bloco em que
        // fingir custaria DINHEIRO de verdade: o fluxo mandaria uma cobrança
        // que não existe, e o cliente pagaria — ou tentaria — no vazio.
        //
        // Sair pela porta 'falha' é o comportamento certo: é lá que o
        // desenhista pôs "avise que deu problema no pagamento".
        this.log.warn(
          { bloco: bloco.title, gateway: d.gateway },
          'bloco Pagamento: nenhum gateway está conectado — saindo pela porta de falha',
        )
        await this.anotarPendencia(run, `O bloco "${bloco.title}" precisa de um gateway de pagamento conectado.`)
        return { tipo: 'segue', porta: 'falha' }
      }

      default:
        // Bloco que este motor ainda não executa. Seguir em frente é melhor
        // que parar a conversa no meio — mas o log sozinho não bastava: ele
        // fica na ponte, e quem desenhou o fluxo nunca o lê. A anotação vai
        // pra execução, que é onde a pessoa procura quando algo não aconteceu.
        this.log.warn({ tipo: bloco.kind, bloco: bloco.title }, 'bloco de fluxo ainda não executado pelo motor')
        await this.anotarPendencia(run, `O bloco "${bloco.title}" (${bloco.kind}) ainda não é executado pelo motor.`)
        await this.enviarConteudos(bloco, conversa, variables)
        return { tipo: 'segue', porta: 'default' }
    }
  }

  // ─── Envio ────────────────────────────────────────────────────────────────

  /**
   * Põe na conversa do CRM o que o fluxo acabou de mandar.
   *
   * O `external_id` é o id do WhatsApp. Ele é a chave que o índice único usa
   * pra recusar a linha repetida — então, se um dia o motor voltar a ecoar o
   * próprio envio, a mensagem continua aparecendo uma vez só.
   *
   * Falhar aqui não pode derrubar o fluxo: a mensagem JÁ SAIU pro cliente, e
   * abortar deixaria a conversa parada por um problema de registro.
   */
  private async registrar(
    conversa: ConversaDoFluxo,
    externalId: string | null,
    corpo: string,
    extra?: { botoes?: Botao[]; mediaKind?: string },
  ): Promise<void> {
    try {
      const agora = new Date().toISOString()
      await this.db.from('crm_messages').insert({
        client_id: conversa.clientId,
        chat_id: conversa.chatId,
        direction: 'saida',
        body: corpo,
        external_id: externalId,
        status: 'enviada',
        sent_at: agora,
        ...(extra?.botoes?.length ? { buttons: extra.botoes } : {}),
        ...(extra?.mediaKind ? { media_kind: extra.mediaKind } : {}),
      })

      // A lista de conversas ordena por esta coluna. Sem atualizar, um fluxo
      // que fala sozinho deixaria a conversa afundada como se estivesse parada.
      await this.db
        .from('crm_chats')
        .update({ last_message_at: agora, last_message_preview: (corpo.split('\n')[0] ?? '').slice(0, 120) })
        .eq('id', conversa.chatId)
    } catch (e) {
      this.log.error({ err: e, chat: conversa.chatId }, 'não deu pra gravar a mensagem que o fluxo mandou')
    }
  }

  private async enviarConteudos(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    const itens = bloco.data.items ?? []
    const soltos = itens.length === 0 && bloco.data.text ? [{ kind: 'texto', text: bloco.data.text }] : itens

    for (const [i, item] of soltos.entries()) {
      if (item.kind === 'intervalo') {
        await dormir(Math.min(30_000, Math.max(0, (item.delaySeconds ?? 0) * 1000)))
        continue
      }

      // O tempo escolhido no cartão vira presença DE VERDADE no celular do
      // cliente: "digitando…" antes de um texto, "gravando áudio…" antes de uma
      // nota de voz. Sem tempo configurado, uma pausa curta entre uma mensagem e
      // a seguinte — três balões no mesmo instante denunciam o robô.
      const espera = Math.max(0, (item.delaySeconds ?? 0) * 1000)
      const comoEsperar: Presenca = item.kind === 'audio' ? 'recording' : 'composing'
      if (espera > 0) await this.pausar(conversa, espera, comoEsperar)
      else if (i > 0) await dormir(PAUSA_PADRAO_MS)

      const texto = trocarVariaveis(item.text ?? '', variables)

      if (item.kind === 'texto') {
        if (texto.trim()) {
          const id = await this.texto(conversa, texto)
          await this.registrar(conversa, id, texto)
        }
        continue
      }

      if (item.mediaUrl) {
        const kind =
          item.kind === 'imagem' || item.kind === 'sticker'
            ? 'imagem'
            : item.kind === 'video'
              ? 'video'
              : item.kind === 'audio'
                ? 'audio'
                : 'documento'
        const id = await this
          .midia(conversa, item.mediaUrl, kind, texto, item.fileName)
          .catch((e) => {
            this.log.error({ err: e, bloco: bloco.title }, 'falha ao enviar mídia do fluxo')
            return null
          })
        await this.registrar(conversa, id, texto, { mediaKind: kind })
      } else if (texto.trim()) {
        // Conteúdo de mídia sem arquivo escolhido: manda pelo menos a legenda,
        // em vez de o cliente receber um silêncio no meio da conversa.
        const id = await this.texto(conversa, texto)
        await this.registrar(conversa, id, texto)
      }
    }
  }

  /**
   * O menu. HOJE SAI TEXTO NUMERADO, e não porque alguém preferiu.
   *
   * Botão e lista mandados por este motor NÃO CHEGAM. Testado com as três
   * formas lado a lado, para o mesmo número de terceiro: o texto chegou, o
   * botão não, a lista não. O provedor antigo responde 201 com id de mensagem nos três
   * casos — a perda é silenciosa. É a Meta descartando mensagem interativa de
   * remetente não oficial; o nosso payload está certo e sai em
   * /api/sendButtons, com `quick_reply` e sem `sections`, o que cada envio
   * registra no log.
   *
   * Um menu que não chega é pior que um menu feio: o fluxo fica parado pra
   * sempre esperando resposta a uma pergunta que ninguém viu.
   *
   * QUEM ESCOLHE O FORMATO É A CONTAGEM, não uma caixinha no editor — e isso
   * volta a valer no dia em que o interativo passar, seja pela Cloud API
   * oficial, seja se a Meta afrouxar. `WHATSAPP_MENU_INTERATIVO=true` religa a
   * cascata inteira:
   *   até 3 opções     botões de resposta rápida, o que o cliente reconhece
   *   acima disso      lista, que abre num painel e cabe todas
   *   nenhum dos dois  texto numerado
   *
   * As tentativas são em cascata de verdade. Antes era `if/else if`: se o
   * botão falhasse, o código pulava a lista e ia direto pro texto, jogando
   * fora o formato que provavelmente funcionaria.
   */
  private async enviarMenu(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    const d = bloco.data
    const corpo = trocarVariaveis(d.text ?? '', variables)
    const rodape = trocarVariaveis(d.footer ?? '', variables)
    const opcoes = (d.options ?? []).map((o) => ({
      ...o,
      label: trocarVariaveis(o.label, variables),
      value: o.value ? trocarVariaveis(o.value, variables) : o.value,
    }))
    if (opcoes.length === 0) {
      if (corpo.trim()) {
        const id = await this.texto(conversa, corpo)
        await this.registrar(conversa, id, corpo)
      }
      return
    }

    const respostas = opcoes.filter(ehResposta)
    // Link, ligação e código copiável ocupam lugar de botão igual aos outros:
    // o teto de três é da mensagem, não das respostas.
    const acoes = opcoes.filter((o) => !ehResposta(o))

    // Quem desenhou o fluxo escolheu o formato na tela. Vazio = os menus
    // feitos antes dessa escolha existir, e pra eles a regra antiga continua
    // valendo: até três opções, botões.
    //
    // A escolha "lista" com duas opções não é engano — a lista mostra
    // DESCRIÇÃO embaixo de cada linha, e o botão não tem onde pôr isso.
    const pediuLista = d.menuFormat === 'lista'

    // ── 1. Botões ──
    if (!pediuLista && (await this.interativoVale(conversa)) && opcoes.length <= MAX_BOTOES) {
      const botoes = opcoes.map(paraBotao)
      const r = await this.botoes(conversa, {
        corpo: corpo || ' ',
        rodape,
        imagemUrl: d.imageUrl ? trocarVariaveis(d.imageUrl, variables) : undefined,
        botoes,
      })
      if (r.entregue) {
        await this.registrar(conversa, r.id, corpo, { botoes })
        return
      }
    }

    // ── 2. Lista ──
    if ((await this.interativoVale(conversa)) && respostas.length > 0) {
      // A lista só tem linhas: não existe linha que abre link ou disca. Sem
      // isto o link simplesmente sumia da mensagem — a opção estava desenhada
      // no fluxo e o cliente nunca a via.
      const corpoComAcoes = [corpo, ...acoes.filter((o) => o.value?.trim()).map((o) => `${o.label}: ${o.value}`)]
        .filter((p) => p.trim())
        .join('\n\n')

      const r = await this.lista(conversa, {
        corpo: corpoComAcoes || 'Escolha uma opção',
        textoDoBotao: trocarVariaveis(d.buttonLabel || 'Ver opções', variables),
        rodape,
        linhas: respostas.map((o) => ({
          rowId: o.id,
          title: o.label,
          ...(o.description ? { description: trocarVariaveis(o.description, variables) } : {}),
        })),
      })
      if (r.entregue) {
        // A lista não é botão, mas o atendente precisa ver as opções ofertadas.
        await this.registrar(conversa, r.id, corpoComAcoes, { botoes: respostas.map(paraBotao) })
        return
      }
    }

    // ── 3. Enquete ──
    // Pela conexão de QR Code é a única forma tocável que CHEGA. Não é o botão
    // da conta oficial — desenha com bolinhas de seleção —, mas a opção fica
    // exposta e se responde com um toque.
    if (!(await this.canais.cloudDe(conversa.sessao)) && this.enquete && respostas.length > 1) {
      // A pergunta da enquete é curta (255) e o texto do menu costuma não ser.
      // Então o texto vai numa mensagem à parte, e a enquete leva só a pergunta
      // — cortar o texto do meio faria o cliente escolher sem ler o aviso.
      //
      // As ações (link, ligação, código) também vão no texto: uma opção de
      // enquete não abre nada, e virar linha votável seria prometer um clique
      // que não acontece.
      const antes = [corpo, ...acoes.filter((o) => o.value?.trim()).map((o) => `${o.label}: ${o.value}`)]
        .filter((p) => p.trim())
        .join('\n\n')

      const pergunta = trocarVariaveis(d.buttonLabel || '', variables).trim() || 'Toque na sua escolha:'
      const cabeNaPergunta = !acoes.length && corpo.trim().length > 0 && corpo.trim().length <= LIMITE_DA_PERGUNTA

      if (!cabeNaPergunta && antes) {
        const idTexto = await this.texto(conversa, antes)
        await this.registrar(conversa, idTexto, antes)
        await dormir(PAUSA_PADRAO_MS)
      }

      const r = await this.zap.enviarEnquete(
        conversa.sessao,
        conversa.phone,
        cabeNaPergunta ? corpo.trim() : pergunta,
        respostas.map((o) => o.label),
      )
      if (r.entregue) {
        await this.registrar(conversa, r.id, cabeNaPergunta ? corpo : pergunta, {
          botoes: respostas.map(paraBotao),
        })
        return
      }
    }

    // ── 4. Texto numerado ──
    const numerado = this.montarMenu(corpo, opcoes)
    const id = await this.texto(conversa, numerado)
    await this.registrar(conversa, id, numerado)
  }

  /**
   * O menu como TEXTO numerado — a rede de segurança.
   *
   * Só as opções de resposta ganham número: numerar um link faria o cliente
   * digitar "2" esperando abrir o site, e o fluxo entenderia como escolha.
   * Link e telefone viram linha própria, com o endereço à mostra.
   */
  private montarMenu(corpo: string, opcoes: OpcaoDeMenu[]): string {
    const respostas = opcoes.filter(ehResposta)
    const partes: string[] = []
    if (corpo.trim()) partes.push(corpo.trim())
    if (respostas.length > 0) {
      partes.push(respostas.map((o, i) => `*${i + 1}* - ${o.label}`).join('\n'))
    }

    const acoes = opcoes
      .filter((o) => !ehResposta(o) && o.value?.trim())
      .map((o) => (o.kind === 'copiar' ? `${o.label}: ${o.value}` : `${o.label}: ${o.value}`))
    if (acoes.length > 0) partes.push(acoes.join('\n'))

    // A dica diz "ou o nome" porque agora é verdade: o `entender.ts` aceita o
    // rótulo, um pedaço dele e até com erro de digitação. Prometer só o número
    // faria a pessoa achar que escrever o nome não vale.
    if (respostas.length > 0) partes.push('_Responda com o número ou o nome da opção._')
    return partes.join('\n\n')
  }

  /**
   * O carrossel, cartão por cartão.
   *
   * O provedor antigo não tem rota de carrossel: o que existe é mensagem com imagem e
   * botões. Um cartão por mensagem é a tradução honesta — o cliente vê a mesma
   * coisa, rolando em vez de deslizando.
   */
  private async enviarCarrossel(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    for (const [i, cartao] of (bloco.data.cards ?? []).entries()) {
      if (i > 0) await dormir(PAUSA_PADRAO_MS)

      const texto = trocarVariaveis(cartao.text ?? '', variables)
      const imagem = cartao.imageUrl ? trocarVariaveis(cartao.imageUrl, variables) : ''
      const botoes = (cartao.buttons ?? [])
        .filter((b) => b.label.trim())
        .map((b) => paraBotao({ id: b.id, label: trocarVariaveis(b.label, variables), kind: b.kind, value: b.value ? trocarVariaveis(b.value, variables) : undefined }))

      if (botoes.length > 0) {
        const r = await this.botoes(conversa, {
          corpo: texto || ' ',
          imagemUrl: imagem || undefined,
          botoes,
        })
        if (r.entregue) {
          await this.registrar(conversa, r.id, texto, { botoes })
          continue
        }
      }

      // Sem botão: a imagem com a legenda ainda conta a mesma história.
      if (imagem) {
        const id = await this.zap
          .enviarMidiaPorUrl(conversa.sessao, conversa.phone, imagem, 'imagem', texto)
          .catch((e) => {
            this.log.error({ err: e, bloco: bloco.title }, 'falha ao enviar cartão do carrossel')
            return null
          })
        await this.registrar(conversa, id, texto, { mediaKind: 'imagem' })
      } else if (texto.trim()) {
        const id = await this.texto(conversa, texto)
        await this.registrar(conversa, id, texto)
      }
    }
  }

  /**
   * O PIX como botão de copiar.
   *
   * É exatamente pra isto que serve o botão `copy` do WhatsApp: um toque põe a
   * chave na área de transferência. Mandar a chave como texto obriga o cliente
   * a selecionar sem sobrar nem faltar caractere — e chave errada é dinheiro
   * que não chega.
   */
  private async enviarPix(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    const d = bloco.data
    const chave = trocarVariaveis(d.pixKey ?? '', variables).trim()
    if (!chave) {
      this.log.warn({ bloco: bloco.title }, 'bloco PIX sem chave — nada foi enviado')
      return
    }

    const recebedor = trocarVariaveis(d.pixRecipient ?? '', variables).trim()
    const valor = trocarVariaveis(d.amount ?? '', variables).trim()
    const linhas = [trocarVariaveis(d.text ?? '', variables).trim() || 'Pague com PIX:']
    if (valor) linhas.push(`Valor: R$ ${valor}`)
    if (recebedor) linhas.push(`Recebedor: ${recebedor}`)

    const corpo = linhas.join('\n')
    const botoes: Botao[] = [{ type: 'copy', text: 'COPIAR CHAVE PIX', copyCode: chave }]

    const r = await this.botoes(conversa, { corpo, botoes })
    if (r.entregue) {
      // GRAVAR AQUI NÃO É DETALHE. Este bloco mandava a cobrança e não a punha
      // na conversa: quem atende abria o chat e não via a cobrança que o
      // cliente tinha acabado de receber. A linha até aparecia depois, pelo eco
      // do próprio envio — atrasada, sem o botão de copiar registrado, e às
      // vezes com o texto cortado. Todo outro envio do motor grava; este era o
      // único que não gravava.
      await this.registrar(conversa, r.id, corpo, { botoes })
      return
    }

    // Sem botão, a chave vai sozinha numa mensagem — assim o cliente segura pra
    // copiar sem arrastar junto o texto ao redor.
    const idTexto = await this.texto(conversa, corpo)
    await this.registrar(conversa, idTexto, corpo)
    const idChave = await this.texto(conversa, chave)
    await this.registrar(conversa, idChave, chave)
  }

  // ─── As peças dos blocos ──────────────────────────────────────────────────

  /**
   * Entrega a conversa a alguém da equipe.
   *
   * `crm_chats.assigned_to` é UUID e aponta pra `auth.users`. A tela do fluxo
   * guarda o E-MAIL de quem atende, porque é isso que ela lista. Gravar o
   * e-mail direto ali não dá um erro visível: o Postgres recusa o texto como
   * uuid, a resposta traz o erro, e o código antigo não olhava — a conversa
   * ficava exatamente como estava.
   *
   * Quem faz a ponte entre os dois é `workspace_members.profile_id`. Quando ele
   * é nulo, a pessoa foi convidada e ainda não entrou no sistema: aí dá pra
   * escrever o NOME dela na conversa, mas não amarrar a um usuário que não
   * existe. É melhor que nada — a conversa aparece com dono na tela, e quem
   * abrir sabe de quem é.
   */
  private async atribuir(bloco: BlocoDoFluxo, conversa: ConversaDoFluxo, email: string): Promise<void> {
    const { data: membro } = await this.db
      .from('workspace_members')
      .select('profile_id, display_name')
      .eq('client_id', conversa.clientId)
      .eq('email', email)
      .maybeSingle()

    if (!membro) {
      this.log.warn({ bloco: bloco.title, email }, 'Atribuir: essa pessoa não está na equipe deste cliente')
      return
    }

    const { error } = await this.db
      .from('crm_chats')
      .update({
        // Só amarra ao usuário quando ele existe de verdade.
        ...(membro.profile_id ? { assigned_to: membro.profile_id } : {}),
        assigned_name: membro.display_name || email,
        // Atribuir é assumir: a conversa sai da fila de espera.
        status: 'atendendo',
      })
      .eq('id', conversa.chatId)

    if (error) this.log.warn({ err: error, bloco: bloco.title, email }, 'Atribuir não conseguiu gravar')
    else if (!membro.profile_id) {
      this.log.info({ email }, 'Atribuir: pessoa convidada e ainda sem conta — gravei só o nome')
    }
  }

  /**
   * As variáveis do fluxo MAIS os campos do contato.
   *
   * O condicional só enxergava `variables` — o que o próprio fluxo guardou.
   * Perguntar "o nome contém Silva" ou "tem a etiqueta VIP" era impossível,
   * embora seja o uso mais óbvio de um condicional num CRM.
   */
  private async contextoDoContato(
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<Record<string, string>> {
    const { data: chat } = await this.db
      .from('crm_chats')
      .select('contact_name, phone, status, tags, department_id, assigned_to, unread_count, contact_id')
      .eq('id', conversa.chatId)
      .maybeSingle()

    // AS VARIÁVEIS GLOBAIS.
    //
    // A tela promete que elas "podem ser usadas em todos os seus fluxos". Elas
    // não chegavam aqui: escrever {{nome_da_empresa}} numa mensagem saía com um
    // buraco no lugar. Vêm primeiro de propósito — são o fundo do contexto, e
    // qualquer coisa mais específica pode passar por cima.
    const { data: globais } = await this.db
      .from('crm_global_variables')
      .select('key, value')
      .eq('client_id', conversa.clientId)

    const doCliente: Record<string, string> = {}
    for (const g of globais ?? []) doCliente[g.key as string] = String(g.value ?? '')

    // OS CAMPOS PERSONALIZADOS.
    //
    // Moram em dois lugares diferentes, e é de propósito: o do CONTATO vale
    // para a pessoa (`crm_contacts.custom_fields`, um jsonb); o da CONVERSA vale
    // para aquele atendimento (`crm_chat_field_values`, uma linha por campo,
    // com o nome vindo de `crm_custom_fields`). O da conversa ganha, porque é o
    // mais específico dos dois.
    const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v))
    const personalizados: Record<string, string> = {}

    if (chat?.contact_id) {
      const { data: contato } = await this.db
        .from('crm_contacts')
        .select('custom_fields')
        .eq('id', chat.contact_id)
        .maybeSingle()
      for (const [k, v] of Object.entries((contato?.custom_fields ?? {}) as Record<string, unknown>)) {
        personalizados[k] = texto(v)
      }
    }

    const { data: daConversa } = await this.db
      .from('crm_chat_field_values')
      .select('value, crm_custom_fields (key)')
      .eq('chat_id', conversa.chatId)

    for (const linha of daConversa ?? []) {
      const chave = (linha as { crm_custom_fields?: { key?: string } }).crm_custom_fields?.key
      if (chave) personalizados[chave] = texto((linha as { value?: unknown }).value)
    }

    return {
      ...doCliente,
      ...personalizados,
      // As do fluxo vêm por último: o que o fluxo guardou é mais específico
      // que o cadastro, e uma variável de menu deve poder chamar-se "status".
      full_name: chat?.contact_name ?? '',
      first_name: (chat?.contact_name ?? '').split(' ')[0] ?? '',
      phone_number: chat?.phone ?? '',
      chat_status: chat?.status ?? '',
      chat_tags: (chat?.tags ?? []).join(', '),
      chat_assigned: chat?.assigned_to ? 'sim' : '',
      chat_unread: String(chat?.unread_count ?? 0),
      // O que o cliente mandou por último: texto, imagem, áudio, vídeo ou
      // documento. É o que permite ao fluxo desviar quando chega um áudio.
      'response.type': await this.tipoDaUltimaResposta(conversa.chatId),
      // `hora`, `data` e `dia` apareciam na lista de campos do BOT e o motor
      // não sabia resolvê-los: a mensagem "bom dia, são {{hora}}" saía com um
      // buraco. No RELÓGIO DO CLIENTE, não no do servidor — a ponte roda em
      // UTC, e mandar "são 21:00" às 18:00 é pior que não mandar hora nenhuma.
      ...(await this.agoraDoCliente(conversa.clientId)),
      ...variables,
    }
  }

  /** O tipo da última mensagem RECEBIDA nesta conversa. */
  private async tipoDaUltimaResposta(chatId: string): Promise<string> {
    const { data } = await this.db
      .from('crm_messages')
      .select('media_kind')
      .eq('chat_id', chatId)
      .eq('direction', 'entrada')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data?.media_kind as string) || 'texto'
  }

  /** `hora`, `data` e `dia` no fuso configurado pelo cliente. */
  private async agoraDoCliente(clientId: string): Promise<Record<string, string>> {
    const fuso = await this.fusoDoCliente(clientId)
    const agora = new Date()
    const peca = (opcoes: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, ...opcoes }).format(agora)
    return {
      hora: peca({ hour: '2-digit', minute: '2-digit', hour12: false }),
      data: peca({ day: '2-digit', month: '2-digit' }),
      dia: peca({ weekday: 'long' }),
    }
  }

  private async fusoDoCliente(clientId: string): Promise<string> {
    const { data } = await this.db.from('crm_settings').select('timezone').eq('client_id', clientId).maybeSingle()
    return data?.timezone || 'America/Sao_Paulo'
  }

  /** O valor a comparar. Aceita `{nome}` ou `nome`, porque as duas se digitam. */
  private valorDaCondicao(campo: string, contexto: Record<string, string>): string {
    const limpo = (campo ?? '').trim().replace(/^\{+|\}+$/g, '')
    return contexto[limpo] ?? ''
  }

  /**
   * Põe o contato no quadro, ou move o cartão que ele já tem.
   *
   * O chat guarda `kanban_card_id`: sem isso, cada passagem pelo bloco criaria
   * um cartão novo e o quadro encheria de repetições do mesmo cliente.
   */
  private async moverNoKanban(bloco: BlocoDoFluxo, conversa: ConversaDoFluxo): Promise<void> {
    const d = bloco.data
    if (!d.kanbanId || !d.kanbanColumnId) {
      this.log.warn({ bloco: bloco.title }, 'bloco Kanban sem quadro ou coluna escolhidos')
      return
    }

    const { data: chat } = await this.db
      .from('crm_chats')
      .select('kanban_card_id, contact_name, contact_id')
      .eq('id', conversa.chatId)
      .maybeSingle()

    if (chat?.kanban_card_id && d.kanbanAction !== 'adicionar') {
      const { error } = await this.db
        .from('crm_kanban_cards')
        .update({ kanban_id: d.kanbanId, column_id: d.kanbanColumnId, updated_at: new Date().toISOString() })
        .eq('id', chat.kanban_card_id)
      if (error) this.log.warn({ err: error }, 'não deu pra mover o cartão no Kanban')
      return
    }

    const { data: cartao, error } = await this.db
      .from('crm_kanban_cards')
      .insert({
        client_id: conversa.clientId,
        kanban_id: d.kanbanId,
        column_id: d.kanbanColumnId,
        title: chat?.contact_name || conversa.phone,
        contact_id: chat?.contact_id ?? null,
      })
      .select('id')
      .single()

    if (error || !cartao) {
      this.log.warn({ err: error }, 'não deu pra criar o cartão no Kanban')
      return
    }
    await this.db.from('crm_chats').update({ kanban_card_id: cartao.id }).eq('id', conversa.chatId)
  }

  /**
   * Avisa alguém por WhatsApp que esta conversa chegou a este ponto.
   *
   * Vai pelo MESMO número do cliente: é o único que esta conexão tem. Quem
   * recebe é o time, não o cliente — por isso o texto leva o telefone de quem
   * disparou, senão o aviso chega sem dizer de quem se trata.
   */
  private async notificar(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    const d = bloco.data
    if (d.channel && d.channel !== 'whatsapp') {
      // Painel e e-mail ainda não existem. Dizer isso no log é melhor que
      // fingir que enviou — e o bloco não derruba o fluxo por causa disso.
      this.log.warn({ canal: d.channel, bloco: bloco.title }, 'notificação por este canal ainda não é enviada')
      return
    }

    const destino = soDigitos(`${d.notifyCountry ?? ''}${d.notifyPhone ?? ''}`)
    if (!destino) {
      this.log.warn({ bloco: bloco.title }, 'bloco Notificação sem telefone de destino')
      return
    }

    const corpo = trocarVariaveis(d.text ?? '', variables).trim() || 'Novo atendimento no CRM.'
    const texto = `${corpo}\n\nContato: ${variables.full_name || conversa.phone}\nWhatsApp: ${conversa.phone}`
    try {
      await this.zap.enviarTexto(conversa.sessao, destino, texto)
    } catch (e) {
      // A notificação é interna: falhar nela não pode parar o atendimento do
      // cliente, que é o que realmente importa nesta conversa.
      this.log.warn({ err: e, destino }, 'não deu pra enviar a notificação')
    }
  }

  /**
   * De quem é a vez no rodízio.
   *
   * "Prevenir repetição" manda mais que a fila: um cliente que já falou com
   * alguém volta pra mesma pessoa. Sem isso, quem retorna cai num atendente
   * que não sabe nada da conversa anterior — e o cliente reconta tudo.
   */
  private async proximaSaidaDoRodizio(bloco: BlocoDoFluxo, conversa: ConversaDoFluxo, run: Execucao): Promise<string | null> {
    const saidas = bloco.data.saidas ?? []
    if (saidas.length === 0) return null

    const chave = { flow_id: run.flow_id, block_id: bloco.id }

    if (bloco.data.preventRepeat !== false) {
      const { data: antes } = await this.db
        .from('crm_flow_rodizio')
        .select('saida_id')
        .match({ ...chave, chat_id: conversa.chatId })
        .maybeSingle()
      // Só vale se a saída ainda existe: o desenho pode ter mudado desde
      // então, e mandar pra uma saída apagada travaria o fluxo.
      if (antes && saidas.some((s) => s.id === antes.saida_id)) return antes.saida_id
    }

    // `.is('chat_id', null)` E NÃO `.match({ chat_id: null })`.
    //
    // O `match` monta `chat_id=eq.null`, e em SQL nada é igual a NULL — a
    // consulta voltava vazia SEMPRE. O rodízio lia "não há vez anterior" a cada
    // passagem e escolhia eternamente a primeira saída: um distribuidor que
    // manda tudo pro mesmo atendente, com cara de estar dividindo.
    const { data: vez } = await this.db
      .from('crm_flow_rodizio')
      .select('id, saida_id')
      .match(chave)
      .is('chat_id', null)
      .maybeSingle()

    const anterior = saidas.findIndex((s) => s.id === vez?.saida_id)
    const escolhida = saidas[(anterior + 1) % saidas.length]!.id
    const agora = new Date().toISOString()

    // Ler-e-gravar em vez de `upsert`: os índices únicos desta tabela são
    // PARCIAIS (um exige chat_id nulo, o outro exige não-nulo), e o `ON
    // CONFLICT (colunas)` do upsert não enxerga índice parcial — ele erraria,
    // ou pior, inseriria uma linha nova a cada passagem.
    if (vez) {
      await this.db.from('crm_flow_rodizio').update({ saida_id: escolhida, updated_at: agora }).eq('id', vez.id)
    } else {
      await this.db
        .from('crm_flow_rodizio')
        .insert({ client_id: conversa.clientId, ...chave, chat_id: null, saida_id: escolhida, updated_at: agora })
    }

    const { data: doChat } = await this.db
      .from('crm_flow_rodizio')
      .select('id')
      .match({ ...chave, chat_id: conversa.chatId })
      .maybeSingle()

    if (doChat) {
      await this.db.from('crm_flow_rodizio').update({ saida_id: escolhida, updated_at: agora }).eq('id', doChat.id)
    } else {
      await this.db
        .from('crm_flow_rodizio')
        .insert({ client_id: conversa.clientId, ...chave, chat_id: conversa.chatId, saida_id: escolhida, updated_at: agora })
    }

    return escolhida
  }

  /**
   * Chama uma API externa e guarda pedaços da resposta em variáveis.
   *
   * Devolve `false` pra sair pela porta 'falha' — que é onde o desenhista põe
   * "avise que deu problema". Uma integração que falha em silêncio faz o fluxo
   * seguir com a variável vazia e mandar "Seu pedido  está " pro cliente.
   */
  private async chamarApi(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
    run: Execucao,
  ): Promise<boolean> {
    const d = bloco.data
    const url = trocarVariaveis(d.url ?? '', variables).trim()
    if (!url || !/^https?:\/\//i.test(url)) {
      this.log.warn({ bloco: bloco.title }, 'bloco Integração sem URL válida')
      return false
    }

    let cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }
    if (d.headers?.trim()) {
      try {
        cabecalhos = { ...cabecalhos, ...(JSON.parse(trocarVariaveis(d.headers, variables)) as Record<string, string>) }
      } catch {
        // Cabeçalho mal escrito não derruba a chamada: ela vai com o padrão, e
        // o log diz o que foi ignorado.
        this.log.warn({ bloco: bloco.title }, 'cabeçalhos da Integração não são JSON válido — ignorados')
      }
    }

    const metodo = (d.httpMethod ?? 'GET').toUpperCase()
    try {
      const r = await fetch(url, {
        method: metodo,
        headers: cabecalhos,
        body: metodo === 'GET' || metodo === 'DELETE' ? undefined : trocarVariaveis(d.body ?? '', variables) || undefined,
        signal: AbortSignal.timeout(20_000),
      })

      const texto = await r.text()
      let corpo: unknown = texto
      try {
        corpo = JSON.parse(texto)
      } catch {
        /* resposta não é JSON: o texto cru ainda serve pra guardar */
      }

      for (const [nome, caminho] of Object.entries(d.responseMap ?? {})) {
        if (!nome) continue
        variables[nome] = String(caminhoNoObjeto(corpo, caminho) ?? '')
      }

      // `response.erro` aparece na lista de campos do BOT e ninguém o
      // preenchia. Quem desenha o fluxo põe "deu erro: {response.erro}" na
      // saída de falha e recebia a frase com um buraco — sem jeito nenhum de
      // descobrir o que a API respondeu sem abrir o log da ponte.
      variables['response.erro'] = r.ok ? '' : (texto.slice(0, 300) || `A API respondeu ${r.status}.`)
      await this.db.from('crm_flow_runs').update({ variables }).eq('id', run.id)

      if (!r.ok) {
        this.log.warn({ bloco: bloco.title, status: r.status }, 'a API respondeu com erro')
        return false
      }
      return true
    } catch (e) {
      variables['response.erro'] = (e as Error).message || 'A chamada não completou.'
      await this.db.from('crm_flow_runs').update({ variables }).eq('id', run.id)
      this.log.warn({ err: e, bloco: bloco.title, url }, 'a chamada da Integração não completou')
      return false
    }
  }

  /**
   * O bloco de IA: pergunta ao modelo e guarda — ou manda — a resposta.
   *
   * A chave NÃO vive no desenho do fluxo quando `aiAuth` é 'global': ela fica
   * em Variáveis Globais, uma vez por cliente. Copiar a chave em cada bloco
   * seria espalhá-la por todos os fluxos exportáveis do CRM.
   */
  private async rodarIa(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
    run: Execucao,
  ): Promise<string | null> {
    const d = bloco.data
    const chave = await this.chaveDaIa(conversa.clientId, d)
    if (!chave) {
      this.log.warn({ bloco: bloco.title }, 'bloco de IA sem chave configurada')
      await this.anotarPendencia(run, `O bloco "${bloco.title}" precisa da chave da IA.`)
      return null
    }

    const instrucao = trocarVariaveis(d.aiPrompt ?? '', variables).trim()
    const pergunta = trocarVariaveis(d.aiUserMessage ?? '', variables).trim() || variables.ultima_mensagem || ''
    if (!instrucao && !pergunta) {
      this.log.warn({ bloco: bloco.title }, 'bloco de IA sem instrução nem pergunta')
      return null
    }

    try {
      const resposta =
        d.aiProvider === 'gemini'
          ? await perguntarAoGemini(chave, d.aiModel ?? 'gemini-2.0-flash', instrucao, pergunta)
          : await perguntarAoGpt(chave, d.aiModel ?? 'gpt-4o-mini', instrucao, pergunta)

      if (!resposta) return null

      if (d.aiSaveTo?.trim()) {
        variables[d.aiSaveTo.trim()] = resposta
        await this.db.from('crm_flow_runs').update({ variables }).eq('id', run.id)
      }

      // Responder ao cliente é opcional: muitos blocos de IA só CLASSIFICAM, e
      // mandar a classificação pro cliente seria mostrar a régua interna.
      if (d.aiAutoReply) {
        const id = await this.texto(conversa, resposta)
        await this.registrar(conversa, id, resposta)
      }
      return resposta
    } catch (e) {
      this.log.warn({ err: e, bloco: bloco.title }, 'o bloco de IA não completou')
      return null
    }
  }

  /**
   * Por qual saída o bloco de IA continua, lendo a resposta dela.
   *
   * As saídas são as `aiConditions` desenhadas na tela — "é comprovante", "quer
   * cancelar". A IA responde com o RÓTULO de uma delas, porque é isso que a
   * instrução manda ela fazer. Casa sem acento e sem caixa: modelo devolve
   * "É comprovante." tanto quanto "e comprovante".
   *
   * Não achou nenhuma? Sai por 'default' — que na tela é o "fallback (padrão)".
   * Chutar a primeira condição seria pior que não classificar: o fluxo seguiria
   * por um caminho que ninguém escolheu.
   */
  private portaDaIa(bloco: BlocoDoFluxo, resposta: string): string {
    const condicoes = bloco.data.aiConditions ?? []
    if (condicoes.length === 0) return 'default'

    const limpo = (t: string) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

    const dita = limpo(resposta)
    // Rótulo inteiro dentro da resposta, do mais longo pro mais curto: com
    // "cancelar" e "cancelar assinatura" na mesma lista, o mais específico
    // precisa ganhar — senão toda menção a cancelamento cai no genérico.
    const porTamanho = [...condicoes].sort((a, b) => (b.label ?? '').length - (a.label ?? '').length)
    for (const c of porTamanho) {
      const rotulo = limpo(c.label ?? '')
      if (rotulo && dita.includes(rotulo)) return c.id
    }
    return 'default'
  }

  /**
   * O segredo de uma integração conectada deste cliente.
   *
   * Mora em `crm_integration_secrets`, tabela com RLS ligada e SEM política:
   * nem o dono do workspace a lê pelo navegador. A ponte usa a service_role, e
   * é por isso que a chave pode sair daqui e não da tela.
   */
  private async segredoDaIntegracao(clientId: string, provider: string): Promise<string | null> {
    const { data: integracao } = await this.db
      .from('crm_integrations')
      .select('id')
      .eq('client_id', clientId)
      .eq('provider', provider)
      .neq('status', 'desativado')
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (!integracao) return null

    const { data } = await this.db
      .from('crm_integration_secrets')
      .select('secret')
      .eq('integration_id', integracao.id)
      .maybeSingle()
    return data?.secret?.trim() || null
  }

  /**
   * A chave da IA: digitada no bloco, guardada em Variáveis Globais, ou — o
   * caminho novo — cadastrada uma vez em Integrações → Inteligência Artificial.
   *
   * A ordem importa: o que está escrito no bloco ganha, porque foi a escolha
   * mais específica que alguém fez. A integração é o fundo, pra que ligar a
   * conta da OpenAI uma vez faça todos os blocos de IA passarem a funcionar.
   */
  private async chaveDaIa(clientId: string, d: BlocoDoFluxo['data']): Promise<string | null> {
    const daIntegracao = () => this.segredoDaIntegracao(clientId, d.aiProvider === 'gemini' ? 'gemini' : 'openai')

    if (d.aiAuth !== 'global') return d.aiApiKey?.trim() || (await daIntegracao())
    const nome = (d.aiApiKey ?? '').trim().replace(/^\{+|\}+$/g, '')
    if (!nome) return daIntegracao()
    // `key`, e não `name`. A coluna `name` NUNCA existiu nesta tabela: a
    // consulta dava erro, o erro era descartado com o `data` nulo, e "usar a
    // chave global" no bloco de IA achava vazio sempre. Quem configurava
    // assim via o bloco falhar sem uma linha dizendo por quê.
    const { data } = await this.db
      .from('crm_global_variables')
      .select('value')
      .eq('client_id', clientId)
      .eq('key', nome)
      .maybeSingle()
    return data?.value?.trim() || (await daIntegracao())
  }

  /**
   * Manda o evento pro Facebook pela Conversions API.
   *
   * O telefone vai com hash, como a Meta exige — mandar cru seria vazar o
   * número dos clientes pra dentro do Ads sem necessidade nenhuma.
   */
  private async dispararPixel(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    const d = bloco.data
    if (!d.pixelId) {
      this.log.warn({ bloco: bloco.title }, 'bloco Pixel sem o ID do pixel')
      return
    }

    const { data: integracao } = await this.db
      .from('crm_integrations')
      .select('config')
      .eq('client_id', conversa.clientId)
      .eq('provider', 'facebook')
      .maybeSingle()

    const token = (integracao?.config as { accessToken?: string } | null)?.accessToken
    if (!token) {
      this.log.warn({ bloco: bloco.title }, 'bloco Pixel sem token do Facebook — conecte em Integrações')
      return
    }

    const valor = Number(String(trocarVariaveis(d.amount ?? '', variables)).replace(',', '.')) || undefined
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${d.pixelId}/events?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              event_name: d.pixelEvent ?? 'Lead',
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'business_messaging',
              user_data: { ph: [sha256(soDigitos(conversa.phone))] },
              ...(valor ? { custom_data: { value: valor, currency: d.currency ?? 'BRL' } } : {}),
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!r.ok) this.log.warn({ status: r.status, bloco: bloco.title }, 'o Facebook recusou o evento do Pixel')
    } catch (e) {
      this.log.warn({ err: e, bloco: bloco.title }, 'não deu pra mandar o evento do Pixel')
    }
  }

  /**
   * Deixa escrito na execução o que o motor não conseguiu fazer.
   *
   * O log da ponte não serve pra isso: ele fica no servidor, e quem desenhou o
   * fluxo nunca vai lê-lo. A pessoa olha a execução na tela quando algo não
   * aconteceu — é ali que a explicação tem que estar.
   */
  private async anotarPendencia(run: Execucao, recado: string): Promise<void> {
    await this.db
      .from('crm_flow_runs')
      .update({ status_detail: recado })
      .eq('id', run.id)
      .then(undefined, () => undefined)
  }

  /**
   * Gera mídia no Kie.ai e manda pro cliente.
   *
   * O Kie.ai trabalha por FILA: o pedido volta com um id e o arquivo fica
   * pronto depois. Esperar aqui dentro seria segurar a ponte — que é uma só
   * pra todos os clientes — por minutos. Então o bloco pede, guarda o id na
   * variável escolhida, e quem quiser o arquivo consulta depois.
   */
  private async gerarComKie(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
    run: Execucao,
  ): Promise<boolean> {
    const d = bloco.data
    const chave = (d.kieApiKey ?? '').trim()
    if (!chave) {
      this.log.warn({ bloco: bloco.title }, 'bloco Kie.ai sem chave')
      await this.anotarPendencia(run, `O bloco "${bloco.title}" precisa da chave do Kie.ai.`)
      return false
    }

    const prompt = trocarVariaveis(d.text ?? d.aiPrompt ?? '', variables).trim()
    if (!prompt) {
      await this.anotarPendencia(run, `O bloco "${bloco.title}" está sem o texto do que gerar.`)
      return false
    }

    try {
      const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
        body: JSON.stringify({ model: d.kieModel || 'default', input: { prompt } }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!r.ok) {
        this.log.warn({ status: r.status, bloco: bloco.title }, 'o Kie.ai recusou o pedido')
        return false
      }
      const corpo = (await r.json()) as { data?: { taskId?: string } }
      const tarefa = corpo.data?.taskId
      if (d.kieSaveTo?.trim() && tarefa) {
        variables[d.kieSaveTo.trim()] = tarefa
        await this.db.from('crm_flow_runs').update({ variables }).eq('id', run.id)
      }
      return true
    } catch (e) {
      this.log.warn({ err: e, bloco: bloco.title }, 'a chamada do Kie.ai não completou')
      return false
    }
  }

  /** Registra a venda no CRM. É o que faz o painel de Vendas ter número. */
  private async registrarVenda(
    bloco: BlocoDoFluxo,
    conversa: ConversaDoFluxo,
    variables: Record<string, string>,
  ): Promise<void> {
    const d = bloco.data
    const bruto = trocarVariaveis(d.saleAmountTemplate ?? d.amount ?? '', variables)
    const valor = Number(String(bruto).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0

    const cliente = trocarVariaveis(d.saleCustomerTemplate ?? '', variables) || variables.full_name || null
    const moeda = trocarVariaveis(d.saleCurrencyTemplate ?? d.currency ?? 'BRL', variables) || 'BRL'

    const { data: venda, error } = await this.db
      .from('crm_sales')
      .insert({
        client_id: conversa.clientId,
        chat_id: conversa.chatId,
        product_id: d.productId ?? null,
        customer_name: cliente,
        amount: valor,
        status: 'aprovada',
        source: 'fluxo',
      })
      .select('id')
      .single()
    if (error) {
      this.log.warn({ err: error, bloco: bloco.title }, 'não deu pra registrar a venda')
      return
    }

    // A UTMify, quando estiver conectada. Sem `await` no resultado: a venda já
    // está registrada e é isso que não pode se perder — um rastreador fora do
    // ar não pode segurar a conversa do cliente esperando resposta dele.
    void this.mandarPraUtmify(conversa, venda.id, { cliente, valor, moeda, telefone: variables.phone_number })
  }

  /**
   * Avisa a UTMify de uma venda aprovada.
   *
   * É o que a tela de Integrações promete quando diz "vendas aprovadas serão
   * enviadas automaticamente". Sem isto a credencial ficava guardada e nunca
   * era usada — o cliente ligava a integração e não via pedido nenhum chegar.
   */
  private async mandarPraUtmify(
    conversa: ConversaDoFluxo,
    vendaId: string,
    venda: { cliente: string | null; valor: number; moeda: string; telefone?: string },
  ): Promise<void> {
    const token = await this.segredoDaIntegracao(conversa.clientId, 'utmify')
    if (!token) return

    // A UTMify trabalha em CENTAVOS. Mandar em reais multiplicaria o
    // faturamento do painel por cem, em silêncio.
    const centavos = Math.round(venda.valor * 100)
    const agora = new Date().toISOString().slice(0, 19).replace('T', ' ')

    try {
      const r = await fetch('https://api.utmify.com.br/api-credentials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': token },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          orderId: vendaId,
          platform: 'CRM',
          paymentMethod: 'pix',
          status: 'paid',
          createdAt: agora,
          approvedDate: agora,
          refundedAt: null,
          customer: {
            name: venda.cliente ?? 'Cliente',
            email: null,
            phone: venda.telefone ?? null,
            document: null,
          },
          products: [
            { id: vendaId, name: venda.cliente ?? 'Venda', planId: null, planName: null, quantity: 1, priceInCents: centavos },
          ],
          trackingParameters: { src: null, sck: null, utm_source: null, utm_campaign: null, utm_medium: null, utm_content: null, utm_term: null },
          commission: { totalPriceInCents: centavos, gatewayFeeInCents: 0, userCommissionInCents: centavos, currency: venda.moeda },
          isTest: false,
        }),
      })
      if (!r.ok) {
        const corpo = await r.text().catch(() => '')
        this.log.warn({ status: r.status, corpo: corpo.slice(0, 200) }, 'a UTMify recusou a venda')
      }
    } catch (e) {
      this.log.warn({ err: e }, 'não deu pra avisar a UTMify da venda')
    }
  }

  // ─── Casar a resposta com uma saída ───────────────────────────────────────

  /** Qual saída a resposta do cliente escolheu, e o que guardar dela. */
  private casarResposta(
    bloco: BlocoDoFluxo,
    texto: string,
  ): { porta: string; variavel: string | null; valor: string } {
    if (bloco.kind === 'aguarda') {
      // Lia `variableName`; a tela grava `saveToVariable` — o mesmo campo que
      // o menu usa. O bloco "Aguarda Resposta" tem uma linha escrita "Campo
      // para salvar a informação no usuário", e o que a pessoa respondia não
      // era guardado em lugar nenhum. Quem preenchesse esse campo e usasse a
      // variável depois veria a mensagem sair com um buraco.
      // Aqui o que vale É o texto cru: ninguém tocou em opção nenhuma, a pessoa
      // escreveu, e o que ela escreveu é a resposta.
      return { porta: 'default', variavel: bloco.data.saveToVariable || null, valor: texto }
    }

    // Só as opções de resposta entram: link e telefone não voltam pro fluxo, e
    // contá-los desalinharia a numeração que o cliente viu.
    const opcoes = (bloco.data.options ?? []).filter(ehResposta)

    // Quem entende a resposta é o `entender.ts`, e ele aceita muito mais do que
    // o rótulo exato: número solto, número por extenso, "opção 2", o começo do
    // rótulo, uma palavra dele, e o rótulo com erro de digitação.
    //
    // POR QUE ISTO NÃO É ENFEITE. O menu sai como botão hoje — a uazapi
    // entrega —, mas nem todo mundo toca: gente responde "1.", "quero o
    // mensal", "a segunda". E quando o menu passa de três opções ele vira
    // lista, cuja escolha volta como TEXTO. Com casamento exato, tudo isso
    // virava "não entendi" e a pessoa via o mesmo menu de novo sem ter errado.
    //
    // O rótulo CORTADO entra como variante do inteiro: o voto numa enquete
    // volta com o texto que coube na tela, que passou pelo corte de 100 letras.
    // A enquete é o único formato sem id de volta.
    const achou = acharOpcao(texto, opcoes, (o) => [o.label, cortarTitulo(o.label, LIMITE_DA_OPCAO)])
    if (achou) {
      // `como` conta por qual etapa a resposta passou. É o que diz se a
      // tolerância está ajudando ou chutando, sem precisar adivinhar depois.
      this.log.debug({ bloco: bloco.id, como: achou.como }, 'resposta casou com uma opção')
      // O menu tem "Campo para salvar a resposta do usuário" na tela, e ele
      // era ignorado aqui: quem preenchia e usava a variável depois via a
      // mensagem sair com um buraco no lugar dela.
      // O RÓTULO DA OPÇÃO QUE CASOU, e não o que chegou na mão. Chega um id
      // quando a pessoa toca no botão, e chega "1" ou "a segunda" quando ela
      // digita: nos três casos o que ela escolheu se chama a mesma coisa, e é
      // esse nome que a variável guarda.
      const escolhida = opcoes.find((o) => o.id === achou.id)
      return {
        porta: achou.id,
        variavel: bloco.data.saveToVariable || null,
        valor: escolhida?.label?.trim() || texto,
      }
    }

    return { porta: 'fallback', variavel: null, valor: texto }
  }

  // ─── Começar um fluxo ─────────────────────────────────────────────────────

  /** Cria a execução. O índice único impede duas vivas na mesma conversa. */
  async iniciar(clientId: string, flowId: string, chatId: string, gatilho: string): Promise<boolean> {
    const { error } = await this.db.from('crm_flow_runs').insert({
      client_id: clientId,
      flow_id: flowId,
      chat_id: chatId,
      trigger_kind: gatilho,
      status: 'pendente',
    })
    // 23505 = já existe uma execução viva deste fluxo nesta conversa.
    if (error && error.code !== '23505') {
      this.log.error({ err: error, flowId, chatId }, 'não deu pra criar a execução do fluxo')
      return false
    }
    return !error
  }

  /**
   * O fluxo que deve começar por causa desta mensagem, se houver.
   *
   * Só olha fluxos ATIVOS. Um fluxo pausado que ainda dispara é a forma mais
   * rápida de o cliente receber mensagem que ninguém queria mandar.
   */
  async gatilhoPorMensagem(clientId: string, chatId: string, texto: string, primeira: boolean): Promise<boolean> {
    // O ROBÔ ESTÁ PAUSADO NESTA CONVERSA?
    //
    // O bloco Controlador de Chat tem "pausar bot" justamente pra entregar a
    // conversa a uma pessoa. Sem conferir aqui, a próxima mensagem do cliente
    // acionaria um fluxo por palavra-chave POR CIMA do atendente humano, no
    // meio da conversa dele — e quem está do outro lado veria o robô
    // interrompendo a pessoa que estava atendendo.
    const { data: chat } = await this.db
      .from('crm_chats')
      .select('bot_paused, connection_id, resposta_padrao_em, last_message_at')
      .eq('id', chatId)
      .maybeSingle()
    if (chat?.bot_paused) return false

    const limpo = texto.trim().toLowerCase()

    // ── 0. a empresa está fechada? ───────────────────────────────────────
    //
    // Antes de qualquer automação: quem escreve às 3h da manhã precisa ouvir
    // que ninguém vai responder agora. Deixar a palavra-chave rodar mandaria a
    // pessoa para um fluxo de venda com "fale com um atendente" no fim, e não
    // haveria atendente nenhum do outro lado.
    if (chat?.connection_id) {
      const fechado = await this.avisarForaDoExpediente(clientId, chat.connection_id, chatId)
      if (fechado) return true
    }

    // ── 1. as regras DA CONEXÃO vêm primeiro ─────────────────────────────
    //
    // Palavra-chave tem prioridade sobre qualquer disparo automático: quem
    // escreveu "quero o plano trimestral" disse o que quer, e mandar boas
    // vindas por cima disso seria ignorar a pessoa.
    if (chat?.connection_id) {
      const disparou = await this.regrasDaConexao(clientId, chat.connection_id, chatId, limpo)
      if (disparou) return true
    }

    // ── 2. os gatilhos que moram no próprio fluxo ────────────────────────
    //
    // Continuam valendo: são os fluxos configurados antes de o disparo virar
    // da conexão, e desligá-los calaria automação que está no ar hoje.
    const { data: fluxos } = await this.db
      .from('crm_flows')
      .select('id, trigger_kind, trigger_value')
      .eq('client_id', clientId)
      .eq('status', 'ativo')
      .in('trigger_kind', ['palavra_chave', 'primeira_mensagem'])

    for (const f of fluxos ?? []) {
      if (f.trigger_kind === 'primeira_mensagem' && primeira) {
        return this.iniciar(clientId, f.id, chatId, 'primeira_mensagem')
      }
      if (f.trigger_kind === 'palavra_chave') {
        const chaves = String(f.trigger_value ?? '')
          .split(',')
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean)
        if (chaves.some((k) => limpo === k || limpo.includes(k))) {
          return this.iniciar(clientId, f.id, chatId, 'palavra_chave')
        }
      }
    }

    // ── 3. nada bateu: os automáticos da conexão ─────────────────────────
    if (chat?.connection_id) {
      return this.automaticosDaConexao(clientId, chat.connection_id, chatId, primeira, chat.resposta_padrao_em)
    }
    return false
  }

  /**
   * Confere uma condição contra o texto que chegou.
   *
   * Os seis operadores são os que a tela oferece, e a lista tem que ser
   * exatamente esta: operador que a tela mostra e o motor não entende vira
   * regra que nunca dispara, sem erro em lugar nenhum.
   */
  private baterCondicao(operador: string, valor: string, texto: string): boolean {
    const alvo = valor.trim().toLowerCase()
    if (!alvo) return false
    switch (operador) {
      case 'igual':
        return texto === alvo
      case 'contem':
        return texto.includes(alvo)
      case 'diferente':
        return texto !== alvo
      case 'nao_contem':
        return !texto.includes(alvo)
      case 'comeca':
        return texto.startsWith(alvo)
      case 'termina':
        return texto.endsWith(alvo)
      default:
        return false
    }
  }

  /** As regras de palavra-chave desta conexão, na ordem em que foram postas. */
  private async regrasDaConexao(
    clientId: string,
    connectionId: string,
    chatId: string,
    texto: string,
  ): Promise<boolean> {
    const flowId = await this.regraQueBate(clientId, connectionId, texto)
    if (!flowId) return false
    return this.iniciar(clientId, flowId, chatId, 'palavra_chave')
  }

  /**
   * Qual fluxo esta mensagem pede, pelas regras da conexão. `null` se nenhuma.
   *
   * Separado de quem DISPARA porque a mesma pergunta é feita em dois momentos
   * muito diferentes: no começo de uma conversa, para escolher o fluxo; e no
   * meio de um menu, para decidir se a pessoa mudou de assunto. Duas cópias
   * dessa varredura seria o tipo de coisa que se desencontra no primeiro
   * operador novo.
   */
  private async regraQueBate(clientId: string, connectionId: string, texto: string): Promise<string | null> {
    // As condições são comparadas em minúsculo. Quem chama nem sempre já
    // normalizou — `aoReceberMensagem` recebe o texto como ele chegou.
    const limpo = texto.trim().toLowerCase()
    if (!limpo) return null

    const { data: regras } = await this.db
      .from('crm_disparo_regras')
      .select('id, combinador, condicoes, flow_id')
      .eq('client_id', clientId)
      .eq('connection_id', connectionId)
      .not('flow_id', 'is', null)
      .order('position')

    for (const r of regras ?? []) {
      const condicoes = Array.isArray(r.condicoes) ? (r.condicoes as { operador: string; valor: string }[]) : []
      if (condicoes.length === 0) continue

      const bateu =
        r.combinador === 'e'
          ? condicoes.every((c) => this.baterCondicao(c.operador, c.valor, limpo))
          : condicoes.some((c) => this.baterCondicao(c.operador, c.valor, limpo))

      if (!bateu) continue

      // O fluxo pode ter sido pausado depois de a regra ser criada. Regra
      // apontando pra fluxo parado não dispara, e isso não é erro.
      const { data: fluxo } = await this.db
        .from('crm_flows')
        .select('status')
        .eq('id', r.flow_id)
        .maybeSingle()
      if (fluxo?.status !== 'ativo') continue

      return r.flow_id as string
    }
    return null
  }

  /**
   * Os disparos automáticos: só rodam quando NENHUMA palavra-chave bateu.
   *
   * Boas-vindas ganha da resposta padrão quando é a primeira mensagem, porque
   * receber "não entendi" como primeiro contato é pior que não receber nada.
   */
  private async automaticosDaConexao(
    clientId: string,
    connectionId: string,
    chatId: string,
    primeira: boolean,
    respostaPadraoEm: string | null,
  ): Promise<boolean> {
    const { data: cfg } = await this.db
      .from('crm_broadcast_settings')
      .select('fluxo_boas_vindas, fluxo_resposta_padrao, resposta_padrao_horas')
      .eq('client_id', clientId)
      .eq('connection_id', connectionId)
      .maybeSingle()
    if (!cfg) return false

    const ativo = async (id: string | null) => {
      if (!id) return false
      const { data } = await this.db.from('crm_flows').select('status').eq('id', id).maybeSingle()
      return data?.status === 'ativo'
    }

    if (primeira && (await ativo(cfg.fluxo_boas_vindas))) {
      return this.iniciar(clientId, cfg.fluxo_boas_vindas as string, chatId, 'primeira_mensagem')
    }

    if (await ativo(cfg.fluxo_resposta_padrao)) {
      // A janela existe pra ele não virar eco. Sem ela, toda mensagem que não
      // casa com palavra-chave receberia a mesma resposta, uma atrás da outra.
      const horas = Number(cfg.resposta_padrao_horas ?? 24)
      const ultimo = respostaPadraoEm ? new Date(respostaPadraoEm).getTime() : 0
      if (Date.now() - ultimo < horas * 3600_000) return false

      const comecou = await this.iniciar(clientId, cfg.fluxo_resposta_padrao as string, chatId, 'palavra_chave')
      if (comecou) {
        await this.db.from('crm_chats').update({ resposta_padrao_em: new Date().toISOString() }).eq('id', chatId)
      }
      return comecou
    }

    return false
  }

  /**
   * A EMPRESA ESTÁ FECHADA AGORA? E, se estiver, avisa uma vez só.
   *
   * O horário de atendimento existia na tela desde sempre e NINGUÉM o lia. A
   * própria tela dizia "fora do horário, o CRM responde com a mensagem definida
   * em Configurações gerais" — e não respondia: quem escrevia de madrugada era
   * atendido pelo robô como se fosse meio-dia de terça.
   *
   * Devolve `true` quando a mensagem foi tratada como fora do expediente. Aí
   * mais nada dispara: mandar "estamos fechados" e em seguida o fluxo de venda
   * é pior que qualquer um dos dois sozinho.
   */
  private async avisarForaDoExpediente(clientId: string, connectionId: string, chatId: string): Promise<boolean> {
    const { data: cfg } = await this.db
      .from('crm_horario_config')
      .select('ativo, acao_fora, mensagem_fora, fluxo_fora')
      .eq('client_id', clientId)
      .eq('connection_id', connectionId)
      .maybeSingle()
    if (!cfg?.ativo) return false

    const { data: janelas } = await this.db
      .from('crm_horario_janelas')
      .select('weekday, inicio, fim')
      .eq('client_id', clientId)
      .eq('connection_id', connectionId)

    // Sem nenhuma janela, "expediente ativo" quer dizer fechado o tempo todo, e
    // não aberto o tempo todo: quem ligou a chave e não pôs horário nenhum
    // ainda não configurou nada, e responder 24h seria ignorar a chave.
    const grade = (janelas ?? []).map((j) => ({
      weekday: Number(j.weekday),
      de: minutosDoRelogio(String(j.inicio)),
      ate: minutosDoRelogio(String(j.fim)),
    }))

    const fuso = await this.fusoDoCliente(clientId)
    const agora = new Date()
    const { weekday: hoje, minutos } = relogioNoFuso(agora, fuso)

    const aberto = grade.some((j) => j.weekday === hoje && minutos >= j.de && minutos < j.ate)
    if (aberto) return false

    // QUANDO ESTE FECHAMENTO COMEÇOU.
    //
    // É o que impede o aviso de virar eco sem precisar de um número mágico de
    // horas: avisamos uma vez por fechamento, e o fechamento acaba quando a
    // próxima janela abre. Quem escreve dez vezes na madrugada de sábado recebe
    // um aviso; quem volta na madrugada seguinte recebe outro.
    const fechouEm = inicioDoFechamento(agora, fuso, grade)

    const { data: chat } = await this.db
      .from('crm_chats')
      .select('fora_horario_em')
      .eq('id', chatId)
      .maybeSingle()
    const avisadoEm = chat?.fora_horario_em ? new Date(chat.fora_horario_em).getTime() : 0
    // `avisadoEm > 0` PRIMEIRO, e não é detalhe: sem nenhuma janela na grade a
    // empresa nunca abre e `fechouEm` é 0. Com a comparação sozinha, `0 >= 0`
    // dava verdadeiro e a conversa era tratada como "já avisada" antes de
    // qualquer aviso ter saído — ou seja, quem ligasse o expediente sem pôr
    // horário nenhum ficava mudo, que é o defeito que esta tela veio corrigir.
    if (avisadoEm > 0 && avisadoEm >= fechouEm) return true

    if (cfg.acao_fora === 'fluxo') {
      if (!cfg.fluxo_fora) return true
      const { data: fluxo } = await this.db.from('crm_flows').select('status').eq('id', cfg.fluxo_fora).maybeSingle()
      if (fluxo?.status !== 'ativo') return true
      await this.iniciar(clientId, cfg.fluxo_fora as string, chatId, 'manual')
    } else {
      const recado = (cfg.mensagem_fora ?? '').trim()
      if (!recado) return true
      const conversa = await this.carregarConversa(chatId)
      if (!conversa?.sessao) return true
      const contexto = await this.contextoDoContato({ ...conversa, clientId }, {})
      const escrito = trocarVariaveis(recado, contexto)
      const id = await this.texto({ ...conversa, clientId }, escrito).catch((e) => {
        this.log.error({ err: e, chatId }, 'não deu pra avisar que está fora do expediente')
        return null
      })
      await this.registrar({ ...conversa, clientId }, id, escrito)
    }

    await this.db.from('crm_chats').update({ fora_horario_em: new Date().toISOString() }).eq('id', chatId)
    return true
  }

  /**
   * Conversa concluída sendo reaberta pelo cliente, e atendimento marcado como
   * concluído. Chamados de fora: quem sabe que o estado mudou é quem mudou.
   */
  async gatilhoDeConversa(
    clientId: string,
    chatId: string,
    connectionId: string | null,
    qual: 'conversa_finalizada' | 'atendimento_finalizado',
    /** Fluxo que provocou a mudança de estado. Ele não pode se acionar de volta. */
    origem?: string | null,
  ): Promise<boolean> {
    if (!connectionId) return false
    const coluna = qual === 'conversa_finalizada' ? 'fluxo_conversa_finalizada' : 'fluxo_atendimento_finalizado'
    const { data: cfg } = await this.db
      .from('crm_broadcast_settings')
      .select(coluna)
      .eq('client_id', clientId)
      .eq('connection_id', connectionId)
      .maybeSingle()

    const flowId = (cfg as Record<string, string | null> | null)?.[coluna] ?? null
    if (!flowId) return false
    // Um fluxo cujo último bloco resolve a conversa E está escolhido como fluxo
    // de atendimento concluído se chamaria de novo a cada volta, para sempre.
    if (origem && origem === flowId) return false

    const { data: fluxo } = await this.db.from('crm_flows').select('status').eq('id', flowId).maybeSingle()
    if (fluxo?.status !== 'ativo') return false

    return this.iniciar(clientId, flowId, chatId, 'manual')
  }

  // ─── Apoio ────────────────────────────────────────────────────────────────

  private async carregarDesenho(flowId: string): Promise<DesenhoDoFluxo | null> {
    const { data } = await this.db.from('crm_flows').select('graph').eq('id', flowId).maybeSingle()
    const g = data?.graph as DesenhoDoFluxo | null
    return g && Array.isArray(g.nodes) ? g : null
  }

  private async carregarConversa(chatId: string) {
    const { data: chat } = await this.db
      .from('crm_chats')
      .select('id, phone, connection_id, client_id')
      .eq('id', chatId)
      .maybeSingle()
    if (!chat?.phone) return null

    let conexao = chat.connection_id
      ? (await this.db.from('crm_connections').select('id, instance_id, status').eq('id', chat.connection_id).maybeSingle())
          .data
      : null

    // A CONVERSA SEM CONEXÃO GRAVADA.
    //
    // Isto derrubou fluxo de verdade: 21 das 25 conversas estavam com
    // `connection_id` nulo — abertas antes de esse campo passar a ser
    // preenchido — e TODA execução morria com "esta conversa não tem conexão
    // conectada", sem mandar uma única mensagem. O fluxo parecia quebrado; o
    // que faltava era um campo administrativo que o cliente nunca viu.
    //
    // Depender de um campo copiado é frágil demais pra derrubar o atendimento.
    // Quando ele falta, a conexão do cliente responde a pergunta.
    if (!conexao || conexao.status !== 'conectada') {
      const { data: doCliente } = await this.db
        .from('crm_connections')
        .select('id, instance_id, status')
        .eq('client_id', chat.client_id)
        .eq('status', 'conectada')
        .limit(2)

      // SÓ quando não há dúvida. Com dois números conectados, escolher um seria
      // mandar a mensagem pelo remetente errado — e o cliente lá do outro lado
      // veria um número que não conhece.
      if ((doCliente ?? []).length === 1) {
        conexao = doCliente![0]!
        // Grava de volta, pra não refazer esta busca a cada bloco e pra tela
        // parar de mostrar a conversa órfã.
        await this.db.from('crm_chats').update({ connection_id: conexao.id }).eq('id', chat.id)
        this.log.info({ chat: chat.id, conexao: conexao.id }, 'conversa sem conexão: adotou a única do cliente')
      }
    }

    // `sessao` é o nome da instância no provedor; `connectionId` é a linha em
    // `crm_connections`. São valores diferentes quando `instance_id` existe, e
    // quem procura configuração por conexão precisa do segundo.
    if (!conexao || conexao.status !== 'conectada') {
      return { sessao: '', phone: chat.phone, chatId: chat.id, connectionId: conexao?.id ?? null }
    }
    return { sessao: conexao.instance_id ?? conexao.id, phone: chat.phone, chatId: chat.id, connectionId: conexao.id }
  }

  private primeiroBloco(desenho: DesenhoDoFluxo): string | null {
    const inicio = desenho.nodes.find((n) => n.kind === 'inicio')
    if (!inicio) return null
    return desenho.edges.find((e) => e.from === inicio.id)?.to ?? null
  }

  private destinoDe(desenho: DesenhoDoFluxo, blocoId: string, porta: string): string | null {
    const exata = desenho.edges.find((e) => e.from === blocoId && e.fromPort === porta)
    if (exata) return exata.to
    // 'default' é o nome que o motor usa pra "a saída única do bloco"; no
    // desenho ela pode ter outro id. Quando há uma só, é ela.
    if (porta === 'default') {
      const doBloco = desenho.edges.filter((e) => e.from === blocoId)
      if (doBloco.length === 1) return doBloco[0]!.to
    }
    return null
  }

  /**
   * Quando o Intervalo Inteligente deve acordar. `null` = não espera nada.
   *
   * São três formas, e elas respondem a perguntas diferentes:
   *
   *   intervalo  "daqui a 2 horas" — o mais usado, e o que estava quebrado.
   *   data       "no dia 20 às 9h" — lembrete de vencimento, aviso de evento.
   *   horarios   "só em horário comercial" — se já estamos dentro de uma
   *              janela, segue AGORA; senão, espera abrir a próxima.
   */
  private quandoAcordar(d: BlocoDoFluxo['data']): Date | null {
    const modo = d.scheduleKind ?? 'intervalo'

    if (modo === 'data') {
      if (!d.scheduleDate) return null
      const quando = new Date(d.scheduleDate)
      // Data inválida ou já passada: seguir é melhor que travar o atendimento
      // num fluxo que ficaria dormindo pra sempre.
      if (Number.isNaN(quando.getTime())) return null
      return quando
    }

    if (modo === 'horarios') return this.proximaJanela(d.scheduleHours ?? [])

    const valor = Math.max(0, d.intervalValue ?? 0)
    if (valor === 0) return null
    const fator = { segundos: 1, minutos: 60, horas: 3600, dias: 86400 }[d.intervalUnit ?? 'minutos'] ?? 60
    const segundos = Math.min(valor * fator, MAX_DIAS_DE_ESPERA * 86400)
    return new Date(Date.now() + segundos * 1000)
  }

  /**
   * O começo da próxima janela de horário — ou `null` se já estamos dentro de
   * uma, que é o caso de "só fale em horário comercial" às 14h de uma terça.
   *
   * Olha os sete dias seguintes e para na primeira janela que abre. Sem teto,
   * uma lista de janelas vazia daria laço infinito; com ele, o pior caso é o
   * fluxo seguir sem esperar — que é o comportamento de quem não configurou
   * janela nenhuma.
   */
  private proximaJanela(janelas: { weekday: number; from: string; to: string }[]): Date | null {
    if (janelas.length === 0) return null

    const emMinutos = (hhmm: string): number | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
      if (!m) return null
      return Number(m[1]) * 60 + Number(m[2])
    }

    const agora = new Date()
    const minutoDeAgora = agora.getHours() * 60 + agora.getMinutes()

    // Já estamos dentro de uma janela de hoje? Então não há o que esperar.
    for (const j of janelas) {
      if (j.weekday !== agora.getDay()) continue
      const de = emMinutos(j.from)
      const ate = emMinutos(j.to)
      if (de === null || ate === null) continue
      if (minutoDeAgora >= de && minutoDeAgora < ate) return null
    }

    // Senão, a primeira que abrir nos próximos sete dias.
    for (let adiante = 0; adiante <= 7; adiante++) {
      const dia = new Date(agora)
      dia.setDate(agora.getDate() + adiante)
      const candidatas = janelas
        .filter((j) => j.weekday === dia.getDay())
        .map((j) => emMinutos(j.from))
        .filter((m): m is number => m !== null)
        .sort((a, b) => a - b)

      for (const minuto of candidatas) {
        const quando = new Date(dia)
        quando.setHours(Math.floor(minuto / 60), minuto % 60, 0, 0)
        if (quando.getTime() > agora.getTime()) return quando
      }
    }

    // Nenhuma janela válida em uma semana: seguir sem esperar é mais honesto
    // que dormir pra sempre num fluxo que ninguém vai acordar.
    return null
  }

  private calcularExpiracao(d: BlocoDoFluxo['data']): string | null {
    const valor = d.expireValue ?? 0
    if (valor > 0) {
      const emMs =
        d.expireUnit === 'minutos'
          ? valor * 60_000
          : d.expireUnit === 'horas'
            ? valor * 3_600_000
            : valor * 86_400_000
      return new Date(Date.now() + emMs).toISOString()
    }

    // Sem prazo no desenho: cai no teto geral.
    //
    // ANTES ISTO DEVOLVIA `null`, e null quer dizer esperar PARA SEMPRE. Uma
    // execução parada assim engole toda resposta seguinte do cliente dentro de
    // um fluxo que não anda mais, e impede qualquer gatilho novo de começar
    // nesta conversa — quem escrevesse "oi" no dia seguinte não acionaria nada.
    // As mensagens continuam chegando na caixa de entrada; o que fica travado é
    // a automação.
    //
    // O teto não é encerramento garantido: quem tem saída de 'timeout' desenhada
    // sai por ela, que é onde costuma estar o "falar com atendente".
    if (this.esperaMaximaMin <= 0) return null
    return new Date(Date.now() + this.esperaMaximaMin * 60_000).toISOString()
  }

  /**
   * Encerra a execução, sem apagar o que já estava explicado.
   *
   * O motivo de encerrar costuma ser banal — "o último bloco não leva a lugar
   * nenhum" —, e sobrescrever com ele apagava a única pista útil que existia:
   * a pendência anotada lá atrás ("este bloco precisa de um gateway
   * conectado"). Quem abrisse a execução depois leria a frase burocrática e
   * perderia a de verdade.
   */
  private async encerrar(runId: string, status: 'concluido' | 'falhou', detalhe: string): Promise<void> {
    const { data: antes } = await this.db.from('crm_flow_runs').select('status_detail').eq('id', runId).maybeSingle()
    const anterior = antes?.status_detail?.trim()
    const juntos = anterior && anterior !== detalhe ? `${anterior} — ${detalhe}` : detalhe

    await this.db
      .from('crm_flow_runs')
      .update({ status, status_detail: juntos, finished_at: new Date().toISOString(), waiting_block_id: null })
      .eq('id', runId)
  }
}

// ─── Funções soltas ─────────────────────────────────────────────────────────

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * A opção continua o fluxo? Só a de resposta. Link, telefone e código copiável
 * agem no aparelho do cliente e não mandam nada de volta — dar uma saída a
 * elas no desenho seria prometer um caminho que nunca acontece.
 */
export function ehResposta(o: { kind?: string }): boolean {
  return (o.kind ?? 'resposta') === 'resposta'
}

/** Traduz a opção do editor pro vocabulário do WhatsApp. */
export function paraBotao(o: { id: string; label: string; kind?: string; value?: string }): Botao {
  const texto = o.label.trim()
  switch (o.kind) {
    case 'url':
      return { type: 'url', text: texto, id: o.id, url: o.value ?? '' }
    case 'telefone':
      return { type: 'call', text: texto, id: o.id, phoneNumber: o.value ?? '' }
    case 'copiar':
      return { type: 'copy', text: texto, id: o.id, copyCode: o.value ?? '' }
    default:
      return { type: 'reply', text: texto, id: o.id }
  }
}

/** `{{nome}}` vira o que o fluxo capturou. O que não existe some. */
/**
 * Troca `{nome}` e `{{nome}}` pelo valor. Aceita ponto: `{comprovante.valor}`.
 *
 * SÓ ENTENDIA CHAVE DUPLA. A tela oferece as variáveis com UMA chave — o botão
 * do editor de mensagem insere `{full_name}`, e a dica embaixo do campo diz
 * "Use {full_name}, {phone_number}". Nada disso era trocado: a mensagem saía
 * pro cliente com `{first_name}` escrito, letra por letra, no lugar do nome.
 *
 * A chave dupla vem primeiro de propósito. Fazendo o contrário, `{{nome}}`
 * viraria `{João}` — a de dentro seria trocada e as chaves de fora sobrariam.
 *
 * Variável que não existe vira VAZIO, e não fica na tela. "Olá !" é feio;
 * "Olá {first_name}!" é um robô se denunciando.
 */
export function trocarVariaveis(texto: string, variables: Record<string, string>): string {
  return texto
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, chave: string) => variables[chave] ?? '')
    .replace(/\{\s*([\w.]+)\s*\}/g, (inteiro, chave: string) =>
      // Chave desconhecida fica como está: `{"json": 1}` dentro do corpo de
      // uma Integração não é variável, e apagá-lo quebraria a chamada.
      chave in variables ? variables[chave]! : inteiro,
    )
}

// ─── Relógio do cliente ─────────────────────────────────────────────────────
//
// A ponte roda em UTC. Todo horário que o cliente configurou está no relógio
// DELE, e comparar os dois direto erra por três horas no Brasil — o expediente
// das 9h fecharia às 15h e abriria às 12h.

/** 'HH:MM' ou 'HH:MM:SS' em minutos desde a meia-noite. */
export function minutosDoRelogio(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h ?? 0) * 60 + Number(m ?? 0)
}

/** Que dia da semana e que horas são, no fuso pedido. */
export function relogioNoFuso(quando: Date, fuso: string): { weekday: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(quando)
  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  // `hour: '2-digit'` com hour12:false devolve '24' à meia-noite em alguns
  // ambientes. 24 na conta empurraria a meia-noite pro dia seguinte.
  const hora = Number(pega('hour')) % 24
  return { weekday: Math.max(0, dias.indexOf(pega('weekday'))), minutos: hora * 60 + Number(pega('minute')) }
}

/**
 * Quando começou o fechamento em que estamos agora.
 *
 * É o fim da última janela que já passou. Serve para avisar UMA vez por
 * fechamento: quem manda dez mensagens na madrugada de sábado recebe um aviso
 * só, e quem volta na madrugada seguinte recebe outro — sem depender de um
 * "não repita antes de N horas" escolhido no chute.
 *
 * Olha 7 dias para trás porque é o ciclo inteiro da grade. Sem nenhuma janela
 * em 7 dias, a empresa nunca abre: devolve 0, e aí o primeiro aviso da conversa
 * é o único.
 */
export function inicioDoFechamento(
  agora: Date,
  fuso: string,
  grade: { weekday: number; de: number; ate: number }[],
): number {
  if (grade.length === 0) return 0
  const { weekday: hoje, minutos } = relogioNoFuso(agora, fuso)

  for (let atras = 0; atras < 7; atras++) {
    const dia = (hoje - atras + 7) % 7
    // Hoje só valem as janelas que já terminaram; nos dias anteriores, todas.
    const candidatas = grade.filter((j) => j.weekday === dia && (atras > 0 || j.ate <= minutos))
    if (candidatas.length === 0) continue
    const fim = Math.max(...candidatas.map((j) => j.ate))
    // Meia-noite daquele dia no relógio do cliente, mais o minuto em que fechou.
    const meiaNoiteDoDia = agora.getTime() - minutos * 60_000 - atras * 86_400_000
    return meiaNoiteDoDia + fim * 60_000
  }
  return 0
}

export function avaliar(valor: string, operador: string, alvo: string): boolean {
  const a = valor.trim().toLowerCase()
  const b = alvo.trim().toLowerCase()
  switch (operador) {
    case 'igual':
      return a === b
    case 'diferente':
      return a !== b
    case 'contem':
      return a.includes(b)
    case 'nao_contem':
      return !a.includes(b)
    case 'maior':
      return Number(a) > Number(b)
    case 'menor':
      return Number(a) < Number(b)
    case 'existe':
      return a.length > 0
    case 'vazio':
      return a.length === 0
    default:
      return false
  }
}

// ─── Peças pequenas dos blocos ──────────────────────────────────────────────

/**
 * Pesca um valor de dentro da resposta de uma API: `dados.cliente.nome`.
 *
 * Aceita índice de lista (`itens.0.preco`) porque API que devolve lista é
 * regra, não exceção — e sem isso o bloco de Integração só serviria pra
 * resposta plana.
 */
export function caminhoNoObjeto(raiz: unknown, caminho: string): unknown {
  if (!caminho?.trim()) return raiz
  let atual: unknown = raiz
  for (const parte of caminho.split('.')) {
    if (atual === null || atual === undefined) return undefined
    const chave = parte.trim()
    if (Array.isArray(atual)) {
      const i = Number(chave)
      atual = Number.isInteger(i) ? atual[i] : undefined
    } else if (typeof atual === 'object') {
      atual = (atual as Record<string, unknown>)[chave]
    } else {
      return undefined
    }
  }
  return atual
}

/** SHA-256 em hexa. A Meta exige o telefone assim na Conversions API. */
export function sha256(texto: string): string {
  return createHash('sha256').update(texto.trim().toLowerCase()).digest('hex')
}

/**
 * Uma pergunta ao GPT. Devolve a resposta, ou `null` quando não veio nada.
 *
 * `temperature` baixa de propósito: este bloco é usado pra CLASSIFICAR tanto
 * quanto pra conversar, e classificação que varia a cada chamada faz o fluxo
 * ramificar diferente pro mesmo cliente.
 */
export async function perguntarAoGpt(
  chave: string,
  modelo: string,
  instrucao: string,
  pergunta: string,
): Promise<string | null> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.3,
      messages: [
        ...(instrucao ? [{ role: 'system', content: instrucao }] : []),
        { role: 'user', content: pergunta || instrucao },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}`)
  const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  return d.choices?.[0]?.message?.content?.trim() ?? null
}

/** A mesma pergunta, pro Gemini. */
export async function perguntarAoGemini(
  chave: string,
  modelo: string,
  instrucao: string,
  pergunta: string,
): Promise<string | null> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(chave)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(instrucao ? { systemInstruction: { parts: [{ text: instrucao }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: pergunta || instrucao }] }],
        generationConfig: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  )
  if (!r.ok) throw new Error(`Gemini respondeu ${r.status}`)
  const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() || null
}

// Modelo do construtor de fluxos. O desenho inteiro (blocos + ligações) é
// gravado em crm_flows.graph como jsonb — um fluxo é um documento só.
//
// Os campos são todos OPCIONAIS de propósito: um bloco carrega só o que o seu
// tipo usa, e fluxo gravado numa versão antiga continua abrindo depois de o
// tipo ganhar campo novo. Quem garante o preenchimento é o editor de cada
// bloco, não o tipo.

export type FlowBlockKind =
  | 'inicio'
  | 'mensagem'
  | 'template'
  | 'etiqueta'
  | 'pix'
  | 'menu'
  | 'carrossel'
  | 'aguarda'
  | 'controle'
  | 'notificacao'
  | 'condicional'
  | 'conexao'
  | 'kanban'
  | 'atribuir'
  | 'departamento'
  | 'distribuidor'
  | 'intervalo'
  | 'pixel'
  | 'integracao'
  | 'ia'
  | 'manipulador'
  | 'venda'
  | 'pagamento'
  | 'kieai'

// ─── Conteúdo do bloco Mensagem ─────────────────────────────────────────────
// Uma mensagem é uma LISTA de conteúdos, não um texto só: o mesmo bloco manda
// um texto, depois uma imagem, depois um áudio. É o que o "Adicionar Conteúdo"
// da tela monta.

export type FlowContentKind =
  | 'texto'
  | 'imagem'
  | 'video'
  | 'audio'
  | 'intervalo'
  | 'contato'
  | 'arquivo'
  | 'sticker'

/** De onde vem a mídia. `ia` só existe no áudio (gera voz na hora). */
export type FlowMediaSource = 'arquivo' | 'url' | 'ia'

export interface FlowContentItem {
  id: string
  kind: FlowContentKind

  /** texto / legenda da mídia / texto que vira voz na opção IA */
  text?: string

  source?: FlowMediaSource
  /** URL pública ou caminho no storage, conforme `source` */
  mediaUrl?: string
  /** nome mostrado no WhatsApp (arquivo e sticker) */
  fileName?: string

  // ── áudio ──
  /** Segundos de "gravando…" antes de soltar o áudio. 0–120. */
  recordingDelaySeconds?: number
  /** Manda como áudio gravado (PTT) em vez de anexo de música. */
  sendAsRecorded?: boolean
  /** Voz do ElevenLabs quando `source === 'ia'`. */
  voiceId?: string
  voiceModel?: string

  // ── contato ──
  contactName?: string
  contactPhone?: string

  // ── intervalo entre conteúdos ──
  delaySeconds?: number

  /** Visualização única (recurso do WhatsApp Web/Mobile; a API oficial não tem). */
  viewOnce?: boolean
  /** Apaga a mensagem no WhatsApp quando a etiqueta escolhida for aplicada. */
  deleteOnTag?: boolean
  deleteOnTagName?: string
}

export interface FlowMenuOption {
  id: string
  label: string
  /** Descrição da linha — só o modo Lista do WhatsApp mostra. */
  description?: string
  /**
   * O que o botão faz no aparelho do cliente. Ausente = `resposta`, que é o
   * comportamento de sempre e o único que devolve algo ao fluxo: `url`,
   * `telefone` e `copiar` agem no aparelho e não continuam a conversa.
   */
  kind?: 'resposta' | 'url' | 'telefone' | 'copiar'
  /** O link, o número ou o código — conforme o `kind`. */
  value?: string
}

export interface FlowCarouselButton {
  id: string
  /** `resposta` volta pro fluxo; `url` abre link; `telefone` disca. */
  kind: 'resposta' | 'url' | 'telefone'
  label: string
  value?: string
}

export interface FlowCarouselCard {
  id: string
  text: string
  source?: FlowMediaSource
  imageUrl: string
  buttons: FlowCarouselButton[]
}

export interface FlowCondition {
  id: string
  variable: string
  operator: 'igual' | 'diferente' | 'contem' | 'nao_contem' | 'maior' | 'menor' | 'existe' | 'vazio'
  value: string
}

export interface FlowAiCondition {
  id: string
  /** O que a IA deve reconhecer na resposta pra seguir por esta saída. */
  label: string
}

export interface FlowDistribuidorSaida {
  id: string
  label: string
}

/** Unidade de tempo usada em vários blocos. O limite real é 31 dias. */
export type FlowTimeUnit = 'segundos' | 'minutos' | 'horas' | 'dias'

export const MAX_DIAS_FLUXO = 31

/** Converte para segundos — é assim que o motor compara e agenda. */
export function paraSegundos(valor: number, unidade: FlowTimeUnit): number {
  const fator = { segundos: 1, minutos: 60, horas: 3600, dias: 86400 }[unidade]
  return Math.max(0, Math.round(valor * fator))
}

export interface FlowBlockData {
  // ── mensagem ──
  /** Conteúdos na ordem em que saem. */
  items?: FlowContentItem[]
  /** Espera entre um conteúdo e o próximo; sorteada no intervalo. 0–120s. */
  delayMinSeconds?: number
  delayMaxSeconds?: number

  /** Texto simples — usado pelos blocos que não são a Mensagem completa. */
  text?: string

  // ── template da Meta ──
  templateId?: string | null
  responseTimeout?: number
  responseTimeoutUnit?: FlowTimeUnit

  // ── etiquetas ──
  tags?: string[]
  /** `false` remove as etiquetas em vez de adicionar. */
  addTags?: boolean

  // ── PIX ──
  pixKeyType?: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'
  pixKey?: string
  pixRecipient?: string
  amount?: string

  // ── menu ──
  /**
   * Como este menu sai: lista rolável ou botões expostos.
   *
   * Vazio = o motor decide pela quantidade (até 3, botões). É o valor de todo
   * menu criado antes desta escolha existir, e o comportamento continua o
   * mesmo pra eles.
   *
   * Escolher 'lista' com duas opções é legítimo, não um engano: a lista mostra
   * DESCRIÇÃO embaixo de cada linha, e o botão não. Antes isso era impossível
   * — o formato era refém da contagem.
   */
  menuFormat?: 'lista' | 'botoes'
  buttonLabel?: string
  footer?: string
  imageUrl?: string
  /** Só da tela: se a imagem veio de upload ou de um endereço colado. */
  imageSource?: FlowMediaSource
  options?: FlowMenuOption[]
  expireValue?: number
  expireUnit?: FlowTimeUnit
  saveToVariable?: string

  // ── carrossel ──
  cards?: FlowCarouselCard[]

  // ── aguarda resposta ──
  waitForever?: boolean
  waitValue?: number
  waitUnit?: FlowTimeUnit
  bufferEnabled?: boolean
  bufferSeconds?: number
  replyToLead?: boolean
  reactToLead?: boolean

  // ── controlador de chat ──
  chatState?: 'aguardando' | 'atendendo' | 'resolvido'
  chatAction?: 'resolver' | 'reabrir' | 'transferir' | 'pausar_bot' | 'retomar_bot'

  // ── departamento / atribuição ──
  departmentId?: string | null
  assigneeEmail?: string

  // ── notificação ──
  notifyName?: string
  notifyCountry?: string
  notifyPhone?: string
  channel?: 'painel' | 'email' | 'whatsapp'

  // ── condicional ──
  matchAll?: boolean
  conditions?: FlowCondition[]
  variable?: string
  operator?: FlowCondition['operator']
  value?: string

  // ── conexão de fluxo ──
  targetFlowId?: string | null

  // ── kanban ──
  kanbanAction?: 'adicionar' | 'mover'
  kanbanId?: string | null
  kanbanColumnId?: string | null

  // ── distribuidor ──
  saidas?: FlowDistribuidorSaida[]
  /** Cliente repetido volta pra mesma saída de antes. */
  preventRepeat?: boolean

  // ── intervalo inteligente ──
  scheduleKind?: 'intervalo' | 'data' | 'horarios'
  intervalValue?: number
  intervalUnit?: FlowTimeUnit
  scheduleDate?: string
  /** Janelas por dia da semana: 0=domingo. */
  scheduleHours?: { weekday: number; from: string; to: string }[]

  // ── pixel do Facebook ──
  pixelId?: string | null
  pixelEvent?: 'Purchase' | 'Lead' | 'CompleteRegistration' | 'InitiateCheckout' | 'AddToCart' | 'ViewContent'
  pageId?: string
  currency?: string

  // ── integração HTTP ──
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url?: string
  headers?: string
  body?: string
  /** { variavelDoFluxo: 'caminho.na.resposta' } */
  responseMap?: Record<string, string>

  // ── bloco de IA ──
  aiProvider?: 'gpt' | 'gemini'
  /** `manual` usa a chave digitada; `global` usa uma variável global {g_nome}. */
  aiAuth?: 'manual' | 'global'
  aiApiKey?: string
  aiModel?: string
  aiPrompt?: string
  aiUserMessage?: string
  aiSaveTo?: string
  aiAutoReply?: boolean
  aiUnderstandAudio?: boolean
  aiUnderstandImage?: boolean
  aiUnderstandPdf?: boolean
  aiReadReceipt?: boolean
  aiKeepContext?: boolean
  aiContextTurns?: number
  aiConditions?: FlowAiCondition[]

  // ── manipulador de variável ──
  varName?: string
  varOperation?: 'definir' | 'somar' | 'subtrair' | 'limpar' | 'incrementar'
  varValue?: string

  // ── venda aprovada ──
  productId?: string | null
  saleCustomerTemplate?: string
  saleAmountTemplate?: string
  saleCurrencyTemplate?: string
  pushTitle?: string
  pushSubtitle?: string
  invoiceProviderId?: string | null
  utmifyId?: string | null

  // ── pagamento (gateway) ──
  gateway?: string
  gatewayKeyId?: string | null
  openAmount?: boolean
  customerName?: string
  customerPhone?: string

  // ── Kie.ai ──
  kieApiKey?: string
  kieKind?: 'audio' | 'imagem' | 'musica' | 'video'
  kieModel?: string
  kieVoice?: string
  kieSaveTo?: string
}

export interface FlowBlock {
  id: string
  kind: FlowBlockKind
  title: string
  x: number
  y: number
  data: FlowBlockData
}

export interface FlowEdge {
  id: string
  from: string
  /** Porta de saída: 'default', id de opção do menu, 'sim'/'nao', 'timeout'… */
  fromPort: string
  to: string
}

export interface FlowGraph {
  nodes: FlowBlock[]
  edges: FlowEdge[]
}

export const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] }

export interface BlockSpec {
  kind: FlowBlockKind
  label: string
  description: string
  /** Cor do bloco no canvas. Cor crua de propósito: identifica o TIPO, e
   *  precisa ser a mesma no tema claro e no escuro pra memória visual valer. */
  color: string
  /** Grupo na paleta lateral. */
  group: 'Conversa' | 'Fluxo' | 'Atendimento' | 'Integrações' | 'Dinheiro'
  ports: string[]
}

export const FLOW_BLOCK_SPECS: BlockSpec[] = [
  { kind: 'inicio', label: 'Início', description: 'Onde o fluxo começa.', color: '#16a34a', group: 'Fluxo', ports: ['default'] },

  // ── Conversa ──
  { kind: 'mensagem', label: 'Mensagem', description: 'Texto, imagem, vídeo, áudio, arquivo, sticker e contato.', color: '#2563eb', group: 'Conversa', ports: ['default'] },
  { kind: 'menu', label: 'Menu', description: 'Lista ou botões; cada opção segue por um caminho.', color: '#7c3aed', group: 'Conversa', ports: [] },
  { kind: 'carrossel', label: 'Carrossel', description: 'Cartões com imagem e até 3 botões cada.', color: '#0891b2', group: 'Conversa', ports: [] },
  { kind: 'template', label: 'Template WhatsApp', description: 'Template aprovado na Meta, com espera pelo clique.', color: '#64748b', group: 'Conversa', ports: ['default', 'timeout', 'falha'] },
  { kind: 'aguarda', label: 'Aguarda Resposta', description: 'Pausa até o contato responder.', color: '#ea580c', group: 'Conversa', ports: ['default', 'timeout'] },

  // ── Fluxo ──
  { kind: 'condicional', label: 'Condicional', description: 'Segue por sim ou não conforme as condições.', color: '#0ea5e9', group: 'Fluxo', ports: ['sim', 'nao'] },
  { kind: 'distribuidor', label: 'Distribuidor', description: 'Divide os contatos igualmente entre as saídas.', color: '#ca8a04', group: 'Fluxo', ports: [] },
  { kind: 'intervalo', label: 'Intervalo Inteligente', description: 'Espera um tempo, uma data ou um horário.', color: '#14b8a6', group: 'Fluxo', ports: ['default'] },
  { kind: 'conexao', label: 'Conexão de Fluxo', description: 'Manda o contato para outro fluxo.', color: '#dc2626', group: 'Fluxo', ports: [] },
  { kind: 'manipulador', label: 'Manipulador', description: 'Define, soma ou limpa uma variável do contato.', color: '#f97316', group: 'Fluxo', ports: ['default'] },

  // ── Atendimento ──
  { kind: 'etiqueta', label: 'Etiquetas', description: 'Adiciona ou remove etiquetas do contato.', color: '#8b5cf6', group: 'Atendimento', ports: ['default'] },
  { kind: 'controle', label: 'Controlador de Chat', description: 'Move entre Aguardando, Atendendo e Resolvidos.', color: '#475569', group: 'Atendimento', ports: ['default'] },
  { kind: 'departamento', label: 'Departamento', description: 'Atribui um departamento ao chat.', color: '#a855f7', group: 'Atendimento', ports: ['default'] },
  { kind: 'atribuir', label: 'Atribuir atendimento', description: 'Coloca o chat com alguém da equipe.', color: '#059669', group: 'Atendimento', ports: ['default'] },
  { kind: 'kanban', label: 'Kanban', description: 'Cria ou move o cartão no quadro.', color: '#9333ea', group: 'Atendimento', ports: ['default'] },
  { kind: 'notificacao', label: 'Notificação', description: 'Avisa um número por WhatsApp.', color: '#f59e0b', group: 'Atendimento', ports: ['default'] },

  // ── Integrações ──
  { kind: 'ia', label: 'Bloco de IA', description: 'GPT ou Gemini: responde, classifica e lê comprovante.', color: '#10b981', group: 'Integrações', ports: ['default'] },
  { kind: 'integracao', label: 'Integração', description: 'Chama uma API externa e guarda a resposta.', color: '#3b82f6', group: 'Integrações', ports: ['default', 'falha'] },
  { kind: 'kieai', label: 'Integração Kie.ai', description: 'Gera áudio, imagem, música ou vídeo.', color: '#c026d3', group: 'Integrações', ports: ['default', 'falha'] },
  { kind: 'pixel', label: 'Pixel', description: 'Dispara evento no Facebook pela Conversions API.', color: '#eab308', group: 'Integrações', ports: ['default'] },

  // ── Dinheiro ──
  { kind: 'pix', label: 'Botão PIX', description: 'Envia a chave PIX para o cliente copiar.', color: '#16a34a', group: 'Dinheiro', ports: ['default'] },
  { kind: 'pagamento', label: 'Pagamento', description: 'Gera uma cobrança no gateway e segue o fluxo.', color: '#7e22ce', group: 'Dinheiro', ports: ['default', 'falha'] },
  { kind: 'venda', label: 'Venda aprovada', description: 'Registra a venda, notifica e emite nota.', color: '#22c55e', group: 'Dinheiro', ports: ['default'] },
]

export const FLOW_GROUPS = ['Conversa', 'Fluxo', 'Atendimento', 'Integrações', 'Dinheiro'] as const

export function blockSpec(kind: FlowBlockKind): BlockSpec {
  return FLOW_BLOCK_SPECS.find((s) => s.kind === kind) ?? FLOW_BLOCK_SPECS[1]
}

/**
 * Portas de saída REAIS de um bloco já configurado.
 *
 * Menu, carrossel, distribuidor e IA geram as suas a partir do conteúdo — por
 * isso não dá pra usar só a lista fixa do spec. Toda porta tem rótulo, porque
 * é ele que aparece ao lado do fio no canvas.
 */
export function blockPorts(block: FlowBlock): { id: string; label: string }[] {
  const d = block.data

  if (block.kind === 'menu') {
    // Só a opção de resposta ganha saída. Link, telefone e código copiável
    // agem no aparelho do cliente e não devolvem nada — uma saída pendurada
    // neles seria um caminho no desenho que jamais dispara.
    const options = (d.options ?? [])
      .filter((o) => (o.kind ?? 'resposta') === 'resposta')
      .map((o) => ({ id: o.id, label: o.label || 'Opção' }))
    return [...options, { id: 'fallback', label: 'Resposta fora das opções' }]
  }

  if (block.kind === 'carrossel') {
    // Uma saída por botão de resposta, de todos os cartões.
    const botoes = (d.cards ?? []).flatMap((c) =>
      (c.buttons ?? []).filter((b) => b.kind === 'resposta').map((b) => ({ id: b.id, label: b.label || 'Botão' })),
    )
    return [...botoes, { id: 'fallback', label: 'Texto livre' }, { id: 'timeout', label: 'Sem resposta a tempo' }]
  }

  if (block.kind === 'condicional') {
    return [
      { id: 'sim', label: 'Sim' },
      { id: 'nao', label: 'Não' },
    ]
  }

  if (block.kind === 'aguarda') {
    return [
      { id: 'default', label: 'Respondeu' },
      { id: 'timeout', label: d.waitForever ? 'Nunca (aguarda sem prazo)' : 'Não respondeu' },
    ]
  }

  if (block.kind === 'template') {
    return [
      { id: 'default', label: 'Resposta livre' },
      { id: 'timeout', label: 'Timeout sem clique' },
      { id: 'falha', label: 'Falha de entrega' },
    ]
  }

  if (block.kind === 'distribuidor') {
    const saidas = (d.saidas ?? []).map((s, i) => ({ id: s.id, label: s.label || `Saída ${i + 1}` }))
    return saidas.length ? saidas : [{ id: 'default', label: 'Saída 1' }]
  }

  if (block.kind === 'ia') {
    // As condicionais inteligentes viram saídas, na ordem = prioridade. A
    // saída padrão fica por último: é o "não classificou em nenhuma".
    const cond = (d.aiConditions ?? []).map((c) => ({ id: c.id, label: c.label || 'Condição' }))
    const extra = d.aiReadReceipt ? [{ id: 'comprovante', label: 'Comprovante identificado' }] : []
    return [...extra, ...cond, { id: 'default', label: cond.length ? 'Nenhuma das condições' : 'Segue' }]
  }

  if (block.kind === 'integracao' || block.kind === 'kieai' || block.kind === 'pagamento') {
    return [
      { id: 'default', label: 'Deu certo' },
      { id: 'falha', label: 'Falhou' },
    ]
  }

  if (block.kind === 'conexao') return []

  return [{ id: 'default', label: 'Segue' }]
}

const novoId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`

export function novoConteudo(kind: FlowContentKind): FlowContentItem {
  const item: FlowContentItem = { id: novoId('c'), kind }
  if (kind === 'audio') {
    item.source = 'arquivo'
    item.recordingDelaySeconds = 6
    item.sendAsRecorded = true
    item.voiceModel = 'eleven_multilingual_v2'
  }
  if (kind === 'imagem' || kind === 'video' || kind === 'arquivo' || kind === 'sticker') item.source = 'arquivo'
  if (kind === 'intervalo') item.delaySeconds = 3
  return item
}

/**
 * Quantos botões de resposta rápida o WhatsApp aceita numa mensagem. Acima
 * disso a Meta não garante nada, e o preço de errar é a mensagem inteira ser
 * recusada — o cliente fica sem opção alguma.
 */
export const MAX_BOTOES_WHATSAPP = 3

/** O teto de letras dentro de um botão. Passou disso, o WhatsApp corta. */
export const MAX_LETRAS_DO_BOTAO = 20

/**
 * O formato que vai sair no WhatsApp.
 *
 * A regra é a MESMA do motor (`enviarMenu`, em whatsapp/src/fluxos.ts). Ter a
 * regra escrita nos dois lugares é ruim, mas a tela e a ponte não compartilham
 * código — e o que não pode acontecer de jeito nenhum é a tela prometer
 * "botões" e sair lista, que foi exatamente o problema da caixinha que existia
 * aqui antes e o motor ignorava.
 *
 * Agora a escolha vale, com UMA exceção que não é opinião nossa: acima de três
 * opções o WhatsApp não tem botão, então vira lista mesmo que a pessoa tenha
 * pedido botões. A tela avisa disso em vez de deixar acontecer calada.
 */
export function formatoDoMenu(d: FlowBlockData): 'botoes' | 'lista' {
  if ((d.options ?? []).length > MAX_BOTOES_WHATSAPP) return 'lista'
  return d.menuFormat ?? 'botoes'
}

/** Bloco novo com o mínimo já preenchido pro editor não abrir vazio. */
export function newBlock(kind: FlowBlockKind, x: number, y: number): FlowBlock {
  const spec = blockSpec(kind)
  const d: FlowBlockData = {}

  switch (kind) {
    case 'mensagem':
      d.items = [novoConteudo('texto')]
      d.delayMinSeconds = 0
      d.delayMaxSeconds = 0
      break
    case 'menu':
      d.options = [{ id: novoId('o'), label: 'Opção 1' }]
      d.expireValue = 0
      d.expireUnit = 'dias'
      break
    case 'carrossel':
      d.cards = [{ id: novoId('cd'), text: '', imageUrl: '', source: 'arquivo', buttons: [{ id: novoId('bt'), kind: 'resposta', label: 'Opção A' }] }]
      d.expireValue = 0
      d.expireUnit = 'dias'
      break
    case 'template':
      d.responseTimeout = 60
      d.responseTimeoutUnit = 'minutos'
      break
    case 'aguarda':
      d.waitForever = false
      d.waitValue = 1
      d.waitUnit = 'dias'
      d.bufferEnabled = false
      d.bufferSeconds = 5
      break
    case 'condicional':
      d.matchAll = true
      d.conditions = []
      break
    case 'etiqueta':
      d.addTags = true
      d.tags = []
      break
    case 'pix':
      d.pixKeyType = 'aleatoria'
      break
    case 'controle':
      d.chatState = 'aguardando'
      break
    case 'notificacao':
      d.notifyCountry = '55'
      d.channel = 'whatsapp'
      break
    case 'distribuidor':
      d.preventRepeat = true
      d.saidas = [{ id: novoId('s'), label: 'Saída 1' }, { id: novoId('s'), label: 'Saída 2' }]
      break
    case 'intervalo':
      d.scheduleKind = 'intervalo'
      d.intervalValue = 1
      d.intervalUnit = 'minutos'
      break
    case 'pixel':
      d.pixelEvent = 'Purchase'
      d.currency = 'BRL'
      break
    case 'integracao':
      d.httpMethod = 'GET'
      d.headers = '{\n  "Content-Type": "application/json"\n}'
      d.body = '{}'
      d.responseMap = {}
      break
    case 'ia':
      d.aiProvider = 'gpt'
      d.aiAuth = 'global'
      d.aiModel = 'gpt-5.4-mini'
      d.aiUserMessage = '{last_user_message}'
      d.aiSaveTo = 'ai.response'
      d.aiAutoReply = true
      d.aiConditions = []
      d.aiContextTurns = 5
      break
    case 'manipulador':
      d.varOperation = 'definir'
      break
    case 'venda':
      d.saleCustomerTemplate = '{comprovante.nome_pagador}'
      d.saleAmountTemplate = '{comprovante.valor}'
      d.saleCurrencyTemplate = '{comprovante.currency}'
      break
    case 'pagamento':
      d.gateway = 'xpag'
      d.currency = 'BRL'
      d.amount = '100,00'
      d.customerName = '{full_name}'
      d.customerPhone = '{phone_number}'
      break
    case 'kieai':
      d.kieKind = 'audio'
      d.kieModel = 'eleven_multilingual_v2'
      d.kieVoice = 'rachel'
      d.kieSaveTo = 'kie.ai.result_audio'
      break
    case 'kanban':
      d.kanbanAction = 'adicionar'
      break
  }

  return { id: novoId('b'), kind, title: spec.label, x, y, data: d }
}

/**
 * Resumo de uma linha mostrado no cartão do canvas. Sem isso o bloco vira uma
 * caixa com o nome do tipo, e um fluxo de 30 blocos fica ilegível sem abrir um
 * por um.
 */
export function blockResumo(b: FlowBlock): string {
  const d = b.data
  switch (b.kind) {
    case 'mensagem': {
      const n = (d.items ?? []).length
      const texto = (d.items ?? []).find((i) => i.kind === 'texto')?.text
      return texto?.trim() ? texto.trim().slice(0, 90) : `${n} conteúdo${n === 1 ? '' : 's'}`
    }
    case 'menu': {
      // O texto da pergunta diz mais que a contagem: é o que o cliente lê.
      const texto = d.text?.trim()
      const n = (d.options ?? []).length
      const formato = formatoDoMenu(d) === 'botoes' ? 'Botões' : 'Lista'
      return texto ? texto.slice(0, 90) : `${formato} · ${n} ${n === 1 ? 'opção' : 'opções'}`
    }
    case 'carrossel':
      return `Cartões: ${(d.cards ?? []).length}`
    case 'template':
      return d.templateId ? 'Template selecionado' : 'Template não selecionado'
    case 'etiqueta':
      return `${d.addTags === false ? 'Remove' : 'Adiciona'} ${(d.tags ?? []).length} etiqueta(s)`
    case 'pix':
      return d.pixKey ? `Chave ${d.pixKeyType ?? ''}` : 'Chave não preenchida'
    case 'aguarda':
      return d.waitForever ? 'Aguarda sem prazo' : `Até ${d.waitValue ?? 1} ${d.waitUnit ?? 'dias'}`
    case 'intervalo':
      if (d.scheduleKind === 'data') return d.scheduleDate ? `Em ${d.scheduleDate}` : 'Data não definida'
      if (d.scheduleKind === 'horarios') return `${(d.scheduleHours ?? []).length} janela(s)`
      return `Espera de ${d.intervalValue ?? 1} ${d.intervalUnit ?? 'minutos'}`
    case 'condicional':
      return `${(d.conditions ?? []).length} condição(ões) · ${d.matchAll === false ? 'qualquer' : 'todas'}`
    case 'distribuidor':
      return `${(d.saidas ?? []).length} saídas${d.preventRepeat ? ' · sem repetir' : ''}`
    case 'ia':
      return `${d.aiProvider === 'gemini' ? 'Gemini' : 'GPT'} · ${d.aiModel ?? ''}`
    case 'integracao':
      return `${d.httpMethod ?? 'GET'} ${d.url ? d.url.slice(0, 40) : 'sem URL'}`
    case 'kieai':
      return `Gera ${d.kieKind ?? 'áudio'}`
    case 'pixel':
      return `Evento ${d.pixelEvent ?? 'Purchase'}`
    case 'manipulador':
      return `${d.varOperation ?? 'definir'} ${d.varName ?? ''}`.trim()
    case 'pagamento':
      return `${(d.gateway ?? '').toUpperCase()} · ${d.openAmount ? 'valor livre' : `R$ ${d.amount ?? ''}`}`
    case 'venda':
      return 'Registra a venda e notifica'
    case 'controle':
      return `Move para ${d.chatState ?? 'aguardando'}`
    case 'notificacao':
      return d.notifyPhone ? `+${d.notifyCountry ?? '55'} ${d.notifyPhone}` : 'Número não preenchido'
    case 'conexao':
      return d.targetFlowId ? 'Vai para outro fluxo' : 'Fluxo de destino não escolhido'
    case 'kanban':
      return `${d.kanbanAction === 'mover' ? 'Move' : 'Cria'} cartão`
    default:
      return blockSpec(b.kind).description
  }
}

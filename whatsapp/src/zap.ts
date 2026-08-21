// O VOCABULÁRIO DO WHATSAPP, SEM DONO.
//
// Tudo aqui já morou dentro do `waha.ts`, e por isso o resto da ponte
// importava o cliente de um provedor só pra saber o que é um botão ou como se
// escreve um telefone. Quando o provedor antigo saiu de cena — ele não entrega botão, e a
// uazapi entrega —, essas peças teriam saído junto sem nenhum motivo: um
// limite de 20 letras no botão é regra do WhatsApp, não do provedor.
//
// A REGRA DESTE ARQUIVO: aqui só entra o que vale para QUALQUER provedor. Nada
// de URL, rota, token ou formato de payload. Se precisar saber com quem está
// falando, é no cliente do provedor que mora.

/** O vocabulário do CRM, que é o que o backend grava em crm_connections. */
export type CRMStatus = 'connected' | 'connecting' | 'disconnected'

export interface SituacaoDaSessao {
  status: CRMStatus
  /** O bruto do provedor, pro log e pra mensagem de erro dizer a verdade. */
  raw: string
  phone: string | null
  /**
   * O nome que aparece no perfil do WhatsApp pareado. É o que a tela de
   * Conexões mostra pra quem tem três números saber qual é qual — "conectada"
   * sozinho não distingue nada.
   */
  deviceName: string | null
}

/** Uma conversa do WhatsApp, do jeito que a importação precisa. */
export interface ConversaDoAparelho {
  chatId: string
  nome: string | null
  grupo: boolean
  /**
   * O telefone que o próprio provedor resolveu.
   *
   * Existe porque o `chatId` deixou de ser telefone: numa conta com
   * endereçamento novo ele é um `@lid`, e extrair dígitos dali gravaria um id
   * interno no lugar do número — a conversa abre e a resposta não tem pra onde
   * ir. Quando o provedor sabe o número, ele manda aqui.
   */
  telefone: string | null
}

/** Uma mensagem do histórico, já no vocabulário do CRM. */
export interface MensagemDoAparelho {
  externalId: string | null
  fromMe: boolean
  texto: string
  timestamp: number
  mediaUrl: string | null
  mediaMimetype: string | null
  /**
   * O id pelo qual se PEDE o arquivo ao provedor, quando ele não veio por URL.
   *
   * A uazapi devolve a mídia do histórico como um `.enc` criptografado no CDN
   * do WhatsApp — baixar aquele endereço dá bytes embaralhados. Os bytes de
   * verdade saem de `/message/download`, que quer o id da mensagem. Sem este
   * campo, foto, áudio e vídeo do histórico entram no CRM como bolha vazia.
   */
  mediaId: string | null
  /** O tipo cru do provedor ("StickerMessage"). É o que distingue figurinha de foto. */
  tipoCru: string | null
}

// ─── Botões ─────────────────────────────────────────────────────────────────

/**
 * Os quatro tipos que o WhatsApp entende. `reply` devolve o texto do botão
 * como se o cliente tivesse digitado; os outros três agem no aparelho dele e
 * NÃO respondem nada — abrir um link ou copiar um código não manda mensagem.
 * Quem espera resposta precisa saber disso: uma tela só com botões de link
 * ficaria esperando pra sempre.
 */
export type TipoDeBotao = 'reply' | 'url' | 'call' | 'copy'

export interface Botao {
  type: TipoDeBotao
  text: string
  /**
   * O id da opção no desenho do fluxo. Vai junto pro WhatsApp e volta no toque,
   * então o motor casa a resposta pelo id em vez de pelo rótulo — dois botões
   * com o mesmo texto deixariam de ser ambíguos.
   */
  id?: string
  url?: string
  phoneNumber?: string
  copyCode?: string
}

/**
 * Três botões de resposta rápida por mensagem — o limite documentado da Meta.
 *
 * Acima de três, a lista é o formato certo e cabe todas. O preço de estourar
 * não é perder o quarto botão: é a mensagem INTEIRA ser recusada, e o cliente
 * ficar sem opção nenhuma.
 */
export const MAX_BOTOES = 3

/**
 * O texto dentro do botão. Passou de 20, o WhatsApp corta ou recusa, e qual
 * dos dois depende da versão do aparelho — não dá pra contar com nenhum.
 * Cortamos aqui, com reticências, pra que o que sai seja sempre previsível.
 */
export const LIMITE_DO_TITULO = 20

/** A linha da lista aguenta mais que o botão, mas também tem teto. */
export const LIMITE_DA_LINHA = 24

/** A pergunta da enquete. O que passar disso o WhatsApp recusa. */
export const LIMITE_DA_PERGUNTA = 255

/** Cada opção da enquete. Bem mais folgado que os 20 do botão. */
export const LIMITE_DA_OPCAO = 100

/** Quantas opções cabem numa enquete. */
export const MAX_OPCOES_ENQUETE = 12

/** Uma linha da lista. `rowId` é o que volta quando o cliente escolhe. */
export interface LinhaDaLista {
  rowId: string
  title: string
  description?: string
}

/**
 * O resultado diz se o formato rico foi ACEITO. `entregue: false` não é falha:
 * é o provedor avisando que não sabe mandar aquilo, e o chamador tem que cair
 * pro texto numerado em vez de deixar o cliente sem nada.
 */
export type ResultadoRico = { entregue: true; id: string | null } | { entregue: false }

/** Corta no limite sem cortar no meio de um par substituto de emoji. */
export function cortarTitulo(texto: string, limite: number): string {
  const limpo = texto.trim()
  const letras = [...limpo]
  if (letras.length <= limite) return limpo
  return `${letras.slice(0, limite - 1).join('').trimEnd()}…`
}

// ─── Telefone e conversa ────────────────────────────────────────────────────

/**
 * O WhatsApp identifica conversa por "chatId": DDI+DDD+número + "@c.us".
 * O CRM guarda o telefone como o usuário digitou, então normalizar aqui é o
 * que evita "mandei e não chegou" por causa de um parêntese.
 */
export function paraChatId(telefone: string): string {
  if (telefone.includes('@')) return telefone
  const so = telefone.replace(/\D/g, '')
  // Número brasileiro sem DDI vem com 10 (fixo) ou 11 (celular) dígitos.
  const comDdi = so.length <= 11 ? `55${so}` : so
  return `${comDdi}@c.us`
}

/** O caminho inverso: do chatId de volta pro telefone do CRM. */
export function paraTelefone(chatId: string): string {
  return chatId.split('@')[0] ?? chatId
}

/** Só os dígitos, que é como as APIs modernas querem o destinatário. */
export function soDigitos(telefone: string): string {
  return telefone.replace(/\D/g, '')
}

/**
 * O mesmo id de mensagem, escrito do mesmo jeito nos dois caminhos.
 *
 * Um provedor pode responder ao ENVIO com um id e mandar o mesmo id de volta
 * pelo webhook com um sufixo. Guardar as duas formas faria o índice único não
 * reconhecer o eco do próprio envio — e cada mensagem enviada apareceria duas
 * vezes na conversa.
 */
export function normalizarIdDeMensagem(id: string): string {
  return id.replace(/_out$/, '')
}

/**
 * O WhatsApp está migrando o endereçamento de `@c.us` (o telefone) pra `@lid`
 * (um id interno que NÃO é telefone). Numa conta já migrada, TODA conversa
 * individual chega como `@lid` — filtrar por "termina em @c.us" descarta o
 * atendimento inteiro achando que é grupo.
 *
 * Então a regra é pelo avesso: recusa o que comprovadamente não é atendimento
 * e aceita o resto.
 *   @g.us            grupo
 *   status@broadcast o "status" do WhatsApp
 *   @newsletter      canal
 */
export function ehConversaIndividual(chatId: string): boolean {
  if (!chatId.includes('@')) return false
  if (chatId === 'status@broadcast') return false
  // `0@c.us` é a conta oficial do próprio WhatsApp (avisos de segurança,
  // mudança de número). Não é cliente, e entrava na lista como uma conversa
  // chamada "WhatsApp" com telefone "0".
  if (chatId.startsWith('0@')) return false
  const dominio = chatId.split('@')[1] ?? ''
  return dominio !== 'g.us' && dominio !== 'broadcast' && dominio !== 'newsletter'
}

/** O mínimo de logger que os clientes usam. Evita arrastar o tipo do Fastify. */
export interface Registro {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
}

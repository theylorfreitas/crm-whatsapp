import {
  cortarTitulo,
  ehConversaIndividual,
  LIMITE_DA_LINHA,
  LIMITE_DO_TITULO,
  MAX_BOTOES,
  paraTelefone,
  soDigitos,
  type CRMStatus,
  type Botao,
  type ConversaDoAparelho,
  type LinhaDaLista,
  type MensagemDoAparelho,
  type ResultadoRico,
  type SituacaoDaSessao,
} from './zap.js'

// A UAZAPI — o provedor não oficial que ENTREGA BOTÃO.
//
// POR QUE ELE SUBSTITUIU O provedor antigo. Botão pelo provedor antigo não chega. Isso foi medido
// três vezes, com as formas lado a lado pro mesmo número: o texto chegava ao
// aparelho, a lista travava no servidor e o botão não deixava rastro. Dali eu
// concluí que o CANAL não oficial descartava interativo — e estava errado. A
// conclusão era maior que a medida.
//
// O que a derrubou: uma plataforma concorrente manda botão por QR Code todo dia, e não
// usa provedor antigo, usa esta API. Medimos igual — instância nova, número pareado por
// QR, três mensagens pro mesmo aparelho: texto, botões e botão de copiar. OS
// TRÊS CHEGARAM, tocáveis.
//
// O que não é entregue é a implementação do provedor antigo (um `nativeFlowMessage`
// embrulhado em `viewOnceMessage`), não o formato.
//
// O JEITO DELA DE PEDIR BOTÃO. Onde o provedor antigo queria array de objetos com tipo,
// aqui é STRING com separador `|`:
//
//   resposta   "Ver os planos|plano"
//   link       "Site|https://exemplo.com"
//   telefone   "Ligar|call:+5511999999999"
//   copiar     "COPIAR PIX|copy:chave-aqui"
//
// String errada não dá erro: vira botão com rótulo torto, ou botão de resposta
// onde devia ser link. O cliente toca e acontece a coisa errada, calado. Por
// isso a tradução mora num lugar só, `paraChoice`, e é conferida.

const TIMEOUT_MS = 20_000

/**
 * O que o aparelho do cliente mostra enquanto o fluxo espera.
 *
 * São dois porque o WhatsApp só tem dois, e a diferença é o que separa uma
 * pausa CRÍVEL de uma pausa esquisita: ninguém DIGITA um áudio. Uma nota de voz
 * antecedida de "digitando…" entrega o robô mais do que a pausa disfarça.
 */
export type Presenca = 'composing' | 'recording'

/** Onde a instância vive e por qual token ela responde. */
export interface ContaUazapi {
  /** Cada instância mora num servidor: https://seunome.uazapi.com, etc. */
  servidor: string
  token: string
}

export class UazapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo?: unknown,
  ) {
    super(message)
    this.name = 'UazapiError'
  }
}

/**
 * O rótulo mais o destino, no formato que a uazapi entende.
 *
 * O separador é `|`, então rótulo com `|` dentro quebraria a opção em duas. É
 * trocado por `/` — perder um traço vertical é melhor que mandar um botão que
 * não faz o que diz.
 */
export function paraChoice(botao: Botao): string {
  const rotulo = cortarTitulo(botao.text, LIMITE_DO_TITULO).replaceAll('|', '/')

  switch (botao.type) {
    case 'url':
      return botao.url ? `${rotulo}|${botao.url}` : rotulo
    case 'call':
      return botao.phoneNumber ? `${rotulo}|call:${botao.phoneNumber}` : rotulo
    case 'copy':
      return botao.copyCode ? `${rotulo}|copy:${botao.copyCode}` : rotulo
    default:
      // Sem id, a uazapi usa o próprio texto como id. Funciona, mas dois
      // botões com o mesmo rótulo ficariam indistinguíveis na volta — por isso
      // o id do desenho vai junto sempre que existe.
      return botao.id ? `${rotulo}|${botao.id}` : rotulo
  }
}

/**
 * O id da mensagem sem o prefixo do dono.
 *
 * A uazapi devolve `5500000000000:AC3563F2…` no campo `id` e só o rabo em
 * `messageid`. Guardar ora um ora outro faria o índice único não reconhecer o
 * eco do próprio envio, e cada mensagem enviada apareceria duas vezes.
 */
export function idLimpo(id: string | null | undefined): string | null {
  if (!id) return null
  const partes = id.split(':')
  return partes.length > 1 ? partes.slice(1).join(':') : id
}

/** Como a uazapi nomeia o tipo de mídia, a partir do nosso. */
type TipoDeMidia = 'image' | 'video' | 'audio' | 'document'

/** O registro cru de uma mensagem, como `/message/find` e o webhook entregam. */
interface RegistroDeMensagem {
  messageid?: string
  id?: string
  fromMe?: boolean
  text?: string
  content?: { text?: string; caption?: string; mimetype?: string; fileName?: string; title?: string }
  messageTimestamp?: number
  fileURL?: string
  messageType?: string
}

/**
 * Os tipos de mensagem que carregam arquivo.
 *
 * Comparação em minúsculo porque o mesmo provedor escreve `AudioMessage` na
 * listagem do histórico e `audioMessage` no webhook. Casar exato faria a mídia
 * entrar por um caminho e sumir pelo outro, que é o tipo de diferença que
 * ninguém percebe até a conversa antiga chegar sem foto.
 */
const TIPOS_COM_ARQUIVO = ['image', 'video', 'audio', 'sticker', 'document', 'ptt', 'album']

export function temMidia(messageType: string | null | undefined): boolean {
  if (!messageType) return false
  const t = messageType.toLowerCase()
  return TIPOS_COM_ARQUIVO.some((p) => t.startsWith(p))
}

/** É figurinha? Ela chega como `image/webp` e sem isto viraria foto. */
export function ehFigurinha(messageType: string | null | undefined): boolean {
  return (messageType ?? '').toLowerCase().startsWith('sticker')
}

/**
 * O mimetype sem os parâmetros: `audio/ogg; codecs=opus` vira `audio/ogg`.
 * O que vem depois do `;` não é tipo, e passar isso adiante faria a extensão do
 * arquivo no Storage sair com o codec grudado no nome.
 */
function limparMimetype(cru: string | null | undefined): string | null {
  const limpo = (cru ?? '').split(';')[0]?.trim()
  return limpo ? limpo : null
}

/**
 * O texto visível da mensagem.
 *
 * Foto e vídeo trazem a legenda em `content.caption`, e documento traz o nome
 * do arquivo em `content.fileName` — nenhum dos dois cai em `text`. Sem isto, a
 * bolha de uma foto legendada aparece muda e o documento vira "Documento".
 */
function textoDaMensagem(m: RegistroDeMensagem): string {
  return (m.text || m.content?.text || m.content?.caption || m.content?.fileName || m.content?.title || '').trim()
}

/**
 * O RÓTULO que a pessoa tocou, quando a mensagem é resposta a um interativo.
 *
 * Este campo já custou dois consertos, então vale escrever por quê.
 *
 * O rótulo NÃO vem em `text` — ali chega string VAZIA. Cada tipo de resposta
 * esconde o texto num lugar diferente, e isto aqui foi capturado do provedor
 * de verdade, não deduzido:
 *
 *   ButtonsResponseMessage      content.Response.SelectedDisplayText
 *   TemplateButtonReplyMessage  content.selectedDisplayText   (s minúsculo)
 *   ListResponseMessage         content.Title
 *
 * E a uazapi normaliza os três em `vote`, no topo. É por ele que se começa: é
 * o único que não depende de adivinhar a caixa de cada tipo. Os outros ficam
 * como rede, para o caso de `vote` não vir.
 *
 * Devolve string vazia quando a mensagem não é resposta a interativo — aí quem
 * chama usa o texto digitado, que é o caminho normal.
 */
export function rotuloDaResposta(m: Record<string, unknown>): string {
  const c = (m.content ?? {}) as Record<string, unknown>
  const resposta = c.Response as { SelectedDisplayText?: string } | undefined
  const candidatos = [m.vote, resposta?.SelectedDisplayText, c.selectedDisplayText, c.SelectedDisplayText, c.Title]
  for (const x of candidatos) {
    if (typeof x === "string" && x.trim()) return x.trim()
  }
  // A REDE QUE NÃO DEPENDE DO NOME DO CAMPO. Ver `rotuloDoMenuCitado`.
  return rotuloDoMenuCitado(m)
}

/**
 * O rótulo lido DO MENU QUE FOI CITADO na resposta.
 *
 * É a única fonte que não depende de a uazapi continuar chamando o campo do
 * mesmo jeito, e por isso ela é a garantia da regra "a resposta é o texto que a
 * pessoa apertou". A lista acima já foi reescrita duas vezes porque o provedor
 * guarda o rótulo num lugar diferente para cada tipo de interativo; a terceira
 * vez não precisa acontecer.
 *
 * Funciona porque a resposta a um botão CARREGA o menu inteiro junto, no
 * `contextInfo.quotedMessage`: os pares id → rótulo estão ali, exatamente como
 * a pessoa os leu na tela. Sabendo qual id ela tocou, o rótulo é uma consulta,
 * não um palpite.
 */
export function rotuloDoMenuCitado(m: Record<string, unknown>): string {
  const c = (m.content ?? {}) as Record<string, unknown>
  const id = primeiroTexto([m.buttonOrListid, c.selectedID, c.selectedId, c.SelectedID])
  if (!id) return ''

  const contexto = c.contextInfo as { quotedMessage?: unknown } | undefined
  if (!contexto?.quotedMessage) return ''

  return opcoesDoMenu(contexto.quotedMessage, new Map()).get(id) ?? ''
}

function primeiroTexto(valores: unknown[]): string {
  for (const v of valores) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * Todo par id → rótulo que dá pra achar dentro de um menu.
 *
 * VARRE EM VEZ DE NAVEGAR. O caminho até os botões é diferente em cada formato
 * (`NativeFlowMessage`, `buttonsMessage`, `listMessage`) e mudou pelo menos uma
 * vez sem aviso. Escrever o caminho fixo de cada um é assinar o próximo
 * conserto; procurar pelo FORMATO DO PAR, onde quer que ele esteja, sobrevive à
 * mudança de caminho.
 *
 * A profundidade tem teto porque estas mensagens citam mensagens, que citam
 * mensagens: sem limite, uma conversa longa de botões viraria uma varredura
 * cara dentro do webhook.
 */
function opcoesDoMenu(no: unknown, achados: Map<string, string>, profundidade = 0): Map<string, string> {
  if (!no || typeof no !== 'object' || profundidade > 8) return achados

  if (Array.isArray(no)) {
    for (const x of no) opcoesDoMenu(x, achados, profundidade + 1)
    return achados
  }

  const o = no as Record<string, unknown>

  // NativeFlowMessage: o par vem espremido num JSON DENTRO de uma string.
  if (typeof o.buttonParamsJSON === 'string') {
    try {
      const p = JSON.parse(o.buttonParamsJSON) as Record<string, unknown>
      const id = primeiroTexto([p.id])
      const texto = primeiroTexto([p.display_text, p.displayText, p.title])
      if (id && texto) achados.set(id, texto)
    } catch {
      // botão sem par utilizável; os outros continuam valendo
    }
  }

  // buttonsMessage clássico: id ao lado de um objeto com o texto.
  const rotuloDoBotao = o.buttonText as { displayText?: unknown } | undefined
  const idDoBotao = primeiroTexto([o.buttonId])
  if (idDoBotao) {
    const texto = primeiroTexto([rotuloDoBotao?.displayText, o.displayText])
    if (texto) achados.set(idDoBotao, texto)
  }

  // listMessage: cada linha da lista.
  const idDaLinha = primeiroTexto([o.rowId, o.RowID])
  if (idDaLinha) {
    const texto = primeiroTexto([o.title, o.Title])
    if (texto) achados.set(idDaLinha, texto)
  }

  for (const v of Object.values(o)) opcoesDoMenu(v, achados, profundidade + 1)
  return achados
}

/**
 * O QUE A BOLHA MOSTRA, seja a mensagem lida agora ou relida do histórico.
 *
 * Um lugar só, e é o ponto do conserto: `lerRecebida` já sabia ler a resposta de
 * um botão, e `listarMensagens` não — ela usava só o texto digitado. Resultado:
 * a mesma resposta aparecia certa quando chegava pelo webhook e virava BOLHA EM
 * BRANCO quando a conversa era reimportada, que é o que acontece toda vez que o
 * caminho de volta esteve fora do ar. Duas funções para a mesma pergunta é o
 * tipo de coisa que só desencontra.
 */
export function textoVisivel(m: Record<string, unknown>): string {
  return rotuloDaResposta(m) || textoDaMensagem(m as RegistroDeMensagem)
}

/**
 * O nome do contato, na ordem em que ele é útil.
 *
 * `||` e não `??` de propósito: a uazapi manda `name: ""` — string VAZIA, não
 * nula — para quem não foi renomeado na agenda. Com `??`, o vazio ganhava de
 * `wa_contactName` e a lista de conversas inteira ficava sem nome nenhum.
 */
export function nomeDaConversa(c: {
  wa_contactName?: string
  wa_name?: string
  lead_name?: string
  lead_fullName?: string
  name?: string
}): string | null {
  return (c.wa_contactName || c.lead_name || c.lead_fullName || c.wa_name || c.name || '').trim() || null
}

export class Uazapi {
  constructor(private readonly buscar: typeof fetch = fetch) {}

  private async chamar(conta: ContaUazapi, caminho: string, corpo?: unknown): Promise<unknown> {
    const corte = AbortSignal.timeout(TIMEOUT_MS)
    const r = await this.buscar(`${conta.servidor.replace(/\/$/, '')}${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { token: conta.token, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: corte,
    })

    const texto = await r.text()
    let dados: unknown
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = texto
    }

    if (!r.ok) throw new UazapiError(`uazapi ${caminho} respondeu ${r.status}`, r.status, dados)
    return dados
  }

  private idDa(resposta: unknown): string | null {
    const r = resposta as { id?: string; messageid?: string } | null
    return idLimpo(r?.messageid ?? r?.id)
  }

  async vivo(conta: ContaUazapi): Promise<boolean> {
    try {
      await this.chamar(conta, '/instance/status')
      return true
    } catch {
      return false
    }
  }

  /** Como está a instância: pareada, esperando QR, caída. */
  async situacao(conta: ContaUazapi): Promise<SituacaoDaSessao> {
    const d = (await this.chamar(conta, '/instance/status')) as {
      instance?: { status?: string; owner?: string; profileName?: string }
      status?: { loggedIn?: boolean; jid?: string }
    }
    const cru = d.instance?.status ?? (d.status?.loggedIn ? 'connected' : 'disconnected')
    const jid = d.status?.jid ?? d.instance?.owner ?? null

    return {
      status: traduzirStatus(cru),
      raw: cru,
      // O jid vem "5521999999999:9@s.whatsapp.net": o número é o começo.
      phone: jid ? (/^\d+/.exec(jid)?.[0] ?? null) : null,
      deviceName: d.instance?.profileName ?? null,
    }
  }

  /** Pede o QR Code do pareamento. Devolve data URI, como a tela espera. */
  async qr(conta: ContaUazapi): Promise<string | null> {
    const d = (await this.chamar(conta, '/instance/connect', {})) as {
      instance?: { qrcode?: string }
      qrcode?: string
    }
    const qr = d.instance?.qrcode ?? d.qrcode ?? null
    if (!qr) return null
    return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`
  }

  async desconectar(conta: ContaUazapi): Promise<void> {
    await this.chamar(conta, '/instance/disconnect', {})
  }

  /**
   * O endereço do webhook LIGADO nesta instância, ou `null` se não há nenhum.
   *
   * Devolve a URL, e não um sim/não, porque webhook PRESENTE não é a mesma
   * coisa que webhook CERTO. Em desenvolvimento a ponte fica atrás de um túnel
   * cujo endereço muda a cada vez que ele sobe: o webhook antigo continua lá,
   * ligado, apontando pra um endereço morto. Quem só perguntasse "existe?"
   * responderia que sim — e o número seguiria mudo, que é o pior estado deste
   * canal, porque nada nele dá erro.
   */
  async webhookAtual(conta: ContaUazapi): Promise<string | null> {
    const d = await this.chamar(conta, '/webhook')
    const lista = Array.isArray(d) ? d : d ? [d] : []
    const vivo = lista.find((w) => (w as { enabled?: boolean })?.enabled !== false && !!(w as { url?: string })?.url)
    return (vivo as { url?: string } | undefined)?.url ?? null
  }

  // ─── Envio ────────────────────────────────────────────────────────────────

  async enviarTexto(conta: ContaUazapi, telefone: string, texto: string): Promise<string | null> {
    const r = await this.chamar(conta, '/send/text', { number: soDigitos(telefone), text: texto })
    return this.idDa(r)
  }

  /**
   * "digitando…" ou "gravando áudio…" no aparelho do cliente.
   *
   * OS DOIS VALORES SÃO OS QUE O PROVEDOR ACEITA, medido e não deduzido: a
   * uazapi valida o campo e devolve 400 "Invalid presence value" para qualquer
   * outra coisa. `composing` e `recording` passam.
   *
   * Aqui não é uma chamada que dura: avisa-se o estado com um prazo, e quem
   * espera é o motor do fluxo. Presença é enfeite — falhar não pode impedir a
   * mensagem de sair, por isso o erro é engolido.
   */
  async presenca(conta: ContaUazapi, telefone: string, ms: number, tipo: Presenca = 'composing'): Promise<void> {
    await this.chamar(conta, '/message/presence', {
      number: soDigitos(telefone),
      presence: tipo,
      delay: Math.max(0, ms),
    }).catch(() => {})
  }

  /** OS BOTÕES. É por isto que este arquivo existe. */
  async enviarBotoes(
    conta: ContaUazapi,
    telefone: string,
    conteudo: { corpo: string; rodape?: string; imagemUrl?: string; botoes: Botao[] },
  ): Promise<ResultadoRico> {
    if (conteudo.botoes.length === 0 || conteudo.botoes.length > MAX_BOTOES) return { entregue: false }

    const corpo: Record<string, unknown> = {
      number: soDigitos(telefone),
      type: 'button',
      text: conteudo.corpo,
      choices: conteudo.botoes.map(paraChoice),
    }
    if (conteudo.rodape?.trim()) corpo.footerText = conteudo.rodape
    if (conteudo.imagemUrl) corpo.imageButton = conteudo.imagemUrl

    const r = await this.chamar(conta, '/send/menu', corpo)
    return { entregue: true, id: this.idDa(r) }
  }

  /** A lista, pro menu que não cabe em três botões. */
  async enviarLista(
    conta: ContaUazapi,
    telefone: string,
    conteudo: { texto: string; textoDoBotao: string; rodape?: string; linhas: LinhaDaLista[] },
  ): Promise<ResultadoRico> {
    if (conteudo.linhas.length === 0) return { entregue: false }

    // Na lista o formato é "título|descrição|id". O id só é lido na terceira
    // posição, então a descrição precisa existir como campo mesmo vazia.
    const choices = conteudo.linhas.map((l) => {
      const titulo = cortarTitulo(l.title, LIMITE_DA_LINHA).replaceAll('|', '/')
      const descricao = (l.description ?? '').replaceAll('|', '/')
      return l.rowId ? `${titulo}|${descricao}|${l.rowId}` : `${titulo}|${descricao}`
    })

    const corpo: Record<string, unknown> = {
      number: soDigitos(telefone),
      type: 'list',
      text: conteudo.texto,
      listButton: conteudo.textoDoBotao,
      choices,
    }
    if (conteudo.rodape?.trim()) corpo.footerText = conteudo.rodape

    const r = await this.chamar(conta, '/send/menu', corpo)
    return { entregue: true, id: this.idDa(r) }
  }

  /** A enquete continua existindo: serve a menu grande onde a lista incomoda. */
  async enviarEnquete(
    conta: ContaUazapi,
    telefone: string,
    pergunta: string,
    opcoes: string[],
  ): Promise<ResultadoRico> {
    if (opcoes.length < 2) return { entregue: false }
    const r = await this.chamar(conta, '/send/menu', {
      number: soDigitos(telefone),
      type: 'poll',
      text: pergunta,
      choices: opcoes,
      selectableCount: 1,
    })
    return { entregue: true, id: this.idDa(r) }
  }

  async enviarMidiaPorUrl(
    conta: ContaUazapi,
    telefone: string,
    url: string,
    tipo: TipoDeMidia,
    legenda?: string,
  ): Promise<string | null> {
    const r = await this.chamar(conta, '/send/media', {
      number: soDigitos(telefone),
      type: tipo,
      file: url,
      text: legenda ?? '',
    })
    return this.idDa(r)
  }

  /**
   * Mídia que veio do navegador, em bytes.
   *
   * A uazapi aceita base64 no mesmo campo `file` — não há rota separada. Isso
   * evita ter que hospedar o arquivo em algum lugar público só pra mandar.
   */
  async enviarMidiaPorBytes(
    conta: ContaUazapi,
    telefone: string,
    bytes: Buffer,
    mimetype: string,
    tipo: TipoDeMidia,
    legenda?: string,
    nome?: string,
  ): Promise<string | null> {
    const r = await this.chamar(conta, '/send/media', {
      number: soDigitos(telefone),
      type: tipo,
      file: `data:${mimetype};base64,${bytes.toString('base64')}`,
      docName: nome,
      text: legenda ?? '',
    })
    return this.idDa(r)
  }

  // ─── Leitura, pra importação do histórico ─────────────────────────────────

  async listarConversas(conta: ContaUazapi, limite: number): Promise<ConversaDoAparelho[]> {
    const d = (await this.chamar(conta, '/chat/find', { limit: limite })) as {
      chats?: {
        wa_chatid?: string
        phone?: string
        name?: string
        wa_name?: string
        wa_contactName?: string
        lead_name?: string
        lead_fullName?: string
        wa_isGroup?: boolean
      }[]
    }
    return (d.chats ?? [])
      .filter((c) => typeof c.wa_chatid === 'string' && ehConversaIndividual(c.wa_chatid))
      .map((c) => ({
        chatId: c.wa_chatid!,
        nome: nomeDaConversa(c),
        grupo: c.wa_isGroup === true,
        telefone: c.phone ? soDigitos(c.phone) : null,
      }))
  }

  async listarMensagens(conta: ContaUazapi, chatId: string, limite: number): Promise<MensagemDoAparelho[]> {
    const d = (await this.chamar(conta, '/message/find', { chatid: chatId, limit: limite })) as {
      messages?: RegistroDeMensagem[]
    }
    return (d.messages ?? []).map((m) => ({
      externalId: idLimpo(m.messageid ?? m.id),
      fromMe: m.fromMe === true,
      // `textoVisivel`, e não `textoDaMensagem`: a resposta a um botão tem
      // `text` VAZIO, e o histórico reimportado enchia a conversa de bolhas em
      // branco no lugar de "Começar demonstração".
      texto: textoVisivel(m as unknown as Record<string, unknown>),
      // Vem em milissegundos; o resto da ponte trabalha em segundos.
      timestamp: Math.floor((m.messageTimestamp ?? 0) / 1000),
      mediaUrl: m.fileURL || null,
      mediaMimetype: limparMimetype(m.content?.mimetype),
      // O id COM o prefixo do dono: é o que `/message/download` aceita. O
      // `idLimpo` serve pro banco, não pra falar com o provedor.
      mediaId: temMidia(m.messageType) ? (m.id ?? m.messageid ?? null) : null,
      tipoCru: m.messageType ?? null,
    }))
  }

  /**
   * Os BYTES de uma mídia, pedidos pelo id da mensagem.
   *
   * Por que não basta a URL: o que `/message/find` e o webhook entregam em
   * `content.URL` é um `.enc` no CDN do WhatsApp, cifrado com a `mediaKey` da
   * conversa. Baixar aquele endereço devolve 200 e lixo — uma foto que não
   * abre, que é pior do que foto nenhuma, porque parece que funcionou.
   *
   * Esta rota é a que decifra: devolve um endereço no servidor da própria
   * uazapi, já em claro, junto do mimetype real.
   */
  async urlDaMidia(conta: ContaUazapi, mediaId: string): Promise<{ url: string; mimetype: string | null } | null> {
    try {
      const d = (await this.chamar(conta, '/message/download', { id: mediaId })) as {
        fileURL?: string
        mimetype?: string
      }
      if (!d?.fileURL) return null
      return { url: d.fileURL, mimetype: limparMimetype(d.mimetype) }
    } catch {
      // Mídia que o WhatsApp já apagou do servidor responde 404 aqui. É o caso
      // comum em conversa antiga, e não pode derrubar a importação.
      return null
    }
  }

  /** O nome e a foto do contato, pro CRM não mostrar só um número. */
  async dadosDoContato(conta: ContaUazapi, telefone: string): Promise<{ nome: string | null; foto: string | null }> {
    try {
      const d = (await this.chamar(conta, '/chat/details', { number: soDigitos(telefone) })) as {
        name?: string
        wa_name?: string
        wa_contactName?: string
        image?: string
        imagePreview?: string
      }
      return {
        nome: d.name || d.wa_contactName || d.wa_name || null,
        foto: d.image || d.imagePreview || null,
      }
    } catch {
      // Contato sem perfil visível é comum e não é erro.
      return { nome: null, foto: null }
    }
  }
}

/** O bruto do provedor traduzido pro vocabulário do CRM. */
export function traduzirStatus(cru: string): CRMStatus {
  switch (cru) {
    case 'connected':
      return 'connected'
    case 'connecting':
    case 'qrcode':
    case 'pairing':
      return 'connecting'
    default:
      // disconnected, e qualquer estado novo que a uazapi inventar. Tratar o
      // desconhecido como desconectado é o lado seguro: no máximo pede pra
      // reconectar, em vez de mostrar "conectada" e não entregar nada.
      return 'disconnected'
  }
}

/**
 * O que chegou, lido do webhook da uazapi.
 *
 * O TOQUE NUM BOTÃO volta com o rótulo em `text` e o id em `buttonOrListid`, e
 * os dois são necessários para coisas DIFERENTES:
 *
 *   o id      — pro motor casar a resposta. É ele que permite dois botões com
 *               o mesmo rótulo sem virar ambiguidade.
 *   o rótulo  — pra tela. É o que a pessoa leu e tocou.
 *
 * Durante um tempo houve um campo só, com o id dentro, e ele ia para os dois
 * lados. O motor funcionava e a conversa ficava ilegível: onde o cliente tinha
 * tocado em "Achei caro", o atendente lia `o_9xday7pi`.
 */
export interface RecebidaUazapi {
  externalId: string | null
  chatId: string
  telefone: string
  /**
   * O que o MOTOR casa: o id do botão quando houve toque, senão o texto
   * digitado. Não use isto na tela — ver `rotulo`.
   */
  texto: string
  /**
   * O que a PESSOA leu e tocou, ou digitou. É isto que vira o corpo da
   * mensagem no CRM e o que o atendente enxerga na conversa.
   */
  rotulo: string
  /**
   * Foi TOQUE em botão/lista, e não texto digitado?
   *
   * Importa porque o botão do WhatsApp continua tocável pra sempre — inclusive
   * dias depois de o atendimento ter fechado. Um toque que chega tarde merece
   * resposta; a mesma frase digitada, não necessariamente.
   */
  doBotao: boolean
  nome: string | null
  fromMe: boolean
  grupo: boolean
  mediaUrl: string | null
  /** Ver `MensagemDoAparelho.mediaId`: o webhook tem o mesmo problema do `.enc`. */
  mediaId: string | null
  mediaMimetype: string | null
  /** O tipo cru do provedor, que é o que separa figurinha de foto. */
  tipoCru: string | null
  timestamp: number
}

/**
 * O envelope que a uazapi manda, capturado do fluxo de eventos de verdade:
 *
 *   { BaseUrl, EventType, chat, chatSource, instanceName, message, owner, token }
 *
 * `EventType` vale 'messages', 'messages_update', 'chats' ou 'connection'. Só o
 * primeiro é mensagem nova — 'messages_update' é recibo de leitura e edição, e
 * tratá-lo como mensagem duplicaria a conversa inteira.
 */
export interface EnvelopeUazapi {
  EventType?: string
  message?: Record<string, unknown>
  owner?: string
  instanceName?: string
  token?: string
}

export function lerRecebida(evento: unknown): RecebidaUazapi | null {
  const e = evento as (EnvelopeUazapi & { messages?: Record<string, unknown> }) | null
  const m = (e?.message ?? e?.messages) as Record<string, unknown> | undefined
  if (!m) return null

  const chatId = (m.chatid ?? m.chatId) as string | undefined
  if (typeof chatId !== 'string' || !chatId) return null

  const doBotao = (m.buttonOrListid as string | undefined)?.trim()
  const digitado = textoDaMensagem(m as RegistroDeMensagem)
  const tipoCru = (m.messageType as string | undefined) ?? null

  // O WhatsApp está migrando o endereçamento pra `@lid`, que NÃO é telefone.
  // A uazapi manda o telefone de verdade em `sender_pn`; sem ele, o CRM
  // gravaria o id interno em `phone` e a resposta não teria pra onde ir.
  const pn = (m.sender_pn as string | undefined) ?? ''
  const doLid = chatId.includes('@lid') && pn ? paraTelefone(pn) : null

  return {
    externalId: idLimpo((m.messageid as string) ?? (m.id as string)),
    chatId,
    telefone: doLid ?? paraTelefone(chatId),
    // O toque no botão volta com o rótulo em `text` e o id em `buttonOrListid`.
    // Cada um vai pro seu lado: o id pro motor casar, o rótulo pra tela.
    texto: doBotao || digitado,
    // O rótulo é o que a pessoa LEU no aparelho, e é ele que vira o corpo da
    // mensagem no CRM. A resposta a um interativo vem com `text` VAZIO, então
    // a primeira tentativa é o campo próprio dela — ver `rotuloDaResposta`.
    // Cair no id é o último recurso: é feio, mas bolha em branco é pior,
    // porque ninguém saberia que houve resposta.
    // A REGRA: o corpo da mensagem é o TEXTO QUE A PESSOA APERTOU. Os campos do
    // provedor vêm primeiro, o menu citado é a rede que não depende do nome
    // deles, e o id só entra se as duas falharem — feio, mas bolha em branco é
    // pior, porque ninguém saberia que houve resposta.
    rotulo: rotuloDaResposta(m) || digitado || doBotao || "",
    doBotao: !!doBotao,
    nome: (m.senderName as string) || null,
    fromMe: m.fromMe === true,
    grupo: m.isGroup === true,
    mediaUrl: (m.fileURL as string) || null,
    mediaId: temMidia(tipoCru) ? ((m.id as string) ?? (m.messageid as string) ?? null) : null,
    mediaMimetype: limparMimetype((m.content as { mimetype?: string } | undefined)?.mimetype),
    tipoCru,
    timestamp: Math.floor(((m.messageTimestamp as number) ?? Date.now()) / 1000),
  }
}

/**
 * Este evento é uma mensagem NOVA?
 *
 * `messages_update` chega a cada recibo de leitura e a cada edição, com o mesmo
 * envelope e a mesma mensagem dentro. Tratar isso como mensagem faria a
 * conversa encher de repetições e — pior — o motor de fluxo responderia de novo
 * a cada vez que o cliente ABRISSE a conversa.
 */
export function ehMensagemNova(evento: unknown): boolean {
  return (evento as EnvelopeUazapi | null)?.EventType === 'messages'
}

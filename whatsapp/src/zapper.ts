import type { Canais } from './canais.js'
import { Uazapi, UazapiError, type ContaUazapi, type Presenca } from './uazapi.js'
import { paraTelefone, soDigitos, type ConversaDoAparelho, type LinhaDaLista, type MensagemDoAparelho, type ResultadoRico, type Botao, type Registro, type SituacaoDaSessao } from './zap.js'

// FALAR COM O WHATSAPP DE UMA CONEXÃO, SABENDO SÓ O NOME DELA.
//
// POR QUE ESTA CAMADA EXISTE. O motor de fluxos, o disparo em massa e a
// importação sempre falaram em "sessão": recebem o identificador da conexão e
// mandam mensagem. Isso continua certo — eles não têm nada a ver com QUAL
// provedor está atrás, e não deviam mesmo.
//
// Só que a uazapi é sem estado: cada chamada precisa do servidor e do token
// DAQUELA instância. Repassar isso pra dentro do motor espalharia credencial
// por três arquivos que não deveriam nem saber que ela existe.
//
// Então esta fachada faz a ponte: recebe a sessão, pergunta ao `Canais` de quem
// ela é, e chama o cliente. Uma peça só sabendo o segredo, e o resto do sistema
// continuou falando a mesma língua que já falava.

/** Levantada quando a conexão não está pareada. Quem chama decide o que dizer. */
export class SemConexaoError extends Error {
  constructor(readonly sessao: string) {
    super(`A conexão "${sessao}" não está conectada ao WhatsApp.`)
    this.name = 'SemConexaoError'
  }
}

export class Zapper {
  private readonly uaz = new Uazapi()

  constructor(
    private readonly canais: Canais,
    private readonly log: Registro,
  ) {}

  /** A conta desta sessão, ou o erro que diz que ela não está pareada. */
  private async conta(sessao: string): Promise<ContaUazapi> {
    const canal = await this.canais.canalDe(sessao)
    if (!canal.uazapi) throw new SemConexaoError(sessao)
    return canal.uazapi
  }

  /** Existe conexão pareada nesta sessão? Sem levantar erro. */
  async pareada(sessao: string): Promise<boolean> {
    return !!(await this.canais.canalDe(sessao)).uazapi
  }

  // ─── Envio ────────────────────────────────────────────────────────────────

  async enviarTexto(sessao: string, telefone: string, texto: string): Promise<string | null> {
    return this.uaz.enviarTexto(await this.conta(sessao), telefone, texto)
  }

  async enviarBotoes(
    sessao: string,
    telefone: string,
    conteudo: { corpo: string; cabecalho?: string; rodape?: string; imagemUrl?: string; botoes: Botao[] },
  ): Promise<ResultadoRico> {
    return this.uaz.enviarBotoes(await this.conta(sessao), telefone, conteudo)
  }

  async enviarLista(
    sessao: string,
    telefone: string,
    conteudo: { titulo: string; descricao?: string; textoDoBotao: string; rodape?: string; linhas: LinhaDaLista[] },
  ): Promise<ResultadoRico> {
    // A uazapi não tem "título" separado na lista: o texto principal é o corpo,
    // e o título do desenho entra nele. Jogar o título fora faria o cliente ver
    // um painel de opções sem saber do que se trata.
    const texto = [conteudo.titulo, conteudo.descricao].filter((p) => p?.trim()).join('\n\n')
    return this.uaz.enviarLista(await this.conta(sessao), telefone, {
      texto: texto || conteudo.titulo,
      textoDoBotao: conteudo.textoDoBotao,
      rodape: conteudo.rodape,
      linhas: conteudo.linhas,
    })
  }

  async enviarEnquete(sessao: string, telefone: string, pergunta: string, opcoes: string[]): Promise<ResultadoRico> {
    return this.uaz.enviarEnquete(await this.conta(sessao), telefone, pergunta, opcoes)
  }

  async enviarMidiaPorUrl(
    sessao: string,
    telefone: string,
    url: string,
    kind: string,
    legenda?: string,
  ): Promise<string | null> {
    return this.uaz.enviarMidiaPorUrl(await this.conta(sessao), telefone, url, paraTipo(kind), legenda)
  }

  async enviarMidia(
    sessao: string,
    telefone: string,
    arquivo: { bytes: Buffer; mimetype: string; filename: string; kind: string },
    legenda?: string,
  ): Promise<string | null> {
    return this.uaz.enviarMidiaPorBytes(
      await this.conta(sessao),
      telefone,
      arquivo.bytes,
      arquivo.mimetype,
      paraTipo(arquivo.kind),
      legenda,
      arquivo.filename,
    )
  }

  async presenca(sessao: string, telefone: string, ms: number, tipo: Presenca = 'composing'): Promise<void> {
    // Presença é enfeite: se a conexão caiu, o que precisa falhar é a mensagem,
    // não o aviso de "digitando" ou "gravando".
    const canal = await this.canais.canalDe(sessao)
    if (!canal.uazapi) return
    await this.uaz.presenca(canal.uazapi, telefone, ms, tipo)
  }

  // ─── Estado da sessão ─────────────────────────────────────────────────────

  async situacao(sessao: string): Promise<SituacaoDaSessao> {
    return this.uaz.situacao(await this.conta(sessao))
  }

  async qr(sessao: string): Promise<string | null> {
    return this.uaz.qr(await this.conta(sessao))
  }

  /** Pra onde esta conexão entrega o que chega. Ver `Uazapi.webhookAtual`. */
  async webhookAtual(sessao: string): Promise<string | null> {
    return this.uaz.webhookAtual(await this.conta(sessao))
  }

  async desconectar(sessao: string): Promise<void> {
    const canal = await this.canais.canalDe(sessao)
    if (canal.uazapi) await this.uaz.desconectar(canal.uazapi)
  }

  /**
   * Levanta a sessão de volta depois de uma queda.
   *
   * Na uazapi, "reconectar" é pedir o QR de novo: se o pareamento ainda vale, o
   * aparelho volta sozinho e o código nem chega a ser usado. Se não vale, aí o
   * QR é mesmo necessário — e quem mostra é a tela de Conexões.
   */
  async reconectar(sessao: string): Promise<void> {
    await this.uaz.qr(await this.conta(sessao))
  }

  // ─── Leitura, pra importação ──────────────────────────────────────────────

  async listarConversas(sessao: string, limite: number): Promise<ConversaDoAparelho[]> {
    return this.uaz.listarConversas(await this.conta(sessao), limite)
  }

  async listarMensagens(sessao: string, chatId: string, limite: number): Promise<MensagemDoAparelho[]> {
    return this.uaz.listarMensagens(await this.conta(sessao), chatId, limite)
  }

  /**
   * O telefone de verdade por trás de um chatId.
   *
   * Numa conta com endereçamento novo o chatId é um `@lid`, que NÃO contém
   * telefone. Sem resolver, o CRM gravaria o id interno em `phone` e a resposta
   * não teria pra onde ir.
   */
  async resolverTelefone(sessao: string, chatId: string): Promise<string> {
    const cru = paraTelefone(chatId)
    if (!chatId.includes('@lid')) return soDigitos(cru)

    try {
      const conta = await this.conta(sessao)
      const dados = (await this.uaz.dadosDoContato(conta, cru)) as { nome: string | null; foto: string | null } & {
        telefone?: string
      }
      if (dados.telefone) return soDigitos(dados.telefone)
    } catch (e) {
      this.log.warn({ sessao, chatId, err: String(e) }, 'não deu pra resolver o telefone do @lid')
    }
    return soDigitos(cru)
  }

  async fotoDePerfil(sessao: string, chatId: string): Promise<string | null> {
    try {
      const conta = await this.conta(sessao)
      return (await this.uaz.dadosDoContato(conta, paraTelefone(chatId))).foto
    } catch {
      return null
    }
  }

  /**
   * Baixa uma mídia recebida.
   *
   * A uazapi entrega a mídia numa URL pública — não há rota autenticada como no
   * provedor antigo. Isso simplifica, mas cria uma responsabilidade: a URL vale por tempo
   * limitado, então quem chama tem que guardar o arquivo, não o endereço.
   */
  /**
   * O endereço EM CLARO de uma mídia, pedido pelo id da mensagem.
   *
   * Ver `Uazapi.urlDaMidia`: o que vem no evento é um arquivo cifrado, e só
   * esta rota devolve algo que abre. Falha em silêncio — mídia que o WhatsApp
   * já apagou é o caso normal numa conversa de meses atrás.
   */
  async urlDaMidia(sessao: string, mediaId: string): Promise<{ url: string; mimetype: string | null } | null> {
    try {
      return await this.uaz.urlDaMidia(await this.conta(sessao), mediaId)
    } catch {
      return null
    }
  }

  async baixarMidia(url: string): Promise<{ bytes: Buffer; mimetype: string } | null> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!r.ok) throw new UazapiError(`mídia respondeu ${r.status}`, r.status)
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.length === 0) return null
      return { bytes, mimetype: r.headers.get('content-type') ?? 'application/octet-stream' }
    } catch (e) {
      this.log.warn({ url, err: String(e) }, 'não deu pra baixar a mídia recebida')
      return null
    }
  }
}

/** O tipo de mídia do CRM no vocabulário da uazapi. */
function paraTipo(kind: string): 'image' | 'video' | 'audio' | 'document' {
  if (kind === 'imagem' || kind === 'image') return 'image'
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  return 'document'
}

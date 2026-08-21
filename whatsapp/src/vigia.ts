import type { SupabaseClient } from '@supabase/supabase-js'
import type { FastifyBaseLogger } from 'fastify'
import type { Zapper } from './zapper.js'

// O VIGIA DAS SESSÕES DE QR CODE.
//
// O problema que ele resolve: a sessão cai sozinha — queda de rede, o WhatsApp
// encerrando o pareamento, o servidor do provedor reiniciando. Quando isso
// acontecia, NADA levantava de volta. A tela de Conexões levanta, mas só quando
// alguém a abre; se cair às 3h da manhã, o cliente fica sem atendimento até
// alguém reparar. E o pior sintoma nem é a falta de resposta: é a tela dizer
// "conectada" enquanto o número está fora do ar.
//
// POR QUE ELE É CONSERVADOR. Reconectar demais é o sinal mais forte de
// automação e o caminho curto pro bloqueio do número. Um vigia ingênuo que
// tentasse a cada minuto seria pior que não ter vigia: derrubaria o número de
// vez em vez de recuperá-lo. Por isso a espera DOBRA a cada tentativa que não
// deu certo, e uma sessão que não volta passa a ser tentada de hora em hora,
// não de minuto em minuto.
//
// O que ele NÃO faz: parear número. Reconectar aqui só reaproveita pareamento
// que ainda vale — se o WhatsApp encerrou de vez, quem resolve é uma pessoa
// lendo o QR na tela de Conexões, e o vigia apenas para de insistir.
//
// ELE TAMBÉM CONFERE O CAMINHO DE VOLTA. Uma instância conectada sem webhook
// apontado envia e nunca recebe: o cliente responde, e o CRM não fica
// sabendo. O caso típico é a ponte subir antes de a URL pública
// existir, o pareamento seguiu e a conversa virou monólogo por horas, sem um
// único erro em lugar nenhum. É a falha mais cara que este arquivo cobre,
// porque ela não interrompe nada: só emudece o outro lado.

/** De quanto em quanto tempo ele olha. */
const INTERVALO_MS = 2 * 60_000

/** Primeira espera depois de uma tentativa fracassada. */
const ESPERA_INICIAL_MS = 5 * 60_000

/** Teto da espera. Passado isto, tenta de hora em hora e não desiste. */
const ESPERA_MAXIMA_MS = 60 * 60_000

/**
 * De quanto em quanto tempo o caminho de volta é reconferido.
 *
 * Não é a cada rodada: seriam duas chamadas por conexão a cada dois minutos,
 * e o webhook não some sozinho. Mas também não é uma vez só por subida — a
 * instância pode ser recriada do lado de lá, e aí o webhook vai junto. Meia
 * hora é o maior tempo que vale a pena ficar mudo sem perceber.
 */
const RECONFERIR_A_VOLTA_MS = 30 * 60_000

/** Quantas conferências seguidas precisam falhar antes de a conexão ficar vermelha. */
const QUEBRAS_ATE_MARCAR_ERRO = 2

/**
 * O que a conferência do caminho de volta descobriu.
 *
 * `nao-sei` existe pra separar "está quebrado" de "não deu pra perguntar". Sem
 * essa diferença, um soluço do provedor derrubaria a conexão pra vermelho e
 * pararia o envio de um número que está perfeito.
 */
type Volta = 'ok' | 'quebrado' | 'nao-sei'

/**
 * O que a tela de Conexões passa a mostrar quando o número não tem como receber.
 *
 * Escrito pra quem vai ler no painel, e não pra quem escreveu o código: diz o
 * que está acontecendo com o WhatsApp da pessoa, não o nome do componente que
 * falhou. Sem travessão, que é a regra do texto de tela deste produto.
 */
const DETALHE_SEM_VOLTA =
  'O número está pareado, mas o servidor não consegue receber as mensagens dele. ' +
  'O endereço público de entrega não está respondendo. Enquanto isso, o envio fica parado ' +
  'para ninguém receber resposta que o CRM não vai ver.'

interface Tentativa {
  /** Antes disto, nem tenta. */
  proxima: number
  espera: number
}

export class VigiaDeSessoes {
  private readonly tentativas = new Map<string, Tentativa>()
  /** Sessão → até quando o caminho de volta dela vale sem reconferir. */
  private readonly voltaConferida = new Map<string, number>()
  /** Sessão → quantas conferências seguidas acharam o caminho de volta quebrado. */
  private readonly quebradas = new Map<string, number>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly db: SupabaseClient,
    private readonly zap: Zapper,
    private readonly log: FastifyBaseLogger,
    /**
     * Reaponta o webhook desta conexão. Devolve `false` quando não deu.
     *
     * Injetado em vez de importado porque montar a chamada exige o token de
     * administrador e a URL pública — dois segredos que este arquivo não tem
     * motivo pra conhecer.
     */
    private readonly reapontarWebhook: (conexaoId: string) => Promise<boolean>,
    /**
     * Onde o webhook DEVERIA apontar hoje. `null` quando a ponte não sabe o
     * próprio endereço público — aí não dá pra julgar o que está lá, e o vigia
     * aceita qualquer webhook existente em vez de ficar reapontando às cegas.
     */
    private readonly enderecoEsperado: (conexaoId: string) => string | null,
    /**
     * Esse endereço responde de verdade?
     *
     * COMPARAR TEXTO NÃO BASTA, e é a armadilha deste arquivo. O túnel de
     * desenvolvimento morreu, o endereço morto continuou no ambiente, o webhook
     * gravado na instância continuou igual ao esperado — e a comparação dizia
     * "está tudo certo" sobre dois endereços que não existiam mais. A conexão
     * ficou verde na tela por horas sem receber uma única mensagem.
     */
    private readonly enderecoResponde: (url: string) => Promise<boolean>,
  ) {}

  iniciar(): void {
    if (this.timer) return
    // `unref` pra que este timer não segure o processo vivo no encerramento.
    this.timer = setInterval(() => void this.rodada(), INTERVALO_MS)
    this.timer.unref?.()
    this.log.info({ aCada: `${INTERVALO_MS / 60_000}min` }, 'vigia das sessões de WhatsApp ligado')
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async rodada(): Promise<void> {
    // Só as de QR Code: a conexão oficial não tem sessão pra cair, ela fala
    // direto com a Meta.
    //
    // O 'desconectada' ENTRA na busca, e isso não contradiz o parágrafo lá de
    // cima: quem desconectou de propósito também desconectou no provedor, e o
    // provedor vai dizer isso — não há o que ressuscitar. Quem está aqui é o
    // caso oposto, o número que pareou e o banco não ficou sabendo: a tela em
    // vermelho num WhatsApp que funciona. Aconteceu, e ficou assim até alguém
    // ir olhar na mão.
    const { data: conexoes, error } = await this.db
      .from('crm_connections')
      .select('id, name, instance_id, status')
      .eq('kind', 'uazapi')
      // 'erro' PRECISA ESTAR AQUI, e a falta dele foi uma porta de mão única:
      // o vigia marcava a conexão em erro quando o caminho de volta caía e, na
      // rodada seguinte, ela já não aparecia nesta busca. Ninguém voltava para
      // olhar. O túnel subia de novo, o webhook estava certo, o número
      // funcionava, e a tela seguia vermelha com o envio travado até alguém
      // mexer na mão. Quem escreve um estado é obrigado a saber sair dele.
      .in('status', ['conectada', 'conectando', 'desconectada', 'erro'])
      .limit(200)

    if (error) {
      this.log.error({ err: error }, 'vigia não conseguiu ler as conexões')
      return
    }

    for (const c of conexoes ?? []) {
      const sessao = c.instance_id ?? c.id
      try {
        await this.conferir(sessao, c.id, c.name, c.status)
      } catch (e) {
        this.log.error({ err: e, sessao }, 'vigia falhou nesta conexão')
      }
    }
  }

  private async conferir(sessao: string, conexaoId: string, nome: string, statusGravado: string): Promise<void> {
    const situacao = await this.zap.situacao(sessao).catch(() => null)

    // O provedor não respondeu: pode ser ele reiniciando. Marcar a conexão como
    // caída aqui faria a tela piscar "desconectada" a cada hipo da rede.
    if (!situacao) return

    if (situacao.status === 'connected') {
      this.tentativas.delete(sessao)

      // PAREADA NÃO É O MESMO QUE FUNCIONANDO, e é por isso que o caminho de
      // volta é conferido ANTES de gravar o estado. Gravar "conectada" primeiro
      // e conferir depois criava um pisca-pisca: a rodada corrigia pra verde, a
      // conferência voltava pra vermelho, e as duas escreviam no banco a cada
      // dois minutos pra sempre.
      const volta = await this.conferirAVolta(sessao, conexaoId, nome)

      if (volta === 'quebrado') {
        // DUAS FALHAS SEGUIDAS, não uma. A batida no endereço tem resposta
        // guardada por um minuto, então um soluço de rede de poucos segundos
        // vale por uma rodada inteira. Marcar erro na primeira faria uma piscada
        // da internet travar o envio de um WhatsApp saudável — e travar envio é
        // caro demais para ser decidido por uma amostra só.
        const seguidas = (this.quebradas.get(sessao) ?? 0) + 1
        this.quebradas.set(sessao, seguidas)
        if (seguidas >= QUEBRAS_ATE_MARCAR_ERRO && statusGravado !== 'erro') {
          this.log.error({ sessao, nome, seguidas }, 'o numero esta pareado mas nao tem como receber: marcando erro')
          await this.gravar(conexaoId, 'erro', DETALHE_SEM_VOLTA, situacao.phone)
        }
        return
      }

      this.quebradas.delete(sessao)

      // 'nao-sei' é o provedor sem responder sobre o webhook. Não é motivo pra
      // mexer no estado: a rodada seguinte pergunta de novo.
      if (volta === 'ok' && statusGravado !== 'conectada') {
        this.log.info({ sessao, nome, bancoDizia: statusGravado }, 'a conexão está de pé — corrigindo o banco')
        await this.gravar(conexaoId, 'conectada', null, situacao.phone)
      }
      return
    }

    // Está caída — e aqui só age quem DEVERIA estar de pé. Numa conexão que o
    // banco já dá por desconectada, pedir reconexão é gerar QR Code novo a
    // cada rodada num número que ninguém mandou levantar: barulho pro
    // provedor, e o sinal de automação que mais aproxima o bloqueio.
    if (statusGravado === 'desconectada') return

    // Esperando QR não é queda: é alguém no meio do pareamento. Levantar de
    // novo trocaria o código na cara de quem está escaneando.
    if (situacao.status === 'connecting') return

    const agora = Date.now()
    const tentativa = this.tentativas.get(sessao)
    if (tentativa && tentativa.proxima > agora) return

    this.log.warn({ sessao, nome, provedorDisse: situacao.raw }, 'sessão caiu — levantando de volta')
    await this.gravar(conexaoId, 'conectando', `Reconectando (o WhatsApp reportou ${situacao.raw}).`)

    try {
      await this.zap.reconectar(sessao)
    } catch (e) {
      this.log.error({ err: e, sessao }, 'não deu pra levantar a sessão')
    }

    // A espera dobra mesmo quando a chamada não deu erro: "iniciar" responder
    // OK não quer dizer que pareou. Quem confirma é a rodada seguinte, achando
    // a sessão em WORKING — e aí a espera é esquecida.
    const espera = Math.min(tentativa ? tentativa.espera * 2 : ESPERA_INICIAL_MS, ESPERA_MAXIMA_MS)
    this.tentativas.set(sessao, { proxima: agora + espera, espera })
  }

  /**
   * O caminho de VOLTA existe? Conferido uma vez por sessão a cada subida.
   *
   * Uma instância conectada sem webhook apontado é o pior estado possível:
   * envia, e o que o cliente responde não chega a lugar nenhum. Não dá erro,
   * não aparece na tela, e o único sintoma é "o fluxo parou de responder" —
   * dias depois, longe da causa.
   *
   * Conferido de meia em meia hora, não a cada rodada: o webhook não se apaga
   * sozinho, e duas chamadas por conexão a cada dois minutos seriam barulho
   * puro. Meia hora é o maior tempo que vale a pena ficar mudo sem perceber.
   */
  private async conferirAVolta(sessao: string, conexaoId: string, nome: string): Promise<Volta> {
    const esperado = this.enderecoEsperado(conexaoId)

    // O ENDEREÇO É CONFERIDO SEMPRE; O WEBHOOK, NÃO.
    //
    // Perguntar à uazapi qual webhook está gravado é uma chamada por conexão, e
    // webhook não se apaga sozinho: meia hora entre uma pergunta e outra basta.
    // Já o endereço público CAI, e é a queda dele que emudece o número. Como a
    // resposta dessa batida fica guardada por um minuto, conferir a cada rodada
    // custa quase nada e derruba a janela de silêncio de trinta minutos para
    // dois — que é a diferença entre um sinal na tela que diz a verdade e um que
    // diz "recebendo" durante meia hora de conversa perdida.
    const vale = this.voltaConferida.get(sessao)
    if (vale && vale > Date.now()) {
      if (!esperado || (await this.enderecoResponde(esperado))) return 'ok'
      // Caiu: o prazo perde a validade e a conferência inteira acontece agora.
      this.voltaConferida.delete(sessao)
    }

    let atual: string | null
    try {
      atual = await this.zap.webhookAtual(sessao)
    } catch {
      return 'nao-sei' // não deu pra perguntar; tenta na próxima rodada
    }

    // WEBHOOK PRESENTE NÃO É WEBHOOK CERTO.
    //
    // Em desenvolvimento a ponte fica atrás de um túnel cujo endereço muda a
    // cada vez que ele sobe. O webhook antigo continua lá, ligado, apontando
    // pro endereço morto — e um vigia que só perguntasse "existe?" diria que
    // está tudo bem enquanto o número não recebe nada. Aconteceu hoje, no meio
    // desta obra: o túnel caiu, subiu com outro nome, e o webhook ficou
    // apontado pro anterior.
    const combina = !!atual && (!esperado || atual === esperado)

    // E COMBINAR TAMBÉM NÃO BASTA: o endereço tem que atender. Um túnel morto
    // deixa os dois textos iguais e apontando pro nada, que é exatamente o
    // estado em que esta conexão foi encontrada.
    if (combina && (await this.enderecoResponde(atual!))) {
      this.voltaConferida.set(sessao, Date.now() + RECONFERIR_A_VOLTA_MS)
      return 'ok'
    }

    this.log.warn(
      { sessao, nome, tinhaWebhook: !!atual, combinava: combina },
      combina
        ? 'o webhook aponta pra um endereço que não responde — o que o cliente responder não chegaria. Reapontando'
        : atual
          ? 'o webhook aponta pra outro endereço — o que o cliente responder não chegaria. Reapontando'
          : 'conexão de pé SEM webhook — o que o cliente responder não chegaria. Reapontando',
    )

    // Reapontar já exige, lá em `apontarAVolta`, que o endereço novo responda:
    // ele devolve `false` sem escrever nada quando a ponte não é alcançável de
    // fora. Então um `true` aqui é caminho de volta reconstruído de verdade.
    if (await this.reapontarWebhook(conexaoId)) {
      this.voltaConferida.set(sessao, Date.now() + RECONFERIR_A_VOLTA_MS)
      this.log.info({ sessao, nome }, 'caminho de volta reconstruído')
      return 'ok'
    }
    return 'quebrado'
  }

  private async gravar(conexaoId: string, status: string, detalhe: string | null, telefone?: string | null): Promise<void> {
    await this.db
      .from('crm_connections')
      .update({
        status,
        status_detail: detalhe,
        // O número que vale é o do aparelho pareado, não o que alguém digitou
        // no cadastro. Os dois já divergiram, e o cadastro é o que erra.
        ...(telefone ? { phone: telefone } : {}),
        ...(status === 'conectada' ? { connected_at: new Date().toISOString() } : {}),
      })
      .eq('id', conexaoId)
  }
}

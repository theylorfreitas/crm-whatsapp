import type { SupabaseClient } from '@supabase/supabase-js'
import type { Registro } from './zap.js'
import { Uazapi, type ContaUazapi } from './uazapi.js'

// CRIAR E PAREAR INSTÂNCIAS NA CONTA PAGA DA UAZAPI.
//
// POR QUE ISTO NÃO MORA NO BACKEND. O admin token cria e APAGA instância — é a
// chave da conta inteira, não de um número. Ele fica só no ambiente da ponte:
// nunca no banco, nunca numa resposta de API, nunca perto do navegador. O que
// a tela recebe de volta é a imagem do QR Code, e mais nada.
//
// O QUE VAI PRO BANCO. O servidor e o id da instância vão pra
// `crm_connections` (o front lê essa tabela, e nenhum dos dois é segredo). O
// TOKEN DA INSTÂNCIA vai pra `crm_connection_secrets`, que tem RLS ligado e
// zero políticas — só o service_role enxerga. Trocar isso de lugar entregaria
// o WhatsApp do cliente a quem abrisse o console do navegador.

/**
 * Uma recusa da uazapi que a TELA precisa entender.
 *
 * Existe por causa de um defeito difícil de achar: a conta bate no
 * limite de instâncias do plano, a uazapi respondeu 429 com o motivo escrito no
 * corpo, e `criar()` jogava o corpo fora e devolvia `null`. Lá em cima o `null`
 * virava "A conexão com o WhatsApp não está configurada no servidor", que
 * manda quem lê conferir variável de ambiente — e as variáveis estavam todas
 * certas. A mensagem certa ("a conta está cheia, libere uma instância") estava
 * na resposta o tempo todo e era descartada uma linha depois de chegar.
 */
export class ErroDaUazapi extends Error {
  constructor(
    message: string,
    /** O código que a tela deve receber. 409 = "resolva isso e tente de novo". */
    readonly codigo: number,
  ) {
    super(message)
    this.name = 'ErroDaUazapi'
  }
}

export class ContasUazapi {
  private readonly uaz = new Uazapi()

  constructor(
    private readonly db: SupabaseClient,
    private readonly servidorPadrao: string | undefined,
    private readonly adminToken: string | undefined,
    private readonly log: Registro,
  ) {}

  get configurado(): boolean {
    return !!this.servidorPadrao && !!this.adminToken
  }

  /**
   * A conta desta conexão, criando a instância se ainda não existir.
   *
   * Criar é idempotente do nosso lado: se a conexão já tem servidor e token
   * guardados, eles são reusados. Sem isso, cada clique em "Conectar" abriria
   * uma instância nova na conta paga e a anterior ficaria pendurada — cobrando.
   */
  async garantir(conexaoId: string, nome: string): Promise<ContaUazapi | null> {
    const { data: conexao } = await this.db
      .from('crm_connections')
      .select('id, uazapi_server, uazapi_instance')
      .eq('id', conexaoId)
      .maybeSingle()
    if (!conexao) return null

    const { data: segredo } = await this.db
      .from('crm_connection_secrets')
      .select('uazapi_token')
      .eq('connection_id', conexaoId)
      .maybeSingle()

    if (conexao.uazapi_server && segredo?.uazapi_token) {
      const guardada = { servidor: conexao.uazapi_server, token: segredo.uazapi_token }
      const veredito = await this.tokenAindaVale(guardada)

      if (veredito === 'vale') return guardada

      // A instância sumiu do lado de lá — apagada na uazapi, ou removida
      // junto com o plano. O token guardado virou papel velho: ele responde
      // 401 pra sempre, e devolvê-lo deixava a tela num beco sem saída, onde
      // "Conectar" falhava toda vez e a ÚNICA saída era mexer no banco à mão.
      // Esquecer o que não existe mais é o que permite criar outra e seguir.
      if (veredito === 'morreu') {
        this.log.warn({ conexao: conexaoId }, 'instância não existe mais na uazapi: criando outra')
        await this.esquecerCredenciais(conexaoId)
      }

      // 'incerto' cai aqui de propósito, SEM apagar nada: a uazapi fora do ar
      // ou a rede caindo não são motivo pra destruir o pareamento de um número
      // que está funcionando. Devolver a credencial guardada é o lado seguro —
      // no pior caso a chamada seguinte falha e se tenta de novo.
      if (veredito === 'incerto') return guardada
    }

    if (!this.configurado) {
      this.log.warn({ conexao: conexaoId }, 'uazapi não configurada: falta UAZAPI_SERVER ou UAZAPI_ADMIN_TOKEN')
      return null
    }

    const criada = await this.criar(nome)
    if (!criada) return null

    await this.db
      .from('crm_connections')
      .update({ uazapi_server: criada.conta.servidor, uazapi_instance: criada.instanceId })
      .eq('id', conexaoId)

    // `upsert` porque a conexão pode já ter uma linha no cofre — é o caso de
    // quem foi da Cloud API pro QR Code.
    await this.db
      .from('crm_connection_secrets')
      .upsert({ connection_id: conexaoId, uazapi_token: criada.conta.token }, { onConflict: 'connection_id' })

    this.log.info({ conexao: conexaoId, instancia: criada.instanceId }, 'instância uazapi criada')
    return criada.conta
  }

  /**
   * O token guardado ainda é reconhecido pela uazapi?
   *
   * Três respostas, e a diferença entre elas é o que evita os dois desastres
   * opostos:
   *
   *   'vale'     a instância existe e responde. Reusa.
   *   'morreu'   a uazapi diz que o token não é dela (401/403/404). Some.
   *   'incerto'  não deu pra saber: rede caiu, deu timeout, ou o servidor
   *              respondeu 5xx. NÃO apaga nada.
   *
   * Tratar 'incerto' como 'morreu' seria pior que o defeito original: uma
   * oscilação de rede apagaria a credencial de um número pareado e funcionando,
   * e o cliente teria que escanear o QR de novo sem nada ter acontecido de
   * fato.
   */
  private async tokenAindaVale(conta: ContaUazapi): Promise<'vale' | 'morreu' | 'incerto'> {
    try {
      // Sem regex de propósito: escapar barra dentro de string gerada já
      // transformou este trecho em comentário uma vez.
      const base = conta.servidor.endsWith('/') ? conta.servidor.slice(0, -1) : conta.servidor
      const r = await fetch(`${base}/instance/status`, {
        headers: { token: conta.token },
        signal: AbortSignal.timeout(15_000),
      })
      if (r.ok) return 'vale'
      if (r.status === 401 || r.status === 403 || r.status === 404) return 'morreu'
      return 'incerto'
    } catch {
      return 'incerto'
    }
  }

  /**
   * Esquece a instância e o token de uma conexão, deixando a linha pronta pra
   * receber outra. NÃO apaga a conexão: o nome, o cliente e o histórico de
   * conversas continuam onde estão — o que se perde é só o vínculo com uma
   * instância que não existe mais.
   */
  private async esquecerCredenciais(conexaoId: string): Promise<void> {
    await this.db
      .from('crm_connections')
      .update({ uazapi_instance: null, instance_id: null, status: 'desconectada', phone: null })
      .eq('id', conexaoId)
    await this.db.from('crm_connection_secrets').update({ uazapi_token: null }).eq('connection_id', conexaoId)
  }

  private async criar(nome: string): Promise<{ conta: ContaUazapi; instanceId: string } | null> {
    const servidor = this.servidorPadrao!.replace(/\/$/, '')
    const r = await fetch(`${servidor}/instance/init`, {
      method: 'POST',
      headers: { admintoken: this.adminToken!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome.slice(0, 40) }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null)

    if (!r) {
      throw new ErroDaUazapi('O servidor do WhatsApp não respondeu. Tente de novo em alguns segundos.', 504)
    }

    const d = (await r.json().catch(() => null)) as {
      token?: string
      instance?: { id?: string; token?: string }
      error?: string
      info?: string
      current_instances?: number
      max_instances?: number
    } | null

    if (!r.ok) {
      this.log.warn({ status: r.status, erro: d?.error }, 'a uazapi recusou criar a instância')
      // O LIMITE DO PLANO É O CASO QUE ACONTECE DE VERDADE, e é o único em que
      // quem lê consegue resolver sozinho — desde que a tela diga qual é. Os
      // números vão na frase: "2 de 1" explica de imediato o que "limite
      // atingido" sozinho não explica.
      if (r.status === 429 && typeof d?.max_instances === 'number') {
        throw new ErroDaUazapi(
          `A sua conta de WhatsApp está no limite de números: ${d.current_instances ?? '?'} em uso para um plano de ${d.max_instances}. ` +
            'Exclua uma conexão que não usa mais, ou aumente o plano na uazapi, e tente de novo.',
          409,
        )
      }
      throw new ErroDaUazapi(
        d?.error ?? d?.info ?? `O servidor do WhatsApp recusou criar o número (código ${r.status}).`,
        502,
      )
    }

    // O `id` já veio nos dois formatos em respostas diferentes desta mesma API
    // (solto na raiz em `/instance/all`, aninhado em `/instance/connect`), então
    // os dois são aceitos. Ler só um deles daria "criou sem devolver token" numa
    // instância que foi criada de verdade — e ela ficaria viva na fatura, sem
    // ninguém no CRM sabendo que existe.
    const token = d?.token ?? d?.instance?.token
    const instanceId = d?.instance?.id ?? (d as { id?: string } | null)?.id
    if (!token || !instanceId) {
      this.log.warn({ chaves: d ? Object.keys(d) : [] }, 'a uazapi criou a instância sem devolver id ou token')
      throw new ErroDaUazapi(
        'O servidor do WhatsApp criou o número mas não devolveu as credenciais dele. Avise o suporte.',
        502,
      )
    }

    return { conta: { servidor, token }, instanceId }
  }

  /**
   * Aponta o webhook da instância pra esta ponte.
   *
   * A conexão vai NA URL, e não num campo do corpo, porque é assim que o
   * evento chega identificado sem depender de casar telefone — dois clientes
   * do sistema podem ter o mesmo número cadastrado em conexões diferentes.
   */
  async apontarWebhook(conta: ContaUazapi, urlDaPonte: string, conexaoId: string, segredo: string): Promise<boolean> {
    const url = enderecoDoWebhook(urlDaPonte, conexaoId, segredo)
    const r = await fetch(`${conta.servidor.replace(/\/$/, '')}/webhook`, {
      method: 'POST',
      headers: { token: conta.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        url,
        // Só o que o CRM usa. Pedir tudo encheria a ponte de evento de
        // presença e de recibo, e cada um deles é uma requisição.
        events: ['messages', 'messages_update', 'connection'],
        excludeMessages: [],
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null)

    if (!r?.ok) {
      this.log.warn({ status: r?.status }, 'não deu pra apontar o webhook da instância')
      return false
    }
    return true
  }

  /** O QR Code pra parear o número. */
  async qr(conta: ContaUazapi): Promise<string | null> {
    return this.uaz.qr(conta)
  }

  /**
   * Apaga a instância na conta paga.
   *
   * Chamado quando a conexão é excluída no CRM. Sem isto, cada conexão
   * apagada deixa uma instância viva na assinatura — invisível pra quem usa e
   * presente na fatura. E não é só a fatura: o plano tem um teto de números, e
   * uma instância órfã ocupa a vaga pra sempre. É exatamente assim que a
   * conta encheu e o QR Code parou de abrir, com duas instâncias que nenhuma
   * conexão do CRM referenciava mais.
   *
   * DEVOLVE SE DEU CERTO, e isso é o que faltava: enquanto engolia o resultado
   * com um `catch(() => null)`, uma remoção recusada era indistinguível de uma
   * bem-sucedida, e quem excluiu a conexão seguia achando que tinha liberado a
   * vaga.
   *
   * 404, 401 e 403 contam como sucesso: os três significam "a uazapi não tem
   * essa instância pra mim". 404 é ela dizendo que o id não existe; 401/403 é
   * ela dizendo que o token guardado não abre nada — o que acontece toda vez
   * que a instância é apagada PELO PAINEL DA UAZAPI, porque o token morre com
   * ela e a linha do banco fica com um crachá de porta que não existe mais.
   *
   * Tratar isso como falha criava um beco sem saída visível na tela: a
   * instância já não estava lá, mas a conexão do CRM se recusava a sair da
   * lista, para sempre, com a mensagem de que a vaga continuaria ocupada. Não
   * continuava — não havia vaga nenhuma. O único jeito de sair era mexer no
   * banco à mão.
   *
   * O que segue sendo falha é o que de fato deixa órfão: a uazapi sem
   * responder, ou respondendo 5xx. Aí a instância pode muito bem estar viva, e
   * apagar a linha seria perder o endereço dela.
   */
  async apagar(conta: ContaUazapi): Promise<boolean> {
    if (!this.configurado) return false
    const r = await fetch(`${conta.servidor.replace(/\/$/, '')}/instance`, {
      method: 'DELETE',
      headers: { token: conta.token, admintoken: this.adminToken! },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)

    if (!r) {
      this.log.warn({}, 'a uazapi não respondeu ao apagar a instância')
      return false
    }
    if (r.ok) return true
    if (r.status === 404 || r.status === 401 || r.status === 403) {
      this.log.info({ status: r.status }, 'a instância já não existe na uazapi: nada a devolver ao plano')
      return true
    }
    this.log.warn({ status: r.status }, 'a uazapi recusou apagar a instância')
    return false
  }
}

/**
 * O endereço que a uazapi chama quando chega mensagem nesta conexão.
 *
 * Uma função só, usada por quem APONTA o webhook e por quem CONFERE se ele
 * está certo. Escrito em dois lugares, é questão de tempo até divergirem — e a
 * divergência aqui é invisível: o vigia acharia o webhook "errado" a cada
 * rodada e ficaria reapontando um endereço que já estava certo.
 *
 * A conexão vai NA URL, e não num campo do corpo, porque é assim que o evento
 * chega identificado sem depender de casar telefone: dois clientes do sistema podem
 * ter o mesmo número cadastrado em conexões diferentes.
 */
export function enderecoDoWebhook(urlDaPonte: string, conexaoId: string, segredo: string): string {
  return `${urlDaPonte.replace(/\/$/, '')}/uazapi/webhook?token=${encodeURIComponent(segredo)}&conexao=${conexaoId}`
}

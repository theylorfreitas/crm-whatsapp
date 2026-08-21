import { supabase } from '../supabaseClient'

// Configuração de disparo POR CONEXÃO: as palavras-chave que acionam um fluxo
// e os quatro disparos automáticos de quando nenhuma delas bate.
//
// Antes isso morava no fluxo, numa lista de palavras separadas por vírgula.
// Quem tinha dois números não conseguia responder diferente em cada um, e não
// havia como exigir duas coisas ao mesmo tempo nem excluir uma palavra.

/** Os seis operadores que a tela oferece. O motor entende exatamente estes. */
export type OperadorDeCondicao = 'igual' | 'contem' | 'diferente' | 'nao_contem' | 'comeca' | 'termina'

export const OPERADORES: { valor: OperadorDeCondicao; rotulo: string }[] = [
  { valor: 'igual', rotulo: 'É igual' },
  { valor: 'contem', rotulo: 'Contém' },
  { valor: 'diferente', rotulo: 'É diferente' },
  { valor: 'nao_contem', rotulo: 'Não contém' },
  { valor: 'comeca', rotulo: 'Começa com' },
  { valor: 'termina', rotulo: 'Termina com' },
]

export interface CondicaoDeDisparo {
  operador: OperadorDeCondicao
  valor: string
}

export interface RegraDeDisparo {
  id: string
  connectionId: string
  /** 'ou' = qualquer condição basta. 'e' = todas precisam bater. */
  combinador: 'ou' | 'e'
  condicoes: CondicaoDeDisparo[]
  flowId: string | null
  position: number
}

export interface AutomaticosDaConexao {
  fluxoBoasVindas: string | null
  fluxoRespostaPadrao: string | null
  respostaPadraoHoras: number
  fluxoConversaFinalizada: string | null
  fluxoAtendimentoFinalizado: string | null
}

export interface RitmoDaConexao {
  minIntervalSeconds: number
  maxIntervalSeconds: number
  dailyCap: number
  windowStart: string
  windowEnd: string
  pauseOnReply: boolean
}

export type ConfigDaConexao = AutomaticosDaConexao & RitmoDaConexao

export const CONFIG_PADRAO: ConfigDaConexao = {
  fluxoBoasVindas: null,
  fluxoRespostaPadrao: null,
  respostaPadraoHoras: 24,
  fluxoConversaFinalizada: null,
  fluxoAtendimentoFinalizado: null,
  minIntervalSeconds: 30,
  maxIntervalSeconds: 90,
  dailyCap: 200,
  windowStart: '09:00',
  windowEnd: '20:00',
  pauseOnReply: true,
}

// ── regras de palavra-chave ─────────────────────────────────────────────────

export async function fetchRegras(clientId: string, connectionId: string): Promise<RegraDeDisparo[]> {
  const { data, error } = await supabase
    .from('crm_disparo_regras')
    .select('id, connection_id, combinador, condicoes, flow_id, position')
    .eq('client_id', clientId)
    .eq('connection_id', connectionId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    combinador: r.combinador === 'e' ? 'e' : 'ou',
    condicoes: Array.isArray(r.condicoes) ? (r.condicoes as CondicaoDeDisparo[]) : [],
    flowId: r.flow_id,
    position: r.position,
  }))
}

export async function criarRegra(clientId: string, connectionId: string, position: number): Promise<string> {
  const { data, error } = await supabase
    .from('crm_disparo_regras')
    .insert({
      client_id: clientId,
      connection_id: connectionId,
      combinador: 'ou',
      // Nasce com uma condição vazia: uma regra sem nenhuma linha não tem o
      // que mostrar, e a pessoa teria que descobrir sozinha que precisa
      // clicar em "Adicionar condição" antes de qualquer coisa aparecer.
      condicoes: [{ operador: 'contem', valor: '' }],
      position,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function salvarRegra(
  id: string,
  input: Partial<{ combinador: 'ou' | 'e'; condicoes: CondicaoDeDisparo[]; flowId: string | null; position: number }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_disparo_regras')
    .update({
      ...(input.combinador !== undefined ? { combinador: input.combinador } : {}),
      ...(input.condicoes !== undefined ? { condicoes: input.condicoes } : {}),
      ...(input.flowId !== undefined ? { flow_id: input.flowId } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function apagarRegra(id: string): Promise<void> {
  const { error } = await supabase.from('crm_disparo_regras').delete().eq('id', id)
  if (error) throw error
}

// ── configuração da conexão ─────────────────────────────────────────────────

export async function fetchConfig(clientId: string, connectionId: string): Promise<ConfigDaConexao> {
  const { data, error } = await supabase
    .from('crm_broadcast_settings')
    .select('*')
    .eq('client_id', clientId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...CONFIG_PADRAO }
  return {
    fluxoBoasVindas: data.fluxo_boas_vindas ?? null,
    fluxoRespostaPadrao: data.fluxo_resposta_padrao ?? null,
    respostaPadraoHoras: data.resposta_padrao_horas ?? 24,
    fluxoConversaFinalizada: data.fluxo_conversa_finalizada ?? null,
    fluxoAtendimentoFinalizado: data.fluxo_atendimento_finalizado ?? null,
    minIntervalSeconds: data.min_interval_seconds ?? 30,
    maxIntervalSeconds: data.max_interval_seconds ?? 90,
    dailyCap: data.daily_cap ?? 200,
    windowStart: (data.window_start ?? '09:00').slice(0, 5),
    windowEnd: (data.window_end ?? '20:00').slice(0, 5),
    pauseOnReply: data.pause_on_reply ?? true,
  }
}

export async function salvarConfig(
  clientId: string,
  connectionId: string,
  cfg: ConfigDaConexao,
): Promise<void> {
  // `upsert` com a chave (client_id, connection_id), que é única desde a 0008:
  // a linha pode não existir ainda, e a tela não deveria precisar saber disso.
  const { error } = await supabase.from('crm_broadcast_settings').upsert(
    {
      client_id: clientId,
      connection_id: connectionId,
      fluxo_boas_vindas: cfg.fluxoBoasVindas,
      fluxo_resposta_padrao: cfg.fluxoRespostaPadrao,
      resposta_padrao_horas: cfg.respostaPadraoHoras,
      fluxo_conversa_finalizada: cfg.fluxoConversaFinalizada,
      fluxo_atendimento_finalizado: cfg.fluxoAtendimentoFinalizado,
      min_interval_seconds: cfg.minIntervalSeconds,
      max_interval_seconds: cfg.maxIntervalSeconds,
      daily_cap: cfg.dailyCap,
      window_start: cfg.windowStart,
      window_end: cfg.windowEnd,
      pause_on_reply: cfg.pauseOnReply,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,connection_id' },
  )
  if (error) throw error
}

// ── O QUE ACIONA CADA FLUXO, lido de onde a configuração realmente mora ─────
//
// A lista de fluxos mostrava um rótulo guardado no próprio fluxo (`trigger_kind`),
// e ele MENTIA: dizia "Manual" num fluxo que estava configurado para disparar
// pela palavra "testar". O rótulo era escolhido na criação e nunca mais olhava
// pra realidade, porque o disparo passou a ser configurado POR CONEXÃO, noutra
// tela, depois que o fluxo já existia.
//
// Um fluxo não tem UM gatilho. Ele pode ser chamado por palavra-chave em dois
// números diferentes, ser as boas-vindas de um deles, ser aberto na mão por um
// atendente e ainda ser chamado de dentro de outro fluxo. Guardar isso como um
// campo só é o erro; a resposta certa é PERGUNTAR à configuração.

export interface DisparoDoFluxo {
  /** Uma linha curta, do jeito que a lista de fluxos mostra. */
  resumo: string
  /** O nome do WhatsApp a que esta configuração pertence. */
  conexao: string
}

/**
 * Tudo o que aciona cada fluxo deste cliente, por id de fluxo.
 *
 * Fluxo que não aparece no mapa não tem disparo automático nenhum — o que NÃO
 * quer dizer que ele não sirva pra nada: ele continua podendo ser disparado na
 * mão e chamado de dentro de outro fluxo.
 */
export async function fetchDisparosPorFluxo(clientId: string): Promise<Map<string, DisparoDoFluxo[]>> {
  const [regras, automaticos, conexoes] = await Promise.all([
    supabase
      .from('crm_disparo_regras')
      .select('connection_id, combinador, condicoes, flow_id')
      .eq('client_id', clientId)
      .not('flow_id', 'is', null)
      .order('position'),
    supabase
      .from('crm_broadcast_settings')
      .select(
        'connection_id, fluxo_boas_vindas, fluxo_resposta_padrao, fluxo_conversa_finalizada, fluxo_atendimento_finalizado',
      )
      .eq('client_id', clientId),
    supabase.from('crm_connections').select('id, name').eq('client_id', clientId),
  ])

  const nomeDaConexao = new Map((conexoes.data ?? []).map((c) => [c.id as string, (c.name as string) ?? 'WhatsApp']))
  const mapa = new Map<string, DisparoDoFluxo[]>()
  const pendurar = (flowId: string | null, resumo: string, connectionId: string) => {
    if (!flowId) return
    const lista = mapa.get(flowId) ?? []
    lista.push({ resumo, conexao: nomeDaConexao.get(connectionId) ?? 'WhatsApp' })
    mapa.set(flowId, lista)
  }

  for (const r of regras.data ?? []) {
    const condicoes = (Array.isArray(r.condicoes) ? r.condicoes : []) as CondicaoDeDisparo[]
    const palavras = condicoes.map((c) => c.valor?.trim()).filter(Boolean)
    if (palavras.length === 0) continue
    // As palavras, e não os operadores: quem bate o olho na lista quer saber
    // QUAL palavra aciona, não se ela era "contém" ou "começa com". O detalhe
    // fino continua na tela de Disparos, que é onde se edita.
    //
    // Repetidas somem: escrever "TESTAR" em "contém" e "testar" em "começa com"
    // é uma configuração normal, e mostrar as duas faria a lista parecer ter
    // duas regras diferentes.
    const unicas = [...new Set(palavras.map((p) => p.toLowerCase()))]
    pendurar(r.flow_id as string, `Palavra-chave: ${unicas.join(', ')}`, r.connection_id as string)
  }

  for (const a of automaticos.data ?? []) {
    const c = a.connection_id as string
    pendurar(a.fluxo_boas_vindas as string | null, 'Boas-vindas', c)
    pendurar(a.fluxo_resposta_padrao as string | null, 'Resposta padrão', c)
    pendurar(a.fluxo_conversa_finalizada as string | null, 'Conversa finalizada', c)
    pendurar(a.fluxo_atendimento_finalizado as string | null, 'Atendimento finalizado', c)
  }

  return mapa
}

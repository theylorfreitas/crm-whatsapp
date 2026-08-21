import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// As ações do painel lateral do chat: agendar mensagem/fluxo, disparar fluxo
// na hora e guardar os campos personalizados da conversa.
//
// Nada aqui finge ter entregue. Agendar GRAVA o agendamento — quem envia na
// hora marcada é o worker do CRM, que depende da conexão de WhatsApp estar de
// pé. Enquanto ela não estiver, o agendamento fica pendente e a tela diz isso.

// ─── Agendamentos ───────────────────────────────────────────────────────────

export type AgendamentoTipo = 'mensagem' | 'fluxo'
export type AgendamentoRepeticao = 'nao_repetir' | 'diario' | 'semanal' | 'mensal'
export type AgendamentoStatus = 'pendente' | 'enviado' | 'cancelado' | 'falhou'

export interface Agendamento {
  id: string
  kind: AgendamentoTipo
  body: string | null
  flowId: string | null
  flowName: string | null
  runAt: string
  repeat: AgendamentoRepeticao
  status: AgendamentoStatus
  statusDetail: string | null
  createdByName: string | null
  createdAt: string
}

const AGENDA_SELECT =
  'id, kind, body, flow_id, run_at, repeat, status, status_detail, created_by_name, created_at, crm_flows (name)'

function toAgendamento(r: Record<string, unknown>): Agendamento {
  return {
    id: r.id as string,
    kind: r.kind as AgendamentoTipo,
    body: (r.body as string) ?? null,
    flowId: (r.flow_id as string) ?? null,
    flowName: (r.crm_flows as { name: string } | null)?.name ?? null,
    runAt: r.run_at as string,
    repeat: r.repeat as AgendamentoRepeticao,
    status: r.status as AgendamentoStatus,
    statusDetail: (r.status_detail as string) ?? null,
    createdByName: (r.created_by_name as string) ?? null,
    createdAt: r.created_at as string,
  }
}

export async function fetchAgendamentos(chatId: string): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('crm_scheduled_messages')
    .select(AGENDA_SELECT)
    .eq('chat_id', chatId)
    .order('run_at')
  if (error) throw error
  return (data ?? []).map(toAgendamento)
}

/** Limite que a tela precisa respeitar — o mesmo que o banco cobra (0024). */
export const MAX_DIAS_AGENDAMENTO = 31

export async function criarAgendamento(
  clientId: string,
  input: {
    chatId: string
    kind: AgendamentoTipo
    body?: string
    flowId?: string | null
    runAt: string
    repeat: AgendamentoRepeticao
    createdByName?: string
  },
): Promise<void> {
  const { error } = await supabase.from('crm_scheduled_messages').insert({
    client_id: clientId,
    chat_id: input.chatId,
    kind: input.kind,
    body: input.kind === 'mensagem' ? (input.body ?? '') : null,
    flow_id: input.kind === 'fluxo' ? (input.flowId ?? null) : null,
    run_at: input.runAt,
    repeat: input.repeat,
    created_by_name: input.createdByName ?? null,
  })
  if (error) throw error
}

export async function cancelarAgendamento(id: string): Promise<void> {
  // Cancelado, não apagado: o histórico de "isto ia ser enviado e alguém
  // desmarcou" é o que explica, depois, por que o cliente não recebeu.
  const { error } = await supabase.from('crm_scheduled_messages').update({ status: 'cancelado' }).eq('id', id)
  if (error) throw error
}

// ─── Disparo manual de fluxo ────────────────────────────────────────────────

/**
 * Os estados por que uma execução passa.
 *
 * 'aguardando' é o mais importante e faltava aqui: é o fluxo VIVO, parado num
 * menu esperando a pessoa responder. Sem ele no tipo, esse estado caía no
 * genérico e a tela tratava um atendimento em andamento como se fosse erro.
 */
export type FlowRunStatus = 'pendente' | 'executando' | 'aguardando' | 'concluido' | 'falhou' | 'cancelado'

export interface FlowRun {
  id: string
  flowId: string
  flowName: string | null
  status: FlowRunStatus
  statusDetail: string | null
  triggeredByName: string | null
  createdAt: string
}

export async function fetchFlowRuns(chatId: string): Promise<FlowRun[]> {
  const { data, error } = await supabase
    .from('crm_flow_runs')
    .select('id, flow_id, status, status_detail, triggered_by_name, created_at, crm_flows (name)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    flowId: r.flow_id,
    flowName: (r.crm_flows as unknown as { name: string } | null)?.name ?? null,
    status: r.status,
    statusDetail: r.status_detail,
    triggeredByName: r.triggered_by_name,
    createdAt: r.created_at,
  }))
}

/**
 * Marca o fluxo pra rodar nesta conversa. Fica 'pendente' até o worker pegar
 * — e o worker precisa da conexão de WhatsApp. É de propósito que a tela
 * mostre "pendente" em vez de "enviado": dizer que saiu sem ter saído é o
 * tipo de mentira que só aparece quando o cliente reclama.
 *
 * Devolve o id da execução pra que a tela possa ACOMPANHAR essa espera em vez
 * de fingir que ela não existe. Inserir a linha leva milissegundos; o robô
 * levar o fluxo pro ar leva segundos — e é essa segunda parte que a pessoa
 * está esperando quando clica.
 */
/** Os estados em que uma execução ainda está VIVA (mesma lista do índice único). */
const VIVOS = ['pendente', 'executando', 'aguardando']

export async function dispararFluxo(
  clientId: string,
  input: { flowId: string; chatId: string; triggeredByName?: string },
): Promise<string> {
  // DISPARAR DE NOVO SUBSTITUI, NÃO RECUSA.
  //
  // Existe um índice único que impede duas execuções vivas do mesmo fluxo na
  // mesma conversa, e ele está certo: sem ele o cliente recebe tudo em dobro.
  // Só que a tela batia nesse índice e mostrava o texto cru do Postgres —
  // "duplicate key value violates unique constraint
  // crm_flow_runs_uma_viva_por_conversa" — que não diz o que houve nem o que
  // fazer, e deixava o atendente sem saída: o fluxo anterior podia estar parado
  // há dias num menu que o cliente nunca respondeu, e não havia como recomeçar.
  //
  // Quem clica em "enviar fluxo" numa conversa que já tem esse fluxo vivo está
  // pedindo pra recomeçar. Então a execução antiga é CANCELADA e a nova entra.
  // Cancelar, e não apagar, mantém o histórico da conversa contando o que
  // aconteceu — a linha antiga fica visível com o motivo.
  await cancelarVivas(input.flowId, input.chatId)

  const inserir = () =>
    supabase
      .from('crm_flow_runs')
      .insert({
        client_id: clientId,
        flow_id: input.flowId,
        chat_id: input.chatId,
        trigger_kind: 'manual',
        triggered_by_name: input.triggeredByName ?? null,
      })
      .select('id')
      .single()

  let { data, error } = await inserir()

  // 23505 depois do cancelamento = dois cliques quase juntos, e o outro ganhou
  // a corrida entre o nosso update e o nosso insert. Cancelar de novo e repetir
  // resolve o único caso real; insistir além disso seria laço.
  if (error?.code === '23505') {
    await cancelarVivas(input.flowId, input.chatId)
    ;({ data, error } = await inserir())
  }

  if (error) throw error
  return data!.id as string
}

async function cancelarVivas(flowId: string, chatId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_flow_runs')
    .update({
      status: 'cancelado',
      status_detail: 'Substituída porque o fluxo foi enviado de novo nesta conversa.',
    })
    .eq('flow_id', flowId)
    .eq('chat_id', chatId)
    .in('status', VIVOS)
  if (error) throw error
}

/** O estado de UMA execução. Consultado de perto enquanto ela não sai da fila. */
export async function fetchFlowRun(runId: string): Promise<{ status: FlowRunStatus; statusDetail: string | null } | null> {
  const { data, error } = await supabase
    .from('crm_flow_runs')
    .select('status, status_detail')
    .eq('id', runId)
    .maybeSingle()
  if (error) throw error
  return data ? { status: data.status as FlowRunStatus, statusDetail: data.status_detail } : null
}

// ─── Campos personalizados da conversa ──────────────────────────────────────

export interface CampoDaConversa {
  fieldId: string
  label: string
  key: string
  type: 'texto' | 'numero' | 'data' | 'lista' | 'booleano'
  options: string[]
  value: string | null
}

/**
 * Junta a DEFINIÇÃO dos campos (crm_custom_fields) com o VALOR de cada um
 * nesta conversa. Campo sem valor aparece igual, vazio — some da tela seria
 * pior: ninguém preenche o que não vê.
 */
export async function fetchCamposDaConversa(clientId: string, chatId: string): Promise<CampoDaConversa[]> {
  const [{ data: definicoes, error: e1 }, { data: valores, error: e2 }] = await Promise.all([
    supabase
      .from('crm_custom_fields')
      .select('id, label, key, type, options')
      .eq('client_id', clientId)
      .in('entity', ['chat', 'contato'])
      .order('label'),
    supabase.from('crm_chat_field_values').select('field_id, value').eq('chat_id', chatId),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const porCampo = new Map((valores ?? []).map((v) => [v.field_id as string, v.value as string | null]))
  return (definicoes ?? []).map((d) => ({
    fieldId: d.id,
    label: d.label,
    key: d.key,
    type: d.type,
    options: d.options ?? [],
    value: porCampo.get(d.id) ?? null,
  }))
}

export async function salvarCampoDaConversa(
  clientId: string,
  input: { chatId: string; fieldId: string; value: string },
): Promise<void> {
  const { error } = await supabase.from('crm_chat_field_values').upsert(
    {
      client_id: clientId,
      chat_id: input.chatId,
      field_id: input.fieldId,
      value: input.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chat_id,field_id' },
  )
  if (error) throw error
}

// ─── Contato ligado à conversa ──────────────────────────────────────────────

export interface ContatoDaConversa {
  email: string | null
  organization: string | null
  createdAt: string | null
}

/**
 * E-mail, empresa e data de cadastro do contato. A conversa guarda só nome e
 * telefone; o resto mora em crm_contacts, e nem toda conversa tem contato
 * ligado — por isso devolve null em vez de estourar.
 */
export async function fetchContatoDaConversa(contactId: string | null): Promise<ContatoDaConversa | null> {
  if (!contactId) return null
  const { data, error } = await supabase
    .from('crm_contacts')
    .select('email, organization, created_at')
    .eq('id', contactId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { email: data.email, organization: data.organization, createdAt: data.created_at }
}

// ─── Resolver / reabrir ─────────────────────────────────────────────────────

export async function resolverChat(chatId: string, porQuem: string): Promise<void> {
  const { error } = await supabase
    .from('crm_chats')
    .update({ status: 'resolvido', resolved_by_name: porQuem, resolved_at: new Date().toISOString() })
    .eq('id', chatId)
  if (error) throw error

  // O "Fluxo de atendimento finalizado" da conexão — pesquisa de satisfação,
  // agradecimento, o que a pessoa tiver configurado.
  //
  // Depois do update e sem `await` no resultado de propósito: a conversa JÁ está
  // resolvida, e é isso que o atendente pediu. Se a ponte estiver fora do ar, o
  // botão não pode falhar por causa de uma mensagem automática.
  void apiFetch('/crm/chats/atendimento-finalizado', {
    method: 'POST',
    body: JSON.stringify({ chatId }),
  }).catch(() => null)
}

export async function reabrirChat(chatId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_chats')
    .update({ status: 'atendendo', resolved_by_name: null, resolved_at: null })
    .eq('id', chatId)
  if (error) throw error
}

/** A fila do atendimento, na ordem em que anda. */
export const ORDEM_DOS_STATUS = ['aguardando', 'atendendo', 'resolvido'] as const
export type StatusDoChat = (typeof ORDEM_DOS_STATUS)[number]

/**
 * Anda a conversa uma casa na fila, pra frente ou pra trás.
 *
 * Não é um `update` de status e pronto: as pontas têm efeito colateral.
 * Resolver grava QUEM resolveu e quando; sair de resolvido precisa apagar isso,
 * senão a conversa volta pra fila ainda dizendo "Resolvido por Fulano" no
 * cabeçalho. Por isso a regra mora aqui e não em cada tela que move um chat.
 *
 * Devolve o novo status, ou `null` quando já está na ponta.
 */
export async function moverStatusDoChat(
  chatId: string,
  atual: StatusDoChat,
  direcao: 'avancar' | 'voltar',
  porQuem: string,
): Promise<StatusDoChat | null> {
  const i = ORDEM_DOS_STATUS.indexOf(atual)
  const destino = ORDEM_DOS_STATUS[direcao === 'avancar' ? i + 1 : i - 1]
  if (!destino) return null

  if (destino === 'resolvido') await resolverChat(chatId, porQuem)
  else if (atual === 'resolvido') await reabrirChat(chatId)
  else {
    const { error } = await supabase.from('crm_chats').update({ status: destino }).eq('id', chatId)
    if (error) throw error
  }
  return destino
}

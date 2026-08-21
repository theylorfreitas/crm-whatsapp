import { supabase } from '../supabaseClient'
import type { FlowGraph } from '../../types/crmFlow'
import { EMPTY_GRAPH, newBlock } from '../../types/crmFlow'

// Fluxos de automação. O desenho inteiro vive em crm_flows.graph (jsonb);
// blocks_count é derivado do próprio grafo no momento de salvar, pra lista
// e canvas nunca discordarem.

export type FlowStatus = 'ativo' | 'pausado' | 'arquivado'
export type FlowTrigger = 'palavra_chave' | 'primeira_mensagem' | 'webhook' | 'manual' | 'etiqueta'

export interface CrmFlow {
  id: string
  folderId: string | null
  name: string
  status: FlowStatus
  triggerKind: FlowTrigger
  triggerValue: string | null
  graph: FlowGraph
  blocksCount: number
  updatedAt: string
}

const SELECT = 'id, folder_id, name, status, trigger_kind, trigger_value, graph, blocks_count, updated_at'

function toFlow(r: Record<string, unknown>): CrmFlow {
  const graph = (r.graph as FlowGraph | null) ?? EMPTY_GRAPH
  return {
    id: r.id as string,
    folderId: (r.folder_id as string) ?? null,
    name: r.name as string,
    status: r.status as FlowStatus,
    triggerKind: r.trigger_kind as FlowTrigger,
    triggerValue: (r.trigger_value as string) ?? null,
    graph: { nodes: graph.nodes ?? [], edges: graph.edges ?? [] },
    blocksCount: (r.blocks_count as number) ?? 0,
    updatedAt: r.updated_at as string,
  }
}

export async function fetchFlows(clientId: string): Promise<CrmFlow[]> {
  const { data, error } = await supabase
    .from('crm_flows')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toFlow)
}

export async function fetchFlow(id: string): Promise<CrmFlow> {
  const { data, error } = await supabase.from('crm_flows').select(SELECT).eq('id', id).single()
  if (error) throw error
  return toFlow(data)
}

export async function createFlow(
  clientId: string,
  input: { name: string; folderId?: string | null; triggerKind?: FlowTrigger; triggerValue?: string },
): Promise<CrmFlow> {
  const { data, error } = await supabase
    .from('crm_flows')
    .insert({
      client_id: clientId,
      name: input.name,
      folder_id: input.folderId ?? null,
      trigger_kind: input.triggerKind ?? 'palavra_chave',
      trigger_value: input.triggerValue || null,
      // Todo fluxo começa no Início — não existe fluxo sem porta de entrada.
      // Deixar o desenho vazio obrigava a pessoa a adivinhar isso e arrastar o
      // bloco toda vez; agora ele já está lá, no canto de cima.
      graph: { nodes: [newBlock('inicio', 80, 80)], edges: [] },
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return toFlow(data)
}

export async function updateFlow(
  id: string,
  input: Partial<{
    name: string
    status: FlowStatus
    folderId: string | null
    triggerKind: FlowTrigger
    triggerValue: string | null
    graph: FlowGraph
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_flows')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.folderId !== undefined ? { folder_id: input.folderId } : {}),
      ...(input.triggerKind !== undefined ? { trigger_kind: input.triggerKind } : {}),
      ...(input.triggerValue !== undefined ? { trigger_value: input.triggerValue } : {}),
      // blocos contados a partir do grafo salvo — sem chance de divergir
      ...(input.graph !== undefined ? { graph: input.graph, blocks_count: input.graph.nodes.length } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function duplicateFlow(clientId: string, flow: CrmFlow): Promise<void> {
  const { error } = await supabase.from('crm_flows').insert({
    client_id: clientId,
    folder_id: flow.folderId,
    name: `${flow.name} (cópia)`,
    status: 'pausado',
    trigger_kind: flow.triggerKind,
    trigger_value: flow.triggerValue,
    graph: flow.graph,
    blocks_count: flow.graph.nodes.length,
  })
  if (error) throw error
}

export async function deleteFlow(id: string): Promise<void> {
  const { error } = await supabase.from('crm_flows').delete().eq('id', id)
  if (error) throw error
}

// Importar fluxo: aceita o JSON exportado por esta mesma tela.
export async function importFlow(clientId: string, raw: string): Promise<void> {
  let parsed: { name?: string; graph?: FlowGraph; trigger_kind?: FlowTrigger; triggerKind?: FlowTrigger }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Arquivo inválido: não é um JSON de fluxo.')
  }
  const graph = parsed.graph
  if (!graph || !Array.isArray(graph.nodes)) throw new Error('Arquivo inválido: não tem o desenho do fluxo.')
  const { error } = await supabase.from('crm_flows').insert({
    client_id: clientId,
    name: parsed.name?.trim() || 'Fluxo importado',
    status: 'pausado',
    trigger_kind: parsed.trigger_kind ?? parsed.triggerKind ?? 'manual',
    graph: { nodes: graph.nodes, edges: graph.edges ?? [] },
    blocks_count: graph.nodes.length,
  })
  if (error) throw error
}

// ─── Pastas ───────────────────────────────────────────────────────────────

export interface FlowFolder {
  id: string
  name: string
}

export async function fetchFlowFolders(clientId: string): Promise<FlowFolder[]> {
  const { data, error } = await supabase
    .from('crm_flow_folders')
    .select('id, name')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createFlowFolder(clientId: string, name: string): Promise<void> {
  const { error } = await supabase.from('crm_flow_folders').insert({ client_id: clientId, name })
  if (error) throw error
}

export async function deleteFlowFolder(id: string): Promise<void> {
  const { error } = await supabase.from('crm_flow_folders').delete().eq('id', id)
  if (error) throw error
}

import { supabase } from '../supabaseClient'

// Kanban do atendimento: quadros com colunas e cartões. Um cartão pode
// apontar pra um contato do CRM — mover de coluna grava na hora.

export interface Kanban {
  id: string
  name: string
  description: string | null
  createdAt: string
  /** Quantas colunas o quadro tem. A lista mostra isso sem abrir o quadro. */
  columnCount: number
}

export interface KanbanColumn {
  id: string
  kanbanId: string
  name: string
  color: string
  position: number
  /** Etapa que significa "ganhou". Alimenta a taxa de conversão do quadro. */
  isConversion: boolean
}

/**
 * Cores de coluna sugeridas, na ordem em que o modo Automático as usa.
 *
 * Não são as escalas do Tailwind: um quadro é lido de relance, e o que separa
 * uma etapa da outra é o TOM, não a marca. Por isso a sequência anda pelo
 * círculo de cores em vez de variar a intensidade de um roxo só.
 */
export const CORES_DE_COLUNA = [
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#f59e0b',
  '#ec4899',
  '#0ea5e9',
  '#84cc16',
  '#64748b',
] as const

/** A cor que o modo Automático daria pra próxima coluna criada. */
export function corAutomatica(posicao: number): string {
  return CORES_DE_COLUNA[posicao % CORES_DE_COLUNA.length]
}

export interface KanbanCard {
  id: string
  kanbanId: string
  columnId: string
  title: string
  description: string | null
  value: number
  contactId: string | null
  contactName: string | null
  position: number
  dueAt: string | null
  tags: string[]
}

export async function fetchKanbans(clientId: string): Promise<Kanban[]> {
  // `count` numa tabela embutida devolve a contagem sem trazer as linhas —
  // a lista precisa do NÚMERO de colunas, não das colunas.
  const { data, error } = await supabase
    .from('crm_kanbans')
    .select('id, name, description, created_at, crm_kanban_columns (count)')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    columnCount: (r.crm_kanban_columns as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

export async function createKanban(
  clientId: string,
  input: { name: string; description?: string; columns?: string[] },
): Promise<string> {
  const { data, error } = await supabase
    .from('crm_kanbans')
    .insert({ client_id: clientId, name: input.name, description: input.description || null })
    .select('id')
    .single()
  if (error) throw error

  // O quadro nasce vazio quando ninguém pede coluna. É de propósito: a tela de
  // criação pergunta só o nome, e inventar "Novo / Em atendimento / Fechado"
  // faria o dono apagar três colunas antes de montar as dele.
  const columns = input.columns?.filter((c) => c.trim()) ?? []
  if (columns.length > 0) {
    const { error: e2 } = await supabase.from('crm_kanban_columns').insert(
      columns.map((name, i) => ({
        client_id: clientId,
        kanban_id: data.id,
        name: name.trim(),
        position: i,
        color: corAutomatica(i),
      })),
    )
    if (e2) throw e2
  }
  return data.id
}

export async function updateKanban(id: string, input: Partial<{ name: string; description: string | null }>): Promise<void> {
  const { error } = await supabase.from('crm_kanbans').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteKanban(id: string): Promise<void> {
  const { error } = await supabase.from('crm_kanbans').delete().eq('id', id)
  if (error) throw error
}

export async function fetchKanbanColumns(kanbanId: string): Promise<KanbanColumn[]> {
  // `*` em vez da lista de campos: `is_conversion` chegou numa migração à
  // parte, e pedir a coluna pelo nome faria a tela inteira quebrar num banco
  // que ainda não a recebeu. Com `*`, ela simplesmente vem quando existe.
  const { data, error } = await supabase
    .from('crm_kanban_columns')
    .select('*')
    .eq('kanban_id', kanbanId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    kanbanId: r.kanban_id,
    name: r.name,
    color: r.color,
    position: r.position,
    isConversion: r.is_conversion ?? false,
  }))
}

/**
 * `is_conversion` chegou na migração 0042. Num banco que ainda não a recebeu,
 * mandar o campo faz o PostgREST recusar a linha inteira (PGRST204) — a
 * coluna não seria criada e a pessoa veria um erro técnico sem saber por quê.
 *
 * Aqui a gravação tenta com o campo e, se o banco disser que ele não existe,
 * repete sem: a coluna nasce, só não nasce marcada. É o pior caso aceitável;
 * perder a marcação é reparável, perder a coluna não.
 */
function campoDeConversaoNaoExiste(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST204' || !!error.message?.includes('is_conversion'))
}

export async function createColumn(
  clientId: string,
  input: { kanbanId: string; name: string; position: number; color?: string; isConversion?: boolean },
): Promise<void> {
  // Tipado solto de propósito: `is_conversion` é opcional no schema gerado
  // enquanto a migração 0042 não roda em todos os ambientes.
  const base: Record<string, unknown> = {
    client_id: clientId,
    kanban_id: input.kanbanId,
    name: input.name,
    position: input.position,
    color: input.color ?? corAutomatica(input.position),
  }
  const { error } = await supabase
    .from('crm_kanban_columns')
    .insert(input.isConversion ? { ...base, is_conversion: true } : base)
  if (!error) return
  if (input.isConversion && campoDeConversaoNaoExiste(error)) {
    const { error: semMarca } = await supabase.from('crm_kanban_columns').insert(base)
    if (semMarca) throw semMarca
    return
  }
  throw error
}

export async function updateColumn(
  id: string,
  input: Partial<{ name: string; color: string; position: number; isConversion: boolean }>,
): Promise<void> {
  const base = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
  }
  const comMarca = input.isConversion !== undefined ? { ...base, is_conversion: input.isConversion } : base
  const { error } = await supabase.from('crm_kanban_columns').update(comMarca).eq('id', id)
  if (!error) return
  if (input.isConversion !== undefined && campoDeConversaoNaoExiste(error)) {
    const { error: semMarca } = await supabase.from('crm_kanban_columns').update(base).eq('id', id)
    if (semMarca) throw semMarca
    return
  }
  throw error
}

export async function deleteColumn(id: string): Promise<void> {
  const { error } = await supabase.from('crm_kanban_columns').delete().eq('id', id)
  if (error) throw error
}

export async function fetchKanbanCards(kanbanId: string): Promise<KanbanCard[]> {
  const { data, error } = await supabase
    .from('crm_kanban_cards')
    .select('id, kanban_id, column_id, title, description, value, contact_id, position, due_at, tags, crm_contacts (name)')
    .eq('kanban_id', kanbanId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    kanbanId: r.kanban_id,
    columnId: r.column_id,
    title: r.title,
    description: r.description,
    value: Number(r.value),
    contactId: r.contact_id,
    contactName: (r.crm_contacts as unknown as { name: string } | null)?.name ?? null,
    position: r.position,
    dueAt: r.due_at,
    tags: r.tags ?? [],
  }))
}

export async function createCard(
  clientId: string,
  input: {
    kanbanId: string
    columnId: string
    title: string
    description?: string
    value?: number
    contactId?: string | null
    dueAt?: string | null
    position?: number
  },
): Promise<void> {
  const { error } = await supabase.from('crm_kanban_cards').insert({
    client_id: clientId,
    kanban_id: input.kanbanId,
    column_id: input.columnId,
    title: input.title,
    description: input.description || null,
    value: input.value ?? 0,
    contact_id: input.contactId ?? null,
    due_at: input.dueAt ?? null,
    position: input.position ?? 0,
  })
  if (error) throw error
}

export async function updateCard(
  id: string,
  input: Partial<{
    title: string
    description: string | null
    value: number
    columnId: string
    position: number
    contactId: string | null
    dueAt: string | null
    tags: string[]
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_kanban_cards')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.columnId !== undefined ? { column_id: input.columnId } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('crm_kanban_cards').delete().eq('id', id)
  if (error) throw error
}

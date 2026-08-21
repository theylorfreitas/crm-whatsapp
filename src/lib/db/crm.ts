import { supabase } from '../supabaseClient'
import type { CrmLead, LeadStatus, FunnelStage, FunnelConnection } from '../../types/crm'

// CRM do workspace — tudo por client_id, RLS isola cliente de cliente.

// ─── Leads ────────────────────────────────────────────────────────────────

export async function fetchLeads(clientId: string): Promise<CrmLead[]> {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, name, status, email, phone, organization, origin, assigned_to, updated_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as LeadStatus,
    email: r.email,
    phone: r.phone,
    organization: r.organization,
    origin: r.origin,
    assignedTo: r.assigned_to,
    lastModified: r.updated_at,
  }))
}

export interface LeadInput {
  name: string
  status: LeadStatus
  email?: string
  phone?: string
  organization?: string
  origin?: string
}

export async function createLead(clientId: string, input: LeadInput): Promise<void> {
  const { error } = await supabase.from('crm_leads').insert({
    client_id: clientId,
    name: input.name,
    status: input.status,
    email: input.email || null,
    phone: input.phone || null,
    organization: input.organization || null,
    origin: input.origin || null,
  })
  if (error) throw error
}

export async function updateLead(id: string, input: Partial<LeadInput>): Promise<void> {
  const { error } = await supabase
    .from('crm_leads')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.organization !== undefined ? { organization: input.organization || null } : {}),
      ...(input.origin !== undefined ? { origin: input.origin || null } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('crm_leads').delete().eq('id', id)
  if (error) throw error
}

// ─── Contatos ─────────────────────────────────────────────────────────────

export interface CrmContact {
  id: string
  name: string
  email: string | null
  phone: string | null
  organization: string | null
  notes: string | null
}

export async function fetchContacts(clientId: string): Promise<CrmContact[]> {
  const { data, error } = await supabase
    .from('crm_contacts')
    .select('id, name, email, phone, organization, notes')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createContact(clientId: string, input: Omit<CrmContact, 'id'>): Promise<void> {
  const { error } = await supabase.from('crm_contacts').insert({ client_id: clientId, ...input })
  if (error) throw error
}

export async function updateContact(id: string, input: Partial<Omit<CrmContact, 'id'>>): Promise<void> {
  const { error } = await supabase.from('crm_contacts').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('crm_contacts').delete().eq('id', id)
  if (error) throw error
}

// ─── Funil (pipeline + estágios) e Negócios ───────────────────────────────

export interface PipelineDoc {
  pipelineId: string
  stages: FunnelStage[]
  connections: FunnelConnection[]
}

export async function fetchPipeline(clientId: string): Promise<PipelineDoc | null> {
  const { data: pipelines, error: e1 } = await supabase
    .from('crm_pipelines')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at')
    .limit(1)
  if (e1) throw e1
  const pipeline = pipelines?.[0]
  if (!pipeline) return null

  const [{ data: stages, error: e2 }, { data: deals, error: e3 }] = await Promise.all([
    supabase
      .from('crm_stages')
      .select('id, name, position, variant, pos_x, pos_y')
      .eq('pipeline_id', pipeline.id)
      .order('position'),
    supabase.from('crm_deals').select('id, stage_id, value, status').eq('client_id', clientId),
  ])
  if (e2) throw e2
  if (e3) throw e3

  const stageList = stages ?? []
  const dealList = deals ?? []
  const funnelStages: FunnelStage[] = stageList.map((s) => {
    const stageDeals = dealList.filter((d) => d.stage_id === s.id)
    const won = stageDeals.filter((d) => d.status === 'ganho').length
    return {
      id: s.id,
      name: s.name,
      dealsCount: stageDeals.length,
      value: stageDeals.reduce((acc, d) => acc + Number(d.value), 0),
      winRatePct: stageDeals.length > 0 ? Math.round((won / stageDeals.length) * 100) : 0,
      x: s.pos_x,
      y: s.pos_y,
      variant: s.variant as FunnelStage['variant'],
    }
  })
  // conexões: sequência por position (estágio N → N+1); ganho/perdido saem do último normal
  const normals = stageList.filter((s) => s.variant === 'normal')
  const connections: FunnelConnection[] = []
  for (let i = 0; i < normals.length - 1; i++) {
    connections.push({ fromId: normals[i].id, toId: normals[i + 1].id })
  }
  const last = normals[normals.length - 1]
  if (last) {
    for (const s of stageList.filter((s) => s.variant !== 'normal')) {
      connections.push({ fromId: last.id, toId: s.id })
    }
  }
  return { pipelineId: pipeline.id, stages: funnelStages, connections }
}

export async function saveStagePosition(stageId: string, x: number, y: number): Promise<void> {
  const { error } = await supabase.from('crm_stages').update({ pos_x: x, pos_y: y }).eq('id', stageId)
  if (error) throw error
}

export interface CrmDeal {
  id: string
  title: string
  value: number
  status: 'aberto' | 'ganho' | 'perdido'
  stageId: string | null
  stageName: string | null
  contactId: string | null
  contactName: string | null
  createdAt: string
}

export async function fetchDeals(clientId: string): Promise<CrmDeal[]> {
  const { data, error } = await supabase
    .from('crm_deals')
    .select('id, title, value, status, stage_id, contact_id, created_at, crm_stages (name), crm_contacts (name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    value: Number(r.value),
    status: r.status,
    stageId: r.stage_id,
    stageName: (r.crm_stages as unknown as { name: string } | null)?.name ?? null,
    contactId: r.contact_id,
    contactName: (r.crm_contacts as unknown as { name: string } | null)?.name ?? null,
    createdAt: r.created_at,
  }))
}

export interface DealInput {
  title: string
  value: number
  stageId: string | null
  contactId: string | null
  pipelineId: string | null
}

export async function createDeal(clientId: string, input: DealInput): Promise<void> {
  const { error } = await supabase.from('crm_deals').insert({
    client_id: clientId,
    title: input.title,
    value: input.value,
    stage_id: input.stageId,
    contact_id: input.contactId,
    pipeline_id: input.pipelineId,
  })
  if (error) throw error
}

export async function updateDeal(id: string, input: Partial<DealInput & { status: CrmDeal['status'] }>): Promise<void> {
  const { error } = await supabase
    .from('crm_deals')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.stageId !== undefined ? { stage_id: input.stageId } : {}),
      ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
      ...(input.status !== undefined
        ? { status: input.status, closed_at: input.status !== 'aberto' ? new Date().toISOString() : null }
        : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('crm_deals').delete().eq('id', id)
  if (error) throw error
}

// ─── Tarefas ──────────────────────────────────────────────────────────────

export interface CrmTask {
  id: string
  title: string
  dueAt: string | null
  done: boolean
}

export async function fetchTasks(clientId: string): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from('crm_tasks')
    .select('id, title, due_at, done')
    .eq('client_id', clientId)
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, dueAt: r.due_at, done: r.done }))
}

export async function createTask(clientId: string, input: { title: string; dueAt: string | null }): Promise<void> {
  const { error } = await supabase.from('crm_tasks').insert({ client_id: clientId, title: input.title, due_at: input.dueAt })
  if (error) throw error
}

export async function toggleTask(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('crm_tasks').update({ done }).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('crm_tasks').delete().eq('id', id)
  if (error) throw error
}

// ─── Anotações ────────────────────────────────────────────────────────────

export interface CrmNote {
  id: string
  body: string
  createdAt: string
}

export async function fetchNotes(clientId: string): Promise<CrmNote[]> {
  const { data, error } = await supabase
    .from('crm_notes')
    .select('id, body, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at }))
}

export async function createNote(clientId: string, body: string): Promise<void> {
  const { error } = await supabase.from('crm_notes').insert({ client_id: clientId, body })
  if (error) throw error
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('crm_notes').delete().eq('id', id)
  if (error) throw error
}

// ─── Ligações ─────────────────────────────────────────────────────────────

export interface CrmCall {
  id: string
  contactName: string | null
  direction: 'entrada' | 'saida'
  durationSeconds: number
  notes: string | null
  occurredAt: string
}

export async function fetchCalls(clientId: string): Promise<CrmCall[]> {
  const { data, error } = await supabase
    .from('crm_calls')
    .select('id, direction, duration_seconds, notes, occurred_at, crm_contacts (name)')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    contactName: (r.crm_contacts as unknown as { name: string } | null)?.name ?? null,
    direction: r.direction,
    durationSeconds: r.duration_seconds,
    notes: r.notes,
    occurredAt: r.occurred_at,
  }))
}

export async function createCall(clientId: string, input: { contactId: string | null; direction: 'entrada' | 'saida'; durationSeconds: number; notes?: string }): Promise<void> {
  const { error } = await supabase.from('crm_calls').insert({
    client_id: clientId,
    contact_id: input.contactId,
    direction: input.direction,
    duration_seconds: input.durationSeconds,
    notes: input.notes ?? null,
  })
  if (error) throw error
}

export async function deleteCall(id: string): Promise<void> {
  const { error } = await supabase.from('crm_calls').delete().eq('id', id)
  if (error) throw error
}

// ─── Notificações ─────────────────────────────────────────────────────────

export interface CrmNotification {
  id: string
  message: string
  read: boolean
  createdAt: string
}

export async function fetchNotifications(clientId: string): Promise<CrmNotification[]> {
  const { data, error } = await supabase
    .from('crm_notifications')
    .select('id, message, read, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, message: r.message, read: r.read, createdAt: r.created_at }))
}

export async function markNotificationRead(id: string, read: boolean): Promise<void> {
  const { error } = await supabase.from('crm_notifications').update({ read }).eq('id', id)
  if (error) throw error
}

// ─── Agente ───────────────────────────────────────────────────────────────

export interface CrmAgent {
  id: string
  name: string
  status: 'rascunho' | 'ativo' | 'pausado'
  config: Record<string, unknown>
}

export async function fetchAgents(clientId: string): Promise<CrmAgent[]> {
  const { data, error } = await supabase
    .from('crm_agents')
    .select('id, name, status, config')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status, config: r.config ?? {} }))
}

export async function createAgent(clientId: string, input: { name: string; config: Record<string, unknown> }): Promise<void> {
  const { error } = await supabase.from('crm_agents').insert({ client_id: clientId, name: input.name, config: input.config })
  if (error) throw error
}

export async function updateAgent(id: string, input: Partial<{ name: string; status: CrmAgent['status']; config: Record<string, unknown> }>): Promise<void> {
  const { error } = await supabase.from('crm_agents').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from('crm_agents').delete().eq('id', id)
  if (error) throw error
}

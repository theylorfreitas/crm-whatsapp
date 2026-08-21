import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// Disparos em massa: uma campanha (crm_broadcasts) com a sua lista de
// destinos (crm_broadcast_targets). O envio real é do backend, que respeita
// o ritmo configurado por conexão pra não queimar o número.

export type BroadcastStatus = 'rascunho' | 'agendado' | 'enviando' | 'concluido' | 'cancelado' | 'falhou'

export interface Broadcast {
  id: string
  name: string
  connectionId: string | null
  connectionName: string | null
  templateId: string | null
  flowId: string | null
  messageBody: string | null
  status: BroadcastStatus
  scheduledAt: string | null
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: string
}

const SELECT =
  'id, name, connection_id, template_id, flow_id, message_body, status, scheduled_at, total_count, sent_count, failed_count, created_at, crm_connections (name)'

export async function fetchBroadcasts(clientId: string): Promise<Broadcast[]> {
  const { data, error } = await supabase
    .from('crm_broadcasts')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    connectionId: r.connection_id,
    connectionName: (r.crm_connections as unknown as { name: string } | null)?.name ?? null,
    templateId: r.template_id,
    flowId: r.flow_id,
    messageBody: r.message_body,
    status: r.status,
    scheduledAt: r.scheduled_at,
    totalCount: r.total_count,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    createdAt: r.created_at,
  }))
}

export interface BroadcastTarget {
  id: string
  name: string | null
  phone: string
  status: 'pendente' | 'enviado' | 'falhou' | 'cancelado'
  error: string | null
  sentAt: string | null
}

export async function fetchBroadcastTargets(broadcastId: string): Promise<BroadcastTarget[]> {
  const { data, error } = await supabase
    .from('crm_broadcast_targets')
    .select('id, name, phone, status, error, sent_at')
    .eq('broadcast_id', broadcastId)
    .order('phone')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    status: r.status,
    error: r.error,
    sentAt: r.sent_at,
  }))
}

export async function createBroadcast(
  clientId: string,
  input: {
    name: string
    connectionId: string | null
    templateId: string | null
    flowId: string | null
    messageBody: string
    scheduledAt: string | null
    targets: { name: string | null; phone: string }[]
  },
): Promise<void> {
  const { data, error } = await supabase
    .from('crm_broadcasts')
    .insert({
      client_id: clientId,
      name: input.name,
      connection_id: input.connectionId,
      template_id: input.templateId,
      flow_id: input.flowId,
      message_body: input.messageBody || null,
      scheduled_at: input.scheduledAt,
      status: input.scheduledAt ? 'agendado' : 'rascunho',
      total_count: input.targets.length,
    })
    .select('id')
    .single()
  if (error) throw error

  if (input.targets.length > 0) {
    const { error: e2 } = await supabase.from('crm_broadcast_targets').insert(
      input.targets.map((t) => ({
        client_id: clientId,
        broadcast_id: data.id,
        name: t.name,
        phone: t.phone,
      })),
    )
    if (e2) throw e2
  }
}

export async function updateBroadcast(id: string, input: Partial<{ name: string; status: BroadcastStatus; scheduledAt: string | null }>): Promise<void> {
  const { error } = await supabase
    .from('crm_broadcasts')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.scheduledAt !== undefined ? { scheduled_at: input.scheduledAt } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteBroadcast(id: string): Promise<void> {
  const { error } = await supabase.from('crm_broadcasts').delete().eq('id', id)
  if (error) throw error
}

// Começar o envio de verdade: o backend valida a conexão e devolve o motivo
// quando não dá pra enviar (sem ponte configurada, conexão desconectada…).
export async function startBroadcast(id: string): Promise<{ started: boolean; detail: string | null }> {
  return apiFetch<{ started: boolean; detail: string | null }>('/crm/broadcasts/start', {
    method: 'POST',
    body: JSON.stringify({ broadcastId: id }),
  })
}

// Lê uma lista colada (uma linha por contato: "nome, telefone" ou só telefone)
export function parseTargetList(raw: string): { name: string | null; phone: string }[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim())
      if (parts.length === 1) return { name: null, phone: parts[0].replace(/\D/g, '') }
      const phoneIndex = parts.findIndex((p) => /\d{8,}/.test(p.replace(/\D/g, '')))
      const phone = (phoneIndex >= 0 ? parts[phoneIndex] : parts[parts.length - 1]).replace(/\D/g, '')
      const name = parts.filter((_, i) => i !== phoneIndex).join(' ').trim() || null
      return { name, phone }
    })
    .filter((t) => t.phone.length >= 8)
}

// ─── Ritmo do disparo por conexão ─────────────────────────────────────────

export interface BroadcastSettings {
  id: string | null
  connectionId: string
  minIntervalSeconds: number
  maxIntervalSeconds: number
  dailyCap: number
  windowStart: string
  windowEnd: string
  pauseOnReply: boolean
}

export async function fetchBroadcastSettings(clientId: string): Promise<BroadcastSettings[]> {
  const { data, error } = await supabase
    .from('crm_broadcast_settings')
    .select('id, connection_id, min_interval_seconds, max_interval_seconds, daily_cap, window_start, window_end, pause_on_reply')
    .eq('client_id', clientId)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    minIntervalSeconds: r.min_interval_seconds,
    maxIntervalSeconds: r.max_interval_seconds,
    dailyCap: r.daily_cap,
    windowStart: String(r.window_start).slice(0, 5),
    windowEnd: String(r.window_end).slice(0, 5),
    pauseOnReply: r.pause_on_reply,
  }))
}

export async function saveBroadcastSettings(clientId: string, input: BroadcastSettings): Promise<void> {
  const { error } = await supabase.from('crm_broadcast_settings').upsert(
    {
      client_id: clientId,
      connection_id: input.connectionId,
      min_interval_seconds: input.minIntervalSeconds,
      max_interval_seconds: input.maxIntervalSeconds,
      daily_cap: input.dailyCap,
      window_start: input.windowStart,
      window_end: input.windowEnd,
      pause_on_reply: input.pauseOnReply,
    },
    { onConflict: 'client_id,connection_id' },
  )
  if (error) throw error
}

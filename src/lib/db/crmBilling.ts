import { supabase } from '../supabaseClient'

// Assinatura e faturas do cliente dentro do sistema. Quem edita plano, slots e
// vencimento é o dono (pelo painel); o cliente vê o estado e o histórico.

export interface Subscription {
  accountCode: string | null
  status: 'ativa' | 'trial' | 'inadimplente' | 'cancelada'
  slotsStarter: number
  slotsPro: number
  priceCents: number
  periodStart: string | null
  periodEnd: string | null
  dueDate: string | null
}

export async function fetchSubscription(clientId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('crm_subscription')
    .select('account_code, status, slots_starter, slots_pro, price_cents, period_start, period_end, due_date')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    accountCode: data.account_code,
    status: data.status,
    slotsStarter: data.slots_starter,
    slotsPro: data.slots_pro,
    priceCents: data.price_cents,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    dueDate: data.due_date,
  }
}

export async function saveSubscription(clientId: string, input: Partial<Subscription>): Promise<void> {
  const { error } = await supabase.from('crm_subscription').upsert(
    {
      client_id: clientId,
      ...(input.accountCode !== undefined ? { account_code: input.accountCode } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.slotsStarter !== undefined ? { slots_starter: input.slotsStarter } : {}),
      ...(input.slotsPro !== undefined ? { slots_pro: input.slotsPro } : {}),
      ...(input.priceCents !== undefined ? { price_cents: input.priceCents } : {}),
      ...(input.periodStart !== undefined ? { period_start: input.periodStart } : {}),
      ...(input.periodEnd !== undefined ? { period_end: input.periodEnd } : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    },
    { onConflict: 'client_id' },
  )
  if (error) throw error
}

export interface Invoice {
  id: string
  description: string
  amountCents: number
  status: 'paga' | 'aberta' | 'vencida' | 'cancelada'
  issuedAt: string
  dueDate: string | null
  paidAt: string | null
  url: string | null
}

export async function fetchInvoices(clientId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('crm_invoices')
    .select('id, description, amount_cents, status, issued_at, due_date, paid_at, url')
    .eq('client_id', clientId)
    .order('issued_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    description: r.description,
    amountCents: r.amount_cents,
    // vencida é estado derivado da data, não algo que alguém precise marcar
    status: r.status === 'aberta' && r.due_date && new Date(r.due_date) < new Date() ? 'vencida' : r.status,
    issuedAt: r.issued_at,
    dueDate: r.due_date,
    paidAt: r.paid_at,
    url: r.url,
  }))
}

export async function createInvoice(
  clientId: string,
  input: { description: string; amountCents: number; dueDate: string | null },
): Promise<void> {
  const { error } = await supabase.from('crm_invoices').insert({
    client_id: clientId,
    description: input.description,
    amount_cents: input.amountCents,
    due_date: input.dueDate,
  })
  if (error) throw error
}

export async function markInvoicePaid(id: string): Promise<void> {
  const { error } = await supabase
    .from('crm_invoices')
    .update({ status: 'paga', paid_at: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
  if (error) throw error
}

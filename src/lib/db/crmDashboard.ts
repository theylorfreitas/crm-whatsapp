import { supabase } from '../supabaseClient'

// Vendas do CRM e as taxas usadas pelo painel. Nenhum número do painel é
// inventado: tudo sai destas linhas (ou fica zerado, que é a verdade
// enquanto não houver venda).

export interface CrmSale {
  id: string
  customerName: string | null
  /** Telefone do comprador. Alimenta a coluna "Número do lead" e o mapa por estado. */
  customerPhone: string | null
  amount: number
  /** Moeda DESTA venda (migração 0023), não a do painel. */
  currency: string
  status: 'aprovada' | 'pendente' | 'reembolsada' | 'recusada'
  source: string | null
  invoiceNumber: string | null
  productId: string | null
  productName: string | null
  connectionId: string | null
  /** Nome e número da conexão que originou a venda — a "instância" do painel. */
  connectionName: string | null
  connectionPhone: string | null
  occurredAt: string
}

export async function fetchSales(clientId: string, fromIso?: string): Promise<CrmSale[]> {
  let q = supabase
    .from('crm_sales')
    .select(
      'id, customer_name, customer_phone, amount, currency, status, source, invoice_number, product_id, connection_id, occurred_at, crm_products (name), crm_connections (name, phone)',
    )
    .eq('client_id', clientId)
  if (fromIso) q = q.gte('occurred_at', fromIso)
  const { data, error } = await q.order('occurred_at', { ascending: false }).limit(2000)
  if (error) throw error
  return (data ?? []).map((r) => {
    const conexao = r.crm_connections as unknown as { name: string; phone: string | null } | null
    return {
      id: r.id,
      customerName: r.customer_name,
      customerPhone: r.customer_phone ?? null,
      amount: Number(r.amount),
      currency: r.currency ?? 'BRL',
      status: r.status,
      source: r.source,
      invoiceNumber: r.invoice_number ?? null,
      productId: r.product_id,
      productName: (r.crm_products as unknown as { name: string } | null)?.name ?? null,
      connectionId: r.connection_id,
      connectionName: conexao?.name ?? null,
      connectionPhone: conexao?.phone ?? null,
      occurredAt: r.occurred_at,
    }
  })
}

export async function createSale(
  clientId: string,
  input: {
    customerName: string
    customerPhone?: string
    amount: number
    currency?: string
    status: CrmSale['status']
    productId: string | null
    connectionId: string | null
    source?: string
    invoiceNumber?: string
    occurredAt?: string
  },
): Promise<void> {
  const { error } = await supabase.from('crm_sales').insert({
    client_id: clientId,
    customer_name: input.customerName || null,
    customer_phone: input.customerPhone || null,
    amount: input.amount,
    currency: input.currency || 'BRL',
    status: input.status,
    product_id: input.productId,
    connection_id: input.connectionId,
    source: input.source || null,
    invoice_number: input.invoiceNumber || null,
    ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
  })
  if (error) throw error
}

export async function updateSale(id: string, input: Partial<{ status: CrmSale['status']; amount: number }>): Promise<void> {
  const { error } = await supabase.from('crm_sales').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await supabase.from('crm_sales').delete().eq('id', id)
  if (error) throw error
}

// ─── Taxas e despesas ─────────────────────────────────────────────────────

export interface DashboardSettings {
  currency: string
  taxPct: number
  gatewayFeePct: number
  fixedCost: number
}

export async function fetchDashboardSettings(clientId: string): Promise<DashboardSettings> {
  const { data, error } = await supabase
    .from('crm_dashboard_settings')
    .select('currency, tax_pct, gateway_fee_pct, fixed_cost')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return {
    currency: data?.currency ?? 'BRL',
    taxPct: Number(data?.tax_pct ?? 0),
    gatewayFeePct: Number(data?.gateway_fee_pct ?? 0),
    fixedCost: Number(data?.fixed_cost ?? 0),
  }
}

export async function saveDashboardSettings(clientId: string, input: DashboardSettings): Promise<void> {
  const { error } = await supabase.from('crm_dashboard_settings').upsert(
    {
      client_id: clientId,
      currency: input.currency,
      tax_pct: input.taxPct,
      gateway_fee_pct: input.gatewayFeePct,
      fixed_cost: input.fixedCost,
    },
    { onConflict: 'client_id' },
  )
  if (error) throw error
}

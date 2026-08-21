import type { CrmSale, DashboardSettings } from './db/crmDashboard'
import type { MetaCampaign } from './db/crmMeta'
import type { CrmChat } from './db/crmChat'
import type { CrmLead } from '../types/crm'

// Funções puras que transformam as linhas do banco nos indicadores do painel.
// Sem nenhum valor fixo aqui dentro: se não houver venda, o resultado é zero
// — que é a informação correta, não um número de exemplo.

export interface SalesIndicators {
  newLeads: number
  revenue: number
  averageTicket: number
  salesCount: number
  metaSpend: number
  profit: number
  roas: number
  conversionPct: number
}

function inRange(iso: string, fromMs: number, toMs: number): boolean {
  const t = new Date(iso).getTime()
  return t >= fromMs && t <= toMs
}

export function computeSalesIndicators(input: {
  sales: CrmSale[]
  leads: CrmLead[]
  campaigns: MetaCampaign[]
  settings: DashboardSettings
  from: Date
  to: Date
}): SalesIndicators {
  const fromMs = input.from.getTime()
  const toMs = input.to.getTime()

  // Só venda aprovada entra em faturamento — pendente e reembolsada não são
  // dinheiro no caixa.
  const approved = input.sales.filter((s) => s.status === 'aprovada' && inRange(s.occurredAt, fromMs, toMs))
  const revenue = approved.reduce((acc, s) => acc + s.amount, 0)
  const salesCount = approved.length

  const newLeads = input.leads.filter((l) => l.lastModified && inRange(l.lastModified, fromMs, toMs)).length

  const metaSpend = input.campaigns
    .filter((c) => inRange(`${c.day}T12:00:00Z`, fromMs, toMs))
    .reduce((acc, c) => acc + c.spend, 0)

  const taxes = revenue * (input.settings.taxPct / 100)
  const fees = revenue * (input.settings.gatewayFeePct / 100)
  const profit = revenue - taxes - fees - metaSpend - input.settings.fixedCost

  return {
    newLeads,
    revenue,
    averageTicket: salesCount > 0 ? revenue / salesCount : 0,
    salesCount,
    metaSpend,
    profit,
    roas: metaSpend > 0 ? revenue / metaSpend : 0,
    conversionPct: newLeads > 0 ? (salesCount / newLeads) * 100 : 0,
  }
}

export interface DayPoint {
  day: string
  revenue: number
  count: number
}

// Série diária de vendas aprovadas, com todos os dias do intervalo presentes
// (dia sem venda vale zero — o gráfico não pode pular datas).
export function computeSalesByDay(sales: CrmSale[], from: Date, to: Date): DayPoint[] {
  const buckets = new Map<string, DayPoint>()
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, { day: key, revenue: 0, count: 0 })
  }
  for (const s of sales) {
    if (s.status !== 'aprovada') continue
    const key = s.occurredAt.slice(0, 10)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.revenue += s.amount
    bucket.count += 1
  }
  return [...buckets.values()]
}

export interface StatusSlice {
  status: CrmSale['status']
  label: string
  count: number
  total: number
}

const STATUS_LABELS: Record<CrmSale['status'], string> = {
  aprovada: 'Aprovadas',
  pendente: 'Pendentes',
  reembolsada: 'Reembolsadas',
  recusada: 'Recusadas',
}

export function computeSalesByStatus(sales: CrmSale[]): StatusSlice[] {
  const order: CrmSale['status'][] = ['aprovada', 'pendente', 'reembolsada', 'recusada']
  return order.map((status) => {
    const rows = sales.filter((s) => s.status === status)
    return {
      status,
      label: STATUS_LABELS[status],
      count: rows.length,
      total: rows.reduce((acc, s) => acc + s.amount, 0),
    }
  })
}

// ─── Por instância (conexão) ────────────────────────────────────────────────

export interface InstanceSlice {
  id: string
  label: string
  count: number
  total: number
}

/**
 * Agrupa por conexão — a "instância" do painel. Venda sem conexão não é
 * descartada: vira "Sem instância", senão o gráfico somaria menos que o
 * indicador de Vendas e ninguém saberia por quê.
 */
export function computeSalesByInstance(sales: CrmSale[]): InstanceSlice[] {
  const mapa = new Map<string, InstanceSlice>()
  for (const s of sales) {
    const id = s.connectionId ?? 'sem-instancia'
    const atual = mapa.get(id) ?? {
      id,
      label: s.connectionName ?? 'Sem instância',
      count: 0,
      total: 0,
    }
    atual.count += 1
    atual.total += s.amount
    mapa.set(id, atual)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total)
}

// ─── Por estado ─────────────────────────────────────────────────────────────

// DDD -> UF. É a única forma honesta de ter "vendas por estado" sem inventar
// um campo que ninguém preencheria: o telefone do comprador já diz a região.
// Quem não tem telefone (ou tem número de fora do Brasil) cai em "—", contado
// à parte em vez de ser jogado num estado qualquer.
const DDD_UF: Record<string, string> = {
  11: 'SP', 12: 'SP', 13: 'SP', 14: 'SP', 15: 'SP', 16: 'SP', 17: 'SP', 18: 'SP', 19: 'SP',
  21: 'RJ', 22: 'RJ', 24: 'RJ', 27: 'ES', 28: 'ES',
  31: 'MG', 32: 'MG', 33: 'MG', 34: 'MG', 35: 'MG', 37: 'MG', 38: 'MG',
  41: 'PR', 42: 'PR', 43: 'PR', 44: 'PR', 45: 'PR', 46: 'PR',
  47: 'SC', 48: 'SC', 49: 'SC',
  51: 'RS', 53: 'RS', 54: 'RS', 55: 'RS',
  61: 'DF', 62: 'GO', 64: 'GO', 63: 'TO', 65: 'MT', 66: 'MT', 67: 'MS',
  68: 'AC', 69: 'RO',
  71: 'BA', 73: 'BA', 74: 'BA', 75: 'BA', 77: 'BA', 79: 'SE',
  81: 'PE', 87: 'PE', 82: 'AL', 83: 'PB', 84: 'RN', 85: 'CE', 88: 'CE', 86: 'PI', 89: 'PI',
  91: 'PA', 93: 'PA', 94: 'PA', 92: 'AM', 97: 'AM', 95: 'RR', 96: 'AP', 98: 'MA', 99: 'MA',
}

/** Extrai a UF do telefone. Aceita +55, 0800, espaços e parênteses. */
export function ufDoTelefone(telefone: string | null): string | null {
  if (!telefone) return null
  let so = telefone.replace(/\D/g, '')
  // tira o código do país quando vier (55 + 10 ou 11 dígitos)
  if (so.length > 11 && so.startsWith('55')) so = so.slice(2)
  if (so.length < 10) return null
  return DDD_UF[so.slice(0, 2)] ?? null
}

export interface StateSlice {
  uf: string
  count: number
  total: number
}

export function computeSalesByState(sales: CrmSale[]): StateSlice[] {
  const mapa = new Map<string, StateSlice>()
  for (const s of sales) {
    const uf = ufDoTelefone(s.customerPhone) ?? '—'
    const atual = mapa.get(uf) ?? { uf, count: 0, total: 0 }
    atual.count += 1
    atual.total += s.amount
    mapa.set(uf, atual)
  }
  // "—" (sem telefone) sempre por último: é ausência de informação, não um
  // estado, e no topo da lista roubaria a leitura dos estados reais.
  return [...mapa.values()].sort((a, b) => (a.uf === '—' ? 1 : b.uf === '—' ? -1 : b.count - a.count))
}

export interface ServiceIndicators {
  waiting: number
  inService: number
  resolved: number
  unread: number
  resolvedPct: number
  unassigned: number
}

export function computeServiceIndicators(chats: CrmChat[]): ServiceIndicators {
  const waiting = chats.filter((c) => c.status === 'aguardando').length
  const inService = chats.filter((c) => c.status === 'atendendo').length
  const resolved = chats.filter((c) => c.status === 'resolvido').length
  const total = chats.length
  return {
    waiting,
    inService,
    resolved,
    unread: chats.reduce((acc, c) => acc + c.unreadCount, 0),
    resolvedPct: total > 0 ? (resolved / total) * 100 : 0,
    unassigned: chats.filter((c) => !c.assignedTo && c.status !== 'resolvido').length,
  }
}

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

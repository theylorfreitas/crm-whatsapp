import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  SlidersHorizontal,
  Users2,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Megaphone,
  Wallet,
  Activity,
  Percent,
  Filter,
  CalendarDays,
  Download,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  fetchSales,
  createSale,
  deleteSale,
  fetchDashboardSettings,
  saveDashboardSettings,
  type DashboardSettings,
  type CrmSale,
} from '../../lib/db/crmDashboard'
import { fetchMetaCampaigns } from '../../lib/db/crmMeta'
import { fetchConnections } from '../../lib/db/crmConnections'
import { fetchChats } from '../../lib/db/crmChat'
import { fetchLeads } from '../../lib/db/crm'
import { fetchProducts } from '../../lib/db/crmSettings'
import {
  computeSalesIndicators,
  computeSalesByDay,
  computeSalesByInstance,
  computeSalesByState,
  computeServiceIndicators,
  formatCurrency,
  formatNumber,
} from '../../lib/crmMetrics'
import { CrmLoading } from './CrmDataStates'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass, CrmPill } from './ui/CrmUi'
import { GraficoLinha, GraficoBarras } from './dashboard/PainelGraficos'
import { Selecao } from '../ui/Selecao'

// Painel do CRM. Todo número aqui é soma de linha do banco deste cliente —
// sem venda cadastrada e sem campanha sincronizada, os cartões mostram zero,
// que é o estado verdadeiro. Nenhum gráfico tem dado de exemplo.

const PERIODS = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7', label: 'Últimos 7 dias' },
  { key: '30', label: 'Últimos 30 dias' },
  { key: '90', label: 'Últimos 90 dias' },
] as const

type PeriodKey = (typeof PERIODS)[number]['key']

const PADRAO = { period: '30' as PeriodKey, connection: 'todas', product: 'todos' }

function rangeFor(period: PeriodKey): { from: Date; to: Date } {
  // O fim do intervalo é o fim do dia, não o instante atual: uma venda
  // lançada hoje precisa contar hoje, mesmo que o relógio do lançamento
  // esteja alguns minutos à frente.
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  if (period === 'hoje') from.setHours(0, 0, 0, 0)
  else from.setDate(from.getDate() - Number(period))
  return { from, to }
}

/** "há menos de um minuto", "há 5 min", "há 2 h". */
function desdeQuando(ms: number): string {
  if (!ms) return 'ainda não carregou'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'há menos de um minuto'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86400)} dias`
}

const cardClass = 'rounded-xl border border-line bg-surface'

export function DashboardSection({ clientId, companyName }: { clientId: string; companyName: string }) {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState<PeriodKey>(PADRAO.period)
  const [connectionFilter, setConnectionFilter] = useState(PADRAO.connection)
  const [productFilter, setProductFilter] = useState(PADRAO.product)
  const [tab, setTab] = useState<'vendas' | 'atendimento'>('vendas')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [novaVendaOpen, setNovaVendaOpen] = useState(false)

  const { from, to } = useMemo(() => rangeFor(period), [period])
  const fromIso = from.toISOString()

  const salesQuery = useQuery({ queryKey: ['crm-sales', clientId], queryFn: () => fetchSales(clientId) })
  const leadsQuery = useQuery({ queryKey: ['crm-leads', clientId], queryFn: () => fetchLeads(clientId) })
  const campaignsQuery = useQuery({
    queryKey: ['crm-meta-campaigns', clientId, fromIso.slice(0, 10)],
    queryFn: () => fetchMetaCampaigns(clientId, fromIso.slice(0, 10)),
  })
  const settingsQuery = useQuery({ queryKey: ['crm-dashboard-settings', clientId], queryFn: () => fetchDashboardSettings(clientId) })
  const connectionsQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const productsQuery = useQuery({ queryKey: ['crm-products', clientId], queryFn: () => fetchProducts(clientId) })
  const chatsQuery = useQuery({ queryKey: ['crm-chats', clientId], queryFn: () => fetchChats(clientId) })

  const settings = settingsQuery.data ?? { currency: 'BRL', taxPct: 0, gatewayFeePct: 0, fixedCost: 0 }
  const moeda = (v: number) => formatCurrency(v, settings.currency)

  const moedaMutation = useMutation({
    mutationFn: (currency: string) => saveDashboardSettings(clientId, { ...settings, currency }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-dashboard-settings', clientId] }),
  })
  const apagarVenda = useMutation({
    mutationFn: deleteSale,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-sales', clientId] }),
  })

  const filteredSales = useMemo(() => {
    return (salesQuery.data ?? []).filter((s) => {
      if (connectionFilter !== 'todas' && s.connectionId !== connectionFilter) return false
      if (productFilter !== 'todos' && s.productId !== productFilter) return false
      const t = new Date(s.occurredAt).getTime()
      return t >= from.getTime() && t <= to.getTime()
    })
  }, [salesQuery.data, connectionFilter, productFilter, from, to])

  const indicators = useMemo(
    () =>
      computeSalesIndicators({
        sales: filteredSales,
        leads: leadsQuery.data ?? [],
        campaigns: campaignsQuery.data ?? [],
        settings,
        from,
        to,
      }),
    [filteredSales, leadsQuery.data, campaignsQuery.data, settings, from, to],
  )

  const byDay = useMemo(() => computeSalesByDay(filteredSales, from, to), [filteredSales, from, to])
  const byInstance = useMemo(() => computeSalesByInstance(filteredSales), [filteredSales])
  const byState = useMemo(() => computeSalesByState(filteredSales), [filteredSales])
  const service = useMemo(() => computeServiceIndicators(chatsQuery.data ?? []), [chatsQuery.data])

  const loading = salesQuery.isLoading || settingsQuery.isLoading
  const filtrado = period !== PADRAO.period || connectionFilter !== PADRAO.connection || productFilter !== PADRAO.product

  function limparFiltros() {
    setPeriod(PADRAO.period)
    setConnectionFilter(PADRAO.connection)
    setProductFilter(PADRAO.product)
  }

  function atualizar() {
    for (const k of ['crm-sales', 'crm-meta-campaigns', 'crm-chats', 'crm-leads']) {
      queryClient.invalidateQueries({ queryKey: [k, clientId] })
    }
  }

  const cards = [
    { icon: Users2, label: 'Leads novos', value: formatNumber(indicators.newLeads), cor: 'info' as const, destaque: false },
    { icon: DollarSign, label: 'Faturamento', value: moeda(indicators.revenue), cor: 'ok' as const, destaque: true },
    { icon: TrendingUp, label: 'Ticket médio', value: moeda(indicators.averageTicket), cor: 'accent' as const, destaque: false },
    { icon: ShoppingBag, label: 'Vendas', value: formatNumber(indicators.salesCount), cor: 'info' as const, destaque: false },
    { icon: Megaphone, label: 'Gasto Meta', value: moeda(indicators.metaSpend), cor: 'danger' as const, destaque: true },
    {
      icon: Wallet,
      label: 'Lucro',
      value: moeda(indicators.profit),
      cor: (indicators.profit >= 0 ? 'ok' : 'danger') as 'ok' | 'danger',
      destaque: true,
    },
    { icon: Activity, label: 'ROAS', value: formatNumber(indicators.roas, 2), cor: 'warn' as const, destaque: false },
    { icon: Percent, label: '% Conversão', value: `${formatNumber(indicators.conversionPct, 2)}%`, cor: 'danger' as const, destaque: false },
  ]

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <section className={`${cardClass} p-4`}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent-ink)]">
            <Filter size={13} />
          </span>
          <h2 className="text-sm font-semibold text-ink">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <CrmField label="Período">
            <div className="relative">
              <CalendarDays size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <Selecao
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                className={`${inputClass} pl-8`}
                aria-label="Período"
              >
                {PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Selecao>
            </div>
          </CrmField>
          <CrmField label="Conexão">
            <Selecao value={connectionFilter} onChange={(e) => setConnectionFilter(e.target.value)} className={inputClass}>
              <option value="todas">Todas as conexões</option>
              {(connectionsQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Selecao>
          </CrmField>
          <CrmField label="Produto">
            <Selecao value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className={inputClass}>
              <option value="todos">Todos os produtos</option>
              {(productsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Selecao>
          </CrmField>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={limparFiltros}
            disabled={!filtrado}
            className={`${ghostButtonClass} disabled:opacity-40`}
            title={filtrado ? 'Voltar aos filtros padrão' : 'Os filtros já estão no padrão'}
          >
            Limpar filtros
          </button>
        </div>
      </section>

      {/* ── Última atualização + ações ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-4">
          Última atualização: {desdeQuando(salesQuery.dataUpdatedAt)}
          {salesQuery.isFetching && ' · atualizando…'}
        </p>
        <button type="button" onClick={atualizar} className={ghostButtonClass}>
          <RefreshCw size={14} className={salesQuery.isFetching ? 'animate-spin' : ''} /> Atualizar dados
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['vendas', 'atendimento'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-white'
                  : 'border border-line bg-surface text-ink-2 hover:bg-canvas'
              }`}
              style={tab === t ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setSettingsOpen(true)} className={ghostButtonClass}>
          <SlidersHorizontal size={14} /> Configurar taxas e despesas
        </button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="moeda-painel" className="text-xs text-ink-4">
          Moeda (Meta)
        </label>
        <Selecao
          id="moeda-painel"
          value={settings.currency}
          onChange={(e) => moedaMutation.mutate(e.target.value)}
          disabled={moedaMutation.isPending}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-2"
        >
          <option value="BRL">BRL</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </Selecao>
      </div>

      {loading ? (
        <CrmLoading />
      ) : tab === 'vendas' ? (
        <>
          {/* ── Indicadores ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <CartaoIndicador key={c.label} {...c} />
            ))}
          </div>

          {/* ── Gráficos ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Quadro titulo="Vendas por período">
              {filteredSales.length === 0 ? (
                <Vazio hint="Nenhuma venda registrada neste período. Lance uma em Histórico de vendas ou conecte a integração de checkout." />
              ) : (
                <GraficoLinha pontos={byDay} medida="count" formatar={moeda} />
              )}
            </Quadro>

            <Quadro titulo="Vendas por instância">
              {byInstance.length === 0 ? (
                <Vazio hint="Nenhuma venda no período. Cada instância é uma conexão de WhatsApp." />
              ) : (
                <GraficoBarras itens={byInstance} medida="count" formatar={moeda} />
              )}
            </Quadro>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Quadro titulo="Faturamento por instância">
              {byInstance.length === 0 ? (
                <Vazio hint="Nenhuma venda no período." />
              ) : (
                <GraficoBarras itens={byInstance} medida="total" formatar={moeda} />
              )}
            </Quadro>

            <Quadro
              titulo="Vendas por estado"
              nota="O estado vem do DDD do telefone do comprador. Venda sem telefone aparece como “—”."
            >
              {byState.length === 0 ? (
                <Vazio hint="Nenhuma venda no período." />
              ) : (
                <GraficoBarras
                  itens={byState.map((s) => ({ id: s.uf, label: s.uf === '—' ? '— sem telefone' : s.uf, count: s.count, total: s.total }))}
                  medida="count"
                  formatar={moeda}
                />
              )}
            </Quadro>
          </div>

          {/* ── Histórico de vendas ─────────────────────────────────────── */}
          <HistoricoVendas
            vendas={filteredSales}
            moedaPainel={settings.currency}
            onNova={() => setNovaVendaOpen(true)}
            onApagar={(id) => apagarVenda.mutate(id)}
            empresa={companyName}
          />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            { label: 'Aguardando', value: formatNumber(service.waiting), tone: 'text-warn-ink' },
            { label: 'Em atendimento', value: formatNumber(service.inService), tone: 'text-info-ink' },
            { label: 'Resolvidos', value: formatNumber(service.resolved), tone: 'text-ok-ink' },
            { label: 'Mensagens não lidas', value: formatNumber(service.unread), tone: 'text-ink-2' },
            { label: 'Sem responsável', value: formatNumber(service.unassigned), tone: 'text-danger-ink' },
            { label: '% resolvidos', value: `${formatNumber(service.resolvedPct, 1)}%`, tone: 'text-ink-2' },
          ].map((c) => (
            <div key={c.label} className={`${cardClass} p-4`}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-4">{c.label}</p>
              <p className={`mt-1.5 text-lg font-semibold tabular-nums ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <TaxesModal
        open={settingsOpen}
        clientId={clientId}
        initial={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['crm-dashboard-settings', clientId] })}
      />
      <NovaVendaModal
        open={novaVendaOpen}
        clientId={clientId}
        moedaPadrao={settings.currency}
        conexoes={(connectionsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        produtos={(productsQuery.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
        onClose={() => setNovaVendaOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['crm-sales', clientId] })}
      />
    </div>
  )
}

// ─── Peças da tela ──────────────────────────────────────────────────────────

const TOM = {
  ok: { bg: 'bg-ok-bg', ink: 'text-ok-ink', valor: 'text-ok-ink' },
  warn: { bg: 'bg-warn-bg', ink: 'text-warn-ink', valor: 'text-ink' },
  danger: { bg: 'bg-danger-bg', ink: 'text-danger-ink', valor: 'text-danger-ink' },
  info: { bg: 'bg-info-bg', ink: 'text-info-ink', valor: 'text-ink' },
  accent: {
    bg: 'bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]',
    ink: 'text-[var(--accent-ink)]',
    valor: 'text-ink',
  },
}

/**
 * Cartão de indicador: ícone colorido em cima, número grande, rótulo embaixo.
 *
 * `destaque` diz se o VALOR também é colorido. Só faturamento, gasto e lucro
 * ganham cor — se todos os oito ganhassem, nenhum se destacaria e a cor
 * deixaria de significar "olha aqui".
 */
function CartaoIndicador({
  icon: Icon,
  label,
  value,
  cor,
  destaque,
}: {
  icon: typeof Users2
  label: string
  value: string
  cor: keyof typeof TOM
  destaque: boolean
}) {
  const tom = TOM[cor]
  return (
    <div className={`${cardClass} p-4`}>
      <span className={`mb-3 flex h-7 w-7 items-center justify-center rounded-lg ${tom.bg} ${tom.ink}`}>
        <Icon size={14} />
      </span>
      <p className={`text-xl font-semibold tabular-nums ${destaque ? tom.valor : 'text-ink'}`}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">{label}</p>
    </div>
  )
}

function Quadro({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className={`${cardClass} p-4`}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
        {nota && <p className="mt-0.5 text-[11px] text-ink-4">{nota}</p>}
      </div>
      {children}
    </section>
  )
}

function Vazio({ hint }: { hint: string }) {
  return <p className="flex min-h-[180px] items-center justify-center px-6 text-center text-xs text-ink-4">{hint}</p>
}

const COLUNAS = [
  'Instância',
  'Número da instância',
  'Número do lead',
  'Cliente (nome)',
  'Produto',
  'ID',
  'Valor',
  'Moeda',
  'Source ID',
  'Data',
  'NF',
  'Ações',
]

function HistoricoVendas({
  vendas,
  moedaPainel,
  empresa,
  onNova,
  onApagar,
}: {
  vendas: CrmSale[]
  moedaPainel: string
  empresa: string
  onNova: () => void
  onApagar: (id: string) => void
}) {
  function exportarCsv() {
    // ; como separador e BOM no início: é o que faz o Excel em português
    // abrir o arquivo já em colunas, em vez de jogar tudo na coluna A.
    const linhas = [
      COLUNAS.slice(0, -1).join(';'),
      ...vendas.map((v) =>
        [
          v.connectionName ?? '',
          v.connectionPhone ?? '',
          v.customerPhone ?? '',
          v.customerName ?? '',
          v.productName ?? '',
          v.id,
          v.amount.toFixed(2).replace('.', ','),
          v.currency,
          v.source ?? '',
          new Date(v.occurredAt).toLocaleString('pt-BR'),
          v.invoiceNumber ?? '',
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ].join('\r\n')

    const url = URL.createObjectURL(new Blob(['﻿' + linhas], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `vendas-${empresa.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-xl border border-[color-mix(in_oklab,var(--accent)_32%,transparent)] bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft p-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Histórico de vendas</h2>
          <p className="mt-0.5 text-[11px] text-ink-4">
            {vendas.length} {vendas.length === 1 ? 'venda no período' : 'vendas no período'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportarCsv} disabled={vendas.length === 0} className={`${ghostButtonClass} disabled:opacity-40`}>
            <Download size={14} /> Exportar CSV
          </button>
          <button type="button" onClick={onNova} className={primaryButtonClass}>
            <Plus size={14} /> Nova venda
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left">
              {COLUNAS.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium text-ink-4">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {vendas.length === 0 ? (
              <tr>
                <td colSpan={COLUNAS.length} className="px-3 py-10 text-center text-xs text-ink-4">
                  Nenhuma venda no período. Use “Nova venda” ou conecte a integração de checkout.
                </td>
              </tr>
            ) : (
              vendas.map((v) => (
                <tr key={v.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{v.connectionName ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-3">{v.connectionPhone ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-3">{v.customerPhone ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{v.customerName ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{v.productName ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink-4" title={v.id}>
                    {v.id.slice(0, 8)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink">{formatCurrency(v.amount, v.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <CrmPill tone={v.currency === moedaPainel ? 'cinza' : 'amarelo'}>{v.currency}</CrmPill>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-3">{v.source ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-3">
                    {new Date(v.occurredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-3">{v.invoiceNumber ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={`Apagar venda de ${v.customerName ?? 'cliente'}`}
                      onClick={() => window.confirm(`Apagar a venda de ${v.customerName ?? 'cliente'}?`) && onApagar(v.id)}
                      className="text-ink-4 hover:text-danger-ink"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Modais ─────────────────────────────────────────────────────────────────

const VENDA_VAZIA = {
  customerName: '',
  customerPhone: '',
  amount: '',
  currency: 'BRL',
  status: 'aprovada' as CrmSale['status'],
  productId: '',
  connectionId: '',
  source: '',
  invoiceNumber: '',
  occurredAt: '',
}

function NovaVendaModal({
  open,
  clientId,
  moedaPadrao,
  conexoes,
  produtos,
  onClose,
  onSaved,
}: {
  open: boolean
  clientId: string
  moedaPadrao: string
  conexoes: { id: string; name: string }[]
  produtos: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ ...VENDA_VAZIA, currency: moedaPadrao })
  const mutation = useMutation({
    mutationFn: () =>
      createSale(clientId, {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        amount: Number(form.amount) || 0,
        currency: form.currency,
        status: form.status,
        productId: form.productId || null,
        connectionId: form.connectionId || null,
        source: form.source.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      onSaved()
      setForm({ ...VENDA_VAZIA, currency: moedaPadrao })
      onClose()
    },
  })

  return (
    <CrmModal
      open={open}
      title="Nova venda"
      description="Entra no painel na hora e, se estiver aprovada, entra no total do período."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!form.customerName.trim() || mutation.isPending}
            className={primaryButtonClass}
          >
            {mutation.isPending ? 'Salvando…' : 'Lançar venda'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CrmField label="Cliente (nome) *">
          <input className={inputClass} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
        </CrmField>
        <CrmField label="Número do lead" hint="O DDD define o estado no gráfico.">
          <input
            className={inputClass}
            placeholder="(67) 90000-0000"
            value={form.customerPhone}
            onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
          />
        </CrmField>
        <CrmField label="Valor">
          <input
            className={inputClass}
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </CrmField>
        <CrmField label="Moeda">
          <Selecao className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </Selecao>
        </CrmField>
        <CrmField label="Instância (conexão)">
          <Selecao className={inputClass} value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })}>
            <option value="">Sem instância</option>
            {conexoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
        <CrmField label="Produto">
          <Selecao className={inputClass} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            <option value="">Sem produto</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
        <CrmField label="Status">
          <Selecao
            className={inputClass}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as CrmSale['status'] })}
          >
            <option value="aprovada">Aprovada</option>
            <option value="pendente">Pendente</option>
            <option value="reembolsada">Reembolsada</option>
            <option value="recusada">Recusada</option>
          </Selecao>
        </CrmField>
        <CrmField label="Data">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.occurredAt}
            onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
          />
        </CrmField>
        <CrmField label="Source ID" hint="De onde veio (campanha, checkout, indicação).">
          <input className={inputClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </CrmField>
        <CrmField label="NF">
          <input className={inputClass} value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
        </CrmField>
        {mutation.isError && <p className="sm:col-span-2 text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

function TaxesModal({
  open,
  clientId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  clientId: string
  initial: DashboardSettings
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(initial)
  const mutation = useMutation({
    mutationFn: () => saveDashboardSettings(clientId, form),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  return (
    <CrmModal
      open={open}
      title="Taxas e despesas"
      description="Entram no cálculo de lucro do painel."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className={primaryButtonClass}>
            Salvar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="Moeda">
          <Selecao value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
            <option value="BRL">Real (BRL)</option>
            <option value="USD">Dólar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
          </Selecao>
        </CrmField>
        <CrmField label="Impostos (%)">
          <input
            type="number"
            step="0.01"
            value={form.taxPct}
            onChange={(e) => setForm({ ...form, taxPct: Number(e.target.value) })}
            className={inputClass}
          />
        </CrmField>
        <CrmField label="Taxa do gateway (%)">
          <input
            type="number"
            step="0.01"
            value={form.gatewayFeePct}
            onChange={(e) => setForm({ ...form, gatewayFeePct: Number(e.target.value) })}
            className={inputClass}
          />
        </CrmField>
        <CrmField label="Custo fixo do período" hint="Somado uma vez no cálculo de lucro.">
          <input
            type="number"
            step="0.01"
            value={form.fixedCost}
            onChange={(e) => setForm({ ...form, fixedCost: Number(e.target.value) })}
            className={inputClass}
          />
        </CrmField>
        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Plus, Trash2 } from 'lucide-react'
import { fetchSales, createSale, updateSale, deleteSale, type CrmSale } from '../../lib/db/crmDashboard'
import { fetchProducts } from '../../lib/db/crmSettings'
import { fetchConnections } from '../../lib/db/crmConnections'
import { formatCurrency } from '../../lib/crmMetrics'
import { CrmLoading } from './CrmDataStates'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass, CrmPill, CrmTable, CrmErrorBar } from './ui/CrmUi'
import { Selecao } from '../ui/Selecao'

// Vendas: a fonte de faturamento, ticket médio e conversão do painel. Dá pra
// lançar à mão aqui ou receber pela integração de checkout.

export function SalesSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({ queryKey: ['crm-sales', clientId], queryFn: () => fetchSales(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-sales', clientId] })

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: CrmSale['status'] }) => updateSale(vars.id, { status: vars.status }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteSale, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const sales = query.data ?? []
  const approved = sales.filter((s) => s.status === 'aprovada')

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <CreditCard size={17} className="text-ink-4" />
            Vendas
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">
            {approved.length} aprovadas · {formatCurrency(approved.reduce((acc, s) => acc + s.amount, 0))}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}>
          <Plus size={14} /> Lançar venda
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      {query.isLoading ? (
        <CrmLoading />
      ) : sales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
          <p className="text-sm font-medium text-ink-2">Nenhuma venda registrada</p>
          <p className="mt-1 text-xs text-ink-4">
            Lance manualmente ou conecte um checkout em Configurações → Integrações. O painel usa estas linhas.
          </p>
        </div>
      ) : (
        <CrmTable head={['Cliente', 'Produto', 'Valor', 'Status', 'Data', 'Ações']}>
          {sales.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 text-sm text-ink">{s.customerName ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-ink-3">{s.productName ?? '—'}</td>
              <td className="px-4 py-3 text-sm tabular-nums text-ink-2">{formatCurrency(s.amount)}</td>
              <td className="px-4 py-3">
                <Selecao
                  value={s.status}
                  onChange={(e) => statusMutation.mutate({ id: s.id, status: e.target.value as CrmSale['status'] })}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-2 focus:outline-none focus:ring-2 focus:ring-line"
                >
                  <option value="aprovada">aprovada</option>
                  <option value="pendente">pendente</option>
                  <option value="reembolsada">reembolsada</option>
                  <option value="recusada">recusada</option>
                </Selecao>
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">{new Date(s.occurredAt).toLocaleString('pt-BR')}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {s.source && <CrmPill tone="cinza">{s.source}</CrmPill>}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Apagar esta venda?')) deleteMutation.mutate(s.id)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label="Apagar"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <NewSaleModal open={open} clientId={clientId} onClose={() => setOpen(false)} onCreated={invalidate} />
    </div>
  )
}

// O input datetime-local trabalha em HORA LOCAL. Usar toISOString() aqui
// jogaria o valor pro fuso UTC e a venda "de agora" nasceria no futuro —
// sumindo do painel, que só conta até o instante atual.
function localDateTimeValue(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function NewSaleModal({
  open,
  clientId,
  onClose,
  onCreated,
}: {
  open: boolean
  clientId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    customerName: '',
    amount: 0,
    status: 'aprovada' as CrmSale['status'],
    productId: '',
    connectionId: '',
    source: 'manual',
    occurredAt: localDateTimeValue(),
  })

  const productsQuery = useQuery({ queryKey: ['crm-products', clientId], queryFn: () => fetchProducts(clientId) })
  const connectionsQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })

  const mutation = useMutation({
    mutationFn: () =>
      createSale(clientId, {
        customerName: form.customerName.trim(),
        amount: form.amount,
        status: form.status,
        productId: form.productId || null,
        connectionId: form.connectionId || null,
        source: form.source,
        occurredAt: new Date(form.occurredAt).toISOString(),
      }),
    onSuccess: () => {
      onCreated()
      onClose()
    },
  })

  return (
    <CrmModal
      open={open}
      title="Lançar venda"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={form.amount <= 0 || mutation.isPending} className={primaryButtonClass}>
            Lançar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <CrmField label="Cliente">
            <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className={inputClass} />
          </CrmField>
        </div>
        <CrmField label="Valor (R$)">
          <input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            className={inputClass}
          />
        </CrmField>
        <CrmField label="Status">
          <Selecao value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CrmSale['status'] })} className={inputClass}>
            <option value="aprovada">Aprovada</option>
            <option value="pendente">Pendente</option>
            <option value="reembolsada">Reembolsada</option>
            <option value="recusada">Recusada</option>
          </Selecao>
        </CrmField>
        <CrmField label="Produto">
          <Selecao
            value={form.productId}
            onChange={(e) => {
              const product = (productsQuery.data ?? []).find((p) => p.id === e.target.value)
              // preço padrão do produto entra sozinho quando o valor ainda
              // não foi digitado
              setForm({
                ...form,
                productId: e.target.value,
                amount: form.amount === 0 && product ? product.defaultPrice : form.amount,
              })
            }}
            className={inputClass}
          >
            <option value="">Sem produto</option>
            {(productsQuery.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
        <CrmField label="Conexão">
          <Selecao value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })} className={inputClass}>
            <option value="">Sem conexão</option>
            {(connectionsQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
        <div className="col-span-2">
          <CrmField label="Quando aconteceu">
            <input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
              className={inputClass}
            />
          </CrmField>
        </div>
      </div>
      {mutation.isError && <p className="mt-2 text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
    </CrmModal>
  )
}

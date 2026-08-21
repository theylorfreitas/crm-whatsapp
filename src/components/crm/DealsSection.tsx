import { useState } from 'react'
import { Handshake, Plus, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchDeals, createDeal, updateDeal, deleteDeal, fetchPipeline, fetchContacts, type CrmDeal } from '../../lib/db/crm'
import { CrmLoading, CrmEmpty, CrmSectionHeader, crmInputClass, crmButtonClass } from './CrmDataStates'
import { Selecao } from '../ui/Selecao'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_STYLE: Record<CrmDeal['status'], string> = {
  aberto: 'bg-info-bg text-info-ink',
  ganho: 'bg-ok-bg text-ok-ink',
  perdido: 'bg-danger-bg text-danger-ink',
}

// Negócios reais (tabela crm_deals): valor, etapa do funil, contato e status.
export function DealsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const dealsQuery = useQuery({ queryKey: ['crm-deals', clientId], queryFn: () => fetchDeals(clientId) })
  const pipelineQuery = useQuery({ queryKey: ['crm-pipeline', clientId], queryFn: () => fetchPipeline(clientId) })
  const contactsQuery = useQuery({ queryKey: ['crm-contacts', clientId], queryFn: () => fetchContacts(clientId) })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-deals', clientId] })
    queryClient.invalidateQueries({ queryKey: ['crm-pipeline', clientId] })
  }

  const [form, setForm] = useState({ title: '', value: '', stageId: '', contactId: '' })

  const createMutation = useMutation({
    mutationFn: () =>
      createDeal(clientId, {
        title: form.title.trim(),
        value: Number(form.value) || 0,
        stageId: form.stageId || null,
        contactId: form.contactId || null,
        pipelineId: pipelineQuery.data?.pipelineId ?? null,
      }),
    onSuccess: () => {
      invalidate()
      setForm({ title: '', value: '', stageId: '', contactId: '' })
    },
  })
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof updateDeal>[1] }) => updateDeal(vars.id, vars.patch),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteDeal, onSuccess: invalidate })

  const deals = dealsQuery.data ?? []
  const stages = pipelineQuery.data?.stages ?? []
  const contacts = contactsQuery.data ?? []
  const openValue = deals.filter((d) => d.status === 'aberto').reduce((s, d) => s + d.value, 0)

  return (
    <div className="p-4 md:p-6">
      <CrmSectionHeader
        icon={Handshake}
        title="Negócios"
        description={`${deals.length} negócio${deals.length === 1 ? '' : 's'} · ${BRL.format(openValue)} em aberto`}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (form.title.trim()) createMutation.mutate()
        }}
        className="mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-xl border border-line bg-surface p-3"
      >
        <input className={crmInputClass} placeholder="Título do negócio *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <input className={crmInputClass} type="number" placeholder="Valor (R$)" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        <Selecao className={crmInputClass} value={form.stageId} onChange={(e) => setForm((f) => ({ ...f, stageId: e.target.value }))}>
          <option value="">Etapa…</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Selecao>
        <Selecao className={crmInputClass} value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}>
          <option value="">Contato…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Selecao>
        <button type="submit" disabled={!form.title.trim() || createMutation.isPending} className={crmButtonClass}>
          <Plus size={15} /> Criar
        </button>
      </form>

      {dealsQuery.isLoading ? (
        <CrmLoading />
      ) : deals.length === 0 ? (
        <CrmEmpty title="Nenhum negócio ainda" hint="Crie o primeiro no formulário acima." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left text-xs text-ink-4">
                <th className="px-4 py-2.5 font-medium">NEGÓCIO</th>
                <th className="px-4 py-2.5 font-medium">VALOR</th>
                <th className="px-4 py-2.5 font-medium">ETAPA</th>
                <th className="px-4 py-2.5 font-medium">CONTATO</th>
                <th className="px-4 py-2.5 font-medium">STATUS</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {deals.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5 font-medium text-ink-2">{d.title}</td>
                  <td className="px-4 py-2.5 text-ink-2 tabular-nums">{BRL.format(d.value)}</td>
                  <td className="px-4 py-2.5">
                    <Selecao
                      value={d.stageId ?? ''}
                      onChange={(e) => updateMutation.mutate({ id: d.id, patch: { stageId: e.target.value || null } })}
                      className="rounded-lg border border-line px-2 py-1 text-xs text-ink-2"
                    >
                      <option value="">—</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Selecao>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">{d.contactName ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Selecao
                      value={d.status}
                      onChange={(e) => updateMutation.mutate({ id: d.id, patch: { status: e.target.value as CrmDeal['status'] } })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 ${STATUS_STYLE[d.status]}`}
                    >
                      <option value="aberto">Aberto</option>
                      <option value="ganho">Ganho</option>
                      <option value="perdido">Perdido</option>
                    </Selecao>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      aria-label="Apagar negócio"
                      onClick={() => window.confirm(`Apagar "${d.title}"?`) && deleteMutation.mutate(d.id)}
                      className="text-ink-4 hover:text-danger-ink"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { RotateCw, Plus, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadsTable } from './LeadsTable'
import { CrmLoading, CrmEmpty, crmInputClass, crmButtonClass } from './CrmDataStates'
import { fetchLeads, createLead, updateLead, deleteLead } from '../../lib/db/crm'
import type { LeadStatus } from '../../types/crm'
import { Selecao } from '../ui/Selecao'

const STATUS_OPTIONS: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'novo', label: 'Novo' },
  { value: 'em_nutricao', label: 'Em nutrição' },
  { value: 'nao_qualificado', label: 'Não qualificado' },
  { value: 'contatado', label: 'Contatado' },
]

const ORIGINS = [
  { value: '', label: 'Origem' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'site', label: 'Formulário do site' },
  { value: 'planilha', label: 'Planilha importada' },
  { value: 'manual', label: 'Cadastro manual' },
]

const EMPTY_FORM = { name: '', email: '', phone: '', organization: '', origin: 'manual', status: 'novo' as LeadStatus }

// Leads reais (tabela crm_leads, isolada por client_id). Leads também entram
// automaticamente pelo WhatsApp e pelas integrações quando conectados.
export function LeadsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const leadsQuery = useQuery({ queryKey: ['crm-leads', clientId], queryFn: () => fetchLeads(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-leads', clientId] })

  const [nameFilter, setNameFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('')
  const [originFilter, setOriginFilter] = useState('')
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const createMutation = useMutation({
    mutationFn: () => createLead(clientId, form),
    onSuccess: () => {
      invalidate()
      setForm(EMPTY_FORM)
      setFormOpen(false)
    },
  })
  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: LeadStatus }) => updateLead(vars.id, { status: vars.status }),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteLead, onSuccess: invalidate })

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data])

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (nameFilter && !lead.name.toLowerCase().includes(nameFilter.toLowerCase())) return false
      if (emailFilter && !(lead.email ?? '').toLowerCase().includes(emailFilter.toLowerCase())) return false
      if (orgFilter && !(lead.organization ?? '').toLowerCase().includes(orgFilter.toLowerCase())) return false
      if (statusFilter && lead.status !== statusFilter) return false
      if (originFilter && lead.origin !== originFilter) return false
      return true
    })
  }, [leads, nameFilter, emailFilter, orgFilter, statusFilter, originFilter])

  const visible = filtered.slice(0, pageSize)

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-ink-4">Leads /</span>
          <span className="font-medium text-ink-2">Lista</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Recarregar"
            onClick={() => invalidate()}
            className="rounded-lg border border-line bg-surface p-2 text-ink-3 hover:bg-canvas"
          >
            <RotateCw size={14} className={leadsQuery.isFetching ? 'animate-spin' : undefined} />
          </button>
          <button type="button" onClick={() => setFormOpen((v) => !v)} className={crmButtonClass}>
            {formOpen ? <X size={14} /> : <Plus size={14} />}
            {formOpen ? 'Fechar' : 'Criar'}
          </button>
        </div>
      </div>

      {formOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (form.name.trim()) createMutation.mutate()
          }}
          className="mb-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2 rounded-xl border border-line bg-surface p-3"
        >
          <input className={crmInputClass} placeholder="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className={crmInputClass} placeholder="E-mail" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <input className={crmInputClass} placeholder="Telefone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <input className={crmInputClass} placeholder="Organização" value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))} />
          <Selecao className={crmInputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as LeadStatus }))}>
            {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Selecao>
          <button type="submit" disabled={!form.name.trim() || createMutation.isPending} className={crmButtonClass}>
            <Plus size={14} /> Salvar lead
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        <input type="text" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Nome Completo" className={crmInputClass} />
        <input type="text" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} placeholder="E-Mail" className={crmInputClass} />
        <input type="text" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} placeholder="Organização" className={crmInputClass} />
        <Selecao value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | '')} className={crmInputClass}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value ? opt.label : 'Situação'}
            </option>
          ))}
        </Selecao>
        <Selecao value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} className={crmInputClass}>
          {ORIGINS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Selecao>
      </div>

      {leadsQuery.isLoading ? (
        <CrmLoading />
      ) : leads.length === 0 ? (
        <CrmEmpty
          title="Nenhum lead ainda"
          hint="Cadastre manualmente em “Criar”, ou conecte o WhatsApp e o formulário do site pra entrarem sozinhos."
        />
      ) : (
        <>
          <LeadsTable
            leads={visible}
            onChangeStatus={(id, status) => statusMutation.mutate({ id, status })}
            onDelete={(id, name) => window.confirm(`Apagar o lead "${name}"?`) && deleteMutation.mutate(id)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-ink-3">
            <div className="flex items-center gap-1">
              {[20, 50, 100].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPageSize(size as 20 | 50 | 100)}
                  className={`rounded-lg px-2.5 py-1 font-medium ${
                    pageSize === size ? 'bg-primary text-primary-foreground' : 'text-ink-3 hover:bg-surface'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <span>
              {visible.length} de {filtered.length}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

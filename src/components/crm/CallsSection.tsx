import { useState } from 'react'
import { Phone, Plus, Trash2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchCalls, createCall, deleteCall, fetchContacts } from '../../lib/db/crm'
import { CrmLoading, CrmEmpty, CrmSectionHeader, crmInputClass, crmButtonClass } from './CrmDataStates'
import { Selecao } from '../ui/Selecao'
import { Sensivel } from '../ui/Sensivel'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

// Ligações reais (tabela crm_calls): registro manual do histórico de contato.
export function CallsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const callsQuery = useQuery({ queryKey: ['crm-calls', clientId], queryFn: () => fetchCalls(clientId) })
  const contactsQuery = useQuery({ queryKey: ['crm-contacts', clientId], queryFn: () => fetchContacts(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-calls', clientId] })

  const [form, setForm] = useState<{ contactId: string; direction: 'entrada' | 'saida'; minutes: string; notes: string }>({
    contactId: '',
    direction: 'saida',
    minutes: '',
    notes: '',
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createCall(clientId, {
        contactId: form.contactId || null,
        direction: form.direction,
        durationSeconds: Math.round((Number(form.minutes) || 0) * 60),
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate()
      setForm({ contactId: '', direction: 'saida', minutes: '', notes: '' })
    },
  })
  const deleteMutation = useMutation({ mutationFn: deleteCall, onSuccess: invalidate })

  const calls = callsQuery.data ?? []
  const contacts = contactsQuery.data ?? []

  return (
    <div className="p-4 md:p-6">
      <CrmSectionHeader icon={Phone} title="Ligações" description="Histórico de chamadas com seus contatos." />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-xl border border-line bg-surface p-3"
      >
        <Selecao className={crmInputClass} value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}>
          <option value="">Contato…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Selecao>
        <Selecao className={crmInputClass} value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as 'entrada' | 'saida' }))}>
          <option value="saida">Saída</option>
          <option value="entrada">Entrada</option>
        </Selecao>
        <input className={crmInputClass} type="number" step="0.5" placeholder="Minutos" value={form.minutes} onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))} />
        <input className={crmInputClass} placeholder="Observação" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button type="submit" disabled={createMutation.isPending} className={crmButtonClass}>
          <Plus size={15} /> Registrar
        </button>
      </form>

      {callsQuery.isLoading ? (
        <CrmLoading />
      ) : calls.length === 0 ? (
        <CrmEmpty title="Nenhuma ligação registrada" hint="Registre a primeira acima." />
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line-soft">
          {calls.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              {c.direction === 'entrada' ? (
                <ArrowDownLeft size={15} className="text-ok-ink shrink-0" />
              ) : (
                <ArrowUpRight size={15} className="text-info-ink shrink-0" />
              )}
              <Sensivel className="text-sm font-medium text-ink-2 min-w-0 truncate">
                {c.contactName ?? 'Sem contato'}
              </Sensivel>
              <span className="text-xs text-ink-3 shrink-0">{formatDuration(c.durationSeconds)}</span>
              <span className="flex-1 text-xs text-ink-4 truncate">{c.notes ?? ''}</span>
              <span className="text-xs text-ink-4 shrink-0">{new Date(c.occurredAt).toLocaleDateString('pt-BR')}</span>
              <button
                type="button"
                aria-label="Apagar ligação"
                onClick={() => deleteMutation.mutate(c.id)}
                className="text-ink-4 hover:text-danger-ink shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

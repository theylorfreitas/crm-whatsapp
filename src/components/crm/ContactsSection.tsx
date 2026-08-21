import { useState } from 'react'
import { Users, Plus, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchContacts, createContact, deleteContact } from '../../lib/db/crm'
import { CrmLoading, CrmEmpty, CrmSectionHeader, crmInputClass, crmButtonClass } from './CrmDataStates'
import { Sensivel } from '../ui/Sensivel'

// Contatos reais (tabela crm_contacts, isolada por client_id via RLS).
export function ContactsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const contactsQuery = useQuery({ queryKey: ['crm-contacts', clientId], queryFn: () => fetchContacts(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-contacts', clientId] })

  const [form, setForm] = useState({ name: '', email: '', phone: '', organization: '' })

  const createMutation = useMutation({
    mutationFn: () =>
      createContact(clientId, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        organization: form.organization.trim() || null,
        notes: null,
      }),
    onSuccess: () => {
      invalidate()
      setForm({ name: '', email: '', phone: '', organization: '' })
    },
  })
  const deleteMutation = useMutation({ mutationFn: deleteContact, onSuccess: invalidate })

  const contacts = contactsQuery.data ?? []

  return (
    <div className="p-4 md:p-6">
      <CrmSectionHeader icon={Users} title="Contatos" description="Pessoas com quem você fala, a base do seu CRM." />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (form.name.trim()) createMutation.mutate()
        }}
        className="mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-xl border border-line bg-surface p-3"
      >
        <input className={crmInputClass} placeholder="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input className={crmInputClass} placeholder="E-mail" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <input className={crmInputClass} placeholder="Telefone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <input className={crmInputClass} placeholder="Empresa" value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))} />
        <button type="submit" disabled={!form.name.trim() || createMutation.isPending} className={crmButtonClass}>
          <Plus size={15} /> Adicionar
        </button>
      </form>

      {contactsQuery.isLoading ? (
        <CrmLoading />
      ) : contacts.length === 0 ? (
        <CrmEmpty title="Nenhum contato ainda" hint="Cadastre no formulário acima ou deixe entrar pelo WhatsApp." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left text-xs text-ink-4">
                <th className="px-4 py-2.5 font-medium">NOME</th>
                <th className="px-4 py-2.5 font-medium">E-MAIL</th>
                <th className="px-4 py-2.5 font-medium">TELEFONE</th>
                <th className="px-4 py-2.5 font-medium">EMPRESA</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {contacts.map((c) => (
                <tr key={c.id}>
                  {/* A agenda inteira é dado pessoal: nome, e-mail, telefone e
                      empresa de gente real, quatro colunas seguidas. */}
                  <td className="px-4 py-2.5 font-medium text-ink-2">
                    <Sensivel>{c.name}</Sensivel>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    <Sensivel>{c.email ?? '—'}</Sensivel>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    <Sensivel>{c.phone ?? '—'}</Sensivel>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">
                    <Sensivel>{c.organization ?? '—'}</Sensivel>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      aria-label="Apagar contato"
                      onClick={() => window.confirm(`Apagar ${c.name}?`) && deleteMutation.mutate(c.id)}
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

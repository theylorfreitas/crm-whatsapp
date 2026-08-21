import { useState } from 'react'
import { StickyNote, Plus, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchNotes, createNote, deleteNote } from '../../lib/db/crm'
import { CrmLoading, CrmEmpty, CrmSectionHeader, crmInputClass, crmButtonClass } from './CrmDataStates'

// Anotações reais (tabela crm_notes).
export function NotesSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const notesQuery = useQuery({ queryKey: ['crm-notes', clientId], queryFn: () => fetchNotes(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-notes', clientId] })

  const [body, setBody] = useState('')
  const createMutation = useMutation({
    mutationFn: () => createNote(clientId, body.trim()),
    onSuccess: () => {
      invalidate()
      setBody('')
    },
  })
  const deleteMutation = useMutation({ mutationFn: deleteNote, onSuccess: invalidate })

  const notes = notesQuery.data ?? []

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <CrmSectionHeader icon={StickyNote} title="Anotações" description="Registros livres sobre clientes, reuniões e decisões." />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim()) createMutation.mutate()
        }}
        className="mb-4 rounded-xl border border-line bg-surface p-3"
      >
        <textarea rows={3} className={crmInputClass} placeholder="Escreva uma anotação…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end mt-2">
          <button type="submit" disabled={!body.trim() || createMutation.isPending} className={crmButtonClass}>
            <Plus size={15} /> Salvar anotação
          </button>
        </div>
      </form>

      {notesQuery.isLoading ? (
        <CrmLoading />
      ) : notes.length === 0 ? (
        <CrmEmpty title="Nenhuma anotação ainda" />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-2 whitespace-pre-wrap">{n.body}</p>
                <p className="text-[11px] text-ink-4 mt-1">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
              </div>
              <button
                type="button"
                aria-label="Apagar anotação"
                onClick={() => deleteMutation.mutate(n.id)}
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

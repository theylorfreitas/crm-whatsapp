import { useState } from 'react'
import { CheckSquare, Plus, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTasks, createTask, toggleTask, deleteTask } from '../../lib/db/crm'
import { CrmLoading, CrmEmpty, CrmSectionHeader, crmInputClass, crmButtonClass } from './CrmDataStates'

// Tarefas reais (tabela crm_tasks).
export function TasksSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const tasksQuery = useQuery({ queryKey: ['crm-tasks', clientId], queryFn: () => fetchTasks(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-tasks', clientId] })

  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')

  const createMutation = useMutation({
    mutationFn: () => createTask(clientId, { title: title.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : null }),
    onSuccess: () => {
      invalidate()
      setTitle('')
      setDueAt('')
    },
  })
  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; done: boolean }) => toggleTask(vars.id, vars.done),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: invalidate })

  const tasks = tasksQuery.data ?? []
  const pending = tasks.filter((t) => !t.done).length

  return (
    <div className="p-4 md:p-6">
      <CrmSectionHeader icon={CheckSquare} title="Tarefas" description={`${pending} pendente${pending === 1 ? '' : 's'}`} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) createMutation.mutate()
        }}
        className="mb-4 flex flex-col sm:flex-row gap-2 rounded-xl border border-line bg-surface p-3"
      >
        <input className={`${crmInputClass} flex-1`} placeholder="O que precisa ser feito?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={`${crmInputClass} sm:w-52`} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        <button type="submit" disabled={!title.trim() || createMutation.isPending} className={crmButtonClass}>
          <Plus size={15} /> Adicionar
        </button>
      </form>

      {tasksQuery.isLoading ? (
        <CrmLoading />
      ) : tasks.length === 0 ? (
        <CrmEmpty title="Nenhuma tarefa ainda" hint="Adicione a primeira acima." />
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line-soft">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleMutation.mutate({ id: t.id, done: !t.done })}
                className="h-4 w-4 rounded border-line-strong"
              />
              <span className={`flex-1 text-sm ${t.done ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{t.title}</span>
              {t.dueAt && (
                <span className="text-xs text-ink-4 shrink-0">{new Date(t.dueAt).toLocaleString('pt-BR')}</span>
              )}
              <button
                type="button"
                aria-label="Apagar tarefa"
                onClick={() => deleteMutation.mutate(t.id)}
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

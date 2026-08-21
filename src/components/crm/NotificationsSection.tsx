import { Bell, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchNotifications, markNotificationRead } from '../../lib/db/crm'
import { CrmLoading, CrmEmpty, CrmSectionHeader } from './CrmDataStates'

// Notificações reais (tabela crm_notifications): o backend grava aqui quando
// entra lead novo, tarefa vence, negócio muda de etapa.
export function NotificationsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['crm-notifications', clientId], queryFn: () => fetchNotifications(clientId) })
  const readMutation = useMutation({
    mutationFn: (vars: { id: string; read: boolean }) => markNotificationRead(vars.id, vars.read),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-notifications', clientId] }),
  })

  const items = query.data ?? []

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <CrmSectionHeader icon={Bell} title="Notificações" description="Avisos do seu CRM." />
      {query.isLoading ? (
        <CrmLoading />
      ) : items.length === 0 ? (
        <CrmEmpty title="Nenhuma notificação" hint="Leads novos, tarefas vencendo e negócios movidos aparecem aqui." />
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line-soft">
          {items.map((n) => (
            <div key={n.id} className={`flex items-center gap-3 px-4 py-2.5 ${n.read ? 'opacity-60' : ''}`}>
              <span className="flex-1 text-sm text-ink-2">{n.message}</span>
              <span className="text-xs text-ink-4 shrink-0">{new Date(n.createdAt).toLocaleString('pt-BR')}</span>
              <button
                type="button"
                onClick={() => readMutation.mutate({ id: n.id, read: !n.read })}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink-2 hover:bg-canvas shrink-0"
              >
                <Check size={12} />
                {n.read ? 'Não lida' : 'Lida'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

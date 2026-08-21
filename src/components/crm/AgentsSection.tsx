import { useState } from 'react'
import { Bot, Plus, Pencil } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AgentWizardModal } from './AgentWizardModal'
import { CrmLoading, CrmEmpty, CrmSectionHeader, crmButtonClass } from './CrmDataStates'
import { fetchAgents, updateAgent, type CrmAgent } from '../../lib/db/crm'
import { fetchProviderEnvStatus } from '../../lib/db/integrations'

const STATUS_STYLE: Record<CrmAgent['status'], string> = {
  rascunho: 'bg-surface-2 text-ink-2',
  ativo: 'bg-ok-bg text-ok-ink',
  pausado: 'bg-warn-bg text-warn-ink',
}

// Agentes reais (tabela crm_agents). Ativar de fato depende do cloud do
// cliente + WhatsApp conectados — enquanto não estão, o botão de ativar fica
// bloqueado com o motivo explícito, em vez de fingir que o agente atende.
export function AgentsSection({ clientId, companyName }: { clientId: string; companyName: string }) {
  const queryClient = useQueryClient()
  const agentsQuery = useQuery({ queryKey: ['crm-agents', clientId], queryFn: () => fetchAgents(clientId) })
  const envQuery = useQuery({ queryKey: ['integration-env-status'], queryFn: fetchProviderEnvStatus })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CrmAgent | null>(null)

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: CrmAgent['status'] }) => updateAgent(vars.id, { status: vars.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-agents', clientId] }),
  })

  const agents = agentsQuery.data ?? []
  const cloudReady = envQuery.data?.claude_cloud.configured ?? false
  const whatsappReady = envQuery.data?.whatsapp.configured ?? false
  const canActivate = cloudReady && whatsappReady

  return (
    <div className="p-4 md:p-6">
      <CrmSectionHeader
        icon={Bot}
        title="Agente"
        description="Agentes que conversam com o lead no seu WhatsApp, usando o Claude da sua conta."
        action={
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            className={crmButtonClass}
          >
            <Plus size={15} /> Novo agente
          </button>
        }
      />

      {!canActivate && (
        <div className="mb-4 rounded-xl border border-warn-line bg-warn-bg px-4 py-3">
          <p className="text-sm font-medium text-warn-ink">Agentes ainda não podem ser ativados</p>
          <p className="text-xs text-warn-ink mt-0.5">
            Falta conectar {!cloudReady && 'o Claude'}
            {!cloudReady && !whatsappReady && ' e '}
            {!whatsappReady && 'o WhatsApp'}. Você já pode montar e salvar o agente. Ele fica como rascunho até a
            conexão existir.
          </p>
        </div>
      )}

      {agentsQuery.isLoading ? (
        <CrmLoading />
      ) : agents.length === 0 ? (
        <CrmEmpty title="Nenhum agente ainda" hint="Monte o primeiro em “Novo agente”, são 9 passos." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{agent.name}</p>
                  <p className="text-xs text-ink-4 mt-0.5">
                    {(agent.config.objective as string) ?? 'sem objetivo definido'}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${STATUS_STYLE[agent.status]}`}>
                  {agent.status === 'ativo' ? 'Ativo' : agent.status === 'pausado' ? 'Pausado' : 'Rascunho'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(agent)
                    setModalOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-canvas"
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  disabled={!canActivate}
                  title={canActivate ? undefined : 'Conecte o Claude e o WhatsApp primeiro'}
                  onClick={() =>
                    statusMutation.mutate({ id: agent.id, status: agent.status === 'ativo' ? 'pausado' : 'ativo' })
                  }
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {agent.status === 'ativo' ? 'Pausar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AgentWizardModal
        key={editing?.id ?? 'new-agent'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        companyName={companyName}
        clientId={clientId}
        agent={editing}
      />
    </div>
  )
}

import { useEffect, useState, type CSSProperties } from 'react'
import { Bot, X, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../ui/Modal'
import { AgentStepList } from './AgentStepList'
import { AgentObjectiveStep } from './AgentObjectiveStep'
import { AGENT_WIZARD_STEPS, AGENT_OBJECTIVE_OPTIONS } from '../../data/agentWizardSteps'
import { createAgent, updateAgent, deleteAgent, type CrmAgent } from '../../lib/db/crm'
import { ownerBrand } from '../../config/brand'

interface AgentWizardModalProps {
  open: boolean
  onClose: () => void
  companyName: string
  clientId: string
  // Passe um agente pra editar; sem isso, o assistente cria um novo.
  agent?: CrmAgent | null
}

type AgentConfig = Record<string, string>

// Assistente de 9 passos pra montar o agente que conversa com o lead no
// WhatsApp. Tudo que é preenchido aqui é gravado de verdade em crm_agents
// (nome + jsonb config). O agente só começa a responder quando o cloud do
// cliente e o WhatsApp estiverem conectados — até lá ele fica salvo como
// rascunho/pausado, sem fingir que está atendendo.
export function AgentWizardModal({ open, onClose, companyName, clientId, agent = null }: AgentWizardModalProps) {
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState(1)
  const [objectiveId, setObjectiveId] = useState('recepcao')
  const [config, setConfig] = useState<AgentConfig>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const c = (agent?.config ?? {}) as AgentConfig
      setConfig(c)
      setObjectiveId(c.objective ?? 'recepcao')
      setCurrentStep(1)
      setError(null)
    }
  }, [open, agent])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-agents', clientId] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...config, objective: objectiveId }
      const name = (config.agentName ?? '').trim() || `Agente da ${companyName}`
      if (agent) await updateAgent(agent.id, { name, config: payload })
      else await createAgent(clientId, { name, config: payload })
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(agent!.id),
    onSuccess: () => {
      invalidate()
      onClose()
    },
  })

  const step = AGENT_WIZARD_STEPS.find((s) => s.id === currentStep)!
  const objectiveLabel = AGENT_OBJECTIVE_OPTIONS.find((o) => o.id === objectiveId)?.title ?? '—'

  const fieldClass =
    'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-[var(--accent)]'

  return (
    <Modal open={open} onClose={onClose} className="h-full sm:h-[85vh] max-w-4xl">
      <div
        style={{ '--accent': ownerBrand.accentColor } as CSSProperties}
        className="flex h-full flex-col bg-surface text-ink border border-line shadow-2xl sm:rounded-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-surface border border-line flex items-center justify-center text-ink-2">
              <Bot size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink truncate">
                {(config.agentName ?? '').trim() || `Agente da ${companyName}`}
              </h2>
              <p className="text-xs text-ink-4 mt-0.5">
                {agent ? 'Editando agente' : 'Novo agente'} · passo {currentStep}/{AGENT_WIZARD_STEPS.length}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink-2 shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          <AgentStepList currentStep={currentStep} onSelect={setCurrentStep} />

          <div className="flex-1 min-w-0 p-5 lg:overflow-y-auto">
            {currentStep === 2 ? (
              <AgentObjectiveStep selectedId={objectiveId} onSelect={setObjectiveId} />
            ) : currentStep === 9 ? (
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">Revisão</h3>
                <p className="text-xs text-ink-4 mb-4">Confira antes de salvar. Dá pra editar depois.</p>
                <dl className="space-y-2.5">
                  <div className="rounded-lg border border-line bg-surface/50 px-3 py-2">
                    <dt className="text-[11px] uppercase tracking-wide text-ink-4">Objetivo</dt>
                    <dd className="text-sm text-ink-2 mt-0.5">{objectiveLabel}</dd>
                  </div>
                  {AGENT_WIZARD_STEPS.flatMap((s) => s.fields).map((f) => (
                    <div key={f.key} className="rounded-lg border border-line bg-surface/50 px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-ink-4">{f.label}</dt>
                      <dd className="text-sm text-ink-2 mt-0.5 whitespace-pre-wrap">
                        {config[f.key]?.trim() || <span className="text-ink-4">não preenchido</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">{step.label}</h3>
                <p className="text-xs text-ink-4 mb-4">{step.description}</p>
                <div className="space-y-4">
                  {step.fields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="block text-xs font-medium text-ink-3 mb-1">{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={4}
                          className={fieldClass}
                          placeholder={field.placeholder}
                          value={config[field.key] ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                        />
                      ) : (
                        <input
                          type="text"
                          className={fieldClass}
                          placeholder={field.placeholder}
                          value={config[field.key] ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line p-4 shrink-0">
          {agent ? (
            <button
              type="button"
              onClick={() => window.confirm(`Excluir o agente "${agent.name}"?`) && deleteMutation.mutate()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-ink hover:bg-danger/10"
            >
              <Trash2 size={14} />
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-danger-ink mr-2">{error}</span>}
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface"
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => {
                if (currentStep === AGENT_WIZARD_STEPS.length) saveMutation.mutate()
                else setCurrentStep((s) => Math.min(AGENT_WIZARD_STEPS.length, s + 1))
              }}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {currentStep === AGENT_WIZARD_STEPS.length
                ? saveMutation.isPending
                  ? 'Salvando…'
                  : 'Salvar agente'
                : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

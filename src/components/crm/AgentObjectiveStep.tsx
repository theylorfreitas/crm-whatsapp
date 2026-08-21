import { AGENT_OBJECTIVE_OPTIONS } from '../../data/agentWizardSteps'

interface AgentObjectiveStepProps {
  selectedId: string
  onSelect: (id: string) => void
}

export function AgentObjectiveStep({ selectedId, onSelect }: AgentObjectiveStepProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink mb-1">Objetivo do agente</h3>
      <p className="text-xs text-ink-4 mb-4">
        O que este agente deve fazer na conversa. Isso guia as perguntas, os critérios e o momento de transferir.
      </p>
      <div className="space-y-2">
        {AGENT_OBJECTIVE_OPTIONS.map((option) => {
          const selected = option.id === selectedId
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                selected ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-line bg-surface/60 hover:border-line-strong'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-[var(--accent)]' : 'border-line-strong'
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{option.title}</span>
                <span className="block text-xs text-ink-4 mt-0.5">{option.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

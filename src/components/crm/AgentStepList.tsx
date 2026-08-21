import { Check } from 'lucide-react'
import { AGENT_WIZARD_STEPS } from '../../data/agentWizardSteps'

interface AgentStepListProps {
  currentStep: number
  onSelect: (step: number) => void
}

export function AgentStepList({ currentStep, onSelect }: AgentStepListProps) {
  return (
    <div className="shrink-0 border-b lg:border-b-0 lg:border-r border-line p-3 lg:w-48 lg:p-3">
      <ol className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
        {AGENT_WIZARD_STEPS.map((step) => {
          const isActive = step.id === currentStep
          const isCompleted = step.id < currentStep
          return (
            <li key={step.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isActive ? 'bg-surface-2' : 'hover:bg-surface'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isActive || isCompleted ? 'bg-[var(--accent)] text-white' : 'bg-surface-2 text-ink-3'
                  }`}
                >
                  {isCompleted ? <Check size={12} /> : step.id}
                </span>
                <span className={`text-sm font-medium whitespace-nowrap lg:whitespace-normal ${isActive ? 'text-ink' : 'text-ink-2'}`}>
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

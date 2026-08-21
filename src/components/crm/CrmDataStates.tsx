import { Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Estados compartilhados por todas as seções do CRM — carregando, vazio de
// verdade (nunca dado de exemplo) e o cabeçalho padrão de cada seção.

export function CrmLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-4">
      <Loader2 size={16} className="animate-spin" /> Carregando…
    </div>
  )
}

export function CrmEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="text-xs text-ink-4 mt-1">{hint}</p>}
    </div>
  )
}

export function CrmSectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Icon size={17} className="text-ink-4" />
          {title}
        </h1>
        {description && <p className="text-sm text-ink-3 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export const crmInputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2 placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]/50'

export const crmButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50'

import type { LeadStatus } from '../../types/crm'

const STATUS_META: Record<LeadStatus, { label: string; dotClass: string }> = {
  novo: { label: 'Novo', dotClass: 'bg-info' },
  em_nutricao: { label: 'Em nutrição', dotClass: 'bg-[var(--accent)]' },
  nao_qualificado: { label: 'Não qualificado', dotClass: 'bg-ink-4' },
  contatado: { label: 'Contatado', dotClass: 'bg-warn' },
}

export function LeadStatusPill({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  )
}

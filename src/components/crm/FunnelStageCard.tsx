import { formatBRL } from '../../lib/currency'
import type { FunnelStage } from '../../types/crm'

export const STAGE_CARD_WIDTH = 176
export const STAGE_CARD_HEIGHT = 108

const VARIANT_CLASS: Record<FunnelStage['variant'], string> = {
  normal: 'border-line bg-surface',
  won: 'border-ok-line bg-ok-bg',
  lost: 'border-danger-line bg-danger-bg',
}

interface FunnelStageCardProps {
  stage: FunnelStage
  onViewDeals: (stageId: string) => void
}

export function FunnelStageCard({ stage, onViewDeals }: FunnelStageCardProps) {
  return (
    <div className={`relative rounded-xl border p-3 shadow-sm ${VARIANT_CLASS[stage.variant]}`}>
      {/* Pontos de conexão do funil. Eram vermelhos com anel branco — no
          escuro o anel branco virava um furo aceso, e vermelho num cartão de
          etapa lê como erro, não como "aqui encaixa a linha". Passam a ser a
          cor da marca, recortados no fundo do app. */}
      <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] absolute -left-[5px] top-1/2 -translate-y-1/2 ring-2 ring-[var(--app-bg)]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] absolute -right-[5px] top-1/2 -translate-y-1/2 ring-2 ring-[var(--app-bg)]" />

      <p className="text-[9px] font-semibold tracking-wider text-ink-4">ETAPA</p>
      <p className="text-sm font-semibold text-ink leading-snug mt-0.5 line-clamp-2">{stage.name}</p>

      <div className="flex items-center gap-3 mt-2 text-xs text-ink-3">
        <span>
          <strong className="text-ink-2 font-semibold">{stage.dealsCount}</strong> negócios
        </span>
        <span className="text-ink-2 font-semibold">{formatBRL(stage.value)}</span>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-ink-4">{stage.winRatePct}%</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onViewDeals(stage.id)
          }}
          className="text-[11px] font-medium text-[var(--accent-ink)] hover:underline"
        >
          ver negócios
        </button>
      </div>
    </div>
  )
}

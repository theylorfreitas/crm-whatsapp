import { Filter, Users, RotateCw } from 'lucide-react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { formatBRL } from '../../lib/currency'
import type { FunnelSummary } from '../../types/crm'

interface FunnelToolbarProps {
  summary: FunnelSummary
  onOpenAgentModal: () => void
  clientId: string
}

// Esta barra tinha sete botões e só um funcionava. Ação, Nota, Etapa, Modelo
// Clínica e Auto-organizar chamavam console.log('TODO'): na tela pareciam
// prontos, e clicar não fazia absolutamente nada. Recarregar não tinha nem
// onClick.
//
// Foram removidos em vez de mantidos "pra depois". Botão que não faz o que diz
// é pior que botão ausente: a pessoa clica, nada acontece, e ela conclui que o
// sistema está quebrado. Quando cada um existir de verdade, volta.
export function FunnelToolbar({ summary, onOpenAgentModal, clientId }: FunnelToolbarProps) {
  const queryClient = useQueryClient()
  const buscando = useIsFetching({ queryKey: ['crm-pipeline', clientId] }) > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6 py-3">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Filter size={15} className="text-ink-4" />
          Funil
        </span>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <p className="text-ink-4">EM ABERTO</p>
            <p className="font-semibold text-ink">{formatBRL(summary.openValue)}</p>
          </div>
          <div>
            <p className="text-ink-4">NEGÓCIOS</p>
            <p className="font-semibold text-ink">{summary.dealsCount}</p>
          </div>
          <div>
            <p className="text-ink-4">TAXA DE GANHO</p>
            <p className="font-semibold text-ink">{summary.winRatePct}%</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenAgentModal}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-medium text-ink-2 hover:bg-canvas"
        >
          <Users size={13} />
          Agente
        </button>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['crm-pipeline', clientId] })}
          disabled={buscando}
          aria-label="Recarregar o funil"
          title="Recarregar"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-3 hover:bg-canvas disabled:opacity-50"
        >
          <RotateCw size={14} className={buscando ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

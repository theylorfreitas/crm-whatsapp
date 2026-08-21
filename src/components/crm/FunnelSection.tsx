import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { FunnelToolbar } from './FunnelToolbar'
import { FunnelCanvas } from './FunnelCanvas'
import { AgentWizardModal } from './AgentWizardModal'
import { CrmLoading, CrmEmpty } from './CrmDataStates'
import { fetchPipeline, saveStagePosition } from '../../lib/db/crm'
import type { FunnelStage } from '../../types/crm'

interface FunnelSectionProps {
  clientId: string
  companyName: string
  onViewDeals: () => void
}

// Funil visual REAL: as etapas vêm de crm_stages (criadas junto com o
// cliente) e os números de cada etapa são agregados dos negócios em
// crm_deals. Arrastar uma etapa grava a nova posição no banco.
export function FunnelSection({ clientId, companyName, onViewDeals }: FunnelSectionProps) {
  const pipelineQuery = useQuery({ queryKey: ['crm-pipeline', clientId], queryFn: () => fetchPipeline(clientId) })
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [agentModalOpen, setAgentModalOpen] = useState(false)

  useEffect(() => {
    if (pipelineQuery.data) setStages(pipelineQuery.data.stages)
  }, [pipelineQuery.data])

  const positionMutation = useMutation({
    mutationFn: (vars: { id: string; x: number; y: number }) => saveStagePosition(vars.id, vars.x, vars.y),
  })

  function handleMoveStage(id: string, x: number, y: number) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)))
    positionMutation.mutate({ id, x, y })
  }

  if (pipelineQuery.isLoading) return <CrmLoading />

  if (!pipelineQuery.data) {
    return (
      <div className="p-6">
        <CrmEmpty title="Funil não encontrado" hint="O funil padrão é criado junto com o cliente." />
      </div>
    )
  }

  const openValue = stages.filter((s) => s.variant === 'normal').reduce((sum, s) => sum + s.value, 0)
  const dealsCount = stages.reduce((sum, s) => sum + s.dealsCount, 0)
  const wonStage = stages.find((s) => s.variant === 'won')
  const winRatePct = dealsCount > 0 ? Math.round(((wonStage?.dealsCount ?? 0) / dealsCount) * 100) : 0

  return (
    <div className="flex h-full flex-col">
      <FunnelToolbar
        summary={{ openValue, dealsCount, winRatePct }}
        onOpenAgentModal={() => setAgentModalOpen(true)}
        clientId={clientId}
      />
      <FunnelCanvas
        stages={stages}
        connections={pipelineQuery.data.connections}
        onMoveStage={handleMoveStage}
        onViewDeals={onViewDeals}
      />
      <AgentWizardModal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
        companyName={companyName}
        clientId={clientId}
      />
    </div>
  )
}

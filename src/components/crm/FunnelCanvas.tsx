import { useMemo } from 'react'
import { NodeCanvas } from '../canvas/NodeCanvas'
import { FunnelStageCard, STAGE_CARD_WIDTH, STAGE_CARD_HEIGHT } from './FunnelStageCard'
import type { FunnelStage, FunnelConnection } from '../../types/crm'

interface FunnelCanvasProps {
  stages: FunnelStage[]
  connections: FunnelConnection[]
  onMoveStage: (id: string, x: number, y: number) => void
  onViewDeals: (id: string) => void
}

// TODO: conectar/desconectar etapas arrastando de um "porto" (bolinha
// vermelha) até outro ainda não está implementado — hoje as ligações vêm
// fixas do mock (getFunnelConnections) e só a posição dos cartões é
// arrastável. O motor de arrastar/zoom/mini-mapa é o NodeCanvas, compartilhado
// com os outros quadros arrastáveis do sistema.
export function FunnelCanvas({ stages, connections, onMoveStage, onViewDeals }: FunnelCanvasProps) {
  const nodes = useMemo(
    () => stages.map((stage) => ({ ...stage, width: STAGE_CARD_WIDTH, height: STAGE_CARD_HEIGHT })),
    [stages],
  )

  return (
    <NodeCanvas
      nodes={nodes}
      connections={connections.map((c) => ({ fromId: c.fromId, toId: c.toId }))}
      onMoveNode={onMoveStage}
      renderNode={(node) => <FunnelStageCard stage={node} onViewDeals={onViewDeals} />}
      background="bg-surface-2"
    />
  )
}

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Plus, Minus, Maximize } from 'lucide-react'

export interface CanvasNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasConnection {
  fromId: string
  toId: string
}

interface Anchors {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface NodeCanvasProps<T extends CanvasNode> {
  nodes: T[]
  connections?: CanvasConnection[]
  onMoveNode: (id: string, x: number, y: number) => void
  renderNode: (node: T) => ReactNode
  getAnchors?: (from: T, to: T) => Anchors
  minimapClassName?: (node: T) => string
  connectionColor?: string
  background?: string
  
  minZoom?: number
  maxZoom?: number
}

function defaultAnchors<T extends CanvasNode>(from: T, to: T): Anchors {
  return { x1: from.x + from.width, y1: from.y + from.height / 2, x2: to.x, y2: to.y + to.height / 2 }
}

// Motor de canvas compartilhado por telas bem diferentes: o Funil do CRM, a
// o Funil e outros quadros que venham depois. Cada tela entra
// só com o cartão (renderNode) e como as linhas se ancoram (getAnchors) —
// arrastar, zoom e mini-mapa são sempre o mesmo motor, pra não duplicar essa
// lógica em cada módulo.
export function NodeCanvas<T extends CanvasNode>({
  nodes,
  connections = [],
  onMoveNode,
  renderNode,
  getAnchors = defaultAnchors,
  minimapClassName,
  connectionColor = '#cbd5e1',
  background = 'bg-surface-2',
  minZoom = 40,
  maxZoom = 150,
}: NodeCanvasProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const [dragState, setDragState] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)

  const contentWidth = Math.max(...nodes.map((n) => n.x + n.width), 0) + 120
  const contentHeight = Math.max(...nodes.map((n) => n.y + n.height), 0) + 120

  function pointerToCanvas(e: ReactPointerEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const scale = zoom / 100
    return {
      x: (e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0)) / scale,
      y: (e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0)) / scale,
    }
  }

  function handleNodePointerDown(e: ReactPointerEvent<HTMLDivElement>, nodeId: string) {
    const point = pointerToCanvas(e)
    const node = nodes.find((n) => n.id === nodeId)
    if (!point || !node) return
    setDragState({ id: nodeId, offsetX: point.x - node.x, offsetY: point.y - node.y })
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState) return
    const point = pointerToCanvas(e)
    if (!point) return
    onMoveNode(dragState.id, Math.max(0, point.x - dragState.offsetX), Math.max(0, point.y - dragState.offsetY))
  }

  return (
    <div className={`relative flex-1 min-h-0 ${background}`}>
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragState(null)}
        onPointerLeave={() => setDragState(null)}
        className="h-full w-full overflow-auto"
      >
        <div style={{ width: contentWidth * (zoom / 100), height: contentHeight * (zoom / 100) }} className="relative">
          <div
            style={{ width: contentWidth, height: contentHeight, transform: `scale(${zoom / 100})`, transformOrigin: '0 0' }}
            className="relative"
          >
            <svg width={contentWidth} height={contentHeight} className="absolute left-0 top-0 pointer-events-none">
              {connections.map((conn) => {
                const from = nodes.find((n) => n.id === conn.fromId)
                const to = nodes.find((n) => n.id === conn.toId)
                if (!from || !to) return null
                const { x1, y1, x2, y2 } = getAnchors(from, to)
                const midX = (x1 + x2) / 2
                const midY = (y1 + y2) / 2
                const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1)
                const d = isVertical
                  ? `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
                return <path key={`${conn.fromId}-${conn.toId}`} d={d} fill="none" stroke={connectionColor} strokeWidth={2} />
              })}
            </svg>

            {nodes.map((node) => (
              <div
                key={node.id}
                style={{ left: node.x, top: node.y, width: node.width }}
                className="absolute select-none cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => handleNodePointerDown(e, node.id)}
              >
                {renderNode(node)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`absolute left-3 bottom-3 flex items-center gap-0.5 rounded-lg border p-1 shadow-sm border-line bg-surface`}
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(minZoom, z - 10))}
          aria-label="Diminuir zoom"
          className={`rounded p-1.5 text-ink-3 hover:bg-surface-2`}
        >
          <Minus size={14} />
        </button>
        <span className={`w-10 text-center text-xs text-ink-3`}>{zoom}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(maxZoom, z + 10))}
          aria-label="Aumentar zoom"
          className={`rounded p-1.5 text-ink-3 hover:bg-surface-2`}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={() => setZoom(100)}
          aria-label="Ajustar à tela"
          className={`rounded p-1.5 text-ink-3 hover:bg-surface-2`}
        >
          <Maximize size={14} />
        </button>
      </div>

      <div
        className={`absolute right-3 bottom-3 hidden sm:block h-20 w-32 rounded-lg border p-1.5 shadow-sm border-line bg-surface`}
      >
        <div className={`relative h-full w-full rounded overflow-hidden bg-canvas`}>
          {nodes.map((node) => (
            <span
              key={node.id}
              style={{
                left: `${(node.x / contentWidth) * 100}%`,
                top: `${(node.y / contentHeight) * 100}%`,
                width: `${(node.width / contentWidth) * 100}%`,
                height: `${(node.height / contentHeight) * 100}%`,
              }}
              className={`absolute rounded-sm ${minimapClassName ? minimapClassName(node) : 'bg-line-strong'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

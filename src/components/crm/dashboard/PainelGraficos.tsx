import { useState } from 'react'

// Gráficos do painel do CRM, em SVG puro.
//
// Sem biblioteca de gráfico de propósito: são duas formas (uma linha e uma
// barra horizontal), e qualquer lib traria 100 kB e um tema próprio pra
// brigar com o do app. Aqui a cor vem dos tokens, então o gráfico acompanha o
// tema claro/escuro sozinho.

const EIXO = 'rgb(from currentColor r g b / 0.18)'

/** Ponto de um dia no gráfico de linha. */
export interface PontoDia {
  day: string
  count: number
  revenue: number
}

interface GraficoLinhaProps {
  pontos: PontoDia[]
  /** O que a linha desenha. 'count' = quantidade de vendas; 'revenue' = valor. */
  medida: 'count' | 'revenue'
  formatar: (v: number) => string
}

/**
 * Linha de vendas ao longo do período.
 *
 * O eixo Y sempre começa em zero: começar no menor valor faz uma variação de
 * 2% parecer despencar. O topo é arredondado pra cima pra sobrar respiro e a
 * linha não encostar na borda.
 */
export function GraficoLinha({ pontos, medida, formatar }: GraficoLinhaProps) {
  const [ativo, setAtivo] = useState<number | null>(null)

  const L = 44 // espaço do eixo Y
  const B = 26 // espaço do eixo X
  const W = 800
  const H = 220
  const larguraUtil = W - L - 8
  const alturaUtil = H - B - 12

  const valores = pontos.map((p) => (medida === 'count' ? p.count : p.revenue))
  const bruto = Math.max(...valores, 0)
  // topo "redondo": 4 vira 4, 4,3 vira 5 — evita rótulo de eixo quebrado
  const topo = bruto <= 4 ? Math.max(4, Math.ceil(bruto)) : Math.ceil(bruto * 1.15)

  const x = (i: number) => L + (pontos.length <= 1 ? larguraUtil / 2 : (i / (pontos.length - 1)) * larguraUtil)
  const y = (v: number) => 12 + alturaUtil - (v / topo) * alturaUtil

  const linha = pontos.map((_, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(valores[i])}`).join(' ')
  const area = `${linha} L ${x(pontos.length - 1)} ${12 + alturaUtil} L ${x(0)} ${12 + alturaUtil} Z`

  // Um rótulo a cada N pontos: 24 datas lado a lado viram borrão.
  const passo = Math.max(1, Math.ceil(pontos.length / 12))
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(topo * f))

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-ink-4" style={{ height: 220 }} role="img" aria-label="Vendas por período">
        {[...new Set(marcas)].map((m) => (
          <g key={m}>
            <line x1={L} x2={W - 8} y1={y(m)} y2={y(m)} stroke={EIXO} strokeWidth="1" />
            <text x={L - 8} y={y(m) + 3.5} textAnchor="end" className="fill-current text-[10px] tabular-nums">
              {medida === 'count' ? m : formatar(m)}
            </text>
          </g>
        ))}

        <path d={area} className="fill-[var(--accent)]" opacity="0.12" />
        <path d={linha} fill="none" className="stroke-[var(--accent)]" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {pontos.map((p, i) => (
          <g key={p.day}>
            {i % passo === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-current text-[9px] tabular-nums">
                {new Date(`${p.day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </text>
            )}
            {/* alvo largo e invisível: acertar um ponto de 3px com o mouse é
                trabalho, e o gráfico fica sem tooltip na prática */}
            <rect
              x={x(i) - larguraUtil / Math.max(1, pontos.length) / 2}
              y={0}
              width={Math.max(8, larguraUtil / Math.max(1, pontos.length))}
              height={H - B}
              fill="transparent"
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
            />
            {(ativo === i || pontos.length <= 31) && (
              <circle
                cx={x(i)}
                cy={y(valores[i])}
                r={ativo === i ? 4.5 : 2.5}
                className="fill-[var(--accent)]"
                stroke="var(--app-bg)"
                strokeWidth="1.5"
              />
            )}
          </g>
        ))}

        {ativo !== null && <line x1={x(ativo)} x2={x(ativo)} y1={12} y2={12 + alturaUtil} stroke={EIXO} strokeWidth="1" />}
      </svg>

      {ativo !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface-solid px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(x(ativo) / W) * 100}%`, top: `${(y(valores[ativo]) / H) * 100}%` }}
        >
          <p className="font-medium text-ink">
            {new Date(`${pontos[ativo].day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </p>
          <p className="tabular-nums text-ink-3">
            {pontos[ativo].count} {pontos[ativo].count === 1 ? 'venda' : 'vendas'} · {formatar(pontos[ativo].revenue)}
          </p>
        </div>
      )}
    </div>
  )
}

export interface BarraItem {
  id: string
  label: string
  count: number
  total: number
}

/**
 * Barras horizontais. Horizontal e não vertical porque os rótulos são nomes
 * (instância, estado) — na vertical eles teriam que virar de lado pra caber.
 */
export function GraficoBarras({
  itens,
  medida,
  formatar,
}: {
  itens: BarraItem[]
  medida: 'count' | 'total'
  formatar: (v: number) => string
}) {
  const valor = (i: BarraItem) => (medida === 'count' ? i.count : i.total)
  const maior = Math.max(1, ...itens.map(valor))

  return (
    <div className="space-y-2.5">
      {itens.slice(0, 8).map((i) => (
        <div key={i.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink-2">{i.label}</span>
            <span className="shrink-0 tabular-nums text-ink-3">
              {medida === 'count' ? `${i.count} ${i.count === 1 ? 'venda' : 'vendas'}` : formatar(i.total)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div
              className="h-2 rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.max(2, (valor(i) / maior) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

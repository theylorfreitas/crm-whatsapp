import { Palette } from 'lucide-react'
import { readableOn } from '../../lib/readableOn'

// UM seletor de cor para o sistema inteiro.
//
// Antes cada tela tinha o seu: etiquetas ofereciam oito cores fixas,
// departamentos as mesmas oito, o Kanban outras — e nenhuma delas deixava
// escolher uma cor que não estivesse na lista. Quem quer a cor exata da própria
// marca não a encontrava em lugar nenhum, e acabava com um roxo parecido.
//
// Aqui são as duas coisas juntas: os atalhos para quem só quer uma cor
// distinguível, e o mapa de cor do navegador para quem tem um hex na mão.

/**
 * As dez do atalho. Escolhidas para se distinguirem UMA DA OUTRA quando viram
 * bolinha de 10px numa lista — não para serem bonitas lado a lado. Por isso não
 * há dois azuis nem dois verdes vizinhos no espectro.
 */
export const CORES_DO_ATALHO = [
  '#3B82F6', // azul
  '#EF4444', // vermelho
  '#10B981', // verde
  '#F59E0B', // âmbar
  '#A855F7', // roxo
  '#F97316', // laranja
  '#06B6D4', // ciano
  '#84CC16', // lima
  '#EC4899', // rosa
  '#6B7280', // cinza
] as const

/** Um hex de 6 dígitos com #. É o que o `input type=color` aceita. */
function normalizar(valor: string): string | null {
  const limpo = valor.trim().replace(/^#/, '')
  const cheio = limpo.length === 3 ? limpo.replace(/./g, (c) => c + c) : limpo
  if (cheio.length !== 6 || /[^0-9a-fA-F]/.test(cheio)) return null
  return `#${cheio.toUpperCase()}`
}

export function SeletorDeCor({
  value,
  onChange,
  /** O texto do balãozinho de Visualização. Sem ele, a prévia não aparece. */
  previewLabel,
}: {
  value: string
  onChange: (cor: string) => void
  previewLabel?: string
}) {
  const atual = normalizar(value) ?? CORES_DO_ATALHO[0]

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-5 gap-2">
        {CORES_DO_ATALHO.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Cor ${c}`}
            aria-pressed={atual === c}
            style={{ backgroundColor: c }}
            // 36px de altura: é o alvo mínimo que a mão acerta no celular, e
            // uma fileira de bolinhas de 24px era o que fazia errar a cor.
            className={`h-9 rounded-lg transition-transform ${
              atual === c ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-solid)]' : 'hover:scale-105'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Palette size={15} className="shrink-0 text-ink-4" />
        {/* O mapa de cor do próprio navegador. Não é um enfeite ao lado da
            paleta: é o único caminho para a cor exata de uma marca. */}
        <input
          type="color"
          value={atual}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label="Escolher uma cor específica"
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
        />
        <input
          value={value}
          onChange={(e) => {
            // Deixa digitar livre e só avisa o pai quando vira cor de verdade:
            // travando por caractere, ninguém consegue apagar para reescrever.
            const pronta = normalizar(e.target.value)
            onChange(pronta ?? e.target.value)
          }}
          spellCheck={false}
          aria-label="Código da cor"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm uppercase text-ink-2 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line"
        />
      </div>

      {previewLabel !== undefined && (
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-2">Visualização</span>
          <div className="rounded-lg border border-line bg-canvas px-3 py-2.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: atual, color: readableOn(atual) }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: readableOn(atual), opacity: 0.7 }} />
              {previewLabel.trim() || 'Nome'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

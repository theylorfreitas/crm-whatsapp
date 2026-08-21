import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

// Peças pequenas reaproveitadas por todas as telas do CRM. Ficam num arquivo
// só pra que modal, campo, botão e tabela tenham exatamente o mesmo desenho
// em toda parte — e pra que um ajuste de estilo seja um ajuste só.

export function CrmModal({
  open,
  title,
  description,
  icon,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean
  title: string
  description?: string
  /** Ícone ao lado do título. Ajuda a reconhecer o modal antes de ler. */
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null

  // SAI POR PORTAL PRO <body>, e não é preciosismo.
  //
  // `position: fixed` se posiciona pela janela — exceto quando algum ancestral
  // tem `transform`, `filter` ou `perspective`, e aí o ancestral vira a
  // referência. A casca do painel anima a entrada de cada tela com um
  // `transform`, então o modal nascia preso dentro dela: numa janela de 900px
  // ele calculava altura contra uma caixa de 320px, e o cabeçalho ficava
  // cortado acima do topo. Quem abria via um diálogo pela metade, sem título.
  //
  // O `backwards` no `.tela-entra` (ver index.css) tira o transform depois da
  // animação e conserta o caso comum. O portal conserta TODOS: nenhum
  // ancestral futuro pode prender este modal de novo.
  return createPortal(
    // O véu é mais fundo do que o de um modal comum porque estes abrem por cima
    // do editor de fluxo, que é uma tela cheia de caixas coloridas. Com véu
    // claro elas continuavam brigando com o formulário.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // `bg-surface-solid`, não `bg-surface`: o surface do tema é vidro de
        // propósito, e vidro só funciona apoiado numa página. Flutuando, deixa
        // passar o que está atrás e o texto do formulário fica ilegível.
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl border border-line bg-surface-solid shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sem descrição o título fica sozinho na linha, então cresce e o ícone
            centraliza com ele. Com descrição, os dois se alinham pelo topo — o
            ícone ao lado de um bloco de duas linhas não tem centro pra achar. */}
        <div className={`flex justify-between gap-3 border-b border-line-soft px-5 py-3.5 ${description ? 'items-start' : 'items-center'}`}>
          <div className={`flex min-w-0 gap-2.5 ${description ? 'items-start' : 'items-center'}`}>
            {icon && <span className={`shrink-0 text-[var(--accent-ink)] ${description ? 'mt-px' : ''}`}>{icon}</span>}
            <div className="min-w-0">
              <h2 className={`font-semibold text-ink ${description ? 'text-sm' : 'text-base'}`}>{title}</h2>
              {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 text-ink-4 hover:bg-surface-2">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function CrmField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-4">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2 placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-line focus:border-line-strong'

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed'

export const ghostButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-2 hover:bg-canvas disabled:opacity-50'

export const dangerButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger-line bg-surface px-3 py-1.5 text-xs font-medium text-danger-ink hover:bg-danger-bg'

export function CrmToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-canvas"
    >
      <span>
        <span className="block text-sm text-ink-2">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-4">{hint}</span>}
      </span>
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
          checked ? 'bg-ok' : 'bg-line-strong'
        }`}
      >
        <span className={`h-4 w-4 rounded-full bg-surface transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  )
}

const PILL_TONES: Record<string, string> = {
  verde: 'bg-ok-bg text-ok-ink',
  vermelho: 'bg-danger-bg text-danger-ink',
  amarelo: 'bg-warn-bg text-warn-ink',
  azul: 'bg-info-bg text-info-ink',
  // "roxo" aqui sempre quis dizer "a cor da marca". Ligado ao --accent, ele
  // passa a ser o roxo DAQUELE cliente em vez de um violeta fixo.
  roxo: 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent-ink)]',
  cinza: 'bg-surface-2 text-ink-2',
}

export function CrmPill({ tone = 'cinza', children }: { tone?: keyof typeof PILL_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL_TONES[tone]}`}>
      {children}
    </span>
  )
}

// Tabela com rolagem horizontal própria: numa tela estreita o conteúdo largo
// desliza dentro do quadro em vez de empurrar a página inteira.
export function CrmTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-line-soft text-left">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
    </div>
  )
}

export function CrmErrorBar({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-danger-line bg-danger-bg px-3 py-2">
      <p className="text-xs text-danger-ink">{message}</p>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-danger-ink hover:text-danger-ink">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function CrmNoticeBar({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-xs text-ink-2">{message}</p>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-ink-4 hover:text-ink-2">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// Aviso de "falta configurar X" — o estado honesto quando a funcionalidade
// existe inteira mas depende de uma credencial que ainda não foi cadastrada.
export function CrmConnectHint({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-4 rounded-xl border border-warn-line bg-warn-bg px-4 py-3">
      <p className="text-sm font-medium text-warn-ink">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-warn-ink">{detail}</p>
    </div>
  )
}

/**
 * Confirmar antes de apagar. Sempre — não "das vezes que dá medo".
 *
 * O editor de fluxo grava sozinho. Isso quer dizer que apagar um bloco não
 * espera ninguém clicar em Salvar: no segundo seguinte já está no banco, e não
 * há Ctrl+Z que traga de volta um bloco com o texto todo escrito dentro dele.
 * A lixeira fica a um pixel do lápis, e a mão erra.
 *
 * O botão de confirmar NÃO nasce focado, de propósito: quem apertou a lixeira
 * sem querer costuma apertar Enter em seguida, e um confirmar focado deixaria
 * os dois cliques errados valerem como um só.
 */
export function CrmConfirmarExclusao({
  open,
  titulo,
  pergunta,
  rotuloConfirmar = 'Excluir',
  onConfirmar,
  onCancelar,
}: {
  open: boolean
  titulo: string
  /** A frase inteira, com o nome do que vai sumir. "Tem certeza?" não diz o quê. */
  pergunta: ReactNode
  rotuloConfirmar?: string
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <CrmModal
      open={open}
      title={titulo}
      icon={<AlertTriangle size={17} className="text-danger-ink" />}
      onClose={onCancelar}
      footer={
        <>
          <button type="button" onClick={onCancelar} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} className={primaryButtonClass}>
            {rotuloConfirmar}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-2">{pergunta}</p>
    </CrmModal>
  )
}

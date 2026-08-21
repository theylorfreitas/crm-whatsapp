import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

// Substituto do <select> nativo.
//
// POR QUE EXISTE: a listinha que o <select> abre não é desenhada pela página —
// é do sistema operacional. Ela ignora classe, ignora token de tema e ignora
// backdrop-filter. No tema escuro do app ela aparecia branca, com a linha
// selecionada em azul do Windows e as outras quase ilegíveis. Não é um bug de
// CSS que dava pra ajustar: `<option>` simplesmente não aceita estilo.
//
// A API é a MESMA do <select> de propósito — mesmos `value`, `onChange` e
// filhos `<option>`. Isso fez a troca nas ~70 ocorrências ser só renomear a
// tag, sem reescrever cada tela (e sem a chance de errar em uma delas).
// `onChange` recebe um objeto no formato `{ target: { value } }`, então o
// código que já existia continuou valendo sem uma linha alterada.
//
// A lista vai num portal com posição FIXA calculada a partir do gatilho: dentro
// de modal e de área com rolagem, uma lista `absolute` seria cortada pelo
// overflow do pai justamente quando é mais precisa.

interface OpcaoLida {
  value: string
  label: ReactNode
  texto: string
  disabled: boolean
}

/** Lê os <option> filhos. `Children.toArray` já achata o resultado de .map(). */
function lerOpcoes(children: ReactNode): OpcaoLida[] {
  return Children.toArray(children)
    .filter((c) => isValidElement(c) && c.type === 'option')
    .map((c) => {
      const p = (c as React.ReactElement<{ value?: string; children?: ReactNode; disabled?: boolean }>).props
      const label = p.children
      return {
        value: String(p.value ?? ''),
        label,
        // Texto puro pra busca por digitação e pra comparar sem depender do JSX.
        texto: typeof label === 'string' ? label : String(label ?? ''),
        disabled: !!p.disabled,
      }
    })
}

/**
 * Herda os atributos de <button> (onClick, title, aria-*, name…) porque o
 * gatilho É um botão, e as telas passam esses atributos como passavam pro
 * <select>. `value` aceita number e undefined pelo mesmo motivo: é o que os
 * campos genéricos (DarkSelectField, WizardSelectField) repassam.
 */
interface SelecaoProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children'> {
  value?: string | number | readonly string[]
  onChange: (e: { target: { value: string } }) => void
  children: ReactNode
  placeholder?: string
}

export function Selecao({ value, onChange, children, className = '', id, disabled, placeholder, ...resto }: SelecaoProps) {
  const opcoes = lerOpcoes(children)
  const valorAtual = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
  const selecionada = opcoes.find((o) => o.value === valorAtual)

  const [aberto, setAberto] = useState(false)
  const [emFoco, setEmFoco] = useState(0)
  const [caixa, setCaixa] = useState<{ left: number; top: number; width: number; paraCima: boolean; accent: string } | null>(
    null,
  )
  const gatilho = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const digitado = useRef({ texto: '', quando: 0 })
  const listaId = useId()

  function medir() {
    const el = gatilho.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const alturaLista = Math.min(opcoes.length * 34 + 8, 260)
    // Abre pra cima quando não cabe embaixo — perto do rodapé, uma lista que
    // abre pra baixo fica metade fora da tela.
    const paraCima = r.bottom + alturaLista > window.innerHeight - 8 && r.top > alturaLista

    // A COR DA MARCA VIAJA JUNTO. `--accent` é declarado no <div> do workspace
    // (é a cor daquele cliente), e variável CSS herda pela árvore do DOM. Como
    // a lista sai num portal pro <body>, ela cai FORA dessa árvore e pegava o
    // roxo padrão do :root — o destaque da opção escolhida ficava indigo em vez
    // da cor do cliente. Lendo o valor no gatilho e reaplicando na lista, a
    // regra [style*="--accent"] recalcula o --accent-ink sozinha.
    const accent = getComputedStyle(el).getPropertyValue('--accent').trim()

    setCaixa({ left: r.left, top: paraCima ? r.top - alturaLista - 4 : r.bottom + 4, width: r.width, paraCima, accent })
  }

  useLayoutEffect(() => {
    if (!aberto) return
    medir()
    setEmFoco(Math.max(0, opcoes.findIndex((o) => o.value === valorAtual)))
    // `capture` pega a rolagem de qualquer pai (modal, painel lateral), não só
    // a da janela.
    const recalcular = () => medir()
    window.addEventListener('resize', recalcular)
    window.addEventListener('scroll', recalcular, true)
    return () => {
      window.removeEventListener('resize', recalcular)
      window.removeEventListener('scroll', recalcular, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    function foraDaLista(e: MouseEvent) {
      const alvo = e.target as Node
      if (!gatilho.current?.contains(alvo) && !lista.current?.contains(alvo)) setAberto(false)
    }
    document.addEventListener('mousedown', foraDaLista)
    return () => document.removeEventListener('mousedown', foraDaLista)
  }, [aberto])

  useEffect(() => {
    if (aberto) lista.current?.querySelector('[data-focada="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [aberto, emFoco])

  function escolher(o: OpcaoLida) {
    if (o.disabled) return
    onChange({ target: { value: o.value } })
    setAberto(false)
    gatilho.current?.focus()
  }

  function andar(passo: number) {
    if (!opcoes.length) return
    let i = emFoco
    for (let n = 0; n < opcoes.length; n++) {
      i = (i + passo + opcoes.length) % opcoes.length
      if (!opcoes[i].disabled) break
    }
    setEmFoco(i)
  }

  function noTeclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setAberto(false)
      return
    }
    if (!aberto && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      setAberto(true)
      return
    }
    if (!aberto) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      andar(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      andar(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setEmFoco(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setEmFoco(opcoes.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (opcoes[emFoco]) escolher(opcoes[emFoco])
    } else if (e.key === 'Tab') {
      setAberto(false)
    } else if (e.key.length === 1) {
      // Busca por digitação, como no select nativo: teclas seguidas em menos
      // de um segundo formam uma palavra.
      const agora = Date.now()
      digitado.current.texto = agora - digitado.current.quando < 1000 ? digitado.current.texto + e.key : e.key
      digitado.current.quando = agora
      const alvo = digitado.current.texto.toLowerCase()
      const i = opcoes.findIndex((o) => !o.disabled && o.texto.toLowerCase().startsWith(alvo))
      if (i >= 0) setEmFoco(i)
    }
  }

  return (
    <>
      <button
        {...resto}
        ref={gatilho}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={aberto ? listaId : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        // Espalhar `resto` antes e compor aqui: se a tela passou um onClick
        // próprio (a tabela de leads passa, pra não abrir a linha junto), ele
        // roda E a lista abre. Deixar o spread depois apagaria a abertura.
        onClick={(e) => {
          resto.onClick?.(e)
          if (!disabled) setAberto((v) => !v)
        }}
        onKeyDown={(e) => {
          resto.onKeyDown?.(e)
          noTeclado(e)
        }}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`truncate ${selecionada ? '' : 'text-ink-4'}`}>
          {selecionada ? selecionada.label : (placeholder ?? '')}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto &&
        caixa &&
        createPortal(
          <ul
            ref={lista}
            id={listaId}
            role="listbox"
            aria-activedescendant={`${listaId}-${emFoco}`}
            tabIndex={-1}
            style={
              {
                position: 'fixed',
                left: caixa.left,
                top: caixa.top,
                width: caixa.width,
                zIndex: 80,
                ...(caixa.accent ? { '--accent': caixa.accent } : {}),
              } as React.CSSProperties
            }
            className="max-h-[260px] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
          >
            {opcoes.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-ink-4">Nada para escolher</li>
            ) : (
              opcoes.map((o, i) => {
                const escolhida = o.value === valorAtual
                return (
                  <li
                    key={`${o.value}-${i}`}
                    id={`${listaId}-${i}`}
                    role="option"
                    aria-selected={escolhida}
                    data-focada={i === emFoco}
                    onMouseEnter={() => setEmFoco(i)}
                    onClick={() => escolher(o)}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                      o.disabled
                        ? 'cursor-not-allowed text-ink-4 opacity-50'
                        : i === emFoco
                          ? 'bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] text-ink'
                          : 'text-ink-2'
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {escolhida && <Check size={13} className="shrink-0 text-[var(--accent-ink)]" />}
                  </li>
                )
              })
            )}
          </ul>,
          document.body,
        )}
    </>
  )
}

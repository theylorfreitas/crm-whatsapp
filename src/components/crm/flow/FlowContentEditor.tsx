import { useEffect, useRef, useState } from 'react'
import {
  Type,
  Image as ImageIcon,
  Video,
  Mic,
  Clock,
  User,
  FileText,
  Sticker,
  Trash2,
  GripVertical,
  Upload,
  Link2,
  Sparkles,
  Loader2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Smile,
  Wand2,
} from 'lucide-react'
import type { FlowContentItem, FlowContentKind, FlowMediaSource } from '../../../types/crmFlow'
import { novoConteudo } from '../../../types/crmFlow'
import { enviarMidiaDoFluxo, LIMITES } from '../../../lib/db/crmFlowMedia'
import { CrmField, inputClass, CrmToggle } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// Os conteúdos de um bloco Mensagem. Cada item vira uma mensagem no WhatsApp,
// na ordem da lista. É o "Adicionar Conteúdo" das telas de referência.

const CATALOGO: { kind: FlowContentKind; label: string; icone: typeof Type; cor: string }[] = [
  { kind: 'texto', label: 'Texto', icone: Type, cor: '#3b82f6' },
  { kind: 'imagem', label: 'Imagem', icone: ImageIcon, cor: '#22c55e' },
  { kind: 'video', label: 'Vídeo', icone: Video, cor: '#a855f7' },
  { kind: 'audio', label: 'Áudio', icone: Mic, cor: '#ef4444' },
  { kind: 'intervalo', label: 'Intervalo', icone: Clock, cor: '#06b6d4' },
  { kind: 'contato', label: 'Contato', icone: User, cor: '#ec4899' },
  { kind: 'arquivo', label: 'Arquivo', icone: FileText, cor: '#6366f1' },
  { kind: 'sticker', label: 'Sticker', icone: Sticker, cor: '#f59e0b' },
]

/** Vozes do ElevenLabs que o app oferece sem precisar consultar a conta. */
const VOZES = [
  { id: 'rachel', label: 'Rachel (feminina calma)' },
  { id: 'antoni', label: 'Antoni (masculina firme)' },
  { id: 'bella', label: 'Bella (feminina jovem)' },
  { id: 'josh', label: 'Josh (masculina jovem)' },
]

const MODELOS_VOZ = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (mais natural)' },
  { id: 'eleven_v3', label: 'Eleven v3 (mais expressivo)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (mais rápido)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (o mais rápido)' },
]

interface Props {
  clientId: string
  itens: FlowContentItem[]
  etiquetas: { id: string; name: string }[]
  onChange: (itens: FlowContentItem[]) => void
}

export function FlowContentEditor({ clientId, itens, etiquetas, onChange }: Props) {
  const [arrastando, setArrastando] = useState<number | null>(null)

  const trocar = (id: string, patch: Partial<FlowContentItem>) =>
    onChange(itens.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const remover = (id: string) => onChange(itens.filter((i) => i.id !== id))

  function mover(de: number, para: number) {
    if (de === para) return
    const copia = [...itens]
    const [item] = copia.splice(de, 1)
    copia.splice(para, 0, item)
    onChange(copia)
  }

  return (
    <div className="space-y-3">
      {itens.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => setArrastando(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (arrastando !== null) mover(arrastando, i)
            setArrastando(null)
          }}
          className="rounded-xl border border-line bg-canvas p-3.5"
        >
          <div className="mb-3 flex items-center gap-2">
            <CabecalhoDoItem kind={item.kind} />
            <span className="flex-1" />
            <GripVertical size={14} className="cursor-grab text-ink-4" aria-hidden />
            <button type="button" onClick={() => remover(item.id)} aria-label="Remover conteúdo" className="text-ink-4 hover:text-danger-ink">
              <Trash2 size={14} />
            </button>
          </div>

          <CorpoDoItem clientId={clientId} item={item} etiquetas={etiquetas} onChange={(p) => trocar(item.id, p)} />

          {/* O tempo de "digitando" é de CADA mensagem, não do bloco. Duas
              frases seguidas pedem pausas diferentes: um "oi" sai na hora, um
              parágrafo longo precisa de um tempo que convença. Antes isto era
              um par de sliders no topo do bloco, longe da frase que ele
              atrasava. */}
          {item.kind !== 'intervalo' && (
            <DelayDeDigitacao
              segundos={item.delaySeconds ?? 0}
              gravando={item.kind === 'audio'}
              onChange={(v) => trocar(item.id, { delaySeconds: v })}
            />
          )}
        </div>
      ))}

      <div>
        <p className="mb-2 text-xs font-semibold text-ink-2">Adicionar Conteúdo</p>
        <div className="grid grid-cols-4 gap-2">
          {CATALOGO.map((c) => (
            <button
              key={c.kind}
              type="button"
              onClick={() => onChange([...itens, novoConteudo(c.kind)])}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line py-3 text-[11px] text-ink-2 transition-colors hover:border-[var(--accent)] hover:bg-surface-2"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: `${c.cor}22`, color: c.cor }}
              >
                <c.icone size={15} />
              </span>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** O nome no cabeçalho do cartão. "Texto" sozinho não diz que aquilo VAI SAIR
 *  como uma mensagem no WhatsApp — e é isso que a pessoa precisa entender. */
const TITULO_DO_CARTAO: Partial<Record<FlowContentKind, string>> = {
  texto: 'Mensagem de Texto',
  imagem: 'Mensagem de Imagem',
  video: 'Mensagem de Vídeo',
  audio: 'Mensagem de Áudio',
  arquivo: 'Mensagem de Arquivo',
  sticker: 'Sticker',
  contato: 'Contato',
  intervalo: 'Intervalo',
}

function CabecalhoDoItem({ kind }: { kind: FlowContentKind }) {
  const c = CATALOGO.find((x) => x.kind === kind) ?? CATALOGO[0]
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: c.cor }}>
      <c.icone size={14} />
      {TITULO_DO_CARTAO[kind] ?? c.label}
    </span>
  )
}

/**
 * Quanto tempo o WhatsApp mostra "digitando…" antes desta mensagem sair.
 *
 * Não é enfeite: é o que faz o fluxo parecer alguém escrevendo em vez de um
 * robô despejando três balões no mesmo segundo. O motor honra este valor —
 * mostra o aviso de verdade pelo tempo escolhido e só então envia.
 *
 * O ÁUDIO DIZ OUTRA COISA, e a tela precisa dizer a mesma. Ninguém digita uma
 * nota de voz: antes de um áudio o motor manda "gravando áudio", e um controle
 * escrito "digitando" ali prometeria uma coisa e entregaria outra. É o tipo de
 * desencontro que faz alguém desconfiar do produto inteiro por um detalhe.
 */
function DelayDeDigitacao({
  segundos,
  gravando = false,
  onChange,
}: {
  segundos: number
  gravando?: boolean
  onChange: (v: number) => void
}) {
  const aviso = gravando ? 'gravando áudio' : 'digitando'
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-ink-4">
        <span>Delay do “{aviso}”</span>
        <span className="font-semibold text-ink-2">
          {segundos} {segundos === 1 ? 'segundo' : 'segundos'}
        </span>
        <span>60 segundos</span>
      </div>
      <input
        type="range"
        min={0}
        max={60}
        value={Math.min(60, Math.max(0, segundos))}
        aria-label={`Delay do ${aviso}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full"
        style={{ ['--fill' as string]: `${(Math.min(60, segundos) / 60) * 100}%` }}
      />
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
        Tempo que o WhatsApp ficará “{aviso}” antes de enviar {gravando ? 'este áudio' : 'esta mensagem'}.
      </p>
    </div>
  )
}

/** As marcações que o WhatsApp entende. Não é HTML: são estes caracteres em
 *  volta do trecho, e é assim que o texto viaja até o celular do cliente. */
const FORMATOS = [
  { icone: Bold, titulo: 'Negrito', marca: '*' },
  { icone: Italic, titulo: 'Itálico', marca: '_' },
  { icone: Strikethrough, titulo: 'Riscado', marca: '~' },
  { icone: Code, titulo: 'Monoespaçado', marca: '```' },
] as const

/** As variáveis que o motor troca no envio. */
const VARIAVEIS = ['{full_name}', '{first_name}', '{phone_number}', '{instance_number}']

/**
 * A caixa da mensagem com a barra de formatação embaixo.
 *
 * Os botões agem sobre o TRECHO SELECIONADO e devolvem o cursor pra dentro da
 * caixa. Um botão que só empilha asterisco no fim obrigaria a pessoa a recortar
 * e colar pra formatar o meio da frase — que é onde ela quase sempre quer.
 */
export function CampoDeMensagem({
  rotulo,
  valor,
  placeholder,
  altura = 'min-h-[92px]',
  onChange,
}: {
  rotulo: string
  valor: string
  placeholder?: string
  altura?: string
  onChange: (v: string) => void
}) {
  const caixa = useRef<HTMLTextAreaElement>(null)
  const [emojiAberto, setEmojiAberto] = useState(false)
  const [variaveisAbertas, setVariaveisAbertas] = useState(false)

  /** Envolve a seleção. Sem seleção, deixa o cursor pronto entre as marcas. */
  function envolver(marca: string) {
    const el = caixa.current
    if (!el) return
    const { selectionStart: i, selectionEnd: f } = el
    const dentro = valor.slice(i, f)
    onChange(`${valor.slice(0, i)}${marca}${dentro}${marca}${valor.slice(f)}`)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = i + marca.length + dentro.length
      el.setSelectionRange(dentro ? cursor + marca.length : cursor, dentro ? cursor + marca.length : cursor)
    })
  }

  function inserir(trecho: string) {
    const el = caixa.current
    if (!el) return onChange(valor + trecho)
    const { selectionStart: i, selectionEnd: f } = el
    onChange(`${valor.slice(0, i)}${trecho}${valor.slice(f)}`)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(i + trecho.length, i + trecho.length)
    })
  }

  const botao = 'rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink'

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-ink-2">{rotulo}</span>
      <div className="overflow-hidden rounded-lg border border-line bg-surface focus-within:border-line-strong">
        <textarea
          ref={caixa}
          className={`${altura} w-full resize-y bg-transparent px-3 py-2 text-sm text-ink-2 placeholder:text-ink-4 focus:outline-none`}
          placeholder={placeholder ?? 'Digite a mensagem… Use {full_name}, {phone_number} e campos do contato.'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="relative flex items-center gap-0.5 border-t border-line-soft px-1.5 py-1">
          {FORMATOS.map((f) => (
            <button key={f.titulo} type="button" title={f.titulo} aria-label={f.titulo} className={botao} onClick={() => envolver(f.marca)}>
              <f.icone size={14} />
            </button>
          ))}
          <button
            type="button"
            title="Emoji"
            aria-label="Emoji"
            className={botao}
            onClick={() => {
              setEmojiAberto((v) => !v)
              setVariaveisAbertas(false)
            }}
          >
            <Smile size={14} />
          </button>
          <button
            type="button"
            title="Inserir variável"
            aria-label="Inserir variável"
            className={botao}
            onClick={() => {
              setVariaveisAbertas((v) => !v)
              setEmojiAberto(false)
            }}
          >
            <Wand2 size={14} />
          </button>

          {emojiAberto && (
            <PainelFlutuante onFechar={() => setEmojiAberto(false)}>
              <div className="grid grid-cols-10 gap-0.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded p-1 text-base leading-none hover:bg-surface-2"
                    onClick={() => {
                      inserir(e)
                      setEmojiAberto(false)
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PainelFlutuante>
          )}

          {variaveisAbertas && (
            <PainelFlutuante onFechar={() => setVariaveisAbertas(false)}>
              <p className="mb-1.5 text-[11px] text-ink-4">Trocadas pelo valor do contato no momento do envio.</p>
              <div className="flex flex-col gap-0.5">
                {VARIAVEIS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="rounded-md px-2 py-1 text-left font-mono text-[11px] text-[var(--accent-ink)] hover:bg-surface-2"
                    onClick={() => {
                      inserir(v)
                      setVariaveisAbertas(false)
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </PainelFlutuante>
          )}
        </div>
      </div>
    </div>
  )
}

/** Painel que abre acima da barra. Fecha ao clicar fora — dentro de um modal,
 *  um painel que só fecha no botão vira um obstáculo entre a pessoa e o Salvar. */
function PainelFlutuante({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  const alvo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (!alvo.current?.contains(e.target as Node)) onFechar()
    }
    // No próximo quadro: registrar agora pegaria o mesmo clique que abriu.
    const id = requestAnimationFrame(() => document.addEventListener('mousedown', fora))
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('mousedown', fora)
    }
  }, [onFechar])

  return (
    <div
      ref={alvo}
      className="absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[19rem] rounded-lg border border-line bg-surface-solid p-2 shadow-xl"
    >
      {children}
    </div>
  )
}

const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😉','🙂','😎',
  '🤔','😐','😕','😢','😭','😡','🥰','🤗','🤝','🙏',
  '👍','👎','👏','💪','🔥','✅','❌','⚠️','⭐','💡',
  '❤️','💜','🎉','🎁','📅','📎','💰','💳','🚀','📌',
]

function CorpoDoItem({
  clientId,
  item,
  etiquetas,
  onChange,
}: {
  clientId: string
  item: FlowContentItem
  etiquetas: { id: string; name: string }[]
  onChange: (patch: Partial<FlowContentItem>) => void
}) {
  if (item.kind === 'texto') {
    return (
      <>
        <CampoDeMensagem
          rotulo="Conteúdo da Mensagem *"
          valor={item.text ?? ''}
          onChange={(text) => onChange({ text })}
        />
        <ApagarAoEtiquetar item={item} etiquetas={etiquetas} onChange={onChange} />
      </>
    )
  }

  if (item.kind === 'intervalo') {
    return (
      <CrmField label="Espera antes do próximo conteúdo" hint="Em segundos. Dá ritmo de conversa em vez de despejar tudo de uma vez.">
        <input
          type="number"
          min={0}
          max={120}
          className={inputClass}
          value={item.delaySeconds ?? 3}
          onChange={(e) => onChange({ delaySeconds: Number(e.target.value) })}
        />
      </CrmField>
    )
  }

  if (item.kind === 'contato') {
    return (
      <>
        <p className="mb-2 text-[11px] text-ink-4">
          Aceita variáveis como {'{instance_number}'}, {'{full_name}'} e {'{phone_number}'}, as mesmas do texto. São
          resolvidas no envio.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CrmField label="Nome do Contato *">
            <input className={inputClass} placeholder="Ex: João Silva" value={item.contactName ?? ''} onChange={(e) => onChange({ contactName: e.target.value })} />
          </CrmField>
          <CrmField label="Telefone *">
            <input className={inputClass} placeholder="Ex: 55 11 9999-9999" value={item.contactPhone ?? ''} onChange={(e) => onChange({ contactPhone: e.target.value })} />
          </CrmField>
        </div>
        <ApagarAoEtiquetar item={item} etiquetas={etiquetas} onChange={onChange} />
      </>
    )
  }

  // imagem, vídeo, áudio, arquivo, sticker
  return (
    <>
      {(item.kind === 'arquivo' || item.kind === 'sticker') && (
        <CrmField label={item.kind === 'arquivo' ? 'Nome do Arquivo *' : 'Nome do Sticker *'}>
          <input
            className={inputClass}
            placeholder={item.kind === 'arquivo' ? 'Ex: documento.pdf' : 'Ex: emoji_feliz'}
            value={item.fileName ?? ''}
            onChange={(e) => onChange({ fileName: e.target.value })}
          />
        </CrmField>
      )}

      <SeletorDeOrigem item={item} onChange={onChange} />

      {item.source === 'ia' && item.kind === 'audio' ? (
        <AudioComIa item={item} onChange={onChange} />
      ) : item.source === 'url' ? (
        <CrmField label="URL" hint="Cole uma URL pública ou use variáveis do sistema. É resolvida na execução do fluxo.">
          <input
            className={inputClass}
            placeholder="https://exemplo.com/arquivo ou {documento_url}"
            value={item.mediaUrl ?? ''}
            onChange={(e) => onChange({ mediaUrl: e.target.value })}
          />
        </CrmField>
      ) : (
        <AreaDeUpload clientId={clientId} item={item} onChange={onChange} />
      )}

      {(item.kind === 'imagem' || item.kind === 'video') && (
        <CrmField label="Legenda (opcional)">
          <textarea
            className={`${inputClass} min-h-[56px] resize-y`}
            value={item.text ?? ''}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </CrmField>
      )}

      {item.kind === 'audio' && <OpcoesDeAudio item={item} onChange={onChange} />}

      {item.kind !== 'sticker' && (
        <label className="mt-2 flex items-start gap-2 rounded-lg border border-warn-line bg-warn-bg p-2.5">
          <input
            type="checkbox"
            checked={!!item.viewOnce}
            onChange={(e) => onChange({ viewOnce: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-[11px]">
            <span className="font-medium text-ink-2">Enviar em visualização única</span>
            <span className="mt-0.5 block text-warn-ink">
              A visualização única é um recurso do WhatsApp Web e Mobile; ainda não está disponível para API oficial.
            </span>
          </span>
        </label>
      )}

      <ApagarAoEtiquetar item={item} etiquetas={etiquetas} onChange={onChange} />
    </>
  )
}

function SeletorDeOrigem({ item, onChange }: { item: FlowContentItem; onChange: (p: Partial<FlowContentItem>) => void }) {
  const opcoes: { valor: FlowMediaSource; label: string; icone: typeof Upload }[] = [
    { valor: 'arquivo', label: 'Arquivo', icone: Upload },
    { valor: 'url', label: 'URL', icone: Link2 },
    ...(item.kind === 'audio' ? [{ valor: 'ia' as FlowMediaSource, label: 'IA', icone: Sparkles }] : []),
  ]
  return (
    <div className={`mb-2 grid gap-0 overflow-hidden rounded-lg border border-line`} style={{ gridTemplateColumns: `repeat(${opcoes.length}, 1fr)` }}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange({ source: o.valor })}
          className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            item.source === o.valor ? 'text-white' : 'text-ink-3 hover:bg-surface-2'
          }`}
          style={item.source === o.valor ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <o.icone size={13} /> {o.label}
        </button>
      ))}
    </div>
  )
}

function AreaDeUpload({
  clientId,
  item,
  onChange,
}: {
  clientId: string
  item: FlowContentItem
  onChange: (p: Partial<FlowContentItem>) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const limite = LIMITES[item.kind] ?? { mb: 16, tipos: '', aceita: '' }

  async function enviar(file: File) {
    setErro(null)
    setEnviando(true)
    try {
      const url = await enviarMidiaDoFluxo(clientId, item.kind, file)
      onChange({ mediaUrl: url, fileName: item.fileName || file.name })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const Icone = CATALOGO.find((c) => c.kind === item.kind)?.icone ?? FileText

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files?.[0]
        if (f) enviar(f)
      }}
      className="rounded-xl border border-dashed p-4 text-center"
      style={{ borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)' }}
    >
      <span
        className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: 'color-mix(in oklab, var(--accent) 20%, transparent)', color: 'var(--accent-ink)' }}
      >
        {enviando ? <Loader2 size={18} className="animate-spin" /> : <Icone size={18} />}
      </span>

      {item.mediaUrl ? (
        <p className="mb-2 break-all text-[11px] text-ok-ink">{item.fileName || item.mediaUrl.split('/').pop()}</p>
      ) : (
        <>
          <p className="text-xs text-ink-3">Tamanho máximo permitido: {limite.mb}MB</p>
          <p className="mt-0.5 text-[11px] text-ink-4">{limite.tipos}</p>
        </>
      )}

      {item.kind === 'audio' && (
        <p className="mt-1.5 text-[11px] text-warn-ink">
          Para enviar como gravado na API oficial, o áudio precisa ser .ogg com codec Opus.
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept={limite.aceita}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) enviar(f)
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={enviando}
        className="mt-3 rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {enviando ? 'Enviando…' : item.mediaUrl ? 'Trocar arquivo' : `Enviar ${item.kind}`}
      </button>
      {erro && <p className="mt-2 text-[11px] text-danger-ink">{erro}</p>}
    </div>
  )
}

function AudioComIa({ item, onChange }: { item: FlowContentItem; onChange: (p: Partial<FlowContentItem>) => void }) {
  return (
    <div
      className="rounded-xl border border-dashed p-4"
      style={{ borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)' }}
    >
      <p className="mb-3 text-center text-xs font-semibold text-ink">Gerar Áudio com IA</p>

      <CrmField label="Voz">
        <Selecao className={inputClass} value={item.voiceId ?? ''} onChange={(e) => onChange({ voiceId: e.target.value })} placeholder="Selecione a voz…">
          {VOZES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Selecao>
      </CrmField>

      <CrmField
        label="Modelo de voz"
        hint="Eleven v3 é o mais expressivo. Multilingual v2 é natural em português. Turbo e Flash são mais rápidos."
      >
        <Selecao className={inputClass} value={item.voiceModel ?? 'eleven_multilingual_v2'} onChange={(e) => onChange({ voiceModel: e.target.value })}>
          {MODELOS_VOZ.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Selecao>
      </CrmField>

      <CrmField label="Texto para converter" hint="Ex.: Olá {nome}, seu pedido {pedido} foi aprovado e será entregue em {cidade}.">
        <textarea
          className={`${inputClass} min-h-[84px] resize-y`}
          placeholder="Digite o texto que será transformado em áudio…"
          value={item.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </CrmField>

      <p className="mt-1 text-[11px] text-ink-4">
        A chave do ElevenLabs fica em Configurações → Variáveis Globais. Sem ela, o bloco falha no envio dizendo o
        motivo — não gera áudio mudo.
      </p>
    </div>
  )
}

function OpcoesDeAudio({ item, onChange }: { item: FlowContentItem; onChange: (p: Partial<FlowContentItem>) => void }) {
  const segundos = item.recordingDelaySeconds ?? 6
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-baseline justify-between text-[11px] text-ink-4">
        <span>Delay do “gravando”</span>
        <span className="font-semibold text-ink-2">{segundos} segundos</span>
        <span>120 segundos</span>
      </div>
      <input
        type="range"
        min={0}
        max={120}
        value={segundos}
        onChange={(e) => onChange({ recordingDelaySeconds: Number(e.target.value) })}
        aria-label="Delay do gravando"
        className="slider w-full"
        style={{ ['--fill' as string]: `${(segundos / 120) * 100}%` }}
      />
      <p className="text-[11px] text-ink-4">Tempo que o WhatsApp ficará “gravando” antes de enviar o áudio.</p>

      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={item.sendAsRecorded !== false} onChange={(e) => onChange({ sendAsRecorded: e.target.checked })} />
        Enviar como gravado
      </label>
    </div>
  )
}

function ApagarAoEtiquetar({
  item,
  etiquetas,
  onChange,
}: {
  item: FlowContentItem
  etiquetas: { id: string; name: string }[]
  onChange: (p: Partial<FlowContentItem>) => void
}) {
  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <CrmToggle
        checked={!!item.deleteOnTag}
        onChange={(v) => onChange({ deleteOnTag: v })}
        label="Apagar mensagem ao aplicar etiqueta"
        hint="Quando a etiqueta selecionada for adicionada ao chat, esta mensagem será apagada no WhatsApp. Para tempos muito longos, a exclusão pode não funcionar."
      />
      {item.deleteOnTag && (
        <div className="mt-2">
          <Selecao
            className={inputClass}
            value={item.deleteOnTagName ?? ''}
            onChange={(e) => onChange({ deleteOnTagName: e.target.value })}
            placeholder={etiquetas.length ? 'Escolha a etiqueta…' : 'Crie etiquetas em Configurações'}
          >
            {etiquetas.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </Selecao>
        </div>
      )}
    </div>
  )
}

/**
 * Escolher uma imagem: enviar arquivo ou colar URL.
 *
 * Vive aqui e não no editor de blocos porque é a MESMA peça que a mensagem de
 * imagem usa — o cartão do carrossel só tinha um campo de URL, e colar link de
 * imagem é coisa que quase ninguém tem à mão. Quem monta um carrossel tem o
 * arquivo, não o endereço dele.
 */
export function AreaDeImagem({
  clientId,
  url,
  origem,
  maxMb = 5,
  onChange,
}: {
  clientId: string
  url: string
  origem: FlowMediaSource
  maxMb?: number
  onChange: (p: { imageUrl?: string; source?: FlowMediaSource }) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(file: File) {
    setErro(null)
    if (file.size > maxMb * 1024 * 1024) {
      setErro(`Arquivo de ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é ${maxMb} MB.`)
      return
    }
    setEnviando(true)
    try {
      onChange({ imageUrl: await enviarMidiaDoFluxo(clientId, 'imagem', file) })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <div className="mb-2 grid grid-cols-2 overflow-hidden rounded-lg border border-line">
        {(
          [
            { valor: 'arquivo' as FlowMediaSource, label: 'Arquivo', icone: Upload },
            { valor: 'url' as FlowMediaSource, label: 'URL', icone: Link2 },
          ]
        ).map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange({ source: o.valor })}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              origem === o.valor ? 'text-white' : 'text-ink-3 hover:bg-surface-2'
            }`}
            style={origem === o.valor ? { backgroundColor: 'var(--accent)' } : undefined}
          >
            <o.icone size={13} /> {o.label}
          </button>
        ))}
      </div>

      {origem === 'url' ? (
        <input
          className={inputClass}
          placeholder="https://…  (variáveis como {foto} são permitidas)"
          value={url}
          onChange={(e) => onChange({ imageUrl: e.target.value })}
        />
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) enviar(f)
          }}
          className="rounded-xl border border-dashed p-4 text-center"
          style={{ borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)' }}
        >
          {url ? (
            // A imagem à vista, não o endereço dela. Numa tela com vários
            // cartões, ler URL pra saber qual é qual não é conferir nada.
            <img src={url} alt="" className="mx-auto mb-2 max-h-28 rounded-lg object-contain" />
          ) : (
            <span
              className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'color-mix(in oklab, var(--accent) 20%, transparent)', color: 'var(--accent-ink)' }}
            >
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
            </span>
          )}

          {!url && (
            <>
              <p className="text-xs text-ink-3">Tamanho máximo permitido: {maxMb}MB</p>
              <p className="mt-0.5 text-[11px] text-ink-4">JPG de preferência, também PNG e WebP</p>
            </>
          )}

          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) enviar(f)
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={enviando}
            className="mt-3 rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {enviando ? 'Enviando…' : url ? 'Trocar imagem' : 'Enviar imagem'}
          </button>
          {url && (
            <button type="button" onClick={() => onChange({ imageUrl: '' })} className="mt-1.5 block w-full text-[11px] text-ink-4 hover:text-danger-ink">
              Remover
            </button>
          )}
        </div>
      )}
      {erro && <p className="mt-2 text-[11px] text-danger-ink">{erro}</p>}
    </div>
  )
}

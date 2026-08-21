import { useEffect, useRef, useState } from 'react'
import { Play, Pause, FileText, Download, X, Check, CheckCheck, AlertCircle, Clock, ExternalLink, Phone, Copy, CornerUpLeft } from 'lucide-react'
import type { BotaoDaMensagem, CrmMessage } from '../../../lib/db/crmChat'
import { SemTelefone } from '../../ui/Sensivel'

// A conversa em si. Saiu de ChatsSection porque leitura de conversa tem regras
// próprias — agrupamento, separador de dia, mídia — e misturar isso com a
// lista e o painel deixava os três difíceis de mexer.
//
// A régua aqui é: dá pra LER. Bolha estreita o bastante pro olho voltar sem se
// perder, hora legível sem competir com o texto, e mídia que se abre onde
// está, sem tirar a pessoa da conversa.

// ─── Datas ──────────────────────────────────────────────────────────────────

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  )
}

/** "Hoje", "Ontem" ou a data por extenso — é como se lê conversa. */
function rotuloDoDia(iso: string): string {
  const data = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)

  if (mesmoDia(data, hoje)) return 'Hoje'
  if (mesmoDia(data, ontem)) return 'Ontem'

  const mesmoAno = data.getFullYear() === hoje.getFullYear()
  return data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    ...(mesmoAno ? {} : { year: 'numeric' }),
  })
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Lista ──────────────────────────────────────────────────────────────────

export function Conversa({
  mensagens,
  avatarUrl,
  nomeDoContato,
  fimRef,
}: {
  mensagens: CrmMessage[]
  avatarUrl: string | null
  nomeDoContato: string
  fimRef: React.RefObject<HTMLDivElement | null>
}) {
  const [ampliada, setAmpliada] = useState<string | null>(null)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {/* Sem coluna centralizada: a conversa ocupa a largura toda, recebida
          encostada na esquerda e enviada na direita. Limitar e centralizar
          jogava as duas pro meio da tela e tirava a leitura por lado. */}
      <div className="flex flex-col gap-0.5">
        {mensagens.map((m, i) => {
          const anterior = i > 0 ? mensagens[i - 1] : null
          const proxima = i < mensagens.length - 1 ? mensagens[i + 1] : null

          const abreDia = !anterior || !mesmoDia(new Date(anterior.sentAt), new Date(m.sentAt))
          // Mensagens seguidas do mesmo lado, no mesmo minuto, formam um bloco:
          // só a última mostra hora e status, e o espaço entre elas encolhe. É
          // o que tira a poluição de dez bolhas iguais empilhadas.
          const mesmoBloco =
            !!anterior &&
            anterior.direction === m.direction &&
            !abreDia &&
            new Date(m.sentAt).getTime() - new Date(anterior.sentAt).getTime() < 120_000
          const fechaBloco =
            !proxima ||
            proxima.direction !== m.direction ||
            !mesmoDia(new Date(proxima.sentAt), new Date(m.sentAt)) ||
            new Date(proxima.sentAt).getTime() - new Date(m.sentAt).getTime() >= 120_000

          return (
            <div key={m.id}>
              {abreDia && <SeparadorDeDia rotulo={rotuloDoDia(m.sentAt)} />}
              <Balao
                msg={m}
                avatarUrl={avatarUrl}
                nomeDoContato={nomeDoContato}
                agrupada={mesmoBloco}
                mostrarRodape={fechaBloco}
                onAmpliar={setAmpliada}
              />
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      {ampliada && <Lightbox url={ampliada} onFechar={() => setAmpliada(null)} />}
    </div>
  )
}

function SeparadorDeDia({ rotulo }: { rotulo: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-ink-3">
        {rotulo}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

// ─── Bolha ──────────────────────────────────────────────────────────────────

const STATUS = {
  enviando: { Icone: Clock, rotulo: 'enviando' },
  enviada: { Icone: Check, rotulo: 'enviada' },
  entregue: { Icone: CheckCheck, rotulo: 'entregue' },
  lida: { Icone: CheckCheck, rotulo: 'lida' },
  falhou: { Icone: AlertCircle, rotulo: 'não entregue' },
} as const

function Balao({
  msg,
  avatarUrl,
  nomeDoContato,
  agrupada,
  mostrarRodape,
  onAmpliar,
}: {
  msg: CrmMessage
  avatarUrl: string | null
  nomeDoContato: string
  agrupada: boolean
  mostrarRodape: boolean
  onAmpliar: (url: string) => void
}) {
  const meu = msg.direction === 'saida'
  const { Icone, rotulo } = STATUS[msg.status]
  const falhou = msg.status === 'falhou'
  // Mídia sem legenda não precisa de moldura: a bolha em volta de uma foto só
  // engorda o balão sem dizer nada. Com botão, porém, a moldura volta a ser
  // necessária — é ela que dá a borda onde os botões se encaixam.
  const soMidia = msg.mediaKind != null && msg.body.trim().length === 0 && msg.botoes.length === 0

  return (
    <div className={`flex items-end gap-2 ${meu ? 'justify-end' : 'justify-start'} ${agrupada ? 'mt-0.5' : 'mt-2.5'}`}>
      {/* O avatar só na última do bloco alinha a conversa sem repetir a foto
          em toda linha. O espaçador mantém as bolhas na mesma coluna. */}
      {!meu &&
        (mostrarRodape ? (
          <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-[10px] font-semibold text-ink-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              nomeDoContato.slice(0, 2).toUpperCase()
            )}
          </span>
        ) : (
          <span className="w-7 shrink-0" />
        ))}

      <div
        className={`min-w-0 max-w-[min(78%,34rem)] ${
          soMidia
            ? ''
            : `rounded-2xl px-3.5 py-2 ${
                meu
                  ? 'rounded-br-md text-white'
                  : `rounded-bl-md border bg-surface-2 text-ink ${falhou ? 'border-danger' : 'border-line'}`
              }`
        }`}
        style={soMidia || !meu ? undefined : { backgroundColor: 'var(--accent)' }}
      >
        {!meu && msg.authorName && !agrupada && (
          <p className="mb-1 text-[11px] font-semibold opacity-70">{msg.authorName}</p>
        )}

        {/* A mídia é foto, vídeo e documento que o cliente MANDOU: comprovante
            com dado bancário, documento com CPF, foto pessoal. */}
        <Midia msg={msg} onAmpliar={onAmpliar} />

        {/* No documento o texto JÁ é o nome do arquivo, e o cartão acima mostra
            ele. Repetir embaixo dava a mesma linha duas vezes na bolha. */}
        {msg.body.trim().length > 0 && msg.mediaKind !== 'documento' && (
          // `break-words` sozinho não segura URL gigante sem espaço, que é o
          // que estoura a bolha e empurra a conversa pro lado.
          //
          // O texto da conversa é o dado mais sensível da tela inteira: é o que
          // uma pessoa escreveu achando que só o atendimento ia ler.
          <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed [overflow-wrap:anywhere]">
            <SemTelefone>{msg.body}</SemTelefone>
          </div>
        )}

        {mostrarRodape && (
          <p
            className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${
              soMidia ? 'text-ink-3' : meu ? 'text-white/75' : 'text-ink-4'
            }`}
          >
            {hora(msg.sentAt)}
            {meu && <Icone size={12} aria-label={rotulo} className={msg.status === 'lida' ? 'text-info' : ''} />}
          </p>
        )}

        <BotoesDaMensagem botoes={msg.botoes} meu={meu} />
      </div>
    </div>
  )
}

// ─── Botões ─────────────────────────────────────────────────────────────────

/**
 * Os botões, do jeito que o celular do cliente mostra: linhas separadas por um
 * fio, coladas embaixo da bolha.
 *
 * Aqui eles NÃO são clicáveis, e isso é de propósito. Quem toca é o cliente; o
 * atendente precisa é saber o que foi oferecido. Um botão clicável nesta tela
 * faria o atendente achar que está respondendo pelo cliente.
 */
function BotoesDaMensagem({ botoes, meu }: { botoes: BotaoDaMensagem[]; meu: boolean }) {
  if (botoes.length === 0) return null

  return (
    <div className={`-mx-3.5 -mb-2 mt-1.5 ${meu ? 'text-white/90' : 'text-[var(--accent-ink)]'}`}>
      {botoes.map((b, i) => (
        <div
          key={`${b.text}-${i}`}
          className={`flex items-center justify-center gap-1.5 border-t px-3.5 py-2 text-[13px] font-medium ${
            meu ? 'border-white/25' : 'border-line'
          }`}
          // O título mostra pra onde o botão leva sem poluir a linha: o link
          // inteiro numa linha estreita quebraria o alinhamento de todas.
          title={b.url ?? b.phoneNumber ?? b.copyCode ?? undefined}
        >
          <IconeDoBotao tipo={b.type} />
          <span className="truncate">{b.text}</span>
        </div>
      ))}
    </div>
  )
}

function IconeDoBotao({ tipo }: { tipo: BotaoDaMensagem['type'] }) {
  const props = { size: 13, className: 'shrink-0 opacity-80', 'aria-hidden': true } as const
  if (tipo === 'url') return <ExternalLink {...props} />
  if (tipo === 'call') return <Phone {...props} />
  if (tipo === 'copy') return <Copy {...props} />
  return <CornerUpLeft {...props} />
}

// ─── Mídia ──────────────────────────────────────────────────────────────────

function Midia({ msg, onAmpliar }: { msg: CrmMessage; onAmpliar: (url: string) => void }) {
  if (!msg.mediaKind) return null

  if (!msg.mediaUrl) {
    return (
      <p className="mb-1 rounded-lg bg-black/10 px-2.5 py-1.5 text-[11px] italic opacity-80">
        mídia indisponível — o WhatsApp apaga o arquivo original depois de alguns dias
      </p>
    )
  }

  // A figurinha é solta: sem moldura, sem fundo e pequena, como no aparelho.
  // Ela vem com transparência, e qualquer fundo atrás dela apareceria pelos
  // vazios do desenho — por isso não tem `rounded` nem cor nenhuma aqui.
  if (msg.mediaKind === 'figurinha') {
    return (
      <button
        type="button"
        onClick={() => onAmpliar(msg.mediaUrl!)}
        className="block"
        aria-label="Ampliar figurinha"
      >
        <img
          src={msg.mediaUrl}
          alt={msg.body || 'Figurinha'}
          loading="lazy"
          className="h-32 w-32 cursor-zoom-in object-contain transition-transform hover:scale-105"
        />
      </button>
    )
  }

  if (msg.mediaKind === 'imagem') {
    return (
      <button
        type="button"
        onClick={() => onAmpliar(msg.mediaUrl!)}
        className="mb-1 block overflow-hidden rounded-xl"
        aria-label="Ampliar imagem"
      >
        {/* `object-contain` e não `cover`: recortar a foto pra encher a bolha
            cortava justamente o comprovante e o documento que o cliente
            fotografou — o dado costuma estar na borda. */}
        <img
          src={msg.mediaUrl}
          alt={msg.body || 'Imagem recebida'}
          loading="lazy"
          className="max-h-80 w-auto max-w-full cursor-zoom-in rounded-xl object-contain transition-transform hover:scale-[1.01]"
        />
      </button>
    )
  }

  if (msg.mediaKind === 'video') {
    return <video src={msg.mediaUrl} controls preload="metadata" className="mb-1 max-h-80 w-full rounded-xl" />
  }

  if (msg.mediaKind === 'audio') return <PlayerDeAudio url={msg.mediaUrl} meu={msg.direction === 'saida'} />

  return <CartaoDeDocumento url={msg.mediaUrl} nome={msg.body || 'Documento'} />
}

/**
 * O player do navegador é cinza, largo e diferente em cada sistema — foi o que
 * ficou "muito feio". Este tem o tamanho da bolha, usa a cor do cliente e
 * mostra o tempo correndo, que é o que se quer saber num áudio.
 */
function PlayerDeAudio({ url, meu }: { url: string; meu: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [tocando, setTocando] = useState(false)
  const [posicao, setPosicao] = useState(0)
  const [duracao, setDuracao] = useState(0)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const aoTempo = () => setPosicao(a.currentTime)
    // Áudio gravado por navegador costuma vir sem duração no cabeçalho e
    // reporta Infinity até tocar. Só aceitamos número finito.
    const aoCarregar = () => setDuracao(Number.isFinite(a.duration) ? a.duration : 0)
    const aoTerminar = () => {
      setTocando(false)
      setPosicao(0)
    }
    a.addEventListener('timeupdate', aoTempo)
    a.addEventListener('loadedmetadata', aoCarregar)
    a.addEventListener('durationchange', aoCarregar)
    a.addEventListener('ended', aoTerminar)
    return () => {
      a.removeEventListener('timeupdate', aoTempo)
      a.removeEventListener('loadedmetadata', aoCarregar)
      a.removeEventListener('durationchange', aoCarregar)
      a.removeEventListener('ended', aoTerminar)
    }
  }, [])

  function alternar() {
    const a = audioRef.current
    if (!a) return
    if (tocando) {
      a.pause()
      setTocando(false)
    } else {
      void a.play()
      setTocando(true)
    }
  }

  const relogio = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const progresso = duracao > 0 ? (posicao / duracao) * 100 : 0

  return (
    <div className="my-0.5 flex w-56 max-w-full items-center gap-2.5">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={alternar}
        aria-label={tocando ? 'Pausar áudio' : 'Tocar áudio'}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          meu ? 'bg-white/25 text-white hover:bg-white/35' : 'bg-surface text-ink-2 hover:bg-canvas'
        }`}
      >
        {tocando ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className={`h-1 w-full overflow-hidden rounded-full ${meu ? 'bg-white/25' : 'bg-line'}`}>
          <div
            className={`h-full rounded-full transition-[width] ${meu ? 'bg-white' : 'bg-ink-3'}`}
            style={{ width: `${progresso}%` }}
          />
        </div>
        <p className={`mt-1 text-[10.5px] tabular-nums ${meu ? 'text-white/75' : 'text-ink-4'}`}>
          {duracao > 0 ? `${relogio(posicao)} / ${relogio(duracao)}` : relogio(posicao)}
        </p>
      </div>
    </div>
  )
}

function CartaoDeDocumento({ url, nome }: { url: string; nome: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download
      className="my-0.5 flex items-center gap-2.5 rounded-xl bg-black/10 px-3 py-2 transition-colors hover:bg-black/20"
    >
      <FileText size={18} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{nome}</span>
        <span className="block text-[10.5px] opacity-70">Clique para abrir</span>
      </span>
      <Download size={14} className="shrink-0 opacity-70" />
    </a>
  )
}

/** Imagem em tela cheia. Fecha no clique fora e no Esc. */
function Lightbox({ url, onFechar }: { url: string; onFechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    // Trava a rolagem de trás: sem isto a conversa corre atrás da imagem
    // aberta, e ao fechar a pessoa está em outro ponto da conversa.
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAntes
    }
  }, [onFechar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onFechar}
      role="presentation"
    >
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar imagem"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X size={18} />
      </button>
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        <Download size={13} /> Baixar
      </a>
    </div>
  )
}

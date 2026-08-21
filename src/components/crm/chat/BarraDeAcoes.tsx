import { useEffect, useRef, useState } from 'react'
import { Paperclip, FileText, DollarSign, Mic, Smile, Tag, Zap, Square, Trash2, Upload } from 'lucide-react'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'
import {
  sendButtonsMessage,
  sendMediaMessage,
  tipoDoArquivo,
  LIMITES_DE_ANEXO,
  updateChat,
  type TipoDeAnexo,
} from '../../../lib/db/crmChat'
import type { QuickReply, ConteudoDaResposta } from '../../../lib/db/crmSettings'

// A barra de ações da conversa. Cada botão faz alguma coisa de verdade — o
// que estava aqui antes era um enfeite desabilitado.
//
// O arquivo NÃO passa pelo backend: sobe direto pro bucket privado, e a ponte
// lê de lá. Mandar megabytes em base64 por uma rota de coordenação seria
// carregar o servidor à toa.

interface Props {
  clientId: string
  chatId: string
  /** O que está escrito na caixa de texto — vira legenda do anexo. */
  texto: string
  onLimparTexto: () => void
  onInserirNoTexto: (trecho: string) => void
  tagsDoChat: string[]
  tagsDisponiveis: { id: string; name: string }[]
  respostasRapidas: QuickReply[]
  onEscolherResposta: (corpo: string) => void
  onErro: (mensagem: string) => void
  onEnviado: () => void
  desabilitado: boolean
  motivoDesabilitado?: string
}

export function BarraDeAcoes({
  clientId,
  chatId,
  texto,
  onLimparTexto,
  onInserirNoTexto,
  tagsDoChat,
  tagsDisponiveis,
  respostasRapidas,
  onEscolherResposta,
  onErro,
  onEnviado,
  desabilitado,
  motivoDesabilitado,
}: Props) {
  const [arquivoOpen, setArquivoOpen] = useState<TipoDeAnexo | 'escolher' | null>(null)
  const [pixOpen, setPixOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [respostasOpen, setRespostasOpen] = useState(false)
  const [gravando, setGravando] = useState(false)

  /**
   * Usa uma resposta rápida INTEIRA.
   *
   * O texto vai pra caixa, pra pessoa poder ajustar antes de mandar. Os anexos
   * saem na hora: eles já estão prontos e não há o que editar num PDF. Mandar
   * só o texto e deixar o arquivo pra trás seria o pior dos dois — a frase
   * "segue a tabela em anexo" chegaria sem anexo nenhum.
   */
  async function usarRespostaRapida(r: QuickReply) {
    const textos = r.items
      .filter((i) => i.kind === 'texto' && i.text?.trim())
      .map((i) => i.text!.trim())
    if (textos.length > 0) onEscolherResposta(textos.join('\n\n'))

    const anexos = r.items.filter((i): i is ConteudoDaResposta & { url: string } => i.kind !== 'texto' && !!i.url)
    for (const item of anexos) {
      try {
        // O arquivo mora no bucket de fluxos, público. Buscar e reenviar é o
        // que faz a mensagem sair com o arquivo de verdade em vez de um link.
        const resposta = await fetch(item.url)
        if (!resposta.ok) throw new Error(`o arquivo não abriu (${resposta.status})`)
        const blob = await resposta.blob()
        await sendMediaMessage(clientId, {
          chatId,
          file: blob,
          // Sticker vai como imagem: é o que a ponte sabe enviar, e uma
          // figurinha que não sai é pior que uma figurinha que sai como foto.
          kind: item.kind === 'sticker' ? 'imagem' : (item.kind as TipoDeAnexo),
          caption: item.text?.trim() || undefined,
          filename: item.fileName,
        })
      } catch (e) {
        onErro(`Não deu pra enviar "${item.fileName ?? item.kind}": ${(e as Error).message}`)
      }
    }
    if (anexos.length > 0) onEnviado()
  }

  // A ordem é a da referência: anexo, documento, dinheiro, voz, emoji,
  // etiqueta, resposta rápida.
  const antesDoMicrofone = [
    { icone: Paperclip, rotulo: 'Enviar arquivo', acao: () => setArquivoOpen('escolher') },
    { icone: FileText, rotulo: 'Enviar documento', acao: () => setArquivoOpen('documento') },
    { icone: DollarSign, rotulo: 'Enviar chave PIX', acao: () => setPixOpen(true) },
  ]

  const botao = (Ico: typeof Paperclip, rotulo: string, acao: () => void, ativo = false) => (
    <button
      key={rotulo}
      type="button"
      aria-label={rotulo}
      title={desabilitado ? motivoDesabilitado : rotulo}
      onClick={acao}
      disabled={desabilitado}
      className={`rounded-lg p-1.5 transition-colors hover:bg-surface-2 hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        ativo ? 'bg-surface-2 text-ink-2' : ''
      }`}
    >
      <Ico size={16} />
    </button>
  )

  return (
    <>
      {/* Alinhada à direita, acima da caixa de texto: é onde o olho já procura
          os anexos, e deixa a linha de escrita começando limpa na esquerda. */}
      <div className="relative mb-1.5 flex items-center justify-end gap-0.5 text-ink-4">
        {antesDoMicrofone.map(({ icone, rotulo, acao }) => botao(icone, rotulo, acao))}

        <GravadorDeAudio
          clientId={clientId}
          chatId={chatId}
          gravando={gravando}
          setGravando={setGravando}
          desabilitado={desabilitado}
          motivoDesabilitado={motivoDesabilitado}
          onErro={onErro}
          onEnviado={onEnviado}
        />

        {botao(Smile, 'Emoji', () => setEmojiOpen((v) => !v), emojiOpen)}
        {botao(Tag, 'Etiquetas', () => setTagOpen(true))}
        {botao(Zap, 'Resposta rápida', () => setRespostasOpen((v) => !v), respostasOpen)}

        {emojiOpen && (
          <PainelDeEmoji
            onEscolher={(e) => {
              onInserirNoTexto(e)
              setEmojiOpen(false)
            }}
            onFechar={() => setEmojiOpen(false)}
          />
        )}

        {respostasOpen && (
          <PainelDeRespostas
            respostas={respostasRapidas}
            onEscolher={(r) => {
              setRespostasOpen(false)
              void usarRespostaRapida(r)
            }}
            onFechar={() => setRespostasOpen(false)}
          />
        )}
      </div>

      {arquivoOpen && (
        <ModalDeArquivo
          clientId={clientId}
          chatId={chatId}
          legenda={texto}
          tipoInicial={arquivoOpen === 'escolher' ? null : arquivoOpen}
          onClose={() => setArquivoOpen(null)}
          onErro={onErro}
          onEnviado={() => {
            onLimparTexto()
            onEnviado()
            setArquivoOpen(null)
          }}
        />
      )}

      {pixOpen && (
        <ModalDePix
          clientId={clientId}
          chatId={chatId}
          onClose={() => setPixOpen(false)}
          onErro={onErro}
          onEnviado={() => {
            setPixOpen(false)
            onEnviado()
          }}
        />
      )}

      {tagOpen && (
        <ModalDeEtiquetas
          chatId={chatId}
          atuais={tagsDoChat}
          disponiveis={tagsDisponiveis}
          onClose={() => setTagOpen(false)}
          onErro={onErro}
          onSalvo={() => {
            onEnviado()
            setTagOpen(false)
          }}
        />
      )}
    </>
  )
}

// ─── Arquivo ────────────────────────────────────────────────────────────────

// Sem 'video' de propósito. A conexão por QR Code recusa o envio de vídeo
// (limitação do provedor de conexão não oficial). Oferecer o botão seria
// oferecer uma falha:
// quem precisa manda o arquivo como documento, ou o link.
const TIPOS: { kind: TipoDeAnexo; titulo: string }[] = [
  { kind: 'imagem', titulo: 'Imagem' },
  { kind: 'audio', titulo: 'Áudio' },
  { kind: 'documento', titulo: 'Documento' },
]

function ModalDeArquivo({
  clientId,
  chatId,
  legenda,
  tipoInicial,
  onClose,
  onErro,
  onEnviado,
}: {
  clientId: string
  chatId: string
  legenda: string
  tipoInicial: TipoDeAnexo | null
  onClose: () => void
  onErro: (m: string) => void
  onEnviado: () => void
}) {
  const [tipo, setTipo] = useState<TipoDeAnexo | null>(tipoInicial)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function enviar() {
    if (!arquivo || !tipo) return
    setEnviando(true)
    try {
      const r = await sendMediaMessage(clientId, { chatId, file: arquivo, kind: tipo, caption: legenda })
      // `delivered: false` não é exceção: a mensagem está gravada na conversa
      // marcada como falhou, e o motivo tem que aparecer.
      if (!r.delivered && r.detail) onErro(r.detail)
      onEnviado()
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não deu pra enviar o arquivo.')
      setEnviando(false)
    }
  }

  return (
    <CrmModal
      open
      title="Enviar arquivo"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={!arquivo || !tipo || enviando}
            className={primaryButtonClass}
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => {
                setTipo(t.kind)
                setArquivo(null)
              }}
              className={`rounded-lg border px-3 py-2.5 text-left ${
                tipo === t.kind ? 'border-line-strong bg-canvas' : 'border-line hover:bg-canvas'
              }`}
            >
              <span className="block text-sm font-medium text-ink">{t.titulo}</span>
              <span className="block text-[11px] text-ink-4">{LIMITES_DE_ANEXO[t.kind].descricao}</span>
            </button>
          ))}
        </div>

        {tipo && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={LIMITES_DE_ANEXO[tipo].aceita}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                // O tipo escolhido manda, MENOS quando o arquivo desmente:
                // pegar um PDF em "Imagem" faria o WhatsApp recusar o envio.
                if (tipo !== 'documento' && tipoDoArquivo(f.type) !== tipo) {
                  onErro(`Esse arquivo não é ${tipo}. Escolha o tipo certo ou outro arquivo.`)
                  return
                }
                setArquivo(f)
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-6 text-center hover:bg-canvas"
            >
              <Upload size={20} className="text-ink-4" />
              <span className="text-sm text-ink-2">{arquivo ? arquivo.name : 'Escolher arquivo'}</span>
              {arquivo && (
                <span className="text-[11px] text-ink-4">{(arquivo.size / 1024 / 1024).toFixed(2)} MB</span>
              )}
            </button>
          </>
        )}

        {legenda.trim().length > 0 && tipo !== 'audio' && (
          <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] text-ink-3">
            O que está escrito na caixa de mensagem vai junto como legenda.
          </p>
        )}
      </div>
    </CrmModal>
  )
}

// ─── Áudio ──────────────────────────────────────────────────────────────────

/**
 * Grava e manda como mensagem de voz.
 *
 * O Chrome grava em webm/opus e o WhatsApp quer ogg/opus. Pedimos ogg quando o
 * navegador suporta (Firefox) e caímos no webm quando não — a ponte tem uma
 * rede de segurança que reenvia como arquivo se o provedor recusar o formato, pra
 * o áudio chegar de um jeito ou de outro.
 */
function GravadorDeAudio({
  clientId,
  chatId,
  gravando,
  setGravando,
  desabilitado,
  motivoDesabilitado,
  onErro,
  onEnviado,
}: {
  clientId: string
  chatId: string
  gravando: boolean
  setGravando: (v: boolean) => void
  desabilitado: boolean
  motivoDesabilitado?: string
  onErro: (m: string) => void
  onEnviado: () => void
}) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<BlobPart[]>([])
  const cancelouRef = useRef(false)
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    if (!gravando) return
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [gravando])

  // Soltar o microfone quando o componente sai da tela — senão a luz da webcam
  // /mic fica acesa e o navegador segue gravando em segundo plano.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function comecar() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const formato = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm;codecs=opus'

      const rec = new MediaRecorder(stream, { mimeType: formato })
      pedacosRef.current = []
      cancelouRef.current = false

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacosRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setGravando(false)
        setSegundos(0)
        if (cancelouRef.current) return

        const blob = new Blob(pedacosRef.current, { type: formato })
        if (blob.size === 0) return
        try {
          const ext = formato.startsWith('audio/ogg') ? 'ogg' : 'webm'
          const r = await sendMediaMessage(clientId, {
            chatId,
            file: blob,
            kind: 'audio',
            filename: `audio.${ext}`,
          })
          if (!r.delivered && r.detail) onErro(r.detail)
          onEnviado()
        } catch (e) {
          onErro(e instanceof Error ? e.message : 'Não deu pra enviar o áudio.')
        }
      }

      rec.start()
      recorderRef.current = rec
      setGravando(true)
    } catch {
      onErro('Não deu pra usar o microfone. Autorize o acesso no navegador e tente de novo.')
    }
  }

  function parar(cancelar: boolean) {
    cancelouRef.current = cancelar
    recorderRef.current?.stop()
  }

  if (!gravando) {
    return (
      <button
        type="button"
        aria-label="Gravar áudio"
        title={desabilitado ? motivoDesabilitado : 'Gravar áudio'}
        onClick={comecar}
        disabled={desabilitado}
        className="rounded-lg p-1.5 transition-colors hover:bg-surface-2 hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Mic size={16} />
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => parar(false)}
        aria-label="Parar e enviar"
        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-white"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        <Square size={10} fill="currentColor" />
        {String(Math.floor(segundos / 60)).padStart(2, '0')}:{String(segundos % 60).padStart(2, '0')}
      </button>
      <button
        type="button"
        onClick={() => parar(true)}
        aria-label="Descartar gravação"
        className="text-ink-4 hover:text-danger-ink"
      >
        <Trash2 size={14} />
      </button>
    </span>
  )
}

// ─── Emoji ──────────────────────────────────────────────────────────────────

const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😉','🙂','😎',
  '🤔','😐','😕','😢','😭','😡','🥰','🤗','🤝','🙏',
  '👍','👎','👏','💪','🔥','✅','❌','⚠️','⭐','💡',
  '❤️','💜','🎉','🎁','📅','📎','💰','💳','🚀','📌',
]

function PainelDeEmoji({ onEscolher, onFechar }: { onEscolher: (e: string) => void; onFechar: () => void }) {
  return (
    <>
      {/* Clicar fora fecha. Sem isto o painel só sai clicando no mesmo botão,
          que é o jeito que ninguém tenta primeiro. */}
      <span className="fixed inset-0 z-10" onClick={onFechar} />
      <span className="absolute bottom-9 right-0 z-20 grid w-64 grid-cols-10 gap-0.5 rounded-lg border border-line bg-surface-solid p-2 shadow-lg">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEscolher(e)}
            className="rounded p-0.5 text-base leading-none hover:bg-canvas"
          >
            {e}
          </button>
        ))}
      </span>
    </>
  )
}

// ─── Respostas rápidas ──────────────────────────────────────────────────────

/**
 * Era um `<select>` com o texto "Resposta rápida" ocupando meia barra. Como
 * lista, cabe o título E o começo do texto — que é o que faz escolher sem
 * precisar abrir uma por uma.
 */
function PainelDeRespostas({
  respostas,
  onEscolher,
  onFechar,
}: {
  respostas: QuickReply[]
  onEscolher: (r: QuickReply) => void
  onFechar: () => void
}) {
  return (
    <>
      <span className="fixed inset-0 z-10" onClick={onFechar} />
      <div className="absolute bottom-9 right-0 z-20 w-72 overflow-hidden rounded-lg border border-line bg-surface-solid shadow-lg">
        {respostas.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-ink-4">
            Nenhuma resposta rápida ainda. Crie em Configurações → Respostas rápidas.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {respostas.map((r) => {
              const anexos = r.items.filter((i) => i.kind !== 'texto').length
              const previa = r.items.map((i) => i.text?.trim() || i.fileName || i.kind).filter(Boolean).join(' · ')
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onEscolher(r)}
                  className="block w-full border-b border-line-soft px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{r.shortcut}</span>
                    {anexos > 0 && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[10px] text-ink-3">
                        {anexos} anexo{anexos > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-4">{previa}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ─── PIX ────────────────────────────────────────────────────────────────────

const TIPOS_DE_CHAVE = [
  { valor: 'aleatoria', rotulo: 'Chave aleatória (EVP)' },
  { valor: 'cpf', rotulo: 'CPF / CNPJ' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'telefone', rotulo: 'Telefone' },
]

/**
 * Manda a cobrança PIX com um botão de COPIAR de verdade.
 *
 * É exatamente pra isso que serve o botão `copy` do WhatsApp: um toque põe a
 * chave na área de transferência. Mandar a chave como texto obriga o cliente a
 * selecionar sem sobrar nem faltar caractere — e chave copiada errada é
 * dinheiro que não chega.
 *
 * Se a conexão não souber mandar botão, a ponte manda o mesmo conteúdo como
 * texto sozinha. O aviso na tela sai daí, e não de um palpite.
 */
function ModalDePix({
  clientId,
  chatId,
  onClose,
  onErro,
  onEnviado,
}: {
  clientId: string
  chatId: string
  onClose: () => void
  onErro: (m: string) => void
  onEnviado: () => void
}) {
  const [tipo, setTipo] = useState('aleatoria')
  const [chave, setChave] = useState('')
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [enviando, setEnviando] = useState(false)

  const rotuloDoTipo = TIPOS_DE_CHAVE.find((t) => t.valor === tipo)?.rotulo ?? 'Chave PIX'

  async function enviar() {
    const linhas = ['*Pagamento via PIX*', '']
    if (valor.trim()) linhas.push(`Valor: R$ ${valor.trim()}`)
    if (nome.trim()) linhas.push(`Favorecido: ${nome.trim()}`)
    linhas.push(`Tipo de chave: ${rotuloDoTipo}`)

    setEnviando(true)
    try {
      const r = await sendButtonsMessage(clientId, {
        chatId,
        body: linhas.join('\n'),
        botoes: [{ type: 'copy', text: 'COPIAR CHAVE PIX', copyCode: chave.trim() }],
      })
      if (!r.delivered && r.detail) onErro(r.detail)
      onEnviado()
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não deu pra enviar a chave PIX.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <CrmModal
      open
      title="Enviar chave PIX"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={enviar} disabled={!chave.trim() || enviando} className={primaryButtonClass}>
            {enviando ? 'Enviando…' : 'Enviar com botão'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="Tipo de chave PIX">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
            {TIPOS_DE_CHAVE.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Selecao>
        </CrmField>

        <CrmField label="Chave PIX *">
          <input
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            className={inputClass}
            placeholder="123e4567-e89b-12d3-a456-426614174000"
          />
        </CrmField>

        <CrmField label="Nome do beneficiário">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputClass}
            placeholder="Loja exemplo (opcional)"
          />
        </CrmField>

        <CrmField label="Valor">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={inputClass}
            placeholder="199,90 (opcional)"
          />
        </CrmField>

        <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          Vai com um botão <strong>Copiar chave PIX</strong>: o cliente toca e a chave cai na área de transferência
          dele. Se a conexão não suportar botão, o mesmo conteúdo sai como texto.
        </p>
      </div>
    </CrmModal>
  )
}

// ─── Etiquetas ──────────────────────────────────────────────────────────────

function ModalDeEtiquetas({
  chatId,
  atuais,
  disponiveis,
  onClose,
  onErro,
  onSalvo,
}: {
  chatId: string
  atuais: string[]
  disponiveis: { id: string; name: string }[]
  onClose: () => void
  onErro: (m: string) => void
  onSalvo: () => void
}) {
  const [escolhidas, setEscolhidas] = useState<string[]>(atuais)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      await updateChat(chatId, { tags: escolhidas })
      onSalvo()
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não deu pra salvar as etiquetas.')
      setSalvando(false)
    }
  }

  return (
    <CrmModal
      open
      title="Etiquetas da conversa"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={salvando} className={primaryButtonClass}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {disponiveis.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">
          Nenhuma etiqueta cadastrada ainda. Crie em Configurações → Etiquetas.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {disponiveis.map((t) => {
            const marcada = escolhidas.includes(t.name)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setEscolhidas((atual) =>
                    marcada ? atual.filter((x) => x !== t.name) : [...atual, t.name],
                  )
                }
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  marcada ? 'text-white' : 'border border-line text-ink-3 hover:text-ink'
                }`}
                style={marcada ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                {t.name}
              </button>
            )
          })}
        </div>
      )}
    </CrmModal>
  )
}

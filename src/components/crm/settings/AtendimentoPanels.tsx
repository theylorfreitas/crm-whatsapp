import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Building2,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  Sticker,
  Loader2,
  Paperclip,
} from 'lucide-react'
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  fetchDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  fetchQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type WhatsAppTemplate,
  type ConteudoDaResposta,
  type TipoDeConteudo,
  type QuickReply,
} from '../../../lib/db/crmSettings'
import { enviarMidiaDoFluxo } from '../../../lib/db/crmFlowMedia'
import { CrmLoading } from '../CrmDataStates'
import { readableOn } from '../../../lib/readableOn'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmTable,
  CrmToggle,
  CrmErrorBar,
  CrmConfirmarExclusao,
} from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'
import { SeletorDeCor, CORES_DO_ATALHO } from '../../ui/SeletorDeCor'

// Painéis de atendimento das Configurações: etiquetas, departamentos, respostas
// rápidas e templates da Meta. Horários mora em HorariosPanel.tsx — ele deixou
// de ser um CRUD e virou uma tela por conexão, com regra de negócio própria.

export function TagsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(CORES_DO_ATALHO[0])
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; name: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-tags', clientId], queryFn: () => fetchTags(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-tags', clientId] })

  const saveMutation = useMutation({
    mutationFn: () => (editing ? updateTag(editing.id, { name, color }) : createTag(clientId, { name, color })),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
      setName('')
    },
    onError: (e: { code?: string; message: string }) =>
      setError(e.code === '23505' ? 'Já existe uma etiqueta com esse nome.' : e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteTag, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const tags = query.data ?? []

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setName('')
            setColor(CORES_DO_ATALHO[0])
            setOpen(true)
          }}
          className={primaryButtonClass}
        >
          <Plus size={14} /> Nova etiqueta
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      {query.isLoading ? (
        <CrmLoading />
      ) : tags.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface py-10 text-center text-sm text-ink-4">
          Nenhuma etiqueta criada. Etiquetas organizam chats, contatos e fluxos.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <div
              key={t.id}
              className="group flex items-center gap-2 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium"
              style={{ backgroundColor: t.color, color: readableOn(t.color) }}
            >
              {t.name}
              <button
                type="button"
                onClick={() => {
                  setEditing(t)
                  setName(t.name)
                  setColor(t.color)
                  setOpen(true)
                }}
                className="rounded-full p-0.5 hover:bg-black/20"
                aria-label={`Editar ${t.name}`}
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                onClick={() => setAExcluir(t)}
                className="rounded-full p-0.5 hover:bg-black/20"
                aria-label={`Apagar ${t.name}`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <CrmModal
        open={open}
        title={editing ? 'Editar etiqueta' : 'Nova etiqueta'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
              className={primaryButtonClass}
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <CrmField label="Nome">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
          </CrmField>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Cor da etiqueta</span>
            <SeletorDeCor value={color} onChange={setColor} previewLabel={name || 'Nome da etiqueta'} />
          </div>
        </div>
      </CrmModal>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar etiqueta"
        pergunta={
          <>
            A etiqueta <strong>{aExcluir?.name}</strong> sai de todos os chats e contatos que a usam. Não dá pra
            desfazer.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) deleteMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

export function DepartmentsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', color: CORES_DO_ATALHO[0] as string })
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; name: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-departments', clientId], queryFn: () => fetchDepartments(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-departments', clientId] })

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? updateDepartment(editingId, form) : createDepartment(clientId, form)),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditingId(null)
      setForm({ name: '', description: '', color: CORES_DO_ATALHO[0] })
    },
    onError: (e: { code?: string; message: string }) =>
      setError(e.code === '23505' ? 'Já existe um departamento com esse nome.' : e.message),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })

  const departments = query.data ?? []
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? departments.filter((d) => d.name.toLowerCase().includes(t)) : departments
  }, [departments, busca])

  function abrirNovo() {
    setEditingId(null)
    setForm({ name: '', description: '', color: CORES_DO_ATALHO[0] })
    setOpen(true)
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={abrirNovo} className={primaryButtonClass}>
          <Plus size={14} /> Novo Departamento
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do departamento"
          className={`${inputClass} pl-9`}
        />
      </div>

      {query.isLoading ? (
        <CrmLoading />
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-12 text-center">
          <Building2 size={24} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">
            {departments.length === 0 ? 'Nenhum departamento cadastrado' : 'Nenhum departamento bate com a busca'}
          </p>
          {departments.length === 0 && (
            <>
              <p className="mt-1 text-xs text-ink-4">Crie o primeiro departamento para começar a organizar.</p>
              <button type="button" onClick={abrirNovo} className={`${primaryButtonClass} mt-3`}>
                <Plus size={14} /> Novo Departamento
              </button>
            </>
          )}
        </div>
      ) : (
        <CrmTable head={['Departamento', 'Descrição', 'Ações']}>
          {filtrados.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: d.color, color: readableOn(d.color) }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: readableOn(d.color), opacity: 0.7 }} />
                  {d.name}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">{d.description || 'Sem descrição'}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(d.id)
                      setForm({ name: d.name, description: d.description ?? '', color: d.color })
                      setOpen(true)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label={`Editar ${d.name}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAExcluir(d)}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label={`Apagar ${d.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <CrmModal
        open={open}
        title={editingId ? 'Editar Departamento' : 'Novo Departamento'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}
              className={primaryButtonClass}
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <CrmField label="Nome do Departamento">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} autoFocus />
          </CrmField>
          <CrmField label="Descrição">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
              placeholder="O que este departamento atende"
            />
          </CrmField>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Cor do Departamento</span>
            <SeletorDeCor
              value={form.color}
              onChange={(color) => setForm({ ...form, color })}
              previewLabel={form.name || 'Nome do Departamento'}
            />
          </div>
        </div>
      </CrmModal>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar departamento"
        pergunta={
          <>
            As conversas que estão em <strong>{aExcluir?.name}</strong> ficam sem departamento. Não dá pra desfazer.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) deleteMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

// ─── Respostas rápidas ──────────────────────────────────────────────────────

/**
 * Os seis tipos de conteúdo, e o que cada um vira no envio.
 *
 * `aceita` é o filtro do seletor de arquivo, e vem dos LIMITES do WhatsApp —
 * oferecer um formato que ele recusa faz a pessoa descobrir no primeiro cliente
 * que não recebeu.
 */
const TIPOS_DE_CONTEUDO: {
  kind: TipoDeConteudo
  rotulo: string
  icone: typeof MessageSquare
  cor: string
  aceita?: string
  /** Qual pasta do Storage: o limite de tamanho vem daí. */
  balde?: string
}[] = [
  { kind: 'texto', rotulo: 'Texto', icone: MessageSquare, cor: '#3B82F6' },
  { kind: 'imagem', rotulo: 'Imagem', icone: ImageIcon, cor: '#10B981', aceita: 'image/jpeg,image/png,image/webp', balde: 'imagem' },
  { kind: 'video', rotulo: 'Vídeo', icone: Video, cor: '#A855F7', aceita: 'video/mp4', balde: 'video' },
  { kind: 'audio', rotulo: 'Áudio', icone: Mic, cor: '#EF4444', aceita: 'audio/mpeg,audio/ogg', balde: 'audio' },
  {
    kind: 'documento',
    rotulo: 'Documento',
    icone: FileText,
    cor: '#06B6D4',
    aceita: '.pdf,.doc,.docx,.txt,.xls,.xlsx',
    balde: 'arquivo',
  },
  { kind: 'sticker', rotulo: 'Sticker', icone: Sticker, cor: '#F59E0B', aceita: 'image/webp,image/png', balde: 'sticker' },
]

function tipoDe(kind: TipoDeConteudo) {
  return TIPOS_DE_CONTEUDO.find((t) => t.kind === kind) ?? TIPOS_DE_CONTEUDO[0]!
}

/** "398.5 KB". Bytes crus não dizem nada a quem está olhando um anexo. */
function tamanhoLegivel(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** A primeira linha que descreve a resposta na lista. */
function resumoDa(reply: QuickReply): string {
  const primeiro = reply.items[0]
  if (!primeiro) return 'Sem conteúdo'
  if (primeiro.kind === 'texto') return primeiro.text?.trim() || 'Texto vazio'
  return primeiro.fileName || tipoDe(primeiro.kind).rotulo
}

export function QuickRepliesPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QuickReply | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | TipoDeConteudo>('todos')
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<QuickReply | null>(null)

  const query = useQuery({ queryKey: ['crm-quick-replies', clientId], queryFn: () => fetchQuickReplies(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-quick-replies', clientId] })

  const deleteMutation = useMutation({
    mutationFn: deleteQuickReply,
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })

  const replies = query.data ?? []
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return replies.filter((r) => {
      const bateBusca =
        !t ||
        r.shortcut.toLowerCase().includes(t) ||
        r.items.some((i) => (i.text ?? '').toLowerCase().includes(t) || (i.fileName ?? '').toLowerCase().includes(t))
      const bateTipo = filtro === 'todos' || r.items.some((i) => i.kind === filtro)
      return bateBusca && bateTipo
    })
  }, [replies, busca, filtro])

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
          className={primaryButtonClass}
        >
          <Plus size={14} /> Nova Resposta
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por atalho ou conteúdo..."
          className={`${inputClass} pl-9`}
        />
      </div>

      <div className="mb-3 w-52">
        <Selecao value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={inputClass}>
          <option value="todos">Todos os tipos</option>
          {TIPOS_DE_CONTEUDO.map((t) => (
            <option key={t.kind} value={t.kind}>
              {t.rotulo}
            </option>
          ))}
        </Selecao>
      </div>

      {query.isLoading ? (
        <CrmLoading />
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface py-10 text-center text-sm text-ink-4">
          {replies.length === 0
            ? 'Nenhuma resposta rápida. Elas aparecem como atalho na hora de responder um chat.'
            : 'Nenhuma resposta bate com o filtro.'}
        </p>
      ) : (
        <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          {filtradas.map((r) => {
            const primeiro = r.items[0]
            const t = tipoDe(primeiro?.kind ?? 'texto')
            const extras = r.items.length - 1
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${t.cor}22`, color: t.cor }}
                >
                  <t.icone size={15} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-ink">{r.shortcut}</span>
                    <CrmPill tone="cinza">{t.rotulo}</CrmPill>
                    {extras > 0 && <CrmPill tone="roxo">+{extras}</CrmPill>}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{resumoDa(r)}</p>
                  {primeiro && primeiro.kind !== 'texto' && primeiro.size ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-4">
                      <Paperclip size={10} /> {tamanhoLegivel(primeiro.size)}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(r)
                      setOpen(true)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label={`Editar ${r.shortcut}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAExcluir(r)}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label={`Apagar ${r.shortcut}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <ModalDeResposta
          clientId={clientId}
          existente={editing}
          onClose={() => setOpen(false)}
          onSalvo={() => {
            invalidate()
            setOpen(false)
          }}
        />
      )}

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar resposta rápida"
        pergunta={
          <>
            O atalho <strong>{aExcluir?.shortcut}</strong> deixa de existir na hora de responder. Não dá pra desfazer.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) deleteMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

/**
 * O editor de uma resposta rápida.
 *
 * O estado vive AQUI e só vai pro banco no Salvar. Uma resposta rápida com
 * quatro conteúdos é montada aos poucos, e gravar a cada item deixaria uma
 * resposta pela metade valendo na hora de atender.
 */
function ModalDeResposta({
  clientId,
  existente,
  onClose,
  onSalvo,
}: {
  clientId: string
  existente: QuickReply | null
  onClose: () => void
  onSalvo: () => void
}) {
  const [shortcut, setShortcut] = useState(existente?.shortcut ?? '')
  const [items, setItems] = useState<ConteudoDaResposta[]>(existente?.items ?? [])
  const [enviando, setEnviando] = useState<TipoDeConteudo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: () =>
      existente
        ? updateQuickReply(existente.id, { shortcut, items })
        : createQuickReply(clientId, { shortcut, items }),
    onSuccess: onSalvo,
    onError: (e: { code?: string; message: string }) =>
      setErro(e.code === '23505' ? 'Já existe uma resposta com esse atalho.' : e.message),
  })

  async function anexar(t: (typeof TIPOS_DE_CONTEUDO)[number], file: File) {
    setErro(null)
    setEnviando(t.kind)
    try {
      const url = await enviarMidiaDoFluxo(clientId, t.balde ?? 'arquivo', file)
      setItems((atuais) => [...atuais, { kind: t.kind, url, fileName: file.name, size: file.size, text: '' }])
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(null)
    }
  }

  return (
    <CrmModal
      open
      title={existente ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => salvar.mutate()}
            // Sem atalho não há como chamá-la na conversa; sem conteúdo, ela
            // manda o quê? Os dois são o mínimo pra resposta existir.
            disabled={!shortcut.trim() || items.length === 0 || salvar.isPending}
            className={primaryButtonClass}
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <CrmField
          label="Atalho"
          hint="Use apenas letras minúsculas, números, hifens, underscores e espaços."
        >
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9 _-]/g, ''))}
            className={inputClass}
            placeholder="ex: saudacao"
            autoFocus
          />
        </CrmField>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-2">Conteúdo da Resposta</span>
          <div className="grid grid-cols-3 gap-2">
            {TIPOS_DE_CONTEUDO.map((t) => {
              const carregando = enviando === t.kind
              const conteudo = (
                <>
                  <span
                    className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${t.cor}22`, color: t.cor }}
                  >
                    {carregando ? <Loader2 size={15} className="animate-spin" /> : <t.icone size={15} />}
                  </span>
                  <span className="text-[11px] font-medium text-ink-2">{t.rotulo}</span>
                </>
              )

              // Texto se acrescenta na hora; os outros esperam um arquivo. Um
              // <label> com input escondido abre o seletor com um clique só, em
              // vez de "escolher tipo" e depois "escolher arquivo".
              return t.kind === 'texto' ? (
                <button
                  key={t.kind}
                  type="button"
                  onClick={() => setItems((a) => [...a, { kind: 'texto', text: '' }])}
                  className="flex flex-col items-center rounded-xl border border-line bg-canvas px-2 py-3 hover:border-line-strong"
                >
                  {conteudo}
                </button>
              ) : (
                <label
                  key={t.kind}
                  className={`flex cursor-pointer flex-col items-center rounded-xl border border-line bg-canvas px-2 py-3 hover:border-line-strong ${
                    enviando ? 'pointer-events-none opacity-60' : ''
                  }`}
                >
                  {conteudo}
                  <input
                    type="file"
                    accept={t.aceita}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void anexar(t, file)
                    }}
                  />
                </label>
              )
            })}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-canvas py-8 text-center">
            <MessageSquare size={20} className="mx-auto mb-1.5 text-ink-4" />
            <p className="text-xs text-ink-4">Nenhum conteúdo adicionado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const t = tipoDe(item.kind)
              return (
                <div key={i} className="rounded-xl border border-line bg-canvas p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded"
                      style={{ backgroundColor: `${t.cor}22`, color: t.cor }}
                    >
                      <t.icone size={12} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-2">
                      {item.fileName ?? t.rotulo}
                      {item.size ? <span className="ml-1 text-ink-4">({tamanhoLegivel(item.size)})</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems((a) => a.filter((_, j) => j !== i))}
                      className="rounded p-1 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                      aria-label="Remover conteúdo"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <textarea
                    value={item.text ?? ''}
                    onChange={(e) =>
                      setItems((a) => a.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                    }
                    rows={item.kind === 'texto' ? 3 : 2}
                    placeholder={item.kind === 'texto' ? 'Escreva a mensagem…' : 'Legenda (opcional)'}
                    className={inputClass}
                  />
                </div>
              )
            })}
          </div>
        )}

        {erro && <p className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-ink">{erro}</p>}
      </div>
    </CrmModal>
  )
}

export function TemplatesPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    language: 'pt_BR',
    category: 'utility' as WhatsAppTemplate['category'],
    header: '',
    body: '',
    footer: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; name: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-templates', clientId], queryFn: () => fetchTemplates(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-templates', clientId] })

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? updateTemplate(editingId, form) : createTemplate(clientId, form)),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditingId(null)
    },
    onError: (e: { code?: string; message: string }) =>
      setError(e.code === '23505' ? 'Já existe um template com esse nome e idioma.' : e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteTemplate, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })
  const submitMutation = useMutation({
    mutationFn: (id: string) => updateTemplate(id, { status: 'pendente' }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })

  const templates = query.data ?? []

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditingId(null)
            setForm({ name: '', language: 'pt_BR', category: 'utility', header: '', body: '', footer: '' })
            setOpen(true)
          }}
          className={primaryButtonClass}
        >
          <Plus size={14} /> Novo template
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <p className="mb-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
        Templates são obrigatórios pra iniciar conversa pela API Oficial da Meta. Aqui você escreve e guarda; a aprovação
        acontece na Meta, e o status espelha o que ela responder depois que a conexão oficial estiver configurada.
      </p>

      {query.isLoading ? (
        <CrmLoading />
      ) : templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface py-10 text-center text-sm text-ink-4">
          Nenhum template cadastrado.
        </p>
      ) : (
        <CrmTable head={['Nome', 'Categoria', 'Idioma', 'Status', 'Ações']}>
          {templates.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{t.name}</p>
                <p className="line-clamp-1 max-w-md text-xs text-ink-4">{t.body}</p>
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">{t.category}</td>
              <td className="px-4 py-3 text-xs text-ink-3">{t.language}</td>
              <td className="px-4 py-3">
                <CrmPill
                  tone={
                    t.status === 'aprovado'
                      ? 'verde'
                      : t.status === 'rejeitado'
                        ? 'vermelho'
                        : t.status === 'pendente'
                          ? 'amarelo'
                          : 'cinza'
                  }
                >
                  {t.status}
                </CrmPill>
                {t.rejectionReason && <p className="mt-0.5 text-[10px] text-danger-ink">{t.rejectionReason}</p>}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {t.status === 'rascunho' && (
                    <button
                      type="button"
                      onClick={() => submitMutation.mutate(t.id)}
                      className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                    >
                      Enviar pra aprovação
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id)
                      setForm({
                        name: t.name,
                        language: t.language,
                        category: t.category,
                        header: t.header ?? '',
                        body: t.body,
                        footer: t.footer ?? '',
                      })
                      setOpen(true)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label="Editar"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAExcluir(t)}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label="Apagar"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <CrmModal
        open={open}
        wide
        title={editingId ? 'Editar template' : 'Novo template'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || !form.body.trim() || saveMutation.isPending}
              className={primaryButtonClass}
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CrmField label="Nome" hint="minúsculas e _">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              className={inputClass}
            />
          </CrmField>
          <CrmField label="Categoria">
            <Selecao
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as WhatsAppTemplate['category'] })}
              className={inputClass}
            >
              <option value="utility">Utilidade</option>
              <option value="marketing">Marketing</option>
              <option value="authentication">Autenticação</option>
            </Selecao>
          </CrmField>
          <CrmField label="Idioma">
            <Selecao value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className={inputClass}>
              <option value="pt_BR">pt_BR</option>
              <option value="en_US">en_US</option>
              <option value="es_ES">es_ES</option>
            </Selecao>
          </CrmField>
          <div className="sm:col-span-3">
            <CrmField label="Cabeçalho (opcional)">
              <input value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })} className={inputClass} />
            </CrmField>
          </div>
          <div className="sm:col-span-3">
            <CrmField label="Corpo" hint="Use {{1}}, {{2}} para as variáveis, como a Meta espera.">
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} className={inputClass} />
            </CrmField>
          </div>
          <div className="sm:col-span-3">
            <CrmField label="Rodapé (opcional)">
              <input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} className={inputClass} />
            </CrmField>
          </div>
        </div>
      </CrmModal>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar template"
        pergunta={
          <>
            O template <strong>{aExcluir?.name}</strong> sai daqui. Se ele já foi aprovado na Meta, continua lá.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) deleteMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

// Reexporta o toggle pra quem monta um painel simples de liga/desliga.
export { CrmToggle }

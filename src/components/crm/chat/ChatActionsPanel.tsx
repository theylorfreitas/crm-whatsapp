import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Copy,
  Check,
  Pencil,
  Trash2,
  Zap,
  Search,
  User,
  Phone,
  Mail,
  Building2,
  CalendarClock,
  Loader2,
} from 'lucide-react'
import { formatarTelefone } from '../../../lib/formatarTelefone'
import type { CrmChat } from '../../../lib/db/crmChat'
import { fetchChatNotes, createChatNote, deleteChatNote, updateChat, deleteChat } from '../../../lib/db/crmChat'
import {
  fetchCamposDaConversa,
  salvarCampoDaConversa,
  dispararFluxo,
  fetchFlowRuns,
} from '../../../lib/db/crmChatActions'
import { inputClass, primaryButtonClass, CrmPill } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'
import { Sensivel } from '../../ui/Sensivel'
import { FluxoIniciando, type Partida } from './FluxoIniciando'

// Painel lateral do chat. Abre por cima da conversa (não empurra), porque a
// conversa é o que a pessoa estava lendo — empurrar reflui o histórico
// inteiro e perde o lugar da leitura.

interface Props {
  clientId: string
  chat: CrmChat
  contato: { email: string | null; organization: string | null; createdAt: string | null } | null
  departamentos: { id: string; name: string }[]
  fluxos: { id: string; name: string }[]
  usuarioAtual: string
  /** Abre já no bloco de atribuição (é o que o clique no cabeçalho faz). */
  focoAtribuicao?: boolean
  onClose: () => void
  onChatMudou: () => void
  onChatApagado: () => void
}

export function ChatActionsPanel({
  clientId,
  chat,
  contato,
  departamentos,
  fluxos,
  usuarioAtual,
  focoAtribuicao = false,
  onClose,
  onChatMudou,
  onChatApagado,
}: Props) {
  const queryClient = useQueryClient()
  const [novaNota, setNovaNota] = useState('')
  const [buscaFluxo, setBuscaFluxo] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [editandoNome, setEditandoNome] = useState(false)
  const [nomeEditado, setNomeEditado] = useState('')

  const notasQuery = useQuery({ queryKey: ['crm-chat-notes', chat.id], queryFn: () => fetchChatNotes(chat.id) })
  const camposQuery = useQuery({
    queryKey: ['crm-chat-fields', chat.id],
    queryFn: () => fetchCamposDaConversa(clientId, chat.id),
  })
  const runsQuery = useQuery({ queryKey: ['crm-flow-runs', chat.id], queryFn: () => fetchFlowRuns(chat.id) })

  const salvarNota = useMutation({
    mutationFn: () => createChatNote(clientId, { chatId: chat.id, body: novaNota.trim(), authorName: usuarioAtual }),
    onSuccess: () => {
      setNovaNota('')
      queryClient.invalidateQueries({ queryKey: ['crm-chat-notes', chat.id] })
    },
  })
  const apagarNota = useMutation({
    mutationFn: deleteChatNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-chat-notes', chat.id] }),
  })
  const mudarChat = useMutation({
    mutationFn: (input: Parameters<typeof updateChat>[1]) => updateChat(chat.id, input),
    onSuccess: onChatMudou,
  })
  const apagarChat = useMutation({ mutationFn: () => deleteChat(chat.id), onSuccess: onChatApagado })
  const salvarCampo = useMutation({
    mutationFn: (v: { fieldId: string; value: string }) => salvarCampoDaConversa(clientId, { chatId: chat.id, ...v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-chat-fields', chat.id] }),
  })
  // O aviso de partida acompanha a execução até ela sair da fila — por isso
  // ele guarda o id, e não só um "carregando". Ver FluxoIniciando.
  const [partida, setPartida] = useState<Partida | null>(null)

  // O aviso é DAQUELA pessoa: trocar de conversa com ele na tela faria a
  // próxima parecer que está recebendo um fluxo que não é dela.
  useEffect(() => setPartida(null), [chat.id])

  // Trocar de conversa com o campo de nome aberto salvaria o nome de uma
  // pessoa por cima do da outra.
  useEffect(() => setEditandoNome(false), [chat.id])

  const disparar = useMutation({
    mutationFn: (fluxo: { id: string; name: string }) => {
      setPartida({ runId: null, flowName: fluxo.name })
      return dispararFluxo(clientId, { flowId: fluxo.id, chatId: chat.id, triggeredByName: usuarioAtual })
    },
    onSuccess: (runId, fluxo) => {
      setBuscaFluxo('')
      setPartida({ runId, flowName: fluxo.name })
      queryClient.invalidateQueries({ queryKey: ['crm-flow-runs', chat.id] })
    },
    onError: (e, fluxo) => setPartida({ runId: null, flowName: fluxo.name, erro: (e as Error).message }),
  })

  function copiarTelefone() {
    if (!chat.phone) return
    navigator.clipboard.writeText(chat.phone).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  const fluxosFiltrados = fluxos.filter((f) => f.name.toLowerCase().includes(buscaFluxo.trim().toLowerCase()))
  const notas = notasQuery.data ?? []

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-line bg-surface md:w-[22rem]">
      <header className="flex shrink-0 items-center justify-between border-b border-line-soft px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Ações do chat</h2>
        <button type="button" onClick={onClose} aria-label="Fechar ações do chat" className="text-ink-4 hover:text-ink">
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* ── Informações do cliente ─────────────────────────────────────── */}
        <Bloco titulo="Informações do cliente">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-3">
              <User size={15} />
            </span>
            <div className="min-w-0 flex-1">
              {editandoNome ? (
                // Renomear vale mais aqui do que na agenda do celular: quem
                // chega pelo WhatsApp sem estar salvo entra como número, e é o
                // atendimento que descobre o nome, no meio da conversa.
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const limpo = nomeEditado.trim()
                    if (limpo && limpo !== chat.contactName) mudarChat.mutate({ contactName: limpo })
                    setEditandoNome(false)
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    aria-label="Nome do contato"
                    className={`${inputClass} h-7 py-0 text-sm`}
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditandoNome(false)
                    }}
                  />
                  <button type="submit" aria-label="Salvar nome" className="shrink-0 text-ink-3 hover:text-ink">
                    <Check size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <div className="truncate text-sm font-medium text-ink">{chat.contactName}</div>
                  <p className="truncate font-mono text-[10px] text-ink-4">Cliente #{chat.id.slice(0, 8)}</p>
                </>
              )}
            </div>
            {!editandoNome && (
              <button
                type="button"
                aria-label="Editar nome do contato"
                title="Editar nome do contato"
                onClick={() => {
                  setNomeEditado(chat.contactName)
                  setEditandoNome(true)
                }}
                className="shrink-0 text-ink-4 hover:text-ink"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          <Linha icone={Phone} rotulo="Telefone">
            <span className="flex items-center gap-1.5">
              <Sensivel className="tabular-nums">
                {chat.phone ? formatarTelefone(chat.phone) : 'Não informado'}
              </Sensivel>
              {chat.phone && (
                <button type="button" onClick={copiarTelefone} aria-label="Copiar telefone" className="text-ink-4 hover:text-ink-2">
                  {copiado ? <Check size={11} className="text-ok-ink" /> : <Copy size={11} />}
                </button>
              )}
            </span>
          </Linha>
          <Linha icone={Mail} rotulo="E-mail">
            <Sensivel>{contato?.email ?? 'Não informado'}</Sensivel>
          </Linha>
          <Linha icone={Building2} rotulo="Conta">
            <Sensivel>{contato?.organization ?? 'Não informado'}</Sensivel>
          </Linha>
          <Linha icone={CalendarClock} rotulo="Criado em">
            {new Date(contato?.createdAt ?? chat.createdAt).toLocaleString('pt-BR')}
          </Linha>
        </Bloco>

        {/* ── Informações adicionais (campos personalizados) ─────────────── */}
        <Bloco titulo="Informações adicionais">
          {camposQuery.isLoading ? (
            <p className="text-xs text-ink-4">Carregando…</p>
          ) : (camposQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-ink-4">
              Nenhum campo personalizado. Crie em Configurações → Campos para eles aparecerem aqui.
            </p>
          ) : (
            <div className="space-y-2.5">
              {(camposQuery.data ?? []).map((c) => (
                <div key={c.fieldId}>
                  <label htmlFor={`campo-${c.fieldId}`} className="mb-1 block text-[11px] text-ink-4">
                    {c.label}
                  </label>
                  {c.type === 'lista' ? (
                    <Selecao
                      id={`campo-${c.fieldId}`}
                      className={inputClass}
                      // `value` e não `defaultValue`: o Selecao é controlado, e
                      // com defaultValue a escolha não apareceria na tela.
                      value={c.value ?? ''}
                      onChange={(e) => salvarCampo.mutate({ fieldId: c.fieldId, value: e.target.value })}
                    >
                      <option value="">Não informado</option>
                      {c.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Selecao>
                  ) : (
                    <input
                      id={`campo-${c.fieldId}`}
                      className={inputClass}
                      type={c.type === 'numero' ? 'number' : c.type === 'data' ? 'date' : 'text'}
                      defaultValue={c.value ?? ''}
                      placeholder="Não informado"
                      // onBlur e não onChange: salvar a cada tecla mandaria uma
                      // gravação por letra digitada.
                      onBlur={(e) => {
                        if (e.target.value !== (c.value ?? '')) salvarCampo.mutate({ fieldId: c.fieldId, value: e.target.value })
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Bloco>

        {/* ── Departamento ──────────────────────────────────────────────── */}
        <Bloco titulo="Departamento">
          <Selecao
            className={inputClass}
            value={chat.departmentId ?? ''}
            onChange={(e) => mudarChat.mutate({ departmentId: e.target.value || null })}
          >
            <option value="">Sem departamento</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Selecao>
        </Bloco>

        {/* ── Atribuir chat ─────────────────────────────────────────────── */}
        <Bloco titulo="Atribuir chat" destaque={focoAtribuicao}>
          {chat.assignedName ? (
            <>
              <button
                type="button"
                onClick={() => mudarChat.mutate({ assignedTo: null, assignedName: null })}
                className={`${primaryButtonClass} w-full justify-center`}
              >
                Desatribuir
              </button>
              <p className="mt-2 text-[11px] text-ink-4">
                Atualmente atribuído a: <span className="text-ink-2">{chat.assignedName}</span>
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => mudarChat.mutate({ assignedName: usuarioAtual, status: chat.status === 'aguardando' ? 'atendendo' : chat.status })}
                className={`${primaryButtonClass} w-full justify-center`}
              >
                Atribuir a mim
              </button>
              <p className="mt-2 text-[11px] text-ink-4">Sem responsável. Atribuir move a conversa para “Atendendo”.</p>
            </>
          )}
        </Bloco>

        {/* ── Disparar fluxo ────────────────────────────────────────────── */}
        <Bloco titulo="Disparar fluxo">
          {partida && (
            <div className="mb-2">
              <FluxoIniciando partida={partida} aoFechar={() => setPartida(null)} />
            </div>
          )}
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              className={`${inputClass} pl-8`}
              placeholder="Digite o nome do fluxo..."
              value={buscaFluxo}
              onChange={(e) => setBuscaFluxo(e.target.value)}
            />
          </div>
          {buscaFluxo.trim() && (
            <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-line bg-canvas">
              {fluxosFiltrados.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-ink-4">Nenhum fluxo com esse nome.</p>
              ) : (
                fluxosFiltrados.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    // Travado enquanto um disparo está em andamento: o clique
                    // repetido é o reflexo natural de quem não vê resposta, e
                    // cada um deles é um atendimento a mais no celular da
                    // pessoa do outro lado.
                    disabled={disparar.isPending}
                    onClick={() => disparar.mutate(f)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                  >
                    {disparar.isPending && disparar.variables?.id === f.id ? (
                      <Loader2 size={12} className="shrink-0 animate-spin text-ink-4" />
                    ) : (
                      <Zap size={12} className="shrink-0 text-ink-4" />
                    )}
                    <span className="truncate">{f.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
          {(runsQuery.data ?? []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {(runsQuery.data ?? []).slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-ink-3">{r.flowName ?? 'Fluxo'}</span>
                  <CrmPill tone={r.status === 'concluido' ? 'verde' : r.status === 'falhou' ? 'vermelho' : 'amarelo'}>
                    {r.status}
                  </CrmPill>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        {/* ── Notas ─────────────────────────────────────────────────────── */}
        <Bloco titulo="Notas">
          {notas.length === 0 ? (
            <p className="mb-2 text-xs text-ink-4">Nenhuma nota ainda. Adicione a primeira abaixo.</p>
          ) : (
            <ul className="mb-2 space-y-2">
              {notas.map((n) => (
                <li key={n.id} className="rounded-lg border border-line-soft bg-canvas p-2.5">
                  <p className="whitespace-pre-wrap text-xs text-ink-2">{n.body}</p>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-ink-4">
                    <span>
                      {n.authorName ?? 'Equipe'} · {new Date(n.createdAt).toLocaleString('pt-BR')}
                    </span>
                    <button type="button" onClick={() => apagarNota.mutate(n.id)} aria-label="Apagar nota" className="hover:text-danger-ink">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <textarea
            className={`${inputClass} min-h-[64px] resize-y`}
            placeholder="Digite uma nota... (Ctrl+Enter para salvar)"
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && novaNota.trim()) salvarNota.mutate()
            }}
          />
          <button
            type="button"
            onClick={() => salvarNota.mutate()}
            disabled={!novaNota.trim() || salvarNota.isPending}
            className={`${primaryButtonClass} mt-2 disabled:opacity-40`}
          >
            Adicionar
          </button>
        </Bloco>

        {/* ── Ações destrutivas ─────────────────────────────────────────── */}
        <Bloco titulo="Ações destrutivas">
          <button
            type="button"
            onClick={() =>
              window.confirm(`Excluir a conversa com ${chat.contactName}? As mensagens vão junto e não dá pra desfazer.`) &&
              apagarChat.mutate()
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-danger px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            <Trash2 size={13} /> Excluir chat
          </button>
        </Bloco>

        {/* ── Informações ───────────────────────────────────────────────── */}
        <Bloco titulo="Informações">
          <Linha icone={CalendarClock} rotulo="Iniciado em">
            {new Date(chat.createdAt).toLocaleString('pt-BR')}
          </Linha>
          {chat.resolvedAt && (
            <Linha icone={Check} rotulo="Finalizado em">
              {new Date(chat.resolvedAt).toLocaleString('pt-BR')}
            </Linha>
          )}
          <Linha icone={CalendarClock} rotulo="Última mensagem">
            {chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleString('pt-BR') : 'Nenhuma ainda'}
          </Linha>
        </Bloco>
      </div>
    </aside>
  )
}

function Bloco({ titulo, destaque, children }: { titulo: string; destaque?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={
        destaque
          ? 'rounded-lg border border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] p-2.5'
          : undefined
      }
    >
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4">{titulo}</h3>
      {children}
    </section>
  )
}

function Linha({
  icone: Icone,
  rotulo,
  children,
}: {
  icone: typeof Phone
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 flex gap-2">
      <Icone size={12} className="mt-0.5 shrink-0 text-ink-4" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-ink-4">{rotulo}</p>
        <p className="break-words text-xs text-ink-2">{children}</p>
      </div>
    </div>
  )
}

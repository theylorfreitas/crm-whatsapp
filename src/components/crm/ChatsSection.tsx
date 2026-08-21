import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  Plus,
  Send,
  MessagesSquare,
  Filter,
  CalendarDays,
  UserPlus,
  Workflow,
  CheckCircle2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Zap,
  Loader2,
} from 'lucide-react'
import {
  fetchChats,
  fetchMessages,
  sendMessage,
  createChat,
  updateChat,
  markChatRead,
  type ChatStatus,
  type CrmChat,
} from '../../lib/db/crmChat'
import {
  fetchContatoDaConversa,
  resolverChat,
  reabrirChat,
  dispararFluxo,
  moverStatusDoChat,
  ORDEM_DOS_STATUS,
} from '../../lib/db/crmChatActions'
import { BarraDeAcoes } from './chat/BarraDeAcoes'
import {
  FiltrosDeChatModal,
  FILTROS_VAZIOS,
  contarFiltros,
  passaNosFiltros,
  type FiltrosDeChat,
} from './chat/FiltrosDeChat'
import { Conversa } from './chat/Conversa'
import { fetchConnections, syncConnections } from '../../lib/db/crmConnections'
import { fetchDepartments, fetchTags, fetchQuickReplies } from '../../lib/db/crmSettings'
import { fetchFlows } from '../../lib/db/crmFlows'
import { fetchKanbans } from '../../lib/db/crmKanban'
import { CrmLoading } from './CrmDataStates'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass, CrmErrorBar } from './ui/CrmUi'
import { ChatActionsPanel } from './chat/ChatActionsPanel'
import { FluxoIniciando, type Partida } from './chat/FluxoIniciando'
import { AgendarMensagemModal } from './chat/AgendarMensagemModal'
import { Selecao } from '../ui/Selecao'
import { SemTelefone } from '../ui/Sensivel'
import { supabase } from '../../lib/supabaseClient'

// Caixa de entrada do atendimento: lista de conversas, a conversa escolhida e
// o painel de ações à direita. Tudo grava de verdade; o envio avisa quando a
// conexão não está pronta em vez de fingir que saiu.

const TABS: { key: ChatStatus; label: string }[] = [
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'atendendo', label: 'Atendendo' },
  { key: 'resolvido', label: 'Resolvidos' },
]

const FILTROS = [
  { key: 'tudo', label: 'Tudo' },
  { key: 'nao_lidas', label: 'Não lidas' },
  { key: 'nao_respondidas', label: 'Não respondidas' },
] as const

type FiltroKey = (typeof FILTROS)[number]['key']

export function ChatsSection({ clientId, currentUserName }: { clientId: string; currentUserName: string }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<ChatStatus>('aguardando')
  const [filtro, setFiltro] = useState<FiltroKey>('tudo')
  const [busca, setBusca] = useState('')
  const [filtros, setFiltros] = useState<FiltrosDeChat>(FILTROS_VAZIOS)
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [etiquetasOpen, setEtiquetasOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [fluxoOpen, setFluxoOpen] = useState(false)
  const [buscaFluxo, setBuscaFluxo] = useState('')
  const [painel, setPainel] = useState<null | 'acoes' | 'atribuicao'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fimDaConversa = useRef<HTMLDivElement>(null)

  // Mensagem chega pelo webhook, direto no banco — a tela não fica sabendo de
  // nada. Sem recarregar sozinha, o atendente só via a mensagem nova depois de
  // apertar F5, e "não está chegando" era o que parecia.
  //
  // HOJE QUEM AVISA É O BANCO, na hora (ver o efeito de tempo real logo
  // abaixo). Estes prazos deixaram de ser o jeito de descobrir novidade e
  // viraram REDE DE SEGURANÇA: websocket cai, aba dorme, wi-fi troca. Por isso
  // ficaram bem mais espaçados — antes eram 4s e 8s, e a maior parte dessas
  // consultas respondia "nada mudou".
  //
  // `refetchIntervalInBackground: false` evita continuar consultando quando a
  // aba está atrás de outra: o navegador não vai mostrar nada mesmo.
  const RECARGA_LISTA_MS = 30_000
  const RECARGA_CONVERSA_MS = 20_000

  const chatsQuery = useQuery({
    queryKey: ['crm-chats', clientId],
    queryFn: () => fetchChats(clientId),
    refetchInterval: RECARGA_LISTA_MS,
    refetchIntervalInBackground: false,
  })
  const connectionsQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const departmentsQuery = useQuery({ queryKey: ['crm-departments', clientId], queryFn: () => fetchDepartments(clientId) })
  const tagsQuery = useQuery({ queryKey: ['crm-tags', clientId], queryFn: () => fetchTags(clientId) })
  const flowsQuery = useQuery({ queryKey: ['crm-flows', clientId], queryFn: () => fetchFlows(clientId) })
  const repliesQuery = useQuery({ queryKey: ['crm-quick-replies', clientId], queryFn: () => fetchQuickReplies(clientId) })
  const kanbansQuery = useQuery({ queryKey: ['crm-kanbans', clientId], queryFn: () => fetchKanbans(clientId) })

  const filtrosAtivos = contarFiltros(filtros)

  const chats = chatsQuery.data ?? []
  const selected = chats.find((c) => c.id === selectedId) ?? null

  // A conversa aberta recarrega mais rápido que a lista: é onde a pessoa está
  // olhando, e é onde o atraso incomoda.
  const messagesQuery = useQuery({
    queryKey: ['crm-messages', selectedId],
    queryFn: () => fetchMessages(selectedId!),
    enabled: !!selectedId,
    refetchInterval: RECARGA_CONVERSA_MS,
    refetchIntervalInBackground: false,
  })
  const contatoQuery = useQuery({
    queryKey: ['crm-contato-da-conversa', selected?.contactId],
    queryFn: () => fetchContatoDaConversa(selected?.contactId ?? null),
    enabled: !!selected,
  })

  const invalidarChats = () => queryClient.invalidateQueries({ queryKey: ['crm-chats', clientId] })

  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  // ─── O BANCO AVISANDO, EM VEZ DA TELA PERGUNTANDO ───────────────────────
  //
  // O que isto resolve, na prática: a mensagem que VOCÊ manda pelo celular
  // aparece no computador na hora, e não daqui a alguns segundos. Era a queixa
  // — parecia que o computador estava atrasado em relação ao telefone. E vale
  // igual pra mensagem do cliente e pra mensagem que o fluxo manda sozinho.
  //
  // O aviso do Postgres traz a linha nova, mas aqui ele só serve de gatilho
  // pra buscar de novo. Enfiar a linha crua na lista significaria remontar no
  // navegador tudo o que a consulta já monta — mídia, remetente, prévia — e
  // duas montagens diferentes acabam divergindo. Buscar é uma consulta a mais
  // no instante em que ALGO ACONTECEU, e não a cada 4 segundos por educação.
  //
  // O tempo real do Supabase respeita RLS: cada cliente só é avisado das
  // linhas que já poderia ler.
  useEffect(() => {
    const canal = supabase
      .channel(`crm-ao-vivo-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_messages', filter: `client_id=eq.${clientId}` },
        (aviso) => {
          const chatDaLinha = (aviso.new as { chat_id?: string } | null)?.chat_id
          // Só recarrega a conversa aberta se o aviso for dela. Sem este
          // cuidado, cliente movimentado faria a tela buscar a conversa aberta
          // a cada mensagem de QUALQUER outra pessoa.
          if (chatDaLinha && chatDaLinha === selectedIdRef.current) {
            queryClient.invalidateQueries({ queryKey: ['crm-messages', chatDaLinha] })
          }
          queryClient.invalidateQueries({ queryKey: ['crm-chats', clientId] })
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_chats', filter: `client_id=eq.${clientId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['crm-chats', clientId] })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(canal)
    }
    // `selectedId` de propósito FORA das dependências: ele muda a cada clique
    // numa conversa, e refazer a inscrição a cada clique derrubaria e
    // levantaria o websocket o tempo todo — perdendo aviso no meio. Quem
    // carrega a conversa aberta é a referência abaixo, sempre atual.
  }, [clientId, queryClient])


  // Põe as conversas em dia sozinho, sem botão nenhum: ao abrir a tela e a
  // cada 5 minutos enquanto ela fica aberta.
  //
  // Não é redundante com o webhook. O WhatsApp não reentrega o que tentou
  // entregar enquanto a ponte estava fora do ar — sem esta varredura, tudo o
  // que chegou nesse intervalo sumia para sempre. Depois da primeira vez ela é
  // barata: o que já está gravado é pulado ANTES de baixar mídia.
  const SINCRONIA_MS = 5 * 60 * 1000

  useEffect(() => {
    let vivo = true
    const sincronizar = () => {
      // Aba escondida não precisa: ninguém está olhando, e cada atendente com
      // o CRM aberto seria uma varredura no WhatsApp.
      if (document.visibilityState !== 'visible') return
      syncConnections(clientId)
        .then(() => {
          // As conversas novas entram aos poucos, em segundo plano na ponte. A
          // recarga periódica da lista já as traz — isto só adianta a primeira.
          if (vivo) void queryClient.invalidateQueries({ queryKey: ['crm-chats', clientId] })
        })
        .catch(() => {
          // Falhar aqui não pode atrapalhar quem está atendendo: o que chega ao
          // vivo continua chegando pelo webhook.
        })
    }

    sincronizar()
    const timer = window.setInterval(sincronizar, SINCRONIA_MS)
    return () => {
      vivo = false
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Rola pro fim quando troca de conversa ou chega mensagem — ler atendimento
  // começando pelo topo de três meses atrás não serve a ninguém.
  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: 'end' })
  }, [selectedId, messagesQuery.data?.length])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return chats
      .filter((c) => c.status === tab)
      .filter((c) => {
        if (filtro === 'nao_lidas') return c.unreadCount > 0
        // "Não respondidas": a última mensagem foi do cliente e ninguém
        // respondeu — não é o mesmo que "sem responsável".
        if (filtro === 'nao_respondidas') return c.unreadCount > 0 || !c.assignedName
        return true
      })
      .filter((c) => (q ? `${c.contactName} ${c.phone ?? ''}`.toLowerCase().includes(q) : true))
      .filter((c) => passaNosFiltros(c, filtros))
  }, [chats, tab, filtro, busca, filtros])

  const enviar = useMutation({
    mutationFn: () => sendMessage(clientId, { chatId: selectedId!, body: draft.trim(), authorName: currentUserName }),
    onSuccess: (res) => {
      setDraft('')
      queryClient.invalidateQueries({ queryKey: ['crm-messages', selectedId] })
      invalidarChats()
      setErro(res.delivered ? null : res.detail)
    },
    onError: (e: Error) => setErro(e.message),
  })

  // Mover de fila pelas setas da lista. A regra de cada transição mora em
  // `moverStatusDoChat` — resolver grava quem resolveu, e sair de resolvido
  // precisa limpar isso.
  const moverFila = useMutation({
    mutationFn: (v: { chatId: string; atual: ChatStatus; direcao: 'avancar' | 'voltar' }) =>
      moverStatusDoChat(v.chatId, v.atual, v.direcao, currentUserName),
    onSuccess: (novo) => {
      invalidarChats()
      // Segue a conversa pra aba onde ela foi parar: sem isto ela "some" da
      // lista no instante em que muda de estado, e parece que se perdeu.
      if (novo) setTab(novo)
    },
    onError: (e: Error) => setErro(e.message),
  })

  const mudarChat = useMutation({
    mutationFn: (vars: Parameters<typeof updateChat>[1]) => updateChat(selectedId!, vars),
    onSuccess: invalidarChats,
  })
  const resolver = useMutation({
    mutationFn: () => resolverChat(selectedId!, currentUserName),
    onSuccess: invalidarChats,
  })
  const reabrir = useMutation({ mutationFn: () => reabrirChat(selectedId!), onSuccess: invalidarChats })
  // O aviso de partida vive DEPOIS que o menu fecha, e por isso mora aqui e
  // não dentro dele: fechar o menu era tudo que acontecia ao clicar num fluxo,
  // e quem clicava ficava sem saber se pegou.
  const [partida, setPartida] = useState<Partida | null>(null)

  const dispararAgora = useMutation({
    mutationFn: (fluxo: { id: string; name: string }) => {
      setPartida({ runId: null, flowName: fluxo.name })
      return dispararFluxo(clientId, { flowId: fluxo.id, chatId: selectedId!, triggeredByName: currentUserName })
    },
    onSuccess: (runId, fluxo) => {
      setFluxoOpen(false)
      setBuscaFluxo('')
      setPartida({ runId, flowName: fluxo.name })
      queryClient.invalidateQueries({ queryKey: ['crm-flow-runs', selectedId] })
    },
    onError: (e, fluxo) => {
      setFluxoOpen(false)
      setPartida({ runId: null, flowName: fluxo.name, erro: (e as Error).message })
    },
  })

  function abrirConversa(chat: CrmChat) {
    setSelectedId(chat.id)
    setPainel(null)
    setErro(null)
    if (chat.unreadCount > 0) markChatRead(chat.id).then(invalidarChats)
  }

  // UMA CONVERSA PEDIDA PELA URL: ?conversa=<id>
  //
  // É por aqui que a busca de leads desemboca no atendimento. Ela acha (ou cria) a
  // conversa do lead e navega pra cá com o id; sem isto o clique cairia na
  // caixa de entrada genérica e quem busca leads teria que caçar o contato na
  // lista — o atrito que o link do WhatsApp justamente não tinha, e o motivo
  // pelo qual era mais fácil sair do produto do que usar o CRM.
  //
  // TROCA A ABA junto: uma conversa já resolvida abriria no painel e não
  // apareceria na lista ao lado, dando a impressão de ter aberto a errada.
  //
  // O parâmetro sai da URL depois de usado. Ficando lá, um F5 (ou o voltar do
  // navegador) reabriria essa conversa por cima da que a pessoa estivesse
  // lendo, sem nada explicando o pulo.
  const conversaPedida = searchParams.get('conversa')
  useEffect(() => {
    if (!conversaPedida) return
    // A lista pode não ter chegado ainda: sem o chat em mãos não dá pra saber
    // a aba dele. Sair sem limpar o parâmetro é de propósito — o efeito roda
    // de novo quando `chats` mudar.
    const chat = chats.find((c) => c.id === conversaPedida)
    if (!chat) return
    abrirConversa(chat)
    setTab(chat.status)
    setSearchParams(
      (atuais) => {
        const proximos = new URLSearchParams(atuais)
        proximos.delete('conversa')
        return proximos
      },
      { replace: true },
    )
    // `abrirConversa` e `setSearchParams` trocam de identidade a cada render;
    // pô-los aqui faria o efeito rodar em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaPedida, chats])

  // O aviso de partida é DAQUELA pessoa. Trocar de conversa com ele na tela
  // faria a próxima parecer que está recebendo um fluxo que não é dela — e é
  // exatamente o tipo de coisa que leva alguém a disparar de novo, no contato
  // errado. Ver `partida` e FluxoIniciando.
  useEffect(() => setPartida(null), [selectedId])

  const fluxos = (flowsQuery.data ?? []).map((f) => ({ id: f.id, name: f.name }))
  const fluxosFiltrados = fluxos.filter((f) => f.name.toLowerCase().includes(buscaFluxo.trim().toLowerCase()))

  if (chatsQuery.isLoading) return <CrmLoading />

  return (
    <div className="flex h-full min-h-0">
      {/* ══ Coluna 1: lista de conversas ═════════════════════════════════ */}
      {/* NO CELULAR AS DUAS COLUNAS SE REVEZAM.
          Não cabem lado a lado em 390px, e a conversa era simplesmente
          `hidden` — escolher alguém na lista não mostrava nada, o que faz o
          chat inteiro parecer quebrado num telefone. A partir de `md` as duas
          voltam a conviver e nada muda pra quem usa no computador. */}
      <div
        className={`w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-80 ${
          selected ? 'hidden' : 'flex'
        }`}
      >
        <div className="shrink-0 space-y-2.5 border-b border-line-soft p-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="Buscar chats..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {/* O número diz quantos critérios estão valendo. Sem ele, um
                filtro esquecido faz a lista parecer vazia sem explicação. */}
            <button
              type="button"
              onClick={() => setFiltrosOpen(true)}
              aria-label="Filtros de chat"
              aria-pressed={filtrosAtivos > 0}
              className={`relative shrink-0 rounded-lg border p-2 transition-colors ${
                filtrosAtivos > 0
                  ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                  : 'border-line text-ink-4 hover:text-ink-2'
              }`}
            >
              <Filter size={14} />
              {filtrosAtivos > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {filtrosAtivos}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              aria-label="Nova conversa"
              className="shrink-0 rounded-lg p-2 text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filtro === f.key ? 'text-white' : 'border border-line text-ink-3 hover:text-ink'
                }`}
                style={filtro === f.key ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                {f.label}
              </button>
            ))}
            {filtrosAtivos > 0 && (
              <button
                type="button"
                onClick={() => setFiltros(FILTROS_VAZIOS)}
                className="ml-auto flex items-center gap-1 text-[11px] text-ink-4 hover:text-ink-2"
              >
                <RotateCcw size={11} /> limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 border-b border-line-soft">
          {TABS.map((t) => {
            const n = chats.filter((c) => c.status === t.key).length
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors ${
                  tab === t.key ? 'border-[var(--accent)] text-ink' : 'border-transparent text-ink-4 hover:text-ink-2'
                }`}
              >
                {t.label}
                {n > 0 && <span className="ml-1 tabular-nums text-ink-4">{n}</span>}
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visiveis.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-ink-4">
              {chats.length === 0
                ? 'Nenhuma conversa ainda. Elas aparecem aqui quando chega mensagem na conexão.'
                : 'Nenhuma conversa com esses filtros.'}
            </p>
          ) : (
            visiveis.map((c) => (
              <ItemDaLista
                key={c.id}
                chat={c}
                ativo={c.id === selectedId}
                onAbrir={() => abrirConversa(c)}
                movendo={moverFila.isPending && moverFila.variables?.chatId === c.id}
                onMover={(direcao) => moverFila.mutate({ chatId: c.id, atual: c.status, direcao })}
              />
            ))
          )}
        </div>
      </div>

      {/* ══ Coluna 2: a conversa ═════════════════════════════════════════ */}
      <div className={`min-w-0 flex-1 flex-col md:flex ${selected ? 'flex' : 'hidden'}`}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-4">
            <MessagesSquare size={26} />
            <p className="text-sm">Escolha uma conversa à esquerda</p>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
              {/* A VOLTA PRA LISTA, só no celular.
                  Ali as duas colunas se revezam, e sem esta seta a conversa
                  vira um beco: a lista some e não há como escolher outra
                  pessoa sem recarregar a página. No computador a lista está do
                  lado, e a seta seria só ruído. */}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Voltar para a lista de conversas"
                className="press -ml-1 shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink md:hidden"
              >
                <ChevronLeft size={18} />
              </button>
              {/* Clicar no contato abre o painel já na atribuição — é o
                  caminho mais curto pra "quem cuida desta conversa?". */}
              <button
                type="button"
                onClick={() => setPainel('atribuicao')}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left hover:bg-surface-2"
                title="Abrir atribuição do chat"
              >
                {/* Duas camadas de propósito: o recorte redondo mora na camada
                    de DENTRO, e a bolinha de status fica na de fora. Com as
                    duas juntas, o `overflow-hidden` que arredonda a foto também
                    cortava a bolinha pela metade. */}
                <span className="relative shrink-0">
                  <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-[11px] font-semibold text-ink-3">
                    {selected.avatarUrl ? (
                      <img src={selected.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      selected.contactName.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span
                    title={
                      selected.status === 'resolvido'
                        ? 'Resolvido'
                        : selected.unreadCount > 0
                          ? 'Mensagens não lidas'
                          : 'Em atendimento'
                    }
                    className={`absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--app-bg)] ${
                      selected.status === 'resolvido' ? 'bg-ok' : selected.unreadCount > 0 ? 'bg-danger' : 'bg-warn'
                    }`}
                  />
                </span>
                {/* Uma linha só. O telefone e o responsável ficam no painel de
                    ações, a um clique daqui — repetir tudo no topo enchia a
                    faixa e ainda competia com o nome. */}
                <span className="min-w-0 truncate text-sm font-semibold text-ink">
                  {selected.contactName}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-1.5">
                <BotaoIcone
                  rotulo="Atribuir chat"
                  destaque
                  onClick={() => setPainel('atribuicao')}
                  icone={UserPlus}
                />
                <BotaoIcone rotulo="Agendar mensagem" onClick={() => setAgendaOpen(true)} icone={CalendarDays} />
                <div className="relative">
                  <BotaoIcone rotulo="Disparar fluxo" onClick={() => setFluxoOpen((v) => !v)} icone={Workflow} />
                  {fluxoOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-line bg-surface-solid p-3 shadow-xl">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                        <Workflow size={13} /> Disparar fluxo
                      </p>
                      <div className="relative">
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
                        <input
                          autoFocus
                          className={`${inputClass} pl-8`}
                          placeholder="Digite o nome do fluxo..."
                          value={buscaFluxo}
                          onChange={(e) => setBuscaFluxo(e.target.value)}
                        />
                      </div>
                      <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-line bg-canvas">
                        {fluxosFiltrados.length === 0 ? (
                          <p className="px-3 py-2.5 text-xs text-ink-4">
                            {fluxos.length === 0 ? 'Nenhum fluxo criado ainda.' : 'Nenhum fluxo com esse nome.'}
                          </p>
                        ) : (
                          fluxosFiltrados.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              // Travado durante o disparo: sem resposta na
                              // tela, o reflexo é clicar de novo — e cada
                              // clique é um atendimento a mais no celular da
                              // pessoa do outro lado.
                              disabled={dispararAgora.isPending}
                              onClick={() => dispararAgora.mutate(f)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs uppercase text-ink-2 hover:bg-surface-2 disabled:opacity-50"
                            >
                              {dispararAgora.isPending && dispararAgora.variables?.id === f.id ? (
                                <Loader2 size={12} className="shrink-0 animate-spin text-ink-4" />
                              ) : (
                                <Zap size={12} className="shrink-0 text-ink-4" />
                              )}
                              <span className="truncate">{f.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {selected.status === 'resolvido' ? (
                  <BotaoIcone rotulo="Reabrir conversa" onClick={() => reabrir.mutate()} icone={RotateCcw} />
                ) : (
                  <BotaoIcone rotulo="Marcar como resolvido" onClick={() => resolver.mutate()} icone={CheckCircle2} />
                )}
              </div>
            </header>

            {/* Barra de etiquetas. Uma faixa só, com o seletor escondido atrás
                do ícone à direita: o `<select>` sempre visível ocupava um terço
                da faixa escrevendo "+ etiqueta" mesmo quando ninguém ia usar. */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line-soft px-4 py-2">
              <div className="flex min-h-[26px] min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {selected.tags.length === 0 ? (
                  <span className="text-[11px] text-ink-4">Sem etiquetas</span>
                ) : (
                  selected.tags.map((t) => (
                    <span
                      key={t}
                      className="group flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => mudarChat.mutate({ tags: selected.tags.filter((x) => x !== t) })}
                        aria-label={`Remover etiqueta ${t}`}
                        title="Remover etiqueta"
                        className="text-ink-4 hover:text-danger-ink"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setEtiquetasOpen((v) => !v)}
                  aria-label="Adicionar etiqueta"
                  title="Adicionar etiqueta"
                  className={`rounded-lg p-1.5 transition-colors hover:bg-surface-2 hover:text-ink-2 ${
                    etiquetasOpen ? 'bg-surface-2 text-ink-2' : 'text-ink-4'
                  }`}
                >
                  <Tag size={14} />
                </button>

                {etiquetasOpen && (
                  <>
                    <span className="fixed inset-0 z-10" onClick={() => setEtiquetasOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-line bg-surface-solid shadow-lg">
                      {(() => {
                        const livres = (tagsQuery.data ?? []).filter((t) => !selected.tags.includes(t.name))
                        if ((tagsQuery.data ?? []).length === 0) {
                          return (
                            <p className="px-3 py-2.5 text-[11px] text-ink-4">
                              Nenhuma etiqueta criada. Crie em Configurações → Etiquetas.
                            </p>
                          )
                        }
                        if (livres.length === 0) {
                          return <p className="px-3 py-2.5 text-[11px] text-ink-4">Todas as etiquetas já estão nesta conversa.</p>
                        }
                        return (
                          <div className="max-h-56 overflow-y-auto">
                            {livres.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  mudarChat.mutate({ tags: [...selected.tags, t.name] })
                                  setEtiquetasOpen(false)
                                }}
                                className="block w-full border-b border-line-soft px-3 py-2 text-left text-xs text-ink-2 last:border-b-0 hover:bg-surface-2"
                              >
                                {t.name}
                              </button>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* O aviso de que o fluxo está começando NESTA pessoa. Fica logo
                acima da conversa, que é onde o resultado dele vai aparecer —
                num canto da tela seria só mais uma notificação a ignorar. */}
            {partida && (
              <div className="shrink-0 px-4 pt-2">
                <FluxoIniciando partida={partida} aoFechar={() => setPartida(null)} />
              </div>
            )}

            {messagesQuery.isLoading ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <CrmLoading />
              </div>
            ) : (messagesQuery.data ?? []).length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                <p className="text-center text-xs text-ink-4">Nenhuma mensagem nesta conversa ainda.</p>
              </div>
            ) : (
              <Conversa
                mensagens={messagesQuery.data ?? []}
                avatarUrl={selected.avatarUrl}
                nomeDoContato={selected.contactName}
                fimRef={fimDaConversa}
              />
            )}

            {erro && (
              <div className="shrink-0 px-4 pb-2">
                <CrmErrorBar message={erro} />
              </div>
            )}

            {/* `respiro-do-dock` afasta o campo do dock flutuante, e SÓ onde o
                dock existe: a lista ao lado pode passar por baixo do vidro sem
                prejuízo, mas quem digita não tem pra onde rolar. Ver a classe
                em index.css. */}
            <div className="shrink-0 border-t border-line respiro-do-dock px-4 pt-3">
              <BarraDeAcoes
                clientId={clientId}
                chatId={selected.id}
                texto={draft}
                onLimparTexto={() => setDraft('')}
                onInserirNoTexto={(trecho) => setDraft((t) => (t ? `${t}${trecho}` : trecho))}
                tagsDoChat={selected.tags}
                tagsDisponiveis={tagsQuery.data ?? []}
                respostasRapidas={repliesQuery.data ?? []}
                onEscolherResposta={setDraft}
                onErro={setErro}
                onEnviado={() => {
                  void queryClient.invalidateQueries({ queryKey: ['crm-messages', selected.id] })
                  void queryClient.invalidateQueries({ queryKey: ['crm-chats', clientId] })
                }}
                desabilitado={selected.connectionId == null}
                motivoDesabilitado="Esta conversa não tem conexão de WhatsApp escolhida."
              />

              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  className={`${inputClass} max-h-32 min-h-[42px] flex-1 resize-none py-2.5 leading-relaxed`}
                  placeholder="Digite sua mensagem..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
                      e.preventDefault()
                      enviar.mutate()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => enviar.mutate()}
                  disabled={!draft.trim() || enviar.isPending}
                  aria-label="Enviar mensagem"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg text-white transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══ Coluna 3: painel de ações ════════════════════════════════════ */}
      {selected && painel && (
        <ChatActionsPanel
          clientId={clientId}
          chat={selected}
          contato={contatoQuery.data ?? null}
          departamentos={(departmentsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
          fluxos={fluxos}
          usuarioAtual={currentUserName}
          focoAtribuicao={painel === 'atribuicao'}
          onClose={() => setPainel(null)}
          onChatMudou={invalidarChats}
          onChatApagado={() => {
            setPainel(null)
            setSelectedId(null)
            invalidarChats()
          }}
        />
      )}

      {selected && (
        <AgendarMensagemModal
          open={agendaOpen}
          clientId={clientId}
          chatId={selected.id}
          // A resposta rápida virou uma LISTA de conteúdos. O agendamento só
          // sabe mandar texto, então oferece as que têm texto — mandar meia
          // resposta na hora marcada seria pior que não oferecer.
          respostasRapidas={(repliesQuery.data ?? [])
            .map((r) => ({
              id: r.id,
              title: r.shortcut,
              body: r.items
                .filter((i) => i.text?.trim())
                .map((i) => i.text!.trim())
                .join('\n\n'),
            }))
            .filter((r) => r.body)}
          fluxos={fluxos}
          usuarioAtual={currentUserName}
          onClose={() => setAgendaOpen(false)}
        />
      )}

      {filtrosOpen && (
        <FiltrosDeChatModal
          atuais={filtros}
          conexoes={(connectionsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status }))}
          departamentos={(departmentsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
          etiquetas={tagsQuery.data ?? []}
          kanbans={(kanbansQuery.data ?? []).map((k) => ({ id: k.id, name: k.name }))}
          onAplicar={(f) => {
            setFiltros(f)
            setFiltrosOpen(false)
          }}
          onClose={() => setFiltrosOpen(false)}
        />
      )}

      <NovaConversaModal
        open={novoOpen}
        clientId={clientId}
        conexoes={(connectionsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        onClose={() => setNovoOpen(false)}
        onCriado={(chat) => {
          invalidarChats()
          setTab(chat.status)
          setSelectedId(chat.id)
        }}
      />
    </div>
  )
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function BotaoIcone({
  icone: Icone,
  rotulo,
  destaque,
  onClick,
}: {
  icone: typeof UserPlus
  rotulo: string
  destaque?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={`rounded-lg p-2 transition-colors ${destaque ? 'text-white' : 'text-ink-4 hover:bg-surface-2 hover:text-ink-2'}`}
      style={destaque ? { backgroundColor: 'var(--accent)' } : undefined}
    >
      <Icone size={15} />
    </button>
  )
}

/**
 * "14:08" só serve pra hoje. Uma conversa de terça mostrando 14:08 faz
 * parecer recente — o dia é a informação que falta.
 */
function quandoFoi(iso: string | null): string {
  if (!iso) return ''
  const data = new Date(iso)
  const agora = new Date()
  const dia = 24 * 60 * 60 * 1000
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()

  if (data.getTime() >= inicioDeHoje) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  if (data.getTime() >= inicioDeHoje - dia) return 'Ontem'
  if (data.getTime() >= inicioDeHoje - 6 * dia) {
    return data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  }
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const ROTULO_DO_STATUS: Record<ChatStatus, string> = {
  aguardando: 'Aguardando',
  atendendo: 'Atendendo',
  resolvido: 'Resolvido',
}

function ItemDaLista({
  chat,
  ativo,
  onAbrir,
  onMover,
  movendo,
}: {
  chat: CrmChat
  ativo: boolean
  onAbrir: () => void
  onMover: (direcao: 'avancar' | 'voltar') => void
  movendo: boolean
}) {
  const naoLida = chat.unreadCount > 0
  const i = ORDEM_DOS_STATUS.indexOf(chat.status)
  const anterior = ORDEM_DOS_STATUS[i - 1]
  const proximo = ORDEM_DOS_STATUS[i + 1]

  // Um <div> e não um <button>: as setas são botões, e botão dentro de botão é
  // HTML inválido — o navegador desmonta a árvore e o clique vira loteria.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-3 border-b border-line-soft px-3 py-2.5 text-left transition-colors ${
        ativo ? 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]' : 'hover:bg-surface-2'
      }`}
    >
      {/* A foto de perfil é o ROSTO de um cliente real, puxado do WhatsApp.
          Borrar o nome e deixar a cara aparecendo não esconde ninguém. */}
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-xs font-semibold text-ink-3">
        {chat.avatarUrl ? (
          <img src={chat.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          chat.contactName.slice(0, 2).toUpperCase()
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {/* Nome de quem mandou mensagem: cliente real, com telefone real. É
              o que mais aparece numa demonstração do CRM. */}
          <span
            className={`min-w-0 flex-1 truncate text-sm ${naoLida ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}
          >
            {chat.contactName}
          </span>
          {/* A hora fica no alto à direita e o contador embaixo: empilhados na
              mesma linha eles disputavam o espaço da prévia. */}
          <span className={`shrink-0 text-[10.5px] tabular-nums ${naoLida ? 'text-[var(--accent-ink)]' : 'text-ink-4'}`}>
            {quandoFoi(chat.lastMessageAt)}
          </span>
        </span>

        <span className="mt-1 flex items-center gap-2">
          {/* A prévia é o TEXTO da conversa. Num print real dela saiu um
              "Chegou atendimento novo de +55 21 9992…": telefone inteiro, na
              lista, ao lado de um nome que eu já tinha borrado. */}
          <span className={`min-w-0 flex-1 truncate text-xs ${naoLida ? 'text-ink-2' : 'text-ink-4'}`}>
            <SemTelefone>{chat.lastMessagePreview ?? 'Sem mensagens'}</SemTelefone>
          </span>
          {naoLida && (
            <span
              className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </span>

        <span className="mt-1 flex items-center gap-1.5">
          {/* Mover a conversa de fila sem precisar abri-la: é a ação mais
              repetida do dia, e abrir só pra mudar o estado custa dois cliques
              e uma rolagem de volta. */}
          <span className="flex shrink-0 items-center gap-0.5">
            <BotaoDeFila
              direcao="voltar"
              destino={anterior}
              atual={chat.status}
              desabilitado={!anterior || movendo}
              onMover={onMover}
            />
            <BotaoDeFila
              direcao="avancar"
              destino={proximo}
              atual={chat.status}
              desabilitado={!proximo || movendo}
              onMover={onMover}
            />
          </span>

          {/* O nome da conexão é o número/pessoa que atende: identifica quem
              trabalha no cliente, e aparece repetido em toda a lista. */}
          {chat.connectionName && (
            <span className="truncate text-[10px] text-ink-4">
              <SemTelefone>{chat.connectionName}</SemTelefone>
            </span>
          )}
          {chat.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="shrink-0 rounded-full px-1.5 py-px text-[9.5px] text-[var(--accent-ink)] ring-1 ring-[color-mix(in_oklab,var(--accent)_35%,transparent)]"
            >
              {t}
            </span>
          ))}
        </span>
      </span>
    </div>
  )
}

function BotaoDeFila({
  direcao,
  destino,
  atual,
  desabilitado,
  onMover,
}: {
  direcao: 'avancar' | 'voltar'
  destino: ChatStatus | undefined
  atual: ChatStatus
  desabilitado: boolean
  onMover: (direcao: 'avancar' | 'voltar') => void
}) {
  const Icone = direcao === 'avancar' ? ChevronRight : ChevronLeft
  return (
    <button
      type="button"
      // Sem isto o clique sobe pro item e ABRE a conversa junto — a pessoa
      // move de fila e é jogada pra dentro do chat sem pedir.
      onClick={(e) => {
        e.stopPropagation()
        if (!desabilitado) onMover(direcao)
      }}
      disabled={desabilitado}
      aria-label={destino ? `Mover para ${ROTULO_DO_STATUS[destino]}` : `Já está em ${ROTULO_DO_STATUS[atual]}`}
      title={destino ? `Mover para ${ROTULO_DO_STATUS[destino]}` : `Já está em ${ROTULO_DO_STATUS[atual]}`}
      className="rounded border border-line px-1 py-px text-ink-4 transition-colors hover:border-line-strong hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icone size={11} />
    </button>
  )
}

function NovaConversaModal({
  open,
  clientId,
  conexoes,
  onClose,
  onCriado,
}: {
  open: boolean
  clientId: string
  conexoes: { id: string; name: string }[]
  onClose: () => void
  onCriado: (chat: CrmChat) => void
}) {
  const [form, setForm] = useState({ contactName: '', phone: '', connectionId: '' })
  const criar = useMutation({
    mutationFn: () =>
      createChat(clientId, {
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        connectionId: form.connectionId || null,
      }),
    onSuccess: (chat) => {
      onCriado(chat)
      setForm({ contactName: '', phone: '', connectionId: '' })
      onClose()
    },
  })

  return (
    <CrmModal
      open={open}
      title="Nova conversa"
      icon={<MessagesSquare size={15} />}
      description="Abre a conversa aqui. O envio depende da conexão estar ligada."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => criar.mutate()}
            disabled={!form.contactName.trim() || criar.isPending}
            className={`${primaryButtonClass} disabled:opacity-40`}
          >
            Criar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="Nome do contato *">
          <input className={inputClass} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        </CrmField>
        <CrmField label="Telefone">
          <input
            className={inputClass}
            placeholder="(67) 90000-0000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </CrmField>
        <CrmField label="Conexão">
          <Selecao className={inputClass} value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })}>
            <option value="">Sem conexão</option>
            {conexoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
        {criar.isError && <p className="text-xs text-danger-ink">{(criar.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

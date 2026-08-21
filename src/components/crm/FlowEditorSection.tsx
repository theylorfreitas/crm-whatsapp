import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Check, Pause, Play, Archive, Search, Wand2, MessageSquare } from 'lucide-react'
import { fetchFlow, updateFlow, fetchFlows } from '../../lib/db/crmFlows'
import { fetchTemplates, fetchDepartments, fetchTags, fetchProducts, fetchGlobalVariables } from '../../lib/db/crmSettings'
import { fetchKanbans, fetchKanbanColumns } from '../../lib/db/crmKanban'
import { fetchMembers } from '../../lib/db/workspaceExtras'
import { FLOW_BLOCK_SPECS, newBlock, blockSpec, type FlowBlock, type FlowGraph, type FlowBlockKind } from '../../types/crmFlow'
import { FlowCanvas, IconeDoBloco } from './flow/FlowCanvas'
import { SimuladorDeFluxo } from './flow/SimuladorDeFluxo'
import { FlowBlockEditor } from './flow/FlowBlockEditor'
import { CrmLoading } from './CrmDataStates'
import { SinalDaAutomacao } from './SinalDaAutomacao'
import { ghostButtonClass, CrmErrorBar, CrmNoticeBar, CrmConfirmarExclusao } from './ui/CrmUi'

// Editor de um fluxo: paleta de blocos à esquerda, canvas no meio, campos do
// bloco selecionado à direita. O desenho vai pro banco SOZINHO, pouco depois
// de cada alteração — o indicador no topo diz em que pé está.

export function FlowEditorSection({
  clientId,
  flowId,
  onBack,
}: {
  clientId: string
  flowId: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const flowQuery = useQuery({ queryKey: ['crm-flow', flowId], queryFn: () => fetchFlow(flowId) })

  const [graph, setGraph] = useState<FlowGraph | null>(null)
  // Paleta fechada por padrão: o canvas é o assunto, e ela abre no botão.
  const [paletaAberta, setPaletaAberta] = useState(false)
  const [simularAberto, setSimularAberto] = useState(false)
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  /** O que está esperando confirmação pra sumir. Ver `pedirParaApagarBloco`. */
  const [apagando, setApagando] = useState<{ tipo: 'bloco' | 'ligacao'; id: string } | null>(null)
  /** Quando o auto-save gravou pela última vez. Null = nada gravado ainda. */
  const [salvoEm, setSalvoEm] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Carrega o desenho do banco uma vez; a partir daí quem manda é o estado
  // local, até salvar.
  useEffect(() => {
    if (flowQuery.data && graph === null) {
      setGraph(flowQuery.data.graph)
      setName(flowQuery.data.name)
    }
  }, [flowQuery.data, graph])

  const templatesQuery = useQuery({ queryKey: ['crm-templates', clientId], queryFn: () => fetchTemplates(clientId) })
  const tagsQuery = useQuery({ queryKey: ['crm-tags', clientId], queryFn: () => fetchTags(clientId) })
  const departmentsQuery = useQuery({ queryKey: ['crm-departments', clientId], queryFn: () => fetchDepartments(clientId) })
  const flowsQuery = useQuery({ queryKey: ['crm-flows', clientId], queryFn: () => fetchFlows(clientId) })
  const kanbansQuery = useQuery({ queryKey: ['crm-kanbans', clientId], queryFn: () => fetchKanbans(clientId) })
  const membersQuery = useQuery({ queryKey: ['workspace-members', clientId], queryFn: () => fetchMembers(clientId) })
  const produtosQuery = useQuery({ queryKey: ['crm-products', clientId], queryFn: () => fetchProducts(clientId) })
  // As chaves de IA moram aqui: cadastrar uma vez em Variáveis Globais e
  // referenciar em todos os blocos evita repetir a chave em cada fluxo — e
  // trocar a chave depois vira um lugar só.
  const globaisQuery = useQuery({ queryKey: ['crm-global-variables', clientId], queryFn: () => fetchGlobalVariables(clientId) })

  // Colunas de todos os quadros, achatadas. Ainda não vão pro editor (o bloco
  // de Kanban escolhe o QUADRO; a coluna é decidida na execução), mas a
  // consulta fica porque a próxima etapa do bloco usa.
  void useQuery({
    queryKey: ['crm-kanban-columns-all', clientId, (kanbansQuery.data ?? []).map((k) => k.id).join(',')],
    queryFn: async () => {
      const boards = kanbansQuery.data ?? []
      const all = await Promise.all(
        boards.map(async (b) => (await fetchKanbanColumns(b.id)).map((c) => ({ id: c.id, name: c.name, kanbanName: b.name }))),
      )
      return all.flat()
    },
    enabled: (kanbansQuery.data ?? []).length > 0,
  })

  const saveMutation = useMutation({
    mutationFn: () => updateFlow(flowId, { name: name.trim(), graph: graph! }),
    onSuccess: () => {
      setDirty(false)
      setSalvoEm(new Date())
      queryClient.invalidateQueries({ queryKey: ['crm-flows', clientId] })
      queryClient.invalidateQueries({ queryKey: ['crm-flow', flowId] })
    },
    onError: (e: Error) => setError(e.message),
  })

  // ─── AUTO-SAVE ──────────────────────────────────────────────────────────
  //
  // Antes, o desenho só existia na memória da aba até alguém apertar "Salvar
  // alterações". Meia hora montando a conversa e um F5 — ou a aba caindo, ou o
  // navegador atualizando sozinho — levava tudo. E o pior é que a tela não
  // dava sinal nenhum: parecia salvo.
  //
  // A espera existe porque arrastar um bloco dispara uma alteração por PIXEL.
  // Salvar a cada uma seria centenas de escritas por arrasto. O relógio
  // reinicia a cada mudança, então ele grava quando a pessoa PARA — que é
  // quando ela terminou de pensar.
  const ESPERA_DO_AUTOSAVE_MS = 900
  const { mutate: salvar, isPending: salvando } = saveMutation

  useEffect(() => {
    // Enquanto uma gravação está no ar, não começa outra: a de agora já vai
    // levar o estado mais novo, e duas ao mesmo tempo podem chegar fora de
    // ordem e gravar o desenho velho por cima do novo. Quando ela termina,
    // `salvando` vira false, este efeito roda de novo e o que sobrou de
    // pendente é gravado.
    if (!dirty || !graph || salvando) return
    const relogio = setTimeout(() => salvar(), ESPERA_DO_AUTOSAVE_MS)
    return () => clearTimeout(relogio)
  }, [dirty, graph, name, salvando, salvar])

  // O aviso do navegador, pra alteração que ainda não chegou ao banco. Só
  // aparece na janela entre a última tecla e a gravação — segundos —, mas é
  // exatamente aí que um Ctrl+W custaria o trabalho todo.
  useEffect(() => {
    if (!dirty) return
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aoSair)
    return () => window.removeEventListener('beforeunload', aoSair)
  }, [dirty])

  const statusMutation = useMutation({
    mutationFn: (status: 'ativo' | 'pausado' | 'arquivado') => updateFlow(flowId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-flow', flowId] })
      queryClient.invalidateQueries({ queryKey: ['crm-flows', clientId] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const emEdicao = graph?.nodes.find((n) => n.id === editando) ?? null

  const palette = useMemo(
    () => FLOW_BLOCK_SPECS.filter((s) => s.label.toLowerCase().includes(search.trim().toLowerCase())),
    [search],
  )

  function addBlock(kind: FlowBlockKind) {
    if (!graph) return
    // Coloca o bloco novo à direita do último, em diagonal, pra não empilhar
    // tudo no mesmo ponto.
    const last = graph.nodes[graph.nodes.length - 1]
    const block = newBlock(kind, last ? last.x + 240 : 60, last ? last.y + 40 : 60)
    setGraph({ ...graph, nodes: [...graph.nodes, block] })
    setSelectedId(block.id)
    setDirty(true)
  }

  /** Copia o bloco ao lado, com identidade nova. Refazer um menu de oito
   *  opções só pra mudar uma frase era o caminho mais comum de desistir. */
  function duplicarBloco(id: string) {
    if (!graph) return
    const original = graph.nodes.find((n) => n.id === id)
    if (!original) return
    // `newBlock` só serve pro id e pelas coordenadas; o conteúdo vem do
    // original, em cópia profunda pra editar a cópia não mexer no primeiro.
    const copia: FlowBlock = {
      ...structuredClone(original),
      id: newBlock(original.kind, 0, 0).id,
      x: original.x + 40,
      y: original.y + 40,
    }
    setGraph({ ...graph, nodes: [...graph.nodes, copia] })
    setSelectedId(copia.id)
    setDirty(true)
  }

  function updateBlock(next: FlowBlock) {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map((n) => (n.id === next.id ? next : n)) })
    setDirty(true)
  }

  function moveBlock(id: string, x: number, y: number) {
    if (!graph) return
    setGraph({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) })
    setDirty(true)
  }

  /**
   * Apagar bloco PERGUNTA antes, sempre.
   *
   * Este editor grava sozinho: o bloco apagado está no banco no segundo
   * seguinte, e não há Ctrl+Z que traga de volta um bloco com o texto todo
   * escrito dentro. A lixeira fica a um pixel do lápis.
   */
  function pedirParaApagarBloco(id: string) {
    setApagando({ tipo: 'bloco', id })
  }

  function apagarBloco(id: string) {
    if (!graph) return
    setGraph({
      nodes: graph.nodes.filter((n) => n.id !== id),
      // As ligações que entravam ou saíam dele vão junto: aresta apontando pra
      // um bloco que não existe mais é um fluxo que morre no meio, sem erro.
      edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
    })
    if (selectedId === id) setSelectedId(null)
    setDirty(true)
  }

  function connect(from: string, fromPort: string, to: string) {
    if (!graph) return
    // Uma porta liga em um destino só: reconectar substitui a ligação antiga.
    const edges = graph.edges.filter((e) => !(e.from === from && e.fromPort === fromPort))
    setGraph({
      ...graph,
      edges: [...edges, { id: `e_${Math.random().toString(36).slice(2, 10)}`, from, fromPort, to }],
    })
    setDirty(true)
  }

  function pedirParaApagarLigacao(id: string) {
    setApagando({ tipo: 'ligacao', id })
  }

  function apagarLigacao(id: string) {
    if (!graph) return
    setGraph({ ...graph, edges: graph.edges.filter((e) => e.id !== id) })
    setDirty(true)
  }

  /** O que a confirmação diz, conforme o que está prestes a sumir. */
  function textoDaExclusao(): { titulo: string; pergunta: React.ReactNode } {
    if (apagando?.tipo === 'ligacao') {
      return {
        titulo: 'Excluir ligação',
        pergunta: 'Tem certeza que deseja excluir esta ligação? O bloco de origem fica sem saída por esse caminho.',
      }
    }
    const bloco = graph?.nodes.find((n) => n.id === apagando?.id)
    const nome = bloco?.title || (bloco ? blockSpec(bloco.kind).label : 'este bloco')
    const ligacoes = graph?.edges.filter((e) => e.from === apagando?.id || e.to === apagando?.id).length ?? 0
    return {
      titulo: 'Excluir bloco',
      pergunta: (
        <>
          Tem certeza que deseja excluir o bloco “<strong className="font-semibold text-ink">{nome}</strong>”?
          {ligacoes > 0 && (
            <>
              {' '}
              {ligacoes === 1 ? 'A ligação dele' : `As ${ligacoes} ligações dele`} também some
              {ligacoes === 1 ? '' : 'm'}.
            </>
          )}
        </>
      ),
    }
  }

  if (flowQuery.isLoading || !graph) return <CrmLoading />
  if (flowQuery.isError) {
    return (
      <div className="p-6">
        <CrmErrorBar message="Não deu pra carregar este fluxo." />
        <button type="button" onClick={onBack} className={ghostButtonClass}>
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    )
  }

  const status = flowQuery.data?.status ?? 'ativo'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <button type="button" onClick={onBack} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" aria-label="Voltar">
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
          className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm font-semibold text-ink hover:border-line focus:border-line-strong focus:outline-none"
        />
        <span className="text-[11px] text-ink-4">
          {graph.nodes.length} {graph.nodes.length === 1 ? 'bloco' : 'blocos'}
        </span>
        {/* AO LADO DE "Pausar", de propósito. Aquele botão diz se o fluxo está
            ligado; este sinal diz se ele tem como receber. As duas coisas se
            confundem justamente aqui, com o fluxo ativo e o canal mudo. */}
        <SinalDaAutomacao clientId={clientId} />
        <button
          type="button"
          onClick={() => statusMutation.mutate(status === 'ativo' ? 'pausado' : 'ativo')}
          className={ghostButtonClass}
        >
          {status === 'ativo' ? (
            <>
              <Pause size={14} /> Pausar
            </>
          ) : (
            <>
              <Play size={14} /> Ativar
            </>
          )}
        </button>
        <button type="button" onClick={() => statusMutation.mutate('arquivado')} className={ghostButtonClass}>
          <Archive size={14} /> Arquivar
        </button>
        {/*
          Deixou de ser botão: virou o aviso de que o trabalho está guardado.
          Manter um "Salvar alterações" ao lado do auto-save ensinaria a pessoa
          a desconfiar dele — e um botão que quase nunca precisa ser apertado é
          pior que nenhum, porque no dia em que ela esquecer vai achar que
          perdeu. O clique continua valendo pra quem quiser gravar na hora.
        */}
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={salvando || !graph}
          title={salvoEm ? `Último salvamento às ${salvoEm.toLocaleTimeString('pt-BR')}` : 'Salva sozinho a cada alteração'}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            dirty || salvando ? 'text-ink-3' : 'text-ok-ink'
          }`}
        >
          {saveMutation.isPending ? (
            <>
              <Save size={14} className="animate-pulse" /> Salvando…
            </>
          ) : dirty ? (
            <>
              <Save size={14} /> Alterações pendentes
            </>
          ) : (
            <>
              <Check size={14} /> Salvo
            </>
          )}
        </button>
      </div>

      {(error || notice) && (
        <div className="shrink-0 px-4 pt-3">
          {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}
          {notice && <CrmNoticeBar message={notice} onClose={() => setNotice(null)} />}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Paleta flutuante. Fica FORA do fluxo do layout: como coluna fixa ela
            comia 13rem do canvas o tempo todo, e quem está ligando blocos passa
            a maior parte do tempo sem precisar dela. */}
        <div className="absolute left-3 top-3 z-30 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletaAberta((v) => !v)}
              aria-label={paletaAberta ? 'Fechar blocos' : 'Adicionar bloco'}
              aria-expanded={paletaAberta}
              title={paletaAberta ? 'Fechar blocos' : 'Adicionar bloco'}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Wand2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => setSimularAberto(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-lg"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <MessageSquare size={13} /> Simular
            </button>
          </div>

          {paletaAberta && (
            <div className="flex max-h-[calc(100vh-12rem)] w-56 flex-col overflow-hidden rounded-xl border border-line bg-surface-solid shadow-2xl">
              <div className="border-b border-line-soft p-2.5">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar blocos..."
                    className="w-full rounded-lg border border-line bg-canvas py-1.5 pl-7 pr-2 text-xs text-ink-2 placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-line"
                  />
                </div>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {palette.map((spec) => (
                  <button
                    key={spec.kind}
                    type="button"
                    onClick={() => addBlock(spec.kind)}
                    title={spec.description}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left text-xs font-medium text-ink-2 hover:bg-canvas"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `color-mix(in oklab, ${spec.color} 22%, transparent)`, color: spec.color }}
                    >
                      <IconeDoBloco kind={spec.kind} size={13} />
                    </span>
                    <span className="truncate">{spec.label}</span>
                  </button>
                ))}
                {palette.length === 0 && (
                  <p className="px-2 py-3 text-center text-[11px] text-ink-4">Nenhum bloco com esse nome.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <FlowCanvas
          graph={graph}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={moveBlock}
          onConnect={connect}
          onDeleteNode={pedirParaApagarBloco}
          onDeleteEdge={pedirParaApagarLigacao}
          onEdit={setEditando}
          onDuplicate={duplicarBloco}
        />
      </div>

      {simularAberto && <SimuladorDeFluxo graph={graph} onClose={() => setSimularAberto(false)} />}

      <CrmConfirmarExclusao
        open={!!apagando}
        titulo={textoDaExclusao().titulo}
        pergunta={textoDaExclusao().pergunta}
        onCancelar={() => setApagando(null)}
        onConfirmar={() => {
          if (!apagando) return
          if (apagando.tipo === 'bloco') apagarBloco(apagando.id)
          else apagarLigacao(apagando.id)
          setApagando(null)
        }}
      />

      {/* O editor é modal, não painel: os blocos das referências têm formulário
          longo (a Mensagem sozinha tem oito tipos de conteúdo) e não cabem numa
          coluna de 18rem sem virar rolagem infinita. */}
      <FlowBlockEditor
        open={!!emEdicao}
        block={emEdicao}
        catalogos={{
          clientId,
          etiquetas: (tagsQuery.data ?? []).map((t) => ({ id: t.id, name: t.name })),
          departamentos: (departmentsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name })),
          fluxos: (flowsQuery.data ?? []).filter((f) => f.id !== flowId).map((f) => ({ id: f.id, name: f.name })),
          kanbans: (kanbansQuery.data ?? []).map((k) => ({ id: k.id, name: k.name })),
          produtos: (produtosQuery.data ?? []).map((p) => ({ id: p.id, name: p.name })),
          equipe: (membersQuery.data ?? []).map((m) => ({ email: m.email, name: m.displayName ?? m.email })),
          templates: (templatesQuery.data ?? []).map((t) => ({ id: t.id, name: t.name })),
          variaveisGlobais: (globaisQuery.data ?? []).map((v) => ({ id: v.id, name: v.key })),
        }}
        onClose={() => setEditando(null)}
        onSave={(data) => {
          if (emEdicao) updateBlock({ ...emEdicao, data })
          setEditando(null)
        }}
      />
    </div>
  )
}

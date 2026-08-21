import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronRight,
  Columns3,
  Columns2,
  Home,
  Plus,
  SlidersHorizontal,
  BarChart3,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import {
  fetchKanbanColumns,
  fetchKanbanCards,
  updateCard,
  deleteCard,
  deleteColumn,
  type KanbanColumn,
  type KanbanCard,
} from '../../../lib/db/crmKanban'
import { CrmLoading } from '../CrmDataStates'
import { CrmErrorBar, CrmConfirmarExclusao, primaryButtonClass, inputClass } from '../ui/CrmUi'
import { ColunaModal, NovoCartaoModal } from './KanbanModais'
import { Sensivel } from '../../ui/Sensivel'

// O quadro aberto. Arrastar um cartão grava a coluna nova na hora: não existe
// estado só na tela, e por isso não existe "esqueci de salvar".

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function KanbanBoard({
  clientId,
  kanbanId,
  nomeDoQuadro,
  onVoltar,
}: {
  clientId: string
  kanbanId: string
  nomeDoQuadro: string
  onVoltar: () => void
}) {
  const queryClient = useQueryClient()
  const [erro, setErro] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)

  const [colunaModal, setColunaModal] = useState<{ coluna?: KanbanColumn } | null>(null)
  const [cartaoModal, setCartaoModal] = useState<{ columnId: string } | null>(null)
  const [menuColuna, setMenuColuna] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<
    { tipo: 'coluna'; id: string; nome: string } | { tipo: 'cartao'; id: string; nome: string } | null
  >(null)

  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [estatisticasAbertas, setEstatisticasAbertas] = useState(false)
  const [busca, setBusca] = useState('')
  const [soComValor, setSoComValor] = useState(false)

  const trilho = useRef<HTMLDivElement>(null)

  const colunasQuery = useQuery({
    queryKey: ['crm-kanban-columns', kanbanId],
    queryFn: () => fetchKanbanColumns(kanbanId),
  })
  const cartoesQuery = useQuery({
    queryKey: ['crm-kanban-cards', kanbanId],
    queryFn: () => fetchKanbanCards(kanbanId),
  })

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-kanban-columns', kanbanId] })
    queryClient.invalidateQueries({ queryKey: ['crm-kanban-cards', kanbanId] })
    queryClient.invalidateQueries({ queryKey: ['crm-kanbans', clientId] })
  }

  const moverMutation = useMutation({
    mutationFn: (v: { id: string; columnId: string }) => updateCard(v.id, { columnId: v.columnId }),
    onSuccess: recarregar,
    onError: (e: Error) => setErro(e.message),
  })
  const excluirCartaoMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: recarregar,
    onError: (e: Error) => setErro(e.message),
  })
  const excluirColunaMutation = useMutation({
    mutationFn: deleteColumn,
    onSuccess: recarregar,
    onError: (e: Error) => setErro(e.message),
  })

  const colunas = colunasQuery.data ?? []
  const cartoes = cartoesQuery.data ?? []

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return cartoes.filter((c) => {
      if (soComValor && c.value <= 0) return false
      if (!termo) return true
      return (
        c.title.toLowerCase().includes(termo) ||
        (c.description ?? '').toLowerCase().includes(termo) ||
        (c.contactName ?? '').toLowerCase().includes(termo)
      )
    })
  }, [cartoes, busca, soComValor])

  const filtroAtivo = busca.trim().length > 0 || soComValor

  const estatisticas = useMemo(() => {
    const idsDeConversao = new Set(colunas.filter((c) => c.isConversion).map((c) => c.id))
    const ganhos = cartoes.filter((c) => idsDeConversao.has(c.columnId))
    const valorTotal = cartoes.reduce((s, c) => s + c.value, 0)
    const valorGanho = ganhos.reduce((s, c) => s + c.value, 0)
    return {
      total: cartoes.length,
      ganhos: ganhos.length,
      // Sem coluna de conversão marcada a taxa não existe. Mostrar 0% seria
      // dizer "você não fechou nada", que é diferente de "não dá pra saber".
      taxa: idsDeConversao.size === 0 ? null : cartoes.length === 0 ? 0 : (ganhos.length / cartoes.length) * 100,
      valorTotal,
      valorGanho,
      temColunaDeConversao: idsDeConversao.size > 0,
    }
  }, [colunas, cartoes])

  function exportarPlanilha() {
    const porColuna = new Map(colunas.map((c) => [c.id, c.name]))
    const linhas = [
      ['Etapa', 'Título', 'Contato', 'Valor', 'Descrição', 'Prazo'],
      ...filtrados.map((c) => [
        porColuna.get(c.columnId) ?? '',
        c.title,
        c.contactName ?? '',
        c.value ? String(c.value).replace('.', ',') : '',
        (c.description ?? '').replace(/\s+/g, ' '),
        c.dueAt ? new Date(c.dueAt).toLocaleDateString('pt-BR') : '',
      ]),
    ]
    // Ponto e vírgula e BOM: é assim que o Excel em português abre o arquivo
    // com as colunas separadas e os acentos certos, sem ninguém importar nada.
    const csv = linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kanban-${nomeDoQuadro.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function deslizar(direcao: -1 | 1) {
    trilho.current?.scrollBy({ left: direcao * 300, behavior: 'smooth' })
  }

  return (
    <div className="flex h-full flex-col">
      {/* migalha */}
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2 text-xs text-ink-4 md:px-6">
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink-2"
        >
          <ArrowLeft size={13} />
          Voltar
        </button>
        <span className="text-line-strong">|</span>
        <Home size={12} />
        <button type="button" onClick={onVoltar} className="hover:text-ink-2">
          Kanban
        </button>
        <ChevronRight size={12} />
        <span className="truncate font-medium text-ink-2">{nomeDoQuadro}</span>
      </div>

      {/* cabeçalho do quadro */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3 md:px-6">
        <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold text-ink">
          <Columns3 size={17} className="shrink-0 text-[var(--accent-ink)]" />
          <span className="truncate">{nomeDoQuadro}</span>
        </h1>

        {/* Em 375px estes quatro não cabem numa linha. `flex-wrap` deixa a
            barra crescer pra baixo em vez de empurrar a página pro lado. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              filtroAtivo
                ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-line bg-surface text-ink-2 hover:bg-canvas'
            }`}
          >
            <SlidersHorizontal size={13} />
            Filtros
          </button>
          <button
            type="button"
            onClick={() => setEstatisticasAbertas((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-medium text-ink-2 hover:bg-canvas"
          >
            <BarChart3 size={13} />
            Ver estatísticas
          </button>
          <button
            type="button"
            onClick={exportarPlanilha}
            disabled={filtrados.length === 0}
            className={`${primaryButtonClass} px-2.5 py-2 text-xs disabled:opacity-40`}
          >
            <Download size={13} />
            Exportar leads
          </button>
          <button
            type="button"
            onClick={() => setColunaModal({})}
            className={`${primaryButtonClass} px-2.5 py-2 text-xs`}
          >
            <Plus size={13} />
            Adicionar coluna
          </button>
        </div>
      </div>

      {filtrosAbertos && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-canvas px-4 py-2.5 md:px-6">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, contato ou descrição"
            className={`${inputClass} max-w-xs flex-1`}
          />
          <button
            type="button"
            onClick={() => setSoComValor((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              soComValor
                ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-line bg-surface text-ink-2 hover:bg-canvas'
            }`}
          >
            Somente com valor
          </button>
          {filtroAtivo && (
            <button
              type="button"
              onClick={() => {
                setBusca('')
                setSoComValor(false)
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-ink-3 hover:text-ink-2"
            >
              <X size={12} />
              Limpar
            </button>
          )}
          <span className="text-xs text-ink-4">
            {filtrados.length} de {cartoes.length} cartões
          </span>
        </div>
      )}

      {estatisticasAbertas && (
        <div className="grid grid-cols-2 gap-px border-b border-line-soft bg-line-soft sm:grid-cols-4">
          <Indicador rotulo="Cartões" valor={String(estatisticas.total)} />
          <Indicador rotulo="Valor em jogo" valor={moeda.format(estatisticas.valorTotal)} />
          <Indicador rotulo="Ganhos" valor={String(estatisticas.ganhos)} detalhe={moeda.format(estatisticas.valorGanho)} />
          <Indicador
            rotulo="Taxa de conversão"
            valor={estatisticas.taxa === null ? 'sem etapa' : `${estatisticas.taxa.toFixed(0)}%`}
            detalhe={estatisticas.temColunaDeConversao ? undefined : 'marque a etapa de ganho numa coluna'}
          />
        </div>
      )}

      {erro && (
        <div className="px-4 pt-3 md:px-6">
          <CrmErrorBar message={erro} onClose={() => setErro(null)} />
        </div>
      )}

      {/* trilho das colunas */}
      {colunasQuery.isLoading ? (
        <CrmLoading />
      ) : colunas.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-line-strong bg-surface py-16 text-center md:m-6">
          <Columns2 size={26} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">Este quadro ainda não tem colunas</p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-4">
            Cada coluna é uma etapa do seu atendimento. Crie a primeira para começar a mover cartões.
          </p>
          <button type="button" onClick={() => setColunaModal({})} className={`${primaryButtonClass} mt-4`}>
            <Plus size={14} />
            Adicionar coluna
          </button>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div ref={trilho} className="flex h-full gap-3 overflow-x-auto px-4 py-4 md:px-6">
            {colunas.map((col) => {
              const daColuna = filtrados.filter((c) => c.columnId === col.id)
              const soma = daColuna.reduce((s, c) => s + c.value, 0)
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setAlvo(col.id)
                  }}
                  onDragLeave={() => setAlvo((a) => (a === col.id ? null : a))}
                  onDrop={() => {
                    if (arrastando) moverMutation.mutate({ id: arrastando, columnId: col.id })
                    setArrastando(null)
                    setAlvo(null)
                  }}
                  // 280px: cabe inteira numa tela de 375 com folga pra mostrar
                  // que existe outra coluna ao lado.
                  className={`flex w-[280px] shrink-0 flex-col self-start rounded-xl border bg-surface transition-colors ${
                    alvo === col.id ? 'border-[var(--accent)]' : 'border-line'
                  }`}
                  style={{
                    backgroundColor:
                      alvo === col.id ? `color-mix(in oklab, ${col.color} 10%, transparent)` : undefined,
                  }}
                >
                  {/* faixa superior na cor da coluna */}
                  <span
                    className="h-1 rounded-t-xl"
                    style={{ backgroundColor: col.color }}
                    aria-hidden
                  />

                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: col.color }} />
                      <span className="truncate text-sm font-semibold text-ink">{col.name}</span>
                      {col.isConversion && (
                        <Trophy size={12} className="shrink-0 text-[var(--accent-ink)]" aria-label="Coluna de conversão" />
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-ink-3">
                        {daColuna.length}
                      </span>
                      <span className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuColuna(menuColuna === col.id ? null : col.id)}
                          aria-label={`Ações da coluna ${col.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-4 hover:bg-surface-2 hover:text-ink-2"
                        >
                          <MoreHorizontal size={15} />
                        </button>
                        {menuColuna === col.id && (
                          <>
                            <button
                              type="button"
                              aria-hidden
                              tabIndex={-1}
                              onClick={() => setMenuColuna(null)}
                              className="fixed inset-0 z-10 cursor-default"
                            />
                            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface-solid py-1 shadow-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  setColunaModal({ coluna: col })
                                  setMenuColuna(null)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-2 hover:bg-surface-2"
                              >
                                <Pencil size={12} />
                                Editar coluna
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAExcluir({ tipo: 'coluna', id: col.id, nome: col.name })
                                  setMenuColuna(null)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger-ink hover:bg-danger-bg"
                              >
                                <Trash2 size={12} />
                                Excluir coluna
                              </button>
                            </div>
                          </>
                        )}
                      </span>
                    </span>
                  </div>

                  {soma > 0 && (
                    <p className="px-3 pb-1.5 text-[11px] tabular-nums text-ink-4">{moeda.format(soma)}</p>
                  )}

                  <div className="min-h-[5rem] flex-1 space-y-2 px-2 pb-2">
                    {daColuna.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-ink-4">
                        {filtroAtivo ? 'Nenhum cartão bate com o filtro.' : 'Os cartões aparecem aqui'}
                      </p>
                    ) : (
                      daColuna.map((card) => (
                        <Cartao
                          key={card.id}
                          card={card}
                          arrastando={arrastando === card.id}
                          onArrastar={setArrastando}
                          onExcluir={() => setAExcluir({ tipo: 'cartao', id: card.id, nome: card.title })}
                        />
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCartaoModal({ columnId: col.id })}
                    className="m-2 mt-0 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong py-2.5 text-xs font-medium text-ink-3 hover:bg-canvas hover:text-ink-2"
                  >
                    <Plus size={13} />
                    Adicionar cartão
                  </button>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => setColunaModal({})}
              className="flex h-fit w-[220px] shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-dashed border-line-strong bg-surface px-3 py-4 text-sm text-ink-3 hover:bg-canvas hover:text-ink-2"
            >
              <Plus size={14} />
              Nova coluna
            </button>
          </div>

          {/* Setas de deslize. Só aparecem no ponteiro: no toque a pessoa
              arrasta o trilho com o dedo, e aí elas só roubariam espaço. */}
          {colunas.length > 1 && (
            <>
              <BotaoDeslize lado="esquerda" onClick={() => deslizar(-1)} />
              <BotaoDeslize lado="direita" onClick={() => deslizar(1)} />
            </>
          )}
        </div>
      )}

      {colunaModal && (
        <ColunaModal
          clientId={clientId}
          kanbanId={kanbanId}
          posicao={colunaModal.coluna?.position ?? colunas.length}
          coluna={colunaModal.coluna}
          onClose={() => setColunaModal(null)}
          onSalvo={recarregar}
        />
      )}

      {cartaoModal && (
        <NovoCartaoModal
          clientId={clientId}
          kanbanId={kanbanId}
          columnId={cartaoModal.columnId}
          posicao={cartoes.filter((c) => c.columnId === cartaoModal.columnId).length}
          onClose={() => setCartaoModal(null)}
          onCriado={recarregar}
        />
      )}

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo={aExcluir?.tipo === 'coluna' ? 'Excluir coluna' : 'Excluir cartão'}
        pergunta={
          aExcluir?.tipo === 'coluna' ? (
            <>
              A coluna <strong className="text-ink">{aExcluir.nome}</strong> e todos os cartões dentro dela serão
              apagados. Não dá para desfazer.
            </>
          ) : (
            <>
              O cartão <strong className="text-ink">{aExcluir?.nome}</strong> será apagado. Não dá para desfazer.
            </>
          )
        }
        onCancelar={() => setAExcluir(null)}
        onConfirmar={() => {
          if (aExcluir?.tipo === 'coluna') excluirColunaMutation.mutate(aExcluir.id)
          if (aExcluir?.tipo === 'cartao') excluirCartaoMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
      />
    </div>
  )
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <p className="text-[11px] text-ink-4">{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{valor}</p>
      {detalhe && <p className="mt-0.5 text-[10px] leading-tight text-ink-4">{detalhe}</p>}
    </div>
  )
}

function BotaoDeslize({ lado, onClick }: { lado: 'esquerda' | 'direita'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === 'esquerda' ? 'Ver colunas à esquerda' : 'Ver colunas à direita'}
      className={`absolute top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface-solid text-ink-3 shadow-lg hover:text-ink md:flex ${
        lado === 'esquerda' ? 'left-1' : 'right-1'
      }`}
    >
      <ChevronRight size={16} className={lado === 'esquerda' ? 'rotate-180' : ''} />
    </button>
  )
}

function Cartao({
  card,
  arrastando,
  onArrastar,
  onExcluir,
}: {
  card: KanbanCard
  arrastando: boolean
  onArrastar: (id: string | null) => void
  onExcluir: () => void
}) {
  return (
    <div
      draggable
      onDragStart={() => onArrastar(card.id)}
      onDragEnd={() => onArrastar(null)}
      className={`group cursor-grab rounded-lg border border-line bg-canvas p-2.5 active:cursor-grabbing ${
        arrastando ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1.5">
        {/* O título do cartão é o nome do lead: pessoa real no funil. */}
        <Sensivel as="div" className="min-w-0 flex-1 text-sm font-medium text-ink-2">
          {card.title}
        </Sensivel>
        <button
          type="button"
          onClick={onExcluir}
          aria-label={`Excluir o cartão ${card.title}`}
          // Some no ponteiro até passar o mouse, mas fica SEMPRE visível no
          // toque: num celular não existe hover, e um botão que só aparece no
          // hover simplesmente não existe pra quem usa o dedo.
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-4 hover:text-danger-ink md:opacity-0 md:group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {card.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-3">{card.description}</p>}
      {(card.value > 0 || card.contactName) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-4">
          {card.value > 0 && <span className="tabular-nums font-medium">{moeda.format(card.value)}</span>}
          {card.contactName && <span className="truncate">{card.contactName}</span>}
        </div>
      )}
    </div>
  )
}

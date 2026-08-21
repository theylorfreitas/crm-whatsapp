import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Columns3, Plus, ArrowRight, Trash2 } from 'lucide-react'
import { fetchKanbans, deleteKanban } from '../../lib/db/crmKanban'
import { CrmLoading } from './CrmDataStates'
import { CrmErrorBar, CrmConfirmarExclusao, primaryButtonClass } from './ui/CrmUi'
import { NovoKanbanModal } from './kanban/KanbanModais'
import { KanbanBoard } from './kanban/KanbanBoard'

// Kanban em duas telas: a LISTA de quadros e o QUADRO aberto.
//
// Antes era uma tela só, com os quadros virando abas em cima das colunas. Com
// dois ou três quadros isso ainda passava; a partir daí a fila de abas
// competia com as colunas pelo mesmo espaço horizontal, e num celular ganhava
// sempre a errada. Separar também deu endereço próprio ao quadro: dá pra
// mandar o link de um quadro pra alguém.

export function KanbanSection({
  clientId,
  kanbanId,
  onAbrir,
  onVoltar,
}: {
  clientId: string
  /** Id na URL: com ele abrimos o quadro; sem ele, a lista. */
  kanbanId?: string
  onAbrir: (id: string) => void
  onVoltar: () => void
}) {
  const queryClient = useQueryClient()
  const [novoAberto, setNovoAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; nome: string } | null>(null)

  const quadrosQuery = useQuery({ queryKey: ['crm-kanbans', clientId], queryFn: () => fetchKanbans(clientId) })
  const quadros = quadrosQuery.data ?? []

  const excluirMutation = useMutation({
    mutationFn: deleteKanban,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-kanbans', clientId] }),
    onError: (e: Error) => setErro(e.message),
  })

  const aberto = kanbanId ? quadros.find((q) => q.id === kanbanId) : undefined

  // Com id na URL mas a lista ainda carregando, esperamos: decidir "não
  // existe" antes de a resposta chegar jogaria a pessoa de volta pra lista
  // toda vez que ela abrisse o link direto de um quadro.
  if (kanbanId) {
    if (quadrosQuery.isLoading) return <CrmLoading />
    if (aberto) {
      return (
        <KanbanBoard clientId={clientId} kanbanId={aberto.id} nomeDoQuadro={aberto.name} onVoltar={onVoltar} />
      )
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Columns3 size={17} className="text-[var(--accent-ink)]" />
            Gerenciamento de Kanban
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">Organize atendimentos e oportunidades em colunas.</p>
        </div>
        <button type="button" onClick={() => setNovoAberto(true)} className={primaryButtonClass}>
          <Plus size={14} />
          Novo Kanban
        </button>
      </div>

      {erro && <CrmErrorBar message={erro} onClose={() => setErro(null)} />}

      {quadrosQuery.isLoading ? (
        <CrmLoading />
      ) : quadros.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-16 text-center">
          <Columns3 size={26} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">Nenhum Kanban criado</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-4">
            Crie o primeiro quadro para acompanhar cada atendimento por etapa, do primeiro contato até o fechamento.
          </p>
          <button type="button" onClick={() => setNovoAberto(true)} className={`${primaryButtonClass} mt-4`}>
            <Plus size={14} />
            Novo Kanban
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-3">
          {/* `auto-fill` com mínimo de 15rem: uma coluna em 375px, várias no
              desktop, sem nenhum ponto de quebra escrito na mão. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {quadros.map((q) => (
              <div
                key={q.id}
                className="group flex flex-col rounded-xl border border-line bg-canvas transition-colors hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]">
                      <Columns3 size={13} className="text-[var(--accent-ink)]" />
                    </span>
                    <span className="truncate text-sm font-semibold text-ink">{q.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAExcluir({ id: q.id, nome: q.name })}
                    aria-label={`Excluir o quadro ${q.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-4 hover:bg-danger-bg hover:text-danger-ink md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <p className="flex items-center gap-1.5 px-3 pb-3 text-[11px] text-ink-4">
                  <span className="h-1 w-1 rounded-full bg-ink-4" />
                  {q.columnCount === 1 ? '1 coluna' : `${q.columnCount} colunas`}
                </p>

                {q.description && (
                  <p className="line-clamp-2 px-3 pb-3 text-[11px] leading-relaxed text-ink-3">{q.description}</p>
                )}

                <button
                  type="button"
                  onClick={() => onAbrir(q.id)}
                  className="mt-auto flex items-center justify-between border-t border-line-soft px-3 py-2.5 text-xs font-semibold text-[var(--accent-ink)] hover:bg-surface-2"
                >
                  Abrir Kanban
                  <ArrowRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <NovoKanbanModal
        open={novoAberto}
        clientId={clientId}
        onClose={() => setNovoAberto(false)}
        onCriado={(id) => {
          queryClient.invalidateQueries({ queryKey: ['crm-kanbans', clientId] })
          onAbrir(id)
        }}
      />

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Excluir Kanban"
        pergunta={
          <>
            O quadro <strong className="text-ink">{aExcluir?.nome}</strong>, as colunas dele e todos os cartões serão
            apagados. Não dá para desfazer.
          </>
        }
        onCancelar={() => setAExcluir(null)}
        onConfirmar={() => {
          if (aExcluir) excluirMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
      />
    </div>
  )
}

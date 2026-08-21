import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Workflow, Plus, FolderPlus, Upload, Copy, Trash2, MoreVertical, Download, Pencil } from 'lucide-react'
import {
  fetchFlows,
  createFlow,
  updateFlow,
  deleteFlow,
  duplicateFlow,
  importFlow,
  fetchFlowFolders,
  createFlowFolder,
  deleteFlowFolder,
  type CrmFlow,
} from '../../lib/db/crmFlows'
import { fetchDisparosPorFluxo, type DisparoDoFluxo } from '../../lib/db/crmDisparos'
import { CrmLoading } from './CrmDataStates'
import { SinalDaAutomacao } from './SinalDaAutomacao'
import { primaryButtonClass, ghostButtonClass, CrmPill, CrmErrorBar } from './ui/CrmUi'

// Lista de fluxos: pastas, status, contagem de blocos e as ações de cada um.
// Abrir um fluxo leva pro editor (FlowEditor).

// O RÓTULO DE GATILHO SAIU DAQUI, e o motivo vale ficar escrito.
//
// A lista mostrava um campo guardado no próprio fluxo, escolhido no instante da
// criação. Ele dizia "Manual" num fluxo configurado para disparar pela palavra
// "testar" — e quem lia concluía, com razão, que a configuração não estava
// valendo. O campo não mentia por descuido: ele simplesmente não tem como
// saber, porque o disparo é configurado depois, em outra tela, e POR CONEXÃO.
//
// Um fluxo não tem um gatilho. Ele pode ser chamado por palavra-chave em dois
// números, ser as boas-vindas de um deles, ser aberto na mão por um atendente e
// ainda ser chamado de dentro de outro fluxo. Agora a lista PERGUNTA à
// configuração o que aciona cada um, em vez de repetir um rótulo antigo.

export function FlowsSection({ clientId, onOpenFlow }: { clientId: string; onOpenFlow: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [folder, setFolder] = useState<string>('todas')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const flowsQuery = useQuery({ queryKey: ['crm-flows', clientId], queryFn: () => fetchFlows(clientId) })
  const foldersQuery = useQuery({ queryKey: ['crm-flow-folders', clientId], queryFn: () => fetchFlowFolders(clientId) })
  // O que aciona cada fluxo, lido de onde a configuração mora de verdade.
  const disparosQuery = useQuery({
    queryKey: ['crm-disparos-por-fluxo', clientId],
    queryFn: () => fetchDisparosPorFluxo(clientId),
  })
  const disparos = disparosQuery.data ?? new Map()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-flows', clientId] })
    queryClient.invalidateQueries({ queryKey: ['crm-flow-folders', clientId] })
  }

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: CrmFlow['status'] }) => updateFlow(vars.id, { status: vars.status }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteFlow, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })
  const duplicateMutation = useMutation({
    mutationFn: (flow: CrmFlow) => duplicateFlow(clientId, flow),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const importMutation = useMutation({
    mutationFn: (raw: string) => importFlow(clientId, raw),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const folderMutation = useMutation({
    mutationFn: (name: string) => createFlowFolder(clientId, name),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })

  const flows = flowsQuery.data ?? []
  const folders = foldersQuery.data ?? []

  /**
   * "Novo Fluxo" abre o quadro. Sem pop-up nenhum.
   *
   * O que havia antes: um modal pedindo nome, pasta, QUANDO O FLUXO COMEÇA e
   * palavra-chave — quatro decisões antes de ver a primeira tela. Só que o
   * fluxo é uma CONVERSA PROGRAMADA: quem senta pra montar quer desenhar a
   * conversa, e ainda não sabe por qual palavra ela vai começar. Gatilho é
   * outro assunto, e mora em outra área.
   *
   * Nasce como 'manual', que é o único gatilho que não promete nada: o fluxo
   * só roda quando alguém mandar rodar. Nome e pasta se resolvem depois, com o
   * desenho na frente.
   */
  const novoFluxo = useMutation({
    mutationFn: () => {
      // Um nome que não colide, pra lista não virar cinco "Novo fluxo".
      const usados = new Set(flows.map((f) => f.name))
      let nome = 'Novo fluxo'
      for (let i = 2; usados.has(nome); i++) nome = `Novo fluxo ${i}`
      // Criado dentro da pasta que está aberta — é onde a pessoa está olhando.
      const pasta = folder === 'todas' || folder === 'sem_pasta' ? null : folder
      return createFlow(clientId, { name: nome, folderId: pasta, triggerKind: 'manual', triggerValue: '' })
    },
    onSuccess: (flow) => {
      invalidate()
      onOpenFlow(flow.id)
    },
    onError: (e: Error) => setError(e.message),
  })

  const visible = useMemo(() => {
    if (folder === 'todas') return flows
    if (folder === 'sem_pasta') return flows.filter((f) => !f.folderId)
    return flows.filter((f) => f.folderId === folder)
  }, [flows, folder])

  function exportFlow(flow: CrmFlow) {
    const blob = new Blob([JSON.stringify({ name: flow.name, trigger_kind: flow.triggerKind, graph: flow.graph }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${flow.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Workflow size={17} className="text-ink-4" />
            Fluxos
            {/* O sinal fica JUNTO DO TÍTULO, e não perdido entre os botões: ele
                responde "isto aqui está funcionando?", que é a primeira coisa
                que se pergunta ao abrir a tela, antes de qualquer ação. */}
            <SinalDaAutomacao clientId={clientId} />
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">Automação de atendimento: mensagens, menus, condições e PIX.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) importMutation.mutate(await file.text())
              e.target.value = ''
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className={ghostButtonClass}>
            <Upload size={14} /> Importar Fluxo
          </button>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('Nome da nova pasta:')
              if (name?.trim()) folderMutation.mutate(name.trim())
            }}
            className={ghostButtonClass}
          >
            <FolderPlus size={14} /> Nova Pasta
          </button>
          <button
            type="button"
            onClick={() => novoFluxo.mutate()}
            disabled={novoFluxo.isPending}
            className={primaryButtonClass}
          >
            <Plus size={14} /> {novoFluxo.isPending ? 'Abrindo…' : 'Novo Fluxo'}
          </button>
        </div>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {[
          { key: 'todas', label: 'Todas' },
          { key: 'sem_pasta', label: 'Sem pasta' },
          ...folders.map((f) => ({ key: f.id, label: f.name })),
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFolder(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              folder === f.key ? 'bg-primary text-primary-foreground' : 'border border-line bg-surface text-ink-2 hover:bg-canvas'
            }`}
          >
            {f.label}
          </button>
        ))}
        {folder !== 'todas' && folder !== 'sem_pasta' && (
          <button
            type="button"
            onClick={() => {
              const target = folders.find((f) => f.id === folder)
              if (target && window.confirm(`Apagar a pasta "${target.name}"? Os fluxos dela ficam sem pasta.`)) {
                deleteFlowFolder(folder).then(() => {
                  setFolder('todas')
                  invalidate()
                })
              }
            }}
            className="text-xs text-ink-4 hover:text-danger-ink"
          >
            apagar pasta
          </button>
        )}
      </div>

      {flowsQuery.isLoading ? (
        <CrmLoading />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
          <p className="text-sm font-medium text-ink-2">
            {flows.length === 0 ? 'Nenhum fluxo criado' : 'Nenhum fluxo nesta pasta'}
          </p>
          <p className="mt-1 text-xs text-ink-4">
            Crie um fluxo pra responder sozinho no WhatsApp — menu, condições, cobrança e transferência pro time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((flow) => (
            <div key={flow.id} className="relative rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
              <div className="mb-2 flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFlow(flow.id)}
                  className="min-w-0 flex-1 text-left text-sm font-semibold text-ink hover:underline"
                >
                  <span className="line-clamp-2">{flow.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenuId(menuId === flow.id ? null : flow.id)}
                  className="shrink-0 rounded p-1 text-ink-4 hover:bg-surface-2"
                  aria-label="Ações do fluxo"
                >
                  <MoreVertical size={14} />
                </button>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-4">
                <CrmPill tone={flow.status === 'ativo' ? 'verde' : flow.status === 'pausado' ? 'amarelo' : 'cinza'}>
                  {flow.status}
                </CrmPill>
                <span>{new Date(flow.updatedAt).toLocaleString('pt-BR')}</span>
              </div>
              <p className="text-[11px] text-ink-3">
                {flow.blocksCount} {flow.blocksCount === 1 ? 'bloco' : 'blocos'} · <OQueAciona disparos={disparos.get(flow.id)} />
              </p>

              {menuId === flow.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                  <div className="absolute right-3 top-10 z-20 w-44 rounded-lg border border-line bg-surface py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenFlow(flow.id)
                        setMenuId(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-canvas"
                    >
                      <Pencil size={12} /> Abrir editor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        statusMutation.mutate({ id: flow.id, status: flow.status === 'ativo' ? 'pausado' : 'ativo' })
                        setMenuId(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-canvas"
                    >
                      {flow.status === 'ativo' ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        statusMutation.mutate({ id: flow.id, status: 'arquivado' })
                        setMenuId(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-canvas"
                    >
                      Arquivar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        duplicateMutation.mutate(flow)
                        setMenuId(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-canvas"
                    >
                      <Copy size={12} /> Duplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportFlow(flow)
                        setMenuId(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-canvas"
                    >
                      <Download size={12} /> Exportar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Apagar o fluxo "${flow.name}"?`)) deleteMutation.mutate(flow.id)
                        setMenuId(null)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-danger-ink hover:bg-danger-bg"
                    >
                      <Trash2 size={12} /> Apagar
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

/**
 * O que aciona este fluxo, escrito para quem bate o olho na lista.
 *
 * SEM DISPARO NÃO É DEFEITO, e por isso o texto não é um aviso: um fluxo pode
 * existir só para ser chamado de dentro de outro, ou para o atendente disparar
 * na mão. Chamar isso de "Manual" era o que confundia — soava como um modo
 * exclusivo, quando na verdade é a ausência de automação, e as duas coisas
 * convivem com qualquer outra configuração.
 */
function OQueAciona({ disparos }: { disparos?: DisparoDoFluxo[] }) {
  if (!disparos || disparos.length === 0) {
    return <span title="Este fluxo roda quando alguém dispara na mão ou quando outro fluxo chama ele.">Sem disparo automático</span>
  }

  // Mais de um WhatsApp configurado: o nome da conexão passa a importar, porque
  // "Palavra-chave: testar" em dois números são duas configurações diferentes.
  const varios = new Set(disparos.map((d) => d.conexao)).size > 1
  const texto = disparos.map((d) => (varios ? `${d.resumo} (${d.conexao})` : d.resumo)).join(' · ')
  return <span title={disparos.map((d) => `${d.resumo} em ${d.conexao}`).join(' | ')}>{texto}</span>
}

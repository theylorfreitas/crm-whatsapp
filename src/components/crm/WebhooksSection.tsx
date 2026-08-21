import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Webhook, Plus, Copy, Trash2, Check } from 'lucide-react'
import { fetchWebhooks, createWebhook, updateWebhook, deleteWebhook, type CrmWebhook } from '../../lib/db/crmSettings'
import { fetchKanbans, fetchKanbanColumns } from '../../lib/db/crmKanban'
import { fetchConnections } from '../../lib/db/crmConnections'
import { CrmLoading } from './CrmDataStates'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmToggle,
  CrmErrorBar,
} from './ui/CrmUi'
import { Selecao } from '../ui/Selecao'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// Webhooks de entrada: uma URL por webhook. Quem chamar aquela URL cria um
// lead, contato ou cartão de kanban, conforme o mapeamento configurado.

export function WebhooksSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payloadOf, setPayloadOf] = useState<CrmWebhook | null>(null)

  const webhooksQuery = useQuery({ queryKey: ['crm-webhooks', clientId], queryFn: () => fetchWebhooks(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-webhooks', clientId] })

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => updateWebhook(vars.id, { active: vars.active }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteWebhook, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const webhooks = webhooksQuery.data ?? []

  function copyUrl(hook: CrmWebhook) {
    navigator.clipboard.writeText(`${API_URL}/public/crm/webhook/${hook.token}`).then(() => {
      setCopiedId(hook.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Webhook size={17} className="text-ink-4" />
            Webhooks de entrada
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">
            Receba POST de fora (n8n, formulário, checkout) e vire lead, contato ou cartão no Kanban.
          </p>
        </div>
        <button type="button" onClick={() => setNewOpen(true)} className={primaryButtonClass}>
          <Plus size={14} /> Novo webhook
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      {webhooksQuery.isLoading ? (
        <CrmLoading />
      ) : webhooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
          <p className="text-sm font-medium text-ink-2">Nenhum webhook criado</p>
          <p className="mt-1 text-xs text-ink-4">Crie um pra receber leads automaticamente de qualquer sistema externo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => (
            <div key={hook.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{hook.name}</p>
                  <p className="text-xs text-ink-4">
                    Cria: {hook.target} · {hook.receivedCount} {hook.receivedCount === 1 ? 'chamada' : 'chamadas'}
                    {hook.lastReceivedAt ? ` · última em ${new Date(hook.lastReceivedAt).toLocaleString('pt-BR')}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CrmPill tone={hook.active ? 'verde' : 'cinza'}>{hook.active ? 'ativo' : 'desativado'}</CrmPill>
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate({ id: hook.id, active: !hook.active })}
                    className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                  >
                    {hook.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Apagar o webhook "${hook.name}"? A URL para de funcionar na hora.`))
                        deleteMutation.mutate(hook.id)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label="Apagar webhook"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] text-ink-2">
                  POST {API_URL}/public/crm/webhook/{hook.token}
                </code>
                <button
                  type="button"
                  onClick={() => copyUrl(hook)}
                  className="shrink-0 rounded p-1 text-ink-4 hover:bg-surface-2 hover:text-ink-2"
                  aria-label="Copiar URL"
                >
                  {copiedId === hook.id ? <Check size={13} className="text-ok-ink" /> : <Copy size={13} />}
                </button>
              </div>

              {Object.keys(hook.mapping).length > 0 && (
                <p className="mt-2 text-[11px] text-ink-3">
                  Mapeamento:{' '}
                  {Object.entries(hook.mapping)
                    .map(([k, v]) => `${k} ← ${v}`)
                    .join(' · ')}
                </p>
              )}

              {hook.lastPayload && (
                <button
                  type="button"
                  onClick={() => setPayloadOf(hook)}
                  className="mt-2 text-[11px] text-ink-3 underline hover:text-ink"
                >
                  Ver último payload recebido
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <NewWebhookModal open={newOpen} clientId={clientId} onClose={() => setNewOpen(false)} onCreated={invalidate} />

      {payloadOf && (
        <CrmModal
          open
          wide
          title={`Último payload · ${payloadOf.name}`}
          onClose={() => setPayloadOf(null)}
          footer={
            <button type="button" onClick={() => setPayloadOf(null)} className={primaryButtonClass}>
              Fechar
            </button>
          }
        >
          <pre className="max-h-96 overflow-auto rounded-lg bg-canvas p-3 text-[11px] text-ink-2">
            {JSON.stringify(payloadOf.lastPayload, null, 2)}
          </pre>
        </CrmModal>
      )}
    </div>
  )
}

function NewWebhookModal({
  open,
  clientId,
  onClose,
  onCreated,
}: {
  open: boolean
  clientId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState<CrmWebhook['target']>('lead')
  const [kanbanColumnId, setKanbanColumnId] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({
    name: 'name',
    email: 'email',
    phone: 'phone',
    organization: '',
    origin: '',
  })
  const [active, setActive] = useState(true)

  const conexoesQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const kanbansQuery = useQuery({ queryKey: ['crm-kanbans', clientId], queryFn: () => fetchKanbans(clientId) })
  const columnsQuery = useQuery({
    queryKey: ['crm-kanban-columns-all', clientId, (kanbansQuery.data ?? []).map((k) => k.id).join(',')],
    queryFn: async () => {
      const all = await Promise.all(
        (kanbansQuery.data ?? []).map(async (b) =>
          (await fetchKanbanColumns(b.id)).map((c) => ({ id: c.id, name: c.name, kanbanName: b.name })),
        ),
      )
      return all.flat()
    },
    enabled: target === 'kanban' && (kanbansQuery.data ?? []).length > 0,
  })

  const mutation = useMutation({
    mutationFn: () =>
      createWebhook(clientId, {
        name: name.trim(),
        target,
        mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v.trim())),
        kanbanColumnId: target === 'kanban' ? kanbanColumnId || null : null,
        connectionId: connectionId || null,
        active,
      }),
    onSuccess: () => {
      setName('')
      onCreated()
      onClose()
    },
  })

  return (
    <CrmModal
      open={open}
      title="Novo webhook de entrada"
      description="A URL é gerada na criação; o mapeamento diz de onde vem cada campo."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} className={primaryButtonClass}>
            Criar webhook
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex.: Formulário do site" />
        </CrmField>
        <CrmField
          label="Conexão"
          hint="Opcional. Necessária para etiquetas, Kanban e disparo de fluxo. Use a mesma conexão de WhatsApp do lead."
        >
          <Selecao value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className={inputClass}>
            <option value="">Nenhuma</option>
            {(conexoesQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ''}
              </option>
            ))}
          </Selecao>
        </CrmField>

        <CrmField label="O que criar quando chegar um POST">
          <Selecao value={target} onChange={(e) => setTarget(e.target.value as CrmWebhook['target'])} className={inputClass}>
            <option value="lead">Um lead</option>
            <option value="contato">Um contato</option>
            <option value="kanban">Um cartão no Kanban</option>
          </Selecao>
        </CrmField>

        {target === 'kanban' && (
          <CrmField label="Coluna de destino">
            <Selecao value={kanbanColumnId} onChange={(e) => setKanbanColumnId(e.target.value)} className={inputClass}>
              <option value="">Escolha uma coluna</option>
              {(columnsQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kanbanName} · {c.name}
                </option>
              ))}
            </Selecao>
          </CrmField>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-2">Mapeamento dos campos</span>
          <p className="mb-2 text-[11px] text-ink-4">
            À esquerda o campo do CRM; à direita o caminho no JSON recebido (ex.: <code>dados.telefone</code>). Em branco = ignora.
          </p>
          <div className="space-y-1.5">
            {Object.keys(mapping).map((field) => (
              <div key={field} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-ink-3">{field}</span>
                <input
                  value={mapping[field]}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  className={inputClass}
                  placeholder="caminho.no.json"
                />
              </div>
            ))}
          </div>
        </div>

        <CrmToggle checked={active} onChange={setActive} label="Ativo" hint="Desativado, a URL responde 409 e nada é gravado." />

        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

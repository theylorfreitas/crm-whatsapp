import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Plus, Play, Trash2, Users } from 'lucide-react'
import {
  fetchBroadcasts,
  fetchBroadcastTargets,
  createBroadcast,
  deleteBroadcast,
  startBroadcast,
  parseTargetList,
} from '../../lib/db/crmBroadcasts'
import { fetchConnections } from '../../lib/db/crmConnections'
import { fetchTemplates } from '../../lib/db/crmSettings'
import { fetchContacts } from '../../lib/db/crm'
import { CrmLoading } from './CrmDataStates'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmTable,
  CrmErrorBar,
  CrmNoticeBar,
} from './ui/CrmUi'
import { Selecao } from '../ui/Selecao'
import { Sensivel } from '../ui/Sensivel'

// Disparos em massa: campanha + lista de destinatários. O botão "Iniciar"
// fala com o backend, que responde honestamente quando o envio não pode
// começar (sem conexão, sem ponte configurada).

export function BroadcastsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const broadcastsQuery = useQuery({ queryKey: ['crm-broadcasts', clientId], queryFn: () => fetchBroadcasts(clientId) })
  const targetsQuery = useQuery({
    queryKey: ['crm-broadcast-targets', detailId],
    queryFn: () => fetchBroadcastTargets(detailId!),
    enabled: !!detailId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-broadcasts', clientId] })

  const startMutation = useMutation({
    mutationFn: startBroadcast,
    onSuccess: (res) => {
      invalidate()
      if (res.started) setNotice('Disparo iniciado.')
      else setError(res.detail ?? 'Não deu pra iniciar o disparo.')
    },
    onError: (e: Error) => setError(e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteBroadcast, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const broadcasts = broadcastsQuery.data ?? []

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Send size={17} className="text-ink-4" />
            Disparos em massa
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">Campanhas de mensagem com ritmo controlado por conexão.</p>
        </div>
        <button type="button" onClick={() => setNewOpen(true)} className={primaryButtonClass}>
          <Plus size={14} /> Novo disparo
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}
      {notice && <CrmNoticeBar message={notice} onClose={() => setNotice(null)} />}

      {broadcastsQuery.isLoading ? (
        <CrmLoading />
      ) : broadcasts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
          <p className="text-sm font-medium text-ink-2">Nenhum disparo criado</p>
          <p className="mt-1 text-xs text-ink-4">Monte uma campanha com a lista de contatos e a mensagem que vai sair.</p>
        </div>
      ) : (
        <CrmTable head={['Campanha', 'Conexão', 'Status', 'Progresso', 'Agendado', 'Ações']}>
          {broadcasts.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-3">
                <button type="button" onClick={() => setDetailId(b.id)} className="text-sm font-medium text-ink hover:underline">
                  {b.name}
                </button>
                <p className="line-clamp-1 text-xs text-ink-4">{b.messageBody ?? 'usa template ou fluxo'}</p>
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">{b.connectionName ?? 'não escolhida'}</td>
              <td className="px-4 py-3">
                <CrmPill
                  tone={
                    b.status === 'concluido'
                      ? 'verde'
                      : b.status === 'enviando'
                        ? 'azul'
                        : b.status === 'falhou'
                          ? 'vermelho'
                          : b.status === 'agendado'
                            ? 'amarelo'
                            : 'cinza'
                  }
                >
                  {b.status}
                </CrmPill>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 rounded-full bg-surface-2">
                    <div
                      className="h-1.5 rounded-full bg-ok"
                      style={{ width: `${b.totalCount > 0 ? (b.sentCount / b.totalCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-ink-3">
                    {b.sentCount}/{b.totalCount}
                  </span>
                </div>
                {b.failedCount > 0 && <p className="mt-0.5 text-[10px] text-danger-ink">{b.failedCount} falharam</p>}
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">
                {b.scheduledAt ? new Date(b.scheduledAt).toLocaleString('pt-BR') : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => startMutation.mutate(b.id)}
                    disabled={b.status === 'enviando' || b.status === 'concluido'}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas disabled:opacity-40"
                  >
                    <Play size={12} /> Iniciar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Apagar o disparo "${b.name}"?`)) deleteMutation.mutate(b.id)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-3 hover:bg-danger-bg hover:text-danger-ink"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <NewBroadcastModal
        open={newOpen}
        clientId={clientId}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          invalidate()
          setNotice('Disparo criado. Revise a lista e clique em Iniciar quando quiser enviar.')
        }}
      />

      {detailId && (
        <CrmModal
          open
          wide
          title="Destinatários do disparo"
          onClose={() => setDetailId(null)}
          footer={
            <button type="button" onClick={() => setDetailId(null)} className={primaryButtonClass}>
              Fechar
            </button>
          }
        >
          {targetsQuery.isLoading ? (
            <CrmLoading />
          ) : (targetsQuery.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-4">Este disparo não tem destinatários.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <CrmTable head={['Nome', 'Telefone', 'Status', 'Enviado em']}>
                {(targetsQuery.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-sm text-ink-2">{t.name ?? '—'}</td>
                    <td className="px-4 py-2 text-sm tabular-nums text-ink-2">
                      <Sensivel>{t.phone}</Sensivel>
                    </td>
                    <td className="px-4 py-2">
                      <CrmPill tone={t.status === 'enviado' ? 'verde' : t.status === 'falhou' ? 'vermelho' : 'cinza'}>
                        {t.status}
                      </CrmPill>
                      {t.error && <p className="mt-0.5 text-[10px] text-danger-ink">{t.error}</p>}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-3">
                      {t.sentAt ? new Date(t.sentAt).toLocaleString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </CrmTable>
            </div>
          )}
        </CrmModal>
      )}
    </div>
  )
}

function NewBroadcastModal({
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
  const [connectionId, setConnectionId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [rawList, setRawList] = useState('')

  const connectionsQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const templatesQuery = useQuery({ queryKey: ['crm-templates', clientId], queryFn: () => fetchTemplates(clientId) })
  const contactsQuery = useQuery({ queryKey: ['crm-contacts', clientId], queryFn: () => fetchContacts(clientId) })

  const targets = parseTargetList(rawList)

  const mutation = useMutation({
    mutationFn: () =>
      createBroadcast(clientId, {
        name: name.trim(),
        connectionId: connectionId || null,
        templateId: templateId || null,
        flowId: null,
        messageBody,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        targets,
      }),
    onSuccess: () => {
      setName('')
      setRawList('')
      setMessageBody('')
      onCreated()
      onClose()
    },
  })

  function importContacts() {
    const withPhone = (contactsQuery.data ?? []).filter((c) => c.phone)
    setRawList(withPhone.map((c) => `${c.name}, ${c.phone}`).join('\n'))
  }

  return (
    <CrmModal
      open={open}
      wide
      title="Novo disparo"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || targets.length === 0 || mutation.isPending}
            className={primaryButtonClass}
          >
            Criar disparo ({targets.length})
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CrmField label="Nome da campanha">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </CrmField>
        <CrmField label="Conexão que vai enviar">
          <Selecao value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className={inputClass}>
            <option value="">Escolha uma conexão</option>
            {(connectionsQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </Selecao>
        </CrmField>
        <CrmField label="Template (API Oficial)" hint="Opcional, obrigatório na API Oficial da Meta.">
          <Selecao value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
            <option value="">Sem template</option>
            {(templatesQuery.data ?? [])
              .filter((t) => t.status === 'aprovado')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Selecao>
        </CrmField>
        <CrmField label="Agendar para" hint="Em branco = começa quando você clicar em Iniciar.">
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
        </CrmField>

        <div className="sm:col-span-2">
          <CrmField label="Mensagem" hint="Use {{nome}} pro nome do destinatário.">
            <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} rows={3} className={inputClass} />
          </CrmField>
        </div>

        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">Destinatários</span>
            <button type="button" onClick={importContacts} className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink">
              <Users size={12} /> Puxar dos contatos ({(contactsQuery.data ?? []).filter((c) => c.phone).length})
            </button>
          </div>
          <textarea
            value={rawList}
            onChange={(e) => setRawList(e.target.value)}
            rows={6}
            placeholder={'Uma por linha:\nMaria Silva, 5567999999999\n5511988887777'}
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-ink-4">
            {targets.length} {targets.length === 1 ? 'destinatário reconhecido' : 'destinatários reconhecidos'}.
          </p>
        </div>
      </div>
      {mutation.isError && <p className="mt-2 text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
    </CrmModal>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Check, Save, Terminal, Loader2 } from 'lucide-react'
import {
  fetchMcpTokens,
  createMcpToken,
  revokeMcpToken,
  fetchCrmSettings,
  saveCrmSettings,
} from '../../../lib/db/crmSettings'
import { fetchConnections } from '../../../lib/db/crmConnections'
import { fetchBroadcastSettings, saveBroadcastSettings, type BroadcastSettings } from '../../../lib/db/crmBroadcasts'
import { CrmLoading } from '../CrmDataStates'
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
  CrmNoticeBar,
  CrmConfirmarExclusao,
} from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// Painéis de acesso: credenciais de MCP, ritmo dos disparos e preferências
// gerais.
//
// "Convites para a plataforma" e "Acesso de suporte" saíram. As duas telas
// gravavam linha e não faziam nada: nenhum convite chegou a mandar e-mail, e o
// acesso de suporte não concedia acesso a coisa nenhuma — era um registro do
// que teria sido concedido. Integrações mudou de arquivo (IntegracoesPanel).

export function McpPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['leitura'])
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<'url' | 'token' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aRevogar, setARevogar] = useState<{ id: string; name: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-mcp-tokens', clientId], queryFn: () => fetchMcpTokens(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-mcp-tokens', clientId] })

  const endereco = `${API_URL}/mcp`

  const createMutation = useMutation({
    // Só token estático. OAuth exige um servidor de autorização inteiro, e um
    // botão que gera credencial que nada honra é exatamente o defeito que este
    // CRM vem tirando de tela em tela.
    mutationFn: () => createMcpToken(clientId, { name: name.trim(), scopes, authType: 'estatico' }),
    onSuccess: (token) => {
      setFreshToken(token)
      setName('')
      invalidate()
      setOpen(false)
    },
    onError: (e: Error) => setError(e.message),
  })
  const revokeMutation = useMutation({ mutationFn: revokeMcpToken, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const tokens = query.data ?? []

  function copiar(texto: string, qual: 'url' | 'token') {
    navigator.clipboard.writeText(texto)
    setCopied(qual)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <div className="mb-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-4">Endereço do servidor</p>
            <code className="mt-1 block truncate text-sm text-ink">{endereco}</code>
          </div>
          <button type="button" onClick={() => copiar(endereco, 'url')} className={ghostButtonClass}>
            {copied === 'url' ? <Check size={14} className="text-ok-ink" /> : <Copy size={14} />} Copiar
          </button>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
          Cole esta URL no Cursor, no n8n ou em qualquer cliente MCP, e mande o token no cabeçalho{' '}
          <code>Authorization: Bearer …</code>. O token vale por workspace: ele só enxerga os dados deste cliente, e não
          há como pedir outro.
        </p>
      </div>

      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}>
          <Plus size={14} /> Nova credencial
        </button>
      </div>

      {query.isLoading ? (
        <CrmLoading />
      ) : tokens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-12 text-center">
          <Terminal size={24} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">Nenhuma credencial de MCP criada</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-4">
            Guardamos só o hash do token: ele aparece uma única vez, no momento em que é gerado.
          </p>
        </div>
      ) : (
        <CrmTable head={['Nome', 'Token', 'Permissões', 'Último uso', 'Ações']}>
          {tokens.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 text-sm text-ink">{t.name}</td>
              <td className="px-4 py-3">
                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{t.tokenPrefix}…</code>
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">{t.scopes.join(', ')}</td>
              <td className="px-4 py-3 text-xs text-ink-3">
                {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString('pt-BR') : 'nunca usado'}
              </td>
              <td className="px-4 py-3">
                {t.revokedAt ? (
                  <CrmPill tone="cinza">revogado</CrmPill>
                ) : (
                  <button
                    type="button"
                    onClick={() => setARevogar(t)}
                    className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-danger-bg hover:text-danger-ink"
                  >
                    Revogar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <CrmModal
        open={open}
        icon={<Terminal size={17} />}
        title="Nova credencial"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending} className={primaryButtonClass}>
              Criar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <CrmField label="Nome" hint="Como você reconhece esta credencial na lista depois.">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex.: Cursor do João" autoFocus />
          </CrmField>
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Permissões</span>
            <div className="flex gap-1.5">
              {['leitura', 'escrita'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])}
                  aria-pressed={scopes.includes(s)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    scopes.includes(s)
                      ? 'bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent-ink)]'
                      : 'bg-surface-2 text-ink-2'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
              Só leitura: o cliente vê conversas, contatos e vendas. Com escrita, ele também cadastra contato. As
              ferramentas de escrita nem aparecem para um token só de leitura.
            </p>
          </div>
        </div>
      </CrmModal>

      {freshToken && (
        <CrmModal
          open
          title="Credencial gerada"
          description="Copie agora. Ela não aparece de novo."
          onClose={() => setFreshToken(null)}
          footer={
            <button type="button" onClick={() => setFreshToken(null)} className={primaryButtonClass}>
              Guardei a credencial
            </button>
          }
        >
          <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2.5">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-ink">{freshToken}</code>
            <button
              type="button"
              onClick={() => copiar(freshToken, 'token')}
              className="shrink-0 rounded p-1 text-ink-4 hover:text-ink-2"
              aria-label="Copiar credencial"
            >
              {copied === 'token' ? <Check size={14} className="text-ok-ink" /> : <Copy size={14} />}
            </button>
          </div>
        </CrmModal>
      )}

      <CrmConfirmarExclusao
        open={!!aRevogar}
        titulo="Revogar credencial"
        pergunta={
          <>
            <strong>{aRevogar?.name}</strong> para de funcionar na hora. Quem estiver usando essa credencial recebe
            "token recusado" na chamada seguinte.
          </>
        }
        rotuloConfirmar="Revogar"
        onConfirmar={() => {
          if (aRevogar) revokeMutation.mutate(aRevogar.id)
          setARevogar(null)
        }}
        onCancelar={() => setARevogar(null)}
      />
    </div>
  )
}

export function BroadcastSettingsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, BroadcastSettings>>({})

  const connectionsQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const settingsQuery = useQuery({ queryKey: ['crm-broadcast-settings', clientId], queryFn: () => fetchBroadcastSettings(clientId) })

  const saveMutation = useMutation({
    mutationFn: (s: BroadcastSettings) => saveBroadcastSettings(clientId, s),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-broadcast-settings', clientId] })
      setNotice('Ritmo salvo.')
    },
    onError: (e: Error) => setError(e.message),
  })

  const connections = connectionsQuery.data ?? []
  const saved = settingsQuery.data ?? []

  // O que aparece na tela: o rascunho editado, senão o que veio do banco,
  // senão o padrão de fábrica.
  function settingsFor(connectionId: string): BroadcastSettings {
    return (
      drafts[connectionId] ??
      saved.find((s) => s.connectionId === connectionId) ?? {
        id: null,
        connectionId,
        minIntervalSeconds: 30,
        maxIntervalSeconds: 90,
        dailyCap: 200,
        windowStart: '09:00',
        windowEnd: '20:00',
        pauseOnReply: true,
      }
    )
  }

  return (
    <div>
      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}
      {notice && <CrmNoticeBar message={notice} onClose={() => setNotice(null)} />}

      <p className="mb-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
        Intervalo entre mensagens, teto diário e janela de horário: o que protege o número de ser bloqueado. Vale por
        conexão.
      </p>

      {connectionsQuery.isLoading ? (
        <CrmLoading />
      ) : connections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-surface py-10 text-center text-sm text-ink-4">
          Nenhuma conexão criada ainda. Crie uma em Conexões pra configurar o ritmo dela.
        </p>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => {
            const s = settingsFor(c.id)
            const update = (patch: Partial<BroadcastSettings>) => setDrafts({ ...drafts, [c.id]: { ...s, ...patch } })
            return (
              <div key={c.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{c.name}</p>
                  <button type="button" onClick={() => saveMutation.mutate(s)} disabled={saveMutation.isPending} className={primaryButtonClass}>
                    <Save size={13} /> Salvar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <CrmField label="Intervalo mínimo (s)">
                    <input
                      type="number"
                      value={s.minIntervalSeconds}
                      onChange={(e) => update({ minIntervalSeconds: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </CrmField>
                  <CrmField label="Intervalo máximo (s)">
                    <input
                      type="number"
                      value={s.maxIntervalSeconds}
                      onChange={(e) => update({ maxIntervalSeconds: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </CrmField>
                  <CrmField label="Teto diário">
                    <input type="number" value={s.dailyCap} onChange={(e) => update({ dailyCap: Number(e.target.value) })} className={inputClass} />
                  </CrmField>
                  <CrmField label="Começa às">
                    <input type="time" value={s.windowStart} onChange={(e) => update({ windowStart: e.target.value })} className={inputClass} />
                  </CrmField>
                  <CrmField label="Para às">
                    <input type="time" value={s.windowEnd} onChange={(e) => update({ windowEnd: e.target.value })} className={inputClass} />
                  </CrmField>
                  <div className="flex items-end">
                    <CrmToggle checked={s.pauseOnReply} onChange={(v) => update({ pauseOnReply: v })} label="Parar ao responder" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function GeneralSettingsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Awaited<ReturnType<typeof fetchCrmSettings>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const query = useQuery({ queryKey: ['crm-settings', clientId], queryFn: () => fetchCrmSettings(clientId) })
  const current = form ?? query.data

  const saveMutation = useMutation({
    mutationFn: () => saveCrmSettings(clientId, current!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-settings', clientId] })
      setNotice('Configurações salvas.')
    },
    onError: (e: Error) => setError(e.message),
  })

  if (query.isLoading || !current) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-ink-4">
        <Loader2 size={15} className="animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}
      {notice && <CrmNoticeBar message={notice} onClose={() => setNotice(null)} />}

      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <CrmField label="Mensagem de boas-vindas" hint="Vai no primeiro contato, quando não houver fluxo de boas-vindas na conexão.">
          <textarea
            value={current.greetingMessage}
            onChange={(e) => setForm({ ...current, greetingMessage: e.target.value })}
            rows={3}
            className={inputClass}
          />
        </CrmField>
        <CrmToggle
          checked={current.autoAssign}
          onChange={(v) => setForm({ ...current, autoAssign: v })}
          label="Atribuir automaticamente"
          hint="Distribui a conversa nova pra quem estiver com menos chats."
        />
        <CrmField label="Resolver sozinho após (minutos)" hint="0 = nunca resolve sozinho.">
          <input
            type="number"
            min={0}
            value={current.resolveAfterMinutes}
            onChange={(e) => setForm({ ...current, resolveAfterMinutes: Number(e.target.value) })}
            className={inputClass}
          />
        </CrmField>
        <CrmField
          label="Fuso horário"
          hint="É o relógio que vale nos Horários de atendimento e nos campos {hora}, {data} e {dia}."
        >
          <Selecao value={current.timezone} onChange={(e) => setForm({ ...current, timezone: e.target.value })} className={inputClass}>
            <option value="America/Sao_Paulo">America/Sao_Paulo</option>
            <option value="America/Manaus">America/Manaus</option>
            <option value="America/Cuiaba">America/Cuiaba</option>
            <option value="America/Belem">America/Belem</option>
            <option value="America/Rio_Branco">America/Rio_Branco</option>
          </Selecao>
        </CrmField>

        <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          A mensagem de fora do expediente saiu daqui. Ela virou parte de Horários, onde vale por conexão e é enviada de
          verdade. Antes esta caixa gravava um texto que ninguém lia.
        </p>

        <div className="flex justify-end">
          <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className={primaryButtonClass}>
            <Save size={14} /> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

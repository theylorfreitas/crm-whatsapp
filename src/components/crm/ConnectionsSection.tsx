import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Plus, QrCode, RefreshCw, LogOut, Trash2, MessageCircle, KeyRound, ShieldCheck } from 'lucide-react'
import {
  fetchConnections,
  createConnection,
  deleteConnection,
  startConnectionSession,
  refreshConnectionStatus,
  logoutConnection,
  conectarOficial,
  desligarOficial,
  type ConnectionKind,
  type ConnectionSession,
} from '../../lib/db/crmConnections'
import { fetchSubscription } from '../../lib/db/crmBilling'
import { CrmLoading } from './CrmDataStates'
import { Sensivel } from '../ui/Sensivel'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmTable,
  CrmErrorBar,
  CrmConnectHint,
} from './ui/CrmUi'

// Conexões de WhatsApp. O QR vem do serviço na VPS pelo nosso backend; sem
// esse serviço configurado a tela diz exatamente o que falta em vez de
// mostrar um QR falso.

export function ConnectionsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  // `data: null` = o modal já está aberto e o QR ainda vem vindo. Abrir só
  // depois da resposta deixava vários segundos de tela parada depois do
  // clique, sem nada dizendo que alguma coisa estava acontecendo.
  const [session, setSession] = useState<{
    connectionId: string
    data: ConnectionSession | null
    /** Oficial não tem QR pra ler: o modal mostra o formulário da Meta. */
    oficial: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const connectionsQuery = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const subscriptionQuery = useQuery({ queryKey: ['crm-subscription', clientId], queryFn: () => fetchSubscription(clientId) })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-connections', clientId] })

  const connectMutation = useMutation({
    mutationFn: startConnectionSession,
    onSuccess: (data, connectionId) => {
      setSession((s) => ({ connectionId, data, oficial: s?.oficial ?? false }))
      invalidate()
    },
    onError: (e: Error) => {
      setSession(null)
      setError(e.message)
    },
  })
  const refreshMutation = useMutation({
    mutationFn: refreshConnectionStatus,
    onSuccess: (data, connectionId) => {
      setSession((s) => ({ connectionId, data, oficial: s?.oficial ?? false }))
      invalidate()

      // O WhatsApp não espera pra sempre: passados uns minutos sem ninguém
      // escanear, ele encerra a sessão. Sem isto o modal ficaria aberto com um
      // quadrado morto e a pessoa escaneando um código que já não vale —
      // exatamente a cara de "o QR não aparece". Levantar de novo devolve um
      // código válido sem exigir fechar e reabrir a janela.
      // Só no QR: na conexão oficial não existe código pra renovar, e
      // relevantar a sessão viraria um laço de chamadas à Meta.
      if (
        !session?.oficial &&
        data.configured &&
        !data.qrCode &&
        data.status !== 'conectada' &&
        !connectMutation.isPending
      ) {
        connectMutation.mutate(connectionId)
      }
    },
    onError: (e: Error) => setError(e.message),
  })

  const logoutMutation = useMutation({
    mutationFn: logoutConnection,
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const desligarMutation = useMutation({
    mutationFn: desligarOficial,
    onSuccess: () => {
      setSession(null)
      invalidate()
    },
    onError: (e: Error) => setError(e.message),
  })

  /** Um clique só: abre o modal na hora e já pede a sessão. */
  const conectar = (connectionId: string, oficial: boolean) => {
    setError(null)
    setSession({ connectionId, data: null, oficial })
    connectMutation.mutate(connectionId)
  }

  // O QR do WhatsApp roda sozinho a cada poucos segundos: o que está na tela
  // envelhece e passa a dar "código inválido" no celular. Enquanto o modal
  // estiver aberto e a sessão não tiver conectado, buscar de novo é o que
  // mantém na tela um código que ainda funciona — e é também o que faz a tela
  // perceber sozinha o pareamento, sem ninguém clicar em "Já escaneei".
  // A releitura automática é do QR: é o código que envelhece e vira "código
  // inválido" no celular. Na oficial não há nada envelhecendo, e reperguntar de
  // 15 em 15 segundos só gastaria chamada na Meta.
  const conexaoEmLeitura =
    session != null && !session.oficial && session.data?.configured === true && session.data.status !== 'conectada'
      ? session.connectionId
      : null

  useEffect(() => {
    if (!conexaoEmLeitura) return
    // 8s, e não 15: o WhatsApp troca o código a cada ~20 segundos, e o que está
    // na tela morre junto. Com 15 o código exibido podia estar vencido há
    // vários segundos na hora de escanear — e o celular respondia "código
    // inválido", que a pessoa lê como "o sistema não funciona". Aqui a janela
    // de código morto encolhe pra menos da metade, e é uma chamada a mais só
    // enquanto o modal está aberto.
    const id = window.setInterval(() => refreshMutation.mutate(conexaoEmLeitura), 8_000)
    return () => window.clearInterval(id)
    // refreshMutation vem do useMutation e troca de identidade a cada render;
    // pô-la aqui recriaria o intervalo sem parar e o QR nunca completaria 15s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexaoEmLeitura])

  const connections = connectionsQuery.data ?? []
  const connected = connections.filter((c) => c.status === 'conectada').length
  const disconnected = connections.length - connected
  const subscription = subscriptionQuery.data
  const slots = (subscription?.slotsStarter ?? 0) + (subscription?.slotsPro ?? 0)

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Smartphone size={17} className="text-ink-4" />
            Conexões
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">Números de WhatsApp ligados a este workspace.</p>
        </div>
        <button type="button" onClick={() => setNewOpen(true)} className={primaryButtonClass}>
          <Plus size={14} /> Nova Conexão
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      {/* Três cartões grandes pra três números de um dígito ocupavam a dobra
          inteira antes da lista, que é o que a pessoa veio ver. Uma linha só
          diz o mesmo. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
        {[
          { label: 'conectadas', value: connected, dot: 'bg-ok' },
          { label: 'desconectadas', value: disconnected, dot: 'bg-danger' },
          { label: `${slots === 1 ? 'slot contratado' : 'slots contratados'}`, value: slots, dot: 'bg-line-strong' },
        ].map((c) => (
          <span key={c.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
            <span className="font-semibold tabular-nums text-ink">{c.value}</span>
            <span className="text-ink-3">{c.label}</span>
          </span>
        ))}
      </div>

      {connectionsQuery.isLoading ? (
        <CrmLoading />
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
          <MessageCircle size={26} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">Nenhuma conexão criada</p>
          <p className="mt-1 text-xs text-ink-4">
            Crie uma conexão pra escanear o QR Code e começar a atender pelo WhatsApp.
          </p>
        </div>
      ) : (
        <CrmTable head={['Conexão', 'Status', 'Ações']}>
          {connections.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <Sensivel as="div" className="text-xs text-ink-4">
                  {c.phone ?? 'sem número conectado'}
                </Sensivel>
                {/* Só faz sentido depois do pareamento: é o nome do perfil que
                    está do outro lado, e é o que distingue dois números. */}
                {c.deviceName && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
                    <Smartphone size={11} className="text-ink-4" />
                    {c.deviceName}
                  </p>
                )}
                {/* O tipo é uma propriedade da conexão, não uma coluna: em
                    coluna própria comia 15% da largura pra repetir a mesma
                    palavra em todas as linhas. */}
                <CrmPill tone={c.kind === 'oficial' ? 'azul' : 'roxo'}>
                  {c.kind === 'oficial' ? 'API Oficial (Meta)' : 'API Web'}
                </CrmPill>
              </td>
              <td className="px-4 py-3">
                <CrmPill
                  tone={c.status === 'conectada' ? 'verde' : c.status === 'conectando' ? 'amarelo' : c.status === 'erro' ? 'vermelho' : 'cinza'}
                >
                  {c.status}
                </CrmPill>
                {c.statusDetail && <p className="mt-1 max-w-xs text-[10px] text-ink-4">{c.statusDetail}</p>}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => conectar(c.id, c.kind === 'oficial')}
                    disabled={connectMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                  >
                    {c.kind === 'oficial' ? <KeyRound size={12} /> : <QrCode size={12} />}
                    {c.kind === 'oficial' ? (c.cloudPhoneId ? 'Credenciais' : 'Conectar') : 'Conectar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshMutation.mutate(c.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                  >
                    <RefreshCw size={12} /> Atualizar
                  </button>
                  {/* Desconectar quer dizer coisas diferentes nos dois canais:
                      no QR derruba o pareamento do celular; na oficial apaga o
                      token e devolve a conexão ao QR. Um botão só, com o
                      caminho certo por trás. */}
                  <button
                    type="button"
                    onClick={() => {
                      if (c.kind !== 'oficial') return logoutMutation.mutate(c.id)
                      if (window.confirm(`Apagar as credenciais da Meta de "${c.name}"?`)) desligarMutation.mutate(c.id)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                  >
                    <LogOut size={12} /> Desconectar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Apagar a conexão "${c.name}"?`)) deleteMutation.mutate(c.id)
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

      <NewConnectionModal
        open={newOpen}
        clientId={clientId}
        slots={slots}
        used={connections.length}
        onClose={() => setNewOpen(false)}
        onCreated={invalidate}
      />

      {/* A conexão oficial não tem QR: ela se liga por credenciais do painel da
          Meta. Um modal separado porque não há nada em comum — nem o que se
          mostra, nem o que se faz, nem o que dá errado. */}
      {session?.oficial && (
        <ModalOficial
          connectionId={session.connectionId}
          estado={session.data}
          onFechar={() => setSession(null)}
          onSalvo={() => {
            invalidate()
            refreshMutation.mutate(session.connectionId)
          }}
        />
      )}

      {session && !session.oficial && (
        <CrmModal
          open
          title="Conectar WhatsApp"
          description="Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho."
          onClose={() => setSession(null)}
          footer={
            <>
              <button type="button" onClick={() => refreshMutation.mutate(session.connectionId)} className={ghostButtonClass}>
                <RefreshCw size={14} /> Já escaneei
              </button>
              <button type="button" onClick={() => setSession(null)} className={primaryButtonClass}>
                Fechar
              </button>
            </>
          }
        >
          {!session.data ? (
            // A instância leva alguns segundos pra ficar pronta e pedir o código.
            // Um quadrado pulsando diz "está vindo"; a tela vazia dizia "travou".
            <div className="py-6 text-center">
              <div className="mx-auto h-56 w-56 animate-pulse rounded-lg bg-canvas" />
              <p className="mt-3 text-xs text-ink-3">Preparando o QR Code…</p>
            </div>
          ) : !session.data.configured ? (
            <CrmConnectHint
              title="Serviço de QR ainda não configurado"
              detail={session.data.detail ?? 'Falta configurar o serviço de QR no servidor (WHATSAPP_BRIDGE_URL).'}
            />
          ) : session.data.status === 'conectada' ? (
            <div className="py-4 text-center">
              <CrmPill tone="verde">conectada</CrmPill>
              <p className="mt-2 text-sm font-medium text-ink">
                {session.data.deviceName ? `Conectado como “${session.data.deviceName}”` : 'WhatsApp conectado.'}
              </p>
              <p className="mt-1 text-xs text-ink-3">Já pode fechar. As mensagens começam a chegar em Chats ao vivo.</p>
            </div>
          ) : session.data.qrCode ? (
            <div className="text-center">
              <img src={session.data.qrCode} alt="QR Code para conectar o WhatsApp" className="mx-auto h-56 w-56" />
              <p className="mt-2 text-xs text-ink-3">
                O código se renova sozinho a cada poucos segundos — deixe esta janela aberta enquanto escaneia.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <CrmPill tone="amarelo">{session.data.status}</CrmPill>
              <p className="mt-2 text-xs text-ink-3">{session.data.detail ?? 'Sem QR no momento. Atualize o status.'}</p>
            </div>
          )}
        </CrmModal>
      )}
    </div>
  )
}

/**
 * As credenciais da Cloud API.
 *
 * O token é escrito uma vez e some: ele vai pro backend, que guarda numa tabela
 * sem política de RLS. Reabrir esta tela mostra o campo vazio de propósito —
 * não há como trazer de volta, e é isso que impede que ele apareça no navegador
 * de quem tiver acesso à tela.
 */
function ModalOficial({
  connectionId,
  estado,
  onFechar,
  onSalvo,
}: {
  connectionId: string
  estado: ConnectionSession | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [phoneId, setPhoneId] = useState('')
  const [token, setToken] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: () =>
      conectarOficial(connectionId, { phoneId: phoneId.trim(), token: token.trim(), wabaId: wabaId.trim() || undefined }),
    onSuccess: () => {
      setToken('')
      setErro(null)
      onSalvo()
    },
    onError: (e: Error) => setErro(e.message),
  })

  const jaLigada = estado?.configured === true

  return (
    <CrmModal
      open
      title="Conexão oficial (Meta)"
      onClose={onFechar}
      footer={
        <>
          <button type="button" onClick={onFechar} className={ghostButtonClass}>
            Fechar
          </button>
          <button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending || phoneId.trim().length < 5 || token.trim().length < 20}
            className={primaryButtonClass}
          >
            <ShieldCheck size={14} /> {salvar.isPending ? 'Conferindo com a Meta…' : 'Conectar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* O estado vem da META, não do que está gravado: token revogado,
            empresa em restrição e cartão recusado acontecem sem avisar, e o
            sintoma é o bot ficar mudo — a API aceita a mensagem, devolve um id,
            e o cliente nunca recebe. */}
        {estado && (
          <div
            className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
              estado.status === 'conectada' ? 'border-ok bg-ok-bg text-ok-ink' : 'border-warn bg-warn-bg text-warn-ink'
            }`}
          >
            <strong>{estado.status === 'conectada' ? 'Pronta para enviar.' : jaLigada ? 'A Meta não liberou:' : 'Ainda não configurada.'}</strong>
            {estado.detail && <span> {estado.detail}</span>}
          </div>
        )}

        <CrmField label="ID do número de telefone *" hint="No painel: WhatsApp → Configuração da API. É um número comprido, não é o telefone.">
          <input className={inputClass} value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="000000000000000" />
        </CrmField>

        <CrmField
          label="Token de acesso *"
          hint="Use o token PERMANENTE do usuário do sistema. O temporário do painel vence em 24h e a conexão cai junto."
        >
          <input
            type="password"
            className={inputClass}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={jaLigada ? 'já guardado, preencha só para trocar' : 'EAA…'}
          />
        </CrmField>

        <CrmField label="ID da conta do WhatsApp Business (opcional)" hint="Aparece ao lado do ID do número. Serve para conferência.">
          <input className={inputClass} value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="000000000000000" />
        </CrmField>

        {erro && <p className="rounded-lg border border-danger bg-danger-bg px-3 py-2 text-[11px] text-danger-ink">{erro}</p>}

        <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          <p className="font-semibold text-ink-2">Antes de conectar, saiba que:</p>
          <p className="mt-1">
            • O número usado aqui <strong>sai do WhatsApp comum</strong>: não abre mais no celular nem pareia por QR.
          </p>
          <p>• Em troca, é o único canal em que botões de resposta rápida chegam de verdade ao cliente.</p>
          <p>• Responder o cliente dentro de 24h da mensagem dele é gratuito; iniciar conversa é cobrado.</p>
        </div>
      </div>
    </CrmModal>
  )
}

function NewConnectionModal({
  open,
  clientId,
  slots,
  used,
  onClose,
  onCreated,
}: {
  open: boolean
  clientId: string
  slots: number
  used: number
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ConnectionKind>('uazapi')

  const mutation = useMutation({
    // Sem escolha de plano na criação: quem conecta um número quer conectar o
    // número. O plano é assunto de cobrança, e a coluna já tem o padrão.
    mutationFn: () => createConnection(clientId, { name: name.trim(), kind }),
    onSuccess: () => {
      setName('')
      onCreated()
      onClose()
    },
  })

  const noSlots = slots > 0 && used >= slots

  return (
    <CrmModal
      open={open}
      title="Nova Conexão"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} className={primaryButtonClass}>
            Criar Conexão
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="Nome da Conexão">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex.: WhatsApp Vendas" />
        </CrmField>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-2">Tipo de Conexão</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'uazapi' as const, title: 'QR Code', sub: 'o chip no celular, com botões' },
                { key: 'oficial' as const, title: 'API Oficial', sub: 'WhatsApp Business (Meta)' },
              ]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setKind(opt.key)}
                className={`rounded-lg border px-3 py-2.5 text-left ${
                  kind === opt.key ? 'border-line-strong bg-canvas' : 'border-line hover:bg-canvas'
                }`}
              >
                <span className="block text-sm font-medium text-ink">{opt.title}</span>
                <span className="block text-[11px] text-ink-4">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {noSlots && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-[11px] text-warn-ink">
            Você já usou os {slots} slots contratados. A conexão é criada, mas o envio só liga com um slot livre — ajuste em
            Cobranças e assinaturas.
          </p>
        )}

        <div className="rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          <p className="mb-0.5 font-medium text-ink-2">Próximos passos:</p>
          <p>• A conexão nasce com status “Desconectada”.</p>
          <p>• Depois é só clicar em Conectar e escanear o QR Code com o celular.</p>
        </div>

        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

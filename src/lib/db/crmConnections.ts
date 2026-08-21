import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// Conexões de WhatsApp do cliente. Duas naturezas:
//   'uazapi'  → instância via ponte (QR Code) — entrega BOTÃO, ao contrário do
//               provedor antigo que ela substituiu
//   'oficial' → Cloud API da Meta — precisa de META_APP_ID/META_APP_SECRET
// O token da instância NUNCA fica nesta tabela (vai pra integration_secrets,
// que só o service_role lê). Aqui mora estado e metadata.

export type ConnectionKind = 'uazapi' | 'oficial'
export type ConnectionStatus = 'desconectada' | 'conectando' | 'conectada' | 'erro'

export interface CrmConnection {
  id: string
  name: string
  kind: ConnectionKind
  phone: string | null
  status: ConnectionStatus
  statusDetail: string | null
  plan: 'starter' | 'pro'
  /** Nome do perfil do WhatsApp pareado — o que distingue um número do outro. */
  deviceName: string | null
  instanceId: string | null
  /** O ID do número no painel da Meta. Só na conexão oficial. */
  cloudPhoneId: string | null
  connectedAt: string | null
  disconnectedAt: string | null
  createdAt: string
}

// `cloud_token` NÃO entra aqui, e nem poderia: ele vive em outra tabela, sem
// política de RLS, que só o backend alcança. Este select roda no NAVEGADOR.
const SELECT =
  'id, name, kind, phone, status, status_detail, plan, device_name, instance_id, cloud_phone_id, connected_at, disconnected_at, created_at'

function toConnection(r: Record<string, unknown>): CrmConnection {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as ConnectionKind,
    phone: (r.phone as string) ?? null,
    status: r.status as ConnectionStatus,
    statusDetail: (r.status_detail as string) ?? null,
    plan: r.plan as 'starter' | 'pro',
    deviceName: (r.device_name as string) ?? null,
    instanceId: (r.instance_id as string) ?? null,
    cloudPhoneId: (r.cloud_phone_id as string) ?? null,
    connectedAt: (r.connected_at as string) ?? null,
    disconnectedAt: (r.disconnected_at as string) ?? null,
    createdAt: r.created_at as string,
  }
}

export async function fetchConnections(clientId: string): Promise<CrmConnection[]> {
  const { data, error } = await supabase
    .from('crm_connections')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map(toConnection)
}

export async function createConnection(
  clientId: string,
  input: { name: string; kind: ConnectionKind; plan?: 'starter' | 'pro'; phone?: string },
): Promise<CrmConnection> {
  const { data, error } = await supabase
    .from('crm_connections')
    .insert({
      client_id: clientId,
      name: input.name,
      kind: input.kind,
      plan: input.plan ?? 'starter',
      phone: input.phone || null,
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return toConnection(data)
}

export async function updateConnection(
  id: string,
  input: Partial<{ name: string; phone: string | null; plan: 'starter' | 'pro'; status: ConnectionStatus }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_connections')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.plan !== undefined ? { plan: input.plan } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

/**
 * Exclui a conexão PELO BACKEND, e não direto no banco.
 *
 * Era um `delete` do navegador na tabela, e faltava a metade que importa: o
 * número continua existindo no servidor de WhatsApp depois que a linha some.
 * Ele segue na fatura e, pior, segue ocupando uma das vagas do plano — que é
 * um teto baixo. Duas exclusões bastaram pra encher a conta, e a partir daí
 * nenhum QR Code novo abria, com a lista de conexões vazia na tela.
 *
 * O backend libera a vaga primeiro e só apaga a linha se conseguir. Se ele não
 * conseguir, a exclusão falha com o motivo — de propósito: uma conexão que some
 * da tela e continua cobrando é pior do que uma que não sai.
 */
export async function deleteConnection(id: string): Promise<void> {
  await apiFetch(`/crm/connections/${id}`, { method: 'DELETE' })
}

// ─── Ponte externa ────────────────────────────────────────────────────────
// Pedir o QR Code e checar o estado real da sessão passa pelo NOSSO backend,
// que fala com a ponte usando a URL/segredo do ambiente. O front nunca vê
// credencial nenhuma — só a imagem do QR e o status.

export interface ConnectionSession {
  status: ConnectionStatus
  qrCode: string | null // data URI, quando a ponte devolve um QR
  detail: string | null
  configured: boolean // false = falta WHATSAPP_BRIDGE_URL no ambiente
  deviceName?: string | null
}

export async function startConnectionSession(connectionId: string): Promise<ConnectionSession> {
  return apiFetch<ConnectionSession>('/crm/connections/session', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  })
}

export async function refreshConnectionStatus(connectionId: string): Promise<ConnectionSession> {
  return apiFetch<ConnectionSession>(`/crm/connections/${connectionId}/status`)
}

/**
 * Põe as conversas em dia. Chamada sozinha quando o CRM abre — não há botão.
 *
 * O webhook já traz o que chega ao vivo; isto existe para o buraco de quando a
 * ponte esteve fora do ar, porque o WhatsApp NÃO reentrega o que perdeu.
 *
 * Na primeira vez varre o aparelho inteiro; depois só o trecho recente de cada
 * conversa. Volta assim que a ponte aceita — a leitura roda em segundo plano, e
 * as conversas vão aparecendo conforme entram.
 */
export async function syncConnections(clientId?: string): Promise<{ sincronizadas: number }> {
  return apiFetch<{ sincronizadas: number }>('/crm/connections/sync', {
    method: 'POST',
    body: JSON.stringify(clientId ? { clientId } : {}),
  })
}

// ─── Conexão oficial (Cloud API da Meta) ──────────────────────────────────
// O token vai pro backend e para lá: ele guarda numa tabela que só o
// service_role enxerga, e o navegador nunca mais o vê. Reabrir a tela mostra
// os campos vazios de propósito — não há como (nem por que) trazer de volta.

/**
 * Liga a conexão à Cloud API.
 *
 * O backend confere as credenciais com a Meta ANTES de gravar. Guardar uma
 * credencial que não funciona trocaria o canal de envio da conexão, e o cliente
 * perderia o WhatsApp sem ninguém perceber até a primeira mensagem sumir.
 */
export async function conectarOficial(
  connectionId: string,
  input: { phoneId: string; token: string; wabaId?: string },
): Promise<{ status: ConnectionStatus; detail: string | null; phone: string | null; name: string | null }> {
  return apiFetch(`/crm/connections/${connectionId}/cloud`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Apaga o token e devolve a conexão ao QR Code. */
export async function desligarOficial(connectionId: string): Promise<void> {
  await apiFetch(`/crm/connections/${connectionId}/cloud/remover`, { method: 'POST' })
}

export async function logoutConnection(connectionId: string): Promise<void> {
  await apiFetch('/crm/connections/logout', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  })
}

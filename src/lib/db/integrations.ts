import { supabase } from '../supabaseClient'

// Estado das integrações externas. Duas fontes combinadas:
//   1. backend /integrations/status → quais provedores têm CREDENCIAL no
//      ambiente (a chave nunca chega ao front, só um boolean).
//   2. tabela integration_connections → estado por cliente (conta conectada,
//      @usuário, quando conectou).
// Enquanto a credencial não existe, a tela mostra "conecte X" de verdade.

export type Provider = 'meta' | 'claude_cloud' | 'whatsapp' | 'frappe'

export interface ProviderEnvStatus {
  provider: Provider
  configured: boolean // credencial presente no ambiente do backend
  detail: string | null
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export async function fetchProviderEnvStatus(): Promise<Record<Provider, ProviderEnvStatus>> {
  const empty: Record<Provider, ProviderEnvStatus> = {
    meta: { provider: 'meta', configured: false, detail: null },
    claude_cloud: { provider: 'claude_cloud', configured: false, detail: null },
    whatsapp: { provider: 'whatsapp', configured: false, detail: null },
    frappe: { provider: 'frappe', configured: false, detail: null },
  }
  try {
    const res = await fetch(`${API_URL}/integrations/status`)
    if (!res.ok) return empty
    const body = (await res.json()) as { providers: ProviderEnvStatus[] }
    for (const p of body.providers) empty[p.provider] = p
    return empty
  } catch {
    // backend fora do ar = nada configurado; as telas mostram "conecte X"
    return empty
  }
}

export interface ClientConnection {
  id: string
  provider: Provider
  status: 'not_connected' | 'pending' | 'connected' | 'error'
  externalAccount: string | null
  connectedAt: string | null
}

export async function fetchClientConnections(clientId: string): Promise<ClientConnection[]> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('id, provider, status, external_account, connected_at')
    .eq('client_id', clientId)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider,
    status: r.status,
    externalAccount: r.external_account,
    connectedAt: r.connected_at,
  }))
}

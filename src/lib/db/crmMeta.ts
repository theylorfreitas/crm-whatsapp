import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// Facebook/Meta Ads. Nada é ativado automaticamente: o cliente faz login na
// Meta, escolhe em "Perfis e contas" o que entra no painel, e só o que está
// marcado (selected) alimenta campanhas e o gasto do painel.

export type MetaAssetKind = 'conta_anuncio' | 'pagina' | 'pixel' | 'perfil'

export interface MetaAsset {
  id: string
  kind: MetaAssetKind
  externalId: string
  name: string
  selected: boolean
  syncedAt: string | null
}

export async function fetchMetaAssets(clientId: string): Promise<MetaAsset[]> {
  const { data, error } = await supabase
    .from('crm_meta_assets')
    .select('id, kind, external_id, name, selected, synced_at')
    .eq('client_id', clientId)
    .order('kind')
    .order('name')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    externalId: r.external_id,
    name: r.name,
    selected: r.selected,
    syncedAt: r.synced_at,
  }))
}

export async function setAssetSelected(id: string, selected: boolean): Promise<void> {
  const { error } = await supabase.from('crm_meta_assets').update({ selected }).eq('id', id)
  if (error) throw error
}

export interface MetaCampaign {
  id: string
  campaignId: string
  accountExternalId: string
  name: string
  status: string | null
  objective: string | null
  spend: number
  impressions: number
  clicks: number
  results: number
  day: string
}

export async function fetchMetaCampaigns(clientId: string, fromDay?: string): Promise<MetaCampaign[]> {
  let q = supabase
    .from('crm_meta_campaigns')
    .select('id, campaign_id, account_external_id, name, status, objective, spend, impressions, clicks, results, day')
    .eq('client_id', clientId)
  if (fromDay) q = q.gte('day', fromDay)
  const { data, error } = await q.order('day', { ascending: false }).limit(1000)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    accountExternalId: r.account_external_id,
    name: r.name,
    status: r.status,
    objective: r.objective,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    results: Number(r.results),
    day: r.day,
  }))
}

// Sincronizar puxa da Graph API pelo backend (que tem META_APP_ID/SECRET e o
// token do cliente). Sem credencial, devolve configured:false e a tela pede
// o login na Meta — nunca inventa números.
export interface MetaSyncResult {
  configured: boolean
  synced: number
  detail: string | null
}

export async function syncMetaAssets(clientId: string): Promise<MetaSyncResult> {
  return apiFetch<MetaSyncResult>('/crm/meta/sync-assets', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  })
}

export async function syncMetaInsights(clientId: string, days = 30): Promise<MetaSyncResult> {
  return apiFetch<MetaSyncResult>('/crm/meta/sync-insights', {
    method: 'POST',
    body: JSON.stringify({ clientId, days }),
  })
}

// Agrega campanhas por campaign_id (a tabela guarda uma linha por dia).
export interface CampaignTotals {
  campaignId: string
  name: string
  status: string | null
  objective: string | null
  spend: number
  impressions: number
  clicks: number
  results: number
}

export function aggregateCampaigns(rows: MetaCampaign[]): CampaignTotals[] {
  const map = new Map<string, CampaignTotals>()
  for (const r of rows) {
    const current = map.get(r.campaignId) ?? {
      campaignId: r.campaignId,
      name: r.name,
      status: r.status,
      objective: r.objective,
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
    }
    current.spend += r.spend
    current.impressions += r.impressions
    current.clicks += r.clicks
    current.results += r.results
    map.set(r.campaignId, current)
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend)
}

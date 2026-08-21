import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// Meu Site (config do site do cliente), arquivos do Claude Code, membros e
// configurações do workspace.

// ─── Meu Site ─────────────────────────────────────────────────────────────

export interface SiteConfig {
  config: Record<string, unknown>
  published: boolean
  publishedAt: string | null
}

export async function fetchSiteConfig(clientId: string): Promise<SiteConfig | null> {
  const { data, error } = await supabase
    .from('site_configs')
    .select('config, published, published_at')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return data ? { config: data.config ?? {}, published: data.published, publishedAt: data.published_at } : null
}

export async function saveSiteConfig(clientId: string, config: Record<string, unknown>): Promise<void> {
  // upsert com onConflict pra não duplicar quando a linha já veio do
  // provisionamento; só a coluna `config` é tocada.
  const { error } = await supabase
    .from('site_configs')
    .upsert({ client_id: clientId, config }, { onConflict: 'client_id' })
  if (error) throw error
}

export async function setSitePublished(clientId: string, published: boolean): Promise<void> {
  // UPDATE, nunca upsert: um upsert aqui reescreveria a linha inteira e
  // zeraria o `config` (o conteúdo do site) junto.
  const { error } = await supabase
    .from('site_configs')
    .update({ published, published_at: published ? new Date().toISOString() : null })
    .eq('client_id', clientId)
  if (error) throw error
}

// ─── Arquivos do Claude Code ──────────────────────────────────────────────
//
// Estas funções liam a tabela `claude_files`. A tabela estava VAZIA em
// produção, para todo cliente, e ia continuar: quem escreve os arquivos é o
// Claude, e ele escreve na PASTA do cliente no disco da ponte — a mesma que
// nasce semeada com o repositório CRM (CLAUDE.md, _memoria com o contexto da
// empresa, identidade, saidas).
//
// Eram dois mundos com o mesmo nome. O cliente abria o Claude Code e via uma
// tela vazia, enquanto o Claude com quem ele conversava ao lado tinha tudo
// aquilo na mão. E quando o Claude criava um arquivo, a tela recarregava a
// TABELA, que ele nunca tocava: o explorador atualizava e continuava vazio.
//
// Agora existe uma fonte só, a pasta, lida pelo backend através da ponte.
//
// O CAMINHO É O IDENTIFICADOR. Não há linha em banco, então não há id: o que
// identifica um arquivo numa pasta é onde ele está. As telas continuam
// chamando de `id` porque para elas nada mudou.

export interface ClaudeFile {
  id: string
  path: string
  content: string
  sizeBytes: number
  updatedAt: string
}

interface ArquivoDaPonte {
  caminho: string
  tamanho: number
  alteradoEm: string
}

export async function fetchFiles(clientId: string): Promise<Omit<ClaudeFile, 'content'>[]> {
  const r = await apiFetch<{ arquivos: ArquivoDaPonte[] }>('/ai/arquivos', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  })
  return r.arquivos.map((a) => ({
    id: a.caminho,
    path: a.caminho,
    sizeBytes: a.tamanho,
    updatedAt: a.alteradoEm,
  }))
}

/**
 * O conteúdo de um arquivo.
 *
 * Precisa do cliente porque o caminho sozinho não diz de quem é a pasta — e é
 * justamente essa checagem que impede um workspace de ler o arquivo de outro.
 */
export async function fetchFileContent(clientId: string, caminho: string): Promise<ClaudeFile> {
  const r = await apiFetch<ArquivoDaPonte & { conteudo: string }>('/ai/arquivo/ler', {
    method: 'POST',
    body: JSON.stringify({ clientId, caminho }),
  })
  return {
    id: r.caminho,
    path: r.caminho,
    content: r.conteudo,
    sizeBytes: r.tamanho,
    updatedAt: r.alteradoEm,
  }
}

export async function createFile(clientId: string, path: string, content = ''): Promise<void> {
  await apiFetch('/ai/arquivo/gravar', {
    method: 'POST',
    body: JSON.stringify({ clientId, caminho: path, conteudo: content }),
  })
}

export async function saveFile(clientId: string, caminho: string, content: string): Promise<void> {
  await apiFetch('/ai/arquivo/gravar', {
    method: 'POST',
    body: JSON.stringify({ clientId, caminho, conteudo: content }),
  })
}

export async function deleteFile(clientId: string, caminho: string): Promise<void> {
  await apiFetch('/ai/arquivo/apagar', { method: 'POST', body: JSON.stringify({ clientId, caminho }) })
}

export interface WorkspaceMember {
  id: string
  email: string
  displayName: string | null
  role: 'proprietario' | 'admin' | 'atendente' | 'membro' | 'leitura'
  permissions: Record<string, boolean>
}

export async function fetchMembers(clientId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, email, display_name, role, permissions')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    permissions: r.permissions ?? {},
  }))
}

export async function addMember(clientId: string, input: { email: string; displayName?: string; role: WorkspaceMember['role'] }): Promise<void> {
  const { error } = await supabase.from('workspace_members').insert({
    client_id: clientId,
    email: input.email,
    display_name: input.displayName ?? null,
    role: input.role,
  })
  if (error) throw error
}

export async function updateMember(id: string, input: Partial<Pick<WorkspaceMember, 'role' | 'permissions'>>): Promise<void> {
  const { error } = await supabase.from('workspace_members').update(input).eq('id', id)
  if (error) throw error
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('workspace_members').delete().eq('id', id)
  if (error) throw error
}

// ─── Configurações do workspace ───────────────────────────────────────────

export interface WorkspaceSettings {
  notifications: Record<string, boolean>
  preferences: Record<string, unknown>
}

export async function fetchWorkspaceSettings(clientId: string): Promise<WorkspaceSettings> {
  const { data, error } = await supabase
    .from('workspace_settings')
    .select('notifications, preferences')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return {
    notifications: (data?.notifications ?? {}) as Record<string, boolean>,
    preferences: (data?.preferences ?? {}) as Record<string, unknown>,
  }
}

export async function saveWorkspaceSettings(clientId: string, s: Partial<WorkspaceSettings>): Promise<void> {
  // Mesmo cuidado do site: onConflict explícito, e só os campos enviados —
  // salvar notificações não pode apagar as preferências, e vice-versa.
  const { error } = await supabase.from('workspace_settings').upsert(
    {
      client_id: clientId,
      ...(s.notifications !== undefined ? { notifications: s.notifications } : {}),
      ...(s.preferences !== undefined ? { preferences: s.preferences } : {}),
    },
    { onConflict: 'client_id' },
  )
  if (error) throw error
}

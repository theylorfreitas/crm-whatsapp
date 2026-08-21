import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// Tudo que a tela "Configurações" do CRM administra. Um arquivo só porque
// são todos CRUDs pequenos sobre o mesmo client_id.
//
// A exceção é Integrações: o token dela passa pelo BACKEND, porque tudo que
// este arquivo grava direto no Supabase é lido pelo navegador depois.

// ─── Etiquetas ────────────────────────────────────────────────────────────

export interface CrmTag {
  id: string
  name: string
  color: string
}

export async function fetchTags(clientId: string): Promise<CrmTag[]> {
  const { data, error } = await supabase.from('crm_tags').select('id, name, color').eq('client_id', clientId).order('name')
  if (error) throw error
  return data ?? []
}

export async function createTag(clientId: string, input: { name: string; color: string }): Promise<void> {
  const { error } = await supabase.from('crm_tags').insert({ client_id: clientId, ...input })
  if (error) throw error
}

export async function updateTag(id: string, input: Partial<{ name: string; color: string }>): Promise<void> {
  const { error } = await supabase.from('crm_tags').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from('crm_tags').delete().eq('id', id)
  if (error) throw error
}

// ─── Departamentos ────────────────────────────────────────────────────────

export interface CrmDepartment {
  id: string
  name: string
  description: string | null
  color: string
}

export async function fetchDepartments(clientId: string): Promise<CrmDepartment[]> {
  const { data, error } = await supabase
    .from('crm_departments')
    .select('id, name, description, color')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createDepartment(
  clientId: string,
  input: { name: string; description?: string; color: string },
): Promise<void> {
  const { error } = await supabase
    .from('crm_departments')
    .insert({ client_id: clientId, name: input.name, description: input.description || null, color: input.color })
  if (error) throw error
}

export async function updateDepartment(
  id: string,
  input: Partial<{ name: string; description: string | null; color: string }>,
): Promise<void> {
  const { error } = await supabase.from('crm_departments').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('crm_departments').delete().eq('id', id)
  if (error) throw error
}

// ─── Respostas rápidas ────────────────────────────────────────────────────
//
// Uma resposta rápida deixou de ser um texto e passou a ser uma LISTA de
// conteúdos, na ordem de envio. Quem responde "segue a tabela de preços" quer
// mandar a frase e o PDF, não escolher entre os dois.

export type TipoDeConteudo = 'texto' | 'imagem' | 'video' | 'audio' | 'documento' | 'sticker'

export interface ConteudoDaResposta {
  kind: TipoDeConteudo
  /** No item de texto é a mensagem; nos de mídia, a legenda. */
  text?: string
  /** URL pública no Storage. Vazia enquanto o arquivo não subiu. */
  url?: string
  fileName?: string
  /** Em bytes, só pra tela mostrar "398.5 KB" sem ir buscar o arquivo. */
  size?: number
}

export interface QuickReply {
  id: string
  shortcut: string
  items: ConteudoDaResposta[]
}

export async function fetchQuickReplies(clientId: string): Promise<QuickReply[]> {
  const { data, error } = await supabase
    .from('crm_quick_replies')
    .select('id, shortcut, items')
    .eq('client_id', clientId)
    .order('shortcut')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    shortcut: r.shortcut,
    items: Array.isArray(r.items) ? (r.items as ConteudoDaResposta[]) : [],
  }))
}

export async function createQuickReply(clientId: string, input: Omit<QuickReply, 'id'>): Promise<void> {
  const { error } = await supabase
    .from('crm_quick_replies')
    .insert({ client_id: clientId, shortcut: input.shortcut, items: input.items })
  if (error) throw error
}

export async function updateQuickReply(id: string, input: Partial<Omit<QuickReply, 'id'>>): Promise<void> {
  const { error } = await supabase
    .from('crm_quick_replies')
    .update({
      ...(input.shortcut !== undefined ? { shortcut: input.shortcut } : {}),
      ...(input.items !== undefined ? { items: input.items } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteQuickReply(id: string): Promise<void> {
  const { error } = await supabase.from('crm_quick_replies').delete().eq('id', id)
  if (error) throw error
}

// ─── Templates de WhatsApp (WABA) ─────────────────────────────────────────

export interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  category: 'marketing' | 'utility' | 'authentication'
  header: string | null
  body: string
  footer: string | null
  status: 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado'
  metaTemplateId: string | null
  rejectionReason: string | null
}

export async function fetchTemplates(clientId: string): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabase
    .from('crm_whatsapp_templates')
    .select('id, name, language, category, header, body, footer, status, meta_template_id, rejection_reason')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    language: r.language,
    category: r.category,
    header: r.header,
    body: r.body,
    footer: r.footer,
    status: r.status,
    metaTemplateId: r.meta_template_id,
    rejectionReason: r.rejection_reason,
  }))
}

export async function createTemplate(
  clientId: string,
  input: Pick<WhatsAppTemplate, 'name' | 'language' | 'category' | 'body'> & { header?: string; footer?: string },
): Promise<void> {
  const { error } = await supabase.from('crm_whatsapp_templates').insert({
    client_id: clientId,
    name: input.name,
    language: input.language,
    category: input.category,
    body: input.body,
    header: input.header || null,
    footer: input.footer || null,
  })
  if (error) throw error
}

export async function updateTemplate(
  id: string,
  input: Partial<Pick<WhatsAppTemplate, 'name' | 'language' | 'category' | 'body' | 'header' | 'footer' | 'status'>>,
): Promise<void> {
  const { error } = await supabase.from('crm_whatsapp_templates').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('crm_whatsapp_templates').delete().eq('id', id)
  if (error) throw error
}

// Contas e Acesso de suporte saíram das Configurações: eram cadastro sem
// consumidor. Nenhuma outra parte do CRM lia uma conta, e o acesso de suporte
// não concedia acesso a nada — era um registro do que teria sido concedido.
//
// As TABELAS ficam no banco de propósito: quem já cadastrou contas não perde o
// que digitou, e `crm_contacts.account_id` ainda aponta pra lá. Apagá-las é uma
// decisão separada, e destrutiva.

// ─── Convites ─────────────────────────────────────────────────────────────
//
// O CARTÃO de convites saiu das Configurações, não o convite. Ele já existia
// duas vezes na tela: em Configurações e em Equipe, que é onde a pergunta
// "quem atende aqui" se faz. Estas funções servem a Equipe.

export interface CrmInvite {
  id: string
  email: string
  role: 'proprietario' | 'admin' | 'atendente' | 'leitura'
  status: 'pendente' | 'aceito' | 'expirado' | 'cancelado'
  token: string
  expiresAt: string
  createdAt: string
}

export async function fetchInvites(clientId: string): Promise<CrmInvite[]> {
  const { data, error } = await supabase
    .from('crm_invites')
    .select('id, email, role, status, token, expires_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    token: r.token,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }))
}

export async function createInvite(clientId: string, input: { email: string; role: CrmInvite['role'] }): Promise<void> {
  const { error } = await supabase.from('crm_invites').insert({ client_id: clientId, ...input })
  if (error) throw error
}

export async function cancelInvite(id: string): Promise<void> {
  const { error } = await supabase.from('crm_invites').update({ status: 'cancelado' }).eq('id', id)
  if (error) throw error
}

// ─── Variáveis globais ────────────────────────────────────────────────────

export type TipoDeVariavel = 'texto' | 'numero' | 'booleano'

export interface GlobalVariable {
  id: string
  key: string
  value: string
  description: string | null
  tipo: TipoDeVariavel
}

/**
 * O prefixo `g_` não é enfeite: é o que distingue, dentro de uma mensagem, a
 * variável do cliente inteiro da variável que aquele fluxo guardou. Sem ele,
 * criar uma global chamada `status` mudaria em silêncio o que `{status}`
 * significa em todos os fluxos que já existem.
 */
export function comPrefixoGlobal(nome: string): string {
  const limpo = nome.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^g_/, '')
  return limpo ? `g_${limpo}` : ''
}

export async function fetchGlobalVariables(clientId: string): Promise<GlobalVariable[]> {
  const { data, error } = await supabase
    .from('crm_global_variables')
    .select('id, key, value, description, tipo')
    .eq('client_id', clientId)
    .order('key')
  if (error) throw error
  return (data ?? []).map((v) => ({ ...v, tipo: (v.tipo ?? 'texto') as TipoDeVariavel }))
}

export async function createGlobalVariable(clientId: string, input: Omit<GlobalVariable, 'id'>): Promise<void> {
  const { error } = await supabase.from('crm_global_variables').insert({ client_id: clientId, ...input })
  if (error) throw error
}

export async function updateGlobalVariable(id: string, input: Partial<Omit<GlobalVariable, 'id'>>): Promise<void> {
  const { error } = await supabase.from('crm_global_variables').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteGlobalVariable(id: string): Promise<void> {
  const { error } = await supabase.from('crm_global_variables').delete().eq('id', id)
  if (error) throw error
}

// ─── Campos personalizados ────────────────────────────────────────────────

export interface CustomField {
  id: string
  label: string
  key: string
  description: string | null
  /** Campo do BOT: existe em código, e a linha aqui guarda só a descrição. */
  sistema: boolean
}

/**
 * OS CAMPOS DO BOT.
 *
 * Esta lista é a MESMA que o motor de fluxos resolve, um por um. Ela não é uma
 * lista bonita pra tela: mostrar aqui um campo que o motor não sabe preencher
 * faria a mensagem sair com um buraco no lugar dele, sem erro em canto nenhum.
 * Foi exatamente o que acontecia com `hora`, `data` e `dia` até a migração 0045.
 *
 * Quem mexer aqui mexe em `contextoDoContato`, em whatsapp/src/fluxos.ts.
 */
export const CAMPOS_DO_BOT: { key: string; description: string; tipo: 'Texto' | 'Variável' }[] = [
  { key: 'full_name', description: 'Nome completo do cliente', tipo: 'Texto' },
  { key: 'first_name', description: 'Primeiro nome do cliente', tipo: 'Texto' },
  { key: 'phone_number', description: 'Número de telefone do cliente', tipo: 'Texto' },
  { key: 'hora', description: 'Hora atual no formato HH:mm', tipo: 'Texto' },
  { key: 'data', description: 'Data atual no formato dd/MM', tipo: 'Texto' },
  { key: 'dia', description: 'Dia da semana atual', tipo: 'Texto' },
  { key: 'chat_status', description: 'Situação da conversa: aguardando, atendendo ou resolvido', tipo: 'Texto' },
  { key: 'chat_tags', description: 'Etiquetas da conversa, separadas por vírgula', tipo: 'Texto' },
  { key: 'response.type', description: 'Tipo da última resposta do cliente (texto, audio, imagem…)', tipo: 'Variável' },
  { key: 'response.erro', description: 'Mensagem de erro da última requisição HTTP que falhou', tipo: 'Variável' },
]

export async function fetchCustomFields(clientId: string): Promise<CustomField[]> {
  const { data, error } = await supabase
    .from('crm_custom_fields')
    .select('id, label, key, description, sistema')
    .eq('client_id', clientId)
    .order('key')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    key: r.key,
    description: r.description,
    sistema: !!r.sistema,
  }))
}

export async function createCustomField(
  clientId: string,
  input: { key: string; description: string; sistema?: boolean },
): Promise<void> {
  const { error } = await supabase.from('crm_custom_fields').insert({
    client_id: clientId,
    key: input.key,
    // `label` continua obrigatório no banco desde a 0008 e ninguém o mostra:
    // a tela identifica o campo pela chave, que é o que se escreve na mensagem.
    label: input.key,
    description: input.description || null,
    sistema: input.sistema ?? false,
  })
  if (error) throw error
}

/**
 * Guarda a descrição de um campo do BOT.
 *
 * O campo existe em código: não há linha pra editar até alguém escrever a
 * primeira descrição. Por isso é upsert e não update — a linha nasce aqui.
 */
export async function salvarDescricaoDoCampoDoBot(
  clientId: string,
  key: string,
  description: string,
): Promise<void> {
  const { error } = await supabase
    .from('crm_custom_fields')
    .upsert(
      { client_id: clientId, key, label: key, description: description || null, sistema: true },
      { onConflict: 'client_id,key' },
    )
  if (error) throw error
}

export async function updateCustomField(
  id: string,
  input: Partial<{ key: string; description: string | null }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_custom_fields')
    .update({
      ...(input.key !== undefined ? { key: input.key, label: input.key } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCustomField(id: string): Promise<void> {
  const { error } = await supabase.from('crm_custom_fields').delete().eq('id', id)
  if (error) throw error
}

// ─── Produtos ─────────────────────────────────────────────────────────────

export interface CrmProduct {
  id: string
  name: string
  sku: string | null
  description: string | null
  currency: string
  priceMin: number
  priceMax: number
  defaultPrice: number
  active: boolean
}

/** As moedas que o bloco Pagamento e a Venda aprovada sabem gravar. */
export const MOEDAS = [
  { codigo: 'BRL', rotulo: 'BRL · Real brasileiro' },
  { codigo: 'USD', rotulo: 'USD · Dólar americano' },
  { codigo: 'EUR', rotulo: 'EUR · Euro' },
] as const

/** Formata no padrão da moeda do próprio produto, não sempre em real. */
export function formatarPreco(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(valor)
  } catch {
    // Moeda desconhecida não pode derrubar a lista inteira de produtos.
    return `${moeda} ${valor.toFixed(2)}`
  }
}

export async function fetchProducts(clientId: string): Promise<CrmProduct[]> {
  const { data, error } = await supabase
    .from('crm_products')
    .select('id, name, sku, description, currency, price_min, price_max, default_price, active')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    description: r.description,
    currency: r.currency ?? 'BRL',
    priceMin: Number(r.price_min),
    priceMax: Number(r.price_max),
    defaultPrice: Number(r.default_price),
    active: r.active,
  }))
}

export async function createProduct(clientId: string, input: Omit<CrmProduct, 'id'>): Promise<void> {
  const { error } = await supabase.from('crm_products').insert({
    client_id: clientId,
    name: input.name,
    sku: input.sku || null,
    description: input.description || null,
    currency: input.currency,
    price_min: input.priceMin,
    price_max: input.priceMax,
    default_price: input.defaultPrice,
    active: input.active,
  })
  if (error) throw error
}

export async function updateProduct(id: string, input: Partial<Omit<CrmProduct, 'id'>>): Promise<void> {
  const { error } = await supabase
    .from('crm_products')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.priceMin !== undefined ? { price_min: input.priceMin } : {}),
      ...(input.priceMax !== undefined ? { price_max: input.priceMax } : {}),
      ...(input.defaultPrice !== undefined ? { default_price: input.defaultPrice } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('crm_products').delete().eq('id', id)
  if (error) throw error
}

// ─── Integrações do CRM ───────────────────────────────────────────────────

export interface CrmIntegration {
  id: string
  provider: string
  label: string
  config: Record<string, unknown>
  status: 'pendente' | 'conectado' | 'erro' | 'desativado'
  statusDetail: string | null
  /** Os últimos caracteres do token, pra reconhecer QUAL credencial está ali. */
  secretHint: string | null
  lastSyncAt: string | null
}

export async function fetchCrmIntegrations(clientId: string): Promise<CrmIntegration[]> {
  const { data, error } = await supabase
    .from('crm_integrations')
    .select('id, provider, label, config, status, status_detail, secret_hint, last_sync_at')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    config: r.config ?? {},
    status: r.status,
    statusDetail: r.status_detail,
    secretHint: r.secret_hint ?? null,
    lastSyncAt: r.last_sync_at,
  }))
}

/**
 * Grava a integração PELO BACKEND, nunca daqui.
 *
 * O token da Notasy emite nota fiscal em nome do cliente e a chave do gateway
 * movimenta dinheiro. Escrever direto no Supabase deixaria os dois em
 * `crm_integrations.config`, que este mesmo arquivo lê no navegador — e daí
 * qualquer print da tela, extensão ou aba do DevTools os alcança.
 *
 * O backend guarda o segredo numa tabela sem política de RLS, valida a
 * credencial com o serviço antes de dizer "conectado", e devolve pro front só
 * o estado e os últimos caracteres.
 */
export async function saveCrmIntegration(input: {
  id?: string
  clientId: string
  provider: string
  label: string
  config: Record<string, unknown>
  /** Vazio quando a pessoa está só renomeando: o token guardado continua valendo. */
  secret?: string
}): Promise<{ status: CrmIntegration['status']; detail: string | null }> {
  return apiFetch('/crm/integrations', { method: 'POST', body: JSON.stringify(input) })
}

export async function deleteCrmIntegration(id: string): Promise<void> {
  const { error } = await supabase.from('crm_integrations').delete().eq('id', id)
  if (error) throw error
}

// ─── Webhooks de entrada ──────────────────────────────────────────────────

export interface CrmWebhook {
  id: string
  name: string
  token: string
  target: 'lead' | 'contato' | 'kanban'
  mapping: Record<string, string>
  kanbanColumnId: string | null
  /** Por qual número esse lead fala. Sem ela não há etiqueta, Kanban nem fluxo. */
  connectionId: string | null
  active: boolean
  receivedCount: number
  lastReceivedAt: string | null
  lastPayload: Record<string, unknown> | null
}

export async function fetchWebhooks(clientId: string): Promise<CrmWebhook[]> {
  const { data, error } = await supabase
    .from('crm_webhooks')
    .select(
      'id, name, token, target, mapping, kanban_column_id, connection_id, active, received_count, last_received_at, last_payload',
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    token: r.token,
    target: r.target,
    mapping: (r.mapping ?? {}) as Record<string, string>,
    kanbanColumnId: r.kanban_column_id,
    connectionId: r.connection_id ?? null,
    active: r.active,
    receivedCount: r.received_count,
    lastReceivedAt: r.last_received_at,
    lastPayload: r.last_payload,
  }))
}

export async function createWebhook(
  clientId: string,
  input: {
    name: string
    target: CrmWebhook['target']
    mapping: Record<string, string>
    kanbanColumnId?: string | null
    connectionId?: string | null
    active?: boolean
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('crm_webhooks')
    .insert({
      client_id: clientId,
      name: input.name,
      target: input.target,
      mapping: input.mapping,
      kanban_column_id: input.kanbanColumnId ?? null,
      connection_id: input.connectionId ?? null,
      active: input.active ?? true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateWebhook(
  id: string,
  input: Partial<{
    name: string
    active: boolean
    mapping: Record<string, string>
    target: CrmWebhook['target']
    connectionId: string | null
    kanbanColumnId: string | null
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_webhooks')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.mapping !== undefined ? { mapping: input.mapping } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.connectionId !== undefined ? { connection_id: input.connectionId } : {}),
      ...(input.kanbanColumnId !== undefined ? { kanban_column_id: input.kanbanColumnId } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteWebhook(id: string): Promise<void> {
  const { error } = await supabase.from('crm_webhooks').delete().eq('id', id)
  if (error) throw error
}

// ─── Tokens de MCP ────────────────────────────────────────────────────────

export type TipoDeAutenticacaoMcp = 'estatico' | 'oauth'

export interface McpToken {
  id: string
  name: string
  tokenPrefix: string
  scopes: string[]
  authType: TipoDeAutenticacaoMcp
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export async function fetchMcpTokens(clientId: string): Promise<McpToken[]> {
  const { data, error } = await supabase
    .from('crm_mcp_tokens')
    .select('id, name, token_prefix, scopes, auth_type, last_used_at, revoked_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    tokenPrefix: r.token_prefix,
    scopes: r.scopes ?? [],
    authType: (r.auth_type ?? 'estatico') as TipoDeAutenticacaoMcp,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }))
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Guardamos só o hash do token. O valor completo é devolvido uma única vez,
// aqui — se o usuário perder, gera outro; não temos como mostrar de novo.
export async function createMcpToken(
  clientId: string,
  input: { name: string; scopes: string[]; authType: TipoDeAutenticacaoMcp },
): Promise<string> {
  const raw = `crm_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
  const { error } = await supabase.from('crm_mcp_tokens').insert({
    client_id: clientId,
    name: input.name,
    token_prefix: raw.slice(0, 12),
    token_hash: await sha256Hex(raw),
    scopes: input.scopes,
    auth_type: input.authType,
  })
  if (error) throw error
  return raw
}

export async function revokeMcpToken(id: string): Promise<void> {
  const { error } = await supabase.from('crm_mcp_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ─── Preferências gerais do CRM ───────────────────────────────────────────

export interface CrmSettings {
  greetingMessage: string
  outOfHoursMessage: string
  autoAssign: boolean
  resolveAfterMinutes: number
  timezone: string
}

export async function fetchCrmSettings(clientId: string): Promise<CrmSettings> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('greeting_message, out_of_hours_message, auto_assign, resolve_after_minutes, timezone')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return {
    greetingMessage: data?.greeting_message ?? '',
    outOfHoursMessage: data?.out_of_hours_message ?? '',
    autoAssign: data?.auto_assign ?? false,
    resolveAfterMinutes: data?.resolve_after_minutes ?? 0,
    timezone: data?.timezone ?? 'America/Sao_Paulo',
  }
}

export async function saveCrmSettings(clientId: string, input: CrmSettings): Promise<void> {
  const { error } = await supabase.from('crm_settings').upsert(
    {
      client_id: clientId,
      greeting_message: input.greetingMessage || null,
      out_of_hours_message: input.outOfHoursMessage || null,
      auto_assign: input.autoAssign,
      resolve_after_minutes: input.resolveAfterMinutes,
      timezone: input.timezone,
    },
    { onConflict: 'client_id' },
  )
  if (error) throw error
}

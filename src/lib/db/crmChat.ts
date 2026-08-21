import { supabase } from '../supabaseClient'
import { apiFetch } from '../api'

// Chats ao vivo: a caixa de entrada do atendimento. Cada conversa é uma
// linha em crm_chats; cada mensagem, uma linha em crm_messages. Mensagens
// que ENTRAM chegam pelo webhook da ponte (backend grava). Mensagens que
// SAEM são gravadas aqui e enviadas pela ponte no mesmo passo.

export type ChatStatus = 'aguardando' | 'atendendo' | 'resolvido'

export interface CrmChat {
  id: string
  connectionId: string | null
  connectionName: string | null
  contactId: string | null
  contactName: string
  phone: string | null
  avatarUrl: string | null
  status: ChatStatus
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  assignedTo: string | null
  assignedName: string | null
  departmentId: string | null
  tags: string[]
  /** O quadro de CRM a que esta conversa está ligada, via cartão do kanban. */
  kanbanId: string | null
  /** Quem marcou como resolvido (migração 0024). Vai no cabeçalho da conversa. */
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
}

const CHAT_SELECT =
  'id, connection_id, contact_id, contact_name, phone, avatar_url, avatar_path, status, unread_count, last_message_at, last_message_preview, assigned_to, assigned_name, department_id, kanban_card_id, tags, resolved_by_name, resolved_at, created_at, crm_connections (name), crm_kanban_cards (kanban_id)'

/**
 * O nome com que a conversa aparece na tela.
 *
 * A conversa podia nascer sem nome por dois caminhos: o provedor manda string
 * VAZIA (não nula) pra quem não está na agenda, e conta com endereçamento novo
 * não traz nome nenhum. Os dois viravam uma linha em branco na lista.
 */
function nomeVisivel(nome: string | null, telefone: string | null): string {
  const limpo = (nome ?? '').trim()
  if (limpo) return limpo
  return (telefone ?? '').trim() || 'Sem nome'
}

function toChat(r: Record<string, unknown>): CrmChat {
  return {
    id: r.id as string,
    connectionId: (r.connection_id as string) ?? null,
    connectionName: (r.crm_connections as { name: string } | null)?.name ?? null,
    contactId: (r.contact_id as string) ?? null,
    // Nunca vazio: uma conversa sem nome vira uma linha em branco na lista, e
    // aí não dá nem pra saber com quem se está falando. O telefone é pior que
    // o nome e melhor que nada — e é o que o WhatsApp mostra também quando o
    // contato não está na agenda.
    contactName: nomeVisivel(r.contact_name as string | null, r.phone as string | null),
    phone: (r.phone as string) ?? null,
    avatarUrl: (r.avatar_url as string) ?? null,
    status: r.status as ChatStatus,
    unreadCount: r.unread_count as number,
    lastMessageAt: (r.last_message_at as string) ?? null,
    lastMessagePreview: (r.last_message_preview as string) ?? null,
    assignedTo: (r.assigned_to as string) ?? null,
    assignedName: (r.assigned_name as string) ?? null,
    departmentId: (r.department_id as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    kanbanId: (r.crm_kanban_cards as { kanban_id: string } | null)?.kanban_id ?? null,
    resolvedByName: (r.resolved_by_name as string) ?? null,
    resolvedAt: (r.resolved_at as string) ?? null,
    createdAt: r.created_at as string,
  }
}

export async function fetchChats(clientId: string): Promise<CrmChat[]> {
  const { data, error } = await supabase
    .from('crm_chats')
    .select(CHAT_SELECT)
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(300)
  if (error) throw error

  const linhas = data ?? []
  // A foto de perfil real mora no bucket privado, igual à mídia: a URL que o
  // WhatsApp devolve expira em poucos dias. Uma assinatura só pra lista toda.
  const assinadas = await assinarMidia(
    linhas.map((r) => r.avatar_path).filter((p): p is string => typeof p === 'string' && p.length > 0),
  )

  return linhas.map((r) => {
    const chat = toChat(r)
    if (r.avatar_path) chat.avatarUrl = assinadas.get(r.avatar_path) ?? chat.avatarUrl
    return chat
  })
}

export async function createChat(
  clientId: string,
  input: { contactName: string; phone: string; connectionId: string | null; contactId?: string | null },
): Promise<CrmChat> {
  const { data, error } = await supabase
    .from('crm_chats')
    .insert({
      client_id: clientId,
      contact_name: input.contactName,
      phone: input.phone,
      connection_id: input.connectionId,
      contact_id: input.contactId ?? null,
    })
    .select(CHAT_SELECT)
    .single()
  if (error) throw error
  return toChat(data)
}

export async function updateChat(
  id: string,
  input: Partial<{
    status: ChatStatus
    contactName: string
    assignedTo: string | null
    assignedName: string | null
    departmentId: string | null
    tags: string[]
    unreadCount: number
    contactId: string | null
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('crm_chats')
    .update({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.contactName !== undefined ? { contact_name: input.contactName } : {}),
      ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
      ...(input.assignedName !== undefined ? { assigned_name: input.assignedName } : {}),
      ...(input.departmentId !== undefined ? { department_id: input.departmentId } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.unreadCount !== undefined ? { unread_count: input.unreadCount } : {}),
      ...(input.contactId !== undefined ? { contact_id: input.contactId } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteChat(id: string): Promise<void> {
  const { error } = await supabase.from('crm_chats').delete().eq('id', id)
  if (error) throw error
}

// ─── Mensagens ────────────────────────────────────────────────────────────

export interface CrmMessage {
  id: string
  direction: 'entrada' | 'saida'
  body: string
  mediaUrl: string | null
  mediaKind: 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha' | null
  authorName: string | null
  status: 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou'
  sentAt: string
  // `imported_at` existe na tabela e continua existindo: é como o backend
  // evita gravar a mesma mensagem duas vezes. Só não sobe até aqui — a
  // conversa se atualiza sozinha, então "importada" não separava nada que a
  // pessoa precisasse distinguir na tela, e sujava o rodapé de uma bolha sim
  // e outra não.
  /** Os botões que o cliente vê no celular. Vazio quando não há nenhum. */
  botoes: BotaoDaMensagem[]
}

/** Um botão como o WhatsApp mostra. Só `reply` devolve resposta ao fluxo. */
export interface BotaoDaMensagem {
  type: 'reply' | 'url' | 'call' | 'copy'
  text: string
  url?: string
  phoneNumber?: string
  copyCode?: string
}

/**
 * O bucket da mídia do WhatsApp é privado — são fotos de conversa de cliente
 * final, e público por URL vaza pra quem receber o link. Então o que fica
 * gravado é o caminho, e a URL de exibição é assinada na hora.
 *
 * Uma hora de validade cobre a sessão de atendimento sem deixar link vivo
 * circulando por aí.
 */
const VALIDADE_DA_URL_S = 3600

/**
 * A URL assinada de cada arquivo, guardada até perto de vencer.
 *
 * Sem isto, cada recarga automática da conversa geraria uma assinatura nova
 * para a MESMA foto — o `src` mudaria, e o navegador baixaria tudo de novo a
 * cada poucos segundos. Na tela isso aparece como imagem piscando.
 *
 * A margem de um minuto evita entregar uma URL que vence no caminho.
 */
const MARGEM_MS = 60_000
const cacheDeUrls = new Map<string, { url: string; venceEm: number }>()

export async function assinarMidia(paths: string[]): Promise<Map<string, string>> {
  const assinadas = new Map<string, string>()
  if (paths.length === 0) return assinadas

  const agora = Date.now()
  const faltando: string[] = []
  for (const path of paths) {
    const guardada = cacheDeUrls.get(path)
    if (guardada && guardada.venceEm - MARGEM_MS > agora) assinadas.set(path, guardada.url)
    else faltando.push(path)
  }
  if (faltando.length === 0) return assinadas

  const { data, error } = await supabase.storage.from('whatsapp-media').createSignedUrls(faltando, VALIDADE_DA_URL_S)
  // Falhar aqui não pode derrubar a conversa: sem a URL a mensagem aparece
  // com o aviso de mídia indisponível, e o texto continua legível.
  if (error || !data) return assinadas

  const venceEm = agora + VALIDADE_DA_URL_S * 1000
  for (const item of data) {
    if (item.signedUrl && item.path) {
      assinadas.set(item.path, item.signedUrl)
      cacheDeUrls.set(item.path, { url: item.signedUrl, venceEm })
    }
  }
  return assinadas
}

export async function fetchMessages(chatId: string): Promise<CrmMessage[]> {
  const { data, error } = await supabase
    .from('crm_messages')
    .select('id, direction, body, media_url, media_path, media_kind, author_name, status, sent_at, buttons')
    .eq('chat_id', chatId)
    .order('sent_at')
    .limit(500)
  if (error) throw error

  const linhas = data ?? []
  // Uma chamada só para todas as mídias da conversa — assinar uma a uma seria
  // uma ida à rede por foto.
  const assinadas = await assinarMidia(
    linhas.map((r) => r.media_path).filter((p): p is string => typeof p === 'string' && p.length > 0),
  )

  return linhas.map((r) => ({
    id: r.id,
    direction: r.direction,
    body: r.body,
    // media_path (arquivo nosso, assinado) tem precedência sobre media_url,
    // que é a URL pública de mídia que já nasceu pública (blocos de fluxo).
    mediaUrl: (r.media_path ? assinadas.get(r.media_path) : null) ?? r.media_url,
    mediaKind: r.media_kind,
    botoes: Array.isArray(r.buttons) ? (r.buttons as BotaoDaMensagem[]) : [],
    authorName: r.author_name,
    status: r.status,
    sentAt: r.sent_at,
  }))
}

// Enviar grava a mensagem e pede pro backend entregar pela ponte. Se a ponte
// não estiver configurada, a mensagem fica com status 'falhou' e o motivo
// aparece na tela — nunca fingimos que saiu.
export async function sendMessage(
  clientId: string,
  input: { chatId: string; body: string; authorName?: string },
): Promise<{ delivered: boolean; detail: string | null }> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('crm_messages')
    .insert({
      client_id: clientId,
      chat_id: input.chatId,
      direction: 'saida',
      body: input.body,
      author_name: input.authorName ?? null,
      status: 'enviando',
      sent_at: now,
    })
    .select('id')
    .single()
  if (error) throw error

  await supabase
    .from('crm_chats')
    .update({ last_message_at: now, last_message_preview: input.body.slice(0, 120) })
    .eq('id', input.chatId)

  try {
    const res = await apiFetch<{ delivered: boolean; detail: string | null }>('/crm/messages/send', {
      method: 'POST',
      body: JSON.stringify({ messageId: data.id, chatId: input.chatId }),
    })
    return res
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'Falha ao entregar pela conexão.'
    await supabase.from('crm_messages').update({ status: 'falhou' }).eq('id', data.id)
    return { delivered: false, detail }
  }
}

// ─── Envio com anexo ──────────────────────────────────────────────────────

export type TipoDeAnexo = 'imagem' | 'audio' | 'video' | 'documento'

/** O que o WhatsApp aceita. Recusar aqui evita descobrir depois do upload. */
export const LIMITES_DE_ANEXO: Record<TipoDeAnexo, { mb: number; aceita: string; descricao: string }> = {
  imagem: { mb: 5, aceita: 'image/jpeg,image/png,image/webp', descricao: 'JPG, PNG ou WebP até 5 MB' },
  video: { mb: 16, aceita: 'video/mp4', descricao: 'MP4 até 16 MB' },
  audio: { mb: 16, aceita: 'audio/mpeg,audio/ogg,audio/webm,audio/mp4', descricao: 'MP3 ou OGG até 16 MB' },
  documento: {
    mb: 20,
    aceita: '.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.zip',
    descricao: 'PDF, DOC, XLS, TXT ou ZIP até 20 MB',
  },
}

export function tipoDoArquivo(mime: string): TipoDeAnexo {
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'documento'
}

/**
 * Manda um arquivo pela conversa.
 *
 * O arquivo sobe pro mesmo bucket privado da mídia recebida — é a ponte que
 * lê de lá e entrega ao WhatsApp. Passar o arquivo pelo backend em base64
 * seria carregar megabytes por uma rota que existe pra coordenar, não pra
 * transportar.
 *
 * A mensagem é gravada ANTES do envio, com status 'enviando': se a entrega
 * falhar, ela fica na conversa marcada como falhou, em vez de sumir e deixar
 * o atendente sem saber se mandou.
 */
export async function sendMediaMessage(
  clientId: string,
  input: { chatId: string; file: File | Blob; kind: TipoDeAnexo; caption?: string; filename?: string; authorName?: string },
): Promise<{ delivered: boolean; detail: string | null }> {
  const limite = LIMITES_DE_ANEXO[input.kind]
  if (input.file.size > limite.mb * 1024 * 1024) {
    throw new Error(
      `Arquivo de ${(input.file.size / 1024 / 1024).toFixed(1)} MB. O limite para ${input.kind} é ${limite.mb} MB.`,
    )
  }

  const nome = input.filename ?? (input.file instanceof File ? input.file.name : 'arquivo')
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase().slice(0, 5) : 'bin'
  const path = `${clientId}/enviados/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: erroUpload } = await supabase.storage.from('whatsapp-media').upload(path, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  })
  if (erroUpload) {
    if (/bucket/i.test(erroUpload.message)) {
      throw new Error('O bucket "whatsapp-media" não existe no Storage do Supabase.')
    }
    throw erroUpload
  }

  const legenda = input.caption?.trim() ?? ''
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('crm_messages')
    .insert({
      client_id: clientId,
      chat_id: input.chatId,
      direction: 'saida',
      body: legenda,
      media_path: path,
      media_kind: input.kind,
      author_name: input.authorName ?? null,
      status: 'enviando',
      sent_at: now,
    })
    .select('id')
    .single()
  if (error) throw error

  await supabase
    .from('crm_chats')
    .update({ last_message_at: now, last_message_preview: legenda || rotuloDeAnexo(input.kind) })
    .eq('id', input.chatId)

  try {
    return await apiFetch<{ delivered: boolean; detail: string | null }>('/crm/messages/send', {
      method: 'POST',
      body: JSON.stringify({ messageId: data.id, chatId: input.chatId }),
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'Falha ao entregar pela conexão.'
    await supabase.from('crm_messages').update({ status: 'falhou' }).eq('id', data.id)
    return { delivered: false, detail }
  }
}

/**
 * Manda uma mensagem com botões de verdade.
 *
 * Mesmo caminho do anexo — grava a linha antes de enviar, pra ela aparecer na
 * conversa mesmo se a conexão engasgar. A diferença é o `buttons`, que a ponte
 * repassa ao WhatsApp e o CRM usa pra desenhar as mesmas opções na tela.
 *
 * Se o motor da conexão não souber mandar botão, a ponte manda o mesmo
 * conteúdo como texto sozinha. Por isso o retorno traz `comBotoes`: a tela
 * precisa poder avisar que saiu no formato simples, em vez de deixar o
 * atendente achar que o cliente recebeu botão.
 */
export async function sendButtonsMessage(
  clientId: string,
  input: { chatId: string; body: string; botoes: BotaoDaMensagem[]; footer?: string; authorName?: string },
): Promise<{ delivered: boolean; detail: string | null }> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('crm_messages')
    .insert({
      client_id: clientId,
      chat_id: input.chatId,
      direction: 'saida',
      body: input.body,
      buttons: input.botoes,
      author_name: input.authorName ?? null,
      status: 'enviando',
      sent_at: now,
    })
    .select('id')
    .single()
  if (error) throw error

  await supabase
    .from('crm_chats')
    .update({ last_message_at: now, last_message_preview: input.body.split('\n')[0] ?? '' })
    .eq('id', input.chatId)

  try {
    return await apiFetch<{ delivered: boolean; detail: string | null }>('/crm/messages/send', {
      method: 'POST',
      body: JSON.stringify({ messageId: data.id, chatId: input.chatId }),
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'Falha ao entregar pela conexão.'
    await supabase.from('crm_messages').update({ status: 'falhou' }).eq('id', data.id)
    return { delivered: false, detail }
  }
}

/**
 * Anexo sem legenda precisa de alguma linha na lista de conversas.
 *
 * Sem emoji: este texto é GRAVADO em last_message_preview, então ele vai pro
 * banco e volta em toda listagem. Conversas antigas seguem com o que foi
 * gravado antes; a troca vale das próximas em diante.
 */
export function rotuloDeAnexo(kind: TipoDeAnexo): string {
  const rotulos: Record<TipoDeAnexo, string> = {
    imagem: 'Imagem',
    audio: 'Áudio',
    video: 'Vídeo',
    documento: 'Documento',
  }
  return rotulos[kind]
}

export async function markChatRead(chatId: string): Promise<void> {
  const { error } = await supabase.from('crm_chats').update({ unread_count: 0 }).eq('id', chatId)
  if (error) throw error
}

// ─── Notas internas do chat ───────────────────────────────────────────────

export interface ChatNote {
  id: string
  body: string
  authorName: string | null
  createdAt: string
}

export async function fetchChatNotes(chatId: string): Promise<ChatNote[]> {
  const { data, error } = await supabase
    .from('crm_chat_notes')
    .select('id, body, author_name, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id, body: r.body, authorName: r.author_name, createdAt: r.created_at }))
}

export async function createChatNote(
  clientId: string,
  input: { chatId: string; body: string; authorName?: string },
): Promise<void> {
  const { error } = await supabase.from('crm_chat_notes').insert({
    client_id: clientId,
    chat_id: input.chatId,
    body: input.body,
    author_name: input.authorName ?? null,
  })
  if (error) throw error
}

export async function deleteChatNote(id: string): Promise<void> {
  const { error } = await supabase.from('crm_chat_notes').delete().eq('id', id)
  if (error) throw error
}

// ─── Abrir a conversa de um telefone que veio de fora ──────────────────────

/**
 * O telefone como o CRM guarda: só dígitos, com país na frente.
 *
 * O DDI só entra quando o número não tem cara de já ter um. Número brasileiro
 * completo tem 10 ou 11 dígitos (DDD + linha); mais que isso já traz país, e
 * grudar outro DDI na frente criaria uma segunda conversa com a MESMA pessoa —
 * e as duas metades do histórico nunca mais se encontram.
 */
export function telefoneDoCrm(telefone: string, ddi: string): string {
  const d = telefone.replace(/D/g, '')
  return d.length > 11 ? d : `${ddi}${d}`
}

/**
 * Acha (ou cria) a conversa daquele telefone e devolve o id dela.
 *
 * É o que faz a busca de leads desembocar no CRM em vez de no wa.me. O link do
 * WhatsApp abria a conversa FORA do produto: a mensagem saía do aplicativo
 * pessoal, não passava por conexão nenhuma, e nada do que era dito voltava
 * pro CRM. Na prática, buscar leads e atender eram dois históricos separados da
 * mesma pessoa, e o segundo começava do zero.
 *
 * Reaproveitar a conversa existente é o ponto: quem já foi abordado antes, ou
 * já respondeu alguma vez, cai na MESMA linha do tempo.
 *
 * A conexão escolhida é a que está conectada. Sem nenhuma, a conversa nasce
 * assim mesmo, sem conexão: ela é um lugar legítimo pra guardar nota e
 * histórico, e quem manda mensagem já avisa quando não há por onde enviar.
 * Recusar a criação aqui só esconderia o problema uma tela antes.
 */
export async function abrirConversaDoLead(
  clientId: string,
  lead: { telefone: string; nome?: string | null },
  ddi: string,
): Promise<CrmChat> {
  const phone = telefoneDoCrm(lead.telefone, ddi)

  const { data: existente, error: erroBusca } = await supabase
    .from('crm_chats')
    .select(CHAT_SELECT)
    .eq('client_id', clientId)
    .eq('phone', phone)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (erroBusca) throw erroBusca
  if (existente) return toChat(existente)

  const { data: conexoes } = await supabase
    .from('crm_connections')
    .select('id, status')
    .eq('client_id', clientId)
    .order('created_at')
  const conectada = (conexoes ?? []).find((c) => c.status === 'conectada')

  return createChat(clientId, {
    contactName: (lead.nome ?? '').trim() || phone,
    phone,
    connectionId: conectada?.id ?? null,
  })
}

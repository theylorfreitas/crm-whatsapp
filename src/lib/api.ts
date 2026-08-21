import { supabase } from './supabaseClient'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// Chamadas ao NOSSO backend (Fastify). Sempre com o JWT da sessão atual —
// o backend revalida o token e o papel contra o Supabase antes de agir.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // Só declara JSON quando existe JSON. Um POST sem corpo com
      // `Content-Type: application/json` faz o Fastify recusar antes de chegar
      // na rota (FST_ERR_CTP_EMPTY_JSON_BODY), e a tela mostra um "Bad Request"
      // seco que não diz nada. O erro é invisível em quem chama: o cabeçalho
      // vinha daqui, não do call site.
      ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!res.ok) {
    // `error` é o nosso formato; `message` é o do Fastify quando ele mesmo
    // recusa a requisição. Sem o segundo, esses casos chegavam na tela como
    // "Bad Request", que não ajuda ninguém a consertar nada.
    throw new Error(body.error ?? body.message ?? `Falha na chamada ao backend (${res.status})`)
  }
  return body
}

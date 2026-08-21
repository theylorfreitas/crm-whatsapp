import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas. Confira o seu .env (veja .env.example).',
  )
}

// Cliente do navegador: usa a chave "anon" (pública por natureza — a
// segurança real vem das políticas de RLS no banco, não do sigilo dela).
// Toda tela fala com o Supabase Auth direto por aqui; dado (clients, sistemas...)
// também, respeitando RLS. O backend Fastify só entra pra operação
// privilegiada que o RLS sozinho não resolve.
export const supabase = createClient(url, anonKey)

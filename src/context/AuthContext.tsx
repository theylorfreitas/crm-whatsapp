import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

/**
 * owner      — dono do sistema, enxerga e configura tudo.
 * client     — atendente: usa o CRM, não mexe em conexão nem em equipe.
 * financeiro — vê o que envolve dinheiro, não vê a conversa.
 *
 * Quem corta de verdade é a RLS, dentro do banco. O que o front faz aqui é não
 * OFERECER o que não abriria: um botão que leva a um erro de permissão é pior
 * que um botão que não existe.
 */
export type AppRole = 'owner' | 'client' | 'financeiro'

export interface Profile {
  id: string
  role: AppRole
  clientId: string | null
  fullName: string | null
  /** Foto de perfil, quando a pessoa enviou uma. Null volta pras iniciais. */
  avatarUrl: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  // true enquanto ainda não sabemos se há sessão — evita "piscar" pra tela de
  // login antes de confirmar que não tem ninguém logado.
  loading: boolean
  // nível de autenticação atual: 'aal2' só depois do código do 2FA confirmado
  // nesta sessão (persiste entre recarregamentos da página).
  mfaVerified: boolean
  // já tem um fator TOTP cadastrado e verificado nesta conta.
  mfaEnrolled: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, client_id, full_name, avatar_url')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return {
    id: data.id,
    role: data.role,
    clientId: data.client_id,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
  }
}

// Links de convite/redefinição de senha do Supabase chegam com os tokens no
// hash da URL (#access_token=...&refresh_token=...). Em teoria o próprio
// cliente detecta isso sozinho (detectSessionInUrl, ligado por padrão) — na
// prática isso se mostrou não confiável aqui (confirmado com um teste
// automatizado: os tokens chegavam na URL mas nada era gravado no
// localStorage). Por segurança tratamos explicitamente: se tem token no
// hash, estabelece a sessão na mão com setSession() e limpa a URL depois.
async function consumeAuthHashIfPresent(): Promise<void> {
  const hash = window.location.hash
  if (!hash.includes('access_token=')) return

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return

  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState({}, '', url.toString())
}

async function fetchMfaState(): Promise<{ verified: boolean; enrolled: boolean }> {
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])
  return {
    verified: aal?.currentLevel === 'aal2',
    enrolled: (factors?.totp ?? []).some((f) => f.status === 'verified'),
  }
}

// Contexto de autenticação real (Supabase Auth): sessão, papel (dono/cliente)
// e estado do 2FA. Envolve o app inteiro em main.tsx — é a única fonte de
// verdade sobre "quem está logado" (ver src/lib/permissions.ts, que expõe
// hooks mais simples em cima disto pras telas).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaVerified, setMfaVerified] = useState(false)
  const [mfaEnrolled, setMfaEnrolled] = useState(false)

  async function syncFromSession(current: Session | null) {
    setSession(current)
    if (current) {
      const [p, mfa] = await Promise.all([fetchProfile(current.user.id), fetchMfaState()])
      setProfile(p)
      setMfaVerified(mfa.verified)
      setMfaEnrolled(mfa.enrolled)
    } else {
      setProfile(null)
      setMfaVerified(false)
      setMfaEnrolled(false)
    }
  }

  useEffect(() => {
    let active = true

    consumeAuthHashIfPresent().finally(() => {
      supabase.auth.getSession().then(async ({ data }) => {
        if (!active) return
        await syncFromSession(data.session)
        setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return
      await syncFromSession(newSession)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession()
    await syncFromSession(data.session)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, mfaVerified, mfaEnrolled, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>')
  return ctx
}

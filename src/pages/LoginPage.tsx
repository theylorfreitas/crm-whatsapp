import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ownerBrand, LOGO_CRM } from '../config/brand'

type Step = 'credentials' | 'mfa'

// O login do CRM: e-mail/senha (Supabase Auth) e, se a conta
// tiver 2FA cadastrado, um segundo passo pedindo o código do app
// autenticador antes de liberar a sessão (aal1 -> aal2). Conta sem 2FA entra
// direto: o segundo passo só aparece para quem cadastrou um app autenticador.
/**
 * Pra onde vai quem acabou de entrar. `null` = esta conta não abre nada aqui, e
 * o login desfaz a sessão em vez de deixar a pessoa numa tela vazia.
 *
 * Existe UM destino porque existe uma tela. O que separa o dono do atendente
 * não é para onde ele vai, é o que ele encontra quando chega.
 *
 * Quem manda é o PERFIL, e não o login. Uma conta criada direto no painel do
 * Supabase entra no Auth sem ganhar linha em `profiles`; sem esta checagem ela
 * passaria daqui e cairia num CRM que não devolve dado nenhum, sem dizer por quê.
 */
async function destinoDoPapel(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role ? '/crm' : null
}

export function LoginPage() {
  const { session, profile, mfaVerified, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Já autenticado e com 2FA confirmado: não tem o que fazer nesta tela.
  if (!authLoading && session && mfaVerified && profile?.role) {
    return <Navigate to="/crm" replace />
  }

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : signInError.message)
        return
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const totp = factors?.totp.find((f) => f.status === 'verified')
        if (!totp) {
          setError('Este login exige 2FA, mas nenhum fator verificado foi encontrado. Fale com o suporte.')
          await supabase.auth.signOut()
          return
        }
        setFactorId(totp.id)
        setStep('mfa')
        return
      }

      // Sem exigência de 2FA nesta conta ainda — as telas não deixam entrar
      // mesmo assim (ver useIsOwnerSession), mas aqui já avisamos.
      if (data.user) {
        const destino = await destinoDoPapel(data.user.id)
        if (!destino) {
          setError('Esta conta não tem acesso a este painel.')
          await supabase.auth.signOut()
          return
        }
        navigate(destino)
        return
      }
      navigate('/crm')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError(null)
    setSubmitting(true)
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (verifyError) {
        setError('Código inválido. Confira o app autenticador e tente de novo.')
        return
      }
      const { data: usuario } = await supabase.auth.getUser()
      const destino = usuario.user ? await destinoDoPapel(usuario.user.id) : null
      if (!destino) {
        setError('Esta conta não tem acesso a este painel.')
        await supabase.auth.signOut()
        return
      }
      navigate(destino)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          {/* A porta de entrada é onde a marca aparece maior. Aqui o símbolo
              vem em 512px: a 44px numa tela retina, o de 256 já começa a
              amolecer nas curvas do traço. */}
          {ownerBrand.logoUrl ? (
            <img
              src="/marca/crm-512.png"
              alt={ownerBrand.name}
              className={`h-12 w-12 object-contain ${LOGO_CRM}`}
            />
          ) : (
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center text-ink text-sm font-bold"
              style={{ backgroundColor: ownerBrand.accentColor }}
            >
              {ownerBrand.logoInitials}
            </div>
          )}
          <h1 className="text-lg font-semibold text-ink">{ownerBrand.name}</h1>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">Entrar no painel</h2>
                <p className="text-xs text-ink-3 mt-0.5">Acesso restrito ao dono da plataforma.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5" htmlFor="email">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-line focus:border-line-strong"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5" htmlFor="password">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-line focus:border-line-strong"
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--accent,#52525b)] px-3 py-2.5 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Entrar
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-[var(--accent)]/12 text-[var(--accent-ink)] flex items-center justify-center">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-ink">Verificação em duas etapas</h2>
                  <p className="text-xs text-ink-3">Digite o código do seu app autenticador.</p>
                </div>
              </div>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full rounded-lg border border-line px-3 py-2.5 text-center text-lg tracking-[0.3em] font-mono text-ink focus:outline-none focus:ring-2 focus:ring-line focus:border-line-strong"
              />

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--accent,#52525b)] px-3 py-2.5 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Confirmar
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('credentials')
                  setCode('')
                  setError(null)
                }}
                className="w-full text-center text-xs text-ink-4 hover:text-ink-2"
              >
                Voltar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

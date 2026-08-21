import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UsersRound, UserPlus, Trash2, KeyRound, Mail } from 'lucide-react'
import { fetchMembers, addMember, updateMember, removeMember, type WorkspaceMember } from '../../lib/db/workspaceExtras'
import { fetchInvites, createInvite, cancelInvite } from '../../lib/db/crmSettings'
import { apiFetch } from '../../lib/api'
import { CrmLoading } from './CrmDataStates'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmTable,
  CrmErrorBar,
  CrmNoticeBar,
} from './ui/CrmUi'
import { Selecao } from '../ui/Selecao'

const ROLES: { value: WorkspaceMember['role']; label: string }[] = [
  { value: 'proprietario', label: 'Proprietário' },
  { value: 'admin', label: 'Administrador' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'membro', label: 'Membro' },
  { value: 'leitura', label: 'Somente leitura' },
]

// Equipe do workspace: quem tem acesso, com qual papel, e os convites em
// aberto. Trocar senha passa pelo backend (precisa do service role).

export function TeamSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [passwordOf, setPasswordOf] = useState<WorkspaceMember | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const membersQuery = useQuery({ queryKey: ['workspace-members', clientId], queryFn: () => fetchMembers(clientId) })
  const invitesQuery = useQuery({ queryKey: ['crm-invites', clientId], queryFn: () => fetchInvites(clientId) })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspace-members', clientId] })
    queryClient.invalidateQueries({ queryKey: ['crm-invites', clientId] })
  }

  const roleMutation = useMutation({
    mutationFn: (vars: { id: string; role: WorkspaceMember['role'] }) => updateMember(vars.id, { role: vars.role }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  })
  const removeMutation = useMutation({ mutationFn: removeMember, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })
  const cancelMutation = useMutation({ mutationFn: cancelInvite, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const members = membersQuery.data ?? []
  const invites = (invitesQuery.data ?? []).filter((i) => i.status === 'pendente')

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <UsersRound size={17} className="text-ink-4" />
            Equipe
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">Quem atende neste workspace e o que cada um pode fazer.</p>
        </div>
        <button type="button" onClick={() => setInviteOpen(true)} className={primaryButtonClass}>
          <UserPlus size={14} /> Convidar membro
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}
      {notice && <CrmNoticeBar message={notice} onClose={() => setNotice(null)} />}

      {membersQuery.isLoading ? (
        <CrmLoading />
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-14 text-center">
          <p className="text-sm font-medium text-ink-2">Nenhum membro cadastrado</p>
          <p className="mt-1 text-xs text-ink-4">Convide alguém pra dividir o atendimento.</p>
        </div>
      ) : (
        <CrmTable head={['Membro', 'E-mail', 'Perfil', 'Ações']}>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">
                    {(m.displayName ?? m.email).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-ink">{m.displayName ?? '—'}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-ink-2">{m.email}</td>
              <td className="px-4 py-3">
                <Selecao
                  value={m.role}
                  onChange={(e) => roleMutation.mutate({ id: m.id, role: e.target.value as WorkspaceMember['role'] })}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-2 focus:outline-none focus:ring-2 focus:ring-line"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Selecao>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPasswordOf(m)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                  >
                    <KeyRound size={12} /> Senha
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remover ${m.displayName ?? m.email} da equipe?`)) removeMutation.mutate(m.id)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-3 hover:bg-danger-bg hover:text-danger-ink"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      {invites.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-2">Convites pendentes</h2>
          <CrmTable head={['E-mail', 'Perfil', 'Expira em', 'Ações']}>
            {invites.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 text-sm text-ink-2">{i.email}</td>
                <td className="px-4 py-3">
                  <CrmPill tone="azul">{i.role}</CrmPill>
                </td>
                <td className="px-4 py-3 text-xs text-ink-3">{new Date(i.expiresAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate(i.id)}
                    className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink-2 hover:bg-canvas"
                  >
                    Cancelar
                  </button>
                </td>
              </tr>
            ))}
          </CrmTable>
        </>
      )}

      <InviteModal
        open={inviteOpen}
        clientId={clientId}
        onClose={() => setInviteOpen(false)}
        onDone={(message) => {
          invalidate()
          setNotice(message)
        }}
      />

      {passwordOf && (
        <PasswordModal
          member={passwordOf}
          onClose={() => setPasswordOf(null)}
          onDone={(message) => {
            setNotice(message)
            setPasswordOf(null)
          }}
        />
      )}
    </div>
  )
}

function InviteModal({
  open,
  clientId,
  onClose,
  onDone,
}: {
  open: boolean
  clientId: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<WorkspaceMember['role']>('atendente' as WorkspaceMember['role'])
  const [password, setPassword] = useState('')

  // Dois passos: o membro entra na lista do workspace e o acesso é criado no
  // Auth. Se o segundo falhar, o primeiro continua valendo e dizemos o que
  // faltou — em vez de perder tudo.
  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      await addMember(clientId, { email: email.trim(), displayName: displayName.trim() || undefined, role })
      await createInvite(clientId, { email: email.trim(), role: role === 'membro' ? 'atendente' : role })
      try {
        await apiFetch('/admin/clients/create-user', {
          method: 'POST',
          body: JSON.stringify({
            clientId,
            email: email.trim(),
            password: password.trim() || undefined,
            fullName: displayName.trim() || email.trim(),
          }),
        })
        return password.trim() ? 'Membro criado com a senha definida.' : 'Membro criado. O convite foi enviado por e-mail.'
      } catch (e) {
        return `Membro adicionado à equipe, mas o acesso não foi criado: ${
          e instanceof Error ? e.message : 'falha desconhecida'
        }`
      }
    },
    onSuccess: (message) => {
      setEmail('')
      setDisplayName('')
      setPassword('')
      onDone(message)
      onClose()
    },
  })

  return (
    <CrmModal
      open={open}
      title="Convidar membro"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!email.includes('@') || mutation.isPending}
            className={primaryButtonClass}
          >
            <Mail size={14} /> Convidar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="E-mail">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="pessoa@empresa.com.br" />
        </CrmField>
        <CrmField label="Nome">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </CrmField>
        <CrmField label="Perfil">
          <Selecao value={role} onChange={(e) => setRole(e.target.value as WorkspaceMember['role'])} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Selecao>
        </CrmField>
        <CrmField label="Senha (opcional)" hint="Em branco = enviamos um convite por e-mail.">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </CrmField>
        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

function PasswordModal({
  member,
  onClose,
  onDone,
}: {
  member: WorkspaceMember
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch('/admin/clients/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: member.email, password }),
      }),
    onSuccess: () => onDone(`Senha de ${member.email} trocada.`),
  })

  return (
    <CrmModal
      open
      title="Trocar senha"
      description={member.email}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={password.length < 8 || mutation.isPending}
            className={primaryButtonClass}
          >
            Trocar senha
          </button>
        </>
      }
    >
      <CrmField label="Nova senha" hint="Mínimo de 8 caracteres.">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </CrmField>
      {mutation.isError && <p className="mt-2 text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
    </CrmModal>
  )
}

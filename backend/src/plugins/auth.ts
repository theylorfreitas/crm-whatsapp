import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export interface AuthUser {
  id: string
  email: string | null
  role: 'owner' | 'client'
  clientId: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

// Confere o token do Supabase que o front manda em "Authorization: Bearer
// <jwt>" e busca o papel (owner/client) na tabela `profiles`. TODO endpoint
// privado do backend passa por um destes dois hooks como preHandler — nunca
// confiamos em nada que vem do front sem essa checagem contra o Supabase.
export function buildAuthHooks(app: FastifyInstance) {
  async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
    if (!token) {
      reply.code(401).send({ error: 'Não autenticado.' })
      return
    }

    const { data: userData, error: userError } = await app.supabaseService.auth.getUser(token)
    if (userError || !userData.user) {
      reply.code(401).send({ error: 'Sessão inválida ou expirada.' })
      return
    }

    const { data: profile, error: profileError } = await app.supabaseService
      .from('profiles')
      .select('role, client_id')
      .eq('id', userData.user.id)
      .single()

    if (profileError || !profile) {
      reply.code(403).send({ error: 'Usuário sem perfil configurado.' })
      return
    }

    req.user = {
      id: userData.user.id,
      email: userData.user.email ?? null,
      role: profile.role,
      clientId: profile.client_id,
    }
  }

  async function requireOwner(req: FastifyRequest, reply: FastifyReply) {
    await requireAuth(req, reply)
    if (reply.sent) return
    if (req.user?.role !== 'owner') {
      reply.code(403).send({ error: 'Só o dono pode fazer isso.' })
    }
  }

  return { requireAuth, requireOwner }
}

export type AuthHooks = ReturnType<typeof buildAuthHooks>

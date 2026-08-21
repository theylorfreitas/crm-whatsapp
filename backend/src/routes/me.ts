import type { FastifyInstance } from 'fastify'
import type { AuthHooks } from '../plugins/auth.js'

// Primeira rota protegida de verdade: prova a cadeia inteira funcionando —
// token do Supabase enviado pelo front → validado aqui → papel (dono/cliente)
// lido de `profiles`. É nela que testamos login+RLS antes de construir
// qualquer tela real em cima.
export function meRoutes(app: FastifyInstance, auth: AuthHooks) {
  app.get('/me', { preHandler: auth.requireAuth }, async (req) => {
    return { user: req.user }
  })
}

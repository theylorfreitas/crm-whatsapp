import fp from 'fastify-plugin'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FastifyInstance } from 'fastify'
import type { Env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    supabaseService: SupabaseClient
  }
}

interface SupabasePluginOpts {
  env: Env
}

// Cliente com a service_role key: ignora RLS de propósito — é uso interno do
// servidor, nunca chega ao navegador. É esse cliente que confirma sessão
// (auth.getUser) e faz as operações privilegiadas (provisionar workspace,
// gravar estado de integração, etc.) nas próximas partes.
export default fp(async function supabasePlugin(app: FastifyInstance, opts: SupabasePluginOpts) {
  const client = createClient(opts.env.SUPABASE_URL, opts.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  app.decorate('supabaseService', client)
})

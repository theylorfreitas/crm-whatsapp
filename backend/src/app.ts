import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { Env } from './config/env.js'
import supabasePlugin from './plugins/supabase.js'
import { buildAuthHooks } from './plugins/auth.js'
import { healthRoutes } from './routes/health.js'
import { meRoutes } from './routes/me.js'
import { crmRoutes } from './routes/crm.js'

// Monta a aplicação Fastify: registra os plugins (CORS, cliente Supabase) e as
// rotas. Fica separado do `index.ts` para dar pra testar a app inteira sem
// precisar abrir uma porta de verdade.
//
// ── O QUE ESTA API FAZ, E O QUE ELA NÃO FAZ ────────────────────────────────
//
// Ela é curta de propósito. Quase tudo o que o CRM lê e escreve, a tela busca
// direto no Supabase, protegida pelo RLS do banco. Esta API existe só para o
// que a tela NÃO PODE fazer:
//
//   - guardar e usar segredo (o token do seu WhatsApp mora aqui, nunca lá);
//   - falar com a ponte do WhatsApp em nome de quem está logado;
//   - responder quem é o usuário da vez, com o papel dele conferido no
//     servidor e não no navegador.
//
// Se você for acrescentar uma tela nova, o caminho normal é a tela ler o banco
// direto e você escrever a policy de RLS correspondente. Só passe pela API o
// que envolver uma chave que o navegador não pode ver.
export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(supabasePlugin, { env })

  const auth = buildAuthHooks(app)

  // `healthRoutes` fica FORA do escopo autenticado, e isso é de propósito: é
  // por ele que o monitoramento pergunta se a API está de pé, e um monitor que
  // precisa de login não serve para dizer que o login caiu.
  await app.register(healthRoutes)

  await app.register(async (instance) => {
    meRoutes(instance, auth)
    crmRoutes(instance, auth)
  })

  return app
}

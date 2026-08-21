import { z } from 'zod'

// Todo processo real precisa falhar rápido se faltar configuração — nunca
// subir "meio configurado" fingindo que está tudo bem. As mensagens aqui
// apontam exatamente pro .env.example pra quem for rodar isto saber o que
// preencher.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url({ message: 'defina SUPABASE_URL (Project Settings → API no Supabase)' }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { message: 'defina SUPABASE_SERVICE_ROLE_KEY (Project Settings → API, chave "service_role")' }),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, { message: 'defina SUPABASE_ANON_KEY (Project Settings → API, chave "anon / public")' }),
  CORS_ORIGIN: z.string().default('http://localhost:5183'),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Configuração inválida — confira o .env na raiz do projeto (veja .env.example):')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

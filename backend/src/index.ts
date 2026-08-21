import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { loadEnv } from './config/env.js'
import { buildApp } from './app.js'

// Um .env só, na raiz do projeto (mesmo que o docker-compose usa) — tanto
// rodando local (`npm run dev` dentro de backend/) quanto já compilado
// (backend/dist) o arquivo fica dois níveis acima deste arquivo. Dentro do
// contêiner Docker isto não faz nada (não existe .env lá; as variáveis
// chegam prontas via `env_file` do compose), o que é o comportamento certo.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.resolve(__dirname, '../../.env') })

const env = loadEnv()

const app = await buildApp(env)

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`crm-backend rodando na porta ${env.PORT} (${env.NODE_ENV})`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })

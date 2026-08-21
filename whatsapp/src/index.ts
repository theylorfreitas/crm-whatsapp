import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { loadWhatsappEnv } from './config/env.js'
import { buildWhatsappBridge } from './app.js'

// Mesmo .env da raiz que o backend e a ponte interna usam. Dentro de
// contêiner não acha arquivo nenhum, e está certo: lá as variáveis já chegam
// prontas pelo ambiente.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.resolve(__dirname, '../../.env') })

const env = loadWhatsappEnv()
const app = buildWhatsappBridge(env)

// 0.0.0.0 e não 127.0.0.1, ao contrário da ponte interna: o provedor antigo fala com
// esta porta de DENTRO do contêiner, e pra ele o host é outra máquina. Quem
// protege é o WHATSAPP_BRIDGE_TOKEN, obrigatório em toda rota.
app
  .listen({ port: env.WHATSAPP_BRIDGE_PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`ponte de WhatsApp na porta ${env.WHATSAPP_BRIDGE_PORT}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })

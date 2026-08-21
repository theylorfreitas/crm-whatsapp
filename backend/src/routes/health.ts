import type { FastifyInstance } from 'fastify'

// Endpoint sem autenticação — só prova que o processo está de pé. Usado pelo
// docker-compose/monitoramento, não expõe dado nenhum.
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'crm-backend',
    time: new Date().toISOString(),
  }))
}

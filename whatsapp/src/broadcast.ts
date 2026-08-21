import type { SupabaseClient } from '@supabase/supabase-js'
import type { FastifyBaseLogger } from 'fastify'
import type { Zapper } from './zapper.js'

// O disparo em massa. Existe separado do envio normal por um motivo só:
// RITMO. Mandar 200 mensagens em sequência pelo mesmo número é o padrão que o
// WhatsApp usa pra identificar automação e bloquear a linha. Aqui cada envio
// espera um intervalo ALEATÓRIO entre o mínimo e o máximo configurados, o
// disparo respeita a janela de horário e para no teto diário.

interface Ritmo {
  min_interval_seconds: number
  max_interval_seconds: number
  daily_cap: number
  window_start: string
  window_end: string
}

const RITMO_PADRAO: Ritmo = {
  min_interval_seconds: 30,
  max_interval_seconds: 90,
  daily_cap: 200,
  window_start: '09:00',
  window_end: '20:00',
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function minutosDoDia(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h ?? 0) * 60 + Number(m ?? 0)
}

/** Quanto falta até a janela abrir, em ms. 0 se já está aberta. */
function esperaAteAJanela(ritmo: Ritmo, agora = new Date()): number {
  const inicio = minutosDoDia(ritmo.window_start)
  const fim = minutosDoDia(ritmo.window_end)
  const atual = agora.getHours() * 60 + agora.getMinutes()
  if (inicio === fim) return 0 // janela igual = sem restrição
  const dentro = inicio < fim ? atual >= inicio && atual < fim : atual >= inicio || atual < fim
  if (dentro) return 0
  const faltam = (inicio - atual + 1440) % 1440
  return faltam * 60_000
}

export class Disparos {
  /** Um disparo por vez por id — clicar duas vezes não duplica o envio. */
  private readonly rodando = new Set<string>()

  constructor(
    private readonly db: SupabaseClient,
    private readonly zap: Zapper,
    private readonly log: FastifyBaseLogger,
  ) {}

  emAndamento(broadcastId: string): boolean {
    return this.rodando.has(broadcastId)
  }

  /** Não espera terminar: o disparo leva horas, quem chamou quer um "ok". */
  iniciar(broadcastId: string): void {
    if (this.rodando.has(broadcastId)) return
    this.rodando.add(broadcastId)
    void this.executar(broadcastId)
      .catch((e) => this.log.error({ err: e, broadcastId }, 'disparo falhou'))
      .finally(() => this.rodando.delete(broadcastId))
  }

  private async executar(broadcastId: string): Promise<void> {
    const { data: disparo } = await this.db
      .from('crm_broadcasts')
      .select('id, client_id, connection_id, message_body, status')
      .eq('id', broadcastId)
      .single()
    if (!disparo) throw new Error('disparo não encontrado')
    if (!disparo.connection_id) throw new Error('disparo sem conexão escolhida')
    if (!disparo.message_body?.trim()) {
      await this.encerrar(broadcastId, 'falhou')
      throw new Error('disparo sem texto de mensagem')
    }

    const { data: conexao } = await this.db
      .from('crm_connections')
      .select('id, instance_id')
      .eq('id', disparo.connection_id)
      .single()
    const sessao = conexao?.instance_id ?? disparo.connection_id

    const { data: config } = await this.db
      .from('crm_broadcast_settings')
      .select('min_interval_seconds, max_interval_seconds, daily_cap, window_start, window_end')
      .eq('client_id', disparo.client_id)
      .eq('connection_id', disparo.connection_id)
      .maybeSingle()
    const ritmo: Ritmo = { ...RITMO_PADRAO, ...(config ?? {}) }

    const { data: alvos } = await this.db
      .from('crm_broadcast_targets')
      .select('id, name, phone')
      .eq('broadcast_id', broadcastId)
      .eq('status', 'pendente')
      .order('id')
    if (!alvos?.length) {
      await this.encerrar(broadcastId, 'concluido')
      return
    }

    this.log.info({ broadcastId, alvos: alvos.length, ritmo }, 'disparo começou')

    let enviados = 0
    let falhas = 0
    let noDia = 0

    for (const [i, alvo] of alvos.entries()) {
      // Cancelar no meio tem que PARAR no meio — reler o status a cada envio
      // é barato perto de mandar mensagem que o cliente já cancelou.
      const { data: atual } = await this.db.from('crm_broadcasts').select('status').eq('id', broadcastId).single()
      if (atual?.status === 'cancelado') {
        this.log.info({ broadcastId, enviados }, 'disparo cancelado no meio')
        await this.db
          .from('crm_broadcast_targets')
          .update({ status: 'cancelado' })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pendente')
        return
      }

      if (noDia >= ritmo.daily_cap) {
        // O que passou do teto fica pendente e volta no próximo start —
        // marcar como falha esconderia gente que nunca chegou a ser tentada.
        this.log.info({ broadcastId, noDia }, 'teto diário atingido; o resto fica pendente')
        await this.encerrar(broadcastId, 'agendado')
        return
      }

      const espera = esperaAteAJanela(ritmo)
      if (espera > 0) {
        this.log.info({ broadcastId, minutos: Math.round(espera / 60_000) }, 'fora da janela de horário; aguardando')
        await dormir(espera)
      }

      const texto = (disparo.message_body ?? '').replaceAll('{nome}', alvo.name?.trim() || 'tudo bem')

      try {
        await this.zap.enviarTexto(sessao, alvo.phone, texto)
        enviados++
        noDia++
        await this.db
          .from('crm_broadcast_targets')
          .update({ status: 'enviado', sent_at: new Date().toISOString(), error: null })
          .eq('id', alvo.id)
      } catch (e) {
        falhas++
        await this.db
          .from('crm_broadcast_targets')
          .update({ status: 'falhou', error: (e as Error).message.slice(0, 300) })
          .eq('id', alvo.id)
      }

      await this.db.from('crm_broadcasts').update({ sent_count: enviados, failed_count: falhas }).eq('id', broadcastId)

      if (i < alvos.length - 1) {
        const min = Math.max(1, ritmo.min_interval_seconds)
        const max = Math.max(min, ritmo.max_interval_seconds)
        await dormir((min + Math.random() * (max - min)) * 1000)
      }
    }

    await this.encerrar(broadcastId, 'concluido')
    this.log.info({ broadcastId, enviados, falhas }, 'disparo terminou')
  }

  private async encerrar(broadcastId: string, status: 'concluido' | 'falhou' | 'agendado'): Promise<void> {
    await this.db
      .from('crm_broadcasts')
      .update({ status, ...(status === 'concluido' ? { finished_at: new Date().toISOString() } : {}) })
      .eq('id', broadcastId)
  }
}

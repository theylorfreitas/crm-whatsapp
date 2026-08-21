import { supabase } from '../supabaseClient'

// Horário de atendimento POR CONEXÃO, com mais de um intervalo por dia.
//
// A tabela antiga era uma linha por dia da semana, para o cliente inteiro: um
// intervalo só, e igual em todos os números. Quem fecha para o almoço não
// conseguia dizer isso, e quem tem um número de vendas e outro de suporte não
// conseguia dar horários diferentes a cada um.
//
// E, mais importante: NINGUÉM LIA aquela tabela. O expediente é obedecido de
// verdade desde a migração 0045 — o motor de fluxos confere antes de acionar
// qualquer automação.

export type AcaoForaDoHorario = 'mensagem' | 'fluxo'

export interface ConfigDeHorario {
  ativo: boolean
  acaoFora: AcaoForaDoHorario
  mensagemFora: string
  fluxoFora: string | null
}

export interface JanelaDeHorario {
  id: string
  weekday: number
  inicio: string
  fim: string
}

export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

export const CONFIG_DE_HORARIO_PADRAO: ConfigDeHorario = {
  // Nasce desligado: uma conexão que hoje atende a qualquer hora não pode
  // começar a responder "estamos fechados" de madrugada só porque alguém abriu
  // esta tela pra ver o que tem nela.
  ativo: false,
  acaoFora: 'mensagem',
  mensagemFora: '',
  fluxoFora: null,
}

export async function fetchConfigDeHorario(clientId: string, connectionId: string): Promise<ConfigDeHorario> {
  const { data, error } = await supabase
    .from('crm_horario_config')
    .select('ativo, acao_fora, mensagem_fora, fluxo_fora')
    .eq('client_id', clientId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...CONFIG_DE_HORARIO_PADRAO }
  return {
    ativo: data.ativo,
    acaoFora: data.acao_fora === 'fluxo' ? 'fluxo' : 'mensagem',
    mensagemFora: data.mensagem_fora ?? '',
    fluxoFora: data.fluxo_fora,
  }
}

export async function salvarConfigDeHorario(
  clientId: string,
  connectionId: string,
  cfg: ConfigDeHorario,
): Promise<void> {
  const { error } = await supabase.from('crm_horario_config').upsert(
    {
      client_id: clientId,
      connection_id: connectionId,
      ativo: cfg.ativo,
      acao_fora: cfg.acaoFora,
      mensagem_fora: cfg.mensagemFora.trim() || null,
      fluxo_fora: cfg.fluxoFora,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,connection_id' },
  )
  if (error) throw error
}

export async function fetchJanelas(clientId: string, connectionId: string): Promise<JanelaDeHorario[]> {
  const { data, error } = await supabase
    .from('crm_horario_janelas')
    .select('id, weekday, inicio, fim')
    .eq('client_id', clientId)
    .eq('connection_id', connectionId)
    .order('weekday')
    .order('inicio')
  if (error) throw error
  return (data ?? []).map((j) => ({
    id: j.id,
    weekday: j.weekday,
    // o Postgres devolve 'HH:MM:SS'; o input type=time quer 'HH:MM'
    inicio: String(j.inicio).slice(0, 5),
    fim: String(j.fim).slice(0, 5),
  }))
}

export async function criarJanela(clientId: string, connectionId: string, weekday: number): Promise<void> {
  const { error } = await supabase
    .from('crm_horario_janelas')
    .insert({ client_id: clientId, connection_id: connectionId, weekday, inicio: '09:00', fim: '18:00' })
  if (error) throw error
}

export async function salvarJanela(id: string, patch: { inicio?: string; fim?: string }): Promise<void> {
  const { error } = await supabase.from('crm_horario_janelas').update(patch).eq('id', id)
  if (error) throw error
}

export async function apagarJanela(id: string): Promise<void> {
  const { error } = await supabase.from('crm_horario_janelas').delete().eq('id', id)
  if (error) throw error
}

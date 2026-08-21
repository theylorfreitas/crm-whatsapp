import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus, Save, Trash2, MessageSquare, Workflow, Check } from 'lucide-react'
import {
  fetchConfigDeHorario,
  salvarConfigDeHorario,
  fetchJanelas,
  criarJanela,
  salvarJanela,
  apagarJanela,
  DIAS_DA_SEMANA,
  CONFIG_DE_HORARIO_PADRAO,
  type ConfigDeHorario,
} from '../../../lib/db/crmHorarios'
import { fetchFlows } from '../../../lib/db/crmFlows'
import { CrmLoading } from '../CrmDataStates'
import { CrmErrorBar, CrmToggle, inputClass, primaryButtonClass } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'
import { SeletorDeConexao, BlocoDeConfig, EscolhaEmCartoes } from './PecasDeConfiguracao'

// HORÁRIO DE ATENDIMENTO — o que esta tela passou a fazer.
//
// Ela existia desde sempre e NÃO CONFIGURAVA NADA. Nenhuma linha do sistema lia
// `crm_business_hours`: o próprio texto embaixo do título dizia "fora do
// horário, o CRM responde com a mensagem definida em Configurações gerais", e
// não respondia. Quem escrevia às 3h da manhã era atendido pelo robô como se
// fosse meio-dia de terça, e nem a mensagem de fora do expediente nem a de
// boas-vindas tinham leitor em lugar nenhum.
//
// Agora o motor de fluxos confere isto ANTES de acionar qualquer automação.
//
// Duas mudanças de forma vieram junto, e as duas são consequência de uso real:
//   1. O expediente é POR CONEXÃO. Um número de vendas e um de suporte não têm
//      o mesmo horário.
//   2. Cada dia aceita MAIS DE UM intervalo. Quem fecha para o almoço não
//      conseguia dizer isso num par abre/fecha.

export function HorariosPanel({ clientId }: { clientId: string }) {
  const [conexaoId, setConexaoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      <SeletorDeConexao
        clientId={clientId}
        valor={conexaoId}
        onChange={setConexaoId}
        titulo="Selecione o WhatsApp que deseja configurar"
        detalhe="O expediente vale por número: vendas e suporte podem atender em horários diferentes."
      />

      {erro && <CrmErrorBar message={erro} onClose={() => setErro(null)} />}

      {conexaoId && <PainelDaConexao key={conexaoId} clientId={clientId} conexaoId={conexaoId} onErro={setErro} />}
    </div>
  )
}

function PainelDaConexao({
  clientId,
  conexaoId,
  onErro,
}: {
  clientId: string
  conexaoId: string
  onErro: (m: string) => void
}) {
  const queryClient = useQueryClient()
  const [salvo, setSalvo] = useState(false)

  const configQuery = useQuery({
    queryKey: ['crm-horario-config', conexaoId],
    queryFn: () => fetchConfigDeHorario(clientId, conexaoId),
  })
  const janelasQuery = useQuery({
    queryKey: ['crm-horario-janelas', conexaoId],
    queryFn: () => fetchJanelas(clientId, conexaoId),
  })
  const fluxosQuery = useQuery({ queryKey: ['crm-flows', clientId], queryFn: () => fetchFlows(clientId) })

  const [cfg, setCfg] = useState<ConfigDeHorario>(CONFIG_DE_HORARIO_PADRAO)
  const [carregou, setCarregou] = useState(false)
  useEffect(() => {
    if (configQuery.data && !carregou) {
      setCfg(configQuery.data)
      setCarregou(true)
    }
  }, [configQuery.data, carregou])

  const recarregarJanelas = () => queryClient.invalidateQueries({ queryKey: ['crm-horario-janelas', conexaoId] })

  const salvarMutation = useMutation({
    mutationFn: () => salvarConfigDeHorario(clientId, conexaoId, cfg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-horario-config', conexaoId] })
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2200)
    },
    onError: (e: Error) => onErro(e.message),
  })

  const novaJanela = useMutation({
    mutationFn: (weekday: number) => criarJanela(clientId, conexaoId, weekday),
    onSuccess: recarregarJanelas,
    onError: (e: Error) => onErro(e.message),
  })
  const mudarJanela = useMutation({
    mutationFn: (v: { id: string; patch: { inicio?: string; fim?: string } }) => salvarJanela(v.id, v.patch),
    onSuccess: recarregarJanelas,
    onError: (e: Error) => onErro(e.message),
  })
  const removerJanela = useMutation({
    mutationFn: apagarJanela,
    onSuccess: recarregarJanelas,
    onError: (e: Error) => onErro(e.message),
  })

  const janelas = janelasQuery.data ?? []
  const fluxosAtivos = (fluxosQuery.data ?? []).filter((f) => f.status === 'ativo')

  if (configQuery.isLoading) return <CrmLoading />

  return (
    <div className="space-y-4">
      <BlocoDeConfig
        icone={<Clock size={15} />}
        titulo="Configuração de Horários"
        detalhe="Defina os horários e ações fora do expediente"
        acao={
          <button type="button" onClick={() => salvarMutation.mutate()} disabled={salvarMutation.isPending} className={primaryButtonClass}>
            {salvo ? <Check size={14} /> : <Save size={14} />}
            {salvo ? 'Salvo' : salvarMutation.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        }
      >
        <CrmToggle
          checked={cfg.ativo}
          onChange={(v) => setCfg({ ...cfg, ativo: v })}
          label="Sistema de horários ativo"
          hint={
            cfg.ativo
              ? 'Mensagem que chegar fora dos intervalos abaixo recebe a ação escolhida, e nenhuma outra automação roda.'
              : 'Desligado, este número atende a qualquer hora. É o comportamento de quem nunca abriu esta tela.'
          }
        />
      </BlocoDeConfig>

      <BlocoDeConfig
        icone={<Clock size={15} />}
        titulo="Horários"
        detalhe="Defina os dias e horários de atendimento para sua empresa"
      >
        {janelasQuery.isLoading ? (
          <CrmLoading />
        ) : (
          <div className="space-y-2">
            {DIAS_DA_SEMANA.map((nome, weekday) => {
              const doDia = janelas.filter((j) => j.weekday === weekday)
              return (
                <div key={weekday} className="rounded-xl border border-line bg-canvas px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="w-28 shrink-0 text-[13px] font-medium text-ink-2">{nome}</span>

                    {doDia.length === 0 && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-4">
                        Fechado
                      </span>
                    )}

                    {/* O nome acessível diz O DIA. Sem ele, um leitor de tela
                        anuncia sete botões chamados "Horário" em sequência, e
                        quem navega por teclado não sabe em qual dia está. */}
                    <button
                      type="button"
                      onClick={() => novaJanela.mutate(weekday)}
                      aria-label={`Adicionar horário em ${nome}`}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[11px] font-medium text-ink-3 hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                    >
                      <Plus size={11} /> Horário
                    </button>
                  </div>

                  {doDia.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {doDia.map((j) => (
                        <div key={j.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
                          <input
                            type="time"
                            defaultValue={j.inicio}
                            // Grava ao SAIR do campo. O input de hora dispara
                            // change a cada dígito, e gravar por dígito manda
                            // uma escrita a cada tecla, com "09:0" no meio.
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== j.inicio) {
                                mudarJanela.mutate({ id: j.id, patch: { inicio: e.target.value } })
                              }
                            }}
                            aria-label={`${nome}: começa às`}
                            className="rounded border border-line bg-surface px-1.5 py-0.5 text-[13px] tabular-nums text-ink-2 focus:outline-none focus:ring-2 focus:ring-line"
                          />
                          <span className="text-[11px] text-ink-4">às</span>
                          <input
                            type="time"
                            defaultValue={j.fim}
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== j.fim) {
                                mudarJanela.mutate({ id: j.id, patch: { fim: e.target.value } })
                              }
                            }}
                            aria-label={`${nome}: termina às`}
                            className="rounded border border-line bg-surface px-1.5 py-0.5 text-[13px] tabular-nums text-ink-2 focus:outline-none focus:ring-2 focus:ring-line"
                          />
                          <button
                            type="button"
                            onClick={() => removerJanela.mutate(j.id)}
                            aria-label={`Remover o horário de ${nome}`}
                            className="rounded p-1 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          O intervalo do almoço são dois horários no mesmo dia: 09:00 às 12:00 e 13:30 às 18:00. Dia sem nenhum horário
          é dia fechado.
        </p>
      </BlocoDeConfig>

      <BlocoDeConfig
        icone={<MessageSquare size={15} />}
        titulo="Tipo de Ação Fora do Horário"
        detalhe="Escolha o tipo de ação para quando sua empresa estiver fora do horário de atendimento"
      >
        <EscolhaEmCartoes
          valor={cfg.acaoFora}
          onChange={(v) => setCfg({ ...cfg, acaoFora: v })}
          opcoes={[
            {
              valor: 'mensagem',
              titulo: 'Mensagem',
              detalhe: 'Envia uma mensagem automática',
              icone: <MessageSquare size={17} />,
            },
            { valor: 'fluxo', titulo: 'Fluxo', detalhe: 'Inicia um fluxo automatizado', icone: <Workflow size={17} /> },
          ]}
        />

        <div className="mt-4">
          {cfg.acaoFora === 'mensagem' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-2">Mensagem</span>
              <textarea
                value={cfg.mensagemFora}
                onChange={(e) => setCfg({ ...cfg, mensagemFora: e.target.value })}
                rows={4}
                placeholder="Digite a mensagem que será enviada automaticamente..."
                className={inputClass}
              />
              <span className="mt-1 block text-[11px] text-ink-4">
                Aceita as variáveis do contato: {'{first_name}'}, {'{hora}'}, {'{dia}'}.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-2">Fluxo</span>
              <Selecao
                value={cfg.fluxoFora ?? ''}
                onChange={(e) => setCfg({ ...cfg, fluxoFora: e.target.value || null })}
                className={inputClass}
              >
                <option value="">Buscar fluxo pelo nome...</option>
                {fluxosAtivos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Selecao>
              {fluxosAtivos.length === 0 && (
                <span className="mt-1 block text-[11px] text-warn-ink">
                  Nenhum fluxo ativo. Um fluxo pausado escolhido aqui não dispara.
                </span>
              )}
            </label>
          )}
        </div>

        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          O aviso sai UMA VEZ por fechamento. Quem manda dez mensagens na madrugada de sábado recebe um aviso só; quem
          volta na madrugada seguinte recebe outro.
        </p>
      </BlocoDeConfig>

      <div className="flex justify-end">
        <button type="button" onClick={() => salvarMutation.mutate()} disabled={salvarMutation.isPending} className={primaryButtonClass}>
          {salvo ? <Check size={14} /> : <Save size={14} />}
          {salvo ? 'Salvo' : salvarMutation.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

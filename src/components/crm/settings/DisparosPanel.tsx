import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Save, X, Check, Smartphone } from 'lucide-react'
import {
  fetchRegras,
  criarRegra,
  salvarRegra,
  apagarRegra,
  fetchConfig,
  salvarConfig,
  OPERADORES,
  CONFIG_PADRAO,
  type RegraDeDisparo,
  type CondicaoDeDisparo,
  type OperadorDeCondicao,
  type ConfigDaConexao,
} from '../../../lib/db/crmDisparos'
import { fetchConnections } from '../../../lib/db/crmConnections'
import { fetchFlows } from '../../../lib/db/crmFlows'
import { CrmLoading } from '../CrmDataStates'
import { SeletorDeConexao, CampoDeFluxo } from './PecasDeConfiguracao'
import { CrmErrorBar, CrmConfirmarExclusao, CrmToggle, inputClass, primaryButtonClass } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// Configuração de disparos, POR CONEXÃO.
//
// A tela anterior mostrava só ritmo de envio (intervalo, teto, janela) para
// todas as conexões de uma vez, e não havia nada sobre o que dispara o quê. As
// palavras-chave moravam dentro de cada fluxo, numa lista separada por vírgula
// que só sabia "igual" e "contém": quem tinha dois números não conseguia
// responder diferente em cada um.
//
// Aqui escolhe-se o número primeiro, e tudo abaixo é daquele número.

export function DisparosPanel({ clientId }: { clientId: string }) {
  const [conexaoId, setConexaoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const conexoesQuery = useQuery({
    queryKey: ['crm-connections', clientId],
    queryFn: () => fetchConnections(clientId),
  })
  const conexoes = conexoesQuery.data ?? []

  return (
    <div className="space-y-5">
      {/* O MESMO seletor que Horários usa. Estava copiado nos dois arquivos, e
          um ajuste num deles deixava o outro com outra cara — quem passa de uma
          tela pra outra pensa que mudou de sistema. */}
      <SeletorDeConexao
        clientId={clientId}
        valor={conexaoId}
        onChange={setConexaoId}
        titulo="Selecione o WhatsApp que deseja configurar"
        detalhe="Você pode configurar fluxos personalizados para cada conta do WhatsApp vinculada ao seu sistema."
      />

      {erro && <CrmErrorBar message={erro} onClose={() => setErro(null)} />}

      {conexaoId && (
        <ConfigDaConexaoPainel
          key={conexaoId}
          clientId={clientId}
          conexaoId={conexaoId}
          nome={conexoes.find((c) => c.id === conexaoId)?.name ?? ''}
          telefone={conexoes.find((c) => c.id === conexaoId)?.phone ?? ''}
          onErro={setErro}
        />
      )}
    </div>
  )
}

function ConfigDaConexaoPainel({
  clientId,
  conexaoId,
  nome,
  telefone,
  onErro,
}: {
  clientId: string
  conexaoId: string
  nome: string
  telefone: string
  onErro: (m: string) => void
}) {
  const queryClient = useQueryClient()
  const [aExcluir, setAExcluir] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const regrasQuery = useQuery({
    queryKey: ['crm-disparo-regras', conexaoId],
    queryFn: () => fetchRegras(clientId, conexaoId),
  })
  const configQuery = useQuery({
    queryKey: ['crm-disparo-config', conexaoId],
    queryFn: () => fetchConfig(clientId, conexaoId),
  })
  const fluxosQuery = useQuery({ queryKey: ['crm-flows', clientId], queryFn: () => fetchFlows(clientId) })

  const [cfg, setCfg] = useState<ConfigDaConexao>(CONFIG_PADRAO)
  const [carregou, setCarregou] = useState(false)
  useEffect(() => {
    if (configQuery.data && !carregou) {
      setCfg(configQuery.data)
      setCarregou(true)
    }
  }, [configQuery.data, carregou])

  const recarregarRegras = () => queryClient.invalidateQueries({ queryKey: ['crm-disparo-regras', conexaoId] })

  const novaRegra = useMutation({
    mutationFn: () => criarRegra(clientId, conexaoId, (regrasQuery.data ?? []).length),
    onSuccess: recarregarRegras,
    onError: (e: Error) => onErro(e.message),
  })
  const excluir = useMutation({
    mutationFn: apagarRegra,
    onSuccess: recarregarRegras,
    onError: (e: Error) => onErro(e.message),
  })
  const salvarTudo = useMutation({
    mutationFn: () => salvarConfig(clientId, conexaoId, cfg),
    onSuccess: () => {
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2200)
      queryClient.invalidateQueries({ queryKey: ['crm-disparo-config', conexaoId] })
    },
    onError: (e: Error) => onErro(e.message),
  })

  const fluxos = (fluxosQuery.data ?? []).map((f) => ({ id: f.id, name: f.name }))
  const regras = regrasQuery.data ?? []

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent-ink)]">
            <Smartphone size={15} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-ink">{nome}</span>
            <span className="block truncate text-[11px] text-ink-3">{telefone || 'Configure os fluxos automáticos'}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {salvo && (
            <span className="flex items-center gap-1 text-[11px] text-ok-ink">
              <Check size={12} /> Salvo
            </span>
          )}
          <button
            type="button"
            onClick={() => salvarTudo.mutate()}
            disabled={salvarTudo.isPending}
            className={primaryButtonClass}
          >
            <Save size={14} />
            {salvarTudo.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </span>
      </div>

      <div className="space-y-6 p-4">
        {/* ── palavras-chave ─────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-ink">Disparo por palavra-chave</h4>
              <p className="mt-0.5 text-[11px] text-ink-3">
                Configure palavras chave que terão prioridade sobre os outros disparos
              </p>
            </div>
            <button
              type="button"
              onClick={() => novaRegra.mutate()}
              disabled={novaRegra.isPending}
              className={`${primaryButtonClass} px-2.5 py-1.5 text-xs`}
            >
              <Plus size={13} />
              Adicionar
            </button>
          </div>

          {regrasQuery.isLoading ? (
            <CrmLoading />
          ) : regras.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-xs text-ink-4">
              Nenhuma palavra-chave ainda. Quem escrever algo que bate com uma regra entra direto no fluxo escolhido.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
              {regras.map((r) => (
                <CartaoDeRegra
                  key={r.id}
                  regra={r}
                  fluxos={fluxos}
                  onExcluir={() => setAExcluir(r.id)}
                  onErro={onErro}
                  onSalvou={recarregarRegras}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── automáticos ────────────────────────────────────────────── */}
        <div className="border-t border-line-soft pt-5">
          <h4 className="text-[13px] font-semibold text-ink">Outros disparos automáticos</h4>
          <p className="mt-0.5 text-[11px] text-ink-3">
            Estes disparos são acionados quando não há palavra-chave correspondente
          </p>

          <div className="mt-3 space-y-4">
            <CampoDeFluxo
              titulo="Fluxo de boas-vindas"
              detalhe="Disparado para novos contatos na primeira mensagem"
              valor={cfg.fluxoBoasVindas}
              fluxos={fluxos}
              onChange={(v) => setCfg({ ...cfg, fluxoBoasVindas: v })}
            />

            <CampoDeFluxo
              titulo="Fluxo de resposta padrão"
              detalhe="Disparado quando não há palavra-chave correspondente, após período de inatividade"
              valor={cfg.fluxoRespostaPadrao}
              fluxos={fluxos}
              onChange={(v) => setCfg({ ...cfg, fluxoRespostaPadrao: v })}
              extra={
                <span className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={cfg.respostaPadraoHoras}
                    onChange={(e) => setCfg({ ...cfg, respostaPadraoHoras: Number(e.target.value) || 1 })}
                    className={`${inputClass} w-20 text-center tabular-nums`}
                  />
                  <span className="text-[11px] text-ink-4">horas</span>
                </span>
              }
            />

            <CampoDeFluxo
              titulo="Fluxo de conversa finalizada"
              detalhe="Disparado quando cliente reabre conversa já marcada como concluída"
              valor={cfg.fluxoConversaFinalizada}
              fluxos={fluxos}
              onChange={(v) => setCfg({ ...cfg, fluxoConversaFinalizada: v })}
            />

            <CampoDeFluxo
              titulo="Fluxo de atendimento finalizado"
              detalhe="Disparado no momento em que o atendimento é marcado como concluído"
              valor={cfg.fluxoAtendimentoFinalizado}
              fluxos={fluxos}
              onChange={(v) => setCfg({ ...cfg, fluxoAtendimentoFinalizado: v })}
            />
          </div>
        </div>

        {/* ── ritmo ──────────────────────────────────────────────────────
            Continua aqui, embaixo, e não sumiu na reforma: é o que protege o
            número de ser bloqueado, e o motor de disparo em massa lê estes
            valores. Tirar a tela deixaria a proteção ligada sem ninguém poder
            ajustá-la. */}
        <div className="border-t border-line-soft pt-5">
          <h4 className="text-[13px] font-semibold text-ink">Ritmo de envio</h4>
          <p className="mt-0.5 text-[11px] text-ink-3">
            Intervalo entre mensagens, teto diário e janela de horário. É o que protege o número de ser bloqueado.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Intervalo mínimo (s)">
              <input
                type="number"
                min={1}
                value={cfg.minIntervalSeconds}
                onChange={(e) => setCfg({ ...cfg, minIntervalSeconds: Number(e.target.value) || 1 })}
                className={`${inputClass} tabular-nums`}
              />
            </Campo>
            <Campo rotulo="Intervalo máximo (s)">
              <input
                type="number"
                min={1}
                value={cfg.maxIntervalSeconds}
                onChange={(e) => setCfg({ ...cfg, maxIntervalSeconds: Number(e.target.value) || 1 })}
                className={`${inputClass} tabular-nums`}
              />
            </Campo>
            <Campo rotulo="Teto diário">
              <input
                type="number"
                min={1}
                value={cfg.dailyCap}
                onChange={(e) => setCfg({ ...cfg, dailyCap: Number(e.target.value) || 1 })}
                className={`${inputClass} tabular-nums`}
              />
            </Campo>
            <Campo rotulo="Começa às">
              <input
                type="time"
                value={cfg.windowStart}
                onChange={(e) => setCfg({ ...cfg, windowStart: e.target.value })}
                className={inputClass}
              />
            </Campo>
            <Campo rotulo="Para às">
              <input
                type="time"
                value={cfg.windowEnd}
                onChange={(e) => setCfg({ ...cfg, windowEnd: e.target.value })}
                className={inputClass}
              />
            </Campo>
            <div className="flex items-end">
              <CrmToggle
                checked={cfg.pauseOnReply}
                onChange={(v) => setCfg({ ...cfg, pauseOnReply: v })}
                label="Parar ao responder"
              />
            </div>
          </div>
        </div>
      </div>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Excluir palavra-chave"
        pergunta="Esta regra sai do ar e as mensagens que batiam com ela deixam de disparar o fluxo. Não dá para desfazer."
        onCancelar={() => setAExcluir(null)}
        onConfirmar={() => {
          if (aExcluir) excluir.mutate(aExcluir)
          setAExcluir(null)
        }}
      />
    </section>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-ink-2">{rotulo}</span>
      {children}
    </label>
  )
}

/**
 * Um cartão de palavra-chave.
 *
 * O estado das condições vive AQUI e é gravado ao sair do campo, não a cada
 * tecla: gravar por tecla mandaria uma escrita por letra digitada, e o campo
 * perderia o foco a cada recarga da lista.
 */
function CartaoDeRegra({
  regra,
  fluxos,
  onExcluir,
  onErro,
  onSalvou,
}: {
  regra: RegraDeDisparo
  fluxos: { id: string; name: string }[]
  onExcluir: () => void
  onErro: (m: string) => void
  onSalvou: () => void
}) {
  const [combinador, setCombinador] = useState(regra.combinador)
  const [condicoes, setCondicoes] = useState<CondicaoDeDisparo[]>(
    regra.condicoes.length ? regra.condicoes : [{ operador: 'contem', valor: '' }],
  )
  const [flowId, setFlowId] = useState(regra.flowId ?? '')

  const gravar = useMutation({
    mutationFn: (patch: Parameters<typeof salvarRegra>[1]) => salvarRegra(regra.id, patch),
    onSuccess: onSalvou,
    onError: (e: Error) => onErro(e.message),
  })

  const trocarCondicao = (i: number, patch: Partial<CondicaoDeDisparo>) => {
    const proximas = condicoes.map((c, j) => (j === i ? { ...c, ...patch } : c))
    setCondicoes(proximas)
    return proximas
  }

  return (
    <div className="flex flex-col rounded-xl border border-line bg-canvas p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Selecao
          value={combinador}
          onChange={(e) => {
            const v = e.target.value === 'e' ? 'e' : 'ou'
            setCombinador(v)
            gravar.mutate({ combinador: v })
          }}
          className={`${inputClass} h-8 w-auto py-1 text-[11px]`}
        >
          <option value="ou">OU (qualquer)</option>
          <option value="e">E (todas)</option>
        </Selecao>
        <button
          type="button"
          onClick={onExcluir}
          aria-label="Excluir esta palavra-chave"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="space-y-1.5">
        {condicoes.map((c, i) => (
          <div key={i}>
            {i > 0 && (
              <p className="my-1 text-center">
                <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-ink)]">
                  {combinador === 'e' ? 'E' : 'OU'}
                </span>
              </p>
            )}
            <div className="rounded-lg border border-line bg-surface p-2">
              <div className="flex items-center gap-1.5">
                <Selecao
                  value={c.operador}
                  onChange={(e) => {
                    const proximas = trocarCondicao(i, { operador: e.target.value as OperadorDeCondicao })
                    gravar.mutate({ condicoes: proximas })
                  }}
                  className={`${inputClass} h-8 flex-1 py-1 text-[11px]`}
                >
                  {OPERADORES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </Selecao>
                {condicoes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const proximas = condicoes.filter((_, j) => j !== i)
                      setCondicoes(proximas)
                      gravar.mutate({ condicoes: proximas })
                    }}
                    aria-label="Remover esta condição"
                    className="flex h-8 w-7 shrink-0 items-center justify-center rounded text-ink-4 hover:text-danger-ink"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <input
                value={c.valor}
                onChange={(e) => trocarCondicao(i, { valor: e.target.value })}
                onBlur={() => gravar.mutate({ condicoes })}
                placeholder="Palavra-chave"
                className={`${inputClass} mt-1.5 h-8 py-1 text-[11px]`}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          const proximas = [...condicoes, { operador: 'contem' as OperadorDeCondicao, valor: '' }]
          setCondicoes(proximas)
          gravar.mutate({ condicoes: proximas })
        }}
        className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong py-1.5 text-[11px] text-ink-3 hover:bg-surface hover:text-ink-2"
      >
        <Plus size={11} />
        Adicionar condição
      </button>

      <Selecao
        value={flowId}
        onChange={(e) => {
          setFlowId(e.target.value)
          gravar.mutate({ flowId: e.target.value || null })
        }}
        className={`${inputClass} mt-2 h-8 py-1 text-[11px]`}
      >
        <option value="">Buscar fluxo pelo nome...</option>
        {fluxos.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Selecao>
    </div>
  )
}

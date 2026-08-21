import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Trash2 } from 'lucide-react'
import {
  fetchAgendamentos,
  criarAgendamento,
  cancelarAgendamento,
  MAX_DIAS_AGENDAMENTO,
  type AgendamentoTipo,
  type AgendamentoRepeticao,
} from '../../../lib/db/crmChatActions'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass, CrmPill } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

const REPETICOES: { valor: AgendamentoRepeticao; rotulo: string }[] = [
  { valor: 'nao_repetir', rotulo: 'Não repetir' },
  { valor: 'diario', rotulo: 'Todo dia' },
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'mensal', rotulo: 'Todo mês' },
]

/** `datetime-local` quer 'AAAA-MM-DDTHH:mm' na hora LOCAL, não em UTC. */
function paraCampoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function AgendarMensagemModal({
  open,
  clientId,
  chatId,
  respostasRapidas,
  fluxos,
  usuarioAtual,
  onClose,
}: {
  open: boolean
  clientId: string
  chatId: string
  respostasRapidas: { id: string; title: string; body: string }[]
  fluxos: { id: string; name: string }[]
  usuarioAtual: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [tipo, setTipo] = useState<AgendamentoTipo>('mensagem')
  const [conteudo, setConteudo] = useState('')
  const [texto, setTexto] = useState('')
  const [quando, setQuando] = useState(() => paraCampoLocal(new Date(Date.now() + 60 * 60 * 1000)))
  const [repeticao, setRepeticao] = useState<AgendamentoRepeticao>('nao_repetir')
  const [erro, setErro] = useState<string | null>(null)

  const agendaQuery = useQuery({
    queryKey: ['crm-agendamentos', chatId],
    queryFn: () => fetchAgendamentos(chatId),
    enabled: open,
  })

  const criar = useMutation({
    mutationFn: () =>
      criarAgendamento(clientId, {
        chatId,
        kind: tipo,
        body: tipo === 'mensagem' ? texto : undefined,
        flowId: tipo === 'fluxo' ? conteudo : null,
        runAt: new Date(quando).toISOString(),
        repeat: repeticao,
        createdByName: usuarioAtual,
      }),
    onSuccess: () => {
      setTexto('')
      setConteudo('')
      setErro(null)
      queryClient.invalidateQueries({ queryKey: ['crm-agendamentos', chatId] })
    },
    onError: (e: Error) => setErro(e.message),
  })

  const cancelar = useMutation({
    mutationFn: cancelarAgendamento,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-agendamentos', chatId] }),
  })

  const pendentes = (agendaQuery.data ?? []).filter((a) => a.status === 'pendente')
  const limite = new Date(Date.now() + MAX_DIAS_AGENDAMENTO * 24 * 60 * 60 * 1000)

  // A validação é a MESMA que o banco cobra (0024). Repetida aqui não pra
  // substituir a do banco, mas pra a pessoa saber antes de clicar em vez de
  // receber um erro de constraint na cara.
  const dataValida = !!quando && new Date(quando) > new Date() && new Date(quando) <= limite
  const conteudoValido = tipo === 'mensagem' ? texto.trim().length > 0 : !!conteudo
  const podeAgendar = dataValida && conteudoValido && !criar.isPending

  return (
    <CrmModal
      open={open}
      title="Agenda mensagem"
      icon={<CalendarDays size={16} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Fechar
          </button>
          <button type="button" onClick={() => criar.mutate()} disabled={!podeAgendar} className={`${primaryButtonClass} disabled:opacity-40`}>
            {criar.isPending ? 'Agendando…' : 'Agendar'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-2">Tipo</p>
          <div className="grid grid-cols-2 gap-2">
            {(['mensagem', 'fluxo'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTipo(t)
                  setConteudo('')
                }}
                className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  tipo === t ? 'text-white' : 'border border-line bg-surface text-ink-2 hover:bg-canvas'
                }`}
                style={tipo === t ? { backgroundColor: 'var(--accent)' } : undefined}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-4">
            {tipo === 'mensagem'
              ? 'Escolha uma resposta rápida ou escreva o texto. Dá pra editar antes de agendar.'
              : 'O fluxo inteiro roda nesta conversa na hora marcada.'}
          </p>
        </div>

        <CrmField label="Conteúdo">
          <Selecao
            className={inputClass}
            value={conteudo}
            onChange={(e) => {
              setConteudo(e.target.value)
              if (tipo === 'mensagem') {
                const r = respostasRapidas.find((x) => x.id === e.target.value)
                if (r) setTexto(r.body)
              }
            }}
          >
            <option value="">O que deseja agendar?</option>
            {(tipo === 'mensagem' ? respostasRapidas.map((r) => ({ id: r.id, nome: r.title })) : fluxos.map((f) => ({ id: f.id, nome: f.name }))).map(
              (o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ),
            )}
          </Selecao>
        </CrmField>

        {tipo === 'mensagem' && (
          <CrmField label="Texto" hint="É este texto que vai ser enviado.">
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              placeholder="Escreva a mensagem…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </CrmField>
        )}

        <CrmField
          label="Data e hora"
          hint={`No máximo ${MAX_DIAS_AGENDAMENTO} dias a partir de agora (mesma regra dos fluxos).`}
        >
          <input
            type="datetime-local"
            className={inputClass}
            value={quando}
            min={paraCampoLocal(new Date())}
            max={paraCampoLocal(limite)}
            onChange={(e) => setQuando(e.target.value)}
          />
        </CrmField>
        {quando && !dataValida && (
          <p className="text-xs text-danger-ink">
            {new Date(quando) <= new Date()
              ? 'A data já passou. Escolha um horário à frente.'
              : `Passa de ${MAX_DIAS_AGENDAMENTO} dias. Escolha uma data mais próxima.`}
          </p>
        )}

        <CrmField label="Repetir">
          <Selecao className={inputClass} value={repeticao} onChange={(e) => setRepeticao(e.target.value as AgendamentoRepeticao)}>
            {REPETICOES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.rotulo}
              </option>
            ))}
          </Selecao>
        </CrmField>

        {erro && <p className="text-xs text-danger-ink">{erro}</p>}

        <div className="border-t border-line-soft pt-3">
          <p className="mb-2 text-xs font-medium text-ink-2">Pendentes neste chat</p>
          {pendentes.length === 0 ? (
            <p className="text-xs text-ink-4">Nenhum agendamento ativo</p>
          ) : (
            <ul className="space-y-1.5">
              {pendentes.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line-soft bg-canvas px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink-2">{a.kind === 'fluxo' ? (a.flowName ?? 'Fluxo') : a.body}</p>
                    <p className="text-[10px] text-ink-4">
                      {new Date(a.runAt).toLocaleString('pt-BR')}
                      {a.repeat !== 'nao_repetir' && ` · ${REPETICOES.find((r) => r.valor === a.repeat)?.rotulo.toLowerCase()}`}
                    </p>
                  </div>
                  <CrmPill tone="amarelo">{a.kind}</CrmPill>
                  <button
                    type="button"
                    onClick={() => cancelar.mutate(a.id)}
                    aria-label="Cancelar agendamento"
                    className="shrink-0 text-ink-4 hover:text-danger-ink"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-ink-4">
            O envio na hora marcada depende da conexão de WhatsApp estar ligada. Sem ela, o agendamento fica pendente.
          </p>
        </div>
      </div>
    </CrmModal>
  )
}

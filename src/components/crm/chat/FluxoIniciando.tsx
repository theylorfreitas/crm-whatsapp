import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Workflow } from 'lucide-react'
import { fetchFlowRun } from '../../../lib/db/crmChatActions'

// O AVISO DE QUE O FLUXO ESTÁ COMEÇANDO NAQUELA PESSOA.
//
// POR QUE ELE EXISTE. Clicar no fluxo não fazia nada visível: o menu fechava e
// pronto. As primeiras mensagens só apareciam na conversa alguns segundos
// depois, e nesse vão a pessoa que atende não tinha como saber se tinha
// clicado errado, se travou, ou se estava só demorando. O reflexo é clicar de
// novo — e disparar duas vezes o mesmo atendimento no cliente.
//
// POR QUE ELE NÃO É SÓ UM GIRO DE UM SEGUNDO. Gravar a linha leva
// milissegundos; o que demora é o robô PEGAR o fluxo, e ele passa de tempos em
// tempos. Uma animação que sumisse ao fim da gravação estaria dizendo "pronto"
// enquanto nada saiu ainda — a mesma mentira, só que mais bonita. Então este
// aviso acompanha a execução de verdade, até ela sair da fila.
//
// POR QUE ELE TEM TRÊS MOVIMENTOS E NÃO UM. Ele fica na tela vários segundos.
// Um único giro parado esse tempo todo lê como travado, não como ocupado. A
// barra que corre diz "está andando", o anel que respira diz "ainda estamos
// esperando", e as três bolinhas dizem EM QUE PÉ está — que é a única coisa
// que um giro sozinho nunca conta.
//
// E ELE SABE DESISTIR. Execução que não sai de 'pendente' quer dizer que o
// robô não está pegando — quase sempre a conexão do WhatsApp fora do ar. Aí o
// certo é dizer isso, e não girar pra sempre.

/** Enquanto isto não vencer, quem manda é a fila. Passou, é problema. */
const PACIENCIA_MS = 45_000

/** De quanto em quanto tempo pergunta se já saiu da fila. */
const INTERVALO_MS = 1500

/** Quanto tempo o "começou" fica na tela antes de sair sozinho. */
const COMEMORACAO_MS = 4500

export interface Partida {
  /** Nulo enquanto a gravação está em andamento. */
  runId: string | null
  flowName: string
  /** Preenchido quando nem a gravação deu certo. */
  erro?: string | null
}

type Fase = 'gravando' | 'na-fila' | 'demorando' | 'andando' | 'falhou'

/** As etapas, na ordem em que acontecem. A fase diz até onde já chegou. */
const ETAPAS = ['gravando', 'na-fila', 'andando'] as const
const ATE_ONDE: Record<Fase, number> = { gravando: 0, 'na-fila': 1, andando: 2, demorando: 1, falhou: 0 }

export function FluxoIniciando({ partida, aoFechar }: { partida: Partida; aoFechar: () => void }) {
  const [fase, setFase] = useState<Fase>('gravando')
  const [detalhe, setDetalhe] = useState<string | null>(null)

  const { runId, erro } = partida

  useEffect(() => {
    if (erro) {
      setFase('falhou')
      setDetalhe(erro)
      return
    }
    if (!runId) {
      setFase('gravando')
      return
    }

    setFase('na-fila')
    setDetalhe(null)

    let vivo = true
    const comecou = Date.now()

    const perguntar = async () => {
      if (!vivo) return
      const run = await fetchFlowRun(runId).catch(() => null)
      if (!vivo || !run) return

      if (run.status === 'falhou' || run.status === 'cancelado') {
        setFase('falhou')
        setDetalhe(run.statusDetail)
        clearInterval(timer)
        return
      }

      // Saiu da fila: o robô pegou. 'aguardando' conta — é o fluxo VIVO,
      // parado num menu esperando a pessoa responder, que é justamente onde
      // um atendimento bem desenhado passa a maior parte do tempo.
      if (run.status !== 'pendente') {
        setFase('andando')
        clearInterval(timer)
        return
      }

      if (Date.now() - comecou > PACIENCIA_MS) {
        setFase('demorando')
        clearInterval(timer)
      }
    }

    const timer = setInterval(() => void perguntar(), INTERVALO_MS)
    void perguntar()

    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [runId, erro])

  // Só o sucesso sai sozinho. Erro e demora ficam até alguém ler — sumi-los
  // esconderia justamente o que precisa de decisão.
  useEffect(() => {
    if (fase !== 'andando') return
    const t = setTimeout(aoFechar, COMEMORACAO_MS)
    return () => clearTimeout(t)
  }, [fase, aoFechar])

  const desenho = DESENHOS[fase]
  const esperando = fase === 'gravando' || fase === 'na-fila'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`partida-entra relative overflow-hidden rounded-xl border ${desenho.caixa}`}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${esperando ? 'partida-anel' : ''}`}
          style={{ backgroundColor: desenho.tijolo, color: desenho.icone }}
        >
          {fase === 'andando' ? (
            <CheckCircle2 size={17} className="partida-pronto" />
          ) : fase === 'falhou' ? (
            <AlertTriangle size={17} />
          ) : fase === 'demorando' ? (
            <Clock size={17} />
          ) : (
            <Workflow size={17} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{desenho.titulo(partida.flowName)}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed opacity-85">{detalhe ?? desenho.recado}</p>

          {/* As três bolinhas: registrar → fila → rodando. É o que diz EM QUE
              PÉ está — o giro sozinho só dizia "espere". */}
          {fase !== 'falhou' && (
            <div className="mt-2 flex items-center gap-1.5" aria-hidden>
              {ETAPAS.map((_, i) => {
                const passou = i <= ATE_ONDE[fase]
                return (
                  <span
                    key={i}
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: i === ATE_ONDE[fase] ? '1.25rem' : '0.375rem',
                      backgroundColor: passou ? 'currentColor' : 'color-mix(in oklab, currentColor 25%, transparent)',
                      opacity: passou ? 0.9 : 1,
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        {(fase === 'falhou' || fase === 'demorando') && (
          <button
            type="button"
            onClick={aoFechar}
            className="shrink-0 rounded-lg border border-current/25 px-2 py-1 text-[11px] font-medium opacity-80 transition-opacity hover:opacity-100"
          >
            Ok
          </button>
        )}
      </div>

      {/* A barra indeterminada, rente à borda de baixo. Indeterminada porque
          não dá pra saber quanto falta — uma barra com porcentagem aqui
          estaria inventando um número. */}
      {esperando && <span className="partida-barra absolute inset-x-0 bottom-0 block h-[3px] overflow-hidden bg-transparent" />}
    </div>
  )
}

const DESENHOS: Record<
  Fase,
  { caixa: string; tijolo: string; icone: string; titulo: (nome: string) => string; recado: string }
> = {
  gravando: {
    caixa: 'border-line bg-surface-2 text-ink-2',
    tijolo: 'color-mix(in oklab, var(--accent) 18%, transparent)',
    icone: 'var(--accent-ink)',
    titulo: (n) => `Iniciando “${n}”…`,
    recado: 'Registrando o disparo nesta conversa.',
  },
  'na-fila': {
    caixa: 'border-line bg-surface-2 text-ink-2',
    tijolo: 'color-mix(in oklab, var(--accent) 18%, transparent)',
    icone: 'var(--accent-ink)',
    titulo: (n) => `Iniciando “${n}”…`,
    recado: 'Na fila. O robô pega em alguns segundos e o atendimento começa.',
  },
  andando: {
    caixa: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    tijolo: 'color-mix(in oklab, currentColor 18%, transparent)',
    icone: 'currentColor',
    titulo: (n) => `“${n}” começou`,
    // "as mensagens já estão saindo" seria mentira em fluxo que só etiqueta ou
    // move de coluna — e dizer que saiu mensagem quando não saiu é o tipo de
    // engano que só aparece quando alguém vai cobrar a resposta do cliente.
    recado: 'O fluxo está rodando nesta conversa.',
  },
  demorando: {
    caixa: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    tijolo: 'color-mix(in oklab, currentColor 18%, transparent)',
    icone: 'currentColor',
    titulo: (n) => `“${n}” ainda não saiu da fila`,
    recado: 'O disparo está gravado e não se perde. Costuma ser a conexão do WhatsApp fora do ar. Confira em Conexões.',
  },
  falhou: {
    caixa: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    tijolo: 'color-mix(in oklab, currentColor 18%, transparent)',
    icone: 'currentColor',
    titulo: (n) => `“${n}” não começou`,
    recado: 'O disparo falhou. Tente de novo; se repetir, confira a conexão do WhatsApp.',
  },
}

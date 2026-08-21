import { useQuery } from '@tanstack/react-query'
import { fetchConnections, type CrmConnection } from '../../lib/db/crmConnections'

// O SINAL DE QUE A AUTOMAÇÃO ESTÁ MESMO NO AR.
//
// POR QUE ELE EXISTE. Um fluxo "ativo" não quer dizer nada sozinho: ativo é uma
// escolha do desenho, guardada no banco, e continua ativa com o WhatsApp fora do
// ar. A falha mais cara deste tipo de sistema é exatamente essa: a tela diz
// "conectada", o número enviava normalmente, e tudo o que o cliente respondia
// era entregue num endereço morto. Ninguém viu, porque não havia erro em lugar
// nenhum: do ponto de vista de cada peça, tudo tinha dado certo.
//
// Então este sinal NÃO mostra se o fluxo está ligado. Ele mostra se a automação
// TEM COMO RECEBER. É a única pergunta cuja resposta errada emudece o
// atendimento inteiro sem avisar.
//
// DE ONDE VEM A VERDADE. Do estado da conexão em `crm_connections`, que o vigia
// da ponte reescreve a cada dois minutos depois de conferir três coisas na
// ordem: a sessão está pareada no provedor, o webhook aponta pra este servidor,
// e esse endereço RESPONDE. A terceira é a que faltava; sem ela o vigia
// comparava dois textos iguais apontando pro nada e se dava por satisfeito.
//
// VERDE É SÓ QUANDO ESTÁ RECEBENDO. "Conectando" acende vermelho, e é de
// propósito: durante a reconexão o número não recebe, e um amarelo tranquilizador
// no meio de uma conversa perdida é pior do que um vermelho que assusta.

/** De quanto em quanto tempo a tela repergunta. */
const INTERVALO_MS = 20_000

interface Leitura {
  recebendo: boolean
  titulo: string
  motivo: string
}

function ler(conexoes: CrmConnection[] | undefined): Leitura {
  if (!conexoes) return { recebendo: false, titulo: 'Verificando', motivo: 'Consultando o estado das conexões.' }

  const doZap = conexoes.filter((c) => c.kind !== 'oficial')
  if (doZap.length === 0) {
    return {
      recebendo: false,
      titulo: 'Offline',
      motivo: 'Nenhum número de WhatsApp conectado. A automação não tem por onde receber.',
    }
  }

  const vivas = doZap.filter((c) => c.status === 'conectada')
  if (vivas.length > 0) {
    const nomes = vivas.map((c) => c.name).join(', ')
    return {
      recebendo: true,
      titulo: 'Ativa',
      motivo:
        vivas.length === doZap.length
          ? `Recebendo por ${nomes}.`
          : `Recebendo por ${nomes}. As outras conexões estão fora do ar.`,
    }
  }

  // Nenhuma recebendo: o motivo mais informativo é o da primeira que tem um.
  const comMotivo = doZap.find((c) => c.statusDetail)
  return {
    recebendo: false,
    titulo: 'Offline',
    motivo:
      comMotivo?.statusDetail ??
      'Nenhuma conexão está recebendo agora. Abra Conexões para ver o que aconteceu com cada número.',
  }
}

/**
 * O ponto e o rótulo, do tamanho de um selo.
 *
 * `title` no lugar de um balão próprio: este sinal aparece em cabeçalho, ao lado
 * de botões, e um balão a mais competindo com os que já existem ali atrapalharia
 * mais do que ajuda. O texto do motivo é o que responde "por que está vermelho".
 */
export function SinalDaAutomacao({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ['crm-connections', clientId],
    queryFn: () => fetchConnections(clientId),
    // SEMPRE ATUALIZADO, inclusive com a aba em segundo plano: quem deixa o
    // painel aberto num monitor lateral é justamente quem precisa ver o
    // vermelho aparecer sem ter que voltar e clicar em algo.
    refetchInterval: INTERVALO_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const { recebendo, titulo, motivo } = ler(data)

  return (
    <span
      title={motivo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        recebendo ? 'border-ok bg-ok-bg text-ok-ink' : 'border-danger bg-danger-bg text-danger-ink'
      }`}
    >
      {/* O PULSO SÓ NO VERDE. Vermelho pulsando lê como alarme piscando, e alarme
          que pisca sozinho a tela toda vira ruído que se aprende a ignorar. O
          verde pulsa porque "ligado" é um estado VIVO, e é o pulso que separa
          isso de um selo pintado de verde. */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${recebendo ? 'pulso-vivo bg-ok-ink' : 'bg-danger-ink'}`}
      />
      {titulo}
      {/* Quem usa leitor de tela não vê cor nem pulso: o motivo inteiro é lido. */}
      <span className="sr-only">. {motivo}</span>
    </span>
  )
}

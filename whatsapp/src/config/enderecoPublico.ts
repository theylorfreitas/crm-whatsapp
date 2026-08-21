import fs from 'node:fs'
import path from 'node:path'

// ONDE A PONTE ATENDE, VISTA DE FORA.
//
// Este era um valor de ambiente, e valor de ambiente é lido uma vez, quando o
// processo sobe. Funciona quando o endereço é fixo. Não funciona com um túnel
// de desenvolvimento, que ganha um nome NOVO a cada vez que sobe: o túnel cai
// às duas da manhã, volta com outro nome, e a ponte continua a vida inteira
// achando que o endereço é o antigo. O webhook da uazapi fica apontado pro
// endereço morto, e o número para de receber sem que nada dê erro.
//
// A saída é o endereço deixar de ser um valor de partida e virar uma PERGUNTA
// que se refaz. O supervisor do túnel (scripts/ponte-publica.mjs) escreve o
// endereço num arquivo toda vez que ele muda; aqui a gente relê esse arquivo, e
// o vigia das sessões reaponta o webhook na rodada seguinte. Ninguém reinicia
// nada, e a janela de silêncio cai de "até alguém perceber" para dois minutos.
//
// O ARQUIVO GANHA DO AMBIENTE quando existe. É deliberado: em produção não há
// arquivo nenhum e o ambiente manda, como sempre; em desenvolvimento o arquivo
// é a única fonte que acompanha a realidade do túnel. Um `.env` que envelhece é
// justamente o problema que este arquivo resolve, então ele não pode ter a
// última palavra.

/**
 * Onde o supervisor do túnel deixa o endereço de agora.
 *
 * Dois lugares porque a ponte roda de dois jeitos: em desenvolvimento o cwd é
 * `whatsapp/`, e em produção pode ser a raiz. Procurar nos dois é mais barato
 * que uma variável de ambiente a mais pra alguém esquecer de definir.
 */
const LUGARES = [
  path.resolve(process.cwd(), '..', '.tunnel', 'endereco.json'),
  path.resolve(process.cwd(), '.tunnel', 'endereco.json'),
]
const ARQUIVO = LUGARES[0]

/**
 * Reler a cada uso seria um `stat` por chamada, e isto é chamado no meio de
 * cada rodada do vigia, uma vez por conexão. Cinco segundos é curto demais pra
 * alguém perceber a diferença e longo o bastante pra não pesar.
 */
const VALIDADE_MS = 5_000

let lembrete: { quando: number; valor: string | null } | null = null

function lerDoArquivo(): string | null {
  for (const lugar of LUGARES) {
    try {
      const cru = fs.readFileSync(lugar, 'utf8')
      const url = (JSON.parse(cru) as { url?: unknown }).url
      if (typeof url !== 'string' || !url.trim()) continue
      // Um endereço inválido no arquivo não pode derrubar a ponte inteira: ele
      // simplesmente não conta, e o ambiente volta a valer.
      new URL(url)
      return url.replace(/\/$/, '')
    } catch {
      // este lugar não serve; tenta o próximo
    }
  }
  return null
}

/**
 * O endereço público de agora, ou `null` se não há nenhum.
 *
 * `null` não é detalhe: é o que faz o pareamento ser RECUSADO em vez de
 * entregar um número que fala e não ouve. Ver `apontarAVolta` no app.
 */
export function enderecoPublicoAtual(doAmbiente: string | undefined): string | null {
  const agora = Date.now()
  if (lembrete && agora - lembrete.quando < VALIDADE_MS) return lembrete.valor
  const valor = lerDoArquivo() ?? (doAmbiente?.trim() ? doAmbiente.replace(/\/$/, '') : null)
  lembrete = { quando: agora, valor }
  return valor
}

/** Só pros testes: esquece o que foi lido, pra não depender do relógio. */
export function esquecerEnderecoPublico(): void {
  lembrete = null
}

/** Onde o supervisor deve escrever. Exportado pra não haver dois caminhos. */
export const ARQUIVO_DO_ENDERECO = ARQUIVO

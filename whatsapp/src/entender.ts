// ENTENDER A RESPOSTA DO CLIENTE NO MENU.
//
// O PROBLEMA. Pela conexão de QR Code, botão não chega e lista trava no
// servidor — está medido. Sobra o menu numerado, e aí a escolha volta como
// TEXTO DIGITADO POR GENTE. Gente escreve "1.", "opção 2", "quero o mensal",
// "1️⃣", "trimestal" com o R trocado de lugar. O casamento antigo era exato:
// qualquer uma dessas respostas caía no "não entendi" e a pessoa via o menu
// de novo, sem entender o que fez de errado. Ela fez tudo certo.
//
// A REGRA QUE MANDA AQUI: na dúvida, NÃO adivinhar. Toda etapa abaixo da
// primeira exige VENCEDOR ÚNICO. Se duas opções empatam, isto devolve `null` e
// o fluxo pergunta de novo — porque errar entre MENSAL e TRIMESTRAL cobra o
// valor errado do cliente, e repetir a pergunta só custa um balão.
//
// A ORDEM IMPORTA. Do mais firme pro mais frouxo, e o número vem antes do
// texto aproximado: "1" tem que ser a primeira opção, nunca a opção cujo
// rótulo por acaso se parece com "1".

/** O bastante pra escolher: o resto do bloco não interessa aqui. */
export interface OpcaoParaCasar {
  id: string
  label: string
}

export interface Casamento {
  /** O id da opção escolhida. */
  id: string
  /** Por qual etapa ela foi reconhecida — vai pro log, ajuda a afinar isto. */
  como: 'id' | 'rotulo' | 'numero' | 'comeco' | 'palavra' | 'parecido'
}

/** Palavras que a pessoa põe em volta da escolha e não escolhem nada. */
const RECHEIO = new Set([
  'quero', 'queria', 'gostaria', 'eu', 'me', 'manda', 'envia', 'seria',
  'opcao', 'opcoes', 'numero', 'item', 'alternativa', 'a', 'o', 'as', 'os',
  'escolho', 'escolhi', 'prefiro', 'vou', 'de', 'da', 'do', 'no', 'na', 'em',
  'por', 'favor', 'pf', 'pfv', 'pfvr', 'obrigado', 'obrigada', 'obg', 'e',
  'sera', 'que', 'pode', 'ser', 'ai', 'entao', 'la', 'um', 'uma',
])

/** Números por extenso e por ordem — "dois" e "segunda" são a mesma escolha. */
const NUMERO_ESCRITO: Record<string, number> = {
  um: 1, uma: 1, primeiro: 1, primeira: 1,
  dois: 2, duas: 2, segundo: 2, segunda: 2,
  tres: 3, terceiro: 3, terceira: 3,
  quatro: 4, quarto: 4, quarta: 4,
  cinco: 5, quinto: 5, quinta: 5,
  seis: 6, sexto: 6, sexta: 6,
  sete: 7, setimo: 7, setima: 7,
  oito: 8, oitavo: 8, oitava: 8,
  nove: 9, nono: 9, nona: 9,
  dez: 10, decimo: 10, decima: 10,
}

/** Palavras curtas demais pra distinguir uma opção da outra. */
const CURTA_DEMAIS = 3

/**
 * Deixa o texto comparável: sem acento, sem caixa, sem os asteriscos do
 * WhatsApp, sem pontuação, com os espaços encolhidos.
 *
 * O emoji de tecla (1️⃣) vira o algarismo: no teclado do celular ele fica ao
 * lado dos outros e a pessoa manda sem perceber que não é um "1" comum.
 */
export function normalizar(texto: string): string {
  return texto
    .replace(/([0-9])️?⃣/g, '$1')
    .replace(/[①-⑨]/g, (c) => String(c.charCodeAt(0) - 0x245f))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[*_~`]/g, '')
    .replace(/[.,;:!?()[\]{}"'/\\<>|@#$%^&+=-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** As palavras que carregam sentido — sem o recheio e sem as curtas demais. */
function palavrasQueContam(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length >= CURTA_DEMAIS && !RECHEIO.has(p))
}

/** Teto de palavras pra tentar achar o rótulo dentro da frase. */
const MAX_PALAVRAS_PRA_GARIMPAR = 8

/**
 * Os pedaços da frase que podem SER o rótulo, do mais longo pro mais curto.
 *
 * Serve pra "quero a opcao a", que é o rótulo "Opcao A" com recheio grudado na
 * frente. Tirar o recheio das pontas de uma vez não resolve: aqui TODAS as
 * palavras são recheio ("quero", "a", "opcao", "a") e não sobraria nada. Então
 * o corte é tentado em cada ponto possível, e quem responde é a comparação
 * exata contra os rótulos — nunca a aproximada. Encurtar a frase só pode servir
 * pra ACHAR um rótulo inteiro, jamais pra chutar um parecido.
 *
 * Do mais longo pro mais curto porque o pedaço maior é o mais específico:
 * entre "opcao a" e "a", o primeiro diz mais sobre o que a pessoa quis.
 */
function pedacosPossiveis(texto: string): string[] {
  const p = normalizar(texto).split(' ').filter(Boolean)
  if (p.length < 2 || p.length > MAX_PALAVRAS_PRA_GARIMPAR) return []

  let ateOndeCortaNaFrente = 0
  while (ateOndeCortaNaFrente < p.length && RECHEIO.has(p[ateOndeCortaNaFrente]!)) ateOndeCortaNaFrente++
  let deOndeCortaAtras = p.length
  while (deOndeCortaAtras > 0 && RECHEIO.has(p[deOndeCortaAtras - 1]!)) deOndeCortaAtras--

  const pedacos: string[] = []
  for (let i = 0; i <= ateOndeCortaNaFrente && i < p.length; i++) {
    for (let j = p.length; j > Math.max(deOndeCortaAtras - 1, i); j--) {
      if (i === 0 && j === p.length) continue // a frase inteira já foi tentada
      pedacos.push(p.slice(i, j).join(' '))
    }
  }
  return pedacos.sort((a, b) => b.length - a.length)
}

/**
 * O número que a pessoa quis dizer, ou null.
 *
 * Só vale se a mensagem INTEIRA, tirado o recheio, for um número. Varrer o
 * texto atrás de qualquer algarismo acharia o "47" de "R$ 47,90" e mandaria o
 * cliente pra quadragésima sétima opção de um menu de três.
 */
export function numeroPedido(texto: string): number | null {
  const restante = normalizar(texto)
    .split(' ')
    .filter((p) => p && !RECHEIO.has(p))

  if (restante.length !== 1) return null
  const unica = restante[0]!

  // "1", "1o", "2a", "3º" — o sufixo de ordinal já perdeu o símbolo na limpeza.
  const algarismo = /^(\d{1,2})[oa]?$/.exec(unica)
  if (algarismo) return Number.parseInt(algarismo[1]!, 10)

  return NUMERO_ESCRITO[unica] ?? null
}

/**
 * Distância de edição, com desistência barata.
 *
 * `teto` corta a conta assim que a menor diferença possível já passou do que
 * seria aceito — comparar a resposta com dezenas de rótulos inteiros seria
 * trabalho jogado fora na maioria deles.
 */
export function distancia(a: string, b: string, teto: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > teto) return teto + 1

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    let menorDaLinha = i
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      const valor = Math.min(anterior[j]! + 1, atual[j - 1]! + 1, anterior[j - 1]! + custo)
      atual.push(valor)
      if (valor < menorDaLinha) menorDaLinha = valor
    }
    if (menorDaLinha > teto) return teto + 1
    anterior = atual
  }
  return anterior[b.length]!
}

/** Quantos erros de digitação uma palavra deste tamanho pode ter. */
function tolerancia(tamanho: number): number {
  if (tamanho <= 4) return 1
  if (tamanho <= 7) return 2
  return 3
}

/** O único índice com a menor pontuação, ou null se houve empate. */
function unicoMenor(pontos: number[], limite: number): number | null {
  let melhor = -1
  let menor = Infinity
  let empate = false
  for (const [i, p] of pontos.entries()) {
    if (p > limite) continue
    if (p < menor) {
      menor = p
      melhor = i
      empate = false
    } else if (p === menor) {
      empate = true
    }
  }
  return empate || melhor < 0 ? null : melhor
}

/**
 * Qual opção a resposta escolheu.
 *
 * `variantes` recebe, por opção, os textos que valem como o rótulo dela — o
 * rótulo inteiro e o rótulo cortado, porque a enquete devolve o texto que
 * coube na tela, não o que estava no desenho.
 */
export function acharOpcao(
  resposta: string,
  opcoes: OpcaoParaCasar[],
  variantes?: (o: OpcaoParaCasar) => string[],
): Casamento | null {
  if (opcoes.length === 0) return null

  const cru = resposta.trim()
  const limpo = normalizar(cru)
  if (!limpo) return null

  // A escolha numa LISTA volta como "título\ndescrição" grudados: a primeira
  // linha é o rótulo.
  const primeira = normalizar(cru.split('\n')[0] ?? '')

  const rotulos = opcoes.map((o) => {
    const textos = variantes ? variantes(o) : [o.label]
    return textos.map(normalizar).filter(Boolean)
  })

  // ── 1. O id que mandamos junto com o botão e voltou no toque ──
  // O casamento mais firme: não depende do rótulo, então dois botões com o
  // mesmo texto ainda se distinguem.
  const porId = opcoes.findIndex((o) => o.id.toLowerCase() === cru.toLowerCase())
  if (porId >= 0) return { id: opcoes[porId]!.id, como: 'id' }

  // ── 2. O rótulo, inteiro e igualzinho ──
  const porRotulo = rotulos.findIndex((rs) => rs.some((r) => r === limpo || r === primeira))
  if (porRotulo >= 0) return { id: opcoes[porRotulo]!.id, como: 'rotulo' }

  // ── 3. O rótulo inteiro, achado dentro da frase ──
  // "quero a opcao a" é o rótulo "Opcao A" com recheio na frente. A comparação
  // continua EXATA: só o que for um rótulo inteiro conta.
  for (const pedaco of pedacosPossiveis(cru)) {
    const achado = rotulos.findIndex((rs) => rs.includes(pedaco))
    if (achado >= 0) return { id: opcoes[achado]!.id, como: 'rotulo' }
  }

  // ── 4. O número ──
  // Antes de qualquer aproximação: "1" é a primeira opção, e não a opção com o
  // rótulo mais parecido com o algarismo.
  const n = numeroPedido(cru)
  if (n !== null && n >= 1 && n <= opcoes.length) {
    return { id: opcoes[n - 1]!.id, como: 'numero' }
  }

  // ── 5. O começo do rótulo ──
  // "mensal" para "MENSAL - R$ 47,90". É como a pessoa responde quando não quer
  // copiar o preço junto.
  if (limpo.length >= CURTA_DEMAIS) {
    const comecam = rotulos
      .map((rs, i) => (rs.some((r) => r.startsWith(limpo) || limpo.startsWith(r)) ? i : -1))
      .filter((i) => i >= 0)
    if (comecam.length === 1) return { id: opcoes[comecam[0]!]!.id, como: 'comeco' }
  }

  // ── 6. Palavra em comum ──
  // "quero o mensal" tem uma palavra do rótulo e nenhuma das outras opções.
  // Quem ganha precisa ganhar SOZINHO: empate aqui é chute.
  const daResposta = new Set(palavrasQueContam(cru))
  if (daResposta.size > 0) {
    const acertos = rotulos.map((rs) => {
      const doRotulo = new Set(rs.flatMap((r) => palavrasQueContam(r)))
      let quantas = 0
      for (const p of daResposta) if (doRotulo.has(p)) quantas++
      return quantas
    })
    // `unicoMenor` sobre o negativo: mais palavras em comum é melhor.
    const vencedor = unicoMenor(acertos.map((a) => -a), -1)
    if (vencedor !== null) return { id: opcoes[vencedor]!.id, como: 'palavra' }
  }

  // ── 7. Erro de digitação ──
  // Por último, e só com vencedor único: "trimestal" acha "trimestral", mas
  // uma resposta que fica no meio de duas opções não escolhe nenhuma.
  const distancias = rotulos.map((rs) => {
    let menor = Infinity
    for (const r of rs) {
      // Contra o rótulo inteiro, quando a pessoa tentou copiá-lo.
      const tetoInteiro = tolerancia(Math.max(limpo.length, r.length))
      menor = Math.min(menor, distancia(limpo, r, tetoInteiro))
      // E contra cada palavra dele, quando ela escreveu só o nome do plano.
      for (const palavra of palavrasQueContam(r)) {
        for (const dita of daResposta) {
          const teto = tolerancia(Math.max(palavra.length, dita.length))
          const d = distancia(dita, palavra, teto)
          if (d <= teto) menor = Math.min(menor, d)
        }
      }
    }
    return menor
  })
  const parecido = unicoMenor(distancias, tolerancia(limpo.length))
  if (parecido !== null) return { id: opcoes[parecido]!.id, como: 'parecido' }

  return null
}

// Texto em cima de uma cor ESCOLHIDA PELO USUÁRIO (a marca do cliente, a cor
// de uma etiqueta, a cor de um bloco de fluxo) não pode usar o token do tema:
// no modo claro `--ink` é quase preto, e preto sobre um roxo escuro não se lê.
//
// Aqui a cor do texto vem da própria cor de fundo — claro sobre fundo escuro,
// escuro sobre fundo claro — usando a luminância relativa da WCAG.

const DARK_INK = '#101014'
const LIGHT_INK = '#ffffff'
/** Luminância relativa de DARK_INK, pra não recalcular a cada chamada. */
const DARK_INK_LUMINANCE = 0.0053

function channel(value: number): number {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Devolve branco ou quase-preto — o que tiver mais contraste sobre `color`. */
export function readableOn(color: string | null | undefined): string {
  if (!color) return LIGHT_INK

  const hex = color.trim().replace('#', '')
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  if (full.length < 6 || /[^0-9a-f]/i.test(full.slice(0, 6))) return LIGHT_INK

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

  // contraste contra o branco vs. contra o quase-preto
  const contraOBranco = 1.05 / (luminance + 0.05)
  const contraOEscuro = (luminance + 0.05) / (DARK_INK_LUMINANCE + 0.05)
  return contraOBranco >= contraOEscuro ? LIGHT_INK : DARK_INK
}

/**
 * Se um fundo é escuro o bastante pra pedir a versão CLARA do que vai em cima.
 *
 * Sai daqui, e não de uma segunda conta de luminância, pra não existirem dois
 * limiares no app: o dia em que um mudasse, a logo e o texto passariam a
 * discordar sobre o mesmo fundo.
 */
export function ehEscura(color: string | null | undefined): boolean {
  return readableOn(color) === LIGHT_INK
}

/**
 * A cor da marca, puxada na direção do branco (ou do preto).
 *
 * Existe por causa de um caso que aparece o tempo todo num produto white
 * label: a marca é um azul-marinho quase preto e o tema do sistema é escuro. Um
 * botão preenchido com a cor crua fica com o mesmo peso do fundo — vira um
 * retângulo escuro sem aresta, que é exatamente o "botão seco" que se vê na
 * tela. Puxar a cor pra faixa visível do tema devolve o relevo sem trocar o
 * matiz: continua sendo o azul da marca, só que um azul que existe ali.
 *
 * `quanto` é o peso da cor de destino, de 0 a 1.
 */
export function puxarPara(color: string | null | undefined, destino: 'claro' | 'escuro', quanto: number): string {
  const hex = String(color ?? '')
    .trim()
    .replace('#', '')
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  if (full.length < 6 || /[^0-9a-f]/i.test(full.slice(0, 6))) return color ?? LIGHT_INK

  const alvo = destino === 'claro' ? 255 : 0
  const canais = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16)
    return Math.round(v + (alvo - v) * quanto)
  })
  return `#${canais.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

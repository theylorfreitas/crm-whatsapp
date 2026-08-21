// A SUA MARCA.
//
// Este arquivo é o primeiro que você vai querer editar. É daqui que sai o nome
// que aparece no topo do CRM, o símbolo e a cor de destaque.
//
// Nada disso está espalhado pelos componentes de propósito: trocar a marca tem
// que ser um arquivo, não uma caçada.

export interface OwnerBrand {
  name: string
  shortName: string
  logoInitials: string
  logoUrl: string | null
  accentColor: string
  version: string
}

/**
 * A cor de destaque.
 *
 * Grafite, e não uma cor forte, porque este é o padrão de fábrica: enquanto
 * você não escolher a sua, o sistema não finge ter uma identidade. Um roxo
 * fixo aqui viraria "a cor do sistema" em toda tela, e brigaria com a marca de
 * quem instalar.
 *
 * Ponha a sua cor aqui. Ela vale para botão principal, foco, seleção e destaque
 * de gráfico. Use o hexadecimal, com o `#`.
 */
export const COR_NEUTRA = '#52525b'

export const ownerBrand: OwnerBrand = {
  /** Aparece no título das telas e nos e-mails de convite. */
  name: 'CRM',
  /** A versão curta, para onde não cabe o nome inteiro. */
  shortName: 'CRM',
  /** Usado quando não há símbolo: duas letras dentro de um quadrado. */
  logoInitials: 'CR',
  /**
   * O símbolo, em `public/marca/`.
   *
   * Deixe em `null` para o CRM desenhar as iniciais acima. Se for pôr a sua
   * imagem, mande ela com uns 256px de lado: ela aparece a 28px, e 256 cobre
   * tela retina com folga. Um arquivo de 2000px aqui é meio megabyte baixado em
   * toda visita para desenhar um quadradinho na barra.
   */
  logoUrl: '/marca/logo-256.png',
  accentColor: COR_NEUTRA,
  version: 'v1.0.0',
}

/**
 * A classe extra do símbolo. Vazia, e isso é uma decisão.
 *
 * Existe em `index.css` uma classe `marca-crm` que inverte a arte no tema claro.
 * Ela serve para símbolo BRANCO E VAZADO, que sumiria num fundo claro: invertido,
 * ele vira preto sem perder a transparência.
 *
 * O símbolo que vem de fábrica tem cor própria, então inverter estragaria ele:
 * o roxo viraria verde. Por isso nenhuma classe é aplicada.
 *
 * Se você trocar por uma arte branca e vazada, ponha `'marca-crm'` de volta aqui.
 */
export const LOGO_CRM = ''

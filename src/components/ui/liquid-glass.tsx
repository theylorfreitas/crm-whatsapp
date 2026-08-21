import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// VIDRO LÍQUIDO.
//
// O app já era de vidro: `bg-surface` desfoca o fundo e ganha um fio de luz na
// borda (ver index.css). O que faltava é o LÍQUIDO — a lente que entorta o que
// está atrás dela, em vez de só embaçar. É o que separa "fosco" de "vidro
// grosso": num vidro de verdade a imagem de trás desloca, e desloca diferente
// em cada ponto da peça.
//
// A distorção sai de um filtro SVG: ruído fractal vira mapa de deslocamento, e
// o mapa empurra cada pixel do fundo pro lado. Não há imagem nenhuma envolvida.
//
// ONDE FUNCIONA. `filter: url(...)` aplicado a um elemento que tem
// `backdrop-filter` é composto pelo Chromium (Chrome, Edge, Brave). Safari e
// Firefox aplicam o desfoque e ignoram a distorção. Por isso as camadas são
// SEPARADAS: uma só desfoca, outra só entorta. Onde a segunda não funciona, o
// que sobra é o vidro fosco que o app já tinha — degrada pra menos, nunca pra
// quebrado.

/** O id do filtro no documento. Público porque o CSS precisa citá-lo. */
export const ID_DO_FILTRO = 'crm-vidro-liquido'

interface VidroLiquidoProps {
  children: ReactNode
  /** Vai no elemento externo, que é quem tem o raio de canto e a sombra. */
  className?: string
  /** Vai na camada de conteúdo, acima do vidro. É onde se põe o flex. */
  classeInterna?: string
  style?: CSSProperties
}

/**
 * Uma peça de vidro líquido.
 *
 * As três camadas decorativas são `<span>` vazios e `aria-hidden`: leitor de
 * tela não tem o que fazer com elas, e como `pointer-events: none` o clique
 * atravessa direto pro conteúdo.
 */
export function VidroLiquido({ children, className, classeInterna, style }: VidroLiquidoProps) {
  return (
    <div className={cn('vidro-liquido', className)} style={style}>
      <span aria-hidden className="vidro-liquido-camada vidro-liquido-fosco" />
      <span aria-hidden className="vidro-liquido-camada vidro-liquido-lente" />
      <span aria-hidden className="vidro-liquido-camada vidro-liquido-tinta" />
      <span aria-hidden className="vidro-liquido-camada vidro-liquido-aresta" />
      <div className={cn('relative z-10', classeInterna)}>{children}</div>
    </div>
  )
}

/**
 * O filtro. Entra UMA vez no documento (main.tsx) e é citado pelo id.
 *
 * Não usa `display: none`: em parte dos navegadores um SVG escondido assim
 * deixa de expor os próprios filtros, e a distorção some sem erro nenhum. O
 * jeito seguro é ocupar zero pixel continuando visível pro motor de render.
 */
export function FiltroDeVidro() {
  return (
    <svg
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
    >
      <filter id={ID_DO_FILTRO} x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
        {/* Frequência baixa e desigual nos dois eixos: dá ondas largas, de
            vidro soprado. Frequência alta daria areia, que lê como ruído de
            imagem quebrada, não como material. */}
        <feTurbulence type="fractalNoise" baseFrequency="0.001 0.005" numOctaves="1" seed="17" result="ruido" />

        {/* A gama no canal vermelho estica o meio da curva: sem ela o ruído é
            simétrico e o deslocamento fica igual pra todo lado, o que devolve
            um borrão em vez de uma lente. Verde e azul zeram porque só R e G
            entram no deslocamento, e G precisa ser mais quieto que R pra onda
            correr na horizontal. */}
        <feComponentTransfer in="ruido" result="curvado">
          <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
          <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
          <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
        </feComponentTransfer>

        <feGaussianBlur in="curvado" stdDeviation="3" result="mapa" />

        {/* `scale` era 200 no material de referência, que é o tamanho de uma
            peça inteira: numa barra de 44px de altura o deslocamento passa das
            bordas e puxa transparência pra dentro, deixando franjas claras no
            contorno. 42 entorta o bastante pra se ver e não sangra. */}
        <feDisplacementMap in="SourceGraphic" in2="mapa" scale="42" xChannelSelector="R" yChannelSelector="G" />

        {/* O material de referência ainda calculava `feSpecularLighting` +
            `feComposite` num resultado chamado `litImage` — e nunca usava:
            a última primitiva é o mapa de deslocamento, e o que ela não
            consome é descartado. Eram duas passagens de GPU por quadro pra
            produzir um pixel que ninguém via. Saíram. */}
      </filter>
    </svg>
  )
}

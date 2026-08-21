import { useEffect, useRef, useState } from 'react'
import {
  Trash2,
  Copy,
  Pencil,
  Link2,
  X,
  Play,
  MessageSquare,
  List,
  GalleryHorizontal,
  FileText,
  Clock,
  GitBranch,
  Share2,
  Tag as TagIcon,
  Shuffle,
  Timer,
  Columns3,
  UserPlus,
  Building2,
  Bell,
  Sparkles,
  Plug,
  Wrench,
  SlidersHorizontal,
  DollarSign,
  CreditCard,
  Square,
  ExternalLink,
  Phone,
  Maximize2,
  type LucideIcon,
} from 'lucide-react'
import type { FlowBlock, FlowEdge, FlowGraph } from '../../../types/crmFlow'
import { blockSpec, blockPorts } from '../../../types/crmFlow'
import { readableOn } from '../../../lib/readableOn'

// Canvas do construtor de fluxos.
//
// Três decisões mandam no desenho daqui:
//
// LIGAR É PUXAR DA BOLINHA ATÉ A CAIXA. A alça é o ponto na borda direita —
// só ele —, e o destino é a CAIXA inteira: soltar no texto, no cabeçalho ou na
// borda dá no mesmo. O desenho da bolinha tem 10px, mas o alvo do ponteiro tem
// 22: uma alça do tamanho do desenho viraria exercício de mira. Um clique seco
// nela também vale, e aí o próximo clique escolhe o destino — as duas maneiras
// convivem porque quem já aprendeu uma não precisa reaprender.
//
// CAIXINHA SÓ ONDE ELA É BOTÃO DE VERDADE. As opções do menu viram botões no
// aparelho do cliente, então aparecem como caixinhas: é o que ele vai ver.
// Fora daí não há caixinha nenhuma — o bloco simples é cabeçalho e texto, e a
// bolinha sai da borda. A caixinha vazia que todo bloco carregava parecia um
// campo por preencher, e disputava com a bolinha o papel de "clique aqui".
//
// APAGAR UMA LIGAÇÃO SÃO DOIS PASSOS. Clicar nela escolhe e mostra a lixeira;
// a lixeira apaga. Antes o primeiro clique já apagava, e roçar na linha
// enquanto se procurava outra coisa desfazia o fluxo sem aviso nenhum.
//
// O BLOCO MOSTRA O QUE VAI SER ENVIADO. Um retângulo com o nome do tipo não
// diz nada num fluxo de quinze blocos; o texto da mensagem e o rótulo de cada
// botão são o que deixa ler o fluxo sem abrir bloco por bloco.

// O ícone de cada tipo. Fica aqui e não em BlockSpec porque é assunto de
// desenho: a cor já identifica o tipo no minimapa e na paleta, e o ícone só
// existe pra reconhecer o bloco de relance dentro do canvas.
const ICONE_DO_TIPO: Partial<Record<FlowBlock['kind'], LucideIcon>> = {
  inicio: Play,
  mensagem: MessageSquare,
  menu: List,
  carrossel: GalleryHorizontal,
  template: FileText,
  aguarda: Clock,
  condicional: GitBranch,
  conexao: Share2,
  etiqueta: TagIcon,
  distribuidor: Shuffle,
  intervalo: Timer,
  kanban: Columns3,
  atribuir: UserPlus,
  departamento: Building2,
  notificacao: Bell,
  ia: Sparkles,
  integracao: Plug,
  manipulador: Wrench,
  controle: SlidersHorizontal,
  venda: DollarSign,
  pagamento: CreditCard,
  pix: DollarSign,
}

/** O ícone do tipo, reaproveitado pela paleta lateral. */
export function IconeDoBloco({ kind, size = 13 }: { kind: FlowBlock['kind']; size?: number }) {
  const Icone = ICONE_DO_TIPO[kind] ?? Square
  return <Icone size={size} />
}

const NODE_WIDTH = 260
// Estas medidas TÊM que bater com o desenho lá embaixo: é por elas que o SVG
// decide onde a linha nasce, e um erro aqui faz a linha sair ao lado da
// bolinha em vez de dela.
//   cabeçalho  py-2 (16) + ícone h-6 (24)
//   opção      py-2 (16) + borda (2) + texto leading-tight (~13) + gap (6)
const HEADER_H = 40
const PREVIEW_LINE_H = 15
const PORT_H = 37
/** Altura da caixinha de uma opção, sem o respiro que a separa da seguinte. */
const OPCAO_H = PORT_H - 6
/** O rótulo "Opções disponíveis", que empurra as saídas do menu pra baixo. */
const ROTULO_H = 24
/** Respiro em volta do corpo — o mesmo do `p-2.5` que o desenho usa. */
const GAP = 10
/** Recheio acima e abaixo do texto da prévia (`py-2`), agora que ele não tem
 *  mais moldura: é texto solto no bloco, como na referência. */
const TEXTO_PAD = 16
/** A borda do bloco. Um pixel — e é ele que desalinhava a linha da bolinha. */
const BORDA = 1

/** Onde o texto passa a ser cortado. Curto aparece inteiro. */
const LIMITE_DE_LINHAS = 8

// ─── Leitura do conteúdo do bloco ───────────────────────────────────────────

/** O texto que o bloco vai mandar, juntando os conteúdos na ordem. */
function textoDoBloco(block: FlowBlock): string {
  const d = block.data
  const doItems = (d.items ?? [])
    .map((i) => (i.kind === 'texto' ? i.text : i.text || rotuloDeConteudo(i.kind)))
    .filter((t): t is string => !!t && t.trim().length > 0)
    .join('\n')
  return (doItems || d.text || '').trim()
}

// Só a palavra: o bloco já mostra o ícone do tipo no cabeçalho, e o emoji
// repetia a mesma informação com um desenho que muda de forma em cada sistema.
function rotuloDeConteudo(kind: string): string {
  const mapa: Record<string, string> = {
    imagem: 'Imagem',
    video: 'Vídeo',
    audio: 'Áudio',
    arquivo: 'Arquivo',
    sticker: 'Figurinha',
    contato: 'Contato',
    intervalo: 'Intervalo',
  }
  return mapa[kind] ?? ''
}

function linhasDoTexto(texto: string): { linhas: string[]; cortado: boolean } {
  if (!texto) return { linhas: [], cortado: false }
  // Quebra por largura aproximada — o bloco tem ~34 caracteres por linha.
  const cruas = texto.split('\n').flatMap((p) => {
    const pedacos: string[] = []
    let atual = ''
    for (const palavra of p.split(' ')) {
      if ((atual + ' ' + palavra).trim().length > 34) {
        if (atual) pedacos.push(atual.trim())
        atual = palavra
      } else {
        atual = `${atual} ${palavra}`
      }
    }
    if (atual.trim()) pedacos.push(atual.trim())
    return pedacos.length ? pedacos : ['']
  })
  return { linhas: cruas.slice(0, LIMITE_DE_LINHAS), cortado: cruas.length > LIMITE_DE_LINHAS }
}

/**
 * A bolinha da saída — e a ALÇA de onde se puxa a ligação.
 *
 * É UMA só, e é sempre esta: a linha desenhada no SVG não põe outra na ponta
 * que sai. Antes eram duas caindo quase no mesmo pixel, e o resultado parecia
 * um ponto sujo ou dois lugares diferentes pra clicar.
 *
 * O desenho tem 10px; o alvo do ponteiro, 22. A folga é invisível de propósito:
 * uma alça do tamanho do ponto exigiria mira, e o ponto grande o bastante pra
 * ser pego confortavelmente seria uma bola no meio do desenho. Ao passar o
 * mouse ele cresce, que é o que anuncia "pega aqui".
 *
 * Fica centrada exatamente sobre a borda do bloco, que é onde o SVG começa a
 * curva. Um pixel de diferença aqui deixa a linha nascendo ao lado do ponto, e
 * não dele. Medir no navegador é o que evita a linha nascer alguns pixels fora.
 *
 * O pai TEM que ser uma faixa da largura toda do bloco: `right` conta a partir
 * do recheio do pai, então uma faixa com `px` empurraria a bolinha pra dentro.
 * É por isso que o recheio lateral vive nas caixinhas, e não na faixa.
 */
function Bolinha({
  ativa,
  aviso,
  titulo,
  onPuxar,
}: {
  ativa: boolean
  aviso?: boolean
  titulo: string
  onPuxar: (e: React.PointerEvent) => void
}) {
  return (
    <button
      type="button"
      data-nao-arrasta
      onPointerDown={onPuxar}
      onClick={(e) => e.stopPropagation()}
      title={titulo}
      aria-label={titulo}
      // -12 põe o centro sobre a BORDA do bloco: o alvo tem 22px de largura e
      // o `right` parte do recheio do pai, 1px dentro da borda. É de lá que o
      // SVG parte.
      style={{ right: -12 }}
      className="group absolute top-1/2 z-10 flex h-[22px] w-[22px] -translate-y-1/2 cursor-crosshair items-center justify-center"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full border-2 bg-surface-solid transition-transform group-hover:scale-150 ${
          ativa
            ? 'scale-150 animate-[pulso-da-saida_1.4s_ease-in-out_infinite] border-[var(--accent)]'
            : aviso
              ? 'border-warn-ink'
              : 'border-line-strong'
        }`}
      />
    </button>
  )
}

/**
 * O bloco tem uma saída só, e ela é o "Segue" genérico?
 *
 * Esses não ganham caixa de saída nenhuma: o corpo já é o alvo do clique e a
 * bolinha na borda marca de onde a linha sai. Uma caixa escrita "Segue" embaixo
 * de todo bloco simples só repetia a seta que já está desenhada ao lado.
 *
 * Menu é o contrário: ali cada saída é uma ESCOLHA do cliente, com nome
 * próprio, e precisa aparecer.
 */
function ehSaidaSimples(block: FlowBlock): boolean {
  const ports = blockPorts(block)
  return ports.length === 1 && ports[0]!.id === 'default'
}

/** Altura do texto da prévia. Zero quando o bloco não tem o que prever — e aí
 *  o bloco é só o cabeçalho, como o Início. */
function alturaDoTexto(block: FlowBlock): number {
  const { linhas } = linhasDoTexto(textoDoBloco(block))
  return linhas.length ? linhas.length * PREVIEW_LINE_H + TEXTO_PAD : 0
}

/** Altura real do bloco — o SVG das ligações precisa saber onde cada saída cai. */
function alturaDoBloco(block: FlowBlock): number {
  const texto = alturaDoTexto(block)
  if (ehSaidaSimples(block)) return 2 * BORDA + HEADER_H + texto

  const ports = blockPorts(block).length
  const acoes = (block.data.options ?? []).filter((o) => o.kind && o.kind !== 'resposta').length
  return (
    2 * BORDA +
    HEADER_H +
    texto +
    GAP +
    rotuloDasOpcoes(block) +
    (Math.max(1, ports) + acoes) * PORT_H +
    GAP
  )
}

/** O menu ganha um rótulo acima das saídas; os outros blocos, não. */
function rotuloDasOpcoes(block: FlowBlock): number {
  const ehMenu = block.kind === 'menu' || block.kind === 'carrossel'
  return ehMenu && blockPorts(block).length > 1 ? ROTULO_H : 0
}

function yDaSaida(block: FlowBlock, index: number): number {
  // Saída simples: a alça é a da CAIXA, centrada nela inteira. É a leitura
  // certa de "ligo o bloco ao próximo" — não uma linha de dentro dele.
  if (ehSaidaSimples(block)) return alturaDoBloco(block) / 2

  return BORDA + HEADER_H + alturaDoTexto(block) + GAP + rotuloDasOpcoes(block) + index * PORT_H + OPCAO_H / 2
}

// ─── Canvas ─────────────────────────────────────────────────────────────────

export function FlowCanvas({
  graph,
  selectedId,
  onSelect,
  onMove,
  onConnect,
  onDeleteNode,
  onDeleteEdge,
  onEdit,
  onDuplicate,
}: {
  graph: FlowGraph
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  onConnect: (from: string, fromPort: string, to: string) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
  onEdit?: (id: string) => void
  onDuplicate?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; moveu: boolean } | null>(null)
  /**
   * Arrastar o QUADRO pelo vazio.
   *
   * Guarda de onde o arrasto começou e onde a rolagem estava naquele momento —
   * e não a posição anterior do cursor. Somando deltas quadro a quadro o erro
   * de arredondamento se acumula e o fundo escorrega devagar em relação ao
   * ponteiro; comparando sempre com a origem, o ponto que você pegou continua
   * exatamente sob o dedo até soltar.
   */
  const panRef = useRef<{ x: number; y: number; origemX: number; origemY: number; moveu: boolean } | null>(null)
  /**
   * O quanto o quadro está deslocado, em pixels de tela.
   *
   * Antes isto era a ROLAGEM do container, e por isso o quadro não saía do
   * lugar: só existe rolagem quando o conteúdo é maior que a área visível, e
   * num fluxo de poucos blocos ele cabe inteiro. Não havia para onde rolar.
   *
   * Deslocamento próprio não depende de sobra nenhuma: o quadro anda para
   * qualquer lado, inclusive para antes do começo, que a rolagem nunca permite
   * (`scrollLeft` não fica negativo).
   */
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastandoQuadro, setArrastandoQuadro] = useState(false)
  /** O último gesto foi arrasto? O clique que vem logo depois se ignora. */
  const arrastouRef = useRef(false)
  /** A ligação escolhida. Selecionar é o que faz aparecer a lixeira dela. */
  const [arestaSelecionada, setArestaSelecionada] = useState<string | null>(null)
  /**
   * De onde o gesto de ligar começou, pra distinguir ESTICAR de CLICAR.
   *
   * Puxar da saída até o destino e soltar já liga. Mas um clique seco na saída
   * também precisa continuar valendo — é como se ligava antes, e quem já
   * aprendeu assim não pode ficar sem. A folga de 4px separa os dois: abaixo
   * dela foi clique, e o modo "escolha o destino" fica armado esperando.
   */
  const esticandoRef = useRef<{ x: number; y: number; esticou: boolean } | null>(null)
  const [ligando, setLigando] = useState<{ nodeId: string; port: string; label: string } | null>(null)
  // Onde o cursor está, em coordenadas do grafo. Só é usado enquanto uma
  // ligação está em curso — é o que dá a linha viva saindo da saída escolhida.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  // Esc cancela a ligação de qualquer lugar — depender do foco do canvas
  // deixava a pessoa presa no modo "escolha o destino".
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setLigando(null)
      setCursor(null)
      setArestaSelecionada(null)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  function pontoNoGrafo(e: React.PointerEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !containerRef.current) return null
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    }
  }

  function aoPressionar(e: React.PointerEvent, block: FlowBlock) {
    if ((e.target as HTMLElement).closest('[data-nao-arrasta]')) return
    const p = pontoNoGrafo(e)
    if (!p) return
    dragRef.current = { id: block.id, offsetX: p.x - block.x, offsetY: p.y - block.y, moveu: false }
    onSelect(block.id)
    setArestaSelecionada(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  /** Começa a arrastar o quadro — só no vazio, e só quando não está ligando. */
  function aoPressionarNoVazio(e: React.PointerEvent) {
    // Ligando, o clique no vazio serve pra cancelar; arrastar atrapalharia.
    if (ligando) return
    const alvo = e.target as HTMLElement
    // O vazio é a grade e também a sobra do container em volta dela.
    if (!alvo.dataset.canvas && alvo !== containerRef.current) return
    const el = containerRef.current
    if (!el) return
    // Sem isto, arrastar por cima da prévia de um bloco seleciona o texto dele
    // e a tela fica com um rastro azul no meio do gesto.
    e.preventDefault()
    panRef.current = { x: e.clientX, y: e.clientY, origemX: pan.x, origemY: pan.y, moveu: false }
    setArrastandoQuadro(true)
    el.setPointerCapture(e.pointerId)
  }

  function aoMover(e: React.PointerEvent) {
    if (ligando) {
      const p = pontoNoGrafo(e)
      if (p) setCursor(p)
      const esticando = esticandoRef.current
      if (esticando && !esticando.esticou) {
        const andou = Math.hypot(e.clientX - esticando.x, e.clientY - esticando.y)
        if (andou >= 4) esticando.esticou = true
      }
    }

    const puxando = panRef.current
    if (puxando) {
      const dx = e.clientX - puxando.x
      const dy = e.clientY - puxando.y
      // Uns poucos pixels ainda são um clique, não um arrasto: sem esta folga,
      // um tremor de mão ao clicar no vazio deixaria de desselecionar.
      if (!puxando.moveu && Math.hypot(dx, dy) < 4) return
      puxando.moveu = true
      // O quadro acompanha o dedo: o ponto que a pessoa pegou continua sob ele.
      setPan({ x: puxando.origemX + dx, y: puxando.origemY + dy })
      return
    }

    const drag = dragRef.current
    if (!drag) return
    const p = pontoNoGrafo(e)
    if (!p) return
    drag.moveu = true
    // SEM PISO EM ZERO.
    //
    // A posição era presa em `Math.max(0, …)`, e o efeito era um canto invisível
    // no alto à esquerda: o bloco subia até certo ponto e simplesmente parava,
    // enquanto o resto do quadro continuava andando. Quem estava arrastando não
    // tinha como saber que o limite existia, porque nada na tela o desenhava.
    //
    // Coordenada negativa não quebra nada aqui — o quadro é deslocado por
    // `transform`, não por rolagem, e transform anda para os dois lados. O que
    // o piso protegia era a rolagem antiga, que já não existe.
    onMove(drag.id, Math.round(p.x - drag.offsetX), Math.round(p.y - drag.offsetY))
  }

  /** Começou a puxar de uma saída. O movimento decide se é esticar ou clique. */
  function aoPressionarNaSaida(e: React.PointerEvent, nodeId: string, port: string, label: string) {
    // Já ligando e este é OUTRO bloco: aqui a pessoa está escolhendo o destino,
    // não começando de novo. Deixa o clique subir pro bloco, que fecha a
    // ligação — senão clicar no corpo do destino recomeçaria tudo dele.
    if (ligando && ligando.nodeId !== nodeId) return
    e.stopPropagation()
    esticandoRef.current = { x: e.clientX, y: e.clientY, esticou: false }
    setLigando({ nodeId, port, label })
    const p = pontoNoGrafo(e)
    if (p) setCursor(p)
  }

  /**
   * Soltou o esticão. Se caiu sobre um bloco, liga.
   *
   * O bloco de baixo é achado pelo ponto na tela, e não pelo alvo do evento:
   * durante o arrasto o ponteiro passa por cima do SVG e dos filhos do bloco,
   * e cada um deles se anunciaria como alvo. `data-bloco` no bloco inteiro faz
   * a caixa toda valer — soltar no texto, no cabeçalho ou na borda é a mesma
   * coisa pra quem está ligando.
   */
  function aoSoltarLigacao(e: React.PointerEvent): boolean {
    const esticando = esticandoRef.current
    if (!esticando || !ligando) return false
    esticandoRef.current = null

    // Mal saiu do lugar: foi clique. Segue armado esperando o clique no destino.
    if (!esticando.esticou) return false

    const sob = document.elementFromPoint(e.clientX, e.clientY)
    const alvo = sob?.closest('[data-bloco]')?.getAttribute('data-bloco')

    if (alvo && alvo !== ligando.nodeId) onConnect(ligando.nodeId, ligando.port, alvo)
    // Soltar no vazio desiste: esticar até o nada e ficar preso no modo ligar
    // seria pior do que simplesmente não ter ligado.
    setLigando(null)
    setCursor(null)
    return true
  }

  function aoSoltar(e: React.PointerEvent) {
    dragRef.current = null
    if (aoSoltarLigacao(e)) return
    if (panRef.current) {
      containerRef.current?.releasePointerCapture(e.pointerId)
      // O clique que vem depois de um arrasto não pode desselecionar: quem
      // moveu o quadro não pediu pra perder o bloco que estava aberto.
      const moveu = panRef.current.moveu
      panRef.current = null
      setArrastandoQuadro(false)
      if (moveu) arrastouRef.current = true
    }
  }


  /** Clique no bloco: quando há ligação pendente, ele vira o destino. */
  function aoClicarNoBloco(block: FlowBlock) {
    if (!ligando) return
    // Ligar um bloco nele mesmo faria um laço infinito no motor.
    if (ligando.nodeId === block.id) return
    onConnect(ligando.nodeId, ligando.port, block.id)
    setLigando(null)
    setCursor(null)
  }

  function caminhoDaLigacao(edge: FlowEdge): { d: string; x1: number; y1: number; x2: number; y2: number } | null {
    const de = graph.nodes.find((n) => n.id === edge.from)
    const para = graph.nodes.find((n) => n.id === edge.to)
    if (!de || !para) return null
    const ports = blockPorts(de)
    const i = Math.max(0, ports.findIndex((p) => p.id === edge.fromPort))
    const x1 = de.x + NODE_WIDTH
    const y1 = de.y + yDaSaida(de, i)
    const x2 = para.x
    const y2 = para.y + HEADER_H / 2
    const dx = Math.max(50, Math.abs(x2 - x1) / 2)
    return { d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2 }
  }

  const width = Math.max(1400, ...graph.nodes.map((n) => n.x + NODE_WIDTH + 200))
  const height = Math.max(800, ...graph.nodes.map((n) => n.y + alturaDoBloco(n) + 200))

  /**
   * A caixa que contém todos os blocos, em coordenadas do grafo.
   *
   * Existe desde que arrastar deixou de travar no canto: `width` e `height`
   * medem só o lado positivo, e agora um bloco pode morar antes do zero. Quem
   * precisa da caixa inteira é o enquadramento e o minimapa — os dois erram o
   * alvo se a origem for tratada como o começo de tudo.
   */
  const caixa = (() => {
    if (graph.nodes.length === 0) return { x: 0, y: 0, largura: width, altura: height }
    const x1 = Math.min(...graph.nodes.map((n) => n.x))
    const y1 = Math.min(...graph.nodes.map((n) => n.y))
    const x2 = Math.max(...graph.nodes.map((n) => n.x + NODE_WIDTH))
    const y2 = Math.max(...graph.nodes.map((n) => n.y + alturaDoBloco(n)))
    return { x: x1, y: y1, largura: Math.max(1, x2 - x1), altura: Math.max(1, y2 - y1) }
  })()

  /**
   * Traz tudo para dentro da tela.
   *
   * Um quadro livre precisa de volta: sem isto, arrastar um bloco para longe o
   * deixa fora de alcance e a única saída é puxar o vazio no escuro até topar
   * com ele. Enquadrar é o botão que garante que nada se perde de vez.
   *
   * NÃO APROXIMA ALÉM DE 100%. Um fluxo de dois blocos caberia com folga em
   * 160%, e o quadro daria um salto de escala que ninguém pediu — enquadrar é
   * para achar o que sumiu, não para ampliar o que já estava à vista.
   */
  function enquadrar() {
    const el = containerRef.current
    if (!el || graph.nodes.length === 0) return
    const r = el.getBoundingClientRect()
    const margem = 48
    const cabe = Math.min((r.width - margem * 2) / caixa.largura, (r.height - margem * 2) / caixa.altura)
    const z = Number(Math.min(1, Math.max(0.4, cabe)).toFixed(2))
    setZoom(z)
    setPan({
      x: r.width / 2 - (caixa.x + caixa.largura / 2) * z,
      y: r.height / 2 - (caixa.y + caixa.altura / 2) * z,
    })
  }

  // O MINIMAPA PASSA A ENXERGAR O LADO NEGATIVO.
  //
  // Ele desenhava cada bloco como uma fração de `width`/`height`, que começam
  // no zero: um bloco em coordenada negativa saía por cima do mapa, ou seja,
  // exatamente o bloco que a pessoa mais precisa achar. A moldura cresce para
  // trás só quando alguém foi para lá; com tudo no positivo, é a mesma de antes.
  const mapaX = Math.min(0, caixa.x)
  const mapaY = Math.min(0, caixa.y)
  const mapaLargura = width - mapaX
  const mapaAltura = height - mapaY

  return (
    // `min-w-0` NÃO É ENFEITE AO LADO DO `min-h-0`.
    //
    // Um item de flex não encolhe abaixo do próprio conteúdo por padrão, e o
    // conteúdo daqui é um retângulo do tamanho do fluxo inteiro. Um fluxo largo
    // esticava este container para 2934px numa tela de 1440: o `overflow-hidden`
    // recortava numa borda que estava fora da tela, e metade do quadro ficava
    // num lugar onde ninguém consegue olhar. Enquadrar centralizava certo, só
    // que dentro dessa largura fantasma.
    <div className="relative h-full min-h-0 min-w-0 flex-1">
      {/* ── Zoom ── */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-surface/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
          aria-label="Aproximar"
          className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
          aria-label="Afastar"
          className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="rounded px-2 py-1 text-xs tabular-nums text-ink-2 hover:bg-surface-2"
        >
          {Math.round(zoom * 100)}%
        </button>
        {/* Separado dos outros por um fio: os três de cima mexem na escala,
            este mexe em onde a tela está olhando. */}
        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={enquadrar}
          aria-label="Enquadrar o fluxo"
          title="Enquadrar o fluxo"
          className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* ── Aviso do modo ligar ── */}
      {ligando && (
        <div
          className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs text-white shadow-lg"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Link2 size={13} />
          <span>
            Ligando <strong className="font-semibold">{ligando.label}</strong>, clique no bloco de destino
          </span>
          <button
            type="button"
            onClick={() => {
              setLigando(null)
              setCursor(null)
            }}
            aria-label="Cancelar ligação"
            className="opacity-80 hover:opacity-100"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        onPointerDown={aoPressionarNoVazio}
        // Sem rolagem, a roda do mouse pararia de fazer efeito. Aqui ela move o
        // quadro — e o gesto de duas direções do trackpad move nos dois eixos.
        onWheel={(e) => setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClick={(e) => {
          if (arrastouRef.current) {
            arrastouRef.current = false
            return
          }
          if ((e.target as HTMLElement).dataset.canvas) {
            onSelect(null)
            setLigando(null)
            setCursor(null)
            setArestaSelecionada(null)
          }
        }}
        // O fundo antigo era um ponto a cada 20px, e a tela inteira virava
        // ruído. Agora é uma grade fina e discreta: dá referência de alinhamento
        // sem competir com os blocos.
        // `overflow-hidden`, não `auto`: quem move o quadro agora é o
        // deslocamento, e barra de rolagem junto daria dois jeitos diferentes
        // de andar pela mesma tela, cada um com um limite próprio.
        className={`h-full w-full overflow-hidden outline-none ${
          ligando ? 'cursor-crosshair' : arrastandoQuadro ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundColor: 'var(--canvas)',
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, var(--line) 55%, transparent) 1px, transparent 1px),' +
            'linear-gradient(to bottom, color-mix(in oklab, var(--line) 55%, transparent) 1px, transparent 1px)',
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          // A grade anda junto. Parada, ela viraria uma régua fixa por trás de
          // um quadro que se move, e o olho perderia a noção de deslocamento.
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* A mãozinha só no VAZIO: é o que anuncia que dá pra puxar o quadro.
            Os blocos ficam por cima com o cursor deles, então o ponteiro muda
            sozinho conforme o que está embaixo — mão aberta pra arrastar a
            tela, mão fechada enquanto arrasta, mira no modo ligar. */}
        <div
          data-canvas="1"
          style={{
            width,
            height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className={`relative ${ligando ? '' : arrastandoQuadro ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          {/* `overflow: visible` porque SVG RECORTA POR PADRÃO, ao contrário de
              uma div. Com os blocos livres para ir antes do zero, uma ligação
              que sobe passa da moldura do SVG e some no meio do caminho: a
              linha existe, o desenho é que era cortado. */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
            style={{ overflow: 'visible' }}
          >
            {/* A linha viva: sai da saída escolhida e segue o cursor até o
                clique no destino. Sem ela, o modo "ligando" era invisível —
                a pessoa clicava numa saída e nada na tela dizia de onde a
                ligação ia partir. O tracejado corre pra deixar claro que é
                provisória, não uma ligação já feita. */}
            {ligando && cursor && (() => {
              const de = graph.nodes.find((n) => n.id === ligando.nodeId)
              if (!de) return null
              const i = Math.max(0, blockPorts(de).findIndex((p) => p.id === ligando.port))
              const x1 = de.x + NODE_WIDTH
              const y1 = de.y + yDaSaida(de, i)
              const dx = Math.max(50, Math.abs(cursor.x - x1) / 2)
              return (
                <g>
                  <path
                    d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${cursor.x - dx} ${cursor.y}, ${cursor.x} ${cursor.y}`}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    strokeDasharray="7 6"
                    strokeLinecap="round"
                    className="animate-[correr-tracejado_.6s_linear_infinite]"
                  />
                  <circle cx={x1} cy={y1} r={5} fill="var(--accent)" />
                  <circle cx={cursor.x} cy={cursor.y} r={5} fill="var(--accent)" opacity={0.85}>
                    <animate attributeName="r" values="4;7;4" dur="1.1s" repeatCount="indefinite" />
                  </circle>
                </g>
              )
            })()}

            {graph.edges.map((edge) => {
              const ligacao = caminhoDaLigacao(edge)
              if (!ligacao) return null
              const escolhida = arestaSelecionada === edge.id
              return (
                <g key={edge.id}>
                  {/* Tracejado, com bolinha na ponta que chega em vez de seta:
                      é o desenho da referência, e a bolinha marca exatamente
                      onde a linha entra, o que a seta sozinha não diz. */}
                  <path
                    d={ligacao.d}
                    fill="none"
                    stroke={escolhida ? 'var(--accent)' : 'var(--line-strong)'}
                    strokeWidth={escolhida ? 3 : 2}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                  />
                  {/* SÓ a ponta que chega. A ponta que sai já tem a bolinha da
                      própria saída, desenhada no bloco — as duas caíam quase no
                      mesmo pixel e pareciam um ponto duplicado e sujo. */}
                  <circle
                    cx={ligacao.x2}
                    cy={ligacao.y2}
                    r={4.5}
                    fill="var(--surface-solid)"
                    stroke={escolhida ? 'var(--accent)' : 'var(--line-strong)'}
                    strokeWidth={2}
                  />
                  {/* Faixa invisível larga: acertar uma curva de 2px era
                      exercício de mira. */}
                  <path
                    d={ligacao.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setArestaSelecionada(edge.id)
                      onSelect(null)
                    }}
                  >
                    <title>Clique para escolher esta ligação</title>
                  </path>
                </g>
              )
            })}
          </svg>

          {graph.nodes.map((block) => (
            <BlocoNoCanvas
              key={block.id}
              block={block}
              selecionado={selectedId === block.id}
              portaLigando={ligando?.nodeId === block.id ? ligando.port : null}
              alvoDeLigacao={!!ligando && ligando.nodeId !== block.id}
              onPressionar={(e) => aoPressionar(e, block)}
              onClicar={() => aoClicarNoBloco(block)}
              onIniciarLigacao={(e, port, label) => aoPressionarNaSaida(e, block.id, port, label)}
              onApagar={() => onDeleteNode(block.id)}
              onEditar={onEdit ? () => onEdit(block.id) : undefined}
              onDuplicar={onDuplicate ? () => onDuplicate(block.id) : undefined}
            />
          ))}

          {/* A lixeira da ligação escolhida.
              Fica FORA do SVG porque é um botão de verdade — foco pelo teclado,
              rótulo lido em voz alta, alvo de 24px. Dentro do SVG teria que ser
              um desenho fingindo de botão.
              Apagar uma ligação passou a exigir dois passos, e é de propósito:
              antes o simples clique na linha já apagava, e roçar nela enquanto
              se procurava outra coisa desfazia o fluxo sem aviso. */}
          {(() => {
            const edge = graph.edges.find((x) => x.id === arestaSelecionada)
            const ligacao = edge ? caminhoDaLigacao(edge) : null
            if (!edge || !ligacao) return null
            // Meio da curva. Com estes pontos de controle a conta fecha na
            // média simples das pontas — o t=0,5 de uma cúbica simétrica.
            const mx = (ligacao.x1 + ligacao.x2) / 2
            const my = (ligacao.y1 + ligacao.y2) / 2
            return (
              <button
                type="button"
                data-nao-arrasta
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteEdge(edge.id)
                  setArestaSelecionada(null)
                }}
                aria-label="Remover esta ligação"
                title="Remover esta ligação"
                className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-110"
                style={{ left: mx, top: my, backgroundColor: 'var(--danger)' }}
              >
                <Trash2 size={13} />
              </button>
            )
          })()}
        </div>
      </div>

      {/* Minimapa: a mesma cena em escala, só pra situar onde estão os blocos */}
      {graph.nodes.length > 1 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-20 hidden h-24 w-40 overflow-hidden rounded-lg border border-line bg-surface/90 lg:block">
          <div className="relative h-full w-full">
            {graph.nodes.map((n) => (
              <div
                key={n.id}
                style={{
                  left: `${((n.x - mapaX) / mapaLargura) * 100}%`,
                  top: `${((n.y - mapaY) / mapaAltura) * 100}%`,
                  width: `${(NODE_WIDTH / mapaLargura) * 100}%`,
                  height: `${(alturaDoBloco(n) / mapaAltura) * 100}%`,
                  backgroundColor: blockSpec(n.kind).color,
                }}
                className="absolute rounded-[2px] opacity-70"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bloco ──────────────────────────────────────────────────────────────────

function BlocoNoCanvas({
  block,
  selecionado,
  portaLigando,
  alvoDeLigacao,
  onPressionar,
  onClicar,
  onIniciarLigacao,
  onApagar,
  onEditar,
  onDuplicar,
}: {
  block: FlowBlock
  selecionado: boolean
  portaLigando: string | null
  alvoDeLigacao: boolean
  onPressionar: (e: React.PointerEvent) => void
  onClicar: () => void
  onIniciarLigacao: (e: React.PointerEvent, port: string, label: string) => void
  onApagar: () => void
  onEditar?: () => void
  onDuplicar?: () => void
}) {
  const spec = blockSpec(block.kind)
  const ports = blockPorts(block)
  // Botões que agem no aparelho do cliente: link, ligação, código copiável.
  // Não têm saída — não devolvem nada ao fluxo —, mas o cliente VÊ os três, e
  // um desenho que os esconde mente sobre o que a mensagem mostra.
  const acoes = (block.data.options ?? []).filter((o) => o.kind && o.kind !== 'resposta')
  const { linhas, cortado } = linhasDoTexto(textoDoBloco(block))
  const Icone = ICONE_DO_TIPO[block.kind] ?? Square
  // "Opções disponíveis" só faz sentido onde a saída é escolha do cliente.
  const temOpcoes = (block.kind === 'menu' || block.kind === 'carrossel') && ports.length > 1
  const simples = ehSaidaSimples(block)
  const saidaUnica = ports[0]
  // O Início e afins não têm o que prever: o bloco é o cabeçalho e mais nada.
  // Aí o cabeçalho precisa arredondar embaixo também, senão sobra um canto
  // quadrado da cor dele encostando na borda redonda do bloco.
  const soCabecalho = simples && linhas.length === 0

  return (
    <div
      data-bloco={block.id}
      onPointerDown={onPressionar}
      onClick={onClicar}
      style={{
        left: block.x,
        top: block.y,
        width: NODE_WIDTH,
        borderColor: selecionado || alvoDeLigacao ? spec.color : undefined,
      }}
      className={`absolute select-none rounded-xl border bg-surface shadow-sm transition-shadow ${
        selecionado ? 'border-2 shadow-lg' : 'border-line'
      } ${alvoDeLigacao ? 'cursor-pointer ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--canvas)]' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {/* Cabeçalho */}
      <div
        className={`flex items-center gap-1.5 rounded-t-[11px] px-2.5 py-2 text-[11.5px] font-semibold ${
          soCabecalho ? 'rounded-b-[11px]' : ''
        }`}
        style={{ backgroundColor: spec.color, color: readableOn(spec.color) }}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/25">
          <Icone size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate">{block.title}</span>
        <span data-nao-arrasta className="flex shrink-0 items-center gap-0.5">
          {onEditar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEditar()
              }}
              aria-label="Editar bloco"
              title="Editar bloco"
              className="rounded p-0.5 hover:bg-black/20"
            >
              <Pencil size={11} />
            </button>
          )}
          {onDuplicar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicar()
              }}
              aria-label="Duplicar bloco"
              title="Duplicar bloco"
              className="rounded p-0.5 hover:bg-black/20"
            >
              <Copy size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onApagar()
            }}
            aria-label="Apagar bloco"
            title="Apagar bloco"
            className="rounded p-0.5 hover:bg-black/20"
          >
            <Trash2 size={11} />
          </button>
        </span>
      </div>

      {/* ── A prévia ──
          Texto solto, sem moldura. A moldura fazia o texto parecer um campo
          preenchível e competia visualmente com as caixinhas das opções, que
          são as únicas coisas aqui que viram botão de verdade no aparelho do
          cliente. Sem ela, a caixinha volta a querer dizer alguma coisa. */}
      {linhas.length > 0 && (
        <div className="px-2.5 py-2">
          <p className="whitespace-pre-wrap break-words text-[10.5px] leading-[15px] text-ink-2">
            {linhas.join('\n')}
            {cortado && <span className="text-ink-4">…</span>}
          </p>
        </div>
      )}

      {/* ── A saída ──
          Bloco simples tem UMA alça, na borda e centrada na caixa inteira: é
          "deste bloco sai uma linha", não "desta linha de dentro dele". Ela é
          filha direta do bloco de propósito — é o que a centra na caixa toda. */}
      {simples
        ? saidaUnica && (
            <Bolinha
              ativa={!!portaLigando}
              titulo="Puxe daqui até o bloco de destino (ou clique aqui e depois nele)"
              onPuxar={(e) => onIniciarLigacao(e, saidaUnica.id, saidaUnica.label)}
            />
          )
        : /* As saídas nomeadas — só onde elas existem. Num bloco simples esta
             seção inteira não é desenhada: escondê-la com CSS deixava bolinhas
             invisíveis no meio do canvas, e o conferidor de alinhamento as
             encontrava empilhadas em (0,0).

             O recheio lateral fica nas CAIXINHAS (`mx-2.5`), não nesta faixa:
             a bolinha se posiciona pela borda do pai, e um `px` aqui a puxaria
             pra dentro do bloco, longe de onde o SVG começa a linha. */
          (
            <div className="space-y-1.5 py-2.5">
              {temOpcoes && <p className="px-2.5 pb-0.5 text-[10px] font-semibold text-ink-3">Opções disponíveis</p>}

              {ports.map((port) => {
                const ehFallback = port.id === 'fallback'
                const ligandoDesta = portaLigando === port.id
                return (
                  <div key={port.id} className="relative">
                    {/* Mostra o botão como o cliente vai vê-lo. Não é o alvo do
                        clique: quem liga é a bolinha, e dois alvos pro mesmo
                        gesto no mesmo lugar era o que confundia. */}
                    <div
                      className={`mx-2.5 flex items-center rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        ligandoDesta
                          ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]'
                          : ehFallback
                            ? 'border-warn bg-warn-bg'
                            : 'border-line bg-canvas'
                      }`}
                    >
                      <span
                        className={`min-w-0 break-words text-[10.5px] leading-tight ${
                          ehFallback ? 'font-semibold text-warn-ink' : 'text-ink-2'
                        }`}
                      >
                        {port.label}
                      </span>
                    </div>
                    <Bolinha
                      ativa={ligandoDesta}
                      aviso={ehFallback}
                      titulo={`Puxe daqui até o bloco de destino. Saída "${port.label}"`}
                      onPuxar={(e) => onIniciarLigacao(e, port.id, port.label)}
                    />
                  </div>
                )
              })}

              {temOpcoes && (
                <p className="px-2.5 pt-0.5 text-[9.5px] leading-tight text-ink-4">
                  Quando o usuário envia texto que não corresponde a nenhuma opção.
                </p>
              )}

              {acoes.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  {acoes.map((o) => (
                    <div
                      key={o.id}
                      title={o.value || undefined}
                      className="mx-2.5 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[10.5px] leading-tight text-ink-3"
                    >
                      {o.kind === 'url' ? (
                        <ExternalLink size={11} className="shrink-0" aria-hidden />
                      ) : o.kind === 'telefone' ? (
                        <Phone size={11} className="shrink-0" aria-hidden />
                      ) : (
                        <Copy size={11} className="shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 break-words">{o.label || 'Botão'}</span>
                    </div>
                  ))}
                </div>
              )}

              {ports.length === 0 && acoes.length === 0 && (
                <p className="mx-2.5 rounded-lg bg-canvas px-2 py-1.5 text-[10px] italic text-ink-4">
                  Bloco final — não sai daqui.
                </p>
              )}
            </div>
          )}
    </div>
  )
}

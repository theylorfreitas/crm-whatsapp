import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Send, TriangleAlert } from 'lucide-react'
import { CrmModal, inputClass, ghostButtonClass } from '../ui/CrmUi'
import type { FlowBlock, FlowGraph } from '../../../types/crmFlow'
import { blockPorts } from '../../../types/crmFlow'

// Percorre o fluxo aqui no navegador, como se fosse o cliente do outro lado.
//
// Não manda nada pelo WhatsApp — e é justamente esse o valor: dá pra descobrir
// que o menu não liga em lugar nenhum, ou que a mensagem ficou com a variável
// errada, ANTES de o fluxo tocar em cliente de verdade.
//
// O que ele mostra é o desenho: os mesmos textos, as mesmas opções e o mesmo
// caminho que o motor vai seguir. Onde o desenho está quebrado, ele para e diz
// onde parou, em vez de fingir que continuou.

type Fala =
  | { id: string; de: 'fluxo'; texto: string; bloco: string }
  | { id: string; de: 'cliente'; texto: string }
  | { id: string; de: 'aviso'; texto: string }

/** Teto de blocos numa rodada. Um ciclo A→B→A trava o navegador sem isto. */
const MAX_PASSOS = 200

export function SimuladorDeFluxo({ graph, onClose }: { graph: FlowGraph; onClose: () => void }) {
  const [falas, setFalas] = useState<Fala[]>([])
  const [esperando, setEsperando] = useState<{ blocoId: string; tipo: 'menu' | 'texto' } | null>(null)
  const [digitado, setDigitado] = useState('')
  const [terminou, setTerminou] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)
  const contador = useRef(0)

  const novoId = () => `f${++contador.current}`

  const inicio = useMemo(() => graph.nodes.find((n) => n.kind === 'inicio'), [graph.nodes])
  const blocoEsperando = esperando ? graph.nodes.find((n) => n.id === esperando.blocoId) : null

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [falas.length, esperando])

  /** O texto que um bloco manda, item por item, na ordem. */
  function falasDoBloco(block: FlowBlock): string[] {
    const d = block.data
    const doItems = (d.items ?? [])
      .map((i) => {
        if (i.kind === 'texto') return i.text?.trim() ?? ''
        const rotulo: Record<string, string> = {
          imagem: '[imagem]',
          video: '[vídeo]',
          audio: '[áudio]',
          arquivo: '[arquivo]',
          sticker: '[figurinha]',
          contato: '[contato]',
          intervalo: '',
        }
        const marca = rotulo[i.kind] ?? ''
        return [marca, i.text?.trim()].filter(Boolean).join(' ')
      })
      .filter((t) => t.length > 0)
    if (doItems.length > 0) return doItems
    return d.text?.trim() ? [d.text.trim()] : []
  }

  function proximo(blocoId: string, portId: string): string | null {
    return graph.edges.find((e) => e.from === blocoId && e.fromPort === portId)?.to ?? null
  }

  /** Anda até precisar do cliente, ou até acabar. */
  function caminhar(deId: string | null, acumulado: Fala[]) {
    let atual = deId
    const saida = [...acumulado]
    let passos = 0

    while (atual) {
      if (++passos > MAX_PASSOS) {
        saida.push({ id: novoId(), de: 'aviso', texto: 'O fluxo entrou em ciclo. Há uma ligação voltando pra trás.' })
        break
      }

      const bloco: FlowBlock | undefined = graph.nodes.find((n) => n.id === atual)
      if (!bloco) break

      for (const t of falasDoBloco(bloco)) saida.push({ id: novoId(), de: 'fluxo', texto: t, bloco: bloco.title })

      const ports = blockPorts(bloco)

      // Menu e carrossel PARAM: quem escolhe é o cliente.
      if (bloco.kind === 'menu' || bloco.kind === 'carrossel') {
        setFalas(saida)
        setEsperando({ blocoId: bloco.id, tipo: 'menu' })
        return
      }
      if (bloco.kind === 'aguarda') {
        setFalas(saida)
        setEsperando({ blocoId: bloco.id, tipo: 'texto' })
        return
      }

      if (bloco.kind === 'conexao') {
        saida.push({
          id: novoId(),
          de: 'aviso',
          texto: bloco.data.targetFlowId
            ? 'Segue para outro fluxo. A simulação para aqui.'
            : 'Conexão de Fluxo sem fluxo de destino escolhido.',
        })
        break
      }

      // Blocos que não falam (etiqueta, kanban, atribuir…) apenas registram o
      // efeito: numa simulação, dizer o que ACONTECERIA vale mais que silêncio.
      if (falasDoBloco(bloco).length === 0 && bloco.kind !== 'inicio') {
        saida.push({ id: novoId(), de: 'aviso', texto: `${bloco.title}: executado.` })
      }

      if (ports.length === 0) break

      const seguinte = proximo(bloco.id, ports[0]!.id)
      if (!seguinte) {
        saida.push({
          id: novoId(),
          de: 'aviso',
          texto: `"${bloco.title}" não está ligado a nada. O fluxo termina aqui sem querer.`,
        })
        break
      }
      atual = seguinte
    }

    setFalas(saida)
    setEsperando(null)
    setTerminou(true)
  }

  function comecar() {
    contador.current = 0
    setTerminou(false)
    setDigitado('')
    if (!inicio) {
      setFalas([{ id: 'sem-inicio', de: 'aviso', texto: 'Este fluxo não tem bloco de Início. Não há por onde começar.' }])
      setEsperando(null)
      setTerminou(true)
      return
    }
    const portas = blockPorts(inicio)
    const primeiro = portas[0] ? proximo(inicio.id, portas[0].id) : null
    if (!primeiro) {
      setFalas([{ id: 'inicio-solto', de: 'aviso', texto: 'O bloco de Início não está ligado a nenhum bloco.' }])
      setEsperando(null)
      setTerminou(true)
      return
    }
    caminhar(primeiro, [])
  }

  // Roda assim que abre: pedir mais um clique pra "começar" não serve a nada.
  useEffect(() => {
    comecar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function escolher(portId: string, rotulo: string) {
    if (!esperando) return
    const comResposta: Fala[] = [...falas, { id: novoId(), de: 'cliente', texto: rotulo }]
    const destino = proximo(esperando.blocoId, portId)
    if (!destino) {
      setFalas([
        ...comResposta,
        { id: novoId(), de: 'aviso', texto: `A saída "${rotulo}" não está ligada a nenhum bloco.` },
      ])
      setEsperando(null)
      setTerminou(true)
      return
    }
    setEsperando(null)
    caminhar(destino, comResposta)
  }

  function responderTexto() {
    const texto = digitado.trim()
    if (!texto || !esperando || !blocoEsperando) return
    setDigitado('')

    if (esperando.tipo === 'texto') {
      escolherPorta(texto, 'default')
      return
    }

    // Num menu, o texto livre vale como escolha quando bate com uma opção —
    // é o que o cliente faz de verdade: digita "1" ou o nome da opção.
    const ports = blockPorts(blocoEsperando)
    const alvo = ports.find(
      (p, i) => p.id !== 'fallback' && (p.label.toLowerCase() === texto.toLowerCase() || texto === String(i + 1)),
    )
    escolherPorta(texto, alvo ? alvo.id : 'fallback')
  }

  function escolherPorta(textoDoCliente: string, portId: string) {
    if (!esperando) return
    const comResposta: Fala[] = [...falas, { id: novoId(), de: 'cliente', texto: textoDoCliente }]
    const destino = proximo(esperando.blocoId, portId)
    if (!destino) {
      const nome = blocoEsperando ? blockPorts(blocoEsperando).find((p) => p.id === portId)?.label : portId
      setFalas([...comResposta, { id: novoId(), de: 'aviso', texto: `A saída "${nome ?? portId}" não leva a lugar nenhum.` }])
      setEsperando(null)
      setTerminou(true)
      return
    }
    setEsperando(null)
    caminhar(destino, comResposta)
  }

  const opcoes = blocoEsperando && esperando?.tipo === 'menu' ? blockPorts(blocoEsperando).filter((p) => p.id !== 'fallback') : []

  return (
    <CrmModal
      open
      title="Simular fluxo"
      description="Percorre o desenho como se você fosse o cliente. Nada é enviado pelo WhatsApp."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={comecar} className={ghostButtonClass}>
            <RotateCcw size={14} /> Recomeçar
          </button>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Fechar
          </button>
        </>
      }
    >
      <div className="flex h-[26rem] flex-col">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-canvas p-3">
          {falas.map((f) =>
            f.de === 'aviso' ? (
              <div
                key={f.id}
                className="mx-auto flex max-w-[92%] items-start gap-2 rounded-lg bg-warn-bg px-2.5 py-1.5 text-[11px] text-warn-ink"
              >
                <TriangleAlert size={12} className="mt-px shrink-0" />
                <span>{f.texto}</span>
              </div>
            ) : (
              <div key={f.id} className={`flex ${f.de === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    f.de === 'cliente' ? 'rounded-br-md text-white' : 'rounded-bl-md border border-line bg-surface text-ink'
                  }`}
                  style={f.de === 'cliente' ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  {f.de === 'fluxo' && <p className="mb-0.5 text-[9.5px] font-semibold uppercase opacity-50">{f.bloco}</p>}
                  <p className="whitespace-pre-wrap break-words">{f.texto}</p>
                </div>
              </div>
            ),
          )}
          <div ref={fimRef} />
        </div>

        {opcoes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {opcoes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p.id, p.label)}
                className="rounded-full border border-line px-3 py-1.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:bg-canvas"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') responderTexto()
            }}
            disabled={!esperando}
            placeholder={
              esperando
                ? esperando.tipo === 'menu'
                  ? 'Ou digite a resposta do cliente...'
                  : 'Digite a resposta do cliente...'
                : terminou
                  ? 'A simulação terminou. Clique em Recomeçar.'
                  : 'Aguarde...'
            }
            className={`${inputClass} flex-1 disabled:opacity-60`}
          />
          <button
            type="button"
            onClick={responderTexto}
            disabled={!esperando || !digitado.trim()}
            aria-label="Responder"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </CrmModal>
  )
}

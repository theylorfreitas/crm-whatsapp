import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// MODO GRAVAÇÃO.
//
// Serve pra gravar demonstração, tirar print pra proposta e compartilhar tela
// numa reunião sem vazar o dado do cliente que estiver aberto na hora: e-mail,
// telefone, chave de API, valor de contrato, nome de quem mandou mensagem.
//
// Duas decisões que importam:
//
// 1. LIGA ANTES DE PINTAR. O estado nasce lido do localStorage, e a classe vai
//    no <html> por um efeito que roda na montagem. Se o modo fosse ligado
//    depois do primeiro quadro, um frame com tudo limpo apareceria na gravação,
//    e um frame é o suficiente: é só pausar o vídeo.
//
// 2. NÃO É CRIPTOGRAFIA. O texto continua no DOM, e quem abrir o inspetor lê.
//    Isto protege contra a CÂMERA, não contra quem está no controle da máquina.
//    Por isso o borrão é forte (o CSS usa 7px): borrão fraco volta a ser legível
//    quando alguém amplia o vídeo.

interface ModoGravacaoValor {
  ligado: boolean
  alternar: () => void
}

const Contexto = createContext<ModoGravacaoValor>({ ligado: false, alternar: () => {} })

const CHAVE = 'crm:modo-gravacao'

export function ModoGravacaoProvider({ children }: { children: ReactNode }) {
  // Lê do storage já no primeiro render: recarregar a página no meio de uma
  // gravação não pode reabrir os dados.
  const [ligado, setLigado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const raiz = document.documentElement
    raiz.classList.toggle('gravando', ligado)
    try {
      if (ligado) localStorage.setItem(CHAVE, '1')
      else localStorage.removeItem(CHAVE)
    } catch {
      // Navegador com storage bloqueado: o modo continua valendo nesta aba.
    }
  }, [ligado])

  const alternar = useCallback(() => setLigado((v) => !v), [])

  // Atalho de teclado: numa demonstração ao vivo, procurar botão com a tela
  // compartilhada já expõe o que se queria esconder.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [alternar])

  return <Contexto.Provider value={{ ligado, alternar }}>{children}</Contexto.Provider>
}

export function useModoGravacao() {
  return useContext(Contexto)
}

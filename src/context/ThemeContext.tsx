import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

/**
 * NÃO EXISTE MAIS ESCOLHA DE TEMA.
 *
 * O painel tinha um alternador claro/escuro na barra de cima, e ele
 * saiu junto com toda a maquinaria que o servia: a preferência gravada, a
 * leitura do `prefers-color-scheme` do sistema e a sugestão de tema tirada do
 * papel de parede.
 *
 * O motivo é que o escuro deixou de ser uma opção e virou o produto. O painel é
 * onyx com vidro, aresta especular e tinta branca, e esse conjunto foi
 * calibrado inteiro contra um fundo escuro: no claro, `--surface` vira 70% de
 * branco, a aresta some, e a tinta branca precisaria virar preta pra se ler.
 * Ou seja, o modo claro não era o mesmo painel com outra cor, era um segundo
 * acabamento — e um acabamento que ninguém olhava mantinha ou consertava.
 *
 * O QUE SOBROU, E POR QUE. `imporTema` continua, porque o sistema do CLIENTE ainda
 * tem tema: lá ele é parte da marca de quem contratou (Sistemas → editar → Tema), e
 * quem comprou um sistema claro não quer que o cliente dele o veja escuro. É o
 * inverso do painel: aqui o tema não é de ninguém, lá ele é de alguém.
 *
 * Passar `null` devolve o escuro da casa, que é o que precisa acontecer quando
 * o dono sai do workspace e volta pro console.
 */
const PADRAO: Theme = 'dark'

interface ThemeState {
  theme: Theme
  /** Impõe um tema enquanto uma tela estiver montada. Só o sistema do cliente usa. */
  imporTema: (theme: Theme | null) => void
}

const ThemeContext = createContext<ThemeState | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [imposto, setImposto] = useState<Theme | null>(null)
  const theme = imposto ?? PADRAO

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const imporTema = useCallback((next: Theme | null) => setImposto(next), [])

  return <ThemeContext.Provider value={{ theme, imporTema }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa ser usado dentro de <ThemeProvider>')
  return ctx
}

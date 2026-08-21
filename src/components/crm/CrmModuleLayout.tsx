import { useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { CrmSidebar } from './CrmSidebar'

interface CrmModuleLayoutProps {
  /** Onde este CRM mora. Ver CrmSidebar. */
  basePath: string
  /**
   * Esta seção termina num CONTROLE colado embaixo?
   *
   * O dock flutua sobre o conteúdo, e na maioria das telas isso é o certo: a
   * página rola, quem quiser ver o que está atrás rola mais um pouco, e o
   * módulo aproveita a altura toda em vez de parar 104px antes do rodapé.
   *
   * A exceção é onde o rodapé da tela É a ferramenta — o campo de mensagem do
   * chat. Ali não há pra onde rolar: o vidro do dock deixa o campo quase
   * legível, que é o pior estado possível, porque ninguém percebe que está
   * escrevendo por baixo de alguma coisa.
   */
  reservaDoDock?: boolean
  activeLabel: string
  children: ReactNode
}

// Casca do CRM: menu lateral próprio dentro do workspace, usando os tokens do
// tema do app (o comentário antigo dizia "tema claro fixo" — deixou de valer
// quando o CRM passou a acompanhar o tema como o resto).
export function CrmModuleLayout({ basePath, activeLabel, reservaDoDock = false, children }: CrmModuleLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu do CRM"
          className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2"
        >
          <Menu size={18} />
        </button>
        <span className="text-sm font-medium text-ink-2">{activeLabel}</span>
      </div>

      {/* O MÓDULO É UMA LAJE DE VIDRO, NÃO UM RETÂNGULO CORTADO.

          Antes isto era um div cru: a coluna encostava na lateral (certo) e o
          conjunto terminava numa reta seca 104px acima do rodapé, que é o
          espaço reservado pro dock. Sem esquina nenhuma, a leitura não era
          "painel que acaba aqui", era "tela cortada no meio".

          Agora a borda LIVRE é arredondada: só a de baixo. Em cima, à esquerda
          e à direita ele encosta na moldura do app, e canto redondo contra uma
          beirada só faz sentido em algo que flutua — desenhar borda ali é
          pintar fora da tela.

          rounded-xl porque o DESIGN.md reserva 12px pra cartão e painel; 2xl
          é raio de bolha de conversa. overflow-hidden é o que faz a coluna e
          a conversa respeitarem a esquina em vez de vazarem por ela. */}
      <div
        className={`flex min-h-0 flex-1 overflow-hidden border-line ${
          reservaDoDock ? 'mb-[104px] rounded-b-xl border-b' : ''
        }`}
      >
        <CrmSidebar basePath={basePath} />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0" onClick={(e) => e.stopPropagation()}>
            <CrmSidebar basePath={basePath} variant="drawer" />
          </div>
        </div>
      )}
    </div>
  )
}

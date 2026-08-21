import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { CRM_MAIN_NAV, CRM_MORE_NAV, CRM_FOOTER_NAV } from '../../data/crmModuleNav'

interface CrmSidebarProps {
  /**
   * Onde este CRM mora. Já foi `workspaceSlug`, com o caminho montado aqui
   * dentro — o que amarrava a coluna a `/workspaces/...` e obrigaria a forkar
   * o módulo inteiro pra ele existir também no painel.
   */
  basePath: string
  // Drawer mobile reaproveita o mesmo menu, só sem o "hidden md:flex" (o
  // overlay que o abre já cuida de mostrar/esconder) e sem recolher.
  variant?: 'desktop' | 'drawer'
}

/**
 * A coluna do CRM.
 *
 * O item ativo é marcado com tinta da marca e uma barrinha na margem, e não
 * com um retângulo cinza cheio. O cinza cheio tem o mesmo peso do fundo dos
 * cartões da tela: o menu competiria com o conteúdo, e o destaque não se leria
 * como destaque, se leria como mais uma caixa.
 *
 * A peça é `.item-da-coluna`, com largura fixa (56px recolhida, 224px aberta) e
 * uma transição só, para qualquer coluna lateral que venha depois usar a mesma.
 *
 * RECOLHIDA ELA MOSTRA OS ÍCONES. Antes o estado recolhido devolvia uma tira
 * de 56px com UM botão dentro e mais nada: os quinze destinos do módulo
 * simplesmente sumiam da tela. Recolher deixava de ser "ganhar largura" e
 * passava a ser "perder a navegação" — e quem recolhia tinha que expandir de
 * novo pra ir a qualquer lugar, o que anula o motivo de recolher.
 *
 * E O PADRÃO É RECOLHIDA: as telas que mais pedem largura
 * são as maiores do módulo (a tabela de leads, o quadro do funil, a conversa
 * do WhatsApp). Quem quiser os nomes abre uma vez, e a escolha fica gravada.
 */
const CHAVE = 'crm:crm-recolhido'

export function CrmSidebar({ basePath, variant = 'desktop' }: CrmSidebarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [recolhido, setRecolhido] = useState(() => {
    if (typeof window === 'undefined') return true
    // Sem nada gravado, recolhida. Só um "0" explícito (a pessoa já abriu
    // alguma vez) mantém a coluna aberta.
    return window.localStorage.getItem(CHAVE) !== '0'
  })
  const isDrawer = variant === 'drawer'
  // No drawer do celular não existe recolher: ele já é o menu inteiro aberto
  // por cima da tela, e recolhido seria uma gaveta de ícones sem motivo.
  const compacto = recolhido && !isDrawer

  useEffect(() => {
    window.localStorage.setItem(CHAVE, recolhido ? '1' : '0')
  }, [recolhido])

  // O rótulo não é REMOVIDO ao recolher, é escondido: tirá-lo do DOM faria a
  // coluna piscar o texto sumindo antes de a largura animar, e a transição
  // viraria um corte.
  const rotuloClass = `truncate transition-opacity duration-200 ${
    compacto ? 'pointer-events-none w-0 opacity-0' : 'opacity-100'
  }`

  // Recolhida, o ícone é a única coisa visível: sem o título nativo o item vira
  // um desenho sem nome pra quem passa o mouse, e sem o aria-label vira "link"
  // sem nome pra quem usa leitor de tela.
  const nomeacao = (label: string) => (compacto ? { title: label, 'aria-label': label } : {})

  const item = (chave: string, para: string, Icone: typeof ChevronDown, label: string, exato = false) => (
    <NavLink key={chave} to={para} end={exato} className="item-da-coluna" {...nomeacao(label)}>
      <Icone size={16} className="shrink-0" />
      <span className={rotuloClass}>{label}</span>
    </NavLink>
  )

  return (
    // Reta de propósito: quem arredonda e recorta é o painel do módulo, uma
    // camada acima. Raio aqui dentro brigaria com o de lá, e o DESIGN.md pede
    // pra não misturar raios dentro do mesmo agrupamento.
    <aside
      className={`${isDrawer ? 'flex' : 'hidden md:flex'} ${
        compacto ? 'w-14' : 'w-56'
      } shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]`}
    >
      {/* Sem cabeçalho de marca aqui: a barra do topo do workspace já mostra a
          logo e o nome da empresa, e repetir logo abaixo dava duas identidades
          na mesma tela. O menu começa direto no Início. */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-3">
        {CRM_MAIN_NAV.map((i) =>
          item(i.key, `${basePath}${i.path ? `/${i.path}` : ''}`, i.icon, i.label, i.path === ''),
        )}

        {/* RECOLHIDA, O GRUPO "VENDAS" NÃO EXISTE COMO GRUPO.
            Um cabeçalho de seção é uma palavra, e palavra é justamente o que
            não cabe aqui. Os itens dele entram direto na fila, separados por um
            fio: escondê-los atrás de um botão sem rótulo deixaria cinco
            destinos inalcançáveis sem expandir a coluna. */}
        {compacto ? (
          <>
            <span aria-hidden className="my-1 block h-px bg-line-soft" />
            {CRM_MORE_NAV.map((i) => item(i.key, `${basePath}/${i.path}`, i.icon, i.label))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold tracking-wide text-ink-4 hover:text-ink-2"
            >
              Vendas
              <ChevronDown size={13} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && CRM_MORE_NAV.map((i) => item(i.key, `${basePath}/${i.path}`, i.icon, i.label))}
          </>
        )}
      </nav>

      <div className="space-y-0.5 border-t border-line-soft p-2">
        {CRM_FOOTER_NAV.map((i) => item(i.key, `${basePath}/${i.path}`, i.icon, i.label))}
        {!isDrawer && (
          <button
            type="button"
            onClick={() => setRecolhido((v) => !v)}
            aria-label={compacto ? 'Expandir menu' : 'Recolher menu'}
            title={compacto ? 'Expandir menu' : 'Recolher menu'}
            className="item-da-coluna w-full"
          >
            {compacto ? (
              <PanelLeftOpen size={16} className="shrink-0" />
            ) : (
              <PanelLeftClose size={16} className="shrink-0" />
            )}
            <span className={rotuloClass}>Recolher</span>
          </button>
        )}
      </div>
    </aside>
  )
}

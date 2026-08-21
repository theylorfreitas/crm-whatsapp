import { useNavigate } from 'react-router-dom'
import {
  Settings,
  Tag,
  Clock,
  Building2,
  Zap,
  FileText,
  Smartphone,
  Braces,
  ListChecks,
  Package,
  Plug,
  Webhook,
  Terminal,
  Workflow,
  Send,
  SlidersHorizontal,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react'
import { TagsPanel, DepartmentsPanel, QuickRepliesPanel, TemplatesPanel } from './settings/AtendimentoPanels'
import { ProductsPanel, CustomFieldsPanel, GlobalVariablesPanel } from './settings/CadastroPanels'
import { McpPanel, GeneralSettingsPanel } from './settings/AcessoPanels'
import { HorariosPanel } from './settings/HorariosPanel'
import { IntegracoesPanel } from './settings/IntegracoesPanel'
import { DisparosPanel } from './settings/DisparosPanel'
import { ghostButtonClass } from './ui/CrmUi'

// Sistema de Configurações: os cartões abrem cada painel. Os que apontam pra uma
// tela que já existe no menu principal (Conexões, Fluxos, Webhooks,
// Cobrança) navegam pra lá em vez de duplicar a tela.

interface SettingsCard {
  key: string
  label: string
  description: string
  icon: LucideIcon
  // rota do menu principal, quando o cartão só leva pra outra tela
  goto?: string
}

export const SETTINGS_CARDS: SettingsCard[] = [
  { key: 'etiquetas', label: 'Etiquetas', description: 'Organize e classifique itens usando etiquetas.', icon: Tag },
  { key: 'horarios', label: 'Horários', description: 'Expediente por conexão e o que fazer fora dele.', icon: Clock },
  { key: 'departamentos', label: 'Departamentos', description: 'Gerencie e organize os departamentos da sua empresa.', icon: Building2 },
  { key: 'respostas', label: 'Respostas Rápidas', description: 'Gerencie e organize as respostas rápidas da sua empresa.', icon: Zap },
  { key: 'templates', label: 'Templates WhatsApp', description: 'Gerencie templates oficiais Meta por WABA.', icon: FileText },
  { key: 'conexoes', label: 'Conexões', description: 'WhatsApp e instâncias. Cada conexão ocupa um slot do plano.', icon: Smartphone, goto: 'conexoes' },
  { key: 'variaveis', label: 'Variáveis Globais', description: 'Variáveis que podem ser usadas em todos os seus fluxos.', icon: Braces },
  { key: 'campos', label: 'Campos', description: 'Campos personalizados disponíveis para seus clientes.', icon: ListChecks },
  { key: 'produtos', label: 'Produtos', description: 'Cadastre produtos com faixa de preço e valor padrão.', icon: Package },
  { key: 'integracoes', label: 'Integrações', description: 'Notas, rastreamento de vendas, gateways de pagamento e IA.', icon: Plug },
  { key: 'webhooks', label: 'Webhooks de entrada', description: 'Receba POST externos e vire lead, contato ou cartão.', icon: Webhook, goto: 'webhooks' },
  { key: 'mcp', label: 'Credenciais MCP', description: 'Conecte Cursor, n8n e outros clientes ao CRM deste workspace.', icon: Terminal },
  { key: 'fluxos', label: 'Fluxos', description: 'Crie e gerencie fluxos de automação para WhatsApp.', icon: Workflow, goto: 'fluxos' },
  { key: 'disparos-config', label: 'Configuração de disparos', description: 'Palavras-chave, fluxos automáticos e ritmo de cada conexão.', icon: Send },
  { key: 'geral', label: 'Configurações gerais', description: 'Mensagens automáticas, atribuição e fuso horário.', icon: SlidersHorizontal },
]

export function SettingsSection({
  clientId,
  tab,
  workspaceSlug,
}: {
  clientId: string
  tab?: string
  workspaceSlug: string
}) {
  const navigate = useNavigate()
  const basePath = `/workspaces/${workspaceSlug}/crm`
  const active = SETTINGS_CARDS.find((c) => c.key === tab && !c.goto)

  if (active) {
    return (
      <div className="p-4 md:p-6">
        <button type="button" onClick={() => navigate(`${basePath}/configuracoes`)} className={`${ghostButtonClass} mb-4`}>
          <ArrowLeft size={14} /> Configurações
        </button>
        <div className="mb-4">
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <active.icon size={17} className="text-ink-4" />
            {active.label}
          </h1>
          <p className="mt-0.5 text-sm text-ink-3">{active.description}</p>
        </div>

        {active.key === 'etiquetas' && <TagsPanel clientId={clientId} />}
        {active.key === 'horarios' && <HorariosPanel clientId={clientId} />}
        {active.key === 'departamentos' && <DepartmentsPanel clientId={clientId} />}
        {active.key === 'respostas' && <QuickRepliesPanel clientId={clientId} />}
        {active.key === 'templates' && <TemplatesPanel clientId={clientId} />}
        {active.key === 'variaveis' && <GlobalVariablesPanel clientId={clientId} />}
        {active.key === 'campos' && <CustomFieldsPanel clientId={clientId} />}
        {active.key === 'produtos' && <ProductsPanel clientId={clientId} />}
        {active.key === 'integracoes' && <IntegracoesPanel clientId={clientId} />}
        {active.key === 'mcp' && <McpPanel clientId={clientId} />}
        {active.key === 'disparos-config' && <DisparosPanel clientId={clientId} />}
        {active.key === 'geral' && <GeneralSettingsPanel clientId={clientId} />}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Settings size={17} className="text-ink-4" />
          Configurações
        </h1>
        <p className="mt-0.5 text-sm text-ink-3">Tudo que define como este CRM se comporta.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => navigate(card.goto ? `${basePath}/${card.goto}` : `${basePath}/configuracoes/${card.key}`)}
            className="rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-canvas"
          >
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
              <card.icon size={15} className="text-ink-2" />
            </span>
            <span className="block text-sm font-semibold text-ink">{card.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{card.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

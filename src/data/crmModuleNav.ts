import {
  LayoutGrid,
  MessagesSquare,
  Columns3,
  Workflow,
  Users,
  Send,
  Webhook,
  Smartphone,
  UsersRound,
  CreditCard,
  Settings,
  Bell,
  Filter,
  Handshake,
  CheckSquare,
  UserPlus,
  StickyNote,
  Phone,
  Bot,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface CrmNavItem {
  key: string
  label: string
  icon: LucideIcon
  path: string
}

// O MENU DO CRM.
//
// Toda entrada daqui precisa ter um `case` correspondente em `pages/CrmPage.tsx`.
// Um item de menu sem seção atrás não dá erro: ele cai no `default` e abre o
// Início, e quem clicou fica achando que o sistema travou. É o tipo de defeito
// que passa em qualquer teste automático e irrita todo dia.

// Menu principal: o dia a dia do atendimento.
export const CRM_MAIN_NAV: CrmNavItem[] = [
  { key: 'inicio', label: 'Início', icon: LayoutGrid, path: '' },
  { key: 'chats', label: 'Chats ao vivo', icon: MessagesSquare, path: 'chats' },
  { key: 'kanban', label: 'Kanban', icon: Columns3, path: 'kanban' },
  { key: 'fluxos', label: 'Fluxos', icon: Workflow, path: 'fluxos' },
  { key: 'contatos', label: 'Contatos', icon: Users, path: 'contatos' },
  { key: 'disparos', label: 'Disparos em massa', icon: Send, path: 'disparos' },
  { key: 'webhooks', label: 'Webhooks de entrada', icon: Webhook, path: 'webhooks' },
  { key: 'conexoes', label: 'Conexões', icon: Smartphone, path: 'conexoes' },
  { key: 'equipe', label: 'Equipe', icon: UsersRound, path: 'equipe' },
  { key: 'configuracoes', label: 'Configurações', icon: Settings, path: 'configuracoes' },
]

// "Mais": a parte comercial do CRM (funil, negócios, leads e afins).
export const CRM_MORE_NAV: CrmNavItem[] = [
  { key: 'funil', label: 'Funil', icon: Filter, path: 'funil' },
  { key: 'negocios', label: 'Negócios', icon: Handshake, path: 'negocios' },
  { key: 'leads', label: 'Leads', icon: UserPlus, path: 'leads' },
  { key: 'vendas', label: 'Vendas', icon: CreditCard, path: 'vendas' },
  { key: 'tarefas', label: 'Tarefas', icon: CheckSquare, path: 'tarefas' },
  { key: 'anotacoes', label: 'Anotações', icon: StickyNote, path: 'anotacoes' },
  { key: 'ligacoes', label: 'Ligações', icon: Phone, path: 'ligacoes' },
  { key: 'notificacoes', label: 'Notificações', icon: Bell, path: 'notificacoes' },
]

export const CRM_FOOTER_NAV: CrmNavItem[] = [{ key: 'agente', label: 'Agente', icon: Bot, path: 'agente' }]

export const ALL_CRM_NAV = [...CRM_MAIN_NAV, ...CRM_MORE_NAV, ...CRM_FOOTER_NAV]

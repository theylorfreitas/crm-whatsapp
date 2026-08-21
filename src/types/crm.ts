export type LeadStatus = 'novo' | 'em_nutricao' | 'nao_qualificado' | 'contatado'

export interface CrmLead {
  id: string
  name: string
  status: LeadStatus
  email: string | null
  phone: string | null
  organization: string | null
  origin: string | null
  assignedTo: string | null
  lastModified: string
}

export type FunnelStageVariant = 'normal' | 'won' | 'lost'

export interface FunnelStage {
  id: string
  name: string
  dealsCount: number
  value: number
  winRatePct: number
  x: number
  y: number
  variant: FunnelStageVariant
}

export interface FunnelConnection {
  fromId: string
  toId: string
}

export interface FunnelSummary {
  openValue: number
  dealsCount: number
  winRatePct: number
}

export interface CrmConversationPreview {
  id: string
  contactName: string
  lastMessage: string
  timestamp: string
  unread: boolean
}

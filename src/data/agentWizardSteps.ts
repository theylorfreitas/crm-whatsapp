export interface AgentField {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'textarea'
}

export interface AgentWizardStep {
  id: number
  label: string
  description: string
  fields: AgentField[]
}

// Os 9 passos do agente: cada um tem campos REAIS, gravados no jsonb
// `config` da tabela crm_agents. Nada aqui é decorativo — o que a pessoa
// escreve vira a configuração que a ponte do cloud vai usar pra conduzir a
// conversa no WhatsApp do cliente.
export const AGENT_WIZARD_STEPS: AgentWizardStep[] = [
  {
    id: 1,
    label: 'Identidade',
    description: 'Nome, tom de voz e apresentação do agente.',
    fields: [
      { key: 'agentName', label: 'Nome do agente', placeholder: 'Ex.: Lia', type: 'text' },
      { key: 'tone', label: 'Tom de voz', placeholder: 'Ex.: acolhedor, direto, informal', type: 'text' },
      { key: 'greeting', label: 'Mensagem de apresentação', placeholder: 'Como ele se apresenta na primeira mensagem…', type: 'textarea' },
    ],
  },
  { id: 2, label: 'Objetivo', description: 'O que este agente deve fazer na conversa.', fields: [] },
  {
    id: 3,
    label: 'O negócio',
    description: 'Dados do negócio que o agente conhece.',
    fields: [
      { key: 'businessDescription', label: 'O que a empresa faz', placeholder: 'Descreva em poucas linhas…', type: 'textarea' },
      { key: 'businessHours', label: 'Horário de atendimento', placeholder: 'Ex.: seg a sex, 9h às 18h', type: 'text' },
      { key: 'businessAddress', label: 'Endereço / unidades', placeholder: 'Onde vocês atendem', type: 'textarea' },
    ],
  },
  {
    id: 4,
    label: 'Serviços',
    description: 'Produtos e serviços que ele pode falar.',
    fields: [
      { key: 'services', label: 'Serviços oferecidos', placeholder: 'Um por linha…', type: 'textarea' },
      { key: 'pricing', label: 'O que falar sobre preço', placeholder: 'Ex.: só faixa de valor, ou nunca falar preço', type: 'textarea' },
    ],
  },
  {
    id: 5,
    label: 'Agendamento',
    description: 'Como ele marca horários disponíveis.',
    fields: [
      { key: 'schedulingRules', label: 'Regras de agendamento', placeholder: 'Ex.: só horários livres na agenda, mínimo 2h de antecedência…', type: 'textarea' },
      { key: 'schedulingLink', label: 'Link de agendamento (se houver)', placeholder: 'https://…', type: 'text' },
    ],
  },
  {
    id: 6,
    label: 'Atendimento',
    description: 'Como ele conduz a conversa.',
    fields: [
      { key: 'conversationFlow', label: 'Como conduzir a conversa', placeholder: 'Perguntas que ele sempre faz, ordem, o que confirmar…', type: 'textarea' },
      { key: 'responseTime', label: 'Tempo de resposta esperado', placeholder: 'Ex.: responder na hora, 24h por dia', type: 'text' },
    ],
  },
  {
    id: 7,
    label: 'Transferência',
    description: 'Quando passa a conversa pra uma pessoa.',
    fields: [
      { key: 'handoffRules', label: 'Quando transferir pra um humano', placeholder: 'Ex.: reclamação, pedido de desconto, urgência…', type: 'textarea' },
      { key: 'handoffContact', label: 'Pra quem transferir', placeholder: 'Nome / número de quem assume', type: 'text' },
    ],
  },
  {
    id: 8,
    label: 'Segurança',
    description: 'O que ele nunca deve fazer ou prometer.',
    fields: [
      { key: 'neverDo', label: 'Nunca fazer / nunca prometer', placeholder: 'Ex.: nunca prometer resultado, nunca dar orientação clínica…', type: 'textarea' },
      { key: 'dataRules', label: 'Dados sensíveis', placeholder: 'O que ele nunca deve pedir ou repetir na conversa', type: 'textarea' },
    ],
  },
  { id: 9, label: 'Revisão', description: 'Confira tudo antes de salvar o agente.', fields: [] },
]

export interface AgentObjectiveOption {
  id: string
  title: string
  description: string
}

export const AGENT_OBJECTIVE_OPTIONS: AgentObjectiveOption[] = [
  { id: 'recepcao', title: 'Recepção inicial', description: 'Recepciona, entende o motivo do contato e informa que a equipe continua o atendimento.' },
  { id: 'qualificacao', title: 'Qualificação', description: 'Identifica o que a pessoa procura, a unidade e o nível de interesse.' },
  { id: 'agendamento', title: 'Agendamento', description: 'Conduz até o agendamento usando só horários disponíveis.' },
  { id: 'recuperacao', title: 'Recuperação de lead', description: 'Retoma contato com quem parou de responder, sem pressionar.' },
  { id: 'confirmacao', title: 'Confirmação', description: 'Confirma compromissos, orienta e trata reagendamentos.' },
  { id: 'atendimento_completo', title: 'Atendimento completo', description: 'Da primeira mensagem até o agendamento ou a transferência pra uma pessoa.' },
  { id: 'personalizado', title: 'Objetivo personalizado', description: 'Você descreve o objetivo do agente.' },
]

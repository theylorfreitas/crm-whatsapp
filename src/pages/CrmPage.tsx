import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchEmpresa } from '../lib/db/empresa'
import { CrmModuleLayout } from '../components/crm/CrmModuleLayout'
import { DashboardSection } from '../components/crm/DashboardSection'
import { ChatsSection } from '../components/crm/ChatsSection'
import { KanbanSection } from '../components/crm/KanbanSection'
import { FlowsSection } from '../components/crm/FlowsSection'
import { FlowEditorSection } from '../components/crm/FlowEditorSection'
import { BroadcastsSection } from '../components/crm/BroadcastsSection'
import { WebhooksSection } from '../components/crm/WebhooksSection'
import { ConnectionsSection } from '../components/crm/ConnectionsSection'
import { TeamSection } from '../components/crm/TeamSection'
import { SettingsSection } from '../components/crm/SettingsSection'
import { SalesSection } from '../components/crm/SalesSection'
import { LeadsSection } from '../components/crm/LeadsSection'
import { FunnelSection } from '../components/crm/FunnelSection'
import { DealsSection } from '../components/crm/DealsSection'
import { ContactsSection } from '../components/crm/ContactsSection'
import { TasksSection } from '../components/crm/TasksSection'
import { NotesSection } from '../components/crm/NotesSection'
import { CallsSection } from '../components/crm/CallsSection'
import { NotificationsSection } from '../components/crm/NotificationsSection'
import { AgentsSection } from '../components/crm/AgentsSection'
import { ALL_CRM_NAV } from '../data/crmModuleNav'

// A TELA ÚNICA DO CRM.
//
// Todas as seções são montadas por aqui, escolhidas pelo pedaço da URL. Uma
// página por seção daria vinte arquivos quase idênticos, e o menu lateral, que é
// o mesmo em todas, teria que ser repetido em cada um.
//
// ── A EMPRESA ──────────────────────────────────────────────────────────────
//
// Toda tabela do CRM carrega `client_id`. Numa instalação como esta há UMA
// empresa, criada pelo instalador, e é o id dela que vai para todas as seções.
//
// O campo continua existindo em vez de ser arrancado, e isso é de propósito: são
// mais de cinquenta tabelas, e tirar uma coluna de todas elas para economizar um
// `where` é muito risco por nenhum ganho. Como bônus, quem um dia quiser atender
// mais de uma empresa no mesmo sistema já tem por onde.
export function CrmPage() {
  const { section, subsection } = useParams<{ section?: string; subsection?: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: empresa, isLoading } = useQuery({ queryKey: ['empresa'], queryFn: fetchEmpresa })

  const basePath = '/crm'
  const activeSection = section ?? ''
  const activeNavItem = ALL_CRM_NAV.find((item) => item.path === activeSection)

  if (isLoading) {
    return <p className="p-6 text-sm text-ink-4">Carregando…</p>
  }

  // Sem empresa não há `client_id`, e sem ele nenhuma seção tem o que ler. Só
  // acontece se a instalação tiver parado no meio.
  if (!empresa) {
    return (
      <div className="m-6 rounded-xl border border-dashed border-line p-6 text-sm text-ink-3">
        <p className="mb-2 font-semibold text-ink">A instalação não terminou.</p>
        <p>
          Nenhuma empresa foi encontrada no banco. Rode <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run instalar</code>{' '}
          de novo, ou veja o manual em <code className="rounded bg-surface-2 px-1.5 py-0.5">curso/01-instalacao.md</code>.
        </p>
      </div>
    )
  }

  // Lidos AQUI FORA, e não dentro do `renderSection`. Lá dentro o TypeScript já
  // perdeu a garantia de que `empresa` não é nula: a função é uma closure, e ele
  // não tem como saber que ela só roda depois da checagem acima.
  const clientId = empresa.id
  const nomeDaEmpresa = empresa.nome
  const slugDaEmpresa = empresa.slug

  function renderSection() {
    switch (activeSection) {
      case 'chats':
        return <ChatsSection clientId={clientId} currentUserName={profile?.fullName ?? 'Equipe'} />
      case 'kanban':
        return (
          <KanbanSection
            clientId={clientId}
            kanbanId={subsection}
            onAbrir={(id) => navigate(`${basePath}/kanban/${id}`)}
            onVoltar={() => navigate(`${basePath}/kanban`)}
          />
        )
      case 'fluxos':
        return subsection ? (
          <FlowEditorSection clientId={clientId} flowId={subsection} onBack={() => navigate(`${basePath}/fluxos`)} />
        ) : (
          <FlowsSection clientId={clientId} onOpenFlow={(id) => navigate(`${basePath}/fluxos/${id}`)} />
        )
      case 'disparos':
        return <BroadcastsSection clientId={clientId} />
      case 'webhooks':
        return <WebhooksSection clientId={clientId} />
      case 'conexoes':
        return <ConnectionsSection clientId={clientId} />
      case 'equipe':
        return <TeamSection clientId={clientId} />
      case 'configuracoes':
        return <SettingsSection clientId={clientId} tab={subsection} workspaceSlug={slugDaEmpresa} />
      case 'vendas':
        return <SalesSection clientId={clientId} />
      case 'leads':
        return <LeadsSection clientId={clientId} />
      case 'funil':
        return (
          <FunnelSection
            clientId={clientId}
            companyName={nomeDaEmpresa}
            onViewDeals={() => navigate(`${basePath}/negocios`)}
          />
        )
      case 'negocios':
        return <DealsSection clientId={clientId} />
      case 'contatos':
        return <ContactsSection clientId={clientId} />
      case 'tarefas':
        return <TasksSection clientId={clientId} />
      case 'anotacoes':
        return <NotesSection clientId={clientId} />
      case 'ligacoes':
        return <CallsSection clientId={clientId} />
      case 'notificacoes':
        return <NotificationsSection clientId={clientId} />
      case 'agente':
        return <AgentsSection clientId={clientId} companyName={nomeDaEmpresa} />
      default:
        return <DashboardSection clientId={clientId} companyName={nomeDaEmpresa} />
    }
  }

  return (
    <CrmModuleLayout basePath={basePath} activeLabel={activeNavItem?.label ?? 'Início'}>
      {renderSection()}
    </CrmModuleLayout>
  )
}

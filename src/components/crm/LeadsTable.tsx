import { Phone, Trash2 } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { LeadStatusPill } from './LeadStatusPill'
import type { CrmLead, LeadStatus } from '../../types/crm'
import { Selecao } from '../ui/Selecao'

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

interface LeadsTableProps {
  leads: CrmLead[]
  onChangeStatus?: (id: string, status: LeadStatus) => void
  onDelete?: (id: string, name: string) => void
}

export function LeadsTable({ leads, onChangeStatus, onDelete }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface py-16 text-center text-sm text-ink-4">
        Nenhum lead encontrado.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-line-soft text-[11px] font-semibold tracking-wider text-ink-4">
            <th className="w-10 px-4 py-3">
              <input type="checkbox" className="rounded border-line-strong" />
            </th>
            <th className="px-2 py-3 font-semibold whitespace-nowrap">NOME</th>
            <th className="px-2 py-3 font-semibold whitespace-nowrap">STATUS</th>
            <th className="px-2 py-3 font-semibold whitespace-nowrap">E-MAIL</th>
            <th className="px-2 py-3 font-semibold whitespace-nowrap">TELEFONE CELULAR</th>
            <th className="px-2 py-3 font-semibold whitespace-nowrap">ATRIBUÍDO A</th>
            <th className="px-2 py-3 font-semibold whitespace-nowrap">ÚLTIMA MODIFICAÇÃO</th>
            <th className="px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-line-soft last:border-0 hover:bg-canvas cursor-pointer transition-colors">
              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="rounded border-line-strong" />
              </td>
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar initials={initialsFor(lead.name)} size="sm" />
                  <span className="font-medium text-ink">{lead.name}</span>
                </div>
              </td>
              <td className="px-2 py-2.5">
                {onChangeStatus ? (
                  <Selecao
                    value={lead.status}
                    onChange={(e) => onChangeStatus(lead.id, e.target.value as LeadStatus)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-lg border border-line px-2 py-1 text-xs text-ink-2"
                  >
                    <option value="novo">Novo</option>
                    <option value="em_nutricao">Em nutrição</option>
                    <option value="contatado">Contatado</option>
                    <option value="nao_qualificado">Não qualificado</option>
                  </Selecao>
                ) : (
                  <LeadStatusPill status={lead.status} />
                )}
              </td>
              <td className="px-2 py-2.5 text-ink-4">{lead.email ?? '—'}</td>
              <td className="px-2 py-2.5">
                {lead.phone ? (
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <Phone size={12} className="text-ink-4" />
                    {lead.phone}
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </td>
              <td className="px-2 py-2.5">
                {lead.assignedTo ? (
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <Avatar initials={initialsFor(lead.assignedTo)} size="sm" />
                    {lead.assignedTo}
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </td>
              <td className="px-2 py-2.5 text-ink-4">
                {new Date(lead.lastModified).toLocaleString('pt-BR')}
              </td>
              <td className="px-2 py-2.5 text-right">
                {onDelete && (
                  <button
                    type="button"
                    aria-label="Apagar lead"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(lead.id, lead.name)
                    }}
                    className="text-ink-4 hover:text-danger-ink"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

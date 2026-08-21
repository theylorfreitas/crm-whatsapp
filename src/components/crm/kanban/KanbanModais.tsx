import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Columns3, Columns2, Check, Trophy } from 'lucide-react'
import {
  createKanban,
  createColumn,
  createCard,
  updateColumn,
  corAutomatica,
  CORES_DE_COLUNA,
  type KanbanColumn,
} from '../../../lib/db/crmKanban'
import { fetchContacts } from '../../../lib/db/crm'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// Os formulários do Kanban. Ficam juntos porque compartilham a mesma ideia:
// mostrar, enquanto a pessoa digita, a peça que ela está criando. Um quadro e
// uma coluna são objetos VISUAIS — decidir a cor sem ver a cor é decidir no
// escuro, e o preço de errar é abrir o quadro e ter que voltar pra consertar.

/** Moldura do "Visualização". O mesmo desenho nos dois modais. */
function Visualizacao({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
        <Columns2 size={13} className="text-[var(--accent-ink)]" />
        Visualização
      </p>
      {children}
    </div>
  )
}

// ── Novo quadro ─────────────────────────────────────────────────────────────

export function NovoKanbanModal({
  open,
  clientId,
  onClose,
  onCriado,
}: {
  open: boolean
  clientId: string
  onClose: () => void
  onCriado: (id: string) => void
}) {
  const [nome, setNome] = useState('')

  useEffect(() => {
    if (open) setNome('')
  }, [open])

  const mutation = useMutation({
    mutationFn: () => createKanban(clientId, { name: nome.trim() }),
    onSuccess: (id) => {
      onCriado(id)
      onClose()
    },
  })

  const podeCriar = nome.trim().length > 0 && !mutation.isPending

  return (
    <CrmModal
      open={open}
      title="Novo Kanban"
      icon={<Columns3 size={17} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => podeCriar && mutation.mutate()}
            disabled={!podeCriar}
            className={primaryButtonClass}
          >
            Criar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <CrmField label="Nome do Kanban">
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && podeCriar) mutation.mutate()
            }}
            className={inputClass}
            placeholder="Digite o nome do Kanban..."
          />
        </CrmField>

        <Visualizacao>
          <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
            <span className="truncate text-sm font-semibold text-ink">{nome.trim() || 'Nome do Kanban'}</span>
          </div>
        </Visualizacao>

        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

// ── Nova coluna (e edição da coluna) ────────────────────────────────────────

export function ColunaModal({
  clientId,
  kanbanId,
  posicao,
  coluna,
  onClose,
  onSalvo,
}: {
  clientId: string
  kanbanId: string
  /** Posição da coluna nova. É ela que decide a cor do modo Automático. */
  posicao: number
  /** Preenchida quando é edição; ausente quando é criação. */
  coluna?: KanbanColumn
  onClose: () => void
  onSalvo: () => void
}) {
  const editando = !!coluna
  const [nome, setNome] = useState(coluna?.name ?? '')
  // `null` quer dizer Automático: a cor sai da posição e muda se a coluna
  // andar de lugar. Guardar o hex fixaria a cor de uma etapa que ainda não
  // existe, e é justamente isso que o modo Automático evita.
  const [cor, setCor] = useState<string | null>(coluna?.color ?? null)
  const [conversao, setConversao] = useState(coluna?.isConversion ?? false)

  const corEfetiva = cor ?? corAutomatica(posicao)

  const mutation = useMutation({
    mutationFn: () =>
      editando
        ? updateColumn(coluna!.id, { name: nome.trim(), color: corEfetiva, isConversion: conversao })
        : createColumn(clientId, {
            kanbanId,
            name: nome.trim(),
            position: posicao,
            color: corEfetiva,
            isConversion: conversao,
          }),
    onSuccess: () => {
      onSalvo()
      onClose()
    },
  })

  const podeSalvar = nome.trim().length > 0 && !mutation.isPending

  return (
    <CrmModal
      open
      title={editando ? 'Editar coluna' : 'Nova coluna'}
      icon={<Columns2 size={17} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => podeSalvar && mutation.mutate()}
            disabled={!podeSalvar}
            className={primaryButtonClass}
          >
            {editando ? 'Salvar' : 'Criar coluna'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <CrmField label="Nome da coluna">
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && podeSalvar) mutation.mutate()
            }}
            className={inputClass}
            placeholder="Ex.: Em negociação"
          />
        </CrmField>

        <div>
          <p className="text-xs font-medium text-ink-2">Cor da coluna</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-4">
            Define a faixa superior e o brilho da coluna no quadro. No automático, cada etapa recebe um tom diferente.
          </p>

          <button
            type="button"
            onClick={() => setCor(null)}
            className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              cor === null
                ? 'border-[var(--accent)] text-[var(--accent-ink)]'
                : 'border-line bg-surface text-ink-3 hover:bg-canvas'
            }`}
          >
            {cor === null && <Check size={12} />}
            Automático
          </button>

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-4">Sugestões</p>
          {/* `flex-wrap` e não uma grade de N colunas: em 375px uma grade fixa
              espremeria os círculos até virarem alvos que o dedo não acerta. */}
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CORES_DE_COLUNA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                aria-label={`Usar a cor ${c}`}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                  cor === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface-solid)]' : ''
                }`}
                style={{ backgroundColor: c }}
              >
                {cor === c && <Check size={14} className="text-white drop-shadow" />}
              </button>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2.5 text-xs font-medium text-ink-2">
            Personalizar
            <input
              type="color"
              value={corEfetiva}
              onChange={(e) => setCor(e.target.value)}
              className="h-7 w-12 cursor-pointer rounded border border-line bg-surface p-0.5"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setConversao(!conversao)}
          className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-canvas"
        >
          <span
            className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              conversao ? 'border-transparent bg-[var(--accent)]' : 'border-line-strong'
            }`}
          >
            {conversao && <Check size={11} className="text-white" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-ink-2">Marcar como coluna de conversão</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-4">
              Cartão que chega aqui conta como negócio ganho. É daqui que sai a taxa de conversão do quadro.
            </span>
          </span>
        </button>

        <Visualizacao>
          <div
            className="rounded-lg border p-2.5"
            style={{
              borderColor: `color-mix(in oklab, ${corEfetiva} 45%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${corEfetiva} 8%, transparent)`,
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: corEfetiva }} />
              <span className="truncate text-sm font-semibold text-ink">{nome.trim() || 'Nome da coluna'}</span>
              {conversao && <Trophy size={12} className="shrink-0 text-[var(--accent-ink)]" />}
            </div>
            <div
              className="rounded border border-dashed py-4 text-center text-[11px] text-ink-4"
              style={{ borderColor: `color-mix(in oklab, ${corEfetiva} 40%, transparent)` }}
            >
              Os cartões aparecem aqui
            </div>
          </div>
        </Visualizacao>

        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

// ── Novo cartão ─────────────────────────────────────────────────────────────

export function NovoCartaoModal({
  clientId,
  kanbanId,
  columnId,
  posicao,
  onClose,
  onCriado,
}: {
  clientId: string
  kanbanId: string
  columnId: string
  posicao: number
  onClose: () => void
  onCriado: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [contatoId, setContatoId] = useState('')

  const contatos = useQuery({ queryKey: ['crm-contacts', clientId], queryFn: () => fetchContacts(clientId) })

  const mutation = useMutation({
    mutationFn: () =>
      createCard(clientId, {
        kanbanId,
        columnId,
        title: titulo.trim(),
        description: descricao.trim(),
        value: Number(valor.replace(',', '.')) || 0,
        contactId: contatoId || null,
        position: posicao,
      }),
    onSuccess: () => {
      onCriado()
      onClose()
    },
  })

  const podeCriar = titulo.trim().length > 0 && !mutation.isPending

  return (
    <CrmModal
      open
      title="Novo cartão"
      icon={<Columns2 size={17} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => podeCriar && mutation.mutate()}
            disabled={!podeCriar}
            className={primaryButtonClass}
          >
            Criar cartão
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <CrmField label="Título">
          <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputClass} />
        </CrmField>
        <CrmField label="Descrição">
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className={inputClass} />
        </CrmField>
        <CrmField label="Valor (R$)" hint="Deixe em branco se este cartão não tem valor.">
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={inputClass}
            placeholder="0,00"
          />
        </CrmField>
        <CrmField label="Contato">
          <Selecao value={contatoId} onChange={(e) => setContatoId(e.target.value)} className={inputClass}>
            <option value="">Sem contato</option>
            {(contatos.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
        {mutation.isError && <p className="text-xs text-danger-ink">{(mutation.error as Error).message}</p>}
      </div>
    </CrmModal>
  )
}

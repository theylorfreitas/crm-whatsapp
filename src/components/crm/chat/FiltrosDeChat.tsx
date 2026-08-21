import { useState } from 'react'
import { Filter, RotateCcw, Search } from 'lucide-react'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// O filtro da caixa de entrada. Antes o botão só abria um campo de data; com
// vários chips, departamentos e etiquetas, achar uma conversa dependia de rolar
// a lista inteira.
//
// Tudo aqui é aplicado em memória, sobre as conversas que a tela já carregou —
// nenhum filtro dispara consulta nova. Isso mantém a troca instantânea e evita
// que mexer num checkbox vire uma ida ao banco.

export interface FiltrosDeChat {
  /** Casa com o nome do responsável, por pedaço. */
  responsavel: string
  criadoDe: string
  criadoAte: string
  kanbanId: string
  etiquetas: string[]
  conexoes: string[]
  departamentos: string[]
}

export const FILTROS_VAZIOS: FiltrosDeChat = {
  responsavel: '',
  criadoDe: '',
  criadoAte: '',
  kanbanId: '',
  etiquetas: [],
  conexoes: [],
  departamentos: [],
}

/** Quantos critérios estão valendo — vira o número no botão de filtro. */
export function contarFiltros(f: FiltrosDeChat): number {
  return (
    (f.responsavel.trim() ? 1 : 0) +
    // Data conta como UM critério: "de 1 a 5" é um intervalo, não dois filtros.
    (f.criadoDe || f.criadoAte ? 1 : 0) +
    (f.kanbanId ? 1 : 0) +
    (f.etiquetas.length > 0 ? 1 : 0) +
    (f.conexoes.length > 0 ? 1 : 0) +
    (f.departamentos.length > 0 ? 1 : 0)
  )
}

interface Conversa {
  assignedName: string | null
  createdAt: string
  kanbanId: string | null
  tags: string[]
  connectionId: string | null
  departmentId: string | null
}

/** A regra de "esta conversa passa?", num lugar só. */
export function passaNosFiltros(chat: Conversa, f: FiltrosDeChat): boolean {
  const responsavel = f.responsavel.trim().toLowerCase()
  if (responsavel && !(chat.assignedName ?? '').toLowerCase().includes(responsavel)) return false

  if (f.criadoDe && new Date(chat.createdAt).getTime() < new Date(`${f.criadoDe}T00:00:00`).getTime()) return false
  // O fim do dia, não o começo: senão escolher "até hoje" esconderia tudo o
  // que chegou hoje.
  if (f.criadoAte && new Date(chat.createdAt).getTime() > new Date(`${f.criadoAte}T23:59:59`).getTime()) return false

  if (f.kanbanId && chat.kanbanId !== f.kanbanId) return false
  // Basta UMA etiqueta bater: quem marca três quer as conversas de qualquer
  // uma delas, não as que têm as três ao mesmo tempo.
  if (f.etiquetas.length > 0 && !f.etiquetas.some((t) => chat.tags.includes(t))) return false
  if (f.conexoes.length > 0 && !(chat.connectionId && f.conexoes.includes(chat.connectionId))) return false
  if (f.departamentos.length > 0 && !(chat.departmentId && f.departamentos.includes(chat.departmentId))) return false

  return true
}

interface Props {
  atuais: FiltrosDeChat
  conexoes: { id: string; name: string; status: string }[]
  departamentos: { id: string; name: string }[]
  etiquetas: { id: string; name: string }[]
  kanbans: { id: string; name: string }[]
  onAplicar: (f: FiltrosDeChat) => void
  onClose: () => void
}

export function FiltrosDeChatModal({
  atuais,
  conexoes,
  departamentos,
  etiquetas,
  kanbans,
  onAplicar,
  onClose,
}: Props) {
  // Rascunho: mexer nos campos não muda a lista até apertar Aplicar. Filtrar a
  // cada clique faria a conversa aberta sumir no meio do ajuste.
  const [f, setF] = useState<FiltrosDeChat>(atuais)
  const [buscaConexao, setBuscaConexao] = useState('')

  const alternar = (campo: 'etiquetas' | 'conexoes' | 'departamentos', valor: string) =>
    setF((atual) => ({
      ...atual,
      [campo]: atual[campo].includes(valor)
        ? atual[campo].filter((x) => x !== valor)
        : [...atual[campo], valor],
    }))

  const conexoesVisiveis = conexoes.filter((c) =>
    `${c.name} ${c.status}`.toLowerCase().includes(buscaConexao.trim().toLowerCase()),
  )

  return (
    <CrmModal
      open
      title="Filtros de chat"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => setF(FILTROS_VAZIOS)} className={ghostButtonClass}>
            <RotateCcw size={14} /> Limpar
          </button>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => onAplicar(f)} className={primaryButtonClass}>
            <Filter size={14} /> Aplicar
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Coluna 1 ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <CrmField label="Responsável">
            <input
              value={f.responsavel}
              onChange={(e) => setF({ ...f, responsavel: e.target.value })}
              className={inputClass}
              placeholder="Nome do responsável"
            />
          </CrmField>

          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Data de criação do chat</span>
            <p className="mb-1.5 text-[11px] text-ink-4">Deixe um dos campos vazio para não limitar aquele lado.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-ink-4">De</span>
                <input
                  type="date"
                  value={f.criadoDe}
                  onChange={(e) => setF({ ...f, criadoDe: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-ink-4">Até</span>
                <input
                  type="date"
                  value={f.criadoAte}
                  onChange={(e) => setF({ ...f, criadoAte: e.target.value })}
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          <CrmField label="CRM">
            <Selecao
              value={f.kanbanId}
              onChange={(e) => setF({ ...f, kanbanId: e.target.value })}
              className={inputClass}
            >
              <option value="">Todos os CRMs</option>
              {kanbans.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Selecao>
          </CrmField>

          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Etiquetas</span>
            {etiquetas.length === 0 ? (
              <p className="text-[11px] italic text-ink-4">Nenhuma etiqueta disponível.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((t) => {
                  const marcada = f.etiquetas.includes(t.name)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => alternar('etiquetas', t.name)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        marcada ? 'text-white' : 'border border-line text-ink-3 hover:text-ink'
                      }`}
                      style={marcada ? { backgroundColor: 'var(--accent)' } : undefined}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna 2 ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Conexões</span>
            <p className="mb-1.5 text-[11px] text-ink-4">Selecione os números para filtrar.</p>
            {conexoes.length === 0 ? (
              <p className="text-[11px] italic text-ink-4">Nenhuma conexão criada.</p>
            ) : (
              <>
                {/* A busca só aparece quando há chips o bastante pra procurar
                    valer mais que olhar a lista. */}
                {conexoes.length > 5 && (
                  <div className="relative mb-1.5">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
                    <input
                      value={buscaConexao}
                      onChange={(e) => setBuscaConexao(e.target.value)}
                      className={`${inputClass} pl-8`}
                      placeholder="Buscar conexão..."
                    />
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto rounded-lg border border-line">
                  {conexoesVisiveis.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-line-soft px-2.5 py-2 last:border-b-0 hover:bg-canvas"
                    >
                      <input
                        type="checkbox"
                        checked={f.conexoes.includes(c.id)}
                        onChange={() => alternar('conexoes', c.id)}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{c.name}</span>
                      <span
                        className={`flex shrink-0 items-center gap-1 text-[10px] ${
                          c.status === 'conectada' ? 'text-ok-ink' : 'text-danger-ink'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${c.status === 'conectada' ? 'bg-ok' : 'bg-danger'}`}
                        />
                        {c.status}
                      </span>
                    </label>
                  ))}
                  {conexoesVisiveis.length === 0 && (
                    <p className="px-2.5 py-2 text-[11px] text-ink-4">Nenhuma conexão com esse nome.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-ink-2">Departamentos</span>
            {departamentos.length === 0 ? (
              <p className="text-[11px] italic text-ink-4">Nenhum departamento cadastrado.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-line">
                {departamentos.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-line-soft px-2.5 py-2 last:border-b-0 hover:bg-canvas"
                  >
                    <input
                      type="checkbox"
                      checked={f.departamentos.includes(d.id)}
                      onChange={() => alternar('departamentos', d.id)}
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{d.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </CrmModal>
  )
}

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Search, Bot, Database, Package, AtSign } from 'lucide-react'
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  salvarDescricaoDoCampoDoBot,
  CAMPOS_DO_BOT,
  fetchGlobalVariables,
  createGlobalVariable,
  updateGlobalVariable,
  deleteGlobalVariable,
  comPrefixoGlobal,
  formatarPreco,
  MOEDAS,
  type TipoDeVariavel,
} from '../../../lib/db/crmSettings'
import { CrmLoading } from '../CrmDataStates'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmTable,
  CrmErrorBar,
  CrmConfirmarExclusao,
} from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// Painéis de cadastro: produtos, campos e variáveis globais.
//
// "Contas" saiu daqui. Era cadastro sem consumidor: nenhuma outra parte do CRM
// lia uma conta: nem o chat, nem o Kanban, nem as vendas.

export function ProductsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    description: '',
    currency: 'BRL',
    priceMin: 0,
    priceMax: 0,
    defaultPrice: 0,
    active: true,
  })
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; name: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-products', clientId], queryFn: () => fetchProducts(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-products', clientId] })

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? updateProduct(editingId, form) : createProduct(clientId, form)),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditingId(null)
    },
    onError: (e: Error) => setError(e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteProduct, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const products = query.data ?? []
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? products.filter((p) => p.name.toLowerCase().includes(t)) : products
  }, [products, busca])

  // O valor padrão precisa CABER na faixa. Deixar passar "mínimo 100, máximo
  // 50, padrão 20" grava uma faixa que nunca vai bater com venda nenhuma.
  const faixaInvalida = form.priceMax > 0 && form.priceMin > form.priceMax
  const padraoForaDaFaixa =
    form.defaultPrice > 0 && form.priceMax > 0 && (form.defaultPrice < form.priceMin || form.defaultPrice > form.priceMax)

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditingId(null)
            setForm({ name: '', sku: '', description: '', currency: 'BRL', priceMin: 0, priceMax: 0, defaultPrice: 0, active: true })
            setOpen(true)
          }}
          className={primaryButtonClass}
        >
          <Plus size={14} /> Novo produto
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome..." className={`${inputClass} pl-9`} />
      </div>

      {query.isLoading ? (
        <CrmLoading />
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-12 text-center">
          <Package size={24} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">
            {products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto bate com a busca'}
          </p>
          {products.length === 0 && (
            <p className="mt-1 text-xs text-ink-4">Produtos entram no filtro do painel, nas vendas e no bloco Pagamento.</p>
          )}
        </div>
      ) : (
        <CrmTable head={['Nome', 'Moeda', 'Preço mín.', 'Preço máx.', 'Valor padrão', 'Status', 'Ações']}>
          {filtrados.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ink">{p.name}</p>
                {p.description && <p className="line-clamp-1 max-w-xs text-xs text-ink-4">{p.description}</p>}
              </td>
              <td className="px-4 py-3">
                <CrmPill tone="verde">{p.currency}</CrmPill>
              </td>
              <td className="px-4 py-3 text-xs tabular-nums text-ink-2">{formatarPreco(p.priceMin, p.currency)}</td>
              <td className="px-4 py-3 text-xs tabular-nums text-ink-2">{formatarPreco(p.priceMax, p.currency)}</td>
              <td className="px-4 py-3 text-sm tabular-nums text-ink-2">{formatarPreco(p.defaultPrice, p.currency)}</td>
              <td className="px-4 py-3">
                <CrmPill tone={p.active ? 'verde' : 'cinza'}>{p.active ? 'ativo' : 'inativo'}</CrmPill>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(p.id)
                      setForm({
                        name: p.name,
                        sku: p.sku ?? '',
                        description: p.description ?? '',
                        currency: p.currency,
                        priceMin: p.priceMin,
                        priceMax: p.priceMax,
                        defaultPrice: p.defaultPrice,
                        active: p.active,
                      })
                      setOpen(true)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label={`Editar ${p.name}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAExcluir(p)}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label={`Apagar ${p.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <CrmModal
        open={open}
        icon={<Package size={17} />}
        title={editingId ? 'Editar produto' : 'Novo produto'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || form.defaultPrice <= 0 || faixaInvalida || padraoForaDaFaixa || saveMutation.isPending}
              className={primaryButtonClass}
            >
              {editingId ? 'Salvar' : 'Criar'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <CrmField label="Nome *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="Ex.: Plano Premium"
                autoFocus
              />
            </CrmField>
          </div>

          <div className="col-span-2">
            <CrmField label="Moeda *" hint="Os preços mínimo, máximo e padrão serão interpretados nesta moeda.">
              <Selecao value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
                {MOEDAS.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.rotulo}
                  </option>
                ))}
              </Selecao>
            </CrmField>
          </div>

          <CrmField label="Preço mínimo *">
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.priceMin || ''}
              onChange={(e) => setForm({ ...form, priceMin: Number(e.target.value) })}
              className={inputClass}
              placeholder="0,00"
            />
          </CrmField>
          <CrmField label="Preço máximo *">
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.priceMax || ''}
              onChange={(e) => setForm({ ...form, priceMax: Number(e.target.value) })}
              className={inputClass}
              placeholder="0,00"
            />
          </CrmField>

          <div className="col-span-2">
            <CrmField label="Valor padrão (fallback) *" hint="Usado quando não houver outro valor definido. Deve ser maior que zero.">
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.defaultPrice || ''}
                onChange={(e) => setForm({ ...form, defaultPrice: Number(e.target.value) })}
                className={inputClass}
                placeholder="0,00"
              />
            </CrmField>
          </div>

          {(faixaInvalida || padraoForaDaFaixa) && (
            <div className="col-span-2">
              <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-[11px] text-warn-ink">
                {faixaInvalida
                  ? 'O preço mínimo está acima do máximo: essa faixa não existe.'
                  : 'O valor padrão está fora da faixa de preço.'}
              </p>
            </div>
          )}

          <div className="col-span-2">
            <CrmField label="Descrição">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className={inputClass}
              />
            </CrmField>
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Produto ativo
            </label>
          </div>
        </div>
      </CrmModal>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar produto"
        pergunta={
          <>
            O produto <strong>{aExcluir?.name}</strong> sai do cadastro. As vendas já registradas com ele continuam onde
            estão.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) deleteMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

/**
 * CAMPOS.
 *
 * Duas listas, e a diferença entre elas importa:
 *
 *   Campos do BOT   existem em CÓDIGO. O motor de fluxos sabe preencher cada um
 *                   deles — `{first_name}` sai com o nome, `{hora}` sai com a
 *                   hora no fuso do cliente. Não dá pra criar nem apagar: o que
 *                   se edita aqui é só a descrição, pra quem lê a lista depois.
 *   Personalizados  o que a pessoa inventa. Um bloco de fluxo grava, e daí em
 *                   diante `{cpf}` vale em qualquer mensagem daquela conversa.
 *
 * Até a migração 0045 esta tela mostrava `hora`, `data` e `dia` e o motor NÃO
 * sabia resolvê-los: a mensagem saía com um buraco no lugar, sem erro nenhum.
 */
export function CustomFieldsPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<{ id?: string; key: string; description: string; sistema: boolean } | null>(null)
  const [form, setForm] = useState({ key: '', description: '' })
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; key: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-custom-fields', clientId], queryFn: () => fetchCustomFields(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-custom-fields', clientId] })

  const criar = useMutation({
    mutationFn: () => createCustomField(clientId, form),
    onSuccess: () => {
      invalidate()
      setNovo(false)
      setForm({ key: '', description: '' })
    },
    onError: (e: { code?: string; message: string }) =>
      setError(e.code === '23505' ? 'Já existe um campo com essa chave.' : e.message),
  })

  const salvarEdicao = useMutation({
    mutationFn: () =>
      editando!.sistema
        ? salvarDescricaoDoCampoDoBot(clientId, editando!.key, form.description)
        : updateCustomField(editando!.id!, { key: form.key, description: form.description }),
    onSuccess: () => {
      invalidate()
      setEditando(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const apagar = useMutation({ mutationFn: deleteCustomField, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const gravados = query.data ?? []
  // A descrição do campo do BOT, quando alguém escreveu uma. Senão, a de fábrica.
  const descricaoDoBot = (key: string) =>
    gravados.find((f) => f.sistema && f.key === key)?.description ?? CAMPOS_DO_BOT.find((c) => c.key === key)!.description
  const personalizados = gravados.filter((f) => !f.sistema)

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setForm({ key: '', description: '' })
            setNovo(true)
          }}
          className={primaryButtonClass}
        >
          <Plus size={14} /> Novo Campo
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <section className="mb-4 overflow-hidden rounded-xl border border-line bg-surface">
        <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
          <Bot size={15} className="text-[var(--accent-ink)]" />
          <h3 className="text-sm font-semibold text-ink">Campos do BOT</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left">
                {['Nome', 'Descrição', 'Tipo', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {CAMPOS_DO_BOT.map((c) => (
                <tr key={c.key}>
                  <td className="px-4 py-3">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{c.key}</code>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">{descricaoDoBot(c.key)}</td>
                  <td className="px-4 py-3 text-xs text-ink-3">{c.tipo}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando({ key: c.key, description: descricaoDoBot(c.key), sistema: true })
                        setForm({ key: c.key, description: descricaoDoBot(c.key) })
                      }}
                      className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                      aria-label={`Editar a descrição de ${c.key}`}
                    >
                      <Pencil size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-relaxed text-ink-4">
          Estes o motor preenche sozinho em qualquer mensagem: escreva {'{first_name}'} e sai o nome de quem está do
          outro lado. Não dá pra apagá-los, só descrever o que cada um é.
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
          <Database size={15} className="text-[var(--accent-ink)]" />
          <h3 className="text-sm font-semibold text-ink">Campos Personalizados</h3>
        </header>
        {query.isLoading ? (
          <CrmLoading />
        ) : personalizados.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-4">
            Nenhum campo personalizado. Crie um e o bloco Manipulador de Variáveis passa a poder gravá-lo na conversa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  {['Nome', 'Descrição', 'Tipo', 'Ações'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {personalizados.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{f.key}</code>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-3">{f.description || 'Sem descrição'}</td>
                    <td className="px-4 py-3 text-xs text-ink-3">Texto</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditando({ id: f.id, key: f.key, description: f.description ?? '', sistema: false })
                            setForm({ key: f.key, description: f.description ?? '' })
                          }}
                          className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                          aria-label={`Editar ${f.key}`}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAExcluir(f)}
                          className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                          aria-label={`Apagar ${f.key}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CrmModal
        open={novo}
        title="Novo Campo Customizado"
        onClose={() => setNovo(false)}
        footer={
          <>
            <button type="button" onClick={() => setNovo(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={() => criar.mutate()} disabled={!form.key.trim() || criar.isPending} className={primaryButtonClass}>
              Criar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <CrmField label="Nome *" hint="O nome será convertido para minúsculas automaticamente.">
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })}
              className={inputClass}
              placeholder="Ex: cpf, email_secundario, etc"
              autoFocus
            />
          </CrmField>
          <CrmField label="Descrição">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
              placeholder="Descreva o que este campo representa"
            />
          </CrmField>
        </div>
      </CrmModal>

      <CrmModal
        open={!!editando}
        title={editando?.sistema ? `Descrição de ${editando.key}` : 'Editar campo'}
        onClose={() => setEditando(null)}
        footer={
          <>
            <button type="button" onClick={() => setEditando(null)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={() => salvarEdicao.mutate()} disabled={salvarEdicao.isPending} className={primaryButtonClass}>
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <CrmField
            label="Nome"
            hint={editando?.sistema ? 'Campo do BOT: o nome vem do motor e não pode mudar.' : undefined}
          >
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })}
              className={inputClass}
              disabled={editando?.sistema}
            />
          </CrmField>
          <CrmField label="Descrição">
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </CrmField>
        </div>
      </CrmModal>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar campo"
        pergunta={
          <>
            O campo <strong>{aExcluir?.key}</strong> some da lista. Os fluxos que escrevem {`{${aExcluir?.key}}`} numa
            mensagem passam a sair com um espaço em branco no lugar.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) apagar.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

export function GlobalVariablesPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ key: '', value: '', description: '', tipo: 'texto' as TipoDeVariavel })
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; key: string } | null>(null)

  const query = useQuery({ queryKey: ['crm-global-variables', clientId], queryFn: () => fetchGlobalVariables(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-global-variables', clientId] })

  const saveMutation = useMutation({
    mutationFn: () => {
      const dados = { ...form, key: comPrefixoGlobal(form.key), description: form.description || null }
      return editingId ? updateGlobalVariable(editingId, dados) : createGlobalVariable(clientId, dados)
    },
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditingId(null)
      setForm({ key: '', value: '', description: '', tipo: 'texto' })
    },
    onError: (e: { code?: string; message: string }) =>
      setError(e.code === '23505' ? 'Já existe uma variável com essa chave.' : e.message),
  })
  const deleteMutation = useMutation({ mutationFn: deleteGlobalVariable, onSuccess: invalidate, onError: (e: Error) => setError(e.message) })

  const variables = query.data ?? []
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? variables.filter((v) => v.key.includes(t) || (v.description ?? '').toLowerCase().includes(t)) : variables
  }, [variables, busca])

  const chaveFinal = comPrefixoGlobal(form.key)

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditingId(null)
            setForm({ key: '', value: '', description: '', tipo: 'texto' })
            setOpen(true)
          }}
          className={primaryButtonClass}
        >
          <Plus size={14} /> Nova Variável
        </button>
      </div>

      {error && <CrmErrorBar message={error} onClose={() => setError(null)} />}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou descrição"
          className={`${inputClass} pl-9`}
        />
      </div>

      <p className="mb-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
        Escreva {'{{g_nome_da_empresa}}'} em qualquer mensagem de fluxo e o motor troca pelo valor. O prefixo{' '}
        <code>g_</code> é o que separa a variável do cliente inteiro da que aquele fluxo guardou. Sem ele, criar uma
        global chamada <code>status</code> mudaria em silêncio o que {'{status}'} significa em todos os fluxos.
      </p>

      {query.isLoading ? (
        <CrmLoading />
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-12 text-center">
          <AtSign size={24} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">
            {variables.length === 0 ? 'Nenhuma variável global criada' : 'Nenhuma variável bate com a busca'}
          </p>
        </div>
      ) : (
        <CrmTable head={['Nome', 'Descrição', 'Tipo', 'Valor', 'Ações']}>
          {filtradas.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-3">
                <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{v.key}</code>
              </td>
              <td className="px-4 py-3 text-xs text-ink-3">{v.description || 'Sem descrição'}</td>
              <td className="px-4 py-3 text-xs capitalize text-ink-3">{v.tipo}</td>
              <td className="max-w-xs px-4 py-3">
                <span className="block truncate text-sm text-ink-2">{v.value}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(v.id)
                      setForm({ key: v.key, value: v.value, description: v.description ?? '', tipo: v.tipo })
                      setOpen(true)
                    }}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label={`Editar ${v.key}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAExcluir(v)}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label={`Apagar ${v.key}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </CrmTable>
      )}

      <CrmModal
        open={open}
        title={editingId ? 'Editar variável' : 'Nova Variável Global'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
              Cancelar
            </button>
            <button type="button" onClick={() => saveMutation.mutate()} disabled={!chaveFinal || saveMutation.isPending} className={primaryButtonClass}>
              {editingId ? 'Salvar' : 'Criar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <CrmField label="Nome" hint={chaveFinal ? `Vai virar ${chaveFinal}` : 'O prefixo g_ é adicionado automaticamente.'}>
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              className={inputClass}
              placeholder="Ex: nome_01"
              autoFocus
            />
          </CrmField>
          <CrmField label="Descrição">
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </CrmField>
          <CrmField label="Tipo" hint="Só descreve o valor. Na mensagem, tudo vira texto.">
            <Selecao value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDeVariavel })} className={inputClass}>
              <option value="texto">Texto</option>
              <option value="numero">Número</option>
              <option value="booleano">Sim/Não</option>
            </Selecao>
          </CrmField>
          <CrmField label="Valor inicial (opcional)">
            <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={inputClass} placeholder="0" />
          </CrmField>
        </div>
      </CrmModal>

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Apagar variável global"
        pergunta={
          <>
            Toda mensagem que escreve <code>{`{{${aExcluir?.key}}}`}</code> passa a sair com um espaço em branco no
            lugar. Não dá pra desfazer.
          </>
        }
        onConfirmar={() => {
          if (aExcluir) deleteMutation.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

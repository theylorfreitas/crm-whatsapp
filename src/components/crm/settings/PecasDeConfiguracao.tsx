import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Smartphone } from 'lucide-react'
import { fetchConnections } from '../../../lib/db/crmConnections'
import { CrmLoading } from '../CrmDataStates'
import { inputClass } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// As peças que Configuração de disparos e Horários usam IGUAIS.
//
// As duas telas fazem a mesma pergunta antes de qualquer outra coisa — "de qual
// número estamos falando?" — e o desenho da resposta tem que ser o mesmo nas
// duas. Com o seletor copiado em cada arquivo, um ajuste numa delas deixava a
// outra com outra cara, e quem passa de uma pra outra pensa que mudou de
// sistema.

export function SeletorDeConexao({
  clientId,
  valor,
  onChange,
  titulo,
  detalhe,
}: {
  clientId: string
  valor: string | null
  onChange: (id: string) => void
  titulo: string
  detalhe: string
}) {
  const [busca, setBusca] = useState('')

  const query = useQuery({ queryKey: ['crm-connections', clientId], queryFn: () => fetchConnections(clientId) })
  const conexoes = useMemo(() => query.data ?? [], [query.data])

  // Abre já no primeiro número: com uma conexão só, obrigar um clique antes de
  // qualquer coisa aparecer é pedir trabalho por nada.
  useEffect(() => {
    if (!valor && conexoes.length > 0) onChange(conexoes[0]!.id)
    // `onChange` vem do pai e troca de identidade a cada render; incluí-la aqui
    // faria a seleção voltar pro primeiro número a cada digitada na busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexoes, valor])

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return conexoes
    return conexoes.filter((c) => c.name.toLowerCase().includes(t) || (c.phone ?? '').includes(t))
  }, [conexoes, busca])

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
      <p className="mt-0.5 text-xs text-ink-3">{detalhe}</p>

      {/* A busca só aparece quando há o que buscar. Com dois números, um campo
          de filtro é ruído entre a pergunta e a resposta. */}
      {conexoes.length > 4 && (
        <div className="relative mt-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conexão por nome ou telefone..."
            className={`${inputClass} pl-8`}
          />
        </div>
      )}

      {query.isLoading ? (
        <CrmLoading />
      ) : filtradas.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-xs text-ink-4">
          {conexoes.length === 0
            ? 'Nenhuma conexão de WhatsApp cadastrada. Crie uma em CRM, Conexões.'
            : 'Nenhuma conexão bate com a busca.'}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
          {filtradas.map((c) => {
            const ativa = c.id === valor
            const conectada = c.status === 'conectada'
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.id)}
                aria-pressed={ativa}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  ativa
                    ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]'
                    : 'border-line bg-canvas hover:border-line-strong'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent-ink)]">
                  <Smartphone size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{c.name}</span>
                  <span className="block truncate text-[11px] text-ink-3">{c.phone ?? 'sem número pareado'}</span>
                  <span className={`block text-[10px] ${conectada ? 'text-ok-ink' : 'text-ink-4'}`}>
                    {conectada ? 'Conectada' : 'Desconectada'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Escolher um fluxo pelo nome. Vazio = nenhum, que é sempre uma escolha. */
export function CampoDeFluxo({
  titulo,
  detalhe,
  valor,
  fluxos,
  onChange,
  extra,
}: {
  titulo: string
  detalhe: string
  valor: string | null
  fluxos: { id: string; name: string }[]
  onChange: (v: string | null) => void
  extra?: ReactNode
}) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-2">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-ink-4">{detalhe}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <Selecao value={valor ?? ''} onChange={(e) => onChange(e.target.value || null)} className={`${inputClass} flex-1`}>
          <option value="">Buscar fluxo pelo nome...</option>
          {fluxos.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Selecao>
        {extra}
      </div>
    </div>
  )
}

/**
 * Cabeçalho de um bloco de configuração: ícone, título e uma linha do que ele
 * faz. Sem a segunda linha, "Status" sozinho não diz status de quê.
 */
export function BlocoDeConfig({
  icone,
  titulo,
  detalhe,
  acao,
  children,
}: {
  icone: ReactNode
  titulo: string
  detalhe: string
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-px flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent-ink)]">
            {icone}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
            <p className="mt-0.5 text-xs text-ink-3">{detalhe}</p>
          </div>
        </div>
        {acao}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/**
 * Escolha entre dois caminhos, como cartão e não como menu.
 *
 * O que muda embaixo é DIFERENTE em cada opção — escolher "Fluxo" troca uma
 * caixa de texto por um seletor de fluxo. Numa lista suspensa isso acontece
 * depois que a lista fecha, e a pessoa não liga uma coisa à outra.
 */
export function EscolhaEmCartoes<T extends string>({
  valor,
  onChange,
  opcoes,
}: {
  valor: T
  onChange: (v: T) => void
  opcoes: { valor: T; titulo: string; detalhe: string; icone: ReactNode }[]
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {opcoes.map((o) => {
        const ativa = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={ativa}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
              ativa
                ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]'
                : 'border-line bg-canvas hover:border-line-strong'
            }`}
          >
            <span className={`shrink-0 ${ativa ? 'text-[var(--accent-ink)]' : 'text-ink-4'}`}>{o.icone}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">{o.titulo}</span>
              <span className="block text-[11px] text-ink-3">{o.detalhe}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

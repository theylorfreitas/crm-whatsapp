import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  Eye,
  EyeOff,
  FileText,
  LineChart,
  CreditCard,
  Bot,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import {
  fetchCrmIntegrations,
  saveCrmIntegration,
  deleteCrmIntegration,
  type CrmIntegration,
} from '../../../lib/db/crmSettings'
import { apiFetch } from '../../../lib/api'
import { CrmLoading } from '../CrmDataStates'
import {
  CrmModal,
  CrmField,
  inputClass,
  primaryButtonClass,
  ghostButtonClass,
  CrmPill,
  CrmErrorBar,
  CrmConfirmarExclusao,
} from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'

// INTEGRAÇÕES DO CRM.
//
// Quatro grupos, porque são quatro perguntas diferentes: quem emite a nota, quem
// rastreia a venda, quem recebe o dinheiro e qual IA responde.
//
// Duas regras valem em todos:
//
//   1. A CREDENCIAL NÃO PASSA PELO NAVEGADOR DEPOIS DE GRAVADA. Ela vai pro
//      backend, que a guarda numa tabela sem política de RLS. Reabrir o modal
//      mostra o campo VAZIO de propósito: não há como trazer o token de volta,
//      e é isso que impede um print da tela de vazar a chave do gateway.
//   2. VALIDA ANTES DE DIZER QUE CONECTOU. Onde o serviço tem rota de
//      conferência, o backend bate nela e só grava se ela responder. Onde não
//      tem, o status fica "pendente" e a tela diz por quê — em vez de pintar
//      "conectado" e o erro aparecer na primeira nota que precisava sair.

type Grupo = 'notas' | 'rastreio' | 'pagamento' | 'ia'

interface Provedor {
  chave: string
  nome: string
  /** O que a pessoa cola. Muda o rótulo, não o comportamento. */
  rotuloDoSegredo: string
  ondePegar: string
  link?: string
}

const GRUPOS: {
  id: Grupo
  aba: string
  icone: typeof FileText
  titulo: string
  detalhe: string
  rotuloNovo: string
  vazio: string
  provedores: Provedor[]
}[] = [
  {
    id: 'notas',
    aba: 'Emissão de Notas (Notasy)',
    icone: FileText,
    titulo: 'Emissores de nota',
    detalhe: 'Cadastre o token e as notas saem automaticamente no fluxo «Venda aprovada».',
    rotuloNovo: 'Novo emissor',
    vazio: 'Nenhum emissor cadastrado.',
    provedores: [
      {
        chave: 'notasy',
        nome: 'Notasy',
        rotuloDoSegredo: 'Token da integração',
        ondePegar: 'O token aparece no painel Notasy ao criar a integração com a API.',
      },
    ],
  },
  {
    id: 'rastreio',
    aba: 'Rastreamento (UTMify)',
    icone: LineChart,
    titulo: 'Rastreamento de vendas',
    detalhe: 'Toda venda aprovada é enviada pra UTMify assim que o fluxo a registra.',
    rotuloNovo: 'Nova integração',
    vazio: 'Nenhuma integração cadastrada.',
    provedores: [
      {
        chave: 'utmify',
        nome: 'UTMify',
        rotuloDoSegredo: 'Credencial de API',
        ondePegar: 'Gere em Integrações → Webhooks → Credenciais de API no painel UTMify.',
      },
    ],
  },
  {
    id: 'pagamento',
    aba: 'Pagamentos',
    icone: CreditCard,
    titulo: 'Chaves de gateway',
    detalhe: 'Cadastre uma chave de gateway para usar no bloco Pagamento dos seus fluxos.',
    rotuloNovo: 'Nova chave',
    vazio: 'Nenhuma chave de pagamento cadastrada.',
    provedores: [
      {
        chave: 'mercadopago',
        nome: 'Mercado Pago',
        rotuloDoSegredo: 'Access token',
        ondePegar: 'Use o token de PRODUÇÃO em Suas integrações → Credenciais de produção.',
        link: 'https://www.mercadopago.com.br/developers/panel',
      },
      {
        chave: 'asaas',
        nome: 'Asaas',
        rotuloDoSegredo: 'Chave de API',
        ondePegar: 'Painel Asaas → Integrações → Chave de API.',
        link: 'https://www.asaas.com',
      },
      { chave: 'xpag', nome: 'XPag', rotuloDoSegredo: 'Chave de API', ondePegar: 'Painel XPag → API.' },
    ],
  },
  {
    id: 'ia',
    aba: 'Inteligência Artificial (OpenAI, Gemini)',
    icone: Bot,
    titulo: 'Inteligência artificial',
    detalhe: 'A chave cadastrada aqui atende os blocos de IA de todos os seus fluxos.',
    rotuloNovo: 'Nova integração',
    vazio: 'Nenhuma integração cadastrada.',
    provedores: [
      {
        chave: 'openai',
        nome: 'OpenAI',
        rotuloDoSegredo: 'Chave da API',
        ondePegar: 'Gere em platform.openai.com → API keys.',
        link: 'https://platform.openai.com/api-keys',
      },
      {
        chave: 'gemini',
        nome: 'Gemini',
        rotuloDoSegredo: 'Chave da API',
        ondePegar: 'Gere em aistudio.google.com → Get API key.',
        link: 'https://aistudio.google.com/app/apikey',
      },
      {
        chave: 'elevenlabs',
        nome: 'ElevenLabs',
        rotuloDoSegredo: 'Chave da API',
        ondePegar: 'Painel ElevenLabs → Profile → API key.',
        link: 'https://elevenlabs.io/app/settings/api-keys',
      },
    ],
  },
]

export function IntegracoesPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Grupo>('notas')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<{ grupo: Grupo; existente: CrmIntegration | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<CrmIntegration | null>(null)

  const query = useQuery({ queryKey: ['crm-integrations', clientId], queryFn: () => fetchCrmIntegrations(clientId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['crm-integrations', clientId] })

  const apagar = useMutation({ mutationFn: deleteCrmIntegration, onSuccess: invalidate, onError: (e: Error) => setErro(e.message) })
  const testar = useMutation({
    mutationFn: (id: string) => apiFetch<{ status: string; detail: string | null }>(`/crm/integrations/${id}/testar`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (e: Error) => setErro(e.message),
  })

  const grupo = GRUPOS.find((g) => g.id === aba)!
  const chavesDoGrupo = grupo.provedores.map((p) => p.chave)

  const daAba = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (query.data ?? [])
      .filter((i) => chavesDoGrupo.includes(i.provider))
      .filter((i) => !t || i.label.toLowerCase().includes(t) || i.provider.includes(t))
  }, [query.data, chavesDoGrupo, busca])

  return (
    <div>
      {/* As abas rolam sozinhas numa tela estreita, em vez de quebrar em duas
          linhas e empurrar a lista pra baixo. */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {GRUPOS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setAba(g.id)}
            aria-pressed={aba === g.id}
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              aba === g.id
                ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent-ink)]'
                : 'border-line bg-surface text-ink-3 hover:text-ink'
            }`}
          >
            {g.aba}
          </button>
        ))}
      </div>

      {erro && <CrmErrorBar message={erro} onClose={() => setErro(null)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar..." className={`${inputClass} pl-9`} />
        </div>
        <button type="button" onClick={() => setEditando({ grupo: aba, existente: null })} className={primaryButtonClass}>
          <Plus size={14} /> {grupo.rotuloNovo}
        </button>
      </div>

      {query.isLoading ? (
        <CrmLoading />
      ) : daAba.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface py-12 text-center">
          <grupo.icone size={24} className="mx-auto mb-2 text-ink-4" />
          <p className="text-sm font-medium text-ink-2">{grupo.vazio}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-4">{grupo.detalhe}</p>
          <button type="button" onClick={() => setEditando({ grupo: aba, existente: null })} className={`${primaryButtonClass} mt-3`}>
            <Plus size={14} /> {grupo.rotuloNovo}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {daAba.map((i) => {
            const provedor = grupo.provedores.find((p) => p.chave === i.provider)
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent-ink)]">
                  <grupo.icone size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-ink">{i.label}</span>
                    <CrmPill tone="cinza">{provedor?.nome ?? i.provider}</CrmPill>
                    <CrmPill tone={i.status === 'conectado' ? 'verde' : i.status === 'erro' ? 'vermelho' : 'amarelo'}>
                      {i.status}
                    </CrmPill>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {i.statusDetail ?? (i.secretHint ? `Credencial ${i.secretHint}` : 'Sem credencial guardada.')}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => testar.mutate(i.id)}
                    disabled={testar.isPending}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label={`Testar ${i.label}`}
                    title="Conferir a credencial agora"
                  >
                    <RefreshCw size={12} className={testar.isPending ? 'animate-spin' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando({ grupo: aba, existente: i })}
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-canvas"
                    aria-label={`Editar ${i.label}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAExcluir(i)}
                    className="rounded-lg border border-line p-1.5 text-ink-4 hover:bg-danger-bg hover:text-danger-ink"
                    aria-label={`Remover ${i.label}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <ModalDeIntegracao
          clientId={clientId}
          grupo={GRUPOS.find((g) => g.id === editando.grupo)!}
          existente={editando.existente}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            invalidate()
            setEditando(null)
          }}
        />
      )}

      <CrmConfirmarExclusao
        open={!!aExcluir}
        titulo="Remover integração"
        pergunta={
          <>
            A credencial de <strong>{aExcluir?.label}</strong> é apagada do servidor. Os fluxos que dependem dela param
            de funcionar na hora.
          </>
        }
        rotuloConfirmar="Remover"
        onConfirmar={() => {
          if (aExcluir) apagar.mutate(aExcluir.id)
          setAExcluir(null)
        }}
        onCancelar={() => setAExcluir(null)}
      />
    </div>
  )
}

function ModalDeIntegracao({
  clientId,
  grupo,
  existente,
  onClose,
  onSalvo,
}: {
  clientId: string
  grupo: (typeof GRUPOS)[number]
  existente: CrmIntegration | null
  onClose: () => void
  onSalvo: () => void
}) {
  const [provider, setProvider] = useState(existente?.provider ?? grupo.provedores[0]!.chave)
  const [label, setLabel] = useState(existente?.label ?? '')
  // SEMPRE vazio ao abrir, mesmo editando. O token guardado não volta do
  // servidor — é essa ida só de ida que impede um print desta tela de vazá-lo.
  const [secret, setSecret] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const provedor = grupo.provedores.find((p) => p.chave === provider) ?? grupo.provedores[0]!

  const salvar = useMutation({
    mutationFn: () =>
      saveCrmIntegration({
        id: existente?.id,
        clientId,
        provider,
        label: label.trim(),
        config: {},
        secret: secret.trim() || undefined,
      }),
    onSuccess: onSalvo,
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <CrmModal
      open
      icon={<grupo.icone size={17} />}
      title={existente ? `Editar: ${existente.label}` : `Nova integração: ${provedor.nome}`}
      description={grupo.detalhe}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={!label.trim() || (!existente && !secret.trim()) || salvar.isPending}
            className={primaryButtonClass}
          >
            {salvar.isPending ? 'Conferindo…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {grupo.provedores.length > 1 && (
          <CrmField label="Provedor">
            <Selecao value={provider} onChange={(e) => setProvider(e.target.value)} className={inputClass} disabled={!!existente}>
              {grupo.provedores.map((p) => (
                <option key={p.chave} value={p.chave}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </CrmField>
        )}

        <CrmField label="Nome da conta" hint="Como você reconhece esta credencial quando tiver mais de uma.">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
            placeholder="Ex.: matriz, filial, conta principal"
            autoFocus
          />
        </CrmField>

        <CrmField
          label={provedor.rotuloDoSegredo}
          hint={existente ? 'Já guardado. Preencha só para trocar.' : provedor.ondePegar}
        >
          <div className="relative">
            <input
              type={mostrar ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={`${inputClass} pr-9`}
              placeholder={existente ? '••••••••••••' : 'cole aqui'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setMostrar((v) => !v)}
              aria-label={mostrar ? 'Esconder a credencial' : 'Mostrar a credencial'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-4 hover:text-ink-2"
            >
              {mostrar ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </CrmField>

        {provedor.link && (
          <a
            href={provedor.link}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent-ink)] hover:underline"
          >
            Veja como pegar sua credencial <ExternalLink size={11} />
          </a>
        )}

        {erro && <p className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger-ink">{erro}</p>}

        <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink-3">
          A credencial é conferida com o serviço antes de ser guardada, e fica no servidor. Ela não volta pra esta tela
          nem aparece em nenhum lugar do navegador.
        </p>
      </div>
    </CrmModal>
  )
}

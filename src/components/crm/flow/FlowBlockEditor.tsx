import { useState } from 'react'
import {
  Plus,
  Trash2,
  GripVertical,
  Play,
  Loader2,
  List as ListIcon,
  Square,
  LayoutGrid,
  Tag as TagIcon,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react'
import type { FlowBlock, FlowBlockData, FlowCondition, FlowCarouselCard, FlowMenuOption, FlowTimeUnit } from '../../../types/crmFlow'
import {
  blockSpec,
  formatoDoMenu,
  MAX_BOTOES_WHATSAPP,
  MAX_DIAS_FLUXO,
  MAX_LETRAS_DO_BOTAO,
  paraSegundos,
} from '../../../types/crmFlow'
import { CrmModal, CrmField, inputClass, primaryButtonClass, ghostButtonClass, CrmToggle } from '../ui/CrmUi'
import { Selecao } from '../../ui/Selecao'
import { FlowContentEditor, CampoDeMensagem, AreaDeImagem } from './FlowContentEditor'
import { IconeDoBloco } from './FlowCanvas'

// Editor de um bloco do fluxo. Cada tipo tem o seu formulário; o que é comum
// (tempo com unidade, lista de opções) vira peça reaproveitada aqui embaixo.
//
// Nenhum campo é decorativo: tudo que aparece aqui é lido pelo motor em
// src/lib/flowEngine.ts. Campo que a execução ainda não usa não entra na tela.

export interface Catalogos {
  clientId: string
  etiquetas: { id: string; name: string }[]
  departamentos: { id: string; name: string }[]
  fluxos: { id: string; name: string }[]
  kanbans: { id: string; name: string }[]
  produtos: { id: string; name: string }[]
  equipe: { email: string; name: string }[]
  templates: { id: string; name: string }[]
  variaveisGlobais: { id: string; name: string }[]
}

interface Props {
  open: boolean
  block: FlowBlock | null
  catalogos: Catalogos
  onClose: () => void
  onSave: (data: FlowBlockData) => void
}

export function FlowBlockEditor({ open, block, catalogos, onClose, onSave }: Props) {
  const [data, setData] = useState<FlowBlockData>(block?.data ?? {})
  const [chave, setChave] = useState(block?.id)

  // Trocar de bloco sem fechar o modal precisa recarregar o formulário; sem
  // isto o editor mostraria os dados do bloco anterior.
  if (block && chave !== block.id) {
    setChave(block.id)
    setData(block.data)
  }

  if (!block) return null
  const spec = blockSpec(block.kind)
  const set = (patch: Partial<FlowBlockData>) => setData((d) => ({ ...d, ...patch }))
  const largo = ['mensagem', 'integracao', 'ia', 'venda', 'carrossel'].includes(block.kind)

  return (
    <CrmModal
      open={open}
      title={`Editar ${spec.label}`}
      // Sem a descrição do tipo aqui em cima: ela repete o que os cartões já
      // dizem logo abaixo, e roubava a linha do título num modal que já é
      // comprido. O ícone em ladrilho, na cor do bloco, diz qual bloco é sem
      // ocupar linha nenhuma.
      icon={
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${spec.color}22`, color: spec.color }}
        >
          <IconeDoBloco kind={block.kind} size={16} />
        </span>
      }
      wide={largo}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghostButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={() => onSave(data)} className={primaryButtonClass}>
            Salvar
          </button>
        </>
      }
    >
      <Formulario kind={block.kind} data={data} set={set} catalogos={catalogos} />
    </CrmModal>
  )
}

function Formulario({
  kind,
  data: d,
  set,
  catalogos: c,
}: {
  kind: FlowBlock['kind']
  data: FlowBlockData
  set: (p: Partial<FlowBlockData>) => void
  catalogos: Catalogos
}) {
  switch (kind) {
    case 'mensagem':
      return (
        // O "Delay entre Mensagens" do bloco saiu daqui: virou o "digitando" de
        // CADA conteúdo, dentro do cartão dele. Um par de sliders no topo
        // atrasava todas as frases igual, e ficava longe da frase que atrasava.
        <FlowContentEditor clientId={c.clientId} itens={d.items ?? []} etiquetas={c.etiquetas} onChange={(items) => set({ items })} />
      )

    case 'menu':
      return <EditorMenu clientId={c.clientId} d={d} set={set} />

    case 'carrossel':
      return <EditorCarrossel clientId={c.clientId} d={d} set={set} />

    case 'template':
      return (
        <div className="space-y-3">
          <CrmField label="Template aprovado">
            <Selecao className={inputClass} value={d.templateId ?? ''} onChange={(e) => set({ templateId: e.target.value || null })} placeholder="Selecione um template">
              {c.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Selecao>
          </CrmField>
          <TempoComUnidade
            rotulo="Timeout de resposta"
            valor={d.responseTimeout ?? 60}
            unidade={d.responseTimeoutUnit ?? 'minutos'}
            onChange={(v, u) => set({ responseTimeout: v, responseTimeoutUnit: u })}
          />
          <Explicacao texto="Envia template Meta HSM e aguarda clique em Quick Reply. Sem clique dentro do prazo, o fluxo segue pela saída de timeout." />
        </div>
      )

    case 'aguarda':
      return (
        <div className="space-y-3">
          <CrmToggle
            checked={!!d.waitForever}
            onChange={(v) => set({ waitForever: v })}
            label="Aguardar indefinidamente (sem encerrar automaticamente por tempo)"
            hint="O fluxo só avança quando o lead responder (ou por outra ação externa)."
          />
          {!d.waitForever && (
            <TempoComUnidade
              rotulo="Tempo máximo aguardando a resposta do lead"
              valor={d.waitValue ?? 1}
              unidade={d.waitUnit ?? 'dias'}
              onChange={(v, u) => set({ waitValue: v, waitUnit: u })}
            />
          )}
          <CrmToggle checked={!!d.bufferEnabled} onChange={(v) => set({ bufferEnabled: v })} label="Ativar buffer de mensagens" hint="Junta mensagens seguidas do lead antes de seguir. Evita responder a cada linha quando ele escreve picotado." />
          {d.bufferEnabled && (
            <CrmField label="Segundos de espera entre mensagens">
              <input type="number" min={1} max={120} className={inputClass} value={d.bufferSeconds ?? 5} onChange={(e) => set({ bufferSeconds: Number(e.target.value) })} />
            </CrmField>
          )}
          <CrmToggle checked={!!d.replyToLead} onChange={(v) => set({ replyToLead: v })} label="Responder como resposta à mensagem do lead" />
          <CrmToggle checked={!!d.reactToLead} onChange={(v) => set({ reactToLead: v })} label="Reagir na mensagem do lead" hint="Reage na última resposta do lead ao enviar o próximo bloco." />
          <CampoResposta d={d} set={set} rotulo="Campo para salvar a informação no usuário:" />
          <CrmField label="Mensagem antes de aguardar a resposta:">
            <textarea className={`${inputClass} min-h-[72px] resize-y`} placeholder="Mensagem" value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          </CrmField>
        </div>
      )

    case 'condicional':
      return <EditorCondicional d={d} set={set} />

    case 'distribuidor':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-3">Distribuir sempre para próximo</span>
            <Interruptor ligado={d.preventRepeat !== false} onChange={(v) => set({ preventRepeat: v })} />
            <span className="text-xs font-medium text-ink">Prevenir repetição</span>
          </div>
          <ListaDeOpcoes
            titulo="Saídas"
            rotuloBotao="Adicionar saída"
            opcoes={(d.saidas ?? []).map((s) => ({ id: s.id, label: s.label }))}
            onChange={(saidas) => set({ saidas: saidas.map((s) => ({ id: s.id, label: s.label })) })}
          />
          <Explicacao texto="Distribui contatos igualmente entre as saídas. Clientes repetidos sempre vão para a mesma saída anterior." />
        </div>
      )

    case 'intervalo':
      return (
        <div className="space-y-3">
          <Abas
            valor={d.scheduleKind ?? 'intervalo'}
            opcoes={[
              { valor: 'intervalo', label: 'Intervalo' },
              { valor: 'data', label: 'Data' },
              { valor: 'horarios', label: 'Horários' },
            ]}
            onChange={(v) => set({ scheduleKind: v as 'intervalo' | 'data' | 'horarios' })}
          />
          {d.scheduleKind === 'data' ? (
            <CrmField label="Data e hora" hint={`No máximo ${MAX_DIAS_FLUXO} dias à frente.`}>
              <input type="datetime-local" className={inputClass} value={d.scheduleDate ?? ''} onChange={(e) => set({ scheduleDate: e.target.value })} />
            </CrmField>
          ) : d.scheduleKind === 'horarios' ? (
            <JanelasDeHorario janelas={d.scheduleHours ?? []} onChange={(scheduleHours) => set({ scheduleHours })} />
          ) : (
            <TempoComUnidade
              rotulo="Tempo"
              valor={d.intervalValue ?? 1}
              unidade={d.intervalUnit ?? 'minutos'}
              onChange={(v, u) => set({ intervalValue: v, intervalUnit: u })}
              hint={`Configure o intervalo de tempo para aguardar antes de continuar (máximo ${MAX_DIAS_FLUXO} dias no total).`}
            />
          )}
        </div>
      )

    case 'conexao':
      return (
        <CrmField label="Selecione o fluxo de destino:">
          <Selecao className={inputClass} value={d.targetFlowId ?? ''} onChange={(e) => set({ targetFlowId: e.target.value || null })} placeholder="Digite o nome do fluxo…">
            {c.fluxos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
      )

    case 'manipulador':
      return (
        <div className="space-y-3">
          <CrmField label="Nome da variável que será utilizada:">
            <input className={inputClass} placeholder="Ex: Conta1" value={d.varName ?? ''} onChange={(e) => set({ varName: e.target.value })} />
          </CrmField>
          <CrmField label="Escolha qual operação será realizada:">
            <Selecao className={inputClass} value={d.varOperation ?? 'definir'} onChange={(e) => set({ varOperation: e.target.value as FlowBlockData['varOperation'] })}>
              <option value="definir">Definir valor</option>
              <option value="somar">Somar</option>
              <option value="subtrair">Subtrair</option>
              <option value="incrementar">Incrementar em 1</option>
              <option value="limpar">Limpar</option>
            </Selecao>
          </CrmField>
          {d.varOperation !== 'limpar' && d.varOperation !== 'incrementar' && (
            <CrmField label="Valor a salvar no contato" hint="Variáveis entre chaves são resolvidas na execução (ex.: {first_name}).">
              <textarea className={`${inputClass} min-h-[72px] resize-y`} placeholder="Texto ou variáveis como {full_name}" value={d.varValue ?? ''} onChange={(e) => set({ varValue: e.target.value })} />
            </CrmField>
          )}
          <Explicacao texto="A alteração vale para os próximos passos do fluxo." />
        </div>
      )

    case 'etiqueta':
      return (
        <div className="space-y-3">
          <SeletorDeEtiquetas etiquetas={c.etiquetas} escolhidas={d.tags ?? []} onChange={(tags) => set({ tags })} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-3">Remover etiquetas</span>
            <Interruptor ligado={d.addTags !== false} onChange={(v) => set({ addTags: v })} />
            <span className="text-xs font-medium text-ink">Adicionar etiquetas</span>
          </div>
          <Explicacao
            icone={TagIcon}
            texto={
              d.addTags === false
                ? 'Este nó REMOVE as etiquetas selecionadas dos clientes durante a execução do fluxo.'
                : 'Este nó adiciona as etiquetas selecionadas aos clientes durante a execução do fluxo.'
            }
          />
        </div>
      )

    case 'controle':
      return (
        <div className="space-y-3">
          <CrmField label="Configurar Estado do Chat *">
            <Selecao className={inputClass} value={d.chatState ?? 'aguardando'} onChange={(e) => set({ chatState: e.target.value as FlowBlockData['chatState'] })}>
              <option value="aguardando">Aguardando</option>
              <option value="atendendo">Atendimento</option>
              <option value="resolvido">Resolvidos</option>
            </Selecao>
          </CrmField>
          <Explicacao texto="Este nó altera automaticamente o estado do chat no sistema interno, permitindo controlar o fluxo de atendimento (Aguardando → Atendimento → Resolvidos)." />
        </div>
      )

    case 'departamento':
      return (
        <div className="space-y-3">
          <CrmField label="Departamento">
            <Selecao
              className={inputClass}
              value={d.departmentId ?? ''}
              onChange={(e) => set({ departmentId: e.target.value || null })}
              placeholder={c.departamentos.length ? 'Escolha o departamento…' : 'Nenhuma ação configurada. Crie departamentos em Configurações.'}
            >
              {c.departamentos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Selecao>
          </CrmField>
          <Explicacao texto="Este nó atribui automaticamente um departamento ao chat durante a execução do fluxo, permitindo organizar e filtrar os chats por departamento." />
        </div>
      )

    case 'atribuir':
      return (
        <div className="space-y-3">
          <CrmField label="Atendente">
            <Selecao className={inputClass} value={d.assigneeEmail ?? ''} onChange={(e) => set({ assigneeEmail: e.target.value })} placeholder={c.equipe.length ? 'Escolha quem atende…' : 'Cadastre a equipe em Permissões'}>
              {c.equipe.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name || m.email}
                </option>
              ))}
            </Selecao>
          </CrmField>
          <Explicacao texto="Coloca o chat com essa pessoa e move para Atendendo." />
        </div>
      )

    case 'kanban':
      return (
        <div className="space-y-3">
          <CrmField label="Ação *" hint={d.kanbanAction === 'mover' ? 'Move o card existente para a coluna escolhida' : 'Cria um card no Kanban selecionado'}>
            <Selecao className={inputClass} value={d.kanbanAction ?? 'adicionar'} onChange={(e) => set({ kanbanAction: e.target.value as 'adicionar' | 'mover' })}>
              <option value="adicionar">Adicionar</option>
              <option value="mover">Mover</option>
            </Selecao>
          </CrmField>
          <CrmField label="Selecionar Kanban *" hint={c.kanbans.length ? undefined : 'Nenhum Kanban cadastrado. Crie um Kanban primeiro.'}>
            <Selecao className={inputClass} value={d.kanbanId ?? ''} onChange={(e) => set({ kanbanId: e.target.value || null })} placeholder="Selecione um Kanban">
              {c.kanbans.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Selecao>
          </CrmField>
        </div>
      )

    case 'notificacao':
      return (
        <div className="space-y-3">
          <CrmField label="Nome *">
            <input className={inputClass} placeholder="Ex: Notificação de pedido recebido" value={d.notifyName ?? ''} onChange={(e) => set({ notifyName: e.target.value })} />
          </CrmField>
          <CrmField label="Número *">
            <div className="flex gap-2">
              <Selecao className={`${inputClass} w-28 shrink-0`} value={d.notifyCountry ?? '55'} onChange={(e) => set({ notifyCountry: e.target.value })}>
                <option value="55">BR +55</option>
                <option value="1">US +1</option>
                <option value="351">PT +351</option>
                <option value="34">ES +34</option>
              </Selecao>
              <input className={inputClass} placeholder="número sem +55" value={d.notifyPhone ?? ''} onChange={(e) => set({ notifyPhone: e.target.value })} />
            </div>
          </CrmField>
          <CrmField label="Mensagem *">
            <textarea className={`${inputClass} min-h-[84px] resize-y`} placeholder="Digite sua mensagem aqui…" value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          </CrmField>
          <Explicacao texto="Este nó envia uma notificação via WhatsApp para o número especificado. Use a formatação de texto para destacar partes importantes da mensagem." />
        </div>
      )

    case 'ia':
      return <EditorIa d={d} set={set} variaveisGlobais={c.variaveisGlobais} />

    case 'integracao':
      return <EditorIntegracao d={d} set={set} />

    case 'kieai':
      return <EditorKieAi d={d} set={set} />

    case 'pixel':
      return (
        <div className="space-y-3">
          <CrmField label="Pixel Configurado *" hint="Configure seus pixels em Configurações → Pixels do Facebook">
            <Selecao className={inputClass} value={d.pixelId ?? ''} onChange={(e) => set({ pixelId: e.target.value || null })} placeholder="Selecione um pixel configurado">
              <option value="">Nenhum pixel cadastrado</option>
            </Selecao>
          </CrmField>
          <CrmField label="Tipo do evento *">
            <Selecao className={inputClass} value={d.pixelEvent ?? 'Purchase'} onChange={(e) => set({ pixelEvent: e.target.value as FlowBlockData['pixelEvent'] })}>
              <option value="Purchase">Compra</option>
              <option value="Lead">Lead</option>
              <option value="CompleteRegistration">Cadastro completo</option>
              <option value="InitiateCheckout">Início de checkout</option>
              <option value="AddToCart">Adicionar ao carrinho</option>
              <option value="ViewContent">Visualizar conteúdo</option>
            </Selecao>
          </CrmField>
          <CrmField label="Page ID (Obrigatório para WhatsApp) *" hint="ID da página do Facebook vinculada ao WhatsApp Business. Obrigatório para eventos via WhatsApp.">
            <input className={inputClass} placeholder="Ex: 123456789012345 ou {pagina_id}" value={d.pageId ?? ''} onChange={(e) => set({ pageId: e.target.value })} />
          </CrmField>
          {d.pixelEvent === 'Purchase' && (
            <CrmField label="Valor do item *" hint="Usado apenas para eventos de compra.">
              <input className={inputClass} placeholder="Ex: 197,00 ou {preco}" value={d.amount ?? ''} onChange={(e) => set({ amount: e.target.value })} />
            </CrmField>
          )}
          <CrmField label="Moeda *" hint="Enviada junto com o valor da compra na Conversions API. Padrão: BRL.">
            <Selecao className={inputClass} value={d.currency ?? 'BRL'} onChange={(e) => set({ currency: e.target.value })}>
              <option value="BRL">BRL: Real brasileiro</option>
              <option value="USD">USD: Dólar</option>
              <option value="EUR">EUR: Euro</option>
            </Selecao>
          </CrmField>
          <Explicacao texto="Este nó dispara eventos no Facebook através da Conversions API. Selecione um pixel configurado nas Configurações para usar." />
        </div>
      )

    case 'pix':
      return (
        <div className="space-y-3">
          <CrmField label="Tipo da Chave PIX *">
            <Selecao className={inputClass} value={d.pixKeyType ?? 'aleatoria'} onChange={(e) => set({ pixKeyType: e.target.value as FlowBlockData['pixKeyType'] })}>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="telefone">Telefone</option>
              <option value="email">E-mail</option>
              <option value="aleatoria">Chave Aleatória</option>
            </Selecao>
          </CrmField>
          <CrmField label="Chave PIX *" hint="Na integração oficial, o código do pedido (EMV) usa esta mesma chave.">
            <input className={inputClass} placeholder="123e4567-e89b-12d3-a456-426614174000" value={d.pixKey ?? ''} onChange={(e) => set({ pixKey: e.target.value })} />
          </CrmField>
          <CrmField label="Destinatário do pagamento" hint="Se não preenchido, será usado “Pix” nas conexões padrão. Obrigatório na integração oficial (WhatsApp Cloud API / Meta).">
            <input className={inputClass} placeholder="Ex: Comercio Silva Ltda" value={d.pixRecipient ?? ''} onChange={(e) => set({ pixRecipient: e.target.value })} />
          </CrmField>
          <CrmField label="Valor (R$)" hint="Obrigatório quando o fluxo roda na integração oficial. Use variáveis como {full_name} ou campos customizados.">
            <input className={inputClass} placeholder="Ex: 49,90" value={d.amount ?? ''} onChange={(e) => set({ amount: e.target.value })} />
          </CrmField>
          <Explicacao texto="Este nó envia um botão PIX para o cliente, permitindo que ele copie a chave PIX e realize o pagamento diretamente no aplicativo do banco. Nas conexões padrão, basta chave e tipo. Na integração oficial (Meta), valor e nome do recebedor são obrigatórios." />
        </div>
      )

    case 'pagamento':
      return (
        <div className="space-y-3">
          <CrmField label="Gateway">
            <Selecao className={inputClass} value={d.gateway ?? 'xpag'} onChange={(e) => set({ gateway: e.target.value })}>
              <option value="xpag">XPag</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="asaas">Asaas</option>
            </Selecao>
          </CrmField>
          <div className="rounded-lg border border-line bg-canvas p-3 text-xs text-ink-3">
            Nenhuma chave cadastrada para este gateway.
            <span className="mt-0.5 block text-[var(--accent-ink)]">Cadastre em Integrações → Pagamentos</span>
          </div>
          <CrmToggle checked={!!d.openAmount} onChange={(v) => set({ openAmount: v })} label="Chave sem valor" hint="Lead paga o valor que quiser. Depois do pagamento, use {gateway.value}." />
          {!d.openAmount && (
            <div className="grid grid-cols-2 gap-2">
              <CrmField label="Moeda">
                <Selecao className={inputClass} value={d.currency ?? 'BRL'} onChange={(e) => set({ currency: e.target.value })}>
                  <option value="BRL">BR BRL</option>
                  <option value="MXN">MX MXN</option>
                </Selecao>
              </CrmField>
              <CrmField label="Valor">
                <input className={inputClass} value={d.amount ?? ''} onChange={(e) => set({ amount: e.target.value })} />
              </CrmField>
            </div>
          )}
          <CrmField label="Nome">
            <input className={inputClass} value={d.customerName ?? ''} onChange={(e) => set({ customerName: e.target.value })} />
          </CrmField>
          <CrmField label="Telefone">
            <input className={inputClass} value={d.customerPhone ?? ''} onChange={(e) => set({ customerPhone: e.target.value })} />
          </CrmField>
          <Bloco titulo="Variáveis após a cobrança">
            <p className="mb-1.5 text-[11px] text-ink-4">Disponíveis no fluxo após gerar a cobrança. Não vão para os campos do Lead.</p>
            {[
              ['{gateway.transaction_id}', 'ID da transação'],
              ['{gateway.payment_code}', 'PIX copia e cola (BRL) ou CLABE (MXN)'],
              ['{gateway.value}', 'Valor pago'],
              ['{gateway.erro}', 'Código de erro'],
            ].map(([v, t]) => (
              <p key={v} className="text-[11px]">
                <code className="text-[var(--accent-ink)]">{v}</code> <span className="text-ink-4">{t}</span>
              </p>
            ))}
          </Bloco>
        </div>
      )

    case 'venda':
      return <EditorVenda d={d} set={set} produtos={c.produtos} />

    default:
      return <Explicacao texto={blockSpec(kind).description} />
  }
}

// ─── Peças reaproveitadas ───────────────────────────────────────────────────

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-canvas p-3">
      <h3 className="mb-2 text-xs font-semibold text-ink">{titulo}</h3>
      {children}
    </section>
  )
}

function Explicacao({ texto, icone: Icone }: { texto: string; icone?: LucideIcon }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-canvas p-3">
      {Icone && (
        <span className="mt-0.5 shrink-0" style={{ color: 'var(--accent-ink)' }}>
          <Icone size={14} />
        </span>
      )}
      <div className="min-w-0">
        <p className="mb-0.5 text-xs font-semibold text-ink-2">Como funciona</p>
        <p className="text-[11px] leading-relaxed text-ink-3">{texto}</p>
      </div>
    </div>
  )
}

function Interruptor({ ligado, onChange }: { ligado: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={() => onChange(!ligado)}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: ligado ? 'var(--accent)' : 'var(--line-strong)' }}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-all ${ligado ? 'left-[1.125rem]' : 'left-0.5'}`} />
    </button>
  )
}

function Abas({ valor, opcoes, onChange }: { valor: string; opcoes: { valor: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-0 overflow-hidden rounded-lg border border-line" style={{ gridTemplateColumns: `repeat(${opcoes.length}, 1fr)` }}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={`py-2 text-xs font-medium transition-colors ${valor === o.valor ? 'text-white' : 'text-ink-3 hover:bg-surface-2'}`}
          style={valor === o.valor ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const UNIDADES: { valor: FlowTimeUnit; label: string }[] = [
  { valor: 'segundos', label: 'Segundos' },
  { valor: 'minutos', label: 'Minutos' },
  { valor: 'horas', label: 'Horas' },
  { valor: 'dias', label: 'Dias' },
]

function TempoComUnidade({
  rotulo,
  valor,
  unidade,
  hint,
  empilhado,
  onChange,
}: {
  rotulo: string
  valor: number
  unidade: FlowTimeUnit
  hint?: string
  /** Rótulo largo em cima, explicação embaixo, campos lado a lado. */
  empilhado?: boolean
  onChange: (v: number, u: FlowTimeUnit) => void
}) {
  const passa = paraSegundos(valor, unidade) > MAX_DIAS_FLUXO * 86400
  const seletor = (
    <Selecao className={inputClass} value={unidade} onChange={(e) => onChange(valor, e.target.value as FlowTimeUnit)}>
      {UNIDADES.map((u) => (
        <option key={u.valor} value={u.valor}>
          {u.label}
        </option>
      ))}
    </Selecao>
  )
  const numero = (
    <input type="number" min={0} className={inputClass} value={valor} onChange={(e) => onChange(Number(e.target.value), unidade)} />
  )

  if (empilhado) {
    return (
      <div>
        <span className="mb-1 block text-xs font-medium text-ink-2">{rotulo}</span>
        {hint && !passa && <p className="mb-1.5 text-[11px] leading-relaxed text-ink-4">{hint}</p>}
        <div className="grid grid-cols-2 gap-2">
          {numero}
          {seletor}
        </div>
        {passa && <p className="mt-1 text-[11px] text-danger-ink">Passa de {MAX_DIAS_FLUXO} dias. O motor recusa esperas maiores.</p>}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <CrmField label={rotulo}>{numero}</CrmField>
        <CrmField label="Unidade">{seletor}</CrmField>
      </div>
      {/* O teto de 31 dias é o mesmo do agendamento (migração 0024) — avisar
          aqui evita gravar um fluxo que o motor recusaria depois. */}
      {passa ? (
        <p className="mt-1 text-[11px] text-danger-ink">Passa de {MAX_DIAS_FLUXO} dias. O motor recusa esperas maiores.</p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-ink-4">{hint}</p>
      )}
    </div>
  )
}

/**
 * O prazo do menu.
 *
 * Desenhado com o rótulo em cima, a explicação embaixo dele e os dois campos
 * lado a lado — e não como duas colunas rotuladas. O rótulo é comprido: em
 * meia largura ele quebrava em duas linhas e empurrava o campo do número pra
 * baixo do seletor de unidade, deixando os dois desalinhados.
 */
function Expiracao({ d, set }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void }) {
  return (
    <TempoComUnidade
      rotulo="Tempo de expiração do menu (saída por inatividade)"
      empilhado
      valor={d.expireValue ?? 0}
      unidade={d.expireUnit ?? 'dias'}
      onChange={(v, u) => set({ expireValue: v, expireUnit: u })}
      // OS "2 DIAS" SÃO O `WHATSAPP_FLUXO_ESPERA_MIN` DA PONTE. Mexer num sem
      // o outro sai caro: a tela diria 2 dias e o motor encerraria em 30
      // minutos, então meia hora depois a pessoa tocava no botão e não
      // acontecia nada — o botão continua tocável no WhatsApp pra sempre, mas
      // do nosso lado já não havia execução esperando.
      hint={`Se 0, o padrão é 2 dias. Se definir um tempo, a saída por inatividade será exibida no fluxo. Limite máximo: ${MAX_DIAS_FLUXO} dias no total.`}
    />
  )
}

function CampoResposta({ d, set, rotulo }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void; rotulo?: string }) {
  return (
    <CrmField label={rotulo ?? 'Campo para salvar a resposta do usuário'} hint="Deixe em branco para não salvar a resposta.">
      <input className={inputClass} placeholder="Ex.: escolha_menu" value={d.saveToVariable ?? ''} onChange={(e) => set({ saveToVariable: e.target.value })} />
    </CrmField>
  )
}

/**
 * O MENU: lista rolável ou botões expostos, e a escolha agora VALE.
 *
 * Aqui já houve uma caixinha de formato que o motor ignorava — a tela dizia
 * "lista" e saía outra coisa. Ela foi tirada, e no lugar ficou a contagem de
 * opções decidindo sozinha. Isso era honesto, mas tirava uma escolha real:
 * lista com duas opções mostra DESCRIÇÃO embaixo de cada linha, e botão não
 * tem onde pôr isso.
 *
 * Agora o seletor está de volta e manda de verdade — `menuFormat` é lido pelo
 * motor em `enviarMenu`. A única coisa que ele NÃO pode prometer é botão com
 * mais de três opções, porque esse limite é do WhatsApp: passando disso, a
 * tela troca sozinha e diz que trocou.
 */
function EditorMenu({
  clientId,
  d,
  set,
}: {
  clientId: string
  d: FlowBlockData
  set: (p: Partial<FlowBlockData>) => void
}) {
  const opcoes = d.options ?? []
  const pedido = d.menuFormat ?? 'botoes'
  const comBotoes = formatoDoMenu(d) === 'botoes'
  const virouLista = pedido === 'botoes' && !comBotoes

  return (
    <div className="space-y-3">
      <SeletorDeFormato
        valor={pedido}
        onChange={(v) => set({ menuFormat: v })}
      />

      {/* Só aparece quando a escolha NÃO pôde ser cumprida. Um aviso que fica
          na tela o tempo todo vira parte do fundo e ninguém lê justamente no
          dia em que ele importa. */}
      {virouLista && (
        <p className="rounded-lg border border-warn bg-warn-bg px-3 py-2 text-[11px] leading-relaxed text-warn-ink">
          Este menu tem {opcoes.length} opções e vai sair como <strong>lista</strong>: o WhatsApp só aceita{' '}
          {MAX_BOTOES_WHATSAPP} botões. Deixe {MAX_BOTOES_WHATSAPP} ou menos para voltar a ser botão.
        </p>
      )}

      {/* A imagem vem RECOLHIDA. Ela é opcional e quase nunca usada, e a área
          de envio aberta empurrava a mensagem — o campo principal — pra fora
          da primeira tela do modal. */}
      {comBotoes && <ImagemOpcional clientId={clientId} d={d} set={set} />}

      <CampoDeMensagem
        rotulo="Mensagem *"
        altura="min-h-[84px]"
        placeholder={comBotoes ? 'Ex: É isso que você quer?' : 'Ex: Selecione a melhor opção:'}
        valor={d.text ?? ''}
        onChange={(text) => set({ text })}
      />

      {comBotoes ? (
        <CrmField label="Rodapé (opcional)">
          <input className={inputClass} placeholder="Ex: Mensagem com Botão" value={d.footer ?? ''} onChange={(e) => set({ footer: e.target.value })} />
        </CrmField>
      ) : (
        <CrmField label="Texto do Botão *" hint="É o botão que abre a lista no WhatsApp.">
          <input className={inputClass} placeholder="Ex: Abrir lista de opções" value={d.buttonLabel ?? ''} onChange={(e) => set({ buttonLabel: e.target.value })} />
        </CrmField>
      )}

      <Expiracao d={d} set={set} />

      <ListaDeOpcoes
        titulo={comBotoes ? 'Opções de Botões' : 'Opções do Menu'}
        rotuloBotao={comBotoes ? 'Adicionar Botão' : 'Adicionar Opção'}
        opcoes={opcoes}
        comDescricao={!comBotoes}
        comTipo={comBotoes}
        onChange={(options) => set({ options })}
      />

      <CampoResposta d={d} set={set} />
    </div>
  )
}

/**
 * A imagem que vai acima dos botões — fechada até alguém querer.
 *
 * Fica aberta se já houver imagem: um bloco que TEM imagem e a esconde faz
 * quem abre o editor achar que ela sumiu, e pôr outra por cima.
 */
function ImagemOpcional({
  clientId,
  d,
  set,
}: {
  clientId: string
  d: FlowBlockData
  set: (p: Partial<FlowBlockData>) => void
}) {
  const [aberta, setAberta] = useState(!!d.imageUrl)

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-xs text-ink-2 transition-colors hover:bg-surface-2"
      >
        <ImageIcon size={14} className="shrink-0 text-ink-4" />
        <span className="font-medium">Imagem</span>
        <span className="text-ink-4">(opcional)</span>
        <span className="flex-1" />
        <Plus size={13} className="shrink-0 text-ink-4" />
      </button>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">
          Imagem <span className="font-normal text-ink-4">(opcional)</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setAberta(false)
            set({ imageUrl: '' })
          }}
          className="text-[11px] text-ink-4 hover:text-danger-ink"
        >
          Não usar imagem
        </button>
      </div>
      <AreaDeImagem
        clientId={clientId}
        url={d.imageUrl ?? ''}
        origem={d.imageSource ?? 'arquivo'}
        onChange={(p) =>
          set({
            ...(p.imageUrl !== undefined ? { imageUrl: p.imageUrl } : {}),
            ...(p.source ? { imageSource: p.source } : {}),
          })
        }
      />
    </div>
  )
}

/** As duas formas de perguntar, lado a lado, do jeito que o WhatsApp desenha. */
function SeletorDeFormato({ valor, onChange }: { valor: 'lista' | 'botoes'; onChange: (v: 'lista' | 'botoes') => void }) {
  const opcoes = [
    { valor: 'lista' as const, label: 'Lista', icone: ListIcon },
    { valor: 'botoes' as const, label: 'Botões', icone: Square },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {opcoes.map((o) => {
        const ativo = valor === o.valor
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            aria-pressed={ativo}
            className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
              ativo ? 'border-transparent text-white' : 'border-line text-ink-2 hover:bg-surface-2'
            }`}
            style={ativo ? { backgroundColor: 'var(--accent)' } : undefined}
          >
            <o.icone size={14} /> {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** O que cada tipo de botão pede no segundo campo. */
const PEDIDO_DO_BOTAO: Record<string, { rotulo: string; exemplo: string }> = {
  url: { rotulo: 'Link', exemplo: 'https://…' },
  telefone: { rotulo: 'Telefone', exemplo: '5567…' },
  copiar: { rotulo: 'Código', exemplo: 'Código que o cliente copia' },
}

function ListaDeOpcoes({
  titulo,
  rotuloBotao,
  opcoes,
  comDescricao,
  comTipo,
  onChange,
}: {
  titulo: string
  rotuloBotao: string
  opcoes: FlowMenuOption[]
  comDescricao?: boolean
  /** Modo botão: cada opção pode ser resposta, link, ligação ou código copiável. */
  comTipo?: boolean
  onChange: (o: FlowMenuOption[]) => void
}) {
  const novo = () => onChange([...opcoes, { id: `o_${Math.random().toString(36).slice(2, 8)}`, label: '' }])
  const trocar = (id: string, patch: Partial<FlowMenuOption>) => onChange(opcoes.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-2">{titulo}</span>
        {/* Sem trava na quantidade: passar de três não é erro, é o menu virando
            lista sozinho. Travar aqui obrigava a pessoa a trocar um seletor
            antes de poder escrever a quarta opção. */}
        <button type="button" onClick={novo} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white" style={{ backgroundColor: 'var(--accent)' }}>
          <Plus size={12} /> {rotuloBotao}
        </button>
      </div>
      {opcoes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-[11px] text-ink-4">
          Nenhuma opção adicionada. Clique em “{rotuloBotao}” para começar.
        </p>
      ) : (
        <div className="space-y-2">
          {opcoes.map((o, i) => {
            const tipo = o.kind ?? 'resposta'
            const pedido = PEDIDO_DO_BOTAO[tipo]
            return (
              <div key={o.id} className="flex items-start gap-2">
                <GripVertical size={13} className="mt-2.5 shrink-0 text-ink-4" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* O seletor de tipo vai dentro de um invólucro de largura
                      fixa. Pôr `w-28` junto do `inputClass` não funcionava: os
                      dois trazem largura, a ordem no atributo não decide qual
                      vence, e o `w-full` ganhava — o seletor tomava a linha
                      inteira e o campo do texto sumia. */}
                  <div className="flex items-center gap-1.5">
                    {comTipo && (
                      <div className="w-28 shrink-0">
                        <Selecao className={`${inputClass} text-xs`} value={tipo} onChange={(e) => trocar(o.id, { kind: e.target.value as FlowMenuOption['kind'] })}>
                          <option value="resposta">Resposta</option>
                          <option value="url">Link</option>
                          <option value="telefone">Ligar</option>
                          <option value="copiar">Copiar</option>
                        </Selecao>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <input className={inputClass} placeholder={comTipo ? 'Título do botão' : `Opção ${i + 1}`} value={o.label} onChange={(e) => trocar(o.id, { label: e.target.value })} />
                    </div>
                  </div>
                  {/* O contador só no modo botão: o WhatsApp corta o texto do
                      botão em 20 letras. Descobrir isso depois que a mensagem
                      saiu cortada no celular do cliente é tarde demais. */}
                  {comTipo && o.label.length > MAX_LETRAS_DO_BOTAO - 5 && (
                    <p className={`text-[11px] ${o.label.length > MAX_LETRAS_DO_BOTAO ? 'text-danger-ink' : 'text-ink-4'}`}>
                      {o.label.length}/{MAX_LETRAS_DO_BOTAO} letras
                      {o.label.length > MAX_LETRAS_DO_BOTAO && ', o WhatsApp vai cortar'}
                    </p>
                  )}
                  {pedido && (
                    <input className={inputClass} placeholder={pedido.exemplo} value={o.value ?? ''} onChange={(e) => trocar(o.id, { value: e.target.value })} />
                  )}
                  {comDescricao && (
                    <input className={`${inputClass} text-xs`} placeholder="Descrição (opcional)" value={o.description ?? ''} onChange={(e) => trocar(o.id, { description: e.target.value })} />
                  )}
                </div>
                <button type="button" onClick={() => onChange(opcoes.filter((x) => x.id !== o.id))} aria-label="Remover opção" className="mt-2.5 shrink-0 text-ink-4 hover:text-danger-ink">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {comTipo && opcoes.some((o) => (o.kind ?? 'resposta') !== 'resposta') && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-4">
          Só o botão de <strong>Resposta</strong> devolve algo ao fluxo. Link, Ligar e Copiar agem no aparelho do cliente e não continuam o fluxo sozinhos. Deixe pelo menos um de resposta se o fluxo precisa seguir.
        </p>
      )}
    </div>
  )
}

function SeletorDeEtiquetas({
  etiquetas,
  escolhidas,
  onChange,
}: {
  etiquetas: { id: string; name: string }[]
  escolhidas: string[]
  onChange: (t: string[]) => void
}) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim()
  const disponiveis = etiquetas.filter((t) => !escolhidas.includes(t.name) && t.name.toLowerCase().includes(termo.toLowerCase()))

  // A etiqueta é criada AQUI, com Enter, e não em outra tela.
  //
  // Mandar quem está desenhando o fluxo sair pra Configurações, criar a
  // etiqueta e voltar é pedir que ela perca o que estava montando — o modal
  // fecha, e o bloco meio preenchido some junto. A etiqueta do fluxo é só um
  // nome de texto gravado na conversa; ela não precisa existir em lugar nenhum
  // antes. Quem quiser organizar cor e descrição continua fazendo isso em
  // Configurações, depois, sem pressa.
  const jaExiste = etiquetas.some((t) => t.name.toLowerCase() === termo.toLowerCase())
  const podeCriar = termo.length > 0 && !jaExiste && !escolhidas.some((t) => t.toLowerCase() === termo.toLowerCase())

  function usar(nome: string) {
    if (!escolhidas.includes(nome)) onChange([...escolhidas, nome])
    setBusca('')
  }

  return (
    <CrmField label="Etiquetas" hint="Pressione Enter para criar uma nova etiqueta ou selecionar uma existente">
      <div className="relative">
        <TagIcon size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          className={`${inputClass} pl-8`}
          placeholder="Digite para buscar ou criar etiqueta"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !termo) return
            e.preventDefault()
            // Enter pega a que já existe, se houver; senão cria com o que foi
            // digitado. Criar uma segunda "Cliente VIP" só por diferença de
            // maiúscula deixaria duas etiquetas que ninguém consegue distinguir.
            usar(disponiveis[0]?.name ?? etiquetas.find((t) => t.name.toLowerCase() === termo.toLowerCase())?.name ?? termo)
          }}
        />
      </div>

      {escolhidas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {escolhidas.map((t) => (
            <button key={t} type="button" onClick={() => onChange(escolhidas.filter((x) => x !== t))} className="rounded-full px-2.5 py-1 text-[11px] text-white" style={{ backgroundColor: 'var(--accent)' }}>
              {t} ×
            </button>
          ))}
        </div>
      )}

      {termo && (
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-line bg-canvas">
          {disponiveis.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => usar(t.name)}
              className="block w-full px-3 py-2 text-left text-xs text-ink-2 hover:bg-surface-2"
            >
              {t.name}
            </button>
          ))}
          {podeCriar && (
            <button
              type="button"
              onClick={() => usar(termo)}
              className="flex w-full items-center gap-1.5 border-t border-line-soft px-3 py-2 text-left text-xs text-ink-2 first:border-t-0 hover:bg-surface-2"
            >
              <Plus size={12} style={{ color: 'var(--accent-ink)' }} />
              Criar etiqueta “<strong className="font-semibold">{termo}</strong>”
            </button>
          )}
        </div>
      )}
    </CrmField>
  )
}

function JanelasDeHorario({
  janelas,
  onChange,
}: {
  janelas: { weekday: number; from: string; to: string }[]
  onChange: (j: { weekday: number; from: string; to: string }[]) => void
}) {
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-2">Janelas de envio</span>
        <button type="button" onClick={() => onChange([...janelas, { weekday: 1, from: '09:00', to: '18:00' }])} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white" style={{ backgroundColor: 'var(--accent)' }}>
          <Plus size={12} /> Adicionar janela
        </button>
      </div>
      {janelas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-[11px] text-ink-4">
          Sem janela, o fluxo segue na hora. Adicione uma para segurar até o horário comercial.
        </p>
      ) : (
        <div className="space-y-2">
          {janelas.map((j, i) => (
            <div key={i} className="flex items-center gap-2">
              <Selecao className={inputClass} value={String(j.weekday)} onChange={(e) => onChange(janelas.map((x, k) => (k === i ? { ...x, weekday: Number(e.target.value) } : x)))}>
                {DIAS.map((dia, k) => (
                  <option key={dia} value={String(k)}>
                    {dia}
                  </option>
                ))}
              </Selecao>
              <input type="time" aria-label="De" className={inputClass} value={j.from} onChange={(e) => onChange(janelas.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)))} />
              <input type="time" aria-label="Até" className={inputClass} value={j.to} onChange={(e) => onChange(janelas.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)))} />
              <button type="button" onClick={() => onChange(janelas.filter((_, k) => k !== i))} aria-label="Remover janela" className="shrink-0 text-ink-4 hover:text-danger-ink">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Editores maiores ───────────────────────────────────────────────────────

function EditorCondicional({ d, set }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void }) {
  const conds = d.conditions ?? []
  const novo = () => set({ conditions: [...conds, { id: `k_${Math.random().toString(36).slice(2, 8)}`, variable: '', operator: 'igual', value: '' }] })
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-2">Regra Lógica</p>
        {[
          { v: true, t: 'Regra corresponde a todas as condições (e)' },
          { v: false, t: 'Regra corresponde a qualquer condição (ou)' },
        ].map((o) => (
          <label key={String(o.v)} className="mb-1 flex items-center gap-2 text-xs text-ink-2">
            <input type="radio" checked={(d.matchAll !== false) === o.v} onChange={() => set({ matchAll: o.v })} />
            {o.t}
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-2">Condições</span>
        <button type="button" onClick={novo} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white" style={{ backgroundColor: 'var(--accent)' }}>
          <Plus size={12} /> Adicionar Condição
        </button>
      </div>

      {conds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-[11px] text-ink-4">
          Nenhuma condição adicionada. Clique em “Adicionar Condição” para começar.
        </p>
      ) : (
        <div className="space-y-2">
          {conds.map((k) => (
            <div key={k.id} className="flex items-start gap-2 rounded-lg border border-line bg-canvas p-2">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-3">
                <input className={inputClass} placeholder="{variavel}" value={k.variable} onChange={(e) => set({ conditions: conds.map((x) => (x.id === k.id ? { ...x, variable: e.target.value } : x)) })} />
                <Selecao className={inputClass} value={k.operator} onChange={(e) => set({ conditions: conds.map((x) => (x.id === k.id ? { ...x, operator: e.target.value as FlowCondition['operator'] } : x)) })}>
                  <option value="igual">é igual a</option>
                  <option value="diferente">é diferente de</option>
                  <option value="contem">contém</option>
                  <option value="nao_contem">não contém</option>
                  <option value="maior">é maior que</option>
                  <option value="menor">é menor que</option>
                  <option value="existe">existe</option>
                  <option value="vazio">está vazio</option>
                </Selecao>
                {k.operator !== 'existe' && k.operator !== 'vazio' && (
                  <input className={inputClass} placeholder="valor" value={k.value} onChange={(e) => set({ conditions: conds.map((x) => (x.id === k.id ? { ...x, value: e.target.value } : x)) })} />
                )}
              </div>
              <button type="button" onClick={() => set({ conditions: conds.filter((x) => x.id !== k.id) })} aria-label="Remover condição" className="mt-2 shrink-0 text-ink-4 hover:text-danger-ink">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditorCarrossel({
  clientId,
  d,
  set,
}: {
  clientId: string
  d: FlowBlockData
  set: (p: Partial<FlowBlockData>) => void
}) {
  const cards = d.cards ?? []
  const trocar = (id: string, patch: Partial<FlowCarouselCard>) => set({ cards: cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const novoId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`
  const [arrastando, setArrastando] = useState<number | null>(null)

  // A ordem dos cartões é a ordem em que o cliente desliza — arrastar aqui é a
  // única forma de reordenar sem reescrever o conteúdo de todos eles.
  function mover(de: number, para: number) {
    if (de === para) return
    const copia = [...cards]
    const [c] = copia.splice(de, 1)
    copia.splice(para, 0, c)
    set({ cards: copia })
  }

  return (
    <div className="space-y-3">
      <Expiracao d={d} set={set} />

      <CampoDeMensagem
        rotulo="Texto introdutório (acima dos cartões)"
        altura="min-h-[72px]"
        placeholder="Escolha uma opção abaixo"
        valor={d.text ?? ''}
        onChange={(text) => set({ text })}
      />

      <p className="text-xs font-semibold text-ink-2">Cartões do carrossel</p>

      {cards.map((card, i) => (
        <div
          key={card.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (arrastando !== null) mover(arrastando, i)
            setArrastando(null)
          }}
          className="rounded-xl border border-line bg-canvas p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <LayoutGrid size={13} style={{ color: 'var(--accent-ink)' }} /> Cartão {i + 1}
            </span>
            <span className="flex-1" />
            <span
              draggable
              onDragStart={() => setArrastando(i)}
              onDragEnd={() => setArrastando(null)}
              aria-label={`Arrastar cartão ${i + 1}`}
              className="cursor-grab text-ink-4 active:cursor-grabbing"
            >
              <GripVertical size={13} />
            </span>
            <button type="button" onClick={() => set({ cards: cards.filter((c) => c.id !== card.id) })} aria-label="Remover cartão" className="text-ink-4 hover:text-danger-ink">
              <Trash2 size={13} />
            </button>
          </div>

          <CampoDeMensagem
            rotulo="Texto do cartão (obrigatório)"
            altura="min-h-[64px]"
            placeholder="Digite a legenda…"
            valor={card.text}
            onChange={(text) => trocar(card.id, { text })}
          />

          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium text-ink-2">Imagem do cartão</span>
            <p className="mb-2 text-[11px] leading-relaxed text-ink-4">
              O carrossel do WhatsApp usa só imagem neste bloco. Envie o arquivo ou cole um endereço (variáveis
              permitidas).
            </p>
            <AreaDeImagem
              clientId={clientId}
              url={card.imageUrl}
              origem={card.source ?? 'arquivo'}
              onChange={(p) =>
                trocar(card.id, {
                  ...(p.imageUrl !== undefined ? { imageUrl: p.imageUrl } : {}),
                  ...(p.source ? { source: p.source } : {}),
                })
              }
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink-2">Botões (máx. 3 por cartão)</span>
            <button
              type="button"
              disabled={(card.buttons ?? []).length >= 3}
              onClick={() => trocar(card.id, { buttons: [...(card.buttons ?? []), { id: novoId('bt'), kind: 'resposta', label: '' }] })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Plus size={11} /> Adicionar botão
            </button>
          </div>

          <div className="mt-1.5 space-y-1.5">
            {(card.buttons ?? []).map((b) => (
              <div key={b.id} className="flex items-center gap-1.5">
                <Selecao className={`${inputClass} w-28 shrink-0 text-xs`} value={b.kind} onChange={(e) => trocar(card.id, { buttons: card.buttons.map((x) => (x.id === b.id ? { ...x, kind: e.target.value as 'resposta' | 'url' | 'telefone' } : x)) })}>
                  <option value="resposta">Resposta</option>
                  <option value="url">URL</option>
                  <option value="telefone">Telefone</option>
                </Selecao>
                <input className={inputClass} placeholder="Título do botão" value={b.label} onChange={(e) => trocar(card.id, { buttons: card.buttons.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)) })} />
                {b.kind !== 'resposta' && (
                  <input className={inputClass} placeholder={b.kind === 'url' ? 'https://…' : '5567…'} value={b.value ?? ''} onChange={(e) => trocar(card.id, { buttons: card.buttons.map((x) => (x.id === b.id ? { ...x, value: e.target.value } : x)) })} />
                )}
                <button type="button" onClick={() => trocar(card.id, { buttons: card.buttons.filter((x) => x.id !== b.id) })} aria-label="Remover botão" className="shrink-0 text-ink-4 hover:text-danger-ink">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => set({ cards: [...cards, { id: novoId('cd'), text: '', imageUrl: '', source: 'arquivo', buttons: [] }] })}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-line py-5 text-xs text-ink-3 transition-colors hover:border-[var(--accent)] hover:bg-surface-2 hover:text-ink"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: 'color-mix(in oklab, var(--accent) 20%, transparent)', color: 'var(--accent-ink)' }}
        >
          <LayoutGrid size={15} />
        </span>
        Adicionar cartão
      </button>
    </div>
  )
}

const MODELOS_IA = {
  gpt: [
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
}

function EditorIa({ d, set, variaveisGlobais }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void; variaveisGlobais: { id: string; name: string }[] }) {
  const conds = d.aiConditions ?? []
  const provedor = d.aiProvider ?? 'gpt'
  return (
    <div className="space-y-3">
      <CrmField label="Provedor de IA">
        <Selecao className={inputClass} value={provedor} onChange={(e) => set({ aiProvider: e.target.value as 'gpt' | 'gemini', aiModel: MODELOS_IA[e.target.value as 'gpt' | 'gemini'][0].id })}>
          <option value="gpt">GPT</option>
          <option value="gemini">Gemini</option>
        </Selecao>
      </CrmField>

      <CrmField label="Autenticação">
        <Selecao className={inputClass} value={d.aiAuth ?? 'global'} onChange={(e) => set({ aiAuth: e.target.value as 'manual' | 'global' })}>
          <option value="global">Variável global da conta</option>
          <option value="manual">Chave manual neste bloco</option>
        </Selecao>
      </CrmField>

      {d.aiAuth === 'manual' ? (
        <CrmField label="Chave da API" hint="Fica gravada no desenho do fluxo. Para trocar a chave em todos os blocos de uma vez, prefira a variável global.">
          <input type="password" className={inputClass} placeholder="sk-…" value={d.aiApiKey ?? ''} onChange={(e) => set({ aiApiKey: e.target.value })} />
        </CrmField>
      ) : (
        <CrmField label="Variável global com a chave" hint="Cadastre em Configurações → Variáveis Globais. O nome cadastrado deve começar com g_.">
          <Selecao className={inputClass} value={d.aiApiKey ?? ''} onChange={(e) => set({ aiApiKey: e.target.value })} placeholder={variaveisGlobais.length ? 'Escolha a variável…' : 'Nenhuma variável global cadastrada'}>
            {variaveisGlobais.map((v) => (
              <option key={v.id} value={`{${v.name}}`}>
                {v.name}
              </option>
            ))}
          </Selecao>
        </CrmField>
      )}

      <CrmField label="Modelo" hint="Se o modelo selecionado não estiver disponível na sua API key, a execução falhará. Verifique o acesso antes de usar.">
        <Selecao className={inputClass} value={d.aiModel ?? MODELOS_IA[provedor][0].id} onChange={(e) => set({ aiModel: e.target.value })}>
          {MODELOS_IA[provedor].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Selecao>
      </CrmField>

      <CrmField label="Mensagem enviada ao modelo" hint="Use variáveis como {last_user_message} ou {campo}.">
        <textarea className={`${inputClass} min-h-[72px] resize-y`} value={d.aiUserMessage ?? ''} onChange={(e) => set({ aiUserMessage: e.target.value })} />
      </CrmField>

      <CrmField label="Campo para salvar a resposta da IA:" hint="Se não preenchido, será salvo em ai.response. A resposta sempre será salva também em ai.response.">
        <input className={inputClass} value={d.aiSaveTo ?? ''} onChange={(e) => set({ aiSaveTo: e.target.value })} />
      </CrmField>

      <CrmToggle checked={d.aiAutoReply !== false} onChange={(v) => set({ aiAutoReply: v })} label="Enviar resposta automaticamente" hint="Envia a resposta da IA como mensagem para o lead automaticamente." />

      <CrmField label="Prompt de IA / Comportamento">
        <textarea
          className={`${inputClass} min-h-[84px] resize-y`}
          placeholder={'Você é um assistente útil.\nSempre responda em português do Brasil.\nSeja claro e objetivo.'}
          value={d.aiPrompt ?? ''}
          onChange={(e) => set({ aiPrompt: e.target.value })}
        />
      </CrmField>

      <CrmToggle checked={!!d.aiUnderstandAudio} onChange={(v) => set({ aiUnderstandAudio: v })} label="Entender áudio" hint="Permite processar mensagens de áudio" />
      <CrmToggle checked={!!d.aiUnderstandImage} onChange={(v) => set({ aiUnderstandImage: v })} label="Entender imagem" hint="Permite processar imagens" />
      <CrmToggle checked={!!d.aiUnderstandPdf} onChange={(v) => set({ aiUnderstandPdf: v })} label="Entender PDF" hint="Permite processar documentos PDF" />
      <CrmToggle checked={!!d.aiReadReceipt} onChange={(v) => set({ aiReadReceipt: v })} label="Identificar comprovante" hint="Identifica comprovante de pagamento em imagem/PDF e extrai dados no lead. Vira uma saída do bloco (sempre no topo)." />
      <p className="text-[11px] italic text-ink-4">Essas opções podem consumir mais tokens.</p>

      <Bloco titulo="Condicionais Inteligentes (até 10)">
        <p className="mb-2 text-[11px] text-ink-4">A IA classifica a resposta do cliente e segue a saída correspondente. Ordem = prioridade.</p>
        {conds.map((k) => (
          <div key={k.id} className="mb-1.5 flex items-center gap-1.5">
            <input className={inputClass} placeholder="Ex: cliente quer comprar" value={k.label} onChange={(e) => set({ aiConditions: conds.map((x) => (x.id === k.id ? { ...x, label: e.target.value } : x)) })} />
            <button type="button" onClick={() => set({ aiConditions: conds.filter((x) => x.id !== k.id) })} aria-label="Remover condicional" className="shrink-0 text-ink-4 hover:text-danger-ink">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={conds.length >= 10}
          onClick={() => set({ aiConditions: [...conds, { id: `ac_${Math.random().toString(36).slice(2, 8)}`, label: '' }] })}
          className={`${ghostButtonClass} w-full text-xs disabled:opacity-40`}
        >
          <Plus size={12} /> Adicionar condicional
        </button>
      </Bloco>

      <CrmToggle checked={!!d.aiKeepContext} onChange={(v) => set({ aiKeepContext: v })} label="Manter contexto da conversa (últimas 5 interações)" hint="Mantém histórico das últimas interações para melhor contexto (máximo de 20 interações)." />
      {d.aiKeepContext && (
        <CrmField label="Quantas interações">
          <input type="number" min={1} max={20} className={inputClass} value={d.aiContextTurns ?? 5} onChange={(e) => set({ aiContextTurns: Math.min(20, Number(e.target.value)) })} />
        </CrmField>
      )}

      <Explicacao texto="Este bloco integra com APIs de IA (GPT ou Gemini) para gerar respostas inteligentes. A resposta da IA é salva em uma variável configurável e pode ser usada em outros blocos do fluxo. Em caso de erro, o motivo é salvo em uma variável de falha para tratamento." />
    </div>
  )
}

function EditorIntegracao({ d, set }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void }) {
  const [aba, setAba] = useState<'header' | 'body' | 'mapa'>('header')
  const [testando, setTestando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const mapa = d.responseMap ?? {}

  async function testar() {
    setTestando(true)
    setResultado(null)
    try {
      const res = await fetch(d.url ?? '', {
        method: d.httpMethod ?? 'GET',
        headers: JSON.parse(d.headers || '{}'),
        ...(d.httpMethod && d.httpMethod !== 'GET' ? { body: d.body } : {}),
      })
      const texto = await res.text()
      setResultado(`${res.status} ${res.statusText}\n${texto.slice(0, 600)}`)
    } catch (e) {
      // Erro de rede no navegador quase sempre é CORS — dizer isso poupa
      // meia hora procurando defeito numa URL que está certa.
      setResultado(
        `Falhou: ${(e as Error).message}\n\nSe a URL está certa, provavelmente é CORS: este teste sai do navegador, mas a execução real sai do servidor e não passa por essa restrição.`,
      )
    } finally {
      setTestando(false)
    }
  }

  return (
    <div className="space-y-3">
      <CrmField label="Tipo de requisição POST/PUT/GET *">
        <Selecao className={inputClass} value={d.httpMethod ?? 'GET'} onChange={(e) => set({ httpMethod: e.target.value as FlowBlockData['httpMethod'] })}>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Selecao>
      </CrmField>

      <CrmField label="Url da requisição *" hint="Use variáveis como {nome}, {phone_number}, {email} para substituir valores dinamicamente">
        <input className={inputClass} placeholder="https://teste.exemplo/1234556/{id}" value={d.url ?? ''} onChange={(e) => set({ url: e.target.value })} />
      </CrmField>

      <div className="flex items-center justify-between border-b border-line-soft">
        <div className="flex gap-1">
          {(
            [
              ['header', 'Header da requisição'],
              ['body', 'Corpo da requisição'],
              ['mapa', 'Mapear resposta'],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={`border-b-2 px-2.5 py-2 text-xs font-medium transition-colors ${aba === k ? 'border-[var(--accent)] text-ink' : 'border-transparent text-ink-4 hover:text-ink-2'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" onClick={testar} disabled={!d.url || testando} className="mb-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40" style={{ backgroundColor: 'var(--accent)' }}>
          {testando ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Testar requisição
        </button>
      </div>

      {aba === 'header' && (
        <CrmField label="Dados do header" hint='Formato JSON. Exemplo: {"Content-Type": "application/json"}'>
          <textarea className={`${inputClass} min-h-[140px] resize-y font-mono text-xs`} value={d.headers ?? ''} onChange={(e) => set({ headers: e.target.value })} />
        </CrmField>
      )}
      {aba === 'body' && (
        <CrmField label="Corpo da requisição" hint="JSON. Aceita variáveis do fluxo entre chaves.">
          <textarea className={`${inputClass} min-h-[140px] resize-y font-mono text-xs`} value={d.body ?? ''} onChange={(e) => set({ body: e.target.value })} />
        </CrmField>
      )}
      {aba === 'mapa' && (
        <div>
          <p className="mb-2 text-[11px] text-ink-4">Guarda pedaços da resposta em variáveis do fluxo. À esquerda o nome da variável; à direita o caminho no JSON (ex.: dados.cliente.nome).</p>
          {Object.entries(mapa).map(([k, v]) => (
            <div key={k} className="mb-1.5 flex items-center gap-1.5">
              <input
                className={inputClass}
                aria-label="Nome da variável"
                value={k}
                onChange={(e) => {
                  const novo: Record<string, string> = {}
                  for (const [kk, vv] of Object.entries(mapa)) novo[kk === k ? e.target.value : kk] = vv
                  set({ responseMap: novo })
                }}
              />
              <input className={inputClass} aria-label="Caminho no JSON" value={v} onChange={(e) => set({ responseMap: { ...mapa, [k]: e.target.value } })} />
              <button
                type="button"
                onClick={() => {
                  const novo = { ...mapa }
                  delete novo[k]
                  set({ responseMap: novo })
                }}
                aria-label="Remover mapeamento"
                className="shrink-0 text-ink-4 hover:text-danger-ink"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set({ responseMap: { ...mapa, [`campo_${Object.keys(mapa).length + 1}`]: '' } })} className={`${ghostButtonClass} w-full text-xs`}>
            <Plus size={12} /> Mapear campo
          </button>
        </div>
      )}

      {resultado && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-2.5 text-[11px] text-ink-3">{resultado}</pre>}
    </div>
  )
}

function EditorKieAi({ d, set }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void }) {
  const tipos = [
    { k: 'audio', t: 'Áudio', s: 'Gerar voz com ElevenLabs', v: 'kie.ai.result_audio' },
    { k: 'imagem', t: 'Imagem', s: 'Gerar imagens', v: 'kie.ai.result_image' },
    { k: 'musica', t: 'Música', s: 'Música com Suno a partir de prompts', v: 'kie.ai.result_music' },
    { k: 'video', t: 'Vídeo', s: 'Veo 3.1. Texto para vídeo com quadros opcionais ou transição entre imagens.', v: 'kie.ai.result_video' },
  ] as const

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-4">Bloco nativo para geração de áudio, imagem e vídeo (Veo).</p>

      <CrmField label="Chave API do Kie.ai" hint="Aceita a chave direta ou uma variável global {minha_key_kie}.">
        <input className={inputClass} placeholder="{minha_key_kie}" value={d.kieApiKey ?? ''} onChange={(e) => set({ kieApiKey: e.target.value })} />
      </CrmField>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink-2">O que gerar?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tipos.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => set({ kieKind: t.k, kieSaveTo: t.v })}
              className={`rounded-xl border p-2.5 text-left transition-colors ${
                (d.kieKind ?? 'audio') === t.k ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]' : 'border-line hover:bg-surface-2'
              }`}
            >
              <span className="block text-xs font-semibold text-ink">{t.t}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-ink-4">{t.s}</span>
            </button>
          ))}
        </div>
      </div>

      <CrmField label="Modelo">
        <Selecao className={inputClass} value={d.kieModel ?? 'eleven_multilingual_v2'} onChange={(e) => set({ kieModel: e.target.value })}>
          <option value="eleven_multilingual_v2">ElevenLabs Multilíngue (Mais natural, ótimo em português)</option>
          <option value="eleven_turbo_v2_5">ElevenLabs Turbo (mais rápido)</option>
        </Selecao>
      </CrmField>

      <CrmField label="Texto" hint="Aceita variáveis do fluxo.">
        <textarea className={`${inputClass} min-h-[72px] resize-y`} placeholder="Olá {nome}, bem-vindo!" value={d.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
      </CrmField>

      {(d.kieKind ?? 'audio') === 'audio' && (
        <CrmField label="Voz">
          <Selecao className={inputClass} value={d.kieVoice ?? 'rachel'} onChange={(e) => set({ kieVoice: e.target.value })}>
            <option value="rachel">Rachel (feminina calma)</option>
            <option value="antoni">Antoni (masculina firme)</option>
            <option value="bella">Bella (feminina jovem)</option>
          </Selecao>
        </CrmField>
      )}

      <CrmField
        label="Nome da variável"
        hint="A URL do resultado fica aqui. Variáveis sempre geradas após execução: {kie.ai.status} e {kie.ai.erro}."
      >
        <input className={inputClass} value={d.kieSaveTo ?? 'kie.ai.result_audio'} onChange={(e) => set({ kieSaveTo: e.target.value })} />
      </CrmField>
    </div>
  )
}

function EditorVenda({ d, set, produtos }: { d: FlowBlockData; set: (p: Partial<FlowBlockData>) => void; produtos: { id: string; name: string }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-ink-4">
        Escolha um produto e defina de onde vêm o valor e a moeda (variáveis como {'{comprovante.valor}'}). Valores fora
        do intervalo do produto usam o preço fallback.
      </p>

      <Bloco titulo="Produto">
        <Selecao className={inputClass} value={d.productId ?? ''} onChange={(e) => set({ productId: e.target.value || null })} placeholder="Selecione…">
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Selecao>
      </Bloco>

      <Bloco titulo="Cliente, valor e moeda">
        <p className="mb-2 text-[11px] text-ink-4">Mesmas variáveis dos outros blocos (comprovante, IA, globais, etc.).</p>
        <CrmField label="Campo de nome do cliente (template)" hint="Padrão: {comprovante.nome_pagador}. Se o valor resolvido ficar vazio, usa o nome completo do contato.">
          <textarea className={`${inputClass} min-h-[48px] resize-y`} value={d.saleCustomerTemplate ?? ''} onChange={(e) => set({ saleCustomerTemplate: e.target.value })} />
        </CrmField>
        <CrmField label="Campo de valor (template)">
          <textarea className={`${inputClass} min-h-[48px] resize-y`} value={d.saleAmountTemplate ?? ''} onChange={(e) => set({ saleAmountTemplate: e.target.value })} />
        </CrmField>
        <CrmField label="Campo de moeda (template)">
          <textarea className={`${inputClass} min-h-[48px] resize-y`} value={d.saleCurrencyTemplate ?? ''} onChange={(e) => set({ saleCurrencyTemplate: e.target.value })} />
        </CrmField>
      </Bloco>

      <Bloco titulo="Notificação no app">
        <p className="mb-2 text-[11px] text-ink-4">Personalize o título e o subtítulo do push. Deixe em branco para usar os textos padrão.</p>
        <CrmField label="Título da notificação (opcional)" hint="Ex.: Nova venda de {produto.nome}!">
          <input className={inputClass} value={d.pushTitle ?? ''} onChange={(e) => set({ pushTitle: e.target.value })} />
        </CrmField>
        <CrmField label="Subtítulo da notificação (opcional)" hint="Ex.: {venda.cliente} pagou {venda.valor} em {produto.nome}.">
          <input className={inputClass} value={d.pushSubtitle ?? ''} onChange={(e) => set({ pushSubtitle: e.target.value })} />
        </CrmField>
      </Bloco>

      <Bloco titulo="Emissor de notas">
        <p className="mb-2 text-[11px] text-ink-4">Com um provedor de emissão com token válido, o sistema dispara a emissão assim que registrar a venda.</p>
        <Selecao className={inputClass} value={d.invoiceProviderId ?? ''} onChange={(e) => set({ invoiceProviderId: e.target.value || null })}>
          <option value="">Não emitir nota automaticamente</option>
        </Selecao>
      </Bloco>

      <Bloco titulo="Rastreamento UTMify">
        <p className="mb-2 text-[11px] text-ink-4">Envia a venda automaticamente para a UTMify.</p>
        <Selecao className={inputClass} value={d.utmifyId ?? ''} onChange={(e) => set({ utmifyId: e.target.value || null })}>
          <option value="">Não enviar para UTMify</option>
        </Selecao>
      </Bloco>
    </div>
  )
}

import { z } from 'zod'

// Igual à ponte interna: falta credencial, não sobe. Uma ponte no ar sem
// provedor atrás responderia erro em toda chamada, e a tela de Conexões diria
// "configurado, mas com erro" — pior do que dizer que não está configurado.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Porta desta ponte. É o valor que vai em WHATSAPP_BRIDGE_URL no backend.
  WHATSAPP_BRIDGE_PORT: z.coerce.number().int().positive().default(4200),

  // Segredo compartilhado com o backend, nos dois sentidos: o backend manda
  // em "Authorization: Bearer" quando chama a ponte, e a ponte manda o mesmo
  // quando entrega uma mensagem recebida em /public/crm/whatsapp/inbound.
  WHATSAPP_BRIDGE_TOKEN: z
    .string()
    .min(16, 'defina WHATSAPP_BRIDGE_TOKEN com um valor aleatório longo (o backend usa o mesmo)'),

  // Backend do CRM, pra onde a mensagem recebida é encaminhada.
  BACKEND_URL: z.string().url().default('http://127.0.0.1:4000'),

  /**
   * Menu como botão/lista interativa. LIGADO.
   *
   * Ficou desligado por meses, e não era preferência: era medida. Pelo provedor antigo só
   * o texto chegava ao aparelho — botão e lista sumiam, com o provedor antigo respondendo
   * 201 com id de mensagem nos três casos, o que sugeria que o canal não
   * oficial descartava interativo. Só que a conclusão seria maior que a medida:
   * não entregava era a implementação do provedor antigo.
   *
   * Pela uazapi chega. Medido do mesmo jeito, com instância pareada por QR e o
   * mesmo aparelho de destino: texto, botões e botão de copiar, os três
   * tocáveis.
   *
   * Ligado, o menu usa botão até 3 opções e lista acima disso. Desligar volta
   * ao texto numerado, que o `entender.ts` lê aceitando número, nome, pedaço do
   * nome e erro de digitação — continua sendo a rede de segurança.
   */
  WHATSAPP_MENU_INTERATIVO: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /**
   * Menu como ENQUETE na conexão por QR Code.
   *
   * É a única forma tocável que atravessa esse canal. Botão e lista são
   * recursos de conta comercial e a Meta descarta os dois vindos daqui;
   * enquete é recurso de usuário comum — qualquer pessoa manda uma do celular
   * —, então não há o que descartar. No mesmo teste lado a lado, foi a única
   * forma tocável entregue ao aparelho.
   *
   * Não é o botão da conta oficial: desenha com bolinhas de seleção e o cliente
   * pode trocar o voto.
   *
   * HOJE VEM DESLIGADA, e a decisão foi de quem usa: a enquete parece uma
   * votação, não um atendimento — o cliente vê "1 voto" ao lado da opção que
   * escolheu, e pode trocar o voto depois de o fluxo já ter seguido. O menu de
   * texto numerado ficou no lugar dela, com o `entender.ts` aceitando número,
   * nome, pedaço do nome e erro de digitação; a diferença de esforço pro
   * cliente virou um caractere.
   *
   * `true` religa a enquete — ela continua sendo a única forma TOCÁVEL que
   * atravessa o QR Code, e o código dela está inteiro e conferido.
   *
   * Ignorado quando a Cloud API está configurada — lá o botão de verdade chega.
   */
  WHATSAPP_MENU_ENQUETE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Teto de espera do fluxo, em MINUTOS, pros blocos que não definem prazo.
   *
   * Antes disto, bloco sem prazo esperava PRA SEMPRE. Uma execução parada assim
   * engole toda resposta seguinte do cliente dentro de um fluxo que não anda
   * mais, e impede qualquer gatilho novo de começar naquela conversa — quem
   * escrevesse "oi" no dia seguinte não acionaria nada. As mensagens continuam
   * chegando na caixa de entrada; o que trava é a automação.
   *
   * Vencido o prazo, quem tem saída de 'timeout' desenhada sai por ela; quem
   * não tem, encerra. Prazo posto no bloco pelo desenhista manda mais que isto.
   *
   * ERA 30 MINUTOS, E ERA CURTO DEMAIS. A tela do menu diz, escrito, "Se 0, o
   * padrão é 2 dias" — e o motor encerrava em meia hora. Trinta minutos depois
   * de receber o menu, a pessoa tocava no botão e NÃO ACONTECIA NADA: o botão
   * continua tocável no WhatsApp pra sempre, mas do nosso lado já não havia
   * execução esperando. Ninguém no meio disso vê erro nenhum.
   *
   * Meia hora não é o ritmo de quem atende WhatsApp. As pessoas respondem no
   * intervalo do almoço, à noite, no dia seguinte. Dois dias é o que a tela
   * sempre prometeu, e agora é o que acontece.
   *
   * `0` volta ao comportamento antigo de esperar sem prazo.
   */
  WHATSAPP_FLUXO_ESPERA_MIN: z.coerce.number().int().min(0).max(10_080).default(2880),

  // ── uazapi: a conexão não oficial ────────────────────────────────────────
  //
  // Substituiu o provedor antigo porque o provedor antigo não entrega botão. Medido dos dois lados,
  // com número pareado por QR e mesmo aparelho de destino: pelo provedor antigo só o
  // texto chegava; pela uazapi chegaram texto, botões e botão de copiar,
  // tocáveis.

  /**
   * O servidor da assinatura. Cada conta da uazapi tem o seu.
   *
   * É só o PADRÃO pra criar instância nova — cada conexão guarda o servidor
   * dela em `crm_connections.uazapi_server`, porque uma conexão criada hoje
   * precisa continuar funcionando se o sistema mudar de servidor amanhã.
   */
  UAZAPI_SERVER: z.string().url().optional(),

  /**
   * O token que CRIA E APAGA instâncias na conta paga.
   *
   * Não é o token de uma instância — é a chave da conta inteira. Ele fica só
   * aqui, no ambiente da ponte: nunca no banco, nunca numa resposta de API,
   * nunca no navegador. O que o front recebe é o QR Code, e mais nada.
   */
  UAZAPI_ADMIN_TOKEN: z.string().optional(),

  /**
   * Onde a uazapi encontra esta ponte, vista da internet.
   *
   * O webhook é configurado NA INSTÂNCIA, do lado deles: a uazapi precisa de um
   * endereço público pra entregar o que chega. `127.0.0.1` não serve, e sem
   * isto o número pareia, envia, e NADA volta — a conversa vira um monólogo.
   *
   * Em produção é o domínio do VPS. Em desenvolvimento, um túnel.
   */
  WHATSAPP_BRIDGE_PUBLIC_URL: z.string().url().optional(),

  // ── Cloud API oficial da Meta ────────────────────────────────────────────
  //
  // Preencher os dois LIGA a Cloud API e DESLIGA o provedor antigo para o envio. Não é
  // uma escolha por mensagem: um número migrado pra Cloud API sai do WhatsApp
  // comum — não abre no celular, não pareia por QR, e o provedor antigo não o alcança
  // mais. É troca de canal, não adição.
  //
  // Em compensação, é o único canal em que botão exposto é recurso suportado.

  /** Token permanente do usuário do sistema, no painel da Meta. NÃO é o temporário de 24h. */
  WHATSAPP_CLOUD_TOKEN: z.string().min(20).optional(),

  /** O ID do número no painel — um número comprido. NÃO é o telefone. */
  WHATSAPP_CLOUD_PHONE_ID: z.string().min(5).optional(),

  /** Versão da Graph API. Fixar evita quebrar quando a Meta lança a próxima. */
  WHATSAPP_CLOUD_VERSAO: z.string().default('v21.0'),

  /**
   * O segredo que a Meta devolve na verificação do webhook. Ela chama a URL
   * uma vez com GET e `sistema.verify_token`; sem bater, ela não entrega mensagem
   * nenhuma depois.
   */
  WHATSAPP_CLOUD_VERIFY_TOKEN: z.string().optional(),

  /**
   * O segredo do app, em Configurações do app → Básico → Chave secreta.
   *
   * É com ele que a Meta ASSINA o corpo de cada webhook, e conferir a
   * assinatura é a única coisa que separa "mensagem do cliente" de "qualquer um
   * que descobriu a URL" — a rota é pública por obrigação, porque a Meta não
   * manda token nem cabeçalho que a gente escolha.
   *
   * Sem ele a ponte ACEITA os webhooks mas se recusa a agir sobre eles: dá pra
   * observar o que a Meta manda sem abrir a porta pra injetarem conversa falsa
   * no CRM de um cliente.
   */
  WHATSAPP_CLOUD_APP_SECRET: z.string().min(16).optional(),

  // O disparo em massa lê os destinatários e o ritmo direto do banco: é uma
  // fila que precisa sobreviver a um restart, então não pode viver na memória
  // de quem chamou.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
})

export type WhatsappEnv = z.infer<typeof EnvSchema>

export function loadWhatsappEnv(): WhatsappEnv {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Ponte de WhatsApp mal configurada — confira o .env na raiz do projeto:')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

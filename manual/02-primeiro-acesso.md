# 02. Primeiro acesso

O CRM entrou. Antes de conectar o WhatsApp, vale entender o que é cada parte,
para você saber onde procurar depois.

---

## O menu

À esquerda ficam as telas. Elas se dividem em dois grupos.

### O atendimento, que é o dia a dia

| Tela | Para quê |
|---|---|
| **Início** | o resumo: conversas abertas, o que entrou hoje, o que está parado |
| **Chats ao vivo** | a caixa de entrada. É aqui que você passa o dia |
| **Kanban** | as conversas em colunas, arrastadas com o mouse |
| **Fluxos** | o robô: o que o sistema responde sozinho |
| **Contatos** | quem já falou com você, com campos que você inventa |
| **Disparos em massa** | mandar a mesma coisa para muita gente, com intervalo |
| **Webhooks de entrada** | outro sistema avisando o CRM que algo aconteceu |
| **Conexões** | o número de WhatsApp, e se ele está de pé |
| **Equipe** | quem mais atende, e o que cada um pode |
| **Configurações** | horários, respostas rápidas, campos, produtos, variáveis |

### O comercial, no grupo "Mais"

| Tela | Para quê |
|---|---|
| **Funil** | as etapas até o fechamento, e quanto tem parado em cada uma |
| **Negócios** | cada oportunidade, com valor e etapa |
| **Leads** | quem chegou e ainda não virou negócio |
| **Vendas** | o que fechou |
| **Tarefas** | o que alguém precisa fazer, com prazo |
| **Anotações** | o que foi combinado, preso ao contato |
| **Ligações** | registro de chamadas |
| **Notificações** | o que o sistema quer te contar |
| **Agente** | as instruções do atendente automático |

Não tente usar tudo na primeira semana. **Chats, Fluxos e Conexões** já são um
CRM funcionando. O resto entra quando fizer falta.

---

## O sinal da automação

No topo da tela de Fluxos existe um sinal:

- **Ativa**, verde e pulsando: o CRM está recebendo mensagem do WhatsApp agora.
- **Offline**, vermelho e parado: não está.

Ele se atualiza sozinho a cada 20 segundos, inclusive com a aba em segundo plano.

**Esse sinal é a peça mais importante da tela**, e vale entender por quê.

A falha mais cara de um sistema de atendimento **não dá erro**. O número
continua pareado, a tela continua dizendo "conectada", o envio continua saindo,
e o que o cliente responde é entregue num endereço que não existe mais. Do ponto
de vista de cada peça, deu tudo certo. Ninguém vê nada, até alguém perguntar por
que o cliente não respondeu.

O sinal existe para essa falha ter cor. Se ele estiver vermelho, leia
[10. Quando algo quebra](10-quando-algo-quebra.md).

---

## O primeiro ajuste

Antes de conectar o número, dois minutos em **Configurações** poupam retrabalho.

### Horário de atendimento

Diga em que dias e horas você atende. Fora disso, o robô não responde como se
fosse gente: ele avisa que está fora do horário.

Sem isso, o fluxo dispara às 3 da manhã e a pessoa espera uma resposta que só vem
às 9.

### Respostas rápidas

As frases que você repete o dia inteiro. No chat, você chama por um atalho em vez
de digitar de novo.

Comece com três: como você cumprimenta, como você pede o dado que sempre falta,
e como você se despede.

### Campos de contato

O CRM já guarda nome e telefone. O que mais importa no seu negócio, você cria
aqui: CPF, placa do carro, número do pedido, o que for.

Vale a pena criar agora, porque campo criado depois vem vazio nos contatos que já
existem.

---

## A sua marca

O nome e o símbolo que aparecem no CRM saem de dois lugares:

- `src/config/brand.ts` — o nome, as iniciais e a cor de destaque;
- `public/marca/simbolo.svg` — o símbolo. Troque o arquivo mantendo o nome.

Depois de mexer, salve e o navegador recarrega sozinho.

---

Próxima: [03. Conectar o WhatsApp](03-conectar-o-whatsapp.md).

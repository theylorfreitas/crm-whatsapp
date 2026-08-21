# 05. Fluxos

O fluxo é o robô: o que o CRM responde sozinho. Ele é desenhado com o mouse, num
quadro onde cada caixa é um passo e cada linha é o caminho entre eles.

---

## O quadro

Abra **Fluxos** e crie um. Você cai num quadro com um bloco **Início**.

- **Arraste o fundo** para andar pelo quadro. Ele é livre, sem trava.
- **Arraste um bloco** para mudar ele de lugar, inclusive para cima e para a
  esquerda do Início.
- **Puxe de uma bolinha** de um bloco até outro para ligar os dois.
- O **mapinha** no canto mostra onde você está quando o desenho cresce.
- O botão de **enquadrar** traz tudo de volta para a tela quando você se perde.

O CRM salva sozinho pouco depois de você parar de mexer. Não existe botão de
salvar, e é de propósito: fluxo perdido por falta de salvar é o erro mais burro
que um editor pode ter.

---

## Os blocos que você vai usar sempre

### Início

Onde a conversa entra. Todo fluxo tem um, e só um.

### Mensagem

Manda texto, imagem, vídeo, áudio ou documento. Vários itens no mesmo bloco saem
em sequência, com pausa entre eles.

A pausa não é enfeite: cinco mensagens instantâneas parecem despejo de robô. Com
pausa, o cliente vê "digitando..." (ou "gravando áudio...", se o próximo item for
áudio) e a conversa tem ritmo de conversa.

### Menu

A pergunta com **botões**. É o bloco mais útil do CRM, e o motivo de usar a
uazapi em vez de mandar texto puro.

Cada opção vira uma saída no bloco, e você liga cada saída num caminho diferente.

Três coisas para saber:

1. **O texto do botão é o que aparece como resposta** do cliente na conversa.
   Escreva pensando nisso: `Quero um orçamento` lê melhor no histórico que
   `Opção 2`.
2. O WhatsApp limita o tamanho do texto do botão. Seja curto.
3. Existe uma saída **"não entendi"**, para quando a pessoa escreve em vez de
   tocar. Ligue ela em algum lugar. Um menu sem essa saída deixa a pessoa presa.

### Aguarda Resposta

Para o fluxo até a pessoa escrever. O que ela escrever pode ser guardado numa
variável, para você usar depois.

### Condicional

Segue por um caminho ou outro, conforme uma variável. `se a cidade for São
Paulo`, `se o valor for maior que 500`.

### Intervalo Inteligente

Espera antes do próximo passo.

> **Cuidado com a janela de 24 horas.** Se o intervalo levar o fluxo para fora de
> 24 horas desde a última mensagem do cliente, o WhatsApp recusa o envio. Um
> "volto em 3 dias" simplesmente não chega.

### Etiquetas, Kanban, Atribuir, Departamento

Agem sobre a conversa em vez de mandar mensagem: põem etiqueta, movem de coluna,
entregam para um atendente ou para um setor.

São eles que fazem o fluxo alimentar o resto do CRM em vez de ser só um
respondedor.

### Controlador de Chat

Abre, fecha, pausa o robô ou devolve para o humano.

---

## Os outros blocos

Você não precisa deles no começo, mas eles existem: **Carrossel** (cartões com
imagem e botão), **Distribuidor** (revezamento entre atendentes), **Conexão de
Fluxo** (chama outro fluxo), **Manipulador** (grava, soma ou limpa variável),
**Notificação**, **Bloco de IA**, **Integração**, **Pixel**, **Botão PIX**,
**Pagamento**, **Venda aprovada** e **Template WhatsApp**.

---

## Variáveis

Variável é o que o fluxo lembra sobre a conversa. Ela é escrita por um
**Aguarda Resposta** ou por um **Manipulador**, e é lida em qualquer texto.

Quando o cliente toca num botão do menu, **o que é guardado é o texto do botão**,
não um código interno. Assim `Você escolheu {{opcao}}` sai como
`Você escolheu Quero um orçamento`.

Variáveis que valem para todos os fluxos ficam em **Configurações → Variáveis
globais**: o nome da empresa, o horário, o endereço. Escreva num lugar e mude num
lugar.

---

## Monte o seu primeiro fluxo

Um atendimento inicial completo, em cinco blocos:

1. **Início**
2. **Mensagem** — "Oi! Aqui é a {{empresa}}. Em que posso ajudar?"
3. **Menu** — três botões: `Quero um orçamento`, `Já sou cliente`,
   `Falar com atendente`
4. Da primeira saída: **Aguarda Resposta** — "Me conta o que você precisa" →
   guarda em `pedido`
5. Da mesma linha: **Etiquetas** (`orçamento`) → **Atribuir atendimento** →
   **Mensagem** "Já chamei alguém, é rápido"

Ligue as outras duas saídas do menu e a saída "não entendi" em algo, nem que seja
numa mensagem pedindo para escrever.

---

## Teste antes de soltar

Do celular, mande a palavra que aciona o fluxo (veja a página
[06](06-disparos-e-palavras-chave.md)) e **percorra o caminho inteiro**. Toque em
cada botão. Escreva besteira no meio para ver o "não entendi" funcionar.

Um fluxo testado só pelo caminho feliz quebra no primeiro cliente que faz
diferente, e o primeiro cliente sempre faz diferente.

---

Próxima: [06. Disparos e palavras-chave](06-disparos-e-palavras-chave.md).

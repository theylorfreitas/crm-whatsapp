# 04. Atender

O dia a dia da caixa de entrada.

---

## Chats ao vivo

A tela tem três partes: a **lista** de conversas à esquerda, a **conversa** no
meio, e o **painel do contato** à direita.

### A lista

Ela ordena por atividade: quem escreveu por último aparece em cima. Os filtros no
topo separam por situação, por etiqueta, por atendente e por conexão.

O contador de não lidas é por conversa, e some quando você abre.

### A conversa

As bolhas vêm com a hora e o estado do envio. As mensagens que a pessoa mandou
ficam de um lado, as suas do outro. Mensagem enviada pelo celular, fora do CRM,
também entra: ela aparece do seu lado, marcada como escrita por fora.

Quando o cliente toca num botão do menu, **o texto do botão aparece como
resposta dele**, exatamente como está escrito no botão. Não é detalhe: um chat
onde o toque no botão aparece em branco deixa quem lê sem saber o que a pessoa
escolheu, e o histórico da conversa fica sem sentido.

### O painel do contato

Nome, telefone, etiquetas, campos que você criou, anotações e o negócio ligado a
essa pessoa. Tudo editável ali mesmo.

---

## Mandar mensagem

### Texto

Escreva e mande. Enquanto o CRM entrega, o cliente vê **"digitando..."** no
aparelho dele, como se fosse gente.

### Áudio

Grave pelo botão do microfone. Enquanto o CRM entrega, o cliente vê
**"gravando áudio..."**, e não "digitando".

Parece bobagem e não é: um áudio que chega depois de "digitando" avisa que tem
robô do outro lado. O aviso certo é o que a pessoa esperaria de outra pessoa.

### Imagem, vídeo e documento

Arraste para dentro da conversa, ou use o clipe. Vale o limite do WhatsApp: 16 MB
para mídia, 100 MB para documento.

### Respostas rápidas

As frases que você repete o dia inteiro, cadastradas em **Configurações →
Respostas rápidas**. No chat, chame pelo atalho e ela entra no campo, pronta para
editar antes de mandar.

---

## Assumir e devolver

Quando você responde numa conversa que o robô estava conduzindo, **o fluxo para**.
Isso é de propósito: duas vozes na mesma conversa confundem o cliente, e o robô
não sabe o que você acabou de combinar.

Para devolver ao robô, use o controle no painel de ações da conversa.

---

## Etiquetas

Etiqueta é como você separa conversa. Ela serve para filtrar a lista, para
disparo em massa e para condição dentro do fluxo.

Duas regras que evitam bagunça:

1. **Poucas.** Cinco etiquetas usadas valem mais que trinta inventadas.
2. **Sobre o estado, não sobre a pessoa.** `aguardando pagamento` é útil;
   `cliente chato` não ajuda ninguém e vai aparecer numa tela algum dia.

---

## Anotações

Anotação fica presa ao contato e aparece para quem abrir a conversa depois. É o
lugar do que foi combinado.

Não use a conversa para isso: o cliente lê a conversa.

---

## Kanban

As mesmas conversas, em colunas que você define, arrastadas com o mouse. Serve
para quem pensa em etapas: `novo` → `atendendo` → `orçamento` → `fechado`.

Um fluxo pode mover a conversa de coluna sozinho. Está na página
[05](05-fluxos.md), no bloco Kanban.

---

## Contatos

Todo mundo que já falou com você. É aqui que você:

- procura por nome, telefone ou campo personalizado;
- **importa uma lista** de um arquivo;
- exporta.

O telefone é guardado só com dígitos, sempre no mesmo formato. Sem isso, a mesma
pessoa viraria duas conversas: o WhatsApp entrega `5521999999999@s.whatsapp.net`
em alguns lugares e `+55 21 99999-9999` em outros.

---

Próxima: [05. Fluxos](05-fluxos.md).

# Aula 4. O primeiro fluxo

## O que você vai conseguir

Um robô que cumprimenta, oferece três botões, e conduz a conversa conforme o que
a pessoa tocar.

---

## Antes de montar

O fluxo é desenhado num quadro. Cada caixa é um passo, cada linha é o caminho
entre eles.

Como mexer no quadro:

- **arraste o fundo** para andar;
- **arraste um bloco** para mudar de lugar, inclusive para cima e para a
  esquerda do Início;
- **puxe de uma bolinha** de um bloco até outro para ligar;
- o **mapinha** no canto mostra onde você está;
- o botão de **enquadrar** traz tudo de volta quando você se perde.

Não existe botão de salvar. O CRM salva sozinho pouco depois de você parar de
mexer.

---

## Passo a passo

### 1. Crie o fluxo

**Fluxos** → novo fluxo. Chame de `Atendimento inicial`.

Você cai num quadro com um bloco **Início**.

### 2. A saudação

Adicione um bloco **Mensagem**, ligue o Início nele, e escreva:

```
Oi! Aqui é a {{empresa}}. Em que posso ajudar?
```

`{{empresa}}` é uma variável. Cadastre ela em **Configurações → Variáveis
globais** com o nome da sua empresa. Assim, no dia em que a empresa mudar de
nome, você muda num lugar e não em quarenta mensagens.

### 3. O menu

Adicione um bloco **Menu**, ligue a Mensagem nele, e crie três opções:

- `Quero um orçamento`
- `Já sou cliente`
- `Falar com atendente`

Três coisas sobre o texto dos botões:

1. **O texto do botão é o que aparece como resposta da pessoa** na conversa.
   `Quero um orçamento` lê muito melhor no histórico que `Opção 2`.
2. O WhatsApp limita o tamanho. Seja curto.
3. Repare que o bloco ganhou **quatro** saídas: as três opções e uma **"não
   entendi"**.

### 4. Ligue a saída "não entendi"

Esta é a mais importante e a mais esquecida.

Ela é usada quando a pessoa **escreve** em vez de tocar num botão, o que
acontece o tempo todo.

Ligue ela numa **Mensagem** dizendo algo como:

```
Não entendi. Toque em um dos botões acima, por favor.
```

E ligue essa mensagem **de volta no Menu**. Assim a pessoa vê as opções de novo
em vez de ficar presa.

### 5. O caminho do orçamento

Da saída `Quero um orçamento`, ligue:

1. um **Aguarda Resposta**: "Me conta o que você precisa" → guarda em `pedido`
2. um **Etiquetas**: põe a etiqueta `orçamento`
3. um **Atribuir atendimento**
4. uma **Mensagem**: "Já chamei alguém, é rápido"

### 6. Os outros dois caminhos

`Já sou cliente` e `Falar com atendente` podem ir direto para **Atribuir
atendimento** e uma mensagem curta.

Não deixe saída solta. Uma saída sem ligação para a conversa no escuro.

### 7. Ative

Marque o fluxo como ativo. Fluxo em rascunho não roda.

---

## O teste da aula

Do outro celular, faça o fluxo rodar (na aula 5 você faz ele começar sozinho;
por enquanto, acione pela conversa no CRM) e **percorra o caminho inteiro**:

- [ ] a saudação chegou com o nome da empresa no lugar da variável
- [ ] os três botões apareceram como botões, não como texto
- [ ] você tocou num botão e **o texto dele apareceu como sua resposta** na
      conversa do CRM
- [ ] o caminho continuou depois do toque
- [ ] você **escreveu qualquer coisa** em vez de tocar, e caiu no "não entendi"
- [ ] a etiqueta `orçamento` foi posta sozinha

O quinto item é o que separa um fluxo testado de um fluxo que quebra no primeiro
cliente. **O primeiro cliente sempre faz diferente.**

---

## Erros comuns

**Os botões chegam como texto numerado.** O provedor não entregou o menu
interativo. Confira em Configurações se o menu interativo está ligado.

**A pessoa toca e a resposta aparece em branco.** Veja o
[manual](../manual/10-quando-algo-quebra.md), seção "a mensagem vem vazia".

**O fluxo para depois do primeiro bloco.** Quase sempre é uma ligação faltando.
Use o enquadrar e siga cada linha com o olho.

**A variável aparece como `{{empresa}}` literal.** Ela não está cadastrada em
Variáveis globais, ou o nome está diferente. É sensível a maiúscula.

**Um Intervalo de mais de 24 horas deixa o fluxo mudo.** O WhatsApp só deixa
escrever livremente dentro de 24 horas da última mensagem da pessoa. Não é o CRM
que recusa.

---

## O que aprendemos

Um fluxo bom não é o que cobre o caminho certo. É o que **cobre o caminho
errado**: a pessoa que escreve em vez de tocar, a que some no meio, a que
responde outra coisa.

A saída "não entendi" ligada de volta no menu resolve a maioria disso com dois
blocos.

---

Próxima: [Aula 5. Fazer o fluxo começar sozinho](05-o-fluxo-comeca-sozinho.md).

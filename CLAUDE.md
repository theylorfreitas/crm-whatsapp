# Instruções do projeto

Este arquivo é lido pelo Claude Code sozinho, em toda conversa dentro desta
pasta. Ele existe para que o código que você pedir saia no mesmo padrão do que
já está aqui, em vez de virar cinco estilos diferentes ao longo dos meses.

Não apague. Edite conforme o projeto for ficando seu.

---

## O que este projeto é

Um CRM de atendimento com WhatsApp. Três peças e um banco:

- **`src/`** — a tela, em React + TypeScript + Tailwind + Vite.
- **`backend/`** — a API, em Fastify. Guarda o que a tela não pode ver.
- **`whatsapp/`** — a ponte com o provedor. Recebe webhook, envia mensagem, roda
  o motor de fluxos.
- **`banco/schema.sql`** — as 56 tabelas, com RLS.

A tela fala com o banco direto, protegida por RLS. O que exige segredo passa
pelo backend.

---

## Regras que valem para todo código daqui

### Segredo nunca chega na tela

Token de WhatsApp, chave de API, segredo de aplicativo: tudo em tabela com RLS
ligada e **sem policy nenhuma**, acessível só pelo service role. A tela nunca
consulta essas tabelas; ela pede ao backend, que devolve o resultado, nunca a
chave.

Um segredo que aparece uma vez no navegador está queimado, mesmo que a tela não
o mostre: qualquer pessoa abre a aba de rede e lê.

Nada que comece com `VITE_` é secreto. Essa é a regra inteira.

### Nome de coisa em português

Tabela, coluna, função, componente, variável: em português, como se fala do
negócio. `crm_chats`, `enviarPasso`, `SinalDaAutomacao`. O código descreve um
atendimento, e quem for ler daqui a seis meses pensa em português.

Exceção: o que a biblioteca impõe (`useState`, `className`) fica como está.

### Comentário explica POR QUE, nunca O QUE

Errado:

```ts
// pega o telefone e tira os caracteres
const fone = soDigitos(telefone)
```

Certo:

```ts
// O WhatsApp devolve `5521999999999@s.whatsapp.net` em uns lugares e
// `+55 21 99999-9999` em outros. Guardar os dois formatos faria a mesma pessoa
// virar duas conversas.
const fone = soDigitos(telefone)
```

Comentário bom registra a decisão e o que acontece se ela for desfeita. Quem
mexer daqui a um ano não tem como redescobrir isso sozinho.

### Texto de tela sem travessão

No que a pessoa lê na tela, use vírgula, ponto ou dois pontos. Travessão não é
lido no fluxo natural e some em fonte pequena. Comentário e documentação técnica
podem usar à vontade.

### Mensagem de erro diz o que fazer

Errado: "Erro ao processar requisição."

Certo: "O número está pareado, mas o servidor não consegue receber as mensagens
dele. Abra Conexões e leia o QR Code de novo."

### Estado que se escreve tem que ter saída

Ao criar um estado de erro, escreva no mesmo momento o caminho de volta dele.

Um sistema que sabe entrar em "erro" e não sabe sair fica vermelho para sempre
depois do primeiro tropeço de rede, e alguém precisa consertar na mão. Isso já
aconteceu neste código: a conexão de WhatsApp entrava em erro e nunca mais era
reexaminada, então uma oscilação de rede desligava o atendimento até alguém
perceber.

---

## Como trabalhar comigo

- **Antes de concluir que algo está quebrado, meça.** Rode, imprima, tire foto
  da tela. Não deduza o comportamento pelo código.
- **Comparar dois valores não prova que um caminho funciona.** O endereço
  gravado ser igual ao esperado não diz nada se os dois apontam para um túnel
  morto. Bata no endereço.
- **Ao mexer em banco com dado real, limpe o que criou.** Todo teste que grava
  precisa apagar no `finally`, e **restaurar o que já existia** em vez de apagar
  tudo o que encontrar.
- **Nunca imprima segredo no terminal.** Nem "só para conferir". Ele fica no
  histórico do shell e na rolagem da tela.
- **Erro de terceiro é dado, não opinião.** Quando o provedor devolve uma
  mensagem, ela vale mais que qualquer suposição sobre o que deveria acontecer.

---

## Conferências antes de dizer que terminou

```bash
npx tsc -b --force              # tipos
npx oxlint src                  # a tela
npm --prefix backend run build
npm --prefix whatsapp run build
```

Nenhum erro novo. Aviso que já existia antes pode ficar; aviso novo, não.

---

## Armadilhas já medidas neste código

Cada uma é cara de descobrir sozinho. Estão aqui para você não precisar.

**O endereço público que morre em silêncio.** Um número pareado cujo webhook
aponta para um endereço morto envia normalmente e nunca recebe. Nenhuma peça
acusa erro. É a falha mais cara do sistema, e é o motivo do sinal "Automação
ativa" na tela e do `npm run tunel`.

**Duas entradas de mensagem precisam do mesmo leitor.** O webhook ao vivo e a
importação de histórico são caminhos diferentes. Quando eles divergem, as bolhas
aparecem vazias depois de qualquer reconexão, e só depois de uma reconexão, o
que faz o defeito parecer aleatório.

**`opacity` menor que 1 mata o `backdrop-filter`.** Um valor abaixo de 1 cria um
contexto de composição novo, e o vidro para de desfocar o que está atrás. As
animações do painel são todas por `transform` por causa disso.

**`flex-1` sem `min-w-0` deixa o filho crescer até o conteúdo.** Um contêiner de
quadro chegou a 2934px numa tela de 1440px, e o sintoma era "não consigo
arrastar para cima".

**SVG corta no próprio quadro, ao contrário de uma `div`.** Coordenada negativa
some sem aviso. Precisa de `overflow: visible`.

<p align="center">
  <img src="public/marca/logo-512.png" alt="" width="160" />
</p>

# CRM com atendimento no WhatsApp

Um CRM completo que atende no WhatsApp: conversas ao vivo, robô de atendimento
com menu de botões, disparo por palavra-chave, kanban, funil, negócios, vendas e
equipe. Ele roda na sua máquina e no seu servidor, com o seu banco de dados. Não
há mensalidade de plataforma, nem limite de contatos, nem tela de upgrade.

O código é seu. Você abre, muda e vende.

---

## Instalar

Você precisa do [Node.js 20 ou mais novo](https://nodejs.org). Só isso.

```bash
npm install
npm run instalar
```

O `npm run instalar` conversa com você: pergunta as chaves, **confere cada uma
falando com o serviço de verdade**, cria as 56 tabelas do banco, cria o seu
usuário e escreve o arquivo de configuração. Se você errar uma chave, ele avisa
na hora, e não três telas depois.

Depois disso, três terminais:

```bash
npm run dev         # a tela          http://localhost:5183
npm run backend     # a API
npm run whatsapp    # a ponte do WhatsApp
```

Abra `http://localhost:5183` e entre com o e-mail que você cadastrou.

> **Nunca instalou nada parecido?** Vá direto para
> [manual/01-instalacao.md](manual/01-instalacao.md). Lá tem o passo a passo com
> onde clicar em cada serviço.

---

## O curso e o manual

São duas coisas diferentes, de propósito.

**[O curso](curso/)** é uma ordem. Onze aulas, cada uma com algo para fazer e um
teste que prova que ficou pronta. Comece por aqui se é a sua primeira vez: em
duas tardes você tem cliente sendo atendido de verdade.

**[O manual](manual/)** é consulta. Você abre na página do assunto quando
precisa, sem ordem nenhuma.

### As aulas

| # | Aula | No fim, você tem |
|---|---|---|
| 0 | [O que você vai construir](curso/00-o-que-voce-vai-construir.md) | as contas criadas e as chaves na mão |
| 1 | [Instalar e abrir](curso/01-instalar-e-abrir.md) | o CRM abrindo no navegador |
| 2 | [Conectar o WhatsApp](curso/02-conectar-o-whatsapp.md) | mensagem de verdade entrando na tela |
| 3 | [Atender a primeira conversa](curso/03-atender-a-primeira-conversa.md) | você respondendo pelo CRM |
| 4 | [O primeiro fluxo](curso/04-o-primeiro-fluxo.md) | um menu com botões respondendo sozinho |
| 5 | [O fluxo começa sozinho](curso/05-o-fluxo-comeca-sozinho.md) | palavra-chave acionando o robô |
| 6 | [Com a sua cara](curso/06-com-a-sua-cara.md) | marca, horários, respostas rápidas |
| 7 | [Mais de uma pessoa](curso/07-mais-de-uma-pessoa.md) | equipe, departamento e distribuição |
| 8 | [A parte comercial](curso/08-a-parte-comercial.md) | funil e vendas alimentados pelo fluxo |
| 9 | [Colocar no ar](curso/09-colocar-no-ar.md) | rodando sem o seu computador ligado |
| 10 | [O método](curso/10-o-metodo.md) | saber diagnosticar sozinho |

### O manual, por assunto

| | | |
|---|---|---|
| 00 | [Antes de começar](manual/00-antes-de-comecar.md) | as contas que você vai precisar, e quanto custa |
| 01 | [Instalação](manual/01-instalacao.md) | do zero até a tela abrindo |
| 02 | [Primeiro acesso](manual/02-primeiro-acesso.md) | o que é cada parte do CRM |
| 03 | [Conectar o WhatsApp](manual/03-conectar-o-whatsapp.md) | parear o número e receber mensagem |
| 04 | [Atender](manual/04-atender.md) | o dia a dia da caixa de entrada |
| 05 | [Fluxos](manual/05-fluxos.md) | montar o robô que conduz a conversa |
| 06 | [Disparos e palavras-chave](manual/06-disparos-e-palavras-chave.md) | fazer o fluxo começar sozinho |
| 07 | [Funil, negócios e vendas](manual/07-funil-negocios-e-vendas.md) | a parte comercial |
| 08 | [Equipe](manual/08-equipe.md) | mais de uma pessoa atendendo |
| 09 | [Colocar no ar](manual/09-colocar-no-ar.md) | sair do "na minha máquina" |
| 10 | [Quando algo quebra](manual/10-quando-algo-quebra.md) | o que conferir, na ordem |

---

## Como ele é por dentro

Três programas e um banco.

```
  Navegador ─── a tela (React)
                  │
                  ├──── Supabase ──── Postgres, com RLS
                  │     banco e login
                  │
                  └──── a API (Fastify)
                          │
                          └──── a ponte do WhatsApp ──── uazapi ──── WhatsApp
```

**A tela** fala com o banco direto. Quem decide o que cada pessoa pode ver são
as regras de segurança dentro do Postgres (RLS), e não o código do navegador.
Essa é a diferença entre uma trava que funciona e uma que qualquer pessoa
contorna abrindo as ferramentas do desenvolvedor.

**A API** existe para o que a tela não pode fazer: guardar segredo. O token do
seu WhatsApp fica numa tabela que o navegador não alcança nem estando logado.

**A ponte** é quem conversa com o WhatsApp. Ela recebe o que chega, roda o motor
de fluxos e envia a resposta.

| Pasta | O que é |
|---|---|
| `src/` | a tela |
| `backend/` | a API |
| `whatsapp/` | a ponte e o motor de fluxos |
| `banco/schema.sql` | as tabelas, tiradas de um banco em produção |
| `manual/` | este manual |

---

## Uma coisa que este CRM não faz

Ele não burla o WhatsApp. O canal usado é uma API paga, com o número pareado por
QR Code, e os limites são reais: você só escreve para quem escreveu para você
dentro de 24 horas, existe teto de mensagens por dia, e quem dispara em massa
para quem não pediu tem o número bloqueado.

O manual ensina a respeitar esses limites porque o contrário custa o seu número,
e um número bloqueado leva junto a conversa de todos os seus clientes.

---

## Licença

Copyright © 2026 Theylor Freitas. Todos os direitos reservados.

Este código está aberto para leitura, e não é de domínio público. Quem adquire
a licença pode instalar, modificar e usar no próprio negócio, sem limite de
contatos nem de tempo. Revender o CRM, redistribuir o código ou publicá-lo em
outro lugar não está incluído.

Os termos completos estão em **[LICENCA.md](LICENCA.md)**. Para revender, fale
com theylorrico@gmail.com.

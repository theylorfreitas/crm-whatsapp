# Aula 5. Fazer o fluxo começar sozinho

## O que você vai conseguir

Alguém escreve uma palavra no WhatsApp e o robô começa a atender, sem você tocar
em nada.

Depois desta aula você tem um CRM que atende de verdade.

---

## As formas de acionar

| Como | Quando usar |
|---|---|
| **Palavra-chave** | a pessoa escreve algo e o fluxo começa |
| **Primeira mensagem** | qualquer pessoa nova cai no fluxo |
| **Manual** | você aciona pela conversa |
| **Webhook de entrada** | outro sistema pede |

Elas **não são exclusivas**. O mesmo fluxo pode ter palavra-chave e ainda ser
acionado na mão. O cartão do fluxo, na lista, mostra o que está de fato
configurado.

---

## Passo a passo

### 1. Cadastre a palavra-chave

Abra o fluxo `Atendimento inicial`, vá em disparo, e cadastre a palavra
`orçamento`.

Escolha também **como ela casa**:

- **Exata** — só se a mensagem for exatamente `orçamento`
- **Contém** — se a palavra aparecer em qualquer lugar da frase

Escolha **contém**. Quase ninguém escreve só "orçamento"; escrevem "queria um
orçamento por favor".

Este é o erro número um desta aula: deixar em `exata` e achar que o sistema está
quebrado.

### 2. Configure o horário

**Configurações → Horários**. Diga em que dias e horas você atende.

Faça isso **agora**, antes de soltar o fluxo. Um robô que conduz um atendimento
completo às 3 da manhã e termina com "vou te passar para um atendente" deixa a
pessoa esperando cinco horas.

### 3. Coloque um fluxo de boas-vindas (opcional)

Se você quiser que **qualquer** pessoa nova caia num fluxo, marque um como o de
boas-vindas.

Deixe ele curto, com uma saída rápida para "falar com atendente". Se ele for
longo, todo mundo que só queria perguntar o horário vai ter que atravessar um
menu inteiro.

---

## O teste da aula

Do outro celular:

1. Mande `queria um orçamento por favor`.
2. O fluxo tem que começar sozinho, em poucos segundos.
3. Toque em `Quero um orçamento`.
4. O fluxo continua.

E o segundo teste, que quase ninguém faz:

5. Comece o fluxo de novo e, quando o **menu** aparecer, **escreva** `orçamento`
   em vez de tocar num botão.

O que tem que acontecer: o CRM **cancela o fluxo atual e leva você para o fluxo
da palavra-chave**.

Isso é de propósito. O contrário seria o menu engolir a palavra: a pessoa
escreveria "cancelar" e receberia "não entendi, escolha uma opção", presa num
menu que ela não quer.

---

## Erros comuns

Quando a palavra-chave não aciona, confira **nesta ordem**. Pare no primeiro que
estiver errado.

1. **O sinal da automação está verde?** Se estiver vermelho, o CRM não está
   recebendo nada, e nenhuma palavra-chave vai acionar. Volte para a
   [aula 2](02-conectar-o-whatsapp.md).
2. **O fluxo está ativo?** Rascunho não dispara.
3. **A regra aponta para o fluxo certo?** Abra o disparo e confira.
4. **O casamento está em `exata`?** É o erro mais comum.
5. **A pessoa já está dentro de outro fluxo?** Se estiver parada num **Aguarda
   Resposta**, o que ela escreveu foi tratado como a resposta, e não como
   palavra-chave. Só o **Menu** tem o desvio descrito acima.

Repare na ordem: ela vai do mais geral para o mais específico. Conferir a regra
da palavra-chave enquanto o sinal está vermelho é perder tempo com o sintoma
errado.

---

## Sobre disparo em massa

Você vai ficar tentado. Leia antes.

Esta é a função que mais derruba número no WhatsApp, e as regras não são do CRM,
são da plataforma:

- **A janela de 24 horas.** Você só escreve livremente para quem escreveu para
  você nas últimas 24 horas.
- **O teto diário.** Existe limite, e ele sobe conforme o número ganha
  reputação.
- **A denúncia.** Algumas marcações de spam derrubam o número.

O CRM ajuda com intervalo entre envios e respeitando o horário. Mas comece
pequeno: cinquenta contatos que já falaram com você, não dois mil de uma lista
comprada.

**Um número bloqueado leva junto a conversa de todos os seus clientes, e não tem
recurso.**

---

## O que aprendemos

Um sistema que atende sozinho tem duas metades: o que ele responde (aula 4) e
**quando ele começa** (esta aula). A segunda metade é a que costuma ser
esquecida, e o sintoma é sempre o mesmo: "o fluxo está certo mas não acontece
nada".

---

Próxima: [Aula 6. Deixar com a sua cara](06-com-a-sua-cara.md).

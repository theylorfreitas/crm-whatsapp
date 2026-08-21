# 06. Disparos e palavras-chave

Um fluxo desenhado não faz nada sozinho. Alguém precisa acioná-lo. Esta página é
sobre as formas de fazer isso.

---

## As formas de acionar um fluxo

| Como | Quando usar |
|---|---|
| **Palavra-chave** | o cliente escreve algo e o fluxo começa |
| **Primeira mensagem** | qualquer pessoa nova cai no fluxo |
| **Manual** | você aciona pela conversa, quando quiser |
| **Webhook de entrada** | outro sistema pede |

Elas não são exclusivas. O mesmo fluxo pode ter palavra-chave e ainda ser
acionado na mão. O cartão do fluxo, na lista, mostra **o que realmente está
configurado**, e não um rótulo fixo.

---

## Palavra-chave

Abra o fluxo, vá em disparo, e cadastre a palavra.

Escolha também **como ela casa**:

- **Exata** — só se a mensagem for exatamente aquilo.
- **Contém** — se a palavra aparecer em qualquer lugar da frase.

`contém` é mais útil na prática: quase ninguém escreve só "orçamento", escrevem
"queria um orçamento por favor".

### Palavra-chave no meio de um menu

Uma coisa importante e nada óbvia.

Se o cliente estiver parado num bloco **Menu**, esperando escolher, e escrever
uma palavra-chave de outro fluxo, o que acontece?

O CRM **cancela o fluxo atual e leva a pessoa para o fluxo da palavra-chave**.

Isso é de propósito. O contrário seria o menu engolir a palavra: a pessoa
escreveria "cancelar" e receberia "não entendi, escolha uma opção", presa num
menu que ela não quer. A conversa fica registrada como cancelada, dizendo que a
pessoa escreveu uma palavra-chave e foi levada para o fluxo dela.

---

## Primeira mensagem

Marque o fluxo como o de boas-vindas e qualquer pessoa que escrever pela primeira
vez cai nele.

É o mais fácil de configurar e o mais fácil de errar: se ele for longo, todo
mundo que só queria perguntar o horário vai ter que atravessar um menu inteiro.
Deixe o de boas-vindas curto, com uma saída rápida para "falar com atendente".

---

## Horários

**Configurações → Horários** define quando o robô responde.

Fora do horário, o fluxo não roda como se fosse dia útil: o CRM responde a
mensagem de fora de expediente que você escreveu.

Configure antes de soltar o fluxo. Um robô que conduz um atendimento completo às
3 da manhã e termina com "vou te passar para um atendente" deixa a pessoa
esperando cinco horas.

---

## Disparos em massa

**Disparos em massa** manda a mesma mensagem para uma lista. Você escolhe quem
por etiqueta, por campo ou por seleção.

### Leia antes de usar

Esta é a função que mais derruba número no WhatsApp. As regras não são do CRM,
são da plataforma:

- **A janela de 24 horas.** Você só escreve livremente para quem escreveu para
  você nas últimas 24 horas. Fora disso, só modelo aprovado.
- **O teto diário.** Existe um limite de mensagens por dia, e ele sobe conforme
  o número ganha reputação.
- **A denúncia.** Quem recebe sem ter pedido marca como spam, e algumas denúncias
  derrubam o número.

### O que o CRM faz para ajudar

- **Intervalo entre envios**, configurável. Não mande tudo de uma vez.
- **Respeita o horário** de atendimento.
- Mostra quantos foram, quantos falharam e por quê.

### O que fazer na prática

Comece pequeno. Cinquenta contatos que já falaram com você, não dois mil de uma
lista comprada. Aumente devagar. Um número queimado leva junto a conversa de
todos os seus clientes, e não tem recurso.

---

## Webhooks de entrada

Um endereço que o CRM te dá para outro sistema chamar. Quando ele chama, um fluxo
começa.

Serve para: formulário do site virar conversa, pedido pago virar mensagem de
confirmação, sistema de agenda avisar o cliente na véspera.

O endereço vem com um segredo dentro. Quem tem o endereço aciona o fluxo, então
trate como senha.

---

## Quando a palavra-chave não aciona

Confira nesta ordem:

1. **O sinal da automação está verde?** Se estiver vermelho, o CRM não está
   recebendo nada, e nenhuma palavra-chave vai acionar. Vá para a página
   [10](10-quando-algo-quebra.md).
2. **O fluxo está ativo?** Fluxo em rascunho não dispara.
3. **A regra aponta para o fluxo certo?** Abra o disparo e confira.
4. **O casamento é `exata` quando devia ser `contém`?** É o erro mais comum.
5. **A pessoa já está dentro de outro fluxo?** Se estiver num Aguarda Resposta,
   o que ela escreveu foi tratado como a resposta, e não como palavra-chave. Só
   o Menu tem o desvio descrito acima.

---

Próxima: [07. Funil, negócios e vendas](07-funil-negocios-e-vendas.md).

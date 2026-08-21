# Aula 10. O método

## O que você vai conseguir

Saber diagnosticar sozinho, inclusive um problema que este curso não previu.

Esta aula não tem passo a passo. Ela é a mais importante do curso.

---

## A regra

> A pergunta nunca é "o que deve estar acontecendo". É **"o que eu consigo
> medir"**.

Parece óbvio e é justamente o que separa quem conserta em dez minutos de quem
passa o dia trocando coisa no escuro.

---

## Por que num sistema de atendimento isso vale mais

Porque **a falha mais cara não dá erro**.

Volte ao caminho da aula 2:

```
  Cliente escreve  ──►  uazapi  ──►  endereço público  ──►  a ponte  ──►  a tela
```

Quando o endereço público morre, o que acontece:

- o número continua pareado, e o WhatsApp concorda;
- a tela continua dizendo "conectada", e ela está certa: a instância existe;
- o envio continua saindo, e a uazapi confirma cada um;
- o que o cliente responde é entregue num endereço que não existe mais.

**Cada peça, sozinha, está funcionando.** Nenhuma tem como saber que o conjunto
parou. Não existe log vermelho, não existe alerta, não existe exceção.

Você só descobre quando alguém pergunta por que o cliente não respondeu, e aí já
se passaram horas.

---

## Os instrumentos que este CRM tem

Um sistema bem feito não é o que não quebra. É o que **te conta** quando quebrou.

### O sinal da automação

No topo de Fluxos. Verde e pulsando: está recebendo agora. Vermelho: não está.

Ele se atualiza sozinho a cada 20 segundos, inclusive com a aba em segundo plano.

**É sempre a primeira coisa a olhar**, em qualquer problema. Ele responde a
pergunta mais cara com uma cor.

### O vigia

De dois em dois minutos ele confere se o número está pareado e **bate no próprio
endereço público** para ver se ele responde.

Repare na diferença: ele **bate no endereço**, e não compara o endereço gravado
com o esperado. Comparar dois textos iguais não prova nada quando os dois
apontam para um túnel morto. Essa distinção é fácil de perder e cara de
aprendida.

### O supervisor do túnel

O `npm run tunel` confere de meio em meio minuto e reconstrói quando precisa.

### O estado de erro que sabe sair

Quando o caminho de volta morre, a conexão vai para erro e o envio para. E
quando o endereço volta, ela sai do erro **sozinha**.

Isso não é detalhe. Um sistema que sabe entrar em erro e não sabe sair fica
vermelho para sempre depois do primeiro tropeço de rede, e alguém precisa
consertar na mão. Quando esse defeito existe, o sintoma é exatamente
esse: o sinal vermelho num canal saudável.

---

## O roteiro, sempre na mesma ordem

Do mais geral para o mais específico. **Pare no primeiro que estiver errado.**

1. **O sinal está verde?** Se não, o CRM não está recebendo nada, e nenhum
   problema de fluxo, palavra-chave ou etiqueta faz sentido investigar ainda.
2. **Os programas estão rodando?** `npm run whatsapp`, `npm run backend`,
   `npm run tunel`. Olhe os terminais, não a memória.
3. **O endereço público responde?** Se o `npm run tunel` está de pé, espere dois
   minutos e olhe o sinal de novo.
4. **A conexão está com erro?** Ele sai sozinho quando o caminho volta.
5. **Aí sim**, o problema específico: fluxo, palavra-chave, permissão.

Conferir a regra da palavra-chave enquanto o sinal está vermelho é gastar tempo
no sintoma errado. Acontece toda vez.

---

## Como pedir ajuda de um jeito que funciona

Para uma pessoa, ou para o Claude dentro do VS Code:

1. **O que você fez**, passo a passo.
2. **O que você esperava.**
3. **O que aconteceu**, com o erro copiado, não descrito.
4. **A cor do sinal** da automação.
5. **O que aparece nos terminais** de `npm run backend` e `npm run whatsapp`.

O item 5 é o que mais economiza tempo, e é o que quase ninguém manda.

**Nunca cole uma chave, um token ou o conteúdo do `.env`** numa conversa, num
chamado ou num print. Se você já colou, troque a chave: no Supabase em Settings →
API, na uazapi no painel dela.

---

## Três coisas que você nunca deve fazer

**Não crie uma policy nas tabelas `_secrets`** para resolver um erro de
permissão. Elas têm segurança ligada e nenhuma permissão de propósito: ninguém
lê, nem estando logado. É onde mora o token do seu WhatsApp. Uma policy ali torna
esse token legível pelo navegador de qualquer pessoa com login.

**Não ponha `VITE_` na frente da chave `service_role`.** Tudo que começa com
`VITE_` vai para dentro do site, e essa chave ignora todas as regras de segurança
do banco.

**Não desligue o RLS "só para testar".** Desligado, qualquer pessoa com a chave
pública (que está dentro do site) lê o banco inteiro.

---

## O que aprendemos, no curso inteiro

Se você levar três frases daqui, que sejam estas:

**Medir, não deduzir.** O que o código deveria fazer não é evidência.

**Comparar dois valores não prova que um caminho funciona.** Bata no endereço.

**Todo estado de erro precisa de uma saída, escrita no mesmo momento em que o
erro é escrito.**

Elas valem muito além deste CRM.

---

Acabou o curso. O [manual](../manual/) fica para consulta.

# Aula 2. Conectar o WhatsApp

## O que você vai conseguir

Uma mensagem de verdade, mandada de outro celular, aparecendo na tela do CRM.

Esta é a aula mais importante do curso.

---

## Por que ela é a mais importante

Porque existe um jeito de **tudo parecer certo e nada funcionar**, e quem não
conhece esse jeito perde dias.

Olhe o caminho que uma mensagem faz:

```
  Cliente escreve no WhatsApp
        │
        ▼
     uazapi  ────  está na internet
        │
        ▼
  um endereço público  ────  É AQUI QUE QUEBRA
        │
        ▼
  a ponte, na sua máquina
```

O seu computador está atrás do roteador. Ninguém de fora alcança ele. Então
precisa existir um endereço público apontando para a sua máquina.

**E o envio não usa esse caminho.** O envio sai da sua máquina para a uazapi, o
que sempre funciona. Por isso dá para ter um canal que envia perfeitamente e não
recebe nada, sem nenhum erro em lugar nenhum.

Guarde isso. É metade dos problemas que você vai ter.

---

## Passo a passo

### 1. Instale o cloudflared

É ele que cria o endereço público na sua máquina.

- **Windows:** baixe o instalador na
  [página de downloads da Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- **Mac:** `brew install cloudflared`
- **Linux:** mesma página

### 2. Levante o túnel

Num **quarto terminal**:

```bash
npm run tunel
```

Deixe rodando. Ele faz três coisas, e a terceira é a que importa:

1. levanta o túnel e escreve o endereço num arquivo que a ponte lê sozinha;
2. **confere de meio em meio minuto** se o endereço ainda entrega;
3. se falhar duas vezes seguidas, derruba e sobe de novo.

O motivo da conferência: um túnel pode continuar vivo e parar de entregar. E
quando ele cai e volta, **volta com outro nome**. O nome antigo fica gravado no
webhook da uazapi, e dali em diante tudo continua parecendo certo enquanto nada
chega.

### 3. Configure a uazapi, se você pulou

Se você pulou na aula 1, rode `npm run instalar` de novo. Ele aproveita tudo o
que já existe e só preenche o que falta.

### 4. Crie a conexão

1. **Conexões** → **Nova conexão**.
2. Dê um nome (`Atendimento`) e salve.

O CRM cria a instância na uazapi e guarda o token dela numa tabela que **o
navegador não alcança**, nem estando logado. Esse token é a chave do seu
WhatsApp: com ele, qualquer pessoa manda mensagem como você.

### 5. Leia o QR Code

1. Clique em **Conectar**.
2. No celular do número de atendimento: WhatsApp → **Aparelhos conectados** →
   **Conectar aparelho**.
3. Aponte para o QR da tela.

O QR expira em cerca de um minuto. Se expirar, gere outro.

---

## O teste da aula

**Não confie no verde. Prove.**

1. Pegue **outro** celular.
2. Mande "oi" para o número que você acabou de parear.
3. Abra **Chats ao vivo** no CRM.

A conversa tem que aparecer, com o texto "oi", em poucos segundos.

Se apareceu, o caminho de ida **e o de volta** estão funcionando. É a única
prova que vale.

---

## Erros comuns

**A conexão fica verde mas a mensagem não chega.** É o caminho de volta. Confira,
nesta ordem: o `npm run tunel` está rodando? o `npm run whatsapp` está rodando?
Se os dois estão, espere dois minutos: o vigia confere o endereço nesse intervalo
e reaponta o webhook sozinho.

**A conexão aparece com erro.** O vigia detectou que o caminho de volta está
morto e **parou o envio de propósito**. Continuar enviando seria pior: o cliente
recebe, responde, e a resposta some. Assim que o endereço voltar, ele devolve a
conexão para "conectada" sozinho, em até dois minutos. Você não precisa reparear.

**O QR não aparece.** O `npm run backend` caiu. Olhe o terminal dele.

**O número desconectou sozinho.** Confira no celular, em Aparelhos conectados. O
WhatsApp desconecta aparelho que fica muito tempo sem o celular aparecer na rede.

---

## O que aprendemos

Envio e recebimento são caminhos diferentes, e só um deles depende de um endereço
público. Quando algo estiver estranho, **a primeira pergunta é sempre se o
caminho de volta existe**, e não se a mensagem foi escrita direito.

O sinal **Automação ativa**, no topo da tela de Fluxos, responde essa pergunta
com uma cor. Verde e pulsando: está recebendo. Vermelho: não está.

---

Próxima: [Aula 3. Atender a primeira conversa](03-atender-a-primeira-conversa.md).

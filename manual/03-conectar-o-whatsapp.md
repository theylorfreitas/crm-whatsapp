# 03. Conectar o WhatsApp

Esta é a página mais importante do manual. Não porque parear o número seja
difícil, mas porque **existe um jeito de tudo parecer certo e nada funcionar**, e
quem não conhece esse jeito perde dias.

---

## Como a mensagem chega até o CRM

Vale entender o caminho antes, porque é ele que quebra.

```
  Cliente escreve no WhatsApp
        │
        ▼
     uazapi  ──────  precisa alcançar o seu computador
        │
        ▼
  um endereço público  ──── é aqui que quebra
        │
        ▼
  a ponte (npm run whatsapp)
        │
        ▼
  o banco, e a tela mostra
```

A uazapi está na internet. O seu computador, não: ele está atrás do seu roteador,
e ninguém de fora alcança ele. Então precisa existir **um endereço público** que
aponte para a sua máquina.

Em desenvolvimento, isso é um túnel. Em produção, é o seu domínio.

---

## Passo 1: levante o endereço público

Na sua máquina, o CRM usa o túnel do Cloudflare. Instale o `cloudflared`:

- **Windows:** baixe o instalador em
  [developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- **Mac:** `brew install cloudflared`
- **Linux:** veja a mesma página

Depois, num **quarto terminal**:

```bash
npm run tunel
```

Deixe ele rodando. Ele faz três coisas:

1. levanta o túnel e escreve o endereço num arquivo que a ponte lê sozinha;
2. **confere de meio em meio minuto** se o endereço ainda entrega;
3. se falhar duas vezes seguidas, derruba e sobe de novo, com endereço novo.

### Por que ele confere em vez de só manter o processo vivo

Porque um túnel pode continuar vivo e parar de entregar. E porque, quando ele
cai e volta, **volta com outro nome**. O nome antigo fica gravado no webhook da
uazapi, e a partir dali tudo continua parecendo certo enquanto nada chega.

É assim que um canal fica mudo por horas sem ninguém notar. O `npm run tunel`
existe por causa disso: ele transforma uma queda de horas numa queda de dois
minutos.

> **Isto não é a solução definitiva, e é honesto dizer.** Túnel rápido é
> descartável por natureza. A resposta de verdade é um endereço fixo, e está na
> página [09. Colocar no ar](09-colocar-no-ar.md).

---

## Passo 2: crie a conexão

1. Abra **Conexões** no CRM.
2. Clique em **Nova conexão**.
3. Dê um nome (`Atendimento`, `Vendas`, o que fizer sentido) e salve.

O CRM cria uma instância na uazapi e guarda o token dela numa tabela que **o
navegador não alcança**, nem estando logado. Esse token é a chave do seu
WhatsApp: com ele, qualquer pessoa manda mensagem como você.

---

## Passo 3: leia o QR Code

1. Clique em **Conectar** na conexão que você criou.
2. Aparece um QR Code na tela.
3. No celular do número de atendimento: WhatsApp → **Aparelhos conectados** →
   **Conectar aparelho**.
4. Aponte a câmera para o QR Code da tela.

O QR expira em cerca de um minuto. Se expirar, clique em gerar de novo.

Quando parear, a conexão fica **conectada**.

---

## Passo 4: prove que funciona

Não confie no verde. Prove.

**Mande uma mensagem de outro celular** para o número que você acabou de parear.
Escreva qualquer coisa, tipo "oi".

Abra **Chats ao vivo**. A conversa tem que aparecer, com o texto que você mandou,
em poucos segundos.

### Se apareceu

Está funcionando de ponta a ponta. Siga para [04. Atender](04-atender.md).

### Se não apareceu

O envio funciona e o recebimento não. Isso é o caminho de volta quebrado, e o
lugar de resolver é [10. Quando algo quebra](10-quando-algo-quebra.md).

Em resumo: confira se `npm run tunel` está rodando, e se `npm run whatsapp` está
rodando. São os dois que fazem o caminho de volta existir.

---

## O que o CRM vigia sozinho

Depois de pareado, um vigia roda de dois em dois minutos e:

- confere se o número continua pareado na uazapi;
- **bate no seu próprio endereço público** para ver se ele responde;
- se o endereço mudou, reaponta o webhook da uazapi sozinho;
- se o caminho de volta está morto, marca a conexão como com erro e **para de
  enviar**.

Esse último ponto merece explicação. Quando o caminho de volta morre, continuar
enviando é pior do que parar: o cliente recebe a mensagem, responde, e a resposta
dele some. Melhor a conversa não começar.

E o erro **tem saída**: assim que o endereço volta a responder, o vigia devolve a
conexão para "conectada" sozinho, sem ninguém mexer. Um sistema que sabe entrar
em erro e não sabe sair fica vermelho para sempre depois do primeiro tropeço de
rede.

---

## Trocar de número

Abra Conexões, apague a conexão e crie outra. O histórico de conversa fica: ele
está preso ao contato, não à conexão.

---

Próxima: [04. Atender](04-atender.md).

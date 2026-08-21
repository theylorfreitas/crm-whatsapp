# 10. Quando algo quebra

Esta é a página que você vai abrir com pressa. Ela está organizada pelo sintoma
que você vê, e não pela peça que está com defeito.

**Leia isto primeiro**, porque vale para tudo o que vem depois:

> A pergunta nunca é "o que deve estar acontecendo". É **"o que eu consigo
> medir"**. Cada seção aqui começa com algo que você olha, não com algo que você
> deduz.

---

## "Mandei mensagem e não chegou no CRM"

O sintoma mais comum, e o mais enganoso: **envio e recebimento são caminhos
diferentes**. O envio pode estar perfeito enquanto o recebimento está morto, e
nada na tela indica isso por conta própria.

Confira nesta ordem. Pare no primeiro que estiver errado.

### 1. O sinal da automação

Abra **Fluxos** e olhe o sinal no topo.

- **Verde, pulsando:** o CRM está recebendo. O problema é outro; pule para a
  próxima seção.
- **Vermelho:** o caminho de volta está quebrado. Siga.

### 2. Os programas estão rodando?

O recebimento precisa de dois processos vivos:

```bash
npm run whatsapp    # a ponte
npm run tunel       # o endereço público (só em desenvolvimento)
```

Se um dos terminais estiver fechado ou com erro, é isso. Suba de novo.

### 3. O endereço público responde?

Este é o defeito clássico, e ele **não dá erro em lugar nenhum**.

O que acontece: o túnel caiu e voltou com outro nome. O nome antigo continua
gravado no webhook da uazapi. O número segue pareado, a tela segue dizendo
"conectada", o envio segue saindo, e o que o cliente responde é entregue num
endereço que não existe mais.

O `npm run tunel` conserta sozinho em cerca de dois minutos: ele confere o
endereço de meio em meio minuto e reescreve quando muda. Se estiver rodando,
espere dois minutos e olhe o sinal de novo.

Se não resolver, derrube o `npm run tunel` e suba de novo.

### 4. A conexão está com erro?

Abra **Conexões**. Se a conexão estiver marcada com erro, o vigia detectou que o
caminho de volta está morto e **parou o envio de propósito**.

Isso não é castigo. Continuar enviando com o retorno quebrado é pior do que
parar: o cliente recebe, responde, e a resposta dele some.

**Esse erro tem saída sozinho.** Assim que o endereço volta a responder, o vigia
devolve a conexão para "conectada" na rodada seguinte, em até dois minutos. Você
não precisa reparear nada.

### 5. Ainda não?

Confira se o número continua pareado no celular: WhatsApp → **Aparelhos
conectados**. Se o CRM não estiver na lista, alguém desconectou. Volte para a
página [03](03-conectar-o-whatsapp.md) e leia o QR de novo.

---

## "A conversa aparece mas a mensagem vem vazia"

A conversa entra, a bolha aparece, e o texto não.

Quase sempre é **toque em botão**: a resposta de um menu não é texto comum, e o
CRM precisa achar o rótulo do botão que a pessoa tocou. Ele já sabe fazer isso,
inclusive quando o provedor renomeia o campo, porque ele procura o rótulo dentro
do próprio menu citado na resposta.

Se acontecer mesmo assim, é sinal de que o formato mudou do lado do provedor.
Abra a conversa depois de uma reconexão: as mensagens importadas do histórico
passam pelo mesmo leitor, então se o histórico está certo e o ao vivo não (ou o
contrário), isso indica onde olhar.

---

## "O fluxo não começa sozinho"

Vá para [06. Disparos e palavras-chave](06-disparos-e-palavras-chave.md), seção
"Quando a palavra-chave não aciona". O roteiro está lá.

O resumo: sinal verde? fluxo ativo? regra aponta para o fluxo certo? o casamento
é `contém` ou `exata`? a pessoa já está dentro de outro fluxo?

---

## "O fluxo começa e para no meio"

**Ele esbarrou na janela de 24 horas.** Se um bloco de Intervalo levou o fluxo
para mais de 24 horas depois da última mensagem do cliente, o WhatsApp recusa o
envio, e o fluxo fica mudo dali em diante.

**Alguém assumiu a conversa.** Quando um atendente responde, o fluxo para de
propósito. Devolva pelo controle no painel de ações.

**Um bloco não tem saída ligada.** O caso mais comum é a saída "não entendi" de
um Menu. A pessoa escreveu em vez de tocar, e não havia para onde ir.

---

## "A tela não abre / abre em branco"

Abra o console do navegador com **F12** e leia a primeira linha vermelha.

**"VITE_SUPABASE_URL não configurada"** — o `.env` está sem as chaves. Rode
`npm run instalar` de novo.

**Erro de CORS** — o endereço da tela não bate com o `CORS_ORIGIN` do `.env`. Em
desenvolvimento, isso quase sempre é o Vite ter aberto noutra porta porque a
5183 estava ocupada. Feche o que está usando a 5183.

**Página em branco sem erro nenhum** — o `npm run dev` caiu. Olhe o terminal.

---

## "Não consigo entrar"

**Senha errada** — no Supabase, em **Authentication → Users**, dá para mandar um
link de redefinição.

**"Usuário sem perfil configurado"** — a conta existe no login mas não tem linha
na tabela `profiles`. Acontece quando alguém foi criado direto pelo painel do
Supabase em vez de pelo convite. Rode `npm run instalar` de novo com o mesmo
e-mail: ele aproveita a conta existente e conserta o perfil.

---

## "Está tudo lento"

Olhe primeiro **quantas conversas** e **quantas mensagens** você tem. O CRM
aguenta bem, mas o plano grátis do Supabase tem limite de conexões, e ele é o
primeiro a apertar.

Se as consultas estiverem demorando, o Supabase mostra em **Reports**. Um índice
faltando aparece ali.

---

## O que NÃO fazer, nunca

**Não crie uma policy nas tabelas `_secrets`** para resolver um erro de
permissão. Essas tabelas têm segurança ligada e nenhuma permissão de propósito:
ninguém lê, nem estando logado. É onde mora o token do seu WhatsApp. Uma policy
ali torna esse token legível pelo navegador de qualquer pessoa com login.

O erro certo se resolve no servidor, não no banco.

**Não ponha `VITE_` na frente da chave `service_role`.** Tudo que começa com
`VITE_` vai para dentro do site, e essa chave ignora todas as regras de segurança
do banco.

**Não desligue o RLS** "só para testar". Desligado, qualquer pessoa com a chave
pública (que está dentro do site) lê o banco inteiro.

---

## Como pedir ajuda de um jeito que funciona

Quando for perguntar para alguém, ou para o Claude dentro do VS Code, mande:

1. **O que você fez**, passo a passo.
2. **O que você esperava** que acontecesse.
3. **O que aconteceu**, com o texto do erro copiado, não descrito.
4. **O estado do sinal** da automação (verde ou vermelho).
5. **O que aparece nos terminais** de `npm run backend` e `npm run whatsapp`.

O item 5 é o que mais economiza tempo, e é o que quase ninguém manda.

**Nunca cole uma chave, um token ou o conteúdo do `.env`** numa conversa, num
chamado ou num print. Se você já colou, troque a chave: no Supabase, em Settings
→ API; na uazapi, no painel dela.

# Aula 1. Instalar e abrir

## O que você vai conseguir

O CRM abrindo em `http://localhost:5183`, com você logado.

---

## Passo a passo

### 1. Abra a pasta no VS Code

**Arquivo → Abrir Pasta**, escolha a pasta do CRM, e depois **Terminal → Novo
Terminal**.

Confira que você está no lugar certo:

```bash
ls
```

Tem que aparecer `package.json`, `src`, `backend`, `whatsapp`, `manual`, `curso`.

### 2. Baixe as dependências

```bash
npm install
```

Um ou dois minutos. Ele cria uma pasta `node_modules` bem grande, que nunca vai
para o Git.

### 3. Rode o instalador

```bash
npm run instalar
```

Ele vai perguntar, na ordem: as três chaves do Supabase, como montar o banco, o
nome da empresa, o seu e-mail e senha, e a uazapi.

Duas coisas para saber:

**O que você digita nas chaves não aparece na tela.** É de propósito: terminal
guarda histórico, e histórico vaza.

**Cada resposta é conferida antes de ser gravada.** Ele fala com o Supabase e
com a uazapi de verdade. Se a chave estiver errada, você descobre no segundo
seguinte, com o nome do campo na frente, e não três telas depois como "erro ao
carregar".

Na parte do banco, se você tiver a senha da aula 0, cole a *connection string*
(Settings → Database → Connection string, aba **Session pooler**) e ele monta as
56 tabelas sozinho. Se preferir, aperte Enter e ele te mostra como colar o
`banco/schema.sql` no SQL Editor. Dá no mesmo.

**Pode pular a parte do WhatsApp.** A aula 2 é inteira sobre isso.

### 4. Ligue os programas

Três terminais. No VS Code, o `+` no painel do terminal abre outro.

```bash
npm run dev
```

```bash
npm run backend
```

```bash
npm run whatsapp
```

Se você pulou o WhatsApp no instalador, o terceiro vai reclamar de configuração
faltando e não vai subir. **Isso está certo.** Uma ponte no ar sem provedor
atrás responderia erro em toda chamada, e a tela diria "configurado, mas com
erro", que é pior do que dizer que não está configurado.

---

## O teste da aula

1. Abra `http://localhost:5183`.
2. Entre com o e-mail e a senha que você cadastrou.
3. Você tem que cair no **Início**, com o menu do CRM à esquerda.
4. Clique em **Contatos**. A tela abre vazia, sem erro.

Vazio é o resultado certo: você acabou de instalar, não tem contato nenhum.

---

## Erros comuns

**A tela abre em branco.** Aperte F12 e leia a primeira linha vermelha. Quase
sempre é o `.env` sem as chaves `VITE_`. Rode `npm run instalar` de novo.

**"As tabelas ainda não estão lá".** O SQL não rodou. Abra o SQL Editor do
Supabase, cole `banco/schema.sql` e olhe a mensagem em vermelho.

**Erro de CORS no console.** O Vite abriu noutra porta porque a 5183 estava
ocupada. **A porta 5183 não é enfeite:** ela está escrita no `CORS_ORIGIN` da
API e na configuração de login do Supabase. Feche o que está usando a 5183 em
vez de mudar a porta.

**Quero recomeçar.** Apague o `.env`, crie um projeto novo no Supabase e rode o
instalador de novo. Nada aqui é destrutivo, e rodar duas vezes é seguro.

---

Próxima: [Aula 2. Conectar o WhatsApp](02-conectar-o-whatsapp.md).

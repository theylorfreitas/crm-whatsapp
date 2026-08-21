# 01. Instalação

Do zero até a tela abrindo no navegador. Leve uns 20 minutos, sendo que a maior
parte é esperar o Supabase criar o projeto.

Se você ainda não tem as contas, volte para
[00. Antes de começar](00-antes-de-comecar.md).

---

## 1. Abra o projeto

Descompacte a pasta onde você quiser guardar o CRM e abra um terminal **dentro
dela**.

No VS Code: **Arquivo → Abrir Pasta**, escolha a pasta do CRM, e depois
**Terminal → Novo Terminal**. Ele já abre no lugar certo.

Para conferir que você está na pasta certa:

```bash
ls
```

Precisa aparecer `package.json`, `src`, `backend`, `whatsapp`, `manual`.

---

## 2. Baixe as dependências

```bash
npm install
```

Isso baixa as bibliotecas que o projeto usa. Demora um ou dois minutos na
primeira vez e cria uma pasta `node_modules` bem grande. É normal, e ela nunca
vai para o Git.

---

## 3. Rode o instalador

```bash
npm run instalar
```

Ele vai conversar com você. Cada resposta é **conferida contra o serviço de
verdade** antes de ser gravada, então se você errar uma chave, ele avisa na hora.

O que ele pergunta, na ordem:

### O banco (Supabase)

- **Project URL** — copie o campo inteiro de Settings → API.
- **anon / publishable key** — a chave pública.
- **service_role / secret key** — a chave de administrador.

O que você digita nas chaves **não aparece na tela**. É de propósito: terminal
fica com histórico, e histórico vaza.

### As tabelas

Aqui ele precisa criar as 56 tabelas do CRM. Tem dois caminhos, e os dois dão no
mesmo lugar.

**Caminho automático.** Ele pede a *connection string* do banco. Ela fica em
**Settings → Database → Connection string**, aba **Session pooler**, e parece
com isto:

```
postgresql://postgres.abcdefgh:SUASENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Cole ali e ele monta tudo sozinho.

**Caminho manual.** Se preferir não colar isso, aperte Enter e ele te mostra o
que fazer: abrir o **SQL Editor** no Supabase, copiar o conteúdo de
`banco/schema.sql` e clicar em **Run**. Leva o mesmo tempo.

Depois, de um jeito ou de outro, ele **confere** se as tabelas chegaram. Se não
chegaram, ele diz e para. Um instalador que segue em frente sem o banco só
adia o erro.

### A sua empresa

O nome que vai aparecer no CRM. Pode trocar depois em Configurações.

### O seu acesso

E-mail e senha do usuário **dono**: quem enxerga e configura tudo. Guarde essa
senha; ela não é recuperável por e-mail nesta instalação inicial.

### O WhatsApp

Endereço da uazapi e token de administrador.

**Você pode pular.** O CRM abre e funciona sem isso, só não recebe mensagem.
Muita gente prefere ver o sistema de pé antes de mexer no número. Se pular, é só
seguir a página [03](03-conectar-o-whatsapp.md) quando quiser.

---

## 4. Ligue os três programas

O CRM são três programas rodando ao mesmo tempo. Abra **três terminais** (no VS
Code, o botão de `+` no painel do terminal) e rode um em cada:

```bash
npm run dev
```

```bash
npm run backend
```

```bash
npm run whatsapp
```

O primeiro é a tela, o segundo é a API, o terceiro é a ponte do WhatsApp.

Se você pulou a parte do WhatsApp no instalador, o terceiro vai reclamar que
falta configuração e não vai subir. É o comportamento certo: uma ponte no ar sem
provedor atrás responderia erro em toda chamada, e a tela diria "configurado, mas
com erro", que é pior do que dizer que não está configurado.

---

## 5. Abra

```
http://localhost:5183
```

Entre com o e-mail e a senha que você cadastrou.

> **A porta 5183 não é enfeite.** Ela está escrita no `CORS_ORIGIN` da API e na
> configuração de login do Supabase. Se o Vite abrir noutra porta porque a 5183
> está ocupada, o login para de funcionar com um erro que não diz nada sobre
> porta. Feche o que está usando a 5183 em vez de mudar a porta.

---

## Se algo deu errado

**"comando não encontrado: npm"** — o Node não está instalado, ou o terminal foi
aberto antes da instalação. Feche e abra de novo.

**O instalador recusa a chave** — leia a mensagem: ela diz qual campo copiar. O
erro mais comum é colar a *anon* no lugar da *service_role*; elas são parecidas.

**"As tabelas ainda não estão lá"** — o SQL não rodou. Abra o SQL Editor do
Supabase, cole `banco/schema.sql` de novo e olhe a mensagem em vermelho.

**A tela abre em branco** — abra o console do navegador (F12). Quase sempre é o
`.env` sem as chaves `VITE_`. Rode `npm run instalar` de novo.

**Quero recomeçar do zero** — apague o `.env`, crie um projeto novo no Supabase e
rode o instalador de novo. Nada aqui é destrutivo, e rodar duas vezes é seguro.

---

Próxima: [02. Primeiro acesso](02-primeiro-acesso.md).

# Aula 0. O que você vai construir

## O que você vai conseguir

As três contas criadas e as chaves anotadas, prontas para a aula 1.

---

## O que é este sistema

Um CRM que atende no WhatsApp. No fim do curso, quando alguém mandar mensagem
para o seu número:

1. o CRM recebe e a conversa aparece na tela;
2. um robô responde com um menu de botões;
3. a pessoa toca num botão e o robô conduz;
4. quando precisa de gente, ele entrega para um atendente;
5. o que virou negócio aparece no funil.

Tudo isso rodando no **seu** banco de dados, sem mensalidade de plataforma e sem
limite de contatos.

---

## As três peças

```
  Navegador ─── a tela
                  │
                  ├──── Supabase ──── o banco e o login
                  │
                  └──── a API
                          │
                          └──── a ponte ──── uazapi ──── WhatsApp
```

Você vai rodar três programas ao mesmo tempo. Isso assusta na primeira vez e
deixa de assustar na segunda.

Vale saber o que cada um faz, porque quando algo quebrar, saber qual dos três
olhar é metade do diagnóstico.

**A tela** é o que você vê. Ela fala com o banco direto.

**A API** existe para guardar segredo. O token do seu WhatsApp fica com ela, e
nunca chega no navegador.

**A ponte** conversa com o WhatsApp: recebe o que chega e envia o que sai.

---

## Passo a passo

### 1. Node.js

Baixe em [nodejs.org](https://nodejs.org), versão **LTS**.

Confira no terminal:

```bash
node --version
```

### 2. Supabase

Crie a conta em [supabase.com](https://supabase.com) e um projeto novo.

**Guarde a senha do banco** que ele pede na criação. Ela não aparece de novo, e
o instalador consegue usar ela para montar as tabelas sozinho.

Depois, em **Settings → API**, anote três coisas:

- Project URL
- a chave **anon public**
- a chave **service_role**

### 3. uazapi

Crie a conta em [uazapi.com](https://uazapi.com). Anote:

- o endereço do seu servidor
- o token de administrador

### 4. Um número de WhatsApp

**Não use o seu pessoal.** Um chip pré-pago barato resolve. Se um dia o número
for bloqueado, você não quer perder o seu contato pessoal junto.

---

## O teste da aula

Abra um bloco de notas e escreva:

```
Project URL:     _______
anon:            _______
service_role:    _______
senha do banco:  _______
uazapi servidor: _______
uazapi token:    _______
```

Se todas as seis linhas estão preenchidas, a aula acabou.

---

## Erros comuns

**"node não é reconhecido como comando"** — o terminal foi aberto antes da
instalação. Feche e abra de novo.

**Confundir as duas chaves do Supabase.** Elas são parecidas e fazem coisas
opostas: a **anon** é pública e vai para dentro do site; a **service_role**
ignora todas as regras de segurança e fica só no servidor. Anote separado.

**Achar que a chave anon sendo pública é uma falha.** Não é. Quem protege os
dados são as regras dentro do banco, e não o sigilo dessa chave. O que nunca
pode aparecer no navegador é a service_role.

---

Próxima: [Aula 1. Instalar e abrir](01-instalar-e-abrir.md).

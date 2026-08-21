# 00. Antes de começar

O que você precisa ter na mão antes de rodar o instalador, e quanto cada coisa
custa. Leia esta página inteira antes de criar qualquer conta: uma delas é paga,
e é melhor você saber disso agora.

---

## O que você precisa

| O quê | Para quê | Custo |
|---|---|---|
| **Node.js 20+** | roda o projeto | grátis |
| **Conta Supabase** | banco de dados e login | grátis para começar |
| **Conta uazapi** | o canal de WhatsApp | mensal, pago |
| **Um número de WhatsApp** | o número do atendimento | o chip que você já tem |
| Um editor de código | mexer no código, quando quiser | grátis (VS Code) |

Domínio próprio e servidor só entram na aula [09](09-colocar-no-ar.md). Até lá,
tudo roda na sua máquina.

---

## Node.js

É o programa que executa o CRM. Baixe em [nodejs.org](https://nodejs.org) a
versão marcada como **LTS**.

Para conferir se deu certo, abra o terminal e rode:

```bash
node --version
```

Precisa aparecer `v20` ou maior. Se aparecer "comando não encontrado", feche o
terminal e abra de novo: a instalação só vale para janelas abertas depois dela.

---

## Supabase

O Supabase é o seu banco de dados e o seu sistema de login, os dois no mesmo
lugar. O plano grátis aguenta bem um CRM de um negócio pequeno.

1. Crie a conta em [supabase.com](https://supabase.com).
2. Clique em **New project**.
3. Escolha um nome, uma senha para o banco e a região mais perto de você.
   **Guarde essa senha.** Ela não aparece de novo, e o instalador consegue usar
   ela para montar as tabelas sozinho.
4. Espere uns dois minutos até o projeto ficar verde.

Depois, abra **Settings → API**. É de lá que saem três valores que o instalador
vai pedir:

| Campo lá | O que é |
|---|---|
| **Project URL** | o endereço do seu banco |
| **anon public** | a chave pública, que vai para o navegador |
| **service_role** | a chave de administrador, que fica só no servidor |

### Sobre essas duas chaves

A **anon** é pública por natureza. Ela vai dentro do site, qualquer pessoa
consegue ler, e isso não é uma falha: quem protege os dados são as regras dentro
do banco (RLS), que o `banco/schema.sql` já instala.

A **service_role** ignora todas essas regras. Ela existe para o servidor fazer o
que o navegador não pode. Se ela aparecer no navegador uma única vez, está
queimada: qualquer pessoa abre a aba de rede, copia, e passa a ler e apagar o seu
banco inteiro.

Por isso o `.env` tem `VITE_SUPABASE_ANON_KEY` e **não tem** nenhum `VITE_` para a
service_role. Tudo que começa com `VITE_` vai para o navegador. Não crie um.

---

## uazapi

A uazapi é quem conversa com o WhatsApp de verdade. É um serviço pago, e é o que
entrega **menu com botão**, áudio, imagem e documento.

Crie a conta em [uazapi.com](https://uazapi.com). Você vai sair de lá com duas
coisas:

- o **endereço do seu servidor**, algo como `https://seunome.uazapi.com`;
- o **token de administrador**, que cria e apaga instâncias. Trate como senha.

### Por que não a API oficial da Meta

Você pode usar a oficial, e o CRM tem suporte para ela. Mas ela exige empresa
verificada, aprovação de modelo de mensagem antes de cada envio e um processo de
liberação que leva semanas. Para começar, o número pareado por QR Code resolve, e
você troca depois sem trocar de CRM.

### O que você não pode fazer

O WhatsApp bloqueia número que dispara em massa para quem não pediu. Não é
ameaça: é o funcionamento normal da plataforma, e o bloqueio leva junto a
conversa de todos os seus clientes.

As regras que valem:

- Você só escreve livremente para quem escreveu para você **nas últimas 24
  horas**. Fora dessa janela, só modelo aprovado.
- Existe um teto de mensagens por dia, que sobe conforme o número ganha
  reputação.
- Quem recebe e denuncia como spam derruba a sua reputação rápido.

O CRM ajuda: os **Disparos em massa** têm intervalo entre envios, e os
**Horários** impedem que o robô responda de madrugada. Use os dois.

---

## Um número de WhatsApp

Use um número que **não seja o seu pessoal**. Duas razões:

1. Parear o número no CRM ocupa a vaga de "aparelho conectado". Você continua
   usando o WhatsApp no celular, mas as mensagens passam a ser lidas e
   respondidas também pelo sistema.
2. Se um dia o número for bloqueado, você não quer perder o seu contato pessoal
   junto.

Um chip pré-pago barato resolve. Deixe o WhatsApp instalado e ativo nele.

---

## Quanto custa por mês, na prática

| | Começando | Rodando de verdade |
|---|---|---|
| Supabase | grátis | ~25 USD |
| uazapi | plano de entrada | conforme o volume |
| Servidor (aula 09) | não precisa ainda | ~5 a 20 USD |
| Domínio | não precisa ainda | ~40 BRL por ano |

Nos primeiros dias você gasta só a uazapi.

---

Pronto? Vá para [01. Instalação](01-instalacao.md).

# Aula 7. Mais de uma pessoa atendendo

## O que você vai conseguir

Uma segunda pessoa entrando com a conta dela, e o fluxo entregando conversa para
o setor certo em vez de para uma pessoa fixa.

> **Pule esta aula se você atende sozinho.** Ela vale quando o problema
> aparecer. Voltar aqui depois custa vinte minutos.

---

## Passo a passo

### 1. Convide alguém

**Equipe** → convite pelo e-mail da pessoa. Ela recebe um link, define a senha e
entra.

**Cada um com a própria conta.** Não compartilhe o seu login. Sem contas
separadas você não sabe quem respondeu o quê, não consegue distribuir conversa, e
tirar o acesso de quem saiu vira trocar a senha de todo mundo.

### 2. Entenda os papéis

| Papel | O que pode |
|---|---|
| **Dono** | tudo, inclusive Conexões, Equipe e Configurações |
| **Atendente** | atender, mexer em contato, negócio e tarefa |

Pense antes de criar um segundo dono: o dono desconecta o número de WhatsApp da
empresa.

### 3. Crie departamentos

**Configurações → Departamentos**. Comece com dois: `Vendas` e `Suporte`.

Departamento é um grupo de atendentes. Ele serve para o fluxo entregar a conversa
para o **setor** em vez de para uma pessoa. Assim quem estiver disponível pega, e
ninguém fica esperando o Fulano que está de férias.

### 4. Mude o fluxo

Volte no `Atendimento inicial` (aula 4) e troque o **Atribuir atendimento** por
um bloco **Departamento**, apontando para `Vendas`.

Depois dele, ponha um **Distribuidor**. Ele reveza as conversas entre os
atendentes do departamento em vez de despejar tudo no primeiro.

### 5. Entenda o que para o robô

Quando um atendente responde numa conversa que o robô conduzia, **o fluxo para**.

Isso é de propósito: duas vozes na mesma conversa confundem o cliente, e o robô
não sabe o que o atendente acabou de combinar.

Ele **não volta sozinho**. Quem assumiu decide quando devolver, pelo controle no
painel de ações.

---

## O teste da aula

Com duas pessoas logadas, em navegadores ou máquinas diferentes:

- [ ] as duas veem a mesma conversa em Chats ao vivo
- [ ] o fluxo entregou a conversa para o departamento `Vendas`
- [ ] a segunda pessoa respondeu, e **o fluxo parou**
- [ ] a segunda pessoa devolveu para o robô pelo painel de ações
- [ ] duas conversas novas foram para atendentes diferentes pelo Distribuidor

O último item precisa de duas conversas. Mande de dois celulares, ou apague a
conversa de teste e recomece.

---

## Erros comuns

**O convite não chega.** Confira a caixa de spam. No Supabase, em
**Authentication → Users**, dá para ver se o usuário foi criado e mandar o link
de novo.

**"Usuário sem perfil configurado".** A conta existe no login mas não tem linha
na tabela `profiles`. Acontece quando alguém foi criado direto pelo painel do
Supabase em vez de pelo convite.

**O Distribuidor manda tudo para a mesma pessoa.** O departamento tem só um
atendente, ou os outros não foram associados a ele.

**O robô voltou a falar no meio do atendimento humano.** Alguém devolveu para o
fluxo sem querer, pelo painel de ações.

---

## O que aprendemos

Numa equipe, a pergunta que mais custa caro é "quem está com essa conversa". O
CRM responde ela de três jeitos, do mais frouxo ao mais firme: **caixa
compartilhada** (todo mundo vê), **departamento** (o setor vê) e **atribuição**
(uma pessoa).

Comece pelo mais frouxo. Numa equipe pequena, o pior cenário é uma conversa ficar
sem dono, e não duas pessoas responderem.

---

Próxima: [Aula 8. A parte comercial](08-a-parte-comercial.md).

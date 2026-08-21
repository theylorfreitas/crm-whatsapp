# Aula 6. Deixar com a sua cara

## O que você vai conseguir

O CRM com o seu nome, a sua cor e o seu símbolo, e os cadastros que fazem o dia a
dia render.

---

## Passo a passo

### 1. A marca

Dois arquivos, e só dois.

**`src/config/brand.ts`** — abra e edite:

```ts
export const COR_NEUTRA = '#52525b'   // ponha a sua cor aqui

export const ownerBrand: OwnerBrand = {
  name: 'CRM',            // o nome que aparece nas telas
  shortName: 'CRM',       // a versão curta
  logoInitials: 'CR',     // usado quando não há símbolo
  logoUrl: '/marca/simbolo.svg',
  accentColor: COR_NEUTRA,
  version: 'v1.0.0',
}
```

**`public/marca/simbolo.svg`** — troque o arquivo mantendo o nome.

Salve e o navegador recarrega sozinho.

Sobre o símbolo: a arte que vem de fábrica é **branca e vazada**. Isso não é
descuido. A mesma arte serve ao tema escuro como está e ao tema claro invertida,
e por isso ela nunca é desenhada solta. Se você puser uma arte colorida, precisa
de duas versões.

### 2. Campos de contato

**Configurações → Campos personalizados**.

O CRM já guarda nome e telefone. O que mais importa no seu negócio você cria
aqui: CPF, placa do carro, número do pedido, o que for.

**Crie agora, não depois.** Campo criado depois vem vazio em todos os contatos
que já existem, e não tem como preencher retroativamente.

### 3. Respostas rápidas

**Configurações → Respostas rápidas**.

Comece com três:

- como você cumprimenta
- como você pede o dado que sempre falta
- como você se despede

Você vai chegar a vinte com o tempo. Comece com três usadas.

### 4. Variáveis globais

**Configurações → Variáveis globais**.

O nome da empresa, o horário, o endereço, o link do site. Tudo o que aparece em
várias mensagens.

Escreva num lugar, mude num lugar. Sem isso, mudar o horário de atendimento vira
uma caçada por todos os fluxos.

### 5. Produtos

**Configurações → Produtos**.

Cadastre o que você vende. A tela de Vendas aponta para eles.

Sem isso, "quanto eu vendi de cada coisa" vira contagem à mão depois.

### 6. Etiquetas

Revise as etiquetas que você já criou e apague as que não usa.

Vale a regra da aula 3: poucas, e sobre o estado, não sobre a pessoa.

---

## O teste da aula

- [ ] o nome da sua empresa aparece no topo do CRM
- [ ] o seu símbolo aparece na tela de login e na aba do navegador
- [ ] um contato tem pelo menos um campo que você inventou, preenchido
- [ ] uma resposta rápida foi usada numa conversa de verdade
- [ ] uma mensagem de fluxo usa uma variável global e ela é trocada pelo valor
- [ ] o horário de atendimento está configurado

---

## Erros comuns

**O símbolo some no tema claro.** A arte é branca. Ou ela é vazada (e o CRM
inverte sozinho), ou você põe uma versão com cor própria.

**A cor não muda em lugar nenhum.** Você editou `accentColor` mas deixou a linha
apontando para `COR_NEUTRA`. Mude o valor de `COR_NEUTRA`, ou troque a linha
inteira.

**A variável global não é trocada.** O nome é sensível a maiúscula, e precisa
bater exatamente com o que está entre chaves duplas na mensagem.

**Criei o campo e os contatos antigos estão vazios.** É o esperado. Por isso a
recomendação de criar antes.

---

Próxima: [Aula 7. Mais de uma pessoa atendendo](07-mais-de-uma-pessoa.md).

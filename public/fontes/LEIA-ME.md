# A tipografia da CRM

A fonte do painel é a **Outfit**, auto-hospedada aqui.

    Outfit-Variable.woff2   a fonte (variável: um arquivo cobre 100 a 900)
    Outfit-OFL.txt          a licença

## Não apague o Outfit-OFL.txt

A Outfit é distribuída sob a SIL Open Font License, que **exige** que a licença
acompanhe o arquivo da fonte. Apagar aquele .txt numa faxina de pasta é uma
violação de licença, mesmo que a fonte continue funcionando.

## Por que não a NewBlack

A NewBlack é a fonte das peças da marca, e ficou fora do painel de propósito.

Dois motivos, e o segundo vale mesmo com a licença na mão:

1. **Licença.** Ela é comercial (FoxType), e Desktop e Webfont são vendidas
   separadamente. Uma compra feita pra fazer arte gráfica é a Desktop, e ela
   não cobre `@font-face` num app publicado.

2. **Ela é uma display.** Foi desenhada pra manchete, cartaz e capa — é por
   isso que fica ótima nas peças. Num painel o texto é outro: tabela densa,
   rótulo de 11px, número alinhado, coluna estreita. Display nesse tamanho
   cansa a leitura e confunde caractere parecido (Il1, O0).

A separação display-na-peça / neutra-na-interface é o que sistemas de marca
sérios fazem. A identidade no painel está sustentada pela cor, pelo Onyx, pelo
vidro e pela marca — não pela fonte do cartaz.

## Se um dia trocar de fonte

Um arquivo `.woff2` aqui, um `@font-face` em `src/index.css` e o nome na frente
da pilha do `body`. Prefira `.woff2`: o `.ttf` equivalente costuma ter 3 a 6
vezes o tamanho, e a fonte é a primeira coisa que a página espera pra desenhar
texto.

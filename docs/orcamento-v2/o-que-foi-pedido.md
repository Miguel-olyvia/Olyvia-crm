# O que foi pedido

> Reunião de **4 de setembro de 2026**, 14:06–14:22, Google Meet.
> Presentes: **Rafael Gromicho** (a apresentar) e **Ruben Carvalho**.
> Pedido original do **Ricardo**, transmitido pelo Rafael.
>
> As citações abaixo vêm da transcrição da gravação. A marca de tempo permite
> ir ouvir o original em [`transcricao-da-reuniao.txt`](transcricao-da-reuniao.txt).

---

## O enquadramento

O Rafael ia de férias e voltava a 9 de setembro. O Ricardo pediu-lhe que passasse
o trabalho ao Ruben para ir adiantando entretanto.

> «Basicamente aquilo que eu falei com o Ricardo, que ele quer agora melhorar, e
> ele pediu-me para que me ajudasses enquanto eu tivesse de férias, para depois eu
> pegar naquilo quando voltasse dia 9.»
> — Rafael, 00:12

---

## O problema, como o Rafael o descreveu

Hoje o comercial abre um orçamento, escolhe o cliente e adiciona livremente
produtos, serviços e bundles. Um serviço traz **apenas um preço** — não traz
consigo o material que aquele trabalho consome, nem quanto.

> «Eles podem meter também serviço, mas o serviço simplesmente neste momento só
> diz o valor. (…) E se passa para operações, os gajos estão lixados — sabem lá o
> que é que vão fazer, vão ter que fazer uma pesquisa para eles próprios.»
> — Rafael, 05:52 → 06:03

Este é o custo real. Não é que o orçamento esteja errado — é que a informação que
o comercial recolheu na visita ao cliente **não fica registada em lado nenhum**, e
operações refaz o levantamento do zero.

No ecrã, durante a reunião: o serviço `MODP — Mão de Obra Demolição de parede m²`
mostrava custo `8,50 €`, venda `12,14 €`, margem `29,98 %`. E mais nada.

---

## As quatro fases

O Rafael tinha apontado isto durante a chamada com o Ricardo. Mostrou o bloco de
notas no ecrã ([`notas-do-rafael-as-4-fases.jpg`](notas-do-rafael-as-4-fases.jpg)), transcrito à letra:

```
fase 1 do orçamento - delimitação( remover entulho, x sacos de entulho - rácio
demolição casa banho completa certa de 35 sacos de entulho. cada saco de entulho
20kg de lixo , proteção e isolamento da obra (área a intervir, proteção de portas,
qnt de mobiliário a proteger), automatizar tipo de serviço para tipo material.
so passas a fase 2 depois de concluir a fase 1
fase 2- instalações técnicas
fase 3- assentamentos, revestimentos etc
fase 4- acabamentos
```

| Fase | Conteúdo | Âmbito |
|---|---|---|
| **1 · Delimitação** | Demolição (se há, e que área), remoção de entulho, proteção e isolamento da obra: área a intervir, proteção de portas, quantidade de mobiliário a proteger | **agora** |
| 2 · Instalações técnicas | Águas, esgotos, eletricidade | depois |
| 3 · Assentamentos e revestimentos | — | depois |
| 4 · Acabamentos | — | depois |

O Ricardo quer só a fase 1 a funcionar, e depressa:

> «Ele simplesmente só quer para já meter esta primeira fase em andamento, o mais
> rápido possível, para vermos como é que nós conseguimos fazer.»
> — Rafael, 06:12

---

## Os requisitos

| Ref | Requisito | Origem |
|---|---|---|
| **R1** | O orçamento organiza-se em fases ordenadas, definidas pela organização | notas, fases 1–4 |
| **R2** | A fase 1 tem campos de preenchimento **obrigatório** antes de se avançar | 03:22 |
| **R3** | **Não se abre a fase 2** sem a fase 1 concluída | notas |
| **R4** | A partir dos valores preenchidos, o sistema **gera** as linhas de material e mão de obra | 03:41 |
| **R5** | A geração distingue **cenários**: demolir uma casa de banho inteira ≠ partir só uma parede | 04:06 |
| **R6** | As linhas geradas são **editáveis** e mostram **como** foram calculadas | derivado de R5 |
| **R7** | O levantamento **acompanha o orçamento até operações** | 06:00 |
| **R8** | Tudo **configurável por organização** — zero construção civil em código | 08:27 |

### R2 e R4, nas palavras do Rafael

> «Obrigatório os comerciais a preencherem esta primeira fase. Ou seja, o que é que
> é esta primeira fase? É meter os metros quadrados, por exemplo, da casa de banho,
> ou seja, a demolição — demolição é paredes — ok, neste X metemos desta casa 10
> metros quadrados, e automaticamente ele vai nos dar por exemplo todos os
> componentes para executar esse tipo de serviço, ou seja x sacos de entulho.»
> — Rafael, 03:22 → 03:57

### R5 — a objeção que o próprio Rafael levantou

Esta é a parte mais fácil de perder de vista, e foi ele que a levantou contra o
próprio pedido:

> «Tá bem, 10 metros quadrados de uma casa de banho, mas 10 metros quadrados eles
> podem só querer partir uma parede. Como é que aqui conseguimos fazer com que ele
> leia automaticamente e nos dê aqui o material necessário para demolir apenas uma
> parede? (…) A divisão toda não obriga a que seja tudo demolido, porque pode ser
> só uma troca de uma banheira para um poliban e simplesmente tem que se destruir
> só a banheira.»
> — Rafael, 04:06 → 04:40

**Um número de metros quadrados não chega para determinar o material.** É preciso
saber também *o que se vai fazer àquela área*. É daqui que nascem os cenários no
[`desenho.md`](desenho.md).

---

## A restrição que não se pode perder

Isto é um requisito de arquitetura, não um comentário de passagem. O Rafael fez
questão de o sublinhar:

> «O grande problema deste projeto é que não estamos aqui só para satisfazer as
> necessidades da Mudelar. (…) Queremos vender este nosso serviço a uma clínica
> veterinária. Para quê que ele quer isto? E isso tem que ser super configurável,
> para que ele monte a sua organização e use o nosso sistema — uma clínica
> veterinária, um restaurante, uma oficina. E já existe aqui muita coisa que é
> virada para a parte da construção, neste caso para a Mudelar. É tentarmos aqui
> conseguir balancear as coisas.»
> — Rafael, 08:27 → 09:12

Consequência prática: **"demolição", "sacos de entulho" e "m²" não podem aparecer
no código.** Entram como configuração da organização Mudelar. O que se constrói é
o motor; a Mudelar é só o primeiro a preenchê-lo.

---

## A abordagem que ficou combinada

Não é uma proposta por decidir — foi acordada na reunião. O Ruben trouxe-a de um
projeto anterior, de contentores de exportação de pedra, onde a tentativa de
encontrar *a* fórmula certa esbarrou na variedade real (tipos de pedra × tipos de
contentor × fornecedor):

> «Então o que é que eu pensei? A minha solução foi ter uma área de configuração de
> vários cenários. Aí deixamos o user configurar essa porcaria toda.»
> — Ruben, 08:14
>
> «É isso, é. Sim, sim, é isso que eu também acho que é o mais simples.»
> — Rafael, 08:22 → 08:24

Em vez de tentarmos adivinhar a fórmula por dentro, damos ao utilizador o sítio
para a exprimir. Isto resolve R5 e R8 ao mesmo tempo.

---

## O que ficou por responder na reunião

Duas coisas que o próprio Rafael deixou em aberto e que estão agora em
[`a-seguir.md § As decisões`](a-seguir.md#as-decisões):

1. **Os rácios reais.** Os 35 sacos são a única referência que existe, e não se
   sabe a que área correspondem. O Rafael disse explicitamente que ainda não tinha
   falado disto com o Ricardo (04:00).
2. **Como é que o comercial exprime o âmbito** sem ser em texto livre:
   > «Eles vão preencher campos, ou seja, metros quadrados (…) mas depois como é
   > que, se for campo de texto, ele vai ter que ler caracteres, para…»
   > — Rafael, 09:18 → 09:43
   >
   > «Eu vou pensar nisso, depois apresento-lhe uma proposta.» — Ruben, 09:52

   A resposta proposta são os cenários — escolha de uma lista, não texto livre.

---

## Nota sobre o resto da reunião

Os últimos ~6 minutos (10:20 em diante) não são sobre orçamentos. O Rafael mostrou
o módulo de inventário que tinha acabado — encomendas, armazéns, stocks, encomendas
de clientes, contagem de inventário — e disse que queria marcar uma reunião com o
Ruben e o Miguel ao voltar de férias, porque ainda não o tinha mostrado ao Ricardo
(10:28 → 10:40). O resto é conversa pessoal.

Esse módulo **não é lateral a este trabalho** — é onde vive a cadeia de compras
que o Orçamento V2 vai alimentar. Ver [`o-que-ja-existe.md`](o-que-ja-existe.md).

# Orçamento V2

> **Estado: por começar.** Preparado a 9 de setembro de 2026, a partir da reunião
> de 4 de setembro entre o Rafael e o Ruben. Nada disto está implementado — este
> conjunto de ficheiros existe para o trabalho poder arrancar amanhã sem ter de se
> voltar a ver a gravação.

Obrigar o comercial a **caracterizar a obra** antes de a orçamentar, e deixar o
sistema **derivar sozinho o material** que essa caracterização implica.

Pedido pelo Ricardo. O âmbito para já é **só a fase 1** — a delimitação.

---

## Em três linhas

1. O orçamento passa a ser feito por **fases de obra**, e a fase 1 tem campos de
   preenchimento obrigatório. Não se abre a fase 2 sem fechar a fase 1.
2. A partir do que o comercial preencher — área a demolir, portas a proteger,
   mobiliário a proteger — o sistema **gera as linhas de material**, com o rasto
   do cálculo à vista e edição por cima.
3. O que fica em código é o **motor**. "Demolição", "sacos de entulho" e "m²" são
   configuração da organização Mudelar, nunca literais no código.

---

## O que este trabalho **não** tem de construir

Este é o achado que mais muda o esforço, e vem do cruzamento com o que já existe
(detalhe em [`o-que-ja-existe.md`](o-que-ja-existe.md)):

| Já feito, e não é para refazer | Onde |
|---|---|
| **Comprar automaticamente o que falta.** Ao assinar o contrato (ou ao aceitar a proposta, conforme a definição da organização), o sistema lê as linhas do orçamento, agrupa por fornecedor preferencial e cria uma encomenda em rascunho por fornecedor. | `fn_contract_supplier_request` |
| **Dar baixa de stock automaticamente**, para os produtos marcados como geridos em stock. | `fn_contract_stock_deduction` |
| **Levantamento configurável por organização**, com campos tipados, medições e sector — já pensado para clínicas, restaurantes e oficinas. | `needs_assessment_*`, `DealNeedsSection.tsx` |

O Ruben perguntou se a parte de *calcular automaticamente o que é preciso comprar*
entrava neste trabalho. **Entra, mas quase toda já está feita** — pelo Rafael, no
ramo `feature/inventario`. O que o Orçamento V2 tem de fazer não é construir essa
cadeia: é **alimentá-la em condições**. Isso impõe quatro regras ao motor de
rácios que estão em [`desenho.md § O contrato com as compras`](desenho.md#o-contrato-com-as-compras)
e que, se forem ignoradas, fazem o material desaparecer em silêncio.

---

## O que falta mesmo

| # | Peça | Existe? |
|---|---|---|
| 1 | Fases ordenadas, obrigatórias, que bloqueiam a seguinte | **Não** |
| 2 | Levantamento ligado à fase e obrigatório dentro do orçamento | Metade — o levantamento existe, a ligação ao orçamento não |
| 3 | **Motor de rácios**: medida → quantidade de material | **Não.** É a única peça verdadeiramente nova |
| 4 | Rasto do cálculo visível na linha | **Não** |
| 5 | Fases e levantamento a acompanhar o orçamento até operações | **Não** |

---

## Os ficheiros

Quatro para **perceber**, três para **fazer**.

| Ficheiro | Para quê |
|---|---|
| [`o-que-foi-pedido.md`](o-que-foi-pedido.md) | O que o Ricardo pediu, em requisitos numerados, com a citação da reunião ao lado de cada um. A restrição de o produto não poder ficar preso à Mudelar. |
| [`o-que-ja-existe.md`](o-que-ja-existe.md) | O cruzamento com o código, verificado ficheiro a ficheiro. Inclui a cadeia de compras completa e três coisas que descobrimos e que ninguém tinha registado. |
| [`desenho.md`](desenho.md) | Como se faz: fases, cenários, motor de rácios, modelo de dados, exemplo trabalhado, e o contrato com as compras. |
| [`a-seguir.md`](a-seguir.md) | Por onde começar, por que ordem, o que custa, e as decisões que têm de estar fechadas antes de E1. |
| **[`validar.md`](validar.md)** | **Validar** — o guião de amanhã de manhã: o que perguntar ao Rafael, o que arrancar ao Ricardo, e as consultas SQL que confirmam que o catálogo está preparado. Três suposições por eliminar. |
| **[`desenvolver.md`](desenvolver.md)** | **Desenvolver** — as convenções reais do repositório: migrações, RLS, permissões, auditoria, registo de ecrãs, o mapa das 4 799 linhas do `QuoteBuilder.tsx`, e as regras do avaliador. |
| **[`teste-de-ponta-a-ponta.md`](teste-de-ponta-a-ponta.md)** | **Testar** — o guião A→G, escrito antes do código para servir de critério de aceitação. Inclui as consultas que apanham as falhas silenciosas. |

---

## Por onde começar amanhã

**Ler primeiro:** [`validar.md`](validar.md). É o que se faz de manhã, antes de
abrir o editor. Depois [`a-seguir.md`](a-seguir.md), que tem a ordem e o que
bloqueia o quê.

O dia parte-se em três:

| | O quê | Ficheiro |
|---|---|---|
| **Validar** | Rafael (integrar o inventário), Ricardo (os rácios), e quatro consultas SQL ao catálogo | [`validar.md`](validar.md) |
| **Desenvolver** | Ramo novo a partir do `main`, `quote_phases`, ecrã de fases — nada disto depende dos rácios | [`desenvolver.md`](desenvolver.md) |
| **Testar** | A e B fecham-se no primeiro dia; o resto acompanha as etapas | [`teste-de-ponta-a-ponta.md`](teste-de-ponta-a-ponta.md) |

**A primeira coisa a fazer não é código.** É a **E0** — arrancar ao Ricardo os
rácios reais. O guião está em [`validar.md`](validar.md). Os únicos números que temos são os das notas do Rafael durante a
chamada com ele: *35 sacos para uma casa de banho completa* e *saco de 20 kg* — e
não sabemos a que área correspondem esses 35 sacos. Sem isso, o motor não tem o que
testar e o resto do trabalho fica a assentar num número inventado.

**Ao mesmo tempo, e sem depender do Ricardo:** falar com o Rafael sobre o ramo
`feature/inventario`. São 70 commits dele, ainda fora do `main`, e tocam nos
mesmos ficheiros que o Orçamento V2 vai mexer — `QuoteBuilder.tsx` e
`AddItemsDialog.tsx`. Detalhe em [`a-seguir.md § Antes de abrir o editor`](a-seguir.md#antes-de-abrir-o-editor).

---

## Fonte

Gravação da reunião de 04/09/2026, 15m59s. Nesta pasta:

- [`transcricao-da-reuniao.txt`](transcricao-da-reuniao.txt) — transcrição
  completa com marcas de tempo. É a fonte de cada citação nestes ficheiros.
- [`notas-do-rafael-as-4-fases.jpg`](notas-do-rafael-as-4-fases.jpg) — o
  fotograma do bloco de notas que ele mostrou no ecrã, de onde saem as quatro
  fases e o rácio dos 35 sacos.

Os restantes 11 fotogramas do ecrã partilhado e o vídeo original ficaram fora do
repositório, por tamanho.

Todas as afirmações sobre o estado do código nestes ficheiros foram verificadas no
repositório a 09/09/2026, contra `origin/main` (`96cf1c6`) e
`origin/feature/inventario` (`6cca5ad`). Onde não foi possível verificar, está
escrito que não foi.

> ⚠ **Os números de linha envelhecem.** As referências a
> `QuoteBuilder.tsx:257` e afins valem para o `96cf1c6`. Se o `main` tiver
> andado, confirmar antes de confiar — o mapa em
> [`desenvolver.md`](desenvolver.md) diz o que procurar, e procurar pelo texto é
> mais seguro do que ir à linha.

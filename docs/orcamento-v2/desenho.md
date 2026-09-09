# Desenho

> Como se faz. Assenta no que ficou verificado em
> [`o-que-ja-existe.md`](o-que-ja-existe.md) — em especial no facto de a cadeia de
> compras já existir e ler as linhas do orçamento.

---

## Três peças

| Peça | O que é | Existe? |
|---|---|---|
| **A. Fases** | As secções do orçamento ganham ordem, obrigatoriedade e bloqueio | não |
| **B. Levantamento por fase** | Cada fase pede os campos que a organização definiu, e não fecha sem os obrigatórios | metade |
| **C. Motor de rácios** | Converte o que foi levantado em quantidades de material | **não — é o núcleo** |

Nenhuma delas conhece "demolição" ou "saco de entulho". Isso é configuração da
organização Mudelar (R8).

---

## A. Fases

Substituir a secção de texto livre por uma fase com identidade: nome, ordem, se é
obrigatória, e se bloqueia a seguinte. Definidas **por organização** — a Mudelar
cria as quatro dela; uma clínica veterinária cria as suas, ou nenhuma e o
orçamento continua a funcionar como hoje.

**Compatibilidade.** `quote_lines.section_name` fica onde está. A coluna nova
`phase_id` entra **a par**, não em substituição. Os 10 sítios do
`QuoteBuilder.tsx` que escrevem `"Geral"` continuam a funcionar, e um orçamento
antigo abre sem fase. Migrar os dados vem depois, com o resto já a correr.

---

## B. Levantamento por fase

Cada fase aponta para um template de levantamento
(`needs_assessment_templates`) — o mecanismo que já existe e já é multi-sector.

Para a fase 1 da Mudelar, os campos saem das notas do Rafael:

| Campo | Tipo | Obrigatório |
|---|---|---|
| Há demolição? | checkbox | sim |
| Área a demolir | número, m² | se houver demolição |
| Portas a proteger | número, un | sim |
| Mobiliário a proteger | número, un | sim |

Todos estes tipos já existem em `NeedsAssessmentConfig.tsx`. **Não há campos novos
a inventar** — há que ligar o template à fase e mostrá-lo dentro do orçamento,
herdando o que já tiver sido preenchido no negócio (`deal_needs`), já que
`quotes.deal_id` existe.

Enquanto os obrigatórios não estiverem preenchidos, a fase não fecha, e a seguinte
não abre (R2, R3).

---

## C. Motor de rácios

A peça nova. Um conjunto de regras, **por organização**, que transforma o que foi
levantado em quantidades.

### Cenários

Um cenário é a resposta à objeção que o Rafael levantou aos 04:06: 10 m² de casa de
banho podem ser a divisão inteira ou uma parede só, e o material é diferente.

Em vez de tentar adivinhar pela área, **o comercial escolhe o cenário de uma
lista** e mete a medida real. É a diferença entre um campo de texto que alguém
teria de interpretar — a preocupação dele aos 09:43 — e uma escolha fechada.

Para a Mudelar, na fase 1, algo como:

```
Casa de banho — remodelação completa
Casa de banho — substituição de banheira por poliban
Casa de banho — só substituição de loiças
Cozinha — remodelação completa
Parede isolada
```

Quem define esta lista é a Mudelar, no ecrã de configuração. Não vem em código.

### Regras

Cada regra tem quatro partes:

| Parte | O que é | Exemplo |
|---|---|---|
| **Condição** | quando é que a regra se aplica | `demolicao = sim` |
| **Expressão** | como se calcula a quantidade | `area_m2 * 70 / 20` |
| **Destino** | que produto ou serviço gera, e em que fase | produto `Saco de entulho 20 kg`, fase 1 |
| **Arredondamento** | como se fecha o número | para cima, inteiro |

O **arredondamento não é um detalhe**. Ver [§ O contrato com as compras](#o-contrato-com-as-compras)
— sem ele, o material é orçamentado e nunca comprado.

### Variáveis intermédias

Uma regra pode calcular variáveis antes de chegar à quantidade. É isto que permite
exprimir o rácio **como o Ricardo o descreve**: ele fala em peso — «cada saco de
entulho 20 kg de lixo» — e o que se compra são sacos.

Sem variáveis intermédias, quem configura teria de pré-calcular 3,5 sacos/m² de
cabeça e perder-se-ia a razão do número. Com elas, a configuração diz o que a
pessoa sabe: *quanto entulho é que um metro quadrado dá*, e *quanto leva um saco*.

### O avaliador

Gramática **fechada**: variáveis do levantamento, os quatro operadores, parênteses,
`min`/`max`/`ceil`/`floor`, e comparações na condição. **Nunca `eval`.**

Vale a pena ler `src/components/configurator-lab/RulesEditor.tsx` (541 linhas)
antes de escrever isto do zero — pode ser que se reaproveite. É a primeira tarefa
de E3.

---

## Exemplo trabalhado

Fase 1, cenário «Casa de banho — remodelação completa», 10 m².

Os rácios abaixo são **os das notas do Rafael, e estão por confirmar** — ver
decisão Q1 em [`a-seguir.md`](a-seguir.md).

```
LEVANTADO      demolicao = sim
               area_m2   = 10
               portas    = 2
               mobiliario = 4

CONHECIDO      casa de banho completa ≈ 35 sacos     (notas, por confirmar)
               1 saco = 20 kg                        (notas)

DERIVADO       entulho_kg = area_m2 × 70 = 700 kg

GERA           35 × Saco de entulho 20 kg        produto   ceil(700/20)
               10 × MODP Mão de Obra Demolição   serviço   area_m2
                2 × Proteção de porta            produto   portas
                4 × Proteção de mobiliário       produto   mobiliario

RASTO          "35 sacos = 700 kg ÷ 20 kg/saco, de 10 m² × 70 kg/m²"
```

O `70 kg/m²` sai de assumir que os 35 sacos correspondem a 10 m². **É exatamente
esta a suposição que a E0 tem de eliminar** — se os 35 sacos forem para 6 m², todo
o exemplo muda.

### O rasto não é decoração

É o que faz operações confiar no número, e o que permite ao comercial perceber
porque é que lhe apareceram 35 sacos — e corrigir, porque as linhas ficam
editáveis (R6). Um número que aparece sozinho e não se sabe explicar é um número
em que ninguém mexe e ninguém confia.

---

## O contrato com as compras

O motor de rácios **não gera linhas para o cliente ver: gera linhas que uma cadeia
automática a jusante vai ler**. Essa cadeia já existe e tem regras próprias
(verificadas em `20261115070000`, detalhe em
[`o-que-ja-existe.md § 3`](o-que-ja-existe.md#3-a-cadeia-de-compras--já-existe-e-é-a-resposta-à-pergunta-do-ruben)).

Estas quatro condições passam a ser **critério de aceitação do motor**:

| # | O motor tem de garantir | Senão |
|---|---|---|
| 1 | Tudo o que é para **comprar** sai como **produto**, não serviço | a cadeia faz `JOIN products` — o serviço é ignorado e nunca é comprado |
| 2 | As quantidades saem **inteiras** | `qt <> floor(qt)` → a linha é saltada **em silêncio** |
| 3 | As quantidades saem **> 0** | idem |
| 4 | Os produtos gerados têm **fornecedor preferencial** em `item_suppliers` | não entra em nenhuma encomenda, **em silêncio** |

As três "em silêncio" só deixam rasto em `workflow_execution_log`. Um orçamento
pode ficar aparentemente certo, ser aceite, e o material nunca ser encomendado.

**Consequências no desenho, já incorporadas:**

- O arredondamento é um **campo da regra**, obrigatório, não um comportamento
  implícito.
- "Saco de entulho", "proteção de porta" e "proteção de mobiliário" são
  **produtos**. Mão de obra é serviço.
- E0 tem de verificar que esses produtos existem no catálogo da Mudelar **com
  fornecedor preferencial**. É verificação de dados, não de código, e é barata —
  mas se falhar, o mecanismo não funciona e ninguém dá por isso.
- `products.manages_stock` decide se o material é comprado ou sai do stock. Quem
  configurar os produtos da fase 1 tem de o decidir por produto.

---

## Modelo de dados

Tabelas novas, todas com `organization_id` e RLS pelo mesmo padrão do resto do
sistema:

| Tabela | Guarda | Campos principais |
|---|---|---|
| `quote_phases` | As fases que uma organização usa | `nome`, `ordem`, `obrigatoria`, `bloqueia_seguinte`, `assessment_template_id` |
| `quote_scenarios` | Os cenários configuráveis | `nome`, `phase_id`, `descricao`, `ativo` |
| `quote_ratio_rules` | Condição → expressão → destino | `scenario_id`, `condicao`, `expressao`, `product_id \| service_id`, `unidade`, `arredondamento` |
| `quote_phase_inputs` | O que o comercial preencheu neste orçamento | `quote_id`, `phase_id`, `scenario_id`, `valores` (jsonb), `concluida_em` |

Em tabelas que já existem:

| Tabela | Alteração | Porquê |
|---|---|---|
| `quote_lines` | `+ phase_id`, `+ origem` (`manual`/`automatico`), `+ calculo_trace` | `section_name` fica e continua a funcionar |
| `quote_template_items` | `+ phase_id` | hoje **não tem secção nenhuma** — sem isto, os modelos rápidos ficam de fora das fases |

### Duas notas

**`quote_template_items` não tem secção.** Verificado no esquema: tem
`item_type`, `product_id`, `service_id`, `bundle_id`, `default_qt`, `ordem`,
`required` — e nada de `section_name`. Os "Modelos Rápidos" que aparecem no
construtor de orçamentos nascem, hoje, todos na mesma secção. É um buraco que já
existe e que as fases tornam visível.

**`origem` e `calculo_trace` servem a R6.** Sem elas não há como distinguir uma
linha que o motor gerou de uma que o comercial escreveu, nem como avisar antes de
um recálculo substituir uma edição manual.

# O que já existe, e o que falta mesmo

> Cruzamento do pedido com o código, **verificado a 09/09/2026** contra
> `origin/main` (`96cf1c6`) e `origin/feature/inventario` (`6cca5ad`).
> Cada linha diz onde foi confirmada. Onde não deu para confirmar, está escrito.
>
> Este ficheiro existe porque a primeira estimativa do trabalho estava errada por
> excesso: metade do que parecia ser para construir **já está construído**.

---

## Em três linhas

1. O **levantamento configurável por organização já existe** e já é multi-sector.
   Não há que reinventá-lo — falta ligá-lo às fases e ao orçamento.
2. A **cadeia de compras já existe e já funciona a partir das linhas do
   orçamento**. O Orçamento V2 não a constrói: alimenta-a. Mas alimentá-la tem
   regras, e três delas fazem material desaparecer em silêncio se forem ignoradas.
3. A única peça verdadeiramente nova é o **motor de rácios**: converter uma medida
   numa quantidade de material.

---

## 1. Levantamento de necessidades — existe e serve

O que se pensava ter de construir de raiz já lá está, e já é genérico. Isto responde
sozinho a boa parte do R8.

| O que é | Onde |
|---|---|
| Templates de levantamento por organização, com campos tipados: texto, número, dropdown, checkbox, data, texto longo, ficheiro | `src/pages/NeedsAssessmentConfig.tsx` (851 linhas) |
| Tabelas: templates, campos do template, configuração dos campos, definições da organização | `needs_assessment_templates`, `needs_assessment_template_fields`, `needs_assessment_field_configs`, `needs_assessment_settings` |
| Onde os valores ficam guardados | `deal_needs.measurement_values`, `.measurements`, `.custom_fields`, `.checklist` |
| Medições com campos próprios, separadas dos campos gerais | `needs_assessment_templates.measurement_field_ids`, `show_measurements_tab` |
| Ecrã onde o comercial preenche | `src/components/deals/DealNeedsSection.tsx` (2 013 linhas) |

**O ponto que fecha a discussão do R8:** os templates de origem já cobrem 16
sectores, e incluem à letra os três exemplos que o Rafael deu como preocupação.
Em `DealNeedsSection.tsx:205–220`:

```
Remodelação · Construção Nova · Manutenção · Consultoria · Design/Criativo ·
Tecnologia/Software · Saúde/Clínica · Educação/Formação · Restauração/Catering ·
Logística/Transporte · Imobiliário · Energia/Climatização · Automóvel ·
Segurança · Ambiente/Jardins · Industrial
```

Cada um com `sector`, e uma marca de se usa medições. A clínica veterinária, o
restaurante e a oficina já estão previstos no modelo. **A generalidade não é um
requisito por cumprir — é um investimento já feito que não se pode estragar.**

**O que falta aqui:** o levantamento vive no **negócio** (`deal_needs`), não no
orçamento, e não tem noção de fase nem de obrigatoriedade que trave o avanço.

---

## 2. Secções do orçamento — existem, mas são só texto

| O que é | Onde |
|---|---|
| Coluna onde a secção fica guardada, texto livre, aceita nulo | `quote_lines.section_name` (`text | null`) |
| Estado no construtor, nasce com uma secção chamada `"Geral"` | `QuoteBuilder.tsx:257` |
| Desenho das secções, com subtotal e margem por secção | `QuoteBuilder.tsx:3891` em diante |
| Botão "Nova Secção" | `QuoteBuilder.tsx:3802` e `:4378` |
| O nome da secção é um `input` editável à mão, e renomear reescreve todas as linhas | `QuoteBuilder.tsx:3844–3852` |

O literal `"Geral"` aparece em **18 sítios** do `QuoteBuilder.tsx` como valor por
omissão. Uma secção não tem ordem, nem obrigatoriedade, nem identidade — duas
secções com o mesmo nome são a mesma secção.

**O que falta:** tudo o que faz de uma secção uma fase — ordem, obrigatoriedade,
bloqueio da seguinte, e uma identidade estável que não seja o nome.

---

## 3. A cadeia de compras — **já existe, e é a resposta à pergunta do Ruben**

A pergunta era se «aquela parte de calcular automaticamente o que é preciso
comprar/produzir» entrava neste trabalho. Entra — mas está quase toda feita, pelo
Rafael, e o gatilho dela são **as linhas do orçamento**.

### Como funciona hoje

Quando um contrato é assinado — ou uma proposta é aceite, conforme a organização
escolher em `organization_inventory_settings.stock_deduction_trigger`
(`'contract_signed'` por omissão, ou `'proposal_accepted'`) — quatro *triggers*
correm sobre as linhas do orçamento associado:

| Função | O que faz |
|---|---|
| `fn_contract_supplier_request` | Percorre as `quote_lines`, agrupa por **fornecedor preferencial** e cria **uma encomenda em rascunho por fornecedor** (`purchase_orders` + `purchase_order_items`) |
| `fn_contract_stock_deduction` | Dá baixa em stock dos produtos geridos em stock (`stock_movements`) |
| `fn_*_cancelled_stock_reversal` | Reverte a baixa se o contrato for cancelado ou a proposta rejeitada |
| `fn_*_cancelled_supplier_request_reversal` | Reverte o pedido ao fornecedor |

A consulta que seleciona o que se compra, em
`20261115070000_contract_signed_supplier_purchase_order_request.sql:259–266`:

```sql
SELECT ql.id, ql.product_id, ql.qt, p.name, p.sku
FROM public.quote_lines ql
JOIN public.products p ON p.id = ql.product_id
WHERE ql.quote_id = NEW.quote_id
  AND ql.product_id IS NOT NULL
  AND p.manages_stock = false
```

O encaminhamento é decidido por `products.manages_stock`
(`boolean NOT NULL DEFAULT false`, criado em `20261115040000`):

- **`false`** → compra-se ao fornecedor (encomenda em rascunho)
- **`true`** → dá-se baixa do stock existente

### As quatro regras que o motor de rácios tem de respeitar

Estas saem da leitura do código, não de suposição, e **três delas falham em
silêncio** — a linha é ignorada e fica só um registo em `workflow_execution_log`:

| # | Regra | O que acontece se falhar | Onde |
|---|---|---|---|
| 1 | A linha tem de ter **`product_id`**. A consulta faz `JOIN products` — **os serviços são ignorados** pela cadeia de compras | O material nunca é comprado | linha 263 |
| 2 | A quantidade tem de ser **inteira**. `IF v_line.qt <> floor(v_line.qt)` → salta a linha | Silêncio, com `reason: 'fractional_quantity'` | linha 281 |
| 3 | A quantidade tem de ser **> 0** | Silêncio, com `reason: 'quantity_null_or_not_positive'` | linha 268 |
| 4 | O produto tem de ter **fornecedor preferencial** em `item_suppliers` | Silêncio, com `reason: 'no_preferred_supplier'` | linha 295 |

**A regra 2 é a que mais interessa a este trabalho.** Um rácio dá quase sempre um
número partido: 10 m² × 3,5 = 35 está bem, mas 9,8 m² × 3,5 = 34,3 sacos entra na
linha, aparece no orçamento, é cobrado ao cliente — e **nunca é comprado**, sem
erro nenhum à vista. É por isso que o arredondamento é um campo da regra no
[`desenho.md`](desenho.md), e não um detalhe de implementação.

**A regra 1 muda uma decisão de modelação.** "Saco de entulho" tem de ser um
**produto**, não um serviço, ou nunca é comprado. A mão de obra de demolição
continua a ser serviço — essa não se compra.

### O que existe onde

| Peça | `main` | `feature/inventario` |
|---|---|---|
| `products.manages_stock`, `organization_inventory_settings` | ✅ | ✅ |
| `purchase_orders`, `purchase_order_items`, `stock_movements`, `stocks`, `warehouses`, `suppliers`, `item_suppliers` | ✅ | ✅ |
| Ecrãs `PurchaseOrders`, `Stocks`, `Suppliers`, `Warehouses` | ✅ | ✅ |
| Ecrãs `ClientOrders` (Encomendas Clientes), `StockCounts` (Contagem de Inventário) | ❌ | ✅ |
| SQL de `fn_contract_supplier_request` | ⚠ ver §6 | ✅ |

### Produzir

**Não existe.** Não há ordem de produção, ordem de fabrico nem lista de materiais
no modelo — as tabelas de inventário são `purchase_orders`, `stock_movements`,
`stocks`, `warehouses`, `suppliers`, `item_suppliers`. Um material ou se compra ao
fornecedor ou sai do stock. Se a Mudelar produzir alguma coisa internamente, isso
não está modelado em lado nenhum e é uma pergunta para o Ricardo — está em
[`a-seguir.md`](a-seguir.md) como decisão **Q6**.

---

## 4. Bundles — perto, mas não chegam

`bundles` + `bundle_components` já agrupam produtos e serviços, com grupos de
escolha e três modos de preço.

**Porque não servem:** `bundle_components.quantity` é um **número fixo**. Um bundle
sabe dizer "isto leva 3 daquilo", mas não sabe dizer "isto leva 3,5 daquilo **por
metro quadrado**". Não há em lado nenhum no esquema um conceito de rácio, rendimento
ou consumo por unidade de medida — procurado e não encontrado.

Os bundles continuam úteis como **destino** de uma regra ("este cenário adiciona o
bundle X"), mas não como o mecanismo de cálculo.

---

## 5. Configurador — o avaliador de regras pode servir de base

Em `src/components/configurator-lab/` (2 938 linhas) há já um editor de regras
(`RulesEditor.tsx`, 541 linhas), um painel de medidas (`MeasureSlotPanel.tsx`) e
escalões de preço por dimensão (`product_attribute_price_ranges`, com
`min_width`/`max_height`/`price_per_unit`).

É a coisa mais próxima de um motor que existe no repositório. **Vale a pena ler
antes de escrever o avaliador do Orçamento V2** — pode ser que se reaproveite a
gramática em vez de inventar outra. Não fiz essa avaliação a fundo; fica como
primeira tarefa de E3.

---

## 6. Três coisas que descobrimos e que ninguém tinha registado

Nenhuma destas estava no pedido. Saíram do cruzamento e afetam o planeamento.

### 6a. O SQL "perdido" do `main` não está perdido — está no ramo do Rafael

O `main` tem quatro migrações substituídas por marcadores vazios chamados
`orfa_aplicada_fora_do_fluxo.sql`, criados pelo Miguel a 28/08
(`11e015f`). O texto do marcador diz:

> «O SQL desta migration NÃO existe neste repositório. (…) o ficheiro nunca foi
> commitado, **em ramo nenhum**. (…) enquanto o SQL real não for recuperado e
> commitado aqui, uma base reconstruída do zero fica SEM os objectos que esta
> migration criou. É dívida por fechar, não um estado aceitável.»

**Foi commitado, sim — no mesmo dia, no ramo do Rafael.** Os quatro marcadores têm
correspondência exata de timestamp em `origin/feature/inventario`:

| Marcador no `main` | Ficheiro real em `feature/inventario` |
|---|---|
| `20261115060000_orfa…` | `20261115060000_fix_sale_stock_movement_organization_and_contract_signed_integration.sql` |
| `20261115070000_orfa…` | `20261115070000_contract_signed_supplier_purchase_order_request.sql` |
| `20261115080000_orfa…` | `20261115080000_contract_quote_id_fallback_via_proposal.sql` |
| `20261115090000_orfa…` | `20261115090000_supplier_request_purchase_price_fallback.sql` |

O commit do Rafael é `f62446e`, de **28/08** — o mesmo dia em que o Miguel escreveu
que não existia em ramo nenhum. Cada um estava no seu ramo.

**Não confirmei que o SQL do ramo é byte a byte o que está aplicado na base
remota** — não tenho acesso à base. Mas é o mesmo timestamp, do mesmo autor, sobre
o mesmo assunto. Confirmar isso e fechar a dívida é barato, e está em
[`a-seguir.md`](a-seguir.md) como tarefa de E0.

### 6b. O `feature/inventario` toca nos mesmos ficheiros do Orçamento V2

São **70 commits do Rafael** fora do `main`. Entre eles:

```
src/components/QuoteBuilder.tsx          |  30 ++++-
src/components/quote/AddItemsDialog.tsx  | 221 +++++++++++++++++++++++++++---
```

São exatamente os dois ficheiros que o Orçamento V2 vai reescrever. Começar antes
de integrar é garantir um conflito grande no ficheiro de 4 799 linhas do sistema.

### 6c. O ramo `feature/operacoes` está 220 commits atrás do `main`

É o ramo em que a pasta está neste momento. Está 203 atrás e 64 à frente. **O
Orçamento V2 não deve começar aqui** — deve sair de `main` atualizado, depois do
`feature/inventario` entrar.

---

## O resumo: o que falta mesmo

| # | Peça | Estado | Nota |
|---|---|---|---|
| 1 | Fases ordenadas, obrigatórias, que bloqueiam a seguinte | **Falta tudo** | as secções de hoje não servem de base |
| 2 | Levantamento por fase, obrigatório, dentro do orçamento | **Metade** | o mecanismo existe no negócio; falta fase, obrigatoriedade e ligação ao orçamento |
| 3 | **Motor de rácios** — medida → quantidade | **Falta tudo** | a única peça verdadeiramente nova |
| 4 | Rasto do cálculo na linha | **Falta tudo** | `quote_lines` não tem onde o guardar |
| 5 | Fases e levantamento a chegar a operações | **Falta tudo** | |
| 6 | Comprar automaticamente o que falta | **Feito** | só há que alimentar em condições |
| 7 | Dar baixa de stock | **Feito** | idem |
| 8 | Levantamento configurável e multi-sector | **Feito** | não estragar |
| 9 | Produzir internamente | **Não existe, e não está pedido** | decisão Q6 |

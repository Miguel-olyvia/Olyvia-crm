# Testar de ponta a ponta

> O guião para provar que o Orçamento V2 funciona — e, sobretudo, que **encaixa
> na cadeia que já existe**. Escrito antes do código, para servir de critério de
> aceitação e não de relatório do que calhou funcionar.
>
> Cada parte diz o que se faz, o que tem de acontecer, e **como se sabe que
> falhou** — que neste trabalho é a parte difícil, porque metade das falhas são
> silenciosas.

---

## ⚠ Antes de começar: a base é a de verdade

O CRM tem um único Supabase. Um deploy de ramo no Vercel dá um endereço próprio,
mas **fala com a mesma base que a produção**.

Nas tabelas novas (`quote_phases`, `quote_scenarios`, `quote_ratio_rules`,
`quote_phase_inputs`) isso é inofensivo — são novas e ninguém as usa. O cuidado é
com as **duas portas que dão para o resto do sistema**:

| Porta | O que pode acontecer sem querer |
|---|---|
| **Aceitar uma proposta / assinar um contrato** | dispara a dedução de stock e **cria encomendas a fornecedores a sério** |
| **Enviar o orçamento ao cliente** | o botão "Guardar e Enviar ao Cliente" manda email mesmo |

**Regra para todo este guião:** usar um cliente de teste, e nunca carregar em
enviar. Na parte F, que tem mesmo de aceitar uma proposta, ver o aviso lá.

---

## Onde testar

Vercel → o projeto → **Deployments** → a entrada `feature/orcamento-v2` → **Visit**.

```
https://olyvia-crm-git-feature-orcamento-v2-<equipa>.vercel.app
```

A produção (`www.olyvia-ai.com`) continua a servir o `main`.

---

## A. As fases existem e ordenam-se

1. Entrar como administrador da Mudelar. Abrir a configuração de fases.
2. Criar as quatro: Delimitação, Instalações técnicas, Assentamentos e
   revestimentos, Acabamentos.
3. Trocar a ordem de duas e recarregar a página.

| Tem de acontecer | Falhou se |
|---|---|
| As quatro aparecem pela ordem definida | a ordem se perde ao recarregar — `ordem` não está a ser gravada |
| Um orçamento novo mostra as quatro | mostra "Geral" — o construtor ainda lê `section_name` |

**A verificação que se esquece:** abrir um **orçamento antigo**, de antes deste
trabalho. Tem de abrir e mostrar as linhas como sempre. Se rebentar, o `phase_id`
foi posto no lugar do `section_name` em vez de a par dele.

---

## B. Outra organização não vê as fases da Mudelar

Entrar com um utilizador de outra organização e abrir um orçamento.

| Tem de acontecer | Falhou se |
|---|---|
| Não vê as fases da Mudelar | vê — a RLS de `quote_phases` está mal |
| O orçamento funciona à mesma, sem fases | rebenta — as fases não podem ser obrigatórias no código |

Isto testa o R8 do lado que ninguém se lembra: uma organização **sem** fases tem
de continuar a orçamentar como antes.

---

## C. O levantamento é obrigatório e bloqueia

1. Orçamento novo, cliente de teste, fase 1.
2. Deixar a área em branco e tentar avançar para a fase 2.
3. Preencher: demolição sim, 10 m², 2 portas, 4 móveis. Avançar.

| Tem de acontecer | Falhou se |
|---|---|
| Com campos por preencher, a fase 2 não abre (R3) | abre — o bloqueio não está ligado |
| A razão está à vista, com os campos que faltam | só diz "erro" |
| Preenchido, a fase 2 abre | continua bloqueada — a fase não está a fechar |

**Guardar em rascunho com a fase incompleta tem de funcionar.** O bloqueio é ao
avançar, não ao gravar — é a mitigação do risco do comercial que ainda não tem a
medida (ver [`a-seguir.md § Riscos`](a-seguir.md#riscos)). Se não deixar gravar, o
comercial perde o trabalho e deixa de usar.

**Herança:** se o orçamento vier de um negócio que já tinha levantamento, os
valores aparecem preenchidos. Vazios = a herança por `quotes.deal_id` não está a
correr.

---

## D. O motor de rácios calcula, e mostra porquê

Com o cenário «Casa de banho — remodelação completa» configurado com os rácios
reais da E0 — **não com os 35 sacos supostos deste documento**.

1. Fase 1 preenchida como em C. Calcular.

| Tem de acontecer | Falhou se |
|---|---|
| Aparecem as linhas de material e mão de obra | nada aparece — nenhuma regra deu condição verdadeira |
| Cada linha gerada está marcada como automática | não se distingue de uma escrita à mão |
| Cada linha mostra o rasto do cálculo (R6) | não mostra — falha o R6, e operações não vai confiar |
| Editar a quantidade à mão funciona | não deixa |
| Recalcular **avisa** antes de substituir uma edição manual | substitui em silêncio — o comercial perde trabalho sem saber |

### D1. As quantidades nunca são fracionárias ⚠

**O teste mais importante de todos, porque a falha é silenciosa.**

Repetir com uma área que dê número partido — 9,8 m², ou o que der partido com os
rácios reais.

| Tem de acontecer | Falhou se |
|---|---|
| Todas as linhas com produto têm quantidade **inteira** | aparece `34,3` — a cadeia de compras vai saltar a linha **sem erro nenhum** e o material nunca é comprado |

Confirma-se à vista no orçamento, e na base:

```sql
select ql.qt, p.name
from public.quote_lines ql
join public.products p on p.id = ql.product_id
where ql.quote_id = '<orcamento de teste>'
  and ql.qt <> floor(ql.qt);
```

**Tem de devolver zero linhas.**

### D2. O que se compra é produto, não serviço

```sql
select ql.product_id, ql.service_id, ql.descricao_snapshot, ql.qt
from public.quote_lines ql
where ql.quote_id = '<orcamento de teste>'
order by ql.ordem;
```

Os materiais (sacos, proteções) têm de ter `product_id` preenchido. Se um material
aparecer com `service_id`, **nunca será comprado** — a cadeia faz `JOIN products`.
Mão de obra com `service_id` está correto.

---

## E. Um cenário de outro sector, sem tocar em código

**O teste que prova o R8** — a restrição que o Rafael fez questão de sublinhar
(transcrição, 08:27).

Numa organização de teste que não seja a Mudelar, configurar do zero: uma fase, um
cenário e uma regra de outro sector. Uma oficina serve: *revisão de travões* →
`4 × pastilha` por eixo.

| Tem de acontecer | Falhou se |
|---|---|
| Dá para montar tudo pela interface | é preciso editar código, SQL ou uma lista fixa |
| Nenhum termo de construção civil aparece no ecrã | aparece "demolição", "entulho" ou "m²" fixo |

Se isto falhar, ficámos presos à Mudelar e é exatamente o que não se podia fazer.

---

## F. O encaixe com as compras — o teste que fecha tudo

**É esta parte que prova que o Orçamento V2 alimenta bem o que o Rafael já
construiu.** Sem ela, o resto pode estar todo verde e o material continuar a não
ser comprado.

> ⚠ **Aceitar a proposta cria encomendas a fornecedores a sério.** Usar cliente e
> fornecedor de teste, e ir apagar os rascunhos gerados no fim. Confirmar antes,
> na `organization_inventory_settings`, se a organização dispara em
> `contract_signed` ou `proposal_accepted` — é isso que decide o passo 2.

1. Pegar no orçamento da parte D, com o material gerado pelo motor.
2. Aceitar a proposta ou assinar o contrato, conforme o gatilho da organização.
3. Ir a **Encomendas** (`PurchaseOrders`).

| Tem de acontecer | Falhou se |
|---|---|
| Aparece uma encomenda **em rascunho** por fornecedor | não aparece nada — ver a consulta abaixo |
| Os sacos de entulho lá estão, na quantidade gerada | falta um material — foi saltado em silêncio |
| Produtos com `manages_stock = true` saem do stock em vez de encomenda | ver `stock_movements` |

**Quando não aparece nada, a resposta está aqui** — é o único sítio onde as falhas
silenciosas deixam rasto:

```sql
select created_at, details
from public.workflow_execution_log
where details::text ilike '%quantity%'
   or details::text ilike '%supplier%'
order by created_at desc
limit 20;
```

| `reason` | O que corrigir |
|---|---|
| `fractional_quantity` | o arredondamento da regra — falhou o D1 |
| `no_preferred_supplier` | falta `is_preferred = true` em `item_suppliers` (validação 3b) |
| `quantity_null_or_not_positive` | a expressão da regra deu zero ou negativo |
| *(nada, e mesmo assim sem encomenda)* | o material saiu como serviço — falhou o D2 |

**Limpar no fim:** apagar as encomendas em rascunho e reverter o contrato de teste.

---

## G. Chega a operações

1. No orçamento aceite, abrir a proposta, o contrato e a ordem de trabalho.
2. Gerar o PDF.

| Tem de acontecer | Falhou se |
|---|---|
| As fases e os valores levantados acompanham | operações continua a receber só uma lista de linhas — falha o R7, que é o problema de origem (transcrição, 06:00) |
| O PDF mostra as fases | sai tudo numa lista corrida |

---

## Lista de verificação

```
A  fases criam-se, ordenam-se, e um orçamento antigo continua a abrir
B  outra organização não as vê, e orçamenta à mesma sem fases
C  levantamento obrigatório bloqueia o avanço, mas deixa gravar rascunho
D  motor calcula, marca as linhas e mostra o rasto
D1 ⚠ nenhuma quantidade fracionária          ← falha em silêncio
D2 ⚠ material é produto, não serviço          ← falha em silêncio
E  cenário de outro sector sem tocar em código (R8)
F  ⚠ encomenda ao fornecedor aparece com o material gerado
G  fases e levantamento chegam a operações e ao PDF
```

**Se só houver tempo para um: o F.** É o único que testa as duas metades juntas, e
é onde as falhas silenciosas aparecem.

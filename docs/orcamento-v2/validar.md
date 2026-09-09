# Validar, antes de escrever código

> Para correr **amanhã de manhã**. Três conversas e uma verificação de dados.
> Nenhuma delas demora muito, e todas custam mais depois do que agora.
>
> O objetivo não é aprovar o plano — é **eliminar as suposições**. Neste momento
> há três, e estão marcadas com ⚠ ao longo destes ficheiros.

---

## As suposições que temos de eliminar

| # | Suposição | Onde entrou | Quem a elimina |
|---|---|---|---|
| S1 | Os 35 sacos de entulho correspondem a **10 m²** | exemplo do [`desenho.md`](desenho.md) — é uma invenção nossa, o Rafael nunca disse a área | Ricardo |
| S2 | Os materiais da fase 1 existem no catálogo **como produtos, com fornecedor preferencial** | [`desenho.md § contrato com as compras`](desenho.md#o-contrato-com-as-compras) | uma consulta à base, ver §3 |
| S3 | O SQL das 4 migrações órfãs do `main` é o que está aplicado no Supabase | [`o-que-ja-existe.md § 6a`](o-que-ja-existe.md#6a-o-sql-perdido-do-main-não-está-perdido--está-no-ramo-do-rafael) | quem tiver acesso ao Supabase |

---

## 1. Com o Rafael — hoje ou amanhã cedo

Ele voltou de férias a 9. Na reunião disse que queria marcar uma reunião com o
Ruben e o Miguel para mostrar o módulo de inventário, que ainda não mostrou ao
Ricardo (transcrição, 10:28 → 10:40). **É essa reunião.**

**A decidir:**

- [ ] **Quando entra o `feature/inventario` no `main`.** São 70 commits e tocam no
      `QuoteBuilder.tsx` e no `AddItemsDialog.tsx` — os dois ficheiros que o
      Orçamento V2 vai reescrever. Enquanto não entrar, não se começa.
- [ ] **As 4 migrações órfãs (S3).** Mostrar-lhe a correspondência de timestamps de
      [`o-que-ja-existe.md § 6a`](o-que-ja-existe.md#6a-o-sql-perdido-do-main-não-está-perdido--está-no-ramo-do-rafael)
      e confirmar com ele que o SQL do ramo é o que correu na base a 28/08. Ele é o
      autor — sabe de cor.
- [ ] **Dizer-lhe o que descobrimos sobre a cadeia de compras.** Ele construiu-a;
      confirmar com ele que as quatro regras que lemos no SQL são mesmo as que
      valem, e que não há mais nenhuma que nos escape.
- [ ] **Confirmar o desenho das fases com ele**, já que vai pegar nisto quando o
      trabalho avançar.

---

## 2. Com o Ricardo — o bloqueante

Sem isto, a E3 não tem o que testar e o motor fica a assentar num número inventado.

### Os rácios ⚠ S1

- [ ] **Os 35 sacos são para que área?** É a pergunta que desbloqueia tudo o resto.
      O Rafael apontou «casa de banho completa ≈ 35 sacos» e «saco = 20 kg», mas
      nunca disse os metros quadrados. O Ricardo também ainda não tinha sido
      questionado sobre isto (transcrição, 04:00).
- [ ] **A lista de cenários da fase 1.** Casa de banho completa, troca de banheira
      por poliban, só loiças, cozinha, parede isolada — quais são mesmo?
- [ ] **O rácio de cada cenário, e a medida a que se refere.** Por m²? Por divisão?
      Por unidade?
- [ ] **Os campos exatos da fase 1.** A proposta está no
      [`desenho.md § B`](desenho.md#b-levantamento-por-fase) e sai das notas dele:
      há demolição, área, portas a proteger, mobiliário a proteger. Falta alguma?

### As decisões de comportamento

As seis perguntas com recomendação estão em
[`a-seguir.md § As decisões`](a-seguir.md#as-decisões). As que precisam mesmo dele:

- [ ] **Q2** — o bloqueio da fase seguinte impede, ou só avisa?
- [ ] **Q3** — as fases valem para todos os orçamentos, ou só para alguns tipos de trabalho?
- [ ] **Q5** — quem pode editar uma linha gerada automaticamente?
- [ ] **Q6** — a Mudelar produz alguma coisa internamente? *(não urgente, mas convém saber cedo)*

### Uma coisa a avisar, não a perguntar

- [ ] Que **o material pode ser orçamentado e nunca comprado** se os produtos não
      estiverem bem preparados no catálogo — e que a §3 abaixo é o que evita isso.
      É um risco de dados, não de código, e é dele a decisão de quem o corrige.

---

## 3. Na base de dados — a verificação que ninguém se lembra de fazer ⚠ S2

Esta é a que mais provavelmente falha **sem ninguém dar por isso**. A cadeia de
compras salta em silêncio qualquer linha que não cumpra as quatro regras, deixando
só um registo em `workflow_execution_log`.

Correr contra o Supabase, com o `organization_id` da Mudelar. Substituir a lista de
nomes pelos materiais reais que saírem da conversa com o Ricardo.

### 3a. Os materiais da fase 1 existem, e são produtos?

```sql
select p.id, p.sku, p.name, p.manages_stock
from public.products p
where p.organization_id = '<mudelar>'
  and (p.name ilike '%entulho%'
    or p.name ilike '%prote%porta%'
    or p.name ilike '%prote%mobili%')
order by p.name;
```

**Se não devolver nada:** os materiais não existem como produtos. Podem existir
como *serviços* — e aí a cadeia de compras ignora-os, porque faz `JOIN products`.
É preciso criá-los como produtos.

### 3b. Têm fornecedor preferencial?

Sem isto, o produto entra no orçamento e **nunca entra em encomenda nenhuma**.

```sql
select p.sku, p.name,
       s.name as fornecedor,
       isup.purchase_price
from public.products p
left join public.item_suppliers isup
       on isup.product_id = p.id
      and isup.is_preferred = true
      and isup.deleted_at is null
left join public.suppliers s on s.id = isup.supplier_id
where p.organization_id = '<mudelar>'
  and p.name ilike '%entulho%';
```

**Se `fornecedor` vier a null:** falta marcar o fornecedor preferencial em
`item_suppliers`. É configuração, não código.

### 3c. O `manages_stock` está como deve ser?

Decide o caminho de cada material:

| `manages_stock` | O que acontece ao assinar o contrato |
|---|---|
| `false` *(por omissão)* | cria encomenda ao fornecedor |
| `true` | dá baixa do stock existente |

- [ ] Para cada material da fase 1, confirmar com o Ricardo **qual dos dois** é o
      correto. Sacos de entulho compram-se a cada obra? Ou há stock em armazém?

### 3d. Como está configurado o gatilho da organização

```sql
select organization_id, stock_deduction_trigger, default_warehouse_id
from public.organization_inventory_settings
where organization_id = '<mudelar>';
```

Se não devolver linha, a organização está no valor por omissão:
`contract_signed`. Interessa saber porque define **quando** é que o material
gerado pelo motor de rácios se transforma em encomenda — ao assinar o contrato ou
ao aceitar a proposta.

---

## 4. No código — meia hora que pode poupar dias

- [ ] **Ler `src/components/configurator-lab/RulesEditor.tsx`** (541 linhas) e
      decidir se a gramática de regras se reaproveita para o motor de rácios, ou
      se é mais barato escrever de raiz. É a primeira tarefa da E3 e a resposta
      muda o custo da etapa.
- [ ] **Confirmar que o `main` já não tem migrações órfãs** depois de o
      `feature/inventario` entrar:
      ```bash
      git ls-tree --name-only -r origin/main supabase/migrations/ | grep orfa
      ```
      Se devolver alguma coisa, a dívida ainda está aberta.

---

## O que se pode começar sem esperar por ninguém

Se a conversa com o Ricardo escorregar, isto avança à mesma, porque **não depende
dos rácios**:

- A tabela `quote_phases` e o ecrã de administração das fases (E1). As fases da
  Mudelar são conhecidas — estão nas notas.
- Ligar o levantamento que já existe às fases (E2). Os tipos de campo já existem
  todos em `NeedsAssessmentConfig.tsx`.

O que **não** se pode começar sem os rácios é a E3, porque não haveria com que
testar o motor — só com números que inventámos.

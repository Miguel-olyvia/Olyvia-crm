# Desenvolver

> As convenções do repositório, lidas no código a 09/09/2026, para não se
> descobrirem a meio. O [`desenho.md`](desenho.md) diz **o quê**; este ficheiro
> diz **como se escreve aqui**.

---

## Antes da primeira linha

```bash
cd Olyvia-crm
git fetch --all --prune
git checkout main && git pull          # depois de o feature/inventario entrar
git checkout -b feature/orcamento-v2
npm install
```

**Não sair de `feature/operacoes`** — está 220 commits atrás do `main`.

Não há script de testes no `package.json` do CRM (só `dev`, `build`, `build:dev`,
`lint`, `preview`), mas o `vitest` e o `@playwright/test` estão instalados:

```bash
npx vitest run          # unitários
npx playwright test     # ponta a ponta, em tests/e2e
npm run lint
npm run build
```

---

## Migrações

### Nome e ordem

`supabase/migrations/AAAAMMDDHHMMSS_descricao_em_snake_case.sql`. O timestamp é a
ordem de aplicação.

⚠ **Confirmar sempre o próximo timestamp livre com `supabase migration list`
antes de escrever o ficheiro.** Já aconteceu três vezes neste repositório
alguém aplicar uma migração fora do fluxo e colidir com um timestamp planeado —
é a origem das quatro órfãs do `main`. Está registado dentro da própria migração
`20261116020000`, na "NOTA DE TIMESTAMP".

### O cabeçalho

Convenção forte aqui e vale a pena respeitá-la: um comentário no topo que diz **o
que a migração cria**, **porquê**, e **que decisões foram tomadas que não estavam
explícitas no pedido**. `20261116020000_inventory_counts_foundation.sql` é o melhor
exemplo — tem uma secção "Decisões tomadas que não estavam 100% explícitas" com
cada uma numerada e justificada.

Não é burocracia: é o que permitiu, hoje, perceber a cadeia de compras inteira sem
falar com quem a escreveu.

### Criar tabela

Padrão real, de `20261116020000`:

```sql
CREATE TABLE public.quote_phases (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
    nome            text NOT NULL,
    ordem           integer NOT NULL,
    obrigatoria     boolean NOT NULL DEFAULT true,
    bloqueia_seguinte boolean NOT NULL DEFAULT true,
    assessment_template_id uuid REFERENCES public.needs_assessment_templates(id),
    is_active       boolean NOT NULL DEFAULT true,
    created_by      uuid NOT NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT quote_phases_org_ordem_unique UNIQUE (organization_id, ordem)
);
```

Notas do padrão: `organization_id` sempre presente e sempre com FK para
`anew_organizations`; `created_by` para `anew_users` com `ON DELETE SET NULL`;
`timestamptz` e não `timestamp`; `UNIQUE` por organização, **nunca global**.

### RLS

Obrigatória em toda a tabela nova. Duas funções fazem o trabalho:

- `get_user_visible_org_ids(auth.uid())` — o âmbito de organizações do utilizador
- `has_anew_permission(auth.uid(), 'chave.permissao')` — a permissão

```sql
ALTER TABLE public.quote_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_phases_select_policy ON public.quote_phases
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    AND has_anew_permission((SELECT auth.uid()), 'quotes.view')
  );
```

O `(SELECT auth.uid())` entre parênteses **não é estilo** — é o que faz o
planeador do Postgres avaliar uma vez em vez de por linha.

**Escrita:** o padrão recente é bloquear `UPDATE`/`DELETE` diretos e deixar
escrever só por RPC `SECURITY DEFINER`:

```sql
CREATE POLICY quote_phases_no_update ON public.quote_phases
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
```

Vale a pena para `quote_ratio_rules` — uma regra mal gravada gera orçamentos
errados em silêncio, e a RPC é o sítio para a validar. Para `quote_phases`,
políticas normais chegam.

### Permissão nova

Se as fases e os rácios precisarem de permissão própria (ex.: `quotes.configure`),
o padrão é **aditivo, sem mudar comportamento a ninguém**:

```sql
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope)
VALUES ('quotes.configure', …);

-- backfill: quem já tem quotes.manage passa a ter também quotes.configure
INSERT INTO public.role_permissions (role_id, permission_code)
  SELECT role_id, 'quotes.configure'
  FROM public.role_permissions WHERE permission_code = 'quotes.manage'
ON CONFLICT DO NOTHING;
```

As permissões de orçamentos que já existem: `quotes.view`, `quotes.create`,
`quotes.edit`, `quotes.delete`, `quotes.manage`, `quotes.export`,
`quotes.export_sensitive`, `quotes.generate_pdf`.

**Recomendação:** reaproveitar `quotes.manage` para a configuração e **não criar
permissão nova já**. Uma permissão a mais é dívida; acrescenta-se quando alguém
pedir para separar.

### Auditoria

Tabela com `organization_id` direto → trigger genérica `fn_generic_entity_audit()`.
Tabela filha sem `organization_id` (o caso de `quote_ratio_rules`, que o herda do
cenário) → função dedicada que o resolve pelo pai, no molde de
`fn_audit_purchase_order_items_via_parent`.

### Trigger de `updated_at`

`CREATE TRIGGER trg_quote_phases_updated_at` — copiar de `20261116020000`.

---

## Frontend

### Registar um ecrã

Três sítios, e esquecer um dá um ecrã que existe mas ninguém alcança:

1. **`src/App.tsx`** — import `lazy` no topo e a rota:
   ```tsx
   const QuotePhasesConfig = lazy(() => import("./pages/QuotePhasesConfig"));
   …
   <Route path="/quote-phases" element={
     <ProtectedRoute permission="quotes.manage"><QuotePhasesConfig /></ProtectedRoute>
   } />
   ```
2. **`src/components/sidebar/menuConfig.ts`** — acrescentar o caminho ao grupo
   comercial, que já tem `/quotes`, `/quote-templates`, `/needs-assessment-config`
   (linha 150).
3. **Traduções** — `src/translations/`.

### O `QuoteBuilder.tsx` — 4 799 linhas, e o mapa

| O que | Onde |
|---|---|
| Estado das secções | `:257` `useState<string[]>(["Geral"])` |
| Secção ativa | `:258` |
| Rascunho automático (localStorage) — as fases têm de entrar aqui | `:415`, `:443` |
| Linhas carregadas de um orçamento existente | `:1885`, `:1890` |
| Gravação | `:2236`, `:2435` |
| Botão "Nova Secção" | `:3881`, `:4378` |
| Desenho das secções, com subtotal e margem | `:3891` em diante |
| Renomear secção (input direto) | `:3918` |
| Diálogo "Nova Secção" | `:4644` |

O literal `"Geral"` está em **18 sítios**. `phase_id` entra **a par** de
`section_name`, sem a remover — um orçamento antigo tem de continuar a abrir.

Vale a pena extrair o bloco das secções para um componente próprio antes de lhe
mexer. O ficheiro já é grande de mais para receber mais uma funcionalidade inteira
lá dentro.

### O que reaproveitar, e não reescrever

| Precisas de | Já existe em |
|---|---|
| Campos tipados configuráveis (número, dropdown, checkbox, data, ficheiro) | `src/pages/NeedsAssessmentConfig.tsx` (851 linhas) |
| Ecrã de preenchimento do levantamento | `src/components/deals/DealNeedsSection.tsx` (2 013 linhas) |
| Editor de regras, painel de medidas | `src/components/configurator-lab/` (2 938 linhas) |
| Ligação orçamento → negócio | `quotes.deal_id`, `src/components/quote/QuoteDealCard.tsx` |

---

## O avaliador de expressões

A peça com mais risco de se tornar um problema de segurança.

- **Gramática fechada.** Variáveis do levantamento, `+ - * /`, parênteses,
  `min` `max` `ceil` `floor`, e comparações na condição. Mais nada.
- **Nunca `eval`, nem `new Function`.** Uma regra é conteúdo escrito por um
  utilizador e guardado na base.
- **Erro explícito.** Variável desconhecida, divisão por zero ou expressão
  inválida param a regra com mensagem — nunca devolvem `0` nem `NaN` em silêncio.
  Silêncio aqui vira material que ninguém compra.
- **Determinista e testável.** Função pura: `(regra, valores) → quantidade`. Sem
  ler a base, sem relógio. Assim os rácios de E0 viram testes diretos.

Sítio natural: `src/lib/quotes/ratios/`, ao lado do que já lá está
(`src/lib/quotes/__tests__/calculateQuoteFees.parity.test.ts`).

---

## As quatro regras que o gerador tem de cumprir

Repetidas aqui porque é neste ficheiro que se está quando se escreve o código que
as pode violar. Detalhe em
[`desenho.md § contrato com as compras`](desenho.md#o-contrato-com-as-compras).

```
1. O que é para comprar sai como PRODUTO (product_id), nunca serviço
2. qt inteiro           — qt <> floor(qt) faz a cadeia saltar a linha em silêncio
3. qt > 0               — idem
4. o produto tem fornecedor preferencial em item_suppliers
```

Onde arredondar: **no gerador, ao criar a linha** — não à vista, na formatação. O
que fica gravado em `quote_lines.qt` é o que a cadeia de compras vai ler.

Sugestão de teste unitário a escrever cedo, porque falha em silêncio:

```ts
it("nunca gera quantidade fracionária", () => {
  const linhas = gerar(cenario, { area_m2: 9.8 });
  linhas.filter(l => l.product_id)
        .forEach(l => expect(Number.isInteger(l.qt)).toBe(true));
});
```

---

## Commits

Pelo histórico do repositório: assunto em português, a descrever **o efeito** e não
a mudança técnica. Do log real:

```
Operações: a lista de ordens ganha filtros, e as Análises a primeira pergunta
Operações: a assinatura sobe ao topo enquanto for o passo seguinte
docs(operacoes): pôr a documentação a par do dia 2
```

Para este trabalho, o prefixo natural é `Orçamento V2:`.

Corpo do commit a explicar o **porquê** quando não é óbvio, e a marcar decisões
tomadas por nós que ninguém validou — é a convenção que torna estas migrações
legíveis meses depois.

---

## Ordem sugerida do primeiro dia

1. `git checkout -b feature/orcamento-v2` a partir do `main` atualizado.
2. Ler o `RulesEditor.tsx` e decidir se serve *(30 min, decide o custo da E3)*.
3. Migração da `quote_phases` + RLS + auditoria.
4. Ecrã de administração das fases.
5. `QuoteBuilder.tsx` a ler fases, com `section_name` intacta.

Ao fim disto a E1 está fechada, e nada disto depende dos rácios do Ricardo.

# Pós-contrato (junção): encomendas + obra e arranque — e a ordem única do SQL

> **Estado:** junção feita e verificada localmente. **Nada foi aplicado em produção.**
> Ramo: `feat/pos-contrato` (worktree `D:\Olyvia\wt-pc`) = `feat/pos-contrato-encomendas` + `feat/pos-contrato-obra`, 13/10/2026.
> Notas de cada frente (o detalhe do que muda para quem usa): `etapa-pos-contrato-encomendas.md` e `etapa-pos-contrato-obra.md`.
> Lote 2 (que vem antes): `etapa-financeiro.md` e `etapa-custos.md`.

---

## O que a junção acrescenta

- **Separador "Arranque" da obra com os cartões verdadeiros.** Os dois cartões provisórios deram lugar a
  `EncomendaClienteCartao` e `NotaEncomendaCartao` (Gerar, Validar, Reabrir; Aprovar, Rejeitar, Mudar fornecedor).
  - Cada ação num cartão volta a ler o checklist (o "Pronta a arrancar" / "Falta: …") e o outro cartão.
  - Numa obra sem contrato não há cartões de encomenda: só o estado "não aplicável".
- **"Dados em falta" na app de Operações:** `/operacao/dados-em-falta`, no grupo **Dados** do menu, só para gestor e admin
  (a base verifica as permissões na mesma).
- **A ligação nota → linha está fixada em `nota_id`** (o nome real da migração). A Frente B já não adivinha o nome.
  As colunas que o arranque lê foram conferidas com a migração (`estado` rascunho/validada/anulada, `fornecedor_estado`,
  `prazo_previsto`, `purchase_order_id`, `nota_id`, `product_id`, `quote_line_id`, `service_id`, `tipo`).
- **Os orçamentos do contrato vêm de uma só fonte** (ver abaixo).

### Orçamentos do contrato: uma só fonte

- `ops_contrato_orcamentos(contrato)` (em `operacao-app/db/obras.sql`) é a que decide.
- `fn_ec_orcamentos_do_contrato(contrato)` (na migração das encomendas) **chama-a** quando ela existe
  (`to_regprocedure`, verificado à hora da chamada).
- Sem `obras.sql`, a função das encomendas aplica **as mesmas regras**, pela mesma ordem:
  1. o `quote_id` do contrato, se estiver preenchido;
  2. senão, **todos** os orçamentos aceites da proposta, pela ordem em que foram aceites;
  3. senão, o mais recente: a seleção da proposta, o orçamento da proposta (aceite mais recente, depois o criado
     mais recente), `pipeline_links`.

  Em todos os casos, só orçamentos da organização do contrato e não apagados.
- **Porque é esta a direção:** `ops_contrato_orcamentos` é INVOKER e dada a `authenticated`; a das encomendas é
  SECURITY DEFINER e só para `service_role`. Se fosse ao contrário, chamar a das encomendas a partir da de Operações
  falhava por falta de permissão.
- Os dois ficheiros correm sozinhos e por qualquer ordem. O validador da Frente B compara as duas funções com e
  sem `obras.sql` (4 casos: com `quote_id`, 2 aceites, nenhum aceite, obra simples).
- **Mudar uma regra = mudar as duas.** As adendas (`origem = 'adenda'`) entram em `ops_contrato_orcamentos` e chegam
  às encomendas sozinhas; só o caminho "sem obras.sql" teria de as repetir.

---

## ORDEM ÚNICA para colar o SQL em produção (desde o lote 2)

Tudo no **Supabase → SQL Editor**, um ficheiro de cada vez, inteiro. Todos são idempotentes: se um falhar a meio,
corrige-se e cola-se outra vez.

| # | Ficheiro | Precisa de | Porquê nesta posição |
|---|----------|------------|----------------------|
| 1 | `supabase/migrations/20261214100000_financeiro_faturas_recibos.sql` | baseline do CRM | Cria `client_finance_events`, que o 2 lê. |
| 2 | `operacao-app/db/financeiro-obra.sql` | `ops_obra` e `ops_pode()` (já em produção); o 1 | Sem o 1 instala, mas a lista "obras por criar" fica vazia. |
| 3 | `supabase/migrations/20261214110000_area_custos.sql` | baseline do CRM | Cria `cost_equipment` / `service_recipe_equipment`, que o 4 usa para as linhas de equipamento. |
| 4 | `supabase/migrations/20261215100000_pos_contrato_encomendas.sql` | baseline do CRM (`purchase_orders`, `item_suppliers`, `client_contracts`…); recomendado o 3 | Antes do 6, para o checklist de arranque nascer já com os passos 1 e 2 a contar. |
| 5 | `operacao-app/db/obras.sql` | o `obras.sql` antigo (em produção) | Traz `ops_contrato_orcamentos` (a fonte única), os orçamentos todos e o bloqueio do "Arrancar". |
| 6 | `operacao-app/db/obra-arranque.sql` | o 5 (obrigatório: recusa sem ele) | Liga o checklist: a partir daqui, "Arrancar" exige as 3 validações. |

Conferido:

- **Nenhum ficheiro redefine funções de outro:** 2, 5 e 6 não têm funções em comum. Os gatilhos em `ops_obra` têm
  nomes diferentes (`ops_obra_fin_resolver_aviso` e `ops_obra_plano_supervisor`). Nenhum faz `DROP … CASCADE`.
- **O 2 não depende do `obras.sql` novo:** só usa `rpc_ops_obra_criar` e `ops_obra`, que já estão em produção.
  Por isso pode ir antes do 5. Se for colado depois do 5, também funciona.
- **O 4 e o 5/6 funcionam por qualquer ordem.** Tudo o que cruza as frentes é verificado à hora da chamada
  (`to_regclass` / `to_regprocedure`). Foi provado no validador da Frente B: a migração foi corrida por cima de
  `obras.sql` + `obra-arranque.sql` e depois `obras.sql` → `obra-arranque.sql` → migração.
  A ordem da tabela é a recomendada por uma razão: se o 6 entrar antes do 4, durante esse intervalo os passos 1 e 2
  ficam "por instalar" e não bloqueiam.
- **Colar 5 e 6 seguidos.** O bloqueio do "Arrancar" do 5 só fica ativo com o 6. Entre os dois, as obras arrancam
  como antes.
- O 4 e o 3 terminam com um bloco `CONFERIR` que dá erro se faltar alguma coisa. O 4 acaba com
  `Encomendas pós-contrato instaladas: …`. O 6 avisa com NOTICE se as tabelas do 4 não existirem.

---

## Consultas para verificar depois de colar

```sql
-- 1. Financeiro: 3 permissões e a data de corte por organização
SELECT code FROM anew_permissions WHERE category = 'finance' ORDER BY code;   -- finance.register / validate / view
SELECT organization_id, faturar_desde FROM client_finance_settings ORDER BY 2;

-- 2. Financeiro → obra
SELECT to_regprocedure('public.rpc_ops_obras_por_criar(uuid)') IS NOT NULL AS por_criar,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ops_obra_fin_resolver_aviso') AS gatilho;

-- 3. Custos: 4 permissões e quem ficou com margins.approve (a "Direção" provisória)
SELECT code FROM anew_permissions WHERE category = 'costs' ORDER BY code;
SELECT r.name, o.name AS organizacao
  FROM anew_role_permissions rp JOIN anew_roles r ON r.id = rp.role_id
  LEFT JOIN anew_organizations o ON o.id = r.organization_id
 WHERE rp.permission_code = 'margins.approve' ORDER BY 2, 1;

-- 4. Encomendas: tabelas, permissões e quem as recebeu (provisório: quem tem roles.edit)
SELECT to_regclass('public.obra_encomenda_cliente') AS ec, to_regclass('public.nota_encomenda_fornecedor') AS notas;
SELECT r.name, rp.permission_code, o.name AS organizacao
  FROM anew_role_permissions rp JOIN anew_roles r ON r.id = rp.role_id
  LEFT JOIN anew_organizations o ON o.id = r.organization_id
 WHERE rp.permission_code IN ('client_orders.validate', 'purchase_orders.approve') ORDER BY 3, 1, 2;

-- 5. obras.sql: o CC-2026-0331 tem de dar os 4 orçamentos aceites
SELECT c.ordem, c.rotulo, c.origem
  FROM client_contracts cc, LATERAL public.ops_contrato_orcamentos(cc.id) c
 WHERE cc.contract_number = 'CC-2026-0331' ORDER BY c.ordem;

-- 4+5. Uma só fonte: tem de vir VAZIO
SELECT cc.contract_number
  FROM client_contracts cc
 WHERE cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado', 'active')
   AND (SELECT array_agg(x.quote_id ORDER BY x.quote_id) FROM public.fn_ec_orcamentos_do_contrato(cc.id) x)
       IS DISTINCT FROM
       (SELECT array_agg(y.quote_id ORDER BY y.quote_id) FROM public.ops_contrato_orcamentos(cc.id) y);

-- 6. Arranque: obras por estado e plano. As em curso/concluídas devem estar TODAS "aprovado".
SELECT estado, (plano_aprovado_em IS NOT NULL) AS plano_aprovado, count(*)
  FROM ops_obra GROUP BY 1, 2 ORDER BY 1, 2;

-- 6. As obras planeadas que agora precisam de "Aprovar plano" (para avisar os gestores)
SELECT o.codigo, o.titulo, o.data_inicio_prevista, cc.contract_number
  FROM ops_obra o LEFT JOIN client_contracts cc ON cc.id = o.contrato_id
 WHERE o.estado IN ('planeada', 'suspensa') AND o.iniciada_em IS NULL
 ORDER BY o.data_inicio_prevista NULLS LAST;
```

No browser:

- `/operacao/obras` → uma obra planeada com contrato → separador **Arranque**:
  - **Gerar** e **Validar** a Encomenda Cliente;
  - **Aprovar** a nota;
  - **Aprovar plano**;
  - a faixa passa a "Pronta a arrancar".
- `/operacao/dados-em-falta`: os números da Mudelar (produtos sem fornecedor preferido, sem preço…) e
  **Ligar marca → fornecedor**.
- `/financeiro` e `/custos` como nas notas do lote 2.

---

## O que avisar aos gestores (no dia em que se cola)

1. **As obras planeadas passam a precisar de "Aprovar plano".**
   - Separador **Arranque** da obra, botão **Aprovar plano** (gestor ou admin).
   - As obras que já arrancaram ficam aprovadas sozinhas.
   - Mexer no plano depois de aprovado (datas, tarefas, equipa, supervisor) volta a pô-lo "por aprovar".
2. **As obras com contrato também precisam das encomendas:**
   - a **Encomenda Cliente validada**: Gerar → Validar, por quem tem `client_orders.validate`;
   - a **Encomenda a fornecedor** aprovada (por quem tem `purchase_orders.approve`), ou "não necessária" se houver
     tudo em stock.

   Sem as 3 validações, o "Arrancar" fica desligado e diz o que falta.
3. **Quem pode validar e aprovar é provisório.** Ao colar o 4, as duas permissões vão só para as funções com
   `roles.edit` (a administração).
   - **Antes de avisar os gestores**, acertar no ecrã **Funções** do CRM quem é o Planeador (validar) e quem são as
     Compras/Direção (aprovar).
   - Senão, um gestor sem essas permissões vê os cartões mas não consegue validar, e a obra não arranca.
4. **Obras sem contrato** (em branco ou de orçamento avulso) só precisam do plano aprovado.
5. **"Dados em falta"** está no menu Dados. Na Mudelar, a maioria das linhas vai cair em "sem fornecedor" ou sem preço
   até se preencher o que este ecrã mostra.

---

## Para o Rafael (CRM)

- **Gatilho da assinatura** (`fn_contract_supplier_request`): continua a criar encomendas "pendentes" sem aprovação.
  - Não duplica com as notas, mas salta a aprovação.
  - Sugestão: um interruptor por organização em `organization_inventory_settings` (ex.:
    `pedido_fornecedor_na_assinatura boolean`), lido pelo gatilho.
- **Reserva FIFO e ecrã Encomendas Clientes** olham para **um** orçamento só (o `quote_id` ou o mais recente).
  - Com vários aceites, não veem as linhas dos outros.
  - A Encomenda Cliente e a obra leem todos (`ops_contrato_orcamentos`). Se o CRM passar a usar a mesma função, ficam
    iguais.
- **Quantidades anuladas** numa linha de encomenda a fornecedor:
  - o CRM tira-as da necessidade;
  - as encomendas pós-contrato deixam de as contar como "em encomenda" e voltam a pô-las em falta.

  Decidir qual das duas é a regra.
- **"Enviar proposta"**: ligar `rpc_margem_verificar` / `rpc_margem_pedir_aprovacao` (passos em `etapa-custos.md`).
- **Adendas:** falta a tabela no CRM (subproposta + suborçamento ligados ao contrato). Quando existir, entram em
  `ops_contrato_orcamentos` com `origem = 'adenda'`. A obra ganha as tarefas por
  `rpc_ops_obra_acrescentar_orcamentos` e a Encomenda Cliente por "Gerar" outra vez.
- **Contratos com duas alternativas marcadas como aceites** ficam com as duas na obra e na encomenda. Preencher
  `client_contracts.quote_id` resolve; convém o CRM impedir aceitar duas alternativas.
- **Tipos do Supabase** por regenerar (as RPCs novas usam `(supabase as any)`, como a Venda Direta).

---

## Verificações feitas (13/10/2026, no worktree `D:\Olyvia\wt-pc`)

- `node tools/validar-pos-contrato-encomendas.mjs`: tudo certo (138 ✓, 0 ✗).
- `operacao-app`: `node tools/validar-obra-arranque.mjs` com o novo cenário da junção:
  - a migração real da Frente A + `obras.sql` + `obra-arranque.sql`, nas duas ordens;
  - "Arrancar" recusado sem Encomenda Cliente, com ela em rascunho e com a nota por aprovar;
  - permitido com Encomenda Cliente validada + nota aprovada por `rpc_nota_aprovar` + plano aprovado;
  - "não necessária" conta como feita;
  - `material_chega_em` vem da nota (`nota_id`) e da purchase_order.
- Todos os `operacao-app/tools/validar-*.mjs` a passar.
- `node tools/validar-custos-crm.mjs` a passar.
- `operacao-app`: `npx tsc --noEmit` sem erros; `npx vitest run` com 30 ficheiros e 408 testes a passar.
- Raiz: `npx tsc --noEmit -p tsconfig.app.json` com 158 erros (o limite; nenhum novo).

## Por fazer

- Acertar as permissões `client_orders.validate` / `purchase_orders.approve` no ecrã Funções (Ruben).
- Ecrã para editar quantidades e acrescentar linhas manuais na Encomenda Cliente. As RPCs `rpc_ec_linha_guardar` e
  `rpc_ec_linha_apagar` já existem.
- Agendar o alerta das encomendas paradas no pg_cron. A linha está em `etapa-pos-contrato-encomendas.md`; não foi
  incluída para não mexer na produção sem decisão.
- Opcional: ao aprovar uma nota, atualizar logo as datas do material da obra
  (`ops_obra_material_frente_a_impl`). Hoje atualizam-se ao aprovar o plano ou com o botão.

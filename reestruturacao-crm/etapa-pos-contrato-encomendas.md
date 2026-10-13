# Pós-contrato, Frente A — Encomenda Cliente e Encomenda a Fornecedor

> **Estado:** feita e validada em PGlite. **O SQL não foi aplicado em produção.**
> Ramo: `feat/pos-contrato-encomendas` (a partir de `ccd53f11`).
> Feita a 13/10/2026.
>
> Especificação: `docs/melhorias-v2-2026-10-13/pos-contrato-especificacao.md`
> (com o acrescento de 13/10: adendas e permissões existentes) e
> `fluxo-encomendas.md`.

---

## O que muda para quem usa

```
Contrato assinado
  → Encomenda Cliente      rascunho → VALIDADA          (client_orders.validate)
  → Nota por fornecedor    proposta → APROVADA/rejeitada (purchase_orders.approve)
  → Encomenda ao fornecedor (purchase_orders "pendente", source_type 'contract')
```

### 1. Cartão "Encomenda Cliente" (Arranque da obra)

`operacao-app/src/components/arranque/EncomendaClienteCartao.tsx`
(props `contratoId`, `obraId`, `aoMudar`).

- **Gerar**: lê TODOS os orçamentos aceites do contrato (ou o `quote_id`, se
  estiver preenchido) e lista, por tipo:
  - **Produtos**: linhas de produto (qt × unidades da embalagem) e produtos
    dentro dos conjuntos;
  - **Consumíveis**: a ficha de materiais (`service_materials`) de cada
    serviço vendido, também dos serviços dentro dos conjuntos; a regra de
    três por área é a mesma do CRM;
  - **Equipamentos**: as horas da receita do serviço (área de Custos);
  - **Mão de obra**: horas por competência, das tarefas da obra se já houver
    obra, senão das tarefas-modelo dos serviços.
- Colunas: necessário · stock · em encomenda · em falta · fornecedor (e
  porquê: "fornecedor preferido", "sem fornecedor preferido — o escolhido na
  linha do orçamento", "… a marca tem o nome deste fornecedor", "sem
  fornecedor preferido nem marca ligada", "escolhido à mão").
- **Validar** (planeador, `client_orders.validate`): por produto, cobre-se
  primeiro com o que já saiu do armazém para o contrato, depois com o que já
  está encomendado ao fornecedor para o contrato (inclui o que o gatilho da
  assinatura encomendou), depois com o stock livre (stock − o que as outras
  encomendas reservam). O resto fica **em falta** e nasce uma **nota por
  fornecedor** (mais uma "sem fornecedor", se for o caso). Se nada falta, o
  passo 2 fica **Não necessária**. Quem aprova recebe aviso no sino.
- **Reabrir** (com motivo): volta a rascunho; as notas por aprovar ficam
  rejeitadas, as aprovadas mantêm-se (e contam como "em encomenda").
- **Gerar outra vez numa encomenda validada** (adendas, alterações): não
  apaga nem refaz nada; acrescenta só as linhas a mais e volta a pedir
  validação. A nova validação só gera notas para a diferença.

### 2. Cartão "Encomenda a Fornecedor"

`operacao-app/src/components/arranque/NotaEncomendaCartao.tsx` (mesmas props).

- Uma nota por fornecedor, com linhas, preço de compra, total e data prevista
  de chegada (hoje + o maior prazo: `item_suppliers.lead_time_days`, senão
  `suppliers.delivery_sla_days`).
- **Aprovar** (`purchase_orders.approve`): cria a encomenda ao fornecedor no
  CRM (`purchase_orders`, pendente, `source_type 'contract'`, com os itens
  ligados às linhas do orçamento). A nota "sem fornecedor" não se aprova.
- **Rejeitar** (com motivo) e **Mudar fornecedor** (por linha; a escolha fica
  guardada e o próximo "Gerar" mantém-na).

### 3. "Dados em falta"

`operacao-app/src/components/arranque/DadosEmFalta.tsx` (prop `orgId`; ainda
sem rota — ver "por fazer"). Só sobre o que foi vendido em contratos
assinados: produtos sem fornecedor preferido / sem fornecedor nenhum / sem
preço de compra / sem gestão de stock, serviços sem ficha de materiais, marcas
com o nome de um fornecedor e encomendas paradas há mais de 7 dias. Botão
**Ligar marca → fornecedor**: põe esse fornecedor como preferido nos produtos
da marca que ainda não têm nenhum (cria a ligação em `item_suppliers` ou marca
a existente). Na Mudelar, eram 62 produtos vendidos resolvidos só por isto.

### 4. Alerta de encomendas paradas

Encomendas a fornecedor `pending` há mais de 7 dias → aviso no sino a quem tem
`purchase_orders.approve`, **uma vez por encomenda**. Corre sozinho quando
alguém abre um cartão ou o relatório; também há `rpc_ec_alertar_paradas(org,
dias)` para um agendamento (ver abaixo).

---

## Como colar o SQL (por esta ordem)

1. (Recomendado, se ainda não estiver) `supabase/migrations/20261214110000_area_custos.sql`
   — sem ela não há linhas de equipamento; o resto funciona.
2. `supabase/migrations/20261215100000_pos_contrato_encomendas.sql` — inteiro,
   no **Supabase SQL Editor**. Corre duas vezes sem problema.
3. No fim, a mensagem `Encomendas pós-contrato instaladas: …` confirma.
   Se aparecer `CONFERIR: …` (por exemplo, `purchase_orders.approve` fora do
   catálogo), corrigir e colar outra vez: é idempotente.

O SQL de Operações (`operacao-app/db/*.sql`) é opcional para esta migração:
com ele, a mão de obra vem das tarefas; sem ele, não há linhas de mão de obra.
A Frente B (`obra-arranque.sql`) lê estas tabelas com guarda `to_regclass`.

Validar antes de colar (não toca na base real):

```
cd operacao-app && npm ci     # só se faltar o PGlite
cd .. && node tools/validar-pos-contrato-encomendas.mjs
```

---

## Permissões

- `client_orders.validate` — **nova** (categoria `client_orders`, que já
  existia com view/create/edit/delete/confirm_stock_exit).
- `purchase_orders.approve` — **já existia** (20261113290000, dada a quem tem
  `purchase_orders.edit`): reutilizada, não recriada.
- **Provisório:** as duas são dadas a quem tem `roles.edit` (a administração).
  Falta o Ruben dizer quem é o Planeador de obra (validar) e quem são as
  Compras/Direção (aprovar) e acertar no ecrã de Funções.
- Ver os cartões: qualquer uma de `client_orders.view/validate/edit`,
  `purchase_orders.view/approve/create`, `operations.orders.create/edit/view`.
- Gerar e mexer em linhas: `client_orders.validate/edit` ou
  `operations.orders.create/edit`.
- Ligar marca → fornecedor: `products.edit`, `products.manage` ou
  `purchase_orders.approve`.

---

## Decisões tomadas

- **Orçamentos do contrato numa só função**: `fn_ec_orcamentos_do_contrato`
  devolve `(quote_id, origem)`, hoje sempre `origem = 'contrato'`. As adendas
  entram aí (`'adenda'`); na junção com a Frente B passa a uma só função.
- **"Em encomenda" = tudo o que está em `purchase_orders` do contrato**
  (`source_type 'contract'`, não anuladas, não apagadas), menos as
  quantidades anuladas por linha (`purchase_order_item_cancellations`). Inclui
  o que o gatilho da assinatura criou: é isso que impede a nota de duplicar.
- **Stock livre** = físico da organização − por cada outro contrato, o maior
  entre a reserva FIFO do Rafael (`fn_client_order_line_reservations`, só
  leitura) e a reserva da sua Encomenda Cliente validada. Conservador: nunca
  promete o mesmo stock a dois contratos.
- **Itens da encomenda ao fornecedor ligados à linha do orçamento**
  (`quote_line_id`/`component_index`): o "Pedir em falta" do CRM e a reserva
  FIFO contam-nos e não voltam a pedir (provado no validador).
- **Quantidades da nota arredondadas para cima** (não se compra 0,5 tubo de
  silicone).
- **Fornecedor**: preferido → o escolhido na linha do orçamento →
  `products.supplier_id` → marca com o mesmo nome de UM fornecedor → nenhum.
  Preço: o da ligação produto↔fornecedor, senão o `product_prices` de compra.
- **Equipamentos e mão de obra** entram na Encomenda Cliente (para o Planeador
  confirmar), mas não geram notas.
- **Gerar não é automático na assinatura**: é o botão. Não se acrescentou
  gatilho em `client_contracts` (área do Rafael; a ordem alfabética dos
  gatilhos importa).

---

## Para o Rafael

- **Desligar o gatilho automático da assinatura por organização**
  (`fn_contract_supplier_request`): hoje continua a criar encomendas
  "pendentes" sem aprovação. Não duplica com as notas, mas salta a aprovação.
  Sugestão: um interruptor em `organization_inventory_settings` (ex.:
  `pedido_fornecedor_na_assinatura boolean`) lido pelo gatilho. Não foi mexido.
- O gatilho e a reserva FIFO só olham para **um** orçamento (o `quote_id` ou o
  mais recente da proposta). Com vários aceites, a reserva FIFO não vê as
  linhas dos outros: a Encomenda Cliente compensa (lê todos), mas o ecrã
  Encomendas Clientes do CRM continua a mostrar só um.
- Quantidades anuladas numa linha de encomenda: o CRM tira-as da necessidade
  ("não será recebido"); aqui deixam de contar como "em encomenda" e voltam a
  ficar em falta na próxima validação. Decidir qual das duas é a regra.

---

## Riscos

- **Dados da Mudelar**: 88% dos produtos vendidos sem fornecedor preferido e 0
  com preço de compra → a maioria das linhas vai cair em "sem fornecedor" ou
  sem preço até se usar o "Dados em falta". Quase nenhum produto gere stock
  (2 de 321), por isso a coluna "stock" vai dar 0 quase sempre.
- **Fichas de materiais**: só 1 de 118 serviços vendidos tem; os consumíveis
  vão aparecer vazios até serem preenchidas.
- **Embalagens**: a ficha de materiais é lida em unidades da ficha, sem a
  conversão de embalagem (`uom`) que o `rpc_ops_stock_sugerir` faz.
- **Tabela temporária**: `rpc_ec_gerar` usa tabelas temporárias
  (`ON COMMIT DROP`), normal no Postgres do Supabase; se o PostgREST alguma
  vez correr em modo transação partilhada, confirmar.
- **Alerta das paradas**: corre quando alguém abre os cartões ou o relatório.
  Para correr sozinho todos os dias, agendar no pg_cron (não incluído, para não
  mexer na produção sem decisão):
  `select cron.schedule('ec-paradas', '0 8 * * *', $$select public.fn_ec_alertar_paradas(id, 7) from public.anew_organizations$$);`
- `purchase_orders.order_number` não é dado: conta com o gatilho de numeração
  que já existe (como o `fn_client_order_request_missing`).

---

## Por fazer

- Junção com a Frente B: trocar o `ArranqueCartaoProvisorio` pelos dois
  cartões (comentário `JUNÇÃO:` em `ArranqueObra.tsx`) e juntar
  `fn_ec_orcamentos_do_contrato` com `ops_contrato_orcamentos`.
- Pôr o "Dados em falta" numa rota/menu da app de Operações (ou do CRM).
- Editar quantidades / acrescentar linhas manuais no cartão (as RPCs
  `rpc_ec_linha_guardar` / `rpc_ec_linha_apagar` já existem; falta o ecrã).
- Adendas: quando existir `client_contract_addenda`, acrescentar as
  propostas/orçamentos das adendas assinadas em `fn_ec_orcamentos_do_contrato`.

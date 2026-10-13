/**
 * Valida a migração da Frente A do pós-contrato — Encomenda Cliente e notas
 * de encomenda a fornecedor
 * (supabase/migrations/20261215100000_pos_contrato_encomendas.sql) num
 * Postgres limpo (PGlite), sem tocar na base real.
 *
 *     node tools/validar-pos-contrato-encomendas.mjs
 *
 * O PGlite vem do operacao-app (cd operacao-app && npm ci, se faltar).
 *
 * As três funções do Rafael que esta frente NÃO pode mudar —
 * fn_client_order_line_reservations (reserva FIFO), fn_client_order_request_missing
 * e o gatilho fn_contract_supplier_request — são lidas TAL E QUAL das
 * migrações e instaladas aqui. A assinatura do contrato dispara o gatilho de
 * verdade; é assim que se prova que a nota não duplica o que ele encomendou.
 *
 * O que se prova:
 *   · contrato com 2 orçamentos aceites (+ 1 não aceite que fica de fora),
 *     conjuntos com produtos e serviços, ficha de materiais, receitas de
 *     equipamento e tarefas-modelo → as linhas certas;
 *   · validar com stock parcial → em falta certo e uma nota por fornecedor
 *     (preferido, linha do orçamento, produto, marca, sem fornecedor);
 *   · o gatilho da assinatura já encomendou → a nota não duplica, e o
 *     "Pedir em falta" do CRM, depois de aprovar, não pede mais nada;
 *   · nada em falta → fornecedor_estado = nao_necessaria;
 *   · nota sem fornecedor não se aprova; mudar o fornecedor resolve;
 *   · aprovar → purchase_orders (pending, source_type 'contract');
 *   · rejeitar, reabrir e voltar a validar;
 *   · permissões (client_orders.validate / purchase_orders.approve);
 *   · isolamento entre organizações;
 *   · dados em falta e "ligar marca → fornecedor"; alerta de encomendas paradas;
 *   · a migração corre duas (e três) vezes sem erro e sem duplicar.
 */

import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const requerer = createRequire(join(RAIZ, "operacao-app", "package.json"));
let PGlite;
try {
  ({ PGlite } = await import(pathToFileURL(requerer.resolve("@electric-sql/pglite")).href));
} catch {
  console.error("Falta o PGlite: corra `npm ci` dentro de operacao-app e tente outra vez.");
  process.exit(2);
}
const { STUBS_CRM, AUTENTICACAO_REAL, PRIVILEGIOS_SUPABASE } = await import(
  pathToFileURL(join(RAIZ, "operacao-app", "tools", "_stubs-crm.mjs")).href
);

const PASTA_MIG = join(RAIZ, "supabase", "migrations");
const MIGRACAO = readFileSync(join(PASTA_MIG, "20261215100000_pos_contrato_encomendas.sql"), "utf8");

/** A última definição (não comentada) de uma função nas migrações, tal e qual. */
function funcaoReal(nome) {
  const ficheiros = readdirSync(PASTA_MIG).filter((f) => f.endsWith(".sql")).sort();
  const re = new RegExp(`^CREATE OR REPLACE FUNCTION public\\.${nome}\\(`, "m");
  for (const f of ficheiros.reverse()) {
    if (f.startsWith("20261215100000")) continue;
    const txt = readFileSync(join(PASTA_MIG, f), "utf8");
    const m = re.exec(txt);
    if (!m) continue;
    const resto = txt.slice(m.index);
    const tag = /\bAS\s+(\$[A-Za-z_]*\$)/.exec(resto);
    const abre = tag.index + tag[0].length;
    const fecha = resto.indexOf(tag[1], abre);
    return { ficheiro: f, sql: resto.slice(0, fecha + tag[1].length) + ";" };
  }
  throw new Error(`Não encontrei ${nome} nas migrações`);
}

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };
const igual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0005;

/* ── Ids ─────────────────────────────────────────────────────────────────── */
const ORG_A = "a0000000-0000-0000-0000-00000000000a";
const ORG_B = "b0000000-0000-0000-0000-00000000000b";
const ROLE = {
  admA: "a1000000-0000-0000-0000-000000000001", // roles.edit → recebe as duas permissões novas
  plaA: "a1000000-0000-0000-0000-000000000002", // planeador: client_orders.validate
  comprA: "a1000000-0000-0000-0000-000000000003", // compras: purchase_orders.approve
  comA: "a1000000-0000-0000-0000-000000000004", // comercial: só contratos
  admB: "b1000000-0000-0000-0000-000000000001",
};
const U = { admA: "a2000000-0000-0000-0000-000000000001", plaA: "a2000000-0000-0000-0000-000000000002",
            comprA: "a2000000-0000-0000-0000-000000000003", comA: "a2000000-0000-0000-0000-000000000004",
            admB: "b2000000-0000-0000-0000-000000000001" };
const AUTH = { admA: "a3000000-0000-0000-0000-000000000001", plaA: "a3000000-0000-0000-0000-000000000002",
               comprA: "a3000000-0000-0000-0000-000000000003", comA: "a3000000-0000-0000-0000-000000000004",
               admB: "b3000000-0000-0000-0000-000000000001" };
const ARM = "a4000000-0000-0000-0000-000000000001";
const SUP = { pref: "a5000000-0000-0000-0000-000000000001", linha: "a5000000-0000-0000-0000-000000000002",
              prod: "a5000000-0000-0000-0000-000000000003", roca: "a5000000-0000-0000-0000-000000000004",
              b: "b5000000-0000-0000-0000-000000000001" };
const MARCA_ROCA = "a6000000-0000-0000-0000-000000000001";
const P = { torneira: "a7000000-0000-0000-0000-000000000001", base: "a7000000-0000-0000-0000-000000000002",
            sanita: "a7000000-0000-0000-0000-000000000003", lavatorio: "a7000000-0000-0000-0000-000000000004",
            silicone: "a7000000-0000-0000-0000-000000000005", espelho: "a7000000-0000-0000-0000-000000000006",
            cola: "a7000000-0000-0000-0000-000000000007", bide: "a7000000-0000-0000-0000-000000000008",
            pB: "b7000000-0000-0000-0000-000000000001" };
const IS_LINHA = "a8000000-0000-0000-0000-000000000001"; // item_suppliers (base duche, Banema) escolhido na linha
const SV = { canal: "a9000000-0000-0000-0000-000000000001", loucas: "a9000000-0000-0000-0000-000000000002",
             pintura: "a9000000-0000-0000-0000-000000000003" };
const SKILL = "aa000000-0000-0000-0000-000000000001";
const EQ_PRENSA = "ab000000-0000-0000-0000-000000000001";
const PR1 = "ac000000-0000-0000-0000-000000000001";
const PR2 = "ac000000-0000-0000-0000-000000000002";
const Q = { q1: "ad000000-0000-0000-0000-000000000001", q2: "ad000000-0000-0000-0000-000000000002",
            q3: "ad000000-0000-0000-0000-000000000003", q4: "ad000000-0000-0000-0000-000000000004" };
const QL = { q1Torneira: "ae000000-0000-0000-0000-000000000001", q1Canal: "ae000000-0000-0000-0000-000000000002",
             q1Base: "ae000000-0000-0000-0000-000000000003", q1Pintura: "ae000000-0000-0000-0000-000000000004",
             q2Pack: "ae000000-0000-0000-0000-000000000005", q2Lavatorio: "ae000000-0000-0000-0000-000000000006",
             q2Espelho: "ae000000-0000-0000-0000-000000000007", q2Torneira: "ae000000-0000-0000-0000-000000000008",
             q3Espelho: "ae000000-0000-0000-0000-000000000009", q4Silicone: "ae000000-0000-0000-0000-00000000000a" };
const CC1 = "af000000-0000-0000-0000-000000000001";
const CC2 = "af000000-0000-0000-0000-000000000002";
const CC_B = "bf000000-0000-0000-0000-000000000001";
const OBRA2 = "b0b00000-0000-0000-0000-000000000002";

/* ── Stubs: o núcleo do operacao-app + o que esta migração (e as do Rafael) leem ── */
await db.exec(STUBS_CRM);
await db.exec(AUTENTICACAO_REAL);
await db.exec(`
  ALTER TABLE public.anew_role_permissions
    ADD COLUMN id uuid DEFAULT gen_random_uuid(), ADD COLUMN created_by uuid, ADD COLUMN created_at timestamptz DEFAULT now();

  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    quote_id uuid,
    proposal_id uuid,
    contract_number text,
    order_number text,
    is_manual_order boolean NOT NULL DEFAULT false,
    signature_date timestamptz,
    status_changed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz);

  ALTER TABLE public.quotes
    ADD COLUMN proposal_id uuid, ADD COLUMN created_by uuid,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  ALTER TABLE public.quote_lines
    ADD COLUMN product_id uuid, ADD COLUMN service_id uuid, ADD COLUMN bundle_id uuid,
    ADD COLUMN selected_attributes jsonb, ADD COLUMN item_supplier_id uuid,
    ADD COLUMN units_per_uom numeric NOT NULL DEFAULT 1;

  ALTER TABLE public.products
    ADD COLUMN organization_id uuid, ADD COLUMN name text NOT NULL DEFAULT 'Produto', ADD COLUMN sku text NOT NULL DEFAULT 'x',
    ADD COLUMN brand_id uuid, ADD COLUMN supplier_id uuid, ADD COLUMN manages_stock boolean NOT NULL DEFAULT false,
    ADD COLUMN uom_id uuid, ADD COLUMN deleted_at timestamptz;
  ALTER TABLE public.suppliers
    ADD COLUMN organization_id uuid, ADD COLUMN name text NOT NULL DEFAULT 'Fornecedor', ADD COLUMN email text,
    ADD COLUMN primary_contact_email text, ADD COLUMN delivery_sla_days integer, ADD COLUMN is_active boolean,
    ADD COLUMN deleted_at timestamptz;

  CREATE TABLE public.brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text NOT NULL,
    slug text NOT NULL DEFAULT 'x', deleted_at timestamptz);

  -- item_suppliers como em 20261112110000 (índices únicos parciais e a mensagem do preferido).
  CREATE TABLE public.item_suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
    item_type text NOT NULL CHECK (item_type IN ('product','service')),
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    service_id uuid,
    supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    supplier_sku text, purchase_price numeric(12,2), currency text NOT NULL DEFAULT 'EUR',
    lead_time_days integer, moq numeric(10,2), uom_id uuid,
    is_preferred boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true, notes text,
    created_by uuid NOT NULL REFERENCES public.anew_users(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz, deleted_by uuid,
    CHECK ((item_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL) OR
           (item_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL)));
  CREATE UNIQUE INDEX item_suppliers_product_supplier_active_uniq ON public.item_suppliers (product_id, supplier_id)
    WHERE deleted_at IS NULL AND product_id IS NOT NULL;
  CREATE UNIQUE INDEX item_suppliers_one_preferred_per_product ON public.item_suppliers (product_id)
    WHERE is_preferred AND deleted_at IS NULL AND product_id IS NOT NULL;

  CREATE TABLE public.product_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, price numeric NOT NULL,
    price_type text NOT NULL, valid_from timestamptz);

  CREATE TABLE public.services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text NOT NULL, deleted_at timestamptz);
  CREATE TABLE public.service_materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, service_id uuid NOT NULL,
    product_id uuid NOT NULL, quantity numeric NOT NULL DEFAULT 1, reference_area_m2 numeric(10,4),
    reference_quantity numeric(10,4), sort_order integer, uom_id uuid, deleted_at timestamptz);

  CREATE TABLE public.warehouses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, name text NOT NULL DEFAULT 'Armazém',
    is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz);
  CREATE TABLE public.stocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL, quantity numeric NOT NULL DEFAULT 0, deleted_at timestamptz);
  CREATE TABLE public.stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL, quantity numeric NOT NULL, movement_type text NOT NULL, balance_after numeric NOT NULL DEFAULT 0,
    sale_source_type text, sale_source_id uuid, reference_id uuid, reversal_of_movement_id uuid,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.organization_inventory_settings (
    organization_id uuid PRIMARY KEY, default_warehouse_id uuid,
    stock_deduction_trigger text NOT NULL DEFAULT 'contract_signed');

  ALTER TABLE public.purchase_orders
    ALTER COLUMN order_number SET DEFAULT 'PO-' || substr(md5(random()::text), 1, 6),
    ALTER COLUMN status SET DEFAULT 'pending',
    ADD COLUMN supplier_id uuid, ADD COLUMN expected_delivery date, ADD COLUMN source_type text,
    ADD COLUMN source_id uuid, ADD COLUMN notes text, ADD COLUMN created_by uuid NOT NULL,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN deleted_at timestamptz,
    ADD COLUMN total_value numeric NOT NULL DEFAULT 0;
  ALTER TABLE public.purchase_order_items
    ADD COLUMN product_id uuid, ADD COLUMN service_id uuid,
    ADD COLUMN quote_line_id uuid REFERENCES public.quote_lines(id) ON DELETE SET NULL,
    ADD COLUMN component_index integer, ADD COLUMN units_per_uom numeric NOT NULL DEFAULT 1,
    ADD COLUMN received_quantity numeric NOT NULL DEFAULT 0, ADD COLUMN received_to_stock_units numeric NOT NULL DEFAULT 0,
    ADD COLUMN uom_id uuid, ADD COLUMN supplier_sku text;
  CREATE TABLE public.purchase_order_item_cancellations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, purchase_order_id uuid NOT NULL,
    purchase_order_item_id uuid, quantity_cancelled numeric NOT NULL, undone_at timestamptz);

  CREATE TABLE public.workflow_execution_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_entity text, source_record_id uuid, target_entity text,
    target_record_id uuid, action_type text, status text, execution_data jsonb, error_message text,
    created_at timestamptz DEFAULT now());
  CREATE TABLE public.direct_sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_contract_id uuid, sale_number text, created_at timestamptz DEFAULT now());
  CREATE FUNCTION public.fn_uom_units_per(p_uom_id uuid, p_product_id uuid) RETURNS integer
    LANGUAGE sql STABLE AS $$ SELECT 1 $$;

  -- Operações (opcionais para a migração): competências, tarefas-modelo, obra.
  CREATE TABLE public.ops_skill (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, nome text NOT NULL);
  CREATE TABLE public.ops_obra_servico_tarefa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, servico_id uuid NOT NULL,
    ordem integer NOT NULL DEFAULT 1, nome text NOT NULL, minutos_por_unidade numeric(10,2) NOT NULL DEFAULT 0,
    minutos_fixos integer NOT NULL DEFAULT 0, pessoas smallint NOT NULL DEFAULT 1, skill_id uuid);
  CREATE TABLE public.ops_obra (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, contrato_id uuid,
    estado text NOT NULL DEFAULT 'planeada', criada_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.ops_obra_tarefa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, obra_id uuid NOT NULL,
    nome text NOT NULL DEFAULT 'Tarefa', minutos_previstos integer NOT NULL DEFAULT 60, skill_id uuid);

  -- Custos (opcionais): equipamentos e receitas.
  CREATE TABLE public.cost_equipment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, nome text NOT NULL);
  CREATE TABLE public.service_recipes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, service_id uuid NOT NULL);
  CREATE TABLE public.service_recipe_equipment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, recipe_id uuid NOT NULL,
    equipamento_id uuid NOT NULL, horas_por_medida numeric(10,4) NOT NULL DEFAULT 0);

  -- O gatilho real que protege os papéis de sistema (a migração desliga-o).
  CREATE FUNCTION public.fn_protect_system_role_perms() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    IF EXISTS (SELECT 1 FROM public.anew_roles r WHERE r.id = NEW.role_id AND r.is_system) THEN
      RAISE EXCEPTION 'papel de sistema protegido';
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER trg_protect_system_role_perms BEFORE INSERT ON public.anew_role_permissions
    FOR EACH ROW EXECUTE FUNCTION public.fn_protect_system_role_perms();
`);

/* ── As funções do Rafael, tal e qual estão nas migrações ────────────────── */
console.log("\n─── funções existentes (só leitura) ─────");
for (const nome of ["fn_client_order_line_reservations", "fn_client_order_request_missing", "fn_contract_supplier_request"]) {
  try {
    const f = funcaoReal(nome);
    await db.exec(f.sql);
    ok(`${nome} instalada a partir de ${f.ficheiro}`);
  } catch (e) { mau(`${nome} — ${e.message.split("\n")[0]}`); }
}
// Como em produção: as internas só para service_role.
await db.exec(`REVOKE ALL ON FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.fn_client_order_request_missing(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;`);
await db.exec(`CREATE TRIGGER trg_contract_supplier_request AFTER UPDATE OF status ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_contract_supplier_request();`);
await db.exec(PRIVILEGIOS_SUPABASE);
if (falhas.length) { console.log("\nSem as funções existentes o teste não prova nada."); process.exit(1); }

/* ── Duas organizações, cinco pessoas ────────────────────────────────────── */
await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Remodelações A'), ('${ORG_B}','Outra empresa B');
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${ROLE.admA}','${ORG_A}','Administração'), ('${ROLE.plaA}','${ORG_A}','Planeador de obra'),
    ('${ROLE.comprA}','${ORG_A}','Compras'), ('${ROLE.comA}','${ORG_A}','Comercial'),
    ('${ROLE.admB}','${ORG_B}','Administração');
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${ROLE.admA}','roles.edit'),
    ('${ROLE.plaA}','client_orders.validate'), ('${ROLE.plaA}','client_orders.view'),
    ('${ROLE.comprA}','purchase_orders.approve'), ('${ROLE.comprA}','purchase_orders.view'),
    ('${ROLE.comA}','client_contracts.view'),
    ('${ROLE.admB}','roles.edit');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.admA}','${AUTH.admA}','Direção A','dir@a.pt'), ('${U.plaA}','${AUTH.plaA}','Paula (planeadora)','pla@a.pt'),
    ('${U.comprA}','${AUTH.comprA}','Carlos (compras)','compras@a.pt'), ('${U.comA}','${AUTH.comA}','Rúben (comercial)','com@a.pt'),
    ('${U.admB}','${AUTH.admB}','Direção B','dir@b.pt');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.admA}','${ORG_A}','${ROLE.admA}','active'), ('${U.plaA}','${ORG_A}','${ROLE.plaA}','active'),
    ('${U.comprA}','${ORG_A}','${ROLE.comprA}','active'), ('${U.comA}','${ORG_A}','${ROLE.comA}','active'),
    ('${U.admB}','${ORG_B}','${ROLE.admB}','active');

  -- purchase_orders.approve JÁ existe em produção (20261113290000): a migração reutiliza-a.
  INSERT INTO public.anew_permissions (code, name, category) VALUES
    ('purchase_orders.approve', 'Aprovar encomendas de compra', 'purchase_orders'),
    ('client_orders.view', 'Ver Encomendas Clientes', 'client_orders');

  INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${ARM}','${ORG_A}','Lisboa');
  INSERT INTO public.organization_inventory_settings (organization_id, default_warehouse_id) VALUES ('${ORG_A}','${ARM}');

  INSERT INTO public.suppliers (id, organization_id, name, delivery_sla_days, email) VALUES
    ('${SUP.pref}','${ORG_A}','Leroy Pro', 4, 'encomendas@leroy.pt'),
    ('${SUP.linha}','${ORG_A}','Banema', 10, NULL),
    ('${SUP.prod}','${ORG_A}','Sanitana', NULL, NULL),
    ('${SUP.roca}','${ORG_A}','Roca', 7, NULL),
    ('${SUP.b}','${ORG_B}','Fornecedor B', NULL, NULL);
  INSERT INTO public.brands (id, organization_id, name) VALUES ('${MARCA_ROCA}','${ORG_A}',' roca ');

  INSERT INTO public.products (id, organization_id, name, sku, brand_id, supplier_id, manages_stock) VALUES
    ('${P.torneira}','${ORG_A}','Torneira misturadora','TOR-1', NULL, NULL, true),
    ('${P.base}','${ORG_A}','Base de duche 80x120','BAS-1', NULL, NULL, false),
    ('${P.sanita}','${ORG_A}','Sanita suspensa','SAN-1', NULL, '${SUP.prod}', false),
    ('${P.lavatorio}','${ORG_A}','Lavatório Roca 60','LAV-1', '${MARCA_ROCA}', NULL, false),
    ('${P.silicone}','${ORG_A}','Silicone sanitário','SIL-1', NULL, NULL, true),
    ('${P.espelho}','${ORG_A}','Espelho 80 cm','ESP-1', NULL, NULL, false),
    ('${P.cola}','${ORG_A}','Cimento-cola C2TE','COL-1', NULL, NULL, false),
    ('${P.bide}','${ORG_A}','Bidé Roca (não vendido)','BID-1', '${MARCA_ROCA}', NULL, false),
    ('${P.pB}','${ORG_B}','Produto de B','PB-1', NULL, NULL, false);

  INSERT INTO public.item_suppliers (id, organization_id, item_type, product_id, supplier_id, is_preferred, purchase_price, lead_time_days, created_by) VALUES
    (DEFAULT, '${ORG_A}','product','${P.torneira}','${SUP.pref}', true, 40, 5, '${U.admA}'),
    (DEFAULT, '${ORG_A}','product','${P.silicone}','${SUP.pref}', true, 4.84, NULL, '${U.admA}'),
    (DEFAULT, '${ORG_A}','product','${P.cola}','${SUP.pref}', true, 12, 2, '${U.admA}'),
    ('${IS_LINHA}','${ORG_A}','product','${P.base}','${SUP.linha}', false, 120, NULL, '${U.admA}');
  INSERT INTO public.product_prices (product_id, price, price_type, valid_from) VALUES
    ('${P.sanita}', 95, 'purchase', now() - interval '1 day');

  -- Stock: silicone 10, cimento-cola 3 (parcial), torneira 0.
  INSERT INTO public.stocks (organization_id, product_id, warehouse_id, quantity) VALUES
    ('${ORG_A}','${P.silicone}','${ARM}', 10), ('${ORG_A}','${P.cola}','${ARM}', 3);

  INSERT INTO public.services (id, organization_id, name) VALUES
    ('${SV.canal}','${ORG_A}','Canalização'), ('${SV.loucas}','${ORG_A}','Montagem de louças'),
    ('${SV.pintura}','${ORG_A}','Pintura de teto');
  -- Ficha de materiais: canalização 0,5 silicone por ponto; louças pela regra de três (1 por 4 peças).
  INSERT INTO public.service_materials (organization_id, service_id, product_id, quantity, reference_area_m2, reference_quantity) VALUES
    ('${ORG_A}','${SV.canal}','${P.silicone}', 0.5, NULL, NULL),
    ('${ORG_A}','${SV.loucas}','${P.silicone}', 99, 4, 1);

  INSERT INTO public.cost_equipment (id, organization_id, nome) VALUES ('${EQ_PRENSA}','${ORG_A}','Prensa de multicamada');
  INSERT INTO public.service_recipes (id, organization_id, service_id) VALUES
    ('ab100000-0000-0000-0000-000000000001','${ORG_A}','${SV.canal}');
  INSERT INTO public.service_recipe_equipment (organization_id, recipe_id, equipamento_id, horas_por_medida) VALUES
    ('${ORG_A}','ab100000-0000-0000-0000-000000000001','${EQ_PRENSA}', 0.4);

  INSERT INTO public.ops_skill (id, organization_id, nome) VALUES ('${SKILL}','${ORG_A}','Canalizador');
  INSERT INTO public.ops_obra_servico_tarefa (organization_id, servico_id, ordem, nome, minutos_por_unidade, minutos_fixos, skill_id) VALUES
    ('${ORG_A}','${SV.canal}', 1, 'Abrir roços e passar tubo', 60, 30, '${SKILL}'),
    ('${ORG_A}','${SV.loucas}', 1, 'Montar louça', 45, 0, '${SKILL}');

  -- Proposta PR1: Q1 e Q2 aceites; Q3 NÃO aceite (fica de fora). Q2 é o mais
  -- recente: é o que o gatilho da assinatura usa.
  INSERT INTO public.quotes (id, organization_id, quote_number, proposal_id, accepted_at, created_at, created_by) VALUES
    ('${Q.q3}','${ORG_A}','ORC-3','${PR1}', NULL,                        now() - interval '9 days', '${U.comA}'),
    ('${Q.q1}','${ORG_A}','ORC-1','${PR1}', now() - interval '5 days',   now() - interval '8 days', '${U.comA}'),
    ('${Q.q2}','${ORG_A}','ORC-2','${PR1}', now() - interval '4 days',   now() - interval '7 days', '${U.comA}'),
    ('${Q.q4}','${ORG_A}','ORC-4','${PR2}', now() - interval '20 days',  now() - interval '21 days', '${U.comA}');
  INSERT INTO public.quote_lines (id, quote_id, ordem, categoria, descricao_snapshot, qt, unidade, product_id, service_id, bundle_id, item_supplier_id, selected_attributes) VALUES
    ('${QL.q1Torneira}','${Q.q1}', 1, 'produto', 'Torneira', 2, 'un', '${P.torneira}', NULL, NULL, NULL, NULL),
    ('${QL.q1Canal}',   '${Q.q1}', 2, 'servico', 'Canalização (pontos)', 3, 'pt', NULL, '${SV.canal}', NULL, NULL, NULL),
    ('${QL.q1Base}',    '${Q.q1}', 3, 'produto', 'Base de duche', 1, 'un', '${P.base}', NULL, NULL, '${IS_LINHA}', NULL),
    ('${QL.q1Pintura}', '${Q.q1}', 4, 'servico', 'Pintura de teto', 12, 'm²', NULL, '${SV.pintura}', NULL, NULL, NULL),
    ('${QL.q2Pack}',    '${Q.q2}', 1, 'conjunto', 'Pack WC', 2, 'un', NULL, NULL, 'a0b00000-0000-0000-0000-000000000001', NULL,
       '{"bundle_components":[{"type":"product","source_id":"${P.sanita}","quantity":1},
                              {"type":"product","source_id":"${P.cola}","quantity":4},
                              {"type":"service","source_id":"${SV.loucas}","quantity":1}]}'),
    ('${QL.q2Lavatorio}','${Q.q2}', 2, 'produto', 'Lavatório', 1, 'un', '${P.lavatorio}', NULL, NULL, NULL, NULL),
    ('${QL.q2Espelho}', '${Q.q2}', 3, 'produto', 'Espelho', 1, 'un', '${P.espelho}', NULL, NULL, NULL, NULL),
    ('${QL.q2Torneira}','${Q.q2}', 4, 'produto', 'Torneira lavatório', 1, 'un', '${P.torneira}', NULL, NULL, NULL, NULL),
    ('${QL.q3Espelho}', '${Q.q3}', 1, 'produto', 'Espelho (orçamento recusado)', 99, 'un', '${P.espelho}', NULL, NULL, NULL, NULL),
    ('${QL.q4Silicone}','${Q.q4}', 1, 'produto', 'Silicone', 9, 'un', '${P.silicone}', NULL, NULL, NULL, NULL);

  INSERT INTO public.client_contracts (id, organization_id, status, proposal_id, contract_number) VALUES
    ('${CC1}','${ORG_A}','sent','${PR1}','CC-2026-0001'),
    ('${CC2}','${ORG_A}','sent','${PR2}','CC-2026-0002'),
    ('${CC_B}','${ORG_B}','signed', NULL, 'CC-B-1');
`);

/* ── A migração, duas vezes ──────────────────────────────────────────────── */
console.log("\n─── a migração ──────────────────────────");
for (const vez of [1, 2]) {
  try { await db.exec(MIGRACAO); ok(`correu (${vez}.ª vez)`); }
  catch (e) { mau(`rebentou na ${vez}.ª vez — ${e.message.split("\n")[0]}`); }
}
if (falhas.length) { console.log("\nA migração não corre: o resto não faz sentido."); process.exit(1); }

/* ── Ajudas para correr como uma pessoa ──────────────────────────────────── */
async function como(authUid, sql) {
  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid ?? ""}';
    ${sql}
    COMMIT;`);
  return r.flatMap((x) => x.rows ?? []);
}
async function linhas(authUid, sql) {
  try { return await como(authUid, sql); }
  catch (e) { await db.exec("ROLLBACK").catch(() => {}); throw e; }
}
async function valor(authUid, sql) {
  const r = (await linhas(authUid, sql)).at(-1);
  const v = r ? Object.values(r)[0] : undefined;
  return typeof v === "string" && /^[[{]/.test(v) ? JSON.parse(v) : v;
}
async function deveCorrer(nome, authUid, sql) {
  try { const v = await valor(authUid, sql); ok(nome); return v; }
  catch (e) { mau(`${nome} — ${e.message.split("\n")[0]}`); return undefined; }
}
async function deveSerRecusado(nome, authUid, sql, trecho) {
  try { await linhas(authUid, sql); mau(`${nome} — PASSOU, e devia ter sido recusado`); }
  catch (e) {
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — mensagem errada: ${e.message.split("\n")[0]}`);
  }
}
const obter = (auth, cc) => valor(auth, `SELECT public.rpc_ec_obter('${cc}');`);
const linhaDe = (ec, tipo, pid, qlid) =>
  ec.linhas.filter((l) => (tipo == null || l.tipo === tipo) && (pid == null || l.product_id === pid) && (qlid == null || l.quote_line_id === qlid));
const somaPO = async (cc, pid) => Number((await um(`SELECT COALESCE(SUM(poi.quantity),0) s FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
   WHERE po.source_type='contract' AND po.source_id='${cc}' AND poi.product_id='${pid}'`)).s);

/* ── Permissões dadas pela migração ──────────────────────────────────────── */
console.log("\n─── permissões (provisórias) ────────────");
{
  const perms = async (role) => (await q(`SELECT permission_code FROM public.anew_role_permissions
      WHERE role_id='${role}' AND permission_code IN ('client_orders.validate','purchase_orders.approve') ORDER BY 1`))
    .map((r) => r.permission_code).join(", ");
  const adm = await perms(ROLE.admA);
  adm === "client_orders.validate, purchase_orders.approve" ? ok(`roles.edit (Administração) recebe: ${adm}`) : mau(`Administração: ${adm}`);
  (await perms(ROLE.comA)) === "" ? ok("o comercial não recebe nada") : mau("o comercial recebeu permissões");
  const cat = await q(`SELECT code, name, category FROM public.anew_permissions WHERE code IN ('client_orders.validate','purchase_orders.approve') ORDER BY code`);
  cat.length === 2 && cat[0].category === "client_orders" && cat[1].name === "Aprovar encomendas de compra"
    ? ok("client_orders.validate criada (categoria client_orders); purchase_orders.approve reutilizada, sem mexer")
    : mau(`catálogo: ${JSON.stringify(cat)}`);
  const dup = await um(`SELECT count(*)::int n FROM (SELECT role_id, permission_code FROM public.anew_role_permissions GROUP BY 1,2 HAVING count(*) > 1) x`);
  dup.n === 0 ? ok("sem permissões duplicadas depois de 2 corridas") : mau(`${dup.n} duplicadas`);
}

/* ── Assinatura: o gatilho do Rafael encomenda o que já sabe ─────────────── */
console.log("\n─── assinatura (gatilho existente) ──────");
await db.exec(`
  UPDATE public.client_contracts SET status='signed', signature_date = now() - interval '3 days' WHERE id='${CC2}';
  UPDATE public.client_contracts SET status='signed', signature_date = now() - interval '1 day'  WHERE id='${CC1}';
`);
{
  const po = await q(`SELECT poi.product_id, poi.quantity::numeric q, poi.quote_line_id, poi.component_index
      FROM public.purchase_orders po JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
     WHERE po.source_id='${CC1}' ORDER BY poi.product_id`);
  const t = po.find((x) => x.product_id === P.torneira);
  const c = po.find((x) => x.product_id === P.cola);
  po.length === 2 && igual(t?.q, 1) && igual(c?.q, 5)
    ? ok("o gatilho encomendou (só do orçamento mais recente): torneira 1 e cimento-cola 5 (8 − 3 em stock)")
    : mau(`o gatilho encomendou: ${JSON.stringify(po)}`);
  const n2 = await um(`SELECT count(*)::int n FROM public.purchase_orders WHERE source_id='${CC2}'`);
  n2.n === 0 ? ok("CC2 (silicone 9, stock 10) não pediu nada ao fornecedor") : mau(`CC2 tem ${n2.n} encomendas`);
}

/* ── Gerar: as linhas certas ─────────────────────────────────────────────── */
console.log("\n─── gerar a Encomenda Cliente ───────────");
await deveSerRecusado("o comercial não gera", AUTH.comA, `SELECT public.rpc_ec_gerar('${CC1}');`, "Sem permissão");
await deveSerRecusado("o comercial nem a vê", AUTH.comA, `SELECT public.rpc_ec_obter('${CC1}');`, "sem permissão");
const EC1 = await deveCorrer("a planeadora gera a Encomenda Cliente do CC1", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC1}');`);
let ec = await obter(AUTH.plaA, CC1);
{
  ec?.encomenda?.estado === "rascunho" && ec.encomenda.fornecedor_estado === "por_gerar"
    ? ok("nasce em rascunho, fornecedor por gerar") : mau(`estado: ${JSON.stringify(ec?.encomenda)}`);
  const tor = linhaDe(ec, "produto", P.torneira);
  tor.length === 2 && igual(tor[0].qtd_necessaria, 2) && igual(tor[1].qtd_necessaria, 1)
    ? ok("torneira: 2 do orçamento 1 + 1 do orçamento 2 (os dois aceites, por ordem)") : mau(`torneira: ${JSON.stringify(tor)}`);
  linhaDe(ec, "produto", P.espelho).length === 1 && igual(linhaDe(ec, "produto", P.espelho)[0].qtd_necessaria, 1)
    ? ok("espelho: 1 (o orçamento 3, não aceite, fica de fora)") : mau("espelho do orçamento 3 entrou");
  const san = linhaDe(ec, "produto", P.sanita)[0];
  san?.origem === "conjunto" && igual(san.qtd_necessaria, 2) ? ok("sanita: 2 (componente do Pack WC × 2)") : mau(`sanita: ${JSON.stringify(san)}`);
  const cola = linhaDe(ec, "produto", P.cola)[0];
  igual(cola?.qtd_necessaria, 8) ? ok("cimento-cola: 8 (4 por pack × 2)") : mau(`cola: ${cola?.qtd_necessaria}`);
  const sil = linhaDe(ec, "consumivel", P.silicone);
  sil.length === 2 && igual(sil[0].qtd_necessaria, 1.5) && igual(sil[1].qtd_necessaria, 1)
    ? ok("silicone (consumível): 1,5 da canalização (0,5 × 3) + 1 das louças (regra de três: ⌈1/4 × 2⌉)")
    : mau(`silicone: ${JSON.stringify(sil.map((x) => x.qtd_necessaria))}`);
  const eq = linhaDe(ec, "equipamento")[0];
  eq?.equipamento_id === EQ_PRENSA && igual(eq.qtd_necessaria, 1.2) && eq.unidade === "h"
    ? ok("equipamento: prensa 1,2 h (0,4 h × 3 pontos)") : mau(`equipamento: ${JSON.stringify(eq)}`);
  const mo = linhaDe(ec, "mao_obra")[0];
  mo?.skill_id === SKILL && igual(mo.qtd_necessaria, 5) && mo.origem === "ficha_servico"
    ? ok("mão de obra: Canalizador 5 h (30 + 60×3 min + 45×2 min, das tarefas-modelo, incl. serviço do conjunto)")
    : mau(`mão de obra: ${JSON.stringify(mo)}`);
  const f = (pid) => linhaDe(ec, null, pid).map((l) => `${l.fornecedor_origem}:${l.fornecedor_nome ?? "-"}`)[0];
  f(P.torneira) === "preferido:Leroy Pro" ? ok("torneira → fornecedor preferido") : mau(`torneira: ${f(P.torneira)}`);
  f(P.base) === "linha_orcamento:Banema" ? ok("base de duche → o fornecedor escolhido na linha do orçamento") : mau(`base: ${f(P.base)}`);
  f(P.sanita) === "produto:Sanitana" ? ok("sanita → products.supplier_id") : mau(`sanita: ${f(P.sanita)}`);
  f(P.lavatorio) === "marca:Roca" ? ok("lavatório → marca \" roca \" = fornecedor Roca") : mau(`lavatório: ${f(P.lavatorio)}`);
  f(P.espelho) === "nenhum:-" ? ok("espelho → nenhum") : mau(`espelho: ${f(P.espelho)}`);
  const precoSan = linhaDe(ec, "produto", P.sanita)[0]?.preco_compra;
  igual(precoSan, 95) ? ok("sanita: preço de compra 95 € (product_prices, sem ligação ao fornecedor)") : mau(`preço sanita ${precoSan}`);
  ec.linhas.length === 11 ? ok("11 linhas no total") : mau(`${ec.linhas.length} linhas`);
}
await deveCorrer("gerar outra vez não duplica", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC1}');`);
{
  const n = await um(`SELECT count(*)::int n FROM public.obra_encomenda_cliente_linha WHERE encomenda_id='${EC1}'`);
  const e = await um(`SELECT count(*)::int n FROM public.obra_encomenda_cliente WHERE contract_id='${CC1}'`);
  n.n === 11 && e.n === 1 ? ok("continua 1 encomenda com 11 linhas") : mau(`${e.n} encomendas, ${n.n} linhas`);
}
const LMAN = await deveCorrer("linha manual: 2 sacos de entulho", AUTH.plaA,
  `SELECT public.rpc_ec_linha_guardar('${EC1}', NULL, 'consumivel', NULL, 'Sacos de entulho', 'un', 2);`);
await deveCorrer("gerar outra vez mantém a manual", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC1}');`);
{
  const n = await um(`SELECT count(*)::int n FROM public.obra_encomenda_cliente_linha WHERE encomenda_id='${EC1}' AND origem='manual'`);
  n.n === 1 ? ok("a linha manual ficou") : mau(`${n.n} manuais`);
}
await deveCorrer("apagar a linha manual", AUTH.plaA, `SELECT public.rpc_ec_linha_apagar('${LMAN}');`);

/* ── Validar com stock parcial ───────────────────────────────────────────── */
console.log("\n─── validar (stock parcial) ─────────────");
await deveSerRecusado("compras (sem client_orders.validate) não valida", AUTH.comprA,
  `SELECT public.rpc_ec_validar('${EC1}');`, "client_orders.validate");
const V1 = await deveCorrer("a planeadora valida", AUTH.plaA, `SELECT public.rpc_ec_validar('${EC1}');`);
ec = await obter(AUTH.plaA, CC1);
{
  V1?.fornecedor_estado === "por_aprovar" && V1.notas === 5 ? ok("5 notas, fornecedor por aprovar") : mau(`validar: ${JSON.stringify(V1)}`);
  ec.encomenda.estado === "validada" && ec.encomenda.validada_por_nome === "Paula (planeadora)" && ec.encomenda.versao === 1
    ? ok("validada, por quem e versão 1") : mau(`cabeçalho: ${JSON.stringify(ec.encomenda)}`);
  const tor = linhaDe(ec, "produto", P.torneira);
  igual(tor[0].qtd_em_encomenda, 1) && igual(tor[0].qtd_em_falta, 1) && igual(tor[1].qtd_em_falta, 1)
    ? ok("torneira: 1 já encomendada pelo gatilho, faltam 2 (1 + 1)") : mau(`torneira: ${JSON.stringify(tor)}`);
  const cola = linhaDe(ec, "produto", P.cola)[0];
  igual(cola.qtd_em_encomenda, 5) && igual(cola.qtd_stock, 3) && igual(cola.qtd_em_falta, 0)
    ? ok("cimento-cola: 5 em encomenda + 3 de stock, nada em falta") : mau(`cola: ${JSON.stringify(cola)}`);
  const sil = linhaDe(ec, "consumivel", P.silicone);
  igual(sil[0].qtd_stock, 1) && igual(sil[0].qtd_em_falta, 0.5) && igual(sil[1].qtd_em_falta, 1)
    ? ok("silicone: stock 10 − 9 reservados ao CC2 (assinado antes) = 1; faltam 0,5 + 1")
    : mau(`silicone: ${JSON.stringify(sil.map((x) => [x.qtd_stock, x.qtd_em_falta]))}`);
  const notas = Object.fromEntries(ec.notas.map((n) => [n.fornecedor_nome ?? "sem", n]));
  const qts = (n) => n?.linhas.map((l) => `${l.descricao}:${Number(l.qtd)}`).join(", ");
  qts(notas["Leroy Pro"]) === "Torneira misturadora:1, Silicone sanitário:1, Silicone sanitário:1, Torneira misturadora:1"
    ? ok(`nota Leroy Pro: ${qts(notas["Leroy Pro"])} (o 0,5 arredonda para 1)`) : mau(`Leroy: ${qts(notas["Leroy Pro"])}`);
  qts(notas["Banema"]) === "Base de duche 80x120:1" ? ok("nota Banema: base de duche 1") : mau(`Banema: ${qts(notas["Banema"])}`);
  qts(notas["Sanitana"]) === "Sanita suspensa:2" ? ok("nota Sanitana: sanita 2") : mau(`Sanitana: ${qts(notas["Sanitana"])}`);
  qts(notas["Roca"]) === "Lavatório Roca 60:1" ? ok("nota Roca: lavatório 1") : mau(`Roca: ${qts(notas["Roca"])}`);
  qts(notas["sem"]) === "Espelho 80 cm:1" ? ok("nota SEM fornecedor: espelho 1") : mau(`sem: ${qts(notas["sem"])}`);
  const hoje = new Date();
  const dias = (d) => d ? Math.round((new Date(d) - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86400000) : null;
  dias(notas["Leroy Pro"]?.prazo_previsto) === 5 ? ok("prazo Leroy: hoje + 5 dias (o maior lead time das linhas; o SLA 4 vale para o silicone)")
    : mau(`prazo Leroy: ${notas["Leroy Pro"]?.prazo_previsto}`);
  dias(notas["Banema"]?.prazo_previsto) === 10 ? ok("prazo Banema: hoje + 10 (SLA do fornecedor)") : mau(`prazo Banema ${notas["Banema"]?.prazo_previsto}`);
  notas["Sanitana"]?.prazo_previsto == null ? ok("Sanitana sem prazo (sem SLA nem lead time)") : mau("Sanitana com prazo");
  const av = await um(`SELECT count(*)::int n FROM public.notifications WHERE type='nota_encomenda_por_aprovar' AND user_id IN ('${AUTH.comprA}','${AUTH.admA}')`);
  const avOutros = await um(`SELECT count(*)::int n FROM public.notifications WHERE type='nota_encomenda_por_aprovar' AND user_id NOT IN ('${AUTH.comprA}','${AUTH.admA}')`);
  av.n === 2 && avOutros.n === 0 ? ok("aviso no sino a quem aprova (compras + Direção), a mais ninguém") : mau(`avisos: ${av.n} / outros ${avOutros.n}`);
}
{
  const antes = await um(`SELECT count(*)::int n, max(atualizada_em) m FROM public.obra_encomenda_cliente_linha WHERE encomenda_id='${EC1}'`);
  await deveCorrer("gerar sobre a encomenda validada, sem nada de novo", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC1}');`);
  const depois = await um(`SELECT count(*)::int n, max(atualizada_em) m FROM public.obra_encomenda_cliente_linha WHERE encomenda_id='${EC1}'`);
  const e = await um(`SELECT estado FROM public.obra_encomenda_cliente WHERE id='${EC1}'`);
  e.estado === "validada" && antes.n === depois.n && String(antes.m) === String(depois.m)
    ? ok("não mexe em nada: continua validada, as mesmas linhas") : mau(`depois: ${e.estado}, ${depois.n} linhas`);
}
await deveSerRecusado("não se mexe nas linhas de uma encomenda validada", AUTH.plaA,
  `SELECT public.rpc_ec_linha_guardar('${EC1}', NULL, 'produto', '${P.espelho}', NULL, 'un', 1);`, "rascunho");

/* ── Nada em falta → não necessária (com obra: mão de obra da obra) ──────── */
console.log("\n─── nada em falta ───────────────────────");
await db.exec(`
  INSERT INTO public.ops_obra (id, organization_id, contrato_id) VALUES ('${OBRA2}','${ORG_A}','${CC2}');
  INSERT INTO public.ops_obra_tarefa (organization_id, obra_id, minutos_previstos, skill_id) VALUES
    ('${ORG_A}','${OBRA2}', 90, '${SKILL}'), ('${ORG_A}','${OBRA2}', 30, NULL);
`);
const EC2 = await deveCorrer("gerar CC2", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC2}');`);
{
  const e = await obter(AUTH.plaA, CC2);
  e.encomenda.obra_id === OBRA2 ? ok("a encomenda fica ligada à obra do contrato") : mau(`obra ${e.encomenda.obra_id}`);
  const mo = linhaDe(e, "mao_obra").map((l) => `${l.descricao}:${Number(l.qtd_necessaria)}:${l.origem}`).sort().join(" | ");
  mo === "Mão de obra · Canalizador:1.5:obra | Mão de obra · sem competência definida:0.5:obra"
    ? ok("com obra, a mão de obra vem das tarefas da obra (1,5 h Canalizador + 0,5 h sem competência)") : mau(`mão de obra: ${mo}`);
}
const V2 = await deveCorrer("validar CC2", AUTH.plaA, `SELECT public.rpc_ec_validar('${EC2}');`);
{
  V2?.fornecedor_estado === "nao_necessaria" && V2.notas === 0
    ? ok("silicone 9: stock 10 − 1 reservado pela Encomenda Cliente do CC1 = 9 → nada em falta → não necessária")
    : mau(`CC2: ${JSON.stringify(V2)}`);
}

/* ── Notas: sem fornecedor, aprovar, não duplicar ───────────────────────── */
console.log("\n─── notas de encomenda ──────────────────");
const nota = (nome) => ec.notas.find((n) => (n.fornecedor_nome ?? "sem") === nome);
await deveSerRecusado("a planeadora (sem purchase_orders.approve) não aprova", AUTH.plaA,
  `SELECT public.rpc_nota_aprovar('${nota("Leroy Pro").id}');`, "purchase_orders.approve");
await deveSerRecusado("a nota SEM fornecedor não se aprova", AUTH.comprA,
  `SELECT public.rpc_nota_aprovar('${nota("sem").id}');`, "Escolha o fornecedor");
const PO1 = await deveCorrer("compras aprova a nota Leroy Pro", AUTH.comprA, `SELECT public.rpc_nota_aprovar('${nota("Leroy Pro").id}');`);
{
  const po = await um(`SELECT status, source_type, source_id, supplier_id, total_value::numeric t, expected_delivery,
      created_by, (SELECT count(*)::int FROM public.purchase_order_items WHERE purchase_order_id = po.id) itens
      FROM public.purchase_orders po WHERE id='${PO1}'`);
  po?.status === "pending" && po.source_type === "contract" && po.source_id === CC1 && po.supplier_id === SUP.pref
    ? ok("purchase_order: pending, source_type 'contract', source_id = contrato, fornecedor certo") : mau(`PO: ${JSON.stringify(po)}`);
  po?.itens === 4 && igual(po.t, 2 * 40 + 2 * 4.84) && po.created_by === U.comprA && po.expected_delivery
    ? ok("4 itens, total 89,68 € (2 × 40 + 2 × 4,84), criada por quem aprovou, com data prevista") : mau(`PO: ${JSON.stringify(po)}`);
  const ql = await um(`SELECT count(*)::int n FROM public.purchase_order_items WHERE purchase_order_id='${PO1}' AND quote_line_id IS NOT NULL`);
  ql.n === 4 ? ok("os itens ficam ligados às linhas do orçamento (a reserva FIFO conta-os)") : mau(`${ql.n} itens ligados`);
  (await somaPO(CC1, P.torneira)) === 3 ? ok("torneira: 1 (gatilho) + 2 (nota) = 3 = o vendido — não duplicou") : mau(`torneira em PO: ${await somaPO(CC1, P.torneira)}`);
  const pedir = await valor(AUTH.admA, `SELECT public.fn_client_order_request_missing('${CC1}', '${U.admA}');`).catch((e) => ({ erro: e.message }));
  // fn_client_order_request_missing é só service_role; corre-se como dono.
  const pedir2 = (await q(`SELECT public.fn_client_order_request_missing('${CC1}', '${U.admA}') r`))[0].r;
  pedir2.items_created === 0 ? ok("o \"Pedir em falta\" do CRM, a seguir, não pede mais nada (0 itens)") : mau(`Pedir em falta: ${JSON.stringify(pedir2)}`);
  pedir?.erro?.includes("permission denied") ? ok("(e continua fechado a authenticated, como estava)") : mau(`fn_client_order_request_missing aberto: ${JSON.stringify(pedir)}`);
  ec = await obter(AUTH.comprA, CC1);
  ec.encomenda.fornecedor_estado === "parcial" ? ok("fornecedor: parcial (1 de 5 aprovadas)") : mau(`estado ${ec.encomenda.fornecedor_estado}`);
  const tor = linhaDe(ec, "produto", P.torneira);
  igual(tor[0].qtd_em_falta, 0) && igual(tor[0].qtd_em_encomenda, 2) ? ok("a linha passa de 'em falta' a 'em encomenda'") : mau(`linha ${JSON.stringify(tor[0])}`);
}
await deveSerRecusado("aprovar duas vezes é recusado", AUTH.comprA, `SELECT public.rpc_nota_aprovar('${nota("Leroy Pro").id}');`, "já não está");
await deveSerRecusado("rejeitar sem motivo é recusado", AUTH.comprA, `SELECT public.rpc_nota_rejeitar('${nota("Roca").id}', '');`, "motivo");
await deveCorrer("compras rejeita a nota Roca", AUTH.comprA, `SELECT public.rpc_nota_rejeitar('${nota("Roca").id}', 'Pedir orçamento a outro'); SELECT 1;`);
{
  const nlSem = nota("sem").linhas[0].id;
  const dest = await deveCorrer("mudar o fornecedor do espelho para Leroy Pro", AUTH.comprA,
    `SELECT public.rpc_nota_mudar_fornecedor('${nlSem}', '${SUP.pref}');`);
  ec = await obter(AUTH.comprA, CC1);
  const semNota = ec.notas.filter((n) => n.supplier_id == null);
  semNota.length === 0 ? ok("a nota sem fornecedor ficou vazia e desapareceu") : mau(`${semNota.length} notas sem fornecedor`);
  const nova = ec.notas.find((n) => n.id === dest);
  nova?.estado === "proposta" && nova.fornecedor_nome === "Leroy Pro" && nova.linhas.length === 1
    ? ok("nova nota Leroy Pro em proposta (a aprovada não se mexe)") : mau(`nova: ${JSON.stringify(nova)}`);
  const esp = linhaDe(ec, "produto", P.espelho)[0];
  esp.supplier_id === SUP.pref && esp.fornecedor_mudado ? ok("a escolha fica na linha da encomenda") : mau(`espelho: ${JSON.stringify(esp)}`);
  await deveSerRecusado("o comercial não muda fornecedores", AUTH.comA,
    `SELECT public.rpc_nota_mudar_fornecedor('${nova.linhas[0].id}', '${SUP.linha}');`, "sem permissão");
  await deveSerRecusado("não se muda para um fornecedor de outra organização", AUTH.comprA,
    `SELECT public.rpc_nota_mudar_fornecedor('${nova.linhas[0].id}', '${SUP.b}');`, "Fornecedor não encontrado");
}

/* ── Reabrir e validar outra vez ─────────────────────────────────────────── */
console.log("\n─── reabrir ─────────────────────────────");
await deveSerRecusado("reabrir sem motivo é recusado", AUTH.plaA, `SELECT public.rpc_ec_reabrir('${EC1}', '');`, "motivo");
await deveSerRecusado("compras não reabre", AUTH.comprA, `SELECT public.rpc_ec_reabrir('${EC1}', 'Cliente mudou');`, "client_orders.validate");
await deveCorrer("a planeadora reabre", AUTH.plaA, `SELECT public.rpc_ec_reabrir('${EC1}', 'Cliente acrescentou um espelho'); SELECT 1;`);
ec = await obter(AUTH.plaA, CC1);
{
  const est = ec.notas.map((n) => n.estado);
  ec.encomenda.estado === "rascunho" && ec.encomenda.fornecedor_estado === "por_gerar"
    ? ok("volta a rascunho, fornecedor por gerar") : mau(`cabeçalho: ${JSON.stringify(ec.encomenda)}`);
  est.filter((x) => x === "proposta").length === 0 && est.filter((x) => x === "aprovada").length === 1
    ? ok("as notas em proposta ficam rejeitadas; a aprovada fica") : mau(`notas: ${est}`);
  ec.notas.some((n) => n.motivo_rejeicao?.startsWith("Encomenda reaberta: Cliente acrescentou"))
    ? ok("motivo: \"Encomenda reaberta: …\"") : mau("sem motivo de reabertura nas notas");
}
await deveCorrer("gerar outra vez", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC1}');`);
await deveCorrer("acrescentar 1 ao espelho (linha automática → manual)", AUTH.plaA,
  `SELECT public.rpc_ec_linha_guardar('${EC1}', (SELECT id FROM public.obra_encomenda_cliente_linha
     WHERE encomenda_id='${EC1}' AND product_id='${P.espelho}'), NULL, NULL, NULL, NULL, 2);`);
const V3 = await deveCorrer("validar outra vez", AUTH.plaA, `SELECT public.rpc_ec_validar('${EC1}');`);
ec = await obter(AUTH.plaA, CC1);
{
  const prop = ec.notas.filter((n) => n.estado === "proposta");
  const nomes = prop.map((n) => `${n.fornecedor_nome}:${n.linhas.map((l) => `${l.descricao}:${Number(l.qtd)}`).join("+")}`).sort().join(" | ");
  nomes === "Banema:Base de duche 80x120:1 | Leroy Pro:Espelho 80 cm:2 | Roca:Lavatório Roca 60:1 | Sanitana:Sanita suspensa:2"
    ? ok("4 notas novas: torneira e silicone já não (estão encomendados); o espelho mantém o fornecedor escolhido e passa a 2")
    : mau(`notas novas: ${nomes}`);
  V3?.versao === 2 && ec.encomenda.fornecedor_estado === "parcial" ? ok("versão 2, fornecedor parcial") : mau(`V3 ${JSON.stringify(V3)} / ${ec.encomenda.fornecedor_estado}`);
  const linhasManuais = ec.linhas.filter((l) => l.origem === "manual").length;
  linhasManuais === 1 && ec.linhas.length === 11 ? ok("a linha editada ficou manual e não duplicou") : mau(`${linhasManuais} manuais, ${ec.linhas.length} linhas`);
}
{
  // Aprova o resto: fica "aprovada".
  for (const n of ec.notas.filter((x) => x.estado === "proposta")) {
    await linhas(AUTH.admA, `SELECT public.rpc_nota_aprovar('${n.id}');`);
  }
  ec = await obter(AUTH.admA, CC1);
  ec.encomenda.fornecedor_estado === "aprovada" ? ok("a Direção (roles.edit → purchase_orders.approve) aprova o resto: fornecedor aprovado")
    : mau(`estado ${ec.encomenda.fornecedor_estado}`);
}

/* ── Isolamento entre organizações ───────────────────────────────────────── */
console.log("\n─── isolamento entre organizações ───────");
{
  await deveSerRecusado("B não vê a encomenda de A", AUTH.admB, `SELECT public.rpc_ec_obter('${CC1}');`, "sem permissão");
  await deveSerRecusado("B não gera a encomenda de A", AUTH.admB, `SELECT public.rpc_ec_gerar('${CC1}');`, "Sem permissão");
  await deveSerRecusado("B não valida a encomenda de A", AUTH.admB, `SELECT public.rpc_ec_validar('${EC2}');`, "Sem permissão");
  await deveSerRecusado("B não reabre a encomenda de A", AUTH.admB, `SELECT public.rpc_ec_reabrir('${EC1}', 'intruso');`, "Sem permissão");
  const algumaNota = (await um(`SELECT id FROM public.nota_encomenda_fornecedor WHERE estado='rejeitada' LIMIT 1`)).id;
  await deveSerRecusado("B não aprova notas de A", AUTH.admB, `SELECT public.rpc_nota_aprovar('${algumaNota}');`, "Sem permissão");
  await deveSerRecusado("B não lê os dados em falta de A", AUTH.admB, `SELECT public.rpc_ec_dados_em_falta('${ORG_A}');`, "Sem permissão");
  await deveSerRecusado("B não liga marcas de A", AUTH.admB,
    `SELECT public.rpc_ec_ligar_marca_fornecedor('${ORG_A}', '${MARCA_ROCA}', '${SUP.roca}');`, "Sem permissão");
  for (const t of ["obra_encomenda_cliente", "obra_encomenda_cliente_linha", "nota_encomenda_fornecedor", "nota_encomenda_fornecedor_linha"]) {
    const r = await linhas(AUTH.admB, `SELECT count(*)::int n FROM public.${t};`);
    r[0].n === 0 ? ok(`B lê 0 linhas em ${t}`) : mau(`B leu ${r[0].n} linhas em ${t}`);
  }
  const rA = await linhas(AUTH.plaA, `SELECT count(*)::int n FROM public.obra_encomenda_cliente;`);
  rA[0].n === 2 ? ok("a planeadora de A lê as 2 encomendas de A (RLS)") : mau(`A leu ${rA[0].n}`);
  await deveSerRecusado("ninguém escreve diretamente nas tabelas", AUTH.plaA,
    `UPDATE public.obra_encomenda_cliente SET estado='validada' WHERE id='${EC1}';`, "permission denied");
  await deveSerRecusado("o comercial não lê as tabelas", AUTH.comA,
    `SELECT CASE WHEN count(*) = 0 THEN 1/0 END FROM public.obra_encomenda_cliente;`, "division by zero");
  await deveSerRecusado("sem sessão (anon) não se chama nenhuma RPC", null,
    `RESET ROLE; SET LOCAL ROLE anon; SELECT public.rpc_ec_obter('${CC1}');`, "permission denied");
  await deveSerRecusado("B gera a sua (contrato sem orçamentos) — sem obra nem linhas, mas valida? não: sem linhas", AUTH.admB,
    `SELECT public.rpc_ec_validar(public.rpc_ec_gerar('${CC_B}'));`, "não tem linhas");
}

/* ── Dados em falta e ligar marca → fornecedor ───────────────────────────── */
console.log("\n─── dados em falta ──────────────────────");
{
  await deveSerRecusado("o comercial não vê o relatório", AUTH.comA, `SELECT public.rpc_ec_dados_em_falta('${ORG_A}');`, "Sem permissão");
  const d = await deveCorrer("compras lê o relatório", AUTH.comprA, `SELECT public.rpc_ec_dados_em_falta('${ORG_A}');`);
  const r = d?.resumo ?? {};
  r.produtos_vendidos === 7 ? ok("7 produtos vendidos (6 no CC1 + o silicone do CC2; o consumível não conta como vendido)")
    : mau(`vendidos: ${r.produtos_vendidos}`);
  const semNenhum = d.produtos.filter((p) => p.resolvido_id == null).map((p) => p.nome).sort().join(", ");
  r.sem_fornecedor === 2 && semNenhum === "Base de duche 80x120, Espelho 80 cm"
    ? ok("2 sem fornecedor nenhum: espelho e base de duche (a Banema só foi escolhida numa linha, não é preferida)")
    : mau(`sem fornecedor: ${r.sem_fornecedor} (${semNenhum})`);
  r.sem_fornecedor_preferido === 4 ? ok("4 sem fornecedor preferido (base, sanita, lavatório, espelho)") : mau(`sem preferido ${r.sem_fornecedor_preferido}`);
  const semFicha = d.servicos_sem_ficha.map((s) => s.nome).join(",");
  semFicha === "Pintura de teto" ? ok("serviço vendido sem ficha de materiais: Pintura de teto") : mau(`sem ficha: ${semFicha}`);
  const m = d.marcas[0];
  d.marcas.length === 1 && m.marca.trim() === "roca" && m.fornecedor === "Roca" && m.produtos === 2 && m.vendidos === 1
    ? ok("sugestão: marca Roca → fornecedor Roca (2 produtos, 1 vendido)") : mau(`marcas: ${JSON.stringify(d.marcas)}`);
  r.sem_gestao_stock === 5 ? ok("5 vendidos sem gestão de stock (só torneira e silicone gerem)") : mau(`sem gestão de stock ${r.sem_gestao_stock}`);
  d.pode_ligar === true ? ok("compras pode ligar (purchase_orders.approve)") : mau("compras não pode ligar");

  await deveSerRecusado("a planeadora não liga marcas (sem products.edit nem purchase_orders.approve)", AUTH.plaA,
    `SELECT public.rpc_ec_ligar_marca_fornecedor('${ORG_A}', '${MARCA_ROCA}', '${SUP.roca}');`, "Sem permissão");
  const lig = await deveCorrer("compras liga a marca Roca → Roca", AUTH.comprA,
    `SELECT public.rpc_ec_ligar_marca_fornecedor('${ORG_A}', '${MARCA_ROCA}', '${SUP.roca}');`);
  lig?.criadas === 2 ? ok("2 ligações preferidas criadas (lavatório e bidé)") : mau(`ligar: ${JSON.stringify(lig)}`);
  const lig2 = await valor(AUTH.comprA, `SELECT public.rpc_ec_ligar_marca_fornecedor('${ORG_A}', '${MARCA_ROCA}', '${SUP.roca}');`);
  lig2?.total === 0 ? ok("ligar outra vez não faz nada") : mau(`2.ª vez: ${JSON.stringify(lig2)}`);
  const d2 = await valor(AUTH.comprA, `SELECT public.rpc_ec_dados_em_falta('${ORG_A}');`);
  d2.marcas.length === 0 && d2.resumo.sem_fornecedor_preferido === 3
    ? ok("depois: sem sugestões de marca e só 3 sem preferido") : mau(`depois: ${JSON.stringify(d2.resumo)}`);
  const f = (await q(`SELECT * FROM public.fn_ec_resolver_fornecedor('${ORG_A}', '${P.lavatorio}', NULL)`))[0];
  f.origem === "preferido" && f.supplier_id === SUP.roca && f.prazo_dias === 7
    ? ok("o lavatório resolve agora como preferido (Roca, prazo 7 do SLA)") : mau(`lavatório: ${JSON.stringify(f)}`);
}

/* ── Alerta de encomendas paradas ────────────────────────────────────────── */
console.log("\n─── encomendas paradas ──────────────────");
{
  await db.exec(`UPDATE public.purchase_orders SET created_at = now() - interval '10 days'
                  WHERE source_id='${CC1}' AND notes LIKE 'Gerada automaticamente%'`);
  const n = await deveCorrer("verificar as paradas (> 7 dias)", AUTH.comprA, `SELECT public.rpc_ec_alertar_paradas('${ORG_A}', 7);`);
  n === 2 ? ok("1 encomenda parada → aviso a compras e à Direção (2)") : mau(`avisos criados: ${n}`);
  const av = await q(`SELECT user_id, title FROM public.notifications WHERE type='encomenda_fornecedor_parada'`);
  av.every((a) => /^Encomenda parada: PO-/.test(a.title)) ? ok(`título: "${av[0]?.title}"`) : mau(`títulos: ${JSON.stringify(av)}`);
  await db.exec(`UPDATE public.notifications SET is_resolved = true WHERE type='encomenda_fornecedor_parada'`);
  const n2 = await valor(AUTH.comprA, `SELECT public.rpc_ec_alertar_paradas('${ORG_A}', 7);`);
  const tot = await um(`SELECT count(*)::int n FROM public.notifications WHERE type='encomenda_fornecedor_parada'`);
  n2 === 0 && tot.n === 2 ? ok("só uma vez por encomenda (mesmo depois de resolvido)") : mau(`2.ª vez: ${n2}, total ${tot.n}`);
  const d = await valor(AUTH.comprA, `SELECT public.rpc_ec_dados_em_falta('${ORG_A}');`);
  d.encomendas_paradas.length === 1 && d.encomendas_paradas[0].dias === 10
    ? ok("o relatório mostra a encomenda parada há 10 dias") : mau(`paradas: ${JSON.stringify(d.encomendas_paradas)}`);
}


/* ── Adenda: gerar sobre uma encomenda validada só acrescenta a diferença ── */
console.log("\n─── adenda (só a diferença) ─────────────");
{
  const antes = await q(`SELECT id, qtd_necessaria::numeric q, qtd_stock::numeric s FROM public.obra_encomenda_cliente_linha
     WHERE encomenda_id='${EC2}' AND product_id='${P.silicone}'`);
  await db.exec(`
    UPDATE public.quote_lines SET qt = 11 WHERE id='${QL.q4Silicone}';
    INSERT INTO public.quote_lines (quote_id, ordem, categoria, descricao_snapshot, qt, unidade, product_id)
      VALUES ('${Q.q4}', 2, 'produto', 'Torneira (a mais)', 1, 'un', '${P.torneira}');`);
  await deveCorrer("gerar o CC2 outra vez (validado)", AUTH.plaA, `SELECT public.rpc_ec_gerar('${CC2}');`);
  const e = await obter(AUTH.plaA, CC2);
  const sil = linhaDe(e, "produto", P.silicone);
  const orig = sil.find((l) => l.id === antes[0].id);
  orig && igual(orig.qtd_necessaria, 9) && igual(orig.qtd_stock, 9)
    ? ok("a linha validada fica igual (9, com o stock reservado)") : mau(`linha original: ${JSON.stringify(orig)}`);
  const nova = sil.find((l) => l.id !== antes[0].id);
  nova && igual(nova.qtd_necessaria, 2) ? ok("acrescenta uma linha só com a diferença do silicone (11 − 9 = 2)") : mau(`silicone: ${JSON.stringify(sil)}`);
  linhaDe(e, "produto", P.torneira).length === 1 ? ok("e a torneira nova") : mau("torneira nova em falta");
  e.encomenda.estado === "rascunho" && e.encomenda.fornecedor_estado === "por_gerar"
    ? ok("volta a rascunho para validar outra vez") : mau(`estado ${JSON.stringify(e.encomenda)}`);
  const v = await deveCorrer("validar outra vez", AUTH.plaA, `SELECT public.rpc_ec_validar('${EC2}');`);
  const e2 = await obter(AUTH.plaA, CC2);
  const n = e2.notas.filter((x) => x.estado === "proposta").map((x) => `${x.fornecedor_nome}:${x.linhas.map((l) => `${l.descricao}:${Number(l.qtd)}`).join("+")}`);
  v?.notas === 1 && n[0] === "Leroy Pro:Silicone sanitário:2+Torneira misturadora:1"
    ? ok("a nota pede só o que falta a mais: silicone 2 (⌈1,5⌉) e torneira 1") : mau(`notas: ${JSON.stringify(n)}`);
}

/* ── Terceira corrida, com dados ─────────────────────────────────────────── */
console.log("\n─── idempotência com dados ──────────────");
{
  const conta = `SELECT (SELECT count(*) FROM public.obra_encomenda_cliente) a, (SELECT count(*) FROM public.obra_encomenda_cliente_linha) b,
    (SELECT count(*) FROM public.nota_encomenda_fornecedor) c, (SELECT count(*) FROM public.nota_encomenda_fornecedor_linha) d,
    (SELECT count(*) FROM public.anew_role_permissions) e, (SELECT count(*) FROM public.anew_permissions) f`;
  const antes = await um(conta);
  try { await db.exec(MIGRACAO); ok("a 3.ª corrida, já com dados, não rebenta"); }
  catch (e) { mau(`3.ª corrida — ${e.message.split("\n")[0]}`); }
  const depois = await um(conta);
  JSON.stringify(antes) === JSON.stringify(depois) ? ok("nada duplicado nem perdido") : mau(`antes ${JSON.stringify(antes)} depois ${JSON.stringify(depois)}`);
  try {
    await db.exec(`INSERT INTO public.anew_roles (id, organization_id, name, is_system) VALUES ('a1000000-0000-0000-0000-0000000000ff','${ORG_A}','Sistema', true);
                   INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES ('a1000000-0000-0000-0000-0000000000ff','x.teste')`);
    mau("o gatilho de proteção dos papéis de sistema ficou desligado");
  } catch { ok("o gatilho de proteção dos papéis de sistema voltou a ligar"); }
}

console.log(falhas.length ? `\n${falhas.length} verificação(ões) falharam.` : "\nTudo certo.");
process.exit(falhas.length ? 1 : 0);

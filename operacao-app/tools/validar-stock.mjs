/**
 * Prova db/stock-leitura.sql contra um Postgres limpo (PGlite), sem tocar no
 * Supabase.
 *
 *   · instala numa base SEM as tabelas do Inventário, e aí devolve vazio;
 *   · o "disponível" é o "Livre" do CRM: stock físico da organização (todos os
 *     armazéns não apagados) − reservado pelas Encomendas de Cliente
 *     (fn_client_order_line_reservations); "a chegar" são as POs para stock
 *     por receber, em unidades de stock;
 *   · a ficha técnica × quantidade: fixa, por área (ceil), embalagem;
 *   · isolamento: só a organização pedida, só com Operações nessa
 *     organização; as internas não se chamam de fora;
 *   · não cria tabelas nem escreve.
 *
 *     npm run validar-stock
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, AUTENTICACAO_REAL } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};
const igual = (nome, real, esperado) => {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  a === b ? ok(nome) : mau(`${nome} — esperado ${b}, veio ${a}`);
};

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const U = {
  tecA: "a0000000-0000-0000-0000-000000000001", // Operações na A
  tecB: "a0000000-0000-0000-0000-000000000002", // Operações na B
  semPerfil: "a0000000-0000-0000-0000-000000000003", // permissão na A, sem perfil de Operações
  tecAB: "a0000000-0000-0000-0000-000000000004", // membro da A e da B, perfil só na A
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));

await db.exec(STUBS_CRM);
await db.exec(AUTENTICACAO_REAL);
await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

const R = { opsA: "d0000000-0000-0000-0000-00000000000a", opsB: "d0000000-0000-0000-0000-00000000000b" };
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.opsA}','${ORG_A}','Ops A'), ('${R.opsB}','${ORG_B}','Ops B');
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.opsA}','operations.view'), ('${R.opsB}','operations.view');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.tecA}','${ORG_A}','${R.opsA}','active'),
    ('${U.tecB}','${ORG_B}','${R.opsB}','active'),
    ('${U.semPerfil}','${ORG_A}','${R.opsA}','active'),
    ('${U.tecAB}','${ORG_A}','${R.opsA}','active'),
    ('${U.tecAB}','${ORG_B}','${R.opsB}','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG_A}','${U.tecA}','tecnico'), ('${ORG_B}','${U.tecB}','tecnico'),
    ('${ORG_A}','${U.tecAB}','tecnico');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql}; COMMIT;`;
}
async function linhas(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  return r.flatMap((x) => x.rows ?? []);
}
async function passa(nome, authUid, sql) {
  try {
    const r = await linhas(authUid, sql);
    ok(nome);
    return r;
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`${nome} — falhou: ${e.message.split("\n")[0]}`);
    return [];
  }
}
async function recusa(nome, authUid, sql, trecho) {
  try {
    await db.exec(sessao(authUid, sql));
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}
const n = (x) => (x == null ? null : Number(x));
const tabelasPublic = async () =>
  Number((await db.query(`SELECT count(*)::int AS c FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
                           WHERE s.nspname = 'public' AND c.relkind IN ('r','v','m','p')`)).rows[0].c);

const P = {
  cimento: "50000000-0000-0000-0000-000000000001",
  tinta: "50000000-0000-0000-0000-000000000002",
  cimentoB: "50000000-0000-0000-0000-000000000003",
  silicone: "50000000-0000-0000-0000-000000000004", // da B, partilhado com a A
  fita: "50000000-0000-0000-0000-000000000005", // não gere stock
  apagado: "50000000-0000-0000-0000-000000000006",
};
const S1 = "5e000000-0000-0000-0000-000000000001";
const S2 = "5e000000-0000-0000-0000-000000000002";
const pesquisar = (org, t, lim = 20) => `SELECT * FROM public.rpc_ops_stock_pesquisar('${org}', '${t}', ${lim})`;
const disponivel = (org, ids) =>
  `SELECT * FROM public.rpc_ops_stock_disponivel('${org}', ARRAY[${ids.map((i) => `'${i}'`).join(",")}]::uuid[])`;
const sugerir = (org, s, q) => `SELECT * FROM public.rpc_ops_stock_sugerir('${org}', '${s}', ${q})`;

/* ── 1. Base sem Inventário ─────────────────────────────────────────────── */
console.log("\n─── instalar sem as tabelas de stock ────");
{
  const antes = await tabelasPublic();
  try {
    await db.exec(ler("stock-leitura.sql"));
    await db.exec(ler("stock-leitura.sql"));
    ok("stock-leitura.sql corre duas vezes numa base sem stocks/warehouses/service_materials");
  } catch (e) {
    mau(`stock-leitura.sql: ${e.message}`);
    process.exit(1);
  }
  (await tabelasPublic()) === antes ? ok("não cria tabelas (logo, zero FKs)") : mau("criou tabelas");
  igual("pesquisar devolve vazio", (await passa("pesquisar sem inventário corre", AUTH.tecA, pesquisar(ORG_A, "cim"))).length, 0);
  igual("sugerir devolve vazio", (await passa("sugerir sem inventário corre", AUTH.tecA, sugerir(ORG_A, S1, 3))).length, 0);
  igual("disponível devolve vazio", (await passa("disponível sem inventário corre", AUTH.tecA, disponivel(ORG_A, [P.cimento]))).length, 0);
  await recusa("sem inventário, a verificação de acesso continua", AUTH.tecB, pesquisar(ORG_A, ""), "Sem acesso");
}

/* ── 2. Stubs do Inventário, com as colunas do CRM ─────────────────────── */
// products/purchase_orders/purchase_order_items já existem em STUBS_CRM com
// menos colunas: acrescentam-se as que o CRM tem (types.ts de origin/main).
await db.exec(`
  CREATE TABLE public.uom (id uuid PRIMARY KEY, code text NOT NULL, organization_id uuid,
    base_uom_id uuid, conversion_factor numeric, is_active boolean DEFAULT true);
  ALTER TABLE public.products
    ADD COLUMN name text, ADD COLUMN sku text, ADD COLUMN barcode text,
    ADD COLUMN organization_id uuid, ADD COLUMN deleted_at timestamptz,
    ADD COLUMN manages_stock boolean NOT NULL DEFAULT true, ADD COLUMN uom_id uuid,
    ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
  CREATE TABLE public.product_organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL, organization_id uuid NOT NULL);
  CREATE TABLE public.warehouses (id uuid PRIMARY KEY, organization_id uuid NOT NULL, name text,
    code text, deleted_at timestamptz, is_active boolean DEFAULT true);
  CREATE TABLE public.stocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,
    product_id uuid NOT NULL, warehouse_id uuid NOT NULL, quantity integer NOT NULL DEFAULT 0,
    deleted_at timestamptz);
  CREATE TABLE public.service_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL, service_id uuid NOT NULL, product_id uuid NOT NULL,
    quantity numeric NOT NULL DEFAULT 1, uom_id uuid, sort_order int, reference_area_m2 numeric,
    reference_quantity numeric, deleted_at timestamptz);
  ALTER TABLE public.purchase_orders
    ADD COLUMN deleted_at timestamptz, ADD COLUMN source_type text, ADD COLUMN source_id uuid;
  ALTER TABLE public.purchase_order_items
    ADD COLUMN product_id uuid, ADD COLUMN received_quantity numeric NOT NULL DEFAULT 0,
    ADD COLUMN units_per_uom numeric NOT NULL DEFAULT 1, ADD COLUMN received_to_stock_units numeric DEFAULT 0;

  -- A reserva do CRM é uma fila por data de assinatura sobre contratos e
  -- linhas de orçamento. Aqui interessa provar que se usa a função e se soma
  -- qty_reserved por produto: um stub com a mesma assinatura, a ler uma tabela.
  CREATE TABLE public._stub_reservas (organization_id uuid, contract_id uuid, product_id uuid, qty_reserved numeric);
  CREATE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
   RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint,
                 is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric,
                 qty_received numeric, qty_reserved numeric, qty_missing numeric)
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
     SELECT r.contract_id, NULL::uuid, NULL::int, r.product_id, 1::bigint, false, false,
            r.qty_reserved, 0::numeric, 0::numeric, 0::numeric, r.qty_reserved, 0::numeric
       FROM public._stub_reservas r
      WHERE r.organization_id = p_organization_id
        AND (p_product_ids IS NULL OR r.product_id = ANY (p_product_ids)) $$;
  REVOKE ALL ON FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

  INSERT INTO public.uom (id, code, base_uom_id, conversion_factor) VALUES
    ('0e000000-0000-0000-0000-000000000001', 'un', NULL, NULL),
    ('0e000000-0000-0000-0000-000000000002', 'PK10', '0e000000-0000-0000-0000-000000000001', 10),
    ('0e000000-0000-0000-0000-000000000003', 'kg', NULL, NULL);
  INSERT INTO public.products (id, name, sku, barcode, organization_id, manages_stock, uom_id, deleted_at) VALUES
    ('${P.cimento}',  'Cimento cola',        'CIM-01', NULL,      '${ORG_A}', true,  '0e000000-0000-0000-0000-000000000003', NULL),
    ('${P.tinta}',    'Tinta branca 15L',    'TIN-01', '5601234', '${ORG_A}', true,  '0e000000-0000-0000-0000-000000000001', NULL),
    ('${P.cimentoB}', 'Cimento da B',        'CIM-B',  NULL,      '${ORG_B}', true,  NULL, NULL),
    ('${P.silicone}', 'Silicone partilhado', 'SIL-01', NULL,      '${ORG_B}', true,  '0e000000-0000-0000-0000-000000000001', NULL),
    ('${P.fita}',     'Fita de pintor',      'FIT-01', NULL,      '${ORG_A}', false, NULL, NULL),
    ('${P.apagado}',  'Cimento antigo',      'CIM-00', NULL,      '${ORG_A}', true,  NULL, now());
  INSERT INTO public.product_organizations (product_id, organization_id) VALUES ('${P.silicone}', '${ORG_A}');

  INSERT INTO public.warehouses (id, organization_id, name, deleted_at) VALUES
    ('3a000000-0000-0000-0000-000000000001', '${ORG_A}', 'Armazém A1', NULL),
    ('3a000000-0000-0000-0000-000000000002', '${ORG_A}', 'Carrinha A2', NULL),
    ('3a000000-0000-0000-0000-000000000003', '${ORG_A}', 'Fechado', now()),
    ('3b000000-0000-0000-0000-000000000001', '${ORG_B}', 'Armazém B1', NULL);
  INSERT INTO public.stocks (organization_id, product_id, warehouse_id, quantity, deleted_at) VALUES
    ('${ORG_A}', '${P.cimento}',  '3a000000-0000-0000-0000-000000000001', 30, NULL),
    ('${ORG_A}', '${P.cimento}',  '3a000000-0000-0000-0000-000000000002', 20, NULL),
    ('${ORG_A}', '${P.cimento}',  '3a000000-0000-0000-0000-000000000003', 100, NULL), -- armazém apagado
    ('${ORG_A}', '${P.tinta}',    '3a000000-0000-0000-0000-000000000002', 5, now()),  -- linha apagada
    ('${ORG_A}', '${P.tinta}',    '3a000000-0000-0000-0000-000000000001', 5, NULL),
    ('${ORG_B}', '${P.cimento}',  '3b000000-0000-0000-0000-000000000001', 999, NULL), -- stock da B
    ('${ORG_B}', '${P.cimentoB}', '3b000000-0000-0000-0000-000000000001', 40, NULL),
    ('${ORG_A}', '${P.silicone}', '3a000000-0000-0000-0000-000000000001', 7, NULL),
    ('${ORG_B}', '${P.silicone}', '3b000000-0000-0000-0000-000000000001', 70, NULL);

  INSERT INTO public._stub_reservas VALUES
    ('${ORG_A}', gen_random_uuid(), '${P.cimento}', 8),
    ('${ORG_A}', gen_random_uuid(), '${P.cimento}', 4),
    ('${ORG_B}', gen_random_uuid(), '${P.cimento}', 500),
    ('${ORG_A}', gen_random_uuid(), '${P.silicone}', 9);  -- mais do que há: fica negativo

  INSERT INTO public.purchase_orders (id, organization_id, order_number, status, source_type, deleted_at) VALUES
    ('90000000-0000-0000-0000-000000000001', '${ORG_A}', 'PO-1', 'ordered', NULL, NULL),
    ('90000000-0000-0000-0000-000000000002', '${ORG_A}', 'PO-2', 'partially_received', 'contract', NULL),
    ('90000000-0000-0000-0000-000000000003', '${ORG_A}', 'PO-3', 'cancelled', NULL, NULL),
    ('90000000-0000-0000-0000-000000000004', '${ORG_A}', 'PO-4', 'received', NULL, NULL),
    ('90000000-0000-0000-0000-000000000005', '${ORG_A}', 'PO-5', 'pending', NULL, now()),
    ('90000000-0000-0000-0000-000000000006', '${ORG_B}', 'PO-6', 'ordered', NULL, NULL),
    ('90000000-0000-0000-0000-000000000007', '${ORG_A}', 'PO-7', 'pending', 'manual', NULL);
  INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, units_per_uom) VALUES
    ('90000000-0000-0000-0000-000000000001', '${P.cimento}', 10, 4, 1),   -- faltam 6
    ('90000000-0000-0000-0000-000000000001', '${P.tinta}',   2,  0, 6),   -- 2 caixas de 6 = 12
    ('90000000-0000-0000-0000-000000000002', '${P.cimento}', 100, 0, 1),  -- de EC: vai para a EC
    ('90000000-0000-0000-0000-000000000003', '${P.cimento}', 100, 0, 1),  -- cancelada
    ('90000000-0000-0000-0000-000000000004', '${P.cimento}', 100, 50, 1), -- recebida
    ('90000000-0000-0000-0000-000000000005', '${P.cimento}', 100, 0, 1),  -- apagada
    ('90000000-0000-0000-0000-000000000006', '${P.cimento}', 100, 0, 1),  -- da B
    ('90000000-0000-0000-0000-000000000007', '${P.cimento}', 3, 5, 1);    -- recebeu a mais: 0, não negativo

  INSERT INTO public.service_materials (organization_id, service_id, product_id, quantity, uom_id, sort_order,
                                        reference_area_m2, reference_quantity, deleted_at) VALUES
    ('${ORG_A}', '${S1}', '${P.cimento}',  2, NULL, 1, NULL, NULL, NULL),   -- 2 × 25 = 50
    ('${ORG_A}', '${S1}', '${P.tinta}',    1, NULL, 2, 10,   3,    NULL),   -- ceil(3/10 × 25) = 8
    ('${ORG_A}', '${S1}', '${P.silicone}', 1, '0e000000-0000-0000-0000-000000000002', 3, NULL, NULL, NULL), -- 25 PK10 = 250
    ('${ORG_A}', '${S1}', '${P.cimento}',  1, NULL, 4, NULL, NULL, NULL),   -- + 25 → cimento 75
    ('${ORG_A}', '${S1}', '${P.fita}',     1, NULL, 5, NULL, NULL, now()),  -- apagada
    ('${ORG_B}', '${S1}', '${P.cimentoB}', 1, NULL, 1, NULL, NULL, NULL),   -- mesma id de serviço, outra org
    ('${ORG_B}', '${S2}', '${P.cimentoB}', 4, NULL, 1, NULL, NULL, NULL);
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
`);

/* ── 3. A conta ─────────────────────────────────────────────────────────── */
console.log("\n─── o disponível ────────────────────────");
const porId = (rows) => Object.fromEntries(rows.map((r) => [r.produto_id, r]));
const conta = (r) => r && [n(r.fisico), n(r.reservado), n(r.a_chegar), n(r.disponivel)];
{
  const rows = await passa("refrescar produtos escolhidos", AUTH.tecA,
    disponivel(ORG_A, [P.cimento, P.tinta, P.silicone, P.fita, P.apagado, P.cimentoB]));
  const m = porId(rows);
  igual("cimento: físico 50 (sem armazém apagado nem stock da B), reservado 12, a chegar 6, disponível 38",
    conta(m[P.cimento]), [50, 12, 6, 38]);
  igual("tinta: linha de stock apagada não conta; PO em caixas de 6 → a chegar 12", conta(m[P.tinta]), [5, 0, 12, 5]);
  igual("silicone partilhado: stock da A só, reservas acima do físico → disponível negativo",
    conta(m[P.silicone]), [7, 9, 0, -2]);
  igual("fita (não gere stock): disponível NULL", m[P.fita]?.disponivel ?? "null", "null");
  igual("unidade vem de uom.code", [m[P.cimento]?.unidade, m[P.tinta]?.unidade, m[P.fita]?.unidade], ["kg", "un", null]);
  igual("produto apagado e produto de outra organização não vêm", [!!m[P.apagado], !!m[P.cimentoB]], [false, false]);
}

console.log("\n─── pesquisar ───────────────────────────");
{
  const r = await passa("pesquisar 'cim' na A", AUTH.tecA, pesquisar(ORG_A, "cim"));
  igual("só o cimento da A (não o da B, não o apagado)", r.map((x) => x.nome), ["Cimento cola"]);
  igual("e com o disponível calculado", conta(r[0]), [50, 12, 6, 38]);
  const sku = await passa("pesquisar por SKU", AUTH.tecA, pesquisar(ORG_A, "tin-01"));
  igual("SKU exato encontra", sku.map((x) => x.sku), ["TIN-01"]);
  const cb = await passa("pesquisar por código de barras", AUTH.tecA, pesquisar(ORG_A, "5601234"));
  igual("código de barras encontra", cb.map((x) => x.nome), ["Tinta branca 15L"]);
  const sil = await passa("pesquisar produto partilhado", AUTH.tecA, pesquisar(ORG_A, "silicone"));
  igual("o partilhado aparece na A", sil.map((x) => x.nome), ["Silicone partilhado"]);
  const tudo = await passa("texto vazio", AUTH.tecA, pesquisar(ORG_A, ""));
  igual("texto vazio: os da A por ordem alfabética", tudo.map((x) => x.nome),
    ["Cimento cola", "Fita de pintor", "Silicone partilhado", "Tinta branca 15L"]);
  const lim = await passa("limite", AUTH.tecA, pesquisar(ORG_A, "", 2));
  igual("limite respeitado", lim.length, 2);
  const pct = await passa("'%' é texto, não padrão", AUTH.tecA, pesquisar(ORG_A, "%"));
  igual("'%' não devolve tudo", pct.length, 0);
  const b = await passa("a B pesquisa 'cim'", AUTH.tecB, pesquisar(ORG_B, "cim"));
  igual("a B vê o seu cimento com o seu stock", b.map((x) => [x.nome, n(x.fisico)]), [["Cimento da B", 40]]);
}

console.log("\n─── sugerir a partir da ficha técnica ───");
{
  const r = await passa("sugerir S1 × 25", AUTH.tecA, sugerir(ORG_A, S1, 25));
  igual("fixa × qt somada, por área com ceil, embalagem em unidades; pela ordem da ficha",
    r.map((x) => [x.nome, n(x.quantidade)]),
    [["Cimento cola", 75], ["Tinta branca 15L", 8], ["Silicone partilhado", 250]]);
  igual("cada sugestão traz o disponível", conta(r[0]), [50, 12, 6, 38]);
  const zero = await passa("sugerir com quantidade 0", AUTH.tecA, sugerir(ORG_A, S1, 0));
  igual("quantidade 0 dá zeros", zero.map((x) => n(x.quantidade)), [0, 0, 0]);
  const fora = await passa("serviço só com ficha na B, pedido na A", AUTH.tecA, sugerir(ORG_A, S2, 1));
  igual("ficha de outra organização não aparece", fora.length, 0);
  await recusa("quantidade negativa recusada", AUTH.tecA, sugerir(ORG_A, S1, -1), "negativa");
}

console.log("\n─── isolamento e acesso ─────────────────");
await recusa("a A não pesquisa na B", AUTH.tecA, pesquisar(ORG_B, "cim"), "Sem acesso");
await recusa("a A não sugere na B", AUTH.tecA, sugerir(ORG_B, S2, 1), "Sem acesso");
await recusa("a A não refresca na B", AUTH.tecA, disponivel(ORG_B, [P.cimentoB]), "Sem acesso");
await recusa("membro da B sem perfil de Operações na B, não", AUTH.tecAB, pesquisar(ORG_B, ""), "Sem acesso");
await recusa("com a permissão mas sem perfil de Operações, não", AUTH.semPerfil, pesquisar(ORG_A, ""), "Sem acesso");
await recusa("a interna ops_stock_calcular não se chama de fora", AUTH.tecA,
  `SELECT * FROM public.ops_stock_calcular('${ORG_A}', ARRAY['${P.cimento}']::uuid[])`, "permission denied");
await recusa("a função de reservas do CRM continua fechada a authenticated", AUTH.tecA,
  `SELECT * FROM public.fn_client_order_line_reservations('${ORG_A}', NULL)`, "permission denied");
{
  const r = await passa("produto da A pedido pela B", AUTH.tecB, disponivel(ORG_B, [P.cimento]));
  igual("não vem (o cimento é da A)", r.length, 0);
  const s = await passa("o partilhado pedido pela B", AUTH.tecB, disponivel(ORG_B, [P.silicone]));
  igual("na B conta o stock da B e não tem reservas da A", conta(s[0]), [70, 0, 0, 70]);
}

console.log("\n─── peças opcionais em falta ────────────");
await db.exec(`DROP FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]);
               ALTER TABLE public.purchase_order_items DROP COLUMN units_per_uom;`);
{
  const r = await passa("sem a função de reservas nem units_per_uom", AUTH.tecA, disponivel(ORG_A, [P.cimento]));
  igual("reservado e a chegar passam a 0, o físico mantém-se", conta(r[0]), [50, 0, 0, 50]);
}
{
  const antes = await tabelasPublic();
  await db.exec(ler("stock-leitura.sql"));
  (await tabelasPublic()) === antes ? ok("reinstalar com tudo presente: idempotente, sem tabelas") : mau("reinstalar criou tabelas");
}

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ stock (leitura): regras provadas");
process.exit(falhas.length ? 1 : 0);

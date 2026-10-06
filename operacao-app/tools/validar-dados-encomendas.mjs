/**
 * Prova db/dados-encomendas.sql contra um Postgres limpo (PGlite), sem tocar
 * no Supabase.
 *
 *   · distância ao armazém pelo código postal (CP7 → CP4 → CP2), o armazém
 *     mais próximo da organização, e {} quando não se sabe;
 *   · a obra tira o código postal da morada de obra do orçamento, ou da morada;
 *   · encomendas: "encomendar até" = início − prazo − 2; os estados (em
 *     atraso, esta semana, encomendado, chega tarde, sem prazo);
 *   · avisos no sino ao supervisor e aos gestores (nunca a um cliente), uma
 *     vez, e resolvidos quando deixa de haver o que encomendar;
 *   · dados em falta: ficha do local, medidas, prazos, ofícios sem gente;
 *   · quem não vê a obra não lê nada disto; o técnico não vê o painel geral
 *     de outras obras; instala sem as tabelas do CRM e corre duas vezes.
 *
 *     npm run validar-dados-encomendas
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const U = {
  gestorA: "a0000000-0000-0000-0000-00000000000a",
  supA: "a0000000-0000-0000-0000-00000000000b",
  tecA: "a0000000-0000-0000-0000-00000000000c",
  marmA: "a0000000-0000-0000-0000-00000000000d",
  cliA: "a0000000-0000-0000-0000-00000000000e", // cliente do CRM com perfil (não deve ser avisado)
  gestorB: "b0000000-0000-0000-0000-00000000000a",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e").replace(/^b/, "d")]));

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ${Object.keys(U).map((k) => `('${AUTH[k]}','${U[k]}')`).join(",")};
`);

const BASE = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
];
for (const f of BASE) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar ────────────────────────────");
try {
  await db.exec(ler("dados-encomendas.sql"));
  ok("dados-encomendas.sql instala numa base SEM postal_codes, warehouses, item_suppliers nem deal_needs");
  const d0 = await um(`SELECT public.ops_distancia_armazem('${ORG_A}', '1675-195') AS d`);
  JSON.stringify(d0.d) === "{}" ? ok("e sem essas tabelas a distância é {} (sem erro)") : mau(`distância sem tabelas: ${JSON.stringify(d0)}`);
} catch (e) {
  mau(`dados-encomendas.sql sem as tabelas do CRM: ${e.message}`);
  process.exit(1);
}

/* ── O CRM que interessa aqui ───────────────────────────────────────────── */
const R = { tudoA: "d0000000-0000-0000-0000-00000000000a", tecA: "d0000000-0000-0000-0000-00000000000b", tudoB: "d0000000-0000-0000-0000-00000000000c" };
const PROD = { bancada: "f1000000-0000-0000-0000-000000000001", movel: "f1000000-0000-0000-0000-000000000002", torneira: "f1000000-0000-0000-0000-000000000003", sanita: "f1000000-0000-0000-0000-000000000004" };
const SUP = "f2000000-0000-0000-0000-000000000001";
const ADDR = { obra: "ad000000-0000-0000-0000-000000000001", obra2: "ad000000-0000-0000-0000-000000000002" };
const ORC = { com: "99990000-0000-0000-0000-000000000001", semMorada: "99990000-0000-0000-0000-000000000002" };
const DEAL = "de000000-0000-0000-0000-000000000001";

await db.exec(`
  CREATE TABLE public.postal_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), postal_code varchar, postal_code_extension varchar,
    locality varchar, latitude numeric, longitude numeric);
  INSERT INTO public.postal_codes (postal_code, postal_code_extension, locality, latitude, longitude) VALUES
    ('1675','195','Odivelas', 38.7900, -9.1800),   -- armazém
    ('2750','100','Cascais', 38.6970, -9.4210),    -- obra (CP7 exato)
    ('2750','200','Cascais', 38.7010, -9.4250),
    ('4485','805','Vilar', 41.2800, -8.6800),      -- armazém do Porto (org B)
    ('2710','001','Sintra', 38.8000, -9.3800);
  CREATE TABLE public.warehouses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text, postal_code text,
    is_active boolean DEFAULT true, deleted_at timestamptz);
  INSERT INTO public.warehouses (organization_id, name, postal_code) VALUES
    ('${ORG_A}','Lisboa','1675-195'), ('${ORG_A}','Porto','4485-805 '), ('${ORG_A}','Sem CP',''),
    ('${ORG_B}','Porto B','4485-805');

  ALTER TABLE public.quotes ADD COLUMN site_address_id uuid, ADD COLUMN deal_id uuid;
  CREATE TABLE public.anew_address_building (address_id uuid PRIMARY KEY, acesso text, estacionamento text, tem_elevador boolean,
    habitada_durante_obra boolean, pavimento text, n_andares integer);
  CREATE TABLE public.deal_needs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deal_id uuid, title text,
    diag_tipo_area text, diag_m2_pavimento numeric);
  INSERT INTO public.anew_addresses (id, street, number, postal_code, city) VALUES
    ('${ADDR.obra}','Rua das Flores','7','2750-100','Cascais'),
    ('${ADDR.obra2}','Rua X','1','9999-999','Lado nenhum');
  INSERT INTO public.anew_address_building (address_id, acesso, estacionamento, tem_elevador, habitada_durante_obra, pavimento)
    VALUES ('${ADDR.obra}','dificil',NULL,false,NULL,'ceramico');
  INSERT INTO public.quotes (id, organization_id, quote_number, estado, site_address_id, deal_id) VALUES
    ('${ORC.com}','${ORG_A}','ORC-1','aceite','${ADDR.obra}','${DEAL}'),
    ('${ORC.semMorada}','${ORG_A}','ORC-2','aceite',NULL,NULL);
  INSERT INTO public.deal_needs (deal_id, title, diag_tipo_area, diag_m2_pavimento) VALUES
    ('${DEAL}','Cozinha','cozinha',12), ('${DEAL}','Casa de banho','wc',NULL);

  ALTER TABLE public.purchase_orders ADD COLUMN deleted_at timestamptz, ADD COLUMN expected_delivery date;
  ALTER TABLE public.purchase_order_items ADD COLUMN product_id uuid, ADD COLUMN received_quantity numeric DEFAULT 0;
  ALTER TABLE public.suppliers ADD COLUMN delivery_sla_days integer;
  CREATE TABLE public.item_suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, supplier_id uuid,
    lead_time_days integer, is_preferred boolean DEFAULT false, is_active boolean DEFAULT true, deleted_at timestamptz);
  INSERT INTO public.suppliers (id, delivery_sla_days) VALUES ('${SUP}', NULL);
  INSERT INTO public.item_suppliers (product_id, supplier_id, lead_time_days) VALUES
    ('${PROD.bancada}','${SUP}',10), ('${PROD.movel}','${SUP}',30), ('${PROD.torneira}','${SUP}',3);

  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.tudoA}','${ORG_A}','Tudo A'), ('${R.tecA}','${ORG_A}','Tecnicos A'), ('${R.tudoB}','${ORG_B}','Tudo B');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions, unnest(ARRAY['${R.tudoA}'::uuid, '${R.tudoB}'::uuid]) r
     WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.tecA}','operations.view'), ('${R.tecA}','operations.orders.view'), ('${R.tecA}','operations.orders.execute');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.gestorA}','${ORG_A}','${R.tudoA}','active'), ('${U.supA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.tecA}','${ORG_A}','${R.tecA}','active'), ('${U.marmA}','${ORG_A}','${R.tecA}','active'),
    ('${U.gestorB}','${ORG_B}','${R.tudoB}','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG_A}','${U.gestorA}','gestor'), ('${ORG_A}','${U.supA}','supervisor'),
    ('${ORG_A}','${U.tecA}','tecnico'), ('${ORG_A}','${U.marmA}','tecnico'), ('${ORG_B}','${U.gestorB}','gestor');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.anew_users TO authenticated;
`);
// O cliente do CRM: membership de cliente, e um perfil ativo que não devia ter.
const temRoleIsClient = await um(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='anew_memberships' AND column_name='role_is_client') AS t`);
if (!temRoleIsClient.t) await db.exec(`ALTER TABLE public.anew_memberships ADD COLUMN role_is_client boolean DEFAULT false`);
await db.exec(`
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status, role_is_client)
    VALUES ('${U.cliA}','${ORG_A}','${R.tudoA}','active', true);
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES ('${ORG_A}','${U.cliA}','gestor');
`);

try {
  await db.exec(ler("dados-encomendas.sql"));
  ok("e corre outra vez com as tabelas do CRM presentes (idempotente)");
} catch (e) {
  mau(`segunda instalação: ${e.message}`);
}

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql}; COMMIT;`;
}
async function linhas(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  return r.flatMap((x) => x.rows ?? []);
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

/* ── 1. Distância ───────────────────────────────────────────────────────── */
console.log("\n─── distância ao armazém ────────────────");
{
  const g7 = await um(`SELECT * FROM public.ops_geo_cp('2750-100')`);
  g7?.precisao === "cp7" && Number(g7.lat) === 38.697 ? ok("CP7 exato → coordenadas desse código") : mau(`CP7: ${JSON.stringify(g7)}`);
  const g4 = await um(`SELECT * FROM public.ops_geo_cp('2750 999')`);
  g4?.precisao === "cp4" && Math.abs(Number(g4.lat) - 38.699) < 0.001 ? ok("CP7 desconhecido → média do CP4") : mau(`CP4: ${JSON.stringify(g4)}`);
  const g2 = await um(`SELECT * FROM public.ops_geo_cp('2799-999')`);
  g2?.precisao === "cp2" ? ok("CP4 desconhecido → média do CP2") : mau(`CP2: ${JSON.stringify(g2)}`);
  const gx = await um(`SELECT count(*)::int AS n FROM public.ops_geo_cp('99')`);
  gx.n === 0 ? ok("código postal inválido → nada") : mau(`CP inválido: ${JSON.stringify(gx)}`);

  const d = (await um(`SELECT public.ops_distancia_armazem('${ORG_A}', '2750-100') AS d`)).d;
  const reta = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(((38.697 - 38.79) * Math.PI) / 360) ** 2
    + Math.cos((38.79 * Math.PI) / 180) * Math.cos((38.697 * Math.PI) / 180) * Math.sin(((-9.421 + 9.18) * Math.PI) / 360) ** 2));
  d?.armazem === "Lisboa" && Math.abs(Number(d.km_reta) - reta) < 0.2
    && Math.abs(Number(d.km_estrada) - Math.round(reta * 1.3 * 10) / 10) < 0.2 && d.km_ida_volta === Math.round(Number(d.km_estrada) * 2) && d.minutos > 5
    ? ok(`armazém mais próximo (Lisboa, não o Porto): ${d.km_reta} km em linha reta, ${d.km_estrada} km de estrada, ~${d.minutos} min`)
    : mau(`distância: ${JSON.stringify(d)} (reta esperada ${reta.toFixed(1)})`);
  const dn = (await um(`SELECT public.ops_distancia_armazem('${ORG_A}', 'sem código') AS d`)).d;
  JSON.stringify(dn) === "{}" ? ok("morada sem código postal → {}") : mau(`sem CP: ${JSON.stringify(dn)}`);
  const dB = (await um(`SELECT public.ops_distancia_armazem('${ORG_B}', '2750-100') AS d`)).d;
  dB?.armazem === "Porto B" ? ok("cada organização usa os seus armazéns") : mau(`org B: ${JSON.stringify(dB)}`);

  const rA = await linhas(AUTH.tecA, `SELECT public.rpc_ops_distancia_armazem('${ORG_A}', '2750-100') AS d`);
  rA.at(-1)?.d?.armazem === "Lisboa" ? ok("o CRM pergunta (quem é da organização)") : mau(`rpc CRM: ${JSON.stringify(rA)}`);
  const rB = await linhas(AUTH.gestorB, `SELECT public.rpc_ops_distancia_armazem('${ORG_A}', '2750-100') AS d`);
  JSON.stringify(rB.at(-1)?.d) === "{}" ? ok("quem não é da organização recebe {}") : mau(`rpc de fora: ${JSON.stringify(rB)}`);
}

/* ── Obras ──────────────────────────────────────────────────────────────── */
const OBRA = "0b000000-0000-0000-0000-000000000001";
const OBRA2 = "0b000000-0000-0000-0000-000000000002";
const FASE = "0f000000-0000-0000-0000-000000000001";
const FASE2 = "0f000000-0000-0000-0000-000000000002";
const T = {
  bancada: "07000000-0000-0000-0000-000000000001",
  movel: "07000000-0000-0000-0000-000000000002",
  torneira: "07000000-0000-0000-0000-000000000003",
  sanita: "07000000-0000-0000-0000-000000000004",
  enc: "07000000-0000-0000-0000-000000000005",
  feita: "07000000-0000-0000-0000-000000000006",
  outra: "07000000-0000-0000-0000-000000000007",
};
const hoje = (await um(`SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date::text AS d`)).d;
const dia = async (n) => (await um(`SELECT ('${hoje}'::date + ${n})::text AS d`)).d;
const mat = (p, nome, disp = 0) => `[{"produto_id":"${p}","nome":"${nome}","quantidade":1,"unidade":"un","disponivel":${disp}}]`;
const SK_MARM = (await um(`INSERT INTO public.ops_skill (organization_id, nome) VALUES ('${ORG_A}','Marmorista') RETURNING id`)).id;
const SK_GAS = (await um(`INSERT INTO public.ops_skill (organization_id, nome) VALUES ('${ORG_A}','Gás (ITG)') RETURNING id`)).id;
await db.exec(`INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id) VALUES ('${U.marmA}','${SK_MARM}')`);
await db.exec(`
  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, supervisor_id, gestor_id, estado, orcamento_id, morada)
    VALUES ('${OBRA}','${ORG_A}','OB-T-1','Cozinha Cascais','${U.supA}','${U.gestorA}','planeada','${ORC.com}','Rua das Flores, 7'),
           ('${OBRA2}','${ORG_A}','OB-T-2','Sem orçamento',NULL,'${U.gestorA}','planeada',NULL,'Rua Y, 2710-001 Sintra');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome)
    VALUES ('${FASE}','${ORG_A}','${OBRA}',1,'Execução'), ('${FASE2}','${ORG_A}','${OBRA2}',1,'Execução');
  INSERT INTO public.ops_obra_tarefa (id, organization_id, obra_id, fase_id, nome, estado, inicio_planeado, fim_planeado, materiais_crm, skill_id) VALUES
    -- bancada: prazo 10, início daqui a 15 → até hoje+3 → esta semana (e avisa: ≤ 3 dias)
    ('${T.bancada}','${ORG_A}','${OBRA}','${FASE}','Bancada','por_fazer','${await dia(15)}','${await dia(15)}','${mat(PROD.bancada, "Bancada")}','${SK_MARM}'),
    -- móvel: prazo 30, início daqui a 20 → até hoje-12 → em atraso
    ('${T.movel}','${ORG_A}','${OBRA}','${FASE}','Móveis','por_fazer','${await dia(20)}','${await dia(21)}','${mat(PROD.movel, "Móvel")}',NULL),
    -- torneira: prazo 3, início daqui a 40 → mais tarde
    ('${T.torneira}','${ORG_A}','${OBRA}','${FASE}','Torneira','por_fazer','${await dia(40)}','${await dia(40)}','${mat(PROD.torneira, "Torneira")}','${SK_GAS}'),
    -- sanita: sem prazo de fornecedor
    ('${T.sanita}','${ORG_A}','${OBRA}','${FASE}','Sanita','por_fazer','${await dia(25)}','${await dia(25)}','${mat(PROD.sanita, "Sanita")}',NULL),
    -- com stock disponível: não entra
    ('${T.feita}','${ORG_A}','${OBRA}','${FASE}','Já feita','feita','${await dia(5)}','${await dia(5)}','${mat(PROD.movel, "Móvel")}',NULL),
    ('${T.enc}','${ORG_A}','${OBRA}','${FASE}','Com stock','por_fazer','${await dia(5)}','${await dia(5)}','${mat(PROD.bancada, "Bancada", 5)}',NULL),
    ('${T.outra}','${ORG_A}','${OBRA2}','${FASE2}','Outra obra','por_fazer','${await dia(30)}','${await dia(30)}','${mat(PROD.movel, "Móvel")}',NULL);
`);

/* ── 2. Encomendas ──────────────────────────────────────────────────────── */
console.log("\n─── encomendas na data certa ────────────");
{
  const l = await q(`SELECT produto_nome, estado, encomendar_ate::text AS ate, prazo_dias
                       FROM public.ops_obra_encomendas_lista('${ORG_A}', '${OBRA}') ORDER BY produto_nome`);
  const por = Object.fromEntries(l.map((x) => [x.produto_nome, x]));
  por["Bancada"]?.estado === "esta_semana" && por["Bancada"]?.ate === (await dia(3))
    ? ok("bancada: prazo 10 dias, início daqui a 15 → encomendar até daqui a 3 dias (esta semana)")
    : mau(`bancada: ${JSON.stringify(por["Bancada"])}`);
  por["Móvel"]?.estado === "em_atraso" && por["Móvel"]?.ate === (await dia(-12))
    ? ok("móvel: prazo 30 dias, início daqui a 20 → em atraso desde há 12 dias")
    : mau(`móvel: ${JSON.stringify(por["Móvel"])}`);
  por["Torneira"]?.estado === "mais_tarde" ? ok("torneira: há tempo (mais tarde)") : mau(`torneira: ${JSON.stringify(por["Torneira"])}`);
  por["Sanita"]?.estado === "sem_prazo" && por["Sanita"]?.ate === null ? ok("sanita: sem prazo do fornecedor") : mau(`sanita: ${JSON.stringify(por["Sanita"])}`);
  l.length === 4 ? ok("tarefas feitas e material com stock não entram") : mau(`linhas: ${l.length} ${JSON.stringify(l)}`);

  // Encomenda em aberto do móvel: chega a tempo → encomendado; depois → chega tarde.
  await db.exec(`
    INSERT INTO public.purchase_orders (id, organization_id, status, expected_delivery)
      VALUES ('f3000000-0000-0000-0000-000000000001', '${ORG_A}', 'ordered', '${await dia(10)}');
    INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity)
      VALUES ('f3000000-0000-0000-0000-000000000001', '${PROD.movel}', 1);`);
  const e1 = await um(`SELECT estado, detalhe FROM public.ops_obra_encomendas_lista('${ORG_A}', '${OBRA}') WHERE produto_nome = 'Móvel'`);
  e1?.estado === "encomendado" && /chega a/.test(e1.detalhe) ? ok("com encomenda em aberto que chega antes: encomendado") : mau(`encomendado: ${JSON.stringify(e1)}`);
  await db.exec(`UPDATE public.purchase_orders SET expected_delivery = '${await dia(22)}'`);
  const e2 = await um(`SELECT estado FROM public.ops_obra_encomendas_lista('${ORG_A}', '${OBRA}') WHERE produto_nome = 'Móvel'`);
  e2?.estado === "chega_tarde" ? ok("encomenda que chega depois do início: chega tarde") : mau(`chega tarde: ${JSON.stringify(e2)}`);

  // Quem vê o quê
  const g = await linhas(AUTH.gestorA, `SELECT * FROM public.rpc_ops_obra_encomendas('${ORG_A}', NULL)`);
  g.length === 5 && g[0].estado === "chega_tarde" ? ok("o gestor vê tudo (as duas obras), pior primeiro") : mau(`gestor: ${g.length} ${JSON.stringify(g.map((x) => x.estado))}`);
  const tc = await linhas(AUTH.tecA, `SELECT * FROM public.rpc_ops_obra_encomendas('${ORG_A}', NULL)`);
  tc.length === 0 ? ok("o técnico que não está nas obras não vê nada") : mau(`técnico vê ${tc.length}`);
  await recusa("quem é de outra organização é recusado", AUTH.gestorB, `SELECT * FROM public.rpc_ops_obra_encomendas('${ORG_A}', NULL)`, "Sem acesso");
}

/* ── Avisos ─────────────────────────────────────────────────────────────── */
console.log("\n─── avisos no sino ──────────────────────");
{
  const r1 = (await um(`SELECT public.ops_obra_avisar_encomendas('${ORG_A}') AS r`)).r;
  const n = await q(`SELECT u.name, n.title, n.message, n.priority FROM public.notifications n
                       JOIN public.anew_users u ON u.auth_user_id = n.user_id
                      WHERE n.type = 'operacoes_obra_encomendas' AND NOT n.is_resolved ORDER BY u.name, n.title`);
  const nomes = [...new Set(n.map((x) => x.name))].sort();
  JSON.stringify(nomes) === JSON.stringify(["gestorA", "supA"])
    ? ok(`avisa o supervisor e o gestor (${r1.avisos} avisos) — nunca o cliente, nem o técnico`)
    : mau(`avisados: ${JSON.stringify(nomes)} ${JSON.stringify(r1)}`);
  const ob1 = n.find((x) => x.name === "supA");
  ob1 && /OB-T-1: 2 materiais a encomendar/.test(ob1.title) && /Bancada \(até/.test(ob1.message) && ob1.priority === "high"
    ? ok(`"${ob1.title}" — ${ob1.message}`)
    : mau(`aviso: ${JSON.stringify(ob1)}`);
  const r2 = (await um(`SELECT public.ops_obra_avisar_encomendas('${ORG_A}') AS r`)).r;
  r2.avisos === 0 ? ok("correr outra vez não repete") : mau(`repetiu: ${JSON.stringify(r2)}`);
  // Tudo encomendado → resolve.
  await db.exec(`
    UPDATE public.purchase_orders SET expected_delivery = '${await dia(1)}';
    INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity)
      VALUES ('f3000000-0000-0000-0000-000000000001', '${PROD.bancada}', 1);`);
  const r3 = (await um(`SELECT public.ops_obra_avisar_encomendas('${ORG_A}') AS r`)).r;
  const abertos = await um(`SELECT count(*)::int AS n FROM public.notifications WHERE type = 'operacoes_obra_encomendas' AND NOT is_resolved`);
  r3.resolvidos >= 1 && abertos.n === 0
    ? ok("com tudo encomendado, os avisos resolvem-se sozinhos")
    : mau(`resolver: ${JSON.stringify(r3)} abertos ${abertos.n}`);
}

/* ── 3. Dados em falta ──────────────────────────────────────────────────── */
console.log("\n─── dados em falta ──────────────────────");
{
  const f = await linhas(AUTH.gestorA, `SELECT * FROM public.rpc_ops_obra_dados_em_falta('${OBRA}')`);
  const ch = f.map((x) => x.chave).sort();
  const esperadas = ["ficha_incompleta", "medidas_em_falta", "oficio_sem_pessoas", "sem_prazo_fornecedor", "tarefas_sem_pessoa"];
  JSON.stringify(ch) === JSON.stringify(esperadas)
    ? ok(`obra com orçamento: ${ch.join(", ")}`)
    : mau(`dados em falta: ${JSON.stringify(ch)} (esperado ${JSON.stringify(esperadas)})`);
  const fi = f.find((x) => x.chave === "ficha_incompleta");
  fi && /estacionamento/.test(fi.detalhe) && /casa habitada/.test(fi.detalhe) && !/acesso/.test(fi.detalhe) && fi.link === `/quotes?open=${ORC.com}` && fi.destino === "crm"
    ? ok(`ficha incompleta: "${fi.detalhe}" → ${fi.link}`)
    : mau(`ficha incompleta: ${JSON.stringify(fi)}`);
  const me = f.find((x) => x.chave === "medidas_em_falta");
  me && /1 área/.test(me.titulo) && /Casa de banho/.test(me.detalhe) && me.link === `/deals?open=${DEAL}`
    ? ok(`medidas: "${me.titulo}" → ${me.link}`)
    : mau(`medidas: ${JSON.stringify(me)}`);
  const of = f.find((x) => x.chave === "oficio_sem_pessoas");
  of && /Gás \(ITG\)/.test(of.titulo) && !/Marmorista/.test(of.titulo) && of.destino === "ops"
    ? ok(`ofícios: "${of.titulo}" (o Marmorista tem gente)`)
    : mau(`ofícios: ${JSON.stringify(of)}`);

  const f2 = await linhas(AUTH.gestorA, `SELECT * FROM public.rpc_ops_obra_dados_em_falta('${OBRA2}')`);
  const ch2 = f2.map((x) => x.chave).sort();
  ch2.includes("sem_orcamento") && ch2.includes("sem_supervisor") && !ch2.includes("sem_codigo_postal")
    ? ok(`obra sem orçamento: ${ch2.join(", ")} (o código postal vem da morada escrita)`)
    : mau(`obra 2: ${JSON.stringify(ch2)}`);
  const dist2 = await linhas(AUTH.gestorA, `SELECT public.rpc_ops_obra_distancia('${OBRA2}') AS d`);
  dist2.at(-1)?.d?.codigo_postal === "2710-001" && dist2.at(-1)?.d?.armazem === "Lisboa"
    ? ok(`distância da obra pela morada escrita: ${dist2.at(-1).d.km_estrada} km`)
    : mau(`distância obra 2: ${JSON.stringify(dist2)}`);
  const dist1 = await linhas(AUTH.gestorA, `SELECT public.rpc_ops_obra_distancia('${OBRA}') AS d`);
  dist1.at(-1)?.d?.codigo_postal === "2750-100" && dist1.at(-1)?.d?.precisao_obra === "cp7"
    ? ok("distância da obra pela morada de obra do orçamento (CP7)")
    : mau(`distância obra 1: ${JSON.stringify(dist1)}`);

  // Sem ficha e sem morada no orçamento.
  await db.exec(`UPDATE public.ops_obra SET orcamento_id = '${ORC.semMorada}' WHERE id = '${OBRA}'`);
  const f3 = await linhas(AUTH.gestorA, `SELECT chave FROM public.rpc_ops_obra_dados_em_falta('${OBRA}')`);
  f3.some((x) => x.chave === "sem_morada_obra") && f3.some((x) => x.chave === "sem_codigo_postal")
    ? ok("orçamento sem morada de obra → avisa, e a distância fica estimada")
    : mau(`sem morada: ${JSON.stringify(f3)}`);
  await db.exec(`UPDATE public.quotes SET site_address_id = '${ADDR.obra2}' WHERE id = '${ORC.semMorada}'`);
  const f4 = await linhas(AUTH.gestorA, `SELECT chave FROM public.rpc_ops_obra_dados_em_falta('${OBRA}')`);
  f4.some((x) => x.chave === "sem_ficha_local") && f4.some((x) => x.chave === "sem_distancia")
    ? ok("morada sem ficha → ficha por preencher; código postal desconhecido → distância desconhecida")
    : mau(`sem ficha: ${JSON.stringify(f4)}`);

  await recusa("quem não vê a obra não lê os dados em falta", AUTH.tecA,
    `SELECT * FROM public.rpc_ops_obra_dados_em_falta('${OBRA}')`, "Obra não encontrada");
  await recusa("nem a distância", AUTH.gestorB, `SELECT public.rpc_ops_obra_distancia('${OBRA}')`, "Obra não encontrada");
}

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ dados em falta, distância e encomendas: regras provadas");
process.exit(falhas.length ? 1 : 0);

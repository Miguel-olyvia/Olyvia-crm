/**
 * Valida a migração da área de custos e da margem mínima por linha
 * (supabase/migrations/20261214110000_area_custos.sql) num Postgres limpo
 * (PGlite), sem tocar na base real.
 *
 *     node tools/validar-custos-crm.mjs
 *
 * O PGlite vem do operacao-app (cd operacao-app && npm ci, se faltar).
 *
 * O que se prova:
 *   · 925 € (parâmetros BMG por omissão) → 9,12 €/h;
 *   · 1.900 € com os números do protótipo (× 14, TSU 23,75%, seguros 713 €/ano,
 *     1.345 h/ano) → 25,00 €/h;
 *   · estrutura 3.400 € ÷ 672 h → 5,06 €/h;
 *   · o WC suite da Ana Martins (motor.ts do protótipo): custo ≈ 2.454,55 €,
 *     preço ≈ 3.606,12 €, margem 31,9% — e o revestimento pede aprovação;
 *   · uma linha abaixo do custo bloqueia (e não se pode pedir aprovação);
 *   · só a Direção (margins.approve) aprova;
 *   · o salário fica escondido a quem não tem costs.salaries.view;
 *   · outra organização não vê nem escreve nada;
 *   · a migração corre duas (e três) vezes sem erro e sem duplicar.
 *
 * Os stubs das tabelas do CRM partem dos do operacao-app (_stubs-crm.mjs) e
 * acrescentam as colunas que esta migração lê, copiadas do esquema real
 * (src/integrations/supabase/types.ts). Se a migração passar a ler outra
 * coluna, o teste rebenta aqui e não em produção.
 */

import { readFileSync } from "node:fs";
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

const MIGRACAO = readFileSync(join(RAIZ, "supabase", "migrations", "20261214110000_area_custos.sql"), "utf8");

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };
const perto = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;
const eur = (x) => Number(x).toFixed(2).replace(".", ",");

/* ── Ids ─────────────────────────────────────────────────────────────────── */
const ORG_A = "a0000000-0000-0000-0000-00000000000a";
const ORG_B = "b0000000-0000-0000-0000-00000000000b";
const ROLE = {
  admA: "a1000000-0000-0000-0000-000000000001", // roles.edit → Direção (provisório)
  orcA: "a1000000-0000-0000-0000-000000000002", // services.view_cost + manage_prices
  comA: "a1000000-0000-0000-0000-000000000003", // comercial: quotes.*
  sisA: "a1000000-0000-0000-0000-000000000004", // papel de sistema com roles.edit
  admB: "b1000000-0000-0000-0000-000000000001",
};
const U = { dirA: "a2000000-0000-0000-0000-000000000001", orcA: "a2000000-0000-0000-0000-000000000002",
            comA: "a2000000-0000-0000-0000-000000000003", dirB: "b2000000-0000-0000-0000-000000000001" };
const AUTH = { dirA: "a3000000-0000-0000-0000-000000000001", orcA: "a3000000-0000-0000-0000-000000000002",
               comA: "a3000000-0000-0000-0000-000000000003", dirB: "b3000000-0000-0000-0000-000000000001" };
const CAT_REMOD = "a4000000-0000-0000-0000-000000000001";
const CAT_WC = "a4000000-0000-0000-0000-000000000002";
const CAT_B = "b4000000-0000-0000-0000-000000000001";
const SV = { demol: "a5000000-0000-0000-0000-000000000001", canal: "a5000000-0000-0000-0000-000000000002",
             revest: "a5000000-0000-0000-0000-000000000003", pav: "a5000000-0000-0000-0000-000000000004",
             loucas: "a5000000-0000-0000-0000-000000000005" };
const SV_B = "b5000000-0000-0000-0000-000000000001";
const ORC_WC = "a6000000-0000-0000-0000-000000000001";
const ORC_BAIXO = "a6000000-0000-0000-0000-000000000002";

/* ── Stubs: o núcleo do operacao-app + o que esta migração lê ────────────── */
await db.exec(STUBS_CRM);
await db.exec(AUTENTICACAO_REAL);
await db.exec(`
  -- Colunas reais que os stubs do operacao-app não têm.
  ALTER TABLE public.anew_role_permissions
    ADD COLUMN id uuid DEFAULT gen_random_uuid(),
    ADD COLUMN created_by uuid,
    ADD COLUMN created_at timestamptz DEFAULT now();
  ALTER TABLE public.quotes
    ADD COLUMN desconto_global_percent numeric,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  ALTER TABLE public.quote_lines
    ADD COLUMN service_id uuid,
    ADD COLUMN cost_price numeric,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  ALTER TABLE public.catalog_items
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

  CREATE TABLE public.service_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    parent_id uuid REFERENCES public.service_categories(id),
    name text NOT NULL,
    slug text NOT NULL DEFAULT 'x',
    is_active boolean DEFAULT true,
    is_deleted boolean NOT NULL DEFAULT false,
    deleted_at timestamptz);

  CREATE TABLE public.services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    service_category_id uuid REFERENCES public.service_categories(id),
    name text NOT NULL,
    sku text NOT NULL DEFAULT 'x',
    slug text NOT NULL DEFAULT 'x',
    service_type text NOT NULL DEFAULT 'service',
    is_active boolean DEFAULT true,
    is_deleted boolean NOT NULL DEFAULT false,
    deleted_at timestamptz);

  CREATE TABLE public.service_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    price numeric NOT NULL,
    price_type text NOT NULL CHECK (price_type IN ('purchase','retail','wholesale','distributor','promotional')),
    currency text NOT NULL DEFAULT 'EUR',
    valid_from timestamptz,
    valid_to timestamptz,
    created_at timestamptz DEFAULT now());

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
await db.exec(PRIVILEGIOS_SUPABASE);

/* ── Duas organizações, quatro pessoas ───────────────────────────────────── */
await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Remodelações A'), ('${ORG_B}','Outra empresa B');
  INSERT INTO public.anew_roles (id, organization_id, name, is_system) VALUES
    ('${ROLE.admA}','${ORG_A}','Administração', false),
    ('${ROLE.orcA}','${ORG_A}','Orçamentista', false),
    ('${ROLE.comA}','${ORG_A}','Comercial', false),
    ('${ROLE.sisA}','${ORG_A}','Administrador (sistema)', false),
    ('${ROLE.admB}','${ORG_B}','Administração', false);
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${ROLE.admA}','roles.edit'), ('${ROLE.admA}','quotes.view'), ('${ROLE.admA}','quotes.edit'),
    ('${ROLE.orcA}','services.view_cost'), ('${ROLE.orcA}','services.manage_prices'), ('${ROLE.orcA}','quotes.view'),
    ('${ROLE.comA}','quotes.view'), ('${ROLE.comA}','quotes.edit'),
    ('${ROLE.sisA}','roles.edit'),
    ('${ROLE.admB}','roles.edit'), ('${ROLE.admB}','quotes.view'), ('${ROLE.admB}','quotes.edit');
  -- Só agora fica de sistema: o gatilho tem de recusar a escrita normal.
  UPDATE public.anew_roles SET is_system = true WHERE id = '${ROLE.sisA}';

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.dirA}','${AUTH.dirA}','Direção A','dir@a.pt'),
    ('${U.orcA}','${AUTH.orcA}','Orçamentista A','orc@a.pt'),
    ('${U.comA}','${AUTH.comA}','Rúben (comercial)','com@a.pt'),
    ('${U.dirB}','${AUTH.dirB}','Direção B','dir@b.pt');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.dirA}','${ORG_A}','${ROLE.admA}','active'),
    ('${U.orcA}','${ORG_A}','${ROLE.orcA}','active'),
    ('${U.comA}','${ORG_A}','${ROLE.comA}','active'),
    ('${U.dirB}','${ORG_B}','${ROLE.admB}','active');

  INSERT INTO public.service_categories (id, organization_id, parent_id, name) VALUES
    ('${CAT_REMOD}','${ORG_A}', NULL, 'Remodelação'),
    ('${CAT_WC}','${ORG_A}','${CAT_REMOD}','Casa de banho'),
    ('${CAT_B}','${ORG_B}', NULL, 'Limpeza');
  INSERT INTO public.services (id, organization_id, service_category_id, name) VALUES
    ('${SV.demol}','${ORG_A}','${CAT_WC}','Demolição e entulho'),
    ('${SV.canal}','${ORG_A}','${CAT_WC}','Canalização'),
    ('${SV.revest}','${ORG_A}','${CAT_WC}','Revestimento de parede'),
    ('${SV.pav}','${ORG_A}','${CAT_WC}','Pavimento cerâmico'),
    ('${SV.loucas}','${ORG_A}','${CAT_WC}','Montagem de louças'),
    ('${SV_B}','${ORG_B}','${CAT_B}','Limpeza de escritório');
  INSERT INTO public.service_prices (service_id, price, price_type, valid_from) VALUES
    ('${SV.demol}', 25.48, 'retail', now() - interval '1 day'),
    ('${SV.canal}', 106.05, 'retail', now() - interval '1 day'),
    ('${SV.revest}', 26.00, 'retail', now() - interval '1 day'),
    ('${SV.pav}', 40.32, 'retail', now() - interval '1 day'),
    ('${SV.loucas}', 64.29, 'retail', now() - interval '1 day'),
    ('${SV.loucas}', 10.00, 'purchase', now() - interval '1 day');
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
    SET LOCAL request.jwt.claim.sub = '${authUid}';
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

/* ── Permissões dadas pela migração ──────────────────────────────────────── */
console.log("\n─── permissões (provisórias) ────────────");
{
  const perms = async (role) => (await q(`SELECT permission_code FROM public.anew_role_permissions
      WHERE role_id='${role}' AND (permission_code LIKE 'costs.%' OR permission_code = 'margins.approve')
      ORDER BY 1`)).map((r) => r.permission_code).join(", ");
  const adm = await perms(ROLE.admA);
  adm === "costs.edit, costs.salaries.view, costs.view, margins.approve"
    ? ok(`roles.edit (Administração) recebe tudo: ${adm}`) : mau(`Administração ficou com: ${adm}`);
  const orc = await perms(ROLE.orcA);
  orc === "costs.edit, costs.view" ? ok("quem gere preços vê e edita custos, sem salários nem aprovar")
    : mau(`Orçamentista ficou com: ${orc}`);
  const com = await perms(ROLE.comA);
  com === "" ? ok("o comercial não recebe nada de custos") : mau(`Comercial ficou com: ${com}`);
  const sis = await perms(ROLE.sisA);
  sis.includes("margins.approve") ? ok("papel de sistema também recebe (gatilho de proteção desligado só durante a migração)")
    : mau(`papel de sistema ficou com: ${sis}`);
  const dup = await um(`SELECT count(*)::int n FROM (SELECT role_id, permission_code FROM public.anew_role_permissions
      GROUP BY 1,2 HAVING count(*) > 1) x`);
  dup.n === 0 ? ok("sem permissões duplicadas depois de 2 corridas") : mau(`${dup.n} permissões duplicadas`);
  try {
    await db.exec(`INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES ('${ROLE.sisA}','x.teste')`);
    mau("o gatilho de proteção dos papéis de sistema ficou desligado");
  } catch { ok("o gatilho de proteção dos papéis de sistema voltou a ligar"); }
}

/* ── 925 € com os parâmetros BMG por omissão (organização B) ─────────────── */
console.log("\n─── custo/hora ──────────────────────────");
{
  const puro = await um(`SELECT round(public.fn_custo_hora_calc(925, 14, 23.75, 6.15, 22, 0, 173.33, 7.5), 2) AS h`);
  Number(puro.h) === 9.12 ? ok("925 € (× 14, TSU 23,75%, 6,15 €×22, 173,33 h, +7,5%) → 9,12 €/h (função pura)")
    : mau(`925 € deu ${puro.h} €/h`);

  const id = await deveCorrer("a Direção B cria um perfil de 925 € (sem linha de parâmetros: usa os por omissão)", AUTH.dirB,
    `SELECT public.rpc_custos_perfil_guardar('${ORG_B}', NULL, 'Auxiliar de limpeza', 925, true);`);
  const p = (await linhas(AUTH.dirB, `SELECT * FROM public.rpc_custos_perfis('${ORG_B}') WHERE id='${id}';`))[0];
  p && Number(p.custo_hora).toFixed(2) === "9.12" ? ok("rpc_custos_perfis: 925 € → 9,12 €/h")
    : mau(`rpc_custos_perfis deu ${p?.custo_hora}`);
}

/* ── Organização A: os parâmetros do protótipo, estrutura, perfis ────────── */
await deveCorrer("a Direção A grava os parâmetros do protótipo (seguros 713 €/ano, 1.345 h/ano, estrutura somada)", AUTH.dirA, `
  INSERT INTO public.cost_parameters (organization_id, meses_salario, tsu_pct, encargos_pct, subsidio_alimentacao_dia,
      dias_subsidio_mes, seguro_mes, horas_produtivas_mes, horas_empresa_mes, somar_estrutura, margem_minima_padrao, margem_alvo_padrao)
  VALUES ('${ORG_A}', 14, 23.75, 0, 0, 0, round(713/12.0, 2), round(1345/12.0, 2), 672, true, 28, 35);
  SELECT 1;`);

const PERFIL = {};
for (const [k, nome, sal] of [["servente", "Servente · demolição", 1900], ["canalizador", "Canalizador", 1900],
                              ["ladrilhador", "Ladrilhador", null]]) {
  PERFIL[k] = await valor(AUTH.dirA,
    `SELECT public.rpc_custos_perfil_guardar('${ORG_A}', NULL, '${nome}', ${sal ?? "NULL"}, ${sal != null});`);
}
{
  const p = (await linhas(AUTH.dirA, `SELECT * FROM public.rpc_custos_perfis('${ORG_A}') WHERE id='${PERFIL.servente}';`))[0];
  p && Number(p.custo_hora).toFixed(2) === "25.00"
    ? ok(`1.900 € (× 14, TSU 23,75%, 713 €/ano, 1.345 h/ano) → 25,00 €/h (${Number(p.custo_hora).toFixed(4)})`)
    : mau(`1.900 € deu ${p?.custo_hora}`);
}

console.log("\n─── estrutura ───────────────────────────");
await deveCorrer("a Direção A lança 3.400 €/mês de estrutura", AUTH.dirA, `
  INSERT INTO public.cost_structure_items (organization_id, descricao, categoria, valor_mensal) VALUES
    ('${ORG_A}','Renda do armazém','renda',1200), ('${ORG_A}','2 carrinhas','viaturas',900),
    ('${ORG_A}','Seguros','seguros',300), ('${ORG_A}','Administrativa','pessoal_nao_operacional',700),
    ('${ORG_A}','Software','licencas_software',300), ('${ORG_A}','Antiga (inativa)','outro',999);
  UPDATE public.cost_structure_items SET ativo = false WHERE descricao = 'Antiga (inativa)';
  SELECT 1;`);
{
  const r = await valor(AUTH.dirA, `SELECT public.rpc_custos_resumo('${ORG_A}');`);
  Number(r?.estrutura_mensal) === 3400 && Number(r.estrutura_hora).toFixed(2) === "5.06"
    ? ok("3.400 € ÷ 672 h → 5,06 €/h (a inativa não conta)")
    : mau(`estrutura: ${r?.estrutura_mensal} € → ${r?.estrutura_hora} €/h`);
  Number(r?.custo_hora_medio).toFixed(2) === "25.00" ? ok("custo/hora médio dos perfis com custo: 25,00 €/h")
    : mau(`média ${r?.custo_hora_medio}`);
}

/* ── Equipamentos e receitas do WC (receitas.ts do protótipo) ────────────── */
console.log("\n─── receitas do WC suite ────────────────");
const EQ = {};
for (const [k, nome, compra, vida] of [["martelo", "Martelo demolidor", 900, 1500], ["carro", "Carro de mão", 120, 2000],
                                       ["prensa", "Prensa de multicamada", 1700, 2000]]) {
  EQ[k] = await valor(AUTH.orcA, `INSERT INTO public.cost_equipment (organization_id, nome, compra, vida_util_horas)
    VALUES ('${ORG_A}','${nome}',${compra},${vida}) RETURNING id;`);
}
EQ.martelo ? ok("o orçamentista (costs.edit) cria equipamentos") : mau("o orçamentista não conseguiu criar equipamentos");

const RECEITAS = {
  demol: { medida: "m²", mo: [["servente", 0.5]], eq: [["martelo", 0.5], ["carro", 0.5]],
           cons: [["Sacos de entulho", 0.4, 1.5], ["Disco de corte", 0.05, 12]], esperado: 16.56 },
  canal: { medida: "pt", mo: [["canalizador", 2]], eq: [["prensa", 0.4]],
           cons: [["Tubo multicamada 16 mm", 3, 1.9], ["Uniões e acessórios", 1, 2.27], ["Fita e vedante", 1, 0.5]], esperado: 68.93 },
  revest: { medida: "m²", mo: [["ladrilhador", 0.75]], eq: [],
            cons: [["Cimento-cola C2TE", 4, 0.19, "8 months"], ["Argamassa de juntas", 0.25, 1]], esperado: 23.555 },
  pav: { medida: "m²", mo: [["ladrilhador", 0.85]], eq: [],
         cons: [["Cimento-cola C2TE", 3, 0.19], ["Cruzetas e niveladores", 1, 0.09]], esperado: 26.211 },
  loucas: { medida: "pç", mo: [["canalizador", 1.35]], eq: [], cons: [["Silicone sanitário", 0.25, 4.84]], esperado: 41.791 },
};
for (const [k, r] of Object.entries(RECEITAS)) {
  const sql = [
    `INSERT INTO public.service_recipes (organization_id, service_id, medida) VALUES ('${ORG_A}','${SV[k]}','${r.medida}');`,
    ...r.mo.map(([p, h], i) => `INSERT INTO public.service_recipe_labor (organization_id, recipe_id, perfil_id, horas_por_medida, ordem)
       SELECT '${ORG_A}', id, '${PERFIL[p]}', ${h}, ${i} FROM public.service_recipes WHERE service_id='${SV[k]}';`),
    ...r.eq.map(([e, h], i) => `INSERT INTO public.service_recipe_equipment (organization_id, recipe_id, equipamento_id, horas_por_medida, ordem)
       SELECT '${ORG_A}', id, '${EQ[e]}', ${h}, ${i} FROM public.service_recipes WHERE service_id='${SV[k]}';`),
    ...r.cons.map(([n, qt, pr, velho], i) => `INSERT INTO public.service_recipe_consumables
       (organization_id, recipe_id, descricao, quantidade_por_medida, preco_unitario, preco_atualizado_em, ordem)
       SELECT '${ORG_A}', id, '${n}', ${qt}, ${pr}, ${velho ? `now() - interval '${velho}'` : "NULL"}, ${i}
       FROM public.service_recipes WHERE service_id='${SV[k]}';`),
    "SELECT 1;",
  ].join("\n");
  await deveCorrer(`receita de ${k} gravada pelo orçamentista`, AUTH.orcA, sql);
}

const CU = {};
for (const [k, r] of Object.entries(RECEITAS)) {
  const c = await valor(AUTH.orcA, `SELECT public.rpc_custo_servico('${SV[k]}');`);
  CU[k] = Math.round(Number(c?.custo_por_medida) * 100) / 100;
  perto(c?.custo_por_medida, r.esperado, 0.011)
    ? ok(`${c.servico}: ${Number(c.custo_por_medida).toFixed(4)} €/${r.medida} (motor.ts: ${r.esperado})`)
    : mau(`${k}: custo ${c?.custo_por_medida}, esperado ${r.esperado}`);
  if (k === "revest") {
    const tipos = (c?.avisos ?? []).map((a) => a.tipo);
    tipos.includes("sem_custo_hora") ? ok("revestimento: aviso de perfil sem custo/hora (ladrilhador usa a média)")
      : mau(`revestimento sem aviso sem_custo_hora: ${tipos}`);
    tipos.includes("custo_desatualizado") ? ok("revestimento: aviso de preço com mais de 6 meses (cimento-cola)")
      : mau(`revestimento sem aviso custo_desatualizado: ${tipos}`);
    c?.origem_margem === "geral" ? ok("sem margens por linha ainda, vale a margem geral (28%)")
      : mau(`origem da margem: ${c?.origem_margem}`);
  }
}

/* ── Margem por linha: só a Direção define ───────────────────────────────── */
console.log("\n─── margens por linha ───────────────────");
await deveSerRecusado("o orçamentista NÃO define a margem da linha", AUTH.orcA,
  `INSERT INTO public.service_line_margins (organization_id, service_category_id, margem_minima, margem_alvo)
   VALUES ('${ORG_A}','${CAT_REMOD}', 10, 20);`, "row-level security");
await deveSerRecusado("o orçamentista NÃO baixa a margem geral nos parâmetros", AUTH.orcA,
  `UPDATE public.cost_parameters SET margem_minima_padrao = 5 WHERE organization_id='${ORG_A}';`, "Direção");
await deveCorrer("o orçamentista muda outros parâmetros (dias de subsídio)", AUTH.orcA,
  `UPDATE public.cost_parameters SET dias_subsidio_mes = 0 WHERE organization_id='${ORG_A}'; SELECT 1;`);
await deveCorrer("a Direção define 28% / 35% na Remodelação (linha-mãe)", AUTH.dirA,
  `INSERT INTO public.service_line_margins (organization_id, service_category_id, margem_minima, margem_alvo)
   VALUES ('${ORG_A}','${CAT_REMOD}', 28, 35); SELECT 1;`);
{
  const c = await valor(AUTH.orcA, `SELECT public.rpc_custo_servico('${SV.revest}');`);
  c?.origem_margem === "linha_mae" && Number(c.margem_minima) === 28
    ? ok("a Casa de banho herda da Remodelação (linha-mãe)") : mau(`herança: ${c?.origem_margem} ${c?.margem_minima}`);
}

/* ── O orçamento do WC suite (Ana Martins: pav 6, par 18, pts 3, pç 4) ───── */
console.log("\n─── WC suite: verificar margem ──────────");
const PRECO = { demol: 25.48, canal: 106.05, revest: 26.0, pav: 40.32, loucas: 64.29 };
const QT = { demol: 6, canal: 3, revest: 18, pav: 6, loucas: 4 };
{
  const vals = Object.keys(QT).map((k, i) =>
    `('${ORC_WC}','${SV[k]}',${i},'${k}','${k}',${QT[k]},0,${CU[k]},${(PRECO[k] * QT[k]).toFixed(2)})`).join(",\n");
  await db.exec(`
    INSERT INTO public.quotes (id, organization_id, quote_number, title, total) VALUES
      ('${ORC_WC}','${ORG_A}','ORC-1043','WC suite · Ana Martins', 0),
      ('${ORC_BAIXO}','${ORG_A}','ORC-1044','Abaixo do custo', 0);
    INSERT INTO public.quote_lines (quote_id, service_id, ordem, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, total_sem_iva) VALUES
    ${vals},
    ('${ORC_WC}', NULL, 9, 'material', 'Material: cerâmico, louças, base, torneiras', 1, 1400, 0, 2168),
    ('${ORC_WC}', NULL, 10, 'nota', 'Nota sem valor', 1, 0, 0, 0);
    INSERT INTO public.quote_lines (quote_id, service_id, ordem, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, total_sem_iva) VALUES
      ('${ORC_BAIXO}','${SV.canal}',0,'canal','Canalização',3,0,${CU.canal}, 150.00);
  `);
}
let V = await deveCorrer("o comercial verifica a margem (rpc_margem_verificar)", AUTH.comA,
  `SELECT public.rpc_margem_verificar('${ORC_WC}');`);
if (V) {
  perto(V.custo_total, 2454.55, 0.5) ? ok(`custo ${eur(V.custo_total)} € (protótipo: 2.454,55 €; tolerância 0,50 €)`)
    : mau(`custo ${V.custo_total}`);
  perto(V.preco_total, 3606.12, 0.5) ? ok(`preço ${eur(V.preco_total)} € (protótipo: 3.606,12 €)`)
    : mau(`preço ${V.preco_total}`);
  Number(V.margem_total).toFixed(1) === "31.9" ? ok(`margem total ${eur(V.margem_total)}% → 31,9%`)
    : mau(`margem ${V.margem_total}`);
  V.estado === "precisa_aprovacao" && V.pode_enviar === false
    ? ok("o revestimento (9,4%) fica abaixo dos 28%: precisa da aprovação da Direção") : mau(`estado ${V.estado}`);
  const t = V.alertas.map((a) => a.tipo);
  t.includes("abaixo_minimo") && !t.includes("abaixo_custo") && !t.includes("sem_custo")
    ? ok(`alertas: ${[...new Set(t)].join(", ")}`) : mau(`alertas: ${t}`);
  const msg = V.alertas.find((a) => a.tipo === "abaixo_minimo")?.mensagem ?? "";
  /9,4%/.test(msg) && /28%/.test(msg) ? ok(`mensagem em PT: "${msg}"`) : mau(`mensagem: ${msg}`);
}

/* ── Abaixo do custo bloqueia ────────────────────────────────────────────── */
console.log("\n─── abaixo do custo ─────────────────────");
{
  const b = await valor(AUTH.comA, `SELECT public.rpc_margem_verificar('${ORC_BAIXO}');`);
  b?.estado === "bloqueado" && b.bloqueado === true && b.pode_enviar === false
    ? ok(`bloqueado: ${b.alertas.find((a) => a.tipo === "abaixo_custo")?.mensagem}`) : mau(`estado ${b?.estado}`);
  await deveSerRecusado("nem se pode pedir aprovação abaixo do custo", AUTH.comA,
    `SELECT public.rpc_margem_pedir_aprovacao('${ORC_BAIXO}', 'Cliente antigo, vale a pena');`, "abaixo do custo");
}

/* ── Só a Direção aprova ─────────────────────────────────────────────────── */
console.log("\n─── aprovação da Direção ────────────────");
await deveSerRecusado("pedir sem motivo é recusado", AUTH.comA,
  `SELECT public.rpc_margem_pedir_aprovacao('${ORC_WC}', 'ok');`, "motivo");
const AP = await deveCorrer("o comercial pede aprovação", AUTH.comA,
  `SELECT public.rpc_margem_pedir_aprovacao('${ORC_WC}', 'Cliente recomendado, fecha esta semana');`);
{
  const n = await um(`SELECT count(*)::int n FROM public.notifications WHERE user_id='${AUTH.dirA}' AND type='margin_approval' AND kind='notification'`);
  n.n === 1 ? ok("a Direção A recebe o aviso no sino (e só ela)") : mau(`${n.n} avisos para a Direção A`);
  const nb = await um(`SELECT count(*)::int n FROM public.notifications WHERE user_id IN ('${AUTH.dirB}','${AUTH.comA}','${AUTH.orcA}')`);
  nb.n === 0 ? ok("ninguém mais recebe o aviso") : mau(`${nb.n} avisos a mais`);
  V = await valor(AUTH.comA, `SELECT public.rpc_margem_verificar('${ORC_WC}');`);
  V?.estado === "aguarda_aprovacao" ? ok("o orçamento fica a aguardar aprovação") : mau(`estado ${V?.estado}`);
}
await deveSerRecusado("o comercial NÃO aprova o próprio pedido", AUTH.comA,
  `SELECT public.rpc_margem_decidir('${AP}', 'aprovada');`, "Só a Direção");
await deveSerRecusado("o orçamentista (costs.edit) NÃO aprova", AUTH.orcA,
  `SELECT public.rpc_margem_decidir('${AP}', 'aprovada');`, "Só a Direção");
await deveSerRecusado("a Direção de OUTRA organização NÃO aprova", AUTH.dirB,
  `SELECT public.rpc_margem_decidir('${AP}', 'aprovada');`, "não encontrado");
await deveSerRecusado("o comercial não escreve diretamente em margin_approvals", AUTH.comA,
  `UPDATE public.margin_approvals SET estado='aprovada' WHERE id='${AP}';`, "permission denied");
await deveSerRecusado("recusar sem motivo é recusado", AUTH.dirA,
  `SELECT public.rpc_margem_decidir('${AP}', 'recusada');`, "motivo");
await deveCorrer("a Direção A aprova", AUTH.dirA, `SELECT public.rpc_margem_decidir('${AP}', 'aprovada', 'Ok, cliente recomendado');`);
{
  V = await valor(AUTH.comA, `SELECT public.rpc_margem_verificar('${ORC_WC}');`);
  V?.estado === "aprovado" && V.pode_enviar === true ? ok("aprovado: já se pode enviar a proposta") : mau(`estado ${V?.estado}`);
  const n = await um(`SELECT count(*)::int n FROM public.notifications WHERE user_id='${AUTH.comA}' AND title='Margem aprovada'`);
  n.n === 1 ? ok("o comercial recebe 'Margem aprovada' no sino") : mau(`${n.n} avisos ao comercial`);
  await db.exec(`UPDATE public.quote_lines SET total_sem_iva = 18 * 25.00 WHERE quote_id='${ORC_WC}' AND service_id='${SV.revest}'`);
  V = await valor(AUTH.comA, `SELECT public.rpc_margem_verificar('${ORC_WC}');`);
  V?.estado === "precisa_aprovacao" ? ok("se o preço desce depois da aprovação, volta a precisar de aprovação")
    : mau(`depois de baixar o preço: ${V?.estado}`);
  await db.exec(`UPDATE public.quote_lines SET total_sem_iva = 18 * 26.00 WHERE quote_id='${ORC_WC}' AND service_id='${SV.revest}'`);
  await db.exec(`UPDATE public.quotes SET desconto_global_percent = 10 WHERE id='${ORC_WC}'`);
  V = await valor(AUTH.comA, `SELECT public.rpc_margem_verificar('${ORC_WC}');`);
  V?.estado === "bloqueado" && V.alertas.some((a) => a.tipo === "desconto_come_margem")
    && V.alertas.some((a) => a.tipo === "abaixo_custo" && a.linha === "revest")
    ? ok("um desconto global de 10% põe o revestimento abaixo do custo (bloqueia) e as outras linhas abaixo do mínimo (desconto_come_margem)")
    : mau(`com desconto: ${V?.estado} ${V?.alertas?.map((a) => a.tipo)}`);
  await db.exec(`UPDATE public.quotes SET desconto_global_percent = NULL WHERE id='${ORC_WC}'`);
  const lista = await valor(AUTH.dirA, `SELECT public.rpc_margem_aprovacoes('${ORG_A}', NULL);`);
  Array.isArray(lista) && lista.length === 1 && lista[0].pedida_por === "Rúben (comercial)"
    ? ok("rpc_margem_aprovacoes lista o pedido, com quem pediu") : mau(`lista: ${JSON.stringify(lista)?.slice(0, 120)}`);
}

/* ── Salário escondido ───────────────────────────────────────────────────── */
console.log("\n─── salários ────────────────────────────");
{
  const p = (await linhas(AUTH.orcA, `SELECT * FROM public.rpc_custos_perfis('${ORG_A}') WHERE id='${PERFIL.servente}';`))[0];
  p && p.salario_base === null && p.salario_visivel === false && Number(p.custo_hora) > 0
    ? ok("o orçamentista vê o custo/hora mas o salário vem a NULL") : mau(`o orçamentista vê: ${JSON.stringify(p)}`);
  const d = (await linhas(AUTH.dirA, `SELECT * FROM public.rpc_custos_perfis('${ORG_A}') WHERE id='${PERFIL.servente}';`))[0];
  Number(d?.salario_base) === 1900 && d.salario_visivel === true ? ok("a Direção vê o salário (1.900 €)") : mau(`Direção vê: ${d?.salario_base}`);
  const direto = await linhas(AUTH.orcA, `SELECT salario_base FROM public.cost_profiles;`);
  direto.length === 0 ? ok("ler a tabela cost_profiles diretamente: 0 linhas sem costs.salaries.view")
    : mau(`o orçamentista leu ${direto.length} perfis diretamente`);
  await deveSerRecusado("o orçamentista NÃO muda salários", AUTH.orcA,
    `SELECT public.rpc_custos_perfil_guardar('${ORG_A}','${PERFIL.servente}','Servente · demolição', 500, true);`, "Só a Direção");
  await deveCorrer("o orçamentista muda o nome sem tocar no salário", AUTH.orcA,
    `SELECT public.rpc_custos_perfil_guardar('${ORG_A}','${PERFIL.servente}','Servente', NULL, false);`);
  const s = await um(`SELECT salario_base, nome FROM public.cost_profiles WHERE id='${PERFIL.servente}'`);
  Number(s.salario_base) === 1900 && s.nome === "Servente" ? ok("o salário ficou nos 1.900 €") : mau(`salário ${s.salario_base}`);
  await deveSerRecusado("o orçamentista não escreve na tabela cost_profiles diretamente", AUTH.orcA,
    `UPDATE public.cost_profiles SET salario_base = 1 WHERE id='${PERFIL.servente}';`, "permission denied");
  await deveSerRecusado("o comercial (sem costs.view) não vê perfis", AUTH.comA,
    `SELECT * FROM public.rpc_custos_perfis('${ORG_A}');`, "Sem permissão");
  await deveSerRecusado("apagar um perfil em uso numa receita é recusado", AUTH.dirA,
    `SELECT public.rpc_custos_perfil_apagar('${PERFIL.canalizador}');`, "em uso");
}

/* ── Outra organização ───────────────────────────────────────────────────── */
console.log("\n─── isolamento entre organizações ───────");
{
  await deveSerRecusado("B não lê os perfis de A", AUTH.dirB, `SELECT * FROM public.rpc_custos_perfis('${ORG_A}');`, "Sem permissão");
  await deveSerRecusado("B não lê o resumo de A", AUTH.dirB, `SELECT public.rpc_custos_resumo('${ORG_A}');`, "Sem permissão");
  await deveSerRecusado("B não calcula o custo de um serviço de A", AUTH.dirB, `SELECT public.rpc_custo_servico('${SV.canal}');`, "Sem permissão");
  await deveSerRecusado("B não verifica um orçamento de A", AUTH.dirB, `SELECT public.rpc_margem_verificar('${ORC_WC}');`, "não encontrado");
  await deveSerRecusado("B não pede aprovação num orçamento de A", AUTH.dirB,
    `SELECT public.rpc_margem_pedir_aprovacao('${ORC_WC}', 'tentativa de outra empresa');`, "Sem permissão");
  await deveSerRecusado("B não lista as aprovações de A", AUTH.dirB, `SELECT public.rpc_margem_aprovacoes('${ORG_A}');`, "Sem permissão");
  await deveSerRecusado("B não muda perfis de A", AUTH.dirB,
    `SELECT public.rpc_custos_perfil_guardar('${ORG_B}','${PERFIL.servente}','Roubado', NULL, false);`, "não encontrado");
  await deveSerRecusado("B não apaga perfis de A", AUTH.dirB, `SELECT public.rpc_custos_perfil_apagar('${PERFIL.ladrilhador}');`, "Sem permissão");
  for (const t of ["cost_parameters", "cost_equipment", "cost_structure_items", "service_recipes", "service_recipe_labor",
                   "service_recipe_equipment", "service_recipe_consumables", "service_line_margins", "margin_approvals"]) {
    const r = await linhas(AUTH.dirB, `SELECT count(*)::int n FROM public.${t} WHERE organization_id='${ORG_A}';`);
    r[0].n === 0 ? ok(`B lê 0 linhas de A em ${t}`) : mau(`B leu ${r[0].n} linhas de A em ${t}`);
  }
  await deveSerRecusado("B não cria equipamentos em A", AUTH.dirB,
    `INSERT INTO public.cost_equipment (organization_id, nome) VALUES ('${ORG_A}','Intruso');`, "row-level security");
  await deveSerRecusado("B não cria uma receita para um serviço de A", AUTH.dirB,
    `INSERT INTO public.service_recipes (organization_id, service_id) VALUES ('${ORG_B}','${SV.pav}');`, "row-level security");
  const pB = await valor(AUTH.dirB, `SELECT id FROM public.rpc_custos_perfis('${ORG_B}') LIMIT 1;`);
  await deveCorrer("B cria a sua receita", AUTH.dirB,
    `INSERT INTO public.service_recipes (organization_id, service_id) VALUES ('${ORG_B}','${SV_B}'); SELECT 1;`);
  await deveSerRecusado("B não usa um perfil de A na sua receita", AUTH.dirB,
    `INSERT INTO public.service_recipe_labor (organization_id, recipe_id, perfil_id, horas_por_medida)
     SELECT '${ORG_B}', id, '${PERFIL.servente}', 1 FROM public.service_recipes WHERE service_id='${SV_B}';`, "row-level security");
  await deveCorrer("B usa o seu perfil na sua receita", AUTH.dirB,
    `INSERT INTO public.service_recipe_labor (organization_id, recipe_id, perfil_id, horas_por_medida)
     SELECT '${ORG_B}', id, '${pB}', 1 FROM public.service_recipes WHERE service_id='${SV_B}'; SELECT 1;`);
  await deveSerRecusado("B não define margens numa linha de A", AUTH.dirB,
    `INSERT INTO public.service_line_margins (organization_id, service_category_id, margem_minima, margem_alvo)
     VALUES ('${ORG_B}','${CAT_WC}', 1, 2);`, "row-level security");
  await deveSerRecusado("sem sessão (anon) não se chama nenhuma RPC", null,
    `RESET ROLE; SET LOCAL ROLE anon; SELECT public.rpc_margem_verificar('${ORC_WC}');`, "permission denied");
}

/* ── Terceira corrida, com dados ─────────────────────────────────────────── */
console.log("\n─── idempotência com dados ──────────────");
{
  const antes = await um(`SELECT (SELECT count(*) FROM public.cost_profiles) a, (SELECT count(*) FROM public.margin_approvals) b,
    (SELECT count(*) FROM public.anew_permissions WHERE category='costs') c, (SELECT count(*) FROM public.anew_role_permissions) d`);
  try { await db.exec(MIGRACAO); ok("a 3.ª corrida, já com dados, não rebenta"); }
  catch (e) { mau(`3.ª corrida — ${e.message.split("\n")[0]}`); }
  const depois = await um(`SELECT (SELECT count(*) FROM public.cost_profiles) a, (SELECT count(*) FROM public.margin_approvals) b,
    (SELECT count(*) FROM public.anew_permissions WHERE category='costs') c, (SELECT count(*) FROM public.anew_role_permissions) d`);
  JSON.stringify(antes) === JSON.stringify(depois) ? ok("nada duplicado nem perdido (perfis, pedidos, permissões)")
    : mau(`antes ${JSON.stringify(antes)} depois ${JSON.stringify(depois)}`);
  const v = await valor(AUTH.comA, `SELECT public.rpc_margem_verificar('${ORC_WC}');`);
  v?.estado === "aprovado" ? ok("o orçamento continua aprovado") : mau(`estado ${v?.estado}`);
}

console.log(falhas.length ? `\n${falhas.length} verificação(ões) falharam.` : "\nTudo certo.");
process.exit(falhas.length ? 1 : 0);

/**
 * Prova a Previsão (db/previsao.sql) contra um Postgres limpo (PGlite):
 *
 *   · entram os orçamentos EM ABERTO e sem obra; rejeitados/perdidos e os que
 *     já têm ordem ficam de fora; outra organização não aparece;
 *   · o cruzamento linha × modelo: com modelo dá os passos (minutos =
 *     fixos + por unidade × qt, pessoas, especialidade, espera); sem modelo
 *     usa a ficha técnica; sem ficha marca-se; produtos não cruzam;
 *   · a equipa traz as especialidades e o custo/hora SÓ a quem vê custos;
 *   · a carga das obras já planeadas aparece por especialidade × dia;
 *   · só quem planeia (gestor) consulta; e nada fica escrito.
 *
 *     npm run validar-previsao
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
const verifica = (cond, bom, mal) => (cond ? ok(bom) : mau(mal));

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const CLI = "22222222-2222-2222-2222-222222222222";
const U = {
  gestor: "a0000000-0000-0000-0000-00000000000a",
  tec: "a0000000-0000-0000-0000-00000000000c",
  tec2: "a0000000-0000-0000-0000-00000000000d",
  custos: "a0000000-0000-0000-0000-00000000000e",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));
const SK = { can: "5c000000-0000-0000-0000-000000000001", rev: "5c000000-0000-0000-0000-000000000002" };
const SV = {
  mod: "5e000000-0000-0000-0000-000000000001",
  ficha: "5e000000-0000-0000-0000-000000000002",
  nada: "5e000000-0000-0000-0000-000000000003",
};
const Q = {
  aceite: "99990000-0000-0000-0000-000000000001",
  enviado: "99990000-0000-0000-0000-000000000002",
  rejeitado: "99990000-0000-0000-0000-000000000003",
  comOrdem: "99990000-0000-0000-0000-000000000004",
  outraOrg: "99990000-0000-0000-0000-000000000005",
};
const OBRA = "0b000000-0000-0000-0000-000000000001";
const FASE = "0f000000-0000-0000-0000-000000000001";

/* ── Um CRM como o real (só o que se lê) ────────────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_number text, client_id uuid,
    status text NOT NULL DEFAULT 'draft', total_value numeric DEFAULT 0, currency text DEFAULT 'EUR',
    organization_id uuid NOT NULL, quote_id uuid, notes text, signature_date timestamptz,
    company_signature_date timestamptz, accepted_at timestamptz, created_by uuid, deleted_at timestamptz);
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestor}','${AUTH.gestor}','Gestora','g@x.pt'), ('${U.tec}','${AUTH.tec}','Canalizador','t@x.pt'),
    ('${U.tec2}','${AUTH.tec2}','Ladrilhador','t2@x.pt'), ('${U.custos}','${AUTH.custos}','Gestor com custos','c@x.pt');
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    SELECT auth_user_id, id FROM public.anew_users;

  ALTER TABLE public.quote_lines ADD COLUMN service_id uuid, ADD COLUMN section_name text,
                                 ADD COLUMN source_deal_need_id uuid, ADD COLUMN product_id uuid;
  ALTER TABLE public.quotes ADD COLUMN assigned_to uuid, ADD COLUMN subtotal numeric(12,2),
                            ADD COLUMN total_fees numeric(12,2), ADD COLUMN created_at timestamptz DEFAULT now();
  CREATE TABLE public.service_categories (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.services (
    id uuid PRIMARY KEY, name text NOT NULL, service_category_id uuid,
    technical_sheet_labor_description text, technical_sheet_labor_hours numeric,
    technical_sheet_labor_people_count numeric, organization_id uuid, sku text,
    is_deleted boolean NOT NULL DEFAULT false, deleted_at timestamptz);
  ALTER TABLE public.products ADD COLUMN name text;
  CREATE TABLE public.service_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL,
    product_id uuid NOT NULL, quantity numeric NOT NULL, sort_order integer, deleted_at timestamptz);

  INSERT INTO public.services (id, name, organization_id, technical_sheet_labor_hours, technical_sheet_labor_people_count) VALUES
    ('${SV.mod}','Remodelação de casa de banho','${ORG}',NULL,NULL),
    ('${SV.ficha}','Montagem de móvel','${ORG}',2,1),
    ('${SV.nada}','Serviço sem ficha','${ORG}',NULL,NULL);

  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado, accepted_at,
                             total, subtotal, total_fees, assigned_to) VALUES
    ('${Q.aceite}','${ORG}','${CLI}','Q-1','WC aceite','aceite',now(),1230,1000,0,'${U.gestor}'),
    ('${Q.enviado}','${ORG}','${CLI}','Q-2','Móvel enviado','enviado',NULL,615,500,0,NULL),
    ('${Q.rejeitado}','${ORG}','${CLI}','Q-3','Rejeitado','rejeitado',NULL,100,80,0,NULL),
    ('${Q.comOrdem}','${ORG}','${CLI}','Q-4','Já tem ordem','aceite',now(),100,80,0,NULL),
    ('${Q.outraOrg}','${ORG_B}',NULL,'Q-B','Da outra','aceite',now(),100,80,0,NULL);
  INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id, product_id,
                                  custo_material_unit, custo_mao_obra_unit, total_sem_iva) VALUES
    ('${Q.aceite}',0,'Remodelação',4,'${SV.mod}',NULL, 50, 100, 800),
    ('${Q.aceite}',1,'Sem ficha',1,'${SV.nada}',NULL, 0, 0, 100),
    ('${Q.aceite}',2,'Torneira',1,NULL,gen_random_uuid(), 100, 0, 100),
    ('${Q.enviado}',0,'Móvel',3,'${SV.ficha}',NULL, 0, 30, 500);
  INSERT INTO public.client_contracts (contract_number, status, organization_id, quote_id)
    VALUES ('CC-1','signed','${ORG}','${Q.aceite}'), ('CC-4','signed','${ORG}','${Q.comOrdem}');
`);

const SEQUENCIA = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
];
for (const f of SEQUENCIA) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar previsao.sql ───────────────");
try {
  await db.exec(ler("previsao.sql"));
  await db.exec(ler("previsao.sql"));
  ok("previsao.sql corre, e corre outra vez (idempotente)");
} catch (e) {
  mau(`previsao.sql falhou: ${e.message}`);
  process.exit(1);
}

/* ── Equipa, especialidades, modelos, uma obra já planeada ──────────────── */
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('d0000000-0000-0000-0000-00000000000a','${ORG}','Tudo'),
    ('d0000000-0000-0000-0000-00000000000b','${ORG}','Sem custos'),
    ('d0000000-0000-0000-0000-00000000000c','${ORG}','Tecnicos');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'd0000000-0000-0000-0000-00000000000a'::uuid, code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'd0000000-0000-0000-0000-00000000000b'::uuid, code FROM public.anew_permissions
     WHERE category = 'operations' AND code <> 'operations.costs.view';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d0000000-0000-0000-0000-00000000000c','operations.view'),
    ('d0000000-0000-0000-0000-00000000000c','operations.orders.view');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.custos}','${ORG}','d0000000-0000-0000-0000-00000000000a','active'),
    ('${U.gestor}','${ORG}','d0000000-0000-0000-0000-00000000000b','active'),
    ('${U.tec}','${ORG}','d0000000-0000-0000-0000-00000000000c','active'),
    ('${U.tec2}','${ORG}','d0000000-0000-0000-0000-00000000000c','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${U.gestor}','gestor', 30), ('${ORG}','${U.custos}','gestor', 30),
    ('${ORG}','${U.tec}','tecnico', 20), ('${ORG}','${U.tec2}','tecnico', 24);
  INSERT INTO public.ops_skill (id, organization_id, nome) VALUES
    ('${SK.can}','${ORG}','Canalização'), ('${SK.rev}','${ORG}','Revestimentos');
  INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id) VALUES
    ('${U.tec}','${SK.can}'), ('${U.tec2}','${SK.rev}'), ('${U.tec2}','${SK.can}');

  -- O modelo do serviço: canalização 60 + 30/un (1 pessoa); revestimento
  -- 120 fixos, 2 pessoas, depois de 24 h de espera.
  INSERT INTO public.ops_obra_servico_tarefa (organization_id, servico_id, ordem, nome, fase,
      minutos_por_unidade, minutos_fixos, pessoas, skill_id, espera_antes_horas, medida) VALUES
    ('${ORG}','${SV.mod}',1,'Canalização',2, 30, 60, 1,'${SK.can}', 0, 'qt'),
    ('${ORG}','${SV.mod}',2,'Revestimento',3, 0, 120, 2,'${SK.rev}', 24, 'qt');

  -- Uma obra já planeada: 960 min de revestimento espalhados por 2 dias úteis.
  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, estado)
    VALUES ('${OBRA}','${ORG}','OB-1','Obra em carteira','planeada');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome)
    VALUES ('${FASE}','${ORG}','${OBRA}',3,'Acabamentos');
  INSERT INTO public.ops_obra_tarefa (organization_id, obra_id, fase_id, nome, minutos_previstos,
                                      skill_id, inicio_planeado, fim_planeado)
  SELECT '${ORG}','${OBRA}','${FASE}','Revestir', 960, '${SK.rev}', d[1], d[2]
    FROM (SELECT public.ops_obra_dias_uteis_lista('${ORG}', (now() AT TIME ZONE 'Europe/Lisbon')::date, 2) d) x;

  -- O orçamento Q-4 já tem ordem.
  INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, prioridade, cliente_id, titulo, orcamento_id)
    VALUES ('${ORG}','OT-1','obra','agendada','normal','${CLI}','Q-4','${Q.comOrdem}');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.quotes, public.quote_lines, public.client_contracts, public.anew_users TO authenticated;
`);

async function chamar(authUid, sql) {
  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
  const linhas = r.flatMap((x) => x.rows ?? []);
  const bruto = Object.values(linhas.at(-1) ?? {})[0];
  return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
}
async function recusa(nome, authUid, sql, trecho) {
  try {
    await chamar(authUid, sql);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    !trecho || e.message.includes(trecho) ? ok(nome) : mau(`${nome} — mensagem errada: ${e.message}`);
  }
}

const antes = await um(`SELECT (SELECT count(*) FROM public.ops_obra)::int AS obras,
                               (SELECT count(*) FROM public.ops_ordem)::int AS ordens,
                               (SELECT count(*) FROM public.ops_obra_servico_tarefa)::int AS modelos`);

/* ── A base ─────────────────────────────────────────────────────────────── */
console.log("\n─── a base ──────────────────────────────");
const base = await chamar(AUTH.custos, `SELECT public.rpc_ops_previsao_base('${ORG}');`);
const nums = base.orcamentos.map((o) => o.numero).sort();
verifica(JSON.stringify(nums) === JSON.stringify(["Q-1", "Q-2"]),
  "entram os em aberto sem obra (Q-1 aceite, Q-2 enviado); rejeitado, com ordem e outra org ficam de fora",
  `orçamentos: ${JSON.stringify(nums)}`);
const q1 = base.orcamentos.find((o) => o.numero === "Q-1");
verifica(Number(q1.valor_sem_iva) === 1000 && Number(q1.custo_material) === 300 && q1.linhas === 3,
  "Q-1: 1000 € sem IVA, 300 € de material (4×50 + 1×100 das linhas), 3 linhas",
  `Q-1: ${JSON.stringify(q1)}`);
verifica(q1.comercial_nome === "Gestora" && q1.contratado === true && q1.contrato_numero === "CC-1",
  "o comercial (assigned_to) e o contrato assinado vêm no cabeçalho", `Q-1: ${JSON.stringify(q1)}`);
const tec2 = base.equipa.find((p) => p.nome === "Ladrilhador");
verifica(tec2 && tec2.skills.length === 2 && Number(tec2.custo_hora) === 24 && Number(tec2.horas_dia) === 8,
  "a equipa traz as especialidades, 8 h/dia por defeito e o custo/hora (para quem vê custos)",
  `equipa: ${JSON.stringify(base.equipa)}`);
verifica(base.skills.length === 2 && base.dias_uteis.length >= 200,
  `especialidades (2) e o calendário de dias úteis (${base.dias_uteis.length})`, "faltam especialidades ou dias");
const carga = base.carga_atual.filter((c) => c.skill_id === SK.rev);
verifica(carga.length === 2 && carga.every((c) => Number(c.minutos) === 480),
  "a obra já planeada pesa 480 min/dia de revestimento nos seus 2 dias", `carga: ${JSON.stringify(base.carga_atual)}`);

{
  const b = await chamar(AUTH.gestor, `SELECT public.rpc_ops_previsao_base('${ORG}');`);
  const g = b.orcamentos.find((o) => o.numero === "Q-1");
  verifica(b.ve_custos === false && g.custo_material === null && b.equipa.every((p) => p.custo_hora === null),
    "sem 'costs.view': nem custo/hora das pessoas, nem custo de material", `sem custos: ${JSON.stringify(g)}`);
}

await recusa("um técnico não consulta a previsão", AUTH.tec,
  `SELECT public.rpc_ops_previsao_base('${ORG}');`, "Só quem planeia");

/* ── O cruzamento ───────────────────────────────────────────────────────── */
console.log("\n─── linhas × modelos ────────────────────");
const exp = await chamar(AUTH.custos,
  `SELECT public.rpc_ops_previsao_expandir('${ORG}', ARRAY['${Q.aceite}','${Q.enviado}','${Q.outraOrg}']::uuid[]);`);
verifica(exp.orcamentos.length === 2, "orçamentos de outra organização ignoram-se", `veio: ${exp.orcamentos.length}`);
{
  const l = exp.orcamentos.find((o) => o.id === Q.aceite).linhas;
  const [mod, nada, prod] = l;
  verifica(mod.cruzamento === "modelo" && mod.passos.length === 2,
    "a linha com modelo expande-se nos 2 passos do modelo", `linha: ${JSON.stringify(mod)}`);
  const [p1, p2] = mod.passos;
  verifica(p1.minutos === 180 && p1.pessoas === 1 && p1.skill_id === SK.can,
    "canalização: 60 + 30 × 4 = 180 min, 1 pessoa, Canalização", `passo 1: ${JSON.stringify(p1)}`);
  verifica(p2.minutos === 120 && p2.pessoas === 2 && Number(p2.espera_antes_horas) === 24 && p2.skill_id === SK.rev,
    "revestimento: 120 min, 2 pessoas, 24 h de espera antes", `passo 2: ${JSON.stringify(p2)}`);
  verifica(nada.cruzamento === "sem_ficha", "serviço sem modelo nem ficha: marcado 'sem_ficha'", `linha: ${JSON.stringify(nada)}`);
  verifica(prod.cruzamento === "sem_servico" && prod.passos.length === 0,
    "um produto não cruza com nada (não é trabalho)", `linha: ${JSON.stringify(prod)}`);
  verifica(mod.servico_nome === "Remodelação de casa de banho", "e traz o nome do serviço", mod.servico_nome);
}
{
  const [m] = exp.orcamentos.find((o) => o.id === Q.enviado).linhas;
  verifica(m.cruzamento === "ficha" && m.passos[0].minutos === 360,
    "sem modelo, a ficha técnica: 3 × 2 h × 1 pessoa = 360 min", `linha: ${JSON.stringify(m)}`);
}
await recusa("no máximo 20 de cada vez", AUTH.custos,
  `SELECT public.rpc_ops_previsao_expandir('${ORG}', (SELECT array_agg(gen_random_uuid()) FROM generate_series(1,21)));`,
  "No máximo 20");

/* ── Só leitura ─────────────────────────────────────────────────────────── */
console.log("\n─── só leitura ──────────────────────────");
{
  const depois = await um(`SELECT (SELECT count(*) FROM public.ops_obra)::int AS obras,
                                  (SELECT count(*) FROM public.ops_ordem)::int AS ordens,
                                  (SELECT count(*) FROM public.ops_obra_servico_tarefa)::int AS modelos`);
  verifica(JSON.stringify(antes) === JSON.stringify(depois),
    "nenhuma obra, ordem ou modelo criado pela previsão", `${JSON.stringify(antes)} → ${JSON.stringify(depois)}`);
  const vol = await um(`SELECT count(*)::int AS n FROM pg_proc
                         WHERE proname IN ('rpc_ops_previsao_base','rpc_ops_previsao_expandir') AND provolatile <> 's'`);
  verifica(vol.n === 0, "as duas RPCs são STABLE (o Postgres não as deixa escrever)", `${vol.n} não STABLE`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a previsão cruza orçamentos com modelos e equipa, e não escreve nada");

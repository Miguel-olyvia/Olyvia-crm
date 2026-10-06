/**
 * Prova db/chegadas.sql (QR da obra → "Registar chegada") contra um Postgres
 * limpo (PGlite), sem tocar no Supabase.
 *
 *   · instala depois de obras.sql, e corre duas vezes;
 *   · só quem está numa tarefa da obra (ou a coordena) regista chegada;
 *   · a localização é opcional, validada, e NUNCA sai pela vista;
 *   · a tabela não se lê nem escreve diretamente;
 *   · outra organização não regista nem vê.
 *
 *     node tools/validar-chegadas.mjs
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
const CLI_A = "22222222-2222-2222-2222-222222222222";
const U = {
  gestorA: "a0000000-0000-0000-0000-00000000000a",
  tecA: "a0000000-0000-0000-0000-00000000000c",
  tec2A: "a0000000-0000-0000-0000-00000000000d",
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
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente A');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI_A}','${ORG_A}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestorA}','${AUTH.gestorA}','Gestora A','ga@x.pt'),
    ('${U.tecA}','${AUTH.tecA}','Tecnico A','ta@x.pt'),
    ('${U.tec2A}','${AUTH.tec2A}','Tecnico Dois','t2@x.pt'),
    ('${U.gestorB}','${AUTH.gestorB}','Gestor B','gb@x.pt');
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestorA}','${U.gestorA}'),('${AUTH.tecA}','${U.tecA}'),
    ('${AUTH.tec2A}','${U.tec2A}'),('${AUTH.gestorB}','${U.gestorB}');
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
    console.error(`✗ ${f} falhou antes de chegar às chegadas: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar chegadas.sql ───────────────");
try {
  await db.exec(ler("chegadas.sql"));
  await db.exec(ler("chegadas.sql"));
  ok("chegadas.sql corre, e corre outra vez (idempotente)");
} catch (e) {
  mau(`chegadas.sql falhou: ${e.message}`);
  process.exit(1);
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('d0000000-0000-0000-0000-00000000000a','${ORG_A}','Tudo A'),
    ('d0000000-0000-0000-0000-00000000000b','${ORG_A}','Tecnicos A'),
    ('d0000000-0000-0000-0000-00000000000c','${ORG_B}','Tudo B');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions,
      unnest(ARRAY['d0000000-0000-0000-0000-00000000000a'::uuid,
                   'd0000000-0000-0000-0000-00000000000c'::uuid]) r
     WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d0000000-0000-0000-0000-00000000000b','operations.view'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.view'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.execute');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.gestorA}','${ORG_A}','d0000000-0000-0000-0000-00000000000a','active'),
    ('${U.tecA}','${ORG_A}','d0000000-0000-0000-0000-00000000000b','active'),
    ('${U.tec2A}','${ORG_A}','d0000000-0000-0000-0000-00000000000b','active'),
    ('${U.gestorB}','${ORG_B}','d0000000-0000-0000-0000-00000000000c','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG_A}','${U.gestorA}','gestor'), ('${ORG_A}','${U.tecA}','tecnico'),
    ('${ORG_A}','${U.tec2A}','tecnico'), ('${ORG_B}','${U.gestorB}','gestor');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.anew_users, public.anew_clients, public.anew_entities TO authenticated;
`);

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql} COMMIT;`;
}
async function chamar(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  const linhas = r.flatMap((x) => x.rows ?? []);
  const bruto = Object.values(linhas.at(-1) ?? {})[0];
  return typeof bruto === "string" && bruto.startsWith("{") ? JSON.parse(bruto) : bruto;
}
async function linhas(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  return r.flatMap((x) => x.rows ?? []);
}
async function deveSerRecusado(nome, authUid, sql, trecho) {
  try {
    await db.exec(sessao(authUid, sql));
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}
async function devePassar(nome, authUid, sql) {
  try {
    const r = await chamar(authUid, sql);
    ok(nome);
    return r;
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`${nome} — falhou: ${e.message.split("\n")[0]}`);
    return null;
  }
}

/* ── Uma obra com uma tarefa do técnico A ───────────────────────────────── */
const MOD = (await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_semear_modelo_exemplo('${ORG_A}');`)).id;
const OB = await chamar(
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_criar(p_org => '${ORG_A}', p_titulo => 'WC', p_cliente_id => '${CLI_A}',
     p_modelo_id => '${MOD}', p_data_inicio => '2026-10-05');`
);
const OB2 = await chamar(
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_criar(p_org => '${ORG_A}', p_titulo => 'Outra', p_cliente_id => '${CLI_A}',
     p_modelo_id => '${MOD}', p_data_inicio => '2026-10-05');`
);
const T = (await um(`SELECT id FROM public.ops_obra_tarefa WHERE obra_id='${OB.id}' ORDER BY ordem LIMIT 1`)).id;
const T_OUTRA = (await um(`SELECT id FROM public.ops_obra_tarefa WHERE obra_id='${OB2.id}' LIMIT 1`)).id;
await db.exec(`
  DELETE FROM public.ops_obra_tarefa_pessoa WHERE obra_id IN ('${OB.id}','${OB2.id}');
  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
  VALUES ('${T}','${U.tecA}','${ORG_A}','${OB.id}');
`);

console.log("\n─── registar chegada ────────────────────");
const reg = (args) => `SELECT public.rpc_ops_obra_registar_chegada(${args});`;

await deveSerRecusado(
  "quem não está em tarefa nenhuma da obra não regista chegada",
  AUTH.tec2A,
  reg(`p_obra_id => '${OB.id}'`),
  "Não estás em nenhuma tarefa"
);
await deveSerRecusado(
  "o gestor de OUTRA organização não regista",
  AUTH.gestorB,
  reg(`p_obra_id => '${OB.id}'`),
  ""
);
await deveSerRecusado(
  "a tarefa tem de ser desta obra",
  AUTH.tecA,
  reg(`p_obra_id => '${OB.id}', p_tarefa_id => '${T_OUTRA}'`),
  "não é desta obra"
);
await deveSerRecusado(
  "latitude sem longitude é recusada",
  AUTH.tecA,
  reg(`p_obra_id => '${OB.id}', p_latitude => 38.7`),
  "Localização inválida"
);
await deveSerRecusado(
  "coordenadas fora do mundo são recusadas",
  AUTH.tecA,
  reg(`p_obra_id => '${OB.id}', p_latitude => 120, p_longitude => -9.1`),
  "Localização inválida"
);

const sem = await devePassar("o técnico regista a chegada SEM localização", AUTH.tecA, reg(`p_obra_id => '${OB.id}', p_tarefa_id => '${T}'`));
sem?.id && sem?.chegou_em ? ok("devolve o id e a hora") : mau(`resposta: ${JSON.stringify(sem)}`);
await devePassar(
  "e COM localização, quando aceita",
  AUTH.tecA,
  reg(`p_obra_id => '${OB.id}', p_latitude => 38.7223, p_longitude => -9.1393, p_precisao_m => 12.34`)
);
{
  const r = await um(`SELECT count(*)::int n, count(latitude)::int com, max(precisao_m)::text p, bool_and(utilizador_id = '${U.tecA}') eu
                        FROM public.ops_obra_chegada WHERE obra_id='${OB.id}'`);
  r.n === 2 && r.com === 1 && r.p === "12.3" && r.eu
    ? ok("duas chegadas, uma com localização (precisão arredondada), em nome de quem chamou")
    : mau(`chegadas: ${JSON.stringify(r)}`);
}
await devePassar("o gestor da obra também pode registar", AUTH.gestorA, reg(`p_obra_id => '${OB.id}'`));

console.log("\n─── ler ─────────────────────────────────");
await deveSerRecusado(
  "a tabela não se lê diretamente (as coordenadas não saem)",
  AUTH.tecA,
  `SELECT latitude FROM public.ops_obra_chegada;`,
  "permission denied"
);
await deveSerRecusado(
  "nem se escreve diretamente",
  AUTH.tecA,
  `INSERT INTO public.ops_obra_chegada (organization_id, obra_id, utilizador_id) VALUES ('${ORG_A}','${OB.id}','${U.tecA}');`,
  "permission denied"
);
{
  const v = await linhas(AUTH.tecA, `SELECT nome, com_localizacao FROM public.ops_v_obra_chegada WHERE obra_id='${OB.id}' ORDER BY chegou_em;`);
  v.length === 3 && v.some((x) => x.com_localizacao) && v.every((x) => !("latitude" in x))
    ? ok("o técnico da obra vê as chegadas pela vista — com 'com localização', sem coordenadas")
    : mau(`vista para o técnico: ${JSON.stringify(v)}`);
  const b = await linhas(AUTH.gestorB, `SELECT * FROM public.ops_v_obra_chegada;`);
  b.length === 0 ? ok("a outra organização não vê nada") : mau(`a B vê ${b.length} chegada(s)`);
  const t2 = await linhas(AUTH.tec2A, `SELECT * FROM public.ops_v_obra_chegada WHERE obra_id='${OB.id}';`);
  t2.length === 0 ? ok("o técnico que não está na obra não a vê") : mau(`o técnico 2 vê ${t2.length}`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ chegadas: ${falhas.length} falha(s)`);
  process.exit(1);
}
console.log("✓ chegadas: só quem está na obra, localização opcional e escondida, nada direto na tabela");

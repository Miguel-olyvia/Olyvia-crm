/**
 * Prova db/obras-fotos.sql e db/entrar-como.sql contra um Postgres limpo
 * (PGlite), sem tocar no Supabase.
 *
 *   · fotos: quem está na tarefa junta; quem não está, não; numa tarefa
 *     validada, não; o caminho tem de ser da tarefa; lê quem vê a obra; só
 *     quem tirou (ou o gestor) apaga; escrita direta fechada;
 *   · entrar como: só o admin de Operações; nunca como outro admin, como um
 *     admin de sistema, ou como alguém com acessos que o admin não tem
 *     (outra empresa, outro papel); o registo só se lê pelo admin.
 *
 *     npm run validar-fotos-entrar-como
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
const um = async (sql) => (await db.query(sql)).rows[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const U = {
  adminA: "a0000000-0000-0000-0000-000000000001",
  gestorA: "a0000000-0000-0000-0000-00000000000a",
  supA: "a0000000-0000-0000-0000-00000000000b",
  tecA: "a0000000-0000-0000-0000-00000000000c",
  tec2A: "a0000000-0000-0000-0000-00000000000d",
  admin2A: "a0000000-0000-0000-0000-00000000000e",
  tecAB: "a0000000-0000-0000-0000-00000000000f", // técnico na A, e também na B
  comA: "a0000000-0000-0000-0000-000000000010", // técnico com papel do CRM mais largo
  sysA: "a0000000-0000-0000-0000-000000000011", // técnico que é admin de sistema
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));

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
  CREATE TABLE public._stub_admin_sistema (auth_user_id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION public.is_system_admin_user(_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
    $fn$ SELECT EXISTS (SELECT 1 FROM public._stub_admin_sistema WHERE auth_user_id = _user_id) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ${Object.keys(U).map((k) => `('${AUTH[k]}','${U[k]}')`).join(",")};
  INSERT INTO public._stub_admin_sistema VALUES ('${AUTH.sysA}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar ────────────────────────────");
for (const f of ["obras-fotos.sql", "entrar-como.sql"]) {
  try {
    await db.exec(ler(f));
    await db.exec(ler(f));
    ok(`${f} corre duas vezes`);
  } catch (e) {
    mau(`${f}: ${e.message}`);
    process.exit(1);
  }
}

const R = {
  tudoA: "d0000000-0000-0000-0000-00000000000a",
  tecA: "d0000000-0000-0000-0000-00000000000b",
  tudoB: "d0000000-0000-0000-0000-00000000000c",
  comA: "d0000000-0000-0000-0000-00000000000d",
};
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.tudoA}','${ORG_A}','Tudo A'), ('${R.tecA}','${ORG_A}','Tecnicos A'),
    ('${R.tudoB}','${ORG_B}','Tudo B'), ('${R.comA}','${ORG_A}','Tecnico + comercial A');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions,
      unnest(ARRAY['${R.tudoA}'::uuid, '${R.tudoB}'::uuid, '${R.comA}'::uuid]) r
     WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.tecA}','operations.view'), ('${R.tecA}','operations.orders.view'),
    ('${R.tecA}','operations.orders.execute'),
    ('${R.comA}','quotes.delete');   -- o admin A não tem esta
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.adminA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.gestorA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.supA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.admin2A}','${ORG_A}','${R.tudoA}','active'),
    ('${U.tecA}','${ORG_A}','${R.tecA}','active'),
    ('${U.tec2A}','${ORG_A}','${R.tecA}','active'),
    ('${U.tecAB}','${ORG_A}','${R.tecA}','active'),
    ('${U.tecAB}','${ORG_B}','${R.tudoB}','active'),
    ('${U.comA}','${ORG_A}','${R.comA}','active'),
    ('${U.sysA}','${ORG_A}','${R.tecA}','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG_A}','${U.adminA}','admin'), ('${ORG_A}','${U.gestorA}','gestor'),
    ('${ORG_A}','${U.supA}','supervisor'), ('${ORG_A}','${U.admin2A}','admin'),
    ('${ORG_A}','${U.tecA}','tecnico'), ('${ORG_A}','${U.tec2A}','tecnico'),
    ('${ORG_A}','${U.tecAB}','tecnico'), ('${ORG_A}','${U.comA}','tecnico'),
    ('${ORG_A}','${U.sysA}','tecnico');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.anew_users TO authenticated;
`);

/* ── Uma obra com uma tarefa do técnico A ───────────────────────────────── */
const OBRA = "0b000000-0000-0000-0000-000000000001";
const FASE = "0f000000-0000-0000-0000-000000000001";
const T1 = "07000000-0000-0000-0000-000000000001";
const T2 = "07000000-0000-0000-0000-000000000002";
await db.exec(`
  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, supervisor_id, gestor_id)
    VALUES ('${OBRA}','${ORG_A}','OB-T-1','Obra teste','${U.supA}','${U.gestorA}');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome)
    VALUES ('${FASE}','${ORG_A}','${OBRA}',1,'Preparação');
  INSERT INTO public.ops_obra_tarefa (id, organization_id, obra_id, fase_id, nome, estado) VALUES
    ('${T1}','${ORG_A}','${OBRA}','${FASE}','Proteger chão','feita'),
    ('${T2}','${ORG_A}','${OBRA}','${FASE}','Já validada','validada');
  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id) VALUES
    ('${T1}','${U.tecA}','${ORG_A}','${OBRA}'), ('${T2}','${U.tecA}','${ORG_A}','${OBRA}');
`);

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql}; COMMIT;`;
}
async function chamar(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  const rows = r.flatMap((x) => x.rows ?? []);
  return Object.values(rows.at(-1) ?? {})[0];
}
async function passa(nome, authUid, sql) {
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

const caminho = (t, n = "f1.jpg") => `${ORG_A}/${OBRA}/${t}/${n}`;
const registar = (t, c) => `SELECT public.rpc_ops_obra_registar_foto('${t}', '${c}', 'foto.jpg', 'image/jpeg', 1000)`;

console.log("\n─── fotos ───────────────────────────────");
const r1 = await passa("o técnico da tarefa junta uma foto", AUTH.tecA, registar(T1, caminho(T1)));
await recusa("outro técnico (fora da tarefa) não junta", AUTH.tec2A, registar(T1, caminho(T1, "f2.jpg")), "Só quem está na tarefa");
await passa("o supervisor da obra junta", AUTH.supA, registar(T1, caminho(T1, "s.jpg")));
await recusa("numa tarefa validada, não", AUTH.tecA, registar(T2, caminho(T2)), "já está validada");
await recusa("caminho de outra tarefa, não", AUTH.tecA, registar(T1, caminho(T2, "x.jpg")), "não pertence a esta tarefa");
await recusa("caminho com '..', não", AUTH.tecA, registar(T1, `${ORG_A}/${OBRA}/${T1}/../x.jpg`), "não pertence");
{
  const n = await chamar(AUTH.supA, `SELECT count(*)::int FROM public.ops_obra_tarefa_foto WHERE tarefa_id='${T1}'`);
  n === 2 ? ok("o supervisor vê as 2 fotos") : mau(`o supervisor vê ${n} fotos`);
  const n2 = await chamar(AUTH.tec2A, `SELECT count(*)::int FROM public.ops_obra_tarefa_foto`);
  n2 === 0 ? ok("quem não vê a obra não vê as fotos") : mau(`o técnico de fora vê ${n2} fotos`);
}
await recusa("escrita direta na tabela, não", AUTH.tecA,
  `INSERT INTO public.ops_obra_tarefa_foto (organization_id, obra_id, tarefa_id, caminho, nome)
   VALUES ('${ORG_A}','${OBRA}','${T1}','x','x')`, "permission denied");
{
  const id = await chamar(AUTH.supA, `SELECT id FROM public.ops_obra_tarefa_foto WHERE carregado_por='${U.supA}'`);
  await recusa("o técnico não apaga a foto do supervisor", AUTH.tecA,
    `SELECT public.rpc_ops_obra_remover_foto('${id}')`, "Só quem tirou");
  await passa("o gestor apaga qualquer uma", AUTH.gestorA, `SELECT public.rpc_ops_obra_remover_foto('${id}')`);
  r1 && (await passa("quem tirou apaga a sua", AUTH.tecA,
    `SELECT public.rpc_ops_obra_remover_foto((SELECT id FROM public.ops_obra_tarefa_foto WHERE carregado_por='${U.tecA}'))`));
}

console.log("\n─── entrar como ─────────────────────────");
const verif = (alvo) => `SELECT public.ops_entrar_como_verificar('${ORG_A}', '${alvo}')::text`;
{
  const r = await passa("o admin entra como um técnico", AUTH.adminA, verif(U.tecA));
  const j = r ? JSON.parse(r) : null;
  j?.email === "tecA@x.pt" && j?.auth_user_id === AUTH.tecA
    ? ok("e recebe o email e a conta certos")
    : mau(`resposta: ${r}`);
}
await passa("o admin entra como o supervisor", AUTH.adminA, verif(U.supA));
await recusa("o gestor não entra como ninguém", AUTH.gestorA, verif(U.tecA), "Só o admin");
await recusa("o técnico não entra como ninguém", AUTH.tecA, verif(U.tec2A), "Só o admin");
await recusa("não como outro admin", AUTH.adminA, verif(U.admin2A), "outro admin");
await recusa("não como si próprio", AUTH.adminA, verif(U.adminA), "Já estás");
await recusa("não como um admin de sistema", AUTH.adminA, verif(U.sysA), "admin de sistema");
await recusa("não como quem também está noutra empresa", AUTH.adminA, verif(U.tecAB), "Org B");
await recusa("não como quem tem um papel com mais do que o meu", AUTH.adminA, verif(U.comA), "acessos que tu não tens");
await recusa("não como quem não tem perfil em Operações", AUTH.adminA,
  `SELECT public.ops_entrar_como_verificar('${ORG_A}', '${U.adminA.replace(/1$/, "9")}')`, "perfil ativo");
await recusa("o admin da A não usa isto na B", AUTH.adminA,
  `SELECT public.ops_entrar_como_verificar('${ORG_B}', '${U.tecAB}')`, "Sem acesso");

{
  await db.exec(`INSERT INTO public.ops_entrar_como_log (id, organization_id, admin_id, alvo_id)
                 VALUES ('10600000-0000-0000-0000-000000000001','${ORG_A}','${U.adminA}','${U.tecA}')`);
  const v = await chamar(AUTH.gestorA, `SELECT count(*)::int FROM public.ops_entrar_como_log`);
  v === 0 ? ok("o gestor não lê o registo") : mau(`o gestor lê ${v} entradas`);
  const a = await chamar(AUTH.adminA, `SELECT count(*)::int FROM public.ops_entrar_como_log`);
  a === 1 ? ok("o admin lê o registo") : mau(`o admin lê ${a} entradas`);
  await recusa("ninguém escreve no registo à mão", AUTH.adminA,
    `INSERT INTO public.ops_entrar_como_log (organization_id, admin_id, alvo_id) VALUES ('${ORG_A}','${U.adminA}','${U.tecA}')`,
    "permission denied");
  const t = await chamar(AUTH.tecA, `SELECT public.rpc_ops_entrar_como_terminar('10600000-0000-0000-0000-000000000001')::text`);
  JSON.parse(t).ok === false ? ok("o técnico não fecha a entrada do admin") : mau("o técnico fechou a entrada do admin");
  const t2 = await chamar(AUTH.adminA, `SELECT public.rpc_ops_entrar_como_terminar('10600000-0000-0000-0000-000000000001')::text`);
  JSON.parse(t2).ok === true ? ok("o admin fecha a sua entrada ao voltar") : mau("o admin não fechou a entrada");
}

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ fotos e entrar como: regras provadas");
process.exit(falhas.length ? 1 : 0);

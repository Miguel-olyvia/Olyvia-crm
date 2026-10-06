/**
 * Prova db/obras-fecho.sql contra um Postgres limpo (PGlite), sem tocar no
 * Supabase.
 *
 *   · divisões, vistoria e remates: só o supervisor da obra (ou o gestor);
 *     um "não está bem" abre UM remate; o responsável resolve, o supervisor
 *     verifica;
 *   · fotos antes/depois: quem tirou, o supervisor ou o gestor;
 *   · auto de receção: caminhos da obra; assinado uma vez (refazer: gestor);
 *   · concluir exige auto assinado OU justificação do gestor — e a regra
 *     sobrevive a correr outra vez o obras.sql;
 *   · escrita direta fechada; quem não vê a obra não vê nada.
 *
 *     npm run validar-obras-fecho
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

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

const ORG = "11111111-1111-1111-1111-111111111111";
const U = {
  admin: "a0000000-0000-0000-0000-000000000001",
  gestor: "a0000000-0000-0000-0000-00000000000a",
  sup: "a0000000-0000-0000-0000-00000000000b",
  tec: "a0000000-0000-0000-0000-00000000000c",
  tec2: "a0000000-0000-0000-0000-00000000000d",
  sup2: "a0000000-0000-0000-0000-00000000000e", // supervisor de OUTRA obra
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
  CREATE OR REPLACE FUNCTION public.is_system_admin_user(_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE AS $fn$ SELECT false $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ${Object.keys(U).map((k) => `('${AUTH[k]}','${U[k]}')`).join(",")};
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql", "obras-fotos.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar ────────────────────────────");
try {
  await db.exec(ler("obras-fecho.sql"));
  await db.exec(ler("obras-fecho.sql"));
  ok("obras-fecho.sql corre duas vezes");
} catch (e) {
  mau(`obras-fecho.sql: ${e.message}`);
  process.exit(1);
}

const R = { tudo: "d0000000-0000-0000-0000-00000000000a", tec: "d0000000-0000-0000-0000-00000000000b" };
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.tudo}','${ORG}','Tudo'), ('${R.tec}','${ORG}','Tecnicos');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT '${R.tudo}', code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.tec}','operations.view'), ('${R.tec}','operations.orders.view'),
    ('${R.tec}','operations.orders.execute');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.admin}','${ORG}','${R.tudo}','active'), ('${U.gestor}','${ORG}','${R.tudo}','active'),
    ('${U.sup}','${ORG}','${R.tec}','active'), ('${U.sup2}','${ORG}','${R.tec}','active'),
    ('${U.tec}','${ORG}','${R.tec}','active'), ('${U.tec2}','${ORG}','${R.tec}','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${U.admin}','admin'), ('${ORG}','${U.gestor}','gestor'),
    ('${ORG}','${U.sup}','supervisor'), ('${ORG}','${U.sup2}','supervisor'),
    ('${ORG}','${U.tec}','tecnico'), ('${ORG}','${U.tec2}','tecnico');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.anew_users TO authenticated;
`);

/* ── Duas obras em curso, tudo validado; uma terceira por validar ──────── */
const OB1 = "0b000000-0000-0000-0000-000000000001";
const OB2 = "0b000000-0000-0000-0000-000000000002";
const OB3 = "0b000000-0000-0000-0000-000000000003";
const F = (n) => `0f000000-0000-0000-0000-00000000000${n}`;
const T = (n) => `07000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, estado, supervisor_id, gestor_id) VALUES
    ('${OB1}','${ORG}','OB-1','Remodelação cozinha e casa de banho','em_curso','${U.sup}','${U.gestor}'),
    ('${OB2}','${ORG}','OB-2','Pintura sala','em_curso','${U.sup}','${U.gestor}'),
    ('${OB3}','${ORG}','OB-3','Outra','em_curso','${U.sup2}','${U.gestor}');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome) VALUES
    ('${F(1)}','${ORG}','${OB1}',1,'Fase'), ('${F(2)}','${ORG}','${OB2}',1,'Fase'), ('${F(3)}','${ORG}','${OB3}',1,'Fase');
  INSERT INTO public.ops_obra_tarefa (id, organization_id, obra_id, fase_id, nome, estado) VALUES
    ('${T(1)}','${ORG}','${OB1}','${F(1)}','Demolir','validada'),
    ('${T(2)}','${ORG}','${OB2}','${F(2)}','Pintar','validada'),
    ('${T(3)}','${ORG}','${OB3}','${F(3)}','Coisa','validada');
  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id) VALUES
    ('${T(1)}','${U.tec}','${ORG}','${OB1}');
  INSERT INTO public.ops_obra_tarefa_foto (organization_id, obra_id, tarefa_id, caminho, nome, carregado_por) VALUES
    ('${ORG}','${OB1}','${T(1)}','${ORG}/${OB1}/${T(1)}/a.jpg','a.jpg','${U.tec}');
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
const json = (v) => (typeof v === "string" ? JSON.parse(v) : v);

console.log("\n─── ler e divisões ──────────────────────");
{
  const r = json(await passa("o supervisor lê o fecho", AUTH.sup, `SELECT public.rpc_ops_obra_fecho('${OB1}')::text`));
  const nomes = (r?.sugestoes ?? []).map((s) => s.nome).sort().join(",");
  nomes === "Casa de banho,Cozinha" ? ok("sugere Cozinha e Casa de banho pelo título") : mau(`sugestões: ${nomes}`);
  r?.pode?.fechar === true ? ok("e pode fechar") : mau(`pode: ${JSON.stringify(r?.pode)}`);
  const t = json(await chamar(AUTH.tec, `SELECT public.rpc_ops_obra_fecho('${OB1}')::text`));
  t?.pode?.fechar === false ? ok("o técnico lê, mas não fecha") : mau(`técnico pode: ${JSON.stringify(t?.pode)}`);
}
await recusa("quem não vê a obra não lê o fecho", AUTH.tec2, `SELECT public.rpc_ops_obra_fecho('${OB1}')`, "não encontrada");
const COZ = json(await passa("o supervisor cria a divisão Cozinha", AUTH.sup,
  `SELECT public.rpc_ops_obra_divisao_guardar('${OB1}', 'Cozinha', 'cozinha')::text`))?.id;
await recusa("o técnico não cria divisões", AUTH.tec,
  `SELECT public.rpc_ops_obra_divisao_guardar('${OB1}', 'WC', 'casa_banho')`, "Só o supervisor");
await recusa("o supervisor de OUTRA obra não mexe nesta", AUTH.sup2,
  `SELECT public.rpc_ops_obra_divisao_guardar('${OB1}', 'WC', 'casa_banho')`, "não encontrada");
{
  const r = json(await chamar(AUTH.sup, `SELECT public.rpc_ops_obra_fecho('${OB1}')::text`));
  const d = r.divisoes?.[0];
  d?.itens?.length >= 8 && d.itens.includes("Exaustor a funcionar")
    ? ok(`a cozinha traz a lista de origem (${d.itens.length} itens)`)
    : mau(`itens: ${JSON.stringify(d?.itens)}`);
  (r.sugestoes ?? []).length === 0 ? ok("com divisões, deixa de sugerir") : mau("continua a sugerir");
}

console.log("\n─── vistoria e remates ──────────────────");
{
  const v1 = json(await passa("'não está bem' abre um remate", AUTH.sup,
    `SELECT public.rpc_ops_obra_vistoria_responder('${COZ}', 'Exaustor a funcionar', 'nok', 'não puxa')::text`));
  const v2 = json(await chamar(AUTH.sup,
    `SELECT public.rpc_ops_obra_vistoria_responder('${COZ}', 'Exaustor a funcionar', 'nok', 'continua')::text`));
  v1?.remate_id && v1.remate_id === v2?.remate_id ? ok("responder outra vez não abre outro") : mau(`${JSON.stringify(v1)} / ${JSON.stringify(v2)}`);
  await passa("'ok' grava", AUTH.sup, `SELECT public.rpc_ops_obra_vistoria_responder('${COZ}', 'Móveis nivelados, portas alinhadas', 'ok')`);
  const n = await chamar(AUTH.sup, `SELECT count(*)::int FROM public.ops_obra_remate WHERE obra_id='${OB1}'`);
  n === 1 ? ok("fica 1 remate") : mau(`há ${n} remates`);
  await recusa("o técnico não responde à vistoria", AUTH.tec,
    `SELECT public.rpc_ops_obra_vistoria_responder('${COZ}', 'Exaustor a funcionar', 'ok')`, "Só o supervisor");
}
await recusa("foto do remate fora da obra, não", AUTH.sup,
  `SELECT public.rpc_ops_obra_remate_criar('${OB1}', 'Risco', NULL, 'rececao', NULL, '${ORG}/${OB2}/remates/x.jpg')`, "não pertence");
await recusa("responsável fora da equipa, não", AUTH.sup,
  `SELECT public.rpc_ops_obra_remate_criar('${OB1}', 'Risco', NULL, 'rececao', '${U.admin.replace(/1$/, "9")}')`, "equipa ativa");
const REM = json(await passa("o supervisor cria um remate na receção, com foto e responsável", AUTH.sup,
  `SELECT public.rpc_ops_obra_remate_criar('${OB1}', 'Risco no tampo', '${COZ}', 'rececao', '${U.tec}', '${ORG}/${OB1}/remates/r.jpg')::text`))?.id;
await recusa("o responsável não verifica", AUTH.tec, `SELECT public.rpc_ops_obra_remate_estado('${REM}', 'verificado')`, "Só o supervisor");
await passa("o responsável dá por resolvido", AUTH.tec, `SELECT public.rpc_ops_obra_remate_estado('${REM}', 'resolvido', 'polido')`);
await recusa("outro técnico não resolve", AUTH.tec2, `SELECT public.rpc_ops_obra_remate_estado('${REM}', 'resolvido')`, "não encontrado");
await passa("o supervisor verifica", AUTH.sup, `SELECT public.rpc_ops_obra_remate_estado('${REM}', 'verificado')`);
{
  const r = await chamar(AUTH.sup, `SELECT estado || '|' || (verificado_em IS NOT NULL) || '|' || (resolvido_em IS NOT NULL) FROM public.ops_obra_remate WHERE id='${REM}'`);
  r === "verificado|true|true" ? ok("fica verificado, com as datas") : mau(`remate: ${r}`);
}
await recusa("escrita direta nos remates, não", AUTH.sup,
  `INSERT INTO public.ops_obra_remate (organization_id, obra_id, descricao) VALUES ('${ORG}','${OB1}','x')`, "permission denied");
{
  const n = await chamar(AUTH.tec2, `SELECT count(*)::int FROM public.ops_obra_remate`);
  n === 0 ? ok("quem não vê a obra não vê os remates") : mau(`o técnico de fora vê ${n} remates`);
}

console.log("\n─── lista configurável ──────────────────");
await recusa("o supervisor não muda a lista", AUTH.sup,
  `SELECT public.rpc_ops_obra_vistoria_configurar('${ORG}', 'cozinha', ARRAY['A'])`, "Só o gestor");
{
  const r = json(await passa("o gestor muda a lista da cozinha", AUTH.gestor,
    `SELECT public.rpc_ops_obra_vistoria_configurar('${ORG}', 'cozinha', ARRAY['Bancada ok', ' ', 'Gavetas ok', 'Bancada ok'])::text`));
  JSON.stringify(r?.itens) === JSON.stringify(["Bancada ok", "Gavetas ok"]) ? ok("sem vazios nem repetidos, pela ordem") : mau(`itens: ${JSON.stringify(r?.itens)}`);
  const v = json(await passa("lista vazia volta à de origem", AUTH.gestor,
    `SELECT public.rpc_ops_obra_vistoria_configurar('${ORG}', 'cozinha', ARRAY[]::text[])::text`));
  v?.itens?.includes("Exaustor a funcionar") ? ok("e volta") : mau(`itens: ${JSON.stringify(v?.itens)}`);
}

console.log("\n─── fotos antes/depois ──────────────────");
{
  const foto = await chamar(AUTH.sup, `SELECT id FROM public.ops_obra_tarefa_foto WHERE obra_id='${OB1}'`);
  await passa("quem tirou marca 'antes' da cozinha", AUTH.tec, `SELECT public.rpc_ops_obra_foto_marcar('${foto}', 'antes', '${COZ}')`);
  await recusa("outro técnico não marca", AUTH.tec2, `SELECT public.rpc_ops_obra_foto_marcar('${foto}', 'depois', '${COZ}')`, "não encontrada");
  await recusa("momento inválido, não", AUTH.sup, `SELECT public.rpc_ops_obra_foto_marcar('${foto}', 'durante', '${COZ}')`, "antes");
  const m = await chamar(AUTH.sup, `SELECT momento || '|' || (divisao_id = '${COZ}') FROM public.ops_obra_tarefa_foto WHERE id='${foto}'`);
  m === "antes|true" ? ok("fica marcada") : mau(`foto: ${m}`);
}

console.log("\n─── auto de receção e concluir ──────────");
const concluir = (o) => `SELECT public.rpc_ops_obra_mudar_estado('${o}', 'concluida')`;
await recusa("concluir sem auto, não", AUTH.gestor, concluir(OB1), "auto de receção");
const auto = (o, a = `${ORG}/${o}/fecho/a.png`, p = `${ORG}/${o}/fecho/auto.pdf`) =>
  `SELECT public.rpc_ops_obra_auto_registar('${o}', 'Maria Cliente', '${a}', '${p}', 'Tudo bem', '{"remates_pendentes":0}'::jsonb)`;
await recusa("o técnico não regista o auto", AUTH.tec, auto(OB1), "Só o supervisor");
await recusa("assinatura fora da pasta da obra, não", AUTH.sup, auto(OB1, `${ORG}/${OB1}/outra/a.png`), "não pertencem");
await recusa("sem nome de quem assina, não", AUTH.sup,
  `SELECT public.rpc_ops_obra_auto_registar('${OB1}', ' ', '${ORG}/${OB1}/fecho/a.png', '${ORG}/${OB1}/fecho/p.pdf')`, "nome");
await passa("o supervisor regista o auto assinado", AUTH.sup, auto(OB1));
await recusa("o supervisor não o refaz", AUTH.sup, auto(OB1), "Só o gestor o refaz");
await passa("o gestor refaz", AUTH.gestor, auto(OB1, `${ORG}/${OB1}/fecho/b.png`, `${ORG}/${OB1}/fecho/auto2.pdf`));
{
  const ev = await chamar(AUTH.gestor,
    `SELECT count(*)::int FROM public.ops_evento WHERE entidade_id='${OB1}' AND tipo='auto_rececao'`);
  ev === 2 ? ok("as duas assinaturas ficam no histórico") : mau(`eventos: ${ev}`);
}
await passa("com o auto, conclui", AUTH.gestor, concluir(OB1));
await recusa("obra concluída: o remate já não muda", AUTH.sup, `SELECT public.rpc_ops_obra_remate_estado('${REM}', 'aberto')`, "concluída");

await recusa("o supervisor não justifica fecho sem auto", AUTH.sup,
  `SELECT public.rpc_ops_obra_fecho_justificar('${OB2}', 'O cliente não pôde vir hoje')`, "Só o gestor");
await recusa("justificação de uma palavra, não", AUTH.gestor,
  `SELECT public.rpc_ops_obra_fecho_justificar('${OB2}', 'falta')`, "Explica");
await passa("o gestor justifica", AUTH.gestor,
  `SELECT public.rpc_ops_obra_fecho_justificar('${OB2}', 'O cliente está fora e aceitou por email')`);
await passa("com justificação, conclui", AUTH.gestor, concluir(OB2));

try {
  await db.exec(ler("obras.sql"));
  ok("obras.sql corre outra vez por cima");
} catch (e) {
  mau(`obras.sql outra vez: ${e.message}`);
}
await recusa("e a regra continua (OB-3 sem auto não conclui)", AUTH.gestor, concluir(OB3), "auto de receção");

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ fecho da obra: regras provadas");
process.exit(falhas.length ? 1 : 0);

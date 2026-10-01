/**
 * Prova que `db/seguranca.sql` isola as organizações umas das outras.
 *
 * O cenário que interessa é o desconfortável: a mesma pessoa em duas
 * organizações, com papéis diferentes. A Ana é GESTORA na organização A e
 * TÉCNICA na B. `has_anew_permission` (a do CRM) é global — vê que ela tem
 * `settings.manage` e `costs.view` e diz que sim, em qualquer organização.
 * Antes deste ficheiro, isso chegava para ela, na B:
 *
 *   · meter-se na equipa de qualquer ordem;
 *   · ler e escrever custos;
 *   · mexer em skills, horários, medições, checklists e planos;
 *   · promover-se a admin.
 *
 * Aqui prova-se, um a um, que já não chega — e que o que deve continuar a
 * funcionar continua (ela é gestora na A, e na A tudo isso é dela).
 *
 * Corre a sequência de instalação inteira com os privilégios por omissão do
 * Supabase e uma autenticação a sério (ver `_stubs-crm.mjs`).
 *
 *     npm run validar-seguranca
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, PRIVILEGIOS_SUPABASE, AUTENTICACAO_REAL } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
let passaram = 0;
const ok = (m) => { passaram++; console.log(`  ✓ ${m}`); };
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

/* ── Quem é quem ────────────────────────────────────────────────────────── */

const ORG_A = "a0000000-0000-0000-0000-00000000000a";
const ORG_B = "b0000000-0000-0000-0000-00000000000b";
const CLI_A = "a1000000-0000-0000-0000-00000000000a";
const CLI_B = "b1000000-0000-0000-0000-00000000000b";

const U = {
  ana:   "a2000000-0000-0000-0000-000000000001",  // gestora na A, técnica na B
  bruno: "a2000000-0000-0000-0000-000000000002",  // técnico na A
  carla: "b2000000-0000-0000-0000-000000000003",  // gestora na B
  sofia: "a2000000-0000-0000-0000-000000000004",  // supervisora na A
  alice: "a2000000-0000-0000-0000-000000000005",  // admin na A
};
const AUTH = {
  ana:   "a3000000-0000-0000-0000-000000000001",
  bruno: "a3000000-0000-0000-0000-000000000002",
  carla: "b3000000-0000-0000-0000-000000000003",
  sofia: "a3000000-0000-0000-0000-000000000004",
  alice: "a3000000-0000-0000-0000-000000000005",
};
const R = {
  gestaoA: "a4000000-0000-0000-0000-000000000001",
  tecA:    "a4000000-0000-0000-0000-000000000002",
  supA:    "a4000000-0000-0000-0000-000000000003",
  gestaoB: "b4000000-0000-0000-0000-000000000001",
  tecB:    "b4000000-0000-0000-0000-000000000002",
};
const O = {
  a1: "a5000000-0000-0000-0000-000000000001",  // A, do Bruno
  a2: "a5000000-0000-0000-0000-000000000002",  // A, sem equipa
  b1: "b5000000-0000-0000-0000-000000000001",  // B, da Carla
  b2: "b5000000-0000-0000-0000-000000000002",  // B, com a Ana (técnica)
};
const TAREFA_A1 = "a6000000-0000-0000-0000-000000000001";
const QUOTE_B = "b7000000-0000-0000-0000-000000000001";
const B_SKILL = "b8000000-0000-0000-0000-000000000001";
const B_MED = "b8000000-0000-0000-0000-000000000002";
const B_CHK = "b8000000-0000-0000-0000-000000000003";
const B_PLANO = "b8000000-0000-0000-0000-000000000004";
const B_CHK_T = "b8000000-0000-0000-0000-000000000005";

/* ── Montagem ───────────────────────────────────────────────────────────── */

await db.exec(STUBS_CRM);
await db.exec(PRIVILEGIOS_SUPABASE);
await db.exec(AUTENTICACAO_REAL);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql",
]) {
  try { await db.exec(ler(f)); }
  catch (e) { console.error(`✗ ${f} não correu: ${e.message}`); process.exit(1); }
}

const TODAS = `SELECT code FROM public.anew_permissions WHERE category = 'operations'`;
const algumas = (lista) => lista.map((p) => `('operations.${p}')`).join(",");
const TEC = algumas(["view", "orders.view", "orders.execute", "orders.create", "locations.view"]);
const TEC_SEM_CRIAR = algumas(["view", "orders.view", "orders.execute", "locations.view"]);
// A supervisora tem até `costs.view` no papel do CRM — e mesmo assim não vê
// custos, porque a função dela no módulo não é de gestão.
const SUP = algumas(["view", "orders.view", "orders.execute", "orders.confirm", "locations.view", "costs.view"]);

await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_entities (id, display_name) VALUES
    ('a9000000-0000-0000-0000-00000000000a','Cliente A'),
    ('b9000000-0000-0000-0000-00000000000b','Cliente B');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES
    ('${CLI_A}','${ORG_A}','a9000000-0000-0000-0000-00000000000a'),
    ('${CLI_B}','${ORG_B}','b9000000-0000-0000-0000-00000000000b');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.ana}','${AUTH.ana}','Ana','ana@x.pt'),
    ('${U.bruno}','${AUTH.bruno}','Bruno','bruno@x.pt'),
    ('${U.carla}','${AUTH.carla}','Carla','carla@x.pt'),
    ('${U.sofia}','${AUTH.sofia}','Sofia','sofia@x.pt'),
    ('${U.alice}','${AUTH.alice}','Alice','alice@x.pt');

  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.gestaoA}','${ORG_A}','Gestão'), ('${R.tecA}','${ORG_A}','Técnicos'),
    ('${R.supA}','${ORG_A}','Supervisão'),
    ('${R.gestaoB}','${ORG_B}','Gestão'), ('${R.tecB}','${ORG_B}','Técnicos');

  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT '${R.gestaoA}'::uuid, code FROM (${TODAS}) t UNION ALL
    SELECT '${R.gestaoB}'::uuid, code FROM (${TODAS}) t;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT '${R.tecA}'::uuid, c FROM (VALUES ${TEC}) v(c) UNION ALL
    SELECT '${R.tecB}'::uuid, c FROM (VALUES ${TEC_SEM_CRIAR}) v(c) UNION ALL
    SELECT '${R.supA}'::uuid, c FROM (VALUES ${SUP}) v(c);

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.ana}','${ORG_A}','${R.gestaoA}','active'),
    ('${U.ana}','${ORG_B}','${R.tecB}','active'),
    ('${U.bruno}','${ORG_A}','${R.tecA}','active'),
    ('${U.carla}','${ORG_B}','${R.gestaoB}','active'),
    ('${U.sofia}','${ORG_A}','${R.supA}','active'),
    ('${U.alice}','${ORG_A}','${R.gestaoA}','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG_A}','${U.ana}','gestor',25), ('${ORG_B}','${U.ana}','tecnico',20),
    ('${ORG_A}','${U.bruno}','tecnico',18), ('${ORG_B}','${U.carla}','gestor',30),
    ('${ORG_A}','${U.sofia}','supervisor',22), ('${ORG_A}','${U.alice}','admin',40);

  INSERT INTO public.ops_ordem (id, organization_id, codigo, origem, estado, cliente_id, titulo, responsavel_id) VALUES
    ('${O.a1}','${ORG_A}','OT-A1','corretiva','agendada','${CLI_A}','A1','${U.bruno}'),
    ('${O.a2}','${ORG_A}','OT-A2','corretiva','agendada','${CLI_A}','A2',NULL),
    ('${O.b1}','${ORG_B}','OT-B1','corretiva','agendada','${CLI_B}','B1','${U.carla}'),
    ('${O.b2}','${ORG_B}','OT-B2','corretiva','agendada','${CLI_B}','B2','${U.ana}');
  INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel) VALUES
    ('${O.a1}','${U.bruno}','responsavel'), ('${O.b1}','${U.carla}','responsavel'),
    ('${O.b2}','${U.ana}','responsavel');
  INSERT INTO public.ops_ordem_tarefa (id, ordem_id, nome, obrigatoria) VALUES
    ('${TAREFA_A1}','${O.a1}','Verificar', true);

  INSERT INTO public.ops_custo (ordem_id, tipo, descricao, total) VALUES
    ('${O.a1}','material','Material A', 50), ('${O.b1}','material','Material B', 100);

  INSERT INTO public.ops_skill (id, organization_id, nome) VALUES ('${B_SKILL}','${ORG_B}','AVAC');
  INSERT INTO public.ops_medicao_def (id, organization_id, nome, tipo) VALUES ('${B_MED}','${ORG_B}','Estado','escolha');
  INSERT INTO public.ops_checklist (id, organization_id, codigo, nome) VALUES ('${B_CHK}','${ORG_B}','CL-B','Checklist B');
  INSERT INTO public.ops_checklist_tarefa (id, checklist_id, nome) VALUES ('${B_CHK_T}','${B_CHK}','Tarefa B');
  INSERT INTO public.ops_plano (id, organization_id, codigo, nome, cliente_id, regra_recorrencia)
    VALUES ('${B_PLANO}','${ORG_B}','PLN-B','Plano B','${CLI_B}','FREQ=MONTHLY');
  INSERT INTO public.ops_utilizador_cliente (utilizador_id, cliente_id) VALUES ('${U.bruno}','${CLI_A}');

  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado)
    VALUES ('${QUOTE_B}','${ORG_B}','${CLI_B}','ORC-B-1','Obra na B','aceite');
`);

/* ── Como uma pessoa ────────────────────────────────────────────────────── */

const prefixo = (auth) => `
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '${auth}';`;

async function como(auth, sql) {
  return db.exec(`${prefixo(auth)}\n${sql};\nCOMMIT;`);
}

/** As linhas da última instrução, corrida como essa pessoa. */
async function ver(auth, sql) {
  const r = await como(auth, sql);
  return r.flatMap((x) => (x.rows?.length ? [x.rows] : [])).at(-1) ?? [];
}

async function deveCorrer(nome, auth, sql) {
  try { await como(auth, sql); ok(nome); }
  catch (e) { await db.exec("ROLLBACK").catch(() => {}); mau(`${nome} — ${e.message.split("\n")[0]}`); }
}

async function deveSerRecusado(nome, auth, sql, trecho, naoPodeConter) {
  try {
    await como(auth, sql);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (naoPodeConter && e.message.includes(naoPodeConter)) {
      mau(`${nome} — recusado, mas a mensagem revela "${naoPodeConter}": ${e.message}`);
    } else if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

/**
 * A segunda linha de defesa. Dá o privilégio de escrita outra vez (dentro da
 * transação, que é desfeita no fim) e prova que a RLS, sozinha, também
 * recusa. Quem um dia voltar a dar o GRANT não reabre o buraco.
 */
async function rlsRecusa(nome, auth, grant, sql) {
  try {
    await db.exec(`BEGIN; ${grant}; SET LOCAL ROLE authenticated;
                   SET LOCAL request.jwt.claim.sub = '${auth}'; ${sql}; ROLLBACK;`);
    mau(`${nome} — PASSOU, e a RLS devia ter recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    e.message.includes("row-level security")
      ? ok(nome)
      : mau(`${nome} — recusado por outra razão: ${e.message.split("\n")[0]}`);
  }
}

async function rlsDeixa(nome, auth, grant, sql) {
  try {
    await db.exec(`BEGIN; ${grant}; SET LOCAL ROLE authenticated;
                   SET LOCAL request.jwt.claim.sub = '${auth}'; ${sql}; ROLLBACK;`);
    ok(nome);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`${nome} — ${e.message.split("\n")[0]}`);
  }
}

const n = async (auth, sql) => Number((await ver(auth, sql))[0]?.n ?? -1);

/* ── 0. O cenário é o certo ─────────────────────────────────────────────── */
console.log("\n─── o cenário ───────────────────────────");
{
  const p = await um(`SELECT public.has_anew_permission('${AUTH.ana}','operations.settings.manage') AS pode`);
  p.pode
    ? ok("o CRM diz que a Ana tem settings.manage — globalmente, como na vida real")
    : mau("o stub de permissões não reproduz o CRM — o teste seria inconclusivo");
  const f = await ver(AUTH.ana, `SELECT public.ops_funcao_atual('${ORG_A}') AS a, public.ops_funcao_atual('${ORG_B}') AS b`);
  f[0]?.a === "gestor" && f[0]?.b === "tecnico"
    ? ok("ops_funcao_atual: gestora na A, técnica na B")
    : mau(`ops_funcao_atual devolveu ${JSON.stringify(f[0])}`);
  const pode = await ver(AUTH.ana, `
    SELECT public.ops_pode('${ORG_A}','operations.settings.manage') AS a,
           public.ops_pode('${ORG_B}','operations.settings.manage') AS b,
           public.ops_pode('${ORG_B}','operations.orders.create') AS criar_b`);
  pode[0]?.a && !pode[0]?.b && !pode[0]?.criar_b
    ? ok("ops_pode: gere a equipa na A, não na B; e na B não cria ordens (o papel dela lá não tem)")
    : mau(`ops_pode devolveu ${JSON.stringify(pode[0])}`);
}

/* ── S1. Filhos da ordem ────────────────────────────────────────────────── */
console.log("\n─── S1 · equipa, tarefas, sessões, mensagens ──");
await deveSerRecusado("o técnico da A não se mete na equipa de uma ordem da B",
  AUTH.bruno, `INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id) VALUES ('${O.b1}','${U.bruno}');`,
  "permission denied");
await deveSerRecusado("a Ana (técnica na B) não se mete na equipa de uma ordem da B que não é dela",
  AUTH.ana, `INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id) VALUES ('${O.b1}','${U.ana}');`,
  "permission denied");
await deveSerRecusado("nem abre sessões de trabalho à mão",
  AUTH.ana, `INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio) VALUES ('${O.b2}','${U.ana}', now());`,
  "permission denied");
await deveSerRecusado("nem escreve mensagens por fora",
  AUTH.bruno, `INSERT INTO public.ops_mensagem (ordem_id, texto) VALUES ('${O.a1}','ola');`,
  "permission denied");
await rlsRecusa("com o INSERT devolvido, a RLS recusa a ordem da B que ela não vê",
  AUTH.ana, "GRANT INSERT ON public.ops_ordem_pessoa TO authenticated",
  `INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id) VALUES ('${O.b1}','${U.ana}')`);
await rlsDeixa("… e deixa na A, onde ela é gestora (a RLS não é um 'não' cego)",
  AUTH.ana, "GRANT INSERT ON public.ops_ordem_pessoa TO authenticated",
  `INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id) VALUES ('${O.a2}','${U.ana}')`);

/* ── S2. Custos ─────────────────────────────────────────────────────────── */
console.log("\n─── S2 · custos ─────────────────────────");
{
  (await n(AUTH.ana, `SELECT count(*)::int n FROM public.ops_custo WHERE ordem_id='${O.a1}'`)) === 1
    ? ok("a Ana vê os custos da A, onde é gestora") : mau("a Ana não vê os custos da A");
  (await n(AUTH.ana, `SELECT count(*)::int n FROM public.ops_custo WHERE ordem_id IN ('${O.b1}','${O.b2}')`)) === 0
    ? ok("e não vê os da B, onde é técnica") : mau("a Ana vê custos da B");
  (await n(AUTH.carla, `SELECT count(*)::int n FROM public.ops_custo`)) === 1
    ? ok("a Carla vê os da B e só esses") : mau("a Carla vê custos que não são da B");
  (await n(AUTH.bruno, `SELECT count(*)::int n FROM public.ops_custo`)) === 0
    ? ok("o técnico não vê dinheiro") : mau("o técnico vê custos");
  (await n(AUTH.sofia, `SELECT count(*)::int n FROM public.ops_custo`)) === 0
    ? ok("a supervisora também não — mesmo com costs.view no papel do CRM")
    : mau("a supervisora vê custos");
  (await n(AUTH.ana, `SELECT count(*)::int n FROM public.ops_v_ordem_custo WHERE organization_id='${ORG_B}'`)) === 0
    ? ok("ops_v_ordem_custo também não mostra a B à Ana") : mau("a vista de custos fura o isolamento");
}
await deveSerRecusado("escrever custos diretamente deixou de existir",
  AUTH.ana, `INSERT INTO public.ops_custo (ordem_id, tipo, descricao) VALUES ('${O.a1}','material','x');`,
  "permission denied");
await rlsRecusa("com o INSERT devolvido, a RLS recusa custos na B",
  AUTH.ana, "GRANT INSERT ON public.ops_custo TO authenticated",
  `INSERT INTO public.ops_custo (ordem_id, tipo, descricao) VALUES ('${O.b2}','material','x')`);
await deveSerRecusado("rpc_ops_lancar_custo na B recusa a Ana",
  AUTH.ana, `SELECT public.rpc_ops_lancar_custo('${O.b2}','material','Tubo',1,5);`,
  "Sem permissão para mexer em custos");
await deveCorrer("… e aceita-a na A",
  AUTH.ana, `SELECT public.rpc_ops_lancar_custo('${O.a1}','material','Tubo',1,5);`);

/* ── S3. Funções internas ───────────────────────────────────────────────── */
console.log("\n─── S3 · funções internas ───────────────");
{
  const r = await um(`
    SELECT has_function_privilege('authenticated','public.ops_recalcular_custo_mao_obra(uuid)','EXECUTE') AS rec,
           has_function_privilege('authenticated','public.ops_conflitos_de_agenda(uuid,timestamptz,timestamptz,uuid)','EXECUTE') AS conf`);
  !r.rec && !r.conf
    ? ok("ops_recalcular_custo_mao_obra e ops_conflitos_de_agenda fora do alcance de authenticated")
    : mau(`ainda executáveis: ${JSON.stringify(r)}`);
}
await deveSerRecusado("chamar o recálculo de mão de obra à mão é recusado",
  AUTH.bruno, `SELECT public.ops_recalcular_custo_mao_obra('${O.b1}');`, "permission denied");

/* ── S4. Configuração por organização ───────────────────────────────────── */
console.log("\n─── S4 · configuração por organização ───");
{
  const sp = await q(`
    SELECT tablename || '.' || policyname AS p FROM pg_policies
     WHERE schemaname = 'public' AND tablename LIKE 'ops\\_%'
       AND (coalesce(qual,'') LIKE '%has_anew_permission%'
            OR coalesce(with_check,'') LIKE '%has_anew_permission%')`);
  sp.length === 0
    ? ok("nenhuma policy de ops_* usa has_anew_permission sozinha")
    : mau(`policies com a permissão global: ${sp.map((x) => x.p).join(", ")}`);
}
for (const [tabela, sql] of [
  ["ops_skill", `INSERT INTO public.ops_skill (organization_id, nome) VALUES ('${ORG_B}','Canalizador')`],
  ["ops_horario", `INSERT INTO public.ops_horario (organization_id, nome) VALUES ('${ORG_B}','9-18')`],
  ["ops_medicao_def", `INSERT INTO public.ops_medicao_def (organization_id, nome) VALUES ('${ORG_B}','Pressão')`],
  ["ops_medicao_opcao", `INSERT INTO public.ops_medicao_opcao (medicao_def_id, nome) VALUES ('${B_MED}','OK')`],
  ["ops_checklist_tarefa", `INSERT INTO public.ops_checklist_tarefa (checklist_id, nome) VALUES ('${B_CHK}','Outra')`],
  ["ops_checklist_tarefa_medicao", `INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id) VALUES ('${B_CHK_T}','${B_MED}')`],
  ["ops_plano_alvo", `INSERT INTO public.ops_plano_alvo (plano_id, checklist_id, local_id) VALUES ('${B_PLANO}','${B_CHK}', NULL)`],
  ["ops_utilizador_skill", `INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id) VALUES ('${U.ana}','${B_SKILL}')`],
  ["ops_utilizador_cliente", `INSERT INTO public.ops_utilizador_cliente (utilizador_id, cliente_id) VALUES ('${U.ana}','${CLI_B}')`],
]) {
  await deveSerRecusado(`${tabela}: a Ana não escreve na B com os poderes que tem na A`,
    AUTH.ana, `${sql};`, tabela === "ops_plano_alvo" ? "" : "row-level security");
}
await deveCorrer("a Carla (gestora na B) escreve skills na B",
  AUTH.carla, `INSERT INTO public.ops_skill (organization_id, nome) VALUES ('${ORG_B}','Eletricista');`);
(await n(AUTH.bruno, `SELECT count(*)::int n FROM public.ops_skill`)) === 0
  ? ok("quem não tem perfil na B não lê as skills da B") : mau("o Bruno lê configuração da B");
(await n(AUTH.ana, `SELECT count(*)::int n FROM public.ops_skill WHERE organization_id='${ORG_B}'`)) === 2
  ? ok("a Ana, técnica na B, lê-as (ver não é gerir)") : mau("a Ana não lê as skills da B");
await deveSerRecusado("uma leitura de medição não se apaga por fora (o trigger só cobre INSERT/UPDATE)",
  AUTH.bruno, `DELETE FROM public.ops_ordem_tarefa_medicao;`, "permission denied");
await deveSerRecusado("nem a ordem se apaga por fora",
  AUTH.ana, `DELETE FROM public.ops_ordem WHERE id='${O.b1}';`, "permission denied");

/* ── S5. RPCs com a permissão na organização certa ──────────────────────── */
console.log("\n─── S5 · RPCs e âmbito ──────────────────");
await deveSerRecusado("ops_conflitos_de_agenda já não diz onde anda qualquer pessoa",
  AUTH.bruno, `SELECT * FROM public.ops_conflitos_de_agenda('${U.carla}', now(), now() + interval '1 day');`,
  "permission denied");
await deveSerRecusado("a Ana não se promove a admin na B",
  AUTH.ana, `SELECT public.rpc_ops_gravar_perfil('${ORG_B}','${U.ana}','admin');`,
  "Só um administrador ou gestor desta organização");
await deveSerRecusado("na A, gestora não cria admins",
  AUTH.ana, `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.bruno}','admin');`,
  "acima da tua");
await deveSerRecusado("nem mexe no perfil de quem está acima dela",
  AUTH.ana, `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.alice}','tecnico');`,
  "quem está acima de ti");
await deveCorrer("mas promove o Bruno a supervisor — a função nova é aceite",
  AUTH.ana, `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.bruno}','supervisor', 18);`);
await deveCorrer("… e devolve-o a técnico",
  AUTH.ana, `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.bruno}','tecnico', 18);`);
await deveSerRecusado("a supervisora não gere a equipa",
  AUTH.sofia, `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.bruno}','tecnico', 18);`,
  "Só um administrador ou gestor");
await deveSerRecusado("na B a Ana não cria ordens (o papel dela lá não tem orders.create)",
  AUTH.ana, `SELECT public.rpc_ops_criar_ordem('Fuga','${CLI_B}');`, "Sem permissão para criar ordens");
await deveCorrer("na A cria",
  AUTH.ana, `SELECT public.rpc_ops_criar_ordem('Fuga','${CLI_A}');`);
await deveSerRecusado("na B a Ana não distribui trabalho",
  AUTH.ana, `SELECT public.rpc_ops_atribuir_ordem('${O.b1}','${U.ana}');`, "Só quem coordena");
await deveSerRecusado("na B a Ana não grava checklists",
  AUTH.ana, `SELECT public.rpc_ops_gravar_checklist(NULL,'CL','${ORG_B}');`, "Sem permissão para gerir checklists");
await deveSerRecusado("o Bruno não anexa a uma ordem em que não está",
  AUTH.bruno, `SELECT public.rpc_ops_registar_anexo('${O.a2}','${ORG_A}/${O.a2}/f.jpg','f.jpg');`,
  "Só quem está na ordem");
// Uma ordem sem responsável: `responsavel_id = eu` dava NULL, `NOT NULL` não
// recusava, e um técnico de fora iniciava-a.
await deveSerRecusado("nem inicia uma ordem sem responsável em que não está",
  AUTH.bruno, `SELECT public.rpc_ops_transitar_ordem('${O.a2}','iniciar',NULL,NULL);`,
  "Só quem está na ordem a pode iniciar");
{
  const r = await ver(AUTH.ana, `SELECT public.ops_pode_ver_ordem('${AUTH.bruno}','${O.a1}') AS v`);
  r[0]?.v === false
    ? ok("ops_pode_ver_ordem não serve para perguntar pelo Bruno") : mau("ops_pode_ver_ordem sonda terceiros");
  const s = await ver(AUTH.bruno, `SELECT public.ops_pode_ver_ordem('${AUTH.bruno}','${O.a1}') AS v`);
  s[0]?.v === true ? ok("… e responde ao próprio") : mau("ops_pode_ver_ordem deixou de responder ao próprio");
  (await n(AUTH.ana, `SELECT count(*)::int n FROM public.ops_clientes_no_ambito('${AUTH.bruno}')`)) === 0
    ? ok("ops_clientes_no_ambito também não") : mau("ops_clientes_no_ambito sonda terceiros");
  (await n(AUTH.bruno, `SELECT count(*)::int n FROM public.ops_clientes_no_ambito('${AUTH.bruno}')`)) === 1
    ? ok("… e responde ao próprio") : mau("ops_clientes_no_ambito deixou de responder ao próprio");
}

/* ── S6. Colunas da ordem e da tarefa ───────────────────────────────────── */
console.log("\n─── S6 · colunas fora da máquina de estados ──");
await deveSerRecusado("o técnico não troca o responsável da ordem por UPDATE",
  AUTH.bruno, `UPDATE public.ops_ordem SET responsavel_id='${U.ana}' WHERE id='${O.a1}';`, "permission denied");
await deveSerRecusado("nem a organização",
  AUTH.bruno, `UPDATE public.ops_ordem SET organization_id='${ORG_B}' WHERE id='${O.a1}';`, "permission denied");
await deveSerRecusado("nem o cliente",
  AUTH.bruno, `UPDATE public.ops_ordem SET cliente_id='${CLI_B}' WHERE id='${O.a1}';`, "permission denied");
await deveSerRecusado("nem torna opcional uma tarefa obrigatória",
  AUTH.bruno, `UPDATE public.ops_ordem_tarefa SET obrigatoria=false WHERE id='${TAREFA_A1}';`, "permission denied");

/* ── S7. Orçamento de outra organização ─────────────────────────────────── */
console.log("\n─── S7 · orçamento → obra ───────────────");
await deveCorrer("a Carla põe o orçamento da B a andar",
  AUTH.carla, `SELECT public.rpc_ops_obra_de_orcamento('${QUOTE_B}');`);
await deveSerRecusado("o Bruno (só na A) não fica a saber que a obra existe, nem o código",
  AUTH.bruno, `SELECT public.rpc_ops_obra_de_orcamento('${QUOTE_B}');`,
  "Sem acesso a esta organização", "já tem obra");
await deveSerRecusado("a Ana (técnica na B, sem criar) também não",
  AUTH.ana, `SELECT public.rpc_ops_obra_de_orcamento('${QUOTE_B}');`,
  "Sem permissão para criar ordens", "já tem obra");

/* ── Histórico ──────────────────────────────────────────────────────────── */
console.log("\n─── histórico ───────────────────────────");
await deveSerRecusado("ninguém escreve no histórico por fora",
  AUTH.bruno, `INSERT INTO public.ops_evento (organization_id, entidade, entidade_id, tipo, autor_id)
               VALUES ('${ORG_A}','ordem','${O.a1}','confirmar','${U.alice}');`, "permission denied");
await rlsRecusa("com o INSERT devolvido, ninguém assina em nome de outro",
  AUTH.bruno, "GRANT INSERT ON public.ops_evento TO authenticated",
  `INSERT INTO public.ops_evento (organization_id, entidade, entidade_id, tipo, autor_id)
   VALUES ('${ORG_A}','ordem','${O.a1}','confirmar','${U.alice}')`);
await rlsDeixa("… só em nome próprio",
  AUTH.bruno, "GRANT INSERT ON public.ops_evento TO authenticated",
  `INSERT INTO public.ops_evento (organization_id, entidade, entidade_id, tipo, autor_id)
   VALUES ('${ORG_A}','ordem','${O.a1}','nota','${U.bruno}')`);
(await n(AUTH.bruno, `SELECT count(*)::int n FROM public.ops_evento WHERE organization_id='${ORG_B}'`)) === 0
  ? ok("o histórico da B não se lê da A") : mau("o histórico fura o isolamento");

/* ── Supervisor ─────────────────────────────────────────────────────────── */
console.log("\n─── supervisor ──────────────────────────");
(await n(AUTH.sofia, `SELECT count(*)::int n FROM public.ops_ordem WHERE codigo IN ('OT-A1','OT-A2')`)) === 2
  ? ok("a supervisora vê as ordens da A em que não está (sem view_all no papel)")
  : mau("a supervisora não vê o âmbito todo");
(await n(AUTH.sofia, `SELECT count(*)::int n FROM public.ops_ordem WHERE organization_id='${ORG_B}'`)) === 0
  ? ok("… e nada da B") : mau("a supervisora vê ordens da B");
(await n(AUTH.bruno, `SELECT count(*)::int n FROM public.ops_ordem WHERE codigo IN ('OT-A1','OT-A2')`)) === 1
  ? ok("o técnico continua a ver só as suas") : mau("o técnico vê ordens que não são dele");

const transitar = (id, t, motivo = null) =>
  `SELECT public.rpc_ops_transitar_ordem('${id}','${t}',${motivo ? `'${motivo}'` : "NULL"},NULL);`;
await deveCorrer("o Bruno inicia a A1", AUTH.bruno, transitar(O.a1, "iniciar"));
await deveCorrer("responde à tarefa", AUTH.bruno,
  `SELECT public.rpc_ops_responder_tarefa('${TAREFA_A1}','feita');`);
await deveCorrer("e fecha", AUTH.bruno, transitar(O.a1, "fechar"));
await deveSerRecusado("o técnico não confirma o próprio trabalho", AUTH.bruno,
  transitar(O.a1, "confirmar"), "Sem permissão para confirmar");
await deveCorrer("a supervisora confirma", AUTH.sofia, transitar(O.a1, "confirmar"));
await deveSerRecusado("mas não aprova (isso é de quem gere a fila)", AUTH.sofia,
  `SELECT public.rpc_ops_criar_ordem('Teste','${CLI_A}');`, "Sem permissão para criar ordens");
await deveSerRecusado("nem lança custos", AUTH.sofia,
  `SELECT public.rpc_ops_lancar_custo('${O.a2}','material','x',1,1);`, "Sem permissão para mexer em custos");

/* ── Veredicto ──────────────────────────────────────────────────────────── */
console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam (${passaram} passaram)`);
  process.exit(1);
}
console.log(`✓ ${passaram} verificações: cada organização só vê e só mexe no que é seu`);

/**
 * Prova que criar, atribuir e agendar fazem o que dizem — e recusam o resto.
 *
 * O que interessa aqui:
 *   · o código sai de um sítio só, e nunca se repete;
 *   · quem cria decide se a ordem entra na fila ou fica por aprovar;
 *   · não se cria uma ordem apontada a um local de outro cliente;
 *   · atribuir é dar acesso: quem entra passa a poder executar;
 *   · marcar alguém que já está noutro sítio AVISA, e deixa marcar.
 *
 *     npm run validar-despacho
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
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG2 = "11111111-1111-1111-1111-111111111112";
const CLI = "22222222-2222-2222-2222-222222222222";
const CLI2 = "22222222-2222-2222-2222-222222222223";
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const OUTRO = "cccc0000-0000-0000-0000-00000000000c";
const INATIVO = "eeee0000-0000-0000-0000-00000000000e";
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
  outro: "cccc1111-0000-0000-0000-00000000000c",
};

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  -- get_user_visible_org_ids A SÉRIO: só as organizações onde a pessoa tem
  -- membership ativa. O stub devolve TODAS, e com ele o teste do isolamento
  -- entre organizações passava pela razão errada — era barrado mais à frente,
  -- por não ter função em Operações, e não por não ver a organização.
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
     WHERE au.auth_user_id = _auth_uid $fn$;

  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org'), ('${ORG2}','Outra org');
  INSERT INTO public.anew_entities (id, display_name) VALUES
    ('77777777-7777-7777-7777-777777777777','Cliente'),
    ('77777777-7777-7777-7777-777777777778','Cliente de outra org');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES
    ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777'),
    ('${CLI2}','${ORG2}','77777777-7777-7777-7777-777777777778');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${TECNICO}','${AUTH.tecnico}','Tecnico','t@x.pt'),
    ('${OUTRO}','${AUTH.outro}','Outro tecnico','o@x.pt'),
    ('${INATIVO}',NULL,'Ex-colaborador','e@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),
    ('${AUTH.tecnico}','t@x.pt',now()),
    ('${AUTH.outro}','o@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'),('${AUTH.tecnico}','${TECNICO}'),('${AUTH.outro}','${OUTRO}');
`);

for (const f of ["schema.sql","permissoes.sql","rpcs.sql","rpcs-tarefas.sql",
                 "planos.sql","correcoes-modelo.sql","medicoes.sql","despacho.sql"]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name)
    VALUES ('dddd0000-0000-0000-0000-00000000000d','${ORG}','Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${OUTRO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, ativo) VALUES
    ('${ORG}','${GESTOR}','gestor',  true),
    ('${ORG}','${TECNICO}','tecnico',true),
    ('${ORG}','${OUTRO}','tecnico',  true),
    ('${ORG}','${INATIVO}','tecnico',false);

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

async function como(authUid, sql) {
  await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
}

/**
 * Corre e devolve o jsonb que a RPC respondeu.
 *
 * `exec` e não `query`: precisamos de várias instruções na mesma transação
 * (BEGIN, SET LOCAL ROLE, a chamada), e `query` só aceita uma.
 */
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

async function deveCorrer(nome, authUid, sql) {
  try { await como(authUid, sql); ok(nome); }
  catch (e) { await db.exec("ROLLBACK").catch(() => {}); mau(`${nome} — ${e.message.split("\n")[0]}`); }
}

async function deveSerRecusado(nome, authUid, sql, trecho) {
  try {
    await como(authUid, sql);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

const criar = (args) => {
  const p = {
    p_titulo: "'Portao nao abre'",
    p_cliente_id: `'${CLI}'`,
    ...args,
  };
  return `SELECT public.rpc_ops_criar_ordem(${Object.entries(p)
    .map(([k, v]) => `${k} => ${v}`)
    .join(", ")});`;
};

/* ── Criar ──────────────────────────────────────────────────────────────── */
console.log("\n─── criar uma ordem ─────────────────────");

{
  const r = await chamar(AUTH.gestor, criar({}));
  r?.ok ? ok(`o gestor criou a ${r.codigo}`) : mau(`não criou: ${JSON.stringify(r)}`);
  r?.estado === "agendada"
    ? ok("quem coordena cria já na fila, em 'agendada'")
    : mau(`estado ${r?.estado}, esperava agendada`);

  const o = await um(`SELECT criada_por, origem, prioridade FROM public.ops_ordem WHERE codigo='${r.codigo}'`);
  o.criada_por === GESTOR ? ok("ficou registado quem a criou") : mau(`criada_por=${o.criada_por}`);
  o.origem === "corretiva" && o.prioridade === "normal"
    ? ok("corretiva e normal por omissão — o caso do telefone a tocar")
    : mau(`origem=${o.origem} prioridade=${o.prioridade}`);
}

{
  const r = await chamar(AUTH.tecnico, criar({ p_titulo: "'Gerador nao arranca'" }));
  r?.estado === "por_aprovar"
    ? ok("um técnico reporta, e a ordem fica por aprovar")
    : mau(`estado ${r?.estado}, esperava por_aprovar`);
}

{
  // Dois códigos seguidos não podem colidir — é a razão de o código sair de
  // uma função e não de um count(*) no browser.
  const a = await chamar(AUTH.gestor, criar({ p_titulo: "'Um'" }));
  const b = await chamar(AUTH.gestor, criar({ p_titulo: "'Dois'" }));
  a.codigo !== b.codigo ? ok(`códigos diferentes: ${a.codigo} e ${b.codigo}`)
                        : mau(`o mesmo código duas vezes: ${a.codigo}`);
}

await deveSerRecusado(
  "uma ordem sem título é recusada",
  AUTH.gestor,
  criar({ p_titulo: "'   '" }),
  "precisa de um título"
);

await deveSerRecusado(
  "uma prioridade inventada é recusada",
  AUTH.gestor,
  criar({ p_prioridade: "'urgentissima'" }),
  "Prioridade inválida"
);

await deveSerRecusado(
  "não se cria uma ordem num cliente de outra organização",
  AUTH.gestor,
  criar({ p_cliente_id: `'${CLI2}'` }),
  "Sem acesso a esta organização"
);

/* ── Local, ativo e checklist ───────────────────────────────────────────── */
console.log("\n─── o sítio e o que lá há a fazer ───────");

const LOC = "11ee0000-0000-0000-0000-0000000000ee";
const LOC2 = "11ee0000-0000-0000-0000-0000000000ef";
const CAT = "eeee0000-0000-0000-0000-0000000000e1";
const ATIVO = "aaee0000-0000-0000-0000-0000000000ea";
const CHK = "c1c1c1c1-0000-0000-0000-0000000000c1";

await db.exec(`
  INSERT INTO public.ops_local (id, organization_id, cliente_id, codigo, nome, tipo) VALUES
    ('${LOC}','${ORG}','${CLI}','L1','Garagem','espaco'),
    ('${LOC2}','${ORG2}','${CLI2}','L2','Garagem de outra org','espaco');
  INSERT INTO public.ops_categoria_ativo (id, organization_id, codigo, nome)
    VALUES ('${CAT}','${ORG}','CAT-EXT','Extintor');
  INSERT INTO public.ops_ativo (id, organization_id, local_id, categoria_id, codigo, nome)
    VALUES ('${ATIVO}','${ORG}','${LOC}','${CAT}','AT-1','Extintor A1');

  INSERT INTO public.ops_medicao_def (id, organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES ('11110000-0000-0000-0000-000000000001','${ORG}','${CAT}','Pressao','gama','bar',10,15);

  INSERT INTO public.ops_checklist (id, organization_id, codigo, nome, estado, versao)
    VALUES ('${CHK}','${ORG}','CL-0001','Extintor trimestral','publicada', 3);
  INSERT INTO public.ops_checklist_tarefa (id, checklist_id, posicao, nome, tipo) VALUES
    ('33330000-0000-0000-0000-000000000001','${CHK}',0,'Verificacao','inspecao'),
    ('33330000-0000-0000-0000-000000000002','${CHK}',1,'Limpeza','limpeza');
  INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id, posicao)
    VALUES ('33330000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001',0);
`);

await deveSerRecusado(
  "não se aponta uma ordem a um local de outra organização",
  AUTH.gestor,
  criar({ p_local_id: `'${LOC2}'` }),
  "não é desta organização"
);

{
  const r = await chamar(AUTH.gestor, criar({ p_titulo: "'So o ativo'", p_ativo_id: `'${ATIVO}'` }));
  const o = await um(`SELECT local_id FROM public.ops_ordem WHERE codigo='${r.codigo}'`);
  o.local_id === LOC
    ? ok("sem local indicado, herda o do ativo — o técnico tem de saber onde é")
    : mau(`local_id=${o.local_id}`);
}

{
  const r = await chamar(AUTH.gestor, criar({
    p_titulo: "'Com checklist'",
    p_ativo_id: `'${ATIVO}'`,
    p_checklist_id: `'${CHK}'`,
  }));
  r.tarefas === 2 ? ok("as 2 tarefas da checklist vieram com a ordem")
                  : mau(`veio(ram) ${r.tarefas} tarefa(s)`);

  const v = await um(`
    SELECT a.checklist_versao FROM public.ops_ordem_alvo a
      JOIN public.ops_ordem o ON o.id = a.ordem_id WHERE o.codigo='${r.codigo}'`);
  v.checklist_versao === 3
    ? ok("a versão da checklist ficou congelada em 3")
    : mau(`checklist_versao=${v.checklist_versao}`);

  const m = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
      JOIN public.ops_ordem o ON o.id = t.ordem_id WHERE o.codigo='${r.codigo}'`);
  m.n === 1
    ? ok("e a medição também, por responder")
    : mau(`esperava 1 medição semeada, encontrei ${m.n}`);
}

await db.exec(`UPDATE public.ops_checklist SET estado='rascunho' WHERE id='${CHK}';`);
await deveSerRecusado(
  "uma checklist por publicar não se usa numa ordem",
  AUTH.gestor,
  criar({ p_checklist_id: `'${CHK}'` }),
  "não está publicada"
);
await db.exec(`UPDATE public.ops_checklist SET estado='publicada' WHERE id='${CHK}';`);

/* ── Atribuir ───────────────────────────────────────────────────────────── */
console.log("\n─── atribuir ────────────────────────────");

const ORDEM = await chamar(AUTH.gestor, criar({ p_titulo: "'Para atribuir'" }));
const ID = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${ORDEM.codigo}'`)).id;

const atribuir = (resp, equipa) =>
  `SELECT public.rpc_ops_atribuir_ordem('${ID}', ${resp ? `'${resp}'` : "NULL"}, ` +
  `${equipa ? `ARRAY[${equipa.map((u) => `'${u}'::uuid`).join(",")}]` : "NULL"});`;

await deveSerRecusado(
  "um técnico não distribui trabalho",
  AUTH.tecnico,
  atribuir(TECNICO, null),
  "Só quem coordena"
);

await deveSerRecusado(
  "não se atribui a quem já não está ativo em Operações",
  AUTH.gestor,
  atribuir(INATIVO, null),
  "Ex-colaborador não está ativo"
);

await deveCorrer("o gestor atribui ao técnico", AUTH.gestor, atribuir(TECNICO, null));
{
  const o = await um(`SELECT responsavel_id FROM public.ops_ordem WHERE id='${ID}'`);
  o.responsavel_id === TECNICO ? ok("ficou responsável") : mau(`responsavel_id=${o.responsavel_id}`);

  const p = await um(`
    SELECT papel FROM public.ops_ordem_pessoa WHERE ordem_id='${ID}' AND utilizador_id='${TECNICO}'`);
  p?.papel === "responsavel"
    ? ok("e entrou na equipa como responsável, sem ser preciso dizê-lo")
    : mau(`papel=${p?.papel}`);
}

await deveCorrer("juntar o segundo técnico", AUTH.gestor, atribuir(TECNICO, [TECNICO, OUTRO]));
{
  const n = await um(`SELECT count(*)::int AS n FROM public.ops_ordem_pessoa WHERE ordem_id='${ID}'`);
  n.n === 2 ? ok("dois na ordem") : mau(`${n.n} na ordem`);
}

await deveCorrer("passar a responsabilidade ao outro", AUTH.gestor, atribuir(OUTRO, [OUTRO]));
{
  const n = await um(`SELECT count(*)::int AS n FROM public.ops_ordem_pessoa WHERE ordem_id='${ID}'`);
  n.n === 1 ? ok("a equipa foi substituída, não acrescentada")
            : mau(`ficaram ${n.n} pessoas`);
  const p = await um(`
    SELECT papel FROM public.ops_ordem_pessoa WHERE ordem_id='${ID}' AND utilizador_id='${OUTRO}'`);
  p?.papel === "responsavel" ? ok("e o papel mudou com ela") : mau(`papel=${p?.papel}`);
}

// Atribuir é dar acesso: é isto que faz a diferença entre ver e poder fazer.
console.log("\n─── atribuir é dar acesso ───────────────");
await deveCorrer(
  "quem está na ordem consegue iniciá-la",
  AUTH.outro,
  `SELECT public.rpc_ops_transitar_ordem('${ID}','iniciar',NULL,NULL);`
);
{
  const e = await um(`SELECT estado FROM public.ops_ordem WHERE id='${ID}'`);
  e.estado === "em_curso" ? ok("a ordem está em curso") : mau(`ficou em ${e.estado}`);
}

/* ── Agendar ────────────────────────────────────────────────────────────── */
console.log("\n─── agendar ─────────────────────────────");

const agendar = (id, quando, ini = null, fim = null) =>
  `SELECT public.rpc_ops_agendar_ordem('${id}','${quando}'::timestamptz,` +
  `${ini ? `'${ini}'::timestamptz` : "NULL"},${fim ? `'${fim}'::timestamptz` : "NULL"});`;

const A = await chamar(AUTH.gestor, criar({ p_titulo: "'Visita da manha'" }));
const IDA = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${A.codigo}'`)).id;
await como(AUTH.gestor, `SELECT public.rpc_ops_atribuir_ordem('${IDA}','${TECNICO}',NULL);`);

await deveSerRecusado(
  "um técnico não marca datas",
  AUTH.tecnico,
  agendar(IDA, "2026-09-10 09:00+01"),
  "Só quem coordena"
);

await deveSerRecusado(
  "uma janela que acaba antes de começar é recusada",
  AUTH.gestor,
  agendar(IDA, "2026-09-10 09:00+01", "2026-09-10 11:00+01", "2026-09-10 10:00+01"),
  "acaba antes de começar"
);

{
  const r = await chamar(AUTH.gestor,
    agendar(IDA, "2026-09-10 09:00+01", "2026-09-10 09:00+01", "2026-09-10 11:00+01"));
  r?.ok ? ok("marcada para 10/09 das 9h às 11h") : mau(`não marcou: ${JSON.stringify(r)}`);
  r.conflitos.length === 0 ? ok("sem conflitos, porque não há mais nada nesse dia")
                           : mau(`inventou ${r.conflitos.length} conflito(s)`);
}

// Segunda visita ao mesmo técnico, sobreposta à primeira.
const B = await chamar(AUTH.gestor, criar({ p_titulo: "'Visita sobreposta'" }));
const IDB = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${B.codigo}'`)).id;
await como(AUTH.gestor, `SELECT public.rpc_ops_atribuir_ordem('${IDB}','${TECNICO}',NULL);`);

{
  const r = await chamar(AUTH.gestor,
    agendar(IDB, "2026-09-10 10:00+01", "2026-09-10 10:00+01", "2026-09-10 12:00+01"));
  r.conflitos.length === 1
    ? ok(`avisou do choque com a ${r.conflitos[0].codigo}`)
    : mau(`esperava 1 conflito, veio(ram) ${r.conflitos.length}`);
  r.conflitos[0]?.titulo === "Visita da manha"
    ? ok("e diz qual é a outra ordem, não só que há uma")
    : mau(`conflito sem título útil: ${JSON.stringify(r.conflitos[0])}`);

  const o = await um(`SELECT agendada_para FROM public.ops_ordem WHERE id='${IDB}'`);
  o.agendada_para !== null
    ? ok("mas marcou na mesma — avisar não é impedir")
    : mau("recusou a marcação, e devia ter avisado apenas");
}

{
  // Encostadas, não sobrepostas: 11h–12h a seguir a 9h–11h não é choque.
  const C = await chamar(AUTH.gestor, criar({ p_titulo: "'Logo a seguir'" }));
  const IDC = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${C.codigo}'`)).id;
  await como(AUTH.gestor, `SELECT public.rpc_ops_atribuir_ordem('${IDC}','${OUTRO}',NULL);`);
  const r = await chamar(AUTH.gestor,
    agendar(IDC, "2026-09-10 11:00+01", "2026-09-10 11:00+01", "2026-09-10 12:00+01"));
  r.conflitos.length === 0
    ? ok("uma visita a seguir à outra não é choque — é o dia normal de alguém")
    : mau(`inventou ${r.conflitos.length} conflito(s) em horários encostados`);
}

{
  // Uma ordem cancelada não ocupa a agenda de ninguém.
  await db.exec(`
    SELECT set_config('ops.transicao','autorizada',false);
    UPDATE public.ops_ordem SET estado='cancelada' WHERE id='${IDA}';
    SELECT set_config('ops.transicao','',false);
  `);
  const D = await chamar(AUTH.gestor, criar({ p_titulo: "'Depois do cancelamento'" }));
  const IDD = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${D.codigo}'`)).id;
  await como(AUTH.gestor, `SELECT public.rpc_ops_atribuir_ordem('${IDD}','${TECNICO}',NULL);`);
  const r = await chamar(AUTH.gestor,
    agendar(IDD, "2026-09-10 09:30+01", "2026-09-10 09:30+01", "2026-09-10 10:30+01"));
  r.conflitos.every((c) => c.codigo !== A.codigo)
    ? ok("uma ordem cancelada deixou de ocupar a agenda")
    : mau("continua a contar uma ordem cancelada como conflito");
}

await deveSerRecusado(
  "não se agenda uma ordem cancelada",
  AUTH.gestor,
  agendar(IDA, "2026-09-11 09:00+01"),
  "o trabalho já acabou"
);

/* ── O registo ──────────────────────────────────────────────────────────── */
console.log("\n─── fica escrito quem fez o quê ─────────");
{
  const e = await q(`
    SELECT tipo, count(*)::int AS n FROM public.ops_evento
     WHERE tipo IN ('criada','atribuida','agendada') GROUP BY tipo ORDER BY tipo`);
  const m = Object.fromEntries(e.map((x) => [x.tipo, x.n]));
  m.criada >= 10 ? ok(`${m.criada} criações registadas`) : mau(`só ${m.criada} criações`);
  m.atribuida >= 3 ? ok(`${m.atribuida} atribuições registadas`) : mau(`só ${m.atribuida} atribuições`);
  m.agendada >= 4 ? ok(`${m.agendada} agendamentos registados`) : mau(`só ${m.agendada} agendamentos`);

  const sem = await um(`
    SELECT count(*)::int AS n FROM public.ops_evento
     WHERE tipo IN ('criada','atribuida','agendada') AND autor_id IS NULL`);
  sem.n === 0 ? ok("nenhum sem autor") : mau(`${sem.n} eventos sem autor`);
}

/* ── Nada saiu de ops_* ─────────────────────────────────────────────────── */
console.log("\n─── continua contido ao módulo ──────────");
{
  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0
    ? ok("zero chaves estrangeiras de ops_* para fora")
    : mau(`${fk.n} chave(s) estrangeira(s) para tabelas do CRM`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ já se cria, atribui e agenda — e o que não se pode é recusado por escrito");

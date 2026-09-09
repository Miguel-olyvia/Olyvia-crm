/**
 * Prova que uma foto fica onde deve, e só lá chega quem pode.
 *
 * O que interessa aqui:
 *   · um anexo com caminho de OUTRA ordem é recusado — é a fuga que esta
 *     RPC existe para tapar;
 *   · `authenticated` não escreve na tabela; só as RPCs escrevem;
 *   · quem carregou apaga o seu, e um técnico não apaga o dos outros;
 *   · o ficheiro sai com a ordem quando a ordem é apagada.
 *
 *     npm run validar-anexos
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
const CLI = "22222222-2222-2222-2222-222222222222";
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const OUTRO = "cccc0000-0000-0000-0000-00000000000c";
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

  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${TECNICO}','${AUTH.tecnico}','Tecnico','t@x.pt'),
    ('${OUTRO}','${AUTH.outro}','Outro tecnico','o@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),('${AUTH.tecnico}','t@x.pt',now()),
    ('${AUTH.outro}','o@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'),('${AUTH.tecnico}','${TECNICO}'),('${AUTH.outro}','${OUTRO}');
`);

for (const f of ["schema.sql","permissoes.sql","rpcs.sql","rpcs-tarefas.sql","planos.sql",
                 "correcoes-modelo.sql","medicoes.sql","despacho.sql","orcamentos.sql",
                 "anexos.sql"]) {
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

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${GESTOR}','gestor'),
    ('${ORG}','${TECNICO}','tecnico'),
    ('${ORG}','${OUTRO}','tecnico');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;

  -- O ficheiro anexos.sql revoga; a linha acima concede a tudo. Repor, senão
  -- o teste da fechadura mede a coisa errada.
  REVOKE INSERT, UPDATE, DELETE ON public.ops_anexo FROM authenticated;
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

/* ── Duas ordens, para haver onde errar ─────────────────────────────────── */
const A = await chamar(AUTH.gestor,
  `SELECT public.rpc_ops_criar_ordem(p_titulo => 'Ordem A', p_cliente_id => '${CLI}');`);
const B = await chamar(AUTH.gestor,
  `SELECT public.rpc_ops_criar_ordem(p_titulo => 'Ordem B', p_cliente_id => '${CLI}');`);

const IDA = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${A.codigo}'`)).id;
const IDB = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='${B.codigo}'`)).id;

const caminhoA = `${ORG}/${IDA}/foto-1.jpg`;
const caminhoB = `${ORG}/${IDB}/foto-1.jpg`;

const registar = (ordem, caminho, extra = "") =>
  `SELECT public.rpc_ops_registar_anexo('${ordem}','${caminho}','foto-1.jpg'${extra});`;

/* ── O caminho tem de bater certo ───────────────────────────────────────── */
console.log("\n─── o ficheiro fica onde deve ───────────");

await deveSerRecusado(
  "um caminho da ordem B registado na ordem A é recusado",
  AUTH.gestor,
  registar(IDA, caminhoB),
  "não pertence a esta ordem"
);

await deveSerRecusado(
  "um caminho de outra organização é recusado",
  AUTH.gestor,
  registar(IDA, `99999999-9999-9999-9999-999999999999/${IDA}/foto.jpg`),
  "não pertence a esta ordem"
);

await deveSerRecusado(
  "um caminho a fingir, com a pasta certa no meio, é recusado",
  AUTH.gestor,
  registar(IDA, `outra-coisa/${ORG}/${IDA}/foto.jpg`),
  "não pertence a esta ordem"
);

await deveCorrer("o caminho certo passa", AUTH.gestor, registar(IDA, caminhoA));
{
  const a = await um(`SELECT nome, carregado_por, privado FROM public.ops_anexo WHERE caminho='${caminhoA}'`);
  a.carregado_por === GESTOR ? ok("ficou registado quem o pôs lá") : mau(`carregado_por=${a.carregado_por}`);
  a.privado === false ? ok("público por omissão — vai no relatório") : mau("nasceu privado");
}

await deveSerRecusado(
  "o mesmo caminho duas vezes é recusado pela base",
  AUTH.gestor,
  registar(IDA, caminhoA),
  "duplicate key"
);

/* ── A fechadura ────────────────────────────────────────────────────────── */
console.log("\n─── só as RPCs escrevem ─────────────────");

await deveSerRecusado(
  "um INSERT direto na tabela é recusado",
  AUTH.gestor,
  `INSERT INTO public.ops_anexo (organization_id, ordem_id, caminho, nome)
     VALUES ('${ORG}','${IDA}','${ORG}/${IDA}/pirata.jpg','pirata.jpg');`,
  "permission denied"
);

await deveSerRecusado(
  "e um DELETE direto também",
  AUTH.gestor,
  `DELETE FROM public.ops_anexo WHERE caminho='${caminhoA}';`,
  "permission denied"
);

/* ── Tarefas ────────────────────────────────────────────────────────────── */
console.log("\n─── a foto da tarefa certa ──────────────");
{
  await db.exec(`
    SELECT set_config('ops.tarefa','autorizada',false);
    INSERT INTO public.ops_ordem_tarefa (ordem_id, posicao, nome, tipo)
      VALUES ('${IDA}', 0, 'Verificar quadro', 'inspecao'),
             ('${IDB}', 0, 'Outra coisa', 'inspecao');
    SELECT set_config('ops.tarefa','',false);
  `);
  const tA = (await um(`SELECT id FROM public.ops_ordem_tarefa WHERE ordem_id='${IDA}'`)).id;
  const tB = (await um(`SELECT id FROM public.ops_ordem_tarefa WHERE ordem_id='${IDB}'`)).id;

  await deveSerRecusado(
    "uma tarefa de outra ordem é recusada",
    AUTH.gestor,
    registar(IDA, `${ORG}/${IDA}/foto-2.jpg`, `, '${tB}'`),
    "não é desta ordem"
  );

  await deveCorrer(
    "a tarefa da própria ordem passa",
    AUTH.gestor,
    registar(IDA, `${ORG}/${IDA}/foto-2.jpg`, `, '${tA}'`)
  );

  const n = await um(`
    SELECT count(*)::int AS n FROM public.ops_anexo WHERE ordem_tarefa_id='${tA}'`);
  n.n === 1 ? ok("a foto ficou colada à tarefa que a apanhou") : mau(`${n.n} anexos na tarefa`);
}

/* ── Quem apaga ─────────────────────────────────────────────────────────── */
console.log("\n─── quem apaga o quê ────────────────────");
{
  const r = await chamar(AUTH.tecnico,
    registar(IDA, `${ORG}/${IDA}/do-tecnico.jpg`));
  const ID_TEC = r.id;

  await deveSerRecusado(
    "um técnico não apaga a foto de outro",
    AUTH.outro,
    `SELECT public.rpc_ops_remover_anexo('${ID_TEC}');`,
    "Só quem carregou"
  );

  const rem = await chamar(AUTH.tecnico, `SELECT public.rpc_ops_remover_anexo('${ID_TEC}');`);
  rem?.caminho === `${ORG}/${IDA}/do-tecnico.jpg`
    ? ok("quem a carregou apaga a sua, e a RPC devolve o caminho para o storage")
    : mau(`devolveu ${JSON.stringify(rem)}`);

  const r2 = await chamar(AUTH.tecnico, registar(IDA, `${ORG}/${IDA}/outra.jpg`));
  await deveCorrer(
    "e quem coordena apaga qualquer uma",
    AUTH.gestor,
    `SELECT public.rpc_ops_remover_anexo('${r2.id}');`
  );
}

/* ── Ordens encerradas ──────────────────────────────────────────────────── */
console.log("\n─── uma ordem encerrada não recebe mais ─");
{
  await db.exec(`
    SELECT set_config('ops.transicao','autorizada',false);
    UPDATE public.ops_ordem SET estado='cancelada' WHERE id='${IDB}';
    SELECT set_config('ops.transicao','',false);
  `);
  await deveSerRecusado(
    "não se anexa a uma ordem cancelada",
    AUTH.gestor,
    registar(IDB, caminhoB),
    "processo está encerrado"
  );
}

/* ── O ficheiro sai com a ordem ─────────────────────────────────────────── */
console.log("\n─── apagar a ordem leva os anexos ───────");
{
  const antes = (await um(`SELECT count(*)::int AS n FROM public.ops_anexo WHERE ordem_id='${IDA}'`)).n;
  antes >= 2 ? ok(`${antes} anexos na ordem A`) : mau(`só ${antes} anexo(s)`);

  await db.exec(`DELETE FROM public.ops_ordem WHERE id='${IDA}';`);
  const depois = (await um(`SELECT count(*)::int AS n FROM public.ops_anexo WHERE ordem_id='${IDA}'`)).n;
  depois === 0
    ? ok("apagar a ordem levou os registos por CASCADE")
    : mau(`ficaram ${depois} anexos órfãos`);
}

/* ── Contido ao módulo ──────────────────────────────────────────────────── */
console.log("\n─── continua contido ────────────────────");
{
  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype='f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0 ? ok("zero chaves estrangeiras para fora") : mau(`${fk.n} para fora`);

  const p = await um(`
    SELECT count(*)::int AS n FROM public.anew_permissions WHERE category='operations'`);
  p.n === 15 ? ok("as 15 permissões continuam as mesmas — nenhuma foi acrescentada")
             : mau(`${p.n} permissões, esperava 15`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ uma foto fica onde deve, e só lá chega quem pode");

/**
 * A conversa dentro da ordem.
 *
 * O que aqui se prova: que ela existe (a tabela estava trancada), que não se
 * reescreve, e que não deixa escrever ao cliente por um canal que ninguém lhe
 * mostra.
 *
 *     npm run validar-mensagens
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
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const todos = async (sql, p = []) => (await db.query(sql, p)).rows;

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };
const conferir = (c, m) => (c ? ok(m) : mau(m));

const ORG = "11111111-1111-1111-1111-111111111111";
const ENT = "77777777-7777-7777-7777-777777777777";
const CLI = "22222222-2222-2222-2222-222222222222";
const CHEFE = "33333333-3333-3333-3333-333333333333";
const A_CHEFE = "44444444-4444-4444-4444-444444444444";
const TECNICO = "55555555-5555-5555-5555-555555555555";
const A_TECNICO = "66666666-6666-6666-6666-666666666666";

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('${ENT}', 'Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '${ENT}');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${CHEFE}', '${A_CHEFE}', 'Rita', 'rita@x.pt'),
    ('${TECNICO}', '${A_TECNICO}', 'Tino', 'tino@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${A_CHEFE}','rita@x.pt',now()), ('${A_TECNICO}','tino@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${A_CHEFE}','${CHEFE}'), ('${A_TECNICO}','${TECNICO}');
`);

for (const f of ["schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql"]) {
  await db.exec(ler(f));
}
await db.exec(ler("mensagens.sql"));
// Um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("mensagens.sql"));

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}', '${CHEFE}', 'gestor'), ('${ORG}', '${TECNICO}', 'tecnico');
`);

const ordem = (await um(
  `INSERT INTO public.ops_ordem
     (organization_id, codigo, origem, estado, cliente_id, titulo, responsavel_id)
   VALUES ($1,'OT-1','corretiva','em_curso',$2,'Reparar porta',$3) RETURNING id`,
  [ORG, CLI, TECNICO]
)).id;

const como = async (authUid, sql, p = []) => {
  // Sem `SET LOCAL ROLE`, isto corre como dono da tabela e a RLS nem chega
  // a ser consultada — o teste passava a dizer que sim a tudo.
  await db.exec(
    `BEGIN; SET LOCAL ROLE authenticated;
     SET LOCAL request.jwt.claim.sub = '${authUid}';`
  );
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
};

console.log("\n─── a tabela deixou de estar trancada ───");
{
  const p = await todos(
    `SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='ops_mensagem'`);
  conferir(p.length === 2, `tem exatamente as duas políticas certas (${p.length})`);
  conferir(p.some((x) => x.cmd === "SELECT"), "uma para ler");
  conferir(p.some((x) => x.cmd === "INSERT"), "outra para escrever");

  // Uma conversa que se reescreve depois de lida não esclarece nada. A
  // genérica do schema.sql era `FOR ALL` — em pg_policies aparece como 'ALL',
  // e essa também deixava reescrever.
  conferir(
    !p.some((x) => ["ALL", "UPDATE", "DELETE"].includes(x.cmd)),
    "e NENHUMA para reescrever nem apagar (nem a `FOR ALL` do schema)"
  );

  conferir(
    (await um(`SELECT has_table_privilege('authenticated','public.ops_mensagem','UPDATE') AS p`)).p
      === false,
    "nem sequer o privilégio de UPDATE"
  );
  conferir(
    (await um(`SELECT has_table_privilege('authenticated','public.ops_mensagem','DELETE') AS p`)).p
      === false,
    "nem o de DELETE"
  );
  conferir(
    (await um(`SELECT has_table_privilege('anon','public.ops_mensagem','SELECT') AS p`)).p === false,
    "e quem não tem sessão não lê nada"
  );
}

console.log("\n─── escrever ────────────────────────────");
{
  const r = (await como(A_CHEFE,
    `SELECT public.rpc_ops_escrever_mensagem($1,'O quadro está diferente da checklist') AS r`,
    [ordem]))[0].r;
  conferir(r.ok === true, "quem gere escreve");

  const rt = (await como(A_TECNICO,
    `SELECT public.rpc_ops_escrever_mensagem($1,'Mando foto já') AS r`, [ordem]))[0].r;
  conferir(rt.ok === true, "o técnico também — é quem está no local");

  const ms = await todos(
    `SELECT texto, canal, autor_id FROM public.ops_mensagem
      WHERE ordem_id = $1 ORDER BY criada_em`, [ordem]);
  conferir(ms.length === 2, "as duas ficaram lá");
  conferir(ms.every((m) => m.canal === "interno"), "as duas no canal interno");
  conferir(ms[0].autor_id === CHEFE && ms[1].autor_id === TECNICO, "com o autor certo");
}

console.log("\n─── o que a base recusa ─────────────────");
{
  let vazia = false;
  try {
    await como(A_CHEFE, `SELECT public.rpc_ops_escrever_mensagem($1,'   ') AS r`, [ordem]);
  } catch { vazia = true; }
  conferir(vazia, "uma mensagem vazia é recusada");

  // O canal 'cliente' é para um portal que não existe. Escrever a pensar que o
  // cliente lê, e ninguém lho mostrar, é pior do que não poder escrever.
  let aoCliente = false;
  try {
    await como(A_CHEFE,
      `INSERT INTO public.ops_mensagem (ordem_id, canal, autor_id, texto)
       VALUES ($1,'cliente',$2,'Olá')`, [ordem, CHEFE]);
  } catch { aoCliente = true; }
  conferir(aoCliente, "escrever ao cliente é recusado — esse portal não existe");

  let apagou = false;
  try {
    await como(A_CHEFE, `DELETE FROM public.ops_mensagem WHERE ordem_id = $1`, [ordem]);
    apagou = true;
  } catch { /* era o esperado */ }
  conferir(!apagou, "apagar uma mensagem é recusado");

  let reescreveu = false;
  try {
    await como(A_CHEFE,
      `UPDATE public.ops_mensagem SET texto = 'não foi isso' WHERE ordem_id = $1`, [ordem]);
    reescreveu = true;
  } catch { /* era o esperado */ }
  conferir(!reescreveu, "reescrever uma mensagem é recusado");
}

console.log("\n─── quem fica a saber ───────────────────");
{
  // Uma mensagem que ninguém lê não serve para nada.
  const avisos = await todos(
    `SELECT user_id, title FROM public.notifications WHERE type = 'operacoes_mensagem'`);
  conferir(avisos.length >= 1, `o sino toca (${avisos.length})`);

  // O chefe escreveu; o técnico é o responsável, e é ele quem tem de saber.
  conferir(
    avisos.some((a) => a.user_id === A_TECNICO),
    "o responsável da ordem é avisado"
  );
  conferir(
    !avisos.some((a) => a.user_id === A_CHEFE && a.title.includes("OT-1")),
    "e quem escreveu NÃO se avisa a si próprio"
  );
}

console.log("\n─── de outra organização, não ───────────");
{
  const org2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ent2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const cli2 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  await db.exec(`
    INSERT INTO public.anew_organizations (id, name) VALUES ('${org2}','Outra');
    INSERT INTO public.anew_entities (id, display_name) VALUES ('${ent2}','C2');
    INSERT INTO public.anew_clients (id, organization_id, entity_id)
      VALUES ('${cli2}','${org2}','${ent2}');
  `);
  const o2 = (await um(
    `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo)
     VALUES ($1,'OT-X','corretiva','em_curso',$2,'De outra casa') RETURNING id`,
    [org2, cli2])).id;

  // O stub de `get_user_visible_org_ids` devolve todas as organizações, por
  // isso este caminho não se consegue provar aqui — mas a RPC tem a guarda, e
  // a política de leitura vai pela mesma função.
  const temGuarda = await um(
    `SELECT prosrc LIKE '%get_user_visible_org_ids%' AS p FROM pg_proc
      WHERE proname = 'rpc_ops_escrever_mensagem'`);
  conferir(temGuarda.p === true, "a RPC confere a organização da ordem");
  conferir(typeof o2 === "string", "a ordem da outra casa existe, para o caso servir de exemplo");
}

console.log("\n─── o módulo continua contido ───────────");
{
  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  conferir(fk.n === 0, "zero chaves estrangeiras de ops_* para fora");
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a conversa existe, avisa quem tem de saber, e não se reescreve");

/**
 * Prova que uma assinatura vale o que diz — e que não se pode forjar.
 *
 * O que se verifica:
 *   · só se assina uma ordem FECHADA. Antes disso o trabalho não acabou, e
 *     uma assinatura a meio prova o quê?
 *   · uma assinatura sem nome é recusada;
 *   · o caminho do ficheiro TEM de ser desta ordem — senão dava para apontar
 *     a assinatura desta ordem para o ficheiro de outra;
 *   · um técnico que não esteve na ordem não recolhe a assinatura dela;
 *   · assinar outra vez substitui, e o histórico regista a substituição;
 *   · e ninguém escreve na tabela por fora da RPC.
 *
 *     npm run validar-assinaturas
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
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const OUTRO = "cccc0000-0000-0000-0000-00000000000c";
const AUTH = {
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
  outro: "cccc1111-0000-0000-0000-00000000000c",
};

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE TABLE IF NOT EXISTS storage.buckets (
    id text PRIMARY KEY, name text, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE IF NOT EXISTS storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text, name text, owner uuid, created_at timestamptz DEFAULT now());
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${TECNICO}', '${AUTH.tecnico}', 'Tecnico', 't@x.pt'),
    ('${OUTRO}',   '${AUTH.outro}',   'Outro',   'o@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.tecnico}','t@x.pt',now()), ('${AUTH.outro}','o@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.tecnico}','${TECNICO}'), ('${AUTH.outro}','${OUTRO}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql", "rpcs-tarefas.sql",
  "planos.sql", "correcoes-modelo.sql", "medicoes.sql", "agenda.sql", "despacho.sql",
  "orcamentos.sql", "anexos.sql", "assinaturas.sql",
]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${TECNICO}','tecnico'),
    ('${ORG}','${OUTRO}','tecnico');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

async function como(authUid, sql) {
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated;
                 SET LOCAL request.jwt.claim.sub = '${authUid}';`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
}

async function recusa(nome, authUid, sql, trecho) {
  let r = false;
  let msg = "";
  try {
    await como(authUid, sql);
  } catch (e) {
    msg = e.message;
    r = !trecho || e.message.includes(trecho);
    await db.exec("ROLLBACK").catch(() => {});
  }
  r ? ok(nome) : mau(`${nome} — ${msg ? "mensagem errada: " + msg.split("\n")[0] : "PASSOU"}`);
}

/* ── O cenário ─────────────────────────────────────────────────────────── */

const ORDEM = "0a0a0000-0000-0000-0000-0000000000a1";
const OUTRA = "0a0a0000-0000-0000-0000-0000000000a2";
await db.exec(`
  INSERT INTO public.ops_ordem
    (id, organization_id, codigo, origem, estado, cliente_id, titulo, responsavel_id)
  VALUES
    ('${ORDEM}', '${ORG}', 'OT-A1', 'corretiva', 'em_curso', '${CLI}', 'Portao', '${TECNICO}'),
    ('${OUTRA}', '${ORG}', 'OT-A2', 'corretiva', 'fechada',  '${CLI}', 'Outra',  '${OUTRO}');
`);

const caminho = (ordem, ficheiro) => `${ORG}/${ordem}/${ficheiro}`;
const assinar = (ordem, cam, nome, qualidade = null) =>
  `SELECT public.rpc_ops_assinar_ordem('${ordem}','${cam}','${nome}',` +
  `${qualidade === null ? "NULL" : `'${qualidade}'`});`;

/* ── Antes de fechar ───────────────────────────────────────────────────── */

console.log("\n─── antes de o trabalho acabar ──────────");
await recusa(
  "não se assina uma ordem em curso",
  AUTH.tecnico,
  assinar(ORDEM, caminho(ORDEM, "a.png"), "Sr. Silva"),
  "ordem fechada"
);

/* ── Depois de fechar ──────────────────────────────────────────────────── */

await db.exec(`
  SELECT set_config('ops.transicao','autorizada',false);
  UPDATE public.ops_ordem SET estado='fechada', fechada_em=now() WHERE id='${ORDEM}';
  SELECT set_config('ops.transicao','',false);
`);

console.log("\n─── com a ordem fechada ─────────────────");
{
  try {
    await como(AUTH.tecnico, assinar(ORDEM, caminho(ORDEM, "assinatura.png"), "Sr. Silva", "condómino"));
    ok("o técnico que lá esteve recolhe a assinatura");
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`recolher falhou: ${e.message.split("\n")[0]}`);
  }

  const a = await um(`SELECT nome, qualidade, caminho, recolhida_por
                        FROM public.ops_assinatura WHERE ordem_id='${ORDEM}'`);
  a?.nome === "Sr. Silva" && a?.qualidade === "condómino"
    ? ok("fica com o nome E a qualidade em que assinou")
    : mau(`assinatura: ${JSON.stringify(a)}`);
  a?.recolhida_por === TECNICO
    ? ok("e com quem tinha o telemóvel na mão")
    : mau(`recolhida_por: ${a?.recolhida_por}`);
}

await recusa(
  "uma assinatura sem nome é recusada",
  AUTH.tecnico,
  assinar(ORDEM, caminho(ORDEM, "b.png"), "   "),
  "sem nome"
);

await recusa(
  "o caminho tem de ser desta ordem, e não de outra",
  AUTH.tecnico,
  assinar(ORDEM, caminho(OUTRA, "roubada.png"), "Sr. Silva"),
  "não corresponde"
);

await recusa(
  "quem não esteve na ordem não recolhe a assinatura dela",
  AUTH.outro,
  assinar(ORDEM, caminho(ORDEM, "c.png"), "Sr. Silva"),
  "Só quem esteve"
);

/* ── Substituir ────────────────────────────────────────────────────────── */

console.log("\n─── assinar outra vez ───────────────────");
{
  const r = await como(
    AUTH.tecnico,
    `SELECT public.rpc_ops_assinar_ordem('${ORDEM}','${caminho(ORDEM, "segunda.png")}',
       'Dona Maria','porteira') AS r`
  );
  r[0].r.substituiu === true
    ? ok("diz que substituiu, em vez de fingir que foi a primeira")
    : mau(`substituiu: ${JSON.stringify(r[0].r)}`);

  const n = await um(`SELECT count(*)::int AS n FROM public.ops_assinatura
                       WHERE ordem_id='${ORDEM}'`);
  n.n === 1 ? ok("continua a haver uma só por ordem") : mau(`${n.n} assinaturas`);

  const a = await um(`SELECT nome FROM public.ops_assinatura WHERE ordem_id='${ORDEM}'`);
  a.nome === "Dona Maria" ? ok("e é a nova que fica") : mau(`ficou ${a.nome}`);

  const e = await um(`SELECT count(*)::int AS n FROM public.ops_evento
                       WHERE entidade_id='${ORDEM}' AND tipo='assinatura_substituida'`);
  e.n === 1
    ? ok("a substituição ficou no histórico, com a anterior guardada")
    : mau(`${e.n} eventos de substituição`);
}

/* ── Pela porta do lado ────────────────────────────────────────────────── */

console.log("\n─── escrever por fora da RPC ────────────");
await recusa(
  "um INSERT direto na tabela é recusado",
  AUTH.tecnico,
  `INSERT INTO public.ops_assinatura (organization_id, ordem_id, nome, caminho)
   VALUES ('${ORG}','${OUTRA}','Forjada','${caminho(OUTRA, "x.png")}');`,
  "row-level security"
);

/* ── O que NÃO se tocou ────────────────────────────────────────────────── */

console.log("\n─── o que NÃO se tocou ──────────────────");
{
  const fk = await q(`
    SELECT c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.length === 0
    ? ok("nenhuma chave estrangeira para fora do módulo")
    : mau(`${fk.length} FK para fora: ${fk.map((r) => r.conname).join(", ")}`);

  const rls = await um(`SELECT rowsecurity FROM pg_tables
                         WHERE schemaname='public' AND tablename='ops_assinatura'`);
  rls.rowsecurity ? ok("ops_assinatura tem RLS ligada") : mau("ops_assinatura sem RLS");

  // O ciclo do schema.sql que barra o `anon` corre quando o schema corre; uma
  // tabela criada depois fica com os grants por omissao do Postgres. A RLS
  // filtrava na mesma, mas uma tabela que responde "[]" em vez de "sem
  // permissao" ja confirma que existe.
  const pub = await um(`
    SELECT has_table_privilege('anon', 'public.ops_assinatura', 'SELECT') AS pode`);
  pub.pode === false
    ? ok("o publico nao chega a tabela de todo")
    : mau("o papel anon tem SELECT em ops_assinatura");
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ uma assinatura só se recolhe onde e por quem devia");

/**
 * Motivos de pausa, áreas e tipos — listas geridas em vez de texto livre.
 *
 * O que aqui se prova, sobretudo: que um técnico não vê os motivos que são
 * decisão de quem gere. Filtrar isso no ecrã daria a lista completa a quem
 * abrisse as ferramentas do browser.
 *
 *     npm run validar-listas
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
const GESTOR = "33333333-3333-3333-3333-333333333333";
const AG = "44444444-4444-4444-4444-444444444444";
const TECNICO = "55555555-5555-5555-5555-555555555555";
const AT = "66666666-6666-6666-6666-666666666666";

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
    ('${GESTOR}', '${AG}', 'Rita', 'rita@x.pt'),
    ('${TECNICO}', '${AT}', 'Tino', 'tino@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AG}','rita@x.pt',now()), ('${AT}','tino@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AG}','${GESTOR}'), ('${AT}','${TECNICO}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql",
  "rpcs-tarefas.sql", "planos.sql", "correcoes-modelo.sql", "config.sql",
  "campos-ordem.sql",
]) {
  await db.exec(ler(f));
}
await db.exec(ler("listas-operacao.sql"));
// Um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("listas-operacao.sql"));

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}', '${GESTOR}', 'gestor'),
    ('${ORG}', '${TECNICO}', 'tecnico');
`);

/** `auth.uid()` lê `request.jwt.claim.sub`, e o SET LOCAL só vale na transação. */
const como = async (authUid, sql, p = []) => {
  await db.exec(`BEGIN; SET LOCAL request.jwt.claim.sub = '${authUid}';`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
};

console.log("\n─── semear ──────────────────────────────");
{
  const r = (await um(`SELECT public.ops_semear_listas($1) AS r`, [ORG])).r;
  conferir(r.pausas === 8, `oito motivos de pausa (semeou ${r.pausas})`);
  conferir(r.areas === 10, `dez áreas (semeou ${r.areas})`);

  const outra = (await um(`SELECT public.ops_semear_listas($1) AS r`, [ORG])).r;
  conferir(outra.pausas === 0 && outra.areas === 0, "semear outra vez não duplica nada");
}

console.log("\n─── quem vê que motivos ─────────────────");
{
  const daRita = await como(AG, `SELECT nome FROM public.rpc_ops_motivos_de_pausa($1)`, [ORG]);
  const doTino = await como(AT, `SELECT nome FROM public.rpc_ops_motivos_de_pausa($1)`, [ORG]);

  conferir(daRita.length === 8, `quem gere vê os oito (viu ${daRita.length})`);
  conferir(doTino.length === 4, `o técnico vê só quatro (viu ${doTino.length})`);

  const nomesTino = doTino.map((r) => r.nome);
  // Pausar à espera de aprovação superior é uma decisão de quem gere. Deixá-la
  // a toda a gente é como não ter motivo nenhum.
  conferir(
    !nomesTino.includes("A aguardar aprovação superior"),
    "e NÃO vê 'a aguardar aprovação superior'"
  );
  conferir(
    !nomesTino.includes("A aguardar orçamento") && !nomesTino.includes("Em lista de espera"),
    "nem orçamento nem lista de espera"
  );
  conferir(nomesTino.includes("A aguardar material"), "mas vê 'a aguardar material'");
  conferir(nomesTino.includes("Outro"), "e 'outro', que é o que precisa do detalhe ao lado");

  // A filtragem é da base. No ecrã, bastava abrir as ferramentas do browser.
  const naTabela = await um(
    `SELECT count(*)::int AS n FROM public.ops_motivo_pausa WHERE organization_id = $1`, [ORG]);
  conferir(naTabela.n === 8, "a tabela tem os oito — quem filtra é a função");
}

console.log("\n─── as áreas e os tipos ─────────────────");
{
  const areas = await todos(
    `SELECT nome FROM public.ops_area WHERE organization_id = $1 ORDER BY posicao`, [ORG]);
  conferir(areas[0].nome === "Acompanhamento", "pela ordem em que foram semeadas");
  conferir(areas.some((a) => a.nome === "Eletricidade"), "com Eletricidade lá");

  const eletr = (await um(
    `SELECT id FROM public.ops_area WHERE organization_id = $1 AND nome = 'Eletricidade'`,
    [ORG])).id;
  const t = (await como(AG,
    `SELECT public.rpc_ops_gravar_area_tipo($1,'Quadro elétrico') AS r`, [eletr]))[0].r;
  conferir(t.ok === true, "um tipo cria-se dentro de uma área");

  let recusou = false;
  try {
    await como(AT, `SELECT public.rpc_ops_gravar_area($1,'Inventada') AS r`, [ORG]);
  } catch {
    recusou = true;
  }
  conferir(recusou, "um técnico não mexe nas listas");
}

console.log("\n─── os campos na ordem ──────────────────");
{
  const cols = await todos(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ops_ordem'
        AND column_name IN ('pausa_motivo_id','area_id','area_tipo_id')`);
  conferir(cols.length === 3, `os três campos existem (${cols.length})`);

  // O texto livre fica: é o detalhe ao lado de "Outro".
  const antigo = await um(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ops_ordem' AND column_name='pausa_motivo'`);
  conferir(antigo.n === 1, "e o texto livre da pausa não desapareceu");
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
console.log("✓ as listas são geridas, e cada função só vê o que lhe toca");

/**
 * A demo do orçamento corre, é repetível, e dá os números que promete.
 *
 * Não é um validador de produto — é a garantia de que o ficheiro de
 * demonstração não rebenta na base de alguém que o quer só para ver o ecrã.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DADOS_CRM, STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");
const db = new PGlite();
await db.waitReady;

const falhas = [];
const conferir = (c, m) => {
  console.log(`  ${c ? "\u2713" : "\u2717"} ${m}`);
  if (!c) falhas.push(m);
};

await db.exec(STUBS_CRM);
await db.exec(DADOS_CRM);
for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql",
  "planos.sql", "correcoes-modelo.sql", "medicoes.sql", "despacho.sql",
  "orcamentos.sql",
]) await db.exec(ler(f));

console.log("\n\u2500\u2500\u2500 a demo do or\u00e7amento \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

await db.exec(ler("demo-orcamento.sql"));
conferir(true, "corre numa base completa");

await db.exec(ler("demo-orcamento.sql"));
const quantas = (await db.query(
  `SELECT count(*)::int AS n FROM public.ops_ordem WHERE codigo = 'DEMO-ORC-OT1'`)).rows[0].n;
conferir(quantas === 1, "correr duas vezes n\u00e3o duplica nada");

const v = (await db.query(
  `SELECT previsto, real_total, desvio, desvio_percent
     FROM public.ops_v_ordem_custo WHERE codigo = 'DEMO-ORC-OT1'`)).rows[0];
conferir(Number(v.previsto) === 3023, `previsto = 3023,00 \u20ac (deu ${v.previsto})`);
conferir(Number(v.real_total) === 2730.9, `gasto = 2730,90 \u20ac (deu ${v.real_total})`);
conferir(Number(v.desvio) === -292.1, `desvio = \u2212292,10 \u20ac (deu ${v.desvio})`);
conferir(Number(v.desvio_percent) === -9.7, `desvio = \u22129,7 % (deu ${v.desvio_percent})`);

const linhas = (await db.query(
  `SELECT count(*)::int AS n FROM public.ops_ordem_previsto p
     JOIN public.ops_ordem o ON o.id = p.ordem_id WHERE o.codigo = 'DEMO-ORC-OT1'`)).rows[0].n;
conferir(linhas === 5, "cinco linhas de previsto, congeladas");

// O que interessa provar: n\u00e3o escreve no CRM.
const noCrm = (await db.query(
  `SELECT count(*)::int AS n FROM public.anew_clients`)).rows[0].n;
conferir(noCrm === 1, "n\u00e3o cria clientes \u2014 usa os que j\u00e1 l\u00e1 estavam");

await db.exec(ler("demo-orcamento-remover.sql"));
const sobrou = (await db.query(
  `SELECT count(*)::int AS n FROM public.ops_ordem WHERE codigo LIKE 'DEMO-ORC%'`)).rows[0].n;
const sobrouLocal = (await db.query(
  `SELECT count(*)::int AS n FROM public.ops_local WHERE codigo LIKE 'DEMO-ORC%'`)).rows[0].n;
conferir(sobrou === 0 && sobrouLocal === 0, "e sai toda, sem deixar rasto");

console.log(
  falhas.length === 0
    ? "\n\u2713 a demo do or\u00e7amento est\u00e1 pronta a correr\n"
    : `\n\u2717 ${falhas.length} falha(s)\n`
);
process.exit(falhas.length === 0 ? 0 : 1);

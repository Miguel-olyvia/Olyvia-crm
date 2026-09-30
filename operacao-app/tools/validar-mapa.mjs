/**
 * Prova que a base recusa uma coordenada que não é um sítio.
 *
 * A leitura de um link colado tem os seus testes em `src/domain/mapa.ts`. Isto
 * verifica a última linha de defesa: a guarda na própria tabela, que apanha o
 * que passar pelo ecrã — um script, uma importação, um dedo escorregado.
 *
 *     npm run validar-mapa
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
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";

await db.exec(STUBS_CRM);
await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '77777777-7777-7777-7777-777777777777');
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("mapa.sql"));
// Duas vezes: um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("mapa.sql"));

let n = 0;
const criar = (lat, lng) => {
  n += 1;
  const v = (x) => (x === null ? "NULL" : x);
  return `INSERT INTO public.ops_local
            (organization_id, cliente_id, codigo, nome, latitude, longitude)
          VALUES ('${ORG}','${CLI}','LOC-${n}','Sitio ${n}',${v(lat)},${v(lng)});`;
};

async function aceita(nome, sql) {
  try { await db.exec(sql); ok(nome); }
  catch (e) { mau(`${nome} — ${e.message.split("\n")[0]}`); }
}

/**
 * Recusado — e por uma das duas guardas que existem de propósito.
 *
 * A guarda `CHECK` é a que apanha quase tudo. Mas o próprio tipo também
 * guarda: `numeric(10,8)` só tem dois dígitos antes da vírgula, por isso uma
 * latitude de três dígitos nem chega ao `CHECK` — é recusada uma casa antes.
 * As duas servem; o que não serve é ser recusado por outra coisa qualquer,
 * como uma chave ou um `NOT NULL`, que faria o teste passar por engano.
 */
async function recusa(nome, sql) {
  try { await db.exec(sql); mau(`${nome} — PASSOU, e devia ter sido recusado`); }
  catch (e) {
    const m = e.message.split("\n")[0];
    /ops_local_coordenadas_validas|numeric field overflow/.test(m)
      ? ok(nome)
      : mau(`${nome} — recusado pela razão errada: ${m}`);
  }
}

console.log("\n─── o que é um sítio ────────────────────");
await aceita("um local sem coordenadas nenhumas", criar(null, null));
await aceita("Lisboa", criar(38.7223, -9.1393));
await aceita("Sydney, do outro lado do mundo", criar(-33.8688, 151.2093));
await aceita("os extremos do planeta", criar(90, 180));

console.log("\n─── o que não é ─────────────────────────");
await recusa("uma latitude de 412", criar(412, -9.1393));
await recusa("uma latitude de 91 — o polo fica nos 90", criar(91, -9.1393));
await recusa("uma longitude de 999", criar(38.7223, 999));
await recusa("só a latitude — meia coordenada não é um sítio", criar(38.7223, null));
await recusa("só a longitude", criar(null, -9.1393));

console.log("\n─── as colunas ──────────────────────────");
{
  const c = await um(`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ops_local'
       AND column_name IN ('latitude','longitude')`);
  c.n === 2 ? ok("latitude e longitude existem") : mau(`${c.n} colunas`);

  // A mesma precisão que o CRM já usa em schedule_items.location_lat. Uma
  // diferença de casas decimais entre as duas metades do sistema só daria
  // trabalho a quem um dia as cruzar.
  const p = await um(`
    SELECT numeric_scale AS escala FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ops_local' AND column_name='latitude'`);
  Number(p.escala) === 8
    ? ok("com a mesma precisão que o CRM usa na sua agenda")
    : mau(`escala ${p.escala}, esperava 8`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a base só aceita coordenadas que são um sítio no mapa");

// Prova que o Catálogo lido das tabelas (real/catalogoReal.ts) dá os mesmos números que a Emylia original:
// carrega numa PGlite a estrutura das tabelas, as migrations do Catálogo e a carga, lê as linhas como lerCatalogo.ts as lê,
// monta o Catálogo e compara, serviço a serviço, as horas, o custo e o preço com receitaDe/custoReceita sobre os dados da Emylia.
//
// Correr (a partir da raiz do repo; a base de teste tem de ter as tabelas que a cat_ler_catalogo lê):
//   npx esbuild scripts/emylia/paridadeCatalogo.ts --bundle --platform=node --format=esm --tsconfig=tsconfig.app.json \
//     --outfile=<tmp>/paridade.mjs && node <tmp>/paridade.mjs <pglite/dist/index.js> <base.sql> <migration...sql> <carga.sql>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { seed } from "@/emylia/motor";
import { custos0, custoReceita, precoReceita, receitaDe } from "@/emylia/v2/custosModelo";
import { catalogo0 } from "@/emylia/v2/catalogoModelo";
import { CATALOGO_TODO } from "@/emylia/catalogo";
import { TECNICOS } from "@/emylia/equipa/tecnicos";
import { montarCatalogo, type LinhasCatalogo } from "@/emylia/real/catalogoReal";
import { linhasDe } from "@/emylia/real/lerCatalogo";

const [pglite, ...ficheiros] = process.argv.slice(2);
const ORG = "b6ffce4f-f630-4933-833a-008649757a33", U = "33333333-3333-3333-3333-333333333333";
const { PGlite } = await import(pathToFileURL(pglite).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.is_system_admin_user(uuid) returns boolean language sql stable as $$ select false $$;
  create function public.current_business_user_id() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.has_anew_permission_in_org(uuid, text, uuid) returns boolean language sql stable as $$ select true $$;`);
const ler = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
await db.exec(ler(ficheiros[0]));
const obrig = async (t: string) => (await db.query(`select attname, format_type(atttypid,atttypmod) tp from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where attrelid='public.${t}'::regclass and attnum>0 and not attisdropped and attnotnull and d.adbin is null`)).rows as { attname: string; tp: string }[];
async function inserir(t: string, v: Record<string, string>) {
  for (const c of await obrig(t)) if (!(c.attname in v)) v[c.attname] = c.tp.includes("uuid") ? `'${U}'` : c.tp.includes("bool") ? "false" : /int|numeric/.test(c.tp) ? "0" : c.tp.includes("time") ? "now()" : `'x${Math.random().toString(36).slice(2)}'`;
  await db.exec(`insert into public.${t} (${Object.keys(v).map((k) => `"${k}"`).join(",")}) values (${Object.values(v).join(",")})`);
}
await inserir("anew_organizations", { id: `'${ORG}'` });
await inserir("anew_users", { id: `'${U}'` });
await inserir("anew_memberships", { user_id: `'${U}'`, organization_id: `'${ORG}'` });
for (const f of ficheiros.slice(1)) await db.exec(ler(f));
// a mesma leitura que o ecrã faz (cat_ler_catalogo)
const lido = (await db.query(`select cat_ler_catalogo('${ORG}') r`)).rows[0] as { r: unknown };
const L: LinhasCatalogo = linhasDe(lido.r);

const S = seed();
const M = montarCatalogo(L, catalogo0(), S.svc);
const C0 = custos0();
const tecnicos = TECNICOS;
const sids = [...Object.keys(S.svc), ...CATALOGO_TODO.map((c) => c.id).filter((id) => !S.svc[id])];
let iguais = 0;
const dif: string[] = [];
const r2 = (x: number) => Math.round(x * 100) / 100;
for (const sid of sids) {
  const a = receitaDe(C0, sid, S.svc[sid] ?? null, S.cfg.alvo);
  if (!a) continue;
  const b = M.C.receitas[sid];
  if (!b) { dif.push(`${sid}: não veio da base`); continue; }
  const ca = custoReceita(a, C0, S.cfg.estrutura, { tecnicos }), cb = custoReceita(b, M.C, S.cfg.estrutura, { tecnicos });
  const pa = precoReceita(a, ca.total), pb = precoReceita(b, cb.total);
  const ok = r2(ca.h) === r2(cb.h) && r2(ca.total) === r2(cb.total) && r2(pa) === r2(pb) && a.modo === b.modo;
  if (ok) iguais++;
  else dif.push(`${sid} ${a.modo}/${b.modo}: h ${r2(ca.h)}→${r2(cb.h)} custo ${r2(ca.total)}→${r2(cb.total)} (mo ${r2(ca.mo)}→${r2(cb.mo)} eq ${r2(ca.eq)}→${r2(cb.eq)} cons ${r2(ca.cons)}→${r2(cb.cons)}) preço ${r2(pa)}→${r2(pb)}`);
}
console.log(`serviços iguais: ${iguais} de ${iguais + dif.length}`);
for (const d of dif.slice(0, 25)) console.log("  ", d);
console.log(`produtos: ${M.K.produtos.length} (Emylia ${catalogo0().produtos.length}); ramos: ${M.K.arvore.length}; perfis: ${M.C.perfis.length}; equip.: ${M.C.equip.length}; serviços do modelo no motor: ${Object.keys(M.svc).length}`);
process.exit(dif.length ? 1 : 0);

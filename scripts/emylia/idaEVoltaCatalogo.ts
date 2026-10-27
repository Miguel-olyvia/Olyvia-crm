// Ida e volta do Catálogo: lê da base (cat_ler_catalogo), muda como os ecrãs da Emylia mudam (as stores), grava com
// gravarCatalogo.ts (diferencasCatalogo + executarCatalogo), lê outra vez e confirma que o que mudou ficou na base e o resto não.
// Correr como o paridadeCatalogo.ts: node idaEVolta.mjs <pglite/dist/index.js> <base.sql> <migration...sql> <carga.sql>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { seed } from "@/emylia/motor";
import { catalogo0 } from "@/emylia/v2/catalogoModelo";
import { substituirCatalogoTodo } from "@/emylia/catalogo";
import { criarServico, type NovoServico } from "@/emylia/criarCatalogo";
import { montarCatalogo } from "@/emylia/real/catalogoReal";
import { linhasDe } from "@/emylia/real/lerCatalogo";
import { diferencasCatalogo, executarCatalogo, fotografar, type FotoCatalogo, type Rpc } from "@/emylia/real/gravarCatalogo";

const [pglite, ...ficheiros] = process.argv.slice(2);
const ORG = "b6ffce4f-f630-4933-833a-008649757a33", U = "33333333-3333-3333-3333-333333333333";
const { PGlite } = await import(pathToFileURL(pglite).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.is_system_admin_user(uuid) returns boolean language sql stable as $$ select false $$;
  create function public.current_business_user_id() returns uuid language sql stable as $$ select '${U}'::uuid $$;
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

// a chamada rpc como o supabase-js a faz (argumentos com nome), com o tipo de cada argumento lido da função
const rpc: Rpc = async (fn, args) => {
  const f = (await db.query(`select proargnames n, (select array_agg(format_type(t, null)) from unnest(proargtypes) t) tp from pg_proc where proname = $1 order by pronargs desc limit 1`, [fn])).rows[0] as { n: string[]; tp: string[] };
  const nomes = Object.keys(args);
  const sql = `select public.${fn}(${nomes.map((k, i) => `${k} => $${i + 1}::${f.tp[f.n.indexOf(k)]}`).join(", ")}) r`;
  const vals = nomes.map((k) => { const v = args[k]; const t = f.tp[f.n.indexOf(k)]; return v === null || v === undefined ? null : t === "jsonb" ? JSON.stringify(v) : t.endsWith("[]") ? `{${(v as unknown[]).join(",")}}` : v; });
  try { const r = (await db.query(sql, vals)).rows[0] as { r: unknown }; return { data: r?.r ?? null, error: null }; }
  catch (e) { return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } }; }
};
const lerTudo = async () => {
  const L = linhasDe(((await db.query(`select cat_ler_catalogo('${ORG}') r`)).rows[0] as { r: unknown }).r);
  const S = seed();
  const M = montarCatalogo(L, catalogo0(), S.svc);
  substituirCatalogoTodo(M.itens);
  return { L, M, F: { C: M.C, K: M.K, svc: { ...S.svc, ...M.svc }, margens: M.margens } as FotoCatalogo };
};

let ok = 0, falhas = 0;
const certo = (c: boolean, nome: string) => { if (c) ok++; else { falhas++; console.log("  FALHOU:", nome); } };

const um = await lerTudo();
const antes = fotografar(um.F), depois = fotografar(um.F);
// as mudanças que os ecrãs fazem
const sid = "canal";
depois.C.receitas[sid].precoTabela = 111.11;
depois.C.receitas[sid].hist.push({ data: "2026-10-27", preco: 111.11, nota: "Teste de ida e volta" });
depois.C.receitas[sid].mo[0].h = 2.5;
depois.C.receitas[sid].cons.push({ id: "c-novo", n: "Abraçadeira de teste", q: 3, un: "un", preco: 0.4567, fornecedor: "Fornecedor X", data: "2026-10-27" });
depois.C.par.horasMes = 700;
depois.margens.alvo = 36;
depois.K.icone = { ...(depois.K.icone ?? {}), [sid]: "torneira" as never };
const perfilCanal = depois.C.receitas[sid].mo[0].perfil;
const novo: NovoServico = { n: "Serviço criado no teste", no: depois.K.arvore.find((x) => x.pai == null)!.id, un: "un", medida: null, linhas: ["wc"],
  mo: [{ n: "Fazer", perfil: perfilCanal, h: 1.5 }], equip: [], cons: [], modo: "tabela", precoTabela: 77, margem: 35 };
const r = criarServico(depois.K, depois.C, novo);
if (r.ok) { depois.C = r.C; depois.K = r.K; } else console.log("  (criarServico recusou:", r.erro, ")");

const chamadas = diferencasCatalogo(ORG, antes, depois, { ids: um.M.ids, produtos: um.L.produtos });
console.log(`chamadas: ${chamadas.length}`, chamadas.map((c) => c.rpc).join(", "));
const res = await executarCatalogo(chamadas, rpc);
certo(res.erro === null, "gravou sem erro " + (res.erro ?? ""));

const dois = await lerTudo();
const rc = dois.M.C.receitas[sid];
certo(rc.precoTabela === 111.11, `preço de tabela 111,11 (veio ${rc.precoTabela})`);
certo(rc.hist.length === um.M.C.receitas[sid].hist.length + 1 && rc.hist.at(-1)!.nota === "Teste de ida e volta", "o preço novo entrou no histórico com a nota");
certo(Math.abs(rc.mo[0].h - 2.5) < 1e-9, `mão de obra 2,5 h (veio ${rc.mo[0].h})`);
const ab = rc.cons.find((c) => c.n === "Abraçadeira de teste");
certo(!!ab && ab.q === 3 && Math.abs(ab.preco - 0.4567) < 1e-9 && ab.fornecedor === "Fornecedor X", "consumível escrito à mão virou produto, com preço exato e fornecedor");
certo(dois.M.C.par.horasMes === 700 && dois.M.margens.alvo === 36, "parâmetros e margem alvo");
certo(dois.M.K.icone?.[sid] === "torneira", "ícone do serviço");
certo(rc.cons.length === um.M.C.receitas[sid].cons.length + 1, "os outros consumíveis ficaram");
if (r.ok) {
  const criado = Object.values(dois.M.C.receitas).find((x) => dois.M.itens.find((i) => i.id === x.sid)?.n === "Serviço criado no teste");
  certo(!!criado && criado.sid === r.id && criado.precoTabela === 77 && criado.mo.length === 1, `serviço criado ficou com a chave da Emylia (${r.id}), o preço e a receita`);
}
// o resto não mudou
const outros = Object.keys(um.M.C.receitas).filter((s) => s !== sid);
certo(outros.every((s) => JSON.stringify(dois.M.C.receitas[s]) === JSON.stringify(um.M.C.receitas[s])), `as outras ${outros.length} receitas ficaram iguais`);
certo(dois.M.K.produtos.length === um.M.K.produtos.length, "os produtos ficaram iguais");
// gravar outra vez sem mudanças: nada a fazer
const tres = await lerTudo();
certo(diferencasCatalogo(ORG, fotografar(tres.F), fotografar(tres.F), { ids: tres.M.ids, produtos: tres.L.produtos }).length === 0, "sem mudanças, nenhuma chamada");

console.log(`\n${ok} certos, ${falhas} falhados`);
process.exit(falhas ? 1 : 0);

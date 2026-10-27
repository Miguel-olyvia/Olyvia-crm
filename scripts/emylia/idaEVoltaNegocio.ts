// Ida e volta do Negócio PELA BASE: o caso real da Anabela, em cada passo, vai às tabelas com neg_guardar_negocio e volta com
// neg_ler_negocios, e tem de sair igual (as mesmas regras de comparação do teste sem base, negocioComparar.ts).
// Correr (raiz do repo): npx esbuild scripts/emylia/idaEVoltaNegocio.ts --bundle --platform=node --format=esm --tsconfig=tsconfig.app.json
//   --inject:<stubs do browser> --define:import.meta.env=... --outfile=<tmp>/neg.mjs && node <tmp>/neg.mjs <pglite> <base.sql> <migrations…>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { acoes, seed, tot, totaisIva, type Estado, type Negocio } from "@/emylia/motor";
import { estadoVazio } from "@/emylia/estadoOrganizacao";
import { montarAnabela, K_ANABELA, preencher } from "@/emylia/casos/montarAnabela";
import { PAGAMENTO } from "@/emylia/casos/propostaAnabela";
import { PROPOSTA } from "@/emylia/campos";
import { ligarCatalogo } from "@/emylia/produtosVisita";
import { usarTecnicos } from "@/emylia/equipa/tecnicos";
import { PAGAMENTO_MEDIDA, type Prestacao } from "@/emylia/planoObra";
import { faturasDe, guardarFaturas, tranchesDe } from "@/emylia/v2/estadoV2";
import { catalogo0 } from "@/emylia/v2/catalogoModelo";
import { montarCatalogo } from "@/emylia/real/catalogoReal";
import { linhasDe } from "@/emylia/real/lerCatalogo";
import { paraLinhas, deLinhas } from "@/emylia/real/negocioReal";
import { normalParaComparar } from "@/emylia/real/negocioComparar";
import { deBase, idsServico, paraBase } from "@/emylia/real/negocioBase";

const [pglite, base, ...migs] = process.argv.slice(2);
const ORG = "b6ffce4f-f630-4933-833a-008649757a33", U = "33333333-3333-3333-3333-333333333333";
const HOJE = new Date(2026, 9, 27, 10, 0);
const uid = (tipo: string, chave: string) => { const h = createHash("md5").update(`${ORG}:${tipo}:${chave}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const { PGlite } = await import(pathToFileURL(pglite).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.is_system_admin_user(uuid) returns boolean language sql stable as $$ select false $$;
  create function public.current_business_user_id() returns uuid language sql stable as $$ select '${U}'::uuid $$;
  create function public.has_anew_permission_in_org(uuid, text, uuid) returns boolean language sql stable as $$ select true $$;`);
const ler = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
await db.exec(ler(base));
const obrig = async (t: string) => (await db.query(`select attname, format_type(atttypid,atttypmod) tp from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where attrelid='public.${t}'::regclass and attnum>0 and not attisdropped and attnotnull and d.adbin is null and a.attgenerated=''`)).rows as { attname: string; tp: string }[];
async function inserir(t: string, v: Record<string, string>) {
  for (const c of await obrig(t)) if (!(c.attname in v)) v[c.attname] = c.tp.includes("uuid") ? `'${U}'` : c.tp.includes("bool") ? "false" : /int|numeric/.test(c.tp) ? "0" : c.tp.includes("time") ? "now()" : `'x${Math.random().toString(36).slice(2, 8)}'`;
  return (await db.query(`insert into public.${t} (${Object.keys(v).map((k) => `"${k}"`).join(",")}) values (${Object.values(v).join(",")}) on conflict do nothing returning *`)).rows[0];
}
await inserir("anew_organizations", { id: `'${ORG}'` });
await inserir("anew_users", { id: `'${U}'` });
await inserir("anew_memberships", { user_id: `'${U}'`, organization_id: `'${ORG}'` });
await inserir("negocio_workflow_config", { organization_id: `'${ORG}'`, momento_ganho: "'manual'" });
// as funções do CRM que as migrations ajustam (copiadas da base RH; os corpos não se validam aqui: dependem de muitas tabelas)
for (const m of migs) {
  // (a migration da encomenda de cliente volta a criar essas funções: também sem validar os corpos)
  if ((/(^|[\\/])\d{14}_[^\\/]*\.sql$/.test(m) || m.includes("RASCUNHO-")) && !m.includes("encomenda_cliente")) await db.exec(ler(m));
  else await db.exec(`set check_function_bodies = off;\n${ler(m)};\nset check_function_bodies = on;`);
}
await inserir("schedule_boards", { organization_id: `'${ORG}'`, name: "'visita'", board_type: "'general'", is_active: "true", created_by: `'${U}'` });

// o Catálogo como o ecrã o lê (para as chaves dos serviços)
const LC = linhasDe(((await db.query(`select cat_ler_catalogo('${ORG}') r`)).rows[0] as { r: unknown }).r);
const MC = montarCatalogo(LC, catalogo0(), seed().svc);
const ids = idsServico(MC.ids.servico);

// o caso da Anabela
ligarCatalogo(() => K_ANABELA);
const S: Estado = estadoVazio("org-caso-real");
usarTecnicos(S.tecnicos!);
const A = acoes(S, () => {}, (fn) => fn());
const M = montarAnabela(S, A, []);
const id = M.id;
const d = (): Negocio => S.deals.find((x) => x.id === id)!;
// a pessoa e o negócio, como o CRM os cria (Nova lead)
const ENT = uid("ent", String(id));
await inserir("anew_entities", { id: `'${ENT}'`, organization_id: `'${ORG}'`, display_name: `'${d().nome.replace(/'/g, "''")}'`, phone: `'${d().tel}'` });
const NEG = uid("neg", String(id));
await inserir("negocios", { id: `'${NEG}'`, organization_id: `'${ORG}'`, root_organization_id: `'${ORG}'`, entity_id: `'${ENT}'`, titulo: `'${d().nome.replace(/'/g, "''")}'`, estado: "'aberto'", fecho: "'contrato'", numero: String(id) });

// os produtos e os ramos do caso: os do Catálogo carregado têm id; os do caso que não estão lá entram agora (fixture do teste)
const prodId = new Map<string, string>(), prodVolta = new Map<string, string>(), noId = new Map<string, string>(), noVolta = new Map<string, string>();
async function garantirProduto(p: { id: string; n: string; no: string | null }) {
  if (prodId.has(p.id)) return;
  const u = uid("prod", p.id); prodId.set(p.id, u); prodVolta.set(u, p.id);
  if (p.no && !noId.has(p.no)) { const n = uid("no", p.no); noId.set(p.no, n); noVolta.set(n, p.no);
    await inserir("service_categories", { id: `'${n}'`, organization_id: `'${ORG}'`, name: `'r-${p.no}'`, slug: `'r-${n}'`, created_by: `'${U}'` }); }
  await inserir("products", { id: `'${u}'`, organization_id: `'${ORG}'`, sku: `'t-${u.slice(0, 12)}'`, name: `'${p.n.replace(/'/g, "''")}'`, created_by: `'${U}'`, status: "'active'", tipo_catalogo: "'produto'" });
}

let ok = 0, falhas = 0;
async function passo(nome: string) {
  const L = paraLinhas(d(), HOJE);
  for (const p of [...(L.produtos ?? []), ...L.orcamentos.flatMap((o) => o.produtos ?? [])]) await garantirProduto({ id: p.produto, n: p.nome, no: p.categoria });
  const trocaP = (x: { produto: string; categoria: string | null }) => { x.produto = prodId.get(x.produto)!; x.categoria = x.categoria ? noId.get(x.categoria) ?? null : null; };
  for (const p of L.produtos ?? []) trocaP(p);
  for (const o of L.orcamentos) for (const p of o.produtos ?? []) trocaP(p);
  for (const o of L.orcamentos) for (const l of o.linhas ?? []) if (l.produto) l.produto = prodId.get(l.produto) ?? null;
  const atual = L.orcamentos.find((o) => o.estado !== "substituido");
  if (atual) { atual.preco_final = Math.round(tot(d(), S).pf * 100) / 100; atual.total_com_iva = Math.round(totaisIva(d(), S).total * 100) / 100; }
  try {
    await db.query(`select neg_guardar_negocio($1, $2, $3::jsonb)`, [ORG, NEG, JSON.stringify(paraBase(L, ids))]);
  } catch (e) { falhas++; console.log(`  FALHOU a gravar (${nome}):`, (e as Error).message); return; }
  const lidos = ((await db.query(`select neg_ler_negocios($1) r`, [ORG])).rows[0] as { r: unknown[] }).r;
  const j = lidos.find((x) => (x as { negocio: { id: string } }).negocio.id === NEG);
  const N = deBase(j, ids);
  const volta = (x: { produto: string; categoria: string | null }) => { x.produto = prodVolta.get(x.produto) ?? x.produto; x.categoria = x.categoria ? noVolta.get(x.categoria) ?? x.categoria : null; };
  for (const p of N.linhas.produtos ?? []) volta(p);
  for (const o of N.linhas.orcamentos) for (const p of o.produtos ?? []) volta(p);
  const A1 = JSON.parse(JSON.stringify(deLinhas(N.linhas))), B1 = normalParaComparar(d(), HOJE);
  const dif = (x: unknown, y: unknown, p: string, out: string[]) => {
    if (out.length > 12) return;
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === "object" && typeof y === "object") { for (const k of new Set([...Object.keys(x as object), ...Object.keys(y as object)])) dif((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], p + "." + k, out); return; }
    out.push(`${p}: base ${JSON.stringify(x)?.slice(0, 120)} | emylia ${JSON.stringify(y)?.slice(0, 120)}`);
  };
  const out: string[] = []; dif(A1, B1, "N", out);
  if (!out.length) { ok++; console.log("  certo:", nome); return; }
  falhas++;
  console.log(`  FALHOU (${nome}):\n    ` + out.join("\n    "));
}

await passo("orçamento por zonas");
A.verificar(id);
for (const [k, v] of Object.entries({ validade: "15 dias", inicio_prev: "2026-11-02", garantia: "5 anos", modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Direção", multa: "Não", notas_cliente: "Proposta P-2026-0109." })) A.campo(id, k, v);
const MOMENTO: Prestacao["fase"][] = [0, 0, 0, 1, "fim"];
A.pagamentoPlano(id, PAGAMENTO_MEDIDA, PAGAMENTO.map(([l, p], i) => ({ l, p: p / 100, fase: MOMENTO[i] })));
preencher(d(), PROPOSTA);
await passo("verificado, com as prestações à medida");
A.enviar(id); await passo("proposta enviada");
A.pedirAlteracoes(id, "Quero outro pavimento", ["Outros materiais"]); await passo("o cliente pediu alterações");
A.novaVersao(id, ["Outros materiais"], "Pavimento vinílico", "orcamento"); await passo("nova versão em rascunho");
A.verificar(id); A.enviarVersao(id); await passo("versão 2 enviada");
A.aceitar(id); await passo("proposta aceite");
A.enviarContrato(id); await passo("contrato enviado");
A.pedirAlteracoesContrato(id, [{ c: "Prazo", nota: "Preciso de mais 15 dias" }]); await passo("o cliente pediu para mudar uma cláusula");
A.abrirRevisao(id); A.reverClausula(id, "Prazo", "A obra fica pronta em 45 dias úteis."); A.validarContrato(id); await passo("cláusula revista e validada");
A.enviarContrato(id);
A.assinarCom(id, { tipo: "sms", nome: "Anabela Correia", q: "12/10/2026 12:54", id: "OTP-CC-2026-0331" }); await passo("contrato assinado por SMS");
const temEc = await db.query(`select count(*)::int n from pg_proc where proname='fn_ec_emitida'`);
if ((temEc.rows[0] as { n: number }).n) {
  const r = (await db.query(`select ec_emitida_em, fn_ec_emitida(id) conta from client_contracts where negocio_id=$1 and replaced_by_contract_id is null`, [NEG])).rows[0] as { ec_emitida_em: unknown; conta: boolean };
  if (r.ec_emitida_em === null && r.conta === false) { ok++; console.log("  certo: contrato assinado, a encomenda de cliente ainda não conta"); }
  else { falhas++; console.log("  FALHOU: antes do pagamento a encomenda já conta", JSON.stringify(r)); }
}
const TR = tranchesDe(d());
for (const [k, v] of Object.entries({ nome_fiscal: "Anabela Schroeder", nif_fat: "123456789", serie: "FT 2026", tranche: TR[0].nome, vencimento: "Pronto pagamento", metodo: "Transferência", conta: "Banco A · conta à ordem", comprovativo: "Transferência adjudicação" })) A.campo(id, k, v);
S.role = "financeiro";
A.emitir(id); A.validar(id);
guardarFaturas(S, id, faturasDe(S, d()));
await passo("1.ª fatura paga, com o recibo");
if ((temEc.rows[0] as { n: number }).n) {
  const r = (await db.query(`select ec_emitida_em, fn_ec_emitida(id) conta from client_contracts where negocio_id=$1 and replaced_by_contract_id is null`, [NEG])).rows[0] as { ec_emitida_em: unknown; conta: boolean };
  if (r.ec_emitida_em !== null && r.conta === true) { ok++; console.log("  certo: 1.º pagamento validado, a encomenda de cliente foi emitida e conta"); }
  else { falhas++; console.log("  FALHOU: depois do pagamento a encomenda não conta", JSON.stringify(r), "obra.ec:", !!d().obra?.ec); }
  const pl = (await db.query(`select count(*)::int n, count(*) filter (where product_id is not null and qt >= 1)::int com from quote_lines ql join quotes q on q.id=ql.quote_id where q.negocio_id=$1 and q.estado='aceite' and ql.tipo_emylia='produto' and ql.descricao_snapshot like 'Produto · %'`, [NEG])).rows[0] as { n: number; com: number };
  if (pl.n > 0 && pl.com === pl.n) { ok++; console.log(`  certo: as ${pl.n} linhas de produto têm o produto e a quantidade real`); }
  else { falhas++; console.log("  FALHOU: linhas de produto sem produto", JSON.stringify(pl)); }
  const fns = (await db.query(`select count(*)::int n from pg_proc where proname in ('fn_client_order_line_reservations','rpc_list_client_order_documents','rpc_client_order_list_readiness','fn_client_order_request_missing') and prosrc like '%fn_ec_emitida%'`)).rows[0] as { n: number };
  if (fns.n === 4) { ok++; console.log("  certo: as 4 funções da encomenda de cliente usam fn_ec_emitida"); } else { falhas++; console.log("  FALHOU: funções ajustadas", fns.n); }
}
const c = (await db.query(`select status, signature_method, versao, replaced_by_contract_id is not null substituido from client_contracts where negocio_id=$1 order by versao`, [NEG])).rows;
console.log("  contratos na base:", JSON.stringify(c));
const q = (await db.query(`select versao, estado, proposal_id is not null ligado from quotes where negocio_id=$1 order by versao`, [NEG])).rows;
console.log("  orçamentos na base:", JSON.stringify(q));
const ag = (await db.query(`select visita_numero, status, visit_kind, start_datetime from schedule_items where negocio_id=$1 order by visita_numero`, [NEG])).rows as { visita_numero: number; status: string }[];
console.log("  visitas na agenda:", JSON.stringify(ag));
const visEmylia = (d().vis ?? []).filter((n) => d().f[`v${n}_data`] && d().f[`v${n}_hora`]);
if (ag.length === visEmylia.length && ag.length > 0) { ok++; console.log("  certo: as visitas com dia e hora estão na agenda"); }
else { falhas++; console.log(`  FALHOU: ${visEmylia.length} visitas com dia e hora na Emylia, ${ag.length} na agenda`); }
console.log(`\n${ok} certos, ${falhas} falhados`);
process.exit(falhas ? 1 : 0);

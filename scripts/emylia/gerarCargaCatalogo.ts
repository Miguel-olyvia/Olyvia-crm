// Gera a migration que carrega o Catálogo da Mudelar (o da Emylia) numa organização, a partir dos próprios dados da Emylia
// (src/emylia: seed(), custos0(), catalogo0(), receitaDe), para bater certo com o que ela mostra.
// Os ids são determinísticos (md5 da organização + tipo + chave): correr a migration duas vezes não duplica nada.
//
// Correr (a partir da raiz do repo):
//   npx esbuild scripts/emylia/gerarCargaCatalogo.ts --bundle --platform=node --format=esm --tsconfig=tsconfig.app.json \
//     --outfile=<pasta temporária>/gerar.mjs && node <pasta temporária>/gerar.mjs <org_id> <saida.sql>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { seed, type Estado } from "@/emylia/motor";
import { custos0, receitaDe, type Custos, type ReceitaV2 } from "@/emylia/v2/custosModelo";
import { catalogo0, noDoServico, type Catalogo, type Regra } from "@/emylia/v2/catalogoModelo";
import { CATALOGO_TODO, itemCatalogo } from "@/emylia/catalogo";

const [ORG, SAIDA] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/.test(ORG ?? "") || !SAIDA) throw new Error("uso: gerar.mjs <org_id> <saida.sql>");

const uid = (tipo: string, chave: string) => {
  const h = createHash("md5").update(`${ORG}:${tipo}:${chave}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (v: unknown): string => (v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL")
  : typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const arr = (xs: (string | number)[], tipo: string) => `ARRAY[${xs.map(q).join(",")}]::${tipo}[]`;
const MEDIDA: Record<string, string> = { pav: "m2_pavimento", par: "m2_parede", pts: "pontos_agua", pcs: "pecas_sanitarias" };
const med = (m: string | null | undefined) => (m ? MEDIDA[m] ?? null : null);

const S: Estado = seed();
const C: Custos = custos0();
const K: Catalogo = catalogo0();
const L: string[] = [];
const w = (s: string) => L.push(s);
const USER = "v_user", O = "v_org";

// ------------------------------------------------------------------ árvore
const noId = (id: string) => uid("no", id);
const pai = new Map(K.arvore.map((n) => [n.id, n.pai]));
const ofDe = (no: string | null | undefined): string | null => { if (!no) return null; const p = pai.get(no); return p ? p : no; };
const subDe = (no: string | null | undefined): string | null => (no && pai.get(no) ? no : null);
K.arvore.forEach((n, i) => {
  w(`INSERT INTO service_categories (id, organization_id, parent_id, name, slug, is_active, created_by, sort_order) VALUES (${q(noId(n.id))}, ${O}, ${n.pai ? q(noId(n.pai)) : "NULL"}, ${q(n.n)}, ${q("cat-" + noId(n.id))}, true, ${USER}, ${i}) ON CONFLICT (id) DO NOTHING;`);
});

// ------------------------------------------------------------------ parâmetros, estrutura, perfis, equipamentos
const P = C.par;
w(`INSERT INTO cat_parametros (organization_id, meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo, atualizado_por) VALUES (${O}, ${P.meses}, ${P.tsu}, ${P.segurosAno}, ${P.horasAno}, ${P.horasMes}, ${P.mesesDesatualizado}, ${S.cfg.min}, ${S.cfg.alvo}, ${USER}) ON CONFLICT (organization_id) DO NOTHING;`);
for (const [l, m] of Object.entries(C.minLinha)) if (m != null) w(`INSERT INTO cat_margem_linha (organization_id, linha, margem_minima) VALUES (${O}, ${q(l)}, ${m}) ON CONFLICT DO NOTHING;`);
C.estrutura.forEach((e, i) => w(`INSERT INTO cat_estrutura (id, organization_id, nome, categoria, mensal, ativo, ordem) VALUES (${q(uid("estr", e.id))}, ${O}, ${q(e.n)}, ${q(e.cat)}, ${e.mensal}, ${e.ativo}, ${i}) ON CONFLICT (id) DO NOTHING;`));
const perfilId = (id: string) => uid("perfil", id);
for (const p of C.perfis) w(`INSERT INTO ops_skill (id, organization_id, nome, ativo, salario_referencia, chave) VALUES (${q(perfilId(p.id))}, ${O}, ${q(p.n)}, true, ${q(p.salario)}, ${q(p.id)}) ON CONFLICT DO NOTHING;`);
const equipId = (id: string) => uid("equip", id);
// a vida da Emylia é em horas de uso (amortização/h = compra ÷ vida): vida_horas; vida_anos é o equivalente (vida ÷ uso por ano)
for (const e of C.equip) w(`INSERT INTO cat_equipamentos (id, organization_id, nome, compra, vida_anos, vida_horas, residual, manutencao_ano, uso_ano_horas) VALUES (${q(equipId(e.id))}, ${O}, ${q(e.n)}, ${e.compra}, ${Math.max(0.01, Math.round((e.vida / e.usoAno) * 100) / 100)}, ${e.vida}, ${e.residual}, ${e.manutAno}, ${e.usoAno}) ON CONFLICT (id) DO NOTHING;`);

// ------------------------------------------------------------------ serviços (os do modelo e o Catálogo inteiro)
const sids = [...Object.keys(S.svc), ...CATALOGO_TODO.map((c) => c.id).filter((id) => !S.svc[id])];
const svcId = (sid: string) => uid("svc", sid);
const skus = new Set<string>();
const consumiveis = new Map<string, { id: string; n: string; un: string; preco: number; fornecedor: string; data: string }>();
const consKey = (c: { n: string; un: string; preco: number }) => `${c.n.trim().toLowerCase()}|${c.un}|${c.preco}`;
const regraSql = (r: Regra | undefined) => (r ? (r.k === "fixo" ? { m: "fixo", f: r.q, a: false } : { m: med(r.med), f: r.f, a: r.arred }) : null);
let nSvc = 0, nMo = 0, nEq = 0, nCons = 0, nPreco = 0;
const passos: string[] = [], usosEq: string[] = [], usosCons: string[] = [], precos: string[] = [];
for (const sid of sids) {
  const s = S.svc[sid] ?? null, cat = itemCatalogo(sid);
  const rec: ReceitaV2 | null = receitaDe(C, sid, s, S.cfg.alvo);
  if (!rec) continue;
  const id = svcId(sid);
  const oficio = cat?.cat ?? s?.perfil ?? "";
  const no = K.classe[sid] ?? noDoServico(K, sid, oficio);
  let sku = (cat?.sku || sid).slice(0, 60);
  if (skus.has(sku)) sku = `${sku}-${sid}`.slice(0, 60);
  skus.add(sku);
  const exige = K.exigeProduto?.[sid] ?? null, regraExige = regraSql(K.qtdDe?.[sid]);
  const ent = K.entulhoServico?.[sid];
  w(`INSERT INTO services (id, organization_id, name, slug, sku, service_category_id, service_subcategory_id, service_type, created_by, is_active, unidade, linhas, medida, modo_preco, margem, justificacao_preco, fases, receita_origem, icone, exige_produto_categoria_id, exige_produto_medida, exige_produto_fator, exige_produto_arredondar, pergunta_manter, entulho_modo, entulho_m3, entulho_kg, no_catalogo, chave) VALUES (`
    + [q(id), O, q(s?.n ?? cat!.n), q("svc-" + id), q(sku), no ? q(noId(ofDe(no)!)) : "NULL", subDe(no) ? q(noId(subDe(no)!)) : "NULL", "'sale'", USER, "true",
      q(s?.un ?? cat!.un), arr(cat?.linhas ?? [], "text"), q(med(rec.medida ?? null)), q(rec.modo), q(rec.margem), q(rec.justificacao ?? null),
      arr((K.fasesServico?.[sid] ?? []) as number[], "smallint"), q(rec.origem), q(K.icone?.[sid] ?? null),
      exige ? q(noId(exige)) : "NULL", q(regraExige?.m ?? null), q(regraExige?.f ?? null), String(regraExige?.a ?? false),
      q(K.perguntaManter?.[sid] ?? null), q(ent?.modo ?? null), q(ent?.m3 ?? null), q(ent?.kg ?? null), "true", q(sid)].join(", ")
    + `) ON CONFLICT (id) DO NOTHING;`);
  nSvc++;
  let ordem = 0;
  for (const p of rec.mo) {
    if (!(p.h > 0)) continue;
    ordem++; nMo++;
    const fase = (K.fasesServico?.[sid]?.[0] as number | undefined) ?? 1;
    passos.push(`(${q(uid("mo", sid + ":" + p.id))}, ${O}, ${q(id)}, ${ordem}, ${q(p.n.slice(0, 200))}, ${fase}, ${Math.round(p.h * 60 * 100) / 100}, 0, 1, ${q(perfilId(p.perfil))}, 'manual', ${q(med(rec.medida ?? null) ?? "qt")}, ${USER})`);
  }
  rec.equip.forEach((u, i) => { if (u.h > 0 && C.equip.some((e) => e.id === u.equip)) { nEq++; usosEq.push(`(${q(uid("useq", sid + ":" + u.id))}, ${O}, ${q(id)}, ${q(equipId(u.equip))}, ${u.h}, ${i})`); } });
  rec.cons.forEach((c, i) => {
    const k = consKey(c);
    if (!consumiveis.has(k)) consumiveis.set(k, { id: uid("cons", k), n: c.n, un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data });
    nCons++;
    usosCons.push(`(${q(uid("uscons", sid + ":" + c.id))}, ${O}, ${q(id)}, ${q(consumiveis.get(k)!.id)}, ${Math.round(c.q * 100) / 100}, ${Math.round(c.q * 1e6) / 1e6}, ${!!c.opcional}, ${i}, ${USER})`);
  });
  for (const h of rec.hist) { nPreco++; precos.push(`(${q(uid("preco", sid + ":" + h.data + ":" + h.preco))}, ${q(id)}, 'retail', ${h.preco}, 'EUR', ${q(h.data)}, ${USER}, ${q(h.nota)}, ${s?.iva ?? "NULL"})`); }
  if (rec.modo === "tabela" && !rec.hist.length && rec.precoTabela > 0) { nPreco++; precos.push(`(${q(uid("preco", sid + ":atual"))}, ${q(id)}, 'retail', ${rec.precoTabela}, 'EUR', '2026-01-15', ${USER}, NULL, ${s?.iva ?? "NULL"})`); }
}
for (const c of K.consumiveisCriados ?? []) {
  const k = consKey({ n: c.n, un: c.un, preco: c.preco });
  if (!consumiveis.has(k)) consumiveis.set(k, { id: uid("cons", k), n: c.n, un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data });
}

// ------------------------------------------------------------------ produtos e consumíveis
const prodSql = (id: string, tipo: string, n: string, sku: string, un: string, no: string | null, servico: string | null, fator: number, m3: number | null, kg: number | null, desc: string | null, marca: string | null, fornecedor: string | null) =>
  `INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted, manages_stock, created_by, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico, entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre) VALUES (${q(id)}, ${O}, ${q(sku)}, ${q(n)}, 'active', true, ${tipo === "produto"}, true, false, false, false, ${USER}, ${q(tipo)}, ${q(un)}, ${no ? q(noId(no)) : "NULL"}, ${servico ? q(svcId(servico)) : "NULL"}, ${fator}, ${q(m3)}, ${q(kg)}, ${q(desc)}, ${q(marca || null)}, ${q(fornecedor || null)}) ON CONFLICT (id) DO NOTHING;`;
const precoProd = (id: string, prod: string, tipo: "purchase" | "retail", preco: number, data: string) =>
  `INSERT INTO product_prices (id, product_id, currency, price, preco_exato, valid_from, created_by, price_type) VALUES (${q(id)}, ${q(prod)}, 'EUR', ${Math.round(preco * 100) / 100}, ${Math.round(preco * 1e6) / 1e6}, ${q(data)}, ${USER}, ${q(tipo)}) ON CONFLICT (id) DO NOTHING;`;
let nProd = 0;
for (const p of K.produtos) {
  const id = uid("prod", p.id);
  const desc = p.desc ?? null;
  w(prodSql(id, "produto", p.n, (p.sku || "P-" + id.slice(0, 8)).slice(0, 60) + "-" + id.slice(0, 4), p.un, p.no, p.servico && sids.includes(p.servico) ? p.servico : null, p.fatorServico ?? 1, p.entulho?.m3 ?? null, p.entulho?.kg ?? null, desc, p.marca, p.fornecedor));
  if (p.custo > 0) w(precoProd(uid("pcusto", p.id), id, "purchase", p.custo, p.data));
  // product_prices só aceita um preço por produto, moeda e valid_from (seja qual for o tipo): o PVP fica um segundo depois do custo
  if (p.pvp) w(precoProd(uid("ppvp", p.id), id, "retail", p.pvp, p.data + " 00:00:01+00"));
  nProd++;
}
for (const c of consumiveis.values()) {
  w(prodSql(c.id, "consumivel", c.n, "CONS-" + c.id.slice(0, 8), c.un, null, null, 1, null, null, null, null, c.fornecedor));
  w(precoProd(uid("ccusto", c.id), c.id, "purchase", c.preco, c.data));
}
const lote = (cab: string, linhas: string[]) => { for (let i = 0; i < linhas.length; i += 200) w(`${cab}\n  ${linhas.slice(i, i + 200).join(",\n  ")}\nON CONFLICT (id) DO NOTHING;`); };
lote("INSERT INTO ops_obra_servico_tarefa (id, organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, minutos_fixos, pessoas, skill_id, origem, medida, atualizado_por) VALUES", passos);
lote("INSERT INTO cat_servico_equipamentos (id, organization_id, service_id, equipamento_id, horas, ordem) VALUES", usosEq);
lote("INSERT INTO service_materials (id, organization_id, service_id, product_id, quantity, quantidade_exata, opcional, sort_order, created_by) VALUES", usosCons);
lote("INSERT INTO service_prices (id, service_id, price_type, price, currency, valid_from, created_by, nota, vat_rate) VALUES", precos);

const corpo = L.map((l) => "    " + l.replace(/\n/g, "\n    ")).join("\n");
const sql = `-- Carga do Catálogo da Mudelar (o da Emylia) na organização ${ORG}, como dados de teste do Catálogo e custos.
-- Gerado por scripts/emylia/gerarCargaCatalogo.ts a partir de src/emylia (seed, custos0, catalogo0, receitaDe).
-- ${K.arvore.length} ramos, ${C.perfis.length} perfis, ${C.equip.length} equipamentos, ${C.estrutura.length} custos de estrutura,
-- ${nSvc} serviços (${nMo} passos de mão de obra, ${nEq} usos de equipamento, ${nCons} usos de consumível, ${nPreco} preços),
-- ${nProd} produtos e ${consumiveis.size} consumíveis (por ligar a um fornecedor; a marca e o nome do fornecedor ficam em texto).
-- Só corre se a organização existir. Ids determinísticos e ON CONFLICT DO NOTHING: correr duas vezes não duplica.

SET lock_timeout = '5s';
DO $carga$
DECLARE
  ${O} uuid := '${ORG}';
  ${USER} uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = ${O}) THEN
    RAISE NOTICE 'Organização % não existe nesta base: carga do Catálogo ignorada.', ${O};
    RETURN;
  END IF;
  SELECT m.user_id INTO ${USER} FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id
   WHERE m.organization_id = ${O} ORDER BY m.created_at LIMIT 1;
  IF ${USER} IS NULL THEN RAISE EXCEPTION 'A organização não tem utilizadores (é preciso um para created_by).'; END IF;
${corpo}
END $carga$;
RESET lock_timeout;
`;
writeFileSync(SAIDA, sql.replace(/\r?\n/g, "\r\n"), "utf8");
console.log(`escrito ${SAIDA}: ${nSvc} serviços, ${nMo} passos, ${nEq} equip., ${nCons} usos de consumível, ${nPreco} preços, ${nProd} produtos, ${consumiveis.size} consumíveis, ${K.arvore.length} ramos`);

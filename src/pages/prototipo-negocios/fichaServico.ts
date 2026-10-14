// A ficha do serviço e o Catálogo do V1 (14/10/2026): as contas e as listas, sem React.
// Usa o modelo da V2 (v2/custosModelo.ts e v2/catalogoModelo.ts), para o orçamento ter o mesmo custo:
// aqui só há o que a ficha e as cinco secções do Catálogo (Serviços, Produtos, Equipamentos,
// Consumíveis, Técnicos) precisam a mais: a medida e o exemplo, a conta do €/h do equipamento,
// os consumíveis de todas as receitas, os técnicos e o ícone de cada serviço.

import { CATALOGO_TODO, normal } from "./catalogo";
import { LINHAS, eur, nfmt, type Estado, type MedKey, type Medidas, type SvcId } from "./motor";
import { EX0, type Catalogo, type Produto, type Regra } from "./v2/catalogoModelo";
import {
  HOJE, custoHoraPerfil, equipHora, mesesEntre, perfilDoServico, receitaDe,
  type CustoCalc, type Custos, type Equip, type ItemLista, type Perfil, type ReceitaV2, type Filtro,
} from "./v2/custosModelo";
import type { IconeServicoKey } from "./ilustracoes";
import { ARTIGOS_DEM0, PAR_DEM0, contaExemplo, vSoltoDe, type ArtigoDem, type ContaExemplo, type EntulhoSvc, type ParDem } from "./entulho";
import { entulhoDoProduto, entulhoDoServico, tipoDoTexto } from "./entulhoPadrao";

/* ------------------------------------------------------------------ medida */
/** As unidades de um serviço, para escolher (não escrever). */
export const UNIDADES_SERVICO = ["un", "m²", "ml", "m", "h", "km", "pt", "pç", "mód"] as const;

/** De onde vem a quantidade na visita: as quatro medidas do levantamento, ou o comercial escreve. */
export const ORIGENS_MEDIDA: { k: MedKey | null; t: string }[] = [
  { k: "pav", t: "m² de pavimento" },
  { k: "par", t: "m² de paredes" },
  { k: "pts", t: "Pontos de água" },
  { k: "pcs", t: "Vasos sanitários" },
  { k: null, t: "O comercial escreve" },
];

/** A medida que o modelo (LINHAS do motor) já usa para o serviço, se ele estiver num pacote. */
export function medidaDoModelo(sid: SvcId): MedKey | undefined {
  for (const L of Object.values(LINHAS)) { const m = L.map.find(([s]) => s === sid); if (m) return m[1]; }
  return undefined;
}
/** A medida por omissão: a do modelo, ou a que sai da unidade (m² → pavimento, pt → pontos, pç/mód → vasos); o resto escreve-se. */
export function medidaPorOmissao(sid: SvcId, un: string): MedKey | null {
  const m = medidaDoModelo(sid);
  if (m) return m;
  if (un === "m²") return "pav";
  if (un === "pt") return "pts";
  if (un === "pç" || un === "mód") return "pcs";
  return null;
}
/** A medida de uma receita: a escolhida na ficha (incluindo null), ou a por omissão. */
export const medidaDe = (rec: Pick<ReceitaV2, "medida"> | null | undefined, sid: SvcId, un: string): MedKey | null =>
  rec && rec.medida !== undefined ? rec.medida : medidaPorOmissao(sid, un);

/** A quantidade que sai das medidas da visita; null quando o comercial a escreve. */
export function quantidadeDaMedida(medida: MedKey | null, m: Partial<Medidas>): number | null {
  return medida ? Math.max(0, m[medida] || 0) : null;
}

const nomeMedida = (k: MedKey, q: number) =>
  k === "pav" ? "m² de pavimento" : k === "par" ? "m² de paredes" : k === "pts" ? (q === 1 ? "ponto de água" : "pontos de água") : q === 1 ? "vaso sanitário" : "vasos sanitários";

/** O exemplo da medida: "Numa casa de banho com 4 m² de pavimento → 4 m²". */
export function exemploMedida(medida: MedKey | null, un: string, ex: Medidas = EX0): string {
  if (!medida) return `O comercial escreve a quantidade na visita (por exemplo, 2 ${un}).`;
  const q = ex[medida] || 0;
  return `Numa casa de banho com ${nfmt(q)} ${nomeMedida(medida, q)} → ${nfmt(q)} ${un}`;
}
/** Um aviso quando a medida não bate com a unidade (ex.: m² de pavimento num serviço por un). */
export function avisoMedida(medida: MedKey | null, un: string): string | null {
  if (!medida) return null;
  if ((medida === "pav" || medida === "par") && un !== "m²") return `A medida vem em m², mas o serviço é por ${un}.`;
  if ((medida === "pts" || medida === "pcs") && (un === "m²" || un === "ml" || un === "m" || un === "h" || un === "km")) return `A medida conta peças, mas o serviço é por ${un}.`;
  return null;
}

/* ------------------------------------------------------------------ equipamentos */
export interface QuebraEquip { deprec: number; manut: number; total: number; texto: string }
/** O €/h de um equipamento por partes: (compra − residual) ÷ vida útil + manutenção ÷ uso anual (a soma é equipHora). */
export function quebraEquip(e: Equip): QuebraEquip {
  const deprec = e.vida > 0 ? Math.max(0, e.compra - e.residual) / e.vida : 0;
  const manut = e.usoAno > 0 ? e.manutAno / e.usoAno : 0;
  const total = equipHora(e);
  const h = (x: number) => nfmt(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = `(${eur(e.compra)} € − ${eur(e.residual)} €) ÷ ${h(e.vida)} h + ${eur(e.manutAno)} € ÷ ${h(e.usoAno)} h/ano = ${eur(total)} €/h`;
  return { deprec, manut, total, texto };
}

/* ------------------------------------------------------------------ custo */
export interface ParteCusto { n: string; v: number }
/** As partes do custo por unidade, pela ordem da ficha (a estrutura só quando está ligada). Os opcionais ficam de fora. */
export function partesCusto(c: CustoCalc, estrutura: boolean): ParteCusto[] {
  return [
    { n: "Mão de obra", v: c.mo }, { n: "Equipamentos", v: c.eq }, { n: "Consumíveis", v: c.cons },
    ...(estrutura ? [{ n: "Estrutura", v: c.estr }] : []),
  ];
}
/** O custo por unidade se se usarem também os consumíveis opcionais. */
export const custoComOpcionais = (c: CustoCalc) => c.total + c.consOpc;

/* ------------------------------------------------------------------ ícone */
const POR_TEXTO: [RegExp, IconeServicoKey][] = [
  [/entulho/, "entulho"], [/demol|levantamento de|supress|anula/, "demolicao"], [/sanita|louca|lavatorio|bide/, "loucas"], [/duche|resguardo|banheira/, "duche"],
  [/esgoto/, "esgoto"], [/gas|itg/, "gas"], [/ilumina|candeeiro/, "iluminacao"], [/eletric|eletr|tomada/, "eletricidade"], [/canaliz|agua/, "canalizacao"],
  [/pavim/, "pavimento"], [/revest|ladrilh|nicho|murete|alvenaria/, "revestimento"], [/pladur|teto falso/, "pladur"], [/pint/, "pintura"],
  [/cozinha/, "cozinha"], [/movel|moveis|mobiliario|montag/, "moveis"], [/janela/, "janela"], [/porta/, "porta"], [/ar condicionado|avac|climatiz/, "avac"],
  [/impermeab/, "impermeabilizacao"], [/limpeza/, "limpeza"], [/desloca/, "deslocacao"], [/projeto/, "projeto"], [/subempreit|subcontrat/, "subcontrato"],
  [/carpint|montador/, "carpintaria"],
];
/** O ícone de um serviço: o escolhido no Catálogo (K.icone), senão o que sai do nome e, por fim, do ofício. */
export function iconeDoServico(K: Pick<Catalogo, "icone">, sid: SvcId, nome: string, oficio: string): IconeServicoKey {
  const k = K.icone?.[sid];
  if (k) return k;
  for (const t of [nome, oficio]) { const n = normal(t); const r = POR_TEXTO.find(([re]) => re.test(n)); if (r) return r[1]; }
  return "outro";
}

/* ------------------------------------------------------------------ a lista de serviços */
export type FiltroV1 = Filtro | "alertas";
export const FILTROS_V1: { id: FiltroV1 | null; t: string }[] = [
  { id: null, t: "Todos" }, { id: "uso", t: "Em uso" }, { id: "alertas", t: "Com alertas" }, { id: "margem", t: "Margem baixa" },
];
export function passaFiltroV1(i: ItemLista, f: FiltroV1 | null): boolean {
  if (!f) return true;
  if (f === "alertas") return i.alertas.length > 0;
  if (f === "uso") return i.emUso;
  if (f === "sem-receita") return i.alertas.some((a) => a.id === "sem-receita");
  if (f === "margem") return i.alertas.some((a) => a.id === "abaixo-minimo" || a.id === "abaixo-custo");
  return i.alertas.some((a) => a.id === "desatualizado");
}
/** A margem em palavras, para a linha do Catálogo. */
export function margemEmPalavras(m: number, min: number, alvo: number): string {
  if (m < 0) return "abaixo do custo";
  if (m < min / 100) return "abaixo do mínimo";
  if (m < alvo / 100 - 0.0005) return "abaixo do alvo";
  return "no alvo";
}
export interface Grupo<T> { oficio: string; itens: T[] }
/** Agrupa por ofício, pela ordem dada (os ofícios que não estão na ordem vão para o fim, por ordem alfabética). */
export function agruparPorOficio<T extends { oficio: string }>(L: T[], ordem: string[]): Grupo<T>[] {
  const m = new Map<string, T[]>();
  for (const i of L) { const g = m.get(i.oficio); if (g) g.push(i); else m.set(i.oficio, [i]); }
  const fora = [...m.keys()].filter((o) => !ordem.includes(o)).sort((a, b) => a.localeCompare(b, "pt"));
  return [...ordem, ...fora].filter((o) => m.has(o)).map((o) => ({ oficio: o, itens: m.get(o)! }));
}

/* ------------------------------------------------------------------ produtos */
/** Os produtos que trazem este serviço quando se escolhem na visita. */
export const produtosQueTrazem = (K: Pick<Catalogo, "produtos">, sid: SvcId): Produto[] => K.produtos.filter((p) => p.servico === sid);
/** Procura em nome, marca, SKU e subcategoria (sem acentos). */
export function pesquisarProdutos(L: Produto[], q: string): Produto[] {
  const qq = normal(q.trim());
  if (!qq) return L;
  return L.filter((p) => normal(`${p.n} ${p.marca} ${p.sku ?? ""} ${p.sub ?? ""} ${p.fornecedor}`).includes(qq));
}
/** O preço de venda de um produto: o PVP real, ou o custo com a margem dada (sobre o preço). */
export const precoProduto = (p: Produto, margem: number) => (p.pvp != null ? p.pvp : margem < 100 ? p.custo / (1 - margem / 100) : 0);

/** As regras de quantidade do produto obrigatório, para escolher. */
export const REGRAS_QTD: { t: string; r: Regra }[] = [
  { t: "1 por serviço", r: { k: "fixo", q: 1 } },
  { t: "1 por m² de pavimento", r: { k: "por", med: "pav", f: 1, arred: false } },
  { t: "1,1 por m² de pavimento (com 10% de quebras), arredondado", r: { k: "por", med: "pav", f: 1.1, arred: true } },
  { t: "1,1 por m² de paredes (com 10% de quebras), arredondado", r: { k: "por", med: "par", f: 1.1, arred: true } },
  { t: "1 por ponto de água", r: { k: "por", med: "pts", f: 1, arred: false } },
  { t: "1 por vaso sanitário", r: { k: "por", med: "pcs", f: 1, arred: false } },
];
export const chaveRegra = (r: Regra) => (r.k === "fixo" ? `fixo:${r.q}` : `por:${r.med}:${r.f}:${r.arred ? 1 : 0}`);

/** As perguntas que se podem escolher antes de obrigar ao produto. */
export function perguntasPossiveis(atual: string | undefined, coisa: string): string[] {
  const c = coisa.trim().toLowerCase();
  const L = [atual, c ? `O cliente mantém ${c}?` : "", "O cliente mantém o que existe?"].filter((x): x is string => !!x);
  return [...new Set(L)];
}

/* ------------------------------------------------------------------ consumíveis */
export interface ConsCatalogo {
  n: string; un: string; preco: number; fornecedor: string; data: string;
  /** Os serviços cuja receita o usa. */
  servicos: SvcId[];
  /** Em quantas receitas é opcional. */
  opcionalEm: number;
  desatualizado: boolean;
}
/** Todos os sids do Catálogo: os em uso (S.svc) e os do Catálogo real. */
export const todosSids = (S: Estado): SvcId[] => [...Object.keys(S.svc), ...CATALOGO_TODO.map((c) => c.id).filter((id) => !S.svc[id])];

/** Os consumíveis de todas as receitas, um por nome, com o preço mais recente. */
export function consumiveisCatalogo(S: Estado, C: Custos, hoje = HOJE): ConsCatalogo[] {
  const m = new Map<string, ConsCatalogo>();
  for (const sid of todosSids(S)) {
    const rec = receitaDe(C, sid, S.svc[sid] ?? null, S.cfg.alvo);
    if (!rec) continue;
    for (const c of rec.cons) {
      const k = normal(c.n), x = m.get(k);
      if (!x) { m.set(k, { n: c.n, un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data, servicos: [sid], opcionalEm: c.opcional ? 1 : 0, desatualizado: false }); continue; }
      if (!x.servicos.includes(sid)) x.servicos.push(sid);
      if (c.opcional) x.opcionalEm++;
      if (c.data > x.data) Object.assign(x, { un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data });
    }
  }
  const L = [...m.values()];
  for (const x of L) x.desatualizado = mesesEntre(x.data, hoje) >= C.par.mesesDesatualizado;
  return L.sort((a, b) => a.n.localeCompare(b.n, "pt"));
}

/* ------------------------------------------------------------------ técnicos */
export interface TecnicoLinha { p: Perfil; eh: number | null; servicos: number }
/** Os perfis com o €/h e quantos serviços em uso os usam. */
export function tecnicosCatalogo(S: Estado, C: Custos): TecnicoLinha[] {
  return C.perfis.map((p) => ({
    p, eh: custoHoraPerfil(p, C.par),
    servicos: Object.keys(S.svc).filter((sid) => (C.receitas[sid]?.mo.map((x) => x.perfil) ?? [perfilDoServico(C, S.svc[sid].perfil)]).includes(p.id)).length,
  }));
}
/** Quantas receitas (em uso) usam um equipamento. */
export const usosEquip = (S: Estado, C: Custos, id: string) =>
  Object.keys(S.svc).filter((sid) => receitaDe(C, sid, S.svc[sid], S.cfg.alvo)?.equip.some((u) => u.equip === id)).length;

/* ------------------------------------------------------------------ entulho (14/10) */
/** A quantidade de exemplo da ficha: a da medida no exemplo (EX0), ou 2 quando o comercial a escreve. */
export const qtdExemplo = (medida: MedKey | null, ex: Medidas = EX0) => (medida ? ex[medida] || 0 : 2);
export interface EntulhoFicha {
  e: EntulhoSvc; q: number;
  /** O artigo (modo "artigo") ou o produto do exemplo (modo "produto"). */
  artigo: ArtigoDem | null; produto: { n: string; m3: number; kg?: number; doTipo: boolean; tipo: string } | null;
  conta: ContaExemplo | null;
  /** A frase do exemplo ("Numa casa de banho com…"), a conta e o custo por unidade do serviço (só entulho). */
  de: string; custoUn: number;
}
/** A conta do entulho na ficha, com a quantidade de exemplo e os parâmetros de produção (os do Catálogo). */
export function entulhoFicha(K: Catalogo, sid: SvcId, nome: string, un: string, medida: MedKey | null): EntulhoFicha {
  const e = entulhoDoServico(K, sid), q = qtdExemplo(medida), P: ParDem = K.parDem ?? PAR_DEM0;
  const base = { e, q, artigo: null, produto: null, conta: null, de: "", custoUn: 0 } as EntulhoFicha;
  if (e.modo === "artigo") {
    const a = (K.artigosDem ?? ARTIGOS_DEM0).find((x) => x.codigo === K.artigoDoServico?.[sid]) ?? null;
    if (!a) return base;
    const conta = contaExemplo({ q, un, m3Un: vSoltoDe(a), kgUn: a.peso, horasUn: a.tempo, consUn: a.cons }, P);
    return { ...base, artigo: a, conta, de: `Com o artigo ${a.codigo}`, custoUn: q ? conta.custo / q : 0 };
  }
  if (e.modo === "produto") {
    const lig = produtosQueTrazem(K, sid).map((p) => ({ p, en: entulhoDoProduto(p) }));
    const um = lig.find((x) => x.en.m3 > 0);
    const t = tipoDoTexto(nome) ?? tipoDoTexto(K.arvore.find((x) => x.id === K.exigeProduto?.[sid])?.n);
    const produto = um ? { n: um.p.n, ...um.en } : t && t.e.m3 > 0 ? { n: t.nome, ...t.e, doTipo: true, tipo: t.nome } : null;
    if (!produto) return base;
    const conta = contaExemplo({ q, un, m3Un: produto.m3, kgUn: produto.kg }, P);
    return { ...base, produto, conta, de: um ? `Pelo produto «${um.p.n}»${produto.doTipo ? ` (valor do tipo ${produto.tipo})` : ""}` : `Pelo tipo ${produto.tipo} (sem produto ligado)`, custoUn: q ? conta.custo / q : 0 };
  }
  if (e.modo === "m3" && (e.m3 ?? 0) > 0) {
    const conta = contaExemplo({ q, un, m3Un: e.m3 ?? 0, kgUn: e.kg }, P);
    return { ...base, conta, de: `${nfmt(e.m3 ?? 0)} m³ por ${un}`, custoUn: q ? conta.custo / q : 0 };
  }
  return base;
}

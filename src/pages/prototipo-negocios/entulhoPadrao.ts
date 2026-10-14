// O entulho por omissão dos serviços e dos produtos (14/10/2026), e o entulho que as linhas de serviço de um
// orçamento geram (modos "produto" e "m3"; ver entulho.ts). Funções puras, sem React.
//
// Os valores com origem na especificação da Mudelar (Ricardo Belchior, 14/10/2026, exemplo 2) estão marcados "(esp.)":
// sanita 0,06 m³ e 25 kg, bidé 0,05, lavatório com móvel 0,15, banheira de aço ou acrílico 0,40, torneiras e
// acessórios 0,01, azulejo 0,035 m³/m² e pavimento com betonilha 0,084 m³/m². Os outros são ESTIMATIVAS, a afinar
// com as obras reais (como o T_dem e o V_solto). Sem kg, o peso sai do volume × densidade (1,4 t/m³).
import { CATALOGO_TODO, itemCatalogo, normal } from "./catalogo";
import { ilustracaoDoProduto, type IlustracaoKey } from "./ilustracoes";
import { toneladas, type EntulhoProd, type EntulhoSvc, type ItemVol, type ModoEntulho, type ParDem } from "./entulho";
import type { LinhaOrc, SvcId } from "./motor";
import type { NecVisita } from "./produtosVisita";
import type { Catalogo, Produto } from "./v2/catalogoModelo";

/* ------------------------------------------------------------------ produtos: o entulho por tipo */
/** Um tipo de produto que sai: o nome (para "2 × sanita que sai") e o entulho por unidade. */
export interface TipoEntulho { nome: string; e: EntulhoProd }
// A ordem conta: o mais específico primeiro. Procura-se na subcategoria real (sub), depois no nome e por fim na
// ilustração (img). m³ 0 = não é entulho de obra: os acessórios que saem com a peça, os revestimentos e pavimentos
// (a remoção deles é um artigo de demolição, DEM-AZU-01 ou DEM-PAV-01, para não contar duas vezes) e os
// eletrodomésticos e aparelhos (são REEE, com circuito próprio, não vão para o operador de RCD).
const TIPOS: [RegExp, TipoEntulho][] = [
  [/kit.?s? para sanitarios|placa de acionamento|autoclismo/, { nome: "acessório da sanita", e: { m3: 0 } }],
  [/banheira.*ferro|ferro fundido/, { nome: "banheira de ferro fundido", e: { m3: 0.4, kg: 120 } }], // (esp.)
  [/bases? (de )?duche|base-duche|poliban/, { nome: "base de duche", e: { m3: 0.1 } }],
  [/colunas? (de )?duche|coluna-duche|chuveiro/, { nome: "coluna de duche", e: { m3: 0.02 } }],
  [/loucas?/, { nome: "sanita", e: { m3: 0.06, kg: 25 } }], // "Montagem de louças", "Louças e torneiras": a peça típica é a sanita
  [/torneira|misturadora|sifo|sifao|valvula/, { nome: "torneira", e: { m3: 0.01 } }], // (esp.)
  [/bide/, { nome: "bidé", e: { m3: 0.05 } }], // (esp.)
  [/sanita/, { nome: "sanita", e: { m3: 0.06, kg: 25 } }], // (esp.)
  [/banheira/, { nome: "banheira", e: { m3: 0.4 } }], // (esp.)
  [/resguardo/, { nome: "resguardo", e: { m3: 0.1, kg: 30 } }],
  [/moveis? de lavatorio|movel-wc|tampos? .*wc|^colunas?$/, { nome: "móvel de lavatório", e: { m3: 0.15 } }], // (esp., com o lavatório)
  [/lavatorio/, { nome: "lavatório", e: { m3: 0.15 } }], // (esp.)
  [/espelho/, { nome: "espelho", e: { m3: 0.02 } }],
  [/toalheiro/, { nome: "toalheiro", e: { m3: 0.02 } }],
  [/acessorio|porta-rolos|cabide|piacaba|prateleira|cesto|pega/, { nome: "acessório", e: { m3: 0.01 } }],
  [/cozinha completa|conjunto de moveis de cozinha/, { nome: "cozinha", e: { m3: 2, kg: 300 } }],
  [/lava.?lo[iu]ca|cuba/, { nome: "lava-loiça", e: { m3: 0.05 } }],
  [/bancada|tampo|laminado/, { nome: "bancada", e: { m3: 0.1 } }],
  [/armario|armario-cozinha|modulo|mobiliario|cozinha/, { nome: "móvel de cozinha", e: { m3: 0.3 } }],
  [/roupeiro/, { nome: "roupeiro", e: { m3: 0.5 } }],
  [/janela/, { nome: "janela", e: { m3: 0.15 } }],
  [/porta/, { nome: "porta", e: { m3: 0.15 } }],
  [/eletrodomestico|frigorifico|forno|maquina|micro|placa|exaustor|esquentador|termoacumulador|avac|ventax/, { nome: "aparelho (REEE)", e: { m3: 0 } }],
  [/pavimento|revestimento|ceramico|porcelanico|spc|microcimento|azulejo/, { nome: "revestimento (artigo de demolição)", e: { m3: 0 } }],
];
const SEM_TIPO: TipoEntulho = { nome: "produto", e: { m3: 0 } };

/** O tipo de um texto (subcategoria, nome, ilustração, ramo da árvore), ou null. */
export function tipoDoTexto(t: string | null | undefined): TipoEntulho | null {
  if (!t) return null;
  const n = normal(t);
  return TIPOS.find(([re]) => re.test(n))?.[1] ?? null;
}
/** O tipo de um produto: pela subcategoria, pelo nome e pela ilustração (img, ou a que sai do nome). */
export function tipoDoProduto(p: Pick<Produto, "n"> & { sub?: string; img?: IlustracaoKey }): TipoEntulho {
  return tipoDoTexto(p.sub) ?? tipoDoTexto(p.n) ?? tipoDoTexto(ilustracaoDoProduto(p)) ?? SEM_TIPO;
}
/** O entulho de um produto: o do Catálogo (Produto.entulho) ou, sem ele, o do tipo. Diz de onde veio. */
export function entulhoDoProduto(p: Pick<Produto, "n"> & { sub?: string; img?: IlustracaoKey; entulho?: EntulhoProd }): EntulhoProd & { doTipo: boolean; tipo: string } {
  const t = tipoDoProduto(p);
  return p.entulho ? { ...p.entulho, doTipo: false, tipo: t.nome } : { ...t.e, doTipo: true, tipo: t.nome };
}

/* ------------------------------------------------------------------ serviços: o modo por omissão */
// Remover: demolir, remover, levantar ou retirar (o "levantar" só nas Demolições: "Levantamento de parede em
// alvenaria" é construir). O serviço que já é a remoção do entulho (vazadouro) não gera mais: contaria a dobrar.
const RE_REMOVER = /demol|remo[cv]|retir/;
const RE_LEVANTAR = /levant/;
const RE_E_ENTULHO = /entulho|vazadouro/;
const RE_TROCAR = /substitu|troca/;
/** O m³ (e kg) por unidade dos serviços de remover sem artigo, pelo nome; o resto 0,05 m³ (estimativa). */
const M3_POR_NOME: [RegExp, { m3: number; kg?: number }][] = [
  [/sanit/, { m3: 0.06, kg: 25 }], // (esp.)
  [/banheira|poliban/, { m3: 0.4 }], // (esp.)
  [/porta/, { m3: 0.15 }],
  [/parede|alvenaria/, { m3: 0.14 }], // tijolo de 10 cm: 0,10 m³/m² × 1,4 de empolamento
  [/pavimento|betonilha/, { m3: 0.084 }], // (esp.)
  [/azulejo|revestimento/, { m3: 0.035 }], // (esp.)
  [/movel|moveis|mobiliario/, { m3: 0.3 }],
];
/**
 * O modo por omissão de um serviço, pelo nome e pelo ofício:
 *   · a própria remoção do entulho (vazadouro) → "nao";
 *   · demolir, remover, retirar (ou levantar, nas Demolições) → "artigo" se o serviço já tem artigo de demolição,
 *     senão "m3" (com o m³ por unidade que o nome sugere);
 *   · substituir, trocar, ou instalar no lugar de um produto exigido (o serviço obriga a produto e pergunta
 *     "O cliente mantém…?") → "produto", menos os de m² ou ml (revestimentos e pavimentos: a remoção do que
 *     está é um artigo de demolição, DEM-AZU-01 ou DEM-PAV-01) → "nao";
 *   · o resto → "nao".
 */
export function entulhoPadraoServico(K: Pick<Catalogo, "artigoDoServico" | "exigeProduto" | "perguntaManter">, sid: SvcId, nome: string, oficio: string, un: string): EntulhoSvc {
  const n = normal(nome), of = normal(oficio);
  if (RE_E_ENTULHO.test(n)) return { modo: "nao" };
  if (RE_REMOVER.test(n) || (RE_LEVANTAR.test(n) && of.startsWith("demoli"))) {
    if (K.artigoDoServico?.[sid]) return { modo: "artigo" };
    const m = M3_POR_NOME.find(([re]) => re.test(n))?.[1] ?? { m3: 0.05 };
    return { modo: "m3", ...m };
  }
  const troca = RE_TROCAR.test(n) || (!!K.exigeProduto?.[sid] && !!K.perguntaManter?.[sid]?.trim());
  if (troca) return un === "m²" || un === "ml" ? { modo: "nao" } : { modo: "produto" };
  return { modo: "nao" };
}

/** Os serviços dos pacotes (motor): nome, ofício e unidade (o motor não se importa aqui, para não haver ciclos). */
const PACOTE: Record<SvcId, [string, string, string]> = {
  demol: ["Demolição e entulho", "Demolições", "m²"], canal: ["Canalização", "Canalização", "pt"], revest: ["Revestimento de parede", "Revestimentos", "m²"],
  pav: ["Pavimento cerâmico", "Revestimentos", "m²"], loucas: ["Montagem de louças", "Canalização", "pç"], moveis: ["Montagem de móveis", "Carpintaria", "mód"],
  eletr: ["Pontos elétricos", "Eletricidade", "pt"], teto: ["Teto falso em pladur", "Carpintaria", "m²"], pint: ["Pintura de tetos e paredes", "Pintura", "m²"],
};
/** Nome, ofício e unidade de um serviço (do pacote ou do Catálogo). */
export function dadosServico(sid: SvcId): { n: string; oficio: string; un: string } {
  const p = PACOTE[sid];
  if (p) return { n: p[0], oficio: p[1], un: p[2] };
  const c = itemCatalogo(sid);
  return { n: c?.n ?? sid, oficio: c?.cat ?? "", un: c?.un ?? "un" };
}

/** Aplica os valores por omissão a um Catálogo (catalogo0): o modo de cada serviço e o entulho de cada produto. */
export function aplicarEntulhoPadrao(K: Catalogo): void {
  const ent: Record<SvcId, EntulhoSvc> = {};
  for (const sid of [...Object.keys(PACOTE), ...CATALOGO_TODO.map((c) => c.id)]) {
    const d = dadosServico(sid);
    ent[sid] = entulhoPadraoServico(K, sid, d.n, d.oficio, d.un);
  }
  K.entulhoServico = ent;
  // só os que geram entulho ficam com o valor escrito (os outros usam o tipo, que se vê na ficha como "do tipo")
  for (const p of K.produtos) {
    const t = tipoDoProduto(p);
    if (t.e.m3 > 0) p.entulho = { ...t.e };
  }
}

/** O entulho de um serviço: o do Catálogo, ou o por omissão. Com artigo de demolição, o modo é sempre "artigo". */
export function entulhoDoServico(K: Pick<Catalogo, "artigoDoServico" | "exigeProduto" | "perguntaManter" | "entulhoServico">, sid: SvcId): EntulhoSvc {
  if (K.artigoDoServico?.[sid]) return { modo: "artigo" };
  const e = K.entulhoServico?.[sid];
  if (e) return e.modo === "artigo" ? { modo: "nao" } : e; // "artigo" sem artigo: não há conta
  const d = dadosServico(sid);
  return entulhoPadraoServico(K, sid, d.n, d.oficio, d.un);
}
export const modoEntulho = (K: Parameters<typeof entulhoDoServico>[0], sid: SvcId): ModoEntulho => entulhoDoServico(K, sid).modo;

/* ------------------------------------------------------------------ no orçamento */
/** Os nós de um ramo (ele e os de baixo). */
function ramoDe(K: Pick<Catalogo, "arvore">, no: string): Set<string> {
  const r = new Set([no]);
  for (let mudou = true; mudou;) { mudou = false; for (const x of K.arvore) if (x.pai && r.has(x.pai) && !r.has(x.id)) { r.add(x.id); mudou = true; } }
  return r;
}
const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");

/**
 * O entulho das linhas de serviço de um orçamento (modos "produto" e "m3"), como itens de volume:
 *   · "m3":      quantidade da linha × m³ (e kg) por unidade;
 *   · "produto": os produtos da visita que o serviço troca (os que o trazem, ou os do ramo que ele obriga a escolher),
 *                cada um com o entulho do Catálogo ou do tipo × a quantidade; se o cliente mantém, nada. Sem produto
 *                escolhido mas com a resposta "Troca" ("O cliente mantém…?" → Não), usa-se o tipo do ramo × a quantidade
 *                da linha. Sem resposta nem produto, não se adivinha. Cada produto conta uma vez.
 * As linhas com artigo de demolição (modo "artigo") ficam para os artigos.
 */
export function volumesDasLinhas(linhas: LinhaOrc[], K: Catalogo, v: NecVisita, P: Pick<ParDem, "densidade">): ItemVol[] {
  const out: ItemVol[] = [], usados = new Set<string>(), prod = (v.prod ?? []).filter((p) => p.q > 0);
  for (const l of linhas) {
    if (l.t !== "svc" || !(l.q > 0)) continue;
    const e = entulhoDoServico(K, l.sid);
    if (e.modo === "m3" && (e.m3 ?? 0) > 0) {
      const d = dadosServico(l.sid), m3 = l.q * (e.m3 ?? 0);
      out.push({ de: l.sid, m3, t: toneladas(m3, e.kg != null ? e.kg * l.q : undefined, P), origem: `${fmt(l.q)} ${d.un} × ${fmt(e.m3 ?? 0)} m³ · ${d.n}` });
      continue;
    }
    if (e.modo !== "produto" || v.manter?.[l.sid] === "sim") continue;
    const no = K.exigeProduto?.[l.sid], ramo = no ? ramoDe(K, no) : null;
    const saem = prod.filter((p) => !usados.has(p.id) && (p.svc === l.sid || (ramo && p.no && ramo.has(p.no))));
    for (const p of saem) {
      usados.add(p.id);
      const cat = K.produtos.find((x) => x.id === p.id) ?? { n: p.n };
      const en = entulhoDoProduto(cat);
      if (!(en.m3 > 0)) continue;
      const m3 = p.q * en.m3;
      out.push({ de: l.sid, m3, t: toneladas(m3, en.kg != null ? en.kg * p.q : undefined, P), origem: `${fmt(p.q)} × ${en.tipo} que sai` });
    }
    if (!saem.length && v.manter?.[l.sid] === "nao") {
      const t = tipoDoTexto(dadosServico(l.sid).n) ?? tipoDoTexto(no ? K.arvore.find((x) => x.id === no)?.n : null);
      if (t && t.e.m3 > 0) {
        const m3 = l.q * t.e.m3;
        out.push({ de: l.sid, m3, t: toneladas(m3, t.e.kg != null ? t.e.kg * l.q : undefined, P), origem: `${fmt(l.q)} × ${t.nome} que sai (valor do tipo)` });
      }
    }
  }
  return out;
}

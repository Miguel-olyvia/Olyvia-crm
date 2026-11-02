// Secções e fases da obra nas linhas de uma Encomenda de Cliente (02/11/2026).
// As linhas dividem-se em Produtos, Serviços e "Consumíveis para os serviços", e cada uma mostra a fase da obra em que entra.
// A fase vem da MESMA regra que a obra usa (src/emylia/fasesObra.ts): os serviços pelas fases da ficha (ou as por omissão, pelo nome e
// pelo ofício: fasesDoServico) e os produtos/consumíveis por faseDoMaterialNaObra, com os serviços DA ENCOMENDA como os serviços da
// obra (o serviço que instala o produto, a receita que o gasta, ou o nome). Funções puras: as leituras estão em
// useClientOrderLinePhases.ts.
import {
  faseDoMaterialNaObra,
  fasesDoServico,
  oficioDoServico,
  type ComFases,
  type FaseObra,
  type ServicoNaObra,
} from "@/emylia/fasesObra";

/** O que se lê do Catálogo para as linhas da encomenda (só leitura; ver useClientOrderLinePhases). */
export interface ClientOrderPhaseCatalog {
  /** products: tipo_catalogo ('produto' | 'consumivel' | null) e o serviço que o instala (servico_id). */
  products: Record<string, { tipo_catalogo: string | null; servico_id: string | null }>;
  /** services: o nome, as fases da ficha (vazio = as por omissão), a chave (os do modelo) e o nome da categoria (o ofício). */
  services: Record<string, { name: string; fases: number[] | null; chave: string | null; categoria: string | null }>;
  /** service_materials ativos: serviço → produtos da receita (os consumíveis que gasta). */
  recipes: Record<string, string[]>;
}

export type ClientOrderLineSection = "products" | "services" | "consumables";

export const CLIENT_ORDER_SECTION_LABELS: Record<ClientOrderLineSection, string> = {
  products: "Produtos",
  services: "Serviços",
  consumables: "Consumíveis para os serviços",
};

export interface ClientOrderLinePhase {
  section: ClientOrderLineSection;
  /** As fases da linha (um serviço pode ter várias); vazio quando não se conseguiu ler o Catálogo. */
  fases: FaseObra[];
  /** Nos consumíveis: os serviços da encomenda que os gastam (ou o que os instala), para o "para: …". */
  forServices: string[];
}

/** O mínimo da linha da encomenda que a classificação usa. */
export interface ClientOrderPhaseLine {
  item_type: "product" | "service";
  product_id: string | null;
  product_name: string | null;
  service_id: string | null;
  service_name: string | null;
}

const FASES_VALIDAS = new Set<number>([1, 2, 3, 4]);
const asFases = (v: number[] | null | undefined): FaseObra[] =>
  (Array.isArray(v) ? v.map(Number).filter((n) => FASES_VALIDAS.has(n)) : []) as FaseObra[];

/** As fases da ficha de cada serviço, no formato do motor (K.fasesServico), pelo id do serviço. */
function fasesDaFicha(cat: ClientOrderPhaseCatalog): ComFases {
  const fasesServico: Record<string, FaseObra[]> = {};
  for (const [id, s] of Object.entries(cat.services)) {
    const f = asFases(s.fases);
    if (f.length) fasesServico[id] = f;
  }
  return { fasesServico };
}

/** Os serviços da encomenda como "serviços da obra" da regra única: nome e ofício como o plano os vê, e a receita. */
function servicosDaEncomenda(lines: readonly ClientOrderPhaseLine[], cat: ClientOrderPhaseCatalog): ServicoNaObra[] {
  const out: ServicoNaObra[] = [];
  const vistos = new Set<string>();
  for (const l of lines) {
    if (l.item_type !== "service" || !l.service_id || vistos.has(l.service_id)) continue;
    vistos.add(l.service_id);
    const s = cat.services[l.service_id];
    out.push({
      sid: l.service_id,
      nome: s?.name || l.service_name || "",
      oficio: oficioDoServico(s?.chave, s?.categoria),
      cons: (cat.recipes[l.service_id] ?? []).map((id) => ({ id })),
    });
  }
  return out;
}

/**
 * A secção e a fase de cada linha (pela ordem das linhas). Sem Catálogo (`cat` null: a leitura falhou ou ainda não chegou), tudo fica em
 * Produtos/Serviços e sem fase, como antes.
 */
export function clientOrderLinePhases(
  lines: readonly ClientOrderPhaseLine[],
  cat: ClientOrderPhaseCatalog | null,
): ClientOrderLinePhase[] {
  if (!cat) {
    return lines.map((l) => ({ section: l.item_type === "service" ? "services" : "products", fases: [], forServices: [] }));
  }
  const K = fasesDaFicha(cat);
  const servicos = servicosDaEncomenda(lines, cat);
  return lines.map((l): ClientOrderLinePhase => {
    if (l.item_type === "service") {
      const s = l.service_id ? cat.services[l.service_id] : undefined;
      const nome = s?.name || l.service_name || "";
      const fases = l.service_id || nome ? fasesDoServico(K, l.service_id ?? "", nome, oficioDoServico(s?.chave, s?.categoria)) : [];
      return { section: "services", fases, forServices: [] };
    }
    const p = l.product_id ? cat.products[l.product_id] : undefined;
    const r = faseDoMaterialNaObra(
      K,
      { id: l.product_id, n: l.product_name || "", servico: p?.servico_id ?? null },
      servicos,
    );
    // Consumível: o do Catálogo, ou (produto fora do Catálogo, tipo_catalogo null) o que está na receita de um serviço da encomenda.
    const naReceita = !!l.product_id && servicos.some((s) => (cat.recipes[s.sid] ?? []).includes(l.product_id!));
    const consumivel = p?.tipo_catalogo === "consumivel" || (!p?.tipo_catalogo && naReceita);
    return {
      section: consumivel ? "consumables" : "products",
      fases: [r.fase],
      forServices: consumivel ? r.servicos.map((s) => s.nome).filter(Boolean) : [],
    };
  });
}

const ORDEM_SECCOES: ClientOrderLineSection[] = ["products", "services", "consumables"];

/**
 * As linhas agrupadas por secção (Produtos, Serviços, Consumíveis; só as que têm linhas), cada uma ordenada pela primeira fase e,
 * na mesma fase (ou sem fase), pela ordem original.
 */
export function groupClientOrderLines<L extends ClientOrderPhaseLine>(
  lines: readonly L[],
  cat: ClientOrderPhaseCatalog | null,
): { section: ClientOrderLineSection; rows: { line: L; phase: ClientOrderLinePhase }[] }[] {
  const phases = clientOrderLinePhases(lines, cat);
  const primeira = (p: ClientOrderLinePhase) => (p.fases.length ? p.fases[0] : 99);
  return ORDEM_SECCOES.map((section) => ({
    section,
    rows: lines
      .map((line, i) => ({ line, phase: phases[i], i }))
      .filter((x) => x.phase.section === section)
      .sort((a, b) => primeira(a.phase) - primeira(b.phase) || a.i - b.i)
      .map(({ line, phase }) => ({ line, phase })),
  })).filter((g) => g.rows.length > 0);
}

import { describe, expect, it } from "vitest";
import {
  clientOrderLinePhases,
  groupClientOrderLines,
  type ClientOrderPhaseCatalog,
  type ClientOrderPhaseLine,
} from "../clientOrderLinePhases";

const prod = (product_id: string, product_name: string): ClientOrderPhaseLine => ({
  item_type: "product", product_id, product_name, service_id: null, service_name: null,
});
const svc = (service_id: string, service_name: string): ClientOrderPhaseLine => ({
  item_type: "service", product_id: null, product_name: null, service_id, service_name,
});

const CAT: ClientOrderPhaseCatalog = {
  products: {
    sanita: { tipo_catalogo: "produto", servico_id: "s-loucas" },
    azulejo: { tipo_catalogo: "produto", servico_id: null },
    cola: { tipo_catalogo: "consumivel", servico_id: null },
    silicone: { tipo_catalogo: null, servico_id: null },
    fita: { tipo_catalogo: "consumivel", servico_id: null },
  },
  services: {
    "s-loucas": { name: "Montagem de louças sanitárias", fases: [], chave: "loucas", categoria: "Canalização" },
    "s-revest": { name: "Revestimento de parede", fases: [], chave: null, categoria: "Revestimentos" },
    "s-pint": { name: "Pintura de paredes", fases: [4, 3], chave: null, categoria: "Pintura" },
  },
  recipes: { "s-revest": ["cola", "silicone"], "s-loucas": ["silicone"] },
};

describe("Encomenda de Cliente: secções e fases das linhas", () => {
  const lines = [
    prod("sanita", "Sanita suspensa"),
    svc("s-pint", "Pintura de paredes"),
    prod("azulejo", "Cerâmico de parede 30×60"),
    prod("silicone", "Silicone sanitário"),
    svc("s-loucas", "Montagem de louças sanitárias"),
    prod("cola", "Cimento-cola C2"),
    prod("fita", "Fita de pintor"),
    svc("s-revest", "Revestimento de parede"),
  ];

  it("classifica e dá a fase pela regra única da obra", () => {
    const r = clientOrderLinePhases(lines, CAT);
    // a sanita é instalada pelas louças, que estão na encomenda: a última fase delas
    expect(r[0]).toEqual({ section: "products", fases: [4], forServices: [] });
    // a ficha da pintura (4, 3) ganha às regras, ordenada
    expect(r[1]).toEqual({ section: "services", fases: [3, 4], forServices: [] });
    // produto sem serviço nem receita: pelo nome
    expect(r[2]).toEqual({ section: "products", fases: [3], forServices: [] });
    // fora do Catálogo (tipo null) mas na receita do revestimento (3) e das louças (4): consumível, na 3, para os dois
    expect(r[3]).toEqual({ section: "consumables", fases: [3], forServices: ["Revestimento de parede", "Montagem de louças sanitárias"] });
    expect(r[4]).toEqual({ section: "services", fases: [4], forServices: [] });
    expect(r[5]).toEqual({ section: "consumables", fases: [3], forServices: ["Revestimento de parede"] });
    // consumível do Catálogo que nenhum serviço da encomenda gasta: pelo nome, sem "para"
    expect(r[6]).toEqual({ section: "consumables", fases: [4], forServices: [] });
  });

  it("agrupa por secção (só as que têm linhas) e ordena pela primeira fase, com a ordem original a desempatar", () => {
    const g = groupClientOrderLines(lines, CAT);
    expect(g.map((x) => x.section)).toEqual(["products", "services", "consumables"]);
    expect(g[0].rows.map((x) => x.line.product_id)).toEqual(["azulejo", "sanita"]);
    expect(g[1].rows.map((x) => x.line.service_id)).toEqual(["s-pint", "s-revest", "s-loucas"]);
    expect(g[2].rows.map((x) => x.line.product_id)).toEqual(["silicone", "cola", "fita"]);
    expect(groupClientOrderLines([prod("azulejo", "Azulejo")], CAT).map((x) => x.section)).toEqual(["products"]);
  });

  it("sem Catálogo: Produtos e Serviços, sem fase, pela ordem de sempre", () => {
    const g = groupClientOrderLines(lines, null);
    expect(g.map((x) => x.section)).toEqual(["products", "services"]);
    expect(g[0].rows.every((x) => x.phase.fases.length === 0)).toBe(true);
    expect(g[0].rows.map((x) => x.line.product_id)).toEqual(["sanita", "azulejo", "silicone", "cola", "fita"]);
  });

  it("o produto cujo serviço de instalação não está na encomenda não usa esse serviço", () => {
    const r = clientOrderLinePhases([prod("sanita", "Sanita suspensa"), svc("s-revest", "Revestimento de parede")], CAT);
    expect(r[0]).toEqual({ section: "products", fases: [4], forServices: [] });
  });
});

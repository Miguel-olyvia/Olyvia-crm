// 17/11 (correção do utilizador): o menu lateral do Catálogo só tem DOIS itens, Produtos e Serviços, ativos em todas as subrotas deles.
// A navegação dentro de cada um faz-se pelos separadores da página (SeparadoresCatalogo).
import { describe, expect, it } from "vitest";
import { translations } from "@/translations";
import { itemAtivo } from "./itemAtivo";
import { menuSections, topLevelItems } from "./menuConfig";

const secao = menuSections.find((s) => s.id === "catalogo")!;
const [produtos, servicos] = secao.items;

describe("menuConfig: a secção Catálogo", () => {
  it("existe como secção e já não é item de topo", () => {
    expect(secao).toBeDefined();
    expect(topLevelItems.find((i) => i.id === "catalogo")).toBeUndefined();
    expect(topLevelItems.some((i) => i.to === "/catalogo-custos")).toBe(false);
  });
  it("abre em /catalogo e pede services.view, a mesma de antes", () => {
    expect(secao.paths).toEqual(["/catalogo"]);
    expect(secao.permissions).toEqual(["services.view"]);
    expect(secao.labelKey).toBe("sidebar.catalogoCustos");
  });
  it("tem só dois itens, Produtos e Serviços, sem sub-secções nem itens de gestão", () => {
    expect(secao.items.map((i) => i.to)).toEqual(["/catalogo/produtos", "/catalogo/servicos"]);
    expect(secao.items.map((i) => i.labelKey)).toEqual(["sidebar.catalogoProdutos", "sidebar.catalogoServicos"]);
    expect(secao.subSections ?? []).toEqual([]);
  });
  it("os dois itens pedem services.view, não são exatos e têm rótulo em pt, en, es e fr", () => {
    const t = translations as Record<string, Record<string, string>>;
    secao.items.forEach((i) => { expect(i.permission, i.to).toBe("services.view"); expect(i.exact, i.to).toBeFalsy(); });
    for (const l of ["pt", "en", "es", "fr"]) secao.items.forEach((i) => expect(t[l][i.labelKey], `${l} ${i.labelKey}`).toBeTruthy());
  });
});

describe("item ativo no Catálogo", () => {
  it("Produtos fica ativo na lista, nas páginas de gestão e na ficha; Serviços não", () => {
    for (const p of ["/catalogo/produtos", "/catalogo/produtos/categorias", "/catalogo/produtos/referencia", "/catalogo/produtos/familias", "/catalogo/produtos/abc-123"]) {
      expect(itemAtivo(produtos, p), p).toBe(true);
      expect(itemAtivo(servicos, p), p).toBe(false);
    }
  });
  it("Serviços fica ativo na lista, nos separadores (Ligações incluída) e na ficha; Produtos não", () => {
    for (const p of ["/catalogo/servicos", "/catalogo/servicos/equipamentos", "/catalogo/servicos/consumiveis", "/catalogo/servicos/tecnicos", "/catalogo/servicos/ligacoes", "/catalogo/servicos/s-1"]) {
      expect(itemAtivo(servicos, p), p).toBe(true);
      expect(itemAtivo(produtos, p), p).toBe(false);
    }
  });
});

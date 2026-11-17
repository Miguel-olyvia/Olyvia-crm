// 17/11: o Catálogo passou de item de topo a secção com menu lateral (como as Organizações): Produtos, Serviços e Ligações.
import { describe, expect, it } from "vitest";
import { translations } from "@/translations";
import { itemAtivo } from "./itemAtivo";
import { menuSections, topLevelItems } from "./menuConfig";

const secao = menuSections.find((s) => s.id === "catalogo")!;
const sub = (key: string) => secao.subSections!.find((x) => x.key === key)!;
const todos = [...secao.items, ...secao.subSections!.flatMap((x) => x.items)];

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
  it("tem as sub-secções Produtos, Serviços e Ligações, por esta ordem (Ligações no fim), todas abertas, e nada solto antes delas", () => {
    expect(secao.subSections!.map((x) => x.key)).toEqual(["catalogo-produtos", "catalogo-servicos", "catalogo-ligacoes"]);
    secao.subSections!.forEach((x) => expect(x.defaultExpanded, x.key).toBe(true));
    expect(secao.items).toEqual([]);
    expect(sub("catalogo-ligacoes").items.map((i) => i.to)).toEqual(["/catalogo/ligacoes"]);
  });
  it("Produtos: Lista (exata), Categorias, Subcategorias, Modelos, Marcas, Atributos, Referência (SKU)", () => {
    expect(sub("catalogo-produtos").items.map((i) => i.to)).toEqual([
      "/catalogo/produtos", "/catalogo/produtos/categorias", "/catalogo/produtos/subcategorias", "/catalogo/produtos/modelos",
      "/catalogo/produtos/marcas", "/catalogo/produtos/atributos", "/catalogo/produtos/referencia",
    ]);
    expect(sub("catalogo-produtos").items[0].exact).toBe(true);
  });
  it("Serviços: Lista (exata), Equipamentos, Consumíveis, Técnicos", () => {
    expect(sub("catalogo-servicos").items.map((i) => i.to)).toEqual([
      "/catalogo/servicos", "/catalogo/servicos/equipamentos", "/catalogo/servicos/consumiveis", "/catalogo/servicos/tecnicos",
    ]);
    expect(sub("catalogo-servicos").items[0].exact).toBe(true);
  });
  it("todos os itens pedem services.view e têm rótulo em pt, en, es e fr", () => {
    const t = translations as Record<string, Record<string, string>>;
    const chaves = [...todos.map((i) => i.labelKey), ...secao.subSections!.map((x) => x.labelKey)];
    todos.forEach((i) => expect(i.permission, i.to).toBe("services.view"));
    for (const l of ["pt", "en", "es", "fr"]) chaves.forEach((k) => expect(t[l][k], `${l} ${k}`).toBeTruthy());
  });
});

describe("item ativo no Catálogo", () => {
  const lista = sub("catalogo-produtos").items[0];
  const categorias = sub("catalogo-produtos").items[1];
  const listaServicos = sub("catalogo-servicos").items[0];
  it("a Lista só realça no caminho exato; as páginas de gestão não a realçam", () => {
    expect(itemAtivo(lista, "/catalogo/produtos")).toBe(true);
    expect(itemAtivo(lista, "/catalogo/produtos/categorias")).toBe(false);
    expect(itemAtivo(categorias, "/catalogo/produtos/categorias")).toBe(true);
    expect(itemAtivo(listaServicos, "/catalogo/servicos/equipamentos")).toBe(false);
    expect(itemAtivo(listaServicos, "/catalogo/servicos")).toBe(true);
  });
  it("só um item de cada vez fica realçado em cada página", () => {
    for (const p of ["/catalogo/produtos", "/catalogo/produtos/marcas", "/catalogo/servicos", "/catalogo/servicos/tecnicos", "/catalogo/ligacoes"])
      expect(todos.filter((i) => itemAtivo(i, p)).map((i) => i.to), p).toEqual([p]);
  });
});

// 17/11 (correção do utilizador): dentro das páginas Produtos e Serviços, a navegação faz-se por separadores no topo; cada separador é uma rota.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SeparadoresCatalogo } from "./SeparadoresCatalogo";

afterEach(cleanup);
const montar = (grupo: "produtos" | "servicos", ativo: string) => {
  const ir = vi.fn();
  render(<SeparadoresCatalogo grupo={grupo} ativo={ativo} ir={ir} painelId="painel-x" />);
  return ir;
};
const rotulos = () => screen.getAllByRole("tab").map((t) => t.textContent);

describe("SeparadoresCatalogo", () => {
  it("Produtos: Lista, Categorias, Subcategorias, Modelos, Marcas, Atributos, Referência (SKU)", () => {
    montar("produtos", "lista");
    expect(rotulos()).toEqual(["Lista", "Categorias", "Subcategorias", "Modelos", "Marcas", "Atributos", "Referência (SKU)"]);
  });
  it("Serviços: Lista, Equipamentos, Consumíveis, Técnicos, Ligações", () => {
    montar("servicos", "lista");
    expect(rotulos()).toEqual(["Lista", "Equipamentos", "Consumíveis", "Técnicos", "Ligações"]);
  });
  it("só o separador ativo está selecionado e controla o painel", () => {
    montar("produtos", "marcas");
    const sel = screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(sel.map((t) => t.textContent)).toEqual(["Marcas"]);
    expect(sel[0]).toHaveAttribute("aria-controls", "painel-x");
  });
  it.each([
    ["produtos", "Lista", "/catalogo/produtos"], ["produtos", "Categorias", "/catalogo/produtos/categorias"], ["produtos", "Subcategorias", "/catalogo/produtos/subcategorias"],
    ["produtos", "Modelos", "/catalogo/produtos/modelos"], ["produtos", "Marcas", "/catalogo/produtos/marcas"], ["produtos", "Atributos", "/catalogo/produtos/atributos"],
    ["produtos", "Referência (SKU)", "/catalogo/produtos/referencia"],
    ["servicos", "Lista", "/catalogo/servicos"], ["servicos", "Equipamentos", "/catalogo/servicos/equipamentos"], ["servicos", "Consumíveis", "/catalogo/servicos/consumiveis"],
    ["servicos", "Técnicos", "/catalogo/servicos/tecnicos"], ["servicos", "Ligações", "/catalogo/servicos/ligacoes"],
  ] as const)("%s: clicar em «%s» navega para %s", (grupo, rotulo, rota) => {
    const ir = montar(grupo, grupo === "produtos" ? "categorias" : "equipamentos");
    fireEvent.click(screen.getByRole("tab", { name: rotulo }));
    expect(ir).toHaveBeenCalledWith(rota);
  });
  it("as setas, o Início e o Fim movem entre separadores, navegando", () => {
    const ir = montar("servicos", "lista");
    const lista = screen.getByRole("tab", { name: "Lista" });
    fireEvent.keyDown(lista, { key: "ArrowRight" });
    expect(ir).toHaveBeenLastCalledWith("/catalogo/servicos/equipamentos");
    fireEvent.keyDown(lista, { key: "ArrowLeft" });
    expect(ir).toHaveBeenLastCalledWith("/catalogo/servicos/ligacoes");
    fireEvent.keyDown(lista, { key: "End" });
    expect(ir).toHaveBeenLastCalledWith("/catalogo/servicos/ligacoes");
    fireEvent.keyDown(lista, { key: "Home" });
    expect(ir).toHaveBeenLastCalledWith("/catalogo/servicos");
  });
});

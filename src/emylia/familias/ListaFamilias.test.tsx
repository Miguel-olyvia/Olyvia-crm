// A lista de famílias: o botão «Ver» (com o ícone do cubo) abre a vista da família, e o clique no nome também; Editar e Apagar ficam onde estavam e só aparecem a quem pode editar.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));

import { ListaFamilias } from "./ListaFamilias";

afterEach(cleanup);

const FAMILIAS = [
  { id: "f1", nome: "Base de Duche CACH 70 × 100 cm", nProdutos: 36, versao: "v1" },
  { id: "f 2", nome: "Sanita GLAMIC BTW", nProdutos: 3, versao: "v1" },
];
const montar = (podeEditar: boolean) => render(
  <MemoryRouter><ListaFamilias familias={FAMILIAS} podeEditar={podeEditar} aAbrir={null} onEditar={() => undefined} onApagar={() => undefined} /></MemoryRouter>,
);
const linha = (nome: string) => screen.getByText(nome).closest("li")!;

describe("ListaFamilias: Ver", () => {
  it("cada família tem um «Ver» que abre /catalogo/produtos/familias/:id", () => {
    montar(true);
    const ver = within(linha("Base de Duche CACH 70 × 100 cm")).getByRole("link", { name: "Ver a família Base de Duche CACH 70 × 100 cm" });
    expect(ver.textContent).toBe("Ver");
    expect(ver.getAttribute("href")).toBe("/catalogo/produtos/familias/f1");
    expect(within(linha("Sanita GLAMIC BTW")).getByRole("link", { name: /Ver a família/ }).getAttribute("href")).toBe("/catalogo/produtos/familias/f%202");
  });

  it("o botão tem o ícone do cubo (decorativo) e 44 px de altura mínima", () => {
    montar(true);
    const ver = screen.getAllByRole("link", { name: /Ver a família/ })[0]!;
    expect(ver.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(ver.className).toContain("min-h-11");
  });

  it("clicar no nome da família leva ao mesmo sítio", () => {
    montar(true);
    expect(within(linha("Sanita GLAMIC BTW")).getByRole("link", { name: "Sanita GLAMIC BTW" }).getAttribute("href")).toBe("/catalogo/produtos/familias/f%202");
  });

  it("quem pode editar continua a ver Editar e Apagar, ao lado do Ver", () => {
    montar(true);
    const l = within(linha("Base de Duche CACH 70 × 100 cm"));
    expect(l.getByRole("button", { name: "Editar Base de Duche CACH 70 × 100 cm" })).toBeTruthy();
    expect(l.getByRole("button", { name: "Apagar Base de Duche CACH 70 × 100 cm" })).toBeTruthy();
  });

  it("quem não pode editar vê só o Ver (a rota exige só services.view)", () => {
    montar(false);
    const l = within(linha("Base de Duche CACH 70 × 100 cm"));
    expect(l.getByRole("link", { name: /Ver a família/ })).toBeTruthy();
    expect(l.queryByRole("button")).toBeNull();
  });
});

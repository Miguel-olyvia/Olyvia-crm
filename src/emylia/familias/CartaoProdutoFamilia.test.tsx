// O cartão do produto escolhido na vista da família: sempre um produto REAL (nome, referência com copiar, preço de venda, stock só informativo, selo «Rascunho»,
// «Abrir produto»). Sem a permissão a linha do preço ou do stock não aparece (nunca «0 €», «—» nem «sem acesso»); nunca custo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));

import { produto } from "./fixturesFamiliaVista";
import { CartaoProdutoFamilia } from "./CartaoProdutoFamilia";

const P = produto("p1", {}, { nome: "Base de Duche CACH Antracita 70X100 LISO", sku: "DB-BD-0003-AN-LS-70X100", pvp: 205, stock: 0 });
const montar = (p: typeof P | null) => render(<MemoryRouter><CartaoProdutoFamilia produto={p} /></MemoryRouter>);
const escrever = vi.fn(async () => undefined);

beforeEach(() => { escrever.mockClear(); Object.defineProperty(navigator, "clipboard", { value: { writeText: escrever }, configurable: true }); });
afterEach(cleanup);

describe("CartaoProdutoFamilia", () => {
  it("mostra o nome, a referência e o preço de venda", () => {
    montar(P);
    expect(screen.getByRole("heading", { name: "Base de Duche CACH Antracita 70X100 LISO" })).toBeTruthy();
    expect(screen.getByText("DB-BD-0003-AN-LS-70X100")).toBeTruthy();
    expect(screen.getByText(/205,00\s€/)).toBeTruthy();
    expect(screen.getByText("Preço de venda")).toBeTruthy();
  });

  it("«Abrir produto» leva à ficha do produto (/catalogo/produtos/:id)", () => {
    montar(P);
    expect(screen.getByRole("link", { name: "Abrir o produto Base de Duche CACH Antracita 70X100 LISO" }).getAttribute("href")).toBe("/catalogo/produtos/p1");
    expect(screen.getByRole("link", { name: /Abrir o produto/ }).textContent).toBe("Abrir produto");
  });

  it("copiar a referência escreve-a na área de transferência e diz que copiou", async () => {
    montar(P);
    fireEvent.click(screen.getByRole("button", { name: "Copiar a referência DB-BD-0003-AN-LS-70X100" }));
    expect(escrever).toHaveBeenCalledWith("DB-BD-0003-AN-LS-70X100");
    await waitFor(() => expect(screen.getByText("Referência copiada.")).toBeTruthy());
  });

  it("se copiar falha, diz-o (não finge que copiou)", async () => {
    escrever.mockRejectedValueOnce(new Error("bloqueado"));
    montar(P);
    fireEvent.click(screen.getByRole("button", { name: /Copiar a referência/ }));
    await waitFor(() => expect(screen.getByText("Não foi possível copiar a referência.")).toBeTruthy());
    expect(screen.queryByText("Referência copiada.")).toBeNull();
  });

  it("stock: «Em stock: N unidades», informativo; 1 é «unidade»; 0 também se mostra", () => {
    const { rerender } = montar(P);
    expect(screen.getByText("Em stock: 0 unidades")).toBeTruthy();
    rerender(<MemoryRouter><CartaoProdutoFamilia produto={{ ...P, stock: 1 }} /></MemoryRouter>);
    expect(screen.getByText("Em stock: 1 unidade")).toBeTruthy();
    rerender(<MemoryRouter><CartaoProdutoFamilia produto={{ ...P, stock: 12 }} /></MemoryRouter>);
    expect(screen.getByText("Em stock: 12 unidades")).toBeTruthy();
  });

  it("sem permissão de stock (null) a linha não aparece e não diz «sem acesso»", () => {
    montar({ ...P, stock: null });
    expect(screen.queryByText(/Em stock/)).toBeNull();
    expect(screen.queryByText(/acesso/i)).toBeNull();
  });

  it("sem PVP (null) a linha do preço não aparece: nem «0 €» nem «—»", () => {
    montar({ ...P, pvp: null });
    expect(screen.queryByText("Preço de venda")).toBeNull();
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("um produto em rascunho leva o selo «Rascunho»; um ativo não", () => {
    const { rerender } = montar({ ...P, estado: "draft" });
    expect(screen.getByText("Rascunho")).toBeTruthy();
    rerender(<MemoryRouter><CartaoProdutoFamilia produto={P} /></MemoryRouter>);
    expect(screen.queryByText("Rascunho")).toBeNull();
  });

  it("sem produto para a escolha diz-o, sem botões", () => {
    montar(null);
    expect(screen.getByText("Não há um produto para esta escolha.")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

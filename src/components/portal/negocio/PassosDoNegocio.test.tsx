// Os passos do negócio no portal do cliente, nos dois idiomas: o português fica como era; o inglês traduz só as palavras
// (o dinheiro e os números ficam iguais).
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";
import { formatCurrency } from "@/lib/utils";
import { PASSOS_PORTAL, PassosDoNegocio, passoDoNegocio } from "./PassosDoNegocio";

beforeEach(() => {
  window.localStorage.clear();
  reporIdiomaEmMemoria();
});
afterEach(() => reporIdiomaEmMemoria());

describe("PassosDoNegocio em português (como sempre)", () => {
  it("mostra a barra, o cartão do passo e o total", () => {
    render(<PassosDoNegocio passo={3} titulo="Contrato 1" total={1234.5} prazo="3 semanas" />);
    expect(screen.getByRole("list", { name: "Passos do negócio" })).toBeInTheDocument();
    expect(screen.getByText("Rever a proposta")).toBeInTheDocument();
    expect(screen.getByText("Passo 3 de 5")).toBeInTheDocument();
    expect(screen.getByText("Assine o contrato")).toBeInTheDocument();
    expect(screen.getByText("A proposta foi aceite. Leia o contrato e assine com o código que lhe enviamos por SMS.")).toBeInTheDocument();
    expect(screen.getByText("Total, com IVA")).toBeInTheDocument();
    expect(screen.getByText("Prazo")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(1234.5))).toBeInTheDocument();
    expect(document.body.textContent).toContain("(feito)");
    expect(document.body.textContent).toContain("(passo atual)");
  });
});

describe("PassosDoNegocio em inglês", () => {
  it("traduz as palavras e deixa o dinheiro como está", () => {
    definirIdioma("en");
    render(<PassosDoNegocio passo={4} titulo="Contract 1" total={1234.5} prazo="3 semanas" />);
    expect(screen.getByRole("list", { name: "Project steps" })).toBeInTheDocument();
    expect(screen.getByText("Sign the contract")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 5")).toBeInTheDocument();
    expect(screen.getByText("Your project is under way")).toBeInTheDocument();
    expect(screen.getByText("Total, incl. VAT")).toBeInTheDocument();
    expect(screen.getByText("Deadline")).toBeInTheDocument();
    // o dinheiro não muda com o idioma
    expect(screen.getByText(formatCurrency(1234.5))).toBeInTheDocument();
    // o que vem de fora (título e prazo) fica como veio
    expect(screen.getByText("Contract 1")).toBeInTheDocument();
    expect(screen.getByText("3 semanas")).toBeInTheDocument();
    expect(document.body.textContent).toContain("(done)");
    expect(document.body.textContent).toContain("(current step)");
    expect(document.body.textContent).not.toContain("Passo");
  });
});

describe("o passo vem do estado real, não do idioma", () => {
  it("os códigos de estado não mudam", () => {
    definirIdioma("en");
    expect(passoDoNegocio("accepted", "signed")).toBe(4);
    expect(passoDoNegocio("accepted", null)).toBe(3);
    expect(passoDoNegocio("sent", null)).toBe(1);
    expect(PASSOS_PORTAL.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

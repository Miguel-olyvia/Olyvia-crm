// Inventário (mockup): o menu só o mostra na V2 e na V2 funcional; a página mostra o iframe; "Repor inventário" limpa as chaves do mockup.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrototipoNegocios from "../PrototipoNegocios";
import InventarioMockup from "./InventarioMockup";
import { esquecerPessoas } from "../PessoasSimples";
import { esquecerPessoasFunc } from "../PessoasFunc";
import { esquecerNegociosFunc } from "../NegociosFunc";
import { esquecerDiaADia } from "../diaADia";

const CHAVE = "olyvia-prototipo-v2";
const app = (guardado: string | null): void => {
  localStorage.clear();
  if (guardado !== null) localStorage.setItem(CHAVE, guardado);
  render(<PrototipoNegocios />);
};
const lateral = (): HTMLElement => screen.getAllByRole("navigation", { name: "Menu" })[0];
const entrada = (): HTMLElement | null => within(lateral()).queryByRole("button", { name: "Inventário completo" });

beforeEach(() => { esquecerPessoas(); esquecerPessoasFunc(); esquecerNegociosFunc(); esquecerDiaADia(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Inventário (mockup) no menu", () => {
  it("não aparece na Atual", () => {
    app(null);
    expect(entrada()).toBeNull();
  });
  it("aparece na V2 e na V2 funcional", () => {
    app("1");
    expect(entrada()).not.toBeNull();
    cleanup();
    app("funcional");
    expect(entrada()).not.toBeNull();
  });
  it("abre a página com o iframe e, ao mudar para a Atual, volta a Negócios", async () => {
    app("1");
    fireEvent.click(entrada()!);
    const frame = await screen.findByTitle("Inventário (exemplo)");
    expect(frame.getAttribute("srcdoc")?.length ?? 0).toBeGreaterThan(1000);
    expect(screen.getByText("Inventário · dados de exemplo")).toBeInTheDocument();
    const seletor = screen.getAllByRole("group", { name: "Versão" })[0];
    fireEvent.click(within(seletor).getByRole("button", { name: "Atual" }));
    expect(screen.queryByTitle("Inventário (exemplo)")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })[0].textContent).toBe("Negócios");
  });
});

describe("Repor inventário", () => {
  it("limpa as chaves do mockup, deixa as outras e recria o iframe", async () => {
    render(<InventarioMockup />);
    const antes = await screen.findByTitle("Inventário (exemplo)");
    localStorage.setItem("inv-mockup-tab", "x");
    localStorage.setItem("inv-mockup-db-v3", "{}");
    localStorage.setItem("outra-chave", "fica");
    fireEvent.click(screen.getByRole("button", { name: "Repor inventário" }));
    await waitFor(() => expect(screen.getByTitle("Inventário (exemplo)")).not.toBe(antes));
    expect(localStorage.getItem("inv-mockup-tab")).toBeNull();
    expect(localStorage.getItem("inv-mockup-db-v3")).toBeNull();
    expect(localStorage.getItem("outra-chave")).toBe("fica");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() }, functions: { invoke: vi.fn() }, auth: { getUser: vi.fn() } } }));
import { DocumentosParaCliente } from "./DocumentosParaCliente";
import { definirModoReal } from "./acessosPortal";
import type { Negocio } from "./motor";

const d = (enviada: string | null) => ({ id: 1014, orc: enviada ? { enviada } : null, hist: [] }) as unknown as Negocio;

describe("DocumentosParaCliente", () => {
  afterEach(() => { cleanup(); definirModoReal(null); });
  it("fora de uma organização real não aparece", () => {
    const { container } = render(<DocumentosParaCliente d={d("02/11")} />);
    expect(container.innerHTML).toBe("");
  });
  it("antes de a proposta seguir não aparece", () => {
    definirModoReal("org-1", "Nike");
    const { container } = render(<DocumentosParaCliente d={d(null)} />);
    expect(container.innerHTML).toBe("");
  });
  it("com a proposta no portal, mostra o botão de enviar", () => {
    definirModoReal("org-1", "Nike");
    render(<DocumentosParaCliente d={d("02/11")} />);
    expect(screen.getByRole("button", { name: "Enviar um documento ao cliente" })).toBeTruthy();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const rpc = vi.fn();
const sbFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...a: unknown[]) => sbFrom(...a), rpc: (...a: unknown[]) => rpc(...a), storage: { from: vi.fn() }, functions: { invoke: vi.fn() }, auth: { getUser: vi.fn() } } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
// 06/11/2026: pôr/tirar do portal pede portal.manage OU negocios.proposta.enviar (usePodeEnviarPropostaPortal).
let gerePortal = true;
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (c: string) => gerePortal && c === "portal.manage", loading: false }) }));
import { DocumentosParaCliente } from "./DocumentosParaCliente";
import { definirModoReal } from "./acessosPortal";
import type { Negocio } from "./motor";

const d = (enviada: string | null) => ({ id: 1014, orc: enviada ? { enviada } : null, hist: [] }) as unknown as Negocio;

describe("DocumentosParaCliente", () => {
  afterEach(() => { cleanup(); definirModoReal(null); gerePortal = true; rpc.mockReset(); sbFrom.mockReset(); });
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

  it("sem portal.manage nem negocios.proposta.enviar, o envio fica desligado e diz porquê (06/11)", async () => {
    gerePortal = false;
    rpc.mockResolvedValue({ data: false, error: null });
    const cadeia: Record<string, unknown> = {};
    ["select", "eq", "is", "order", "limit"].forEach((m) => { cadeia[m] = () => cadeia; });
    cadeia.maybeSingle = async () => ({ data: { id: "neg-1" } });
    (cadeia as { then?: unknown }).then = (ok: (v: unknown) => void) => ok({ data: [{ id: "prop-1" }] });
    sbFrom.mockImplementation((tabela: string) => (tabela === "documents"
      ? { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) }) }
      : cadeia));
    definirModoReal("org-1", "Nike");
    render(<DocumentosParaCliente d={d("02/11")} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar um documento ao cliente" }));
    const botao = await screen.findByRole("button", { name: /Escolher o ficheiro e enviar/ });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(rpc).toHaveBeenCalledWith("fn_cat_pode", { p_org: "org-1", p_perm: "negocios.proposta.enviar" });
    expect(await screen.findByText(/requer negocios.proposta.enviar ou portal.manage/)).toBeTruthy();
  });
});

// 04/11/2026: «Acesso ao portal» em /negocios (o botão do cabeçalho, o «Tentar de novo» e o reenvio ao mudar o email) pede a
// permissão REAL de quem está ligado, a mesma de create-client-portal-access: proposta → portal.manage OU negocios.proposta.enviar
// (fn_cat_pode); contrato → portal.manage OU client_contracts.send_signature. Sem ela, fica desligado com o motivo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ perms: new Set<string>(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => m.rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (c: string) => m.perms.has(c), loading: false }) }));

import { seed, type Negocio } from "./motor";
import { definirModoReal } from "./acessosPortal";
import { BotaoAcessoPortal, EstadoAcessoPortal } from "./AcessoPortalNegocio";
import { EditarCliente } from "./EditarCliente";
import type { Ctx } from "./pecas";

const negocio = (contrato: string | null): Negocio => {
  const d = structuredClone(seed().deals.find((x) => x.orc)!) as Negocio;
  d.orc = { ...d.orc!, enviada: "hoje", contrato } as Negocio["orc"];
  d.f = { ...d.f, email: "cliente@exemplo.pt" };
  return d;
};
const montar = (d: Negocio) => {
  const acessoPortal = vi.fn();
  const ctx = { S: seed(), A: { acessoPortal }, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn() } as unknown as Ctx;
  return { acessoPortal, ctx };
};

beforeEach(() => { m.perms = new Set(); m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: false, error: null }); definirModoReal("org-1", "Olyvia Demo"); });
afterEach(() => { cleanup(); definirModoReal(null); });

describe("«Acesso ao portal» com a permissão real", () => {
  it("proposta sem permissão: desligado com o motivo, e o clique não envia", async () => {
    const d = negocio(null), { acessoPortal, ctx } = montar(d);
    render(<BotaoAcessoPortal ctx={ctx} d={d} />);
    const b = await screen.findByRole("button", { name: /Acesso ao portal\s*\(sem permissão\)/ });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("title", expect.stringContaining("negocios.proposta.enviar ou portal.manage"));
    fireEvent.click(b);
    expect(acessoPortal).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenCalledWith("fn_cat_pode", { p_org: "org-1", p_perm: "negocios.proposta.enviar" });
  });

  it("proposta com negocios.proposta.enviar (fn_cat_pode, também o caso do admin do sistema): ligado e envia", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    const d = negocio(null), { acessoPortal, ctx } = montar(d);
    render(<BotaoAcessoPortal ctx={ctx} d={d} />);
    const b = screen.getByRole("button", { name: /Acesso ao portal/ });
    await waitFor(() => expect(b).toBeEnabled());
    expect(b).toHaveAccessibleName("Acesso ao portal");
    fireEvent.click(b);
    expect(acessoPortal).toHaveBeenCalledWith(d.id);
  });

  it("com portal.manage: ligado sem perguntar à base (proposta e contrato)", () => {
    m.perms.add("portal.manage");
    for (const c of [null, "enviado"]) {
      const d = negocio(c), { acessoPortal, ctx } = montar(d);
      render(<BotaoAcessoPortal ctx={ctx} d={d} />);
      fireEvent.click(screen.getByRole("button", { name: "Acesso ao portal" }));
      expect(acessoPortal).toHaveBeenCalledWith(d.id);
      cleanup();
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("contrato: client_contracts.send_signature liga; negocios.proposta.enviar não chega", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    const d = negocio("enviado");
    render(<BotaoAcessoPortal ctx={montar(d).ctx} d={d} />);
    const b = screen.getByRole("button", { name: /Acesso ao portal/ });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("title", expect.stringContaining("client_contracts.send_signature ou portal.manage"));
    cleanup();
    m.perms.add("client_contracts.send_signature");
    render(<BotaoAcessoPortal ctx={montar(d).ctx} d={d} />);
    expect(screen.getByRole("button", { name: "Acesso ao portal" })).toBeEnabled();
  });

  it("«Tentar de novo» sem permissão: desligado com o motivo", async () => {
    const d = negocio(null), { acessoPortal, ctx } = montar(d);
    d.acesso = { estado: "erro", email: "cliente@exemplo.pt", msg: "Falhou", em: new Date().toISOString() } as Negocio["acesso"];
    render(<EstadoAcessoPortal ctx={ctx} d={d} />);
    const b = await screen.findByRole("button", { name: /Tentar de novo\s*\(sem permissão\)/ });
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(acessoPortal).not.toHaveBeenCalled();
  });

  it("mudar o email sem permissão: grava, mas a opção de reenviar fica desligada e não reenvia", async () => {
    const d = negocio(null), { acessoPortal, ctx } = montar(d);
    render(<EditarCliente ctx={ctx} d={d} fechar={() => {}} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "novo@exemplo.pt" } });
    await screen.findByText("(sem permissão)");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(d.f.email).toBe("novo@exemplo.pt");
    expect(acessoPortal).not.toHaveBeenCalled();
  });
});

// 04/11/2026: «Enviar para o portal do cliente» na proposta do negócio só para quem tem negocios.proposta.enviar ou portal.manage
// (a regra de create-client-portal-access); sem elas, o botão fica desligado e diz porquê. O contrato continua com client_contracts.send_signature.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({
  perms: new Set<string>(),
  podeEnviar: false,
  gerar: vi.fn(),
}));

function cadeia(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit"]) q[k] = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string) => Promise.resolve(nome === "fn_cat_pode"
      ? { data: m.podeEnviar, error: null }
      : { data: { proposta_id: "prop-1", contrato_id: "cont-1" }, error: null }),
    from: (t: string) => cadeia(t === "client_portal_documents" ? [] : [{ id: t === "proposals" ? "prop-1" : "cont-1", status: "draft" }]),
  },
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (c: string) => m.perms.has(c), isSystemAdmin: false, loading: false }),
}));
vi.mock("@/hooks/useClientPortalAccess", () => ({ useClientPortalAccess: () => ({ generatePortalAccess: m.gerar, loading: false }) }));

import { EnviarParaPortal } from "./EnviarParaPortal";

function montar(tipo: "proposal" | "contract", podeEditar = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<EnviarParaPortal negocioId="neg-1" tipo={tipo} podeEditar={podeEditar} />, { wrapper: W });
}
const botao = () => screen.findByRole("button", { name: "Enviar para o portal do cliente" });

beforeEach(() => { m.perms = new Set(); m.podeEnviar = false; m.gerar.mockReset(); });
afterEach(() => cleanup());

describe("EnviarParaPortal: a proposta pede negocios.proposta.enviar ou portal.manage", () => {
  it("sem nenhuma (mesmo com client_contracts.edit): desligado, com o motivo, e não envia", async () => {
    m.perms.add("client_contracts.edit");
    montar("proposal");
    const b = await botao();
    await waitFor(() => expect(screen.getByText(/Não tens permissão para enviar a proposta ao portal/)).toBeTruthy());
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/negocios\.proposta\.enviar ou portal\.manage/)).toBeTruthy();
    fireEvent.click(b);
    expect(m.gerar).not.toHaveBeenCalled();
  });

  it("com negocios.proposta.enviar: ligado e envia a proposta real", async () => {
    m.podeEnviar = true;
    montar("proposal");
    const b = await botao();
    await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/Não tens permissão/)).toBeNull();
    fireEvent.click(b);
    expect(m.gerar).toHaveBeenCalledWith("proposal", "prop-1", false);
  });

  it("com portal.manage: ligado", async () => {
    m.perms.add("portal.manage");
    montar("proposal");
    const b = await botao();
    await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false));
  });

  it("o contrato não muda: client_contracts.send_signature", async () => {
    m.podeEnviar = true;
    montar("contract");
    const b = await botao();
    expect((b as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    m.perms.add("client_contracts.send_signature");
    montar("contract");
    const b2 = await botao();
    await waitFor(() => expect((b2 as HTMLButtonElement).disabled).toBe(false));
  });
});

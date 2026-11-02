import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Contrato por assinar: modal ao entrar («Assinar agora» / «Mais tarde», uma
// vez por sessão e contrato, só para quem pode assinar) e banner discreto em
// todas as páginas menos a do Contrato. Nunca bloqueia o portal.

let listData: unknown = null;
vi.mock("../useSpContracts", () => ({
  useSpContractsList: (enabled = true) => ({ data: enabled ? listData : undefined }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ user: { id: "u1" } }),
}));

import { SpContractPendingBanner, SpContractPendingPrompt } from "../SpContractPending";

const contract = (over: Record<string, unknown> = {}) => ({
  id: "sc1",
  contract_number: "CF-2026-0001",
  version: 2,
  organization_name: "BM Lar",
  status: "sent",
  sent_at: "2026-11-01T10:00:00Z",
  can_sign: true,
  expires_soon: false,
  ...over,
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderAt(path: string, enabled = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <SpContractPendingBanner enabled={enabled} />
              <SpContractPendingPrompt enabled={enabled} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SpContractPending", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  beforeEach(() => {
    window.sessionStorage.clear();
    listData = { is_owner: true, contracts: [contract()] };
  });

  it("titular: modal ao entrar e banner com ligação para o contrato", () => {
    renderAt("/supplier-portal");
    expect(screen.getByRole("dialog", { name: /Tem um contrato por assinar/ })).toBeTruthy();
    // Com o modal aberto o resto fica aria-hidden (Radix): procurar também o escondido.
    const banner = screen.getByRole("region", { name: "Contrato por assinar", hidden: true });
    expect(banner.textContent).toContain("CF-2026-0001 · v2");
    expect(screen.getByRole("link", { name: /Ver e assinar/, hidden: true }).getAttribute("href")).toBe("/supplier-portal/contract?id=sc1");
  });

  it("«Mais tarde» fecha e não volta a perguntar na mesma sessão; o banner fica", async () => {
    const first = renderAt("/supplier-portal");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mais tarde" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Contrato por assinar" })).toBeTruthy();
    first.unmount();
    renderAt("/supplier-portal/orders");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Contrato por assinar" })).toBeTruthy();
  });

  it("«Assinar agora» leva à página Contrato a abrir a assinatura", async () => {
    renderAt("/supplier-portal");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Assinar agora/ }));
    });
    expect(screen.getByTestId("where").textContent).toBe("/supplier-portal/contract?id=sc1&assinar=1");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Na própria página não há banner.
    expect(screen.queryByRole("region", { name: "Contrato por assinar" })).toBeNull();
  });

  it("membro (sem poder assinar): sem modal; banner só informativo", () => {
    listData = { is_owner: false, contracts: [contract({ can_sign: false })] };
    renderAt("/supplier-portal");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: "Contrato por assinar" }).textContent).toContain("aguarda a assinatura do responsável");
    expect(screen.getByRole("link", { name: /Ver contrato/ })).toBeTruthy();
  });

  it("sem contrato enviado, ou antes de confirmar os dados: nada", () => {
    listData = { is_owner: true, contracts: [contract({ status: "signed" })] };
    const r = renderAt("/supplier-portal");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("region", { name: "Contrato por assinar" })).toBeNull();
    r.unmount();
    listData = { is_owner: true, contracts: [contract()] };
    renderAt("/supplier-portal", false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("region", { name: "Contrato por assinar" })).toBeNull();
  });
});

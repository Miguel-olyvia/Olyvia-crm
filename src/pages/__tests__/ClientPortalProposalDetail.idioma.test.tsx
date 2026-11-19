import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";
import { MOTIVOS_REJEICAO_PROPOSTA, MOTIVOS_REJEICAO_CONTRATO } from "@/components/portal/motivosRejeicao";
import { traduzir } from "@/portal-i18n";

const loadProposalPortalData = vi.fn();

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    from: () =>
      chain({ data: [{ id: "d1", file_name: "plano.pdf", file_type: "pdf", file_size: 2048, created_at: "2026-03-05T10:00:00Z" }] }),
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/proposals/proposalPortalData", () => ({
  loadProposalPortalData: (...args: unknown[]) => loadProposalPortalData(...args),
}));
vi.mock("@/utils/generateProposalPdfBlob", () => ({ generateProposalPdfBlob: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import ClientPortalProposalDetail from "../ClientPortalProposalDetail";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/propostas/p1"]}>
      <Routes>
        <Route path="/propostas/:id" element={<ClientPortalProposalDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const comProposta = {
  proposal: { id: "p1", title: "Proposta", proposal_number: "P-1", created_at: "2026-01-01T10:00:00Z", status: "sent", organization_id: "o1" },
  template: null,
  quotes: [],
  quoteLines: {},
  quoteFees: {},
  commercial: null,
  company: null,
};

describe("ClientPortalProposalDetail - idioma do portal", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    loadProposalPortalData.mockReset();
  });
  afterEach(() => {
    act(() => definirIdioma("pt"));
  });

  it("em português: anexos, data numérica e botão como sempre", async () => {
    loadProposalPortalData.mockResolvedValue(comProposta);
    renderPage();
    expect(await screen.findByText("Documentos anexos (1)")).toBeTruthy();
    expect(screen.getByText(/05\/03\/2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Descarregar$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voltar/ })).toBeTruthy();
  });

  it("em inglês: anexos e botões traduzidos, data numérica e tamanho iguais", async () => {
    act(() => definirIdioma("en"));
    loadProposalPortalData.mockResolvedValue(comProposta);
    renderPage();
    expect(await screen.findByText("Attached documents (1)")).toBeTruthy();
    expect(screen.getByText(/PDF · 2 KB · 05\/03\/2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
  });

  it("proposta não encontrada, nos dois idiomas", async () => {
    loadProposalPortalData.mockResolvedValue({ ...comProposta, proposal: null });
    const { unmount } = renderPage();
    expect(await screen.findByText("Proposta não encontrada.")).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("Proposal not found.")).toBeTruthy();
  });
});

describe("motivos de rejeição do portal", () => {
  it("o valor gravado é sempre o texto português e a etiqueta existe nos dois idiomas", () => {
    for (const motivo of [...MOTIVOS_REJEICAO_PROPOSTA, ...MOTIVOS_REJEICAO_CONTRATO]) {
      expect(motivo.valor).toBe(traduzir("pt", motivo.chave));
      expect(traduzir("en", motivo.chave)).not.toBe(motivo.chave);
      expect(traduzir("en", motivo.chave).trim()).not.toBe("");
    }
    expect(MOTIVOS_REJEICAO_PROPOSTA.map((m) => m.valor)).toEqual([
      "Preço alto", "Encontrei alternativa", "Já não preciso", "Prazo não serve", "Vou adiar", "Outro",
    ]);
    expect(MOTIVOS_REJEICAO_CONTRATO.map((m) => m.valor)).toEqual([
      "Condições não adequadas", "Preço alto", "Encontrei alternativa", "Vou adiar", "Outro",
    ]);
  });
});

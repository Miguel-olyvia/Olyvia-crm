// A pré-visualização do CRM e a página pública por token mostram o documento no idioma gravado na proposta
// (idiomasDoDocumento já decidido por loadProposalPortalData). Proposta sem idioma gravado: ['pt'], igual à omissão
// da prop (idioma = "pt"). Tudo simulado: sem rede.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { carregar, propsDoc, ultimo } = vi.hoisted(() => {
  const propsDoc: Array<Record<string, unknown>> = [];
  return { carregar: vi.fn(), propsDoc, ultimo: () => propsDoc[propsDoc.length - 1] };
});

vi.mock("@/components/proposals/proposalPortalData", () => ({ loadProposalPortalData: (...a: unknown[]) => carregar(...a) }));
vi.mock("@/components/proposals/ProposalPortalDocument", () => ({
  ProposalPortalDocument: (p: Record<string, unknown>) => {
    propsDoc.push(p);
    return <div data-testid="documento" />;
  },
}));
vi.mock("@/utils/generateProposalPdfBlob", () => ({ generateProposalPdfBlob: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const b: any = {};
  for (const m of ["select", "eq", "update"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve({ data: { id: "p1", public_link_enabled: true }, error: null });
  b.then = (ok: any, err: any) => Promise.resolve({ error: null }).then(ok, err);
  return { supabase: { from: () => b, functions: { invoke: () => Promise.resolve({ data: null, error: null }) } } };
});

import { ProposalPortalPreview } from "../ProposalPortalPreview";
import PublicProposal from "@/pages/PublicProposal";

function dados(idiomas: string[]) {
  return {
    proposal: { id: "p1", status: "sent", viewed_at: "2026-03-01T00:00:00Z" },
    template: { id: "t1" },
    company: null,
    quotes: [],
    quoteLines: {},
    quoteFees: {},
    commercial: null,
    idiomasDoDocumento: idiomas,
  };
}

beforeEach(() => {
  carregar.mockReset();
  propsDoc.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("ProposalPortalPreview (CRM)", () => {
  it("passa ao documento os idiomas gravados na proposta", async () => {
    carregar.mockResolvedValue(dados(["pt", "en"]));
    render(<ProposalPortalPreview open onOpenChange={() => {}} proposalId="p1" />);
    await screen.findByTestId("documento");
    expect(ultimo()?.idiomasDoDocumento).toEqual(["pt", "en"]);
  });

  it("proposta sem idioma gravado: ['pt'], o mesmo que a omissão", async () => {
    carregar.mockResolvedValue(dados(["pt"]));
    render(<ProposalPortalPreview open onOpenChange={() => {}} proposalId="p1" />);
    await screen.findByTestId("documento");
    expect(ultimo()?.idiomasDoDocumento).toEqual(["pt"]);
  });
});

describe("PublicProposal (página por token)", () => {
  const montar = () =>
    render(
      <MemoryRouter initialEntries={["/p/abc"]}>
        <Routes>
          <Route path="/p/:token" element={<PublicProposal />} />
        </Routes>
      </MemoryRouter>,
    );

  it("passa ao documento os idiomas gravados na proposta", async () => {
    carregar.mockResolvedValue(dados(["en"]));
    montar();
    await waitFor(() => expect(propsDoc.length).toBeGreaterThan(0));
    expect(ultimo()?.idiomasDoDocumento).toEqual(["en"]);
  });

  it("proposta sem idioma gravado: ['pt']", async () => {
    carregar.mockResolvedValue(dados(["pt"]));
    montar();
    await waitFor(() => expect(propsDoc.length).toBeGreaterThan(0));
    expect(ultimo()?.idiomasDoDocumento).toEqual(["pt"]);
  });
});

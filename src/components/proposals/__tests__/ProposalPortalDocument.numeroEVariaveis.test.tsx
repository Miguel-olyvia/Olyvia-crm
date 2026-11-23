// 23/11: o número mostrado («PR 2026/1031») e as variáveis dos textos do template ({{condicoes_pagamento}}, …).
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";

const TERMOS = "<p>Termos e condições</p><p>3. Condições de Pagamento: {{condicoes_pagamento}}</p>";
const template = {
  name: "Mudelar",
  terms_conditions: TERMOS,
  header_text: "<p>Para {{cliente_nome}}</p>",
  sections: [
    { id: "h", type: "header", visible: true, settings: { customTitle: "PROPOSTA", showLogo: false, showDate: false } },
    { id: "t", type: "terms", visible: true, settings: { sectionLabel: "Condições Gerais" } },
  ],
};

const base = {
  proposal: { id: "p1", title: "Cozinha", proposal_number: "P-2026-0035", created_at: "2026-10-30T12:00:00", status: "sent", value: 100 },
  template,
  quotes: [],
  quoteLines: {},
  commercial: null,
  company: null,
  mode: "preview" as const,
};

describe("ProposalPortalDocument: número e variáveis", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  it("sem número mostrado: o guardado, como sempre", () => {
    render(<ProposalPortalDocument {...base} />);
    expect(screen.getByText(/P-2026-0035/)).toBeTruthy();
  });

  it("com o número mostrado: esse, e não o guardado", () => {
    render(<ProposalPortalDocument {...base} numeroMostrado="PR 2026/1031 · v2" />);
    expect(screen.getByText(/PR 2026\/1031 · v2/)).toBeTruthy();
    expect(screen.queryByText(/P-2026-0035/)).toBeNull();
  });

  it("os termos levam as condições de pagamento do negócio; o cabeçalho o nome (escapado)", () => {
    render(<ProposalPortalDocument {...base} variaveis={{ condicoes_pagamento: "100% - Adjudicação", cliente_nome: "Ana & Rui" }} />);
    expect(screen.getByText("3. Condições de Pagamento: 100% - Adjudicação")).toBeTruthy();
    expect(screen.getByText("Para Ana & Rui")).toBeTruthy();
    expect(document.body.textContent).not.toContain("{{");
  });

  it("sem dados do negócio: a variável fica vazia (nunca as chavetas)", () => {
    render(<ProposalPortalDocument {...base} />);
    expect(screen.getByText("3. Condições de Pagamento:")).toBeTruthy();
    expect(document.body.textContent).not.toContain("{{condicoes_pagamento}}");
  });
});

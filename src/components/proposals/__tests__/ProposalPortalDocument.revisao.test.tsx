// Correções da revisão do ProposalPortalDocument em inglês:
//  - R1: o editor de templates grava por omissão títulos em português («CLIENTE», «PROPOSTA»...) em
//    settings.sectionLabel / settings.customTitle; em inglês traduzem-se, mas um texto escrito pela organização fica.
//  - R2: mudar de idioma não pode repor a seleção de orçamentos e secções (muda o total que o cliente aceita).
//  - A7: o logótipo tem texto alternativo útil.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";
import { configuredTemplate, multiSectionsOneQuote, singleQuote } from "./ProposalPortalDocument.fixtures";

type Idioma = "pt" | "en";

// As secções por omissão de src/components/ProposalTemplateEditor.tsx (defaultSections), todas visíveis.
const SECCOES_DO_EDITOR = [
  { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { layout: "quote_pdf", showLogo: true, alignment: "left", showDate: true, customTitle: "PROPOSTA" } },
  { id: "client_info", type: "client_info", label: "Cliente", visible: true, settings: { showTitle: true, sectionLabel: "CLIENTE" } },
  { id: "notes", type: "notes", label: "Notas", visible: true, settings: { showTitle: true, sectionLabel: "NOTAS" } },
  { id: "quote_items", type: "quote_items", label: "Detalhes do Orçamento", visible: true, settings: { sectionLabel: "DETALHES DO ORÇAMENTO" } },
  { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
  { id: "footer", type: "footer", label: "Rodapé", visible: true, settings: { showCompanyName: true } },
  { id: "company_info", type: "company_info", label: "Info da Empresa", visible: true, settings: { sectionLabel: "Empresa" } },
  { id: "description", type: "description", label: "Descrição do trabalho", visible: true, settings: { sectionLabel: "Descrição do trabalho" } },
  { id: "validity", type: "validity", label: "Validade", visible: true, settings: { sectionLabel: "Válida até" } },
];

function comSeccoes(sections: unknown[], extraTemplate: Record<string, unknown> = {}) {
  return {
    ...configuredTemplate,
    template: { ...configuredTemplate.template, ...extraTemplate, sections },
  };
}

function renderDoc(props: Record<string, unknown>, idioma: Idioma) {
  return render(<ProposalPortalDocument {...(props as any)} idioma={idioma} />);
}
const texto = (container: HTMLElement) => container.textContent ?? "";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("R1: títulos de fábrica do editor de templates", () => {
  const props = comSeccoes(SECCOES_DO_EDITOR);

  it("em inglês traduz os de fábrica (maiúsculas e minúsculas, com ou sem acentos)", () => {
    const { container } = renderDoc(props, "en");
    const t = texto(container);
    expect(t).toContain("Customer");
    expect(t).toContain("Notes");
    expect(t).toContain("General terms");
    expect(t).toContain("Company");
    expect(t).toContain("Description of the work");
    expect(t).toContain("Valid until");
    expect(t).toContain("PROPOSAL");
    expect(t).not.toMatch(/CLIENTE|NOTAS|CONDIÇÕES GERAIS|Válida até|PROPOSTA|Descrição do trabalho/);
  });

  it("em português fica exatamente o que o editor gravou", () => {
    const { container } = renderDoc(props, "pt");
    const t = texto(container);
    expect(t).toContain("CLIENTE");
    expect(t).toContain("NOTAS");
    expect(t).toContain("CONDIÇÕES GERAIS");
    expect(t).toContain("Válida até");
    expect(t).toContain("PROPOSTA");
  });

  it("um texto escrito pela organização fica como vem, nos dois idiomas", () => {
    const seccoes = SECCOES_DO_EDITOR.map((s) => {
      if (s.type === "header") return { ...s, settings: { ...s.settings, customTitle: "A NOSSA PROPOSTA ESPECIAL" } };
      if (s.type === "client_info") return { ...s, settings: { ...s.settings, sectionLabel: "PARA QUEM" } };
      return s;
    });
    const { container } = renderDoc(comSeccoes(seccoes), "en");
    const t = texto(container);
    expect(t).toContain("A NOSSA PROPOSTA ESPECIAL");
    expect(t).toContain("PARA QUEM");
  });
});

describe("R2: a seleção não se repõe ao mudar de idioma", () => {
  const dois = {
    ...singleQuote,
    quotes: [
      { id: "q1", quote_number: "Q-1", estado: "enviado", total: 123 },
      { id: "q2", quote_number: "Q-2", estado: "enviado", total: 246 },
    ],
    quoteLines: {
      q1: [{ id: "a", descricao_snapshot: "Artigo a", qt: 1, retail_price_unit: 100, total_sem_iva: 100, iva_percent: 23 }],
      q2: [{ id: "b", descricao_snapshot: "Artigo b", qt: 1, retail_price_unit: 200, total_sem_iva: 200, iva_percent: 23 }],
    },
    quoteFees: {},
  };

  it("orçamentos: desmarcar um, trocar PT -> EN -> PT mantém a seleção, o total e não chama o callback", () => {
    const onSelectedQuotesChange = vi.fn();
    const { container, rerender } = render(
      <ProposalPortalDocument {...(dois as any)} idioma="pt" onSelectedQuotesChange={onSelectedQuotesChange} />,
    );
    expect(texto(container)).toContain("2 de 2 orçamentos selecionados");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(texto(container)).toContain("1 de 2 orçamentos selecionados");
    const totalPt = texto(container).match(/1 de 2 orçamentos selecionados — Total: (\S+)/)?.[1];
    expect(totalPt).toBeTruthy();
    const chamadas = onSelectedQuotesChange.mock.calls.length;
    expect(onSelectedQuotesChange).toHaveBeenLastCalledWith(["q2"]);

    rerender(<ProposalPortalDocument {...(dois as any)} idioma="en" onSelectedQuotesChange={onSelectedQuotesChange} />);
    expect(texto(container)).toContain(`1 of 2 quotes selected — Total: ${totalPt}`);
    expect(screen.getAllByRole("checkbox")[0].getAttribute("aria-checked")).toBe("false");
    expect(onSelectedQuotesChange.mock.calls.length).toBe(chamadas);

    rerender(<ProposalPortalDocument {...(dois as any)} idioma="pt" onSelectedQuotesChange={onSelectedQuotesChange} />);
    expect(texto(container)).toContain("1 de 2 orçamentos selecionados");
    expect(onSelectedQuotesChange.mock.calls.length).toBe(chamadas);
  });

  it("secções: desmarcar a secção sem nome (Itens) e trocar de idioma mantém a seleção e o total", () => {
    const onSelectedQuotesChange = vi.fn();
    const { container, rerender } = render(
      <ProposalPortalDocument {...(multiSectionsOneQuote as any)} idioma="pt" onSelectedQuotesChange={onSelectedQuotesChange} />,
    );
    expect(texto(container)).toContain("2 de 2 secções selecionadas");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(texto(container)).toContain("1 de 2 secções selecionadas");
    const totalPt = texto(container).match(/1 de 2 secções selecionadas — Total: (\S+)/)?.[1];
    expect(totalPt).toBeTruthy();

    rerender(<ProposalPortalDocument {...(multiSectionsOneQuote as any)} idioma="en" onSelectedQuotesChange={onSelectedQuotesChange} />);
    expect(texto(container)).toContain(`1 of 2 sections selected — Total: ${totalPt}`);
    expect(screen.getAllByRole("checkbox")[0].getAttribute("aria-checked")).toBe("false");
    // A secção sem nome mostra-se no idioma do momento.
    expect(texto(container)).toContain("Items");
    expect(texto(container)).not.toContain("Itens");
  });
});

describe("A7: texto alternativo do logótipo", () => {
  const comLogo = {
    ...singleQuote,
    company: { name: "Mudelar Lda", logo_url: "https://exemplo.pt/logo.png" },
    template: {
      logo_url: "https://exemplo.pt/logo.png",
      sections: [
        { id: "h", type: "header", label: "Cabeçalho", visible: true, settings: { showLogo: true } },
        { id: "e", type: "company_info", label: "Empresa", visible: true, settings: {} },
      ],
    },
  };

  it("o logótipo do cabeçalho tem o nome da empresa e o que está ao lado do nome fica sem alt", () => {
    const { container } = renderDoc(comLogo, "en");
    const imagens = Array.from(container.querySelectorAll("img"));
    expect(imagens).toHaveLength(2);
    expect(imagens[0].getAttribute("alt")).toBe("Mudelar Lda");
    expect(imagens[1].getAttribute("alt")).toBe("");
    expect(screen.queryByAltText("Logo")).toBeNull();
  });
});

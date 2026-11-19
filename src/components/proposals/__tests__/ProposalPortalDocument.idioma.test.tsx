// Idioma do ProposalPortalDocument. O português é o do componente antes de ganhar a prop `idioma` (baselines
// capturadas do original); em inglês, só mudam as palavras: o dinheiro, os números e dd/mm/aaaa ficam.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";
import { CHAVE_IDIOMA_PORTAL } from "@/portal-i18n";
import {
  cenarios,
  customTitlesTemplate,
  defaultEditorTemplate,
  labelOnlyTemplate,
  multiQuotes,
  multiSectionsOneQuote,
  noLabelsTemplate,
  otpProps,
  singleQuote,
} from "./ProposalPortalDocument.fixtures";
import { HTML_BASELINE } from "./ProposalPortalDocument.html-baseline";
import { PT_BASELINE } from "./ProposalPortalDocument.pt-baseline";

type Props = Record<string, unknown>;
const doc = (props: Props) => <ProposalPortalDocument {...(props as any)} />;
const textoDe = (props: Props): string => render(doc(props)).container.textContent ?? "";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("ProposalPortalDocument: português igual ao de sempre", () => {
  it("os cenários da baseline cobrem os mesmos nomes", () => {
    expect(Object.keys(cenarios).sort()).toEqual(Object.keys(PT_BASELINE).sort());
    expect(Object.keys(cenarios).sort()).toEqual(Object.keys(HTML_BASELINE).sort());
  });

  describe.each(Object.keys(cenarios))("cenário %s", (nome) => {
    it("sem a prop: o texto e o HTML são os da baseline", () => {
      const { container } = render(doc(cenarios[nome]));
      expect(container.textContent).toBe(PT_BASELINE[nome]);
      expect(container.innerHTML).toBe(HTML_BASELINE[nome]);
    });

    it("com idioma «pt»: igual à baseline", () => {
      const { container } = render(doc({ ...cenarios[nome], idioma: "pt" }));
      expect(container.textContent).toBe(PT_BASELINE[nome]);
      expect(container.innerHTML).toBe(HTML_BASELINE[nome]);
    });

    it("com um idioma estranho: cai no português", () => {
      const { container } = render(doc({ ...cenarios[nome], idioma: "fr" }));
      expect(container.textContent).toBe(PT_BASELINE[nome]);
    });
  });

  it("não lê o armazém do idioma do portal: com «en» guardado e sem a prop, continua em português", () => {
    try {
      window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en");
    } catch {
      // sem armazém neste ambiente: o teste ainda vale (o componente não o lê)
    }
    expect(textoDe(cenarios.single)).toBe(PT_BASELINE.single);
    try {
      window.localStorage.removeItem(CHAVE_IDIOMA_PORTAL);
    } catch {
      // idem
    }
  });
});

describe("ProposalPortalDocument em inglês", () => {
  it("proposta com um orçamento: palavras em inglês, dinheiro e dd/mm/aaaa como sempre", () => {
    const texto = textoDe({ ...cenarios.single, idioma: "en", otpStep: "idle" });
    for (const esperado of [
      "Proposal awaiting your decision",
      "Review the quotes below, then accept or request changes.",
      "Proposal valid until 15 April 2026.",
      "Proposal — Remodelação da cozinha",
      "P-2026-001 · Created on 05/03/2026",
      "Awaiting decision",
      "Total value€1.246,50",
      "Subtotal (excl. VAT)€20,00",
      "Valid until15/04/2026",
      "Sales representativeRita Costa",
      "PROPOSAL05/03/2026",
      "CompanyMudelar Lda",
      "Quote Q-1",
      "ItemQTYUnit priceTotal",
      "Service fee€20,00",
      "Global discount (10%)-€105,00",
      "VAT (23%)€217,35",
      "Total VAT€217,35",
      "Grand total (incl. VAT)€1.182,35",
      "SMS verification",
      "Send SMS code",
      "Ready to move forward?",
      "Accept the proposal via SMS or request changes.",
      "💬 I have questions",
      "✕ Reject",
      "Accept and Sign",
      "Proposal sent by Mudelar Lda",
      "Questions? Contact Rita Costa 912345678 rita@exemplo.pt",
    ]) {
      expect(texto).toContain(esperado);
    }
    expect(texto).not.toMatch(/Proposta aguarda|Orçamento|Verificação|Rejeitar|Dúvidas|Condições/);
  });

  it("o estado por omissão segue o idioma, o que o chamador passa fica como vem", () => {
    expect(textoDe({ ...cenarios.single, idioma: "en" })).toContain("📋 Awaiting decision");
    expect(textoDe({ ...cenarios.single, idioma: "en", statusLabel: "Rascunho" })).toContain("📋 Rascunho");
  });

  it("passos do código por SMS e o aviso de espera", () => {
    const texto = textoDe({ ...cenarios.single, idioma: "en", ...otpProps });
    expect(texto).toContain("Code sent to 9*****123");
    expect(texto).toContain("Valid for 5 minutes");
    expect(texto).toContain("Please wait 1 minute before requesting a new code.");
    expect(texto).toContain("Resend code (30s)");
    expect(texto).toContain("Verify");
    expect(textoDe({ ...cenarios.single, idioma: "en", otpStep: "sending" })).toContain("Sending SMS code...");
    expect(textoDe({ ...cenarios.single, idioma: "en", otpStep: "verifying" })).toContain("Verifying code and signing the proposal...");
    expect(textoDe({ ...cenarios.single, idioma: "en", otpStep: "verified" })).toContain("Code verified! Proposal accepted successfully.");
  });

  it("o erro do código vem como o chamador o escreveu", () => {
    expect(textoDe({ ...cenarios.single, idioma: "en", otpStep: "idle", otpError: "Erro X" })).toContain("Erro X");
  });

  it("aceite e rejeitada: faixa com data por extenso em inglês (a hora fica HH:mm)", () => {
    const aceite = textoDe({ ...cenarios.accepted, idioma: "en" });
    expect(aceite).toContain("✅ Proposal accepted");
    expect(aceite).toContain("Accepted on 10 March 2026 at 14:30");
    expect(aceite).toContain("IP: 10.0.0.7 • Verified by SMS OTP");
    const rejeitada = textoDe({ ...cenarios.rejected, idioma: "en" });
    expect(rejeitada).toContain("❌ Proposal rejected");
    expect(rejeitada).toContain("Rejected on 11 March 2026 at 09:15");
  });

  it("vários orçamentos: seleção, contagem e total", () => {
    const texto = textoDe({ ...multiQuotes, idioma: "en" });
    for (const esperado of [
      "✓ Quote selected",
      "📋 Items",
      "📋 Cozinha",
      "Quote total Q-1€123,00",
      "✓ Selected for acceptance",
      "✅ Quote accepted",
      "❌ Quote rejected",
      "Select the quotes you want to accept and confirm via SMS.",
      "3 of 3 quotes selected — Total: €459,00",
    ]) {
      expect(texto).toContain(esperado);
    }
  });

  it("várias secções num orçamento: seleção e totais de todas as secções", () => {
    const texto = textoDe({ ...multiSectionsOneQuote, idioma: "en" });
    expect(texto).toContain("✓ Selected");
    expect(texto).toContain("Subtotal (all sections)€140,00");
    expect(texto).toContain("Deslocação€20,00");
    expect(texto).toContain("2 of 2 sections selected — Total: €172,20");
  });

  it("sem nada selecionado, o aviso fala de orçamentos ou de secções conforme o caso", () => {
    const { unmount } = render(doc({ ...multiSectionsOneQuote, idioma: "en" }));
    for (const caixa of screen.getAllByRole("checkbox")) fireEvent.click(caixa);
    expect(screen.getByText("Select at least one section to be able to accept the proposal.")).toBeTruthy();
    unmount();
    // dois orçamentos em aberto, cada um com uma só secção: uma caixa por orçamento
    const doisEmAberto = {
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
    render(doc({ ...doisEmAberto, idioma: "en" }));
    for (const caixa of screen.getAllByRole("checkbox")) fireEvent.click(caixa);
    expect(screen.getByText("Select at least one quote to be able to accept the proposal.")).toBeTruthy();
  });

  it("trocar de idioma não repõe a seleção de orçamentos", () => {
    const { rerender } = render(doc({ ...multiQuotes, idioma: "pt" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(document.body.textContent).toContain("2 de 3 orçamentos selecionados");
    rerender(doc({ ...multiQuotes, idioma: "en" }));
    expect(document.body.textContent).toContain("2 of 3 quotes selected");
    rerender(doc({ ...multiQuotes, idioma: "pt" }));
    expect(document.body.textContent).toContain("2 de 3 orçamentos selecionados");
  });

  it("trocar de idioma não repõe a seleção de secções", () => {
    const { rerender } = render(doc({ ...multiSectionsOneQuote, idioma: "pt" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(document.body.textContent).toContain("1 de 2 secções selecionadas");
    rerender(doc({ ...multiSectionsOneQuote, idioma: "en" }));
    expect(document.body.textContent).toContain("1 of 2 sections selected");
  });

  it("preview: aviso de botões desativados", () => {
    expect(textoDe({ ...cenarios.singlePreview, idioma: "en" })).toContain("The action buttons are disabled in this preview.");
  });

  it("os rótulos de fábrica do editor traduzem-se; o resto da organização fica como vem", () => {
    const texto = textoDe({ ...defaultEditorTemplate, idioma: "en" });
    for (const esperado of ["PROPOSAL05/03/2026", "CUSTOMER", "NOTES", "GENERAL TERMS", "Company", "Description of the work", "Valid until", "Proposal valid until 15/04/2026.", "Footer"]) {
      expect(texto.toLowerCase()).toContain(esperado.toLowerCase());
    }
    // conteúdo escrito pela organização
    for (const intacto of ["Cabeçalho da organização", "Obra completa", "Nota interna", "Pagamento a 30 dias", "Obrigado pela preferência", "Ana Silva"]) {
      expect(texto).toContain(intacto);
    }
    // os títulos todos em maiúsculas continuam em maiúsculas; os outros ficam com a caixa normal
    for (const caixa of ["CUSTOMER", "NOTES", "GENERAL TERMS", "PROPOSAL"]) expect(texto).toContain(caixa);
    expect(texto).not.toMatch(/CLIENTE|CONDIÇÕES|NOTAS|Rodapé/);
  });

  it("títulos personalizados ficam como vêm", () => {
    const texto = textoDe({ ...customTitlesTemplate, idioma: "en" });
    for (const t of ["A NOSSA PROPOSTA", "PARA QUEM", "OBSERVAÇÕES DA ORGANIZAÇÃO", "Condições"]) expect(texto).toContain(t);
  });

  it("sem sectionLabel, o label de fábrica da secção segue o idioma", () => {
    const texto = textoDe({ ...labelOnlyTemplate, idioma: "en" });
    for (const t of ["Header", "Customer", "Description of the work", "Validity", "General terms", "Footer"]) expect(texto).toContain(t);
    expect(texto).toContain("OBSERVAÇÕES DA ORGANIZAÇÃO");
  });

  it("sem rótulo nenhum, valem os rótulos por omissão no idioma", () => {
    const texto = textoDe({ ...noLabelsTemplate, idioma: "en" });
    for (const t of ["PROPOSAL", "Customer", "Notes", "Validity", "General terms"]) expect(texto).toContain(t);
  });

  it("template por omissão (sem secções): rótulos de fábrica em inglês", () => {
    const texto = textoDe({ ...cenarios.fallback, idioma: "en" });
    expect(texto).toContain("PROPOSAL");
    expect(texto).toContain("Company");
    expect(texto).toContain("General terms");
    expect(texto).toContain("Pagamento a 30 dias");
  });

  it("o inglês não deixa palavras portuguesas dos cenários sem conteúdo da organização", () => {
    for (const nome of ["singleIdle", "singleInput", "multi", "multiSections", "accepted", "rejected"]) {
      const texto = textoDe({ ...cenarios[nome], idioma: "en" });
      expect(texto, nome).not.toMatch(/Proposta |Orçamento|Subtotal \(sem|Selecion|Verific|Aguarde|Rejeit|Aceit|Dúvidas|Válid|Criada/);
    }
  });

  it("uma instância em inglês e o mesmo cenário sem a prop não se contaminam", () => {
    const en = textoDe({ ...singleQuote, idioma: "en" });
    const pt = textoDe({ ...singleQuote });
    expect(en).not.toBe(pt);
    expect(pt).toBe(PT_BASELINE.single);
  });
});

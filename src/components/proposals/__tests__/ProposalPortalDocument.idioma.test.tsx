// O ProposalPortalDocument fala o idioma que lhe dão (prop `idioma`, "pt" por omissão), sem ler o armazém do
// portal: o CRM (pré-visualização) não passa a prop e fica exatamente como sempre.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";
import { PT_BASELINE } from "./ProposalPortalDocument.pt-baseline";
import {
  acceptedProposal,
  cenarios,
  configuredTemplate,
  fallbackTemplateWithTexts,
  multiQuotes,
  multiSectionsOneQuote,
  otpProps,
  rejectedProposal,
  singleQuote,
} from "./ProposalPortalDocument.fixtures";

function renderDoc(props: Record<string, unknown>, idioma?: "pt" | "en") {
  const extra = idioma ? { idioma } : {};
  return render(<ProposalPortalDocument {...(props as any)} {...extra} />);
}

const texto = (container: HTMLElement) => container.textContent ?? "";
const botao = (nome: string) => screen.getByRole("button", { name: nome }) as HTMLButtonElement;

// Palavras de interface em português que não podem aparecer no inglês. O conteúdo escrito pela organização
// (títulos, termos, rodapé, descrição, nomes de taxas) está nos cenários em português de propósito e não conta.
const PORTUGUES_DE_INTERFACE =
  /Orçamento|orçamento|Proposta|proposta|Verificação|Aceit|Rejeit|Dúvidas|dúvidas|Preço|Enviar|Itens|Taxa de Serviço|IVA|QTD|Selecion|Desconto|Válid|Comercial|Criada|Reenviar|Verificar|Aguarde|Pronto|Valor Total|Total Geral|Empresa|Cliente|Condições Gerais|Detalhes|Descrição do trabalho|Notas|Validade|botões/;

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("ProposalPortalDocument - sem a prop idioma é o português de sempre", () => {
  it.each(Object.keys(cenarios))("%s: o texto é exatamente o de antes", (nome) => {
    const { container } = renderDoc(cenarios[nome]);
    expect(texto(container)).toBe(PT_BASELINE[nome]);
  });

  it.each(Object.keys(cenarios))("%s: idioma=\"pt\" dá o mesmo HTML que sem a prop", (nome) => {
    const semProp = renderDoc(cenarios[nome]);
    const html = semProp.container.innerHTML;
    cleanup();
    const comPt = renderDoc(cenarios[nome], "pt");
    expect(comPt.container.innerHTML).toBe(html);
  });
});

describe("ProposalPortalDocument - inglês", () => {
  it("cabeçalhos da tabela em inglês; a moeda fica no formato de sempre (formatCurrency)", () => {
    renderDoc(singleQuote, "en");
    const tabela = screen.getByRole("table");
    const cabecalhos = within(tabela).getAllByRole("columnheader").map((th) => th.textContent);
    expect(cabecalhos).toEqual(["Item", "QTY", "Unit price", "Total"]);
    expect(within(tabela).getByText("€1.000,00")).toBeTruthy();
    expect(within(tabela).getByText("€500,00")).toBeTruthy();
    expect(within(tabela).getByText("Artigo a")).toBeTruthy();
  });

  it("subtotal, taxa de serviço, desconto, IVA e total", () => {
    const { container } = renderDoc(singleQuote, "en");
    const t = texto(container);
    expect(t).toContain("Subtotal€1.050,00");
    expect(t).toContain("Service fee€20,00");
    expect(t).toContain("Global discount (10%)-€105,00");
    expect(t).toMatch(/VAT \(23%\)€/);
    expect(t).toContain("Quote Q-1");
    expect(t).not.toContain("€1,000.00");
  });

  it("totais agregados da proposta e do orçamento em várias secções", () => {
    const { container } = renderDoc(multiSectionsOneQuote, "en");
    const t = texto(container);
    expect(t).toContain("Subtotal (all sections)");
    expect(t).toContain("Deslocação"); // nome da taxa escrito pela organização: fica como vem
    expect(t).toContain("Quote total Q-1");
    expect(t).toContain("Subtotal (excl. VAT)");
    expect(t).toContain("Total VAT");
    expect(t).toContain("Grand total (incl. VAT)");
    expect(t).toMatch(/VAT 23%/);
    expect(t).toContain("Items");
    expect(t).toContain("Casa de banho"); // nome de secção vindo dos dados
    expect(t).toContain("✓ Selected");
  });

  it("faixa de decisão com validade por extenso e botão de PDF", () => {
    const { container } = renderDoc(singleQuote, "en");
    const t = texto(container);
    expect(t).toContain("Proposal awaiting your decision");
    expect(t).toContain("Review the quotes below, then accept or request changes.");
    expect(t).toContain("Proposal valid until 15 April 2026.");
    expect(screen.getAllByRole("button", { name: /Download PDF/ }).length).toBeGreaterThan(0);
  });

  it("cartão da proposta: título, número, datas dd/mm/aaaa, estado por omissão e etiquetas", () => {
    const { container } = renderDoc(singleQuote, "en");
    const t = texto(container);
    expect(t).toContain("Proposal — Remodelação da cozinha");
    expect(t).toContain("P-2026-001 · Created on 05/03/2026");
    expect(t).toContain("Awaiting decision");
    expect(t).toContain("Total value");
    expect(t).toContain("Subtotal (excl. VAT)");
    expect(t).toContain("Valid until15/04/2026");
    expect(t).toContain("Sales representativeRita Costa");
    expect(t).toContain("PROPOSAL"); // título do cabeçalho por omissão
  });

  it("estado recebido de fora (statusLabel) não é traduzido: vem do chamador", () => {
    const { container } = renderDoc({ ...singleQuote, statusLabel: "Em análise" }, "en");
    expect(texto(container)).toContain("Em análise");
  });

  it("faixa de proposta aceite com data e hora em inglês", () => {
    const { container } = renderDoc(acceptedProposal, "en");
    const t = texto(container);
    expect(t).toContain("✅ Proposal accepted");
    expect(t).toContain("Accepted on 10 March 2026 at 14:30");
    expect(t).toContain("IP: 10.0.0.7 • Verified by SMS OTP");
  });

  it("faixa de proposta rejeitada com data e hora em inglês", () => {
    const { container } = renderDoc(rejectedProposal, "en");
    const t = texto(container);
    expect(t).toContain("❌ Proposal rejected");
    expect(t).toContain("Rejected on 11 March 2026 at 09:15");
  });

  it("vários orçamentos: seleção e estados em inglês", () => {
    const { container } = renderDoc(multiQuotes, "en");
    const t = texto(container);
    expect(t).toContain("✅ Quote accepted");
    expect(t).toContain("❌ Quote rejected");
    expect(t).toContain("📋 Quote Q-2");
    expect(t).toContain("✓ Quote selected");
    expect(t).toContain("✓ Selected for acceptance");
    expect(t).toContain("Quote total Q-1");
  });

  it("desmarcar um orçamento mostra os textos de não selecionado em inglês", () => {
    const { container } = renderDoc(multiQuotes, "en");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    const t = texto(container);
    expect(t).toContain("Select this quote");
    expect(t).toContain("Untick to exclude this quote");
    expect(t).toContain("2 of 3 quotes selected");
  });

  it("template com títulos definidos pela organização mantém-nos; sem título, segue o idioma", () => {
    const { container } = renderDoc(configuredTemplate, "en");
    const t = texto(container);
    expect(t).toContain("OBSERVAÇÕES DA ORGANIZAÇÃO"); // sectionLabel definido: fica como vem
    expect(t).toContain("Pagamento a 30 dias"); // conteúdo da organização
    expect(t).toContain("Obrigado pela preferência");
    expect(t).toContain("Cabeçalho da organização");
    expect(t).toContain("Obra completa");
    expect(t).toContain("Customer"); // client_info sem sectionLabel: o rótulo por omissão do idioma
    expect(t).toContain("Description of the work");
    expect(t).toContain("General terms");
    expect(t).toContain("Validity");
    expect(t).toContain("Proposal valid until 15/04/2026.");
    expect(t).not.toContain("Condições Gerais");
    expect(t).not.toContain("Descrição do trabalho");
  });

  it("um rótulo renomeado pela organização (label que não é o de fábrica) fica como vem", () => {
    const template = {
      terms_conditions: "<p>Pagamento a 30 dias</p>",
      sections: [{ id: "t", type: "terms", label: "Regras da casa", visible: true, settings: {} }],
    };
    const { container } = renderDoc({ ...fallbackTemplateWithTexts, template }, "en");
    expect(texto(container)).toContain("Regras da casa");
  });

  it("template sem secções: as de omissão seguem o idioma e o conteúdo da organização fica", () => {
    const { container } = renderDoc(fallbackTemplateWithTexts, "en");
    const t = texto(container);
    expect(t).toContain("PROPOSAL");
    expect(t).toContain("Company");
    expect(t).toContain("📋 Quote Q-1");
    expect(t).toContain("General terms");
    expect(t).toContain("Pagamento a 30 dias");
    expect(t).toContain("Obrigado pela preferência");
  });

  it("OTP: pedir código", () => {
    renderDoc({ ...singleQuote, otpStep: "idle", otpError: "Server said no" }, "en");
    expect(screen.getByText("SMS verification")).toBeTruthy();
    expect(screen.getByText("To accept this proposal, we will send a verification code by SMS to your mobile phone.")).toBeTruthy();
    expect(botao("Send SMS code").disabled).toBe(false);
    expect(botao("Accept and Sign").disabled).toBe(false);
    expect(botao("💬 I have questions")).toBeTruthy();
    expect(botao("✕ Reject")).toBeTruthy();
    expect(screen.getByText("Server said no")).toBeTruthy(); // erro vindo de fora: fica como vem
  });

  it("OTP: código enviado, contagem, aviso e verificar", () => {
    renderDoc({ ...singleQuote, ...otpProps }, "en");
    expect(screen.getByText("Valid for 5 minutes")).toBeTruthy();
    expect(screen.getByText("9*****123").parentElement?.textContent).toBe("Code sent to 9*****123");
    expect(botao("Resend code (30s)").disabled).toBe(true);
    expect(screen.getByText("Please wait 1 minute before requesting a new code.")).toBeTruthy();
    expect(botao("Verify")).toBeTruthy();
  });

  it("OTP: a enviar, a verificar e verificado", () => {
    const enviar = renderDoc({ ...singleQuote, otpStep: "sending" }, "en");
    expect(screen.getByText("Sending SMS code...")).toBeTruthy();
    enviar.unmount();
    const verificar = renderDoc({ ...singleQuote, otpStep: "verifying" }, "en");
    expect(screen.getByText("Verifying code and signing the proposal...")).toBeTruthy();
    verificar.unmount();
    renderDoc({ ...singleQuote, otpStep: "verified" }, "en");
    expect(screen.getByText("Code verified! Proposal accepted successfully.")).toBeTruthy();
  });

  it("pré-visualização: botão de envio inerte e aviso em inglês", () => {
    const { container } = renderDoc({ ...singleQuote, mode: "preview" }, "en");
    expect(botao("Send SMS code").disabled).toBe(true);
    expect(texto(container)).toContain("The action buttons are disabled in this preview.");
  });

  it("zona de ações: pergunta, escolha de orçamentos com total em euros ingleses e aviso de seleção", () => {
    const { container } = renderDoc(multiQuotes, "en");
    const t = texto(container);
    expect(t).toContain("Ready to move forward?");
    expect(t).toContain("Select the quotes you want to accept and confirm via SMS.");
    expect(t).toContain("3 of 3 quotes selected — Total: €");
    expect(t).not.toContain("Aceite a proposta");
  });

  it("zona de ações com um só orçamento", () => {
    const { container } = renderDoc(singleQuote, "en");
    expect(texto(container)).toContain("Accept the proposal via SMS or request changes.");
  });

  it("secções de um orçamento: contagem de secções selecionadas", () => {
    const { container } = renderDoc(multiSectionsOneQuote, "en");
    expect(texto(container)).toMatch(/2 of 2 sections selected — Total: €/);
  });

  it("rodapé com empresa e contacto do comercial", () => {
    const { container } = renderDoc(singleQuote, "en");
    const t = texto(container);
    expect(t).toContain("Proposal sent by Mudelar Lda");
    expect(t).toContain("Questions? Contact Rita Costa 912345678 rita@exemplo.pt");
  });

  it.each(Object.keys(cenarios))("%s: nenhuma palavra de interface em português", (nome) => {
    const { container } = renderDoc(cenarios[nome], "en");
    const t = texto(container)
      // conteúdo escrito pela organização / dados dos cenários, que ficam como vêm
      .replace(/Remodelação da cozinha|Cabeçalho da organização|OBSERVAÇÕES DA ORGANIZAÇÃO|Pagamento a 30 dias|Obrigado pela preferência|Obra completa|Nota interna|Deslocação|Erro X|Rascunho|Casa de banho|Artigo \w+/g, "");
    expect(t.match(PORTUGUES_DE_INTERFACE)).toBeNull();
  });

  it("não lê o idioma de nenhum armazém: com o armazém do portal em inglês, sem a prop continua português", () => {
    window.localStorage.setItem("olyvia_portal_language", "en");
    try {
      const { container } = renderDoc(singleQuote);
      expect(texto(container)).toContain("Proposta aguarda a sua decisão");
    } finally {
      window.localStorage.removeItem("olyvia_portal_language");
    }
  });

  it("um valor de idioma inesperado vindo de fora cai em português", () => {
    const { container } = renderDoc(singleQuote, "fr" as never);
    expect(texto(container)).toContain("Proposta aguarda a sua decisão");
  });

  it("o botão de reenviar e o de aceitar continuam a chamar os mesmos callbacks em inglês", () => {
    const onSendOtp = vi.fn();
    const onResendOtp = vi.fn();
    renderDoc({ ...singleQuote, otpStep: "input", otpCooldown: 0, otpCode: "", maskedPhone: "9*****123", onSendOtp, onResendOtp }, "en");
    botao("Resend code").click();
    expect(onResendOtp).toHaveBeenCalledTimes(1);
    expect(onSendOtp).not.toHaveBeenCalled();
  });
});

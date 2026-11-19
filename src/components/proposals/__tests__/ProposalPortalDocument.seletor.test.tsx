// No portal do cliente (modoVersoes="seletor") uma proposta com mais de um idioma mostra UMA versão de cada vez,
// com um seletor no topo. O CRM (modo «sequencia», a omissão) continua a mostrar as versões seguidas.
// @ts-ignore -- os tipos do Node não fazem parte do tsconfig.app; o vitest corre em Node e resolve-o
import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";
import { PT_HTML_BASELINE } from "./ProposalPortalDocument.html-baseline";
import { configuredTemplate, multiQuotes, singleQuote } from "./ProposalPortalDocument.fixtures";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

const modeloComEn = {
  ...configuredTemplate.template,
  sections: [
    ...configuredTemplate.template.sections,
    { id: "q", type: "quote_items", label: "Detalhes", visible: true, settings: {} },
  ],
  design_settings: {
    versions: {
      en: {
        header_text: "<p>Organisation header</p>",
        terms_conditions: "<p>Payment within 30 days</p>",
        footer_text: "<p>Thank you for choosing us</p>",
        sections: { t: { sectionLabel: "OUR TERMS" }, n: { sectionLabel: "ORGANISATION NOTES" } },
      },
    },
  },
};
const configuradoComEn = { ...configuredTemplate, template: modeloComEn };
const multiComEn = { ...multiQuotes, template: modeloComEn, otpStep: "idle" };

function renderDoc(props: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return render(<ProposalPortalDocument {...(props as any)} {...extra} />);
}
const texto = (c: HTMLElement) => c.textContent ?? "";
const SELETOR = { modoVersoes: "seletor", idiomasDoDocumento: ["pt", "en"] };

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("modo seletor: uma versão de cada vez", () => {
  it("com pt + en mostra o seletor e SÓ a versão escolhida (português na interface em português)", () => {
    const { container } = renderDoc(configuradoComEn, { ...SELETOR, idioma: "pt" });
    expect(screen.getByRole("radiogroup", { name: "Idioma do documento" })).toBeTruthy();
    const t = texto(container);
    expect(t).toContain("Pagamento a 30 dias");
    expect(t).toContain("OBSERVAÇÕES DA ORGANIZAÇÃO");
    expect(t).not.toContain("Payment within 30 days");
    expect(t).not.toContain("ORGANISATION NOTES");
    expect(screen.getByRole("radio", { name: "Português" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("false");
  });

  it("o idioma inicial é o da interface quando o documento o tem", () => {
    const { container } = renderDoc(configuradoComEn, { ...SELETOR, idioma: "en" });
    const t = texto(container);
    expect(t).toContain("Payment within 30 days");
    expect(t).not.toContain("Pagamento a 30 dias");
    expect(screen.getByRole("radiogroup", { name: "Document language" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true");
  });

  it("o idioma da interface que o documento não tem: o primeiro do documento", () => {
    const { container } = renderDoc(configuradoComEn, { modoVersoes: "seletor", idiomasDoDocumento: ["pt", "en"], idioma: "pt", idiomaEscolhido: "es" });
    expect(texto(container)).toContain("Pagamento a 30 dias");
  });

  it("a escolha controlada (idiomaEscolhido) manda sobre a interface", () => {
    const { container } = renderDoc(configuradoComEn, { ...SELETOR, idioma: "pt", idiomaEscolhido: "en" });
    expect(texto(container)).toContain("Payment within 30 days");
    expect(texto(container)).not.toContain("Pagamento a 30 dias");
  });

  it("o seletor está no topo, por cima do corpo da proposta", () => {
    const { container } = renderDoc(configuradoComEn, { ...SELETOR, idioma: "pt" });
    const seletor = screen.getByRole("radiogroup");
    expect(container.firstElementChild?.contains(seletor)).toBe(true);
    const corpo = screen.getByText("Pagamento a 30 dias");
    expect(seletor.compareDocumentPosition(corpo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // e por cima também dos cartões e do botão de decidir, não só do texto do template
    const cartao = screen.getByText(/Valor total/i);
    expect(seletor.compareDocumentPosition(cartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("trocar de idioma troca o texto visível e avisa quem chama (sem estado de fora, funciona sozinho)", () => {
    const onChange = vi.fn();
    const { container } = renderDoc(configuradoComEn, { ...SELETOR, idioma: "pt", onIdiomaEscolhidoChange: onChange });
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("en");
    expect(texto(container)).toContain("Payment within 30 days");
    expect(texto(container)).not.toContain("Pagamento a 30 dias");
    fireEvent.click(screen.getByRole("radio", { name: "Português" }));
    expect(onChange).toHaveBeenLastCalledWith("pt");
    expect(texto(container)).toContain("Pagamento a 30 dias");
  });

  it("as palavras do ecrã (cartões, botões, OTP) seguem a versão escolhida", () => {
    renderDoc(multiComEn, { ...SELETOR, idioma: "pt" });
    expect(screen.getAllByText("Aceitar e Assinar").length).toBe(1);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.queryAllByText("Aceitar e Assinar").length).toBe(0);
    expect(screen.getAllByText("Accept and Sign").length).toBe(1);
  });

  it("os controlos (caixas, aceitar/rejeitar, OTP, total) aparecem uma só vez, na versão escolhida, em qualquer idioma", () => {
    for (const idioma of ["pt", "en"]) {
      const { container } = renderDoc(multiComEn, { ...SELETOR, idioma });
      const caixas = within(container).getAllByRole("checkbox").length;
      expect(caixas).toBeGreaterThan(0);
      expect(screen.getAllByText(idioma === "pt" ? "Aceitar e Assinar" : "Accept and Sign").length).toBe(1);
      expect(within(container).getAllByRole("radiogroup").length).toBe(1);
      expect(texto(container)).toMatch(/Total/);
      cleanup();
    }
  });

  it("trocar de idioma não perde a seleção de orçamentos (as chaves não dependem do idioma)", () => {
    const onSelectedQuotesChange = vi.fn();
    const { container } = renderDoc(multiComEn, { ...SELETOR, idioma: "pt", onSelectedQuotesChange });
    const caixas = () => within(container).getAllByRole("checkbox");
    const total = caixas().length;
    fireEvent.click(caixas()[0]); // desmarca o primeiro orçamento
    const estadoAntes = caixas().map((c) => c.getAttribute("aria-checked"));
    expect(estadoAntes[0]).toBe("false");
    const selecionados = () => onSelectedQuotesChange.mock.calls[onSelectedQuotesChange.mock.calls.length - 1][0] as string[];
    const antes = [...selecionados()];
    expect(antes).not.toContain("q1");

    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(caixas().length).toBe(total);
    expect(caixas().map((c) => c.getAttribute("aria-checked"))).toEqual(estadoAntes);
    expect(selecionados()).toEqual(antes);

    fireEvent.click(screen.getByRole("radio", { name: "Português" }));
    expect(caixas().map((c) => c.getAttribute("aria-checked"))).toEqual(estadoAntes);
    expect(selecionados()).toEqual(antes);
  });

  it("o dinheiro não muda de formato com o idioma", () => {
    const { container } = renderDoc(configuradoComEn, { ...SELETOR, idioma: "pt" });
    const dinheiro = (s: string) => s.match(/-?€[\d.]+,\d{2}/g);
    const emPt = dinheiro(texto(container));
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(emPt && emPt.length).toBeGreaterThan(0);
    expect(dinheiro(texto(container))).toEqual(emPt);
    expect(texto(container)).not.toContain("€1,000.00");
  });
});

describe("modo seletor sem escolha a fazer: tudo como hoje", () => {
  it("um só idioma: não há seletor e o HTML é o de sempre (baseline)", () => {
    const { container } = renderDoc(singleQuote, { modoVersoes: "seletor", idiomasDoDocumento: ["pt"] });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(sha1(container.innerHTML)).toBe(PT_HTML_BASELINE.single);
  });

  it("um só idioma em inglês: sem seletor, igual ao modo sequência", () => {
    const seletor = renderDoc(configuradoComEn, { modoVersoes: "seletor", idiomasDoDocumento: ["en"] }).container.innerHTML;
    cleanup();
    const sequencia = renderDoc(configuradoComEn, { idiomasDoDocumento: ["en"] }).container.innerHTML;
    expect(seletor).toBe(sequencia);
  });

  it("idiomas sem dicionário de ecrã (es) não contam: pt + es não tem seletor", () => {
    renderDoc(configuradoComEn, { modoVersoes: "seletor", idiomasDoDocumento: ["pt", "es"] });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

describe("modo sequência (o CRM): as versões continuam seguidas", () => {
  it("sem a prop, pt + en mostra as duas versões e nenhum seletor", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(texto(container)).toContain("Pagamento a 30 dias");
    expect(texto(container)).toContain("Payment within 30 days");
  });

  it("modoVersoes='sequencia' explícito é igual à omissão", () => {
    const a = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] }).container.innerHTML;
    cleanup();
    const b = renderDoc(configuradoComEn, { modoVersoes: "sequencia", idiomasDoDocumento: ["pt", "en"] }).container.innerHTML;
    expect(b).toBe(a);
  });
});

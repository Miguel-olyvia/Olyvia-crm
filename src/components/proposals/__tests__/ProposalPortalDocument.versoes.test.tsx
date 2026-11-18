// O ProposalPortalDocument aceita `idiomasDoDocumento` (omissão ['pt']): o miolo corre uma vez por versão de
// idioma, com o template resolvido (aplicarVersaoProposta) e um título por versão; os controlos interativos só
// aparecem na primeira versão. Sem a prop, ou só com 'pt', o HTML é o de sempre (baseline).
// @ts-ignore -- os tipos do Node não fazem parte do tsconfig.app; o vitest corre em Node e resolve-o
import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProposalPortalDocument } from "../ProposalPortalDocument";
import { PT_HTML_BASELINE } from "./ProposalPortalDocument.html-baseline";
import { PT_BASELINE } from "./ProposalPortalDocument.pt-baseline";
import { cenarios, configuredTemplate, multiQuotes, multiSectionsOneQuote, singleQuote } from "./ProposalPortalDocument.fixtures";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

function renderDoc(props: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return render(<ProposalPortalDocument {...(props as any)} {...extra} />);
}
const texto = (c: HTMLElement) => c.textContent ?? "";
const versao = (c: HTMLElement, codigo: string) => c.querySelector(`[lang="${codigo}"]`) as HTMLElement | null;

const modeloComEn = {
  ...configuredTemplate.template,
  // O template do fixture não tem a secção da tabela de itens: sem ela não há caixas de seleção nem totais.
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
const multiComEn = { ...multiQuotes, template: { ...modeloComEn } };

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

describe("sem versões o HTML é o de sempre", () => {
  it.each(Object.keys(cenarios))("%s: sem a prop, o innerHTML é o do baseline", (nome) => {
    const { container } = renderDoc(cenarios[nome]);
    expect(sha1(container.innerHTML)).toBe(PT_HTML_BASELINE[nome]);
    expect(texto(container)).toBe(PT_BASELINE[nome]);
  });

  it.each(Object.keys(cenarios))("%s: idiomasDoDocumento=['pt'] dá o mesmo HTML", (nome) => {
    const { container } = renderDoc(cenarios[nome], { idiomasDoDocumento: ["pt"] });
    expect(sha1(container.innerHTML)).toBe(PT_HTML_BASELINE[nome]);
  });

  it.each(["configured", "multi", "single"])("%s: ['pt'] com um template que TEM versão inglesa não muda nada", (nome) => {
    const base = { ...cenarios[nome], template: nome === "multi" ? multiComEn.template : (nome === "configured" ? modeloComEn : null) };
    const semProp = renderDoc(base);
    const html = semProp.container.innerHTML;
    cleanup();
    expect(renderDoc(base, { idiomasDoDocumento: ["pt"] }).container.innerHTML).toBe(html);
  });

  it("lista vazia ou só com códigos inválidos: cai no idioma de sempre (a prop idioma, ou pt)", () => {
    const semProp = renderDoc(singleQuote).container.innerHTML;
    cleanup();
    expect(renderDoc(singleQuote, { idiomasDoDocumento: [] }).container.innerHTML).toBe(semProp);
    cleanup();
    expect(renderDoc(singleQuote, { idiomasDoDocumento: ["xx", ""] }).container.innerHTML).toBe(semProp);
    cleanup();
    const en = renderDoc(singleQuote, { idioma: "en" }).container.innerHTML;
    cleanup();
    expect(renderDoc(singleQuote, { idioma: "en", idiomasDoDocumento: [] }).container.innerHTML).toBe(en);
  });
});

describe("um só idioma", () => {
  it("['en'] com versão inglesa: palavras e textos do template em inglês, sem título de versão", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["en"] });
    const t = texto(container);
    expect(t).toContain("Organisation header");
    expect(t).toContain("Payment within 30 days");
    expect(t).toContain("OUR TERMS");
    expect(t).toContain("ORGANISATION NOTES");
    expect(t).toContain("Thank you for choosing us");
    expect(t).toContain("Created on 05/03/2026"); // cartão da proposta em inglês, data numérica de sempre
    expect(t).not.toContain("Pagamento a 30 dias");
    expect(screen.queryByRole("heading", { name: "English" })).toBeNull();
    expect(container.querySelector("[lang]")).toBeNull();
  });

  it("['en'] sem versão no template: palavras em inglês, textos da organização como vêm (como idioma='en')", () => {
    const a = renderDoc(singleQuote, { idiomasDoDocumento: ["en"] }).container.innerHTML;
    cleanup();
    const b = renderDoc(singleQuote, { idioma: "en" }).container.innerHTML;
    expect(a).toBe(b);
  });

  it("idiomasDoDocumento manda sobre idioma quando vem", () => {
    const { container } = renderDoc(singleQuote, { idioma: "en", idiomasDoDocumento: ["pt"] });
    expect(sha1(container.innerHTML)).toBe(PT_HTML_BASELINE.single);
    cleanup();
    const b = renderDoc(singleQuote, { idioma: "pt", idiomasDoDocumento: ["en"] }).container.innerHTML;
    cleanup();
    expect(b).toBe(renderDoc(singleQuote, { idioma: "en" }).container.innerHTML);
  });

  it("o template recebido não é alterado", () => {
    const antes = JSON.stringify(configuradoComEn.template);
    renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    expect(JSON.stringify(configuradoComEn.template)).toBe(antes);
  });
});

describe("pt + en", () => {
  it("cada versão com o seu título (nome no próprio idioma), português primeiro", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    const pt = versao(container, "pt")!;
    const en = versao(container, "en")!;
    expect(pt).toBeTruthy();
    expect(en).toBeTruthy();
    expect(within(pt).getByRole("heading", { name: "Português" })).toBeTruthy();
    expect(within(en).getByRole("heading", { name: "English" })).toBeTruthy();
    expect(pt.compareDocumentPosition(en) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o miolo corre uma vez por versão, com o template resolvido e as palavras do idioma", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    const pt = texto(versao(container, "pt")!);
    const en = texto(versao(container, "en")!);
    expect(pt).toContain("Cabeçalho da organização");
    expect(pt).toContain("Pagamento a 30 dias");
    expect(pt).toContain("Obrigado pela preferência");
    expect(pt).toContain("OBSERVAÇÕES DA ORGANIZAÇÃO");
    expect(en).toContain("Organisation header");
    expect(en).toContain("Payment within 30 days");
    expect(en).toContain("OUR TERMS");
    expect(en).toContain("ORGANISATION NOTES");
    expect(en).toContain("Thank you for choosing us");
    expect(en).not.toContain("Pagamento a 30 dias");
    expect(pt).not.toContain("Payment within 30 days");
  });

  it("os textos dos dados não se traduzem (descrição, notas, cliente)", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    const en = texto(versao(container, "en")!);
    expect(en).toContain("Obra completa"); // proposal.description
    expect(en).toContain("Ana Silva"); // cliente
    expect(en).toContain("Artigo a"); // linha do orçamento
  });

  it("o formato do dinheiro não muda com o idioma", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    const pt = texto(versao(container, "pt")!);
    const en = texto(versao(container, "en")!);
    const dinheiro = (s: string) => s.match(/-?€[\d.]+,\d{2}/g);
    expect(dinheiro(en)).toEqual(dinheiro(pt));
    expect(en).toContain("€1.000,00");
    expect(en).not.toContain("€1,000.00");
  });

  it("a tabela de itens em inglês na segunda versão", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "en"] });
    const en = versao(container, "en")!;
    const cabecalhos = within(en).getAllByRole("columnheader").map((th) => th.textContent);
    expect(cabecalhos).toEqual(["Item", "QTY", "Unit price", "Total"]);
    const pt = versao(container, "pt")!;
    expect(within(pt).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Item", "QTD", "Preço Unit.", "Total"]);
  });

  it("template sem versão inglesa e pedido pt+en: as duas versões saem (inglês com as palavras, textos como vêm)", () => {
    const { container } = renderDoc(singleQuote, { idiomasDoDocumento: ["pt", "en"] });
    expect(versao(container, "pt")).toBeTruthy();
    expect(versao(container, "en")).toBeTruthy();
  });

  it("um código sem dicionário no portal (es) tem título nativo e palavras em português", () => {
    const { container } = renderDoc(singleQuote, { idiomasDoDocumento: ["pt", "es"] });
    expect(within(versao(container, "es")!).getByRole("heading", { name: "Español" })).toBeTruthy();
    expect(within(versao(container, "es")!).getAllByRole("columnheader").map((th) => th.textContent)).toContain("QTD");
  });

  it("códigos repetidos ou inválidos são ignorados", () => {
    const { container } = renderDoc(configuradoComEn, { idiomasDoDocumento: ["pt", "pt", "xx", "en", "EN"] });
    expect(container.querySelectorAll("[lang]").length).toBe(2);
  });

  it("uma versão sem nada para mostrar não deixa título solto", () => {
    const vazio = { ...singleQuote, template: { show_quote_details: false, sections: [{ id: "q", type: "quote_items", visible: true, settings: {} }] }, quotes: [] };
    const { container } = renderDoc(vazio, { idiomasDoDocumento: ["pt", "en"] });
    expect(container.querySelector("[lang]")).toBeNull();
  });
});

describe("controlos interativos só na primeira versão", () => {
  it("caixas de seleção: as mesmas que com um só idioma, nenhuma na segunda versão", () => {
    const um = renderDoc(multiComEn, { idiomasDoDocumento: ["pt"] });
    const caixasUm = within(um.container).getAllByRole("checkbox").length;
    expect(caixasUm).toBeGreaterThan(0);
    cleanup();
    const dois = renderDoc(multiComEn, { idiomasDoDocumento: ["pt", "en"] });
    expect(within(dois.container).getAllByRole("checkbox").length).toBe(caixasUm);
    expect(within(versao(dois.container, "pt")!).getAllByRole("checkbox").length).toBe(caixasUm);
    expect(within(versao(dois.container, "en")!).queryAllByRole("checkbox").length).toBe(0);
  });

  it("a segunda versão não leva realce de seleção nem botões de PDF, mas leva totais e estados", () => {
    const { container } = renderDoc(multiComEn, { idiomasDoDocumento: ["pt", "en"] });
    const en = versao(container, "en")!;
    expect(en.innerHTML).not.toMatch(/ring-primary\/40|opacity-60/);
    expect(within(en).queryAllByRole("button").length).toBe(0);
    expect(texto(en)).toContain("Quote total Q-1");
    expect(texto(en)).toContain("Quote accepted");
    expect(texto(en)).toContain("Quote rejected");
    expect(texto(en)).toContain("Grand total (incl. VAT)");
    expect(texto(en)).not.toMatch(/Selected|Select /);
  });

  it("a primeira versão mantém o realce e os botões de sempre", () => {
    const { container } = renderDoc(multiComEn, { idiomasDoDocumento: ["pt", "en"] });
    const pt = versao(container, "pt")!;
    expect(pt.innerHTML).toMatch(/ring-primary\/40/);
    expect(within(pt).queryAllByRole("button").length).toBeGreaterThan(0);
  });

  it("OTP, aceitar/rejeitar e total selecionado aparecem uma só vez, fora das versões", () => {
    const props = { ...multiComEn, otpStep: "idle" };
    const { container } = renderDoc(props, { idiomasDoDocumento: ["pt", "en"] });
    expect(screen.getAllByText("Aceitar e Assinar").length).toBe(1);
    expect(screen.getAllByText("✕ Rejeitar").length).toBe(1);
    expect(screen.getAllByText("Verificação por SMS").length).toBe(1);
    expect(texto(container)).toContain("Total:");
    for (const codigo of ["pt", "en"]) {
      const v = versao(container, codigo)!;
      expect(texto(v)).not.toContain("Aceitar e Assinar");
      expect(texto(v)).not.toContain("Verificação por SMS");
    }
  });

  it("marcar e desmarcar na primeira versão continua a mexer no total selecionado", () => {
    const onSelectedQuotesChange = vi.fn();
    const { container } = renderDoc({ ...multiComEn, otpStep: "idle" }, { idiomasDoDocumento: ["pt", "en"], onSelectedQuotesChange });
    const primeira = within(versao(container, "pt")!).getAllByRole("checkbox")[0];
    fireEvent.click(primeira);
    const ultima = onSelectedQuotesChange.mock.calls[onSelectedQuotesChange.mock.calls.length - 1][0] as string[];
    expect(ultima).not.toContain("q1");
  });

  it("várias secções num só orçamento: caixas só na primeira versão", () => {
    const props = { ...multiSectionsOneQuote, template: modeloComEn };
    const { container } = renderDoc(props, { idiomasDoDocumento: ["pt", "en"] });
    expect(within(versao(container, "pt")!).getAllByRole("checkbox").length).toBeGreaterThan(0);
    expect(within(versao(container, "en")!).queryAllByRole("checkbox").length).toBe(0);
    expect(texto(versao(container, "en")!)).toContain("Subtotal (all sections)");
  });
});

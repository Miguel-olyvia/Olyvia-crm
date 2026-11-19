import { describe, expect, it } from "vitest";
import { renderContractHeaderHtml } from "../contractHeader";

const EMPRESA = {
  empresa_nome: "Mudelar",
  empresa_nif: "514234567",
  empresa_morada: "Rua da Empresa 42",
  empresa_telefone: "210000000",
  empresa_email: "geral@mudelar.pt",
  contrato_numero: "CC-2026-0003",
  comercial_nome: "Ricardo",
  data: "2026-03-13",
};

describe("renderContractHeaderHtml com idioma", () => {
  it("bloco do contrato em inglês: título, número, data e comercial", () => {
    const html = renderContractHeaderHtml({ header_style: "split" }, EMPRESA, "en");
    expect(html).toContain(">CONTRACT<");
    expect(html).toContain(">CONTRACT No.<");
    expect(html).toContain(">Date:<");
    expect(html).toContain(">Sales rep:<");
    expect(html).not.toContain("CONTRATO");
    expect(html).not.toContain("Comercial:");
  });

  it("linhas da empresa em inglês (NIF e telefone); os valores não mudam", () => {
    const html = renderContractHeaderHtml({ header_style: "split" }, EMPRESA, "en");
    expect(html).toContain("Tax ID: 514234567");
    expect(html).toContain("Tel: 210000000");
    expect(html).toContain("Rua da Empresa 42");
    expect(html).toContain("geral@mudelar.pt");
    expect(html).toContain("CC-2026-0003");
    expect(html).toContain("2026-03-13");
  });

  it("estilo simples também traduz as linhas da empresa", () => {
    const html = renderContractHeaderHtml(null, EMPRESA, "en");
    expect(html).toContain("Tax ID: 514234567");
    expect(html).not.toContain("NIF:");
  });

  it("rótulos escolhidos no modelo mandam, em qualquer idioma", () => {
    const html = renderContractHeaderHtml(
      { header_style: "split", contract_block_title: "SERVICES AGREEMENT", contract_block_number_label: "No.", contract_block_date_label: "On:", contract_block_commercial_label: "Rep:" },
      EMPRESA,
      "en",
    );
    expect(html).toContain(">SERVICES AGREEMENT<");
    expect(html).toContain(">No.<");
    expect(html).toContain(">On:<");
    expect(html).toContain(">Rep:<");
  });

  it("rótulos a null (versão sem eles) caem no dicionário do idioma", () => {
    const html = renderContractHeaderHtml(
      { header_style: "split", contract_block_title: null, contract_block_number_label: null, contract_block_date_label: null, contract_block_commercial_label: null },
      EMPRESA,
      "en",
    );
    expect(html).toContain(">CONTRACT<");
    expect(html).toContain(">Date:<");
  });

  it("português é a omissão e idioma desconhecido cai nele", () => {
    const base = renderContractHeaderHtml({ header_style: "split" }, EMPRESA);
    expect(base).toContain(">CONTRATO<");
    expect(base).toContain("NIF: 514234567");
    expect(renderContractHeaderHtml({ header_style: "split" }, EMPRESA, "pt")).toBe(base);
    expect(renderContractHeaderHtml({ header_style: "split" }, EMPRESA, "xx")).toBe(base);
    expect(renderContractHeaderHtml({ header_style: "split" }, EMPRESA, undefined)).toBe(base);
  });
});

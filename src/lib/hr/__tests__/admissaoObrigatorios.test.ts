/**
 * A lista partilhada de obrigatorios do convite de admissao -- ver
 * `admissaoObrigatorios.ts`. O que este ficheiro protege:
 *
 *  - `dependentes = "0"` conta como preenchido (e resposta, nao ausencia).
 *  - `validade_documento` so e obrigatoria quando o documento NAO e cartao
 *    de cidadao, e um `tipo_documento` por escolher nao arrasta a validade
 *    consigo -- so a sua propria pendencia aparece.
 *  - um rascunho completo nao deixa pendencia nenhuma.
 */
import { describe, expect, it } from "vitest";
import {
  campoEhObrigatorio,
  pendenciasDoRascunho,
  type RascunhoConviteObrigatorios,
} from "@/lib/hr/admissaoObrigatorios";

const VAZIO: RascunhoConviteObrigatorios = {
  data_nascimento: "",
  nacionalidade: "",
  telefone_pessoal: "",
  email_pessoal: "",
  estado_civil: "",
  dependentes: "",
  nif: "",
  niss: "",
  tipo_documento: "",
  numero_documento: "",
  validade_documento: "",
  linha1: "",
  codigo_postal: "",
  localidade: "",
};

const COMPLETO: RascunhoConviteObrigatorios = {
  data_nascimento: "1990-01-01",
  nacionalidade: "PT",
  telefone_pessoal: "912345678",
  email_pessoal: "pessoa@example.com",
  estado_civil: "solteiro",
  dependentes: "0",
  nif: "123456789",
  niss: "12345678901",
  tipo_documento: "cartao_cidadao",
  numero_documento: "12345678",
  validade_documento: "",
  linha1: "Rua Principal 1",
  codigo_postal: "1000-001",
  localidade: "Lisboa",
};

describe("pendenciasDoRascunho", () => {
  it("um rascunho vazio tem pendencia em todos os campos incondicionais", () => {
    const pendencias = pendenciasDoRascunho(VAZIO);
    expect(pendencias).toContain("data_nascimento");
    expect(pendencias).toContain("niss");
    expect(pendencias).toContain("nif");
    expect(pendencias).toContain("linha1");
    // validade_documento NAO e pendencia so por o tipo ainda estar vazio.
    expect(pendencias).not.toContain("validade_documento");
  });

  it("dependentes = '0' conta como preenchido, nao como ausente", () => {
    const rascunho = { ...COMPLETO, dependentes: "0" };
    expect(pendenciasDoRascunho(rascunho)).not.toContain("dependentes");
  });

  it("dependentes = '' fica pendente mesmo com o resto preenchido", () => {
    const rascunho = { ...COMPLETO, dependentes: "" };
    expect(pendenciasDoRascunho(rascunho)).toContain("dependentes");
  });

  it("validade_documento fica obrigatoria quando o documento nao e cartao de cidadao", () => {
    const rascunho = { ...COMPLETO, tipo_documento: "passaporte", validade_documento: "" };
    expect(pendenciasDoRascunho(rascunho)).toContain("validade_documento");
  });

  it("validade_documento nao e exigida para cartao de cidadao", () => {
    const rascunho = { ...COMPLETO, tipo_documento: "cartao_cidadao", validade_documento: "" };
    expect(pendenciasDoRascunho(rascunho)).not.toContain("validade_documento");
  });

  it("um rascunho completo (cartao de cidadao) nao deixa pendencia nenhuma", () => {
    expect(pendenciasDoRascunho(COMPLETO)).toEqual([]);
  });
});

describe("campoEhObrigatorio", () => {
  it("validade_documento so fica marcada obrigatoria depois de escolhido um tipo diferente de cartao de cidadao", () => {
    expect(campoEhObrigatorio(VAZIO, "validade_documento")).toBe(false);
    expect(
      campoEhObrigatorio({ ...VAZIO, tipo_documento: "cartao_cidadao" }, "validade_documento"),
    ).toBe(false);
    expect(
      campoEhObrigatorio({ ...VAZIO, tipo_documento: "passaporte" }, "validade_documento"),
    ).toBe(true);
  });

  it("niss e sempre obrigatorio", () => {
    expect(campoEhObrigatorio(VAZIO, "niss")).toBe(true);
  });
});

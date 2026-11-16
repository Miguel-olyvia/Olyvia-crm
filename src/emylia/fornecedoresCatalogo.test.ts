import { describe, expect, it } from "vitest";
import { argsLigarFornecedor, validarNovoFornecedor } from "./fornecedoresCatalogo";

describe("validarNovoFornecedor", () => {
  it("o nome é obrigatório", () => {
    expect(validarNovoFornecedor({ nome: "  ", nif: "", email: "" })).toMatch(/nome/i);
  });
  it("NIF e email são opcionais, mas se escritos têm de ter forma de NIF e de email", () => {
    expect(validarNovoFornecedor({ nome: "A", nif: "", email: "" })).toBeNull();
    expect(validarNovoFornecedor({ nome: "A", nif: "500 100 200", email: "a@b.pt" })).toBeNull();
    expect(validarNovoFornecedor({ nome: "A", nif: "12", email: "" })).toMatch(/NIF/);
    expect(validarNovoFornecedor({ nome: "A", nif: "", email: "sem-arroba" })).toMatch(/email/i);
  });
});

describe("argsLigarFornecedor", () => {
  it("exatamente um de p_fornecedor / p_novo_nome", () => {
    expect(argsLigarFornecedor("o", "p", { fornecedorId: "f" })).toEqual({ p_org: "o", p_produto: "p", p_fornecedor: "f", p_novo_nome: null, p_nif: null, p_email: null });
    expect(argsLigarFornecedor("o", "p", { fornecedorNovo: { nome: " N ", nif: "5001 00200", email: "a@b.pt" } }))
      .toEqual({ p_org: "o", p_produto: "p", p_fornecedor: null, p_novo_nome: "N", p_nif: "500100200", p_email: "a@b.pt" });
    expect(argsLigarFornecedor("o", "p", {})).toBeNull();
  });
});

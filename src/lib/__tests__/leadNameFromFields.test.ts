import { describe, expect, it } from "vitest";
import { resolveLeadNames } from "@/lib/leadNameFromFields";

const defs = [
  { field_key: "first_name", field_type: "text", contact_field_mapping: "first_name" },
  { field_key: "last_name", field_type: "text", contact_field_mapping: "last_name" },
  { field_key: "company_name", field_type: "text", contact_field_mapping: "company_name" },
];

describe("resolveLeadNames (nome da ficha na criacao da lead: nome + apelido)", () => {
  it("a empresa nao entra no nome: sai 'Rui Costa', nunca 'Rui Costa Empresa Lda'", () => {
    const r = resolveLeadNames(defs, { first_name: "Rui", last_name: "Costa", company_name: "Empresa Lda" });
    expect(r.displayName).toBe("Rui Costa");
    expect(r.firstName).toBe("Rui");
    expect(r.lastName).toBe("Costa");
  });

  it("sem empresa: nome + apelido", () => {
    expect(resolveLeadNames(defs, { first_name: "Rui", last_name: "Costa" }).displayName).toBe("Rui Costa");
  });

  it("so empresa e sem nome: o nome fica vazio (o chamador escolhe o recurso)", () => {
    const r = resolveLeadNames(defs, { company_name: "Empresa Lda" });
    expect(r.displayName).toBe("");
    expect(r.firstName).toBeNull();
    expect(r.lastName).toBeNull();
  });

  it("chaves de empresa sem mapeamento (empresa, nome_empresa, company, nome_da_empresa) tambem nao entram no nome", () => {
    for (const key of ["empresa", "nome_empresa", "company", "nome_da_empresa"]) {
      const r = resolveLeadNames(
        [
          { field_key: "nome", field_type: "text" },
          { field_key: "apelido_nome", field_type: "text" },
          { field_key: key, field_type: "text" },
        ],
        { nome: "Rui", apelido_nome: "Costa", [key]: "Empresa Lda" },
      );
      expect(r.displayName, key).toBe("Rui Costa");
    }
  });

  it("campos de texto 'nome'/'name' sem mapeamento continuam a formar o nome da pessoa", () => {
    const r = resolveLeadNames(
      [{ field_key: "nome", field_type: "text" }, { field_key: "sobrenome_name", field_type: "text" }],
      { nome: "Ana", sobrenome_name: "Silva" },
    );
    expect(r.displayName).toBe("Ana Silva");
    expect(r.firstName).toBe("Ana");
    expect(r.lastName).toBe("Silva");
  });

  it("nome completo num so campo reparte-se em nome e apelido", () => {
    const r = resolveLeadNames([{ field_key: "name", field_type: "text" }], { name: "Ana Maria Silva" });
    expect(r.displayName).toBe("Ana Maria Silva");
    expect(r.firstName).toBe("Ana");
    expect(r.lastName).toBe("Maria Silva");
  });

  it("nome e apelido repetidos nao duplicam o nome", () => {
    expect(resolveLeadNames(defs, { first_name: "Rui Costa", last_name: "Costa" }).displayName).toBe("Rui Costa");
  });

  it("campos que nao sao de nome (email, observacoes) nao entram", () => {
    const r = resolveLeadNames(
      [...defs, { field_key: "email", field_type: "email" }, { field_key: "observacoes", field_type: "text" }],
      { first_name: "Rui", email: "rui@x.pt", observacoes: "ligar amanha" },
    );
    expect(r.displayName).toBe("Rui");
  });

  it("sem nada: displayName vazio", () => {
    const r = resolveLeadNames(defs, {});
    expect(r.displayName).toBe("");
    expect(r.firstName).toBeNull();
    expect(r.lastName).toBeNull();
  });
});

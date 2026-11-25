import { describe, expect, it } from "vitest";
import { nameFieldsChanged, resolveClientNameForSave } from "@/lib/nameOnSave";

describe("nameFieldsChanged", () => {
  it("campos iguais (mesmo com espacos a mais ou null vs vazio) nao contam como alteracao", () => {
    expect(nameFieldsChanged({ first: "Ana", last: null }, { first: " Ana ", last: "" })).toBe(false);
    expect(nameFieldsChanged({ first: "Ana  Maria", last: "Silva" }, { first: "Ana Maria", last: "Silva" })).toBe(false);
  });

  it("qualquer campo diferente conta como alteracao", () => {
    expect(nameFieldsChanged({ first: "Ana", last: "Silva" }, { first: "Ana", last: "Costa" })).toBe(true);
    expect(nameFieldsChanged({ first: "Ana", last: "Silva" }, { first: "Rita", last: "Silva" })).toBe(true);
    expect(nameFieldsChanged({ first: "Ana", last: "Silva", company: "" }, { first: "Ana", last: "Silva", company: "X, Lda" })).toBe(true);
  });
});

describe("resolveClientNameForSave", () => {
  const empresa = { display_name: "Empresa X, Lda", first_name: "Empresa", last_name: "X, Lda" };

  it("gravar sem tocar no nome mantem o display_name da ficha (nome de empresa nao se estraga)", () => {
    const out = resolveClientNameForSave(empresa, { first_name: "Empresa", last_name: "X, Lda" });
    expect(out.displayName).toBe("Empresa X, Lda");
    expect(out.first).toBe("Empresa");
    expect(out.last).toBe("X, Lda");
  });

  it("display_name que nao e nome+apelido (empresa com contacto) sobrevive a uma gravacao sem alteracao", () => {
    const out = resolveClientNameForSave(
      { display_name: "Construcoes Silva", first_name: "Ana", last_name: "Silva" },
      { first_name: "Ana", last_name: "Silva" },
    );
    expect(out.displayName).toBe("Construcoes Silva");
  });

  it("gravar depois de alterar o apelido recompoe o display_name", () => {
    const out = resolveClientNameForSave(
      { display_name: "Ana Silva", first_name: "Ana", last_name: "Silva" },
      { first_name: "Ana", last_name: "Costa" },
    );
    expect(out.displayName).toBe("Ana Costa");
    expect(out.last).toBe("Costa");
  });

  it("alterar o nome numa ficha cujo display_name era de empresa troca o nome (o dono pediu)", () => {
    const out = resolveClientNameForSave(empresa, { first_name: "Empresa Y", last_name: "X, Lda" });
    expect(out.displayName).toBe("Empresa Y X, Lda");
  });

  it("sem display_name carregado, compoe a partir dos campos", () => {
    const out = resolveClientNameForSave(
      { display_name: "", first_name: "Ana", last_name: "Silva" },
      { first_name: "Ana", last_name: "Silva" },
    );
    expect(out.displayName).toBe("Ana Silva");
  });
});

describe("resolveClientNameForSave com empresa (nome = empresa, senao nome + apelido)", () => {
  const comEmpresa = { display_name: "Evolar Lda", first_name: "Rui", last_name: "Costa", company_name: "Evolar Lda" };

  it("editar o apelido de uma ficha com empresa troca o nome pela empresa, nunca por nome + apelido", () => {
    const out = resolveClientNameForSave(comEmpresa, { first_name: "Rui", last_name: "Silva" });
    expect(out.displayName).toBe("Evolar Lda");
    expect(out.last).toBe("Silva");
  });

  it("gravar sem tocar no nome mantem o display_name carregado", () => {
    const out = resolveClientNameForSave(comEmpresa, { first_name: "Rui", last_name: "Costa" });
    expect(out.displayName).toBe("Evolar Lda");
  });

  it("nome intocado: o display_name guardado mantem-se EM BRUTO (espacos duplos, NBSP, espacos nas pontas)", () => {
    for (const bruto of ["EVOLAR  LDA ", "EVOLAR LDA", " Evolar Lda"]) {
      const out = resolveClientNameForSave(
        { display_name: bruto, first_name: "Rui", last_name: "Silva", company_name: "Evolar Lda" },
        { first_name: " Rui", last_name: "Silva  " },
      );
      expect(out.displayName).toBe(bruto);
    }
  });

  it("nome alterado numa ficha com display_name em bruto: compoe (a empresa, normalizada)", () => {
    const out = resolveClientNameForSave(
      { display_name: "EVOLAR  LDA ", first_name: "Rui", last_name: "Silva", company_name: "EVOLAR  LDA " },
      { first_name: "Rui", last_name: "Costa" },
    );
    expect(out.displayName).toBe("EVOLAR LDA");
  });

  it("empresa so de espacos conta como vazia", () => {
    const out = resolveClientNameForSave(
      { display_name: "Rui Costa", first_name: "Rui", last_name: "Costa", company_name: "  " },
      { first_name: "Rui", last_name: "Silva" },
    );
    expect(out.displayName).toBe("Rui Silva");
  });
});

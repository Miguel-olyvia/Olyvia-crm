import { describe, expect, it } from "vitest";
import { getCompanyNameWarning } from "@/lib/companyNameWarning";

describe("getCompanyNameWarning", () => {
  it.each([
    "Evolar Moveis LDA",
    "Evolar Moveis, Lda.",
    "Evolar L.da",
    "Evolar S.A.",
    "Evolar SA",
    "Evolar Unipessoal",
    "Evolar Sociedade",
  ])("apelido '%s' com a empresa vazia avisa", (last) => {
    expect(getCompanyNameWarning({ first: "Rui", last, company: "" })).toBe("looks-like-company");
  });

  it("o sufixo no nome (sem apelido) tambem avisa", () => {
    expect(getCompanyNameWarning({ first: "Evolar Lda", last: "", company: null })).toBe("looks-like-company");
  });

  it("nome normal nao avisa", () => {
    expect(getCompanyNameWarning({ first: "Rui", last: "Costa", company: "" })).toBeNull();
  });

  it("apelido 'Sa' (pessoa) nao avisa, nem 'Lda' no meio do texto", () => {
    expect(getCompanyNameWarning({ first: "Maria", last: "Sa", company: "" })).toBeNull();
    expect(getCompanyNameWarning({ first: "Lda", last: "Costa", company: "" })).toBeNull();
  });

  it("com a empresa preenchida e diferente do nome nao avisa, mesmo que o apelido acabe em Lda", () => {
    expect(getCompanyNameWarning({ first: "Rui", last: "Costa", company: "Evolar Lda" })).toBeNull();
    expect(getCompanyNameWarning({ first: "Rui", last: "Costa Lda", company: "Evolar Lda" })).toBeNull();
  });

  it("empresa igual a nome + apelido avisa (ignora maiusculas e espacos a mais)", () => {
    expect(getCompanyNameWarning({ first: "Rui", last: "Costa", company: "rui  COSTA " })).toBe("company-equals-name");
  });

  it("empresa igual so ao nome, sem apelido, avisa", () => {
    expect(getCompanyNameWarning({ first: "Evolar", last: null, company: "Evolar" })).toBe("company-equals-name");
  });

  it("tudo vazio nao avisa", () => {
    expect(getCompanyNameWarning({ first: "", last: "", company: "" })).toBeNull();
    expect(getCompanyNameWarning({})).toBeNull();
  });
});

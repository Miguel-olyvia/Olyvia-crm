import { describe, expect, it } from "vitest";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG, codigoDoErro, chaveDoErro } from "./errosNeg";

// NG026 é da migration de recusa do orçamento (20261226210000, ainda sem ecrã); NG027 é a pessoa da lead fora do âmbito (classificar).
const CODIGOS = [...Array.from({ length: 25 }, (_, i) => `NG${String(i + 1).padStart(3, "0")}`), "NG027", "NG028", "NG030", "NG031"];

describe("errosNeg", () => {
  it("há uma chave própria para cada código NG001 a NG025, NG027, NG028, NG030, NG031 e para 42501", () => {
    for (const codigo of [...CODIGOS, "42501"]) expect(CHAVES_ERRO_NEG[codigo], codigo).toMatch(/^pessoasPagina\.erroNeg\./);
    const chaves = Object.values(CHAVES_ERRO_NEG);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).toHaveLength(30);
  });

  it("lê o código de error.code", () => {
    expect(codigoDoErro({ code: "NG006", message: "x" })).toBe("NG006");
    expect(chaveDoErro({ code: "NG006", message: "x" })).toBe(CHAVES_ERRO_NEG.NG006);
    expect(chaveDoErro({ code: "42501", message: "permission denied" })).toBe(CHAVES_ERRO_NEG["42501"]);
  });

  it("só procura o código no texto quando code não é uma string ou está vazio", () => {
    expect(codigoDoErro({ message: "NG010: recurso ocupado" })).toBe("NG010");
    expect(codigoDoErro({ code: null, message: "x", details: "NG004 registo" })).toBe("NG004");
    expect(chaveDoErro({ code: "", message: "falhou [NG011]" })).toBe(CHAVES_ERRO_NEG.NG011);
    // code string de outra origem: o NG no texto não conta como esperado
    expect(codigoDoErro({ code: "57014", message: "NG001 no texto" })).toBeNull();
    expect(codigoDoErro({ code: "P0001", message: "erro", details: "NG004 registo" })).toBeNull();
  });

  it("nomes herdados do objeto não são códigos", () => {
    for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(codigoDoErro({ code, message: "x" }), code).toBeNull();
      expect(chaveDoErro({ code, message: "x" }), code).toBe(CHAVE_ERRO_GENERICO);
    }
  });

  it("error.code tem prioridade sobre o texto", () => {
    expect(codigoDoErro({ code: "NG002", message: "NG009 qualquer" })).toBe("NG002");
  });

  it("não confunde números maiores nem texto parecido", () => {
    expect(codigoDoErro({ message: "NG0011 x" })).toBeNull();
    expect(codigoDoErro({ message: "xNG001" })).toBeNull();
    // NG019 a NG025 existem (contacto de outra pessoa; demasiadas verificações; questionário alterado; o tipo de fecho; proposta viva); NG026 está
    // reservado a outra migration e ainda não tem ecrã: não se reconhece. NG027 existe (a pessoa da lead fora do âmbito de quem classifica).
    expect(codigoDoErro({ message: "NG026 x" })).toBeNull();
    expect(codigoDoErro({ message: "falhou [NG027]" })).toBe("NG027");
    expect(codigoDoErro({ code: "NG027", message: "x" })).toBe("NG027");
    expect(codigoDoErro({ message: "NG0271 x" })).toBeNull();
    expect(codigoDoErro({ message: "NG0211 x" })).toBeNull();
    expect(codigoDoErro({ message: "NG0201 x" })).toBeNull();
  });

  it("código desconhecido, nulo ou de tipo inesperado devolve a chave genérica", () => {
    expect(chaveDoErro({ code: "57014", message: "timeout" })).toBe(CHAVE_ERRO_GENERICO);
    for (const e of [null, undefined, "NG001", 42, {}, { code: 5, message: 7 }]) {
      expect(chaveDoErro(e), String(e)).toBe(CHAVE_ERRO_GENERICO);
    }
  });
});

describe("errosNeg: NG016, NG017 e NG018", () => {
  it.each(["NG016", "NG017", "NG018"])("%s lê-se de error.code e do texto, com a sua chave", (codigo) => {
    expect(codigoDoErro({ code: codigo, message: "x" })).toBe(codigo);
    expect(codigoDoErro({ message: `falhou [${codigo}]` })).toBe(codigo);
    expect(chaveDoErro({ code: codigo, message: "x" })).toBe(`pessoasPagina.erroNeg.${codigo.toLowerCase()}`);
  });
});

describe("errosNeg: NG021 (o questionário do levantamento foi alterado entretanto)", () => {
  it("lê-se de error.code e do texto, com a sua chave", () => {
    expect(codigoDoErro({ code: "NG021", message: "x" })).toBe("NG021");
    expect(codigoDoErro({ message: "falhou [NG021]" })).toBe("NG021");
    expect(codigoDoErro({ code: null, message: "x", details: "NG021" })).toBe("NG021");
    expect(chaveDoErro({ code: "NG021", message: "x" })).toBe("pessoasPagina.erroNeg.ng021");
  });
});

describe("errosNeg: NG022, NG023 e NG024 (o tipo de fecho do negócio)", () => {
  it.each(["NG022", "NG023", "NG024"])("%s lê-se de error.code e do texto, com a sua chave", (codigo) => {
    expect(codigoDoErro({ code: codigo, message: "x" })).toBe(codigo);
    expect(codigoDoErro({ message: `falhou [${codigo}]` })).toBe(codigo);
    expect(codigoDoErro({ code: null, message: "x", details: codigo })).toBe(codigo);
    expect(chaveDoErro({ code: codigo, message: "x" })).toBe(`pessoasPagina.erroNeg.${codigo.toLowerCase()}`);
  });

  it("não confunde NG0221 nem NG0251", () => {
    expect(codigoDoErro({ message: "NG0221 x" })).toBeNull();
    expect(codigoDoErro({ message: "NG0251 x" })).toBeNull();
  });
});

describe("errosNeg: NG025 (um negócio com proposta enviada ou aceite não cria outra)", () => {
  it("lê-se de error.code e do texto, com a sua chave", () => {
    expect(codigoDoErro({ code: "NG025", message: "x" })).toBe("NG025");
    expect(codigoDoErro({ message: "falhou [NG025]" })).toBe("NG025");
    expect(codigoDoErro({ code: null, message: "x", details: "NG025" })).toBe("NG025");
    expect(chaveDoErro({ code: "NG025", message: "x" })).toBe("pessoasPagina.erroNeg.ng025");
  });

  it("não confunde NG0251 nem xNG025", () => {
    expect(codigoDoErro({ message: "NG0251 x" })).toBeNull();
    expect(codigoDoErro({ message: "xNG025" })).toBeNull();
  });
});

describe("errosNeg: NG028 (um negócio ganho ou perdido não muda título, notas nem comercial)", () => {
  it("lê-se de error.code e do texto, com a sua chave", () => {
    expect(codigoDoErro({ code: "NG028", message: "x" })).toBe("NG028");
    expect(codigoDoErro({ message: "falhou [NG028]" })).toBe("NG028");
    expect(codigoDoErro({ code: null, message: "x", details: "NG028" })).toBe("NG028");
    expect(chaveDoErro({ code: "NG028", message: "x" })).toBe("pessoasPagina.erroNeg.ng028");
  });

  it("não confunde NG0281, xNG028 nem NG029", () => {
    expect(codigoDoErro({ message: "NG0281 x" })).toBeNull();
    expect(codigoDoErro({ message: "xNG028" })).toBeNull();
    expect(codigoDoErro({ message: "NG029 x" })).toBeNull();
  });
});

describe("errosNeg: NG031 (recusa genérica do NIF)", () => {
  it("lê-se de error.code e do texto, com a sua chave; não confunde NG0311", () => {
    expect(codigoDoErro({ code: "NG031", message: "x" })).toBe("NG031");
    expect(codigoDoErro({ message: "falhou [NG031]" })).toBe("NG031");
    expect(chaveDoErro({ code: "NG031", message: "x" })).toBe("pessoasPagina.erroNeg.ng031");
    expect(codigoDoErro({ message: "NG0311 x" })).toBeNull();
  });
});

describe("errosNeg: NG030 (o NIF já pertence a outra pessoa da organização)", () => {
  it("lê-se de error.code e do texto, com a sua chave; não confunde NG0301 nem xNG030", () => {
    expect(codigoDoErro({ code: "NG030", message: "x" })).toBe("NG030");
    expect(codigoDoErro({ message: "falhou [NG030]" })).toBe("NG030");
    expect(chaveDoErro({ code: "NG030", message: "x" })).toBe("pessoasPagina.erroNeg.ng030");
    expect(codigoDoErro({ message: "NG0301 x" })).toBeNull();
    expect(codigoDoErro({ message: "xNG030" })).toBeNull();
  });
});

describe("errosNeg: NG019 e NG020 (Nova lead)", () => {
  it.each(["NG019", "NG020"])("%s lê-se de error.code e do texto, com a sua chave", (codigo) => {
    expect(codigoDoErro({ code: codigo, message: "x" })).toBe(codigo);
    expect(codigoDoErro({ message: `falhou [${codigo}]` })).toBe(codigo);
    expect(chaveDoErro({ code: codigo, message: "x" })).toBe(`pessoasPagina.erroNeg.${codigo.toLowerCase()}`);
  });
});

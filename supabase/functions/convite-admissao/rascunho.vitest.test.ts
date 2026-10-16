/**
 * @vitest-environment node
 *
 * O rascunho do convite antes de chegar a RPC: retira o que a V2 nao aceita
 * (niss, iban, conta_numero) e recusa o que esta fora da lista branca do CHECK.
 */
import { describe, expect, it } from "vitest";
import {
  CHAVES_RASCUNHO_PERMITIDAS,
  CHAVES_RASCUNHO_RETIRADAS,
  RASCUNHO_MAX_BYTES,
  prepararRascunho,
} from "./rascunho.ts";

describe("lista branca do rascunho", () => {
  it("tem as 45 chaves do CHECK da V2, sem niss, iban nem conta_numero", () => {
    expect(CHAVES_RASCUNHO_PERMITIDAS).toHaveLength(45);
    expect(new Set(CHAVES_RASCUNHO_PERMITIDAS).size).toBe(45);
    for (const k of ["niss", "iban", "conta_numero", "aceite"]) {
      expect(CHAVES_RASCUNHO_PERMITIDAS).not.toContain(k);
    }
    expect(CHAVES_RASCUNHO_PERMITIDAS).toContain("conta_bic");
    expect(CHAVES_RASCUNHO_PERMITIDAS).toContain("nif");
    expect([...CHAVES_RASCUNHO_RETIRADAS].sort()).toEqual(["conta_numero", "iban", "niss"]);
  });
});

describe("prepararRascunho", () => {
  it("retira niss, iban e conta_numero e mantem o resto", () => {
    const r = prepararRascunho({ nif: "123", niss: "999", iban: "PT50", conta_numero: "PT50", genero: "f" });
    expect(r).toEqual({ ok: true, rascunho: { nif: "123", genero: "f" } });
  });

  it("nao altera o objecto recebido", () => {
    const entrada = { niss: "1", nif: "2" };
    prepararRascunho(entrada);
    expect(entrada).toEqual({ niss: "1", nif: "2" });
  });

  it("aceita um rascunho vazio", () => {
    expect(prepararRascunho({})).toEqual({ ok: true, rascunho: {} });
  });

  it("recusa chaves fora da lista com um codigo claro", () => {
    expect(prepararRascunho({ nif: "1", aceite: true })).toEqual({ ok: false, codigo: "rascunho_chave_invalida" });
    expect(prepararRascunho({ __proto_x: 1 })).toEqual({ ok: false, codigo: "rascunho_chave_invalida" });
  });

  it("so aceita escalares: texto ate 500 caracteres, numero, booleano ou nulo", () => {
    expect(prepararRascunho({ genero: "x".repeat(500), dependentes: 2, nif: null, pais: true }).ok).toBe(true);
    // 500 pontos de codigo (um emoji conta 1) cabem, como no Postgres
    expect(prepararRascunho({ genero: "\u{1F600}".repeat(500) }).ok).toBe(true);
    for (const v of ["x".repeat(501), { a: 1 }, ["a"], Number.NaN, undefined]) {
      expect(prepararRascunho({ genero: v })).toEqual({ ok: false, codigo: "rascunho_valor_invalido" });
    }
    // niss e iban sao retirados antes: um valor aninhado ou longo neles nao conta
    expect(prepararRascunho({ niss: { a: 1 }, iban: "x".repeat(900), nif: "1" }).ok).toBe(true);
  });

  it("recusa nulo, array, texto e numero", () => {
    for (const v of [null, undefined, [], "x", 5]) {
      expect(prepararRascunho(v)).toEqual({ ok: false, codigo: "pedido_invalido" });
    }
  });

  // Cada valor tem no maximo 500 caracteres: o tecto de 20 000 bytes so se atinge com muitas chaves.
  const todas = (valor: (k: string) => string) =>
    Object.fromEntries(CHAVES_RASCUNHO_PERMITIDAS.map((k) => [k, valor(k)]));

  it("recusa mais de 20 000 bytes (medidos como o jsonb::text, UTF-8)", () => {
    expect(RASCUNHO_MAX_BYTES).toBe(20000);
    // 45 chaves x 500 caracteres ASCII = 22 500 bytes
    expect(prepararRascunho(todas(() => "x".repeat(500)))).toEqual({ ok: false, codigo: "rascunho_demasiado_grande" });
    // multi-byte: 21 chaves x 500 caracteres de 2 bytes = 21 000 bytes (so 10 500 caracteres)
    const duasBytes = Object.fromEntries(CHAVES_RASCUNHO_PERMITIDAS.slice(0, 21).map((k) => [k, "\u00e9".repeat(500)]));
    expect(prepararRascunho(duasBytes)).toEqual({ ok: false, codigo: "rascunho_demasiado_grande" });
    expect(prepararRascunho(todas(() => "x".repeat(300))).ok).toBe(true); // ~14 000 bytes
  });

  it("conta o espaco que o jsonb::text acrescenta (': ' e ', ')", () => {
    // 45 chaves: o jsonb acrescenta 45 + 44 = 89 bytes ao JSON compacto.
    const comCompacto = (alvo: number) => {
      let sobra = alvo - JSON.stringify(todas(() => "")).length;
      return todas(() => {
        const n = Math.min(500, sobra);
        sobra -= n;
        return "a".repeat(n);
      });
    };
    const justoNoCompacto = comCompacto(19960);
    expect(new TextEncoder().encode(JSON.stringify(justoNoCompacto)).length).toBe(19960); // cabe compacto
    expect(prepararRascunho(justoNoCompacto)).toEqual({ ok: false, codigo: "rascunho_demasiado_grande" }); // jsonb = 20 049
    expect(prepararRascunho(comCompacto(19900)).ok).toBe(true); // jsonb = 19 989
  });

  it("o tamanho e medido DEPOIS de retirar as chaves proibidas", () => {
    const r = prepararRascunho({ niss: "9".repeat(30000), nif: "1" });
    expect(r).toEqual({ ok: true, rascunho: { nif: "1" } });
  });
});

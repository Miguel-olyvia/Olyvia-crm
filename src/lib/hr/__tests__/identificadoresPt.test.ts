/**
 * O modulo de NIF e NISS que o ecra usa tem de dar exactamente a mesma
 * resposta que a base. Tres blocos:
 *
 *   1. o comportamento do algoritmo (digito de controlo, bordas, ausentes);
 *   2. a tolerancia a espacos, que e do ecra e NAO da base;
 *   3. os vectores do bloco de conferir da migration
 *      20261210010000_hr_nif_niss_digito_controlo.sql (lidos do ficheiro) sao
 *      os mesmos do bloco 1 -- se alguem mudar um lado so, falha.
 *
 * Excepcao deliberada a regra "nao testar SQL por texto": nao se testa
 * comportamento de SQL, testa-se que duas listas de vectores escritas em duas
 * linguagens dizem o mesmo.
 */
import { describe, expect, it } from "vitest";
import { nifValido, nissValido } from "../identificadoresPt";

const MIGRATIONS = import.meta.glob("../../../../supabase/migrations/20261210010000_*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const VECTORES_NIF: ReadonlyArray<readonly [string, boolean]> = [
  ["123456789", true],
  ["123456780", false],
  ["12345678", false],
  ["12345678a", false],
];

const VECTORES_NISS: ReadonlyArray<readonly [string, boolean]> = [
  ["12345678902", true],
  ["12345678901", false],
  ["1234567890", false],
  ["32345678902", false],
];

describe("nifValido", () => {
  it.each(VECTORES_NIF)("%s -> %s", (valor, esperado) => {
    expect(nifValido(valor)).toBe(esperado);
  });

  it("recusa o digito de controlo errado, o tamanho errado e letras", () => {
    expect(nifValido("123456788")).toBe(false);
    expect(nifValido("1234567890")).toBe(false);
    expect(nifValido("12345678")).toBe(false);
  });

  it("recusa vazio e ausente", () => {
    expect(nifValido("")).toBe(false);
    expect(nifValido(null)).toBe(false);
    expect(nifValido(undefined)).toBe(false);
  });

  it("o controlo 0 vale quando o resto da divisao por 11 e 0 ou 1", () => {
    // 5 x 9 = 45; 45 mod 11 = 1 -> controlo 0.
    expect(nifValido("500000000")).toBe(true);
    expect(nifValido("500000001")).toBe(false);
    // 3 x 3 + 1 x 2 = 11; resto 0 -> controlo 0.
    expect(nifValido("000000310")).toBe(true);
    // Resto 2 ou mais: controlo = 11 - resto. 200000004: soma 18, resto 7, controlo 4.
    expect(nifValido("200000004")).toBe(true);
    expect(nifValido("200000000")).toBe(false);
  });
});

describe("nissValido", () => {
  it.each(VECTORES_NISS)("%s -> %s", (valor, esperado) => {
    expect(nissValido(valor)).toBe(esperado);
  });

  it("recusa vazio, ausente, letras, tamanho errado e primeiro digito fora de 1 ou 2", () => {
    expect(nissValido("")).toBe(false);
    expect(nissValido(null)).toBe(false);
    expect(nissValido(undefined)).toBe(false);
    expect(nissValido("1234567890a")).toBe(false);
    expect(nissValido("02345678902")).toBe(false);
    expect(nissValido("123456789022")).toBe(false);
  });
});

describe("espacos escritos a mao (tolerancia do ecra, que a base nao tem)", () => {
  it("o ecra aceita espacos pelo meio", () => {
    expect(nifValido("123 456 789")).toBe(true);
    expect(nissValido("123 4567 8902")).toBe(true);
  });

  it("o numero com espacos continua a ser recusado se o controlo estiver errado", () => {
    expect(nifValido("123 456 780")).toBe(false);
    expect(nissValido("123 4567 8901")).toBe(false);
  });
});

describe("os vectores do bloco de conferir da migration sao os mesmos", () => {
  const sql = Object.values(MIGRATIONS)[0];

  function vectoresDaMigration(funcao: "nif" | "niss"): Array<[string, boolean]> {
    const padrao = new RegExp(
      "IF (NOT )?public\\.hr_" + funcao + "_valido\\('([^']+)'\\) THEN",
      "g",
    );
    return [...sql.matchAll(padrao)].map((m): [string, boolean] => [m[2], m[1] !== undefined]);
  }

  it("a migration foi encontrada", () => {
    expect(sql).toBeTruthy();
  });

  it("NIF: iguais aos do teste", () => {
    const daMigration = vectoresDaMigration("nif");
    expect(daMigration.length).toBe(VECTORES_NIF.length);
    expect([...daMigration].sort()).toEqual(VECTORES_NIF.map(([v, e]) => [v, e]).sort());
    for (const [valor, esperado] of daMigration) expect(nifValido(valor)).toBe(esperado);
  });

  it("NISS: iguais aos do teste", () => {
    const daMigration = vectoresDaMigration("niss");
    expect(daMigration.length).toBe(VECTORES_NISS.length);
    expect([...daMigration].sort()).toEqual(VECTORES_NISS.map(([v, e]) => [v, e]).sort());
    for (const [valor, esperado] of daMigration) expect(nissValido(valor)).toBe(esperado);
  });
});

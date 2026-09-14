/**
 * `isRateLimitError`: distingue o travao de tentativas de
 * `hr_pessoa_duplicados_candidatos` (migracao 20261201030000, ERRCODE
 * HR920, mensagem literal `demasiadas_tentativas`) de outros erros -- em
 * particular de `isPermissionError` (42501/insufficient_privilege), que e
 * um estado diferente e nao pode ser confundido com este.
 */
import { describe, expect, it } from "vitest";
import { isPermissionError, isRateLimitError } from "@/lib/hr/hrDb";

describe("isRateLimitError", () => {
  it("reconhece o codigo HR920", () => {
    expect(isRateLimitError({ code: "HR920", message: "algo" })).toBe(true);
  });

  it("reconhece a mensagem literal demasiadas_tentativas, mesmo sem code", () => {
    expect(isRateLimitError({ message: "demasiadas_tentativas" })).toBe(true);
  });

  it("e insensivel a maiusculas/minusculas na mensagem", () => {
    expect(isRateLimitError({ message: "DEMASIADAS_TENTATIVAS" })).toBe(true);
  });

  it("nao confunde um erro de permissao (42501) com o travao de tentativas", () => {
    const erroPermissao = { code: "42501", message: "insufficient_privilege" };
    expect(isRateLimitError(erroPermissao)).toBe(false);
    expect(isPermissionError(erroPermissao)).toBe(true);
  });

  it("devolve false para um erro generico sem relacao com o travao", () => {
    expect(isRateLimitError({ code: "500", message: "network error" })).toBe(false);
  });

  it("devolve false para valores que nao sao objectos de erro", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError("demasiadas_tentativas")).toBe(false);
  });
});

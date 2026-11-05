/**
 * `isRateLimitError`: distingue o travao de tentativas de
 * `hr_pessoa_duplicados_candidatos` (migracao 20261201030000, ERRCODE
 * HR920, mensagem literal `demasiadas_tentativas`) de outros erros -- em
 * particular de `isPermissionError` (42501/insufficient_privilege), que e
 * um estado diferente e nao pode ser confundido com este.
 */
import { describe, expect, it } from "vitest";
import { exigirLinhasGravadas, isPermissionError, isRateLimitError } from "@/lib/hr/hrDb";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

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

// Auditoria de permissoes 05/11 (P2, separador Laborais): um UPDATE filtrado
// pela RLS devolve 0 linhas sem erro, e o ecra mostrava "guardado".
describe("exigirLinhasGravadas", () => {
  it("0 linhas e recusa por permissao (nao vai para o Sentry)", () => {
    const { error } = exigirLinhasGravadas({ error: null, count: 0 });
    expect(error).not.toBeNull();
    expect(isPermissionError(error)).toBe(true);
  });

  it("1 linha e sucesso", () => {
    expect(exigirLinhasGravadas({ error: null, count: 1 })).toEqual({ error: null });
  });

  it("contagem nao pedida (null/undefined) nao e recusa", () => {
    expect(exigirLinhasGravadas({ error: null, count: null })).toEqual({ error: null });
    expect(exigirLinhasGravadas({ error: null })).toEqual({ error: null });
  });

  it("um erro da base passa tal como veio", () => {
    const erro = { code: "23505", message: "duplicate" };
    expect(exigirLinhasGravadas({ error: erro, count: 0 }).error).toBe(erro);
  });

  it("a mensagem mostrada e a de falta de permissao, nao texto tecnico", async () => {
    const { error } = exigirLinhasGravadas({ error: null, count: 0 });
    const msg = await getFriendlyErrorMessage(error);
    expect(msg).not.toMatch(/nenhuma linha/);
  });
});

describe("mensagens dos guardas novos (20270108410000 / 20270108420000)", () => {
  it("horas contratadas no passado tem texto proprio", async () => {
    for (const raw of [
      "horas_contratadas_fecha_no_passado: fechar a versao x",
      "horas_contratadas_inicio_no_passado: mudar o inicio",
      "horas_contratadas_versao_em_curso: a versao x ja comecou",
    ]) {
      const msg = await getFriendlyErrorMessage({ code: "42501", message: raw });
      expect(msg).not.toMatch(/horas_contratadas_/);
    }
  });

  it("laborais so campos mostra falta de permissao", async () => {
    const msg = await getFriendlyErrorMessage({ code: "42501", message: "pessoas_laborais_so_campos: com ..." });
    expect(msg).not.toMatch(/pessoas_laborais_so_campos/);
  });
});

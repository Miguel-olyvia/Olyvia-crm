/**
 * @vitest-environment node
 *
 * O erro que vai para o Sentry nunca leva texto que possa trazer caminhos ou nomes.
 */
import { describe, expect, it } from "vitest";
import { erroSemDados } from "./erroSemDados.ts";
import { eUuid } from "./uuid.ts";

describe("erroSemDados", () => {
  it("so leva a origem, o tipo e o codigo; nunca a mensagem", () => {
    const original = Object.assign(new Error("falhou em org/pessoa/admissao/cartao-joao.pdf"), { code: "42501" });
    const erro = erroSemDados("hr-anexo-url", original);
    expect(erro.message).toBe("hr-anexo-url: Error 42501");
    expect(erro.message).not.toContain("cartao-joao");
  });

  it("um objecto simples (erro do SDK) usa o tipo do valor e o codigo", () => {
    expect(erroSemDados("x", { message: "segredo", code: "PGRST116" }).message).toBe("x: object PGRST116");
  });

  it("sem codigo, ou com codigo que nao e texto, nao o inventa", () => {
    expect(erroSemDados("x", new TypeError("a")).message).toBe("x: TypeError");
    expect(erroSemDados("x", { code: 500 }).message).toBe("x: object");
  });

  it("null, undefined e texto nao rebentam", () => {
    expect(erroSemDados("x", null).message).toBe("x: object");
    expect(erroSemDados("x", undefined).message).toBe("x: undefined");
    expect(erroSemDados("x", "caminho/secreto.pdf").message).toBe("x: string");
  });
});

describe("eUuid", () => {
  it("aceita um uuid e recusa o resto", () => {
    expect(eUuid("9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff")).toBe(true);
    expect(eUuid("9F8E7D6C-AAAA-4BBB-8CCC-DDDDEEEEFFFF")).toBe(true);
    for (const mau of ["", "nao-e-uuid", null, undefined, 42, "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff ", "x9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff"]) {
      expect(eUuid(mau)).toBe(false);
    }
  });
});

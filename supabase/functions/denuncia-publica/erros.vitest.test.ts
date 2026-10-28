/**
 * @vitest-environment node
 *
 * O catalogo de erros da denuncia publica: contrato entre a base (HRDxx), a Edge e o browser.
 * So sai um codigo do catalogo, nunca o texto do Postgres.
 */
import { describe, expect, it } from "vitest";
import { CODIGOS_PUBLICOS, eCodigoPublico, mapearErroRpc, statusDoCodigo } from "./erros.ts";

describe("mapearErroRpc", () => {
  it("le o codigo da mensagem quando e do catalogo", () => {
    expect(mapearErroRpc({ message: "fechada", code: "HRD08" }).codigo).toBe("fechada");
  });

  it("recorre ao SQLSTATE quando a mensagem vem alterada", () => {
    expect(mapearErroRpc({ message: "qualquer coisa", code: "HRD04" }).codigo).toBe("texto_vazio");
    expect(mapearErroRpc({ message: "x", code: "HRD08" }).codigo).toBe("fechada");
    expect(mapearErroRpc({ message: "x", code: "HRD19" }).codigo).toBe("canal_inativo");
    // Os numeros da migration (NOVO-20261231994000): HRD24 e a sessao; HRD21 e do gestor.
    expect(mapearErroRpc({ message: "x", code: "HRD24" }).codigo).toBe("sessao_invalida");
    expect(mapearErroRpc({ message: "x", code: "HRD22" }).codigo).toBe("demasiadas_tentativas");
    expect(mapearErroRpc({ message: "x", code: "HRD23" }).codigo).toBe("pedido_invalido");
    expect(mapearErroRpc({ message: "x", code: "HRD21" }).codigo).toBe("erro_inesperado");
  });

  it("traduz as mensagens da base que nao sao codigos publicos", () => {
    expect(mapearErroRpc({ message: "limite_excedido", code: "HRD22" }).codigo).toBe("demasiadas_tentativas");
    expect(mapearErroRpc({ message: "dados_invalidos", code: "HRD23" }).codigo).toBe("pedido_invalido");
    expect(mapearErroRpc({ message: "limite_mensagens", code: "HRD25" }).codigo).toBe("pedido_invalido");
    expect(mapearErroRpc({ message: "sessao_invalida", code: "HRD24" }).codigo).toBe("sessao_invalida");
    expect(mapearErroRpc({ message: "constructor" }).codigo).toBe("erro_inesperado");
  });

  it("tudo o resto e erro_inesperado, sem deixar passar o texto", () => {
    expect(mapearErroRpc({ message: "violates check constraint ana@x.pt", code: "23514" }).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc(null).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc(undefined).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc({}).codigo).toBe("erro_inesperado");
  });
});

describe("statusDoCodigo", () => {
  it("atribui o estado HTTP certo", () => {
    expect(statusDoCodigo("codigo_ou_pin_invalido")).toBe(401);
    expect(statusDoCodigo("sessao_invalida")).toBe(401);
    expect(statusDoCodigo("demasiadas_tentativas")).toBe(429);
    expect(statusDoCodigo("indisponivel")).toBe(503);
    expect(statusDoCodigo("corpo_demasiado_grande")).toBe(413);
    expect(statusDoCodigo("canal_inativo")).toBe(404);
    expect(statusDoCodigo("fechada")).toBe(409);
    expect(statusDoCodigo("anexos_indisponiveis")).toBe(410);
    expect(statusDoCodigo("method_not_allowed")).toBe(405);
    expect(statusDoCodigo("erro_inesperado")).toBe(500);
    expect(statusDoCodigo("pedido_invalido")).toBe(400);
    expect(statusDoCodigo("texto_vazio")).toBe(400);
  });

  it("todo o codigo do catalogo tem um estado numerico valido", () => {
    for (const c of CODIGOS_PUBLICOS) {
      const s = statusDoCodigo(c);
      expect(s).toBeGreaterThanOrEqual(400);
      expect(s).toBeLessThan(600);
    }
  });
});

describe("eCodigoPublico", () => {
  it("so aceita codigos do catalogo", () => {
    expect(eCodigoPublico("fechada")).toBe(true);
    expect(eCodigoPublico("HRD08")).toBe(false);
    expect(eCodigoPublico(42)).toBe(false);
  });
});

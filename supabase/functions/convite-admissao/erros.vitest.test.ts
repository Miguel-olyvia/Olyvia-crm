/**
 * @vitest-environment node
 *
 * O mapa de erros da Edge Function do convite: da excepcao da base ao codigo
 * que sai para o browser. O sufixo `.vitest.` e o que faz o vitest apanha-lo.
 */
import { describe, expect, it } from "vitest";
import { CODIGOS_PUBLICOS, mapearErroRpc, statusDoCodigo } from "./erros.ts";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

describe("mapearErroRpc", () => {
  it("mapeia cada codigo da base pela mensagem", () => {
    for (const codigo of CODIGOS_PUBLICOS) {
      expect(mapearErroRpc({ message: codigo }).codigo).toBe(codigo);
    }
  });

  it("mapeia pelo SQLSTATE quando a mensagem nao e reconhecida", () => {
    expect(mapearErroRpc({ message: "outra coisa", code: "HRA04" }).codigo).toBe("convite_expirado");
    expect(mapearErroRpc({ message: "permission denied", code: "42501" }).codigo).toBe("insufficient_privilege");
    expect(mapearErroRpc({ message: "x", code: "HRA30" }).codigo).toBe("pessoa_nao_encontrada");
  });

  it("admissao_incompleta le os campos do DETAIL e descarta lixo", () => {
    const r = mapearErroRpc({ message: "admissao_incompleta", details: "niss,iban, nif ,Bad-Code,;drop,,data_nascimento" });
    expect(r).toEqual({ codigo: "admissao_incompleta", campos: ["niss", "iban", "nif", "data_nascimento"] });
  });

  it("aceita o formato legado 'admissao_incompleta: a, b'", () => {
    const r = mapearErroRpc({ message: "admissao_incompleta: niss, iban" });
    expect(r).toEqual({ codigo: "admissao_incompleta", campos: ["niss", "iban"] });
  });

  it("*_ja_existe recolhe so uuids validos", () => {
    const r = mapearErroRpc({ message: "nif_ja_existe", details: `${U1}, lixo,${U2},123` });
    expect(r).toEqual({ codigo: "nif_ja_existe", conflitos: [U1, U2] });
    expect(mapearErroRpc({ message: "niss_ja_existe", details: "nada" }).conflitos).toEqual([]);
  });

  it("os outros codigos nao trazem campos nem conflitos", () => {
    const r = mapearErroRpc({ message: "nif_invalido", details: `${U1}` });
    expect(r).toEqual({ codigo: "nif_invalido" });
  });

  it("desconhecido ou vazio -> erro_inesperado", () => {
    expect(mapearErroRpc({ message: "relation \"x\" does not exist", code: "42P01" }).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc(null).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc({}).codigo).toBe("erro_inesperado");
  });
});

describe("statusDoCodigo", () => {
  it("devolve o estado HTTP por classe de codigo", () => {
    for (const c of ["convite_invalido", "convite_ja_usado", "convite_revogado", "convite_expirado", "convite_bloqueado"]) {
      expect(statusDoCodigo(c)).toBe(401);
    }
    expect(statusDoCodigo("nif_ja_existe")).toBe(409);
    expect(statusDoCodigo("niss_ja_existe")).toBe(409);
    expect(statusDoCodigo("demasiadas_tentativas")).toBe(429);
    expect(statusDoCodigo("insufficient_privilege")).toBe(403);
    expect(statusDoCodigo("erro_inesperado")).toBe(500);
    for (const c of ["nif_invalido", "admissao_incompleta", "pedido_invalido", "assinatura_obrigatoria", "validade_invalida"]) {
      expect(statusDoCodigo(c)).toBe(400);
    }
  });
});

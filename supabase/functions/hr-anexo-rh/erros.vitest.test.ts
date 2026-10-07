/**
 * @vitest-environment node
 *
 * Estados HTTP do catalogo do RH e a recusa de quem nao e um humano.
 */
import { describe, expect, it } from "vitest";
import { recusarSeNaoForHumano } from "./accoes.ts";
import { CODIGOS_RH, eCodigoRh, statusRh } from "./erros.ts";

describe("statusRh", () => {
  it.each([
    ["sem_permissao", 403],
    ["pessoa_nao_encontrada", 404],
    ["sem_sessao", 401],
    ["anexo_substituto_invalido", 409],
    ["anexo_limite_pessoa", 429],
    ["demasiadas_tentativas", 429],
    ["erro_inesperado", 500],
    ["pedido_invalido", 400],
    ["accao_desconhecida", 400],
  ])("%s -> %i", (codigo, status) => {
    expect(statusRh(codigo)).toBe(status);
  });

  it.each([
    ["anexo_demasiado_grande", 413],
    ["anexo_fotografia_demasiado_grande", 413],
    ["anexo_nao_encontrado", 404],
    ["anexo_nao_carregado", 409],
    ["anexo_estado_invalido", 409],
    ["anexo_maximo_ficheiros", 409],
    ["anexo_tipo_cheio", 409],
    ["anexo_formato_invalido", 422],
    ["anexo_fotografia_formato", 422],
    ["anexo_vazio", 422],
    ["anexo_tipo_invalido", 422],
    ["anexo_falha_envio", 400],
  ])("os anexo_* herdam o estado do convite: %s -> %i", (codigo, status) => {
    expect(statusRh(codigo)).toBe(status);
  });

  it("todo o codigo do catalogo tem um estado HTTP de erro valido", () => {
    for (const codigo of CODIGOS_RH) {
      const s = statusRh(codigo);
      expect(s).toBeGreaterThanOrEqual(400);
      expect(s).toBeLessThan(600);
    }
  });
});

describe("CODIGOS_RH", () => {
  it("traz os codigos das RPCs do plano e os proprios da Edge, sem repetidos", () => {
    for (const c of [
      "sem_sessao", "pessoa_nao_encontrada", "sem_permissao", "pedido_invalido", "anexo_tipo_invalido",
      "anexo_formato_invalido", "anexo_fotografia_formato", "anexo_vazio", "anexo_demasiado_grande",
      "anexo_fotografia_demasiado_grande", "anexo_maximo_ficheiros", "anexo_tipo_cheio", "anexo_nao_encontrado",
      "anexo_estado_invalido", "anexo_falha_envio", "anexo_substituto_invalido", "anexo_limite_pessoa",
      "erro_inesperado", "accao_desconhecida", "demasiadas_tentativas",
    ]) {
      expect(CODIGOS_RH).toContain(c);
    }
    expect(new Set(CODIGOS_RH).size).toBe(CODIGOS_RH.length);
  });

  it("eCodigoRh so aceita codigos do catalogo", () => {
    expect(eCodigoRh("sem_permissao")).toBe(true);
    expect(eCodigoRh("convite_expirado")).toBe(false);
    expect(eCodigoRh("segredo_da_base")).toBe(false);
    expect(eCodigoRh(undefined)).toBe(false);
    expect(eCodigoRh(42)).toBe(false);
  });
});

describe("recusarSeNaoForHumano (service_role nunca passa)", () => {
  it("service_role e recusado com 403 sem_permissao", () => {
    expect(recusarSeNaoForHumano({ isServiceRole: true })).toEqual({ status: 403, body: { error: "sem_permissao" } });
  });

  it("um utilizador com JWT passa (null)", () => {
    expect(recusarSeNaoForHumano({ isServiceRole: false })).toBeNull();
  });
});

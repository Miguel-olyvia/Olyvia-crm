import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
const captureMock = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureMock(...args),
}));

import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVES_ERRO_NEG, CHAVE_ERRO_GENERICO } from "./errosNeg";

describe("chamarNeg", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    captureMock.mockReset();
  });

  it("passa o nome e os parâmetros tal e qual e devolve os dados", async () => {
    const params = { p_organization_id: "org-1", p_person_id: "p-1", p_nota: null };
    rpcMock.mockResolvedValue({ data: { id: "r-1" }, error: null });
    const dados = await chamarNeg<{ id: string }>("neg_registar_contacto", params);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("neg_registar_contacto", params);
    expect(dados).toEqual({ id: "r-1" });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it.each([
    "neg_procurar_duplicados", "neg_guardar_identidade_pessoa", "neg_substituir_contacto", "neg_guardar_regras_qualificacao",
    "neg_alterar_visita", "neg_cancelar_visita", "neg_guardar_questionario", "neg_questionario_levantamento",
  ] as const)(
    "%s é uma função conhecida: passa o nome e os parâmetros sem os mexer",
    async (nome) => {
      const params = { p_organization_id: "org-1", p_email: "a@b.pt" };
      rpcMock.mockResolvedValue({ data: [], error: null });
      await chamarNeg(nome, params);
      expect(rpcMock).toHaveBeenCalledWith(nome, params);
    },
  );

  it("NG019 e NG020 viram ErroNeg com a sua chave e não vão para o Sentry", async () => {
    for (const codigo of ["NG019", "NG020"]) {
      rpcMock.mockResolvedValue({ data: null, error: { code: codigo, message: "texto da base" } });
      const erro = await chamarNeg("neg_substituir_contacto", {}).catch((e) => e);
      expect(erro.codigo).toBe(codigo);
      expect(erro.chave).toBe(CHAVES_ERRO_NEG[codigo]);
    }
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("um código NG vira ErroNeg com a chave certa e não vai para o Sentry", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "NG006", message: "texto da base" } });
    const erro = await chamarNeg("neg_ganhar_negocio", { p_deal_id: "d" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe("NG006");
    expect(erro.chave).toBe(CHAVES_ERRO_NEG.NG006);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("42501 é esperado: chave de permissão, sem Sentry", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    const erro = await chamarNeg("neg_perder_negocio", {}).catch((e) => e);
    expect(erro.chave).toBe(CHAVES_ERRO_NEG["42501"]);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("erro inesperado vira ErroNeg genérico e é reportado no fluxo pessoas", async () => {
    const bruto = { code: "57014", message: "timeout" };
    rpcMock.mockResolvedValue({ data: null, error: bruto });
    const erro = await chamarNeg("neg_resumo_pessoas", {}).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBeNull();
    expect(erro.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(captureMock).toHaveBeenCalledWith(bruto, "pessoas-neg");
  });

  it("uma exceção de rede também vira ErroNeg genérico", async () => {
    rpcMock.mockRejectedValue(new Error("Failed to fetch"));
    const erro = await chamarNeg("neg_resumo_pessoas", {}).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(captureMock).toHaveBeenCalledWith(expect.any(Error), "pessoas-neg");
  });

  it("o ErroNeg guarda o erro bruto em causa", async () => {
    const bruto = { code: "NG002", message: "x" };
    rpcMock.mockResolvedValue({ data: null, error: bruto });
    const erro = await chamarNeg("neg_ganhar_negocio", {}).catch((e) => e);
    expect(erro.causa).toBe(bruto);
  });

  it("code de outra origem com NG no texto vai para o Sentry; code não string não rebenta", async () => {
    const alheio = { code: "57014", message: "NG001 no texto" };
    rpcMock.mockResolvedValue({ data: null, error: alheio });
    const erro = await chamarNeg("neg_resumo_pessoas", {}).catch((e) => e);
    expect(erro.codigo).toBeNull();
    expect(captureMock).toHaveBeenCalledWith(alheio, "pessoas-neg");
    captureMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: { code: 5, message: 7 } });
    const outro = await chamarNeg("neg_resumo_pessoas", {}).catch((e) => e);
    expect(outro).toBeInstanceOf(ErroNeg);
    expect(outro.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("sem erro e sem dados devolve null", async () => {
    rpcMock.mockResolvedValue({ data: undefined, error: null });
    expect(await chamarNeg("neg_encerrar_abordagem", {})).toBeNull();
  });
});

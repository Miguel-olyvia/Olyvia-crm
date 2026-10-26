// Guardar as preferências de contacto com neg_guardar_contacto_pessoa: NULL não mexe, vazio limpa (menos a língua), a língua só vai se mudou.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { HORAS_PREFERIDAS, CONTACTOS_PREFERIDOS, linguaParaEnviar, opcoesDeLingua, useGuardarContactoPessoa } from "./useGuardarContactoPessoa";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });
afterEach(() => vi.clearAllMocks());

const OK = { preferred_contact: "email", preferred_time: null, locale: "pt", mudou: true };
const montar = (sobre: Parameters<typeof montarHook>[2] = {}) => {
  const client = sobre.client ?? criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  const r = montarHook((id: string) => useGuardarContactoPessoa(id), PESSOA_ID, { ...sobre, client });
  return { ...r, client, invalidada: () => client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated };
};

describe("useGuardarContactoPessoa: parâmetros", () => {
  it("manda só o que se quer mexer: o que falta vai a null (a base não mexe)", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ contacto: "email" }); });
    expect(nomeChamado(0)).toBe("neg_guardar_contacto_pessoa");
    expect(parametros(0)).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_preferred_contact: "email", p_preferred_time: null, p_locale: null,
    });
  });

  it("uma cadeia vazia limpa o contacto e a hora (vai vazia, não null)", async () => {
    rpcMock.mockReturnValue(respostaOk({ ...OK, preferred_contact: null }));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ contacto: "", hora: "" }); });
    expect(parametros(0)).toMatchObject({ p_preferred_contact: "", p_preferred_time: "", p_locale: null });
  });

  it("hora e língua vão como estão", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ hora: "fim_do_dia", lingua: "fr" }); });
    expect(parametros(0)).toMatchObject({ p_preferred_contact: null, p_preferred_time: "fim_do_dia", p_locale: "fr" });
  });

  it("uma língua vazia não se envia (a língua é obrigatória: a base recusaria): vai a null", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result } = montar();
    await act(async () => { await result.current.guardar({ contacto: "sms", lingua: "  " }); });
    expect(parametros(0).p_locale).toBeNull();
  });

  it("sem nada para mudar não chama a base", async () => {
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({}); });
    expect(r).toEqual({ contacto: null, hora: null, lingua: null, mudou: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("lê o resultado devolvido", async () => {
    rpcMock.mockReturnValue(respostaOk({ preferred_contact: "whatsapp", preferred_time: "tarde", locale: "en", mudou: true }));
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ contacto: "whatsapp" }); });
    expect(r).toEqual({ contacto: "whatsapp", hora: "tarde", lingua: "en", mudou: true });
  });

  it("uma resposta que não se reconhece não rebenta", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const { result } = montar();
    let r;
    await act(async () => { r = await result.current.guardar({ contacto: "sms" }); });
    expect(r).toEqual({ contacto: null, hora: null, lingua: null, mudou: false });
  });
});

describe("useGuardarContactoPessoa: invalidação e erros", () => {
  it("depois de um sucesso refaz a ficha", async () => {
    rpcMock.mockReturnValue(respostaOk(OK));
    const { result, invalidada } = montar();
    await act(async () => { await result.current.guardar({ contacto: "email" }); });
    expect(invalidada()).toBe(true);
  });

  it("uma falha lança ErroNeg com o código e não toca na ficha", async () => {
    rpcMock.mockReturnValue(respostaErro("NG009"));
    const { result, invalidada } = montar();
    let erro: unknown;
    await act(async () => { erro = await result.current.guardar({ contacto: "email" }).then(() => null, (e) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect((erro as ErroNeg).codigo).toBe("NG009");
    expect(invalidada()).toBeFalsy();
  });

  it("sem organização (fonte de exemplo) ou sem pessoa lança o erro genérico sem chamar a base", async () => {
    const { result } = montarHook((id: string) => useGuardarContactoPessoa(id), "", { fonte: fonteReal() });
    let erro: unknown;
    await act(async () => { erro = await result.current.guardar({ contacto: "email" }).then(() => null, (e) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("a língua no seletor", () => {
  it("as listas têm os valores da base", () => {
    expect(CONTACTOS_PREFERIDOS).toEqual(["telefone", "email", "whatsapp", "sms"]);
    expect(HORAS_PREFERIDAS).toEqual(["manha", "tarde", "fim_do_dia"]);
  });

  it("mostra pt, en e fr, e acrescenta o valor atual se estiver fora da lista (es)", () => {
    expect(opcoesDeLingua("pt")).toEqual(["pt", "en", "fr"]);
    expect(opcoesDeLingua(undefined)).toEqual(["pt", "en", "fr"]);
    expect(opcoesDeLingua("es")).toEqual(["pt", "en", "fr", "es"]);
  });

  it("só envia a língua quando muda: igual à atual (ou em falta) dá null", () => {
    expect(linguaParaEnviar("es", "es")).toBeNull();
    expect(linguaParaEnviar("pt", "fr")).toBe("fr");
    expect(linguaParaEnviar(undefined, "pt")).toBe("pt");
    expect(linguaParaEnviar("pt", "")).toBeNull();
    expect(linguaParaEnviar("pt", undefined)).toBeNull();
  });
});

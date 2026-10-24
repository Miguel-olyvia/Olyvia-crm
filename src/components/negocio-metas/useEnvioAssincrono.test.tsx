// O estado de uma gravação que espera pela base num diálogo (`useEnvioAssincrono`) e o das linhas de ligar e desligar registos (`useLigacoes`):
// o que fazer quando o que corre DEPOIS de a base responder bem (fechar, avisar, abrir o negócio) lança, e quando a base diz que o negócio
// já não está disponível (NG001).
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: captureMock }));
import { act, renderHook } from "@testing-library/react";
import { useLigacoes } from "@/components/pessoas/useLigacoes";
import { erroNegFalso, pendente } from "./costuraTestUtil";
import { CHAVE_ERRO_ENVIO_GENERICO, useEnvioAssincrono } from "./useEnvioAssincrono";

const rejeicoes: unknown[] = [];
const aoRejeitar = (motivo: unknown): void => { rejeicoes.push(motivo); };
process.on("unhandledRejection", aoRejeitar);
afterEach(() => { rejeicoes.length = 0; });

const esperarMicrotarefas = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("useEnvioAssincrono: o que corre depois de gravar lança", () => {
  it("apanha-o: dá o erro genérico, deixa de guardar e não deixa uma rejeição por tratar", async () => {
    const { result } = renderHook(() => useEnvioAssincrono());
    const acao = pendente();
    act(() => result.current.enviar(() => acao.promessa, () => { throw new Error("falhou depois de gravar"); }));
    await acao.terminar(undefined);
    await esperarMicrotarefas();
    expect(result.current.aGuardar).toBe(false);
    expect(result.current.erro).toBe(CHAVE_ERRO_ENVIO_GENERICO);
    expect(rejeicoes).toEqual([]);
  });

  it("a exceção de depois de gravar não se perde: vai para a observabilidade", async () => {
    captureMock.mockReset();
    const { result } = renderHook(() => useEnvioAssincrono());
    act(() => result.current.enviar(async () => undefined, () => { throw new Error("falhou depois de gravar"); }));
    await esperarMicrotarefas();
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("depois do erro pode-se tentar de novo (e um aoOk que já não lança limpa o erro)", async () => {
    const { result } = renderHook(() => useEnvioAssincrono());
    const aoOk = vi.fn().mockImplementationOnce(() => { throw new Error("x"); });
    act(() => result.current.enviar(async () => undefined, aoOk));
    await esperarMicrotarefas();
    expect(result.current.erro).toBe(CHAVE_ERRO_ENVIO_GENERICO);
    act(() => result.current.enviar(async () => undefined, aoOk));
    await esperarMicrotarefas();
    expect(aoOk).toHaveBeenCalledTimes(2);
    expect(result.current.erro).toBeNull();
  });

  it("NG001 avisa quem monta (o negócio já não existe: o diálogo fecha-se e volta-se à ficha)", async () => {
    const aoFalhar = vi.fn();
    const { result } = renderHook(() => useEnvioAssincrono(aoFalhar));
    const acao = pendente();
    act(() => result.current.enviar(() => acao.promessa, vi.fn()));
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng001", "NG001"));
    expect(aoFalhar).toHaveBeenCalledWith("pessoasPagina.erroNeg.ng001");
    expect(result.current.erro).toBe("pessoasPagina.erroNeg.ng001");
  });
});

describe("useEnvioAssincrono: a gravação lança de forma síncrona", () => {
  it("conta como falha: não fica a guardar nem ocupado, dá o erro genérico e avisa quem monta", () => {
    const aoFalhar = vi.fn();
    const { result } = renderHook(() => useEnvioAssincrono(aoFalhar));
    const aoOk = vi.fn();
    act(() => result.current.enviar(() => { throw new Error("rebentou antes de devolver a promessa"); }, aoOk));
    expect(result.current.aGuardar).toBe(false);
    expect(result.current.erro).toBe(CHAVE_ERRO_ENVIO_GENERICO);
    expect(aoFalhar).toHaveBeenCalledWith(CHAVE_ERRO_ENVIO_GENERICO);
    expect(aoOk).not.toHaveBeenCalled();
  });

  it("depois dela pode-se tentar de novo (o estado ocupado não ficou preso)", async () => {
    const { result } = renderHook(() => useEnvioAssincrono());
    act(() => result.current.enviar(() => { throw new Error("x"); }, vi.fn()));
    const aoOk = vi.fn();
    act(() => result.current.enviar(async () => undefined, aoOk));
    await esperarMicrotarefas();
    expect(aoOk).toHaveBeenCalledTimes(1);
    expect(result.current.erro).toBeNull();
    expect(result.current.aGuardar).toBe(false);
  });

  it("não deixa rejeição por tratar", async () => {
    const { result } = renderHook(() => useEnvioAssincrono());
    act(() => result.current.enviar(() => { throw new Error("x"); }, vi.fn()));
    await esperarMicrotarefas();
    expect(rejeicoes).toEqual([]);
  });
});

describe("useLigacoes: o que corre depois de ligar ou desligar lança", () => {
  it("apanha-o: a linha deixa de estar ocupada, o erro genérico fica visível e não há rejeição por tratar", async () => {
    const { result } = renderHook(() => useLigacoes());
    const acao = pendente();
    act(() => result.current.correr("c1", () => acao.promessa, () => { throw new Error("falhou depois de ligar"); }));
    await acao.terminar(undefined);
    await esperarMicrotarefas();
    expect(result.current.ocupadas.has("c1")).toBe(false);
    expect(result.current.erro).toBe(CHAVE_ERRO_ENVIO_GENERICO);
    expect(rejeicoes).toEqual([]);
  });
});

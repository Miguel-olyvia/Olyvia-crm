/**
 * `useAnexarAnexoRh`: um envio do RH (url, PUT, confirmar), com a Edge e o PUT
 * simulados. Nunca lanca; o erro fica em `envios[id].codigoErro`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const pedirUploadAnexoRh = vi.fn();
const confirmarAnexoRh = vi.fn();
const removerAnexoRh = vi.fn();
vi.mock("@/lib/hr/anexoRhEdge", () => ({
  pedirUploadAnexoRh: (...a: unknown[]) => pedirUploadAnexoRh(...a),
  confirmarAnexoRh: (...a: unknown[]) => confirmarAnexoRh(...a),
  removerAnexoRh: (...a: unknown[]) => removerAnexoRh(...a),
}));

const enviarParaQuarentena = vi.fn();
vi.mock("@/lib/hr/envioQuarentena", () => ({
  enviarParaQuarentena: (...a: unknown[]) => enviarParaQuarentena(...a),
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { useAnexarAnexoRh } from "../useAnexarAnexoRh";

const ACEITE = { id: "A1", tipo: "fotografia", nome_original: "eu.png", tamanho_bytes: 4, mime_type: "image/png" };

function ficheiro(nome = "eu.png", tipo = "image/png", tamanho = 4): File {
  return new File([new Uint8Array(tamanho)], nome, { type: tipo });
}

beforeEach(() => {
  pedirUploadAnexoRh.mockReset().mockResolvedValue({
    ok: true,
    codigo: null,
    data: { anexoId: "A1", caminho: "admissao/rh/A1.png", uploadToken: "tok" },
  });
  confirmarAnexoRh.mockReset().mockResolvedValue({ ok: true, codigo: null, data: { anexo: ACEITE } });
  removerAnexoRh.mockReset().mockResolvedValue({ ok: true, codigo: null, data: {} });
  enviarParaQuarentena.mockReset().mockResolvedValue(true);
  captureFlowError.mockReset();
});

describe("useAnexarAnexoRh", () => {
  it("caminho feliz: url, PUT, confirmar; devolve ok e o anexo e nao deixa envio", async () => {
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro(), "velho");
    });
    expect(r).toEqual({ ok: true, codigo: null, anexo: ACEITE });
    expect(pedirUploadAnexoRh).toHaveBeenCalledWith({
      pessoaId: "p1",
      tipo: "fotografia",
      nome: "eu.png",
      tamanho: 4,
      mime: "image/png",
      substituiAnexoId: "velho",
    });
    expect(enviarParaQuarentena).toHaveBeenCalledWith("admissao/rh/A1.png", "tok", expect.any(File), expect.any(Function));
    expect(confirmarAnexoRh).toHaveBeenCalledWith({ anexoId: "A1", substituiAnexoId: "velho" });
    expect(result.current.envios).toEqual({});
  });

  it("mostra a fase e o progresso enquanto envia, e a_verificar a seguir", async () => {
    let terminarPut: (v: boolean) => void = () => {};
    let progresso: (p: number) => void = () => {};
    enviarParaQuarentena.mockImplementation(
      (_c: string, _t: string, _f: File, aoProgredir: (p: number) => void) =>
        new Promise<boolean>((resolve) => {
          progresso = aoProgredir;
          terminarPut = resolve;
        }),
    );
    let terminarConfirmar: (v: unknown) => void = () => {};
    confirmarAnexoRh.mockImplementation(() => new Promise((resolve) => (terminarConfirmar = resolve)));

    const { result } = renderHook(() => useAnexarAnexoRh());
    let promessa: Promise<unknown>;
    act(() => {
      promessa = result.current.enviar("p1", "fotografia", ficheiro());
    });
    await vi.waitFor(() => expect(enviarParaQuarentena).toHaveBeenCalled());
    act(() => progresso(40));
    const [envio] = Object.values(result.current.envios);
    expect(envio).toMatchObject({ tipo: "fotografia", nome: "eu.png", fase: "a_enviar", progresso: 40, codigoErro: null });

    await act(async () => {
      terminarPut(true);
    });
    await vi.waitFor(() => expect(confirmarAnexoRh).toHaveBeenCalled());
    expect(Object.values(result.current.envios)[0]).toMatchObject({ fase: "a_verificar", progresso: 100 });

    await act(async () => {
      terminarConfirmar({ ok: true, codigo: null, data: { anexo: ACEITE } });
      await promessa;
    });
    expect(result.current.envios).toEqual({});
  });

  it("uma recusa local (formato) nao chama a Edge e fica como erro", async () => {
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro("a.pdf", "application/pdf"));
    });
    expect(r).toMatchObject({ ok: false, codigo: "anexo_fotografia_formato", anexo: null });
    expect(pedirUploadAnexoRh).not.toHaveBeenCalled();
    expect(Object.values(result.current.envios)[0]).toMatchObject({
      fase: "erro",
      codigoErro: "anexo_fotografia_formato",
    });
  });

  it("uma recusa do servidor no url fica como erro com o codigo", async () => {
    pedirUploadAnexoRh.mockResolvedValue({ ok: false, data: null, codigo: "sem_permissao" });
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(r).toMatchObject({ ok: false, codigo: "sem_permissao" });
    expect(enviarParaQuarentena).not.toHaveBeenCalled();
    expect(Object.values(result.current.envios)[0].codigoErro).toBe("sem_permissao");
  });

  it("sem codigo (rede) usa anexo_falha_envio", async () => {
    pedirUploadAnexoRh.mockResolvedValue({ ok: false, data: null, codigo: null });
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(r.codigo).toBe("anexo_falha_envio");
  });

  it("o PUT falha: erro, e tenta libertar o lugar reservado sem confirmar", async () => {
    enviarParaQuarentena.mockResolvedValue(false);
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(r).toMatchObject({ ok: false, codigo: "anexo_falha_envio" });
    expect(confirmarAnexoRh).not.toHaveBeenCalled();
    expect(removerAnexoRh).toHaveBeenCalledWith("A1");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("confirmar recusado (gif disfarcado) fica como erro com o codigo e nao remove", async () => {
    confirmarAnexoRh.mockResolvedValue({ ok: false, data: null, codigo: "anexo_formato_invalido" });
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(r).toMatchObject({ ok: false, codigo: "anexo_formato_invalido" });
    expect(removerAnexoRh).not.toHaveBeenCalled();
  });

  it("confirmar sem resposta (incerto) NAO remove: o ficheiro pode ja estar promovido", async () => {
    confirmarAnexoRh.mockResolvedValue({ ok: false, data: null, codigo: null });
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(r).toMatchObject({ ok: false, codigo: "anexo_falha_envio" });
    expect(removerAnexoRh).not.toHaveBeenCalled();
  });

  it("nunca lanca, mesmo que a Edge ou o PUT lancem", async () => {
    pedirUploadAnexoRh.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAnexarAnexoRh());
    let r: Awaited<ReturnType<typeof result.current.enviar>>;
    await act(async () => {
      r = await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(r).toMatchObject({ ok: false, codigo: "anexo_falha_envio" });
  });

  it("um novo envio do mesmo tipo apaga o erro anterior desse tipo; descartarEnvio tira um erro", async () => {
    pedirUploadAnexoRh.mockResolvedValueOnce({ ok: false, data: null, codigo: "sem_permissao" });
    const { result } = renderHook(() => useAnexarAnexoRh());
    await act(async () => {
      await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(Object.keys(result.current.envios)).toHaveLength(1);
    await act(async () => {
      await result.current.enviar("p1", "fotografia", ficheiro());
    });
    expect(result.current.envios).toEqual({});

    pedirUploadAnexoRh.mockResolvedValueOnce({ ok: false, data: null, codigo: "sem_permissao" });
    await act(async () => {
      await result.current.enviar("p1", "fotografia", ficheiro());
    });
    const [id] = Object.keys(result.current.envios);
    act(() => result.current.descartarEnvio(id));
    expect(result.current.envios).toEqual({});
  });
});

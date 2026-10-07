/**
 * `anexoRhEdge`: as tres chamadas a Edge `hr-anexo-rh` (url, confirmar,
 * remover). Nunca lancam; so o inesperado vai para o registo, sem dados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const maybeSingle = vi.fn();
const eqs: Array<[string, unknown]> = [];
const consulta: Record<string, unknown> = {};
consulta.select = vi.fn(() => consulta);
consulta.eq = vi.fn((coluna: string, valor: unknown) => {
  eqs.push([coluna, valor]);
  return consulta;
});
consulta.maybeSingle = () => maybeSingle();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: () => consulta,
  },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import {
  TEMPO_MAXIMO_EDGE_MS,
  anexoRhPromovido,
  confirmarAnexoRh,
  pedirUploadAnexoRh,
  removerAnexoRh,
} from "../anexoRhEdge";

function erroHttp(status: number, corpo: Record<string, unknown>) {
  return {
    data: null,
    error: {
      name: "FunctionsHttpError",
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify(corpo), { status }),
    },
  };
}

beforeEach(() => {
  invoke.mockReset();
  captureFlowError.mockReset();
  maybeSingle.mockReset();
  eqs.length = 0;
});

describe("pedirUploadAnexoRh", () => {
  it("envia a accao url com os dados do pedido e devolve o que serve para o PUT", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, anexo_id: "A1", caminho: "admissao/rh/A1.png", upload_token: "tok" },
      error: null,
    });
    const r = await pedirUploadAnexoRh({
      pessoaId: "p1",
      tipo: "fotografia",
      nome: "eu.png",
      tamanho: 123,
      mime: "image/png",
      substituiAnexoId: "velho",
    });
    expect(invoke).toHaveBeenCalledWith("hr-anexo-rh", {
      body: {
        accao: "url",
        pessoa_id: "p1",
        tipo: "fotografia",
        nome: "eu.png",
        tamanho: 123,
        mime: "image/png",
        substitui_anexo_id: "velho",
      },
      signal: expect.any(AbortSignal),
    });
    expect(r).toEqual({
      ok: true,
      codigo: null,
      data: { anexoId: "A1", caminho: "admissao/rh/A1.png", uploadToken: "tok" },
    });
  });

  it("sem substituto nao manda substitui_anexo_id", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, anexo_id: "A1", caminho: "c", upload_token: "t" },
      error: null,
    });
    await pedirUploadAnexoRh({ pessoaId: "p1", tipo: "cartao_cidadao", nome: "a.pdf", tamanho: 1, mime: "application/pdf" });
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty("substitui_anexo_id");
  });

  it("uma recusa de negocio devolve o codigo e nao vai para o registo", async () => {
    invoke.mockResolvedValue(erroHttp(403, { error: "sem_permissao" }));
    const r = await pedirUploadAnexoRh({ pessoaId: "p1", tipo: "fotografia", nome: "a.png", tamanho: 1, mime: "image/png" });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("sem_permissao");
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("resposta sem campos, rede ou excepcao: nao-ok sem codigo, registo sem nome de ficheiro", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const r1 = await pedirUploadAnexoRh({ pessoaId: "p1", tipo: "fotografia", nome: "segredo.png", tamanho: 1, mime: "image/png" });
    expect(r1).toEqual({ ok: false, data: null, codigo: null });

    invoke.mockRejectedValueOnce(new Error("rede segredo.png"));
    const r2 = await pedirUploadAnexoRh({ pessoaId: "p1", tipo: "fotografia", nome: "segredo.png", tamanho: 1, mime: "image/png" });
    expect(r2.ok).toBe(false);
    expect(r2.codigo).toBeNull();

    expect(captureFlowError).toHaveBeenCalledTimes(2);
    for (const [erro] of captureFlowError.mock.calls) {
      expect(String((erro as Error).message)).not.toContain("segredo");
    }
  });

  it("erro_inesperado do servidor tambem e defeito e vai para o registo", async () => {
    invoke.mockResolvedValue(erroHttp(500, { error: "erro_inesperado" }));
    const r = await pedirUploadAnexoRh({ pessoaId: "p1", tipo: "fotografia", nome: "a.png", tamanho: 1, mime: "image/png" });
    expect(r.codigo).toBe("erro_inesperado");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});

describe("confirmarAnexoRh", () => {
  it("envia anexo_id e substituto, e devolve o anexo aceite", async () => {
    const anexo = { id: "A1", tipo: "fotografia", nome_original: "eu.png", tamanho_bytes: 5, mime_type: "image/png" };
    invoke.mockResolvedValue({ data: { ok: true, anexo }, error: null });
    const r = await confirmarAnexoRh({ anexoId: "A1", substituiAnexoId: "velho" });
    expect(invoke.mock.calls[0][1].body).toEqual({ accao: "confirmar", anexo_id: "A1", substitui_anexo_id: "velho" });
    expect(r).toEqual({ ok: true, codigo: null, data: { anexo } });
  });

  it("recusa de formato devolve o codigo", async () => {
    invoke.mockResolvedValue(erroHttp(422, { error: "anexo_formato_invalido" }));
    const r = await confirmarAnexoRh({ anexoId: "A1" });
    expect(r).toEqual({ ok: false, data: null, codigo: "anexo_formato_invalido" });
  });

  it("resposta sem anexo e defeito", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const r = await confirmarAnexoRh({ anexoId: "A1" });
    expect(r.ok).toBe(false);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});

describe("removerAnexoRh", () => {
  it("envia a accao remover e devolve ok", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const r = await removerAnexoRh("A1");
    expect(invoke).toHaveBeenCalledWith("hr-anexo-rh", {
      body: { accao: "remover", anexo_id: "A1" },
      signal: expect.any(AbortSignal),
    });
    expect(r.ok).toBe(true);
  });

  it("nunca lanca", async () => {
    invoke.mockRejectedValue(new Error("boom"));
    await expect(removerAnexoRh("A1")).resolves.toMatchObject({ ok: false, codigo: null });
  });

  it("anexo_nao_encontrado volta como codigo", async () => {
    invoke.mockResolvedValue(erroHttp(404, { error: "anexo_nao_encontrado" }));
    await expect(removerAnexoRh("A1")).resolves.toMatchObject({ ok: false, codigo: "anexo_nao_encontrado" });
  });
});

describe("removerAnexoRh: forma da resposta", () => {
  it("200 vazio (sem ok:true) e erro e vai para o registo", async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(removerAnexoRh("A1")).resolves.toEqual({ ok: false, data: null, codigo: null });
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(removerAnexoRh("A1")).resolves.toMatchObject({ ok: false, codigo: null });
    expect(captureFlowError).toHaveBeenCalledTimes(2);
  });
});

describe("falhas da chamada a Edge: tipo registado sem dados", () => {
  const pedido = { pessoaId: "p1", tipo: "fotografia" as const, nome: "segredo.png", tamanho: 1, mime: "image/png" };

  it("tempo esgotado: devolve nao-ok e regista tempo_esgotado", async () => {
    vi.useFakeTimers();
    try {
      let sinal: AbortSignal | undefined;
      invoke.mockImplementation((_f: string, opcoes: { signal: AbortSignal }) => {
        sinal = opcoes.signal;
        return new Promise(() => {});
      });
      const promessa = pedirUploadAnexoRh(pedido);
      await vi.advanceTimersByTimeAsync(TEMPO_MAXIMO_EDGE_MS + 1);
      await expect(promessa).resolves.toEqual({ ok: false, data: null, codigo: null });
      expect(sinal?.aborted).toBe(true);
      expect(String((captureFlowError.mock.calls[0][0] as Error).message)).toContain("tempo_esgotado");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rede (TypeError de fetch) regista rede, sem o texto original", async () => {
    invoke.mockRejectedValue(new TypeError("Failed to fetch segredo.png"));
    await pedirUploadAnexoRh(pedido);
    const mensagem = String((captureFlowError.mock.calls[0][0] as Error).message);
    expect(mensagem).toContain("rede");
    expect(mensagem).not.toContain("segredo");
  });

  it("FunctionsFetchError devolvido pelo invoke tambem e rede", async () => {
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", message: "x segredo.png" } });
    await pedirUploadAnexoRh(pedido);
    const mensagem = String((captureFlowError.mock.calls[0][0] as Error).message);
    expect(mensagem).toContain("rede");
    expect(mensagem).not.toContain("segredo");
  });

  it("outra excepcao regista falha_de_rede generica", async () => {
    invoke.mockRejectedValue(new Error("boom segredo.png"));
    await pedirUploadAnexoRh(pedido);
    const mensagem = String((captureFlowError.mock.calls[0][0] as Error).message);
    expect(mensagem).toContain("falha_de_rede");
    expect(mensagem).not.toContain("segredo");
  });
});

describe("anexoRhPromovido", () => {
  const linha = { id: "A1", tipo: "fotografia", nome_original: "eu.png", tamanho_bytes: 5, mime_type: "image/png" };

  it("devolve o anexo se ja esta promovido, filtrando por id e estado", async () => {
    maybeSingle.mockResolvedValue({ data: linha, error: null });
    await expect(anexoRhPromovido("A1")).resolves.toEqual(linha);
    expect(eqs).toEqual([["id", "A1"], ["estado", "promovido"]]);
  });

  it("devolve null se nao esta promovido", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(anexoRhPromovido("A1")).resolves.toBeNull();
  });

  it("devolve null e regista (sem dados) se a leitura falha ou lanca", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "x", code: "500" } });
    await expect(anexoRhPromovido("A1")).resolves.toBeNull();
    maybeSingle.mockRejectedValueOnce(new Error("boom"));
    await expect(anexoRhPromovido("A1")).resolves.toBeNull();
    expect(captureFlowError).toHaveBeenCalledTimes(2);
  });
});

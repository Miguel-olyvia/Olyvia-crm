/**
 * `usePessoaAnexos`: a parte de escrita (recarregar, anexar, substituir,
 * remover). Supabase, Edge e PUT simulados. A leitura tem o seu proprio teste.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

let respostaLista: { data: unknown; error: unknown } = { data: [], error: null };
let listaLanca = false;
let respostaVerificacao: { data: unknown; error: unknown } = { data: null, error: null };
let leituras = 0;

function cadeia() {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    order: () => c,
    maybeSingle: () => Promise.resolve(respostaVerificacao),
    then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
      if (listaLanca) return Promise.reject(new Error("rede")).then(ok, ko);
      return Promise.resolve(respostaLista).then(ok, ko);
    },
  };
  return c;
}

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      leituras += 1;
      return cadeia();
    },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

const enviarParaQuarentena = vi.fn();
vi.mock("@/lib/hr/envioQuarentena", () => ({
  enviarParaQuarentenaComMotivo: async (...args: unknown[]) => ({
    ok: await enviarParaQuarentena(...args),
    motivo: null,
  }),
}));

import { usePessoaAnexos } from "../usePessoaAnexos";

type Resultado = { ok: boolean; codigo: string | null };

const LINHA = {
  id: "a1",
  organization_id: "org",
  pessoa_id: "p1",
  tipo: "cartao_cidadao",
  estado: "promovido",
  nome_original: "frente.pdf",
  mime_type: "application/pdf",
  tamanho_bytes: 2048,
  promovido_em: "2026-10-05T10:00:00Z",
  criado_em: "2026-10-04T10:00:00Z",
};
const FOTO = { ...LINHA, id: "F1", tipo: "fotografia", nome_original: "eu.png", mime_type: "image/png" };

const URL_OK = {
  data: { ok: true, anexo_id: "N1", caminho: "admissao/rh/N1.png", upload_token: "tok" },
  error: null,
};
const ACEITE = { id: "N1", tipo: "fotografia", nome_original: "eu.png", tamanho_bytes: 4, mime_type: "image/png" };
const CONFIRMAR_OK = { data: { ok: true, anexo: ACEITE }, error: null };

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

/** Responde a hr-anexo-rh por accao; o que nao estiver no mapa devolve ok vazio. */
function responderEdge(porAccao: Record<string, unknown>) {
  invoke.mockImplementation(async (funcao: string, opcoes: { body: { accao: string } }) => {
    if (funcao !== "hr-anexo-rh") throw new Error(`funcao inesperada ${funcao}`);
    const r = porAccao[opcoes.body.accao];
    if (typeof r === "function") return (r as () => unknown)();
    return r ?? { data: { ok: true }, error: null };
  });
}

function imagem(nome = "eu.png"): File {
  return new File([new Uint8Array(4)], nome, { type: "image/png" });
}

async function montar(linhas: unknown[] = [LINHA]) {
  respostaLista = { data: linhas, error: null };
  const hook = renderHook(() => usePessoaAnexos("p1", "org"));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  respostaLista = { data: [], error: null };
  respostaVerificacao = { data: null, error: null };
  listaLanca = false;
  leituras = 0;
  invoke.mockReset();
  captureFlowError.mockReset();
  enviarParaQuarentena.mockReset().mockResolvedValue(true);
});

describe("usePessoaAnexos: recarregar", () => {
  it("volta a ler a lista", async () => {
    const { result } = await montar();
    expect(leituras).toBe(1);
    respostaLista = { data: [LINHA, { ...LINHA, id: "a2" }], error: null };
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.anexos).toHaveLength(2));
    expect(leituras).toBe(2);
  });
});

describe("usePessoaAnexos: anexar e substituir", () => {
  it("anexar: url, PUT, confirmar e recarrega a lista; nunca manda organization_id", async () => {
    responderEdge({ url: URL_OK, confirmar: CONFIRMAR_OK });
    const { result } = await montar([]);
    respostaLista = { data: [{ ...FOTO, id: "N1" }], error: null };

    let r!: Resultado;
    await act(async () => {
      r = await result.current.anexar("fotografia", imagem());
    });
    expect(r.ok).toBe(true);
    const corpos = invoke.mock.calls.map((c) => c[1].body);
    expect(corpos[0]).toMatchObject({ accao: "url", pessoa_id: "p1", tipo: "fotografia", nome: "eu.png" });
    expect(corpos[0]).not.toHaveProperty("organization_id");
    expect(corpos[0]).not.toHaveProperty("substitui_anexo_id");
    expect(corpos[1]).toEqual({ accao: "confirmar", anexo_id: "N1" });
    await waitFor(() => expect(result.current.anexos.map((a) => a.id)).toEqual(["N1"]));
  });

  it("anexar com o tipo cheio recusa localmente, sem chamar a Edge, e diz porque", async () => {
    const { result } = await montar([FOTO]);
    let r!: Resultado;
    await act(async () => {
      r = await result.current.anexar("fotografia", imagem());
    });
    expect(r).toEqual({ ok: false, codigo: "anexo_tipo_cheio" });
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.erroLimite).toEqual({ tipo: "fotografia", codigo: "anexo_tipo_cheio" });
  });

  it("um anexar com sucesso limpa o erro de limite anterior", async () => {
    responderEdge({ url: URL_OK, confirmar: CONFIRMAR_OK });
    const { result } = await montar([FOTO]);
    await act(async () => {
      await result.current.anexar("fotografia", imagem());
    });
    expect(result.current.erroLimite).not.toBeNull();
    await act(async () => {
      await result.current.anexar("comprovativo_iban", new File([new Uint8Array(4)], "i.pdf", { type: "application/pdf" }));
    });
    expect(result.current.erroLimite).toBeNull();
  });

  it("substituir com o tipo cheio passa e leva substitui_anexo_id nas duas chamadas", async () => {
    responderEdge({ url: URL_OK, confirmar: CONFIRMAR_OK });
    const { result } = await montar([FOTO]);
    let r!: Resultado;
    await act(async () => {
      r = await result.current.substituir("F1", "fotografia", imagem());
    });
    expect(r.ok).toBe(true);
    const corpos = invoke.mock.calls.map((c) => c[1].body);
    expect(corpos[0].substitui_anexo_id).toBe("F1");
    expect(corpos[1]).toEqual({ accao: "confirmar", anexo_id: "N1", substitui_anexo_id: "F1" });
  });

  it("uma recusa do servidor devolve o codigo, fica em envios e a lista recarrega na mesma", async () => {
    responderEdge({ url: erroHttp(403, { error: "sem_permissao" }) });
    const { result } = await montar([]);
    const antes = leituras;
    let r!: Resultado;
    await act(async () => {
      r = await result.current.anexar("fotografia", imagem());
    });
    expect(r).toEqual({ ok: false, codigo: "sem_permissao" });
    expect(Object.values(result.current.envios)[0]).toMatchObject({ fase: "erro", codigoErro: "sem_permissao" });
    await waitFor(() => expect(leituras).toBeGreaterThan(antes));
  });
});

describe("usePessoaAnexos: remover", () => {
  it("chama remover so com o id, recarrega e deixa de estar a remover", async () => {
    responderEdge({ remover: { data: { ok: true }, error: null } });
    const { result } = await montar();
    respostaLista = { data: [], error: null };
    let r!: Resultado;
    await act(async () => {
      r = await result.current.remover("a1");
    });
    expect(r).toEqual({ ok: true, codigo: null });
    expect(invoke).toHaveBeenCalledWith("hr-anexo-rh", {
      body: { accao: "remover", anexo_id: "a1" },
      signal: expect.any(AbortSignal),
    });
    await waitFor(() => expect(result.current.anexos).toEqual([]));
    expect(result.current.aRemover.size).toBe(0);
  });

  it("falha: guarda o codigo por anexo, recarrega na mesma e a lista fica como estava", async () => {
    responderEdge({ remover: erroHttp(403, { error: "sem_permissao" }) });
    const { result } = await montar();
    const antes = leituras;
    let r!: Resultado;
    await act(async () => {
      r = await result.current.remover("a1");
    });
    expect(r).toEqual({ ok: false, codigo: "sem_permissao" });
    expect(result.current.errosRemocao).toEqual({ a1: "sem_permissao" });
    expect(result.current.anexos).toEqual([LINHA]);
    await waitFor(() => expect(leituras).toBeGreaterThan(antes));
    expect(result.current.anexos).toEqual([LINHA]);
    act(() => result.current.limparErroRemocao("a1"));
    expect(result.current.errosRemocao).toEqual({});
  });

  it("sem codigo (rede) usa anexo_falha_envio; remocao repetida do mesmo anexo e ignorada", async () => {
    let acabar: (v: unknown) => void = () => {};
    responderEdge({ remover: () => new Promise((resolve) => (acabar = resolve)) });
    const { result } = await montar();
    let primeira!: Promise<Resultado>;
    act(() => {
      primeira = result.current.remover("a1");
    });
    await waitFor(() => expect(result.current.aRemover.has("a1")).toBe(true));
    let segunda!: Resultado;
    await act(async () => {
      segunda = await result.current.remover("a1");
    });
    expect(segunda.ok).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      acabar({ data: null, error: { name: "FunctionsFetchError", message: "x" } });
      await primeira;
    });
    expect(result.current.errosRemocao.a1).toBe("anexo_falha_envio");
  });
});

describe("usePessoaAnexos: recarregar que falha", () => {
  it("mantem a lista anterior, sinaliza erroCarregar e nao mostra 'sem anexos'", async () => {
    const { result } = await montar();
    expect(result.current.erroCarregar).toBe(false);
    respostaLista = { data: null, error: { code: "XX000", message: "boom" } };
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.erroCarregar).toBe(true));
    expect(result.current.anexos).toEqual([LINHA]);
    expect(captureFlowError).toHaveBeenCalledTimes(1);

    respostaLista = { data: [LINHA], error: null };
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.erroCarregar).toBe(false));
  });

  it("uma excepcao na leitura tambem mantem a lista", async () => {
    const { result } = await montar();
    listaLanca = true;
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.erroCarregar).toBe(true));
    expect(result.current.anexos).toEqual([LINHA]);
  });

  it("uma recusa de permissao limpa a lista (e a resposta correcta) e nao e erroCarregar", async () => {
    const { result } = await montar();
    respostaLista = { data: null, error: { code: "42501", message: "permission denied" } };
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.recusado).toBe(true));
    expect(result.current.anexos).toEqual([]);
    expect(result.current.erroCarregar).toBe(false);
  });

  it("a primeira leitura falhada tambem sinaliza erroCarregar", async () => {
    respostaLista = { data: null, error: { code: "XX000", message: "boom" } };
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erroCarregar).toBe(true);
    expect(result.current.anexos).toEqual([]);
  });
});

describe("usePessoaAnexos: confirmar repetido (anexo_estado_invalido)", () => {
  it("se o anexo ja esta promovido conta como sucesso", async () => {
    responderEdge({ url: URL_OK, confirmar: erroHttp(409, { error: "anexo_estado_invalido" }) });
    const { result } = await montar([]);
    respostaVerificacao = { data: ACEITE, error: null };
    let r!: Resultado;
    await act(async () => {
      r = await result.current.anexar("fotografia", imagem());
    });
    expect(r).toEqual({ ok: true, codigo: null });
    expect(result.current.envios).toEqual({});
  });

  it("se nao esta promovido continua a ser a falha com o codigo", async () => {
    responderEdge({ url: URL_OK, confirmar: erroHttp(409, { error: "anexo_estado_invalido" }) });
    const { result } = await montar([]);
    let r!: Resultado;
    await act(async () => {
      r = await result.current.anexar("fotografia", imagem());
    });
    expect(r).toEqual({ ok: false, codigo: "anexo_estado_invalido" });
  });
});

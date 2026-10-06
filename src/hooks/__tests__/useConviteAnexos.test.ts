/**
 * `useConviteAnexos`: o envio dos ficheiros do convite publico, com o Supabase
 * e o XMLHttpRequest simulados. Nada toca em rede nem em base nenhuma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { useConviteAnexos } from "../useConviteAnexos";
import type { AnexoConvite } from "@/lib/hr/conviteAnexos";

/** Um XHR que so regista o que lhe fazem; o teste decide quando e como termina. */
class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(nome: string, valor: string) {
    this.headers[nome.toLowerCase()] = valor;
  }
  send(body: unknown) {
    this.body = body;
  }
  progresso(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  terminar(status: number) {
    this.status = status;
    this.onload?.();
  }
}

const TOKEN = "token-secreto-do-convite";

const URL_OK = {
  data: { ok: true, anexo_id: "A1", caminho: "admissao/C1/A1.pdf", upload_token: "tok-upload" },
  error: null,
};

function anexoDe(id: string, tipo: AnexoConvite["tipo"], nome = "ficheiro.pdf"): AnexoConvite {
  return { id, tipo, nome_original: nome, tamanho_bytes: 100, mime_type: "application/pdf" };
}

function confirmarOk(id = "A1", tipo = "cartao_cidadao", nome = "a.pdf") {
  return { data: { ok: true, anexo: anexoDe(id, tipo as AnexoConvite["tipo"], nome) }, error: null };
}

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

function pdf(nome = "a.pdf", tamanho = 100, tipo = "application/pdf"): File {
  return new File([new Uint8Array(tamanho)], nome, { type: tipo });
}

/** Responde por accao; o que nao estiver no mapa devolve ok vazio. */
function responder(porAccao: Record<string, unknown>) {
  invoke.mockImplementation(async (_fn: string, opcoes: { body: { action: string } }) => {
    const resposta = porAccao[opcoes.body.action];
    if (typeof resposta === "function") return (resposta as () => unknown)();
    return resposta ?? { data: { ok: true }, error: null };
  });
}

function accoesChamadas(): string[] {
  return invoke.mock.calls.map((c) => (c[1] as { body: { action: string } }).body.action);
}

async function esperarXhr(): Promise<FakeXHR> {
  await waitFor(() => expect(FakeXHR.instances.length).toBeGreaterThan(0));
  return FakeXHR.instances[FakeXHR.instances.length - 1];
}

beforeEach(() => {
  invoke.mockReset();
  captureFlowError.mockReset();
  FakeXHR.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.stubEnv("VITE_SUPABASE_URL", "https://projeto.supabase.co/");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useConviteAnexos: envio com sucesso", () => {
  it("pede o URL, envia por PUT para a quarentena, confirma e acrescenta o anexo", async () => {
    responder({ anexo_url: URL_OK, anexo_confirmar: confirmarOk() });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));

    expect(result.current.emCurso).toBe(false);
    let envio!: Promise<void>;
    act(() => {
      envio = result.current.adicionar("cartao_cidadao", pdf("a.pdf", 2048));
    });

    const xhr = await esperarXhr();
    // O pedido do URL leva so o que o servidor precisa: nada de organizacao nem pessoa.
    const pedido = invoke.mock.calls[0];
    expect(pedido[0]).toBe("convite-admissao");
    expect(pedido[1].body).toEqual({
      action: "anexo_url",
      token: TOKEN,
      tipo: "cartao_cidadao",
      nome: "a.pdf",
      tamanho: 2048,
      mime: "application/pdf",
    });

    // O PUT vai para o endereco assinado da quarentena, com o token de envio.
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(
      "https://projeto.supabase.co/storage/v1/object/upload/sign/hr-documentos-quarantine/admissao/C1/A1.pdf?token=tok-upload",
    );
    expect(xhr.headers.apikey).toBe("chave-publicavel");
    expect(xhr.headers["x-upsert"]).toBe("false");
    const corpo = xhr.body as FormData;
    expect(corpo.get("cacheControl")).toBe("3600");
    expect(corpo.get("")).toBeInstanceOf(File);

    expect(result.current.emCurso).toBe(true);
    const [idLocal] = Object.keys(result.current.envios);
    expect(result.current.envios[idLocal]).toMatchObject({
      tipo: "cartao_cidadao",
      nome: "a.pdf",
      fase: "a_enviar",
      progresso: 0,
      codigoErro: null,
    });

    act(() => xhr.progresso(50, 100));
    expect(result.current.envios[idLocal].progresso).toBe(50);

    await act(async () => {
      xhr.terminar(200);
      await envio;
    });

    expect(accoesChamadas()).toEqual(["anexo_url", "anexo_confirmar"]);
    expect(invoke.mock.calls[1][1].body).toEqual({
      action: "anexo_confirmar",
      token: TOKEN,
      anexo_id: "A1",
    });
    expect(result.current.anexos).toEqual([anexoDe("A1", "cartao_cidadao", "a.pdf")]);
    expect(result.current.envios).toEqual({});
    expect(result.current.emCurso).toBe(false);
    expect(result.current.contagem).toEqual({ total: 1, porTipo: { cartao_cidadao: 1 } });
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("passa a fase a_verificar enquanto o servidor confirma, e conta como em curso", async () => {
    let concluirConfirmacao!: (v: unknown) => void;
    responder({
      anexo_url: URL_OK,
      anexo_confirmar: () => new Promise((resolve) => (concluirConfirmacao = resolve)),
    });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    let envio!: Promise<void>;
    act(() => {
      envio = result.current.adicionar("cartao_cidadao", pdf());
    });
    const xhr = await esperarXhr();
    await act(async () => {
      xhr.terminar(200);
    });
    await waitFor(() => {
      const [e] = Object.values(result.current.envios);
      expect(e?.fase).toBe("a_verificar");
      expect(e?.progresso).toBe(100);
    });
    expect(result.current.emCurso).toBe(true);

    await act(async () => {
      concluirConfirmacao(confirmarOk());
      await envio;
    });
    expect(result.current.emCurso).toBe(false);
    expect(result.current.anexos).toHaveLength(1);
  });

  it("nunca guarda o token em armazenamento do navegador", async () => {
    responder({ anexo_url: URL_OK, anexo_confirmar: confirmarOk() });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    let envio!: Promise<void>;
    act(() => {
      envio = result.current.adicionar("cartao_cidadao", pdf());
    });
    const xhr = await esperarXhr();
    await act(async () => {
      xhr.terminar(200);
      await envio;
    });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("useConviteAnexos: recusas", () => {
  it("uma recusa 422 ao pedir o URL fica no envio, com o codigo lido de error.context", async () => {
    responder({ anexo_url: erroHttp(422, { error: "anexo_formato_invalido" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf());
    });
    expect(FakeXHR.instances).toHaveLength(0);
    const [envio] = Object.values(result.current.envios);
    expect(envio).toMatchObject({ fase: "erro", codigoErro: "anexo_formato_invalido" });
    expect(result.current.emCurso).toBe(false);
    expect(result.current.anexos).toEqual([]);
    // Uma recusa de negocio nao e um defeito.
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("uma recusa da confirmacao (ficheiro nao e o que dizia) fica como erro e nao entra nos anexos", async () => {
    responder({ anexo_url: URL_OK, anexo_confirmar: erroHttp(422, { error: "anexo_formato_invalido" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    let envio!: Promise<void>;
    act(() => {
      envio = result.current.adicionar("cartao_cidadao", pdf());
    });
    const xhr = await esperarXhr();
    await act(async () => {
      xhr.terminar(200);
      await envio;
    });
    const [e] = Object.values(result.current.envios);
    expect(e).toMatchObject({ fase: "erro", codigoErro: "anexo_formato_invalido" });
    expect(result.current.anexos).toEqual([]);
    expect(result.current.emCurso).toBe(false);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("pre-verifica localmente: um GIF e recusado sem qualquer pedido", async () => {
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf("a.gif", 100, "image/gif"));
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(FakeXHR.instances).toHaveLength(0);
    expect(Object.values(result.current.envios)[0]?.codigoErro).toBe("anexo_formato_invalido");
  });

  it("recusa o quinto ficheiro antes de qualquer pedido", async () => {
    const iniciais = [
      anexoDe("1", "cartao_cidadao"),
      anexoDe("2", "cartao_cidadao"),
      anexoDe("3", "comprovativo_iban"),
      anexoDe("4", "fotografia"),
    ];
    const { result } = renderHook(() => useConviteAnexos(TOKEN, iniciais));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf());
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(Object.values(result.current.envios)[0]?.codigoErro).toBe("anexo_maximo_ficheiros");
    expect(result.current.anexos).toHaveLength(4);
  });

  it("recusa um terceiro cartao de cidadao com anexo_tipo_cheio, sem pedido", async () => {
    const iniciais = [anexoDe("1", "cartao_cidadao"), anexoDe("2", "cartao_cidadao")];
    const { result } = renderHook(() => useConviteAnexos(TOKEN, iniciais));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf());
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(Object.values(result.current.envios)[0]?.codigoErro).toBe("anexo_tipo_cheio");
  });

  it("um novo pedido do mesmo tipo limpa o erro anterior desse tipo", async () => {
    responder({ anexo_url: erroHttp(422, { error: "anexo_formato_invalido" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf("a.gif", 100, "image/gif"));
    });
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf("b.gif", 100, "image/gif"));
    });
    const envios = Object.values(result.current.envios);
    expect(envios).toHaveLength(1);
    expect(envios[0].nome).toBe("b.gif");
  });

  it("um motivo convite_* devolvido pelo servidor chega a erroConvite", async () => {
    responder({ anexo_url: erroHttp(409, { error: "convite_expirado" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    expect(result.current.erroConvite).toBeNull();
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf());
    });
    expect(result.current.erroConvite).toBe("convite_expirado");
  });
});

describe("useConviteAnexos: falhas inesperadas", () => {
  it("o PUT falha: erro anexo_falha_envio, liberta o lugar e regista sem token nem nome", async () => {
    responder({ anexo_url: URL_OK });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    let envio!: Promise<void>;
    act(() => {
      envio = result.current.adicionar("cartao_cidadao", pdf("segredo-da-pessoa.pdf"));
    });
    const xhr = await esperarXhr();
    await act(async () => {
      xhr.terminar(500);
      await envio;
    });
    const [e] = Object.values(result.current.envios);
    expect(e).toMatchObject({ fase: "erro", codigoErro: "anexo_falha_envio" });
    expect(result.current.emCurso).toBe(false);

    // Tenta libertar o lugar reservado no servidor (melhor esforco).
    expect(accoesChamadas()).toContain("anexo_remover");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    const registado = JSON.stringify(captureFlowError.mock.calls[0][0].message);
    expect(registado).not.toContain(TOKEN);
    expect(registado).not.toContain("segredo-da-pessoa");
  });

  it("a rede cai ao pedir o URL (sem corpo legivel): anexo_falha_envio e registo", async () => {
    invoke.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf());
    });
    expect(Object.values(result.current.envios)[0]?.codigoErro).toBe("anexo_falha_envio");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});

describe("useConviteAnexos: o confirmar perde a resposta (o servidor pode ja ter ligado)", () => {
  async function enviarAteConfirmar(result: { current: ReturnType<typeof useConviteAnexos> }, tipo: AnexoConvite["tipo"] = "comprovativo_iban") {
    let envio!: Promise<void>;
    act(() => {
      envio = result.current.adicionar(tipo, pdf("iban.pdf"));
    });
    const xhr = await esperarXhr();
    await act(async () => {
      xhr.terminar(200);
      await envio;
    });
  }

  it("5xx no confirmar: mostra o erro E manda anexo_remover do mesmo anexo_id", async () => {
    responder({ anexo_url: URL_OK, anexo_confirmar: erroHttp(502, {}) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await enviarAteConfirmar(result);

    const [e] = Object.values(result.current.envios);
    expect(e).toMatchObject({ fase: "erro", codigoErro: "anexo_falha_envio" });
    expect(accoesChamadas()).toEqual(["anexo_url", "anexo_confirmar", "anexo_remover"]);
    expect(invoke).toHaveBeenLastCalledWith("convite-admissao", {
      body: { action: "anexo_remover", token: TOKEN, anexo_id: "A1" },
    });
    expect(result.current.anexos).toEqual([]);
  });

  it("falha de rede no confirmar: tambem manda anexo_remover, e a pessoa pode tentar de novo sem recusa local", async () => {
    responder({
      anexo_url: URL_OK,
      anexo_confirmar: () => {
        throw new Error("Failed to fetch");
      },
    });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await enviarAteConfirmar(result);
    expect(accoesChamadas()).toContain("anexo_remover");
    expect(captureFlowError).toHaveBeenCalledTimes(1);

    // O lugar ficou livre: o segundo envio do comprovativo (limite 1) nao e recusado localmente.
    FakeXHR.instances = [];
    responder({ anexo_url: URL_OK, anexo_confirmar: confirmarOk("A1", "comprovativo_iban", "iban.pdf") });
    await enviarAteConfirmar(result);
    expect(result.current.anexos.map((a) => a.id)).toEqual(["A1"]);
    expect(result.current.envios).toEqual({});
  });

  it("se nem o anexo_remover chega, refaz a lista a partir do estado do servidor (fonte de verdade)", async () => {
    responder({
      anexo_url: URL_OK,
      anexo_confirmar: erroHttp(502, {}),
      anexo_remover: erroHttp(502, {}),
      estado: {
        data: { ok: true, convite: { anexos: [anexoDe("A1", "comprovativo_iban", "iban.pdf")] } },
        error: null,
      },
    });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await enviarAteConfirmar(result);
    expect(accoesChamadas()).toEqual(["anexo_url", "anexo_confirmar", "anexo_remover", "estado"]);
    // O servidor ja o tinha ligado: o ecra passa a mostra-lo em vez de o esconder e contar.
    expect(result.current.anexos.map((a) => a.id)).toEqual(["A1"]);
    expect(result.current.contagem.porTipo).toEqual({ comprovativo_iban: 1 });
  });

  it("estado sem lista valida nao apaga o que o ecra ja tinha", async () => {
    responder({
      anexo_url: URL_OK,
      anexo_confirmar: erroHttp(502, {}),
      anexo_remover: erroHttp(502, {}),
      estado: { data: { ok: true, convite: {} }, error: null },
    });
    const { result } = renderHook(() =>
      useConviteAnexos(TOKEN, [anexoDe("F1", "fotografia", "f.png")]),
    );
    await enviarAteConfirmar(result);
    expect(result.current.anexos.map((a) => a.id)).toEqual(["F1"]);
  });

  it("uma recusa de negocio no confirmar NAO dispara anexo_remover nem estado", async () => {
    responder({ anexo_url: URL_OK, anexo_confirmar: erroHttp(422, { error: "anexo_formato_invalido" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN));
    await enviarAteConfirmar(result);
    expect(accoesChamadas()).toEqual(["anexo_url", "anexo_confirmar"]);
  });
});

describe("useConviteAnexos: a remover", () => {
  it("enquanto o anexo_remover esta pendente conta como em curso e expoe o id em removendo", async () => {
    let concluir!: (v: unknown) => void;
    responder({ anexo_remover: () => new Promise((resolve) => (concluir = resolve)) });
    const { result } = renderHook(() =>
      useConviteAnexos(TOKEN, [anexoDe("A1", "cartao_cidadao"), anexoDe("A2", "fotografia")]),
    );
    expect(result.current.emCurso).toBe(false);
    expect(result.current.removendo.size).toBe(0);

    let remocao!: Promise<void>;
    act(() => {
      remocao = result.current.remover("A1");
    });
    await waitFor(() => expect(result.current.emCurso).toBe(true));
    expect(result.current.removendo.has("A1")).toBe(true);
    expect(result.current.removendo.has("A2")).toBe(false);

    await act(async () => {
      concluir({ data: { ok: true }, error: null });
      await remocao;
    });
    expect(result.current.emCurso).toBe(false);
    expect(result.current.removendo.size).toBe(0);
    expect(result.current.anexos.map((a) => a.id)).toEqual(["A2"]);
  });

  it("uma remocao recusada tambem deixa de contar como em curso", async () => {
    responder({ anexo_remover: erroHttp(404, { error: "anexo_nao_encontrado" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN, [anexoDe("A1", "fotografia", "f.png")]));
    await act(async () => {
      await result.current.remover("A1");
    });
    expect(result.current.removendo.size).toBe(0);
    expect(result.current.emCurso).toBe(false);
  });

  it("um segundo clique no mesmo anexo enquanto remove nao repete o pedido", async () => {
    let concluir!: (v: unknown) => void;
    responder({ anexo_remover: () => new Promise((resolve) => (concluir = resolve)) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN, [anexoDe("A1", "fotografia")]));
    let primeira!: Promise<void>;
    act(() => {
      primeira = result.current.remover("A1");
    });
    await act(async () => {
      await result.current.remover("A1");
    });
    expect(accoesChamadas()).toEqual(["anexo_remover"]);
    await act(async () => {
      concluir({ data: { ok: true }, error: null });
      await primeira;
    });
  });
});

describe("useConviteAnexos: anexos iniciais", () => {
  it("adopta os iniciais UMA vez, quando passam a existir", async () => {
    const { result, rerender } = renderHook(
      ({ iniciais }: { iniciais?: AnexoConvite[] }) => useConviteAnexos(TOKEN, iniciais),
      { initialProps: { iniciais: undefined as AnexoConvite[] | undefined } },
    );
    expect(result.current.anexos).toEqual([]);

    rerender({ iniciais: [anexoDe("1", "fotografia", "f.png")] });
    await waitFor(() => expect(result.current.anexos).toHaveLength(1));

    rerender({ iniciais: [anexoDe("9", "cartao_cidadao"), anexoDe("8", "cartao_cidadao")] });
    expect(result.current.anexos.map((a) => a.id)).toEqual(["1"]);
  });
});

describe("useConviteAnexos: remover", () => {
  it("chama anexo_remover e tira o anexo da lista", async () => {
    responder({ anexo_remover: { data: { ok: true }, error: null } });
    const { result } = renderHook(() =>
      useConviteAnexos(TOKEN, [anexoDe("A1", "fotografia"), anexoDe("A2", "cartao_cidadao")]),
    );
    await act(async () => {
      await result.current.remover("A1");
    });
    expect(invoke).toHaveBeenCalledWith("convite-admissao", {
      body: { action: "anexo_remover", token: TOKEN, anexo_id: "A1" },
    });
    expect(result.current.anexos.map((a) => a.id)).toEqual(["A2"]);
    expect(result.current.contagem).toEqual({ total: 1, porTipo: { cartao_cidadao: 1 } });
  });

  it("se o servidor recusar, o anexo fica e o erro aparece no envio do mesmo tipo", async () => {
    responder({ anexo_remover: erroHttp(404, { error: "anexo_nao_encontrado" }) });
    const { result } = renderHook(() => useConviteAnexos(TOKEN, [anexoDe("A1", "fotografia", "f.png")]));
    await act(async () => {
      await result.current.remover("A1");
    });
    expect(result.current.anexos).toHaveLength(1);
    const [e] = Object.values(result.current.envios);
    expect(e).toMatchObject({ tipo: "fotografia", fase: "erro", codigoErro: "anexo_nao_encontrado" });
  });
});

describe("useConviteAnexos: sem token", () => {
  it("nao faz pedido nenhum", async () => {
    const { result } = renderHook(() => useConviteAnexos(undefined));
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf());
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

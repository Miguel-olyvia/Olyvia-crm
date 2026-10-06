/**
 * `usePessoaAnexos` e `pedirUrlAnexo`: a lista de anexos PROMOVIDOS de uma
 * pessoa (so as colunas que a base deixa ler) e a abertura de um ficheiro por
 * URL assinado de `hr-anexo-url`. Supabase simulado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

let respostaLista: { data: unknown; error: unknown } = { data: [], error: null };
let chamadasEq: Array<[string, unknown]> = [];
let colunasPedidas: string[] = [];
let tabelasPedidas: string[] = [];
let ordenacoes: Array<[string, unknown]> = [];

function cadeia() {
  const c: Record<string, unknown> = {
    select: (colunas: string) => {
      colunasPedidas.push(colunas);
      return c;
    },
    eq: (coluna: string, valor: unknown) => {
      chamadasEq.push([coluna, valor]);
      return c;
    },
    order: (coluna: string, opcoes: unknown) => {
      ordenacoes.push([coluna, opcoes]);
      return c;
    },
    then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
      return Promise.resolve(respostaLista).then(ok, ko);
    },
  };
  return c;
}

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      tabelasPedidas.push(tabela);
      return cadeia();
    },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { usePessoaAnexos } from "../usePessoaAnexos";
import { pedirUrlAnexo } from "@/lib/hr/anexoUrl";

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
  respostaLista = { data: [LINHA], error: null };
  chamadasEq = [];
  colunasPedidas = [];
  tabelasPedidas = [];
  ordenacoes = [];
  invoke.mockReset();
  captureFlowError.mockReset();
});

describe("usePessoaAnexos: lista", () => {
  it("le pessoas_anexos da pessoa, da organizacao e so os promovidos", async () => {
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.anexos).toEqual([LINHA]);
    expect(tabelasPedidas).toEqual(["pessoas_anexos"]);
    expect(chamadasEq).toEqual(
      expect.arrayContaining([
        ["pessoa_id", "p1"],
        ["organization_id", "org"],
        ["estado", "promovido"],
      ]),
    );
    expect(ordenacoes[0][0]).toBe("criado_em");
  });

  it("pede so as colunas concedidas: nunca caminho, hash, ip, convite nem motivo", async () => {
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const colunas = colunasPedidas[0].split(",").map((c) => c.trim());
    expect(colunas).toEqual(
      expect.arrayContaining([
        "id", "organization_id", "pessoa_id", "tipo", "estado",
        "nome_original", "mime_type", "tamanho_bytes", "promovido_em", "criado_em",
      ]),
    );
    for (const proibida of ["caminho", "hash_sha256", "upload_ip", "convite_id", "apagado_motivo", "objecto_removido_em", "bucket"]) {
      expect(colunas).not.toContain(proibida);
    }
    expect(colunasPedidas[0]).not.toContain("*");
  });

  it("sem pessoa ou sem organizacao nao pede nada e acaba de carregar", async () => {
    const { result } = renderHook(() => usePessoaAnexos(undefined, undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tabelasPedidas).toEqual([]);
    expect(result.current.anexos).toEqual([]);
  });

  it("uma recusa de permissao nao e erro: fica recusado e nao vai para o registo", async () => {
    respostaLista = { data: null, error: { code: "42501", message: "permission denied" } };
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recusado).toBe(true);
    expect(result.current.anexos).toEqual([]);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("uma falha qualquer vai para o registo e deixa a lista vazia", async () => {
    respostaLista = { data: null, error: { code: "XX000", message: "boom" } };
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recusado).toBe(false);
    expect(result.current.anexos).toEqual([]);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma lista vazia e uma resposta valida", async () => {
    respostaLista = { data: [], error: null };
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.anexos).toEqual([]);
    expect(result.current.recusado).toBe(false);
  });
});

describe("usePessoaAnexos: obterUrl", () => {
  it("chama hr-anexo-url so com o id do anexo e devolve o URL", async () => {
    invoke.mockResolvedValue({
      data: { url: "https://x/assinado?t=1", expiraEmSegundos: 60, tipo: "cartao_cidadao", mime_type: "application/pdf" },
      error: null,
    });
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let url!: string;
    await act(async () => {
      url = (await result.current.obterUrl("a1")).url;
    });
    expect(url).toBe("https://x/assinado?t=1");
    expect(invoke).toHaveBeenCalledWith("hr-anexo-url", { body: { anexoId: "a1" } });
  });

  it("nunca guarda nem reaproveita o URL: cada abertura pede um novo", async () => {
    invoke
      .mockResolvedValueOnce({ data: { url: "https://x/1", expiraEmSegundos: 60 }, error: null })
      .mockResolvedValueOnce({ data: { url: "https://x/2", expiraEmSegundos: 60 }, error: null });
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let primeiro = "";
    let segundo = "";
    await act(async () => {
      primeiro = (await result.current.obterUrl("a1")).url;
      segundo = (await result.current.obterUrl("a1")).url;
    });
    expect([primeiro, segundo]).toEqual(["https://x/1", "https://x/2"]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("um 403 e erro de permissao: lanca, sem captureFlowError", async () => {
    invoke.mockResolvedValue(erroHttp(403, { error: "sem_permissao" }));
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.obterUrl("a1")).rejects.toBeTruthy();
    });
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("uma falha inesperada lanca e vai para o registo", async () => {
    invoke.mockResolvedValue(erroHttp(500, { error: "erro_inesperado" }));
    const { result } = renderHook(() => usePessoaAnexos("p1", "org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.obterUrl("a1")).rejects.toBeTruthy();
    });
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma resposta sem url lanca", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(pedirUrlAnexo("a1")).rejects.toThrow();
  });
});

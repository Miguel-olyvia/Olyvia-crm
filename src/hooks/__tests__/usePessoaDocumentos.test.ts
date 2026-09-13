/**
 * `usePessoaDocumentos`: so metadados na lista, recusa de permissao vira
 * `recusado` (nao "sem documentos"), e as tres RPCs recebem exactamente os
 * argumentos que a migration 20261123030000 espera.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/** Chamadas RPC recebidas, na ordem em que chegaram. */
let chamadasRpc: Array<{ fn: string; args: unknown }> = [];
let rpcImpl: (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }> = () => Promise.resolve({ data: null, error: null });

/** O que cada tabela devolve no proximo `select`. Reatribuido em cada `it`. */
let respostaPorTabela: Record<string, { data: unknown; error: unknown }> = {};

/** Chamadas a storage.from(bucket).upload(path, file), na ordem em que chegaram. */
let chamadasUpload: Array<{ bucket: string; path: string }> = [];
let uploadImpl: (bucket: string, path: string) => Promise<{ error: unknown }> = () =>
  Promise.resolve({ error: null });

/** Chamadas a functions.invoke(fn, { body }), na ordem em que chegaram. */
let chamadasFunctions: Array<{ fn: string; body: unknown }> = [];
let functionsImpl: (fn: string, body: unknown) => Promise<{ data: unknown; error: unknown }> = () =>
  Promise.resolve({ data: { ok: true, finalPath: "x" }, error: null });

function buildChain(table: string) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      const resposta = respostaPorTabela[table] ?? { data: [], error: null };
      return Promise.resolve(resposta).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: (fn: string, args?: Record<string, unknown>) => {
      chamadasRpc.push({ fn, args });
      return rpcImpl(fn, args);
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => {
          chamadasUpload.push({ bucket, path });
          return uploadImpl(bucket, path);
        },
      }),
    },
    functions: {
      invoke: (fn: string, opts?: { body?: unknown }) => {
        chamadasFunctions.push({ fn, body: opts?.body });
        return functionsImpl(fn, opts?.body);
      },
    },
  },
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

import { usePessoaDocumentos } from "@/hooks/usePessoaDocumentos";

const DOCUMENTO = {
  id: "doc1",
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: null,
  modelo_id: "m1",
  tipo: "contrato",
  titulo: "Contrato de trabalho",
  estado: "assinado",
  ficheiro_caminho: "org/p1/doc1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf",
  ficheiro_hash_sha256: "a".repeat(64),
  ficheiro_anexado_em: "2026-01-02T00:00:00Z",
  emitido_em: "2026-01-01T00:00:00Z",
  emitido_por: "rh1",
  assinado_em: "2026-01-02T00:00:00Z",
  anulado_em: null,
  anulado_motivo: null,
};

/** A_aguardar_assinatura -- so nesse estado `anexarFicheiro` e aceite (20261130065000). */
const DOCUMENTO_A_ASSINAR = {
  ...DOCUMENTO,
  id: "doc2",
  estado: "a_aguardar_assinatura",
  ficheiro_caminho: null,
  ficheiro_hash_sha256: null,
  ficheiro_anexado_em: null,
};

beforeEach(() => {
  chamadasRpc = [];
  chamadasUpload = [];
  chamadasFunctions = [];
  rpcImpl = () => Promise.resolve({ data: null, error: null });
  uploadImpl = () => Promise.resolve({ error: null });
  functionsImpl = () => Promise.resolve({ data: { ok: true, finalPath: "x" }, error: null });
  respostaPorTabela = {
    pessoas_documentos: { data: [DOCUMENTO], error: null },
    pessoas_documentos_modelos: { data: [], error: null },
  };
});

describe("usePessoaDocumentos", () => {
  it("carrega a lista de documentos da pessoa", async () => {
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.documentos).toEqual([DOCUMENTO]);
    expect(result.current.recusado).toBe(false);
  });

  it("so carrega os modelos quando podeVerModelos e verdadeiro", async () => {
    respostaPorTabela.pessoas_documentos_modelos = {
      data: [{ id: "m1", organization_id: "org", nome: "Contrato-tipo", tipo: "contrato", activo: true }],
      error: null,
    };

    const { result: semModelos } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(semModelos.current.loading).toBe(false));
    expect(semModelos.current.modelos).toEqual([]);

    const { result: comModelos } = renderHook(() => usePessoaDocumentos("p1", true));
    await waitFor(() => expect(comModelos.current.loading).toBe(false));
    expect(comModelos.current.modelos).toHaveLength(1);
  });

  it("uma recusa de permissao fica `recusado`, nao 'sem documentos'", async () => {
    respostaPorTabela.pessoas_documentos = {
      data: null,
      error: { code: "42501", message: "permission denied" },
    };

    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recusado).toBe(true);
    expect(result.current.documentos).toEqual([]);
  });

  it("emitir chama rpc_hr_documento_emitir com o modelo e a pessoa em array", async () => {
    rpcImpl = () => Promise.resolve({ data: null, error: null });
    const { result } = renderHook(() => usePessoaDocumentos("p1", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const erro = await result.current.emitir("m1");

    expect(erro).toBeNull();
    expect(chamadasRpc).toContainEqual({
      fn: "rpc_hr_documento_emitir",
      args: { p_modelo_id: "m1", p_pessoa_ids: ["p1"] },
    });
  });

  it("verConteudo chama rpc_hr_documento_ver_conteudo e devolve o texto", async () => {
    rpcImpl = (fn) =>
      fn === "rpc_hr_documento_ver_conteudo"
        ? Promise.resolve({ data: "<p>Ola</p>", error: null })
        : Promise.resolve({ data: null, error: null });

    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const html = await result.current.verConteudo("doc1");

    expect(html).toBe("<p>Ola</p>");
    expect(chamadasRpc).toContainEqual({
      fn: "rpc_hr_documento_ver_conteudo",
      args: { p_documento_id: "doc1" },
    });
  });

  it("verConteudo lanca quando a RPC recusa -- quem chama e que mostra a mensagem", async () => {
    rpcImpl = () => Promise.resolve({ data: null, error: { message: "recusado" } });
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.verConteudo("doc1")).rejects.toBeTruthy();
  });

  it("assinar chama rpc_hr_documento_assinar com o id do documento", async () => {
    rpcImpl = () => Promise.resolve({ data: null, error: null });
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const erro = await result.current.assinar("doc1");

    expect(erro).toBeNull();
    expect(chamadasRpc).toContainEqual({
      fn: "rpc_hr_documento_assinar",
      args: { p_documento_id: "doc1" },
    });
  });

  it("anexarFicheiro sobe para a quarentena e chama validate-upload com o caminho imposto pela politica", async () => {
    respostaPorTabela.pessoas_documentos = { data: [DOCUMENTO_A_ASSINAR], error: null };
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ficheiro = new File(["conteudo"], "aditamento.pdf", { type: "application/pdf" });
    const erro = await result.current.anexarFicheiro("doc2", ficheiro);

    expect(erro).toBeNull();
    expect(chamadasUpload).toHaveLength(1);
    expect(chamadasUpload[0].bucket).toBe("hr-documentos-quarantine");
    // <organization_id>/<pessoa_id>/<documento_id>/<uuid_minusculo>.<ext> -- a
    // MESMA forma que a politica de storage (20261130055000) e a RPC de
    // anexar (20261130065000) exigem.
    expect(chamadasUpload[0].path).toMatch(
      /^org\/p1\/doc2\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
    );

    expect(chamadasFunctions).toHaveLength(1);
    expect(chamadasFunctions[0].fn).toBe("validate-upload");
    expect(chamadasFunctions[0].body).toMatchObject({
      quarantineBucket: "hr-documentos-quarantine",
      finalBucket: "hr-documentos",
      path: chamadasUpload[0].path,
    });
  });

  it("anexarFicheiro rejeita um tipo de ficheiro fora de pdf/jpg/jpeg/png sem tocar no storage", async () => {
    respostaPorTabela.pessoas_documentos = { data: [DOCUMENTO_A_ASSINAR], error: null };
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ficheiro = new File(["conteudo"], "nota.txt", { type: "text/plain" });
    const erro = await result.current.anexarFicheiro("doc2", ficheiro);

    expect(erro).not.toBeNull();
    expect(chamadasUpload).toHaveLength(0);
    expect(chamadasFunctions).toHaveLength(0);
  });

  it("anexarFicheiro devolve o erro de validate-upload quando a promocao falha", async () => {
    respostaPorTabela.pessoas_documentos = { data: [DOCUMENTO_A_ASSINAR], error: null };
    functionsImpl = () =>
      Promise.resolve({ data: { ok: false, error: "Sem permissão." }, error: null });
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ficheiro = new File(["conteudo"], "aditamento.pdf", { type: "application/pdf" });
    const erro = await result.current.anexarFicheiro("doc2", ficheiro);

    expect(erro).toBe("Sem permissão.");
  });

  it("obterUrlFicheiro invoca hr-documento-ficheiro-url com o documentoId e devolve o url e o hash", async () => {
    functionsImpl = (fn) =>
      fn === "hr-documento-ficheiro-url"
        ? Promise.resolve({
            data: { url: "https://exemplo/assinado", hash: "a".repeat(64), anexadoEm: "2026-01-02T00:00:00Z" },
            error: null,
          })
        : Promise.resolve({ data: null, error: null });

    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const resposta = await result.current.obterUrlFicheiro("doc1");

    expect(resposta).toEqual({
      url: "https://exemplo/assinado",
      hash: "a".repeat(64),
      anexadoEm: "2026-01-02T00:00:00Z",
    });
    expect(chamadasFunctions).toContainEqual({
      fn: "hr-documento-ficheiro-url",
      body: { documentoId: "doc1" },
    });
  });

  it("obterUrlFicheiro lanca quando a funcao recusa -- quem chama e que mostra a mensagem", async () => {
    functionsImpl = () => Promise.resolve({ data: null, error: { message: "recusado" } });
    const { result } = renderHook(() => usePessoaDocumentos("p1", false));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.obterUrlFicheiro("doc1")).rejects.toBeTruthy();
  });
});

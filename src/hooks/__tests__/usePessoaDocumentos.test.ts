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
  emitido_em: "2026-01-01T00:00:00Z",
  emitido_por: "rh1",
  assinado_em: "2026-01-02T00:00:00Z",
  anulado_em: null,
  anulado_motivo: null,
};

beforeEach(() => {
  chamadasRpc = [];
  rpcImpl = () => Promise.resolve({ data: null, error: null });
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
});

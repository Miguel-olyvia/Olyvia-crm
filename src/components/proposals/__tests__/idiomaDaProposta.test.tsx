// O idioma gravado em proposals.language: o que se grava (e o que NÃO se grava) e a escrita tolerante a falhas.
// (O chip «PT · EN» da lista e da ficha é da fase 2B.) Supabase simulado: nada vai à rede.
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { atualizar, rpc, estado } = vi.hoisted(() => ({
  atualizar: vi.fn(),
  rpc: vi.fn(),
  estado: { erro: null as { message: string } | null, lanca: false },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (tabela: string) => ({
      update: (valores: unknown) => ({
        eq: (coluna: string, valor: string) => {
          if (estado.lanca) throw new Error("rede em baixo");
          atualizar(tabela, valores, coluna, valor);
          return Promise.resolve({ error: estado.erro });
        },
      }),
    }),
  },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { decidirGravacaoDoIdioma, gravarIdiomaDaProposta, languageParaGravar } from "../idiomaDaProposta";

beforeEach(() => {
  atualizar.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  estado.erro = null;
  estado.lanca = false;
});
afterEach(cleanup);

describe("languageParaGravar", () => {
  it("só português (ou nada) não se grava: language fica nulo, como hoje", () => {
    expect(languageParaGravar(["pt"])).toBeNull();
    expect(languageParaGravar([])).toBeNull();
    expect(languageParaGravar(undefined)).toBeNull();
  });

  it("qualquer outra escolha grava o formato da coluna", () => {
    expect(languageParaGravar(["en"])).toBe("en");
    expect(languageParaGravar(["pt", "en"])).toBe("pt+en");
  });
});

describe("decidirGravacaoDoIdioma", () => {
  it("criar com português: não há nada a gravar", () => {
    expect(decidirGravacaoDoIdioma({ modo: "criar", escolha: ["pt"] })).toBeNull();
  });

  it("criar com inglês ou com os dois: grava essa escolha", () => {
    expect(decidirGravacaoDoIdioma({ modo: "criar", escolha: ["en"] })).toEqual({ language: "en" });
    expect(decidirGravacaoDoIdioma({ modo: "criar", escolha: ["pt", "en"] })).toEqual({ language: "pt+en" });
  });

  it("editar sem mudar a escolha: não escreve (nulo e «pt» são o mesmo)", () => {
    expect(decidirGravacaoDoIdioma({ modo: "editar", escolha: ["pt"], gravado: null })).toBeNull();
    expect(decidirGravacaoDoIdioma({ modo: "editar", escolha: ["pt"], gravado: "pt" })).toBeNull();
    expect(decidirGravacaoDoIdioma({ modo: "editar", escolha: ["pt", "en"], gravado: "pt+en" })).toBeNull();
  });

  it("editar mudando a escolha: grava a nova; voltar ao português limpa a coluna (null)", () => {
    expect(decidirGravacaoDoIdioma({ modo: "editar", escolha: ["en"], gravado: null })).toEqual({ language: "en" });
    expect(decidirGravacaoDoIdioma({ modo: "editar", escolha: ["pt"], gravado: "pt+en" })).toEqual({ language: null });
  });
});

describe("gravarIdiomaDaProposta", () => {
  it("escreve só a coluna language, na proposta certa, com o contexto de auditoria", async () => {
    const r = await gravarIdiomaDaProposta("p1", "pt+en", "u1");
    expect(r).toEqual({ ok: true });
    expect(atualizar).toHaveBeenCalledTimes(1);
    expect(atualizar).toHaveBeenCalledWith("proposals", { language: "pt+en" }, "id", "p1");
    expect(rpc).toHaveBeenCalledWith("set_audit_context", { p_user_id: "u1", p_source: "ui" });
  });

  it("erro devolvido pela base: não rebenta, diz que falhou", async () => {
    estado.erro = { message: "new row violates check constraint" };
    const r = await gravarIdiomaDaProposta("p1", "en", "u1");
    expect(r.ok).toBe(false);
  });

  it("exceção (rede): não rebenta, diz que falhou", async () => {
    estado.lanca = true;
    const r = await gravarIdiomaDaProposta("p1", "en", "u1");
    expect(r.ok).toBe(false);
  });
});

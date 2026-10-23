// `pessoas.delete` para o lixo de negócios (com o âmbito que a base decide) e a lista de comerciais para a edição, pelo mesmo caminho da página de Leads.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { montarHook, ORG } from "./fichaTestUtil";
import { chavesNovaLead } from "./novaLead/useDadosNovaLead";
import { chaveComerciaisNegocio, useComerciaisNegocio } from "./useComerciaisNegocio";
import { usePodeApagarNegocios } from "./usePodeApagarNegocios";

const { escopo, lerMock } = vi.hoisted(() => ({ escopo: vi.fn(), lerMock: vi.fn() }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => escopo() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./novaLead/comerciaisNovaLead", () => ({ lerComerciais: (...args: unknown[]) => lerMock(...args) }));

beforeEach(() => { escopo.mockReset(); lerMock.mockReset(); });

describe("usePodeApagarNegocios", () => {
  it.each([["ORG", true], ["TEAM", true], ["OWNED", true], ["NONE", false]])("o âmbito %s dá %s", (nivel, esperado) => {
    escopo.mockReturnValue({ getPermissionScope: (codigo: string) => (codigo === "pessoas.delete" ? nivel : "NONE") });
    expect(renderHook(() => usePodeApagarNegocios()).result.current).toBe(esperado);
  });

  it("pergunta pela permissão pessoas.delete, e não por outra", () => {
    const pergunta = vi.fn(() => "NONE");
    escopo.mockReturnValue({ getPermissionScope: pergunta });
    renderHook(() => usePodeApagarNegocios());
    expect(pergunta).toHaveBeenCalledWith("pessoas.delete");
  });

  it("um contexto sem a função (ainda a carregar, ou um simulado parcial) não rebenta e dá falso", () => {
    escopo.mockReturnValue({ anewUserId: "u1" });
    expect(renderHook(() => usePodeApagarNegocios()).result.current).toBe(false);
  });
});

describe("useComerciaisNegocio", () => {
  it("partilha a cache com o painel «Nova lead» (a mesma chave)", () => {
    expect(chaveComerciaisNegocio(ORG)).toEqual(chavesNovaLead.comerciais(ORG));
    expect(chaveComerciaisNegocio(null)).toEqual(chavesNovaLead.comerciais(null));
  });

  const LIDOS = { users: [{ id: "u2", name: "Rita", districts: [], org_ids: [] }, { id: "u1", name: "Ana", districts: [], org_ids: [] }], tree: [] };

  it("lê os comerciais da organização como a página de Leads e dá-os por nome", async () => {
    lerMock.mockResolvedValue(LIDOS);
    const { result } = montarHook(() => useComerciaisNegocio(true), undefined);
    await waitFor(() => expect(result.current.comerciais).toHaveLength(2));
    expect(lerMock).toHaveBeenCalledWith(ORG);
    expect(result.current.comerciais).toEqual([{ id: "u1", nome: "Ana" }, { id: "u2", nome: "Rita" }]);
  });

  it("só lê com o diálogo aberto", async () => {
    lerMock.mockResolvedValue(LIDOS);
    montarHook(() => useComerciaisNegocio(false), undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(lerMock).not.toHaveBeenCalled();
  });

  it("fora do modo real não lê", async () => {
    montarHook(() => useComerciaisNegocio(true), undefined, { fonte: { modo: "exemplo" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(lerMock).not.toHaveBeenCalled();
  });

  it("uma falha diz que falhou (a lista vazia não quer dizer que não haja comerciais) e repete", async () => {
    lerMock.mockRejectedValueOnce(new Error("x")).mockRejectedValueOnce(new Error("x")).mockResolvedValue(LIDOS);
    const { result } = montarHook(() => useComerciaisNegocio(true), undefined);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.comerciais).toEqual([]);
    result.current.repetir();
    await waitFor(() => expect(result.current.comerciais).toHaveLength(2));
  });
});

/**
 * O NIF, a morada e a organizacao-mae de cada organizacao da arvore: as regras de montagem (puras) e a leitura, com o
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  falharTabela: null as string | null,
  tabelas: {} as Record<string, unknown[]>,
  pedidos: [] as string[],
}));
const captureFlowError = vi.hoisted(() => vi.fn());
/** A mesma referencia em todas as renderizacoes, como o estado do hook real. */
const ORG_IDS = vi.hoisted(() => ["org-1", "org-2"]);

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/hooks/useDescendantOrgIds", () => ({ useDescendantOrgIds: () => ({ orgIds: ORG_IDS, loading: false }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "Falhou a leitura" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      estado.pedidos.push(tabela);
      const resposta = () =>
        Promise.resolve(
          estado.falharTabela === tabela
            ? { data: null, error: { message: "rede" } }
            : { data: estado.tabelas[tabela] ?? [], error: null },
        );
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.in = () => q;
      q.is = () => q;
      q.order = () => resposta();
      q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => resposta().then(ok, ko);
      return q;
    },
  },
}));

import {
  juntarMorada,
  montarDadosDasOrganizacoes,
  nifDosMetadados,
  useDadosDasOrganizacoesDaArvore,
} from "@/hooks/useDadosDasOrganizacoesDaArvore";

beforeEach(() => {
  estado.falharTabela = null;
  estado.pedidos = [];
  captureFlowError.mockReset();
  estado.tabelas = {
    anew_organizations: [{ id: "org-1", metadata: { vat: " 500100200 " } }, { id: "org-2", metadata: { nif: "500300400" } }],
    anew_hierarchy: [{ child_org_id: "org-2", parent_org_id: "org-1" }, { child_org_id: "org-1", parent_org_id: "org-0" }],
    anew_org_addresses: [
      { org_id: "org-1", is_fiscal: false, anew_addresses: { street: "Rua Velha", number: "9", postal_code: "4000-001", city: "Porto" } },
      { org_id: "org-1", is_fiscal: true, anew_addresses: { street: "Rua Fiscal", number: null, postal_code: "4000-002", city: "Porto" } },
    ],
  };
});

describe("juntarMorada e nifDosMetadados", () => {
  it("junta rua, numero, codigo postal e cidade, sem partes vazias", () => {
    expect(juntarMorada({ street: "Rua A", number: "", postal_code: "4000-001", city: "Porto" })).toBe("Rua A, 4000-001, Porto");
    expect(juntarMorada(null)).toBe("");
  });

  it("le o NIF dos metadados (vat ou nif), aparado, e nada de lixo", () => {
    expect(nifDosMetadados({ vat: " 123 " })).toBe("123");
    expect(nifDosMetadados({ nif: 456 })).toBe("456");
    expect(nifDosMetadados(null)).toBe("");
    expect(nifDosMetadados("texto")).toBe("");
    expect(nifDosMetadados({})).toBe("");
  });
});

describe("montarDadosDasOrganizacoes", () => {
  it("prefere a morada fiscal, ignora a mae fora da arvore e deixa vazio o que a base nao tem", () => {
    const m = montarDadosDasOrganizacoes(
      ["org-1", "org-2"],
      estado.tabelas.anew_organizations as never,
      estado.tabelas.anew_hierarchy as never,
      estado.tabelas.anew_org_addresses as never,
    );
    expect(m.get("org-1")).toEqual({ id: "org-1", nif: "500100200", morada: "Rua Fiscal, 4000-002, Porto", paiId: null });
    expect(m.get("org-2")).toEqual({ id: "org-2", nif: "500300400", morada: "", paiId: "org-1" });
  });

  it("aceita a morada devolvida como lista de uma linha e ignora as vazias", () => {
    const m = montarDadosDasOrganizacoes(
      ["org-1"], [], [],
      [
        { org_id: "org-1", is_fiscal: true, anew_addresses: [{ street: "Rua L", city: "Faro" }] },
        { org_id: "org-1", is_fiscal: true, anew_addresses: {} },
      ],
    );
    expect(m.get("org-1")!.morada).toBe("Rua L, Faro");
  });
});

describe("useDadosDasOrganizacoesDaArvore", () => {
  it("le as tres tabelas da arvore e entrega os dados por organizacao", async () => {
    const { result } = renderHook(() => useDadosDasOrganizacoesDaArvore());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(new Set(estado.pedidos)).toEqual(new Set(["anew_organizations", "anew_hierarchy", "anew_org_addresses"]));
    expect(result.current.dados.get("org-2")).toMatchObject({ nif: "500300400", paiId: "org-1" });
    expect(result.current.error).toBeNull();
  });

  it("uma leitura que falha sobe como erro (nao como organizacoes sem NIF) e fica reportada", async () => {
    estado.falharTabela = "anew_hierarchy";
    const { result } = renderHook(() => useDadosDasOrganizacoesDaArvore());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Falhou a leitura");
    expect(result.current.dados.size).toBe(0);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});

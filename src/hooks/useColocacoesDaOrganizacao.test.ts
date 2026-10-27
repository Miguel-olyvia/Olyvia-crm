import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MENSAGEM_NAO_GRAVADA, useColocacoesDaOrganizacao } from "@/hooks/useColocacoesDaOrganizacao";

const chamadas: { op: string; args: unknown[] }[] = [];
let linhasDaBase: unknown[] = [];
let erroLeitura: unknown = null;
let erroEscrita: { quando: "update" | "insert"; erro: unknown } | null = null;
let linhasDoUpdate: unknown[] = [{ id: "c1" }];
let leituraPendente: Promise<void> | null = null;
let linhasPorOrg: Record<string, unknown[]> = {};
let orgActiva = "org-1";

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: orgActiva } }) }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "autor-1" }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigavel" }));
vi.mock("@/lib/hr/afectacoes", () => ({ dataDeHojeISO: () => "2026-10-26" }));
vi.mock("@/lib/hr/hrDb", () => ({
  isPermissionError: () => false,
  hrFrom: () => {
    const leitura: Record<string, unknown> = {};
    let orgDaConsulta = "";
    for (const op of ["eq", "is", "lte"]) {
      leitura[op] = (...args: unknown[]) => {
        chamadas.push({ op, args });
        if (op === "eq" && args[0] === "organization_id") orgDaConsulta = String(args[1]);
        return leitura;
      };
    }
    leitura.or = (...args: unknown[]) => {
      chamadas.push({ op: "or", args });
      const resposta = { data: erroLeitura ? null : (linhasPorOrg[orgDaConsulta] ?? linhasDaBase), error: erroLeitura };
      return leituraPendente ? leituraPendente.then(() => resposta) : Promise.resolve(resposta);
    };
    return {
      select: () => leitura,
      update: (v: unknown) => ({
        eq: (...a: unknown[]) => {
          chamadas.push({ op: "update", args: [v, ...a] });
          return {
            select: (colunas: string) => {
              chamadas.push({ op: "select", args: [colunas] });
              const falhou = erroEscrita?.quando === "update";
              return Promise.resolve({ data: falhou ? null : linhasDoUpdate, error: falhou ? erroEscrita!.erro : null });
            },
          };
        },
      }),
      insert: (v: unknown) => {
        chamadas.push({ op: "insert", args: [v] });
        return Promise.resolve({ error: erroEscrita?.quando === "insert" ? erroEscrita.erro : null });
      },
    };
  },
}));

const linha = (o: Record<string, unknown> = {}) => ({
  id: "c1", pessoa_id: "p1", organization_id: "org-1", organograma_node_id: "n1",
  valido_de: "2026-01-01", valido_ate: null, motivo: null, ...o,
});

const escritas = () => chamadas.filter((c) => c.op === "update" || c.op === "insert");

beforeEach(() => {
  chamadas.length = 0;
  linhasDaBase = [linha()];
  erroLeitura = null;
  erroEscrita = null;
  linhasDoUpdate = [{ id: "c1" }];
  leituraPendente = null;
  linhasPorOrg = {};
  orgActiva = "org-1";
});

describe("useColocacoesDaOrganizacao", () => {
  it("le so a organizacao activa, sem apagadas e so o que esta em vigor", async () => {
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chamadas).toContainEqual({ op: "eq", args: ["organization_id", "org-1"] });
    expect(chamadas).toContainEqual({ op: "is", args: ["deleted_at", null] });
    expect(chamadas).toContainEqual({ op: "lte", args: ["valido_de", "2026-10-26"] });
    expect(chamadas).toContainEqual({ op: "or", args: ["valido_ate.is.null,valido_ate.gte.2026-10-26"] });
    expect(result.current.vigentes.get("p1")?.id).toBe("c1");
  });

  it("uma falha de leitura expoe o erro em vez de passar por lista vazia verdadeira", async () => {
    erroLeitura = new Error("boom");
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erro).toBe(true);
    expect(result.current.recusado).toBe(false);
    expect(result.current.vigentes.size).toBe(0);
  });

  it("uma falha transitoria na recarga mantem as ligacoes que ja havia e marca o erro", async () => {
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.erro).toBe(false);
    erroLeitura = new Error("boom");
    await act(async () => {
      await result.current.recarregar();
    });
    expect(result.current.erro).toBe(true);
    expect(result.current.vigentes.get("p1")?.id).toBe("c1");
    erroLeitura = null;
    await act(async () => {
      await result.current.recarregar();
    });
    expect(result.current.erro).toBe(false);
  });

  it("ignora a resposta de uma organizacao que ja nao e a activa", async () => {
    linhasPorOrg = {
      "org-1": [linha({ id: "velha", pessoa_id: "p-velha" })],
      "org-2": [linha({ id: "nova", pessoa_id: "p-nova", organization_id: "org-2" })],
    };
    let libertar: () => void = () => undefined;
    leituraPendente = new Promise<void>((resolve) => {
      libertar = resolve;
    });
    const { result, rerender } = renderHook(() => useColocacoesDaOrganizacao());
    orgActiva = "org-2";
    rerender();
    libertar();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.vigentes.has("p-nova")).toBe(true);
    expect(result.current.vigentes.has("p-velha")).toBe(false);
  });

  it("guardar numa pessoa sem ligacao so insere", async () => {
    linhasDaBase = [];
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.guardar({ pessoaId: "p9", nodeId: "n2", desde: "2026-10-26", motivo: "entrada" });
    });
    expect(r).toEqual({ tipo: "ok", operacao: "ligar" });
    expect(escritas()).toHaveLength(1);
    expect(escritas()[0]).toEqual({
      op: "insert",
      args: [{
        pessoa_id: "p9", organization_id: "org-1", organograma_node_id: "n2", valido_de: "2026-10-26",
        valido_ate: null, motivo: "entrada", created_by: "autor-1", updated_by: "autor-1",
      }],
    });
  });

  it("guardar numa pessoa ligada fecha a linha na vespera e depois insere a nova", async () => {
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.guardar({ pessoaId: "p1", nodeId: "n2", desde: "2026-10-26", motivo: null });
    });
    expect(r).toEqual({ tipo: "ok", operacao: "alterar" });
    expect(escritas().map((c) => c.op)).toEqual(["update", "insert"]);
    expect(escritas()[0]!.args).toEqual([{ valido_ate: "2026-10-25", updated_by: "autor-1" }, "id", "c1"]);
  });

  it("se o fecho da linha antiga nao altera nenhuma linha (RLS), nao insere a nova e diz que nada foi gravado", async () => {
    linhasDoUpdate = [];
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.guardar({ pessoaId: "p1", nodeId: "n2", desde: "2026-10-26", motivo: null });
    });
    expect(r).toEqual({ tipo: "erro", mensagem: MENSAGEM_NAO_GRAVADA, codigo: "base" });
    expect(escritas().map((c) => c.op)).toEqual(["update"]);
  });

  it("um inicio nao posterior ao da linha em vigor nao escreve nada", async () => {
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.guardar({ pessoaId: "p1", nodeId: "n2", desde: "2026-01-01", motivo: null });
    });
    expect(r).toEqual({ tipo: "erro", mensagem: null, codigo: "inicioNaoPosterior" });
    expect(escritas()).toHaveLength(0);
  });

  it("se o insert falha depois de fechar, devolve a mensagem amigavel e recarrega", async () => {
    erroEscrita = { quando: "insert", erro: new Error("recusado") };
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const leiturasAntes = chamadas.filter((c) => c.op === "or").length;
    let r: unknown;
    await act(async () => {
      r = await result.current.guardar({ pessoaId: "p1", nodeId: "n2", desde: "2026-10-26", motivo: null });
    });
    expect(r).toEqual({ tipo: "erro", mensagem: "mensagem amigavel", codigo: "base" });
    expect(chamadas.filter((c) => c.op === "or").length).toBe(leiturasAntes + 1);
  });

  it("desligar fecha a linha em vigor na vespera, com o motivo, e a pessoa deixa de estar em vigor", async () => {
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.desligar("p1", "Fim de contrato");
    });
    expect(r).toEqual({ tipo: "ok", operacao: "desligar" });
    expect(escritas()).toEqual([
      { op: "update", args: [{ valido_ate: "2026-10-25", motivo: "Fim de contrato", updated_by: "autor-1" }, "id", "c1"] },
    ]);
    // Depois de recarregar, a base ja nao devolve a linha fechada ontem (`valido_ate.gte.hoje`): a pessoa sai da arvore.
    linhasDaBase = [];
    await act(async () => {
      await result.current.recarregar();
    });
    expect(result.current.vigentes.has("p1")).toBe(false);
  });

  it("desligar uma ligacao que comecou hoje fecha no proprio dia (a base exige valido_ate >= valido_de)", async () => {
    linhasDaBase = [linha({ valido_de: "2026-10-26" })];
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.desligar("p1", "Erro de ligacao");
    });
    expect(escritas()[0]!.args[0]).toMatchObject({ valido_ate: "2026-10-26" });
  });

  it("desligar sem nenhuma linha alterada (RLS) devolve erro e nao diz que desligou", async () => {
    linhasDoUpdate = [];
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.desligar("p1", "Fim de contrato");
    });
    expect(r).toEqual({ tipo: "erro", mensagem: MENSAGEM_NAO_GRAVADA, codigo: "base" });
  });

  it("desligar uma pessoa sem ligacao nao escreve", async () => {
    const { result } = renderHook(() => useColocacoesDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let r: unknown;
    await act(async () => {
      r = await result.current.desligar("p-nao-ligada", "x motivo");
    });
    expect(r).toEqual({ tipo: "erro", mensagem: null, codigo: "naoLigada" });
    expect(escritas()).toHaveLength(0);
  });
});

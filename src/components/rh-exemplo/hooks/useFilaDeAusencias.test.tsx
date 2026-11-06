// O hook da fila de ausências: pessoas (não pedidos), chefia e RH separadas, e uma releitura que falha não faz desaparecer
// o que já se sabia (a fonte passa a «erro» e a lista nunca diz «ninguém tem nada por decidir»).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { AusenciaPedido } from "@/types/hrAusencias";

const estado = vi.hoisted(() => ({
  dados: {} as Record<string, unknown>,
  recarregar: vi.fn(async () => undefined),
}));

vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org1" } }) }));
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => ({ regras: [], estado: "ok", isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useAusenciasTipos", () => ({
  useAusenciasTipos: () => ({ loading: false, porId: new Map([["ferias", { id: "ferias", codigo: "x", nome: "Férias", cor: null }]]) }),
}));
vi.mock("@/components/rh-exemplo/hooks/useAusenciasDaOrganizacao", () => ({
  useAusenciasDaOrganizacao: () => estado.dados,
}));

import { useFilaDeAusencias } from "./useFilaDeAusencias";

const pedido = (id: string, pessoa: string, estadoDoPedido: AusenciaPedido["estado"], inicio = "2026-11-10"): AusenciaPedido =>
  ({ id, pessoa_id: pessoa, tipo_id: "ferias", data_inicio: inicio, data_fim: inicio, dias_solicitados: 1, estado: estadoDoPedido, aprovador_chefia_pessoa_id: "c", substitui_pedido_id: null }) as AusenciaPedido;

const definir = (parcial: Record<string, unknown>) => {
  estado.dados = { pedidos: [], pendentes: [], loading: false, recusado: false, erro: false, recarregar: estado.recarregar, ...parcial };
};

const NOMES = new Map([["ana", "Ana Silva"], ["rui", "Rui Matos"]]);
const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;
const montar = (permissoes = { aprovarChefia: true, aprovarRh: true }) => renderHook(() => useFilaDeAusencias(NOMES, permissoes), { wrapper });

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  estado.recarregar.mockClear();
});

describe("useFilaDeAusencias", () => {
  it("conta PESSOAS, não pedidos, e o contador sai do mesmo agrupamento da lista", () => {
    definir({ pendentes: [pedido("1", "ana", "pendente_chefia"), pedido("2", "ana", "pendente_rh"), pedido("3", "rui", "pendente_chefia")] });
    const { result } = montar();
    expect(result.current.fila.pessoas.map((p) => [p.nome, p.total])).toEqual([["Ana Silva", 2], ["Rui Matos", 1]]);
    expect(result.current.fila.contador).toBe("2");
    expect(result.current.fila.totalPendencias).toBe(3);
    expect(result.current.fila.lidaComSucesso).toBe(true);
    expect(result.current.fila.fontes).toEqual({ ausencias: "ok" });
  });

  it("chefia e RH continuam separadas: cada pedido só entra para quem decide o passo em que está", () => {
    definir({ pendentes: [pedido("1", "ana", "pendente_chefia"), pedido("2", "rui", "pendente_rh")] });
    expect(montar({ aprovarChefia: true, aprovarRh: false }).result.current.fila.pessoas.map((p) => p.nome)).toEqual(["Ana Silva"]);
    expect(montar({ aprovarChefia: false, aprovarRh: true }).result.current.fila.pessoas.map((p) => p.nome)).toEqual(["Rui Matos"]);
  });

  it("o nome do tipo de ausência vai em cada item", () => {
    definir({ pendentes: [pedido("1", "ana", "pendente_chefia")] });
    const item = montar().result.current.fila.pessoas[0].itens[0];
    expect(item.tipo === "ausencia" && item.nomeDoTipo).toBe("Férias");
  });

  it("sem permissão de leitura a fonte diz «recusado» e a lista nunca diz «ninguém»", () => {
    definir({ recusado: true });
    const { fila } = montar().result.current;
    expect(fila.fontes.ausencias).toBe("recusado");
    expect(fila.lidaComSucesso).toBe(false);
  });

  it("uma releitura que falha MANTÉM os pedidos da última leitura boa e a fonte passa a «erro»", () => {
    definir({ pendentes: [pedido("1", "ana", "pendente_chefia")] });
    const { result, rerender } = montar();
    expect(result.current.fila.pessoas).toHaveLength(1);
    // A leitura seguinte falha: o hook da organização devolve a lista vazia e `erro`.
    definir({ pendentes: [], erro: true });
    act(() => rerender());
    expect(result.current.fila.pessoas.map((p) => p.nome)).toEqual(["Ana Silva"]);
    expect(result.current.fila.fontes.ausencias).toBe("erro");
    expect(result.current.fila.lidaComSucesso).toBe(false);
    // E quando volta a ler bem, vale a leitura nova.
    definir({ pendentes: [] });
    act(() => rerender());
    expect(result.current.fila.pessoas).toEqual([]);
    expect(result.current.fila.fontes.ausencias).toBe("ok");
  });

  it("falha logo na primeira leitura: lista vazia mas com erro (nunca «vazio»)", () => {
    definir({ erro: true });
    const { fila } = montar().result.current;
    expect(fila.pessoas).toEqual([]);
    expect(fila.fontes.ausencias).toBe("erro");
    expect(fila.lidaComSucesso).toBe(false);
  });

  it("só a primeira leitura mostra o esqueleto; as seguintes (depois de decidir) são silenciosas", () => {
    definir({ loading: true });
    const { result, rerender } = montar();
    expect(result.current.fila.aCarregar).toBe(true);
    definir({ pendentes: [pedido("1", "ana", "pendente_chefia")] });
    act(() => rerender());
    expect(result.current.fila.aCarregar).toBe(false);
    definir({ loading: true, pendentes: [pedido("1", "ana", "pendente_chefia")] });
    act(() => rerender());
    expect(result.current.fila.aCarregar).toBe(false);
    expect(result.current.fila.pessoas).toHaveLength(1);
  });

  it("recarregar relê os pedidos da organização", async () => {
    definir({});
    const { result } = montar();
    await act(async () => result.current.fila.recarregar());
    expect(estado.recarregar).toHaveBeenCalledTimes(1);
  });
});

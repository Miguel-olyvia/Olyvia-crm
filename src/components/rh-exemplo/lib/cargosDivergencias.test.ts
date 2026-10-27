// Retribuições divergentes do cargo. A função pura (`retribuicoesDivergentes`) trabalha sobre as fichas de exemplo; os hooks
// de /rh-exemplo (`useCargos`, `useCargosRetribuicoesDivergentes`) delegam nos hooks reais, que falam com a base por RPC:
// aqui o Supabase é simulado e prova-se o que se pede e o que se mostra. A regra em si (o trigger de igualdade salarial e
// o recálculo das versões) é da base.
import { createElement, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

import { ORGANIZACAO_TESTE, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useCargosRetribuicoesDivergentes } from "@/components/rh-exemplo/hooks/useCargosRetribuicoesDivergentes";
import { retribuicoesDivergentes } from "./cargosDivergencias";

function Envolvente({ children }: { children: ReactNode }) {
  const [cliente] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return createElement(QueryClientProvider, { client: cliente }, children);
}
const montar = <T,>(hook: () => T) => renderHook(hook, { wrapper: Envolvente });
const rpcsChamadas = (nome: string): unknown[] => rhTeste.chamadas.filter((c) => c.rpc === nome).map((c) => c.args);

beforeEach(() => {
  repor();
  reporRhTeste();
});

describe("retribuições divergentes do cargo (função pura sobre as fichas de exemplo)", () => {
  it("os dados de exemplo nascem alinhados: zero divergências", () => {
    const e = lerEstado();
    expect(retribuicoesDivergentes(e.fichas, e.cargos, e.cargosPeriodos, hojeIso())).toEqual([]);
  });

  it("uma retribuição escrita à mão com outro valor aparece, com o valor esperado do cargo", () => {
    atualizarFicha("p-tiago", (f) => ({ ...f, retribuicoes: f.retribuicoes.map((r) => ({ ...r, valor_base: r.valor_base + 50 })) }));
    const e = lerEstado();
    const divergencias = retribuicoesDivergentes(e.fichas, e.cargos, e.cargosPeriodos, hojeIso());
    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({ pessoa_id: "p-tiago" });
    expect(divergencias[0].valor_base).toBe(divergencias[0].esperado_valor_base + 50);
  });
});

describe("useCargosRetribuicoesDivergentes (hook real sobre o Supabase simulado)", () => {
  it("pede à base o relatório da organização activa e mostra o que ela devolve", async () => {
    const linha = {
      pessoa_id: "p-tiago", pessoa_nome: "Tiago", cargo_id: "c1", cargo_nome: "Técnico", retribuicao_id: "r1",
      valor_base: 1050, periodicidade: "mensal", valido_de: "2026-01-01", esperado_valor_base: 1000, esperado_periodicidade: "mensal",
    };
    rhTeste.rpcs["hr_cargos_retribuicoes_divergentes"] = { data: [linha], error: null };
    const { result } = montar(() => useCargosRetribuicoesDivergentes());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.divergencias).toEqual([linha]);
    expect(rpcsChamadas("hr_cargos_retribuicoes_divergentes")).toEqual([{ p_organization_id: ORGANIZACAO_TESTE.id }]);
  });

  it("sem divergências a lista é vazia; uma recusa por permissão também (não é erro); sem organização não pede nada", async () => {
    const vazio = montar(() => useCargosRetribuicoesDivergentes());
    await waitFor(() => expect(vazio.result.current.isLoading).toBe(false));
    expect(vazio.result.current.divergencias).toEqual([]);

    rhTeste.rpcs["hr_cargos_retribuicoes_divergentes"] = { data: null, error: { code: "42501", message: "permission denied" } };
    const recusado = montar(() => useCargosRetribuicoesDivergentes());
    await waitFor(() => expect(recusado.result.current.isLoading).toBe(false));
    expect(recusado.result.current.divergencias).toEqual([]);
    expect(recusado.result.current.error).toBeNull();

    reporRhTeste();
    rhTeste.empresa = null;
    const semOrganizacao = montar(() => useCargosRetribuicoesDivergentes());
    expect(semOrganizacao.result.current.divergencias).toEqual([]);
    expect(rpcsChamadas("hr_cargos_retribuicoes_divergentes")).toEqual([]);
  });

  it("uma falha que não é de permissão chega ao ecrã como erro, em vez de passar por «zero divergências»", async () => {
    rhTeste.rpcs["hr_cargos_retribuicoes_divergentes"] = { data: null, error: { code: "XX000", message: "falhou" } };
    const { result } = montar(() => useCargosRetribuicoesDivergentes());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.divergencias).toEqual([]);
  });
});

describe("useCargos.definirSalario (hook real sobre o Supabase simulado)", () => {
  it("subir o salário do cargo é uma RPC com a data de efeito e o motivo; o recálculo de quem tem o cargo é da base", async () => {
    const resposta = { periodo_id: "per-1", pessoas_actualizadas: 3, pessoas_sem_retribuicao: 0 };
    rhTeste.rpcs["rpc_hr_cargo_definir_salario"] = { data: resposta, error: null };
    const { result } = montar(() => useCargos());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let devolvido: unknown = null;
    await act(async () => {
      devolvido = await result.current.definirSalario("c1", 2000, "mensal", hojeIso(), "Revisão anual");
    });
    expect(devolvido).toEqual(resposta);
    expect(rpcsChamadas("rpc_hr_cargo_definir_salario")).toEqual([
      { p_cargo_id: "c1", p_salario_base: 2000, p_periodicidade: "mensal", p_valido_de: hojeIso(), p_motivo: "Revisão anual" },
    ]);
  });

  it("uma resposta sem o resultado esperado não conta como sucesso, e a recusa da base sobe tal como veio", async () => {
    const { result } = montar(() => useCargos());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // A omissão do simulado é `data` nulo e sem erro: não é um resultado válido.
    await act(async () => {
      await expect(result.current.definirSalario("c1", 2000, "mensal", hojeIso(), "x")).rejects.toThrow(/resposta sem o resultado esperado/);
    });
    rhTeste.rpcs["rpc_hr_cargo_definir_salario"] = { data: null, error: { code: "HRC01", message: "recusado" } };
    await act(async () => {
      await expect(result.current.definirSalario("c1", 2000, "mensal", hojeIso(), "x")).rejects.toMatchObject({ code: "HRC01" });
    });
  });
});

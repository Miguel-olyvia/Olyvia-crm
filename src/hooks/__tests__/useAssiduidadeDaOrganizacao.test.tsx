/**
 * `useAssiduidadeDaOrganizacao`: o mes de assiduidade da organizacao (duas vistas + a RPC dos desvios).
 * `hrFrom`/`hrRpc` simulados; nada toca em base nenhuma.
 *
 * O que estes testes guardam:
 *  - uma releitura depois de gravar (`recarregar`) e SILENCIOSA: `loading` nunca volta a true, senao o ecra
 *    desmonta a arvore inteira (separador activo, formularios abertos, foco);
 *  - so a resposta do pedido mais recente escreve no estado (mudar de mes durante uma releitura);
 *  - uma falha ou recusa de UMA leitura fica marcada por satelite, e nao passa por "nao ha nada".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike", name: "Nike" } }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

type Resposta = { data: unknown; error: unknown };
type Pendente = { resolver: (r: Resposta) => void };

let vistas: Record<string, Resposta | Promise<Resposta>> = {};
let respostaDesvios: Resposta | ((args: Record<string, unknown>) => Promise<Resposta>) = { data: [], error: null };

function cadeia(vista: string) {
  const alvo = () => Promise.resolve(vistas[vista] ?? { data: [], error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => alvo(),
  };
  return chain;
}

vi.mock("@/lib/hr/hrDb", () => ({
  hrFrom: (vista: string) => cadeia(vista),
  hrRpc: (_fn: string, args: Record<string, unknown>) =>
    typeof respostaDesvios === "function" ? respostaDesvios(args) : Promise.resolve(respostaDesvios),
  isPermissionError: (erro: unknown) =>
    !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));

import { useAssiduidadeDaOrganizacao } from "@/hooks/useAssiduidadeDaOrganizacao";

const JANELA = { de: "2026-10-01", ate: "2026-10-31" };
const RECUSA = { code: "42501", message: "insufficient_privilege" };
const FALHA = { code: "57014", message: "statement timeout" };

function desvio(pessoa: string) {
  return {
    organization_id: "org-nike",
    pessoa_id: pessoa,
    data: "2026-10-06",
    tipo: "planeado_sem_realizado",
    hora_inicio: "09:00:00",
    hora_fim: "13:00:00",
    minutos: 240,
    planeado_id: null,
    local_id: null,
    referencia_id: null,
    detalhe: null,
  };
}

beforeEach(() => {
  vistas = {};
  respostaDesvios = { data: [], error: null };
});

describe("useAssiduidadeDaOrganizacao", () => {
  it("recarregar nao volta a pôr loading a true (a arvore do ecra nao pode desmontar)", async () => {
    respostaDesvios = { data: [desvio("p1")], error: null };
    const vistos: boolean[] = [];
    const { result } = renderHook(() => {
      const hook = useAssiduidadeDaOrganizacao(JANELA);
      vistos.push(hook.loading);
      return hook;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vistos.length = 0;

    respostaDesvios = { data: [desvio("p1"), desvio("p2")], error: null };
    await act(async () => {
      await result.current.recarregar();
    });

    expect(result.current.desvios).toHaveLength(2);
    expect(vistos.length).toBeGreaterThan(0);
    expect(vistos).not.toContain(true);
  });

  it("uma resposta antiga nao sobrescreve a do pedido mais recente", async () => {
    const pendentes: Pendente[] = [];
    respostaDesvios = () => new Promise<Resposta>((resolver) => pendentes.push({ resolver }));

    const { result } = renderHook(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(pendentes).toHaveLength(1));

    // Segundo pedido (releitura) arranca antes de o primeiro responder.
    let releitura: Promise<void> | undefined;
    act(() => {
      releitura = Promise.resolve(result.current.recarregar());
    });
    await waitFor(() => expect(pendentes).toHaveLength(2));

    // O mais recente responde primeiro; o antigo chega depois e tem de ser ignorado.
    await act(async () => {
      pendentes[1].resolver({ data: [desvio("recente")], error: null });
      await releitura;
    });
    await act(async () => {
      pendentes[0].resolver({ data: [desvio("antigo")], error: null });
      await Promise.resolve();
    });

    expect(result.current.desvios.map((d) => d.pessoa_id)).toEqual(["recente"]);
    expect(result.current.loading).toBe(false);
  });

  it("uma falha que nao e de permissao na RPC dos desvios fica marcada, sem passar por vazio", async () => {
    respostaDesvios = { data: null, error: FALHA };
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.desviosErro).toBe(true);
    expect(result.current.desviosRecusado).toBe(false);
    expect(result.current.faltasErro).toBe(false);
    expect(result.current.recusado).toBe(false);
    expect(result.current.desvios).toEqual([]);
  });

  it("so a RPC dos desvios recusada: marca desviosRecusado, mesmo com o recusado global a false", async () => {
    respostaDesvios = { data: null, error: RECUSA };
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.desviosRecusado).toBe(true);
    expect(result.current.desviosErro).toBe(false);
    expect(result.current.faltasRecusado).toBe(false);
    expect(result.current.recusado).toBe(false);
  });

  it("as faltas falhadas ficam marcadas por si, sem afectar os desvios", async () => {
    vistas = { v_hr_faltas_em_vigor: { data: null, error: FALHA } };
    respostaDesvios = { data: [desvio("p1")], error: null };
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.faltasErro).toBe(true);
    expect(result.current.desviosErro).toBe(false);
    expect(result.current.desvios).toHaveLength(1);
  });

  it("as tres leituras recusadas: recusado global a true", async () => {
    vistas = {
      v_hr_horario_realizado_em_vigor: { data: null, error: RECUSA },
      v_hr_faltas_em_vigor: { data: null, error: RECUSA },
    };
    respostaDesvios = { data: null, error: RECUSA };
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recusado).toBe(true);
  });
});

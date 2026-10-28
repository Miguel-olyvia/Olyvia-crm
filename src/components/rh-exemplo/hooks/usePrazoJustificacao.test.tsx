// O wrapper do prazo para justificar: entrega aos ecras de /rh-exemplo o numero de dias uteis da organizacao e a forma de o
// gravar, a partir do hook real (simulado aqui; a prova dele esta em src/hooks/__tests__/useRegrasAssiduidade.test.tsx).
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const real = vi.hoisted(() => ({
  estado: {
    organizationId: "org-nike" as string | null,
    prazoJustificacaoDias: 5,
    gravado: false,
    podeAlterar: false,
    isLoading: false,
    leitura: { falhou: false, recusado: false, erro: false, indisponivel: false },
    isSaving: false,
  },
  guardar: vi.fn(async (_dias: number) => ({ erro: null as string | null })),
  recarregar: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/useRegrasAssiduidade", () => ({
  useRegrasAssiduidade: () => ({ ...real.estado, guardar: real.guardar, recarregar: real.recarregar }),
}));

import { usePrazoJustificacao } from "./usePrazoJustificacao";

beforeEach(() => {
  real.estado.prazoJustificacaoDias = 5;
  real.estado.gravado = false;
  real.estado.podeAlterar = false;
  real.estado.isLoading = false;
  real.estado.isSaving = false;
  real.estado.leitura = { falhou: false, recusado: false, erro: false, indisponivel: false };
  real.guardar.mockClear();
  real.recarregar.mockClear();
});

describe("usePrazoJustificacao", () => {
  it("devolve os dias da organizacao, se esta gravado e se quem consulta pode alterar", () => {
    real.estado.prazoJustificacaoDias = 8;
    real.estado.gravado = true;
    real.estado.podeAlterar = true;
    const { result } = renderHook(() => usePrazoJustificacao());
    expect(result.current).toMatchObject({ dias: 8, gravado: true, podeAlterar: true, aGravar: false, aCarregar: false });
    expect(result.current.leitura.falhou).toBe(false);
  });

  it("com a leitura falhada os dias sao a omissao e a leitura diz porque (indisponivel, recusada ou erro)", () => {
    real.estado.leitura = { falhou: true, recusado: false, erro: false, indisponivel: true };
    const { result } = renderHook(() => usePrazoJustificacao());
    expect(result.current.dias).toBe(5);
    expect(result.current.leitura).toEqual({ falhou: true, recusado: false, erro: false, indisponivel: true });
    expect(result.current.podeAlterar).toBe(false);
  });

  it("gravar passa os dias ao hook real e devolve o resultado dele (a chave do erro, se houver)", async () => {
    const { result } = renderHook(() => usePrazoJustificacao());
    await expect(result.current.gravar(8)).resolves.toEqual({ erro: null });
    expect(real.guardar).toHaveBeenCalledWith(8);
    real.guardar.mockResolvedValueOnce({ erro: "rhRegrasAssid.erro.semPermissao" });
    await expect(result.current.gravar(9)).resolves.toEqual({ erro: "rhRegrasAssid.erro.semPermissao" });
  });

  it("recarregar manda reler a leitura, e o estado de a gravar e de a carregar passam", () => {
    real.estado.isSaving = true;
    real.estado.isLoading = true;
    const { result } = renderHook(() => usePrazoJustificacao());
    expect(result.current.aGravar).toBe(true);
    expect(result.current.aCarregar).toBe(true);
    result.current.recarregar();
    expect(real.recarregar).toHaveBeenCalledTimes(1);
  });
});

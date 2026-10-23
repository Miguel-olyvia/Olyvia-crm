// Uma falha numa releitura em segundo plano não apaga a lista boa: o erro só ocupa o ecrã quando não há nada para mostrar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { SubmissaoFicha } from "./adaptarSubmissoes";
import { captureMock, montarHook } from "./fichaTestUtil";
import { useSubmissoesPessoa } from "./useSubmissoesPessoa";

const lerMock = vi.hoisted(() => vi.fn());
vi.mock("./lerSubmissoesPessoa", () => ({ lerSubmissoesPessoa: (...args: unknown[]) => lerMock(...args) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const ID = "11111111-1111-4111-8111-111111111111";
const cartao = (sobre: Partial<SubmissaoFicha> = {}): SubmissaoFicha => ({
  chave: "submissao:s1", tipo: "submissao", id: "s1", criadoEm: "2026-10-12T09:00:00Z", campanha: null, origem: null, etapa: null, revisao: "pending",
  conflito: null, emailNaoGravado: null, telefoneNaoGravado: null, coincidencia: null, campos: [], ...sobre,
});

beforeEach(() => {
  lerMock.mockReset();
  captureMock.mockReset();
});

describe("useSubmissoesPessoa: releitura que falha", () => {
  it("com dados já lidos, uma releitura que falha mantém a lista, os pendentes e o estado «ok», e avisa que está desatualizada", async () => {
    lerMock.mockResolvedValueOnce([cartao()]);
    const { result } = montarHook(useSubmissoesPessoa, ID);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.desatualizado).toBe(false);
    lerMock.mockRejectedValue({ code: "57014" });
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(result.current.desatualizado).toBe(true));
    expect(result.current.estado).toBe("ok");
    expect(result.current.submissoes).toHaveLength(1);
    expect(result.current.pendentes).toBe(1);
  });

  it("depois de a releitura voltar a correr bem, deixa de estar desatualizada", async () => {
    lerMock.mockResolvedValueOnce([cartao()]);
    const { result } = montarHook(useSubmissoesPessoa, ID);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    lerMock.mockRejectedValue({ code: "57014" });
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(result.current.desatualizado).toBe(true));
    lerMock.mockResolvedValue([cartao(), cartao({ id: "s2", chave: "submissao:s2" })]);
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(result.current.submissoes).toHaveLength(2));
    expect(result.current.desatualizado).toBe(false);
  });

  it("sem nenhum dado lido, a falha continua a ser o estado de erro (e não «desatualizado»)", async () => {
    lerMock.mockRejectedValue({ code: "57014" });
    const { result } = montarHook(useSubmissoesPessoa, ID);
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.desatualizado).toBe(false);
  });
});

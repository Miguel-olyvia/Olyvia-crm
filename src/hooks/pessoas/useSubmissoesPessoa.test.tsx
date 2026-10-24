// O hook das submissões da ficha real: só lê em modo real, com organização e uma pessoa com forma de uuid; a chave leva organização e pessoa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { SubmissaoFicha } from "./adaptarSubmissoes";
import { captureMock, criarCliente, fonteReal, montarHook } from "./fichaTestUtil";
import { submissoesPessoaQueryKey, useSubmissoesPessoa } from "./useSubmissoesPessoa";

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

describe("useSubmissoesPessoa", () => {
  it("lê com a organização e a pessoa e devolve os cartões", async () => {
    lerMock.mockResolvedValue([cartao()]);
    const { result } = montarHook(useSubmissoesPessoa, ID);
    expect(result.current.estado).toBe("a-carregar");
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(lerMock).toHaveBeenCalledExactlyOnceWith("org-1", ID);
    expect(result.current.submissoes).toHaveLength(1);
  });

  it("conta como pendentes só as submissões por rever (as leads e as já revistas não)", async () => {
    lerMock.mockResolvedValue([
      cartao({ id: "a" }), cartao({ id: "b", chave: "submissao:b", revisao: "merged" }), cartao({ id: "c", chave: "lead:c", tipo: "lead", revisao: null }),
    ]);
    const { result } = montarHook(useSubmissoesPessoa, ID);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.submissoes).toHaveLength(3);
    expect(result.current.pendentes).toBe(1);
  });

  it("em modo exemplo não lê nada", () => {
    const { result } = montarHook(useSubmissoesPessoa, ID, { fonte: { modo: "exemplo" } });
    expect(result.current.estado).toBe("inativo");
    expect(result.current.submissoes).toEqual([]);
    expect(lerMock).not.toHaveBeenCalled();
  });

  it.each([[null], ["abc"], ["11111111-1111-4111-8111-11111111111"]])("sem uma pessoa com forma de uuid (%s) não lê nada", (id) => {
    const { result } = montarHook(useSubmissoesPessoa, id as string | null);
    expect(result.current.estado).toBe("inativo");
    expect(lerMock).not.toHaveBeenCalled();
  });

  it("uma falha dá o estado de erro, é reportada, e não deixa lista nenhuma", async () => {
    lerMock.mockRejectedValue({ code: "57014" });
    const { result } = montarHook(useSubmissoesPessoa, ID, { client: criarCliente() });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.submissoes).toEqual([]);
    expect(captureMock).toHaveBeenCalled();
  });

  it("ao trocar de pessoa não mostra os cartões da anterior", async () => {
    lerMock.mockResolvedValueOnce([cartao()]).mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = montarHook(useSubmissoesPessoa, ID);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rerender("22222222-2222-4222-8222-222222222222");
    expect(result.current.submissoes).toEqual([]);
    expect(result.current.estado).toBe("a-carregar");
  });

  it("recarregar volta a ler", async () => {
    lerMock.mockResolvedValue([]);
    const { result } = montarHook(useSubmissoesPessoa, ID);
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    await act(async () => { result.current.recarregar(); });
    await waitFor(() => expect(lerMock).toHaveBeenCalledTimes(2));
  });

  it("a chave leva a organização e a pessoa (o prefixo só com a organização serve para invalidar)", () => {
    expect(submissoesPessoaQueryKey("org-1", ID)).toEqual(["neg-ficha-submissoes", "org-1", ID]);
    expect(submissoesPessoaQueryKey("org-1")).toEqual(["neg-ficha-submissoes", "org-1"]);
    expect(fonteReal().modo).toBe("real");
  });
});

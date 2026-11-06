// Depois de gravar um utilizador com sucesso, as permissões da sessão são relidas em segundo plano (o próprio utilizador
// pode ter mudado de papel). Um erro da base não relê.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Utilizador } from "../tipos";

const atualizarUtilizadorNaBase = vi.fn();
const mudarRoleNaBase = vi.fn();
vi.mock("./escritasUtilizador", () => ({
  ERRO_EMAIL_EXISTENTE: "EMAIL_EXISTS",
  criarUtilizadorNaBase: vi.fn(),
  atualizarUtilizadorNaBase: (...a: unknown[]) => atualizarUtilizadorNaBase(...a),
  mudarRoleNaBase: (...a: unknown[]) => mudarRoleNaBase(...a),
  desativarUtilizadorNaBase: vi.fn(),
  reativarUtilizadorNaBase: vi.fn(),
}));
const recarregar = vi.fn(async () => {});
vi.mock("./useUtilizadoresReais", () => ({ useRecarregarUtilizadores: () => recarregar }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const relerPermissoes = vi.fn();
vi.mock("@/contexts/PermissionsContext", () => ({ usePermissionsOpcional: () => ({ refreshPermissionsSilently: relerPermissoes }) }));

import { useAcoesUtilizador } from "./useAcoesUtilizador";

const u = { id: "u1" } as unknown as Utilizador;

beforeEach(() => {
  atualizarUtilizadorNaBase.mockReset();
  mudarRoleNaBase.mockReset();
  relerPermissoes.mockReset();
});

describe("useAcoesUtilizador — releitura das permissões da sessão", () => {
  it("gravar um utilizador com sucesso relê as permissões", async () => {
    atualizarUtilizadorNaBase.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAcoesUtilizador());
    await act(async () => { await result.current.atualizar(u, {} as never, [], true); });
    expect(relerPermissoes).toHaveBeenCalledTimes(1);
  });

  it("mudar o papel com sucesso relê; um erro da base não relê", async () => {
    mudarRoleNaBase.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, erro: "A base recusou" });
    const { result } = renderHook(() => useAcoesUtilizador());
    await act(async () => { await result.current.mudarRole(u, "m1", "r1", true); });
    expect(relerPermissoes).toHaveBeenCalledTimes(1);
    let r: unknown;
    await act(async () => { r = await result.current.mudarRole(u, "m1", "r1", true); });
    expect(r).toEqual({ ok: false, erro: "A base recusou" });
    expect(relerPermissoes).toHaveBeenCalledTimes(1);
  });
});

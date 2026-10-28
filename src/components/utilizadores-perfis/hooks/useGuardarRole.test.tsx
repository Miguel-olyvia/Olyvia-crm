import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const criarRoleNaBase = vi.fn();
const guardarRoleNaBase = vi.fn();
const eliminarRoleNaBase = vi.fn();
const restaurarRoleNaBase = vi.fn();
vi.mock("./rolesNaBase", () => ({
  criarRoleNaBase: (...a: unknown[]) => criarRoleNaBase(...a),
  guardarRoleNaBase: (...a: unknown[]) => guardarRoleNaBase(...a),
  eliminarRoleNaBase: (...a: unknown[]) => eliminarRoleNaBase(...a),
  restaurarRoleNaBase: (...a: unknown[]) => restaurarRoleNaBase(...a),
}));

let empresa: { activeCompany: { id: string } | null } = { activeCompany: { id: "org-a" } };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => empresa }));

import { useGuardarRole } from "./useGuardarRole";

const dados = { nome: "X", codigo: "x", descricao: "", podeAssinar: false, permissoes: [] };
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  [criarRoleNaBase, guardarRoleNaBase, eliminarRoleNaBase, restaurarRoleNaBase].forEach((f) => f.mockReset().mockResolvedValue(undefined));
  empresa = { activeCompany: { id: "org-a" } };
  client = new QueryClient();
});

describe("useGuardarRole", () => {
  it("cria na organização ativa, devolve ok e atualiza as listas de roles, de permissões e a contagem", async () => {
    const invalida = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useGuardarRole(), { wrapper });
    let r: unknown;
    await act(async () => { r = await result.current.criar(dados); });
    expect(r).toEqual({ ok: true });
    expect(criarRoleNaBase).toHaveBeenCalledWith("org-a", dados);
    expect(invalida.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]))
      .toEqual(["anew_roles", "anew_role_permissions", "perfis-contagem-por-role"]);
  });

  it("um erro da base volta como resultado com a mensagem, sem atualizar listas", async () => {
    guardarRoleNaBase.mockRejectedValue(new Error("A base não confirmou a gravação da role"));
    const invalida = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useGuardarRole(), { wrapper });
    let r: unknown;
    await act(async () => { r = await result.current.guardar("r1", dados, false); });
    expect(r).toEqual({ ok: false, erro: "A base não confirmou a gravação da role" });
    expect(invalida).not.toHaveBeenCalled();
    expect(result.current.aGravar).toBe(false);
  });

  it("sem organização ativa não cria e diz porquê", async () => {
    empresa = { activeCompany: null };
    const { result } = renderHook(() => useGuardarRole(), { wrapper });
    let r: unknown;
    await act(async () => { r = await result.current.criar(dados); });
    expect(r).toEqual({ ok: false, erro: "Escolha uma organização antes de criar a role." });
    expect(criarRoleNaBase).not.toHaveBeenCalled();
  });

  it("eliminar e restaurar passam a contagem e o id à base", async () => {
    const { result } = renderHook(() => useGuardarRole(), { wrapper });
    await act(async () => { await result.current.eliminar("r1", 0); await result.current.restaurar("r2"); });
    expect(eliminarRoleNaBase).toHaveBeenCalledWith("r1", 0);
    expect(restaurarRoleNaBase).toHaveBeenCalledWith("r2");
  });
});

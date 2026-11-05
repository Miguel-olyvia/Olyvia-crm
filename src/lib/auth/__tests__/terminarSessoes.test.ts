import { describe, expect, it, vi } from "vitest";
import { authIdsComSessoesTerminaveis, podeTerminarSessoes } from "../terminarSessoes";

const procurar = vi.fn(async (ids: string[]) => ids.map((a) => ({ id: `anew-${a}`, auth_user_id: a })));

describe("Terminar sessões: o botão só a quem a edge aceita", () => {
  it("administrador de sistema: todas as linhas, sem perguntar à base", async () => {
    const possoGerir = vi.fn();
    const r = await authIdsComSessoesTerminaveis(["a", "b"], { isSystemAdmin: true, temUsersEdit: false, procurarUtilizadores: procurar, possoGerir });
    expect(r).toBe("todos");
    expect(podeTerminarSessoes(r, "a")).toBe(true);
    expect(podeTerminarSessoes(r, null)).toBe(false);
    expect(possoGerir).not.toHaveBeenCalled();
  });

  it("sem users.edit: nenhuma linha", async () => {
    const possoGerir = vi.fn(async () => true);
    const r = await authIdsComSessoesTerminaveis(["a"], { isSystemAdmin: false, temUsersEdit: false, procurarUtilizadores: procurar, possoGerir });
    expect(podeTerminarSessoes(r, "a")).toBe(false);
    expect(possoGerir).not.toHaveBeenCalled();
  });

  it("com users.edit: só as pessoas que a base diz que pode gerir", async () => {
    const possoGerir = vi.fn(async (id: string) => id === "anew-a");
    const r = await authIdsComSessoesTerminaveis(["a", "b", null, "a"], { isSystemAdmin: false, temUsersEdit: true, procurarUtilizadores: procurar, possoGerir });
    expect(podeTerminarSessoes(r, "a")).toBe(true);
    expect(podeTerminarSessoes(r, "b")).toBe(false);
    expect(possoGerir).toHaveBeenCalledTimes(2);
  });

  it("erro da base = não (falha fechada)", async () => {
    const possoGerir = vi.fn(async () => { throw new Error("rede"); });
    const r = await authIdsComSessoesTerminaveis(["a"], { isSystemAdmin: false, temUsersEdit: true, procurarUtilizadores: procurar, possoGerir });
    expect(podeTerminarSessoes(r, "a")).toBe(false);
  });
});

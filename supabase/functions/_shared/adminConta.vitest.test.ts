import { describe, expect, it } from "vitest";
import {
  motivoPapelNaoAtribuivel,
  possoGerirUtilizador,
  souAdminSistema,
  temPermissao,
  temPermissaoNaOrg,
} from "./adminConta.ts";

// Cliente falso: regista as chamadas rpc e devolve o que o teste mandar.
function cliente(resposta: { data?: unknown; error?: unknown }) {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  return {
    chamadas,
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return Promise.resolve({ data: resposta.data ?? null, error: resposta.error ?? null });
    },
  };
}

describe("adminConta — decide tudo na base de dados e falha fechado", () => {
  it("souAdminSistema usa is_system_admin_user (o papel global verdadeiro), não códigos de papel", async () => {
    const c = cliente({ data: true });
    expect(await souAdminSistema(c, "u1")).toBe(true);
    expect(c.chamadas).toEqual([{ nome: "is_system_admin_user", args: { _user_id: "u1" } }]);
  });

  it("qualquer erro ou resposta que não seja true conta como não", async () => {
    expect(await souAdminSistema(cliente({ error: { message: "x" } }), "u1")).toBe(false);
    expect(await souAdminSistema(cliente({ data: "true" }), "u1")).toBe(false);
    expect(await souAdminSistema(cliente({ data: true }), "")).toBe(false);
    expect(await temPermissao(cliente({ error: { message: "x" } }), "u1", "users.delete")).toBe(false);
    expect(await temPermissaoNaOrg(cliente({ data: null }), "u1", "users.create", "o1")).toBe(false);
    expect(await possoGerirUtilizador(cliente({ error: { message: "x" } }), "u1", "a1", "users.delete")).toBe(false);
  });

  it("temPermissaoNaOrg pergunta pela organização-alvo (direitos descem, não sobem)", async () => {
    const c = cliente({ data: true });
    expect(await temPermissaoNaOrg(c, "u1", "users.create", "o1")).toBe(true);
    expect(c.chamadas[0]).toEqual({
      nome: "has_anew_permission_in_org_or_ancestor",
      args: { _auth_uid: "u1", _permission_code: "users.create", _organization_id: "o1" },
    });
  });

  it("motivoPapelNaoAtribuivel devolve o motivo da base, null se pode, e recusa se a validação falhar", async () => {
    expect(await motivoPapelNaoAtribuivel(cliente({ data: null }), "u1", "o1", "r1")).toBeNull();
    expect(await motivoPapelNaoAtribuivel(cliente({ data: "Papel de sistema" }), "u1", "o1", "r1")).toBe("Papel de sistema");
    expect(await motivoPapelNaoAtribuivel(cliente({ error: { message: "x" } }), "u1", "o1", "r1")).not.toBeNull();
  });

  it("possoGerirUtilizador passa quem age, a pessoa, a permissão e se conta as inativas", async () => {
    const c = cliente({ data: true });
    expect(await possoGerirUtilizador(c, "u1", "a1", "users.delete", true)).toBe(true);
    expect(c.chamadas[0]).toEqual({
      nome: "fn_pode_gerir_utilizador_por",
      args: { p_actor_auth: "u1", p_target_user: "a1", p_permission: "users.delete", p_incluir_inativas: true },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const respostas: Record<string, { data: unknown; error: unknown }> = {};

// Cada from(tabela).select().eq().maybeSingle()/limit() responde com o que o teste pôs em `respostas[tabela]`.
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    const devolve = () => Promise.resolve(respostas[tabela] ?? { data: null, error: null });
    ["select", "eq"].forEach((m) => { c[m] = () => c; });
    c.maybeSingle = devolve;
    c.limit = devolve;
    return c;
  };
  return { supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (t: string) => cadeia(t) } };
});

import { criarRoleNaBase, eliminarRoleNaBase, guardarRoleNaBase, restaurarRoleNaBase } from "./rolesNaBase";

const dados = { nome: "Gestor", codigo: "gestor", descricao: "", podeAssinar: false, permissoes: ["leads.view", "leads.edit"] };
const confirmado = () => {
  respostas.anew_roles = { data: { id: "r1", code: "gestor", name: "Gestor", deleted_at: null }, error: null };
  respostas.anew_role_permissions = { data: [{ permission_code: "leads.edit" }, { permission_code: "leads.view" }], error: null };
};

beforeEach(() => {
  rpc.mockReset();
  Object.keys(respostas).forEach((k) => delete respostas[k]);
});

describe("criarRoleNaBase", () => {
  it("chama rpc_create_role com a organização e confirma a gravação", async () => {
    rpc.mockResolvedValue({ data: { id: "r1" }, error: null });
    confirmado();
    await expect(criarRoleNaBase("org-1", dados)).resolves.toBe("r1");
    expect(rpc).toHaveBeenCalledWith("rpc_create_role", expect.objectContaining({
      p_code: "gestor", p_name: "Gestor", p_description: null, p_organization_id: "org-1", p_permissions: ["leads.view", "leads.edit"],
    }));
  });
  it("propaga o erro da RPC com a mensagem da base", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Sem permissão para criar roles" } });
    await expect(criarRoleNaBase("org-1", dados)).rejects.toThrow("Sem permissão para criar roles");
  });
  it("falha se a base não devolver a role", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(criarRoleNaBase("org-1", dados)).rejects.toThrow(/não devolveu/);
  });
  it("falha se a releitura não bater certo (gravação silenciosa)", async () => {
    rpc.mockResolvedValue({ data: { id: "r1" }, error: null });
    confirmado();
    respostas.anew_role_permissions = { data: [{ permission_code: "leads.view" }], error: null };
    await expect(criarRoleNaBase("org-1", dados)).rejects.toThrow(/não confirmou a gravação/);
  });
  it("não chama a base com o nome vazio", async () => {
    await expect(criarRoleNaBase("org-1", { ...dados, nome: " " })).rejects.toThrow(/nome/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("guardarRoleNaBase", () => {
  it("recusa roles de sistema sem chamar a base", async () => {
    await expect(guardarRoleNaBase("r1", dados, true)).rejects.toThrow(/sistema/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("atualiza e confirma", async () => {
    rpc.mockResolvedValue({ data: { id: "r1" }, error: null });
    confirmado();
    await expect(guardarRoleNaBase("r1", dados, false)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("rpc_update_role", expect.objectContaining({ p_id: "r1", p_code: "gestor" }));
  });
  it("conta como falha uma RPC sem erro que não mudou a role", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    confirmado();
    respostas.anew_roles = { data: { id: "r1", code: "gestor", name: "Nome antigo", deleted_at: null }, error: null };
    await expect(guardarRoleNaBase("r1", dados, false)).rejects.toThrow(/não confirmou/);
  });
  it("propaga o erro da leitura de confirmação", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    respostas.anew_roles = { data: null, error: { message: "falha de rede" } };
    await expect(guardarRoleNaBase("r1", dados, false)).rejects.toThrow("falha de rede");
  });
});

describe("eliminarRoleNaBase", () => {
  it("não elimina uma role com utilizadores", async () => {
    await expect(eliminarRoleNaBase("r1", 2)).rejects.toThrow(/tem utilizadores/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("não elimina sem a contagem fiável", async () => {
    await expect(eliminarRoleNaBase("r1", null)).rejects.toThrow(/confirmar/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("elimina e confirma o soft delete", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    respostas.anew_roles = { data: { id: "r1", code: "x", name: "X", deleted_at: "2026-10-27" }, error: null };
    await expect(eliminarRoleNaBase("r1", 0)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("rpc_delete_role", { p_id: "r1" });
  });
  it("aceita que a role deixe de ser legível depois de eliminada", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(eliminarRoleNaBase("r1", 0)).resolves.toBeUndefined();
  });
  it("falha se a role continua ativa (RLS filtrou sem erro)", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    respostas.anew_roles = { data: { id: "r1", code: "x", name: "X", deleted_at: null }, error: null };
    await expect(eliminarRoleNaBase("r1", 0)).rejects.toThrow(/não confirmou a eliminação/);
  });
  it("propaga o erro da RPC (role de sistema, sem permissão)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Roles de sistema não podem ser eliminadas" } });
    await expect(eliminarRoleNaBase("r1", 0)).rejects.toThrow("Roles de sistema não podem ser eliminadas");
  });
});

describe("restaurarRoleNaBase", () => {
  it("restaura e confirma que deixou de estar eliminada", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    respostas.anew_roles = { data: { id: "r1", code: "x", name: "X", deleted_at: null }, error: null };
    await expect(restaurarRoleNaBase("r1")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("rpc_restore_role", { p_id: "r1" });
  });
  it("falha se continua eliminada", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    respostas.anew_roles = { data: { id: "r1", code: "x", name: "X", deleted_at: "2026-01-01" }, error: null };
    await expect(restaurarRoleNaBase("r1")).rejects.toThrow(/não confirmou o restauro/);
  });
});

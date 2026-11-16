import { beforeEach, describe, expect, it, vi } from "vitest";

// Uma base falsa que se porta como o PostgREST com max_rows = 1000: filtra (eq/in), ordena (order), recorta (range) e,
// no fim, corta SEMPRE nas 1000 linhas, peça-se o que se pedir com `.limit()`. Regista cada pedido para se ver o que se enviou.
const MAX_ROWS = 1000;
type Linha = Record<string, unknown>;
interface Pedido { tabela: string; ordem: string[]; range: [number, number] | null; limite: number | null }
const tabelas: Record<string, Linha[]> = {};
const pedidos: Pedido[] = [];
/** Falha na página que começa nesta linha (para provar que não se devolve uma lista parcial). */
let falharEmDe: number | null = null;
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const from = (tabela: string) => {
    let linhas = [...(tabelas[tabela] ?? [])];
    const pedido: Pedido = { tabela, ordem: [], range: null, limite: null };
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (c: string, v: unknown) => { linhas = linhas.filter((l) => l[c] === v); return b; };
    b.in = (c: string, v: unknown[]) => { linhas = linhas.filter((l) => v.includes(l[c])); return b; };
    b.order = (c: string) => { pedido.ordem.push(c); return b; };
    b.limit = (n: number) => { pedido.limite = n; return b; };
    b.range = (de: number, ate: number) => { pedido.range = [de, ate]; return b; };
    const responder = () => {
      pedidos.push(pedido);
      if (falharEmDe !== null && pedido.range?.[0] === falharEmDe) return { data: null, error: { message: "falha a meio da leitura" } };
      const ordenadas = [...linhas].sort((a, z) => {
        for (const c of pedido.ordem) {
          const r = String(a[c]).localeCompare(String(z[c]));
          if (r !== 0) return r;
        }
        return 0;
      });
      const de = pedido.range?.[0] ?? 0;
      const ate = pedido.range ? pedido.range[1] + 1 : ordenadas.length;
      const pedidas = ordenadas.slice(de, ate).slice(0, pedido.limite ?? Infinity);
      return { data: pedidas.slice(0, MAX_ROWS), error: null };
    };
    b.maybeSingle = () => Promise.resolve((() => { const r = responder(); return { ...r, data: r.data?.[0] ?? null }; })());
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, ko);
    return b;
  };
  return { supabase: { from, rpc: (...a: unknown[]) => rpc(...a) } };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null, isLoading: false }) }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewRoleCode: null }) }));

import { lerPermissoesDasRoles } from "./useRolesReais";
import { guardarRoleNaBase, lerPermissoes } from "./rolesNaBase";
import { lerRolesDosVinculos } from "./useUtilizadoresReais";
import { lerContagemPorRole } from "./useContagemUtilizadoresPorRole";

const codigos = (n: number) => Array.from({ length: n }, (_, i) => `modulo.acao_${String(i).padStart(4, "0")}`);
const permissoesDe = (roleId: string, n: number) => codigos(n).map((permission_code) => ({ role_id: roleId, permission_code }));

beforeEach(() => {
  Object.keys(tabelas).forEach((k) => delete tabelas[k]);
  pedidos.length = 0;
  falharEmDe = null;
  rpc.mockReset();
});

describe("lerPermissoesDasRoles (lista de roles)", () => {
  // 10 roles num só lote: 479 (super_admin) + 288 (org_admin) + 7 × 80 + 76 = 1403 linhas, mais do que o corte de 1000.
  const tamanhos = [479, 288, 80, 80, 80, 80, 80, 80, 80, 76];
  const roleIds = tamanhos.map((_, i) => `role-${i}`);

  it("devolve as 1403 linhas, sem repetidas, apesar do corte nas 1000", async () => {
    tabelas.anew_role_permissions = roleIds.flatMap((id, i) => permissoesDe(id, tamanhos[i]));
    const linhas = await lerPermissoesDasRoles(roleIds);
    expect(linhas).toHaveLength(1403);
    expect(new Set(linhas.map((l) => `${l.role_id}|${l.permission_code}`)).size).toBe(1403);
    roleIds.forEach((id, i) => expect(linhas.filter((l) => l.role_id === id)).toHaveLength(tamanhos[i]));
    // Duas páginas, ordenadas de forma determinística, nenhuma maior do que o que a base serve.
    expect(pedidos.map((p) => p.range)).toEqual([[0, 999], [1000, 1999]]);
    pedidos.forEach((p) => expect(p.ordem).toEqual(["role_id", "permission_code"]));
  });

  it("pagina dentro de cada lote de 10 roles", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `r${String(i).padStart(2, "0")}`);
    tabelas.anew_role_permissions = ids.flatMap((id) => permissoesDe(id, 150)); // 1º lote 1500, 2º lote 300
    const linhas = await lerPermissoesDasRoles(ids);
    expect(linhas).toHaveLength(1800);
    expect(pedidos.map((p) => p.range)).toEqual([[0, 999], [1000, 1999], [0, 999]]);
  });

  it("com exatamente 1000 linhas pede mais uma página (vazia) e pára", async () => {
    tabelas.anew_role_permissions = permissoesDe("role-0", 1000);
    await expect(lerPermissoesDasRoles(["role-0"])).resolves.toHaveLength(1000);
    expect(pedidos.map((p) => p.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("uma falha numa página a meio sobe como erro, sem lista parcial", async () => {
    tabelas.anew_role_permissions = roleIds.flatMap((id, i) => permissoesDe(id, tamanhos[i]));
    falharEmDe = 1000;
    await expect(lerPermissoesDasRoles(roleIds)).rejects.toMatchObject({ message: "falha a meio da leitura" });
  });
});

describe("lerPermissoes (confirmação de uma gravação)", () => {
  it("devolve todas as permissões de uma role com mais de 1000 (2500, três páginas)", async () => {
    tabelas.anew_role_permissions = [...permissoesDe("r1", 2500), ...permissoesDe("outra", 50)];
    const lidas = await lerPermissoes("r1");
    expect(lidas).toHaveLength(2500);
    expect(new Set(lidas).size).toBe(2500);
    expect(pedidos.map((p) => p.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    pedidos.forEach((p) => expect(p.ordem).toEqual(["role_id", "permission_code"]));
  });

  it("uma falha numa página a meio sobe como Error com a mensagem da base", async () => {
    tabelas.anew_role_permissions = permissoesDe("r1", 1403);
    falharEmDe = 1000;
    await expect(lerPermissoes("r1")).rejects.toThrow("falha a meio da leitura");
  });

  it("guardar uma role com 1403 permissões é confirmado (antes falhava com a leitura cortada)", async () => {
    const permissoes = codigos(1403);
    tabelas.anew_roles = [{ id: "r1", code: "gestor", name: "Gestor", deleted_at: null }];
    tabelas.anew_role_permissions = permissoesDe("r1", 1403);
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(guardarRoleNaBase("r1", { nome: "Gestor", codigo: "gestor", descricao: "", podeAssinar: false, permissoes }, false))
      .resolves.toBeUndefined();
  });
});

describe("lerRolesDosVinculos (roles dos vínculos na lista de utilizadores)", () => {
  // 3 roles num só lote de 200: 900 + 600 + 300 = 1800 permissões, mais do que o corte de 1000.
  const tamanhos = [900, 600, 300];
  const roleIds = tamanhos.map((_, i) => `role-${i}`);
  const preparar = () => {
    tabelas.anew_roles = roleIds.map((id) => ({
      id, code: id, name: id, description: null, organization_id: "org", is_system: false, can_sign_contracts: false, deleted_at: null,
    }));
    tabelas.anew_role_permissions = roleIds.flatMap((id, i) => permissoesDe(id, tamanhos[i]));
  };

  it("cada role vem com todas as suas permissões apesar do corte nas 1000", async () => {
    preparar();
    const roles = await lerRolesDosVinculos(roleIds);
    roleIds.forEach((id, i) => {
      const role = roles.find((r) => r.id === id);
      expect(role?.permissoes).toHaveLength(tamanhos[i]);
      expect(new Set(role?.permissoes).size).toBe(tamanhos[i]);
    });
    const dasPermissoes = pedidos.filter((p) => p.tabela === "anew_role_permissions");
    expect(dasPermissoes.map((p) => p.range)).toEqual([[0, 999], [1000, 1999]]);
    dasPermissoes.forEach((p) => {
      expect(p.ordem).toEqual(["role_id", "permission_code"]);
      expect(p.limite).toBeNull();
    });
  });

  it("uma falha numa página a meio sobe como Error com a mensagem da base, sem roles parciais", async () => {
    preparar();
    falharEmDe = 1000;
    await expect(lerRolesDosVinculos(roleIds)).rejects.toThrow("falha a meio da leitura");
  });
});

describe("lerContagemPorRole (decide se uma role se pode eliminar)", () => {
  const vinculo = (id: number, roleId: string, userId: string, status = "active") => ({ id: `m${String(id).padStart(5, "0")}`, role_id: roleId, user_id: userId, status });
  const preparar = () => {
    // role-a: 1500 utilizadores distintos ativos (+ 1 vínculo repetido de u0000 e 1 inativo); role-b: 2 ativos; role-c: nenhum.
    const linhas = Array.from({ length: 1500 }, (_, i) => vinculo(i, "role-a", `u${String(i).padStart(4, "0")}`));
    linhas.push(vinculo(1500, "role-a", "u0000"), vinculo(1501, "role-a", "inativo", "inactive"));
    linhas.push(vinculo(1502, "role-b", "x1"), vinculo(1503, "role-b", "x2"));
    tabelas.anew_memberships = linhas;
  };

  it("conta todos os utilizadores de uma role com mais de 1000 vínculos ativos", async () => {
    preparar();
    await expect(lerContagemPorRole(["role-a", "role-b", "role-c"])).resolves.toEqual({ "role-a": 1500, "role-b": 2, "role-c": 0 });
    expect(pedidos.map((p) => p.range)).toEqual([[0, 999], [1000, 1999]]);
    pedidos.forEach((p) => {
      expect(p.ordem).toEqual(["role_id", "user_id", "id"]);
      expect(p.limite).toBeNull();
    });
  });

  it("uma falha numa página a meio sobe como erro: nunca uma contagem parcial", async () => {
    preparar();
    falharEmDe = 1000;
    await expect(lerContagemPorRole(["role-a"])).rejects.toMatchObject({ message: "falha a meio da leitura" });
  });
});

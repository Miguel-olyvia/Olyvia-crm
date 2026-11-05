// 05/11 (P2 da auditoria): o Histórico da PO lê por rpc_po_historico (purchase_orders.view); se a base disser «sem permissão» (42501),
// volta à leitura direta de entity_audit_log, como antes (quem já via por outra permissão continua a ver).
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  rpc: { data: null as unknown, error: null as { code?: string; message?: string } | null },
  direto: { data: [] as unknown[], error: null as unknown },
  chamadasRpc: [] as { nome: string; args: Record<string, unknown> }[],
  tabelas: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabela: string) => {
    estado.tabelas.push(tabela);
    const resultado = tabela === "anew_users" ? { data: [{ id: "u1", name: "Ana" }], error: null } : estado.direto;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in"]) q[m] = () => q;
    q.limit = () => Promise.resolve(resultado);
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok);
    return q;
  };
  return {
    supabase: {
      rpc: vi.fn((nome: string, args: Record<string, unknown>) => {
        estado.chamadasRpc.push({ nome, args });
        return Promise.resolve(estado.rpc);
      }),
      from: vi.fn(consulta),
    },
  };
});

import { fetchPoAuditLog } from "../poHistory";

const linha = (id: string) => ({ id, operation: "UPDATE", changed_fields: {}, changed_by: "u1", source: "web_app", created_at: "2026-11-05T10:00:00Z" });

beforeEach(() => {
  estado.rpc = { data: null, error: null };
  estado.direto = { data: [], error: null };
  estado.chamadasRpc = [];
  estado.tabelas = [];
});

describe("fetchPoAuditLog", () => {
  it("lê pela rpc_po_historico (com o id da PO) e não toca na tabela do registo", async () => {
    estado.rpc = { data: [linha("a"), linha("b")], error: null };
    const { rows, names } = await fetchPoAuditLog("po-1");
    expect(estado.chamadasRpc).toEqual([{ nome: "rpc_po_historico", args: { p_po_id: "po-1", p_limite: 200 } }]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(estado.tabelas).not.toContain("entity_audit_log");
    expect(names.get("u1")).toBe("Ana");
  });

  it("sem permissão na RPC (42501) volta à leitura direta de antes", async () => {
    estado.rpc = { data: null, error: { code: "42501", message: "Sem permissão" } };
    estado.direto = { data: [linha("c")], error: null };
    const { rows } = await fetchPoAuditLog("po-1");
    expect(estado.tabelas).toContain("entity_audit_log");
    expect(rows.map((r) => r.id)).toEqual(["c"]);
  });

  it("outro erro da RPC não se esconde (a folha mostra o erro)", async () => {
    estado.rpc = { data: null, error: { code: "XX000", message: "falhou" } };
    await expect(fetchPoAuditLog("po-1")).rejects.toMatchObject({ code: "XX000" });
    expect(estado.tabelas).not.toContain("entity_audit_log");
  });
});

// Depois de gravar a lead: a morada a partir dos campos. Falhas aqui nunca desfazem a lead (já está gravada); só se avisa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { supabaseFalso } from "./supabaseFalso";
import { depoisDeGravar } from "./depoisNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const MORADA = { po_morada: "Rua das Flores 10", po_codigo_postal: "1000-001", po_localidade: "Lisboa" };
const base = { entityId: "ent-1", organizationId: "org-nike", actorId: "u1" };

beforeEach(() => {
  supabaseFalso.reiniciar();
  vi.mocked(captureFlowError).mockReset();
});

describe("depoisDeGravar: a morada", () => {
  it("sem dados de morada não faz nada nem toca na base", async () => {
    const r = await depoisDeGravar({ ...base, valores: { first_name: "Ana" } });
    expect(r).toEqual({ moradaFalhou: false, motivo: null });
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
    expect(supabaseFalso.estado.chamadas).toEqual([]);
  });

  it("com morada completa e sem morada principal, sincroniza pela função da base (uma transação)", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [{ address_id: "a1", decision: "insert" }], error: null });
    const r = await depoisDeGravar({ ...base, valores: MORADA });
    expect(r).toEqual({ moradaFalhou: false, motivo: null });
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("sync_entity_primary_address", expect.objectContaining({
      p_entity_id: "ent-1", p_organization_id: "org-nike", p_street: "Rua das Flores 10", p_postal_code: "1000-001", p_created_by: "u1",
    }));
  });

  it("uma falha da função da base dá moradaFalhou com o motivo, e é reportada", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: null, error: { message: "sem permissão" } });
    const r = await depoisDeGravar({ ...base, valores: MORADA });
    expect(r).toEqual({ moradaFalhou: true, motivo: "sem permissão" });
    expect(captureFlowError).toHaveBeenCalledWith(expect.any(Error), "lead-lifecycle");
  });

  it("uma exceção inesperada também só dá moradaFalhou (nunca lança)", async () => {
    supabaseFalso.rpc.mockRejectedValue(new Error("rede"));
    const r = await depoisDeGravar({ ...base, valores: MORADA });
    expect(r.moradaFalhou).toBe(true);
  });
});

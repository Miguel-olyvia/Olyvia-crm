// A revalidação imediatamente antes de gravar (regra 8): repete a procura e aplica a regra. FAIL-CLOSED: se não se conseguir verificar,
// lança (nunca devolve «sem coincidências»). Casos 14, 15 e 16 do desenho. O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { supabaseFalso } from "./supabaseFalso";
import { revalidarAntesDeAtualizar, revalidarAntesDeCriar } from "./revalidarNovaLead";
import type { Escrito, PlanoAtualizar } from "./tiposNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const ORG = "org-nike";
const ESCRITO: Escrito = { nome: "Ana Lopes", email: "ana@x.pt", telefone: "+351 912 345 678", nif: null };
const linha = (sobre: Record<string, unknown> = {}) => ({
  pessoa: 1, campo: "email", ambito: "organizacao", entity_id: "p1", nome: "Ana", visivel: true, organizacao_id: ORG, organizacao_nome: null, ...sobre,
});
const PLANO: PlanoAtualizar = {
  leadId: "l1", reabrirLead: false, reabrirAbordagem: false,
  email: { antigo: "velho@x.pt", novo: "ana@x.pt" }, telefone: { antigo: null, novo: "+351 912 345 678" },
};

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = {
    anew_entities: [{ id: "p1", display_name: "Ana", created_at: "2026-09-01T10:00:00Z" }, { id: "p2", display_name: "Bea", created_at: "2026-09-01T10:00:00Z" }],
    anew_entity_emails: [], anew_entity_phones: [],
    anew_leads: [{ id: "l1", entity_id: "p1", status: "new", closure_result: null, created_at: "2026-10-01T10:00:00Z", assigned_to: null }],
    anew_clients: [], anew_users: [],
  };
});

describe("revalidarAntesDeCriar", () => {
  it("sem coincidências: pode criar", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [], error: null });
    const d = await revalidarAntesDeCriar(ORG, ESCRITO);
    expect(d.tipo).toBe("criar");
    expect(supabaseFalso.rpc).toHaveBeenCalledTimes(1);
  });

  it("caso 14: uma coincidência nova aparece e bloqueia (não se cria)", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha()], error: null });
    const d = await revalidarAntesDeCriar(ORG, ESCRITO);
    expect(d.tipo).toBe("bloquear");
  });

  it("só o grupo continua a deixar criar", async () => {
    supabaseFalso.rpc.mockResolvedValue({
      data: [linha({ pessoa: null, ambito: "grupo", entity_id: null, nome: null, visivel: null, organizacao_id: "o2", organizacao_nome: "Loja Norte" })],
      error: null,
    });
    const d = await revalidarAntesDeCriar(ORG, ESCRITO);
    expect(d).toMatchObject({ tipo: "criar", grupo: [{ nome: "Loja Norte" }] });
  });

  it("caso 16: se a verificação falha, lança (fail-closed) e nunca devolve «pode criar»", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    const erro = await revalidarAntesDeCriar(ORG, ESCRITO).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
  });

  it("NG020 (demasiadas verificações) também impede criar", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: null, error: { code: "NG020", message: "x" } });
    const erro = await revalidarAntesDeCriar(ORG, ESCRITO).catch((e) => e);
    expect(erro.codigo).toBe("NG020");
  });
});

describe("revalidarAntesDeAtualizar", () => {
  it("o email e o telefone novos são só da própria pessoa (ou de ninguém): ok", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha({ entity_id: "p1" })], error: null });
    expect(await revalidarAntesDeAtualizar(ORG, ESCRITO, "p1", PLANO)).toEqual({ tipo: "ok" });
    // procura só o que se vai substituir
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("neg_procurar_duplicados", {
      p_organization_id: ORG, p_email: "ana@x.pt", p_telefone: "+351 912 345 678", p_nif_hash: null, p_pais: "PT",
    });
  });

  it("caso 14: o contacto novo pertence a OUTRA pessoa: conflito, não se grava", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha({ entity_id: "p1" }), linha({ pessoa: 2, entity_id: "p2", campo: "telefone" })], error: null });
    const r = await revalidarAntesDeAtualizar(ORG, ESCRITO, "p1", PLANO);
    expect(r.tipo).toBe("conflito");
    if (r.tipo !== "conflito") throw new Error("devia haver conflito");
    expect(r.decisao.tipo).toBe("bloquear");
    if (r.decisao.tipo === "bloquear") {
      expect(r.decisao.pessoas.map((p) => p.entityId)).toEqual(["p2"]);
      expect(r.decisao.pessoas.every((p) => p.atualizar === null)).toBe(true);
    }
  });

  it("uma pessoa escondida pela RLS também é conflito", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha({ pessoa: 2, entity_id: null, nome: null, visivel: false })], error: null });
    const r = await revalidarAntesDeAtualizar(ORG, ESCRITO, "p1", PLANO);
    expect(r).toMatchObject({ tipo: "conflito", decisao: { tipo: "bloquear", semAcesso: true } });
  });

  it("caso 15: a verificação falha ao atualizar: lança, nada se grava", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    expect(await revalidarAntesDeAtualizar(ORG, ESCRITO, "p1", PLANO).catch((e) => e)).toBeInstanceOf(ErroNeg);
  });

  it("sem contacto a substituir não há nada a verificar: não gasta uma tentativa", async () => {
    const plano = { ...PLANO, email: null, telefone: null };
    expect(await revalidarAntesDeAtualizar(ORG, ESCRITO, "p1", plano)).toEqual({ tipo: "ok" });
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
  });

  it("só o telefone a substituir: procura só o telefone", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [], error: null });
    await revalidarAntesDeAtualizar(ORG, ESCRITO, "p1", { ...PLANO, email: null });
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("neg_procurar_duplicados", expect.objectContaining({ p_email: null, p_telefone: "+351 912 345 678" }));
  });
});

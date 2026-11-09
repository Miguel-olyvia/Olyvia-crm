// A leitura das fichas de RH ligáveis e a chamada a rpc_hr_ligar_conta (Supabase simulado).
import { describe, expect, it, vi } from "vitest";
import { criarSupabaseFalso, type OpcoesFalso } from "./supabaseFalso";

const estado = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: (_t, k) => (estado.cliente as Record<string | symbol, unknown>)[k] }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { getLocalizedFallback } from "@/utils/friendlyError";
import { lerPessoasRh, ligarPessoaRhNaBase } from "./pessoaRhNaBase";

const tabelas = {
  pessoas: [
    { id: "p1", organization_id: "org-a", nome_completo: "Ana", numero_interno: null, email_trabalho: null, deleted_at: null },
    { id: "p2", organization_id: "org-a", nome_completo: "Bruno", numero_interno: null, email_trabalho: null, deleted_at: null },
    { id: "p3", organization_id: "org-a", nome_completo: "Apagada", numero_interno: null, email_trabalho: null, deleted_at: "2026-01-01" },
    { id: "p4", organization_id: "org-b", nome_completo: "Outra org", numero_interno: null, email_trabalho: null, deleted_at: null },
  ],
  pessoas_contas: [
    { pessoa_id: "p2", organization_id: "org-a", anew_user_id: "outro", estado: "activa" },
    { pessoa_id: "p1", organization_id: "org-a", anew_user_id: "velho", estado: "revogada" },
  ],
};
const preparar = (o: OpcoesFalso = {}) => { const f = criarSupabaseFalso({ tabelas, ...o }); estado.cliente = f.cliente; return f; };

describe("lerPessoasRh", () => {
  it("lê só as fichas não eliminadas da organização e tira as que têm conta ativa", async () => {
    const f = preparar();
    const r = await lerPessoasRh("org-a");
    expect(r).toEqual({ pessoas: [{ id: "p1", nome: "Ana", detalhe: null }], ligadaId: null });
    expect(f.chamadas.find((c) => c.tabela === "pessoas")?.filtros).toEqual([["eq:organization_id", "org-a"], ["is:deleted_at", null]]);
    expect(f.chamadas.find((c) => c.tabela === "pessoas_contas")?.filtros).toEqual([["eq:organization_id", "org-a"], ["eq:estado", "activa"]]);
  });
  it("ao editar, devolve a ficha ligada a este utilizador", async () => {
    preparar();
    expect((await lerPessoasRh("org-a", "outro")).ligadaId).toBe("p2");
  });
  it("uma recusa por permissão nas ligações não parte a lista; uma falha nas fichas sobe", async () => {
    preparar({ erros: { pessoas_contas: "permission denied for table pessoas_contas" } });
    expect((await lerPessoasRh("org-a")).pessoas.map((p) => p.id)).toEqual(["p1", "p2"]);
    preparar({ erros: { pessoas: "timeout" } });
    await expect(lerPessoasRh("org-a")).rejects.toThrow("timeout");
  });
});

describe("ligarPessoaRhNaBase", () => {
  it("chama rpc_hr_ligar_conta com a ficha e o anew_user_id", async () => {
    const f = preparar();
    expect(await ligarPessoaRhNaBase("p1", "u1")).toEqual({ ok: true });
    expect(f.rpcs).toEqual([{ nome: "rpc_hr_ligar_conta", args: { p_pessoa_id: "p1", p_anew_user_id: "u1" } }]);
  });
  it("um erro da RPC chega com o mesmo texto da ficha do RH", async () => {
    preparar({ rpc: () => ({ error: { message: "conta_ja_ligada_a_outra_pessoa" } }) });
    expect(await ligarPessoaRhNaBase("p1", "u1")).toEqual({ ok: false, erro: getLocalizedFallback("hr.conta.erroJaLigadaAOutraPessoa") });
  });
});

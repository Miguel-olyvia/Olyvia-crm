// «Atualizar dados» da pessoa que já existe: revalidar (fail-closed), substituir o contacto principal (neg_substituir_contacto, nunca se
// acrescenta um segundo), juntar os campos à lead (como Leads), reabrir a lead perdida ou rejeitada e a abordagem encerrada. Os passos
// depois do contacto não são atómicos: uma falha a meio diz o que ficou feito. O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { supabaseFalso, valorDoFiltro } from "./supabaseFalso";
import { atualizarPessoaExistente, AtualizacaoParcial } from "./atualizarPessoaExistente";
import type { Escrito, PlanoAtualizar } from "./tiposNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const ORG = "org-nike";
const ESCRITO: Escrito = { nome: "Ana Lopes", email: "ana@novo.pt", telefone: "+351 912 000 111", nif: null };
const VALORES = { first_name: "Ana", notes: "nova nota", _assigned_to: "" };
const PLANO: PlanoAtualizar = {
  leadId: "l1", reabrirLead: false, reabrirAbordagem: false,
  email: { antigo: "velho@x.pt", novo: "ana@novo.pt" }, telefone: { antigo: "911", novo: "+351 912 000 111" },
};
const chamadasRpc = () => supabaseFalso.rpc.mock.calls.map((c) => c[0] as string);

/** A rpc simulada: a procura da revalidação devolve só a própria pessoa; as outras funções respondem ok. */
function rpcPadrao(sobre: Record<string, unknown> = {}) {
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome in sobre) return sobre[nome];
    if (nome === "neg_procurar_duplicados") return { data: [{ pessoa: 1, campo: "email", ambito: "organizacao", entity_id: "p1", nome: "Ana", visivel: true }], error: null };
    if (nome === "neg_substituir_contacto") return { data: { email_mudou: true, telefone_mudou: true, mudou: true }, error: null };
    return { data: { mudou: true }, error: null };
  });
}

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = {
    anew_entities: [{ id: "p1", display_name: "Ana", created_at: "2026-09-01T10:00:00Z" }],
    anew_entity_emails: [], anew_entity_phones: [], anew_clients: [], anew_users: [],
    anew_leads: (c) => (c.operacao === "select" && c.colunas?.includes("field_values")
      ? { data: [{ field_values: { campo_antigo: "x", notes: "velha" }, status: "new" }], error: null }
      : { data: [{ id: "l1", entity_id: "p1", status: "new", closure_result: null, created_at: "2026-10-01T10:00:00Z", assigned_to: null }], error: null }),
  };
  rpcPadrao();
});

describe("atualizarPessoaExistente: a ordem e os parâmetros", () => {
  it("revalida, substitui o contacto e junta os campos à lead, por esta ordem", async () => {
    const r = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    expect(r).toEqual({ tipo: "atualizada", feito: ["contacto", "lead"] });
    expect(chamadasRpc()).toEqual(["neg_procurar_duplicados", "neg_substituir_contacto"]);
    expect(supabaseFalso.rpc).toHaveBeenNthCalledWith(2, "neg_substituir_contacto", {
      p_organization_id: ORG, p_entity_id: "p1", p_email: "ana@novo.pt", p_telefone: "+351 912 000 111",
    });
    const leitura = supabaseFalso.chamadasA("anew_leads", "select").find((c) => c.colunas?.includes("field_values"))!;
    expect(valorDoFiltro(leitura, "eq", "id")).toBe("l1");
    expect(valorDoFiltro(leitura, "eq", "organization_id")).toBe(ORG);
    const escrita = supabaseFalso.chamadasA("anew_leads", "update")[0];
    expect(valorDoFiltro(escrita, "eq", "organization_id")).toBe(ORG);
    expect(valorDoFiltro(escrita, "eq", "id")).toBe("l1");
    // os campos novos juntam-se por cima dos antigos; _assigned_to nunca vai para field_values
    expect(escrita.dados).toEqual({ field_values: { campo_antigo: "x", notes: "nova nota", first_name: "Ana" }, status: "new" });
  });

  it("nunca insere nem apaga contactos na tabela: o contacto só muda pela função da base", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    for (const tabela of ["anew_entity_emails", "anew_entity_phones"]) {
      expect(supabaseFalso.chamadasA(tabela).filter((c) => c.operacao !== "select")).toEqual([]);
    }
  });

  it("só o telefone a substituir: o email vai a null (a função mantém-no)", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, email: null } });
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("neg_substituir_contacto", expect.objectContaining({ p_email: null, p_telefone: "+351 912 000 111" }));
  });

  it("sem contacto a substituir não chama a função de contactos nem gasta uma procura", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, email: null, telefone: null } });
    expect(chamadasRpc()).toEqual([]);
    expect(supabaseFalso.chamadasA("anew_leads", "update")).toHaveLength(1);
  });

  it("um comercial escolhido passa a ser o atribuído da lead", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: { ...VALORES, _assigned_to: "u9" }, plano: PLANO });
    expect(supabaseFalso.chamadasA("anew_leads", "update")[0].dados).toMatchObject({ assigned_to: "u9" });
  });
});

describe("atualizarPessoaExistente: reabrir", () => {
  it.each(["lost", "rejected"])("lead %s volta a nova", async (estado) => {
    supabaseFalso.estado.tabelas.anew_leads = (c) => (c.operacao === "select" && c.colunas?.includes("field_values")
      ? { data: [{ field_values: {}, status: estado }], error: null } : { data: [], error: null });
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, reabrirLead: true } });
    expect(supabaseFalso.chamadasA("anew_leads", "update")[0].dados).toMatchObject({ status: "new" });
  });

  it("uma lead em curso mantém o estado (também a cancelada)", async () => {
    supabaseFalso.estado.tabelas.anew_leads = (c) => (c.operacao === "select" && c.colunas?.includes("field_values")
      ? { data: [{ field_values: {}, status: "cancelled" }], error: null } : { data: [], error: null });
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    expect(supabaseFalso.chamadasA("anew_leads", "update")[0].dados).toMatchObject({ status: "cancelled" });
  });

  it("abordagem encerrada: chama neg_reabrir_abordagem com o id dessa lead, depois da lead", async () => {
    const r = await atualizarPessoaExistente({
      organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, leadId: "le", reabrirAbordagem: true },
    });
    expect(r).toEqual({ tipo: "atualizada", feito: ["contacto", "lead", "abordagem"] });
    expect(supabaseFalso.rpc).toHaveBeenLastCalledWith("neg_reabrir_abordagem", {
      p_organization_id: ORG, p_entity_id: "p1", p_motivo: null, p_lead_id: "le",
    });
  });
});

describe("atualizarPessoaExistente: falhas", () => {
  it("caso 14: o contacto novo é de outra pessoa: devolve o conflito e não grava nada", async () => {
    rpcPadrao({
      neg_procurar_duplicados: { data: [{ pessoa: 1, campo: "telefone", ambito: "organizacao", entity_id: "p2", nome: "Bea", visivel: true }], error: null },
    });
    supabaseFalso.estado.tabelas.anew_entities = [{ id: "p2", display_name: "Bea", created_at: null }];
    const r = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    expect(r.tipo).toBe("conflito");
    expect(chamadasRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(supabaseFalso.chamadasA("anew_leads", "update")).toEqual([]);
  });

  it("caso 15: a revalidação falha: lança e não grava nada (fail-closed)", async () => {
    rpcPadrao({ neg_procurar_duplicados: { data: null, error: { code: "57014", message: "timeout" } } });
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(chamadasRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(supabaseFalso.chamadasA("anew_leads", "update")).toEqual([]);
  });

  it("NG019 no contacto (apareceu um dono entretanto): lança o ErroNeg e nada mais se grava", async () => {
    rpcPadrao({ neg_substituir_contacto: { data: null, error: { code: "NG019", message: "x" } } });
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe("NG019");
    expect(supabaseFalso.chamadasA("anew_leads", "update")).toEqual([]);
  });

  it("falha ao juntar à lead depois do contacto: aviso parcial com o que ficou feito e o que falhou", async () => {
    supabaseFalso.estado.erros["anew_leads.update"] = { message: "boom" };
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(AtualizacaoParcial);
    expect(erro.feito).toEqual(["contacto"]);
    expect(erro.falhou).toBe("lead");
    expect(erro.erro).toBeInstanceOf(ErroNeg);
  });

  it("falha a reabrir a abordagem depois da lead: parcial com contacto e lead feitos", async () => {
    rpcPadrao({ neg_reabrir_abordagem: { data: null, error: { code: "NG003", message: "x" } } });
    const erro = await atualizarPessoaExistente({
      organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, leadId: "le", reabrirAbordagem: true },
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(AtualizacaoParcial);
    expect(erro.feito).toEqual(["contacto", "lead"]);
    expect(erro.falhou).toBe("abordagem");
    expect(erro.erro.codigo).toBe("NG003");
  });

  it("sem contacto e a lead falha logo: não há nada feito, lança o erro simples (não parcial)", async () => {
    supabaseFalso.estado.erros["anew_leads.select"] = { message: "boom" };
    const erro = await atualizarPessoaExistente({
      organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, email: null, telefone: null },
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro).not.toBeInstanceOf(AtualizacaoParcial);
  });
});

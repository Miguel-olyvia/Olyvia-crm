// «Atualizar dados» da pessoa que já existe: revalidar (fail-closed), substituir o email e o telefone da própria entidade (UPDATE direto,
// nunca se acrescenta um segundo), juntar os campos ao `extra` da entidade, mudar o responsável pela função da base e reabrir a abordagem
// encerrada. Os passos depois do contacto não são atómicos: uma falha a meio diz o que ficou feito. O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { supabaseFalso, valorDoFiltro, type ChamadaTabela } from "./supabaseFalso";
import { atualizarPessoaExistente, AtualizacaoParcial } from "./atualizarPessoaExistente";
import type { Escrito, PlanoAtualizar } from "./tiposNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const ORG = "org-nike";
const ESCRITO: Escrito = { nome: "Ana Lopes", email: "ana@novo.pt", telefone: "+351 912 000 111", nif: null };
const VALORES = { first_name: "Ana", notes: "nova nota", _assigned_to: "" };
// A lead é a própria entidade: o `leadId` do plano é o id da entidade.
const PLANO: PlanoAtualizar = {
  leadId: "p1", reabrirLead: false, reabrirAbordagem: false,
  email: { antigo: "velho@x.pt", novo: "ana@novo.pt" }, telefone: { antigo: "911", novo: "+351 912 000 111" },
};
const chamadasRpc = () => supabaseFalso.rpc.mock.calls.map((c) => c[0] as string);
const escritas = () => supabaseFalso.chamadasA("anew_entities", "update");

/** As entidades simuladas: a leitura do `extra`, a escrita (devolve a linha) e a leitura da procura de duplicados. */
function entidades(opcoes: { falhaNoUpdate?: number; semLinha?: boolean } = {}) {
  let updates = 0;
  return (c: ChamadaTabela) => {
    if (c.operacao === "update") {
      updates += 1;
      if (opcoes.falhaNoUpdate === updates) return { data: null, error: { message: "boom" } };
      return { data: opcoes.semLinha ? [] : [{ id: "p1" }], error: null };
    }
    if (c.colunas === "extra") return { data: [{ extra: { campo_antigo: "x", notes: "velha" } }], error: null };
    return {
      data: [{ id: "p1", display_name: "Ana", created_at: "2026-09-01T10:00:00Z", email: "velho@x.pt", phone: "911", assigned_to: null, client_since: null, closure_result: null }],
      error: null,
    };
  };
}

/** A rpc simulada: a procura da revalidação devolve só a própria pessoa; as outras funções respondem ok. */
function rpcPadrao(sobre: Record<string, unknown> = {}) {
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome in sobre) return sobre[nome];
    if (nome === "neg_procurar_duplicados") return { data: [{ pessoa: 1, campo: "email", ambito: "organizacao", entity_id: "p1", nome: "Ana", visivel: true }], error: null };
    return { data: { mudou: true }, error: null };
  });
}

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = { anew_entities: entidades(), anew_users: [] };
  rpcPadrao();
});

describe("atualizarPessoaExistente: a ordem e os parâmetros", () => {
  it("revalida, substitui email e telefone na entidade e junta os campos ao extra, por esta ordem", async () => {
    const r = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    expect(r).toEqual({ tipo: "atualizada", feito: ["contacto", "lead"] });
    expect(chamadasRpc()).toEqual(["neg_procurar_duplicados"]);
    const [contacto, extra] = escritas();
    expect(contacto.dados).toEqual({ email: "ana@novo.pt", phone: "+351 912 000 111" });
    expect(valorDoFiltro(contacto, "eq", "id")).toBe("p1");
    expect(valorDoFiltro(contacto, "eq", "organization_id")).toBe(ORG);
    const leitura = supabaseFalso.chamadasA("anew_entities", "select").find((c) => c.colunas === "extra")!;
    expect(valorDoFiltro(leitura, "eq", "id")).toBe("p1");
    expect(valorDoFiltro(leitura, "eq", "organization_id")).toBe(ORG);
    expect(valorDoFiltro(extra, "eq", "id")).toBe("p1");
    expect(valorDoFiltro(extra, "eq", "organization_id")).toBe(ORG);
    // os campos novos juntam-se por cima dos antigos; _assigned_to nunca vai para o extra
    expect(extra.dados).toEqual({ extra: { campo_antigo: "x", notes: "nova nota", first_name: "Ana" } });
  });

  it("nunca lê nem escreve as tabelas antigas (leads, clientes, satélites de contacto) nem chama neg_substituir_contacto", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    for (const tabela of ["anew_leads", "anew_clients", "anew_entity_emails", "anew_entity_phones"]) {
      expect(supabaseFalso.chamadasA(tabela)).toEqual([]);
    }
    expect(chamadasRpc()).not.toContain("neg_substituir_contacto");
  });

  it("só o telefone a substituir: o email não vai na escrita", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, email: null } });
    expect(escritas()[0].dados).toEqual({ phone: "+351 912 000 111" });
  });

  it("sem contacto a substituir não escreve o contacto nem gasta uma procura", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, email: null, telefone: null } });
    expect(chamadasRpc()).toEqual([]);
    expect(escritas()).toHaveLength(1);
    expect(escritas()[0].dados).toHaveProperty("extra");
  });

  it("um comercial escolhido passa a responsável pela função neg_atribuir_pessoa, nunca por UPDATE", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: { ...VALORES, _assigned_to: "u9" }, plano: PLANO });
    expect(supabaseFalso.rpc).toHaveBeenLastCalledWith("neg_atribuir_pessoa", { p_organization_id: ORG, p_entity_id: "p1", p_assigned_to: "u9" });
    for (const e of escritas()) expect(e.dados).not.toHaveProperty("assigned_to");
  });

  it("sem comercial escolhido não chama neg_atribuir_pessoa", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    expect(chamadasRpc()).not.toContain("neg_atribuir_pessoa");
  });
});

describe("atualizarPessoaExistente: reabrir", () => {
  it("a lead já não tem estado: nunca se escreve um status, mesmo a pedir reabrir a lead", async () => {
    await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, reabrirLead: true } });
    for (const e of escritas()) expect(e.dados).not.toHaveProperty("status");
  });

  it("abordagem encerrada: chama neg_reabrir_abordagem com o id da entidade, depois da lead", async () => {
    const r = await atualizarPessoaExistente({
      organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, reabrirAbordagem: true },
    });
    expect(r).toEqual({ tipo: "atualizada", feito: ["contacto", "lead", "abordagem"] });
    expect(supabaseFalso.rpc).toHaveBeenLastCalledWith("neg_reabrir_abordagem", {
      p_organization_id: ORG, p_entity_id: "p1", p_motivo: null, p_lead_id: "p1",
    });
  });
});

describe("atualizarPessoaExistente: falhas", () => {
  it("caso 14: o contacto novo é de outra pessoa: devolve o conflito e não grava nada", async () => {
    rpcPadrao({
      neg_procurar_duplicados: { data: [{ pessoa: 1, campo: "telefone", ambito: "organizacao", entity_id: "p2", nome: "Bea", visivel: true }], error: null },
    });
    const r = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO });
    expect(r.tipo).toBe("conflito");
    expect(chamadasRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(escritas()).toEqual([]);
  });

  it("caso 15: a revalidação falha: lança e não grava nada (fail-closed)", async () => {
    rpcPadrao({ neg_procurar_duplicados: { data: null, error: { code: "57014", message: "timeout" } } });
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(chamadasRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(escritas()).toEqual([]);
  });

  it("23505 no contacto (apareceu um dono entretanto): lança o ErroNeg NG019 e nada mais se grava", async () => {
    supabaseFalso.estado.tabelas.anew_entities = (c) => (c.operacao === "update"
      ? { data: null, error: { code: "23505", message: "duplicate key" } } : entidades()(c));
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe("NG019");
    expect(escritas()).toHaveLength(1);
  });

  it("a entidade não foi atualizada (nenhuma linha): é uma falha, não um sucesso em silêncio", async () => {
    supabaseFalso.estado.tabelas.anew_entities = entidades({ semLinha: true });
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(escritas()).toHaveLength(1);
  });

  it("falha ao juntar ao extra depois do contacto: aviso parcial com o que ficou feito e o que falhou", async () => {
    supabaseFalso.estado.tabelas.anew_entities = entidades({ falhaNoUpdate: 2 });
    const erro = await atualizarPessoaExistente({ organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: PLANO }).catch((e) => e);
    expect(erro).toBeInstanceOf(AtualizacaoParcial);
    expect(erro.feito).toEqual(["contacto"]);
    expect(erro.falhou).toBe("lead");
    expect(erro.erro).toBeInstanceOf(ErroNeg);
  });

  it("falha a reabrir a abordagem depois da lead: parcial com contacto e lead feitos", async () => {
    rpcPadrao({ neg_reabrir_abordagem: { data: null, error: { code: "NG003", message: "x" } } });
    const erro = await atualizarPessoaExistente({
      organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, reabrirAbordagem: true },
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(AtualizacaoParcial);
    expect(erro.feito).toEqual(["contacto", "lead"]);
    expect(erro.falhou).toBe("abordagem");
    expect(erro.erro.codigo).toBe("NG003");
  });

  it("sem contacto e a leitura do extra falha logo: não há nada feito, lança o erro simples (não parcial)", async () => {
    supabaseFalso.estado.erros["anew_entities.select"] = { message: "boom" };
    const erro = await atualizarPessoaExistente({
      organizationId: ORG, entityId: "p1", escrito: ESCRITO, valores: VALORES, plano: { ...PLANO, email: null, telefone: null },
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro).not.toBeInstanceOf(AtualizacaoParcial);
  });
});

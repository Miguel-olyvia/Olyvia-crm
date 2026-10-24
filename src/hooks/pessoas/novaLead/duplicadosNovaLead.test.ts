// A procura de duplicados da «Nova lead»: neg_procurar_duplicados (o NIF só por hash, pela Edge Function) e a leitura de cada pessoa
// encontrada com a sessão de quem cria (só select, sempre com a organização). O Supabase é simulado; nada vai à rede.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { CHAVES_ERRO_NEG } from "../errosNeg";
import { supabaseFalso, valorDoFiltro } from "./supabaseFalso";
import { identificadoresVerificaveis, procurarDuplicados } from "./duplicadosNovaLead";
import type { Escrito } from "./tiposNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const ORG = "org-nike";
const ESCRITO: Escrito = { nome: "Ana Lopes", email: "ana@x.pt", telefone: "+351 912 345 678", nif: null };
const linha = (sobre: Record<string, unknown> = {}) => ({
  pessoa: 1, campo: "email", ambito: "organizacao", entity_id: "p1", nome: "Ana Lopes", visivel: true, organizacao_id: ORG, organizacao_nome: null, ...sobre,
});

const ENTIDADE = {
  id: "p1", display_name: "Ana Lopes", created_at: "2026-09-01T10:00:00Z", email: "ana@x.pt", phone: "911 222 333",
  assigned_to: "u1", client_since: null, closure_result: null,
};

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = { anew_entities: [ENTIDADE], anew_users: [{ id: "u1", name: "Rui Costa" }] };
});

describe("identificadoresVerificaveis: só o que a base aceita", () => {
  it("envia email e telefone bem formados, aparados, e o NIF só se tiver algum dígito", () => {
    expect(identificadoresVerificaveis({ nome: "x", email: " Ana@X.pt ", telefone: " +351 912 345 678 ", nif: "123 456 789" }))
      .toEqual({ email: "Ana@X.pt", telefone: "+351 912 345 678", nif: "123 456 789" });
  });

  it("um telefone curto, um email sem ponto ou um NIF só com letras não se enviam (a base daria NG009)", () => {
    expect(identificadoresVerificaveis({ nome: "x", email: "a@b", telefone: "+35191", nif: "abc" })).toEqual({ email: null, telefone: null, nif: null });
    expect(identificadoresVerificaveis({ nome: "x", email: null, telefone: "1234567890123456", nif: null }).telefone).toBeNull();
  });
});

describe("procurarDuplicados: o que se chama", () => {
  it("sem NIF chama neg_procurar_duplicados com os parâmetros exatos e sem hash", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [], error: null });
    const r = await procurarDuplicados(ORG, ESCRITO);
    expect(supabaseFalso.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("neg_procurar_duplicados", {
      p_organization_id: ORG, p_email: "ana@x.pt", p_telefone: "+351 912 345 678", p_nif_hash: null, p_pais: "PT",
    });
    expect(supabaseFalso.functions.invoke).not.toHaveBeenCalled();
    expect(r).toEqual({ pessoas: [], grupo: [] });
  });

  it("com NIF passa pela Edge Function (o hash calcula-se no servidor) e nunca chama a RPC com o NIF", async () => {
    supabaseFalso.functions.invoke.mockResolvedValue({ data: { success: true, data: [] }, error: null });
    await procurarDuplicados(ORG, { ...ESCRITO, nif: "123456789" });
    expect(supabaseFalso.functions.invoke).toHaveBeenCalledWith("neg-procurar-duplicados-proxy", {
      body: { orgId: ORG, email: "ana@x.pt", phone: "+351 912 345 678", nif: "123456789", countryCode: "PT" },
    });
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
  });

  it("sem nada verificável não chama a base nem gasta uma tentativa", async () => {
    const r = await procurarDuplicados(ORG, { nome: "Ana", email: null, telefone: "+35191", nif: null });
    expect(r).toEqual({ pessoas: [], grupo: [] });
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
    expect(supabaseFalso.functions.invoke).not.toHaveBeenCalled();
  });
});

describe("procurarDuplicados: o que se devolve", () => {
  it("agrupa as linhas da mesma pessoa e lê a entidade UMA vez, com a organização e só as vivas", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha(), linha({ campo: "telefone" })], error: null });
    const r = await procurarDuplicados(ORG, ESCRITO);
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]).toMatchObject({
      entityId: "p1", nome: "Ana Lopes", visivel: true, campos: ["email", "telefone"], emailPrincipal: "ana@x.pt",
      emails: ["ana@x.pt"], telefonePrincipal: "911 222 333", telefones: ["911 222 333"],
      temCliente: false, clienteAtivo: false, criadaEm: "2026-09-01T10:00:00Z",
    });
    // a lead é a própria entidade (sem client_since): uma só, com o id da entidade
    expect(r.pessoas[0].leads).toEqual([{
      id: "p1", estado: "new", encerrada: false, motivoEncerramento: null, criadaEm: "2026-09-01T10:00:00Z", atribuidoA: "Rui Costa",
    }]);
    const leituras = supabaseFalso.chamadasA("anew_entities", "select");
    expect(leituras).toHaveLength(1);
    expect(valorDoFiltro(leituras[0], "eq", "organization_id")).toBe(ORG);
    expect(leituras[0].filtros).toContainEqual(["is", ["deleted_at", null]]);
    // nunca lê as tabelas antigas
    for (const tabela of ["anew_leads", "anew_clients", "anew_entity_emails", "anew_entity_phones"]) {
      expect(supabaseFalso.chamadasA(tabela)).toEqual([]);
    }
    // só leituras: nunca escreve
    expect(supabaseFalso.estado.chamadas.every((c) => c.operacao === "select")).toBe(true);
  });

  it("closure_result preenchido: a lead está encerrada e guarda o resultado; client_since preenchido: é cliente e já não há lead", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha()], error: null });
    supabaseFalso.estado.tabelas.anew_entities = [{ ...ENTIDADE, closure_result: "semInteresse", assigned_to: null }];
    const p = (await procurarDuplicados(ORG, ESCRITO)).pessoas[0];
    expect(p.leads[0]).toMatchObject({ encerrada: true, motivoEncerramento: "semInteresse", atribuidoA: null });
    expect(p).toMatchObject({ temCliente: false, clienteAtivo: false });

    supabaseFalso.estado.tabelas.anew_entities = [{ ...ENTIDADE, client_since: "2026-10-02" }];
    expect((await procurarDuplicados(ORG, ESCRITO)).pessoas[0]).toMatchObject({ temCliente: true, clienteAtivo: true, leads: [] });
  });

  it("sem email nem telefone na entidade: listas vazias e principais a null", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha()], error: null });
    supabaseFalso.estado.tabelas.anew_entities = [{ ...ENTIDADE, email: null, phone: "  " }];
    expect((await procurarDuplicados(ORG, ESCRITO)).pessoas[0]).toMatchObject({ emailPrincipal: null, emails: [], telefonePrincipal: null, telefones: [] });
  });

  it("uma pessoa que a RLS esconde vem sem id nem nome e não gera leituras", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha({ entity_id: null, nome: null, visivel: false })], error: null });
    const r = await procurarDuplicados(ORG, ESCRITO);
    expect(r.pessoas).toEqual([expect.objectContaining({ entityId: null, nome: null, visivel: false, campos: ["email"], leads: [] })]);
    expect(supabaseFalso.estado.chamadas).toHaveLength(0);
  });

  it("as linhas do grupo viram «outras empresas», agrupadas por organização, sem pessoa", async () => {
    supabaseFalso.rpc.mockResolvedValue({
      data: [
        linha({ pessoa: null, ambito: "grupo", entity_id: null, nome: null, visivel: null, organizacao_id: "o2", organizacao_nome: "Loja Norte", campo: "email" }),
        linha({ pessoa: null, ambito: "grupo", entity_id: null, nome: null, visivel: null, organizacao_id: "o2", organizacao_nome: "Loja Norte", campo: "telefone" }),
        linha({ pessoa: null, ambito: "grupo", entity_id: null, nome: null, visivel: null, organizacao_id: "o3", organizacao_nome: "Loja Sul", campo: "nif" }),
      ],
      error: null,
    });
    const r = await procurarDuplicados(ORG, ESCRITO);
    expect(r.pessoas).toEqual([]);
    expect(r.grupo).toEqual([
      { organizacaoId: "o2", nome: "Loja Norte", campos: ["email", "telefone"] },
      { organizacaoId: "o3", nome: "Loja Sul", campos: ["nif"] },
    ]);
    expect(supabaseFalso.estado.chamadas).toHaveLength(0);
  });

  it("uma resposta que não é uma lista, ou linhas sem campo conhecido, não rebenta nem inventa pessoas", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: null, error: null });
    expect(await procurarDuplicados(ORG, ESCRITO)).toEqual({ pessoas: [], grupo: [] });
    supabaseFalso.rpc.mockResolvedValue({ data: [linha({ campo: "morada" }), "lixo", null], error: null });
    expect(await procurarDuplicados(ORG, ESCRITO)).toEqual({ pessoas: [], grupo: [] });
  });
});

describe("procurarDuplicados: falhas (nunca se cria a seguir a uma falha)", () => {
  it("NG020 (demasiadas verificações) sobe como ErroNeg com a chave do código", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: null, error: { code: "NG020", message: "Demasiadas verificações" } });
    const erro = await procurarDuplicados(ORG, ESCRITO).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe("NG020");
    expect(erro.chave).toBe(CHAVES_ERRO_NEG.NG020);
  });

  it("a Edge Function a responder com um código NG020 sobe com a mesma chave", async () => {
    supabaseFalso.functions.invoke.mockResolvedValue({ data: { success: false, code: "NG020", error: "x" }, error: null });
    const erro = await procurarDuplicados(ORG, { ...ESCRITO, nif: "123456789" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(erro.codigo).toBe("NG020");
  });

  it("a Edge Function que falha ou responde mal dá um ErroNeg genérico", async () => {
    supabaseFalso.functions.invoke.mockResolvedValue({ data: null, error: new Error("rede") });
    const a = await procurarDuplicados(ORG, { ...ESCRITO, nif: "123456789" }).catch((e) => e);
    expect(a).toBeInstanceOf(ErroNeg);
    expect(a.codigo).toBeNull();
    supabaseFalso.functions.invoke.mockResolvedValue({ data: { success: false }, error: null });
    expect(await procurarDuplicados(ORG, { ...ESCRITO, nif: "123456789" }).catch((e) => e)).toBeInstanceOf(ErroNeg);
  });

  it("se a leitura de uma pessoa falha, falha tudo (não se mostra um diálogo pela metade)", async () => {
    supabaseFalso.rpc.mockResolvedValue({ data: [linha()], error: null });
    supabaseFalso.estado.erros["anew_entities.select"] = { message: "boom" };
    const erro = await procurarDuplicados(ORG, ESCRITO).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
  });
});

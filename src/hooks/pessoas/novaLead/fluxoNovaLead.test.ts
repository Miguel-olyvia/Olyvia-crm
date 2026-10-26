// Preparar a lead (validar e extrair nome, email, telefone e NIF) e gravá-la: cópia do fluxo de Leads para uma pessoa NOVA. Parâmetros
// exatos de cada função da base; nunca se chama rpc_create_lead_duplicate_override nem link_entity_to_org nem se reutiliza uma pessoa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseFalso } from "./supabaseFalso";
import { criarNegocioNovaLead } from "./criarNegocioNovaLead";
import { extrairDados, prepararLead, camposBase, type DefinicaoCampo } from "./fluxoNovaLead";
import { gravarNovaLead, FalhaGravar, NegocioNaoCriado, type PedidoGravar } from "./gravarNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const t = (k: string) => k;
const BASE = camposBase(t);
const campo = (sobre: Partial<DefinicaoCampo>): DefinicaoCampo => ({
  id: "c", field_key: "x", field_label: "X", field_type: "text", is_required: false, ...sobre,
});

describe("camposBase: os seis campos de Leads (sem morada, por RGPD)", () => {
  it("nome próprio e apelido obrigatórios; email, telefone, empresa e notas opcionais", () => {
    expect(BASE.map((c) => [c.field_key, c.field_type, c.is_required])).toEqual([
      ["first_name", "text", true], ["last_name", "text", true], ["email", "email", false], ["phone", "phone", false],
      ["company_name", "text", false], ["notes", "textarea", false],
    ]);
  });
});

describe("prepararLead", () => {
  it("valida só os campos visíveis: os que a campanha cobre não se exigem nem se gravam", () => {
    const campanha = [campo({ id: "n", field_key: "po_nome", field_label: "Nome", contact_field_mapping: "first_name", is_required: true })];
    const p = prepararLead({ base: BASE, campanha, valores: { po_nome: "Ana", first_name: "Fantasma", email: "ana@x.pt", last_name: "Lopes" } });
    expect(p.erros).toEqual([]);
    expect(p.valores).not.toHaveProperty("first_name");
    expect(p.valores).toMatchObject({ po_nome: "Ana", email: "ana@x.pt" });
  });

  it("campos obrigatórios em falta dão erros (nunca um «-» solto)", () => {
    const p = prepararLead({ base: BASE, campanha: [], valores: { first_name: "-", last_name: "" } });
    expect(p.erros.map((e) => e.fieldKey).sort()).toEqual(["first_name", "last_name"]);
  });

  it("devolve o que se escreveu para procurar duplicados", () => {
    const p = prepararLead({ base: BASE, campanha: [], valores: { first_name: "Ana", last_name: "Lopes", email: " ANA@x.pt ", phone: "+351912345678" } });
    expect(p.escrito).toEqual({ nome: "Ana Lopes", email: "ana@x.pt", telefone: "+351912345678", nif: null });
  });
});

describe("extrairDados", () => {
  it("nome por mapeamento, email em minúsculas, telefone aparado e NIF em maiúsculas", () => {
    const defs = [
      campo({ field_key: "a", contact_field_mapping: "first_name" }), campo({ field_key: "b", contact_field_mapping: "last_name" }),
      campo({ field_key: "po_email", field_type: "email" }), campo({ field_key: "po_telefone", field_type: "phone" }),
      campo({ field_key: "nif_cliente", contact_field_mapping: "vat" }),
    ];
    const d = extrairDados(defs, { a: "Ana", b: "Lopes Silva", po_email: " Ana@X.pt ", po_telefone: " +351912345678 ", nif_cliente: " pt123 " });
    expect(d).toEqual({
      displayName: "Ana Lopes Silva", firstName: "Ana", lastName: "Lopes Silva", email: "ana@x.pt", telefone: "+351912345678", nif: "PT123",
    });
  });

  it("sem nome usa o email, depois o telefone e por fim «Lead sem nome»", () => {
    expect(extrairDados([campo({ field_key: "email", field_type: "email" })], { email: "a@b.pt" }).displayName).toBe("a@b.pt");
    expect(extrairDados([campo({ field_key: "phone", field_type: "phone" })], { phone: "+351912345678" }).displayName).toBe("+351912345678");
    expect(extrairDados([], {}).displayName).toBe("Lead sem nome");
  });

  it("sem mapeamento divide o nome completo no primeiro espaço", () => {
    const d = extrairDados([campo({ field_key: "nome_completo", contact_field_mapping: "full_name" })], { nome_completo: "Ana Maria Lopes" });
    expect(d).toMatchObject({ firstName: "Ana", lastName: "Maria Lopes" });
  });
});

const PEDIDO: PedidoGravar = {
  organizationId: "org-nike",
  rootOrganizationId: "raiz",
  dados: { displayName: "  Ana Lopes ", firstName: "Ana", lastName: "Lopes", email: "ana@x.pt", telefone: "+351912345678", nif: "" },
  valores: { first_name: "Ana", last_name: "Lopes", _assigned_to: "u1", notes: "n" },
  origemId: null,
  origemNome: "manual",
  campanhaId: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inseridas = () => supabaseFalso.chamadasA("anew_entities", "insert");
const nomesRpc = () => supabaseFalso.rpc.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = { anew_entities: (c) => (c.operacao === "insert" ? { data: [{ id: "ent-1" }], error: null } : { data: [], error: null }) };
  supabaseFalso.rpc.mockImplementation(async () => ({ data: { mudou: true }, error: null }));
});

describe("gravarNovaLead: pessoa nova (a lead é a própria entidade)", () => {
  it("insere UMA linha em anew_entities com a organização, o nome, o contacto, o extra, a origem e a campanha", async () => {
    const r = await gravarNovaLead({ ...PEDIDO, origemId: "src-1", origemNome: "Feira", campanhaId: "camp-1" });
    expect(r).toEqual({ entityId: "ent-1", leadId: "ent-1", negocioId: expect.stringMatching(UUID) });
    expect(inseridas()).toHaveLength(1);
    expect(inseridas()[0].dados).toEqual({
      organization_id: "org-nike", type: "person", display_name: "Ana Lopes", first_name: "Ana", last_name: "Lopes",
      email: "ana@x.pt", phone: "+351912345678", extra: { first_name: "Ana", last_name: "Lopes", notes: "n" },
      origin_id: "src-1", campaign_id: "camp-1",
    });
    expect(inseridas()[0].colunas).toBeNull();
  });

  it("o comercial escolhido atribui-se pela função da base, depois do insert; _assigned_to nunca vai para o extra nem para uma coluna", async () => {
    await gravarNovaLead(PEDIDO);
    expect(nomesRpc()).toEqual(["neg_atribuir_pessoa", "neg_criar_negocio"]);
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("neg_atribuir_pessoa", { p_organization_id: "org-nike", p_entity_id: "ent-1", p_assigned_to: "u1" });
    const dados = inseridas()[0].dados as Record<string, unknown>;
    expect(dados).not.toHaveProperty("assigned_to");
    expect(dados.extra).not.toHaveProperty("_assigned_to");
  });

  it("sem comercial, sem email nem telefone, sem origem nem campanha: colunas a null e só o negócio como função da base", async () => {
    await gravarNovaLead({ ...PEDIDO, dados: { ...PEDIDO.dados, email: "", telefone: "" }, valores: { first_name: "Ana" } });
    expect(inseridas()[0].dados).toMatchObject({ email: null, phone: null, origin_id: null, campaign_id: null, extra: { first_name: "Ana" } });
    expect(nomesRpc()).toEqual(["neg_criar_negocio"]);
  });

  it("depois da pessoa (e da atribuição) cria o negócio com neg_criar_negocio: título = nome da pessoa, fecho contrato, sem reabrir", async () => {
    const r = await gravarNovaLead(PEDIDO);
    expect(nomesRpc()).toEqual(["neg_atribuir_pessoa", "neg_criar_negocio"]);
    expect(supabaseFalso.rpc).toHaveBeenLastCalledWith("neg_criar_negocio", {
      p_id: r.negocioId, p_organization_id: "org-nike", p_entity_id: "ent-1", p_titulo: "Ana Lopes", p_fecho: "contrato", p_reabrir_abordagem: false,
    });
    expect(r.negocioId).toMatch(UUID);
  });

  it("neg_criar_lead continua proibida (a lead é a pessoa; o negócio nasce por neg_criar_negocio)", async () => {
    await gravarNovaLead(PEDIDO);
    expect(nomesRpc()).not.toContain("neg_criar_lead");
    expect(nomesRpc()).toContain("neg_criar_negocio");
  });

  it("nunca usa as funções nem as tabelas antigas (create_lead_entity_for_org, rpc_create_lead_manual, ensure_entity_org_link, satélites, leads)", async () => {
    await gravarNovaLead(PEDIDO);
    for (const proibida of ["create_lead_entity_for_org", "rpc_create_lead_manual", "ensure_entity_org_link", "rpc_create_lead_duplicate_override", "link_entity_to_org", "neg_criar_lead"]) {
      expect(nomesRpc()).not.toContain(proibida);
    }
    for (const tabela of ["anew_leads", "anew_clients", "anew_entity_emails", "anew_entity_phones"]) {
      expect(supabaseFalso.chamadasA(tabela)).toEqual([]);
    }
    expect(supabaseFalso.functions.invoke).not.toHaveBeenCalled();
  });
});

describe("gravarNovaLead: falhas e limpeza", () => {
  it("o insert falha (por exemplo 42501): lança FalhaGravar, sem limpeza e sem atribuir ninguém", async () => {
    supabaseFalso.estado.erros["anew_entities.insert"] = { code: "42501", message: "denied" };
    const erro = await gravarNovaLead(PEDIDO).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaGravar);
    expect(erro.limpezaFalhou).toBe(false);
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
    expect(supabaseFalso.chamadasA("anew_entities", "delete")).toEqual([]);
  });

  it("uma resposta sem id de pessoa é um erro (nunca se atribui sem pessoa)", async () => {
    supabaseFalso.estado.tabelas = { anew_entities: () => ({ data: [], error: null }) };
    const erro = await gravarNovaLead(PEDIDO).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaGravar);
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
  });

  it("a atribuição falha depois de a pessoa criada: apaga a pessoa criada nesta ação (e só essa)", async () => {
    supabaseFalso.rpc.mockImplementation(async () => ({ data: null, error: { code: "42501", message: "sem permissão" } }));
    const erro = await gravarNovaLead(PEDIDO).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaGravar);
    expect(erro.limpezaFalhou).toBe(false);
    const apagar = supabaseFalso.chamadasA("anew_entities", "delete");
    expect(apagar).toHaveLength(1);
    expect(apagar[0].filtros).toContainEqual(["eq", ["id", "ent-1"]]);
  });

  it("o negócio falha depois de a pessoa criada: lança NegocioNaoCriado com a pessoa e o id do negócio, e NÃO apaga a pessoa", async () => {
    supabaseFalso.rpc.mockImplementation(async (nome: string) => (nome === "neg_criar_negocio"
      ? { data: null, error: { code: "42501", message: "sem permissão" } } : { data: { mudou: true }, error: null }));
    const erro = await gravarNovaLead(PEDIDO).catch((e) => e);
    expect(erro).toBeInstanceOf(NegocioNaoCriado);
    expect(erro.entityId).toBe("ent-1");
    expect(erro.negocioId).toMatch(UUID);
    expect(supabaseFalso.chamadasA("anew_entities", "delete")).toEqual([]);
    expect(inseridas()).toHaveLength(1);
  });

  it("repetir só o negócio (criarNegocioNovaLead) reusa o mesmo id e nunca insere outra pessoa", async () => {
    supabaseFalso.rpc.mockImplementationOnce(async () => ({ data: { mudou: true }, error: null }));
    supabaseFalso.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "boom" } }));
    const erro = await gravarNovaLead(PEDIDO).catch((e) => e);
    expect(erro).toBeInstanceOf(NegocioNaoCriado);
    await criarNegocioNovaLead({ organizationId: "org-nike", entityId: erro.entityId, negocioId: erro.negocioId, titulo: "Ana Lopes" });
    const criar = supabaseFalso.rpc.mock.calls.filter((c) => c[0] === "neg_criar_negocio");
    expect(criar).toHaveLength(2);
    expect(criar[1][1]).toEqual(criar[0][1]);
    expect(inseridas()).toHaveLength(1);
  });

  it("se a limpeza também falha, diz-se (limpezaFalhou)", async () => {
    supabaseFalso.rpc.mockImplementation(async () => ({ data: null, error: { message: "boom" } }));
    supabaseFalso.estado.erros["anew_entities.delete"] = { message: "sem permissão" };
    const erro = await gravarNovaLead(PEDIDO).catch((e) => e);
    expect(erro.limpezaFalhou).toBe(true);
  });
});

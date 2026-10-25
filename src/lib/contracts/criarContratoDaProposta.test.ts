// Criar o contrato a partir da proposta aceite, no guia do negócio: as mesmas leituras e a mesma gravação que a página de contratos faz
// (a entidade e o cliente da proposta, a organização de topo, o texto da minuta com as respostas, e `rpc_create_client_contract` ou, dentro
// de um negócio, `neg_criar_contrato`). A base está simulada.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tabelas: {} as Record<string, { data: unknown; error: unknown }>,
  filtros: [] as Array<{ tabela: string; op: string; args: unknown[] }>,
  rpc: vi.fn(),
  user: { valor: { id: "auth-1" } as { id: string } | null },
  negocioUser: { valor: "biz-1" as string | null },
  dados: vi.fn(),
}));

function cadeia(tabela: string) {
  const c: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "is"]) {
    c[op] = (...args: unknown[]) => { h.filtros.push({ tabela, op, args }); return c; };
  }
  const resultado = () => h.tabelas[tabela] ?? { data: null, error: null };
  c.maybeSingle = () => Promise.resolve(resultado());
  c.single = () => Promise.resolve(resultado());
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => cadeia(t), rpc: (...a: unknown[]) => h.rpc(...a), auth: { getUser: () => Promise.resolve({ data: { user: h.user.valor }, error: null }) } },
}));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: () => Promise.resolve(h.negocioUser.valor) }));
vi.mock("@/components/contracts/contractDocument", () => ({
  gatherContractData: (...a: unknown[]) => h.dados(...a),
  injectSignatoryIntoSignatureBlock: (html: string, nome: string) => `${html}[assina:${nome}]`,
}));

import { criarContratoDaProposta } from "./criarContratoDaProposta";

const PEDIDO = {
  propostaId: "p1", organizationId: "org-1", negocioId: null as string | null, templateId: "t1",
  startDate: "2026-11-01", endDate: "2027-11-01", notes: "n", paymentTerms: "30 dias", promptValues: { prazo: "10 dias" },
  permissoes: ["client_contracts.create"] as readonly string[] | undefined,
};

beforeEach(() => {
  h.filtros.length = 0;
  h.rpc.mockReset().mockImplementation((nome: string) => Promise.resolve({ data: nome === "set_audit_context" ? null : "c-novo", error: null }));
  h.dados.mockReset().mockResolvedValue({ signatario_nome: "Ana", signatario_cargo: "Gerente" });
  h.user.valor = { id: "auth-1" };
  h.negocioUser.valor = "biz-1";
  h.tabelas = {
    proposals: { data: { id: "p1", entity_id: "e1", deal_id: null, quotes: [{ total: 100 }, { total: 50.5 }] }, error: null },
    anew_clients: { data: [{ id: "cl1", entity_id: "e1" }], error: null },
    anew_hierarchy: { data: [{ parent_org_id: "raiz", child_org_id: "org-1" }], error: null },
    client_contract_templates: { data: { body_html: "<p>{{prazo}}</p>" }, error: null },
  };
});

const chamadaDe = (nome: string) => h.rpc.mock.calls.find((c) => c[0] === nome);

describe("criarContratoDaProposta", () => {
  it("fora de um negócio grava por rpc_create_client_contract com o cliente, a entidade, o total e a organização de topo", async () => {
    const r = await criarContratoDaProposta(PEDIDO);
    expect(r).toEqual({ id: "c-novo", ligadoAoNegocio: false });
    expect(chamadaDe("neg_criar_contrato")).toBeUndefined();
    expect(chamadaDe("set_audit_context")?.[1]).toEqual({ p_user_id: "biz-1", p_source: "ui" });
    expect(chamadaDe("rpc_create_client_contract")?.[1]).toEqual(expect.objectContaining({
      p_client_id: "cl1", p_entity_id: "e1", p_organization_id: "org-1", p_root_organization_id: "raiz", p_proposal_id: "p1",
      p_contract_template_id: "t1", p_total_value: 150.5, p_currency: "EUR", p_start_date: "2026-11-01", p_end_date: "2027-11-01",
      p_notes: "n", p_payment_terms: "30 dias", p_prompt_values: { prazo: "10 dias" },
    }));
  });

  it("a minuta leva as respostas e o signatário, e guarda também o texto original", async () => {
    await criarContratoDaProposta(PEDIDO);
    const p = chamadaDe("rpc_create_client_contract")?.[1] as Record<string, unknown>;
    expect(p.p_contract_body_html).toBe("<p>{{prazo}}</p>");
    expect(p.p_final_body_html).toBe("<p>10 dias</p>[assina:Ana]");
  });

  it("dentro de um negócio grava por neg_criar_contrato, com o negócio, e o contrato nasce ligado", async () => {
    const r = await criarContratoDaProposta({ ...PEDIDO, negocioId: "n1" });
    expect(r).toEqual({ id: "c-novo", ligadoAoNegocio: true });
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
    expect(chamadaDe("neg_criar_contrato")?.[1]).toEqual(expect.objectContaining({ p_negocio_id: "n1", p_proposal_id: "p1" }));
  });

  it("sem minuta nem respostas manda os campos a nulo", async () => {
    h.tabelas.client_contract_templates = { data: null, error: null };
    await criarContratoDaProposta({ ...PEDIDO, templateId: "", promptValues: {} });
    const p = chamadaDe("rpc_create_client_contract")?.[1] as Record<string, unknown>;
    expect(p).toEqual(expect.objectContaining({ p_contract_template_id: null, p_contract_body_html: null, p_final_body_html: null, p_prompt_values: null }));
  });

  it("se a leitura da minuta falha, lança o erro e não cria o contrato sem texto", async () => {
    const erro = { code: "42501", message: "sem acesso" };
    h.tabelas.client_contract_templates = { data: null, error: erro };
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toBe(erro);
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });

  it("com minuta escolhida mas sem texto (vazio ou nulo) lança e não cria o contrato", async () => {
    for (const data of [{ body_html: "" }, { body_html: null }, null]) {
      h.tabelas.client_contract_templates = { data, error: null };
      await expect(criarContratoDaProposta(PEDIDO)).rejects.toThrow("minuta");
    }
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });

  it("sem client_contracts.create na lista recusa-se sem gravar, sem lista conhecida também (falha fechada); com ela grava", async () => {
    await expect(criarContratoDaProposta({ ...PEDIDO, permissoes: ["proposals.edit"] })).rejects.toThrow("permissão");
    await expect(criarContratoDaProposta({ ...PEDIDO, permissoes: undefined })).rejects.toThrow("permissões");
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
    expect(chamadaDe("set_audit_context")).toBeUndefined();
    await expect(criarContratoDaProposta({ ...PEDIDO, permissoes: ["client_contracts.create"] })).resolves.toEqual({ id: "c-novo", ligadoAoNegocio: false });
  });

  it("uma proposta sem cliente mas com entidade cria o contrato com o cliente nulo (assinar converte-o)", async () => {
    h.tabelas.anew_clients = { data: [], error: null };
    await criarContratoDaProposta(PEDIDO);
    expect(chamadaDe("rpc_create_client_contract")?.[1]).toEqual(expect.objectContaining({ p_client_id: null, p_entity_id: "e1" }));
  });

  it("a entidade vem do negócio comercial (deal) da proposta quando a proposta não a traz", async () => {
    h.tabelas.proposals = { data: { id: "p1", entity_id: null, deal_id: "d1", quotes: [] }, error: null };
    h.tabelas.deals = { data: [{ id: "d1", entity_id: "e9" }], error: null };
    h.tabelas.anew_clients = { data: [], error: null };
    await criarContratoDaProposta(PEDIDO);
    expect(chamadaDe("rpc_create_client_contract")?.[1]).toEqual(expect.objectContaining({ p_entity_id: "e9", p_total_value: 0 }));
  });

  it("sem entidade nem cliente recusa-se com a razão, sem gravar", async () => {
    h.tabelas.proposals = { data: { id: "p1", entity_id: null, deal_id: null, quotes: [] }, error: null };
    h.tabelas.anew_clients = { data: [], error: null };
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toThrow("não há a quem fazer o contrato");
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });

  it("a proposta lê-se só na organização pedida, e se já não existe recusa-se", async () => {
    await criarContratoDaProposta(PEDIDO);
    expect(h.filtros.some((f) => f.tabela === "proposals" && f.op === "eq" && f.args[0] === "organization_id" && f.args[1] === "org-1")).toBe(true);
    h.tabelas.proposals = { data: null, error: null };
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toThrow("já não está disponível");
  });

  it("sem sessão ou sem utilizador de negócio recusa-se; um erro da base propaga-se", async () => {
    h.user.valor = null;
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toThrow();
    h.user.valor = { id: "auth-1" };
    h.negocioUser.valor = null;
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toThrow();
    h.negocioUser.valor = "biz-1";
    const erro = { code: "NG022", message: "x" };
    h.rpc.mockImplementation((nome: string) => Promise.resolve(nome === "set_audit_context" ? { data: null, error: null } : { data: null, error: erro }));
    await expect(criarContratoDaProposta({ ...PEDIDO, negocioId: "n1" })).rejects.toBe(erro);
  });

  it("a organização de topo é a mais acima da cadeia, e sem hierarquia é a própria", async () => {
    h.tabelas.anew_hierarchy = { data: [{ parent_org_id: "b", child_org_id: "org-1" }, { parent_org_id: "a", child_org_id: "b" }], error: null };
    await criarContratoDaProposta(PEDIDO);
    expect(chamadaDe("rpc_create_client_contract")?.[1]).toEqual(expect.objectContaining({ p_root_organization_id: "a" }));
    h.rpc.mockClear();
    h.tabelas.anew_hierarchy = { data: [], error: null };
    await criarContratoDaProposta(PEDIDO);
    expect(chamadaDe("rpc_create_client_contract")?.[1]).toEqual(expect.objectContaining({ p_root_organization_id: "org-1" }));
  });

  it("se a leitura do negócio comercial (deals) falha, lança o erro em vez do falso «sem entidade», e não grava", async () => {
    const erro = { code: "57014", message: "timeout deals" };
    h.tabelas.proposals = { data: { id: "p1", entity_id: null, deal_id: "d1", quotes: [] }, error: null };
    h.tabelas.deals = { data: null, error: erro };
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toBe(erro);
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });

  it("se a leitura do cliente (anew_clients) falha, lança o erro e não cria o contrato com o cliente nulo", async () => {
    const erro = { code: "57014", message: "timeout clientes" };
    h.tabelas.anew_clients = { data: null, error: erro };
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toBe(erro);
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });

  it("se a leitura da hierarquia falha, lança o erro em vez de gravar a própria organização como topo", async () => {
    const erro = { code: "42501", message: "sem acesso à hierarquia" };
    h.tabelas.anew_hierarchy = { data: null, error: erro };
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toBe(erro);
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });

  it("se a base não devolve o identificador do contrato (não é texto) falha em vez de dar null", async () => {
    for (const devolvido of [null, 42, { id: "x" }]) {
      h.rpc.mockImplementation((nome: string) => Promise.resolve({ data: nome === "set_audit_context" ? null : devolvido, error: null }));
      await expect(criarContratoDaProposta(PEDIDO)).rejects.toThrow("identificador");
      await expect(criarContratoDaProposta({ ...PEDIDO, negocioId: "n1" })).rejects.toThrow("identificador");
    }
  });

  it("se o contexto de auditoria não se grava, recusa-se sem criar o contrato", async () => {
    const erro = { message: "rpc falhou" };
    h.rpc.mockImplementation((nome: string) => Promise.resolve(nome === "set_audit_context" ? { data: null, error: erro } : { data: "c-novo", error: null }));
    await expect(criarContratoDaProposta(PEDIDO)).rejects.toBe(erro);
    expect(chamadaDe("rpc_create_client_contract")).toBeUndefined();
  });
});

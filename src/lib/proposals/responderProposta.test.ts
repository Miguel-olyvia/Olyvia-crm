// Aceitar e recusar uma proposta a partir do guia do negócio: as mesmas escritas que a página de propostas faz (etapa «ganha» ou «perdida» da
// organização, estado, data e motivo, cascata para os orçamentos, recálculo do valor e o workflow da etapa). A base está simulada.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  chamadas: [] as Array<{ tabela: string; op: string; args: unknown[] }>,
  tabelas: {} as Record<string, { data: unknown; error: unknown }>,
  rpc: vi.fn(),
  user: { valor: { id: "auth-1" } as { id: string } | null },
  negocioUser: { valor: "biz-1" as string | null },
  workflow: vi.fn(),
}));

function cadeia(tabela: string) {
  const c: Record<string, unknown> = {};
  let escrita = false;
  let globais = false;
  for (const op of ["select", "eq", "is", "order", "update", "in", "limit"]) {
    c[op] = (...args: unknown[]) => {
      if (op === "update") escrita = true;
      if (op === "is") globais = true;
      h.chamadas.push({ tabela, op, args });
      return c;
    };
  }
  const resultado = () => (escrita && h.tabelas[`${tabela}:update`]) || (globais && h.tabelas[`${tabela}:globais`]) || h.tabelas[tabela] || { data: null, error: null };
  c.maybeSingle = () => Promise.resolve(resultado());
  c.single = () => Promise.resolve(resultado());
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => cadeia(t), rpc: (...a: unknown[]) => h.rpc(...a), auth: { getUser: () => Promise.resolve({ data: { user: h.user.valor }, error: null }) } },
}));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: () => Promise.resolve(h.negocioUser.valor) }));
vi.mock("@/lib/proposals/runStageWorkflow", () => ({ runProposalStageWorkflow: (...a: unknown[]) => h.workflow(...a) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { aceitarProposta, recusarProposta } from "./responderProposta";

const ETAPAS = [
  { id: "e-rasc", name: "draft", is_active: true, is_won: false, is_lost: false },
  { id: "e-ganha", name: "accepted", is_active: true, is_won: true, is_lost: false },
  { id: "e-perdida", name: "rejected", is_active: true, is_won: false, is_lost: true },
];
const GLOBAIS = [
  { id: "g-ganha", name: "accepted", is_active: true, is_won: true, is_lost: false },
  { id: "g-perdida", name: "rejected", is_active: true, is_won: false, is_lost: true },
];
const MOTIVO = { reasonId: "r1", code: "preco", label: "Preço", notes: "caro" };
const PERM = ["proposals.edit"];
const PEDIDO = { propostaId: "p1", organizationId: "org-1", permissoes: PERM };

const escritas = (tabela: string) => h.chamadas.filter((c) => c.tabela === tabela && c.op === "update").map((c) => c.args[0]);

beforeEach(() => {
  h.chamadas.length = 0;
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  h.workflow.mockReset().mockResolvedValue(false);
  h.user.valor = { id: "auth-1" };
  h.negocioUser.valor = "biz-1";
  h.tabelas = {
    proposal_workflow_stages: { data: ETAPAS, error: null },
    proposals: { data: { stage_id: "e-rasc" }, error: null },
    "proposals:update": { data: [{ id: "p1" }], error: null },
    quotes: { data: [{ id: "q1" }], error: null },
  };
});

describe("aceitarProposta", () => {
  it("passa a proposta à etapa «ganha» da organização, com estado aceite, e corre o workflow da etapa", async () => {
    const r = await aceitarProposta(PEDIDO);
    expect(r).toEqual({ workflowFailed: false });
    expect(escritas("proposals")).toEqual([expect.objectContaining({ stage_id: "e-ganha", status: "accepted", accepted_at: expect.any(String) })]);
    expect(h.rpc).toHaveBeenCalledWith("set_audit_context", { p_user_id: "biz-1", p_source: "ui" });
    expect(h.workflow).toHaveBeenCalledWith({ entityId: "p1", newStageId: "e-ganha", oldStageId: "e-rasc", organizationId: "org-1", triggeredBy: "auth-1" });
  });

  it("só lê e escreve na proposta da organização pedida", async () => {
    await aceitarProposta(PEDIDO);
    const filtros = h.chamadas.filter((c) => c.tabela === "proposals" && c.op === "eq");
    expect(filtros.some((c) => c.args[0] === "organization_id" && c.args[1] === "org-1")).toBe(true);
  });

  it("diz quando o workflow da etapa falhou, sem desfazer a aceitação", async () => {
    h.workflow.mockResolvedValue(true);
    expect(await aceitarProposta(PEDIDO)).toEqual({ workflowFailed: true });
  });

  it("recusa-se sem sessão, sem utilizador de negócio e sem etapa «ganha», e não escreve nada", async () => {
    h.user.valor = null;
    await expect(aceitarProposta(PEDIDO)).rejects.toThrow();
    h.user.valor = { id: "auth-1" };
    h.negocioUser.valor = null;
    await expect(aceitarProposta(PEDIDO)).rejects.toThrow("Utilizador não identificado");
    h.negocioUser.valor = "biz-1";
    h.tabelas.proposal_workflow_stages = { data: [ETAPAS[0]], error: null };
    await expect(aceitarProposta(PEDIDO)).rejects.toThrow("Aceite");
    expect(escritas("proposals")).toEqual([]);
  });

  it("propaga o erro da base na escrita e não corre o workflow", async () => {
    h.tabelas["proposals:update"] = { data: null, error: { message: "sem permissão" } };
    await expect(aceitarProposta(PEDIDO)).rejects.toBeTruthy();
    expect(h.workflow).not.toHaveBeenCalled();
  });

  it("se a base não alterou nenhuma linha (a RLS recusou sem erro) falha em vez de dizer registado, e não corre o workflow", async () => {
    h.tabelas["proposals:update"] = { data: [], error: null };
    await expect(aceitarProposta(PEDIDO)).rejects.toThrow("não foi alterada");
    expect(h.chamadas.some((c) => c.tabela === "proposals" && c.op === "select" && c.args[0] === "id")).toBe(true);
    expect(h.workflow).not.toHaveBeenCalled();
  });

  it("sem proposals.edit na lista recusa-se sem escrever; com ela grava; sem lista conhecida também recusa (falha fechada)", async () => {
    await expect(aceitarProposta({ ...PEDIDO, permissoes: ["pessoas.edit"] })).rejects.toThrow("permissão");
    expect(escritas("proposals")).toEqual([]);
    expect(h.workflow).not.toHaveBeenCalled();
    await expect(aceitarProposta({ ...PEDIDO, permissoes: undefined })).rejects.toThrow("permissões");
    expect(escritas("proposals")).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalled();
    await expect(aceitarProposta({ ...PEDIDO, permissoes: ["proposals.edit"] })).resolves.toEqual({ workflowFailed: false });
  });

  it("se a leitura das etapas da organização falha, lança o erro e não cai nas globais nem escreve", async () => {
    const erro = { code: "57014", message: "timeout" };
    h.tabelas.proposal_workflow_stages = { data: null, error: erro };
    h.tabelas["proposal_workflow_stages:globais"] = { data: GLOBAIS, error: null };
    await expect(aceitarProposta(PEDIDO)).rejects.toBe(erro);
    expect(escritas("proposals")).toEqual([]);
    expect(h.workflow).not.toHaveBeenCalled();
  });

  it("só usa as etapas globais se a leitura própria correu bem e veio vazia", async () => {
    h.tabelas.proposal_workflow_stages = { data: [], error: null };
    h.tabelas["proposal_workflow_stages:globais"] = { data: GLOBAIS, error: null };
    await aceitarProposta(PEDIDO);
    expect(escritas("proposals")).toEqual([expect.objectContaining({ stage_id: "g-ganha" })]);
  });

  it("com a leitura própria vazia e a das globais a falhar, lança o erro das globais em vez de «Estágio não encontrado»", async () => {
    const erro = { code: "57014", message: "timeout globais" };
    h.tabelas.proposal_workflow_stages = { data: [], error: null };
    h.tabelas["proposal_workflow_stages:globais"] = { data: null, error: erro };
    await expect(aceitarProposta(PEDIDO)).rejects.toBe(erro);
    expect(escritas("proposals")).toEqual([]);
  });

  it("se o contexto de auditoria não se grava, recusa-se sem escrever na proposta", async () => {
    const erro = { message: "rpc falhou" };
    h.rpc.mockResolvedValue({ data: null, error: erro });
    await expect(aceitarProposta(PEDIDO)).rejects.toBe(erro);
    expect(escritas("proposals")).toEqual([]);
    expect(h.workflow).not.toHaveBeenCalled();
  });

  it("se a leitura da sessão falha, lança o erro e não escreve", async () => {
    h.user.valor = null;
    await expect(aceitarProposta(PEDIDO)).rejects.toThrow("Not authenticated");
    expect(escritas("proposals")).toEqual([]);
  });
});

describe("recusarProposta", () => {
  it("passa à etapa «perdida» com o motivo, rejeita os orçamentos em rascunho ou enviados e recalcula o valor", async () => {
    const r = await recusarProposta({ ...PEDIDO, motivo: MOTIVO });
    expect(r).toEqual({ workflowFailed: false });
    expect(escritas("proposals")).toEqual([expect.objectContaining({
      stage_id: "e-perdida", status: "rejected", rejection_reason_id: "r1", rejection_reason_code: "preco", rejection_reason: "Preço", rejection_notes: "caro",
    })]);
    expect(escritas("quotes")).toEqual([{ estado: "rejeitado", lost_reason: "Preço" }]);
    expect(h.chamadas.find((c) => c.tabela === "quotes" && c.op === "in")?.args).toEqual(["estado", ["rascunho", "enviado"]]);
    expect(h.rpc).toHaveBeenCalledWith("recalculate_proposal_value", { p_proposal_id: "p1" });
    expect(h.workflow).toHaveBeenCalledWith(expect.objectContaining({ newStageId: "e-perdida", oldStageId: "e-rasc" }));
  });

  it("a cascata dos orçamentos filtra também pela organização e confirma as linhas com select('id')", async () => {
    await recusarProposta({ ...PEDIDO, motivo: MOTIVO });
    const dosOrcamentos = h.chamadas.filter((c) => c.tabela === "quotes");
    expect(dosOrcamentos.some((c) => c.op === "eq" && c.args[0] === "organization_id" && c.args[1] === "org-1")).toBe(true);
    expect(dosOrcamentos.some((c) => c.op === "eq" && c.args[0] === "proposal_id" && c.args[1] === "p1")).toBe(true);
    expect(dosOrcamentos.some((c) => c.op === "select" && c.args[0] === "id")).toBe(true);
  });

  it("uma falha na cascata dos orçamentos não desfaz a recusa, mas regista-se", async () => {
    h.tabelas.quotes = { data: null, error: { message: "x" } };
    const registo = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO })).resolves.toEqual({ workflowFailed: false });
    expect(registo).toHaveBeenCalled();
    registo.mockRestore();
  });

  it("uma proposta sem orçamentos por rejeitar (zero linhas na cascata) não é erro", async () => {
    h.tabelas.quotes = { data: [], error: null };
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO })).resolves.toEqual({ workflowFailed: false });
  });

  it("se a base não alterou nenhuma linha falha, e não toca nos orçamentos nem no workflow", async () => {
    h.tabelas["proposals:update"] = { data: [], error: null };
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO })).rejects.toThrow("não foi alterada");
    expect(escritas("quotes")).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalledWith("recalculate_proposal_value", expect.anything());
    expect(h.workflow).not.toHaveBeenCalled();
  });

  it("sem proposals.edit na lista recusa-se sem escrever, e sem lista conhecida também", async () => {
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO, permissoes: ["quotes.edit"] })).rejects.toThrow("permissão");
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO, permissoes: undefined })).rejects.toThrow("permissões");
    expect(escritas("proposals")).toEqual([]);
    expect(escritas("quotes")).toEqual([]);
  });

  it("sem etapa «perdida» recusa-se e não escreve", async () => {
    h.tabelas.proposal_workflow_stages = { data: [ETAPAS[0], ETAPAS[1]], error: null };
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO })).rejects.toThrow("Rejeitada");
    expect(escritas("proposals")).toEqual([]);
  });

  it("se a leitura das etapas falha, lança o erro (não «Estágio Rejeitada não encontrado») e não escreve", async () => {
    const erro = { message: "rede" };
    h.tabelas.proposal_workflow_stages = { data: null, error: erro };
    await expect(recusarProposta({ ...PEDIDO, motivo: MOTIVO })).rejects.toBe(erro);
    expect(escritas("proposals")).toEqual([]);
  });
});

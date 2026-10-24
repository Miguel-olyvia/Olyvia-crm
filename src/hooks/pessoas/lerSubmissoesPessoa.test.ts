// A leitura das submissões de uma pessoa, como o separador «Formulários» de Leads as lê (mesmas tabelas, mesmos filtros), sempre com a
// organização na consulta. O Supabase é simulado: nada vai à base.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lerSubmissoesPessoa } from "./lerSubmissoesPessoa";

type Resposta = { data: unknown; error: unknown };
const respostas = vi.hoisted(() => ({ porTabela: {} as Record<string, unknown[]> }));
const chamadas = vi.hoisted(() => ({ lista: [] as { tabela: string; metodo: string; args: unknown[] }[] }));
const resolverMock = vi.hoisted(() => vi.fn());

function cadeia(tabela: string, resultado: Resposta) {
  const c: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "is", "not", "order", "limit", "in"]) {
    c[metodo] = (...args: unknown[]) => { chamadas.lista.push({ tabela, metodo, args }); return c; };
  }
  c.then = (res: (v: Resposta) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resultado).then(res, rej);
  return c;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (tabela: string) => cadeia(tabela, (respostas.porTabela[tabela]?.shift() as Resposta) ?? { data: [], error: null }) },
}));
vi.mock("@/lib/leads/fieldDefinitions", () => ({
  resolveLeadDialogFieldDefinitions: (...args: unknown[]) => resolverMock(...args),
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({ marca: "cliente" }),
}));

const ORG = "org-nike";
const ENTIDADE = "ent-1";
const ok = (data: unknown): Resposta => ({ data, error: null });
const falha = (code: string, message = "x"): Resposta => ({ data: null, error: { code, message } });
const de = (tabela: string) => chamadas.lista.filter((c) => c.tabela === tabela);
const chamou = (tabela: string, metodo: string, ...args: unknown[]) => de(tabela).some((c) => c.metodo === metodo && JSON.stringify(c.args) === JSON.stringify(args));

const LEAD = { id: "l1", campaign_id: "c1", field_values: { email: "a@b.pt" }, source: "web", status: "new", created_at: "2026-10-10T09:00:00Z", campaigns: { id: "c1", name: "Remodelações" } };
const SUB = { id: "s1", campaign_id: "c1", field_values: { phone: "9" }, status: "pending", resolution: null, resolved_at: null, created_at: "2026-10-12T09:00:00Z", entity_id: ENTIDADE, conflicting_entity_id: null, campaigns: { id: "c1", name: "Remodelações" } };

beforeEach(() => {
  respostas.porTabela = {};
  chamadas.lista = [];
  resolverMock.mockReset();
  resolverMock.mockResolvedValue([{ field_key: "email", field_label: "O seu email", field_type: "email" }]);
});

describe("lerSubmissoesPessoa: as consultas", () => {
  it("lê as leads da entidade com campos submetidos, vivas e da organização, as 20 mais recentes", async () => {
    respostas.porTabela = { anew_leads: [ok([LEAD])] };
    await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(chamou("anew_leads", "select", "id, campaign_id, field_values, source, status, created_at, campaigns(id, name)")).toBe(true);
    expect(chamou("anew_leads", "eq", "entity_id", ENTIDADE)).toBe(true);
    expect(chamou("anew_leads", "eq", "organization_id", ORG)).toBe(true);
    expect(chamou("anew_leads", "is", "deleted_at", null)).toBe(true);
    expect(chamou("anew_leads", "not", "field_values", "is", null)).toBe(true);
    expect(chamou("anew_leads", "order", "created_at", { ascending: false })).toBe(true);
    expect(chamou("anew_leads", "limit", 20)).toBe(true);
  });

  it("lê form_submissions da entidade, vivas e da organização, com a coluna do conflito", async () => {
    respostas.porTabela = { form_submissions: [ok([SUB])] };
    await lerSubmissoesPessoa(ORG, ENTIDADE);
    const selecao = de("form_submissions").find((c) => c.metodo === "select")?.args[0] as string;
    expect(selecao).toContain("id, campaign_id, field_values, status, resolution, resolved_at, created_at, entity_id, campaigns(id, name)");
    expect(selecao).toContain("conflicting_entity_id");
    expect(chamou("form_submissions", "eq", "entity_id", ENTIDADE)).toBe(true);
    expect(chamou("form_submissions", "eq", "organization_id", ORG)).toBe(true);
    expect(chamou("form_submissions", "is", "deleted_at", null)).toBe(true);
    expect(chamou("form_submissions", "limit", 20)).toBe(true);
  });

  it.each([
    ["42703", "column does not exist"],
    ["PGRST204", "x"],
    ["XX000", "column conflicting_entity_id missing"],
  ])("se a coluna do conflito ainda não existe (%s) repete sem ela, em vez de ficar vazio", async (code, message) => {
    respostas.porTabela = { form_submissions: [falha(code, message), ok([SUB])] };
    const r = await lerSubmissoesPessoa(ORG, ENTIDADE);
    const selecoes = de("form_submissions").filter((c) => c.metodo === "select").map((c) => c.args[0] as string);
    expect(selecoes).toHaveLength(2);
    expect(selecoes[1]).not.toContain("conflicting_entity_id");
    expect(r.map((s) => s.id)).toEqual(["s1"]);
  });

  it("qualquer outro erro de form_submissions rebenta (não se engole)", async () => {
    respostas.porTabela = { form_submissions: [falha("42501")] };
    await expect(lerSubmissoesPessoa(ORG, ENTIDADE)).rejects.toMatchObject({ code: "42501" });
  });

  it("um erro nas leads rebenta (não se mostra uma lista incompleta como se estivesse completa)", async () => {
    respostas.porTabela = { anew_leads: [falha("57014")] };
    await expect(lerSubmissoesPessoa(ORG, ENTIDADE)).rejects.toMatchObject({ code: "57014" });
  });

  it("sem organização ou sem pessoa devolve vazio sem consultar", async () => {
    expect(await lerSubmissoesPessoa("", ENTIDADE)).toEqual([]);
    expect(await lerSubmissoesPessoa(ORG, "")).toEqual([]);
    expect(chamadas.lista).toEqual([]);
  });
});

describe("lerSubmissoesPessoa: rótulos, distritos e nomes", () => {
  it("resolve os rótulos uma vez por campanha, com a organização, e usa-os nos campos", async () => {
    respostas.porTabela = { anew_leads: [ok([LEAD, { ...LEAD, id: "l2" }])], form_submissions: [ok([SUB])] };
    const r = await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(resolverMock).toHaveBeenCalledTimes(1);
    expect(resolverMock).toHaveBeenCalledWith({ campaignId: "c1", organizationId: ORG }, { marca: "cliente" });
    expect(r.find((s) => s.id === "l1")?.campos[0].rotulo).toBe("O seu email");
  });

  it("uma submissão sem campanha resolve os rótulos da organização", async () => {
    respostas.porTabela = { form_submissions: [ok([{ ...SUB, campaign_id: null, campaigns: null }])] };
    await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(resolverMock).toHaveBeenCalledWith({ organizationId: ORG }, { marca: "cliente" });
  });

  it("só lê os distritos se algum campo guarda um id de distrito, e dá-lhes o nome", async () => {
    resolverMock.mockResolvedValue([{ field_key: "distrito", field_label: "Distrito", field_type: "ref_district" }]);
    respostas.porTabela = {
      anew_leads: [ok([{ ...LEAD, field_values: { distrito: "d-1" } }])],
      administrative_divisions: [ok([{ id: "d-1", name: "Porto" }])],
    };
    const r = await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(chamou("administrative_divisions", "eq", "admin_level", 1)).toBe(true);
    expect(r[0].campos[0].valor).toBe("Porto");
  });

  it("sem campos de distrito não consulta os distritos", async () => {
    respostas.porTabela = { anew_leads: [ok([LEAD])] };
    await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(de("administrative_divisions")).toEqual([]);
  });

  it("num conflito lê o nome das duas entidades e só então", async () => {
    respostas.porTabela = {
      form_submissions: [ok([{ ...SUB, conflicting_entity_id: "ent-2" }])],
      anew_entities: [ok([{ id: ENTIDADE, display_name: "Ana" }, { id: "ent-2", display_name: "Rui" }])],
    };
    const r = await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(chamou("anew_entities", "in", "id", [ENTIDADE, "ent-2"])).toBe(true);
    expect(r[0].conflito).toEqual([{ id: ENTIDADE, nome: "Ana" }, { id: "ent-2", nome: "Rui" }]);
  });

  it("sem conflito não consulta as entidades", async () => {
    respostas.porTabela = { form_submissions: [ok([SUB])] };
    await lerSubmissoesPessoa(ORG, ENTIDADE);
    expect(de("anew_entities")).toEqual([]);
  });

  it("uma falha ao resolver os rótulos rebenta", async () => {
    resolverMock.mockRejectedValue(new Error("sem rótulos"));
    respostas.porTabela = { anew_leads: [ok([LEAD])] };
    await expect(lerSubmissoesPessoa(ORG, ENTIDADE)).rejects.toThrow("sem rótulos");
  });
});

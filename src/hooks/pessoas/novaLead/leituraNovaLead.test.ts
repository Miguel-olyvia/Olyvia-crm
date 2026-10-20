// As leituras de apoio do diálogo «Nova lead» (campanhas, origens, formulários, campos da campanha, distritos): só select, sempre com a
// organização quando a tabela a tem. O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseFalso, valorDoFiltro } from "./supabaseFalso";
import { lerCamposDaCampanha, lerCampanhas, lerDistritos, lerFormularios, lerOrigens } from "./leituraNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const ORG = "org-nike";
beforeEach(() => supabaseFalso.reiniciar());

describe("lerCampanhas e lerOrigens", () => {
  it("as campanhas ativas da organização, por nome", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ id: "c1", name: "Verão", status: "active", form_id: "f1" }, { id: "c2", name: "Inverno", status: "active", form_id: null }];
    expect(await lerCampanhas(ORG)).toEqual([{ id: "c1", name: "Verão", form_id: "f1" }, { id: "c2", name: "Inverno", form_id: null }]);
    const c = supabaseFalso.chamadasA("campaigns", "select")[0];
    expect(valorDoFiltro(c, "eq", "organization_id")).toBe(ORG);
    expect(valorDoFiltro(c, "eq", "status")).toBe("active");
  });

  it("uma falha a ler campanhas lança (o ecrã di-lo e deixa repetir; antes dava lista vazia, indistinguível de «não há campanhas»)", async () => {
    supabaseFalso.estado.erros["campaigns.select"] = { message: "boom" };
    await expect(lerCampanhas(ORG)).rejects.toThrow("boom");
  });

  it("as origens ativas, as da organização e as globais", async () => {
    supabaseFalso.estado.tabelas.lead_sources = [{ id: "s1", name: "Feira", icon: null, color: "#fff" }];
    expect(await lerOrigens(ORG)).toEqual([{ id: "s1", name: "Feira", icon: null, color: "#fff" }]);
    const c = supabaseFalso.chamadasA("lead_sources", "select")[0];
    expect(c.filtros).toContainEqual(["or", [`organization_id.eq.${ORG},organization_id.is.null`]]);
    expect(valorDoFiltro(c, "eq", "is_active")).toBe(true);
  });
});

describe("lerFormularios", () => {
  it("junta os formulários de leads e os das campanhas, sem repetir", async () => {
    supabaseFalso.estado.tabelas.forms = [{ id: "f1", name: "Orçamento", is_primary: true }];
    supabaseFalso.estado.tabelas.campaigns = [
      { form_id: "f1", forms: { id: "f1", name: "Orçamento", is_primary: true } },
      { form_id: "f2", forms: { id: "f2", name: "Visita", is_primary: false } },
    ];
    expect((await lerFormularios(ORG)).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(valorDoFiltro(supabaseFalso.chamadasA("forms", "select")[0], "eq", "organization_id")).toBe(ORG);
  });
});

describe("lerCamposDaCampanha", () => {
  it("sem campanha não há campos nem formulário", async () => {
    expect(await lerCamposDaCampanha(null)).toEqual({ formId: "", campos: [] });
    expect(supabaseFalso.estado.chamadas).toEqual([]);
  });

  it("campanha com formulário: lê os campos ativos do formulário e conserva as regras de validação", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ form_id: "f1" }];
    supabaseFalso.estado.tabelas.form_fields = [{
      id: "ff1", field_key: "po_codigo_postal", field_label: "Código postal", field_type: "text", is_required: true, is_unique: false,
      options: null, sort_order: 1, contact_field_mapping: null, client_field_mapping: null, placeholder: null, help_text: null,
      display_style: null, pattern: "^[0-9]{4}-[0-9]{3}$", pattern_message: "Formato 1234-567", min_length: null, max_length: 8,
    }];
    const r = await lerCamposDaCampanha("c1");
    expect(r.formId).toBe("f1");
    expect(r.campos).toEqual([expect.objectContaining({
      id: "ff1", field_key: "po_codigo_postal", is_required: true, pattern: "^[0-9]{4}-[0-9]{3}$", pattern_message: "Formato 1234-567", max_length: 8,
    })]);
    const c = supabaseFalso.chamadasA("form_fields", "select")[0];
    expect(valorDoFiltro(c, "eq", "form_id")).toBe("f1");
    expect(valorDoFiltro(c, "eq", "is_active")).toBe(true);
  });

  it("campanha sem formulário: usa as definições de campo da campanha", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ form_id: null }];
    supabaseFalso.estado.tabelas.lead_field_definitions = [{ id: "d1", field_key: "k", field_label: "K", field_type: "text", is_required: false }];
    const r = await lerCamposDaCampanha("c1");
    expect(r.formId).toBe("");
    expect(r.campos.map((c) => c.field_key)).toEqual(["k"]);
    expect(valorDoFiltro(supabaseFalso.chamadasA("lead_field_definitions", "select")[0], "eq", "campaign_id")).toBe("c1");
  });

  it("uma falha a ler os campos lança (antes dava «sem campos» e a lead criava-se sem os campos obrigatórios da campanha)", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ form_id: "f1" }];
    supabaseFalso.estado.erros["form_fields.select"] = { message: "boom" };
    await expect(lerCamposDaCampanha("c1")).rejects.toThrow("boom");
  });
});

describe("lerDistritos", () => {
  it("usa os distritos da campanha, sem nomes repetidos e por ordem", async () => {
    supabaseFalso.estado.tabelas.campaign_districts = [
      { district_id: "d2", administrative_divisions: { id: "d2", name: "Porto" } },
      { district_id: "d1", administrative_divisions: { id: "d1", name: "Lisboa" } },
      { district_id: "d3", administrative_divisions: { id: "d3", name: "Porto" } },
      { district_id: "d4", administrative_divisions: null },
    ];
    expect((await lerDistritos("c1")).map((d) => d.name)).toEqual(["Lisboa", "Porto"]);
  });

  it("sem distritos da campanha (ou sem campanha) usa os distritos de Portugal", async () => {
    supabaseFalso.estado.tabelas.campaign_districts = [];
    supabaseFalso.estado.tabelas.administrative_divisions = [{ id: "a", name: "Braga" }];
    expect(await lerDistritos("c1")).toEqual([{ id: "a", name: "Braga" }]);
    expect(await lerDistritos(null)).toEqual([{ id: "a", name: "Braga" }]);
    const c = supabaseFalso.chamadasA("administrative_divisions", "select")[0];
    expect(valorDoFiltro(c, "eq", "country_code")).toBe("PT");
    expect(valorDoFiltro(c, "eq", "admin_level")).toBe(1);
  });
});

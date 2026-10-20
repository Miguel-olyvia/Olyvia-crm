// As leituras de apoio da «Nova lead» NÃO engolem erros: uma falha lança, para o ecrã a distinguir de «não há nada». Em especial os campos
// da campanha, que são obrigatórios na lead: devolver «sem campos» deixava criar a lead sem eles.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseFalso } from "./supabaseFalso";
import { lerComerciais } from "./comerciaisNovaLead";
import { lerCamposDaCampanha, lerCampanhas, lerOrigens } from "./leituraNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: captureMock }));

beforeEach(() => {
  supabaseFalso.reiniciar();
  captureMock.mockReset();
});

describe("lerCamposDaCampanha: falhas lançam", () => {
  it("a campanha não se lê (erro no select da campanha)", async () => {
    supabaseFalso.estado.erros["campaigns.select"] = { message: "boom" };
    await expect(lerCamposDaCampanha("c1")).rejects.toBeTruthy();
    expect(captureMock).toHaveBeenCalled();
  });

  it("os campos do formulário não se leem", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ form_id: "f1" }];
    supabaseFalso.estado.erros["form_fields.select"] = { message: "boom" };
    await expect(lerCamposDaCampanha("c1")).rejects.toBeTruthy();
    expect(captureMock).toHaveBeenCalled();
  });

  it("as definições de campo da campanha (sem formulário) não se leem", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ form_id: null }];
    supabaseFalso.estado.erros["lead_field_definitions.select"] = { message: "boom" };
    await expect(lerCamposDaCampanha("c1")).rejects.toBeTruthy();
  });

  it("sem falha, devolve os campos como antes", async () => {
    supabaseFalso.estado.tabelas.campaigns = [{ form_id: null }];
    supabaseFalso.estado.tabelas.lead_field_definitions = [{ id: "d1", field_key: "k", field_label: "K", field_type: "text", is_required: false }];
    expect((await lerCamposDaCampanha("c1")).campos.map((c) => c.field_key)).toEqual(["k"]);
  });
});

describe("campanhas, origens e comerciais: falhas lançam", () => {
  it("campanhas", async () => {
    supabaseFalso.estado.erros["campaigns.select"] = { message: "boom" };
    await expect(lerCampanhas("org")).rejects.toBeTruthy();
    expect(captureMock).toHaveBeenCalled();
  });

  it("origens", async () => {
    supabaseFalso.estado.erros["lead_sources.select"] = { message: "boom" };
    await expect(lerOrigens("org")).rejects.toBeTruthy();
  });

  it("comerciais (uma das leituras da árvore ou dos membros falha)", async () => {
    supabaseFalso.estado.tabelas.anew_hierarchy = [];
    supabaseFalso.estado.tabelas.anew_organizations = [{ id: "org", name: "Nike", type: "empresa" }];
    supabaseFalso.estado.erros["anew_memberships.select"] = { message: "boom" };
    await expect(lerComerciais("org")).rejects.toBeTruthy();
  });
});

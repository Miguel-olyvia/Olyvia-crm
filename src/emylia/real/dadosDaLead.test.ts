import { describe, expect, it, vi } from "vitest";
import { gravarDadosDaLead, lerDadosDasLeads, type DadosLead } from "./dadosDaLead";

// 4/11 (Rúben): a fase Lead mostra o que a Nova lead gravou na pessoa (os campos da Olyvia original)
function sbFalso(tabelas: Record<string, unknown[]>) {
  const chamadas: { t: string; op: string; dados?: unknown }[] = [];
  const consulta = (t: string) => {
    const r = { data: tabelas[t] ?? [], error: null };
    const q: Record<string, unknown> = {};
    for (const f of ["select", "in", "eq", "or", "order"]) q[f] = () => q;
    q.then = (ok: (x: unknown) => unknown) => Promise.resolve(r).then(ok);
    q.update = (dados: unknown) => { chamadas.push({ t, op: "update", dados }); return { eq: async () => ({ error: null }) }; };
    return q;
  };
  return { sb: { from: consulta, rpc: vi.fn(async () => ({ error: null })) } as never, chamadas };
}

const TABELAS = {
  anew_entities: [{ id: "p1", first_name: "Ana", last_name: "Lopes", origin_id: "s1", campaign_id: "c1", assigned_to: "u1",
    extra: { company_name: "Lopes, Lda.", notes: "Ligar de manhã", po_area: "12 m2", po_vazio: "" } }],
  lead_sources: [{ id: "s1", name: "Feira" }, { id: "s2", name: "Site" }],
  campaigns: [{ id: "c1", name: "Verão", form_id: "f1" }],
  anew_users: [{ id: "u1", name: "Rui Costa" }],
  form_fields: [{ form_id: "f1", field_key: "po_area", field_label: "Área da casa de banho" }, { form_id: "f1", field_key: "po_vazio", field_label: "Vazio" }],
};

describe("o que veio na lead", () => {
  it("lê da pessoa: nome, empresa, notas, fonte, campanha, comercial e as respostas preenchidas do formulário", async () => {
    const { sb } = sbFalso(TABELAS);
    const { porPessoa, fontes } = await lerDadosDasLeads(sb, "org", ["p1", "p1", ""]);
    expect(porPessoa.get("p1")).toMatchObject({
      primeiro: "Ana", apelido: "Lopes", empresa: "Lopes, Lda.", notas: "Ligar de manhã", fonte: "Feira", campanha: "Verão", comercial: "Rui Costa",
      respostas: [{ k: "po_area", l: "Área da casa de banho", v: "12 m2" }],
    });
    expect(fontes.map((f) => f.name)).toEqual(["Feira", "Site"]);
  });

  it("um erro a ler não para nada: fica sem dados", async () => {
    const sb = { from: () => { throw new Error("sem permissão"); } } as never;
    expect((await lerDadosDasLeads(sb, "org", ["p1"])).porPessoa.size).toBe(0);
  });

  it("grava na pessoa sem perder o resto do extra; o comercial só muda pela função de atribuir", async () => {
    const { sb, chamadas } = sbFalso(TABELAS);
    const antes = (await lerDadosDasLeads(sb, "org", ["p1"])).porPessoa.get("p1") as DadosLead;
    const nome = await gravarDadosDaLead(sb, "org", antes, {
      primeiro: "Ana", apelido: "Lopes Silva", empresa: "", notas: "Ligar à tarde", fonteId: "s2", comercialId: "u2", respostas: { po_area: "14 m2" },
    });
    expect(nome).toBe("Ana Lopes Silva");
    expect(chamadas[0]).toMatchObject({ t: "anew_entities", op: "update", dados: {
      first_name: "Ana", last_name: "Lopes Silva", display_name: "Ana Lopes Silva", origin_id: "s2",
      extra: { notes: "Ligar à tarde", po_area: "14 m2", po_vazio: "" },
    } });
    expect((chamadas[0].dados as { extra: Record<string, unknown> }).extra.company_name).toBeUndefined();
    expect((sb as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("neg_atribuir_pessoa", { p_organization_id: "org", p_entity_id: "p1", p_assigned_to: "u2" });
  });
});

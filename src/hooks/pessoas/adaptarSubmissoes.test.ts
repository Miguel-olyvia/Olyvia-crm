// As submissões de formulário de uma pessoa, adaptadas como a página de Leads as lê (separador «Formulários»): duas fontes
// (leads com campos submetidos e form_submissions), rótulos da campanha, distritos por nome e a razão de não ter criado lead nova.
import { describe, expect, it } from "vitest";
import { adaptarSubmissoes, type ContextoSubmissoes, type LinhaLeadSubmetida, type LinhaSubmissaoDb } from "./adaptarSubmissoes";

const CTX: ContextoSubmissoes = { rotulosPorCampanha: {}, chavesDistrito: new Set(), distritoPorId: {}, nomePorEntidade: {} };
const ctx = (sobre: Partial<ContextoSubmissoes> = {}): ContextoSubmissoes => ({ ...CTX, ...sobre });

const lead = (sobre: Partial<LinhaLeadSubmetida> = {}): LinhaLeadSubmetida => ({
  id: "l1", campaign_id: "c1", field_values: { email: "ana@exemplo.pt" }, source: "web", status: "new", created_at: "2026-10-10T09:00:00Z",
  campaigns: { id: "c1", name: "Remodelações" }, ...sobre,
});
const sub = (sobre: Partial<LinhaSubmissaoDb> = {}): LinhaSubmissaoDb => ({
  id: "s1", campaign_id: "c1", field_values: { phone: "912345678" }, status: "pending", resolution: null, resolved_at: null,
  created_at: "2026-10-12T09:00:00Z", entity_id: "e1", conflicting_entity_id: null, campaigns: { id: "c1", name: "Remodelações" }, ...sobre,
});

describe("adaptarSubmissoes: as duas fontes", () => {
  it("junta leads e submissões, da mais recente para a mais antiga, cada uma com a sua chave", () => {
    const r = adaptarSubmissoes([lead()], [sub()], CTX);
    expect(r.map((s) => s.chave)).toEqual(["submissao:s1", "lead:l1"]);
    expect(r.map((s) => s.tipo)).toEqual(["submissao", "lead"]);
  });

  it("sem nada devolve uma lista vazia", () => {
    expect(adaptarSubmissoes([], [], CTX)).toEqual([]);
    expect(adaptarSubmissoes(null, undefined, CTX)).toEqual([]);
  });

  it("uma linha sem nenhum campo submetido (só _meta, ou vazia) não conta", () => {
    const r = adaptarSubmissoes(
      [lead({ id: "l2", field_values: { _meta: { dedup: {} } } }), lead({ id: "l3", field_values: null })],
      [sub({ id: "s2", field_values: {} })], CTX,
    );
    expect(r).toEqual([]);
  });

  it("o mesmo id repetido na mesma fonte fica uma vez", () => {
    expect(adaptarSubmissoes([lead(), lead()], [], CTX)).toHaveLength(1);
  });

  it("um id igual numa lead e numa submissão são dois cartões (as chaves são de fontes diferentes)", () => {
    expect(adaptarSubmissoes([lead({ id: "x" })], [sub({ id: "x" })], CTX)).toHaveLength(2);
  });

  it("sem data vai para o fim", () => {
    const r = adaptarSubmissoes([lead({ id: "sem", created_at: null })], [sub()], CTX);
    expect(r.map((s) => s.id)).toEqual(["s1", "sem"]);
  });
});

describe("adaptarSubmissoes: campos", () => {
  it("mostra os campos submetidos sem _meta, com o rótulo da campanha", () => {
    const r = adaptarSubmissoes([lead({ field_values: { nome_obra: "Cozinha", _meta: { x: 1 } } })], [], ctx({ rotulosPorCampanha: { c1: { nome_obra: "Tipo de obra" } } }));
    expect(r[0].campos).toEqual([{ chave: "nome_obra", rotulo: "Tipo de obra", valor: "Cozinha" }]);
  });

  it("sem rótulo definido usa o nome humanizado da chave", () => {
    const r = adaptarSubmissoes([lead({ field_values: { codigo_postal: "4000-100", tipo_de_obra: "Casa de banho" } })], [], CTX);
    expect(r[0].campos.map((c) => c.rotulo)).toEqual(["Código Postal", "Tipo De Obra"]);
  });

  it("sem campanha usa os rótulos da organização", () => {
    const r = adaptarSubmissoes([lead({ campaign_id: null, campaigns: null, field_values: { x_y: "1" } })], [], ctx({ rotulosPorCampanha: { __org__: { x_y: "Rótulo da organização" } } }));
    expect(r[0].campos[0].rotulo).toBe("Rótulo da organização");
    expect(r[0].campanha).toBeNull();
  });

  it("um campo de distrito mostra o nome; se o id não se conhece, o valor tal como veio", () => {
    const contexto = ctx({ chavesDistrito: new Set(["distrito"]), distritoPorId: { "d-1": "Porto" } });
    expect(adaptarSubmissoes([lead({ field_values: { distrito: "d-1" } })], [], contexto)[0].campos[0].valor).toBe("Porto");
    expect(adaptarSubmissoes([lead({ field_values: { distrito: "d-9" } })], [], contexto)[0].campos[0].valor).toBe("d-9");
  });

  it("limpa marcas HTML do valor (como a página de Leads) e aceita números, listas e objetos sem rebentar", () => {
    const r = adaptarSubmissoes([lead({ field_values: { a: "<b>Olá</b> <script>x</script>", b: 3, c: ["um", "dois"], d: { k: 1 }, e: null, f: "" } })], [], CTX);
    const valores = Object.fromEntries(r[0].campos.map((c) => [c.chave, c.valor]));
    expect(valores.a).toBe("Olá x");
    expect(valores.b).toBe("3");
    expect(valores.c).toBe("um, dois");
    expect(valores.d).toBe('{"k":1}');
    expect(valores.e).toBe("");
    expect(valores.f).toBe("");
  });
});

describe("adaptarSubmissoes: estado e origem", () => {
  it("uma lead leva a fase do funil e a origem; não leva estado de revisão", () => {
    const [l] = adaptarSubmissoes([lead({ status: "qualified" })], [], CTX);
    expect(l).toMatchObject({ tipo: "lead", etapa: "qualificado", origem: "web", revisao: null, campanha: "Remodelações" });
  });

  it("um estado de lead sem fase conhecida mostra-se tal como está", () => {
    expect(adaptarSubmissoes([lead({ status: "estado_novo" })], [], CTX)[0].etapa).toBe("estado_novo");
    expect(adaptarSubmissoes([lead({ status: null })], [], CTX)[0].etapa).toBeNull();
  });

  it.each([
    [{ resolved_at: null, resolution: null }, "pending"],
    [{ resolved_at: "2026-10-13T00:00:00Z", resolution: "merged" }, "merged"],
    [{ resolved_at: "2026-10-13T00:00:00Z", resolution: "new_lead" }, "new_lead"],
    [{ resolved_at: "2026-10-13T00:00:00Z", resolution: "outra" }, "resolved"],
    [{ resolved_at: "2026-10-13T00:00:00Z", resolution: null }, "resolved"],
  ] as const)("o estado de revisão de %j é %s", (sobre, esperado) => {
    expect(adaptarSubmissoes([], [sub(sobre)], CTX)[0].revisao).toBe(esperado);
  });
});

describe("adaptarSubmissoes: porque não criou lead nova", () => {
  const meta = (dedup: Record<string, unknown>) => ({ phone: "9", _meta: { dedup } });

  it.each([
    [{ por: "email", registo: "client", email_igual: "a@b.pt" }, { por: "email", registo: "cliente", email: "a@b.pt", telefone: null }],
    [{ por: "telefone", registo: "lead", telefone_igual: "912" }, { por: "telefone", registo: "lead", email: null, telefone: "912" }],
    [{ por: "ambos", registo: "lead", email_igual: "a@b.pt", telefone_igual: "912" }, { por: "ambos", registo: "lead", email: "a@b.pt", telefone: "912" }],
    [{ por: "conflito" }, { por: "conflito", registo: "lead", email: null, telefone: null }],
  ] as const)("lê %j", (dedup, esperado) => {
    expect(adaptarSubmissoes([], [sub({ field_values: meta(dedup) })], CTX)[0].coincidencia).toEqual(esperado);
  });

  it("uma submissão antiga, sem o que a deteção deixou, fica sem explicação (não se inventa)", () => {
    expect(adaptarSubmissoes([], [sub()], CTX)[0].coincidencia).toBeNull();
    expect(adaptarSubmissoes([], [sub({ field_values: meta({ registo: "lead" }) })], CTX)[0].coincidencia).toBeNull();
  });

  it("o email e o telefone novos, nunca gravados na ficha, vêm à parte", () => {
    const [s] = adaptarSubmissoes([], [sub({ field_values: meta({ por: "email", novo_email: "<i>novo@x.pt</i>", novo_telefone: "999" }) })], CTX);
    expect(s.emailNaoGravado).toBe("novo@x.pt");
    expect(s.telefoneNaoGravado).toBe("999");
  });

  it("um conflito mostra as duas entidades, com nome (a da submissão primeiro); sem nome fica a null", () => {
    const [s] = adaptarSubmissoes([], [sub({ conflicting_entity_id: "e2" })], ctx({ nomePorEntidade: { e1: "Ana" } }));
    expect(s.conflito).toEqual([{ id: "e1", nome: "Ana" }, { id: "e2", nome: null }]);
  });

  it("sem conflito não há entidades em conflito", () => {
    expect(adaptarSubmissoes([], [sub()], CTX)[0].conflito).toBeNull();
  });
});

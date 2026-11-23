// 23/11 (testarh, negócio 1015 da Mudelar): o cartão «Novo negócio» (/negocios) e o telefone de «Quem pede».
// · o «Telefone ou email» separa-se: o email vai para o email (f.email, anew_entities.email, anew_entity_emails) e o telefone para o
//   telefone (tel, anew_entities.phone, anew_entity_phones); o email deixa de aparecer no campo Telefone;
// · o telefone mudado no negócio vai para a ficha da pessoa (neg_guardar_negocio não o grava; neg_ler_negocios lê-o da entidade), para
//   o envio da proposta o encontrar depois de reler.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acoes, seed, type Estado } from "../motor";
import { estadoVazio } from "../estadoOrganizacao";
import { separarContacto, telefoneDaFicha } from "../acessosPortal";
import { supabaseFalso, valorDoFiltro } from "@/hooks/pessoas/novaLead/supabaseFalso";
import { idsServico } from "./negocioBase";
import { fotografarNegocios, gravarMudancas, type RefNegocio } from "./sincronizarNegocios";
import { contactoDoNegocio, telefoneParaFicha } from "./contactoDaPessoa";

const gravarNovaLead = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/novaLead/gravarNovaLead", () => ({
  gravarNovaLead,
  NegocioNaoCriado: class NegocioNaoCriado extends Error { entityId = ""; },
}));
vi.mock("@/hooks/pessoas/novaLead/comerciaisNovaLead", () => ({ resolverOrgRaiz: async (org: string) => org }));

class Eco extends Map<string, string> { override get(k: string) { return k; } }
const ids = idsServico(new Eco());
const sb = supabaseFalso as unknown as SupabaseClient;

beforeEach(() => {
  localStorage.clear();
  supabaseFalso.reiniciar();
  supabaseFalso.rpc.mockResolvedValue({ data: { avisos: [] }, error: null });
  supabaseFalso.estado.tabelas["negocios"] = [{ numero: 2001 }];
  gravarNovaLead.mockReset();
  gravarNovaLead.mockResolvedValue({ entityId: "ent-1", leadId: "ent-1", negocioId: "neg-1" });
});

/** O cartão rápido: «Pessoa nova», com o Nome e o «Telefone ou email». */
function cartao(nome: string, contacto: string) {
  const S: Estado = estadoVazio("org-teste");
  const A = acoes(S, () => {}, (fn) => fn());
  S.novo = { nome: "", tel: "", err: "" };
  A.novoCriar(nome, contacto);
  return { S, A };
}

describe("o «Telefone ou email» do cartão rápido", () => {
  it("separarContacto: o email vai para o email, o telefone para o telefone (com o +351)", () => {
    expect(separarContacto(" Ana@Gmail.com ")).toEqual({ email: "ana@gmail.com", telefone: "" });
    expect(separarContacto("912 345 678")).toEqual({ email: "", telefone: "+351912345678" });
    expect(separarContacto("+34 612 345 678")).toEqual({ email: "", telefone: "+34612345678" });
    expect(separarContacto("ana@gmail")).toEqual({ email: "", telefone: "" });
    expect(separarContacto("  ")).toEqual({ email: "", telefone: "" });
  });

  it("um email escrito no cartão fica no email do negócio e o telefone fica vazio (antes ia para o Telefone de «Quem pede»)", () => {
    const { S } = cartao("Ana Lopes", "31999888777@Gmail.com");
    const d = S.deals[0];
    expect(d.tel).toBe("");
    expect(d.f.email).toBe("31999888777@gmail.com");
    expect(d.f.origem).toBe("Email");
    expect(telefoneDaFicha(d)).toBeNull();
  });

  it("um telefone escrito no cartão fica no telefone, com o indicativo, e sem email", () => {
    const { S } = cartao("Rui Sá", "912 345 678");
    const d = S.deals[0];
    expect(d.tel).toBe("+351912345678");
    expect(d.f.email).toBeUndefined();
    expect(d.f.origem).toBe("Telefone");
    expect(telefoneDaFicha(d)).toBe("+351912345678");
  });

  it("um email incompleto não cria o negócio e diz porquê", () => {
    const { S } = cartao("Ana Lopes", "ana@gmail");
    expect(S.deals).toHaveLength(0);
    expect(S.novo?.err).toContain("email não está completo");
  });

  it("«Já existe» com só o email na ficha: o email vai para o email, o telefone fica vazio", () => {
    const S: Estado = estadoVazio("org-teste");
    const A = acoes(S, () => {}, (fn) => fn());
    S.novo = { nome: "", tel: "", err: "" };
    A.novoCriar("Ana Lopes", "ana@x.pt", undefined, "ent-ja", "ana@x.pt");
    expect(S.deals[0]).toMatchObject({ tel: "", pessoaId: "ent-ja" });
    expect(S.deals[0].f.email).toBe("ana@x.pt");
  });
});

describe("criar na base a pessoa do cartão rápido", () => {
  it("com um email: a pessoa nasce com o email (e sem telefone) e o email fica no principal de anew_entity_emails", async () => {
    const { S } = cartao("Ana Lopes", "ana@gmail.com");
    const refs = new Map<number, RefNegocio>();
    const r = await gravarMudancas(sb, "org-1", S, refs, new Map(), ids);
    expect(r.erros).toEqual([]);
    expect(gravarNovaLead).toHaveBeenCalledTimes(1);
    expect(gravarNovaLead.mock.calls[0][0].dados).toMatchObject({ displayName: "Ana Lopes", email: "ana@gmail.com", telefone: "" });
    const emails = supabaseFalso.chamadasA("anew_entity_emails", "insert");
    expect(emails.map((c) => c.dados)).toEqual([{ entity_id: "ent-1", email: "ana@gmail.com", email_type: "personal", is_primary: true }]);
    expect(supabaseFalso.chamadasA("anew_entity_phones", "insert")).toHaveLength(0);
    expect(refs.get(2001)).toMatchObject({ id: "neg-1", entityId: "ent-1" });
    expect(S.deals[0].id).toBe(2001);
  });

  it("com um telefone: a pessoa nasce com o telefone (com o +351) e ele fica no principal de anew_entity_phones", async () => {
    const { S } = cartao("Rui Sá", "912345678");
    const r = await gravarMudancas(sb, "org-1", S, new Map(), new Map(), ids);
    expect(r.erros).toEqual([]);
    expect(gravarNovaLead.mock.calls[0][0].dados).toMatchObject({ email: "", telefone: "+351912345678" });
    const tels = supabaseFalso.chamadasA("anew_entity_phones", "insert");
    expect(tels).toHaveLength(1);
    expect(tels[0].dados).toMatchObject({ entity_id: "ent-1", phone_number: "+351912345678", phone_type: "mobile", is_primary: true });
    expect(supabaseFalso.chamadasA("anew_entity_emails", "insert")).toHaveLength(0);
  });

  it("um negócio antigo com o email no contacto (`tel`) também o manda como email", () => {
    expect(contactoDoNegocio({ tel: "Ana@x.pt", f: {} })).toEqual({ email: "ana@x.pt", telefone: "" });
    expect(contactoDoNegocio({ tel: "+351912345678", f: { email: "rui@x.pt" } })).toEqual({ email: "rui@x.pt", telefone: "+351912345678" });
  });

  it("se o contacto não ficar em anew_entity_emails, avisa e não repete a pessoa", async () => {
    const { S } = cartao("Ana Lopes", "ana@gmail.com");
    supabaseFalso.estado.erros["anew_entity_emails.insert"] = { message: "sem permissão" };
    const refs = new Map<number, RefNegocio>();
    const r = await gravarMudancas(sb, "org-1", S, refs, new Map(), ids);
    expect(r.erros).toEqual([]);
    expect(r.avisos.join(" ")).toContain("o email não ficou nos contactos da pessoa");
    expect(refs.has(2001)).toBe(true);
  });
});

describe("o telefone de «Quem pede» vai para a ficha da pessoa", () => {
  const preparar = () => {
    const S = seed();
    const d = S.deals[0];
    S.deals = [d];
    d.tel = "";
    const refs = new Map<number, RefNegocio>([[d.id, { id: "n1", entityId: "e1" }]]);
    const foto = fotografarNegocios(S.deals);
    return { S, d, refs, foto };
  };

  it("mudado no negócio: grava anew_entities.phone e o principal de anew_entity_phones, e o negócio", async () => {
    const { S, d, refs, foto } = preparar();
    d.tel = "+351912345678";
    const r = await gravarMudancas(sb, "org-1", S, refs, foto, ids);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    const upd = supabaseFalso.chamadasA("anew_entities", "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].dados).toEqual({ phone: "+351912345678" });
    expect(valorDoFiltro(upd[0], "eq", "id")).toBe("e1");
    const tels = supabaseFalso.chamadasA("anew_entity_phones", "insert");
    expect(tels[0].dados).toMatchObject({ entity_id: "e1", phone_number: "+351912345678", is_primary: true });
    expect(supabaseFalso.rpc.mock.calls.some(([fn]) => fn === "neg_guardar_negocio")).toBe(true);
  });

  it("já com um telefone principal: atualiza-o em vez de criar outro", async () => {
    const { S, d, refs, foto } = preparar();
    supabaseFalso.estado.tabelas["anew_entity_phones"] = [{ id: "ph-1", phone_number: "+351911111111" }];
    d.tel = "+351912345678";
    await gravarMudancas(sb, "org-1", S, refs, foto, ids);
    expect(supabaseFalso.chamadasA("anew_entity_phones", "insert")).toHaveLength(0);
    const upd = supabaseFalso.chamadasA("anew_entity_phones", "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].dados).toMatchObject({ phone_number: "+351912345678" });
    expect(valorDoFiltro(upd[0], "eq", "id")).toBe("ph-1");
  });

  it("sem mudança no telefone, a ficha não se toca", async () => {
    const { S, d, refs, foto } = preparar();
    d.f.pedido = "Outra coisa";
    await gravarMudancas(sb, "org-1", S, refs, foto, ids);
    expect(supabaseFalso.chamadasA("anew_entities", "update")).toHaveLength(0);
    expect(supabaseFalso.chamadasA("anew_entity_phones")).toHaveLength(0);
  });

  it("um telefone de outra pessoa: o negócio grava-se e avisa que o telefone não ficou na ficha", async () => {
    const { S, d, refs, foto } = preparar();
    supabaseFalso.estado.erros["anew_entities.update"] = { code: "23505", message: "duplicate key value violates unique constraint" };
    d.tel = "+351912345678";
    const r = await gravarMudancas(sb, "org-1", S, refs, foto, ids);
    expect(r.erros).toEqual([]);
    expect(r.gravados).toBe(1);
    expect(r.avisos[0]).toContain("o telefone não ficou na ficha da pessoa (Já existe outra pessoa com este telefone nesta organização.)");
  });

  it("telefoneParaFicha: nada de emails nem números curtos; o português leva o +351", () => {
    expect(telefoneParaFicha("ana@x.pt")).toBe("");
    expect(telefoneParaFicha("12345")).toBe("");
    expect(telefoneParaFicha("912 345 678")).toBe("+351912345678");
    expect(telefoneParaFicha("+44 7700 900123")).toBe("+447700900123");
  });
});

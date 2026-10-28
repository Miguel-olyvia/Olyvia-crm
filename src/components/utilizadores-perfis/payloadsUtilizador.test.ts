// Os corpos que a página envia à Edge create-user e ao rpc_update_user (puros). O essencial é não apagar o que o formulário não mostra.
import { describe, expect, it } from "vitest";
import {
  analisarTelefone, corpoCriarUtilizador, fundirTelefone, moradasParaEnvio, paramsAtualizarUtilizador, type DetalheUtilizador,
} from "./payloadsUtilizador";
import type { Utilizador, Vinculo } from "./tipos";

const detalhe = (extra: Partial<DetalheUtilizador> = {}): DetalheUtilizador => ({
  telefones: [{ phone_number: "920000000", country_code: "+351", phone_type: "mobile", is_primary: true }],
  description: "Descrição", position: "Chefe", location: "Porto", templateId: "t1",
  customAttributes: { social_linkedin: "in/ana", extra: 1 },
  moradas: [{ id: "x", street: "Rua A", number: "1", postal_code: "4000-001", city: "Porto", address_type: "home", is_primary: true }],
  fiscal: { nif: "123456789", commercial_name: "Ana Lda", country_code: "PT" },
  ...extra,
});
const vinculo = (extra: Partial<Vinculo> = {}): Vinculo => ({
  organizacaoId: "org", roleId: "r1", ativo: true, ambitos: {}, membershipId: "m1", relationshipType: "BELONGS_TO", ...extra,
});
const original: Utilizador = {
  id: "u1", nome: "Ana", email: "ana@x.pt", ativo: true, telefone: "+351 920000000", ultimoAcesso: null, atividade: [],
  authUserId: "a1", entityId: "e1", vinculos: [vinculo(), vinculo({ organizacaoId: "org2", membershipId: "m2", ativo: false })],
};
const valores = { nome: "Ana Maria", email: "ana@x.pt", telefone: "+351 920000000", posicao: "Diretora", palavraPasse: "" };

describe("analisarTelefone", () => {
  it("separa indicativo e número; sem indicativo assume +351; vazio é null", () => {
    expect(analisarTelefone("+44 7700900123")).toEqual({ country_code: "+44", phone_number: "7700900123" });
    expect(analisarTelefone("910000000")).toEqual({ country_code: "+351", phone_number: "910000000" });
    expect(analisarTelefone("   ")).toBeNull();
  });
});

describe("fundirTelefone", () => {
  it("sem alteração devolve os telefones tal como estavam", () => {
    const d = detalhe();
    expect(fundirTelefone(d.telefones, "+351 920000000", "+351 920000000")).toBe(d.telefones);
  });
  it("trocar o número substitui só o principal e mantém os outros", () => {
    const d = detalhe({ telefones: [
      { phone_number: "111", country_code: "+351", phone_type: "home", is_primary: false },
      { phone_number: "920000000", country_code: "+351", phone_type: "mobile", is_primary: true },
    ] });
    const r = fundirTelefone(d.telefones, "930000000", "+351 920000000");
    expect(r).toEqual([
      { phone_number: "111", country_code: "+351", phone_type: "home", is_primary: false },
      { phone_number: "930000000", country_code: "+351", phone_type: "mobile", is_primary: true },
    ]);
  });
  it("apagar o número remove o principal", () => {
    expect(fundirTelefone(detalhe().telefones, "", "+351 920000000")).toEqual([]);
  });
  it("sem telefones antes, o novo entra como principal", () => {
    expect(fundirTelefone([], "910000000", "")).toEqual([{ phone_number: "910000000", country_code: "+351", phone_type: "mobile", is_primary: true }]);
  });
});

describe("moradasParaEnvio", () => {
  it("normaliza, acrescenta a chave e salta as vazias sem lançar erro", () => {
    const r = moradasParaEnvio([
      { street: " Rua A ", number: "1", postal_code: "4000-001", city: "Porto" },
      { street: "", number: "", postal_code: "", city: "" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ street: "Rua A", country: "PT", address_type: "home", address_key: "rua a|1|4000-001|porto|pt" });
  });
  it("uma morada incompleta já guardada passa tal como está (não bloqueia a gravação)", () => {
    expect(() => moradasParaEnvio([{ street: "Rua A", number: "", postal_code: "", city: "" }])).not.toThrow();
  });
});

describe("paramsAtualizarUtilizador", () => {
  const montar = (extra: Partial<Parameters<typeof paramsAtualizarUtilizador>[0]> = {}) =>
    paramsAtualizarUtilizador({ utilizador: original, detalhe: detalhe(), valores, vinculos: [vinculo()], ambitosEditaveis: true, ...extra });

  it("leva o que o formulário mudou e reenvia o resto (telefones, moradas, fiscal, atributos, modelo)", () => {
    const { params, nif } = montar();
    expect(params).toMatchObject({
      p_user_id: "u1", p_entity_id: "e1", p_name: "Ana Maria", p_email: "ana@x.pt", p_status: "active", p_position: "Diretora",
      p_description: "Descrição", p_location: "Porto", p_template_id: "t1", p_phone: "+351 920000000",
      p_custom_attributes: { social_linkedin: "in/ana", extra: 1 },
      p_emails: [{ email: "ana@x.pt", email_type: "work", is_primary: true }],
      p_fiscal: { nif: "123456789", commercial_name: "Ana Lda", country_code: "PT" },
    });
    expect(params.p_phones).toEqual([{ phone_number: "920000000", country_code: "+351", phone_type: "mobile", is_primary: true }]);
    expect(params.p_addresses).toHaveLength(1);
    expect(nif).toBe("123456789");
  });
  it("sem NIF o proxy recebe null e p_fiscal null", () => {
    const { params, nif } = montar({ detalhe: detalhe({ fiscal: null }) });
    expect(nif).toBeNull();
    expect(params.p_fiscal).toBeNull();
  });
  it("os ids existentes são todos os memberships, e só os vínculos do formulário seguem em p_memberships", () => {
    const { params } = montar();
    expect(params.p_existing_membership_ids).toEqual(["m1", "m2"]);
    expect(params.p_memberships).toEqual([{ id: "m1", organization_id: "org", relationship_type: "BELONGS_TO", role_id: "r1" }]);
  });
  it("um vínculo novo vai com id null e BELONGS_TO por omissão; vínculos incompletos ficam de fora", () => {
    const { params } = montar({ vinculos: [vinculo(), { organizacaoId: "org3", roleId: "r2", ativo: true, ambitos: {} }, { organizacaoId: "", roleId: "", ativo: true, ambitos: {} }] });
    expect(params.p_memberships).toHaveLength(2);
    expect(params.p_memberships[1]).toEqual({ id: null, organization_id: "org3", relationship_type: "BELONGS_TO", role_id: "r2" });
  });
  it("só envia âmbitos dos vínculos cujos âmbitos mudaram, e só com permissão para os editar", () => {
    const mudado = vinculo({ ambitos: { "leads.view": "ORG", "leads.edit": "TEAM" } });
    expect(montar({ vinculos: [mudado] }).params.p_pending_scopes).toEqual({
      m1: [{ permission_code: "leads.view", scope_level: "ORG" }, { permission_code: "leads.edit", scope_level: "TEAM" }],
    });
    expect(montar({ vinculos: [mudado], ambitosEditaveis: false }).params.p_pending_scopes).toEqual({});
    expect(montar().params.p_pending_scopes).toEqual({});
  });
  it("repor um âmbito a OWNED envia a lista sem essa entrada", () => {
    const antes: Utilizador = { ...original, vinculos: [vinculo({ ambitos: { "leads.view": "ORG" } })] };
    expect(montar({ utilizador: antes, vinculos: [vinculo({ ambitos: {} })] }).params.p_pending_scopes).toEqual({ m1: [] });
  });
  it("não mexe nos telefones quando o telefone não mudou, e usa o antigo em p_phone mesmo sem linhas na tabela", () => {
    const { params } = montar({ detalhe: detalhe({ telefones: [] }) });
    expect(params.p_phones).toEqual([]);
    expect(params.p_phone).toBe("+351 920000000");
  });
  it("não muta os dados de entrada", () => {
    const d = detalhe();
    const copia = JSON.stringify(d);
    montar({ detalhe: d });
    expect(JSON.stringify(d)).toBe(copia);
  });
});

describe("corpoCriarUtilizador", () => {
  it("segue o corpo de create-user de UsersNew e deixa de fora os vínculos incompletos", () => {
    const corpo = corpoCriarUtilizador(
      { nome: " Rui ", email: " rui@x.pt ", telefone: "910000000", posicao: "Dev", palavraPasse: "segredo1" },
      [{ organizacaoId: "org", roleId: "r1", ativo: true, ambitos: {} }, { organizacaoId: "", roleId: "", ativo: true, ambitos: {} }],
    );
    expect(corpo).toEqual({
      email: "rui@x.pt", password: "segredo1", name: "Rui", tipo: "worker_user", phone: "+351 910000000", template_id: null,
      description: null, position: "Dev", location: null, custom_attributes: null,
      memberships: [{ organization_id: "org", relationship_type: "BELONGS_TO", role_id: "r1" }],
      fiscal: null, addresses: null, additional_emails: [], additional_phones: [],
    });
  });
  it("sem telefone nem posição manda null", () => {
    const corpo = corpoCriarUtilizador({ nome: "R", email: "r@x.pt", telefone: "", posicao: "", palavraPasse: "abcdef" }, []);
    expect(corpo.phone).toBeNull();
    expect(corpo.position).toBeNull();
  });
});

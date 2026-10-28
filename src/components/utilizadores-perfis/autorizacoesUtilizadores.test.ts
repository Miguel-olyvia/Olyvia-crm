// As regras de proteção de UsersNew.tsx (canEditUser, canDeleteUser), sobre utilizadores já mapeados.
import { describe, expect, it } from "vitest";
import { criarAutorizacoes, type ContextoAutorizacao } from "./autorizacoesUtilizadores";
import type { Utilizador, Vinculo } from "./tipos";

const vinculo = (roleCodigo: string, extra: Partial<Vinculo> = {}): Vinculo => ({
  organizacaoId: "org", roleId: roleCodigo, ativo: true, ambitos: {}, roleCodigo, ...extra,
});
const util = (id: string, authUserId: string, vinculos: Vinculo[], extra: Partial<Utilizador> = {}): Utilizador => ({
  id, nome: id, email: `${id}@x.pt`, ativo: true, ultimoAcesso: null, atividade: [], vinculos, authUserId, ...extra,
});

const ctx = (extra: Partial<ContextoAutorizacao> = {}): ContextoAutorizacao => ({
  authUserId: "a-eu", anewUserId: "u-eu", anewRoleCode: "comercial", orgAtivaId: "org", todos: [],
  tem: () => true, podeAgir: () => true, ...extra,
});

describe("criarAutorizacoes: criar e gerir roles", () => {
  it("segue users.create e users.manage_roles", () => {
    const a = criarAutorizacoes(ctx({ tem: (p) => p === "users.create" }));
    expect(a.podeCriar).toBe(true);
    expect(a.podeGerirRoles).toBe(false);
  });
});

describe("criarAutorizacoes: editar", () => {
  const comum = util("comum", "a1", [vinculo("comercial")]);
  it("o próprio edita-se sempre, mesmo sem users.edit", () => {
    const eu = util("eu", "a-eu", [vinculo("comercial")]);
    expect(criarAutorizacoes(ctx({ tem: () => false })).podeEditar(eu)).toBe(true);
  });
  it("outro utilizador precisa de users.edit e de âmbito sobre ele", () => {
    expect(criarAutorizacoes(ctx()).podeEditar(comum)).toBe(true);
    expect(criarAutorizacoes(ctx({ tem: () => false })).podeEditar(comum)).toBe(false);
    expect(criarAutorizacoes(ctx({ podeAgir: () => false })).podeEditar(comum)).toBe(false);
  });
  it("o criador da conta nunca é editável por outros", () => {
    const criador = util("c", "a2", [vinculo("super_admin", { criador: true })]);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "super_admin" })).podeEditar(criador)).toBe(false);
  });
  it("outros super_admin só são editáveis pelo criador da conta", () => {
    const outro = util("s", "a3", [vinculo("super_admin")]);
    const eu = util("eu", "a-eu", [vinculo("super_admin", { criador: true })]);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "super_admin", todos: [eu, outro] })).podeEditar(outro)).toBe(true);
    const euNaoCriador = util("eu", "a-eu", [vinculo("super_admin")]);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "super_admin", todos: [euNaoCriador, outro] })).podeEditar(outro)).toBe(false);
  });
  it("um org_admin da organização ativa só é editável por org_admin, super_admin ou system_admin", () => {
    const admin = util("adm", "a4", [vinculo("org_admin")]);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "comercial" })).podeEditar(admin)).toBe(false);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "org_admin" })).podeEditar(admin)).toBe(true);
  });
  it("um org_admin de outra organização não conta como owner da ativa", () => {
    const admin = util("adm", "a4", [vinculo("org_admin", { organizacaoId: "outra" })]);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "comercial" })).podeEditar(admin)).toBe(true);
  });
  it("um vínculo inativo de super_admin não protege", () => {
    const antigo = util("ant", "a5", [vinculo("super_admin", { ativo: false })]);
    expect(criarAutorizacoes(ctx()).podeEditar(antigo)).toBe(true);
  });
});

describe("criarAutorizacoes: desativar", () => {
  it("nunca a si próprio", () => {
    expect(criarAutorizacoes(ctx()).podeDesativar(util("eu", "a-eu", [vinculo("comercial")]))).toBe(false);
  });
  it("precisa de users.delete e de âmbito", () => {
    const comum = util("comum", "a1", [vinculo("comercial")]);
    expect(criarAutorizacoes(ctx()).podeDesativar(comum)).toBe(true);
    expect(criarAutorizacoes(ctx({ tem: (p) => p !== "users.delete" })).podeDesativar(comum)).toBe(false);
    expect(criarAutorizacoes(ctx({ podeAgir: (p) => p !== "users.delete" })).podeDesativar(comum)).toBe(false);
  });
  it("nunca o criador da conta nem um super_admin por quem não é o criador", () => {
    const criador = util("c", "a2", [vinculo("super_admin", { criador: true })]);
    const outro = util("s", "a3", [vinculo("super_admin")]);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "super_admin" })).podeDesativar(criador)).toBe(false);
    expect(criarAutorizacoes(ctx({ anewRoleCode: "super_admin" })).podeDesativar(outro)).toBe(false);
  });
});

describe("criarAutorizacoes: histórico", () => {
  it("exige users.edit e âmbito, mas o próprio vê o seu", () => {
    const comum = util("comum", "a1", [vinculo("comercial")]);
    expect(criarAutorizacoes(ctx()).podeVerHistorico(comum)).toBe(true);
    expect(criarAutorizacoes(ctx({ tem: () => false })).podeVerHistorico(comum)).toBe(false);
    expect(criarAutorizacoes(ctx({ podeAgir: () => false })).podeVerHistorico(comum)).toBe(false);
  });
});

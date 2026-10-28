// As escritas de utilizadores (Supabase simulado): o que se envia à Edge e ao rpc_update_user e como os erros chegam ao ecrã.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseFalso, type OpcoesFalso } from "./supabaseFalso";
import type { Utilizador } from "../tipos";

const estado = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: (_t, k) => (estado.cliente as Record<string | symbol, unknown>)[k] }) }));
vi.mock("@/lib/nif/callNifReveal", () => ({ callNifRevealSingle: vi.fn(async () => "123456789") }));

import { callNifRevealSingle } from "@/lib/nif/callNifReveal";
import {
  atualizarUtilizadorNaBase, criarUtilizadorNaBase, desativarUtilizadorNaBase, ERRO_EMAIL_EXISTENTE, mudarRoleNaBase, reativarUtilizadorNaBase,
} from "./escritasUtilizador";

const utilizador: Utilizador = {
  id: "u1", nome: "Ana", email: "ana@x.pt", ativo: true, telefone: "+351 920000000", ultimoAcesso: null, atividade: [], authUserId: "a1", entityId: "e1",
  vinculos: [{ organizacaoId: "org", roleId: "r1", ativo: true, ambitos: {}, membershipId: "m1", relationshipType: "BELONGS_TO" }],
};
const tabelas = {
  anew_users: [{ id: "u1", description: "d", position: "p", location: "l", template_id: null, custom_attributes: { social_linkedin: "x" } }],
  anew_entity_phones: [{ entity_id: "e1", phone_number: "920000000", country_code: "+351", phone_type: "mobile", is_primary: true }],
  anew_entity_addresses: [], anew_entity_fiscal_entities: [],
};
const valores = { nome: "Ana", email: "ana@x.pt", telefone: "+351 920000000", posicao: "p", palavraPasse: "" };
const preparar = (o: OpcoesFalso = {}) => { const f = criarSupabaseFalso({ tabelas, ...o }); estado.cliente = f.cliente; return f; };
const vinc = [{ organizacaoId: "org", roleId: "r1", ativo: true, ambitos: {} }];

beforeEach(() => { vi.mocked(callNifRevealSingle).mockResolvedValue("123456789"); });

describe("criarUtilizadorNaBase", () => {
  it("chama a Edge create-user com palavra-passe e devolve ok", async () => {
    const f = preparar({ invocar: () => ({ data: { anew_user_id: "novo" } }) });
    const r = await criarUtilizadorNaBase({ ...valores, palavraPasse: "segredo1" }, vinc);
    expect(r).toEqual({ ok: true });
    expect(f.invocacoes).toHaveLength(1);
    expect(f.invocacoes[0].nome).toBe("create-user");
    expect(f.invocacoes[0].corpo).toMatchObject({ email: "ana@x.pt", password: "segredo1", tipo: "worker_user", memberships: [{ organization_id: "org", role_id: "r1" }] });
  });
  it("email já registado devolve o código para o ecrã traduzir", async () => {
    preparar({ invocar: () => ({ data: { error: "A user with this email has already been registered" }, error: { message: "x" } }) });
    expect(await criarUtilizadorNaBase({ ...valores, palavraPasse: "segredo1" }, vinc)).toEqual({ ok: false, erro: ERRO_EMAIL_EXISTENTE });
  });
  it("outro erro da Edge chega com a mensagem real", async () => {
    preparar({ invocar: () => ({ data: { error: "Sem permissão users.create" }, error: { message: "Edge Function returned a non-2xx status code" } }) });
    expect(await criarUtilizadorNaBase({ ...valores, palavraPasse: "segredo1" }, vinc)).toEqual({ ok: false, erro: "Sem permissão users.create" });
  });
  it("uma resposta sem utilizador criado é falha", async () => {
    preparar({ invocar: () => ({ data: {} }) });
    expect((await criarUtilizadorNaBase({ ...valores, palavraPasse: "segredo1" }, vinc)).ok).toBe(false);
  });
});

describe("atualizarUtilizadorNaBase", () => {
  const corpoProxy = (f: ReturnType<typeof preparar>) => f.invocacoes.find((i) => i.nome === "nif-write-proxy")?.corpo as { rpc: string; nif: string | null; params: Record<string, unknown> };

  it("lê o detalhe e envia rpc_update_user pelo nif-write-proxy com tudo reenviado", async () => {
    const f = preparar();
    const r = await atualizarUtilizadorNaBase({ utilizador, valores: { ...valores, nome: "Ana Maria" }, vinculos: utilizador.vinculos, ambitosEditaveis: true });
    expect(r).toEqual({ ok: true });
    const corpo = corpoProxy(f);
    expect(corpo.rpc).toBe("rpc_update_user");
    expect(corpo.nif).toBeNull();
    expect(corpo.params).toMatchObject({
      p_user_id: "u1", p_name: "Ana Maria", p_description: "d", p_location: "l", p_custom_attributes: { social_linkedin: "x" }, p_existing_membership_ids: ["m1"],
    });
    expect(corpo.params.p_phones).toHaveLength(1);
  });
  it("com palavra-passe nova chama update-user-password; sem ela não chama", async () => {
    const f = preparar();
    await atualizarUtilizadorNaBase({ utilizador, valores: { ...valores, palavraPasse: "novaPass1" }, vinculos: utilizador.vinculos, ambitosEditaveis: false });
    expect(f.invocacoes.find((i) => i.nome === "update-user-password")?.corpo).toEqual({ targetUserId: "a1", newPassword: "novaPass1" });
    const g = preparar();
    await atualizarUtilizadorNaBase({ utilizador, valores, vinculos: utilizador.vinculos, ambitosEditaveis: false });
    expect(g.invocacoes.some((i) => i.nome === "update-user-password")).toBe(false);
  });
  it("uma falha a ler o detalhe aborta sem gravar nada", async () => {
    const f = preparar({ erros: { anew_entity_phones: "rls" } });
    const r = await atualizarUtilizadorNaBase({ utilizador, valores, vinculos: utilizador.vinculos, ambitosEditaveis: false });
    expect(r).toEqual({ ok: false, erro: "rls" });
    expect(f.invocacoes).toEqual([]);
  });
  it("se o NIF existe e não se consegue ler, não grava (para não o apagar)", async () => {
    vi.mocked(callNifRevealSingle).mockResolvedValue(null);
    const f = preparar({ tabelas: { ...tabelas, anew_entity_fiscal_entities: [{ entity_id: "e1", fiscal_entity: { id: "fe1", commercial_name: "X", country_code: "PT" } }] } });
    const r = await atualizarUtilizadorNaBase({ utilizador, valores, vinculos: utilizador.vinculos, ambitosEditaveis: false });
    expect(r.ok).toBe(false);
    expect(f.invocacoes).toEqual([]);
  });
  it("o erro do rpc_update_user chega ao ecrã e a palavra-passe não é tentada", async () => {
    const f = preparar({ invocar: (nome) => (nome === "nif-write-proxy" ? { error: { message: "boom" } } : {}) });
    const r = await atualizarUtilizadorNaBase({ utilizador, valores: { ...valores, palavraPasse: "novaPass1" }, vinculos: utilizador.vinculos, ambitosEditaveis: false });
    expect(r.ok).toBe(false);
    expect(f.invocacoes.some((i) => i.nome === "update-user-password")).toBe(false);
  });
  it("se só a palavra-passe falha, diz que os dados foram gravados", async () => {
    preparar({ invocar: (nome) => (nome === "update-user-password" ? { error: { message: "fraca" } } : {}) });
    const r = await atualizarUtilizadorNaBase({ utilizador, valores: { ...valores, palavraPasse: "novaPass1" }, vinculos: utilizador.vinculos, ambitosEditaveis: false });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/dados foram gravados/);
  });
});

describe("mudarRoleNaBase", () => {
  it("envia o vínculo com a role nova e mantém o resto", async () => {
    const f = preparar();
    const r = await mudarRoleNaBase(utilizador, "m1", "r2", false);
    expect(r).toEqual({ ok: true });
    const corpo = f.invocacoes.find((i) => i.nome === "nif-write-proxy")?.corpo as { params: Record<string, unknown> };
    expect(corpo.params.p_memberships).toEqual([{ id: "m1", organization_id: "org", relationship_type: "BELONGS_TO", role_id: "r2" }]);
    expect(corpo.params.p_phone).toBe("+351 920000000");
  });
});

describe("desativar e reativar", () => {
  it("desativar revoga o login e chama rpc_delete_user", async () => {
    const f = preparar();
    expect(await desativarUtilizadorNaBase(utilizador)).toEqual({ ok: true });
    expect(f.invocacoes).toEqual([{ nome: "delete-user", corpo: { userId: "a1" } }]);
    expect(f.rpcs).toEqual([{ nome: "rpc_delete_user", args: { p_user_id: "u1" } }]);
  });
  it("sem login só chama a RPC", async () => {
    const f = preparar();
    await desativarUtilizadorNaBase({ ...utilizador, authUserId: null });
    expect(f.invocacoes).toEqual([]);
    expect(f.rpcs).toHaveLength(1);
  });
  it("se o login não se revoga, a RPC não corre e o erro chega ao ecrã", async () => {
    const f = preparar({ invocar: () => ({ data: { error: "não pode" }, error: { message: "x" } }) });
    expect(await desativarUtilizadorNaBase(utilizador)).toEqual({ ok: false, erro: "não pode" });
    expect(f.rpcs).toEqual([]);
  });
  it("erro da RPC sobe", async () => {
    preparar({ rpc: () => ({ error: { message: "sem direitos" } }) });
    expect(await desativarUtilizadorNaBase(utilizador)).toEqual({ ok: false, erro: "sem direitos" });
  });
  it("reativar restaura o login e chama rpc_restore_user", async () => {
    const f = preparar();
    expect(await reativarUtilizadorNaBase(utilizador)).toEqual({ ok: true });
    expect(f.invocacoes).toEqual([{ nome: "restore-user", corpo: { userId: "a1" } }]);
    expect(f.rpcs).toEqual([{ nome: "rpc_restore_user", args: { p_user_id: "u1" } }]);
  });
});

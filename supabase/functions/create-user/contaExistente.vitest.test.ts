import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  associarContaExistente,
  ErroPasso,
  executarRamoContaExistente,
  mensagemErroRpc,
  MENSAGEM_FICHA_INALTERADA,
  procurarContaExistente,
} from "./contaExistente.ts";

type Resp = { data?: unknown; error?: unknown };
interface Opcoes {
  rpc?: Record<string, Resp[]>;
  anewUsers?: Resp;
  memberships?: Resp;
  organizacoes?: Resp; // por omissão: todas as pedidas existem (não apagadas)
}

const EMAIL = "ruben.carvalho@bmlar.pt";

// Cliente falso: regista rpc e leituras de tabela; cada rpc responde pela fila do seu nome.
function cliente(opcoes: Opcoes = {}) {
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];
  const leituras: { tabela: string; filtros: [string, unknown][] }[] = [];
  const filas = { ...(opcoes.rpc ?? {}) };
  return {
    rpcs,
    leituras,
    auth: { admin: { listUsers: vi.fn() } },
    rpc(nome: string, args: Record<string, unknown>) {
      rpcs.push({ nome, args });
      const r = (filas[nome] ?? []).shift() ?? { data: null, error: null };
      const resposta = { data: r.data ?? null, error: r.error ?? null };
      return Object.assign(Promise.resolve(resposta), { single: () => Promise.resolve(resposta) });
    },
    from(tabela: string) {
      const l = { tabela, filtros: [] as [string, unknown][] };
      leituras.push(l);
      const fonte = tabela === "anew_memberships" ? opcoes.memberships : tabela === "anew_organizations" ? opcoes.organizacoes : opcoes.anewUsers;
      let ids: string[] = [];
      const resposta = () => ({
        data: fonte ? fonte.data ?? null : tabela === "anew_organizations" ? ids.map((id) => ({ id })) : null,
        error: fonte?.error ?? null,
      });
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { l.filtros.push([c, v]); return q; },
        is: (c: string, v: unknown) => { l.filtros.push([c, v]); return q; },
        in: (c: string, v: string[]) => { l.filtros.push([c, v]); ids = v; return q; },
        maybeSingle: () => Promise.resolve(resposta()),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, ko),
      };
      return q;
    },
  };
}

const limparContexto = (c: ReturnType<typeof cliente>) => c.rpcs.filter((x) => x.nome === "clear_audit_context").length;
const associacoes = (c: ReturnType<typeof cliente>) => c.rpcs.filter((x) => x.nome === "rpc_hr_associar_conta_existente");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("procurarContaExistente — nunca usa listUsers", () => {
  it("encontra a conta pelo email (rpc indexada) e o perfil pelo auth_user_id", async () => {
    const c = cliente({ rpc: { get_auth_user_id_by_email: [{ data: "auth-1" }] }, anewUsers: { data: { id: "anew-1" } } });
    expect(await procurarContaExistente(c, "Ruben.Carvalho@bmlar.pt")).toEqual({ authUserId: "auth-1", anewUserId: "anew-1" });
    expect(c.rpcs).toEqual([{ nome: "get_auth_user_id_by_email", args: { p_email: "Ruben.Carvalho@bmlar.pt" } }]);
    expect(c.leituras[0]).toEqual({ tabela: "anew_users", filtros: [["auth_user_id", "auth-1"]] });
    expect(c.auth.admin.listUsers).not.toHaveBeenCalled();
  });

  it("conta no Auth sem perfil: anewUserId é null; não existe: null", async () => {
    const semPerfil = cliente({ rpc: { get_auth_user_id_by_email: [{ data: "auth-1" }] }, anewUsers: { data: null } });
    expect(await procurarContaExistente(semPerfil, "a@b.pt")).toEqual({ authUserId: "auth-1", anewUserId: null });
    expect(await procurarContaExistente(cliente({ rpc: { get_auth_user_id_by_email: [{ data: null }] } }), "a@b.pt")).toBeNull();
  });

  it("erro na rpc ou na leitura: passo em português, sem texto do GoTrue, original no log", async () => {
    const c = cliente({ rpc: { get_auth_user_id_by_email: [{ error: { message: "Database error finding users" } }] } });
    const e = await procurarContaExistente(c, "a@b.pt").catch((x) => x);
    expect(e).toBeInstanceOf(ErroPasso);
    expect(e.mensagem).toBe("Falhou ao procurar a conta existente.");
    expect(e.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
    const c2 = cliente({ rpc: { get_auth_user_id_by_email: [{ data: "a" }] }, anewUsers: { error: { message: "boom" } } });
    expect((await procurarContaExistente(c2, "a@b.pt").catch((x) => x)).mensagem).toBe("Falhou ao procurar a conta existente.");
  });
});

describe("mensagemErroRpc — nunca devolve código em bruto nem texto do Postgres", () => {
  it.each([
    ["conta_existente_sem_perfil", "22023", "Não é possível associar esta pessoa.", 403],
    ["conta_existente_inativa", "22023", "Não é possível associar esta pessoa.", 403],
    ["papel_nao_encontrado", "22023", "Falhou ao associar à organização: o papel escolhido não existe.", 400],
    ["papel_nao_permitido", "42501", "Falhou ao associar à organização: este papel não pode ser atribuído por esta via.", 403],
    ["Não pode atribuir papéis a si próprio", "42501", "Não pode atribuir papéis a si próprio.", 403],
    ["Sem permissão para atribuir este perfil", "42501", "Sem permissão para associar esta pessoa.", 403],
    ["texto qualquer do Postgres", "22023", "Pedido inválido.", 400],
    ["relation foo does not exist", "XX000", "Falhou ao associar à organização.", 400],
  ])("%s (%s)", (message, code, esperada, status) => {
    const r = mensagemErroRpc({ code, message });
    expect(r.mensagem).toBe(esperada);
    expect(r.status).toBe(status);
    expect(r.mensagem).not.toMatch(/conta_existente|papel_nao|relation|Postgres/);
  });
  it("sem erro ou sem código usa o passo", () => {
    expect(mensagemErroRpc(null).mensagem).toBe("Falhou ao associar à organização.");
    expect(mensagemErroRpc(null, "Falhou X.").mensagem).toBe("Falhou X.");
  });
});

describe("associarContaExistente — só associa, nunca reescreve a ficha", () => {
  const m = (org: string) => ({ organization_id: org, role_id: `r-${org}` });

  it("chama a rpc uma vez por associação, por ordem, e nada mais", async () => {
    const c = cliente({ rpc: { rpc_hr_associar_conta_existente: [{ data: { id: "a1" } }, { data: { id: "a1" } }] } });
    const r = await associarContaExistente(c, { authUserId: "auth-1", actorId: "ator", memberships: [m("o1"), m("o2")] });
    expect(r).toEqual({ associadas: ["o1", "o2"] });
    expect(associacoes(c).map((x) => x.args)).toEqual([
      { p_auth_user_id: "auth-1", p_actor_id: "ator", p_organization_id: "o1", p_role_id: "r-o1" },
      { p_auth_user_id: "auth-1", p_actor_id: "ator", p_organization_id: "o2", p_role_id: "r-o2" },
    ]);
    expect(c.rpcs.some((x) => x.nome === "rpc_finalize_user_profile_full")).toBe(false);
  });

  it("falha a meio: pára, diz o passo, o que ficou associado, sem ponto duplicado", async () => {
    const c = cliente({
      rpc: { rpc_hr_associar_conta_existente: [
        { data: { id: "a1" } },
        { error: { code: "42501", message: "Sem permissão para criar utilizadores nesta organização" } },
      ] },
    });
    const e = await associarContaExistente(c, { authUserId: "a", actorId: "x", memberships: [m("o1"), m("o2"), m("o3")] }).catch((x) => x);
    expect(e.status).toBe(403);
    expect(e.associadas).toEqual(["o1"]);
    expect(e.mensagem).toBe("Sem permissão para associar esta pessoa. Já ficaram associadas: 1 de 3.");
    expect(e.mensagem).not.toMatch(/\.\./);
    expect(associacoes(c)).toHaveLength(2);
  });

  it("resposta sem perfil conta como falha", async () => {
    const c = cliente({ rpc: { rpc_hr_associar_conta_existente: [{ data: null }] } });
    expect(await associarContaExistente(c, { authUserId: "a", actorId: "x", memberships: [m("o1")] }).catch((x) => x)).toBeInstanceOf(ErroPasso);
  });
});

describe("executarRamoContaExistente — a conta já existe", () => {
  const base = {
    email: EMAIL,
    actorId: "ator-anew",
    actorAuthId: "ator-auth",
    callerIsSystemAdmin: false,
    memberships: [{ organization_id: "bmlar", role_id: "r-bmlar" }],
  };
  // nike -> BMLar: o Rúben tem um vínculo ativo na nike (outra organização).
  const nikeAtivo = { data: [{ organization_id: "nike", status: "active", end_date: null }] };
  const rpcOk = (extra: Record<string, Resp[]> = {}) => ({
    get_auth_user_id_by_email: [{ data: "auth-ruben" }],
    is_system_admin_user: [{ data: false }],
    rpc_hr_associar_conta_existente: [{ data: { id: "anew-ruben" } }],
    ...extra,
  });

  it("nike -> BMLar: só associa; resposta sem anew_user_id nem dados da ficha", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "anew-ruben" } }, memberships: nikeAtivo });
    const r = await executarRamoContaExistente(c, base);
    expect(r).toEqual({
      tipo: "resposta",
      status: 200,
      corpo: { existing_auth_user: true, ficha_alterada: false, associadas: ["bmlar"], message: MENSAGEM_FICHA_INALTERADA },
    });
    expect(JSON.stringify(r)).not.toContain("anew-ruben");
    expect(associacoes(c)).toHaveLength(1);
    expect(c.rpcs.some((x) => x.nome === "rpc_finalize_user_profile_full")).toBe(false);
    expect(limparContexto(c)).toBe(1);
  });

  it("a guarda de vínculos pergunta só por ativos (status active, sem end_date) do alvo", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "anew-ruben" } }, memberships: nikeAtivo });
    await executarRamoContaExistente(c, base);
    const l = c.leituras.find((x) => x.tabela === "anew_memberships")!;
    expect(l.filtros).toEqual(expect.arrayContaining([["user_id", "anew-ruben"], ["status", "active"], ["end_date", null]]));
  });

  it("cannot_assign_self: recusa 403 sem associar e limpa o contexto de auditoria", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo });
    const r = await executarRamoContaExistente(c, { ...base, actorAuthId: "auth-ruben" });
    expect(r).toMatchObject({ tipo: "resposta", status: 403, corpo: { code: "cannot_assign_self", error: "Não pode atribuir papéis a si próprio." } });
    expect(associacoes(c)).toHaveLength(0);
    expect(limparContexto(c)).toBe(1);
  });

  it("conta dormente (sem vínculo ativo noutra organização): 403 existing_account_dormant", async () => {
    for (const linhas of [[], [{ organization_id: "bmlar", status: "active", end_date: null }]]) {
      const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: { data: linhas } });
      const r = await executarRamoContaExistente(c, base);
      expect(r).toMatchObject({
        tipo: "resposta", status: 403,
        corpo: { code: "existing_account_dormant", error: "Não é possível associar esta pessoa.", message: "Não é possível associar esta pessoa." },
      });
      expect(associacoes(c)).toHaveLength(0);
      expect(limparContexto(c)).toBe(1);
    }
  });

  it("vínculo ativo com end_date preenchida não conta", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: { data: [{ organization_id: "nike", status: "active", end_date: "2026-01-01" }] } });
    expect(await executarRamoContaExistente(c, base)).toMatchObject({ status: 403, corpo: { code: "existing_account_dormant" } });
  });

  it("alvo administrador de sistema: 403 genérico, sem associar nem ler vínculos", async () => {
    const c = cliente({ rpc: rpcOk({ is_system_admin_user: [{ data: true }] }), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo });
    const r = await executarRamoContaExistente(c, base);
    expect(r).toMatchObject({ tipo: "resposta", status: 403, corpo: { code: "existing_account_not_allowed", error: "Não é possível associar esta pessoa." } });
    expect(c.rpcs.find((x) => x.nome === "is_system_admin_user")?.args).toEqual({ _user_id: "auth-ruben" });
    expect(c.leituras.some((x) => x.tabela === "anew_memberships")).toBe(false);
    expect(associacoes(c)).toHaveLength(0);
    expect(limparContexto(c)).toBe(1);
  });

  it("a mensagem do alvo dormente e do administrador é a mesma; só o code muda", async () => {
    const adm = cliente({ rpc: rpcOk({ is_system_admin_user: [{ data: true }] }), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo });
    const dor = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: { data: [] } });
    const a = await executarRamoContaExistente(adm, base);
    const d = await executarRamoContaExistente(dor, base);
    expect((a as { corpo: { error: string } }).corpo.error).toBe((d as { corpo: { error: string } }).corpo.error);
    expect((a as { corpo: { code: string } }).corpo.code).not.toBe((d as { corpo: { code: string } }).corpo.code);
  });

  it.each([
    ["erro da rpc", { error: { message: "timeout" } }],
    ["resposta nula", { data: null }],
    ["resposta que não é booleana", { data: "false" }],
  ])("falha fechada: %s ao perguntar se o alvo é administrador de sistema recusa", async (_n, resp) => {
    const c = cliente({ rpc: rpcOk({ is_system_admin_user: [resp as Resp] }), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo });
    const r = await executarRamoContaExistente(c, base);
    expect(r).toMatchObject({ status: 403, corpo: { code: "existing_account_not_allowed", error: "Não é possível associar esta pessoa." } });
    expect(associacoes(c)).toHaveLength(0);
    expect(c.leituras.some((x) => x.tabela === "anew_memberships")).toBe(false);
    expect(limparContexto(c)).toBe(1);
  });

  it("falha fechada também quando a chamada lança", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo });
    const original = c.rpc.bind(c);
    c.rpc = ((nome: string, args: Record<string, unknown>) => {
      if (nome === "is_system_admin_user") throw new Error("rede");
      return original(nome, args);
    }) as typeof c.rpc;
    const r = await executarRamoContaExistente(c, base);
    expect(r).toMatchObject({ status: 403, corpo: { code: "existing_account_not_allowed" } });
    expect(associacoes(c)).toHaveLength(0);
  });

  it("o vínculo ativo noutra organização ignora papéis client (portal)", async () => {
    const c = cliente({
      rpc: rpcOk(), anewUsers: { data: { id: "x" } },
      memberships: { data: [{ organization_id: "nike", status: "active", end_date: null, role_is_client: true }] },
    });
    expect(await executarRamoContaExistente(c, base)).toMatchObject({ status: 403, corpo: { code: "existing_account_dormant" } });
  });

  it("papel sem a flag (null) conta como interno", async () => {
    const c = cliente({
      rpc: rpcOk(), anewUsers: { data: { id: "x" } },
      memberships: { data: [{ organization_id: "nike", status: "active", end_date: null, role_is_client: null }] },
    });
    expect(await executarRamoContaExistente(c, base)).toMatchObject({ status: 200 });
  });

  it("o vínculo ativo noutra organização ignora organizações apagadas", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo, organizacoes: { data: [] } });
    expect(await executarRamoContaExistente(c, base)).toMatchObject({ status: 403, corpo: { code: "existing_account_dormant" } });
    const l = c.leituras.find((x) => x.tabela === "anew_organizations")!;
    expect(l.filtros).toEqual(expect.arrayContaining([["id", ["nike"]], ["deleted_at", null]]));
    expect(associacoes(c)).toHaveLength(0);
  });

  it("erro a ler as organizações: 500 em português, sem associar", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo, organizacoes: { error: { message: "boom" } } });
    expect(await executarRamoContaExistente(c, base)).toMatchObject({ status: 500, corpo: { error: "Falhou ao procurar a conta existente." } });
    expect(associacoes(c)).toHaveLength(0);
  });

  it("falha parcial: devolve o que ficou associado, mensagem sem código bruto, e limpa o contexto", async () => {
    const c = cliente({
      rpc: rpcOk({ rpc_hr_associar_conta_existente: [{ data: { id: "a" } }, { error: { code: "22023", message: "conta_existente_inativa" } }] }),
      anewUsers: { data: { id: "x" } }, memberships: nikeAtivo,
    });
    const r = await executarRamoContaExistente(c, { ...base, memberships: [{ organization_id: "o1", role_id: "r1" }, { organization_id: "o2", role_id: "r2" }] });
    expect(r).toMatchObject({
      tipo: "resposta", status: 403,
      corpo: { code: "existing_account_association_failed", associadas: ["o1"], error: "Não é possível associar esta pessoa. Já ficaram associadas: 1 de 2." },
    });
    expect(JSON.stringify(r)).not.toContain("conta_existente_inativa");
    expect(limparContexto(c)).toBe(1);
  });

  it("o Auth diz que existe mas a procura não encontra: 409 genérico", async () => {
    const c = cliente({ rpc: { get_auth_user_id_by_email: [{ data: null }] } });
    const r = await executarRamoContaExistente(c, base);
    expect(r).toMatchObject({ tipo: "resposta", status: 409, corpo: { code: "existing_account_not_found" } });
    expect(JSON.stringify(r)).not.toContain(EMAIL);
    expect(limparContexto(c)).toBe(1);
  });

  it("falha a procurar a conta: 500 em português", async () => {
    const c = cliente({ rpc: { get_auth_user_id_by_email: [{ error: { message: "Database error finding users" } }] } });
    const r = await executarRamoContaExistente(c, base);
    expect(r).toMatchObject({ tipo: "resposta", status: 500, corpo: { error: "Falhou ao procurar a conta existente.", code: "existing_account_lookup_failed" } });
    expect(limparContexto(c)).toBe(1);
  });

  it("falha a ler os vínculos: 500 em português, sem associar", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: { error: { message: "boom" } } });
    const r = await executarRamoContaExistente(c, base);
    expect(r).toMatchObject({ status: 500, corpo: { error: "Falhou ao procurar a conta existente." } });
    expect(associacoes(c)).toHaveLength(0);
  });

  it("conta no Auth sem anew_users: continua no ramo normal, sem associar nem limpar o contexto", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: null } });
    expect(await executarRamoContaExistente(c, base)).toEqual({ tipo: "continuar", authUserId: "auth-ruben" });
    expect(associacoes(c)).toHaveLength(0);
    expect(limparContexto(c)).toBe(0);
  });

  it("nenhum log leva o email, só o id da conta", async () => {
    const c = cliente({ rpc: rpcOk(), anewUsers: { data: { id: "x" } }, memberships: nikeAtivo });
    await executarRamoContaExistente(c, base);
    const c2 = cliente({ rpc: { get_auth_user_id_by_email: [{ data: null }] } });
    await executarRamoContaExistente(c2, base);
    const logs = JSON.stringify([...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]);
    expect(logs).not.toContain(EMAIL);
  });
});

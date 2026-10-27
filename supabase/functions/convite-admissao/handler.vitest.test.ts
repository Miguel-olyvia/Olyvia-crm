/**
 * @vitest-environment node
 *
 * O despacho da Edge Function convite-admissao (V2), com o Supabase simulado:
 * sem rede, sem Deno. Verifica comportamento: que cliente chama que RPC, que
 * codigos e estados HTTP saem, e que NADA sensivel (token, hash, error.details,
 * texto do erro do Postgres) chega nem a resposta nem ao registo de erros.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarHandler, type DepsConvite } from "./handler.ts";
import { CHAVES_RASCUNHO_PERMITIDAS } from "./rascunho.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const OUTRA_ORG = "aaaaaaaa-1111-4111-8111-111111111111";
const PESSOA = "11111111-1111-4111-8111-111111111111";
const CONVITE = "22222222-2222-4222-8222-222222222222";
const UTILIZADOR = "33333333-3333-4333-8333-333333333333";
const JWT = "jwt-valido";
const TOKEN_PUBLICO = "t".repeat(43);

/** O que a mensagem de um CHECK violado traz: a linha inteira. */
const SEGREDO = "tok_SEGREDO_9f2 ana@segredo.pt 123456789 PT50000201231234567890154";
const ERRO_CHECK = {
  code: "23514",
  message: `new row for relation "pessoas_convites_admissao" violates check constraint "x": Failing row contains (${SEGREDO})`,
  details: `Failing row contains (${SEGREDO})`,
  hint: null,
};

type Resposta = { data: unknown; error: unknown };
type ManipuladorRpc = (args: Record<string, unknown>, chamada: number) => Resposta;

interface Opcoes {
  rpc?: Record<string, ManipuladorRpc>;
  pessoas?: Array<{ id: string; organization_id: string; deleted_at: string | null }>;
  emailErro?: { message: string } | null;
  limiteBloqueado?: (opts: { bucket: string; identifier: string }) => boolean;
}

interface RegistoRpc {
  cliente: "svc" | "user";
  fn: string;
  args: Record<string, unknown>;
}

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function montar(opcoes: Opcoes = {}) {
  const rpcs: RegistoRpc[] = [];
  const contagem: Record<string, number> = {};
  const clientesCriados: Array<{ key: string; authorization?: string }> = [];
  const consultas: Array<{ tabela: string; colunas: string; filtros: Array<[string, string]> }> = [];
  const emails: Array<{ headers: unknown; body: Record<string, unknown> }> = [];
  const invocacoes: string[] = [];
  const textos: string[] = [];
  const erros: Error[] = [];
  const limites: Array<{ bucket: string; identifier: string; maxAttempts: number }> = [];
  const tentativas: Array<{ bucket: string; identifier: string }> = [];
  const pessoas = opcoes.pessoas ?? [{ id: PESSOA, organization_id: ORG, deleted_at: null }];

  const padrao: Record<string, ManipuladorRpc> = {
    has_anew_permission_in_org: () => ({ data: true, error: null }),
    rpc_hr_convite_admissao_criar: () => ({ data: [{ convite_id: CONVITE, rascunho_herdado: false }], error: null }),
    rpc_hr_convite_admissao_resumo: () => ({
      data: { existe: true, convite_id: CONVITE, valid_until: "2026-10-30T12:00:00.000Z" },
      error: null,
    }),
    rpc_hr_convite_admissao_registar_envio: () => ({ data: true, error: null }),
    rpc_hr_convite_link_guardar: () => ({ data: { ok: true }, error: null }),
    rpc_hr_convite_admissao_cancelar: () => ({
      data: { convite_id: CONVITE, estado: "cancelada", estado_portal: "revogado", token_hash: "x".repeat(64) },
      error: null,
    }),
    rpc_hr_convite_admissao_prolongar: () => ({
      data: { convite_id: CONVITE, valid_until: "2026-11-30T12:00:00Z", estado: "convidada", estado_portal: "ativo" },
      error: null,
    }),
    rpc_hr_convite_admissao_estado: () => ({ data: { estado: "convidada", primeiro_nome: "Ana" }, error: null }),
    rpc_hr_convite_anexos_listar: () => ({ data: { anexos: [] }, error: null }),
    rpc_hr_convite_admissao_rascunho: () => ({ data: { ok: true }, error: null }),
    rpc_hr_convite_admissao_submeter: () => ({ data: { ok: true }, error: null }),
    rpc_hr_convite_admissao_registar_recusa: () => ({ data: true, error: null }),
    rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: { niss_ultimos4: "2109", iban_ultimos4: "0154" }, error: null }),
  };
  const manipuladores = { ...padrao, ...(opcoes.rpc ?? {}) };

  function cliente(papel: "svc" | "user") {
    return {
      auth: {
        getUser: async (jwt: string) =>
          jwt === JWT
            ? { data: { user: { id: UTILIZADOR } }, error: null }
            : { data: { user: null }, error: { message: "invalid jwt" } },
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcs.push({ cliente: papel, fn, args });
        contagem[fn] = (contagem[fn] ?? 0) + 1;
        const m = manipuladores[fn];
        return m ? m(args, contagem[fn]) : { data: null, error: { message: "funcao inexistente", code: "42883" } };
      },
      from: (tabela: string) => ({
        select: (colunas: string) => {
          const filtros: Array<[string, string]> = [];
          const builder = {
            eq: (c: string, v: string) => {
              filtros.push([c, v]);
              return builder;
            },
            maybeSingle: async () => {
              consultas.push({ tabela, colunas, filtros: [...filtros] });
              const linha = pessoas.find((p) =>
                filtros.every(([c, v]) => (p as unknown as Record<string, string>)[c] === v)
              );
              return { data: linha ?? null, error: null };
            },
          };
          return builder;
        },
      }),
      functions: {
        invoke: async (nome: string, init: { headers: unknown; body: Record<string, unknown> }) => {
          // O convite NUNCA passa pela send-email: qualquer invocacao e registada para os testes a apanharem.
          invocacoes.push(nome);
          void init;
          return { data: null, error: null };
        },
      },
    };
  }

  const svc = cliente("svc");
  const deps: DepsConvite = {
    supabaseUrl: "https://x.supabase.co",
    anonKey: "ANON",
    serviceKey: "SERVICE",
    appBaseUrl: "https://app.exemplo.pt",
    allowedOrigin: null,
    // deno-lint-ignore no-explicit-any
    criarCliente: ((_url: string, key: string, op?: { authorization?: string }) => {
      clientesCriados.push({ key, authorization: op?.authorization });
      return key === "SERVICE" ? svc : cliente("user");
    }) as any,
    verificarLimite: async (_c, opts) => {
      limites.push({ bucket: opts.bucket, identifier: opts.identifier, maxAttempts: opts.maxAttempts });
      if (opcoes.limiteBloqueado?.(opts)) return { allowed: false, retryAfterSeconds: 60 };
      const n = tentativas.filter((t) => t.bucket === opts.bucket && t.identifier === opts.identifier).length;
      return n >= opts.maxAttempts ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true, retryAfterSeconds: 0 };
    },
    registarTentativa: async (_c, bucket, identifier) => {
      tentativas.push({ bucket, identifier });
    },
    registarErro: (e) => {
      erros.push(e);
    },
    corsHeaders: () => ({}),
    // Correio directo simulado: guarda no mesmo formato que os testes ja liam ({to, subject, html, organization_id}).
    enviarCorreio: async (p) => {
      emails.push({ headers: {}, body: { to: p.para, subject: p.assunto, html: p.html, organization_id: p.organizationId } });
      textos.push(p.texto);
      return opcoes.emailErro ? { enviado: false, erroCodigo: "smtp_falhou" } : { enviado: true };
    },
  };
  const handler = criarHandler(deps);

  async function chamar(
    payload: unknown,
    cabecalhos: Record<string, string> = {},
  ): Promise<{ status: number; corpo: Record<string, unknown>; texto: string }> {
    const req = new Request("https://x.supabase.co/functions/v1/convite-admissao", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhos },
      body: JSON.stringify(payload),
    });
    const res = await handler(req);
    const texto = await res.text();
    return { status: res.status, corpo: texto ? JSON.parse(texto) : {}, texto };
  }

  return { chamar, rpcs, clientesCriados, consultas, emails, invocacoes, textos, erros, limites, tentativas, deps };
}

const AUTH = { Authorization: `Bearer ${JWT}` };
/** Fase 1 do portal: rascunho e submeter exigem a sessao que o OTP abriu (o link sozinho nao escreve). */
const SESSAO = "S".repeat(43);
const COM_SESSAO = { "x-portal-sessao": SESSAO };
const SUBMETER = { action: "submeter", token: TOKEN_PUBLICO, assinatura_nome: "A", dados: {}, declaracao: true };
const PEDIDO_CRIAR = { action: "criar", pessoa_id: PESSOA, organization_id: ORG, email: "ana@exemplo.pt" };

let consola: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  consola = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
  for (const s of consola) s.mockImplementation(() => {});
});
afterEach(() => {
  for (const s of consola) s.mockRestore();
});

function semSegredo(coisas: unknown[], m: ReturnType<typeof montar>, texto: string) {
  expect(texto).not.toContain("SEGREDO");
  expect(texto).not.toContain("violates check");
  expect(JSON.stringify(m.erros.map((e) => [e.name, e.message, e.stack]))).not.toContain("SEGREDO");
  expect(JSON.stringify(m.erros.map((e) => e.message))).not.toContain("violates");
  for (const s of consola) expect(JSON.stringify(s.mock.calls)).not.toContain("SEGREDO");
  void coisas;
}

// ---------------------------------------------------------------------------
describe("despacho por accao", () => {
  it("recusa GET com 405 e uma accao desconhecida com 400", async () => {
    const m = montar();
    const res = await criarHandler(m.deps)(new Request("https://x/f", { method: "GET" }));
    expect(res.status).toBe(405);
    const r = await m.chamar({ action: "apagar_tudo", token: TOKEN_PUBLICO });
    expect(r.status).toBe(400);
    expect(r.corpo.error).toBe("accao_desconhecida");
  });

  it("um corpo que nao e JSON da accao_desconhecida, nunca rebenta", async () => {
    const m = montar();
    const res = await criarHandler(m.deps)(
      new Request("https://x/f", { method: "POST", body: "isto nao e json" }),
    );
    expect(res.status).toBe(400);
  });

  it("despacha criar, cancelar e prolongar para as RPCs certas", async () => {
    const m = montar();
    await m.chamar(PEDIDO_CRIAR, AUTH);
    await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "desistiu" }, AUTH);
    await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias: 7 }, AUTH);
    const fns = m.rpcs.map((r) => r.fn);
    expect(fns).toContain("rpc_hr_convite_admissao_criar");
    expect(fns).toContain("rpc_hr_convite_admissao_cancelar");
    expect(fns).toContain("rpc_hr_convite_admissao_prolongar");
  });

  it("estado devolve so o minimo publico (V3a): sem anexos nem outras chaves; os anexos vem da accao ler, com sessao", async () => {
    const m = montar({
      rpc: { rpc_hr_convite_admissao_estado: () => ({ data: { estado: "em_preenchimento", primeiro_nome: "Ana" }, error: null }) },
    });
    const r = await m.chamar({ action: "estado", token: TOKEN_PUBLICO });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      ok: true,
      convite: { estado: "em_preenchimento", primeiro_nome: "Ana" },
    });
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_anexos_listar")).toBe(false);
    const chamada = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_estado");
    expect(chamada?.cliente).toBe("svc");
    expect(chamada?.args).toEqual({ p_token_hash: await sha256Hex(TOKEN_PUBLICO) });
  });

  it("estado devolve o motivo em jsonb so se for um codigo do catalogo", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_estado: () => ({ data: { erro: "convite_expirado" }, error: null }) } });
    const r = await m.chamar({ action: "estado", token: TOKEN_PUBLICO });
    expect([r.status, r.corpo.error]).toEqual([401, "convite_expirado"]);
    const n = montar({ rpc: { rpc_hr_convite_admissao_estado: () => ({ data: { erro: "texto livre com SEGREDO" }, error: null }) } });
    const r2 = await n.chamar({ action: "estado", token: TOKEN_PUBLICO });
    expect([r2.status, r2.corpo.error]).toEqual([500, "erro_inesperado"]);
    expect(r2.texto).not.toContain("SEGREDO");
  });

  it("submeter com sessao: so a lista branca vai em p_dados (sem niss nem iban), com o hash da sessao e o IP do pedido", async () => {
    const m = montar();
    const r = await m.chamar(
      {
        action: "submeter",
        token: TOKEN_PUBLICO,
        assinatura_nome: "  Ana Silva ",
        declaracao: true,
        dados: { nif: "123456789", niss: "98765432109", iban: "PT50000201231234567890154", campo_inventado: "x" },
      },
      { ...COM_SESSAO, "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" },
    );
    expect(r).toMatchObject({ status: 200, corpo: { ok: true } });
    const c = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_submeter");
    expect(c?.cliente).toBe("svc");
    expect(c?.args).toEqual({
      p_token_hash: await sha256Hex(TOKEN_PUBLICO),
      p_sessao_hash: await sha256Hex(SESSAO),
      p_dados: { nif: "123456789" },
      p_assinatura_nome: "Ana Silva",
      p_ip: "203.0.113.9",
      p_user_agent: "vitest",
    });
    // NISS e IBAN seguem pelo Vault (sensiveis_gravar) e nunca em p_dados nem na resposta.
    const s = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_sensiveis_gravar");
    expect(s?.args).toEqual({
      p_token_hash: await sha256Hex(TOKEN_PUBLICO),
      p_sessao_hash: await sha256Hex(SESSAO),
      p_niss: "98765432109",
      p_iban: "PT50000201231234567890154",
    });
    expect(m.rpcs.map((x) => x.fn).indexOf("rpc_hr_convite_admissao_sensiveis_gravar")).toBeLessThan(
      m.rpcs.map((x) => x.fn).indexOf("rpc_hr_convite_admissao_submeter"),
    );
    expect(r.texto).not.toContain("98765432109");
    expect(r.texto).not.toContain("PT5000");
    expect(JSON.stringify(m.rpcs.filter((x) => x.fn !== "rpc_hr_convite_admissao_sensiveis_gravar"))).not.toContain("98765432109");
  });

  it("submeter: p_ip e null (nunca 'unknown' nem texto forjado) com x-forwarded-for invalido, e sem cabecalho", async () => {
    for (const cab of [{ "x-forwarded-for": "lixo; drop table" }, {}]) {
      const m = montar();
      const r = await m.chamar(SUBMETER, { ...COM_SESSAO, ...cab });
      expect(r.status).toBe(200);
      expect(m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_submeter")?.args.p_ip).toBeNull();
    }
  });

  it("submeter sem sessao (ou com sessao mal formada): 401 sessao_ausente, nenhuma RPC e nenhuma recusa registada", async () => {
    for (const cab of [{}, { "x-portal-sessao": "curta" }]) {
      const m = montar();
      const r = await m.chamar(SUBMETER, cab);
      expect([r.status, r.corpo]).toEqual([401, { error: "sessao_ausente" }]);
      expect(m.rpcs).toHaveLength(0);
    }
  });

  it("submeter: as recusas previas (sem dados, sem assinatura, sem declaracao) nao chamam a base nem registar_recusa", async () => {
    const casos: Array<[Record<string, unknown>, string]> = [
      [{ ...SUBMETER, dados: undefined }, "pedido_invalido"],
      [{ ...SUBMETER, dados: [] }, "pedido_invalido"],
      [{ ...SUBMETER, assinatura_nome: "   " }, "assinatura_obrigatoria"],
      [{ ...SUBMETER, declaracao: false }, "pedido_invalido"],
      [{ ...SUBMETER, declaracao: "true" }, "pedido_invalido"],
      [{ ...SUBMETER, dados: { niss: 5 } }, "pedido_invalido"],
    ];
    for (const [pedido, codigo] of casos) {
      const m = montar();
      const r = await m.chamar(pedido, COM_SESSAO);
      expect([r.status, r.corpo.error]).toEqual([400, codigo]);
      expect(m.rpcs).toHaveLength(0);
    }
  });

  it("submeter: sessao_substituida sai como sessao_expirada e HRA31 como convite_invalido; nada e registado como recusa", async () => {
    const substituida = montar({
      rpc: { rpc_hr_convite_admissao_submeter: () => ({ data: null, error: { message: "x", code: "HRA53" } }) },
    });
    const a = await substituida.chamar(SUBMETER, COM_SESSAO);
    expect([a.status, a.corpo]).toEqual([401, { error: "sessao_expirada" }]);
    expect(substituida.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_registar_recusa")).toBe(false);

    const desconhecido = montar({
      rpc: { rpc_hr_convite_admissao_submeter: () => ({ data: null, error: { message: "nao_encontrado", code: "HRA31" } }) },
    });
    const b = await desconhecido.chamar(SUBMETER, COM_SESSAO);
    expect([b.status, b.corpo]).toEqual([401, { error: "convite_invalido" }]);
  });

  it("submeter: NISS ou IBAN recusados pelo Vault param a submissao, ficam registados como recusa e o valor nunca sai", async () => {
    const m = montar({
      rpc: { rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: { message: "niss_invalido", details: "98765432109", code: "HRA12" } }) },
    });
    const r = await m.chamar({ ...SUBMETER, dados: { niss: "98765432109" } }, COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([400, { error: "niss_invalido" }]);
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_submeter")).toBe(false);
    expect(m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_registar_recusa")?.args.p_codigo).toBe("niss_invalido");
    expect(r.texto).not.toContain("98765432109");
  });

  it("submeter: admissao_incompleta traz os campos; um ja_existe nunca traz os conflitos", async () => {
    const incompleta = montar({
      rpc: { rpc_hr_convite_admissao_submeter: () => ({ data: null, error: { message: "admissao_incompleta", details: "nif,niss", code: "HRA17" } }) },
    });
    const a = await incompleta.chamar(SUBMETER, COM_SESSAO);
    expect(a.corpo).toEqual({ error: "admissao_incompleta", campos: ["nif", "niss"] });

    const U = "44444444-4444-4444-8444-444444444444";
    const conflito = montar({
      rpc: { rpc_hr_convite_admissao_submeter: () => ({ data: null, error: { message: "nif_ja_existe", details: U, code: "HRA13" } }) },
    });
    const c = await conflito.chamar(SUBMETER, COM_SESSAO);
    expect([c.status, c.corpo]).toEqual([409, { error: "nif_ja_existe" }]);
    expect(c.texto).not.toContain(U);
    // os conflitos vao so para a base (registar_recusa), nunca para o erro nem para a resposta
    const recusa = conflito.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_registar_recusa");
    expect(recusa?.args.p_conflito_pessoa_ids).toEqual([U]);
    expect(conflito.erros).toHaveLength(0);
  });

  it("submeter: um CHECK violado nunca mostra a linha (resposta, Sentry e consola)", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_submeter: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(SUBMETER, COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    expect(m.erros.length).toBeGreaterThan(0);
    semSegredo([], m, r.texto);
  });
});

// ---------------------------------------------------------------------------
describe("criar", () => {
  it("sem Authorization ou com JWT invalido: 401 sem_sessao e nada se cria", async () => {
    const m = montar();
    const a = await m.chamar(PEDIDO_CRIAR);
    const b = await m.chamar(PEDIDO_CRIAR, { Authorization: "Bearer jwt-falso" });
    expect([a.status, a.corpo.error]).toEqual([401, "sem_sessao"]);
    expect([b.status, b.corpo.error]).toEqual([401, "sem_sessao"]);
    expect(m.rpcs.some((r) => r.fn === "rpc_hr_convite_admissao_criar")).toBe(false);
  });

  it("pedido invalido (sem organization_id, e-mail mau): 400 pedido_invalido", async () => {
    const m = montar();
    const sem = await m.chamar({ action: "criar", pessoa_id: PESSOA, email: "ana@exemplo.pt" }, AUTH);
    const mau = await m.chamar({ ...PEDIDO_CRIAR, email: "a@b.pt,c@d.pt" }, AUTH);
    expect([sem.status, sem.corpo.error]).toEqual([400, "pedido_invalido"]);
    expect([mau.status, mau.corpo.error]).toEqual([400, "pedido_invalido"]);
  });

  it("a pessoa de outra organizacao que a activa da nao_encontrado e a RPC nao e chamada", async () => {
    const m = montar({ pessoas: [{ id: PESSOA, organization_id: OUTRA_ORG, deleted_at: null }] });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.error]).toEqual([404, "nao_encontrado"]);
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_criar")).toBe(false);
    // a consulta service_role sobre pessoas leva o filtro organization_id (orgScoped)
    expect(m.consultas.length).toBeGreaterThan(0);
    for (const q of m.consultas) expect(q.filtros).toContainEqual(["organization_id", ORG]);
  });

  it("pessoa apagada da nao_encontrado", async () => {
    const m = montar({ pessoas: [{ id: PESSOA, organization_id: ORG, deleted_at: "2026-01-01" }] });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.error]).toEqual([404, "nao_encontrado"]);
  });

  it("RH sem a permissao na organizacao: o mesmo nao_encontrado, a RPC nao e chamada", async () => {
    const m = montar({ rpc: { has_anew_permission_in_org: () => ({ data: false, error: null }) } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.error]).toEqual([404, "nao_encontrado"]);
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_criar")).toBe(false);
    const perm = m.rpcs.find((x) => x.fn === "has_anew_permission_in_org");
    expect(perm?.args).toEqual({
      _auth_uid: UTILIZADOR,
      _permission_code: "hr.pessoas.convite.enviar",
      _organization_id: ORG,
    });
  });

  it("chama a _criar com o cliente service_role e p_actor derivado do JWT (nunca do corpo)", async () => {
    const m = montar();
    const r = await m.chamar({ ...PEDIDO_CRIAR, p_actor: "99999999-9999-4999-8999-999999999999", actor: "x" }, AUTH);
    expect(r.status).toBe(200);
    const c = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_criar");
    expect(c?.cliente).toBe("svc");
    expect(c?.args.p_actor).toBe(UTILIZADOR);
    expect(c?.args.p_pessoa_id).toBe(PESSOA);
    expect(c?.args.p_email).toBe("ana@exemplo.pt");
    expect(String(c?.args.p_token_hash)).toMatch(/^[0-9a-f]{64}$/);
    // o cliente de servico foi criado com a chave de servico, sem o Authorization do RH
    expect(m.clientesCriados.some((x) => x.key === "SERVICE" && x.authorization === undefined)).toBe(true);
  });

  it("o hash enviado e o SHA-256 do token do link, e o token nunca vai na resposta", async () => {
    const m = montar({ emailErro: { message: "smtp em baixo" } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    const link = String(r.corpo.link);
    const token = link.split("/admissao/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url
    const c = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_criar");
    expect(c?.args.p_token_hash).toBe(await sha256Hex(token));
    expect(r.texto).not.toContain(String(c?.args.p_token_hash));
  });

  it("e-mail enviado: link nulo, sem token nem hash na resposta; so o que o hook precisa", async () => {
    const m = montar();
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      ok: true,
      convite_id: CONVITE,
      email_enviado: true,
      valid_until: "2026-10-30T12:00:00.000Z",
      email_erro: null,
      link: null,
      link_retido: false,
      rascunho_herdado: false,
    });
    const html = String(m.emails[0].body.html);
    const token = html.match(/\/admissao\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(token.length).toBe(43);
    expect(r.texto).not.toContain(token);
  });

  it("o e-mail usa a validade do resumo (chamado com o JWT do RH) e nao 7 dias fixos", async () => {
    const m = montar();
    await m.chamar(PEDIDO_CRIAR, AUTH);
    const resumo = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_resumo");
    expect(resumo?.cliente).toBe("user");
    expect(resumo?.args).toEqual({ p_pessoa_id: PESSOA });
    expect(m.clientesCriados).toContainEqual({ key: "ANON", authorization: `Bearer ${JWT}` });
    const html = String(m.emails[0].body.html);
    expect(html).toContain("30/10/2026");
    expect(html).not.toMatch(/7 dias/);
    expect(m.emails[0].body.organization_id).toBe(ORG);
    expect(m.emails[0].body.to).toBe("ana@exemplo.pt");
  });

  it("o resumo falhar nao impede o convite: o e-mail sai sem data e valid_until fica nulo", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_resumo: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(r.status).toBe(200);
    expect(r.corpo.valid_until).toBeNull();
    expect(String(m.emails[0].body.html)).not.toMatch(/\d+ dias/);
    semSegredo([], m, r.texto);
  });

  it("regista o resultado do envio com a RPC propria (service_role)", async () => {
    const ok = montar();
    await ok.chamar(PEDIDO_CRIAR, AUTH);
    const a = ok.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_registar_envio");
    expect(a?.cliente).toBe("svc");
    expect(a?.args).toEqual({ p_convite_id: CONVITE, p_enviado: true, p_erro: null });

    const falha = montar({ emailErro: { message: "smtp em baixo" } });
    const r = await falha.chamar(PEDIDO_CRIAR, AUTH);
    const b = falha.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_registar_envio");
    expect(b?.args).toMatchObject({ p_convite_id: CONVITE, p_enviado: false, p_erro: "smtp_falhou" });
    expect(r.corpo.email_enviado).toBe(false);
    expect(r.corpo.link_retido).toBe(false);
    expect(String(r.corpo.link)).toMatch(/^https:\/\/app\.exemplo\.pt\/admissao\//);
  });

  it("nunca herda rascunho: rascunho_herdado = true da base nao retem o link", async () => {
    const m = montar({
      emailErro: { message: "smtp em baixo" },
      rpc: { rpc_hr_convite_admissao_criar: () => ({ data: [{ convite_id: CONVITE, rascunho_herdado: true }], error: null }) },
    });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(r.corpo.link).not.toBeNull();
    expect(r.corpo.rascunho_herdado).toBe(false);
  });

  const ERROS: Array<[string, string, number]> = [
    ["HRA31", "nao_encontrado", 404],
    ["HRA32", "processo_aberto", 409],
    ["HRA33", "organizacao_nao_empregadora", 403],
    ["HRA34", "token_invalido", 500],
    ["HRA35", "email_invalido", 400],
    ["HRA36", "token_repetido", 500],
  ];
  it.each(ERROS)("mapeia %s (%s) para o estado %i, sem details nem texto do Postgres", async (sqlstate, codigo, status) => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_criar: () => ({
          data: null,
          error: { code: sqlstate, message: codigo, details: `Key (token_hash)=(${SEGREDO}) already exists.`, hint: SEGREDO },
        }),
      },
    });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(r.status).toBe(status);
    expect(r.corpo).toEqual({ error: codigo });
    expect(m.emails).toHaveLength(0);
    semSegredo([], m, r.texto);
  });

  it("token_repetido (HRA36): gera OUTRO token e tenta uma vez mais", async () => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_criar: (_a, n) =>
          n === 1
            ? { data: null, error: { code: "HRA36", message: "token_repetido", details: null } }
            : { data: [{ convite_id: CONVITE, rascunho_herdado: false }], error: null },
      },
    });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(r.status).toBe(200);
    const criar = m.rpcs.filter((x) => x.fn === "rpc_hr_convite_admissao_criar");
    expect(criar).toHaveLength(2);
    expect(criar[0].args.p_token_hash).not.toBe(criar[1].args.p_token_hash);
    // o link/email usa o token da SEGUNDA tentativa
    const token = String(m.emails[0].body.html).match(/\/admissao\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(await sha256Hex(token)).toBe(criar[1].args.p_token_hash);
  });

  it("token_repetido duas vezes: desiste ao fim de UMA repeticao (2 chamadas) com o codigo estavel", async () => {
    const m = montar({
      rpc: { rpc_hr_convite_admissao_criar: () => ({ data: null, error: { code: "HRA36", message: "token_repetido" } }) },
    });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo]).toEqual([500, { error: "token_repetido" }]);
    expect(m.rpcs.filter((x) => x.fn === "rpc_hr_convite_admissao_criar")).toHaveLength(2);
  });

  it("um erro nao catalogado (CHECK, 23514) da erro_inesperado e nao vaza nada", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_criar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    expect(m.erros.length).toBe(1);
    semSegredo([], m, r.texto);
  });

  it("limite por utilizador: 429 e a RPC nao e chamada", async () => {
    const m = montar({ limiteBloqueado: (o) => o.bucket === "convite-admissao-criar" });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_criar")).toBe(false);
  });

  it("o erro do e-mail sai saneado (sem token) e nunca vai para o Sentry em bruto", async () => {
    const m = montar({ emailErro: { message: `falhou https://app.exemplo.pt/admissao/${"z".repeat(43)}` } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(String(r.corpo.email_erro)).not.toContain("z".repeat(43));
    for (const e of m.erros) expect(e.message).not.toContain("z".repeat(43));
  });
});

// ---------------------------------------------------------------------------
describe("cancelar", () => {
  it("reencaminha o JWT do RH (cliente ANON com Authorization) e nunca usa service_role", async () => {
    const m = montar();
    const r = await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "  desistiu  " }, AUTH);
    expect(r.status).toBe(200);
    const c = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_cancelar");
    expect(c?.cliente).toBe("user");
    expect(c?.args).toEqual({ p_convite_id: CONVITE, p_organization_id: ORG, p_motivo: "desistiu" });
    expect(m.clientesCriados).toContainEqual({ key: "ANON", authorization: `Bearer ${JWT}` });
    expect(m.rpcs.filter((x) => x.cliente === "svc" && x.fn.startsWith("rpc_hr_convite_admissao_cancelar"))).toHaveLength(0);
  });

  it("so devolve o que o ecra precisa (sem hash nem dados sensiveis)", async () => {
    const m = montar();
    const r = await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "x" }, AUTH);
    expect(r.corpo).toEqual({ ok: true, convite_id: CONVITE, estado: "cancelada", estado_portal: "revogado" });
    expect(r.texto).not.toContain("token_hash");
  });

  it("sem sessao: 401; JWT invalido: 401; pedido invalido: 400", async () => {
    const m = montar();
    expect((await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "x" })).status).toBe(401);
    expect((await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "x" }, { Authorization: "Bearer mau" })).status).toBe(401);
    for (const p of [
      { action: "cancelar", convite_id: "nao-uuid", motivo: "x" },
      { action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "   " },
      { action: "cancelar", convite_id: CONVITE, organization_id: ORG },
      { action: "cancelar", convite_id: CONVITE, motivo: "x" },
      { action: "cancelar", convite_id: CONVITE, organization_id: "x", motivo: "x" },
      { action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: 5 },
      { action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "x".repeat(2001) },
    ]) {
      const r = await m.chamar(p, AUTH);
      expect([r.status, r.corpo.error]).toEqual([400, "pedido_invalido"]);
    }
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_cancelar")).toBe(false);
  });

  it.each([
    ["HRA31", "nao_encontrado", 404],
    ["HRA33", "organizacao_nao_empregadora", 403],
    ["HRA37", "motivo_invalido", 400],
    ["HRA38", "estado_invalido", 409],
    ["HRA41", "limite_excedido", 429],
    // desde `aprovada` sem hr.onboarding.approve: o mesmo erro de "nao existe"
    ["42501", "nao_encontrado", 404],
  ])("mapeia %s para %s (%i) sem details", async (sqlstate, codigo, status) => {
    const m = montar({
      rpc: { rpc_hr_convite_admissao_cancelar: () => ({ data: null, error: { code: sqlstate, message: codigo, details: SEGREDO } }) },
    });
    const r = await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "x" }, AUTH);
    expect([r.status, r.corpo]).toEqual([status, { error: codigo }]);
    semSegredo([], m, r.texto);
  });

  it("erro nao catalogado: erro_inesperado, sem texto do Postgres no corpo nem no log", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_cancelar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar({ action: "cancelar", convite_id: CONVITE, organization_id: ORG, motivo: "x" }, AUTH);
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semSegredo([], m, r.texto);
  });
});

describe("prolongar", () => {
  it("reencaminha o JWT, passa p_dias inteiro e devolve a nova validade", async () => {
    const m = montar();
    const r = await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias: 14 }, AUTH);
    const c = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_prolongar");
    expect(c?.cliente).toBe("user");
    expect(c?.args).toEqual({ p_convite_id: CONVITE, p_organization_id: ORG, p_dias: 14 });
    expect(r.corpo).toEqual({
      ok: true,
      convite_id: CONVITE,
      valid_until: "2026-11-30T12:00:00Z",
      estado: "convidada",
      estado_portal: "ativo",
    });
  });

  it("dias invalidos (nao inteiro, 0, 91, texto) dao 400 sem chamar a RPC", async () => {
    const m = montar();
    for (const dias of [0, -1, 91, 1.5, "7", null, undefined, Number.NaN]) {
      const r = await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias }, AUTH);
      expect([r.status, r.corpo.error]).toEqual([400, "dias_invalidos"]);
    }
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_prolongar")).toBe(false);
    for (const dias of [1, 90]) {
      expect((await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias }, AUTH)).status).toBe(200);
    }
  });

  it("sem organization_id valido: 400 pedido_invalido; prazo_excedido (HRA40) da 409 estavel", async () => {
    const m = montar({
      rpc: { rpc_hr_convite_admissao_prolongar: () => ({ data: null, error: { code: "HRA40", message: "prazo_excedido", details: SEGREDO } }) },
    });
    const sem = await m.chamar({ action: "prolongar", convite_id: CONVITE, dias: 7 }, AUTH);
    expect([sem.status, sem.corpo.error]).toEqual([400, "pedido_invalido"]);
    const r = await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias: 90 }, AUTH);
    expect([r.status, r.corpo]).toEqual([409, { error: "prazo_excedido" }]);
    semSegredo([], m, r.texto);
  });

  it("sem sessao 401; convite_id mau 400; erros da RPC mapeados", async () => {
    const m = montar();
    expect((await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias: 7 })).status).toBe(401);
    expect((await m.chamar({ action: "prolongar", convite_id: "x", dias: 7 }, AUTH)).status).toBe(400);
    const n = montar({
      rpc: { rpc_hr_convite_admissao_prolongar: () => ({ data: null, error: { code: "HRA38", message: "estado_invalido", details: SEGREDO } }) },
    });
    const r = await n.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias: 7 }, AUTH);
    expect([r.status, r.corpo]).toEqual([409, { error: "estado_invalido" }]);
    semSegredo([], n, r.texto);
  });

  it("limite_excedido (HRA41) da 429 e nao e reportado como defeito", async () => {
    for (const accao of ["cancelar", "prolongar"] as const) {
      const m = montar({
        rpc: {
          [`rpc_hr_convite_admissao_${accao}`]: () => ({
            data: null,
            error: { code: "HRA41", message: "limite_excedido", details: SEGREDO },
          }),
        },
      });
      const pedido = accao === "cancelar"
        ? { action: accao, convite_id: CONVITE, organization_id: ORG, motivo: "x" }
        : { action: accao, convite_id: CONVITE, organization_id: ORG, dias: 7 };
      const r = await m.chamar(pedido, AUTH);
      expect([r.status, r.corpo]).toEqual([429, { error: "limite_excedido" }]);
      expect(m.erros).toHaveLength(0);
      semSegredo([], m, r.texto);
    }
  });

  it("limite por utilizador nas accoes do RH: 429", async () => {
    const m = montar({ limiteBloqueado: (o) => o.bucket === "convite-admissao-prolongar" });
    const r = await m.chamar({ action: "prolongar", convite_id: CONVITE, organization_id: ORG, dias: 7 }, AUTH);
    expect(r.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe("rascunho (publico, com sessao)", () => {
  const NISS = "98765432109";
  const IBAN = "PT50000201231234567890154";
  const rasc = (rascunho: unknown, extra: Record<string, unknown> = {}) => ({
    action: "rascunho",
    token: TOKEN_PUBLICO,
    rascunho,
    ...extra,
  });
  const gravou = (m: ReturnType<typeof montar>) => m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_rascunho");

  it("chama a RPC nova com o hash da sessao e retira niss, iban e conta_numero ANTES dela", async () => {
    const m = montar();
    const r = await m.chamar(
      rasc({ nif: "123", niss: "9", iban: "PT50", conta_numero: "PT50", conta_bic: "BCOMPTPL", genero: "f" }),
      COM_SESSAO,
    );
    expect(r).toMatchObject({ status: 200, corpo: { ok: true } });
    const c = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_rascunho");
    expect(c?.cliente).toBe("svc");
    expect(c?.args).toEqual({
      p_token_hash: await sha256Hex(TOKEN_PUBLICO),
      p_sessao_hash: await sha256Hex(SESSAO),
      p_rascunho: { nif: "123", conta_bic: "BCOMPTPL", genero: "f" },
    });
    // nada de sensivel foi pedido: o Vault nao e tocado
    expect(m.rpcs.some((x) => x.fn === "rpc_hr_convite_admissao_sensiveis_gravar")).toBe(false);
  });

  it("devolve guardado_em quando a base o da", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_rascunho: () => ({ data: { ok: true, guardado_em: "2026-10-27T10:00:00Z" }, error: null }) } });
    const r = await m.chamar(rasc({ nif: "1" }), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([200, { ok: true, guardado_em: "2026-10-27T10:00:00Z" }]);
  });

  it("a sessao tambem vale no corpo (campo sessao), como nas outras accoes", async () => {
    const m = montar();
    const r = await m.chamar(rasc({ nif: "1" }, { sessao: SESSAO }));
    expect(r.status).toBe(200);
    expect(m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_rascunho")?.args.p_sessao_hash).toBe(await sha256Hex(SESSAO));
  });

  it("o link sozinho nao escreve: sem sessao ou com sessao mal formada, 401 sessao_ausente e nenhuma RPC", async () => {
    for (const cab of [{}, { "x-portal-sessao": "curta" }, { "x-portal-sessao": "!".repeat(43) }]) {
      const m = montar();
      const r = await m.chamar(rasc({ nif: "1" }, { niss: NISS }), cab);
      expect([r.status, r.corpo]).toEqual([401, { error: "sessao_ausente" }]);
      expect(m.rpcs).toHaveLength(0);
      expect(r.texto).not.toContain(NISS);
    }
  });

  it("NISS e IBAN de topo vao ao Vault pelo caminho existente, nunca no rascunho, e so os ultimos 4 voltam", async () => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_rascunho: () => ({ data: { ok: true, guardado_em: "2026-10-27T10:00:00Z" }, error: null }),
        rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: { niss_ultimos4: "2109", iban_ultimos4: "0154" }, error: null }),
      },
    });
    const r = await m.chamar(rasc({ nif: "1", niss: NISS, iban: IBAN }, { niss: NISS, iban: IBAN }), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([
      200,
      { ok: true, guardado_em: "2026-10-27T10:00:00Z", niss_ultimos4: "2109", iban_ultimos4: "0154" },
    ]);
    const fns = m.rpcs.map((x) => x.fn);
    expect(fns.indexOf("rpc_hr_convite_admissao_rascunho")).toBeLessThan(fns.indexOf("rpc_hr_convite_admissao_sensiveis_gravar"));
    expect(m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_sensiveis_gravar")?.args).toEqual({
      p_token_hash: await sha256Hex(TOKEN_PUBLICO),
      p_sessao_hash: await sha256Hex(SESSAO),
      p_niss: NISS,
      p_iban: IBAN,
    });
    const rascunhoRpc = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_rascunho");
    expect(JSON.stringify(rascunhoRpc?.args)).not.toContain(NISS);
    expect(JSON.stringify(rascunhoRpc?.args)).not.toContain(IBAN);
    expect(r.texto).not.toContain(NISS);
    expect(r.texto).not.toContain(IBAN);
  });

  it("um NISS recusado pelo Vault nao perde o rascunho: 200 com sensivel_recusado e o codigo, sem o valor", async () => {
    for (const [msg, sqlstate] of [["niss_invalido", "HRA12"], ["iban_invalido", "HRA16"], ["campo_bloqueado", "HRA47"]]) {
      const m = montar({
        rpc: { rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: { message: msg, details: NISS, code: sqlstate } }) },
      });
      const r = await m.chamar(rasc({ nif: "1" }, { niss: NISS }), COM_SESSAO);
      expect([r.status, r.corpo.ok, r.corpo.sensivel_recusado]).toEqual([200, true, msg]);
      expect(gravou(m)).toBe(true);
      expect(r.texto).not.toContain(NISS);
      expect(m.erros).toHaveLength(0);
    }
  });

  it("outro erro do Vault (sessao expirada) sai como codigo do catalogo e nao finge sucesso", async () => {
    const m = montar({
      rpc: { rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: { message: "x", code: "HRA53" } }) },
    });
    const r = await m.chamar(rasc({ nif: "1" }, { iban: IBAN }), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([401, { error: "sessao_expirada" }]);
  });

  it("niss ou iban de topo que nao sao texto: 400 pedido_invalido e nada e gravado", async () => {
    for (const extra of [{ niss: 5 }, { iban: {} }, { niss: "9".repeat(33) }, { iban: "P".repeat(65) }]) {
      const m = montar();
      const r = await m.chamar(rasc({ nif: "1" }, extra), COM_SESSAO);
      expect([r.status, r.corpo.error]).toEqual([400, "pedido_invalido"]);
      expect(m.rpcs).toHaveLength(0);
    }
  });

  it("recusa valores aninhados e textos de mais de 500 caracteres, sem chamar a RPC", async () => {
    const m = montar();
    for (const rascunho of [{ nif: { a: 1 } }, { nif: ["1"] }, { genero: "x".repeat(501) }]) {
      const r = await m.chamar(rasc(rascunho), COM_SESSAO);
      expect([r.status, r.corpo]).toEqual([400, { error: "rascunho_valor_invalido" }]);
    }
    expect(gravou(m)).toBe(false);
    const ok = await m.chamar(rasc({ genero: "x".repeat(500), dependentes: 2, nif: null, linha1: "a" }), COM_SESSAO);
    expect(ok.status).toBe(200);
  });

  it("recusa chaves fora da lista branca com um codigo claro e nao chama a RPC", async () => {
    const m = montar();
    const r = await m.chamar(rasc({ nif: "1", aceite: true }), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([400, { error: "rascunho_chave_invalida" }]);
    expect(gravou(m)).toBe(false);
  });

  it("mantem o limite de 20 000 bytes (400 rascunho_demasiado_grande)", async () => {
    const m = montar();
    const r = await m.chamar(rasc(Object.fromEntries(CHAVES_RASCUNHO_PERMITIDAS.map((k) => [k, "x".repeat(500)]))), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([400, { error: "rascunho_demasiado_grande" }]);
    expect(gravou(m)).toBe(false);
  });

  it("pedido sem objecto: 400 pedido_invalido", async () => {
    const m = montar();
    for (const rascunho of [null, [], "x", 5, undefined]) {
      const r = await m.chamar(rasc(rascunho), COM_SESSAO);
      expect([r.status, r.corpo.error]).toEqual([400, "pedido_invalido"]);
    }
    expect(m.rpcs).toHaveLength(0);
  });

  it("um CHECK violado (23514) nao perde a conversa: rascunho_nao_gravado, sem linha na resposta nem no log", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_rascunho: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(rasc({ nif: "1" }), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([400, { error: "rascunho_nao_gravado" }]);
    expect(m.erros.length).toBe(1);
    semSegredo([], m, r.texto);
  });

  it("as recusas da base saem como codigos do catalogo (estado, bloqueio de campo, sessao, convite)", async () => {
    const casos: Array<[string, string, number, string]> = [
      ["x", "HRA02", 401, "convite_ja_usado"],
      ["x", "HRA03", 401, "convite_revogado"],
      ["x", "HRA04", 401, "convite_expirado"],
      ["x", "HRA38", 409, "estado_invalido"],
      ["x", "HRA47", 409, "campo_bloqueado"],
      ["x", "HRA51", 401, "sessao_ausente"],
      ["x", "HRA52", 401, "sessao_expirada"],
      ["x", "HRA53", 401, "sessao_expirada"],
      ["x", "HRA31", 401, "convite_invalido"],
      ["rascunho_demasiado_grande", "HRA10", 400, "rascunho_demasiado_grande"],
      ["rascunho_chave_invalida", "HRA10", 400, "rascunho_chave_invalida"],
    ];
    for (const [message, code, status, esperado] of casos) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_rascunho: () => ({ data: null, error: { message, code, details: "SEGREDO" } }) } });
      const r = await m.chamar(rasc({ nif: "1" }), COM_SESSAO);
      expect([r.status, r.corpo], code).toEqual([status, { error: esperado }]);
      semSegredo([], m, r.texto);
    }
  });

  it("uma resposta da base sem ok:true da erro_inesperado e reporta sem dados", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_rascunho: () => ({ data: { erro: "texto livre SEGREDO" }, error: null }) } });
    const r = await m.chamar(rasc({ nif: "1" }), COM_SESSAO);
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semSegredo([], m, r.texto);
  });
});

// ---------------------------------------------------------------------------
describe("limites das accoes publicas", () => {
  it("token curto ou comprido da 401 convite_invalido sem tocar na base", async () => {
    const m = montar();
    for (const token of ["curto", "x".repeat(201), 5, undefined]) {
      const r = await m.chamar({ action: "estado", token });
      expect([r.status, r.corpo.error]).toEqual([401, "convite_invalido"]);
    }
    expect(m.rpcs).toHaveLength(0);
    expect(m.limites).toHaveLength(0);
  });

  it("limita por IP (como ate aqui) E por token_hash, com a mesma tabela de tectos", async () => {
    const m = montar();
    await m.chamar({ action: "rascunho", token: TOKEN_PUBLICO, rascunho: {} }, { ...COM_SESSAO, "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    const hash = await sha256Hex(TOKEN_PUBLICO);
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-rascunho", identifier: "203.0.113.9", maxAttempts: 240 });
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-token-rascunho", identifier: hash, maxAttempts: 240 });
    expect(m.tentativas).toContainEqual({ bucket: "convite-admissao-token-rascunho", identifier: hash });
    expect(m.tentativas).toContainEqual({ bucket: "convite-admissao-rascunho", identifier: "203.0.113.9" });
    // o identificador por token e o hash, nunca o token em claro
    expect(JSON.stringify([m.limites, m.tentativas])).not.toContain(TOKEN_PUBLICO);
  });

  it("tectos por accao: estado 30, submeter 10, anexos 30", async () => {
    const m = montar();
    await m.chamar({ action: "estado", token: TOKEN_PUBLICO });
    await m.chamar(SUBMETER, COM_SESSAO);
    const max = (b: string) => m.limites.find((l) => l.bucket === b)?.maxAttempts;
    expect(max("convite-admissao-token-estado")).toBe(30);
    expect(max("convite-admissao-token-submeter")).toBe(10);
  });

  it("um IP forjado (x-forwarded-for diferente em cada pedido) nao escapa ao limite por token", async () => {
    const m = montar();
    const pedido = SUBMETER;
    for (let i = 0; i < 10; i++) {
      const r = await m.chamar(pedido, { ...COM_SESSAO, "x-forwarded-for": `198.51.100.${i + 1}` });
      expect(r.status).toBe(200);
    }
    const onze = await m.chamar(pedido, { ...COM_SESSAO, "x-forwarded-for": "198.51.100.200" });
    expect([onze.status, onze.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
    expect(m.rpcs.filter((x) => x.fn === "rpc_hr_convite_admissao_submeter")).toHaveLength(10);
  });

  it("excedido o limite por token: 429 e a RPC nao e chamada", async () => {
    const m = montar({ limiteBloqueado: (o) => o.bucket.startsWith("convite-admissao-token-") });
    const r = await m.chamar({ action: "estado", token: TOKEN_PUBLICO });
    expect([r.status, r.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
    expect(m.rpcs).toHaveLength(0);
  });

  it("outro token tem o seu proprio contador", async () => {
    const m = montar();
    const pedido = (token: string) => ({ ...SUBMETER, token });
    for (let i = 0; i < 10; i++) await m.chamar(pedido(TOKEN_PUBLICO), COM_SESSAO);
    expect((await m.chamar(pedido(TOKEN_PUBLICO), COM_SESSAO)).status).toBe(429);
    const outro = await m.chamar(pedido("u".repeat(43)), { ...COM_SESSAO, "x-forwarded-for": "198.51.100.77" });
    expect(outro.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe("criar guarda o link no Vault (V3a: link_guardar)", () => {
  it("chama rpc_hr_convite_link_guardar logo a seguir a _criar, com o token que gerou (o hash dele e o da _criar)", async () => {
    const m = montar();
    await m.chamar(PEDIDO_CRIAR, AUTH);
    const fns = m.rpcs.map((r) => r.fn);
    const criar = m.rpcs.find((r) => r.fn === "rpc_hr_convite_admissao_criar")!;
    const guardar = m.rpcs.find((r) => r.fn === "rpc_hr_convite_link_guardar")!;
    expect(guardar.cliente).toBe("svc");
    expect(Object.keys(guardar.args).sort()).toEqual(["p_convite_id", "p_token"]);
    expect(guardar.args.p_convite_id).toBe(CONVITE);
    expect(await sha256Hex(guardar.args.p_token as string)).toBe(criar.args.p_token_hash);
    // antes do resumo e do e-mail: se o resto falhar, o link ja esta guardado
    expect(fns.indexOf("rpc_hr_convite_link_guardar")).toBe(fns.indexOf("rpc_hr_convite_admissao_criar") + 1);
  });

  it("com token_repetido guarda o token da tentativa que deu certo", async () => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_criar: (_a, n) =>
          n === 1
            ? { data: null, error: { message: "token_repetido", code: "HRA36" } }
            : { data: [{ convite_id: CONVITE, rascunho_herdado: false }], error: null },
      },
    });
    await m.chamar(PEDIDO_CRIAR, AUTH);
    const criar = m.rpcs.filter((r) => r.fn === "rpc_hr_convite_admissao_criar");
    const guardar = m.rpcs.filter((r) => r.fn === "rpc_hr_convite_link_guardar");
    expect(guardar).toHaveLength(1);
    expect(await sha256Hex(guardar[0].args.p_token as string)).toBe(criar[1].args.p_token_hash);
  });

  it("o token continua a nao ir na resposta quando o e-mail saiu", async () => {
    const m = montar();
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    const guardar = m.rpcs.find((x) => x.fn === "rpc_hr_convite_link_guardar")!;
    expect(r.texto).not.toContain(guardar.args.p_token as string);
    expect(r.corpo.link).toBeNull();
  });

  it("se guardar o link falhar o convite NAO falha (o e-mail sai); o defeito reporta-se sem a linha", async () => {
    const m = montar({ rpc: { rpc_hr_convite_link_guardar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.ok, r.corpo.email_enviado]).toEqual([200, true, true]);
    expect(m.erros.length).toBeGreaterThan(0);
    semSegredo([], m, r.texto);
  });

  it("sem id de convite nao ha nada a guardar", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_criar: () => ({ data: [{ rascunho_herdado: false }], error: null }) } });
    await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(m.rpcs.some((r) => r.fn === "rpc_hr_convite_link_guardar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("criar: o e-mail do convite sai por correio directo (V3a)", () => {
  it("NUNCA pela send-email (que gravaria o link em email_logs): nenhuma funcao e invocada", async () => {
    const m = montar();
    await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(m.invocacoes).toEqual([]);
    expect(m.emails).toHaveLength(1);
  });

  it("vai ao e-mail do pedido, na organizacao activa, com o link e a validade do resumo, e sem dados pessoais", async () => {
    const m = montar();
    await m.chamar(PEDIDO_CRIAR, AUTH);
    const { to, subject, html, organization_id: org } = m.emails[0].body;
    expect([to, org]).toEqual(["ana@exemplo.pt", ORG]);
    const link = String(html).match(/https:\/\/app\.exemplo\.pt\/admissao\/[A-Za-z0-9_-]{43}/)?.[0] ?? "";
    expect(link).not.toBe("");
    expect(m.textos[0]).toContain(link);
    // 30/10/2026: a validade que o resumo devolveu, nao um numero fixo
    for (const t of [String(html), m.textos[0]]) expect(t).toContain("30/10/2026");
    for (const t of [String(html), m.textos[0], String(subject)]) {
      expect(t).not.toContain("Ana");
      expect(t).not.toContain("ana@exemplo.pt");
    }
  });

  it("se o correio falhar o link volta ao RH uma so vez, o envio fica registado com o CODIGO e nada vaza", async () => {
    const m = montar({ emailErro: { message: "535 auth falhou ana@segredo.pt password=segredo" } });
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect(r.corpo.email_enviado).toBe(false);
    expect(String(r.corpo.link)).toMatch(/^https:\/\/app\.exemplo\.pt\/admissao\//);
    expect(r.corpo.email_erro).toBe("smtp_falhou");
    const reg = m.rpcs.find((x) => x.fn === "rpc_hr_convite_admissao_registar_envio");
    expect(reg?.args).toEqual({ p_convite_id: CONVITE, p_enviado: false, p_erro: "smtp_falhou" });
    expect(r.texto).not.toContain("segredo");
    expect(JSON.stringify(m.erros.map((e) => e.message))).not.toContain("segredo");
  });

  it("sem correio configurado o convite cria-se, o link volta ao RH e o erro e smtp_nao_configurado", async () => {
    const m = montar();
    delete m.deps.enviarCorreio;
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.email_enviado, r.corpo.email_erro]).toEqual([200, false, "smtp_nao_configurado"]);
    expect(String(r.corpo.link)).toContain("/admissao/");
  });

  it("um enviador que LANCA nao vaza o texto do erro", async () => {
    const m = montar();
    m.deps.enviarCorreio = async () => {
      throw new Error("falha para ana@segredo.pt");
    };
    const r = await m.chamar(PEDIDO_CRIAR, AUTH);
    expect([r.status, r.corpo.email_erro]).toEqual([200, "smtp_falhou"]);
    expect(r.texto).not.toContain("segredo");
    expect(JSON.stringify(m.erros.map((e) => e.message))).not.toContain("segredo");
  });
});

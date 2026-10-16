/**
 * @vitest-environment node
 *
 * As accoes do portal por OTP e sessao (V3a) e a accao do RH `reenviar`, com o
 * Supabase e o SMTP simulados: sem rede, sem Deno. Verifica comportamento: que
 * RPC se chama, com que argumentos, que codigos e estados HTTP saem, e que
 * NADA sensivel (codigo OTP, HMAC, sessao, e-mail do convite, token,
 * error.details) chega a resposta, ao registo de erros ou a consola.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarHandler, type DepsConvite } from "./handler.ts";
import type { PedidoCorreio, ResultadoCorreio } from "./correio.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const CONVITE = "22222222-2222-4222-8222-222222222222";
const UTILIZADOR = "33333333-3333-4333-8333-333333333333";
const JWT = "jwt-valido";
const TOKEN = "t".repeat(43);
const PEPPER = "pepper-de-teste-".repeat(4);
const SESSAO = "S".repeat(43);
const EMAIL_CONVITE = "ana.fixada@exemplo.pt";
const TOKEN_LINK = "R".repeat(43);

const SEGREDO = "tok_SEGREDO_9f2 ana@segredo.pt 123456789 PT50000201231234567890154";
const ERRO_CHECK = {
  code: "23514",
  message: `new row violates check constraint "x": Failing row contains (${SEGREDO})`,
  details: `Failing row contains (${SEGREDO})`,
  hint: null,
};

type Resposta = { data: unknown; error: unknown };
type ManipuladorRpc = (args: Record<string, unknown>, chamada: number) => Resposta;

interface Opcoes {
  rpc?: Record<string, ManipuladorRpc>;
  pepper?: string | null;
  semCorreio?: boolean;
  correio?: (p: PedidoCorreio) => Promise<ResultadoCorreio> | ResultadoCorreio;
  limiteBloqueado?: (opts: { bucket: string; identifier: string }) => boolean;
  appBaseUrl?: string | null;
}

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hmacEsperado = (tokenHash: string, codigo: string) =>
  createHmac("sha256", PEPPER).update(`hr-admissao-otp|${tokenHash}|${codigo}`).digest("hex");

function montar(opcoes: Opcoes = {}) {
  const rpcs: Array<{ cliente: "svc" | "user"; fn: string; args: Record<string, unknown> }> = [];
  const contagem: Record<string, number> = {};
  const clientesCriados: Array<{ key: string; authorization?: string; headers?: Record<string, string> }> = [];
  const correio: PedidoCorreio[] = [];
  const invocacoes: string[] = [];
  const erros: Error[] = [];
  const limites: Array<{ bucket: string; identifier: string; maxAttempts: number }> = [];
  const tentativas: Array<{ bucket: string; identifier: string }> = [];

  const padrao: Record<string, ManipuladorRpc> = {
    rpc_hr_convite_admissao_otp_pedir: () => ({
      data: { email_destino: EMAIL_CONVITE, organization_id: ORG, expira_em: new Date(Date.now() + 600_000).toISOString() },
      error: null,
    }),
    rpc_hr_convite_admissao_otp_verificar: () => ({ data: { ok: true, sessao_expira_em: "2026-10-16T12:30:00.000Z" }, error: null }),
    rpc_hr_convite_admissao_sessao_terminar: () => ({ data: { ok: true, terminada: true }, error: null }),
    rpc_hr_convite_admissao_portal_ler: () => ({
      data: {
        estado: "em_preenchimento",
        rascunho: { nif: "123456789" },
        campos_obrigatorios: ["nif"],
        campos_editaveis: ["nif", "niss", "iban"],
        documentos_editaveis: ["fotografia"],
        niss_ultimos4: "2109",
        iban_ultimos4: "0154",
        devolucao: null,
        anexos: [],
        rejeicao_mensagem: null,
      },
      error: null,
    }),
    rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: { niss_ultimos4: "2109", iban_ultimos4: "0154" }, error: null }),
    rpc_hr_convite_admissao_estado: () => ({
      data: {
        existe: true,
        estado: "convidada",
        estado_portal: "ativo",
        valid_until: "2026-10-30T12:00:00.000Z",
        primeiro_nome: "Ana",
        organizacao_nome: "Nike",
        bloqueado: false,
        precisa_otp: true,
      },
      error: null,
    }),
    rpc_hr_convite_admissao_reenviar: () => ({
      data: { token: TOKEN_LINK, email_destino: EMAIL_CONVITE, valid_until: "2026-10-30T12:00:00.000Z", organization_id: ORG },
      error: null,
    }),
    rpc_hr_convite_admissao_registar_envio: () => ({ data: true, error: null }),
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
      from: () => ({ select: () => ({}) }),
      functions: {
        invoke: async (nome: string) => {
          invocacoes.push(nome);
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
    appBaseUrl: opcoes.appBaseUrl === undefined ? "https://app.exemplo.pt" : opcoes.appBaseUrl,
    allowedOrigin: null,
    otpPepper: opcoes.pepper === undefined ? PEPPER : opcoes.pepper,
    ...(opcoes.semCorreio
      ? {}
      : {
        enviarCorreio: async (p: PedidoCorreio) => {
          correio.push(p);
          return opcoes.correio ? await opcoes.correio(p) : { enviado: true as const };
        },
      }),
    // deno-lint-ignore no-explicit-any
    criarCliente: ((_url: string, key: string, op?: { authorization?: string; headers?: Record<string, string> }) => {
      clientesCriados.push({ key, authorization: op?.authorization, headers: op?.headers });
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
  };
  const handler = criarHandler(deps);

  async function chamar(
    payload: unknown,
    cabecalhos: Record<string, string> = {},
    url = "https://x.supabase.co/functions/v1/convite-admissao",
  ) {
    const res = await handler(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cabecalhos },
        body: JSON.stringify(payload),
      }),
    );
    const texto = await res.text();
    return {
      status: res.status,
      corpo: (texto ? JSON.parse(texto) : {}) as Record<string, unknown>,
      texto,
      cabecalhos: res.headers,
    };
  }

  const chamadas = (fn: string) => rpcs.filter((r) => r.fn === fn);
  return { chamar, rpcs, chamadas, clientesCriados, correio, invocacoes, erros, limites, tentativas };
}

let consola: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  consola = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
  for (const s of consola) s.mockImplementation(() => {});
});
afterEach(() => {
  for (const s of consola) s.mockRestore();
});

/** Nada do que e proibido aparece na resposta, no registo de erros, na consola nem nos limites. */
function semNada(m: ReturnType<typeof montar>, texto: string, proibidos: string[]) {
  const erros = JSON.stringify(m.erros.map((e) => [e.name, e.message, e.stack]));
  const log = JSON.stringify(consola.map((s) => s.mock.calls));
  const limites = JSON.stringify([m.limites, m.tentativas]);
  for (const p of proibidos) {
    expect(texto, `resposta com ${p}`).not.toContain(p);
    expect(erros, `Sentry com ${p}`).not.toContain(p);
    expect(log, `consola com ${p}`).not.toContain(p);
    expect(limites, `limites com ${p}`).not.toContain(p);
  }
}

const codigoDoCorreio = (m: ReturnType<typeof montar>) => /\b(\d{6})\b/.exec(m.correio[0]?.texto ?? "")?.[1] ?? "";
const PEDIDO_RPC_PORTAL = { token: TOKEN, sessao: SESSAO };
const AUTH = { Authorization: `Bearer ${JWT}` };

// ---------------------------------------------------------------------------
describe("despacho das accoes do portal", () => {
  it("cada accao chama a RPC certa com o cliente service_role e EXACTAMENTE os argumentos do SQL", async () => {
    const m = montar();
    const hash = await sha256Hex(TOKEN);
    const hashSessao = await sha256Hex(SESSAO);

    await m.chamar({ action: "otp_pedir", token: TOKEN });
    await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    await m.chamar({ action: "sair", ...PEDIDO_RPC_PORTAL });
    await m.chamar({ action: "ler", ...PEDIDO_RPC_PORTAL });
    await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901", iban: "PT50000201231234567890154" });

    const por = (fn: string) => m.chamadas(fn)[0];
    expect(por("rpc_hr_convite_admissao_otp_pedir")?.cliente).toBe("svc");
    expect(Object.keys(por("rpc_hr_convite_admissao_otp_pedir")!.args).sort()).toEqual(["p_otp_hmac", "p_token_hash"]);
    expect(por("rpc_hr_convite_admissao_otp_pedir")!.args.p_token_hash).toBe(hash);
    expect(Object.keys(por("rpc_hr_convite_admissao_otp_verificar")!.args).sort()).toEqual([
      "p_otp_hmac",
      "p_sessao_hash",
      "p_token_hash",
    ]);
    expect(por("rpc_hr_convite_admissao_sessao_terminar")!.args).toEqual({ p_token_hash: hash, p_sessao_hash: hashSessao });
    expect(por("rpc_hr_convite_admissao_portal_ler")!.args).toEqual({ p_token_hash: hash, p_sessao_hash: hashSessao });
    expect(por("rpc_hr_convite_admissao_sensiveis_gravar")!.args).toEqual({
      p_token_hash: hash,
      p_sessao_hash: hashSessao,
      p_niss: "12345678901",
      p_iban: "PT50000201231234567890154",
    });
    for (const r of m.rpcs) expect(r.cliente).toBe("svc");
  });

  it("so os nomes canonicos: os nomes das RPCs (sessao_terminar, portal_ler, sensiveis_gravar) dao 400 accao_desconhecida", async () => {
    const m = montar();
    for (const action of ["sessao_terminar", "portal_ler", "sensiveis_gravar"]) {
      const r = await m.chamar({ action, ...PEDIDO_RPC_PORTAL, niss: "12345678901" });
      expect([r.status, r.corpo.error]).toEqual([400, "accao_desconhecida"]);
    }
    expect(m.rpcs).toHaveLength(0);
    expect(m.limites).toHaveLength(0);
  });

  it("sem token valido: 401 convite_invalido e nada toca na base nem no correio", async () => {
    const m = montar();
    for (const accao of ["otp_pedir", "otp_verificar", "sair", "ler", "sensiveis"]) {
      for (const token of ["curto", "x".repeat(201), 5, undefined]) {
        const r = await m.chamar({ action: accao, token, sessao: SESSAO, codigo: "123456" });
        expect([r.status, r.corpo.error]).toEqual([401, "convite_invalido"]);
      }
    }
    expect(m.rpcs).toHaveLength(0);
    expect(m.correio).toHaveLength(0);
  });

  it("nenhuma RPC da V3a recebe IP nem user-agent (nao ha parametro para isso no SQL)", async () => {
    const m = montar();
    const cab = { "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" };
    await m.chamar({ action: "otp_pedir", token: TOKEN }, cab);
    await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" }, cab);
    await m.chamar({ action: "ler", ...PEDIDO_RPC_PORTAL }, cab);
    for (const r of m.rpcs) {
      expect(Object.keys(r.args).filter((k) => /ip|agent/i.test(k))).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
describe("otp_pedir", () => {
  it("a Edge gera o codigo e envia a RPC o HMAC com o pepper, ligado ao token_hash; o codigo nunca vai a base", async () => {
    const m = montar();
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect(r.status).toBe(200);
    const codigo = codigoDoCorreio(m);
    expect(codigo).toMatch(/^\d{6}$/);
    const args = m.chamadas("rpc_hr_convite_admissao_otp_pedir")[0].args;
    expect(args.p_otp_hmac).toBe(hmacEsperado(await sha256Hex(TOKEN), codigo));
    expect(JSON.stringify(args)).not.toContain(codigo);
  });

  it("envia por correio directo ao e-mail FIXADO no convite (o da RPC), nunca a um e-mail do pedido", async () => {
    const m = montar();
    await m.chamar({ action: "otp_pedir", token: TOKEN, email: "intruso@mau.pt", email_destino: "outro@mau.pt", organization_id: "x" });
    expect(m.correio).toHaveLength(1);
    expect(m.correio[0].para).toBe(EMAIL_CONVITE);
    expect(m.correio[0].organizationId).toBe(ORG);
    expect(JSON.stringify(m.correio[0])).not.toContain("mau.pt");
  });

  it("NUNCA passa pela send-email (que gravaria o codigo em email_logs)", async () => {
    const m = montar();
    await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect(m.invocacoes).toEqual([]);
    expect(m.correio).toHaveLength(1);
  });

  it("o e-mail e curto, tem o codigo e a validade, e nao traz o token, o link nem a organizacao", async () => {
    const m = montar();
    await m.chamar({ action: "otp_pedir", token: TOKEN });
    const { assunto, html, texto } = m.correio[0];
    expect(texto).toContain(codigoDoCorreio(m));
    expect(texto).toMatch(/minutos?/);
    for (const t of [assunto, html, texto]) {
      expect(t).not.toContain(TOKEN);
      expect(t).not.toContain(await sha256Hex(TOKEN));
      expect(t).not.toMatch(/https?:\/\//);
    }
  });

  it("o e-mail mascarado e o do convite, e nao o de um e-mail do pedido", async () => {
    const m = montar();
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN, email: "intruso@mau.pt" });
    expect(r.corpo.email_mascarado).toBe("a***@e***.pt");
    expect(r.texto).not.toContain("mau.pt");
  });

  it("a accao estado (sem sessao) nunca traz o e-mail, completo ou mascarado: so depois de o codigo ser pedido", async () => {
    const m = montar();
    const r = await m.chamar({ action: "estado", token: TOKEN });
    expect(r.texto).not.toContain("email");
    expect(r.texto).not.toContain("***");
    expect(r.texto).not.toContain(EMAIL_CONVITE);
  });

  it("a resposta nao traz o codigo, o HMAC, o e-mail, a organizacao nem o hash; os logs tambem nao", async () => {
    const m = montar();
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect(r.corpo.ok).toBe(true);
    expect(Object.keys(r.corpo).sort()).toEqual(["email_mascarado", "expira_em", "ok"]);
    // o e-mail FIXADO no convite (da RPC), mascarado: nunca o completo
    expect(r.corpo.email_mascarado).toBe("a***@e***.pt");
    const hash = await sha256Hex(TOKEN);
    const hmac = m.chamadas("rpc_hr_convite_admissao_otp_pedir")[0].args.p_otp_hmac as string;
    semNada(m, r.texto, [codigoDoCorreio(m), hmac, EMAIL_CONVITE, ORG, TOKEN, "SERVICE"]);
    expect(r.texto).not.toContain(hash);
  });

  it("falha fechada sem PORTAL_OTP_PEPPER (ou com um pepper curto): 503 otp_indisponivel, sem RPC, sem e-mail", async () => {
    for (const pepper of [null, "", "x-curto-123"]) {
      const m = montar({ pepper });
      const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
      expect([r.status, r.corpo.error]).toEqual([503, "otp_indisponivel"]);
      expect(m.rpcs).toHaveLength(0);
      expect(m.correio).toHaveLength(0);
      expect(m.erros.length).toBeGreaterThan(0);
      expect(JSON.stringify(m.erros.map((e) => e.message))).not.toContain("x-curto-123");
    }
  });

  it("falha fechada sem enviador de correio: 503 e nenhum OTP fica gravado", async () => {
    const m = montar({ semCorreio: true });
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect([r.status, r.corpo.error]).toEqual([503, "otp_indisponivel"]);
    expect(m.rpcs).toHaveLength(0);
  });

  it("as recusas da base (espera, limite diario, revogado, expirado, bloqueado, encerrado) mapeiam-se e nao enviam e-mail", async () => {
    const casos: Array<[string, string, number]> = [
      ["otp_espera", "HRA42", 429],
      ["otp_limite_diario", "HRA43", 429],
      ["convite_revogado", "HRA03", 401],
      ["convite_expirado", "HRA04", 401],
      ["convite_bloqueado", "HRA05", 401],
      ["convite_ja_usado", "HRA02", 401],
    ];
    for (const [codigo, sqlstate, status] of casos) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_otp_pedir: () => ({ data: null, error: { message: codigo, code: sqlstate } }) } });
      const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
      expect([r.status, r.corpo.error]).toEqual([status, codigo]);
      expect(m.correio).toHaveLength(0);
      expect(m.erros).toHaveLength(0);
    }
  });

  it("otp_espera e otp_limite_diario sao 429 (como os limites de pedidos)", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_pedir: () => ({ data: null, error: { message: "otp_espera", code: "HRA42" } }) } });
    expect((await m.chamar({ action: "otp_pedir", token: TOKEN })).status).toBe(429);
  });

  it("um token desconhecido (HRA31) nao revela que o convite nao existe: da o mesmo convite_invalido do estado", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_pedir: () => ({ data: null, error: { message: "nao_encontrado", code: "HRA31" } }) } });
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect([r.status, r.corpo.error]).toEqual([401, "convite_invalido"]);
  });

  it("um CHECK violado (error.details com a linha) da erro_inesperado e nao vaza nada", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_pedir: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    expect(m.erros.length).toBeGreaterThan(0);
    semNada(m, r.texto, ["SEGREDO", "violates", "Failing row"]);
    expect(m.correio).toHaveLength(0);
  });

  it("uma resposta da RPC sem e-mail valido nao envia nada e da erro_inesperado", async () => {
    for (const data of [null, {}, { email_destino: 5, organization_id: ORG }, { email_destino: "a@b.pt, c@d.pt", organization_id: ORG }, { email_destino: EMAIL_CONVITE, organization_id: "x" }]) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_otp_pedir: () => ({ data, error: null }) } });
      const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
      expect([r.status, r.corpo.error]).toEqual([500, "erro_inesperado"]);
      expect(m.correio).toHaveLength(0);
    }
  });

  it("o SMTP falhar da 502 email_nao_enviado; nem a mensagem do SMTP, nem o codigo, nem o e-mail vao a lado nenhum", async () => {
    const m = montar({ correio: () => ({ enviado: false, erroCodigo: "smtp_falhou" }) });
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect([r.status, r.corpo]).toEqual([502, { error: "email_nao_enviado" }]);
    semNada(m, r.texto, [codigoDoCorreio(m), EMAIL_CONVITE]);
  });

  it("um enviador que LANCA tambem da 502, e o texto do erro (com o codigo e o e-mail) nunca sai", async () => {
    const m = montar({
      correio: (p) => {
        throw new Error(`falha a enviar para ${p.para}: ${p.texto}`);
      },
    });
    const r = await m.chamar({ action: "otp_pedir", token: TOKEN });
    expect([r.status, r.corpo.error]).toEqual([502, "email_nao_enviado"]);
    semNada(m, r.texto, [EMAIL_CONVITE, "falha a enviar"]);
  });

  it("limita por IP E por token_hash (6 por hora); excedido: 429 e nem a RPC nem o correio", async () => {
    const m = montar();
    await m.chamar({ action: "otp_pedir", token: TOKEN }, { "x-forwarded-for": "203.0.113.9" });
    const hash = await sha256Hex(TOKEN);
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-otp_pedir", identifier: "203.0.113.9", maxAttempts: 6 });
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-token-otp_pedir", identifier: hash, maxAttempts: 6 });

    const b = montar({ limiteBloqueado: (o) => o.bucket.startsWith("convite-admissao-token-") });
    const r = await b.chamar({ action: "otp_pedir", token: TOKEN });
    expect([r.status, r.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
    expect(b.rpcs).toHaveLength(0);
    expect(b.correio).toHaveLength(0);
  });

  it("um IP forjado em cada pedido nao escapa ao limite por token", async () => {
    const m = montar();
    for (let i = 0; i < 6; i++) {
      expect((await m.chamar({ action: "otp_pedir", token: TOKEN }, { "x-forwarded-for": `198.51.100.${i + 1}` })).status).toBe(200);
    }
    const setimo = await m.chamar({ action: "otp_pedir", token: TOKEN }, { "x-forwarded-for": "198.51.100.200" });
    expect([setimo.status, setimo.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
    expect(m.chamadas("rpc_hr_convite_admissao_otp_pedir")).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
describe("otp_verificar", () => {
  it("calcula o HMAC do codigo recebido com o pepper e abre a sessao: a RPC so recebe o HASH da sessao", async () => {
    const m = montar();
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect(r.status).toBe(200);
    const args = m.chamadas("rpc_hr_convite_admissao_otp_verificar")[0].args;
    expect(args.p_token_hash).toBe(await sha256Hex(TOKEN));
    expect(args.p_otp_hmac).toBe(hmacEsperado(await sha256Hex(TOKEN), "123456"));
    const sessao = r.corpo.sessao as string;
    expect(sessao).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(args.p_sessao_hash).toBe(await sha256Hex(sessao));
    expect(JSON.stringify(args)).not.toContain(sessao);
    expect(JSON.stringify(args)).not.toContain("123456");
  });

  it("a sessao chega ao cliente SO no corpo da resposta (com a validade); nunca em cabecalhos, nem o hash", async () => {
    const m = montar();
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect(Object.keys(r.corpo).sort()).toEqual(["ok", "sessao", "sessao_expira_em"]);
    expect(r.corpo.sessao_expira_em).toBe("2026-10-16T12:30:00.000Z");
    expect(r.texto).not.toContain(await sha256Hex(r.corpo.sessao as string));
    expect(r.cabecalhos.get("x-portal-sessao")).toBeNull();
    expect(r.cabecalhos.get("location")).toBeNull();
    expect(JSON.stringify([...r.cabecalhos.entries()])).not.toContain(r.corpo.sessao as string);
    semNada(m, "", [r.corpo.sessao as string, "123456"]);
  });

  it("cada verificacao certa abre uma sessao diferente", async () => {
    const m = montar();
    const a = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    const b = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect(a.corpo.sessao).not.toBe(b.corpo.sessao);
  });

  it("os erros em jsonb mapeiam-se: invalido 401 com restantes, expirado 410, bloqueado 429", async () => {
    const casos: Array<[Record<string, unknown>, number]> = [
      [{ erro: "otp_invalido", restantes: 3 }, 401],
      [{ erro: "otp_expirado", restantes: 0 }, 410],
      [{ erro: "otp_bloqueado", restantes: 0 }, 429],
    ];
    for (const [data, status] of casos) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_otp_verificar: () => ({ data, error: null }) } });
      const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "654321" });
      expect(r.status).toBe(status);
      expect(r.corpo).toEqual({ error: data.erro, restantes: data.restantes });
      expect(r.corpo.sessao).toBeUndefined();
      semNada(m, r.texto, ["654321"]);
      expect(m.erros).toHaveLength(0);
    }
  });

  it("otp_bloqueado e otp_espera: 429; um erro jsonb fora do catalogo da erro_inesperado sem o ecoar", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_verificar: () => ({ data: { erro: "texto livre com SEGREDO", restantes: 9 }, error: null }) } });
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semNada(m, r.texto, ["SEGREDO"]);
  });

  it("restantes so sai se for um inteiro de 0 a 5", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_verificar: () => ({ data: { erro: "otp_invalido", restantes: "tres SEGREDO" }, error: null }) } });
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect(r.status).toBe(401);
    expect(r.texto).not.toContain("SEGREDO");
  });

  it("um codigo que nao sejam 6 digitos da 400 pedido_invalido sem chamar a base (nao gasta tentativas)", async () => {
    const m = montar();
    for (const codigo of ["12345", "1234567", "abcdef", "12 456", 123456, null, undefined, "١٢٣٤٥٦"]) {
      const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo });
      expect([r.status, r.corpo.error]).toEqual([400, "pedido_invalido"]);
    }
    expect(m.rpcs).toHaveLength(0);
  });

  it("falha fechada sem pepper: 503 otp_indisponivel e a RPC nao e chamada", async () => {
    const m = montar({ pepper: null });
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect([r.status, r.corpo.error]).toEqual([503, "otp_indisponivel"]);
    expect(m.rpcs).toHaveLength(0);
  });

  it("as recusas do portal por RAISE mapeiam-se (revogado, expirado, bloqueado, nao encontrado) e nao se reportam", async () => {
    for (const [codigo, sqlstate, status, esperado] of [
      ["convite_revogado", "HRA03", 401, "convite_revogado"],
      ["convite_expirado", "HRA04", 401, "convite_expirado"],
      ["convite_bloqueado", "HRA05", 401, "convite_bloqueado"],
      ["nao_encontrado", "HRA31", 401, "convite_invalido"],
    ] as const) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_otp_verificar: () => ({ data: null, error: { message: codigo, code: sqlstate } }) } });
      const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
      expect([r.status, r.corpo.error]).toEqual([status, esperado]);
      expect(m.erros).toHaveLength(0);
    }
  });

  it("um CHECK violado nao vaza a linha nem o codigo", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_verificar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semNada(m, r.texto, ["SEGREDO", "Failing row", "123456"]);
  });

  it("limita por IP e por token_hash (30 por hora)", async () => {
    const m = montar();
    await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" }, { "x-forwarded-for": "203.0.113.9" });
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-otp_verificar", identifier: "203.0.113.9", maxAttempts: 30 });
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-token-otp_verificar", identifier: await sha256Hex(TOKEN), maxAttempts: 30 });
    const b = montar({ limiteBloqueado: () => true });
    expect((await b.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" })).status).toBe(429);
    expect(b.rpcs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("a sessao do portal nas accoes seguintes", () => {
  it("le a sessao do cabecalho x-portal-sessao e manda a RPC so o SHA-256", async () => {
    const m = montar();
    const r = await m.chamar({ action: "ler", token: TOKEN }, { "x-portal-sessao": SESSAO });
    expect(r.status).toBe(200);
    const args = m.chamadas("rpc_hr_convite_admissao_portal_ler")[0].args;
    expect(args.p_sessao_hash).toBe(await sha256Hex(SESSAO));
    semNada(m, r.texto, [SESSAO]);
    expect(JSON.stringify(args)).not.toContain(SESSAO);
  });

  it("NUNCA aceita a sessao no URL: sem cabecalho nem corpo da 401 sessao_ausente e a RPC nao e chamada", async () => {
    const m = montar();
    const r = await m.chamar({ action: "ler", token: TOKEN }, {}, `https://x.supabase.co/functions/v1/convite-admissao?sessao=${SESSAO}&x-portal-sessao=${SESSAO}`);
    expect([r.status, r.corpo.error]).toEqual([401, "sessao_ausente"]);
    expect(m.rpcs).toHaveLength(0);
  });

  it("uma sessao mal formada e tratada como ausente (nunca chega a RPC)", async () => {
    const m = montar();
    for (const sessao of ["curta", "x".repeat(44), "x".repeat(42) + "!"]) {
      const r = await m.chamar({ action: "ler", token: TOKEN, sessao });
      expect([r.status, r.corpo.error]).toEqual([401, "sessao_ausente"]);
    }
    expect(m.rpcs).toHaveLength(0);
  });

  it("ler: HRA52 e HRA53 dao o MESMO erro e o MESMO corpo (nao se revela se alguem abriu sessao noutro dispositivo); HRA51 e sessao_ausente", async () => {
    for (const [codigo, sqlstate] of [["sessao_expirada", "HRA52"], ["sessao_expirada", "HRA53"], ["sessao_ausente", "HRA51"]]) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_portal_ler: () => ({ data: null, error: { message: "x", code: sqlstate } }) } });
      const r = await m.chamar({ action: "ler", ...PEDIDO_RPC_PORTAL });
      expect([r.status, r.corpo]).toEqual([401, { error: codigo }]);
      expect(m.erros).toHaveLength(0);
    }
  });

  it("sensiveis e sair tambem mapeiam as sessoes da base", async () => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: { message: "sessao_substituida", code: "HRA53" } }),
        rpc_hr_convite_admissao_sessao_terminar: () => ({ data: null, error: { message: "nao_encontrado", code: "HRA31" } }),
      },
    });
    expect((await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901" })).corpo.error).toBe("sessao_expirada");
    expect((await m.chamar({ action: "sair", ...PEDIDO_RPC_PORTAL })).corpo.error).toBe("convite_invalido");
  });

  it("ler so devolve as chaves documentadas da RPC (o resto, como um e-mail ou um token, cai)", async () => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_portal_ler: () => ({
          data: { estado: "devolvida", rascunho: {}, campos_obrigatorios: [], campos_editaveis: [], documentos_editaveis: [], niss_ultimos4: null, iban_ultimos4: null, devolucao: null, anexos: [], rejeicao_mensagem: null, email_destino: "x@y.pt", token_hash: "h", sessao_hash: "s", otp_hmac: "o" },
          error: null,
        }),
      },
    });
    const r = await m.chamar({ action: "ler", ...PEDIDO_RPC_PORTAL });
    expect(Object.keys(r.corpo).sort()).toEqual(
      ["anexos", "campos_editaveis", "campos_obrigatorios", "devolucao", "documentos_editaveis", "estado", "iban_ultimos4", "niss_ultimos4", "ok", "rascunho", "rejeicao_mensagem"].sort(),
    );
    for (const proibido of ["x@y.pt", "token_hash", "sessao_hash", "otp_hmac"]) expect(r.texto).not.toContain(proibido);
  });

  it("ler: um CHECK violado nao vaza a linha", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_portal_ler: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar({ action: "ler", ...PEDIDO_RPC_PORTAL });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semNada(m, r.texto, ["SEGREDO", "Failing row", SESSAO]);
  });

  it("os tectos por hora: ler 120, sensiveis 30, sair 20", async () => {
    const m = montar();
    await m.chamar({ action: "ler", ...PEDIDO_RPC_PORTAL });
    await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901" });
    await m.chamar({ action: "sair", ...PEDIDO_RPC_PORTAL });
    const max = (b: string) => m.limites.find((l) => l.bucket === b)?.maxAttempts;
    expect(max("convite-admissao-token-ler")).toBe(120);
    expect(max("convite-admissao-token-sensiveis")).toBe(30);
    expect(max("convite-admissao-token-sair")).toBe(20);
    // o identificador por token e o hash, e a sessao nunca e identificador
    semNada(m, "", [SESSAO, TOKEN]);
  });
});

// ---------------------------------------------------------------------------
describe("sair", () => {
  it("termina a sessao e diz se era a activa", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_sessao_terminar: () => ({ data: { ok: true, terminada: false }, error: null }) } });
    const r = await m.chamar({ action: "sair", ...PEDIDO_RPC_PORTAL });
    expect([r.status, r.corpo]).toEqual([200, { ok: true, terminada: false }]);
  });

  it("sem sessao nao ha nada a terminar: ok sem chamar a base (sair e idempotente)", async () => {
    const m = montar();
    const r = await m.chamar({ action: "sair", token: TOKEN });
    expect([r.status, r.corpo]).toEqual([200, { ok: true, terminada: false }]);
    expect(m.rpcs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("sensiveis", () => {
  it("sem sessao: 401 sessao_ausente e a RPC nao e chamada", async () => {
    const m = montar();
    const r = await m.chamar({ action: "sensiveis", token: TOKEN, niss: "12345678901" });
    expect([r.status, r.corpo.error]).toEqual([401, "sessao_ausente"]);
    expect(m.rpcs).toHaveLength(0);
  });

  it("devolve so as mascaras; o NISS e o IBAN nunca voltam, nem vao a logs, Sentry ou limites", async () => {
    const m = montar();
    const r = await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901", iban: "PT50000201231234567890154" });
    expect([r.status, r.corpo]).toEqual([200, { ok: true, niss_ultimos4: "2109", iban_ultimos4: "0154" }]);
    semNada(m, r.texto, ["12345678901", "PT50000201231234567890154"]);
  });

  it("ausente ou vazio vai como null (nao mexer); so um dos dois e valido", async () => {
    const m = montar();
    await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901" });
    await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "  ", iban: "PT50000201231234567890154" });
    const [a, b] = m.chamadas("rpc_hr_convite_admissao_sensiveis_gravar").map((c) => c.args);
    expect([a.p_niss, a.p_iban]).toEqual(["12345678901", null]);
    expect([b.p_niss, b.p_iban]).toEqual([null, "PT50000201231234567890154"]);
  });

  it("recusa tipos que nao sejam texto, textos enormes e o pedido sem nenhum dos dois, sem chamar a base", async () => {
    const m = montar();
    for (const extra of [{ niss: 12345678901 }, { iban: { a: 1 } }, { niss: ["1"] }, { niss: "9".repeat(64) }, { iban: "P".repeat(80) }, {}, { niss: null, iban: null }]) {
      const r = await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, ...extra });
      expect([r.status, r.corpo.error]).toEqual([400, "pedido_invalido"]);
    }
    expect(m.rpcs).toHaveLength(0);
  });

  it("os erros da base mapeiam-se: campo_bloqueado 409, estado_invalido 409, niss_invalido e iban_invalido 400", async () => {
    const casos: Array<[string, string, number]> = [
      ["campo_bloqueado", "HRA47", 409],
      ["estado_invalido", "HRA38", 409],
      ["niss_invalido", "HRA12", 400],
      ["iban_invalido", "HRA16", 400],
      ["sessao_expirada", "HRA52", 401],
    ];
    for (const [codigo, sqlstate, status] of casos) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: { message: codigo, code: sqlstate, details: SEGREDO } }) } });
      const r = await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901" });
      expect([r.status, r.corpo]).toEqual([status, { error: codigo }]);
      expect(m.erros).toHaveLength(0);
      semNada(m, r.texto, ["SEGREDO", "12345678901"]);
    }
  });

  it("um CHECK violado nao vaza a linha nem o NISS", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar({ action: "sensiveis", ...PEDIDO_RPC_PORTAL, niss: "12345678901" });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semNada(m, r.texto, ["SEGREDO", "12345678901"]);
  });
});

// ---------------------------------------------------------------------------
describe("estado: so o minimo publico", () => {
  it("sem sessao nao manda cabecalho a base; o pedido ao PostgREST leva so o token_hash", async () => {
    const m = montar();
    await m.chamar({ action: "estado", token: TOKEN });
    const svc = m.clientesCriados.filter((c) => c.key === "SERVICE");
    expect(svc.every((c) => c.headers === undefined)).toBe(true);
    expect(m.chamadas("rpc_hr_convite_admissao_estado")[0].args).toEqual({ p_token_hash: await sha256Hex(TOKEN) });
  });

  it("com sessao (cabecalho ou corpo) a Edge manda x-portal-sessao ao PostgREST com o HASH, nunca o segredo", async () => {
    const hash = await sha256Hex(SESSAO);
    for (const [corpo, cab] of [[{ }, { "x-portal-sessao": SESSAO }], [{ sessao: SESSAO }, {}]] as const) {
      const m = montar();
      await m.chamar({ action: "estado", token: TOKEN, ...corpo }, cab);
      const comCabecalho = m.clientesCriados.filter((c) => c.key === "SERVICE" && c.headers);
      expect(comCabecalho).toHaveLength(1);
      expect(comCabecalho[0].headers).toEqual({ "x-portal-sessao": hash });
      expect(JSON.stringify(m.clientesCriados)).not.toContain(SESSAO);
    }
  });

  it("uma sessao mal formada nao vai a base: o estado responde como sem sessao", async () => {
    const m = montar();
    const r = await m.chamar({ action: "estado", token: TOKEN, sessao: "lixo" });
    expect(r.status).toBe(200);
    expect(m.clientesCriados.filter((c) => c.headers)).toHaveLength(0);
  });

  it("devolve so as 8 chaves minimas; qualquer outra (rascunho, NIF, e-mail) cai, e os anexos nao se listam", async () => {
    const m = montar({
      rpc: {
        rpc_hr_convite_admissao_estado: () => ({
          data: { existe: true, estado: "convidada", estado_portal: "ativo", valid_until: "2026-10-30T12:00:00.000Z", primeiro_nome: "Ana", organizacao_nome: "Nike", bloqueado: false, precisa_otp: true, rascunho: { nif: "123456789" }, nif: "123456789", email_destino: "x@y.pt", token_hash: "h" },
          error: null,
        }),
      },
    });
    const r = await m.chamar({ action: "estado", token: TOKEN });
    expect(r.status).toBe(200);
    const convite = r.corpo.convite as Record<string, unknown>;
    expect(Object.keys(convite).sort()).toEqual(
      ["bloqueado", "estado", "estado_portal", "existe", "organizacao_nome", "precisa_otp", "primeiro_nome", "valid_until"].sort(),
    );
    expect(convite.precisa_otp).toBe(true);
    for (const proibido of ["123456789", "x@y.pt", "token_hash", "rascunho"]) expect(r.texto).not.toContain(proibido);
    expect(m.chamadas("rpc_hr_convite_anexos_listar")).toHaveLength(0);
  });

  it("o motivo em jsonb continua a sair so se for codigo do catalogo; um defeito nao vaza", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_estado: () => ({ data: { erro: "convite_expirado" }, error: null }) } });
    expect(await m.chamar({ action: "estado", token: TOKEN })).toMatchObject({ status: 401, corpo: { error: "convite_expirado" } });
    const n = montar({ rpc: { rpc_hr_convite_admissao_estado: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await n.chamar({ action: "estado", token: TOKEN });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    semNada(n, r.texto, ["SEGREDO"]);
  });
});

// ---------------------------------------------------------------------------
describe("reenviar (RH)", () => {
  const PEDIDO = { action: "reenviar", convite_id: CONVITE, organization_id: ORG };
  const ORIGEM = { origin: "https://www.olyvia-ai.com" };

  it("sem JWT ou com JWT invalido: 401 sem_sessao e nada se chama", async () => {
    const m = montar();
    expect((await m.chamar(PEDIDO)).corpo.error).toBe("sem_sessao");
    expect((await m.chamar(PEDIDO, { Authorization: "Bearer invalido" })).status).toBe(401);
    expect(m.rpcs).toHaveLength(0);
    expect(m.correio).toHaveLength(0);
  });

  it("pedido invalido (ids que nao sao uuid) da 400 sem chamar a RPC", async () => {
    const m = montar();
    for (const mau of [{ convite_id: "x" }, { organization_id: "x" }, { convite_id: undefined }, { organization_id: 5 }]) {
      const r = await m.chamar({ ...PEDIDO, ...mau }, AUTH);
      expect([r.status, r.corpo.error]).toEqual([400, "pedido_invalido"]);
    }
    expect(m.chamadas("rpc_hr_convite_admissao_reenviar")).toHaveLength(0);
  });

  it("valida o JWT, deriva p_actor DELE (nunca do corpo) e chama a RPC so service_role com a organizacao pedida", async () => {
    const m = montar();
    await m.chamar({ ...PEDIDO, p_actor: "99999999-9999-4999-8999-999999999999", actor: "99999999-9999-4999-8999-999999999999" }, { ...AUTH, ...ORIGEM });
    const c = m.chamadas("rpc_hr_convite_admissao_reenviar")[0];
    expect(c.cliente).toBe("svc");
    expect(c.args).toEqual({ p_convite_id: CONVITE, p_organization_id: ORG, p_actor: UTILIZADOR });
    // o JWT nao se reencaminha: a RPC e so service_role
    expect(m.clientesCriados.some((x) => x.authorization)).toBe(false);
  });

  it("envia o MESMO link por correio directo ao e-mail do convite, na organizacao do processo, sem send-email", async () => {
    const m = montar();
    const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect(r.status).toBe(200);
    expect(m.invocacoes).toEqual([]);
    expect(m.correio).toHaveLength(1);
    const c = m.correio[0];
    expect(c.para).toBe(EMAIL_CONVITE);
    expect(c.organizationId).toBe(ORG);
    expect(c.html).toContain(`https://www.olyvia-ai.com/admissao/${TOKEN_LINK}`);
    expect(c.texto).toContain(`https://www.olyvia-ai.com/admissao/${TOKEN_LINK}`);
  });

  it("o token, o link e o e-mail nunca vao para o browser, para o Sentry nem para a consola", async () => {
    const m = montar();
    const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect(r.corpo).toEqual({ ok: true, email_enviado: true, valid_until: "2026-10-30T12:00:00.000Z" });
    semNada(m, r.texto, [TOKEN_LINK, EMAIL_CONVITE, "/admissao/"]);
  });

  it("sem origem permitida usa APP_BASE_URL; sem nenhum dos dois: 500 ANTES de chamar a RPC (nao fica um 'reenviado' sem e-mail)", async () => {
    const a = montar();
    await a.chamar(PEDIDO, { ...AUTH, origin: "https://evil.example.com" });
    expect(a.correio[0].html).toContain(`https://app.exemplo.pt/admissao/${TOKEN_LINK}`);

    const b = montar({ appBaseUrl: null });
    const r = await b.chamar(PEDIDO, { ...AUTH, origin: "https://evil.example.com" });
    expect([r.status, r.corpo.error]).toEqual([500, "erro_inesperado"]);
    expect(b.chamadas("rpc_hr_convite_admissao_reenviar")).toHaveLength(0);
  });

  it("se o SMTP falhar: 502 email_nao_enviado, regista o envio como falhado so com o CODIGO e o link nao sai", async () => {
    const m = montar({ correio: () => ({ enviado: false, erroCodigo: "smtp_falhou" }) });
    const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect([r.status, r.corpo]).toEqual([502, { error: "email_nao_enviado" }]);
    const reg = m.chamadas("rpc_hr_convite_admissao_registar_envio")[0];
    expect(reg.args).toEqual({ p_convite_id: CONVITE, p_enviado: false, p_erro: "smtp_falhou" });
    semNada(m, r.texto, [TOKEN_LINK, EMAIL_CONVITE]);
  });

  it("se o SMTP funcionar, regista o envio como feito", async () => {
    const m = montar();
    await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect(m.chamadas("rpc_hr_convite_admissao_registar_envio")[0].args).toEqual({ p_convite_id: CONVITE, p_enviado: true, p_erro: null });
  });

  it("registar o envio falhar nao muda a resposta", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_registar_envio: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect(r.status).toBe(200);
    semNada(m, r.texto, ["SEGREDO"]);
  });

  it("as recusas da base mapeiam-se; insufficient_privilege e HRA31 dao o mesmo nao_encontrado; so o inesperado se reporta", async () => {
    const casos: Array<[string, string, number, string]> = [
      ["nao_encontrado", "HRA31", 404, "nao_encontrado"],
      ["insufficient_privilege", "42501", 404, "nao_encontrado"],
      ["convite_revogado", "HRA03", 401, "convite_revogado"],
      ["convite_expirado", "HRA04", 401, "convite_expirado"],
      ["link_indisponivel", "HRA56", 409, "link_indisponivel"],
      ["limite_excedido", "HRA41", 429, "limite_excedido"],
      ["organizacao_nao_empregadora", "HRA33", 403, "organizacao_nao_empregadora"],
    ];
    for (const [msg, sqlstate, status, esperado] of casos) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_reenviar: () => ({ data: null, error: { message: msg, code: sqlstate } }) } });
      const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
      expect([r.status, r.corpo]).toEqual([status, { error: esperado }]);
      expect(m.correio).toHaveLength(0);
      expect(m.erros).toHaveLength(0);
    }
  });

  it("um CHECK violado da erro_inesperado sem vazar a linha, e reporta so tipo e codigo", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_reenviar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect([r.status, r.corpo]).toEqual([500, { error: "erro_inesperado" }]);
    expect(m.erros.length).toBeGreaterThan(0);
    semNada(m, r.texto, ["SEGREDO", "Failing row"]);
  });

  it("uma resposta da RPC sem token ou sem e-mail valido da 500 e nao envia nada", async () => {
    for (const data of [null, {}, { token: 5, email_destino: EMAIL_CONVITE, organization_id: ORG }, { token: TOKEN_LINK, email_destino: "mau", organization_id: ORG }, { token: TOKEN_LINK, email_destino: EMAIL_CONVITE, organization_id: "x" }]) {
      const m = montar({ rpc: { rpc_hr_convite_admissao_reenviar: () => ({ data, error: null }) } });
      const r = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
      expect([r.status, r.corpo.error]).toEqual([500, "erro_inesperado"]);
      expect(m.correio).toHaveLength(0);
      semNada(m, r.texto, [TOKEN_LINK]);
    }
  });

  it("limita por utilizador (60 por hora) E por convite (5 por hora); excedido: 429 e a RPC nao e chamada", async () => {
    const m = montar();
    await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-reenviar", identifier: UTILIZADOR, maxAttempts: 60 });
    expect(m.limites).toContainEqual({ bucket: "convite-admissao-reenviar-convite", identifier: CONVITE, maxAttempts: 5 });

    const b = montar({ limiteBloqueado: (o) => o.bucket === "convite-admissao-reenviar-convite" });
    const r = await b.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect([r.status, r.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
    expect(b.chamadas("rpc_hr_convite_admissao_reenviar")).toHaveLength(0);
  });

  it("o sexto reenvio do mesmo convite na hora e recusado", async () => {
    const m = montar();
    for (let i = 0; i < 5; i++) expect((await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM })).status).toBe(200);
    const sexto = await m.chamar(PEDIDO, { ...AUTH, ...ORIGEM });
    expect([sexto.status, sexto.corpo.error]).toEqual([429, "demasiadas_tentativas"]);
  });
});

// ---------------------------------------------------------------------------
describe("entre a V3a e a V3b o link sozinho nao escreve (portal_em_atualizacao)", () => {
  const ANTIGAS = ["rascunho", "submeter", "anexo_url", "anexo_confirmar", "anexo_remover"];

  it("rascunho, submeter e os anexos respondem 410 com corpo fixo e NENHUMA chega a uma RPC, ao storage, ao limite nem ao correio", async () => {
    const m = montar();
    for (const action of ANTIGAS) {
      const r = await m.chamar(
        { action, token: TOKEN, rascunho: { nif: "123456789" }, dados: { nif: "123456789" }, assinatura_nome: "Ana", tipo: "fotografia", anexo_id: CONVITE },
        { "x-forwarded-for": "203.0.113.9" },
      );
      expect([r.status, r.corpo]).toEqual([410, { error: "portal_em_atualizacao" }]);
      expect(r.texto).not.toContain("123456789");
    }
    expect(m.rpcs).toHaveLength(0);
    expect(m.limites).toHaveLength(0);
    expect(m.clientesCriados).toHaveLength(0);
    expect(m.correio).toHaveLength(0);
    expect(m.invocacoes).toEqual([]);
  });

  it("nem com sessao valida (a V3a nao as liga a sessao): continuam 410", async () => {
    const m = montar();
    for (const action of ANTIGAS) {
      const r = await m.chamar({ action, token: TOKEN, sessao: SESSAO }, { "x-portal-sessao": SESSAO });
      expect(r.status).toBe(410);
    }
    expect(m.rpcs).toHaveLength(0);
  });

  it("nem por sinonimo, caixa diferente ou accao inventada: o portal antigo nao tem outro caminho de escrita", async () => {
    const m = montar();
    for (const action of ["RASCUNHO", "Submeter", "rascunho ", "anexo_url2", "gravar", "sensiveis_gravar2", "", null, 7]) {
      const r = await m.chamar({ action, token: TOKEN, rascunho: {}, dados: {} });
      expect([r.status, r.corpo.error]).toEqual([400, "accao_desconhecida"]);
    }
    expect(m.rpcs).toHaveLength(0);
  });

  it("as unicas accoes que escrevem sao as do portal novo (com sessao verificada na base) e as do RH (com JWT)", async () => {
    // sensiveis sem sessao: recusa antes da base; as do RH sem JWT: 401
    const m = montar();
    expect((await m.chamar({ action: "sensiveis", token: TOKEN, niss: "12345678901" })).status).toBe(401);
    for (const action of ["criar", "cancelar", "prolongar", "reenviar"]) {
      expect((await m.chamar({ action, convite_id: CONVITE, organization_id: ORG })).status).toBe(401);
    }
    expect(m.rpcs).toHaveLength(0);
  });
});

describe("HRA52 e HRA53: mesmo erro, mesmo corpo", () => {
  it("o corpo e o estado sao identicos nas duas, em ler, sensiveis e sair", async () => {
    const corpos: string[] = [];
    for (const sqlstate of ["HRA52", "HRA53"]) {
      const m = montar({
        rpc: {
          rpc_hr_convite_admissao_portal_ler: () => ({ data: null, error: { message: "x", code: sqlstate } }),
          rpc_hr_convite_admissao_sensiveis_gravar: () => ({ data: null, error: { message: "x", code: sqlstate } }),
          rpc_hr_convite_admissao_sessao_terminar: () => ({ data: null, error: { message: "x", code: sqlstate } }),
        },
      });
      for (const action of ["ler", "sensiveis", "sair"]) {
        const r = await m.chamar({ action, ...PEDIDO_RPC_PORTAL, niss: "12345678901" });
        corpos.push(`${action}:${r.status}:${r.texto}`);
      }
    }
    expect(corpos.slice(0, 3)).toEqual(corpos.slice(3));
    expect(corpos.join("")).not.toContain("substituida");
  });
});

describe("otp_verificar: erro pedido_invalido em jsonb (hash de sessao em uso noutro processo)", () => {
  it("sai como 400 pedido_invalido e nao como defeito", async () => {
    const m = montar({ rpc: { rpc_hr_convite_admissao_otp_verificar: () => ({ data: { erro: "pedido_invalido", restantes: 4 }, error: null }) } });
    const r = await m.chamar({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    expect([r.status, r.corpo]).toEqual([400, { error: "pedido_invalido", restantes: 4 }]);
    expect(m.erros).toHaveLength(0);
  });
});

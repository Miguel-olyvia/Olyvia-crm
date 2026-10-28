/**
 * @vitest-environment node
 *
 * O despacho da Edge Function denuncia-publica, com o Supabase simulado (as RPCs ainda nao
 * existem na base): sem rede, sem Deno. Verifica comportamento: que RPC se chama com que
 * argumentos, que codigos e estados HTTP saem, e que NADA do denunciante (PIN, sessao, IP,
 * user-agent, texto do erro do Postgres) chega a base em claro, a resposta ou ao Sentry.
 *
 * Os simulados devolvem a FORMA que o SQL de NOVO-20261231994000 devolve, e os argumentos
 * conferidos sao os nomes das RPCs dessa migration (contrato: um so para os tres lados).
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { criarHandler, type DepsDenuncia } from "./handler.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const UTILIZADOR = "33333333-3333-4333-8333-333333333333";
const RESPONSAVEL = "44444444-4444-4444-8444-444444444444";
const JWT = "jwt-valido";
const PIN_PEPPER = "p".repeat(48);
const IP_PEPPER = "i".repeat(48);
const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Segredo; Maquina-da-Ana)";
const CODIGO = "DEN-2026-0042";
const SESSAO = "s".repeat(43);
const HEX64 = /^[0-9a-f]{64}$/;

const SEGREDO = "descricao-SEGREDO ana@segredo.pt 123456789";
const ERRO_CHECK = {
  code: "23514",
  message: `new row violates check constraint "x": Failing row contains (${SEGREDO})`,
  details: `Failing row contains (${SEGREDO})`,
};

type Resposta = { data: unknown; error: unknown };
type Manipulador = (args: Record<string, unknown>, chamada: number) => Resposta;

interface Opcoes {
  rpc?: Record<string, Manipulador>;
  pinPepper?: string | null;
  ipPepper?: string | null;
  ipDoPedido?: (req: Request) => string | null;
  /** Usa o ipDoPedido real do modulo ip.ts em vez de um IP fixo. */
  ipReal?: boolean;
}

const hex = (texto: string) => createHash("sha256").update(texto).digest("hex");
const chaveDoIp = (ip: string) => createHmac("sha256", IP_PEPPER).update(`den-ip|2026-10-28|${ip}`).digest("hex");

/** A forma de denuncias_vista_denunciante (o que a base devolve em ler e responder). */
const VISTA_BASE = {
  id: "55555555-5555-4555-8555-555555555555",
  codigo: CODIGO,
  tipo: "assedio",
  descricao: "Descricao do proprio denunciante.",
  quando: "Desde setembro",
  onde: null,
  anonima: true,
  estado: "em_analise",
  recebida_em: "2026-10-28",
  confirmada_em: "2026-10-29",
  prazo_confirmar: "2026-11-04",
  prazo_seguimento: "2027-01-28",
  fechada_em: null,
  desfecho: null,
  mensagens: [{ id: "m1", autor: "canal", pedido_informacao: false, texto: "Recebemos a sua denuncia.", em: "2026-10-29T10:00:00Z" }],
};

function montar(opcoes: Opcoes = {}) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const contagem: Record<string, number> = {};
  const erros: Error[] = [];
  const esperas: number[] = [];
  const getUserChamado: string[] = [];
  const clientesCriados: string[] = [];

  const padrao: Record<string, Manipulador> = {
    rpc_denuncia_publica_limitar: () => ({ data: true, error: null }),
    rpc_denuncia_publica_canal: () => ({
      data: { ativo: true, organization_id: ORG, organizacao: "Nike", responsaveis: [{ id: RESPONSAVEL, nome: "Responsavel Secreto" }] },
      error: null,
    }),
    rpc_denuncia_publica_reservar_codigo: () => ({ data: { organization_id: ORG, codigo: CODIGO }, error: null }),
    rpc_denuncia_publica_criar: () => ({ data: { codigo: CODIGO }, error: null }),
    rpc_denuncia_publica_entrar: () => ({ data: true, error: null }),
    rpc_denuncia_publica_ler: () => ({ data: VISTA_BASE, error: null }),
    rpc_denuncia_publica_responder: () => ({ data: VISTA_BASE, error: null }),
  };
  const manipuladores = { ...padrao, ...(opcoes.rpc ?? {}) };

  const cliente = {
    auth: {
      getUser: async (jwt: string) => {
        getUserChamado.push(jwt);
        return jwt === JWT
          ? { data: { user: { id: UTILIZADOR } }, error: null }
          : { data: { user: null }, error: { message: "invalid jwt" } };
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      contagem[fn] = (contagem[fn] ?? 0) + 1;
      const m = manipuladores[fn];
      return m ? m(args, contagem[fn]) : { data: null, error: { message: "funcao inexistente", code: "42883" } };
    },
  };

  const deps: DepsDenuncia = {
    supabaseUrl: "https://exemplo.supabase.co",
    serviceKey: "service-key-simulada",
    pinPepper: opcoes.pinPepper === undefined ? PIN_PEPPER : opcoes.pinPepper,
    ipPepper: opcoes.ipPepper === undefined ? IP_PEPPER : opcoes.ipPepper,
    criarCliente: (_url, chave) => {
      clientesCriados.push(chave);
      return cliente;
    },
    registarErro: (e) => erros.push(e),
    corsHeaders: () => ({ "Access-Control-Allow-Origin": "https://www.olyvia-ai.com", Vary: "Origin" }),
    ...(opcoes.ipReal ? {} : { ipDoPedido: opcoes.ipDoPedido ?? (() => IP) }),
    agora: () => 1_000_000,
    hoje: () => "2026-10-28",
    dormir: async (ms) => {
      esperas.push(ms);
    },
  };
  const handler = criarHandler(deps);

  async function chamar(corpo: unknown, cabecalhos: Record<string, string> = {}, init: RequestInit = {}) {
    const req = new Request("https://exemplo.supabase.co/functions/v1/denuncia-publica", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA, "x-forwarded-for": IP, ...cabecalhos },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      ...init,
    });
    const res = await handler(req);
    const texto = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(texto);
    } catch { /* corpo vazio */ }
    return { res, json, texto };
  }

  const chamadas = (fn: string) => rpcs.filter((r) => r.fn === fn);
  return { handler, chamar, rpcs, chamadas, erros, esperas, getUserChamado, clientesCriados };
}

const FORM = {
  tipo: "assedio",
  descricao: "Descricao suficientemente longa para passar a validacao minima do formulario.",
  quando: "Desde setembro",
  ainda_acontece: "sim",
  onde: "Armazem",
  envolvidos: "Um chefe de equipa",
  testemunhas: "nao_sei",
  ja_reportado: "",
  boa_fe: true,
};

const criar = (extra: Record<string, unknown> = {}) => ({ action: "criar", slug: "nike-teste", modo: "anonima", ...FORM, ...extra });

// ---------------------------------------------------------------------------------------

describe("transporte, cabecalhos e corpo", () => {
  it("responde ao preflight OPTIONS sem corpo, com CORS restrito e o cabecalho da sessao permitido", async () => {
    const { handler } = montar();
    const res = await handler(new Request("https://x.test/", { method: "OPTIONS", headers: { origin: "https://www.olyvia-ai.com" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.olyvia-ai.com");
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain("x-denuncia-sessao");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("recusa GET com 405", async () => {
    const { handler } = montar();
    const res = await handler(new Request("https://x.test/", { method: "GET" }));
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
  });

  it("todas as respostas saem sem cache, sem sniffing e sem referrer", async () => {
    const t = montar();
    const { res } = await t.chamar({ action: "canal", slug: "nike-teste" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.olyvia-ai.com");
  });

  it("recusa um corpo acima de 64 KB (pelo content-length e pelo tamanho real)", async () => {
    const t = montar();
    const grande = JSON.stringify({ action: "criar", slug: "nike-teste", descricao: "x".repeat(70_000) });
    const a = await t.chamar(grande);
    expect(a.res.status).toBe(413);
    expect(a.json.error).toBe("corpo_demasiado_grande");
    const b = await t.chamar(grande, { "content-length": "100" });
    expect(b.res.status).toBe(413);
    const c = await t.chamar("{}", { "content-length": "70000" });
    expect(c.res.status).toBe(413);
    expect(t.rpcs).toHaveLength(0);
  });

  it("corpo que nao e JSON, accao desconhecida ou a chave antiga `accao` dao codigos do catalogo", async () => {
    const t = montar();
    const a = await t.chamar("isto nao e json");
    expect(a.res.status).toBe(400);
    expect(a.json.error).toBe("accao_desconhecida");
    const b = await t.chamar({ action: "apagar_tudo" });
    expect(b.res.status).toBe(400);
    expect(b.json.error).toBe("accao_desconhecida");
    const c = await t.chamar({ accao: "canal", slug: "nike-teste" });
    expect(c.json.error).toBe("accao_desconhecida");
    expect(t.rpcs).toHaveLength(0);
  });

  it("os anexos ficam para a fase 2: 410 sem tocar na base", async () => {
    const t = montar();
    for (const accao of ["anexo_url", "anexo_confirmar", "anexo_remover", "anexo_abrir"]) {
      const r = await t.chamar({ action: accao, slug: "nike-teste" });
      expect(r.res.status).toBe(410);
      expect(r.json).toEqual({ error: "anexos_indisponiveis" });
    }
    expect(t.rpcs).toHaveLength(0);
  });

  it("uma excepcao inesperada da 500 com codigo fixo e regista so o tipo", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_canal: () => { throw new TypeError(SEGREDO); } } });
    const r = await t.chamar({ action: "canal", slug: "nike-teste" });
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual({ error: "erro_inesperado" });
    expect(t.erros.map((e) => e.message).join("|")).not.toContain("SEGREDO");
  });
});

// ---------------------------------------------------------------------------------------

describe("canal", () => {
  it("diz se o canal esta activo e devolve o nome, nunca o id da organizacao nem os responsaveis", async () => {
    const t = montar();
    const r = await t.chamar({ action: "canal", slug: "nike-teste" });
    expect(r.res.status).toBe(200);
    expect(r.json).toEqual({ ok: true, ativo: true, nome_org: "Nike" });
    expect(r.texto).not.toContain(ORG);
    expect(r.texto).not.toContain("Responsavel Secreto");
    expect(t.chamadas("rpc_denuncia_publica_canal")[0].args).toEqual({ p_slug: "nike-teste" });
  });

  it("conta no balde 'canal' pela chave do IP, antes de consultar", async () => {
    const t = montar();
    await t.chamar({ action: "canal", slug: "nike-teste" });
    expect(t.chamadas("rpc_denuncia_publica_limitar")[0].args).toEqual({ p_balde: "canal", p_chave_ip: chaveDoIp(IP) });
    const bloqueado = montar({ rpc: { rpc_denuncia_publica_limitar: () => ({ data: false, error: null }) } });
    const r = await bloqueado.chamar({ action: "canal", slug: "nike-teste" });
    expect(r.res.status).toBe(429);
    expect(r.json).toEqual({ error: "demasiadas_tentativas" });
    expect(bloqueado.chamadas("rpc_denuncia_publica_canal")).toHaveLength(0);
  });

  it("slug desconhecido ou inactivo: ativo false, sem nome", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_canal: () => ({ data: { ativo: false }, error: null }) } });
    const r = await t.chamar({ action: "canal", slug: "nao-existe" });
    expect(r.res.status).toBe(200);
    expect(r.json).toEqual({ ok: true, ativo: false });
  });

  it("slug com formato invalido nem chega a base", async () => {
    const t = montar();
    for (const slug of ["", "AB", "a b c d", "x".repeat(41), "nike_teste", "../x", 5, null]) {
      const r = await t.chamar({ action: "canal", slug });
      expect(r.res.status).toBe(400);
      expect(r.json.error).toBe("pedido_invalido");
    }
    expect(t.rpcs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------

describe("criar denuncia anonima", () => {
  it("devolve codigo e PIN de 6 digitos uma so vez, e a base so recebe o HMAC do PIN", async () => {
    const t = montar();
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.codigo).toBe(CODIGO);
    const pin = r.json.pin as string;
    expect(pin).toMatch(/^\d{6}$/);

    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    const esperado = createHmac("sha256", PIN_PEPPER).update(`den-pin|${ORG}|${CODIGO}|${pin}`).digest("hex");
    expect(args.p_pin_hash).toBe(esperado);
    expect(args.p_codigo).toBe(CODIGO);
    expect(args.p_slug).toBe("nike-teste");
    // O PIN nunca viaja para a base nem em claro nem como sha256 simples.
    expect(JSON.stringify(t.rpcs)).not.toContain(pin);
    expect(JSON.stringify(t.rpcs)).not.toContain(hex(pin));
    expect(r.res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reserva o codigo (com a chave do IP e um nonce) e cria com o MESMO nonce, com os argumentos da migration", async () => {
    const t = montar();
    await t.chamar(criar());
    expect(t.rpcs.map((x) => x.fn)).toEqual(["rpc_denuncia_publica_reservar_codigo", "rpc_denuncia_publica_criar"]);
    const reserva = t.chamadas("rpc_denuncia_publica_reservar_codigo")[0].args;
    expect(Object.keys(reserva).sort()).toEqual(["p_chave_ip", "p_reserva_hash", "p_slug"]);
    expect(reserva.p_slug).toBe("nike-teste");
    expect(reserva.p_chave_ip).toBe(chaveDoIp(IP));
    expect(reserva.p_reserva_hash).toMatch(HEX64);
    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    expect(Object.keys(args).sort()).toEqual(
      ["p_auth_user_id", "p_codigo", "p_dados", "p_identidade", "p_impedidos", "p_pin_hash", "p_reserva_hash", "p_slug"],
    );
    expect(args.p_reserva_hash).toBe(reserva.p_reserva_hash);
    // cada pedido tem o seu nonce
    await t.chamar(criar());
    expect(t.chamadas("rpc_denuncia_publica_reservar_codigo")[1].args.p_reserva_hash).not.toBe(reserva.p_reserva_hash);
  });

  it("ignora qualquer JWT e qualquer identidade: nada de utilizador nem de dados pessoais", async () => {
    const t = montar();
    const r = await t.chamar(
      criar({ identidade: { nome: "Ana Segredo", email: "ana@segredo.pt", telefone: "910000000", pode_contactar: true } }),
      { authorization: `Bearer ${JWT}` },
    );
    expect(r.res.status).toBe(200);
    expect(t.getUserChamado).toEqual([]);
    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    expect(args.p_auth_user_id).toBeNull();
    expect(args.p_identidade).toBeNull();
    expect((args.p_dados as Record<string, unknown>).anonima).toBe(true);
    const tudo = JSON.stringify(t.rpcs);
    expect(tudo).not.toContain("Ana Segredo");
    expect(tudo).not.toContain("ana@segredo.pt");
    expect(tudo).not.toContain("910000000");
  });

  it("nunca guarda nem envia IP, user-agent ou o corpo bruto; p_dados so com o modo e o formulario", async () => {
    const t = montar();
    await t.chamar(criar(), { "x-real-ip": IP, referer: "https://seguro.exemplo/segredo" });
    const tudo = JSON.stringify(t.rpcs);
    expect(tudo).not.toContain(IP);
    expect(tudo).not.toContain("Mozilla");
    expect(tudo).not.toContain("Maquina-da-Ana");
    expect(tudo).not.toContain("referer");
    // so a lista branca de campos que a RPC aceita (k_chaves): nunca origem nem impedidos
    const dados = t.chamadas("rpc_denuncia_publica_criar")[0].args.p_dados as Record<string, unknown>;
    expect(Object.keys(dados).sort()).toEqual(
      ["ainda_acontece", "anonima", "boa_fe", "descricao", "envolvidos", "ja_reportado", "onde", "quando", "testemunhas", "tipo"].sort(),
    );
  });

  it("descarta campos fora da lista branca (nao deixa o cliente escolher estado, organizacao, gravidade nem o modo por outra chave)", async () => {
    const t = montar();
    await t.chamar(criar({ estado: "concluida", organization_id: "x", gravidade: "alta", anonima: false, origem: "aplicacao", responsavel_id: RESPONSAVEL, pin: "000000" }));
    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    const tudo = JSON.stringify(args);
    expect(tudo).not.toContain("concluida");
    expect(tudo).not.toContain("organization_id");
    expect(tudo).not.toContain("gravidade");
    expect(tudo).not.toContain("origem");
    expect(tudo).not.toContain(RESPONSAVEL);
    expect((args.p_dados as Record<string, unknown>).anonima).toBe(true);
    expect(args.p_pin_hash).not.toBe(createHmac("sha256", PIN_PEPPER).update(`den-pin|${ORG}|${CODIGO}|000000`).digest("hex"));
  });

  it("apara os textos e aceita o D3: os visados vao em p_impedidos (so UUIDs), nunca dentro de p_dados", async () => {
    const t = montar();
    const r = await t.chamar(criar({ descricao: `   ${FORM.descricao}   `, impedidos: [RESPONSAVEL, RESPONSAVEL] }));
    expect(r.res.status).toBe(200);
    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    const dados = args.p_dados as Record<string, unknown>;
    expect(dados.descricao).toBe(FORM.descricao);
    expect(dados).not.toHaveProperty("impedidos");
    expect(args.p_impedidos).toEqual([RESPONSAVEL]);
    const sem = montar();
    await sem.chamar(criar());
    expect(sem.chamadas("rpc_denuncia_publica_criar")[0].args.p_impedidos).toEqual([]);
    const mau = await t.chamar(criar({ impedidos: ["nao-uuid"] }));
    expect(mau.res.status).toBe(400);
    const muitos = await t.chamar(criar({ impedidos: Array(11).fill(RESPONSAVEL) }));
    expect(muitos.res.status).toBe(400);
  });

  it.each([
    ["tipo invalido", { tipo: "inventado" }],
    ["sem tipo", { tipo: undefined }],
    ["descricao curta", { descricao: "curta" }],
    ["descricao so com espacos", { descricao: " ".repeat(40) }],
    ["descricao longa de mais", { descricao: "x".repeat(4001) }],
    ["descricao que nao e texto", { descricao: 12345 }],
    ["quando em falta", { quando: "" }],
    ["quando longo de mais", { quando: "x".repeat(201) }],
    ["boa fe nao declarada", { boa_fe: false }],
    ["boa fe como texto", { boa_fe: "true" }],
    ["ainda_acontece invalido", { ainda_acontece: "talvez" }],
    ["onde longo de mais", { onde: "x".repeat(1001) }],
    ["modo invalido", { modo: "secreta" }],
    ["modo em falta", { modo: undefined }],
  ])("recusa %s com pedido_invalido e sem tocar na base", async (_nome, extra) => {
    const t = montar();
    const r = await t.chamar(criar(extra as Record<string, unknown>));
    expect(r.res.status).toBe(400);
    expect(r.json).toEqual({ error: "pedido_invalido" });
    expect(t.rpcs).toHaveLength(0);
  });

  it("aceita o limite exacto da descricao (30 e 4000)", async () => {
    const t = montar();
    expect((await t.chamar(criar({ descricao: "x".repeat(30) }))).res.status).toBe(200);
    expect((await t.chamar(criar({ descricao: "x".repeat(4000) }))).res.status).toBe(200);
  });

  it("aceita unicode e emojis sem os estragar", async () => {
    const t = montar();
    const descricao = `Situação de assédio ${"ção ".repeat(10)} 😀 ' OR 1=1 --`;
    const r = await t.chamar(criar({ descricao }));
    expect(r.res.status).toBe(200);
    const dados = t.chamadas("rpc_denuncia_publica_criar")[0].args.p_dados as Record<string, unknown>;
    expect(dados.descricao).toBe(descricao);
  });

  it("aceita um codigo de 5 ou 6 digitos (depois do 9999.o caso do ano), como a base", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_reservar_codigo: () => ({ data: { organization_id: ORG, codigo: "DEN-2026-12345" }, error: null }) } });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(200);
    expect(r.json.codigo).toBe("DEN-2026-12345");
  });

  it("sem pepper do PIN falha fechada com 503 e nao reserva codigo", async () => {
    for (const pinPepper of [null, "curto"]) {
      const t = montar({ pinPepper });
      const r = await t.chamar(criar());
      expect(r.res.status).toBe(503);
      expect(r.json).toEqual({ error: "indisponivel" });
      expect(t.chamadas("rpc_denuncia_publica_reservar_codigo")).toHaveLength(0);
    }
  });

  it("sem pepper do IP (com IP conhecido) falha fechada com 503", async () => {
    const t = montar({ ipPepper: null });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(503);
    expect(t.chamadas("rpc_denuncia_publica_reservar_codigo")).toHaveLength(0);
  });

  it("canal inactivo (HRD19) devolve 404 canal_inativo", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_reservar_codigo: () => ({ data: null, error: { message: "canal_inativo", code: "HRD19" } }) } });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(404);
    expect(r.json).toEqual({ error: "canal_inativo" });
    expect(t.chamadas("rpc_denuncia_publica_criar")).toHaveLength(0);
  });

  it("um erro do Postgres nunca sai nem vai para o Sentry com texto: so tipo e SQLSTATE", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_criar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual({ error: "erro_inesperado" });
    expect(r.texto).not.toContain("SEGREDO");
    const registado = t.erros.map((e) => e.message).join("|");
    expect(registado).toContain("criar");
    expect(registado).toContain("23514");
    expect(registado).not.toContain("SEGREDO");
    expect(registado).not.toContain("123456");
  });

  it("resposta invalida da RPC (sem codigo) da 500 sem inventar PIN", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_reservar_codigo: () => ({ data: { organization_id: "x", codigo: "lixo" }, error: null }) } });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(500);
    expect(r.json.pin).toBeUndefined();
    expect(t.chamadas("rpc_denuncia_publica_criar")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------

describe("criar denuncia identificada", () => {
  const IDENTIDADE = { nome: "Ana Silva", email: "ana@exemplo.pt", telefone: "910000000", pode_contactar: true, so_responsavel: false };
  const IDENT = { modo: "identificada", identidade: IDENTIDADE };

  it("com JWT valido passa o id do Auth e deixa nome e email para a base (da conta ligada)", async () => {
    const t = montar();
    const r = await t.chamar(criar(IDENT), { authorization: `Bearer ${JWT}` });
    expect(r.res.status).toBe(200);
    expect(t.getUserChamado).toEqual([JWT]);
    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    expect(args.p_auth_user_id).toBe(UTILIZADOR);
    const ident = args.p_identidade as Record<string, unknown>;
    expect(ident.nome).toBeNull();
    expect(ident.email).toBeNull();
    expect(ident.telefone).toBe("910000000");
    expect(ident.pode_contactar).toBe(true);
    expect(ident.so_responsavel).toBe(false);
    expect((args.p_dados as Record<string, unknown>).anonima).toBe(false);
  });

  it("sem sessao (so a chave publicavel) guarda a identidade ANINHADA do corpo, sem conta", async () => {
    const t = montar();
    const r = await t.chamar(criar(IDENT), { authorization: "Bearer chave-publicavel-nao-e-jwt-de-utilizador" });
    expect(r.res.status).toBe(200);
    const args = t.chamadas("rpc_denuncia_publica_criar")[0].args;
    expect(args.p_auth_user_id).toBeNull();
    expect(args.p_identidade).toEqual(IDENTIDADE);
    expect((args.p_dados as Record<string, unknown>).anonima).toBe(false);
  });

  it("so_responsavel e verdadeiro e pode_contactar falso por omissao", async () => {
    const t = montar();
    await t.chamar(criar({ modo: "identificada", identidade: { nome: "Ana", email: "ana@exemplo.pt" } }));
    const ident = t.chamadas("rpc_denuncia_publica_criar")[0].args.p_identidade as Record<string, unknown>;
    expect(ident.so_responsavel).toBe(true);
    expect(ident.pode_contactar).toBe(false);
  });

  it("uma conta que nao e membro (HRD17) nao se disfarca de sucesso", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_criar: () => ({ data: null, error: { message: "sem_permissao", code: "HRD17" } }) } });
    const r = await t.chamar(criar(IDENT), { authorization: `Bearer ${JWT}` });
    expect(r.res.status).toBe(500);
    expect(r.json.pin).toBeUndefined();
  });

  it.each([
    ["email invalido", { email: "sem-arroba" }],
    ["pode contactar sem email nem telefone", { email: "", telefone: "", pode_contactar: true }],
    ["nome longo de mais", { nome: "x".repeat(201) }],
    ["telefone longo de mais", { telefone: "9".repeat(41) }],
    ["nome que nao e texto", { nome: 7 }],
  ])("recusa %s", async (_n, extra) => {
    const t = montar();
    const r = await t.chamar(criar({ ...IDENT, identidade: { ...IDENTIDADE, ...extra } }));
    expect(r.res.status).toBe(400);
    expect(r.json.error).toBe("pedido_invalido");
    expect(t.rpcs).toHaveLength(0);
  });

  it("recusa uma identidade que nao e um objecto", async () => {
    const t = montar();
    const r = await t.chamar(criar({ modo: "identificada", identidade: "Ana" }));
    expect(r.res.status).toBe(400);
    expect(t.rpcs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------

describe("limites e fail-closed", () => {
  it("criar acima do limite (a base levanta HRD22 em reservar): 429 sem criar", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_reservar_codigo: () => ({ data: null, error: { message: "limite_excedido", code: "HRD22" } }) } });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(429);
    expect(r.json).toEqual({ error: "demasiadas_tentativas" });
    expect(t.chamadas("rpc_denuncia_publica_criar")).toHaveLength(0);
    expect(t.erros).toHaveLength(0);
  });

  it("erro ou resposta estranha do limitador: 503 (falha FECHADA, nao aberta)", async () => {
    for (const manipulador of [
      () => ({ data: null, error: { message: "boom", code: "XX000" } }),
      () => ({ data: "sim", error: null }),
      () => ({ data: null, error: null }),
    ] as Manipulador[]) {
      const t = montar({ rpc: { rpc_denuncia_publica_limitar: manipulador } });
      const r = await t.chamar({ action: "canal", slug: "nike-teste" });
      expect(r.res.status).toBe(503);
      expect(r.json).toEqual({ error: "indisponivel" });
      expect(t.chamadas("rpc_denuncia_publica_canal")).toHaveLength(0);
    }
  });

  it("um cabecalho x-forwarded-for forjado a esquerda nao muda a chave do IP", async () => {
    const t = montar({ ipReal: true });
    // sem ipDoPedido injectado o handler usa o do modulo ip.ts: a ultima entrada
    await t.chamar(criar(), { "x-forwarded-for": `9.9.9.9, ${IP}` });
    await t.chamar(criar(), { "x-forwarded-for": `8.8.8.8, ${IP}` });
    const chaves = t.chamadas("rpc_denuncia_publica_reservar_codigo").map((c) => c.args.p_chave_ip);
    expect(chaves).toHaveLength(2);
    expect(chaves[0]).toMatch(HEX64);
    expect(chaves[0]).toBe(chaves[1]);
  });

  it("sem IP detectavel a chave vai nula (a base conta so no balde da organizacao) e nao e preciso o pepper", async () => {
    const t = montar({ ipDoPedido: () => null, ipPepper: null });
    const r = await t.chamar(criar());
    expect(r.res.status).toBe(200);
    expect(t.chamadas("rpc_denuncia_publica_reservar_codigo")[0].args.p_chave_ip).toBeNull();
  });

  it("a validacao do pedido vem antes do limite: pedidos invalidos nao gastam quota", async () => {
    const t = montar();
    await t.chamar(criar({ boa_fe: false }));
    expect(t.rpcs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------

describe("entrar (codigo + PIN)", () => {
  const entrar = (extra: Record<string, unknown> = {}) => ({ action: "entrar", slug: "nike-teste", codigo: CODIGO, pin: "123456", ...extra });

  it("troca codigo+PIN por uma sessao, com os argumentos da migration (slug e chave do IP)", async () => {
    const t = montar();
    const r = await t.chamar(entrar());
    expect(r.res.status).toBe(200);
    const sessao = r.json.sessao as string;
    expect(sessao).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.json.expira_em_minutos).toBe(30);
    const args = t.chamadas("rpc_denuncia_publica_entrar")[0].args;
    expect(Object.keys(args).sort()).toEqual(["p_chave_ip", "p_codigo", "p_pin_hash", "p_sessao_hash", "p_slug"]);
    expect(args.p_slug).toBe("nike-teste");
    expect(args.p_codigo).toBe(CODIGO);
    expect(args.p_chave_ip).toBe(chaveDoIp(IP));
    // o sal do HMAC e o id da organizacao (vindo da base pelo slug), nao o slug
    expect(args.p_pin_hash).toBe(createHmac("sha256", PIN_PEPPER).update(`den-pin|${ORG}|${CODIGO}|123456`).digest("hex"));
    expect(args.p_sessao_hash).toBe(hex(sessao));
    const tudo = JSON.stringify(t.rpcs);
    expect(tudo).not.toContain(sessao);
    expect(tudo).not.toContain('"123456"');
    expect(tudo).not.toContain(IP);
    expect(r.texto).not.toContain("123456");
    expect(r.texto).not.toContain(ORG);
  });

  it("normaliza o codigo (maiusculas, espacos) e o PIN (espacos)", async () => {
    const t = montar();
    const r = await t.chamar(entrar({ codigo: " den-2026-0042 ", pin: "123 456" }));
    expect(r.res.status).toBe(200);
    expect(t.chamadas("rpc_denuncia_publica_entrar")[0].args.p_codigo).toBe(CODIGO);
  });

  it("codigo inexistente, PIN errado, limite e denuncia bloqueada: MESMA resposta, MESMO estado, MESMO tempo", async () => {
    const naoExiste = montar({ rpc: { rpc_denuncia_publica_canal: () => ({ data: { ativo: false }, error: null }) } });
    const pinErrado = montar({ rpc: { rpc_denuncia_publica_entrar: () => ({ data: false, error: null }) } });
    const formatoMau = montar();
    const a = await naoExiste.chamar(entrar());
    const b = await pinErrado.chamar(entrar());
    const c = await formatoMau.chamar(entrar({ codigo: "lixo", pin: "abc" }));
    for (const r of [a, b, c]) {
      expect(r.res.status).toBe(401);
      expect(r.json).toEqual({ error: "codigo_ou_pin_invalido" });
    }
    expect(a.texto).toBe(b.texto);
    expect(b.texto).toBe(c.texto);
    // o tempo e igualado por cima: todas esperam o mesmo (agora() e constante)
    expect(naoExiste.esperas).toEqual(pinErrado.esperas);
    expect(pinErrado.esperas).toEqual(formatoMau.esperas);
    expect(pinErrado.esperas[0]).toBeGreaterThan(0);
    // formato mau nem chega a base
    expect(formatoMau.chamadas("rpc_denuncia_publica_entrar")).toHaveLength(0);
    expect(naoExiste.chamadas("rpc_denuncia_publica_entrar")).toHaveLength(0);
  });

  it("o sucesso espera o mesmo minimo que a falha (nao se distingue pelo tempo)", async () => {
    const ok = montar();
    const ko = montar({ rpc: { rpc_denuncia_publica_entrar: () => ({ data: false, error: null }) } });
    await ok.chamar(entrar());
    await ko.chamar(entrar());
    expect(ok.esperas).toEqual(ko.esperas);
  });

  it("um erro real da base e 500 (nao se disfarca de PIN errado) e regista so o SQLSTATE", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_entrar: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await t.chamar(entrar());
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual({ error: "erro_inesperado" });
    expect(t.erros.map((e) => e.message).join("|")).not.toContain("SEGREDO");
  });

  it("sem pepper falha fechada (503) sem consultar a base", async () => {
    const t = montar({ pinPepper: null });
    const r = await t.chamar(entrar());
    expect(r.res.status).toBe(503);
    expect(t.chamadas("rpc_denuncia_publica_entrar")).toHaveLength(0);
  });

  it("campos que nao sao texto dao a mesma recusa uniforme", async () => {
    const t = montar();
    const r = await t.chamar(entrar({ pin: 123456, codigo: { x: 1 } }));
    expect(r.res.status).toBe(401);
    expect(r.json).toEqual({ error: "codigo_ou_pin_invalido" });
  });
});

// ---------------------------------------------------------------------------------------

describe("ler e responder (com sessao)", () => {
  const cab = { "x-denuncia-sessao": SESSAO };

  it("ler sem sessao, com sessao mal formada ou so no corpo: 401 sessao_invalida, sem base", async () => {
    const t = montar();
    for (const [corpo, cabecalhos] of [
      [{ action: "ler" }, {}],
      [{ action: "ler" }, { "x-denuncia-sessao": "curta" }],
      [{ action: "ler", sessao: SESSAO }, {}],
    ] as Array<[Record<string, unknown>, Record<string, string>]>) {
      const r = await t.chamar(corpo, cabecalhos);
      expect(r.res.status).toBe(401);
      expect(r.json).toEqual({ error: "sessao_invalida" });
    }
    expect(t.rpcs).toHaveLength(0);
  });

  it("ler envia o hash da sessao e devolve, em `denuncia`, so a vista permitida na forma do cliente", async () => {
    const t = montar({
      rpc: {
        rpc_denuncia_publica_ler: () => ({
          data: {
            ...VISTA_BASE,
            identidade: { nome: "Ana" },
            notas: [{ texto: "nota interna" }],
            gravidade: "alta",
            responsavel_id: RESPONSAVEL,
            pin_hash: "x".repeat(64),
            mensagens: [{ ...VISTA_BASE.mensagens[0], autor_user_id: RESPONSAVEL, autor_nome: "Responsavel Secreto" }],
          },
          error: null,
        }),
      },
    });
    const r = await t.chamar({ action: "ler" }, cab);
    expect(r.res.status).toBe(200);
    expect(t.chamadas("rpc_denuncia_publica_ler")[0].args).toEqual({ p_sessao_hash: hex(SESSAO) });
    expect(JSON.stringify(t.rpcs)).not.toContain(SESSAO);
    const den = r.json.denuncia as Record<string, unknown>;
    expect(den.codigo).toBe(CODIGO);
    expect(den.estado).toBe("em_analise");
    expect(den.anonima).toBe(true);
    expect(den.resultado).toBeNull();
    expect(den.mensagens).toEqual([
      { id: "m1", autor: "canal", texto: "Recebemos a sua denuncia.", pedido_informacao: false, criada_em: "2026-10-29T10:00:00Z" },
    ]);
    for (const proibido of ["identidade", "notas", "gravidade", "responsavel_id", "pin_hash", "id", "desfecho"]) {
      expect(den).not.toHaveProperty(proibido);
    }
    expect(r.texto).not.toContain(RESPONSAVEL);
    expect(r.texto).not.toContain("Responsavel Secreto");
    expect(r.texto).not.toContain("nota interna");
  });

  it("o desfecho da base ({resultado, medidas}) chega ao denunciante como resultado e medidas", async () => {
    const t = montar({
      rpc: {
        rpc_denuncia_publica_ler: () => ({
          data: { ...VISTA_BASE, estado: "concluida", desfecho: { resultado: "procedente", medidas: "Formacao", fundamentacao: "INTERNA" } },
          error: null,
        }),
      },
    });
    const r = await t.chamar({ action: "ler" }, cab);
    const den = r.json.denuncia as Record<string, unknown>;
    expect(den.resultado).toBe("procedente");
    expect(den.medidas).toBe("Formacao");
    expect(r.texto).not.toContain("INTERNA");
  });

  it("sessao expirada ou desconhecida (HRD24 na base) da 401 sessao_invalida", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_ler: () => ({ data: null, error: { message: "sessao_invalida", code: "HRD24" } }) } });
    const r = await t.chamar({ action: "ler" }, cab);
    expect(r.res.status).toBe(401);
    expect(r.json).toEqual({ error: "sessao_invalida" });
  });

  it("ler e responder contam no balde 'sessao' pela chave do IP, nunca pela sessao", async () => {
    const t = montar();
    await t.chamar({ action: "ler" }, cab);
    expect(t.chamadas("rpc_denuncia_publica_limitar").map((c) => c.args)).toEqual([{ p_balde: "sessao", p_chave_ip: chaveDoIp(IP) }]);
    expect(JSON.stringify(t.chamadas("rpc_denuncia_publica_limitar"))).not.toContain(hex(SESSAO));
    const bloqueada = montar({ rpc: { rpc_denuncia_publica_limitar: () => ({ data: false, error: null }) } });
    const r = await bloqueada.chamar({ action: "ler" }, cab);
    expect(r.res.status).toBe(429);
    expect(bloqueada.chamadas("rpc_denuncia_publica_ler")).toHaveLength(0);
  });

  it("responder envia o texto aparado e o hash da sessao, e devolve a vista", async () => {
    const t = montar();
    const r = await t.chamar({ action: "responder", texto: "  Mais uma informacao.  " }, cab);
    expect(r.res.status).toBe(200);
    expect(t.chamadas("rpc_denuncia_publica_responder")[0].args).toEqual({ p_sessao_hash: hex(SESSAO), p_texto: "Mais uma informacao." });
    expect((r.json.denuncia as Record<string, unknown>).codigo).toBe(CODIGO);
  });

  it.each([["vazio", ""], ["so espacos", "   "], ["demasiado longo", "x".repeat(4001)], ["nao e texto", 42], ["em falta", undefined]])(
    "responder recusa texto %s",
    async (_n, texto) => {
      const t = montar();
      const r = await t.chamar({ action: "responder", texto }, cab);
      expect(r.res.status).toBe(400);
      expect(r.json.error).toBe("pedido_invalido");
      expect(t.chamadas("rpc_denuncia_publica_responder")).toHaveLength(0);
    },
  );

  it("responder aceita o limite exacto de 4000 caracteres", async () => {
    const t = montar();
    const r = await t.chamar({ action: "responder", texto: "x".repeat(4000) }, cab);
    expect(r.res.status).toBe(200);
  });

  it("denuncia fechada (HRD08) da 409 fechada; 50 mensagens (HRD25) da pedido_invalido", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_responder: () => ({ data: null, error: { message: "fechada", code: "HRD08" } }) } });
    const r = await t.chamar({ action: "responder", texto: "ola" }, cab);
    expect(r.res.status).toBe(409);
    expect(r.json).toEqual({ error: "fechada" });
    const cheia = montar({ rpc: { rpc_denuncia_publica_responder: () => ({ data: null, error: { message: "limite_mensagens", code: "HRD25" } }) } });
    expect((await cheia.chamar({ action: "responder", texto: "ola" }, cab)).json).toEqual({ error: "pedido_invalido" });
  });

  it("um erro do Postgres em responder nao deixa o texto sair nem ir ao Sentry", async () => {
    const t = montar({ rpc: { rpc_denuncia_publica_responder: () => ({ data: null, error: ERRO_CHECK }) } });
    const r = await t.chamar({ action: "responder", texto: SEGREDO }, cab);
    expect(r.res.status).toBe(500);
    expect(r.texto).not.toContain("SEGREDO");
    expect(t.erros.map((e) => e.message).join("|")).not.toContain("SEGREDO");
  });
});

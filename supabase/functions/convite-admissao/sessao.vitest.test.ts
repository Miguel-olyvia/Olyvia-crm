/**
 * @vitest-environment node
 *
 * A sessao do portal: um segredo de 256 bits gerado na Edge. So o SHA-256 vai
 * a base. Do browser vem no cabecalho x-portal-sessao (ou no corpo), NUNCA no URL.
 */
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./otp.ts";
import { CABECALHO_SESSAO, comCabecalhoSessao, formatoSessaoValido, gerarSessao, lerSessaoDoPedido } from "./sessao.ts";

function pedido(opcoes: { url?: string; cabecalhos?: Record<string, string> } = {}) {
  return new Request(opcoes.url ?? "https://x.supabase.co/functions/v1/convite-admissao", {
    method: "POST",
    headers: opcoes.cabecalhos ?? {},
  });
}

describe("gerarSessao", () => {
  it("32 bytes aleatorios em base64url (43 caracteres) e o SHA-256 hex desse texto", async () => {
    const { sessao, hash } = await gerarSessao();
    expect(sessao).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(formatoSessaoValido(sessao)).toBe(true);
    expect(hash).toBe(await sha256Hex(sessao));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cada sessao e diferente, e o hash nunca e igual ao segredo", async () => {
    const a = await gerarSessao();
    const b = await gerarSessao();
    expect(a.sessao).not.toBe(b.sessao);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toBe(a.sessao);
  });

  it("nao usa Math.random", async () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random nao se usa para uma sessao");
    };
    try {
      await expect(gerarSessao()).resolves.toBeTruthy();
    } finally {
      Math.random = original;
    }
  });
});

describe("lerSessaoDoPedido", () => {
  const SESSAO = "S".repeat(43);

  it("le o cabecalho x-portal-sessao", () => {
    expect(CABECALHO_SESSAO).toBe("x-portal-sessao");
    expect(lerSessaoDoPedido(pedido({ cabecalhos: { "x-portal-sessao": SESSAO } }), {})).toBe(SESSAO);
  });

  it("aceita tambem o corpo (campo sessao), e o cabecalho ganha", () => {
    expect(lerSessaoDoPedido(pedido(), { sessao: SESSAO })).toBe(SESSAO);
    const OUTRA = "T".repeat(43);
    expect(lerSessaoDoPedido(pedido({ cabecalhos: { "x-portal-sessao": OUTRA } }), { sessao: SESSAO })).toBe(OUTRA);
  });

  it("NUNCA le o URL: uma sessao na query string ou no caminho e ignorada", () => {
    const req = pedido({ url: `https://x.supabase.co/functions/v1/convite-admissao/${SESSAO}?sessao=${SESSAO}&x-portal-sessao=${SESSAO}` });
    expect(lerSessaoDoPedido(req, {})).toBeNull();
  });

  it("devolve null para uma sessao ausente ou mal formada (nunca lanca)", () => {
    for (const mau of [undefined, null, "", "curta", "x".repeat(44), "x".repeat(42) + "+", "x".repeat(42) + " ", 7, {}]) {
      expect(lerSessaoDoPedido(pedido(), { sessao: mau })).toBeNull();
    }
    expect(lerSessaoDoPedido(pedido({ cabecalhos: { "x-portal-sessao": "lixo" } }), {})).toBeNull();
  });
});

describe("comCabecalhoSessao (CORS)", () => {
  it("acrescenta x-portal-sessao aos cabecalhos permitidos sem perder os que la estao", () => {
    const r = comCabecalhoSessao({
      "Access-Control-Allow-Origin": "https://www.olyvia-ai.com",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    });
    expect(r["Access-Control-Allow-Origin"]).toBe("https://www.olyvia-ai.com");
    expect(r["Access-Control-Allow-Headers"]).toBe("authorization, x-client-info, apikey, content-type, x-portal-sessao");
  });

  it("e idempotente e funciona sem a lista de partida", () => {
    const uma = comCabecalhoSessao({ "Access-Control-Allow-Headers": "content-type" });
    expect(comCabecalhoSessao(uma)).toEqual(uma);
    expect(comCabecalhoSessao({})["Access-Control-Allow-Headers"]).toBe("x-portal-sessao");
  });
});

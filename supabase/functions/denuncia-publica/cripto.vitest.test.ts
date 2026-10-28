/**
 * @vitest-environment node
 *
 * O PIN, a sessao e o identificador de IP da denuncia publica: tudo com segredo de
 * SERVIDOR (pepper). A base so ve HMACs e hashes; sem pepper valido a Edge falha fechada.
 */
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PEPPER_MIN,
  gerarPin,
  gerarSessao,
  hmacIp,
  hmacPin,
  normalizarCodigo,
  normalizarPin,
  pepperValido,
  sha256Hex,
} from "./cripto.ts";

const PEPPER = "p".repeat(48);
const ORG = "b6ffce4f-f630-4933-833a-008649757a33";

describe("gerarPin", () => {
  it("devolve sempre 6 digitos, com zeros a esquerda", () => {
    let comZero = false;
    for (let i = 0; i < 3000; i++) {
      const p = gerarPin();
      expect(p).toMatch(/^\d{6}$/);
      if (p.startsWith("0")) comZero = true;
    }
    expect(comZero).toBe(true);
  });

  it("rejeita a amostra que causaria vies de modulo", () => {
    const amostras = [0xffffffff, 0xfffffffe, 123_456];
    let i = 0;
    const pin = gerarPin(() => amostras[i++]);
    expect(pin).toBe("123456");
    expect(i).toBe(3);
  });
});

describe("pepperValido", () => {
  it("exige texto com pelo menos PEPPER_MIN caracteres", () => {
    expect(PEPPER_MIN).toBe(32);
    expect(pepperValido("a".repeat(31))).toBe(false);
    expect(pepperValido("a".repeat(32))).toBe(true);
    expect(pepperValido(null)).toBe(false);
    expect(pepperValido(undefined)).toBe(false);
    expect(pepperValido(123)).toBe(false);
    expect(pepperValido(" ".repeat(40))).toBe(false);
  });
});

describe("hmacPin", () => {
  it("e o HMAC-SHA-256 hex de 'den-pin|org|codigo|pin' com o pepper", async () => {
    const esperado = createHmac("sha256", PEPPER).update(`den-pin|${ORG}|DEN-2026-0042|123456`).digest("hex");
    expect(await hmacPin(PEPPER, ORG, "DEN-2026-0042", "123456")).toBe(esperado);
  });

  it("liga-se a organizacao, ao codigo e ao PIN", async () => {
    const base = await hmacPin(PEPPER, ORG, "DEN-2026-0042", "123456");
    expect(await hmacPin(PEPPER, ORG, "DEN-2026-0043", "123456")).not.toBe(base);
    expect(await hmacPin(PEPPER, ORG, "DEN-2026-0042", "123457")).not.toBe(base);
    expect(await hmacPin(PEPPER, "aaaaaaaa-1111-4111-8111-111111111111", "DEN-2026-0042", "123456")).not.toBe(base);
    expect(await hmacPin("q".repeat(48), ORG, "DEN-2026-0042", "123456")).not.toBe(base);
  });

  it("nao e um sha256 simples do PIN", async () => {
    const simples = createHash("sha256").update("123456").digest("hex");
    expect(await hmacPin(PEPPER, ORG, "DEN-2026-0042", "123456")).not.toBe(simples);
  });

  it("falha fechada sem pepper valido, sem o revelar na mensagem", async () => {
    await expect(hmacPin("curto", ORG, "DEN-2026-0042", "123456")).rejects.toThrow("pepper_invalido");
    const erro = await hmacPin("curto", ORG, "DEN-2026-0042", "123456").catch((e: Error) => e);
    expect(String((erro as Error).message)).not.toMatch(/123456|curto/);
  });

  it("recusa entradas com formato errado", async () => {
    await expect(hmacPin(PEPPER, ORG, "DEN-2026-0042", "12345")).rejects.toThrow("pedido_invalido");
    await expect(hmacPin(PEPPER, ORG, "DEN-2026-0042", "12345a")).rejects.toThrow("pedido_invalido");
    await expect(hmacPin(PEPPER, ORG, "qualquer", "123456")).rejects.toThrow("pedido_invalido");
    await expect(hmacPin(PEPPER, "nao-e-uuid", "DEN-2026-0042", "123456")).rejects.toThrow("pedido_invalido");
  });
});

describe("hmacIp", () => {
  it("nunca devolve o IP e muda com o dia (pepper rotativo)", async () => {
    const hoje = await hmacIp(PEPPER, "203.0.113.7", "2026-10-28");
    expect(hoje).toMatch(/^[0-9a-f]{64}$/);
    expect(hoje).not.toContain("203");
    expect(hoje).toBe(createHmac("sha256", PEPPER).update("den-ip|2026-10-28|203.0.113.7").digest("hex"));
    expect(await hmacIp(PEPPER, "203.0.113.7", "2026-10-29")).not.toBe(hoje);
    expect(await hmacIp(PEPPER, "203.0.113.8", "2026-10-28")).not.toBe(hoje);
  });

  it("falha fechada sem pepper valido", async () => {
    await expect(hmacIp("curto", "203.0.113.7", "2026-10-28")).rejects.toThrow("pepper_invalido");
  });
});

describe("gerarSessao", () => {
  it("32 bytes em base64url (43 caracteres) e o SHA-256 hex desse texto", async () => {
    const { token, hash } = await gerarSessao();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(await sha256Hex(token)).toBe(hash);
  });

  it("nao repete", async () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) vistos.add((await gerarSessao()).token);
    expect(vistos.size).toBe(200);
  });
});

describe("normalizacao", () => {
  it("o codigo vai a maiusculas e sem espacos; o PIN sem espacos", () => {
    expect(normalizarCodigo("  den-2026-0042 ")).toBe("DEN-2026-0042");
    expect(normalizarCodigo("den 2026 0042")).toBe("DEN20260042");
    expect(normalizarPin(" 123 456 ")).toBe("123456");
  });
});

/**
 * @vitest-environment node
 *
 * O codigo OTP do portal: gerado na Edge (6 digitos, aleatoriedade segura) e
 * ligado ao convite por um HMAC-SHA-256 com um pepper de SERVIDOR. A base so
 * ve o HMAC. Sem pepper valido a Edge falha fechada.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PEPPER_MIN, gerarCodigoOtp, hmacOtp, pepperValido, sha256Hex } from "./otp.ts";

const PEPPER = "p".repeat(48);
const TOKEN_HASH = "ab".repeat(32);

describe("gerarCodigoOtp", () => {
  it("devolve sempre 6 digitos, com zeros a esquerda", () => {
    let comZeroAEsquerda = false;
    for (let i = 0; i < 3000; i++) {
      const c = gerarCodigoOtp();
      expect(c).toMatch(/^\d{6}$/);
      if (c.startsWith("0")) comZeroAEsquerda = true;
    }
    // 3000 codigos: a probabilidade de nenhum comecar por 0 e (0,9)^3000, ou seja, nula.
    expect(comZeroAEsquerda).toBe(true);
  });

  it("usa crypto.getRandomValues e nunca Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random nao se usa para um OTP");
    };
    try {
      expect(gerarCodigoOtp()).toMatch(/^\d{6}$/);
    } finally {
      Math.random = original;
    }
  });

  it("nao repete sempre o mesmo codigo", () => {
    const vistos = new Set(Array.from({ length: 50 }, () => gerarCodigoOtp()));
    expect(vistos.size).toBeGreaterThan(40);
  });
});

describe("hmacOtp", () => {
  it("e o HMAC-SHA-256 em hex (64) do token_hash e do codigo, com o pepper como chave", async () => {
    const esperado = createHmac("sha256", PEPPER).update(`hr-admissao-otp|${TOKEN_HASH}|123456`).digest("hex");
    const h = await hmacOtp(PEPPER, TOKEN_HASH, "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(esperado);
  });

  it("muda com o codigo, com o convite (token_hash) e com o pepper", async () => {
    const base = await hmacOtp(PEPPER, TOKEN_HASH, "123456");
    expect(await hmacOtp(PEPPER, TOKEN_HASH, "123457")).not.toBe(base);
    expect(await hmacOtp(PEPPER, "cd".repeat(32), "123456")).not.toBe(base);
    expect(await hmacOtp("q".repeat(48), TOKEN_HASH, "123456")).not.toBe(base);
  });

  it("falha fechado sem pepper, ou com um pepper curto, e nunca devolve um HMAC", async () => {
    for (const mau of [undefined, null, "", "curto", "x".repeat(PEPPER_MIN - 1), 12345]) {
      await expect(hmacOtp(mau as unknown as string, TOKEN_HASH, "123456")).rejects.toThrow("otp_pepper_invalido");
    }
  });

  it("recusa um codigo que nao seja 6 digitos e um token_hash que nao seja hex de 64", async () => {
    await expect(hmacOtp(PEPPER, TOKEN_HASH, "12345")).rejects.toThrow("otp_pedido_invalido");
    await expect(hmacOtp(PEPPER, TOKEN_HASH, "12345a")).rejects.toThrow("otp_pedido_invalido");
    await expect(hmacOtp(PEPPER, "nao-e-hex", "123456")).rejects.toThrow("otp_pedido_invalido");
  });

  it("a mensagem do erro nunca traz o pepper nem o codigo", async () => {
    const erro = await hmacOtp("curto", TOKEN_HASH, "123456").catch((e: Error) => e);
    expect((erro as Error).message).not.toContain("123456");
    expect((erro as Error).message).not.toContain("curto");
  });
});

describe("pepperValido", () => {
  it("exige texto com pelo menos PEPPER_MIN caracteres", () => {
    expect(PEPPER_MIN).toBeGreaterThanOrEqual(32);
    expect(pepperValido(PEPPER)).toBe(true);
    for (const mau of [undefined, null, "", " ".repeat(64), "a".repeat(PEPPER_MIN - 1), 1, {}]) {
      expect(pepperValido(mau)).toBe(false);
    }
  });
});

describe("sha256Hex", () => {
  it("e o SHA-256 em hex do texto em UTF-8", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("ação")).toMatch(/^[0-9a-f]{64}$/);
  });
});

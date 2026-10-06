/**
 * @vitest-environment node
 *
 * Assinaturas binarias: o tipo REAL de um ficheiro, nunca o que o cliente diz.
 */
import { describe, expect, it } from "vitest";
import { bytesStartWith, detectSignature, toHex } from "./fileSignature.ts";

const MIN_LENGTH = 16;

function padded(bytes: number[]): Uint8Array {
  const result = new Uint8Array(Math.max(bytes.length, MIN_LENGTH));
  result.set(bytes);
  return result;
}

describe("detectSignature", () => {
  it("reconhece PDF", () => {
    expect(detectSignature(padded([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("pdf");
  });

  it("reconhece PNG", () => {
    expect(detectSignature(padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
  });

  it("reconhece JPEG", () => {
    expect(detectSignature(padded([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  });

  it("reconhece GIF", () => {
    expect(detectSignature(padded([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("gif");
  });

  it("reconhece WebP (RIFF com WEBP no byte 8)", () => {
    const bytes = padded([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectSignature(bytes)).toBe("webp");
  });

  it("RIFF sem WEBP nao e WebP", () => {
    const bytes = padded([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]);
    expect(detectSignature(bytes)).toBeNull();
  });

  it("reconhece zip e OLE2 (office)", () => {
    expect(detectSignature(padded([0x50, 0x4b, 0x03, 0x04]))).toBe("zip-office");
    expect(detectSignature(padded([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe("ole2-office");
  });

  it("ficheiro curto demais para a assinatura nao e reconhecido", () => {
    expect(detectSignature(new Uint8Array([0x25, 0x50, 0x44]))).toBeNull();
    expect(detectSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it("ficheiro vazio nao e reconhecido", () => {
    expect(detectSignature(new Uint8Array(0))).toBeNull();
  });

  it("texto com extensao .pdf nao e PDF", () => {
    const texto = new TextEncoder().encode("isto nao e um pdf, so se chama ficheiro.pdf");
    expect(detectSignature(texto)).toBeNull();
  });
});

describe("bytesStartWith", () => {
  it("respeita o deslocamento e os limites", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(bytesStartWith(bytes, [3, 4], 2)).toBe(true);
    expect(bytesStartWith(bytes, [3, 4, 5], 2)).toBe(false);
    expect(bytesStartWith(bytes, [1, 2])).toBe(true);
  });
});

describe("toHex", () => {
  it("devolve hexadecimal minusculo com dois digitos por byte", () => {
    expect(toHex(new Uint8Array([0, 15, 16, 255]).buffer)).toBe("000f10ff");
  });

  it("um SHA-256 tem 64 caracteres hexadecimais minusculos", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("olyvia"));
    expect(toHex(digest)).toMatch(/^[0-9a-f]{64}$/);
  });
});

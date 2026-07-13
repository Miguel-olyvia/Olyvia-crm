// Unit tests for detectSignature + isSignatureAllowedForBucket.
// Run: deno test supabase/functions/validate-upload/index.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectSignature, isSignatureAllowedForBucket } from "./index.ts";

const MIN_LENGTH = 16;

function padded(bytes: number[]): Uint8Array {
  const result = new Uint8Array(Math.max(bytes.length, MIN_LENGTH));
  result.set(bytes);
  return result;
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

Deno.test("detectSignature: PDF", () => {
  const bytes = padded([0x25, 0x50, 0x44, 0x46, 0x2d]);
  assertEquals(detectSignature(bytes), "pdf");
});

Deno.test("detectSignature: PNG", () => {
  const bytes = padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertEquals(detectSignature(bytes), "png");
});

Deno.test("detectSignature: JPEG", () => {
  const bytes = padded([0xff, 0xd8, 0xff]);
  assertEquals(detectSignature(bytes), "jpeg");
});

Deno.test("detectSignature: GIF", () => {
  const bytes = padded([0x47, 0x49, 0x46, 0x38]);
  assertEquals(detectSignature(bytes), "gif");
});

Deno.test("detectSignature: WEBP", () => {
  const bytes = padded([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // chunk size, irrelevant for detection
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  assertEquals(detectSignature(bytes), "webp");
});

Deno.test("detectSignature: ZIP/Office", () => {
  const bytes = padded([0x50, 0x4b, 0x03, 0x04]);
  assertEquals(detectSignature(bytes), "zip-office");
});

Deno.test("detectSignature: OLE2/Office antigo", () => {
  const bytes = padded([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  assertEquals(detectSignature(bytes), "ole2-office");
});

Deno.test("detectSignature: MP4", () => {
  const bytes = padded([
    0x00, 0x00, 0x00, 0x18, // box size, irrelevant for detection
    0x66, 0x74, 0x79, 0x70, // ftyp
  ]);
  assertEquals(detectSignature(bytes), "mp4");
});

Deno.test("detectSignature: WEBM", () => {
  const bytes = padded([0x1a, 0x45, 0xdf, 0xa3]);
  assertEquals(detectSignature(bytes), "webm");
});

Deno.test("detectSignature: MP3 com prefixo FF FB", () => {
  const bytes = padded([0xff, 0xfb]);
  assertEquals(detectSignature(bytes), "mp3");
});

Deno.test("detectSignature: MP3 com prefixo ID3", () => {
  const bytes = padded([0x49, 0x44, 0x33]);
  assertEquals(detectSignature(bytes), "mp3");
});

Deno.test("detectSignature: HTML/script disfarçado devolve null (proteção contra upload malicioso)", () => {
  const scriptBytes = textBytes("<script>alert(1)</script>");
  assertEquals(detectSignature(scriptBytes), null);

  const svgBytes = textBytes("<svg onload=alert(1)>");
  assertEquals(detectSignature(svgBytes), null);
});

Deno.test("detectSignature: array vazio devolve null sem lançar exceção", () => {
  assertEquals(detectSignature(new Uint8Array(0)), null);
});

Deno.test("detectSignature: bytes insuficientes para qualquer assinatura devolve null sem lançar exceção", () => {
  assertEquals(detectSignature(new Uint8Array([0x00, 0x01, 0x02])), null);
});

Deno.test("isSignatureAllowedForBucket: documents aceita pdf, zip-office, ole2-office, png, jpeg, gif, webp", () => {
  for (const signature of ["pdf", "zip-office", "ole2-office", "png", "jpeg", "gif", "webp"]) {
    assertEquals(isSignatureAllowedForBucket(signature, "documents"), true);
  }
  assertEquals(isSignatureAllowedForBucket("mp4", "documents"), false);
  assertEquals(isSignatureAllowedForBucket("webm", "documents"), false);
});

Deno.test("isSignatureAllowedForBucket: company-logos aceita apenas png, jpeg, webp", () => {
  for (const signature of ["png", "jpeg", "webp"]) {
    assertEquals(isSignatureAllowedForBucket(signature, "company-logos"), true);
  }
  assertEquals(isSignatureAllowedForBucket("mp4", "company-logos"), false);
  assertEquals(isSignatureAllowedForBucket("pdf", "company-logos"), false);
});

Deno.test("isSignatureAllowedForBucket: media aceita png, jpeg, gif, webp, mp4, webm, mp3, pdf, zip-office, ole2-office", () => {
  for (
    const signature of [
      "png",
      "jpeg",
      "gif",
      "webp",
      "mp4",
      "webm",
      "mp3",
      "pdf",
      "zip-office",
      "ole2-office",
    ]
  ) {
    assertEquals(isSignatureAllowedForBucket(signature, "media"), true);
  }
});

Deno.test("isSignatureAllowedForBucket: mp4 só é permitido em media", () => {
  assertEquals(isSignatureAllowedForBucket("mp4", "media"), true);
  assertEquals(isSignatureAllowedForBucket("mp4", "documents"), false);
  assertEquals(isSignatureAllowedForBucket("mp4", "company-logos"), false);
});

Deno.test("isSignatureAllowedForBucket: webm só é permitido em media", () => {
  assertEquals(isSignatureAllowedForBucket("webm", "media"), true);
  assertEquals(isSignatureAllowedForBucket("webm", "documents"), false);
  assertEquals(isSignatureAllowedForBucket("webm", "company-logos"), false);
});

Deno.test("isSignatureAllowedForBucket: signature null é sempre recusada", () => {
  assertEquals(isSignatureAllowedForBucket(null, "documents"), false);
  assertEquals(isSignatureAllowedForBucket(null, "company-logos"), false);
  assertEquals(isSignatureAllowedForBucket(null, "media"), false);
});

Deno.test("isSignatureAllowedForBucket: finalBucket desconhecido devolve false sem lançar exceção", () => {
  assertEquals(isSignatureAllowedForBucket("pdf", "nao-existe"), false);
  assertEquals(isSignatureAllowedForBucket(null, "nao-existe"), false);
});

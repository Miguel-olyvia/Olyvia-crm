/**
 * Reconhecimento do tipo REAL de um ficheiro pelos primeiros bytes (a
 * assinatura binaria, ou "magic bytes"), ignorando o tipo que o cliente diz.
 *
 * TS puro, sem Deno nem rede: e partilhado por validate-upload e pelos anexos
 * do convite de admissao, e testa-se no vitest.
 */

/**
 * Formata os bytes de um digest (ex.: SHA-256) como hexadecimal minusculo,
 * o mesmo formato que pessoas_documentos_ficheiro_hash_formato exige.
 */
export function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bytesStartWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Detects the real file type from its binary signature (magic bytes), ignoring
 * whatever MIME type the client claims. Returns a signature category or null
 * when nothing recognized is found.
 */
export function detectSignature(bytes: Uint8Array): string | null {
  if (bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  if (bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip-office";
  if (bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole2-office";
  // MP4's signature lives at byte offset 4 ("ftyp"), not at byte 0.
  if (bytesStartWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "mp4";
  if (bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (
    bytesStartWith(bytes, [0xff, 0xfb]) ||
    bytesStartWith(bytes, [0xff, 0xf3]) ||
    bytesStartWith(bytes, [0xff, 0xf2]) ||
    bytesStartWith(bytes, [0x49, 0x44, 0x33])
  ) {
    return "mp3";
  }
  return null;
}

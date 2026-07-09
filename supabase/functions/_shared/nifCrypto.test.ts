import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decryptNif,
  deriveKeyFromEnv,
  encryptNif,
  hashNif,
  normalizeNif,
  tokenizeNif,
} from "./nifCrypto.ts";

function randomBase64Bytes(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

async function makeEncKey(): Promise<CryptoKey> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function makeHmacKey(): Promise<CryptoKey> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

Deno.test("normalizeNif trims, uppercases and strips spaces, dots and hyphens", () => {
  assertEquals(normalizeNif("  123456789  "), "123456789");
  assertEquals(normalizeNif("123.456.789"), "123456789");
  assertEquals(normalizeNif("123-456-789"), "123456789");
  assertEquals(normalizeNif(" ab-cd.ef "), "ABCDEF");
});

Deno.test("normalizeNif is pure and deterministic", () => {
  const input = " 123.456-789 ";
  assertEquals(normalizeNif(input), normalizeNif(input));
  assertEquals(input, " 123.456-789 ");
});

Deno.test("encryptNif/decryptNif round-trip for several values", async () => {
  const key = await makeEncKey();
  const values = ["123456789", "", "a!@# ñ 日本語", "0", "  spaced value  "];

  for (const value of values) {
    const encoded = await encryptNif(value, key);
    const decoded = await decryptNif(encoded, key);
    assertEquals(decoded, value);
  }
});

Deno.test("encryptNif produces different ciphertexts for same value due to random IV, but both decrypt correctly", async () => {
  const key = await makeEncKey();
  const value = "123456789";

  const encodedA = await encryptNif(value, key);
  const encodedB = await encryptNif(value, key);

  assertNotEquals(encodedA, encodedB);

  assertEquals(await decryptNif(encodedA, key), value);
  assertEquals(await decryptNif(encodedB, key), value);
});

Deno.test("decryptNif rejects tampered ciphertext instead of returning garbage", async () => {
  const key = await makeEncKey();
  const encoded = await encryptNif("123456789", key);

  const tampered = encoded.slice(0, -1) +
    (encoded.slice(-1) === "A" ? "B" : "A");

  await assertRejects(() => decryptNif(tampered, key));
});

function flipCharAt(base64: string, index: number): string {
  const chars = base64.split("");
  const current = chars[index];
  chars[index] = current === "A" ? "B" : "A";
  return chars.join("");
}

Deno.test("decryptNif rejects tampering in the middle of the ciphertext", async () => {
  const key = await makeEncKey();
  const encoded = await encryptNif("123456789 tampered-middle-test", key);

  // The IV occupies the first 12 bytes (16 base64 chars once padding-aligned).
  // Pick an index safely past that, roughly mid-string, inside ciphertext.
  const middleIndex = Math.floor(encoded.length / 2);
  const tampered = flipCharAt(encoded, middleIndex);

  await assertRejects(() => decryptNif(tampered, key));
});

Deno.test("decryptNif rejects tampering inside the IV region (leading bytes)", async () => {
  const key = await makeEncKey();
  const encoded = await encryptNif("123456789", key);

  // Flip a character within the first few base64 characters, which encode
  // the leading bytes of the 12-byte IV.
  const tampered = flipCharAt(encoded, 1);

  await assertRejects(() => decryptNif(tampered, key));
});

Deno.test("decryptNif rejects malformed/invalid format input", async () => {
  const key = await makeEncKey();

  await assertRejects(() => decryptNif("", key));
  await assertRejects(() => decryptNif("not-base64-!!!", key));
  await assertRejects(() => decryptNif(randomBase64Bytes(4), key));
});

Deno.test("hashNif is deterministic and insensitive to whitespace/case normalization", async () => {
  const key = await makeHmacKey();

  const a = await hashNif("123456789", key);
  const b = await hashNif(" 123456789 ", key);
  const c = await hashNif("123456789", key);

  assertEquals(a, b);
  assertEquals(a, c);
  assert(/^[0-9a-f]+$/.test(a));
});

Deno.test("hashNif produces different hashes for different keys with same value", async () => {
  const keyA = await makeHmacKey();
  const keyB = await makeHmacKey();

  const hashA = await hashNif("123456789", keyA);
  const hashB = await hashNif("123456789", keyB);

  assertNotEquals(hashA, hashB);
});

Deno.test("tokenizeNif returns trigram hashes without duplicates", async () => {
  const key = await makeHmacKey();

  const tokens = await tokenizeNif("123456789", key);

  assertEquals(tokens.length, 7);
  for (const token of tokens) {
    assert(/^[0-9a-f]+$/.test(token));
  }
  assertEquals(new Set(tokens).size, tokens.length);
});

Deno.test("tokenizeNif is stable across equivalent normalized inputs", async () => {
  const key = await makeHmacKey();

  const tokensA = await tokenizeNif("123456789", key);
  const tokensB = await tokenizeNif(" 123-456.789 ", key);

  assertEquals(new Set(tokensA), new Set(tokensB));
});

Deno.test("tokenizeNif never throws for short (but non-empty) normalized values", async () => {
  const key = await makeHmacKey();

  const oneChar = await tokenizeNif("a", key);
  const twoChars = await tokenizeNif("ab", key);

  assertEquals(oneChar.length, 1);
  assertEquals(twoChars.length, 1);
});

Deno.test("hashNif throws on empty/whitespace-only value instead of hashing an empty string", async () => {
  const key = await makeHmacKey();

  await assertRejects(() => hashNif("", key));
  await assertRejects(() => hashNif("   ", key));
  await assertRejects(() => hashNif(" . - ", key));
});

Deno.test("tokenizeNif throws on empty/whitespace-only value instead of tokenizing an empty string", async () => {
  const key = await makeHmacKey();

  await assertRejects(() => tokenizeNif("", key));
  await assertRejects(() => tokenizeNif("   ", key));
  await assertRejects(() => tokenizeNif(" . - ", key));
});

Deno.test("deriveKeyFromEnv throws a clear error when the env var is missing", () => {
  const originalGet = Deno.env.get;
  try {
    Deno.env.get = ((_name: string) => undefined) as typeof Deno.env.get;
    assertThrows(
      () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      Error,
    );
  } finally {
    Deno.env.get = originalGet;
  }
});

Deno.test("deriveKeyFromEnv throws a clear error when the key has the wrong size", () => {
  const originalGet = Deno.env.get;
  try {
    Deno.env.get = ((name: string) =>
      name === "NIF_ENC_KEY" ? btoa("too-short") : undefined) as typeof Deno
        .env
        .get;
    assertThrows(
      () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      Error,
    );
  } finally {
    Deno.env.get = originalGet;
  }
});

Deno.test("deriveKeyFromEnv derives a usable AES-GCM key from a valid base64 env var", async () => {
  const originalGet = Deno.env.get;
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const base64Key = btoa(String.fromCharCode(...raw));

  try {
    Deno.env.get = ((name: string) =>
      name === "NIF_ENC_KEY" ? base64Key : undefined) as typeof Deno.env.get;

    const key = await deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM");
    const encoded = await encryptNif("123456789", key);
    const decoded = await decryptNif(encoded, key);
    assertEquals(decoded, "123456789");
  } finally {
    Deno.env.get = originalGet;
  }
});

Deno.test("deriveKeyFromEnv derives a usable HMAC key from a valid base64 env var", async () => {
  const originalGet = Deno.env.get;
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const base64Key = btoa(String.fromCharCode(...raw));

  try {
    Deno.env.get = ((name: string) =>
      name === "NIF_HMAC_KEY" ? base64Key : undefined) as typeof Deno.env.get;

    const key = await deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC");
    const hash = await hashNif("123456789", key);
    assert(/^[0-9a-f]{64}$/.test(hash));
  } finally {
    Deno.env.get = originalGet;
  }
});

Deno.test("deriveKeyFromEnv rejects when NIF_ENC_KEY and NIF_HMAC_KEY resolve to the same key bytes", async () => {
  const originalGet = Deno.env.get;
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const sharedBase64Key = btoa(String.fromCharCode(...raw));

  try {
    Deno.env.get = ((name: string) => {
      if (name === "NIF_ENC_KEY" || name === "NIF_HMAC_KEY") {
        return sharedBase64Key;
      }
      return undefined;
    }) as typeof Deno.env.get;

    assertThrows(
      () => deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM"),
      Error,
    );
    assertThrows(
      () => deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC"),
      Error,
    );
  } finally {
    Deno.env.get = originalGet;
  }
});

Deno.test("deriveKeyFromEnv does not throw for the key-confusion check when keys legitimately differ", async () => {
  const originalGet = Deno.env.get;
  const encRaw = new Uint8Array(32);
  crypto.getRandomValues(encRaw);
  const hmacRaw = new Uint8Array(32);
  crypto.getRandomValues(hmacRaw);
  const encBase64 = btoa(String.fromCharCode(...encRaw));
  const hmacBase64 = btoa(String.fromCharCode(...hmacRaw));

  try {
    Deno.env.get = ((name: string) => {
      if (name === "NIF_ENC_KEY") return encBase64;
      if (name === "NIF_HMAC_KEY") return hmacBase64;
      return undefined;
    }) as typeof Deno.env.get;

    const encKey = deriveKeyFromEnv("NIF_ENC_KEY", "AES-GCM");
    const hmacKey = deriveKeyFromEnv("NIF_HMAC_KEY", "HMAC");
    assertEquals(encKey.byteLength, 32);
    assertEquals(hmacKey.byteLength, 32);
  } finally {
    Deno.env.get = originalGet;
  }
});

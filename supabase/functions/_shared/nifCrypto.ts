/**
 * NIF (Portuguese tax number) cryptography helpers.
 *
 * Provides deterministic normalization plus AES-256-GCM encryption,
 * HMAC-SHA256 hashing, and HMAC-SHA256 trigram tokenization for the NIF
 * field. Runs on Deno's native Web Crypto API (crypto.subtle).
 *
 * This module is intentionally standalone: it does not touch any schema,
 * migration, or existing Edge Function code.
 */

const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BITS = 128;
const AES_KEY_LENGTH_BYTES = 32;
const HMAC_KEY_LENGTH_BYTES = 32;
const TRIGRAM_WINDOW = 3;

type SupportedAlgorithm = "AES-GCM" | "HMAC";

/**
 * Strips whitespace, dots and hyphens and uppercases the value.
 * Pure and deterministic: same input always yields the same output and the
 * original string is never mutated.
 */
export function normalizeNif(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s.\-]/g, "");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function importAesKeyIfNeeded(
  key: CryptoKey | Uint8Array,
): Promise<CryptoKey> {
  if (key instanceof Uint8Array) {
    if (key.byteLength !== AES_KEY_LENGTH_BYTES) {
      throw new Error(
        `Invalid AES key length: expected ${AES_KEY_LENGTH_BYTES} bytes, got ${key.byteLength}`,
      );
    }
    return crypto.subtle.importKey(
      "raw",
      toArrayBuffer(key),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  }
  return key;
}

async function importHmacKeyIfNeeded(
  key: CryptoKey | Uint8Array,
): Promise<CryptoKey> {
  if (key instanceof Uint8Array) {
    if (key.byteLength !== HMAC_KEY_LENGTH_BYTES) {
      throw new Error(
        `Invalid HMAC key length: expected ${HMAC_KEY_LENGTH_BYTES} bytes, got ${key.byteLength}`,
      );
    }
    return crypto.subtle.importKey(
      "raw",
      toArrayBuffer(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return key;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("decryptNif: invalid base64 input");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compares two byte arrays in constant time (no early return on the first
 * mismatching byte), to avoid leaking information about where two secrets
 * diverge through a timing side-channel. Arrays of different lengths are
 * never equal, but every byte of the shorter/longer arrays is still folded
 * into the comparison loop where possible.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const maxLength = Math.max(a.byteLength, b.byteLength);
  let diff = a.byteLength ^ b.byteLength;
  for (let i = 0; i < maxLength; i++) {
    const byteA = i < a.byteLength ? a[i] : 0;
    const byteB = i < b.byteLength ? b[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

/**
 * Encrypts `value` with AES-256-GCM using a freshly generated random 12-byte
 * IV on every call. Output format: base64(iv[12] || ciphertext || authTag[16]).
 * Web Crypto's `encrypt` appends the authentication tag to the end of the
 * returned buffer, so the combined layout produced here is iv followed by
 * (ciphertext || authTag), and `decryptNif` slices it back accordingly.
 */
export async function encryptNif(
  value: string,
  key: CryptoKey | Uint8Array,
): Promise<string> {
  const cryptoKey = await importAesKeyIfNeeded(key);

  const iv = new Uint8Array(IV_LENGTH_BYTES);
  crypto.getRandomValues(iv);

  const plaintextBytes = new TextEncoder().encode(value);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH_BITS },
    cryptoKey,
    plaintextBytes,
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);

  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypts a value produced by `encryptNif`. Throws a clear error if the
 * format is invalid or the auth tag fails validation (tampered data).
 */
export async function decryptNif(
  encoded: string,
  key: CryptoKey | Uint8Array,
): Promise<string> {
  if (!encoded) {
    throw new Error("decryptNif: encoded value must be a non-empty string");
  }

  const cryptoKey = await importAesKeyIfNeeded(key);
  const combined = base64ToBytes(encoded);

  const authTagBytes = AUTH_TAG_LENGTH_BITS / 8;
  const minimumLength = IV_LENGTH_BYTES + authTagBytes;
  if (combined.byteLength < minimumLength) {
    throw new Error("decryptNif: encoded value is too short to be valid");
  }

  const iv = combined.slice(0, IV_LENGTH_BYTES);
  const ciphertextWithTag = combined.slice(IV_LENGTH_BYTES);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH_BITS },
      cryptoKey,
      ciphertextWithTag,
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error(
      "decryptNif: authentication failed, data may be tampered or corrupted",
    );
  }
}

/**
 * Computes a deterministic HMAC-SHA256 hex digest over the normalized value.
 *
 * Throws if the normalized value is an empty string (e.g. the input was
 * empty or only whitespace/dots/hyphens). Hashing an empty string would
 * produce the same digest for every record with "no NIF", creating an
 * observable collision that lets anyone with read access to the hash column
 * identify every such record. Callers must treat "no NIF" as `null` and
 * never call `hashNif` with a value that normalizes to "".
 */
export async function hashNif(
  value: string,
  hmacKey: CryptoKey | Uint8Array,
): Promise<string> {
  const normalized = normalizeNif(value);
  if (normalized === "") {
    throw new Error(
      "hashNif: normalized value is empty; treat a missing NIF as null instead of hashing an empty string",
    );
  }
  const cryptoKey = await importHmacKeyIfNeeded(hmacKey);
  const bytes = new TextEncoder().encode(normalized);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, bytes);
  return bytesToHex(signature);
}

/**
 * Generates HMAC-SHA256 hex tokens for every trigram (sliding window of 3
 * characters) of the normalized value. Returns deduplicated tokens.
 * Falls back to hashing the whole normalized value when it is shorter than
 * the trigram window (but non-empty).
 *
 * Throws if the normalized value is an empty string, for the same
 * observable-collision reason documented on `hashNif`: callers must treat
 * "no NIF" as `null` and never tokenize an empty string.
 *
 * Known accepted risk (see CRITICAL #1 in the security review): isolated
 * trigram tokens have a small search space (at most ~36^3, and typically far
 * fewer given the NIF alphabet), so a single token is brute-forceable.
 * Access to the token table must be restricted to trusted backend code only.
 */
export async function tokenizeNif(
  value: string,
  hmacKey: CryptoKey | Uint8Array,
): Promise<string[]> {
  const normalized = normalizeNif(value);
  if (normalized === "") {
    throw new Error(
      "tokenizeNif: normalized value is empty; treat a missing NIF as null instead of tokenizing an empty string",
    );
  }
  const cryptoKey = await importHmacKeyIfNeeded(hmacKey);

  const grams: string[] = [];
  if (normalized.length < TRIGRAM_WINDOW) {
    grams.push(normalized);
  } else {
    for (let i = 0; i <= normalized.length - TRIGRAM_WINDOW; i++) {
      grams.push(normalized.slice(i, i + TRIGRAM_WINDOW));
    }
  }

  const tokens = await Promise.all(
    grams.map(async (gram) => {
      const bytes = new TextEncoder().encode(gram);
      const signature = await crypto.subtle.sign("HMAC", cryptoKey, bytes);
      return bytesToHex(signature);
    }),
  );

  return Array.from(new Set(tokens));
}

const AES_ENC_KEY_ENV_VAR_NAME = "NIF_ENC_KEY";
const HMAC_KEY_ENV_VAR_NAME = "NIF_HMAC_KEY";

/**
 * Reads a base64-encoded key from the given environment variable and
 * decodes it into raw key bytes for the requested algorithm. Fails fast
 * (synchronously) with a clear error if the env var is missing, malformed,
 * has the wrong byte length, or is confused with the other key (see below),
 * so a misconfigured deployment never falls back to a silent empty/fixed key.
 *
 * Key confusion check: when the env var being read is one half of the
 * well-known AES/HMAC key pair (`NIF_ENC_KEY` / `NIF_HMAC_KEY`), this
 * function also reads its counterpart (if present) and rejects if both
 * resolve to the exact same key bytes. Using the same secret for both
 * encryption and authentication defeats the security guarantees of each
 * and must never happen in a valid deployment. The comparison is done
 * byte-by-byte without early-return (`constantTimeEqual`) to avoid leaking
 * timing information about the key bytes.
 *
 * Key lifecycle guidance for callers: import the raw bytes returned here
 * into a non-extractable `CryptoKey` exactly ONCE at process startup (e.g.
 * via `crypto.subtle.importKey(..., extractable: false, ...)`), then reuse
 * that `CryptoKey` for the lifetime of the process. Do not keep the raw
 * `Uint8Array` around or call `deriveKeyFromEnv` repeatedly per request —
 * minimizing how long raw key material lives in memory reduces the window
 * in which it could be exposed (e.g. via a memory dump or a logging bug).
 *
 * The returned raw bytes can be passed directly to encryptNif/decryptNif/
 * hashNif/tokenizeNif, which import them into a CryptoKey internally.
 */
export function deriveKeyFromEnv(
  envVarName: string,
  algorithm: SupportedAlgorithm,
): Uint8Array {
  const rawValue = Deno.env.get(envVarName);
  if (!rawValue) {
    throw new Error(
      `deriveKeyFromEnv: missing required environment variable "${envVarName}"`,
    );
  }

  let decoded: Uint8Array;
  try {
    decoded = base64ToBytes(rawValue);
  } catch {
    throw new Error(
      `deriveKeyFromEnv: environment variable "${envVarName}" is not valid base64`,
    );
  }

  const expectedLength = algorithm === "AES-GCM"
    ? AES_KEY_LENGTH_BYTES
    : HMAC_KEY_LENGTH_BYTES;

  if (decoded.byteLength !== expectedLength) {
    throw new Error(
      `deriveKeyFromEnv: "${envVarName}" must decode to ${expectedLength} bytes for ${algorithm}, got ${decoded.byteLength}`,
    );
  }

  const counterpartEnvVarName = envVarName === AES_ENC_KEY_ENV_VAR_NAME
    ? HMAC_KEY_ENV_VAR_NAME
    : envVarName === HMAC_KEY_ENV_VAR_NAME
    ? AES_ENC_KEY_ENV_VAR_NAME
    : undefined;

  if (counterpartEnvVarName) {
    const counterpartRawValue = Deno.env.get(counterpartEnvVarName);
    if (counterpartRawValue) {
      let counterpartDecoded: Uint8Array | undefined;
      try {
        counterpartDecoded = base64ToBytes(counterpartRawValue);
      } catch {
        counterpartDecoded = undefined;
      }

      if (
        counterpartDecoded !== undefined &&
        constantTimeEqual(decoded, counterpartDecoded)
      ) {
        throw new Error(
          `deriveKeyFromEnv: "${envVarName}" and "${counterpartEnvVarName}" must not resolve to the same key bytes (AES/HMAC key confusion)`,
        );
      }
    }
  }

  return decoded;
}

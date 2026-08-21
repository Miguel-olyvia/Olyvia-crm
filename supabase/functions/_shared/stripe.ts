/**
 * Minimal Stripe REST API client for Edge Functions -- no SDK dependency.
 *
 * Stripe's REST API does NOT accept JSON bodies: every request is
 * `application/x-www-form-urlencoded`, and nested objects/arrays (e.g.
 * `line_items`, `price_data`) are flattened into bracket-notation keys like
 * `line_items[0][price_data][unit_amount]`. This mirrors exactly what
 * Stripe's own official client libraries do internally before sending the
 * request -- see https://stripe.com/docs/api (any endpoint's "cURL" tab
 * shows the flattened form).
 *
 * Feature flag: every Edge Function in this project checks
 * `isStripeConfigured()` before calling `stripeRequest()`. Without
 * STRIPE_SECRET_KEY configured as a Supabase secret, `stripeRequest()`
 * throws immediately and callers fall back to the pre-Stripe manual-invoice
 * flow -- see stripe-create-checkout-session/index.ts.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1";

/**
 * Params accepted by stripeRequest. Broader than a flat
 * Record<string, string | number> on purpose: Stripe endpoints like
 * Checkout Session creation require nested objects/arrays (line_items,
 * price_data, metadata) which the serializer below flattens into Stripe's
 * bracket-notation form encoding.
 */
export type StripeParams = Record<string, unknown>;

/**
 * Recursively appends `value` under `key` into `searchParams`, using
 * Stripe's bracket-notation flattening for arrays and nested objects:
 *   { line_items: [ { price: "price_123", quantity: 1 } ] }
 * becomes
 *   line_items[0][price]=price_123&line_items[0][quantity]=1
 * `null`/`undefined` values are skipped entirely (Stripe treats an absent
 * param differently from an explicit empty value for several fields).
 */
function appendFormParam(
  searchParams: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      appendFormParam(searchParams, `${key}[${index}]`, item)
    );
    return;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(
      ([subKey, subValue]) =>
        appendFormParam(searchParams, `${key}[${subKey}]`, subValue),
    );
    return;
  }

  searchParams.append(key, String(value));
}

function toStripeFormBody(params: StripeParams): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) =>
    appendFormParam(searchParams, key, value)
  );
  return searchParams.toString();
}

/**
 * Calls the Stripe REST API directly via fetch (no stripe-node dependency,
 * to keep this Deno-native with zero extra imports).
 *
 * @param path   Stripe API path without leading slash, e.g.
 *               "checkout/sessions" or "customers/cus_123".
 * @param params Request params -- form-encoded, nested objects/arrays
 *               flattened per Stripe's convention (see appendFormParam).
 * @param opts   `method` defaults to POST (the vast majority of Stripe
 *               calls this project makes are creates/updates). Use "GET"
 *               for read-only lookups -- params are still sent, but as a
 *               query string is NOT built here (Stripe GETs used by this
 *               project so far don't need query params); pass an empty
 *               params object for GET calls.
 * @throws Error with Stripe's own error message when the response is not 2xx.
 */
export async function stripeRequest(
  path: string,
  params: StripeParams = {},
  opts: { method?: string } = {},
): Promise<any> {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    // Callers are expected to gate on isStripeConfigured() before ever
    // reaching here -- this is a defensive backstop, not the primary
    // feature-flag check.
    throw new Error(
      "stripeRequest: STRIPE_SECRET_KEY não está configurado nos secrets do Supabase",
    );
  }

  const method = (opts.method ?? "POST").toUpperCase();
  const url = `${STRIPE_API_BASE}/${path}`;
  const isBodyMethod = method !== "GET" && method !== "HEAD";

  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      ...(isBodyMethod
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: isBodyMethod ? toStripeFormBody(params) : undefined,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json?.error?.message ||
      `Stripe API error (HTTP ${response.status}) on ${path}`;
    throw new Error(message);
  }

  return json;
}

/**
 * Feature-flag check: is the Stripe integration configured at all?
 * Every caller (stripe-create-checkout-session, and any future Stripe
 * touchpoint) MUST branch on this before attempting any Stripe API call or
 * webhook verification, so that the product keeps working exactly as
 * before (manual "pendente" invoice flow) until the business configures
 * STRIPE_SECRET_KEY as a Supabase secret.
 */
export function isStripeConfigured(): boolean {
  return !!Deno.env.get("STRIPE_SECRET_KEY");
}

/**
 * Verifies a Stripe webhook signature per Stripe's documented algorithm:
 * https://stripe.com/docs/webhooks#verify-manually
 *
 * The `Stripe-Signature` request header has the shape:
 *   t=1614556800,v1=5257a869e7bcdb...,v1=...
 * - `t` is the Unix timestamp Stripe generated the signature at.
 * - one or more `v1=` entries are HMAC-SHA256 signatures, hex-encoded, of
 *   the string `${t}.${rawRequestBody}`, computed with the endpoint's
 *   signing secret as the HMAC key. Stripe can include more than one `v1`
 *   value during secret rotation -- a match against ANY of them is valid.
 *
 * SECURITY CRITICAL: this must run against the RAW request body text
 * (before any JSON.parse), and the caller must reject the request (400,
 * no processing) whenever this returns false OR the webhook secret isn't
 * configured -- never fall back to "trust the payload anyway".
 *
 * Implemented with the Web Crypto API (`crypto.subtle`), available natively
 * in Deno -- no external crypto dependency needed.
 */
export async function verifyStripeWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  if (!sigHeader || !secret) return false;

  // Parse "t=...,v1=...,v1=..." into a timestamp and a list of candidate
  // signatures (comma-separated key=value pairs).
  let timestamp: string | null = null;
  const candidateSignatures: string[] = [];

  for (const part of sigHeader.split(",")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1" && value) candidateSignatures.push(value);
  }

  if (!timestamp || candidateSignatures.length === 0) return false;

  // Replay-attack mitigation recommended by Stripe: reject signatures
  // whose timestamp is too far from "now" (5 minutes, Stripe's own
  // default tolerance). A stolen/logged payload+signature pair becomes
  // useless to replay after this window closes.
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const toleranceSeconds = 5 * 60;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return false;
  }

  // Signed payload is exactly "{timestamp}.{raw body}" -- no separators,
  // no re-serialization of the body (it must be the exact bytes Stripe sent).
  const signedPayload = `${timestamp}.${payload}`;

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(signedPayload),
  );

  const expectedSignatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return candidateSignatures.some((sig) => sig === expectedSignatureHex);
}

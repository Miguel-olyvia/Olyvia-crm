import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import {
  beforeBreadcrumb,
  beforeSend,
  REDACTED,
  sanitizeUrl,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
} from "../scrub";

const CUSTOMER_EMAIL = "alguem@exemplo.pt";
const ENCODED_EMAIL = "alguem%40exemplo.pt";
const SUPABASE_SEARCH_URL = `https://abcdefgh.supabase.co/rest/v1/clients?email=eq.${ENCODED_EMAIL}&select=*`;

const fetchBreadcrumb = (): Breadcrumb => ({
  category: "fetch",
  type: "http",
  level: "error",
  message: `GET ${SUPABASE_SEARCH_URL} [500]`,
  data: { method: "GET", url: SUPABASE_SEARCH_URL, status_code: 500 },
});

const baseEvent = (overrides: Partial<ErrorEvent> = {}): ErrorEvent =>
  ({
    event_id: "abc",
    exception: { values: [{ type: "TypeError", value: "x.map is not a function" }] },
    ...overrides,
  }) as ErrorEvent;

/** Serialises the whole payload and looks for the customer's email in any form. */
const leaksEmail = (payload: unknown): boolean => {
  const serialized = JSON.stringify(payload ?? null);
  return (
    serialized.includes(CUSTOMER_EMAIL) ||
    serialized.includes(ENCODED_EMAIL) ||
    serialized.toLowerCase().includes("exemplo.pt")
  );
};

describe("network breadcrumb PII", () => {
  it("keeps the customer email out of a fetch breadcrumb", () => {
    const sanitized = beforeBreadcrumb(fetchBreadcrumb());

    expect(leaksEmail(sanitized)).toBe(false);
    expect(sanitized?.data?.url).toBe("https://abcdefgh.supabase.co/rest/v1/clients");
    expect(sanitized?.data?.method).toBe("GET");
    expect(sanitized?.data?.status_code).toBe(500);
    expect(sanitized?.message).toBeUndefined();
  });

  it("keeps the customer email out of an event that carries the breadcrumb", () => {
    const sent = beforeSend(baseEvent({ breadcrumbs: [fetchBreadcrumb()] }));

    expect(sent).not.toBeNull();
    expect(leaksEmail(sent)).toBe(false);
    expect(sent?.breadcrumbs?.[0]?.data?.url).toBe("https://abcdefgh.supabase.co/rest/v1/clients");
  });

  it("sanitises xhr breadcrumbs the same way and drops unknown data keys", () => {
    const sanitized = beforeBreadcrumb({
      category: "xhr",
      data: {
        method: "POST",
        url: `https://abcdefgh.supabase.co/rest/v1/leads?phone=eq.910000000&email=eq.${ENCODED_EMAIL}`,
        status_code: 200,
        // A key the current SDK does not send, to prove the allow-list holds.
        response_body: { email: CUSTOMER_EMAIL },
      },
    });

    expect(leaksEmail(sanitized)).toBe(false);
    expect(sanitized?.data).toEqual({
      url: "https://abcdefgh.supabase.co/rest/v1/leads",
      method: "POST",
      status_code: 200,
    });
  });

  it("strips the query string from navigation breadcrumbs", () => {
    const sanitized = beforeBreadcrumb({
      category: "navigation",
      data: { from: "/clients", to: `/clients?search=${ENCODED_EMAIL}` },
    });

    expect(leaksEmail(sanitized)).toBe(false);
    expect(sanitized?.data?.to).toBe("http://localhost:3000/clients");
  });

  it("fails closed on values it cannot safely parse", () => {
    expect(sanitizeUrl(undefined)).toBe(REDACTED);
    expect(sanitizeUrl(null)).toBe(REDACTED);
    expect(sanitizeUrl("")).toBe(REDACTED);
    expect(sanitizeUrl({ url: SUPABASE_SEARCH_URL })).toBe(REDACTED);
    expect(sanitizeUrl(`data:text/plain,${CUSTOMER_EMAIL}`)).toBe(REDACTED);
    expect(sanitizeUrl(`blob:https://app.olyvia.pt/${CUSTOMER_EMAIL}`)).toBe(REDACTED);
  });

  it("never keeps a query string, whatever the input shape", () => {
    for (const raw of [
      SUPABASE_SEARCH_URL,
      `/rest/v1/clients?email=eq.${ENCODED_EMAIL}`,
      `::garbage::?email=eq.${ENCODED_EMAIL}`,
      `https://app.olyvia.pt/clients#email=${ENCODED_EMAIL}`,
    ]) {
      const sanitized = sanitizeUrl(raw);
      expect(leaksEmail(sanitized)).toBe(false);
      expect(sanitized).not.toContain("?");
      expect(sanitized).not.toContain("#");
    }
  });

  it("drops credentials embedded in the URL", () => {
    expect(sanitizeUrl("https://user:secret@api.exemplo.pt/rest/v1/clients")).toBe(
      "https://api.exemplo.pt/rest/v1/clients"
    );
  });

  it("still key-scrubs PII on non-network breadcrumbs", () => {
    const sanitized = beforeBreadcrumb({
      category: "ui.click",
      data: { email: CUSTOMER_EMAIL, target: "button#save" },
    });

    expect(leaksEmail(sanitized)).toBe(false);
    expect(sanitized?.data?.email).toBe(REDACTED);
    expect(sanitized?.data?.target).toBe("button#save");
  });
});

describe("stale chunk errors", () => {
  it("drops a 'Failed to fetch dynamically imported module' event", () => {
    const event = baseEvent({
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Failed to fetch dynamically imported module: https://app.olyvia.pt/assets/Clients-abc123.js",
          },
        ],
      },
    });

    expect(beforeSend(event)).toBeNull();
  });

  it("drops the Firefox/Safari 'Importing a module script failed' variant", () => {
    expect(
      beforeSend(
        baseEvent({
          exception: { values: [{ type: "Error", value: "Importing a module script failed." }] },
        })
      )
    ).toBeNull();
  });

  it("drops it when it arrives as a bare event message", () => {
    expect(
      beforeSend(
        baseEvent({
          exception: undefined,
          message: "Failed to fetch dynamically imported module: /assets/Quotes-x.js",
        })
      )
    ).toBeNull();
  });
});

describe("events that must still reach Sentry", () => {
  it("lets a normal application error through", () => {
    const sent = beforeSend(baseEvent());

    expect(sent).not.toBeNull();
    expect(sent?.exception?.values?.[0]?.value).toBe("x.map is not a function");
  });

  it("lets a normal error with breadcrumbs and extra through, minus the PII", () => {
    const sent = beforeSend(
      baseEvent({
        extra: { clientId: "uuid-1234", email: CUSTOMER_EMAIL },
        user: { id: "user-1", email: CUSTOMER_EMAIL, ip_address: "1.2.3.4" },
        breadcrumbs: [fetchBreadcrumb(), { category: "console", message: "render failed" }],
      })
    );

    expect(sent).not.toBeNull();
    expect(leaksEmail(sent)).toBe(false);
    expect(sent?.extra?.clientId).toBe("uuid-1234");
    expect(sent?.user?.id).toBe("user-1");
    expect(sent?.breadcrumbs).toHaveLength(2);
    expect(sent?.breadcrumbs?.[1]?.message).toBe("render failed");
  });

  it("does not drop an error that merely mentions a module in passing", () => {
    const sent = beforeSend(
      baseEvent({ exception: { values: [{ type: "Error", value: "Module pricing failed to load quotes" }] } })
    );

    expect(sent).not.toBeNull();
  });
});

describe("noise filters", () => {
  it("covers both ResizeObserver variants and extension protocols", () => {
    expect(SENTRY_IGNORE_ERRORS).toContain("ResizeObserver loop limit exceeded");
    expect(SENTRY_IGNORE_ERRORS).toContain("ResizeObserver loop completed with undelivered notifications");
    for (const url of [
      "chrome-extension://abcdef/inject.js",
      "moz-extension://abcdef/inject.js",
      "safari-extension://abcdef/inject.js",
      "safari-web-extension://abcdef/inject.js",
    ]) {
      expect(SENTRY_DENY_URLS.some((pattern) => (pattern as RegExp).test(url))).toBe(true);
    }
  });
});

describe("PII inside the exception text itself", () => {
  const DUPLICATE_KEY_MESSAGE =
    'duplicate key value violates unique constraint "clients_email_key"\n' +
    `Key (email)=(${CUSTOMER_EMAIL}) already exists.`;

  it("keeps the customer email out of the issue title, without losing the constraint", () => {
    const sent = beforeSend(
      baseEvent({
        exception: { values: [{ type: "PostgrestError", value: DUPLICATE_KEY_MESSAGE }] },
      })
    );

    expect(sent).not.toBeNull();
    expect(leaksEmail(sent)).toBe(false);
    const value = sent?.exception?.values?.[0]?.value ?? "";
    expect(value).toContain('unique constraint "clients_email_key"');
    expect(value).toContain(`Key (email)=(${REDACTED}) already exists.`);
    // The exception type is diagnostic, never customer data — it stays.
    expect(sent?.exception?.values?.[0]?.type).toBe("PostgrestError");
  });

  it("scrubs a bare event message too", () => {
    const sent = beforeSend(
      baseEvent({ exception: undefined, message: `Falha ao criar cliente ${CUSTOMER_EMAIL}` })
    );

    expect(leaksEmail(sent)).toBe(false);
    expect(sent?.message).toBe(`Falha ao criar cliente ${REDACTED}`);
  });

  it("scrubs the PostgREST `details` string that survives the key allow-list", () => {
    const sent = beforeSend(
      baseEvent({
        extra: {
          code: "23505",
          details: `Key (email)=(${CUSTOMER_EMAIL}) already exists.`,
        },
      })
    );

    expect(leaksEmail(sent)).toBe(false);
    expect(sent?.extra?.code).toBe("23505");
    expect(sent?.extra?.details).toBe(`Key (email)=(${REDACTED}) already exists.`);
  });

  it("leaves an ordinary technical message completely intact", () => {
    const message = "Cannot read properties of undefined (reading 'proposal_id')";
    const sent = beforeSend(
      baseEvent({ exception: { values: [{ type: "TypeError", value: message }] } })
    );

    expect(sent?.exception?.values?.[0]?.value).toBe(message);
  });
});

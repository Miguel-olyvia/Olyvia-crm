import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/react";

// Capture what the flow reporter hands to Sentry, without a live SDK/DSN.
const captureException = vi.fn();
vi.mock("@sentry/react", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { captureFlowError } from "../../observability/captureFlowError";
import { beforeSend, REDACTED } from "../scrub";
import fonteCaptureFlowError from "../../observability/captureFlowError.ts?raw";
import fonteConviteAnexos from "../../../hooks/useConviteAnexos.ts?raw";
import fontePessoaAnexos from "../../../hooks/usePessoaAnexos.ts?raw";
import fontePessoaFotografia from "../../../hooks/usePessoaFotografia.ts?raw";
import fonteAnexoUrl from "../../hr/anexoUrl.ts?raw";

const CUSTOMER_EMAIL = "alguem@exemplo.pt";

const leaksEmail = (payload: unknown): boolean =>
  JSON.stringify(payload ?? null)
    .toLowerCase()
    .includes("exemplo.pt");

/** Rebuild the Sentry event the SDK would produce from the captured call. */
const eventFromLastCapture = (): ErrorEvent => {
  const [reportedError, context] = captureException.mock.calls[captureException.mock.calls.length - 1] as [
    Error,
    { contexts?: ErrorEvent["contexts"] },
  ];
  return {
    event_id: "test",
    exception: {
      values: [{ type: reportedError.name, value: reportedError.message }],
    },
    contexts: context?.contexts,
  } as ErrorEvent;
};

describe("captureFlowError on a Supabase-shaped error", () => {
  beforeEach(() => captureException.mockClear());

  it("reports the real message (not the generic keys title) and scrubs PII", () => {
    // A non-Error object exactly like PostgREST returns: message readable,
    // PII hiding in `details`.
    captureFlowError(
      {
        code: "23505",
        message: 'duplicate key value violates unique constraint "clients_email_key"',
        details: `Key (email)=(${CUSTOMER_EMAIL}) already exists.`,
        hint: null,
      },
      "client-lifecycle"
    );

    const [reportedError, context] = captureException.mock.calls[0] as [
      Error,
      { tags: { flow: string } },
    ];
    // The wrapped value is a real Error carrying the readable message.
    expect(reportedError).toBeInstanceOf(Error);
    expect(reportedError.message).toBe(
      'duplicate key value violates unique constraint "clients_email_key"'
    );
    expect(context.tags.flow).toBe("client-lifecycle");

    const sent = beforeSend(eventFromLastCapture());
    expect(sent).not.toBeNull();
    // Title is now the real cause, never the "Object captured as exception" fallback.
    expect(sent?.exception?.values?.[0]?.value).toContain(
      'unique constraint "clients_email_key"'
    );
    // The structured code survives; the email in `details` does not.
    expect(leaksEmail(sent)).toBe(false);
    const supabase = sent?.contexts?.supabase as Record<string, unknown> | undefined;
    expect(supabase?.code).toBe("23505");
    expect(supabase?.details).toBe(`Key (email)=(${REDACTED}) already exists.`);
  });

  it("leaves a real Error untouched (existing behaviour)", () => {
    const original = new Error("boom");
    captureFlowError(original, "proposal-workflow");

    const [reportedError, context] = captureException.mock.calls[0] as [
      unknown,
      { tags: { flow: string }; contexts?: unknown },
    ];
    expect(reportedError).toBe(original);
    expect(context.tags.flow).toBe("proposal-workflow");
    expect(context.contexts).toBeUndefined();
  });
});

// `BusinessFlow` e uma uniao fechada: uma origem usada num hook e nao
// declarada aqui parte o `tsc` (TS2345) e o build. Este teste apanha-o antes,
// sem depender de o tsc correr.
describe("BusinessFlow declara as origens dos anexos de admissao", () => {
  const casos: Array<[string, string, string]> = [
    ["hr-convite-anexos", "useConviteAnexos", fonteConviteAnexos],
    ["hr-pessoa-anexos-carregar", "usePessoaAnexos", fontePessoaAnexos],
    ["hr-pessoa-fotografia", "usePessoaFotografia", fontePessoaFotografia],
    ["hr-anexo-obter-url", "anexoUrl", fonteAnexoUrl],
  ];

  it.each(casos)("%s esta na uniao e e usada por %s", (origem, _quem, fonte) => {
    expect(fonte).toContain(`"${origem}"`);
    expect(fonteCaptureFlowError).toMatch(new RegExp(`\\|\\s*"${origem}"`));
  });
});

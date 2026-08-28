/**
 * Spec for the shared error-sanitizer used by both toast channels (channel A:
 * `use-toast.ts`; channel B: the `sonner` call sites, wired up separately).
 *
 * The rule, in order:
 *  1. Recognize a raw database/PostgREST error by RIGID SIGNATURE ONLY — never
 *     by a loose keyword guess. Signatures are things that can only come from
 *     Postgres/PostgREST internals, never from a hand-written UI message.
 *  2. When recognized, replace the ENTIRE technical message with the mapped
 *     friendly text from `FRIENDLY_MAP` (via `friendlyError.ts`), or a generic
 *     fallback when there is no specific mapping — and report the original,
 *     untouched text to Sentry via `captureFlowError`, tagged
 *     `db-error-leaked-to-ui`, so unsanitized sites become discoverable in
 *     production instead of invisible.
 *  3. When NOT recognized, the message passes through byte-for-byte and is
 *     NOT reported — legitimate validation/permission/business messages
 *     (which may legitimately contain a customer's email) are never touched.
 *  4. Never throws. A failure inside sanitization must fall back to showing
 *     the original message, exactly as if sanitization had not run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureFlowError = vi.fn();

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { sanitizeDbErrorForDisplay } from "@/utils/sanitizeDbErrorForDisplay";

beforeEach(() => {
  captureFlowError.mockReset();
  // getFriendlyErrorMessage/translate reads localStorage; keep it unset so
  // every assertion below runs against the deterministic English defaults.
  try {
    localStorage.removeItem("language");
  } catch {
    // jsdom always has localStorage in this suite; nothing to do otherwise.
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeDbErrorForDisplay — blocks raw database errors", () => {
  it("hides a not-null constraint violation and reports it to Sentry tagged db-error-leaked-to-ui", () => {
    const raw = 'null value in column "entity_id" violates not-null constraint';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("entity_id");
    expect(result.text).not.toContain("null value in column");
    expect(result.text).not.toContain("constraint");

    expect(captureFlowError).toHaveBeenCalledTimes(1);
    const [reportedError, flow] = captureFlowError.mock.calls[0];
    expect(flow).toBe("db-error-leaked-to-ui");
    expect(String((reportedError as Error).message ?? reportedError)).toContain(raw);
  });

  it("drops every value of a `Failing row contains (...)` dump — none of the row's data reaches the screen", () => {
    // Modeled on CampaignFieldsConfig.tsx:482 — ~20 columns dumped into the
    // message on a failed field-definition insert.
    const rowValues = [
      "field_key_x",
      "Nome do Campo",
      "text",
      "true",
      "false",
      "joao.cliente@exemplo.pt",
      "912345678",
      "9d3f2b1a-0000-4000-8000-000000000000",
      "2026-08-28",
      "PT",
    ];
    const raw =
      'null value in column "field_key" violates not-null constraint\n' +
      `Failing row contains (${rowValues.join(", ")}).`;

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    for (const value of rowValues) {
      expect(result.text).not.toContain(value);
    }
    expect(result.text).not.toContain("Failing row contains");
  });

  it("maps a unique-constraint duplicate to the specific friendly message, not the generic one", () => {
    const raw = 'duplicate key value violates unique constraint "clients_email_key"';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).toBe("This record already exists.");
  });

  // Regressao: `[\w"]+` nao atravessa espacos, por isso "foreign key" (dois
  // tokens) escapava, apesar de o comentario do modulo a dar como coberta.
  // Apanhado a 28/08 pelo agente do canal B.
  it("hides a foreign-key constraint violation, whose name spans two words", () => {
    const raw =
      'insert or update on table "deals" violates foreign key constraint "deals_client_id_fkey"';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("deals_client_id_fkey");
    expect(result.text).not.toContain("foreign key");
  });

  it("hides a row-level security policy violation", () => {
    const raw = 'new row violates row-level security policy for table "proposals"';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("row-level security");
    expect(result.text).not.toContain("proposals");
  });

  it("hides a missing-relation error", () => {
    const raw = 'relation "public.anew_users" does not exist';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("anew_users");
    expect(result.text).not.toContain("does not exist");
  });

  it("hides a missing-column error", () => {
    const raw = "column proposals.valor does not exist";

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("proposals.valor");
  });

  it("hides an invalid-input-syntax error", () => {
    const raw = 'invalid input syntax for type uuid: "not-a-uuid"';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("not-a-uuid");
  });

  it("hides a Postgres permission-denied error (schema-level, not app-level)", () => {
    const raw = 'permission denied for table anew_entities';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("anew_entities");
  });

  it("hides a PostgREST error code", () => {
    const raw = "PGRST116: JSON object requested, multiple (or no) rows returned";

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("PGRST116");
  });

  it("hides a SQLSTATE-labeled error", () => {
    const raw = "duplicate key value violates unique constraint (SQLSTATE 23505)";

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).not.toContain("SQLSTATE");
    expect(result.text).not.toContain("23505");
  });

  it("falls back to the generic friendly message when the recognized error has no specific mapping", () => {
    const raw = 'relation "public.anew_users" does not exist';

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.wasSanitized).toBe(true);
    expect(result.text).toBe("An unexpected error occurred. Please try again.");
  });
});

describe("sanitizeDbErrorForDisplay — lets legitimate messages through untouched", () => {
  // Every message below is copied verbatim from real call sites, including one
  // that legitimately carries a customer email — the sanitizer must not touch
  // PII inside a legitimate message, only replace a technical message wholesale.
  const legitimateMessages: Array<[string, string]> = [
    ["required-field validation (BundleFormDialog.tsx)", "O nome é obrigatório."],
    ["required-field validation (CustomVariablesManager.tsx)", "Preencha o nome da variável"],
    [
      "permission message (ContactDetailsDialog.tsx)",
      "Não tem permissão para editar este contacto.",
    ],
    [
      "permission message (CustomVariablesManager.tsx)",
      "Sem permissão para reactivar variável",
    ],
    ["permission message (ExportAuditLog.tsx)", "Sem permissão para exportar"],
    ["session message", "Session expired"],
    [
      "file-size validation (ContractsDocumentsView.tsx)",
      "Ficheiro demasiado grande. O tamanho máximo permitido é 20 MB.",
    ],
    [
      "file-size validation with filename (SendQuoteDialog.tsx)",
      "orcamento-cliente.pdf excede 10 MB",
    ],
    [
      "success message carrying a legitimate customer email (SendProposalDialog.tsx)",
      "Email enviado para joao.cliente@exemplo.pt",
    ],
  ];

  it.each(legitimateMessages)("passes %s through byte-for-byte and does not report it", (_label, raw) => {
    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.text).toBe(raw);
    expect(result.wasSanitized).toBe(false);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("never strips an email that appears inside a legitimate (non-DB-error) message", () => {
    const raw = "Email enviado para joao.cliente@exemplo.pt";

    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.text).toContain("joao.cliente@exemplo.pt");
  });
});

describe("sanitizeDbErrorForDisplay — never breaks the toast", () => {
  it("returns the original text unchanged if reporting to Sentry throws", () => {
    captureFlowError.mockImplementation(() => {
      throw new Error("Sentry transport is down");
    });
    const raw = 'null value in column "entity_id" violates not-null constraint';

    // Recognition would normally replace this — but since the reporting side
    // effect blew up, the whole call must degrade to "show what we had".
    const result = sanitizeDbErrorForDisplay(raw);

    expect(result.text).toBe(raw);
    expect(result.wasSanitized).toBe(false);
  });

  it("handles an empty string without throwing", () => {
    expect(() => sanitizeDbErrorForDisplay("")).not.toThrow();
    expect(sanitizeDbErrorForDisplay("")).toEqual({ text: "", wasSanitized: false });
  });
});

/**
 * Proves the `sonner` wrapper (`src/lib/toast.ts`) closes channel B:
 *
 *  1. Raw DB text never reaches what sonner is asked to display, and is
 *     reported to Sentry.
 *  2. Legitimate messages — including ones containing an email address —
 *     survive byte for byte and are NOT reported.
 *  3. If the sanitizer throws, the toast still appears with the original text.
 *
 * `sonner` itself is mocked: the assertion is on the arguments handed to it,
 * which is exactly "what the user would see".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sonnerToast = Object.assign(vi.fn(() => "id-callable"), {
  success: vi.fn(() => "id-success"),
  error: vi.fn(() => "id-error"),
  info: vi.fn(() => "id-info"),
  warning: vi.fn(() => "id-warning"),
  message: vi.fn(() => "id-message"),
  loading: vi.fn(() => "id-loading"),
  dismiss: vi.fn(() => "id-dismiss"),
  promise: vi.fn(() => "id-promise"),
  custom: vi.fn(() => "id-custom"),
  getHistory: vi.fn(() => []),
  getToasts: vi.fn(() => []),
});

vi.mock("sonner", () => ({ toast: sonnerToast }));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

const { toast } = await import("@/lib/toast");

/** Entry points that accept user-facing text and must sanitize it. */
const SANITIZING_VARIANTS = ["error", "success", "info", "warning", "message", "loading"] as const;

/** Raw Postgres/PostgREST output, one signature per variant under test. */
const RAW_DB_MESSAGES = [
  'duplicate key value violates unique constraint "clients_email_key"',
  'null value in column "organization_id" violates not-null constraint',
  'new row violates row-level security policy for table "proposals"',
  'invalid input syntax for type uuid: "abc"',
  'relation "public.anew_users" does not exist',
  "permission denied for table contracts",
  "PGRST116",
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toast wrapper — raw database errors", () => {
  it.each(SANITIZING_VARIANTS)("toast.%s replaces a raw DB message and reports it", (variant) => {
    const raw = 'duplicate key value violates unique constraint "clients_email_key"';

    toast[variant](raw);

    const [shown] = sonnerToast[variant].mock.calls[0];
    expect(shown).not.toBe(raw);
    expect(shown).not.toContain("duplicate key");
    expect(shown).not.toContain("clients_email_key");
    expect(typeof shown).toBe("string");
    expect((shown as string).length).toBeGreaterThan(0);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    expect(captureFlowError.mock.calls[0][1]).toBe("db-error-leaked-to-ui");
  });

  it("the callable form toast(...) sanitizes too", () => {
    const raw = 'null value in column "organization_id" violates not-null constraint';

    toast(raw);

    const [shown] = sonnerToast.mock.calls[0];
    expect(shown).not.toContain("not-null constraint");
    expect(shown).not.toContain("organization_id");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it.each(RAW_DB_MESSAGES)("catches the signature in %j", (raw) => {
    toast.error(raw);

    const [shown] = sonnerToast.error.mock.calls[0];
    expect(shown).not.toBe(raw);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("sanitizes a raw DB message in the description option", () => {
    toast.error("Erro ao guardar", {
      description: 'duplicate key value violates unique constraint "deals_code_key"',
    });

    const [shown, data] = sonnerToast.error.mock.calls[0];
    expect(shown).toBe("Erro ao guardar");
    expect(data.description).not.toContain("duplicate key value");
    expect(data.description).not.toContain("deals_code_key");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});

describe("toast wrapper — legitimate messages pass through untouched", () => {
  const LEGITIMATE_MESSAGES = [
    "Enviado para joao@exemplo.pt",
    "Cliente criado com sucesso",
    "Cliente não encontrado",
    "Sem permissão para exportar",
    "O nome é obrigatório",
    "Proposta P-2024-0031 atualizada",
    "Ficheiro demasiado grande (máx. 5 MB)",
  ];

  it.each(LEGITIMATE_MESSAGES)("%j is shown byte for byte and not reported", (message) => {
    toast.success(message);

    expect(sonnerToast.success.mock.calls[0][0]).toBe(message);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it.each(SANITIZING_VARIANTS)("toast.%s passes a legitimate email message through", (variant) => {
    const message = "Enviado para joao@exemplo.pt";

    toast[variant](message);

    expect(sonnerToast[variant].mock.calls[0][0]).toBe(message);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("keeps the options object identical when nothing is sanitized", () => {
    const options = { description: "Enviado para joao@exemplo.pt", duration: 8000 };

    toast.info("Convite enviado", options);

    const [shown, data] = sonnerToast.info.mock.calls[0];
    expect(shown).toBe("Convite enviado");
    // Same reference: options carrying actions/JSX must never be cloned.
    expect(data).toBe(options);
    expect(data.duration).toBe(8000);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("does not touch non-string titles or descriptions", () => {
    const jsxLikeTitle = { $$typeof: Symbol.for("react.element") };
    const options = { description: jsxLikeTitle };

    toast(jsxLikeTitle as never, options as never);

    const [shown, data] = sonnerToast.mock.calls[0];
    expect(shown).toBe(jsxLikeTitle);
    expect(data).toBe(options);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("preserves call arity — no phantom `undefined` options argument", () => {
    // `sonner` behaves the same either way, but a wrapper that silently
    // changes arguments.length is not a drop-in replacement.
    toast.success("ok");
    expect(sonnerToast.success.mock.calls[0]).toHaveLength(1);

    toast("ok");
    expect(sonnerToast.mock.calls[0]).toHaveLength(1);

    toast.error("ko", { duration: 1000 });
    expect(sonnerToast.error.mock.calls[0]).toHaveLength(2);
  });

  it("forwards sonner's return value unchanged", () => {
    expect(toast.success("ok")).toBe("id-success");
    expect(toast("ok")).toBe("id-callable");
    expect(toast.loading("a carregar")).toBe("id-loading");
  });

  it("passes through the non-text API surface", () => {
    toast.dismiss("id-loading");
    expect(sonnerToast.dismiss).toHaveBeenCalledWith("id-loading");

    const promise = Promise.resolve(1);
    toast.promise(promise, { loading: "..." });
    expect(sonnerToast.promise).toHaveBeenCalledTimes(1);

    expect(typeof toast.custom).toBe("function");
    expect(typeof toast.getHistory).toBe("function");
    expect(typeof toast.getToasts).toBe("function");
  });
});

describe("toast wrapper — sanitizer failure must not lose the toast", () => {
  it("still shows the original text when the sanitizer throws", async () => {
    vi.resetModules();
    vi.doMock("@/utils/sanitizeDbErrorForDisplay", () => ({
      sanitizeDbErrorForDisplay: () => {
        throw new Error("boom");
      },
    }));

    const { toast: brittleToast } = await import("@/lib/toast");
    const raw = 'duplicate key value violates unique constraint "clients_email_key"';

    expect(() => brittleToast.error(raw, { description: raw })).not.toThrow();

    const [shown, data] = sonnerToast.error.mock.calls[0];
    expect(shown).toBe(raw);
    expect(data.description).toBe(raw);

    vi.doUnmock("@/utils/sanitizeDbErrorForDisplay");
    vi.resetModules();
  });
});

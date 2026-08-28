/**
 * End-to-end proof that the channel-B migration actually works in a real
 * migrated file, not just in the wrapper's own unit tests.
 *
 * `SupportAccessBanner` was one of the 70 files switched from
 * `import { toast } from "sonner"` to `import { toast } from "@/lib/toast"`.
 * Its revoke mutation does `toast.error(error.message)` with whatever the edge
 * function threw — the exact shape that used to hand raw Postgres text to the
 * user with nothing reported.
 *
 * `sonner` is mocked at the library boundary, so these assertions are on what
 * would actually be rendered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const sonnerError = vi.fn();
const sonnerSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: (...a: unknown[]) => sonnerError(...a),
    success: (...a: unknown[]) => sonnerSuccess(...a),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
    custom: vi.fn(),
  }),
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...a: unknown[]) => captureFlowError(...a),
}));

let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gt: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "access-1",
                      target_org_id: "org-1",
                      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
                      anew_organizations: { name: "Mudelar" },
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    }),
    functions: { invoke: () => Promise.resolve(invokeResult) },
  },
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isSystemAdmin: true }),
}));

const { SupportAccessBanner } = await import("@/components/platform/SupportAccessBanner");

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SupportAccessBanner />
    </QueryClientProvider>
  );
}

async function clickRevoke() {
  const button = await screen.findByRole("button", { name: /revogar/i });
  fireEvent.click(button);
}

beforeEach(() => {
  vi.clearAllMocks();
  invokeResult = { data: null, error: null };
});

describe("SupportAccessBanner — migrated to the sanitizing toast", () => {
  it("still renders and still calls sonner (behaviour unchanged)", async () => {
    renderBanner();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Mudelar/)).toBeInTheDocument();

    await clickRevoke();

    await waitFor(() => expect(sonnerSuccess).toHaveBeenCalledTimes(1));
    expect(sonnerSuccess).toHaveBeenCalledWith("Acesso de suporte revogado.");
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("does not show a raw database error to the user, and reports it", async () => {
    const raw = 'new row violates row-level security policy for table "support_access_log"';
    invokeResult = { data: null, error: new Error(raw) };

    renderBanner();
    await clickRevoke();

    await waitFor(() => expect(sonnerError).toHaveBeenCalledTimes(1));
    const [shown] = sonnerError.mock.calls[0];
    expect(shown).not.toBe(raw);
    expect(shown).not.toContain("row-level security");
    expect(shown).not.toContain("support_access_log");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    expect(captureFlowError.mock.calls[0][1]).toBe("db-error-leaked-to-ui");
  });

  it("shows a legitimate error message byte for byte and reports nothing", async () => {
    const legit = "Sessão expirada. Volte a iniciar sessão.";
    invokeResult = { data: null, error: new Error(legit) };

    renderBanner();
    await clickRevoke();

    await waitFor(() => expect(sonnerError).toHaveBeenCalledTimes(1));
    expect(sonnerError).toHaveBeenCalledWith(legit);
    expect(captureFlowError).not.toHaveBeenCalled();
  });
});

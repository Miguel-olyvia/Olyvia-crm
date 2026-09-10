/**
 * `loadResults()` had no try/catch at all: when the query failed, the error
 * reached neither the user nor any log, and the screen fell back to the empty
 * state. An outage (RLS change, network) was therefore indistinguishable from
 * "this organization has no contact results configured" — the worst possible
 * outcome, because an admin would then happily start recreating rows that
 * already exist.
 *
 * These tests lock down the two halves of the fix:
 *  1. the failure is visible to the user (error state + destructive toast) and
 *     the "no results configured" empty state is NOT shown;
 *  2. the failure is visible remotely, reported to Sentry tagged
 *     `lead-contact-results-load`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const captureException = vi.fn();
const toast = vi.fn();
let orderResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@sentry/react", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          order: () => Promise.resolve(orderResult),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1", name: "Mudelar" } }),
}));

// Keep the real translations (so the assertions are on text a user actually
// sees) but skip the provider.
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt", setLanguage: vi.fn() }),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/HelpButton", () => ({
  HelpButton: () => null,
}));

import LeadContactResults from "@/pages/LeadContactResults";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  captureException.mockReset();
  toast.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("LeadContactResults load failure", () => {
  it("shows an error state instead of the empty state when the query fails", async () => {
    orderResult = { data: null, error: { message: "permission denied for table lead_contact_results" } };

    render(<LeadContactResults />);

    await screen.findByText("Não foi possível carregar os resultados de contacto");
    expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    // The whole point: an outage must not look like "nothing configured".
    expect(screen.queryByText("Nenhum resultado configurado")).not.toBeInTheDocument();
  });

  it("tells the user with a destructive toast", async () => {
    orderResult = { data: null, error: { message: "permission denied" } };

    render(<LeadContactResults />);

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Erro ao carregar os resultados de contacto",
        variant: "destructive",
      }),
    );
  });

  it("reports the failure to Sentry tagged lead-contact-results-load", async () => {
    const dbError = { message: "permission denied" };
    orderResult = { data: null, error: dbError };

    render(<LeadContactResults />);

    await waitFor(() => expect(captureException).toHaveBeenCalled());

    // O erro do Supabase e um objecto simples, nao um Error. Passa-lo tal e
    // qual ao Sentry produzia o titulo inutil "Object captured as exception
    // with keys: code, details, hint, message", que esconde a causa real.
    // `captureFlowError` passou a embrulha-lo num Error a serio com a mesma
    // mensagem, e a guardar os campos estruturados num contexto proprio.
    const [erroEnviado, opcoes] = captureException.mock.calls[0];
    expect(erroEnviado).toBeInstanceOf(Error);
    expect((erroEnviado as Error).message).toBe(dbError.message);
    expect((erroEnviado as Error).name).toBe("SupabaseError");
    expect(opcoes).toMatchObject({ tags: { flow: "lead-contact-results-load" } });
    expect(opcoes).toHaveProperty("contexts.supabase");
  });

  it("still shows the plain empty state when the query genuinely returns nothing", async () => {
    orderResult = { data: [], error: null };

    render(<LeadContactResults />);

    await screen.findByText("Nenhum resultado configurado");
    expect(
      screen.queryByText("Não foi possível carregar os resultados de contacto"),
    ).not.toBeInTheDocument();
    expect(captureException).not.toHaveBeenCalled();
  });
});

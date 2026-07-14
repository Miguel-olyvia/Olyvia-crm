// @vitest-environment jsdom
/**
 * WelcomeOrgDialog — post-signup onboarding profile form.
 *
 * Covers:
 *  1. Renders all 4 fields with correct (accessible) labels when open.
 *  2. Invalid input (company name > 200 chars) blocks submit and surfaces a
 *     validation error instead of calling the RPC.
 *  3. Valid submission calls supabase.rpc('rpc_upsert_signup_profile', ...)
 *     with the correct p_-prefixed params, shows a success toast, and
 *     navigates to /organizations.
 *  4. Skipping ("Agora não") dismisses without saving or navigating.
 *  5. RPC failure shows an error toast and does NOT navigate away, so the
 *     user can retry.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { LanguageProvider } from "@/contexts/LanguageContext";
import { WelcomeOrgDialog } from "../WelcomeOrgDialog";

// ---- Mocks (hoisted so they exist before the vi.mock factories run) ----
const h = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const getSessionMock = vi.fn();
  const toastMock = vi.fn();
  const navigateMock = vi.fn();
  return { rpcMock, getSessionMock, toastMock, navigateMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSessionMock(...a),
    },
    rpc: (...a: unknown[]) => h.rpcMock(...a),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: h.toastMock }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => h.navigateMock,
  };
});

// Radix Select relies on pointer-capture / scroll APIs that jsdom does not
// implement. Polyfill them locally (this file only) so option selection
// works in tests without affecting the rest of the suite.
beforeAll(() => {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false;
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = () => {};
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
  if (!(global as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function renderDialog(onClose = vi.fn()) {
  render(
    <LanguageProvider>
      <WelcomeOrgDialog open onClose={onClose} />
    </LanguageProvider>,
  );
  return { onClose };
}

async function selectOption(labelText: string, optionText: string) {
  const trigger = screen.getByLabelText(labelText);
  fireEvent.click(trigger);
  const option = await screen.findByRole("option", { name: optionText });
  fireEvent.click(option);
}

beforeEach(() => {
  h.rpcMock.mockReset();
  h.getSessionMock.mockReset();
  h.toastMock.mockReset();
  h.navigateMock.mockReset();
  h.getSessionMock.mockResolvedValue({ data: { session: null } });
  h.rpcMock.mockResolvedValue({ error: null });
});

describe("WelcomeOrgDialog", () => {
  it("renders all 4 onboarding fields with their labels when open", () => {
    renderDialog();

    expect(screen.getByLabelText("Company name")).toBeTruthy();
    expect(screen.getByLabelText("Industry")).toBeTruthy();
    expect(screen.getByLabelText("Company size")).toBeTruthy();
    expect(screen.getByLabelText("Your job title")).toBeTruthy();
  });

  it("shows a validation error and does not call the RPC when company name exceeds 200 characters", async () => {
    renderDialog();

    const companyNameInput = screen.getByLabelText("Company name");
    fireEvent.change(companyNameInput, { target: { value: "a".repeat(201) } });

    fireEvent.click(screen.getByRole("button", { name: "Register My Company" }));

    expect(
      await screen.findByText("O nome da empresa deve ter entre 1 e 200 caracteres"),
    ).toBeTruthy();
    expect(h.rpcMock).not.toHaveBeenCalled();
    expect(h.navigateMock).not.toHaveBeenCalled();
  });

  it("submits valid data, calls the RPC with correct p_ params, shows a success toast, and navigates", async () => {
    const { onClose } = renderDialog();

    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Acme Corp" },
    });
    await selectOption("Industry", "Technology");
    await selectOption("Company size", "11 – 50 employees");
    fireEvent.change(screen.getByLabelText("Your job title"), {
      target: { value: "Manager" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Register My Company" }));

    await waitFor(() => expect(h.rpcMock).toHaveBeenCalledTimes(1));
    expect(h.rpcMock).toHaveBeenCalledWith("rpc_upsert_signup_profile", {
      p_company_name: "Acme Corp",
      p_industry: "technology",
      p_employee_count_range: "11-50",
      p_job_title: "Manager",
      p_signup_source: "direct",
    });

    await waitFor(() =>
      expect(h.toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Profile saved!" }),
      ),
    );
    expect(h.toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );

    await waitFor(() => expect(h.navigateMock).toHaveBeenCalledWith("/organizations"));
    expect(onClose).toHaveBeenCalled();
  });

  it("dismisses without saving or navigating when the skip button is clicked", async () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.rpcMock).not.toHaveBeenCalled();
    expect(h.navigateMock).not.toHaveBeenCalled();
  });

  it("shows an error toast and does not navigate away when the RPC call fails", async () => {
    h.rpcMock.mockResolvedValue({ error: { message: "boom" } });
    const { onClose } = renderDialog();

    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Acme Corp" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Register My Company" }));

    await waitFor(() =>
      expect(h.toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not save profile",
          variant: "destructive",
        }),
      ),
    );

    expect(h.navigateMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

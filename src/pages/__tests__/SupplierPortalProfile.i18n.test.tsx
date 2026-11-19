import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// «Os meus dados» do portal do fornecedor nos dois idiomas: título, descrição, cartão, data da confirmação
// (dd/mm/aaaa hh:mm nos dois idiomas), carregar, erro e o toast de gravação. O formulário e o telemóvel têm os seus testes.

const toast = vi.fn();
const spUpdate = vi.fn();
let dadosDoHook: Record<string, unknown> = {};

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ refresh: vi.fn(), markProfileConfirmed: vi.fn() }),
}));
vi.mock("@/components/supplier-portal/useSpMySupplierData", () => ({ useSpMySupplierData: () => dadosDoHook }));
vi.mock("@/components/supplier-portal/contract/SpMyPhoneCard", () => ({ SpMyPhoneCard: () => null }));
vi.mock("@/components/supplier-portal/SupplierDataForm", () => ({
  SupplierDataForm: ({ submitLabel, onSaved }: { submitLabel: string; onSaved: (r: { updated_count: number }) => void }) => (
    <button type="button" onClick={() => onSaved({ updated_count: 2 })}>
      {submitLabel}
    </button>
  ),
}));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spUpdateMySupplierData: (...a: unknown[]) => spUpdate(...a),
}));

import SupplierPortalProfile from "../SupplierPortalProfile";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const DADOS = {
  can_edit: true,
  confirmed_at: "2026-03-05T14:30:00",
  companies: [],
  data: { name: "Fornecedor", tax_id: "500000000" },
};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  toast.mockReset();
  spUpdate.mockReset();
  dadosDoHook = { data: DADOS, error: null, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), invalidate: vi.fn() };
});

describe("SupplierPortalProfile", () => {
  it("português: textos e data como sempre", () => {
    render(<SupplierPortalProfile />);
    expect(screen.getByRole("heading", { name: "Os meus dados" })).toBeInTheDocument();
    expect(
      screen.getByText("Dados da sua empresa usados pelas empresas com que trabalha (encomendas, contactos e faturação)."),
    ).toBeInTheDocument();
    expect(screen.getByText("Dados da empresa")).toBeInTheDocument();
    expect(screen.getByText("Dados confirmados em 05/03/2026 14:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("inglês: textos em inglês; a data continua dd/mm/aaaa hh:mm", () => {
    definirIdioma("en");
    const { container } = render(<SupplierPortalProfile />);
    expect(screen.getByRole("heading", { name: "My details" })).toBeInTheDocument();
    expect(
      screen.getByText("Your company details, used by the companies you work with (orders, contacts and invoicing)."),
    ).toBeInTheDocument();
    expect(screen.getByText("Company details")).toBeInTheDocument();
    expect(screen.getByText("Details confirmed on 05/03/2026 14:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Os meus dados|empresa|Guardar|confirmados/);
  });

  it("toast de gravação: uma empresa e várias, nos dois idiomas", async () => {
    render(<SupplierPortalProfile />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(toast).toHaveBeenCalledWith({ title: "Dados guardados", description: "Atualizados em 2 empresas." });
    toast.mockReset();
    act(() => definirIdioma("en"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(toast).toHaveBeenCalledWith({ title: "Details saved", description: "Updated for 2 companies." });
  });

  it("a carregar e erro", () => {
    definirIdioma("en");
    dadosDoHook = { ...dadosDoHook, data: undefined, isLoading: true };
    const { unmount } = render(<SupplierPortalProfile />);
    expect(screen.getByText("Loading your details…")).toBeInTheDocument();
    unmount();
    dadosDoHook = { ...dadosDoHook, isLoading: false, isError: true, error: new Error("Falha do servidor") };
    render(<SupplierPortalProfile />);
    expect(screen.getByText("Falha do servidor")).toBeInTheDocument(); // a mensagem do servidor fica como vem
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("muda ao vivo", async () => {
    render(<SupplierPortalProfile />);
    expect(screen.getByRole("heading", { name: "Os meus dados" })).toBeInTheDocument();
    act(() => definirIdioma("en"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "My details" })).toBeInTheDocument());
  });
});

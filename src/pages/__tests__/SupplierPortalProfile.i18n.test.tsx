// «Os meus dados» do portal do fornecedor: título, estado, data da confirmação e toasts no idioma do portal.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const spUpdate = vi.fn();
let estado: Record<string, unknown> = {};

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
// O PhoneInput é do CRM (usa o idioma global do CRM): aqui só interessa o rótulo que o portal lhe passa.
vi.mock("@/components/PhoneInput", () => ({
  PhoneInput: ({ label }: { label?: string }) => <div>{label}</div>,
}));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ refresh: vi.fn(), markProfileConfirmed: vi.fn() }),
}));
vi.mock("@/components/supplier-portal/useSpMySupplierData", () => ({
  useSpMySupplierData: () => estado,
}));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spUpdateMySupplierData: (...a: unknown[]) => spUpdate(...a),
}));

import SupplierPortalProfile from "../SupplierPortalProfile";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";
import { SupplierPortalRpcError } from "@/lib/supplierPortal/spRpc";

const DADOS = {
  can_edit: true,
  confirmed_at: "2026-03-05T14:30:00",
  companies: [{ organization_id: "o1", name: "Alfa" }],
  data: {
    name: "Fornecedor Exemplo",
    contact_person: "Ana",
    email: "geral@fornecedor.pt",
    phone: "912 345 678",
    phone_country_code: "+351",
    tax_id: "500000000",
    address: "Rua 1",
    city: "Lisboa",
    postal_code: "1000-001",
    country: "Portugal",
    website: "https://fornecedor.pt",
  },
};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  toast.mockReset();
  spUpdate.mockReset();
  estado = { data: DADOS, error: null, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), invalidate: vi.fn() };
});
afterEach(() => vi.clearAllMocks());

describe("Perfil em português", () => {
  it("textos e data da confirmação como sempre", () => {
    render(<SupplierPortalProfile />);
    expect(screen.getByRole("heading", { name: "Os meus dados" })).toBeInTheDocument();
    expect(screen.getByText("Dados da empresa")).toBeInTheDocument();
    expect(screen.getByText("Dados confirmados em 05/03/2026 14:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("a carregar e erro: textos de sempre", () => {
    estado = { ...estado, data: undefined, isLoading: true };
    const { unmount } = render(<SupplierPortalProfile />);
    expect(screen.getByText("A carregar os dados…")).toBeInTheDocument();
    unmount();
    estado = { ...estado, isLoading: false, isError: true, error: new Error("boom") };
    render(<SupplierPortalProfile />);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});

describe("Perfil em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("título, descrição, cartão, data e botão em inglês", () => {
    const { container } = render(<SupplierPortalProfile />);
    expect(screen.getByRole("heading", { name: "My details" })).toBeInTheDocument();
    expect(screen.getByText("Your company details, used by the companies you work with (orders, contacts and invoicing).")).toBeInTheDocument();
    expect(screen.getByText("Company details")).toBeInTheDocument();
    expect(screen.getByText("Details confirmed on 05/03/2026 14:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Dados|empresa|Guardar|Morada/);
  });

  it("a carregar e erro em inglês", () => {
    estado = { ...estado, data: undefined, isLoading: true };
    const { unmount } = render(<SupplierPortalProfile />);
    expect(screen.getByText("Loading your details…")).toBeInTheDocument();
    unmount();
    estado = { ...estado, isLoading: false, isError: true, error: new Error("boom") };
    render(<SupplierPortalProfile />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("função ainda indisponível: texto próprio em inglês e sem botão de repetir", () => {
    estado = { ...estado, data: undefined, isError: true, error: new SupplierPortalRpcError({ code: "42883", message: "x" }) };
    render(<SupplierPortalProfile />);
    expect(screen.getByText("This feature is not available yet. Please try again later.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("guardar: toast em inglês, singular e plural", async () => {
    spUpdate.mockResolvedValue({ ok: true, updated_count: 1, confirmed_at: "x" });
    render(<SupplierPortalProfile />);
    fireEvent.change(screen.getByLabelText(/Contact person/), { target: { value: "Bruno" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Details saved", description: "Your company details are up to date." });

    toast.mockReset();
    spUpdate.mockResolvedValue({ ok: true, updated_count: 3, confirmed_at: "x" });
    fireEvent.change(screen.getByLabelText(/Contact person/), { target: { value: "Carla" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Details saved", description: "Updated for 3 companies." });
  });

  it("muda ao vivo", () => {
    render(<SupplierPortalProfile />);
    act(() => definirIdioma("pt"));
    expect(screen.getByRole("heading", { name: "Os meus dados" })).toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const invoke = vi.fn();

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: (table: string) =>
      table === "client_contracts"
        ? chain({ data: { id: "c1", status: "pending", organization_id: "o1", title: "Contrato", contract_number: "C-1", total_value: 1000, start_date: "2026-03-05" } })
        : chain({ data: [] }),
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/contracts/contractDocument", () => ({
  injectSignaturesIntoBlock: (html: string) => html,
  resolveContractDocument: vi.fn(),
  downloadContractDocumentPdf: vi.fn(),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import ClientPortalContractDetail from "../ClientPortalContractDetail";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/contratos/c1"]}>
      <Routes>
        <Route path="/contratos/:id" element={<ClientPortalContractDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClientPortalContractDetail - idioma do portal", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => {
    act(() => definirIdioma("pt"));
  });

  it("em português mostra os textos de sempre (estado, datas e botões)", async () => {
    renderPage();
    expect(await screen.findByText("Contrato aguarda a sua decisão")).toBeTruthy();
    expect(screen.getByText(/A aguardar decisão/)).toBeTruthy();
    expect(screen.getByText("05/03/2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aceitar e Assinar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voltar/ })).toBeTruthy();
  });

  it("em inglês traduz as palavras e mantém o dinheiro e a data numérica", async () => {
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("Contract awaiting your decision")).toBeTruthy();
    expect(screen.getByText(/Awaiting decision/)).toBeTruthy();
    expect(screen.getByText("05/03/2026")).toBeTruthy();
    expect(screen.getByText("€1.000,00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept and Sign" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
    expect(screen.queryByText("Contrato aguarda a sua decisão")).toBeNull();
  });

  it("o erro guardado em estado muda de idioma com a página (a chave guarda-se, o texto traduz-se ao mostrar)", async () => {
    act(() => definirIdioma("en"));
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "no_phone", message: "sem telefone" }, error: null } : { data: null, error: null });
    renderPage();
    const enviar = await screen.findByRole("button", { name: /Send SMS code/ });
    await act(async () => { fireEvent.click(enviar); });
    await act(async () => { fireEvent.click(screen.getByRole("checkbox", { name: /I have read the contract/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Sign and receive the code/ })); });

    expect(await screen.findByText(/No phone number was found linked to your account/)).toBeTruthy();
    act(() => definirIdioma("pt"));
    expect(await screen.findByText(/Não foi encontrado um número de telefone/)).toBeTruthy();
  });
});

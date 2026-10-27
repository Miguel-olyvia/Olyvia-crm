// @vitest-environment jsdom
// "Novo fornecedor" = convite ao portal (NovoFornecedorDialogo do Olyvia 2.0).
// A criação e o convite são simulados; o convite é o mesmo do separador Portal
// (invokePortalAccess → create-supplier-portal-access).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => "bu-1") }));

const insertSingle = vi.fn();
vi.mock("@/utils/auditContext", () => ({
  withAuditContext: vi.fn(async (_c: unknown, _u: string, fn: () => PromiseLike<unknown>) => fn()),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn((row: unknown) => ({ select: vi.fn(() => ({ single: () => insertSingle(row) })) })),
    })),
  },
}));

const invokePortalAccess = vi.fn();
vi.mock("@/components/supplier-portal-crm/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/supplier-portal-crm/types")>();
  return { ...actual, invokePortalAccess: (body: Record<string, unknown>) => invokePortalAccess(body) };
});

const sonner = { success: vi.fn(), warning: vi.fn() };
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => sonner.success(...a), warning: (...a: unknown[]) => sonner.warning(...a) } }));
const toastFn = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastFn }) }));

import { NewSupplierDialog } from "../NewSupplierDialog";
import { supplierNifKey, validateNewSupplier } from "../newSupplier";

const VALID_NIF = "501964843"; // dígito de controlo válido

function setup(over: Partial<React.ComponentProps<typeof NewSupplierDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    organizations: [{ id: "org-1", name: "BM Lar" }],
    defaultOrganizationId: "org-1",
    canInvite: true,
    onSupplierCreated: vi.fn(),
    onOpenSupplier: vi.fn(),
    onDraft: vi.fn(),
    ...over,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NewSupplierDialog {...props} />
    </QueryClientProvider>,
  );
  return props;
}

const fill = (v: { name?: string; nif?: string; email?: string; contact?: string }) => {
  if (v.name !== undefined) fireEvent.change(screen.getByLabelText(/Nome do fornecedor/), { target: { value: v.name } });
  if (v.nif !== undefined) fireEvent.change(screen.getByLabelText(/^NIF/), { target: { value: v.nif } });
  if (v.email !== undefined) fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: v.email } });
  if (v.contact !== undefined) fireEvent.change(screen.getByLabelText(/Nome do contacto/), { target: { value: v.contact } });
};

const inviteBtn = () => screen.getByRole("button", { name: /Criar e enviar acesso ao portal/ });

beforeEach(() => {
  insertSingle.mockReset();
  invokePortalAccess.mockReset();
  sonner.success.mockReset();
  sonner.warning.mockReset();
  toastFn.mockReset();
});

describe("supplierNifKey — a regra da BD (fn_nif_key)", () => {
  it("NIF português com dígito de controlo", () => {
    expect(supplierNifKey(VALID_NIF)).toBe(`PT${VALID_NIF}`);
    expect(supplierNifKey("501 964 843")).toBe(`PT${VALID_NIF}`);
    expect(supplierNifKey("501964844")).toBeNull();
    expect(supplierNifKey("012345678")).toBeNull();
  });
  it("estrangeiro da UE com prefixo; fora da UE ou vazio → inválido", () => {
    expect(supplierNifKey("esb12345678")).toBe("ESB12345678");
    expect(supplierNifKey("GR123456789")).toBe("EL123456789");
    expect(supplierNifKey("US123456789")).toBeNull();
    expect(supplierNifKey("")).toBeNull();
    expect(supplierNifKey(`PT${VALID_NIF}`)).toBe(`PT${VALID_NIF}`);
    expect(supplierNifKey("PT501964844")).toBeNull();
  });
  it("convidar exige NIF válido, email e contacto; sem portal só empresa e nome", () => {
    const base = { organizationId: "o", name: "X", taxId: "", email: "", contactName: "" };
    expect(Object.keys(validateNewSupplier(base, true)).sort()).toEqual(["contactName", "email", "taxId"]);
    expect(validateNewSupplier(base, false)).toEqual({});
    expect(validateNewSupplier({ ...base, name: " " }, false).name).toBeTruthy();
    expect(validateNewSupplier({ ...base, email: "x@" }, false).email).toBeTruthy();
  });
});

describe("NewSupplierDialog", () => {
  it("mostra os campos e as três ações do 2.0", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Novo fornecedor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Criar sem portal (preencho eu)" })).toBeTruthy();
    expect(inviteBtn()).toBeTruthy();
    expect(screen.getByText("Recebe o convite e fica como primeiro utilizador.")).toBeTruthy();
  });

  it("NIF válido mostra o visto", () => {
    setup();
    fill({ nif: VALID_NIF });
    expect(screen.getByText("NIF válido")).toBeTruthy();
  });

  it("convidar com campos em falta não grava nada e assinala os erros", async () => {
    setup();
    fill({ name: "Alfa", nif: "123456780" });
    fireEvent.click(inviteBtn());
    await screen.findByText(/NIF inválido/);
    expect(screen.getByText("O email é obrigatório para convidar.")).toBeTruthy();
    expect(insertSingle).not.toHaveBeenCalled();
    expect(invokePortalAccess).not.toHaveBeenCalled();
  });

  it("criar e enviar: grava, convida pelo caminho do separador Portal e abre a ficha", async () => {
    insertSingle.mockResolvedValue({ data: { id: "sup-1", name: "Alfa" }, error: null });
    invokePortalAccess.mockResolvedValue({ data: { success: true, message: "Convite enviado", smtp_status: "sent" }, error: null });
    const p = setup();
    fill({ name: "Alfa", nif: VALID_NIF, email: "Compras@Alfa.pt", contact: "Ana" });
    fireEvent.click(inviteBtn());
    await waitFor(() => expect(p.onOpenSupplier).toHaveBeenCalledWith("sup-1"));
    expect(insertSingle).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alfa",
        tax_id: VALID_NIF,
        email: "compras@alfa.pt",
        contact_person: "Ana",
        organization_id: "org-1",
        is_active: true,
        created_by: "bu-1",
      }),
    );
    expect(invokePortalAccess).toHaveBeenCalledWith({
      action: "invite",
      organization_id: "org-1",
      supplier_id: "sup-1",
      email: "compras@alfa.pt",
      name: "Ana",
    });
    expect(p.onSupplierCreated).toHaveBeenCalledWith("sup-1");
    expect(sonner.success).toHaveBeenCalledWith("Acesso enviado para compras@alfa.pt.", expect.anything());
  });

  it("convite falha: o fornecedor fica criado, mostra o erro e deixa tentar de novo com outro email", async () => {
    insertSingle.mockResolvedValue({ data: { id: "sup-2", name: "Beta" }, error: null });
    invokePortalAccess.mockResolvedValueOnce({ data: null, error: { error: "email_not_allowed", message: "x" } });
    const p = setup();
    fill({ name: "Beta", nif: VALID_NIF, email: "interno@bmlar.pt", contact: "Rui" });
    fireEvent.click(inviteBtn());

    await screen.findByText(/Beta foi criado, mas o acesso ao portal não foi enviado/);
    expect(p.onSupplierCreated).toHaveBeenCalledWith("sup-2");
    expect(p.onOpenSupplier).not.toHaveBeenCalled();
    // Já gravado: nome e NIF bloqueados; email editável.
    expect((screen.getByLabelText(/Nome do fornecedor/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^NIF/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).disabled).toBe(false);

    invokePortalAccess.mockResolvedValueOnce({ data: { success: true, message: "Convite enviado", smtp_status: "sent" }, error: null });
    fill({ email: "geral@beta.pt" });
    fireEvent.click(screen.getByRole("button", { name: /Tentar enviar de novo/ }));
    await waitFor(() => expect(p.onOpenSupplier).toHaveBeenCalledWith("sup-2"));
    expect(insertSingle).toHaveBeenCalledTimes(1);
    expect(invokePortalAccess).toHaveBeenLastCalledWith(expect.objectContaining({ supplier_id: "sup-2", email: "geral@beta.pt" }));
  });

  it("convite falha: \"Abrir ficha\" abre o fornecedor criado", async () => {
    insertSingle.mockResolvedValue({ data: { id: "sup-3", name: "Gama" }, error: null });
    invokePortalAccess.mockResolvedValue({ data: null, error: { error: "rate_limited", message: "", retry_after_seconds: 120 } });
    const p = setup();
    fill({ name: "Gama", nif: VALID_NIF, email: "a@gama.pt", contact: "Eva" });
    fireEvent.click(inviteBtn());
    await screen.findByText(/Tenta de novo dentro de 2 minuto/);
    fireEvent.click(screen.getByRole("button", { name: "Abrir ficha" }));
    expect(p.onOpenSupplier).toHaveBeenCalledWith("sup-3");
  });

  it("email não enviado (SMTP): fornecedor criado, aviso e ficha aberta", async () => {
    insertSingle.mockResolvedValue({ data: { id: "sup-4", name: "Delta" }, error: null });
    invokePortalAccess.mockResolvedValue({
      data: { success: true, message: "Acesso registado", smtp_status: "send_failed", smtp_warning: true, smtp_error_safe: "SMTP" },
      error: null,
    });
    const p = setup();
    fill({ name: "Delta", nif: VALID_NIF, email: "a@delta.pt", contact: "Rita" });
    fireEvent.click(inviteBtn());
    await waitFor(() => expect(p.onOpenSupplier).toHaveBeenCalledWith("sup-4"));
    expect(sonner.warning).toHaveBeenCalled();
  });

  it("falha a criar: não convida nem abre nada", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const p = setup();
    fill({ name: "Épsilon", nif: VALID_NIF, email: "a@eps.pt", contact: "Zé" });
    fireEvent.click(inviteBtn());
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: "Fornecedor não criado" })));
    expect(invokePortalAccess).not.toHaveBeenCalled();
    expect(p.onSupplierCreated).not.toHaveBeenCalled();
    expect(p.onOpenSupplier).not.toHaveBeenCalled();
  });

  it("criar sem portal: não grava e passa o rascunho à ficha", () => {
    const p = setup();
    fill({ name: "Zeta", nif: "123", email: "z@zeta.pt", contact: "Lia" });
    fireEvent.click(screen.getByRole("button", { name: "Criar sem portal (preencho eu)" }));
    expect(p.onDraft).toHaveBeenCalledWith({ organizationId: "org-1", name: "Zeta", taxId: "123", email: "z@zeta.pt", contactName: "Lia" });
    expect(insertSingle).not.toHaveBeenCalled();
    expect(invokePortalAccess).not.toHaveBeenCalled();
  });

  it("sem suppliers.portal_manage: convidar desativado com o motivo; sem portal continua", () => {
    const p = setup({ canInvite: false });
    expect((inviteBtn() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/requer suppliers\.portal_manage/)).toBeTruthy();
    fill({ name: "Eta" });
    fireEvent.click(screen.getByRole("button", { name: "Criar sem portal (preencho eu)" }));
    expect(p.onDraft).toHaveBeenCalled();
  });
});

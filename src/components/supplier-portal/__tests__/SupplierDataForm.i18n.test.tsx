// Formulário dos dados da empresa, o passo «Confirme os seus dados» e a definição da password do primeiro acesso:
// textos, placeholders, validações e toasts no idioma do portal. Em português ficam como sempre.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const spUpdate = vi.fn();
const updateUser = vi.fn();
const spMarkPasswordChanged = vi.fn();
const signOut = vi.fn();
let dadosDoHook: Record<string, unknown> = {};
let telemovelDisponivel = false;

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), auth: { updateUser: (...a: unknown[]) => updateUser(...a), signOut: (...a: unknown[]) => signOut(...a) } },
}));
vi.mock("@/components/PhoneInput", () => ({
  PhoneInput: ({
    label,
    placeholder,
    labels,
  }: {
    label?: string;
    placeholder?: string;
    labels?: { pesquisar: string; numeroCompleto: string; indicativo: string; telefone: string; nomesDosPaises?: (n: string) => string };
  }) => (
    <div
      data-testid="phone"
      data-placeholder={placeholder ?? ""}
      data-pesquisar={labels?.pesquisar ?? ""}
      data-numero-completo={labels?.numeroCompleto ?? ""}
      data-indicativo={labels?.indicativo ?? ""}
      data-telefone={labels?.telefone ?? ""}
      data-pais={labels?.nomesDosPaises?.("Portugal") ?? ""}
      data-pais-es={labels?.nomesDosPaises?.("Spain") ?? ""}
    >
      {label}
    </div>
  ),
}));
vi.mock("@/contexts/SupplierPortalContext", () => ({
  useSupplierPortal: () => ({ refresh: vi.fn(), markProfileConfirmed: vi.fn() }),
}));
// O telemóvel pessoal (só no RH): o campo vem de useSpMobileInput, que precisa de React Query; aqui é simulado.
vi.mock("@/components/supplier-portal/contract/useSpMobileInput", () => ({
  useSpMobileInput: () => ({
    value: "",
    setValue: vi.fn(),
    error: null,
    save: async () => true,
    available: telemovelDisponivel,
    loading: false,
    saved: null,
  }),
}));
vi.mock("@/components/supplier-portal/useSpMySupplierData", () => ({ useSpMySupplierData: () => dadosDoHook }));
vi.mock("@/lib/supplierPortal/spRpc", async (original) => ({
  ...(await original<typeof import("@/lib/supplierPortal/spRpc")>()),
  spUpdateMySupplierData: (...a: unknown[]) => spUpdate(...a),
  spMarkPasswordChanged: (...a: unknown[]) => spMarkPasswordChanged(...a),
}));

import { SupplierDataForm } from "../SupplierDataForm";
import { SupplierConfirmDataModal } from "../SupplierConfirmDataModal";
import { SupplierFirstLoginModal } from "../SupplierFirstLoginModal";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";
import { traduzir } from "@/portal-i18n/traduzir";

const DADOS = {
  can_edit: true,
  confirmed_at: null,
  companies: [
    { organization_id: "o1", name: "Alfa" },
    { organization_id: "o2", name: "Beta" },
  ],
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
const VAZIOS = { ...DADOS, data: { ...DADOS.data, email: null, postal_code: null, country: null, website: null } };

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  telemovelDisponivel = false;
  toast.mockReset();
  spUpdate.mockReset();
  updateUser.mockReset();
  spMarkPasswordChanged.mockReset();
  signOut.mockReset();
  dadosDoHook = { data: DADOS, error: null, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), invalidate: vi.fn() };
});

const form = (initial = DADOS, extra: Partial<React.ComponentProps<typeof SupplierDataForm>> = {}) =>
  render(<SupplierDataForm initial={initial} idPrefix="t" submitLabel="Guardar" onSaved={vi.fn()} {...extra} />);

describe("SupplierDataForm em português", () => {
  it("rótulos, placeholders e avisos como sempre", () => {
    form(VAZIOS);
    expect(screen.getByLabelText(/Nome da empresa/)).toBeInTheDocument();
    expect(screen.getByText("NIF")).toBeInTheDocument();
    expect(screen.getByText("Para alterar o NIF contacte a empresa.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "geral@empresa.pt");
    expect(screen.getByLabelText("Código postal")).toHaveAttribute("placeholder", "0000-000");
    expect(screen.getByLabelText("País")).toHaveAttribute("placeholder", "Portugal");
    expect(screen.getByLabelText("Website")).toHaveAttribute("placeholder", "www.empresa.pt");
    expect(screen.getByLabelText("Cidade")).toBeInTheDocument();
    expect(screen.getByText("Morada", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByText("Empresa e contacto")).toBeInTheDocument();
    expect(screen.getByTestId("phone")).toHaveTextContent("Telefone");
    expect(screen.getByText("Estes dados ficam atualizados em todas as empresas com que trabalha: Alfa, Beta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("só de leitura", () => {
    form({ ...DADOS, can_edit: false });
    expect(screen.getByText("Só o utilizador principal da conta pode alterar estes dados.")).toBeInTheDocument();
  });

  it("validação: toast e erro de campo como sempre", () => {
    form();
    fireEvent.change(screen.getByLabelText(/Nome da empresa/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(toast).toHaveBeenCalledWith({ title: "Verifique os dados", description: "O nome da empresa é obrigatório.", variant: "destructive" });
    expect(screen.getAllByText("O nome da empresa é obrigatório.").length).toBeGreaterThan(0);
  });
});

describe("SupplierDataForm em inglês", () => {
  beforeEach(() => definirIdioma("en"));

  it("rótulos, placeholders e avisos em inglês, sem os de Portugal", () => {
    const { container } = form(VAZIOS, { submitLabel: "Save" });
    expect(screen.getByLabelText(/Company name/)).toBeInTheDocument();
    expect(screen.getByText("Tax ID (NIF)")).toBeInTheDocument();
    expect(screen.getByText("To change your tax ID (NIF), contact the company you work with.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact person")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", "info@company.com");
    expect(screen.getByLabelText("Postal code")).toHaveAttribute("placeholder", "0000-000");
    expect(screen.getByLabelText("Country")).toHaveAttribute("placeholder", "Portugal");
    expect(screen.getByLabelText("Website")).toHaveAttribute("placeholder", "www.company.com");
    expect(screen.getByLabelText("City")).toBeInTheDocument();
    expect(screen.getByText("Address", { selector: "legend" })).toBeInTheDocument();
    expect(screen.getByText("Company and contact")).toBeInTheDocument();
    expect(screen.getByTestId("phone")).toHaveTextContent("Phone");
    expect(screen.getByText("This information will be updated for every company you work with: Alfa, Beta")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/empresa|Morada|Telefone|Cidade|Guardar|País/);
  });

  it("só de leitura", () => {
    form({ ...DADOS, can_edit: false });
    expect(screen.getByText("Only the account's main user can change this information.")).toBeInTheDocument();
  });

  it("validação: toast e erro de campo em inglês", () => {
    form();
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(toast).toHaveBeenCalledWith({ title: "Please check your details", description: "The company name is required.", variant: "destructive" });
    expect(screen.getAllByText("The company name is required.").length).toBeGreaterThan(0);
  });

  it("falha ao gravar: título do toast em inglês (a mensagem do servidor fica como vem)", async () => {
    spUpdate.mockRejectedValue(new Error("Erro do servidor"));
    form();
    fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Bruno" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Could not save", variant: "destructive" });
  });

  it("a gravar: «Saving…»", async () => {
    spUpdate.mockReturnValue(new Promise(() => {}));
    form();
    fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Bruno" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });
});

describe("A5: o campo do telefone recebe os textos do portal", () => {
  it("pt -> en: indicativo, pesquisa, nota, nome do campo e nomes dos países", () => {
    form();
    const telefone = screen.getByTestId("phone");
    expect(telefone.getAttribute("data-indicativo")).toBe("Indicativo do país");
    expect(telefone.getAttribute("data-pesquisar")).toBe("Pesquisar país...");
    expect(telefone.getAttribute("data-numero-completo")).toBe("Número completo");
    expect(telefone.getAttribute("data-telefone")).toBe("Número de telefone");
    expect(telefone.getAttribute("data-pais-es")).toBe("Espanha");
    act(() => definirIdioma("en"));
    const en = screen.getByTestId("phone");
    expect(en.getAttribute("data-indicativo")).toBe("Country code");
    expect(en.getAttribute("data-pesquisar")).toBe("Search country...");
    expect(en.getAttribute("data-numero-completo")).toBe("Full number");
    expect(en.getAttribute("data-telefone")).toBe("Phone number");
    expect(en.getAttribute("data-pais-es")).toBe("Spain");
  });
});

describe("R3: o erro de campo visível acompanha o idioma quando este muda", () => {
  it("nome em falta e texto demasiado longo (com parâmetro): pt -> en -> pt", () => {
    form();
    fireEvent.change(screen.getByLabelText(/Nome da empresa/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Cidade"), { target: { value: "x".repeat(300) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const nomePt = traduzir("pt", "sp.dados.erro.nomeObrigatorio");
    const nomeEn = traduzir("en", "sp.dados.erro.nomeObrigatorio");
    expect(nomePt).not.toBe(nomeEn);
    expect(screen.getAllByText(nomePt).length).toBeGreaterThan(0);
    act(() => definirIdioma("en"));
    expect(screen.getAllByText(nomeEn).length).toBeGreaterThan(0);
    expect(screen.queryByText(nomePt)).toBeNull();
    act(() => definirIdioma("pt"));
    expect(screen.getAllByText(nomePt).length).toBeGreaterThan(0);
  });

  it("o erro do campo de telefone também segue o idioma", () => {
    form({ ...DADOS, data: { ...DADOS.data, phone: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const pt = traduzir("pt", "sp.dados.erro.telefoneInvalido");
    expect(screen.getAllByText(pt).length).toBeGreaterThan(0);
    act(() => definirIdioma("en"));
    expect(screen.getAllByText(traduzir("en", "sp.dados.erro.telefoneInvalido")).length).toBeGreaterThan(0);
  });
});

describe("A2: os modais obrigatórios do fornecedor têm o seletor de idioma lá dentro", () => {
  it("passo «Confirme os seus dados»: mudar de idioma troca os textos", () => {
    render(<MemoryRouter><SupplierConfirmDataModal open /></MemoryRouter>);
    const grupo = screen.getByRole("group", { name: /idioma/i });
    expect(grupo.closest('[role="dialog"]')).not.toBeNull();
    expect(grupo.className).toMatch(/\babsolute\b/);
    expect(screen.getByRole("heading", { name: "Confirme os seus dados" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(screen.getByRole("heading", { name: traduzir("en", "sp.primeiroAcesso.confirmar.titulo") })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Confirme os seus dados" })).toBeNull();
  });

  it("passo da password: mudar de idioma troca os textos", () => {
    render(<MemoryRouter><SupplierFirstLoginModal open onDone={vi.fn()} /></MemoryRouter>);
    const grupo = screen.getByRole("group", { name: /idioma/i });
    expect(grupo.closest('[role="dialog"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Defina a sua password" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(screen.getByRole("heading", { name: "Set your password" })).toBeInTheDocument();
  });
});

describe("SupplierConfirmDataModal", () => {
  const modal = () => render(<MemoryRouter><SupplierConfirmDataModal open /></MemoryRouter>);

  it("português: textos de sempre", () => {
    modal();
    expect(screen.getByRole("heading", { name: "Confirme os seus dados" })).toBeInTheDocument();
    expect(screen.getByText(/Reveja os dados da sua empresa e corrija o que for preciso\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar dados" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("inglês: título, descrição, botões e toast de confirmação", async () => {
    definirIdioma("en");
    spUpdate.mockResolvedValue({ ok: true, updated_count: 2, confirmed_at: "x" });
    modal();
    expect(screen.getByRole("heading", { name: "Confirm your details" })).toBeInTheDocument();
    expect(screen.getByText(/Review your company details and correct anything that is wrong\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "Bruno" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm details" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Details confirmed", description: "Thank you. Your company details are up to date." });
  });

  it("com o telemóvel pessoal: o rótulo e a nota seguem o idioma", () => {
    telemovelDisponivel = true;
    modal();
    expect(screen.getByLabelText(/O seu telemóvel/)).toBeInTheDocument();
    expect(
      screen.getByText("Identifica-o na sua conta. É para este número que enviamos o código SMS quando assinar um contrato."),
    ).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(screen.getByLabelText(/Your mobile phone/)).toBeInTheDocument();
    expect(
      screen.getByText("It identifies you on your account. This is the number we send the SMS code to when you sign a contract."),
    ).toBeInTheDocument();
  });

  it("inglês: a carregar e erro", () => {
    definirIdioma("en");
    dadosDoHook = { ...dadosDoHook, data: undefined, isLoading: true };
    const { unmount } = modal();
    expect(screen.getByText("Loading your details…")).toBeInTheDocument();
    unmount();
    dadosDoHook = { ...dadosDoHook, isLoading: false, isError: true, error: new Error("x") };
    modal();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("SupplierFirstLoginModal", () => {
  const modal = () => render(<MemoryRouter><SupplierFirstLoginModal open onDone={vi.fn()} /></MemoryRouter>);
  const escrever = (nova: string, confirmar: string) => {
    fireEvent.change(document.getElementById("sp-new-password") as HTMLElement, { target: { value: nova } });
    fireEvent.change(document.getElementById("sp-confirm-password") as HTMLElement, { target: { value: confirmar } });
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
  };

  it("português: textos e validação de sempre", () => {
    modal();
    expect(screen.getByRole("heading", { name: "Defina a sua password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nova password")).toHaveAttribute("placeholder", "Mínimo 8 caracteres");
    expect(screen.getByLabelText("Confirmar password")).toHaveAttribute("placeholder", "Repita a password");
    expect(screen.getByRole("button", { name: "Mostrar password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Definir password e entrar" })).toBeInTheDocument();
    escrever("12345678", "1234567x");
    expect(toast).toHaveBeenCalledWith({ title: "Erro", description: "As passwords não coincidem.", variant: "destructive" });
  });

  it("inglês: textos, placeholders, aria e validação", () => {
    definirIdioma("en");
    modal();
    expect(screen.getByRole("heading", { name: "Set your password" })).toBeInTheDocument();
    expect(screen.getByText("For your security, set a personal password before continuing to the Supplier Portal.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("placeholder", "At least 8 characters");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("placeholder", "Repeat the password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set password and sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    escrever("12345678", "1234567x");
    expect(toast).toHaveBeenCalledWith({ title: "Error", description: "The passwords do not match.", variant: "destructive" });
    toast.mockReset();
    escrever("123", "123");
    expect(toast).toHaveBeenCalledWith({ title: "Error", description: "The password must be at least 8 characters long.", variant: "destructive" });
  });

  it("inglês: sucesso e falha", async () => {
    definirIdioma("en");
    updateUser.mockResolvedValueOnce({ error: null });
    spMarkPasswordChanged.mockResolvedValue(undefined);
    modal();
    escrever("12345678", "12345678");
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "Password set", description: "Your password is now active." });

    toast.mockReset();
    updateUser.mockResolvedValue({ error: new Error("") });
    escrever("12345678", "12345678");
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({
      title: "Could not set the password",
      description: "Please try again in a moment.",
      variant: "destructive",
    });
  });

  it("muda ao vivo", () => {
    modal();
    act(() => definirIdioma("en"));
    expect(screen.getByRole("heading", { name: "Set your password" })).toBeInTheDocument();
  });
});

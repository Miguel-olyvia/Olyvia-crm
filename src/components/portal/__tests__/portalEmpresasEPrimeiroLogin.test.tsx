// FirstLoginModal, PortalCompanySwitcher e PortalOrgsErrorState: o português fica como estava; em inglês
// os textos, aria-labels, placeholders e toasts passam a ser ingleses; erros do Supabase Auth ficam como vêm.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const updateUser = vi.fn();
const refetchPortalOrgs = vi.fn();
let contexto: Record<string, unknown> = {};

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a) } },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/contexts/PortalCompanyContext", () => ({ usePortalCompany: () => contexto }));

import { FirstLoginModal } from "../FirstLoginModal";
import { PortalCompanySwitcher } from "../PortalCompanySwitcher";
import { PortalOrgsErrorState } from "../PortalOrgsErrorState";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const org = (id: string, name: string) => ({ organizationId: id, name, logoUrl: null });

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  document.elementFromPoint = () => null;
});
beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  toast.mockReset();
  updateUser.mockReset();
  refetchPortalOrgs.mockReset();
  contexto = {};
});
afterEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
});

async function submeter(password: string, confirmacao: string, labelNova: string, labelConfirmar: string) {
  fireEvent.change(screen.getByLabelText(labelNova), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(labelConfirmar), { target: { value: confirmacao } });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText(labelNova).closest("form")!);
  });
}

describe("FirstLoginModal", () => {
  it("português: os textos de hoje", () => {
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    expect(screen.getByText("Bem-vindo ao Portal!")).toBeInTheDocument();
    expect(screen.getByText("Por segurança, altere a sua password temporária antes de continuar.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nova password")).toHaveAttribute("placeholder", "Mínimo 8 caracteres");
    expect(screen.getByLabelText("Confirmar password")).toHaveAttribute("placeholder", "Repita a password");
    expect(screen.getByRole("button", { name: "Alterar password e entrar" })).toBeInTheDocument();
  });

  it("A2: tem o seletor de idioma dentro do modal e mudar de idioma troca os textos", () => {
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    expect(screen.getByText("Bem-vindo ao Portal!")).toBeInTheDocument();
    const grupo = screen.getByRole("group", { name: /idioma/i });
    expect(grupo.closest('[role="dialog"]')).not.toBeNull();
    expect(grupo.className).toMatch(/\babsolute\b/);
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(screen.getByText("Welcome to the Portal!")).toBeInTheDocument();
    expect(screen.queryByText("Bem-vindo ao Portal!")).toBeNull();
  });

  it("A3: o botão de mostrar/esconder a palavra-passe tem nome traduzido, alvo de 44 px, é focável e o ícone é decorativo", () => {
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    const mostrar = screen.getByRole("button", { name: "Mostrar password" });
    expect(mostrar).not.toHaveAttribute("tabindex");
    expect(mostrar.className).toMatch(/\bh-11\b/);
    expect(mostrar.className).toMatch(/\bw-11\b/);
    expect(mostrar.className).toMatch(/focus-visible:ring-2/);
    expect(mostrar.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Nova password")).toHaveAttribute("type", "password");
    fireEvent.click(mostrar);
    expect(screen.getByLabelText("Nova password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirmar password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Esconder password" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EN, English" }));
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("A3: não mexe em minLength nem em required dos campos", () => {
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    for (const rotulo of ["Nova password", "Confirmar password"]) {
      expect(screen.getByLabelText(rotulo)).toBeRequired();
      expect(screen.getByLabelText(rotulo)).toHaveAttribute("minlength", "8");
    }
  });

  it("inglês: título, descrição, etiquetas, placeholders e botão", () => {
    definirIdioma("en");
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    expect(screen.getByText("Welcome to the Portal!")).toBeInTheDocument();
    expect(screen.getByText(/change your temporary password before continuing/i)).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("placeholder", "At least 8 characters");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("placeholder", "Repeat the password");
    expect(screen.getByRole("button", { name: "Change password and sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Bem-vindo ao Portal!")).toBeNull();
  });

  it("português: palavra-passe curta mostra a mensagem do schema em toast e não chama o Supabase", async () => {
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    await submeter("1234567", "1234567", "Nova password", "Confirmar password");
    expect(toast).toHaveBeenCalledWith({
      title: "Erro",
      description: "A password deve ter no mínimo 8 caracteres.",
      variant: "destructive",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("inglês: validação traduzida (curta e não coincidem)", async () => {
    definirIdioma("en");
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    await submeter("1234567", "1234567", "New password", "Confirm password");
    expect(toast).toHaveBeenLastCalledWith({
      title: "Error",
      description: "The password must be at least 8 characters long.",
      variant: "destructive",
    });
    await submeter("12345678", "87654321", "New password", "Confirm password");
    expect(toast).toHaveBeenLastCalledWith({
      title: "Error",
      description: "The passwords do not match.",
      variant: "destructive",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("sucesso: toast no idioma ativo e avisa quem chamou", async () => {
    updateUser.mockResolvedValue({ error: null });
    const aoMudar = vi.fn();
    definirIdioma("en");
    render(<FirstLoginModal open onPasswordChanged={aoMudar} />);
    await submeter("12345678", "12345678", "New password", "Confirm password");
    expect(updateUser).toHaveBeenCalledWith({ password: "12345678" });
    expect(toast).toHaveBeenCalledWith({
      title: "Password changed successfully",
      description: "Your new password is now active.",
    });
    expect(aoMudar).toHaveBeenCalledTimes(1);
  });

  it("sucesso em português: textos de hoje", async () => {
    updateUser.mockResolvedValue({ error: null });
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    await submeter("12345678", "12345678", "Nova password", "Confirmar password");
    expect(toast).toHaveBeenCalledWith({
      title: "Password alterada com sucesso",
      description: "A sua nova password está ativa.",
    });
  });

  it("erro do Supabase Auth: título traduzido, mensagem como vem", async () => {
    updateUser.mockResolvedValue({ error: new Error("New password should be different from the old password.") });
    definirIdioma("en");
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    await submeter("12345678", "12345678", "New password", "Confirm password");
    expect(toast).toHaveBeenCalledWith({
      title: "Could not change password",
      description: "New password should be different from the old password.",
      variant: "destructive",
    });
  });

  it("durante o pedido o botão diz «A alterar...» / «Changing...»", async () => {
    let resolver: (v: unknown) => void = () => {};
    updateUser.mockReturnValue(new Promise((r) => { resolver = r; }));
    definirIdioma("en");
    render(<FirstLoginModal open onPasswordChanged={() => {}} />);
    await submeter("12345678", "12345678", "New password", "Confirm password");
    expect(screen.getByRole("button", { name: "Changing..." })).toBeDisabled();
    await act(async () => { resolver({ error: null }); });
  });
});

describe("PortalCompanySwitcher", () => {
  const duas = [org("o1", "Alfa Lda"), org("o2", "Beta SA")];

  it("com uma só empresa não mostra nada", () => {
    contexto = { portalOrgs: [duas[0]], activeOrg: duas[0], setActiveOrg: vi.fn(), hasMultiple: false };
    const { container } = render(<PortalCompanySwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("português: aria-label, subtítulo e lista", () => {
    contexto = { portalOrgs: duas, activeOrg: duas[0], setActiveOrg: vi.fn(), hasMultiple: true };
    render(<PortalCompanySwitcher />);
    const botao = screen.getByRole("button", { name: "Empresa ativa: Alfa Lda. Trocar de empresa" });
    expect(screen.getByText("Portal do Cliente")).toBeInTheDocument();
    fireEvent.keyDown(botao, { key: "Enter" });
    expect(screen.getByText("As suas empresas")).toBeInTheDocument();
  });

  it("inglês: aria-label, subtítulo e lista; o nome da empresa fica como vem", () => {
    definirIdioma("en");
    const setActiveOrg = vi.fn();
    contexto = { portalOrgs: duas, activeOrg: duas[0], setActiveOrg, hasMultiple: true };
    render(<PortalCompanySwitcher />);
    const botao = screen.getByRole("button", { name: "Active company: Alfa Lda. Switch company" });
    expect(screen.getByText("Customer Portal")).toBeInTheDocument();
    fireEvent.keyDown(botao, { key: "Enter" });
    expect(screen.getByText("Your companies")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Beta SA" }));
    expect(setActiveOrg).toHaveBeenCalledWith("o2");
  });
});

describe("PortalOrgsErrorState", () => {
  it("português: textos de hoje e o botão tenta de novo", () => {
    contexto = { refetchPortalOrgs, isFetching: false };
    render(<PortalOrgsErrorState />);
    expect(screen.getByText("Não foi possível carregar os seus dados.")).toBeInTheDocument();
    expect(screen.getByText("Verifique a ligação à internet e tente novamente.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetchPortalOrgs).toHaveBeenCalledTimes(1);
  });

  it("português: durante a nova tentativa diz «A tentar...»", () => {
    contexto = { refetchPortalOrgs, isFetching: true };
    render(<PortalOrgsErrorState />);
    expect(screen.getByRole("button", { name: "A tentar..." })).toBeDisabled();
  });

  it("inglês: textos e botão", () => {
    definirIdioma("en");
    contexto = { refetchPortalOrgs, isFetching: false };
    const { rerender } = render(<PortalOrgsErrorState />);
    expect(screen.getByText("We could not load your data.")).toBeInTheDocument();
    expect(screen.getByText("Check your internet connection and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    contexto = { refetchPortalOrgs, isFetching: true };
    rerender(<PortalOrgsErrorState />);
    expect(screen.getByRole("button", { name: "Trying again..." })).toBeDisabled();
  });
});

// A «Nova lead» sob falha e a meio de uma criação: não se fecha o diálogo enquanto grava; os campos da campanha que não chegam não deixam
// criar a lead sem eles; as leituras de apoio que falham dizem-no e deixam repetir. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FontePessoasContext } from "@/hooks/pessoas/useFontePessoas";
import { supabaseFalso } from "@/hooks/pessoas/novaLead/supabaseFalso";
import { NovaLeadReal } from "./NovaLeadReal";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("@/hooks/pessoas/novaLead/supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigável" }));
vi.mock("@/components/billing/PlanLimitWarning", () => ({ PlanLimitWarning: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "user-1", authUserId: "auth-1", teamMemberIds: [] }),
}));

const ORG = "org-1";
const aoAbrirPessoa = vi.fn();
const aoAnunciar = vi.fn();

function desenhar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FontePessoasContext.Provider value={{ modo: "real", organizationId: ORG, momentoGanho: null }}>
          <NovaLeadReal aoAbrirPessoa={aoAbrirPessoa} aoAnunciar={aoAnunciar} />
        </FontePessoasContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Nova lead" }));
const escrever = (rotulo: RegExp, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const preencherValido = () => {
  escrever(/Nome próprio/, "Ana");
  escrever(/Apelido/, "Lopes");
  escrever(/^Email/, "ana@x.pt");
  fireEvent.change(document.getElementById("nl-campo-phone") as HTMLInputElement, { target: { value: "912 345 678" } });
};
const criar = () => fireEvent.click(screen.getByRole("button", { name: "Criar lead" }));
const escolherCampanha = async () => {
  await waitFor(() => expect(screen.getByRole("option", { name: /Verão/ })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Campanha", { selector: "select" }), { target: { value: "c1" } });
};

beforeEach(() => {
  supabaseFalso.reiniciar();
  aoAbrirPessoa.mockReset();
  aoAnunciar.mockReset();
  supabaseFalso.estado.tabelas = {
    campaigns: (c) => (c.colunas?.includes("form_id") && !c.colunas.includes("status")
      ? { data: [{ form_id: "f1" }], error: null }
      : { data: [{ id: "c1", name: "Verão", status: "active", form_id: "f1", forms: { id: "f1", name: "Orçamento online", is_primary: true } }], error: null }),
    lead_sources: [{ id: "s1", name: "Feira", icon: null, color: null }],
    forms: [{ id: "f1", name: "Orçamento online", is_primary: true }],
    form_fields: [{ id: "ff1", field_key: "po_nome", field_label: "Nome do cliente", field_type: "text", is_required: true, contact_field_mapping: "first_name" }],
    anew_hierarchy: [], anew_organizations: [{ id: ORG, name: "Nike", type: "empresa" }],
    anew_memberships: [{ user_id: "u1", organization_id: ORG, role_id: "r" }], anew_roles: [{ id: "r", code: "vendedor" }],
    anew_users: [{ id: "u1", name: "Rui Costa", entity_id: null, status: "active" }], anew_entity_addresses: [],
  };
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome === "neg_procurar_duplicados") return { data: [], error: null };
    if (nome === "create_lead_entity_for_org") return { data: "ent-novo", error: null };
    if (nome === "rpc_create_lead_manual") return { data: { id: "lead-novo" }, error: null };
    return { data: null, error: null };
  });
});

describe("NovaLeadReal: fechar a meio de uma criação", () => {
  it("enquanto verifica e grava, Cancelar fica desativado, Escape não fecha e os campos ficam bloqueados e ocupados", async () => {
    let terminarVerificacao: (v: unknown) => void = () => undefined;
    supabaseFalso.rpc.mockImplementation((nome: string) => {
      if (nome === "neg_procurar_duplicados") return new Promise((r) => { terminarVerificacao = r; });
      if (nome === "create_lead_entity_for_org") return Promise.resolve({ data: "ent-novo", error: null });
      if (nome === "rpc_create_lead_manual") return Promise.resolve({ data: { id: "lead-novo" }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    preencherValido();
    criar();
    await waitFor(() => expect(screen.getByRole("button", { name: "A criar..." })).toBeDisabled());
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(within(dialogo).queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(dialogo, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const campos = dialogo.querySelector("fieldset") as HTMLFieldSetElement;
    expect(campos).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText(/Nome próprio/)).toBeDisabled();
    terminarVerificacao({ data: [], error: null });
    await waitFor(() => expect(aoAbrirPessoa).toHaveBeenCalledWith("ent-novo", expect.anything()));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem criação em curso, Cancelar e Escape fecham como antes e os campos estão livres", async () => {
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    expect(screen.getByLabelText(/Nome próprio/)).not.toBeDisabled();
    expect(dialogo.querySelector("fieldset")).not.toHaveAttribute("aria-busy");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    abrir();
    const outra = await screen.findByRole("dialog");
    fireEvent.keyDown(outra, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("NovaLeadReal: campos da campanha que não chegam", () => {
  it("a carregar: diz-o e não deixa criar a lead (podia sair sem os campos obrigatórios da campanha)", async () => {
    const original = supabaseFalso.from.bind(supabaseFalso);
    vi.spyOn(supabaseFalso, "from").mockImplementation((tabela: string) => {
      if (tabela !== "form_fields") return original(tabela);
      return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ order: () => new Promise(() => undefined) }) }) }) }) } as never;
    });
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    await escolherCampanha();
    expect(await screen.findByText("A carregar os campos da campanha...")).toBeInTheDocument();
    preencherValido();
    expect(screen.getByRole("button", { name: "Criar lead" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Criar lead" }).closest("form") as HTMLFormElement);
    expect(supabaseFalso.rpc).not.toHaveBeenCalledWith("neg_procurar_duplicados", expect.anything());
    vi.restoreAllMocks();
  });

  it("falha a ler: alerta com «Tentar de novo», a lead não se cria; repetir traz os campos e liberta o botão", async () => {
    supabaseFalso.estado.erros["form_fields.select"] = { message: "boom" };
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    await escolherCampanha();
    const alerta = await screen.findByText("Não foi possível carregar os campos da campanha. Não se pode criar a lead sem eles.");
    expect(alerta.closest("[role='alert']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Criar lead" })).toBeDisabled();
    delete supabaseFalso.estado.erros["form_fields.select"];
    fireEvent.click(within(alerta.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByLabelText(/Nome do cliente/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Criar lead" })).not.toBeDisabled());
  });

  it("sem campanha escolhida, nada disto se aplica: o botão está livre", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Criar lead" })).not.toBeDisabled();
    expect(screen.queryByText("A carregar os campos da campanha...")).toBeNull();
  });
});

describe("NovaLeadReal: leituras de apoio que falham", () => {
  it("uma falha a ler campanhas, origens ou comerciais diz-se, e repetir recupera", async () => {
    supabaseFalso.estado.erros["campaigns.select"] = { message: "boom" };
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    const aviso = await screen.findByText("Não foi possível carregar as campanhas, as origens ou os comerciais.");
    delete supabaseFalso.estado.erros["campaigns.select"];
    fireEvent.click(within(aviso.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.getByRole("option", { name: /Verão/ })).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Não foi possível carregar as campanhas, as origens ou os comerciais.")).toBeNull());
  });

  it("com tudo a carregar bem, não há aviso nenhum", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("option", { name: /Verão/ })).toBeInTheDocument());
    expect(screen.queryByText(/Não foi possível carregar as campanhas/)).toBeNull();
  });
});

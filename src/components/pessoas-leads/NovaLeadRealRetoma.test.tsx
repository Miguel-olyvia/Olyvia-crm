// A «Nova lead» depois de um erro ou de uma falha de leitura: «Tentar de novo» repete com o formulário de agora; sem campanhas, origens ou
// comerciais não se cria; o foco não se perde quando o formulário volta a ficar livre; trocar de organização a meio não rebenta. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function arvore(org: string, chave: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FontePessoasContext.Provider value={{ modo: "real", organizationId: org, momentoGanho: null }}>
          <NovaLeadReal key={chave} aoAbrirPessoa={aoAbrirPessoa} aoAnunciar={aoAnunciar} />
        </FontePessoasContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
const desenhar = () => render(arvore(ORG, ORG));
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Nova lead" }));
const escrever = (rotulo: RegExp, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const preencherValido = (email = "ana@x.pt") => {
  escrever(/Nome próprio/, "Ana");
  escrever(/Apelido/, "Lopes");
  escrever(/^Email/, email);
  fireEvent.change(document.getElementById("nl-campo-phone") as HTMLInputElement, { target: { value: "912 345 678" } });
};
const criar = () => fireEvent.click(screen.getByRole("button", { name: "Criar lead" }));
const procuras = () => supabaseFalso.rpc.mock.calls.filter((c) => c[0] === "neg_procurar_duplicados");

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
    form_fields: [],
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

describe("NovaLeadReal: tentar de novo depois de um erro ao verificar", () => {
  it("repete com o email que o formulário tem agora, não com o enviado da primeira vez", async () => {
    supabaseFalso.rpc.mockImplementation(async (nome: string) => (
      nome === "neg_procurar_duplicados" ? { data: null, error: { code: "57014", message: "timeout" } } : { data: null, error: null }
    ));
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    preencherValido("antigo@x.pt");
    criar();
    const alerta = (await within(dialogo).findByText("Não foi possível confirmar que esta pessoa ainda não existe. Nada foi criado. Tente de novo.")).closest("[role='alert']") as HTMLElement;
    escrever(/^Email/, "novo@x.pt");
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(procuras()).toHaveLength(2));
    expect(JSON.stringify(procuras()[1])).toContain("novo@x.pt");
    expect(JSON.stringify(procuras()[1])).not.toContain("antigo@x.pt");
  });
});

describe("NovaLeadReal: sem campanhas, origens ou comerciais não se cria", () => {
  it.each(["campaigns.select", "lead_sources.select"])("falha a ler (%s): o Criar fica desativado, nada se verifica nem grava, e repetir liberta-o", async (chave) => {
    supabaseFalso.estado.erros[chave] = { message: "boom" };
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    const aviso = await within(dialogo).findByText(/Não foi possível carregar as campanhas, as origens ou os comerciais/);
    preencherValido();
    expect(screen.getByRole("button", { name: "Criar lead" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Criar lead" }).closest("form") as HTMLFormElement);
    expect(procuras()).toHaveLength(0);
    expect(supabaseFalso.rpc).not.toHaveBeenCalledWith("create_lead_entity_for_org", expect.anything());
    delete supabaseFalso.estado.erros[chave];
    fireEvent.click(within(aviso.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Criar lead" })).not.toBeDisabled());
  });

  it("o aviso diz que não se cria enquanto não carregar", async () => {
    supabaseFalso.estado.erros["campaigns.select"] = { message: "boom" };
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    const aviso = await within(dialogo).findByText(/Não foi possível carregar as campanhas, as origens ou os comerciais/);
    expect((aviso.closest("[role='alert']") as HTMLElement).textContent).toMatch(/não se pode criar a lead/i);
  });
});

describe("NovaLeadReal: o foco não se perde", () => {
  it("depois de um erro ao verificar, o foco volta ao botão «Criar lead» e não fica no corpo da página", async () => {
    let falhar: (v: unknown) => void = () => undefined;
    supabaseFalso.rpc.mockImplementation((nome: string) => (
      nome === "neg_procurar_duplicados" ? new Promise((r) => { falhar = r; }) : Promise.resolve({ data: null, error: null })
    ));
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    preencherValido();
    screen.getByRole("button", { name: "Criar lead" }).focus();
    criar();
    await waitFor(() => expect(screen.getByRole("button", { name: "A criar..." })).toBeDisabled());
    // Num navegador, um botão que fica desativado deixa de ter o foco: o corpo da página passa a ser o elemento ativo.
    // Um botão que fica desativado perde o foco e a armadilha de foco do diálogo passa-o ao contentor (o jsdom não o faz sozinho).
    dialogo.focus();
    expect(dialogo).toHaveFocus();
    await act(async () => { falhar({ data: null, error: { code: "57014", message: "timeout" } }); });
    await within(dialogo).findByText("Não foi possível confirmar que esta pessoa ainda não existe. Nada foi criado. Tente de novo.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Criar lead" })).toHaveFocus());
  });
});

describe("NovaLeadReal: trocar de organização a meio de uma criação", () => {
  it("a árvore remonta, a criação em curso acaba sem erros nem avisos de estado e não se cria nada na organização nova", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let libertar: (v: unknown) => void = () => undefined;
    supabaseFalso.rpc.mockImplementation((nome: string) => (
      nome === "neg_procurar_duplicados" ? new Promise((r) => { libertar = r; }) : Promise.resolve({ data: nome === "create_lead_entity_for_org" ? "ent-novo" : { id: "lead-novo" }, error: null })
    ));
    const { rerender } = desenhar();
    abrir();
    await screen.findByRole("dialog");
    preencherValido();
    criar();
    await waitFor(() => expect(screen.getByRole("button", { name: "A criar..." })).toBeDisabled());
    rerender(arvore("org-2", "org-2"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
    await act(async () => { libertar({ data: [], error: null }); await new Promise((r) => setTimeout(r, 20)); });
    expect(erro).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    erro.mockRestore();
  });
});

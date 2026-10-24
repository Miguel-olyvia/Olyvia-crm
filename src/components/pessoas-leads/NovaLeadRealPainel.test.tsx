// O painel lateral da «Nova lead» (Sheet à direita, como a ficha): medidas, cabeçalho, fecho, foco e o aviso de duplicados por cima.
// Mesmo fundo simulado de NovaLeadReal.test.tsx. Nada vai à rede.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FontePessoasContext } from "@/hooks/pessoas/useFontePessoas";
import { entidadesDaNovaLead, supabaseFalso } from "@/hooks/pessoas/novaLead/supabaseFalso";
import { NovaLeadReal } from "./NovaLeadReal";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("@/hooks/pessoas/novaLead/supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigável" }));
vi.mock("@/components/billing/PlanLimitWarning", () => ({ PlanLimitWarning: () => null }));
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "user-1", authUserId: "auth-1", teamMemberIds: [] }),
}));

const ORG = "org-1";
const aoAbrirPessoa = vi.fn();
const aoAnunciar = vi.fn();

const linha = (sobre: Record<string, unknown> = {}) => ({
  pessoa: 1, campo: "email", ambito: "organizacao", entity_id: "p1", nome: "Ana Lopes", visivel: true, organizacao_id: ORG, organizacao_nome: null, ...sobre,
});
function rpc(sobre: Record<string, unknown> = {}) {
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome in sobre) return sobre[nome];
    if (nome === "neg_procurar_duplicados") return { data: [], error: null };
    if (nome === "create_lead_entity_for_org") return { data: "ent-novo", error: null };
    if (nome === "rpc_create_lead_manual") return { data: { id: "lead-novo" }, error: null };
    return { data: null, error: null };
  });
}
const nomesRpc = () => supabaseFalso.rpc.mock.calls.map((c) => c[0] as string);

function desenhar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

beforeEach(() => {
  supabaseFalso.reiniciar();
  toastMock.mockReset();
  aoAbrirPessoa.mockReset();
  aoAnunciar.mockReset();
  supabaseFalso.estado.tabelas = {
    campaigns: (c) => (c.colunas?.includes("form_id") && !c.colunas.includes("status")
      ? { data: [{ form_id: "f1" }], error: null }
      : { data: [{ id: "c1", name: "Verão", status: "active", form_id: "f1", forms: { id: "f1", name: "Orçamento online", is_primary: true } }], error: null }),
    lead_sources: [{ id: "s1", name: "Feira", icon: null, color: null }],
    forms: [{ id: "f1", name: "Orçamento online", is_primary: true }],
    form_fields: [
      { id: "ff1", field_key: "po_nome", field_label: "Nome do cliente", field_type: "text", is_required: true, contact_field_mapping: "first_name" },
      { id: "ff2", field_key: "po_codigo_postal", field_label: "Código postal", field_type: "text", is_required: false, pattern: "^[0-9]{4}-[0-9]{3}$" },
    ],
    anew_hierarchy: [], anew_organizations: [{ id: ORG, name: "Nike", type: "empresa" }],
    anew_memberships: [{ user_id: "u1", organization_id: ORG, role_id: "r" }], anew_roles: [{ id: "r", code: "vendedor" }],
    anew_users: [{ id: "u1", name: "Rui Costa", entity_id: null, status: "active" }], anew_entity_addresses: [],
    // a lead é a própria entidade: um só email, um só telefone e o responsável na linha da entidade
    anew_entities: entidadesDaNovaLead("p1", "ent-novo", { phone: "911 222 333", assigned_to: "u1" }),
  };
  rpc();
});

// Um clique completo fora do painel (o Radix só dispensa no clique, não no pointerdown).
const cliqueFora = () => {
  for (const f of [fireEvent.pointerDown, fireEvent.mouseDown, fireEvent.pointerUp, fireEvent.mouseUp, fireEvent.click]) f(document.body, { button: 0 });
};
// O Radix só liga o ouvinte de «clique fora» num setTimeout(0) depois de abrir.
const esperarOuvinteFora = () => new Promise<void>((r) => setTimeout(r, 20));

describe("NovaLeadReal: painel lateral", () => {
  it("abre pela direita com as medidas da ficha e o corpo a rolar com o rodapé fixo", async () => {
    desenhar();
    abrir();
    const painel = await screen.findByRole("dialog", { name: "Criar nova lead" });
    expect(painel.className).toContain("sm:w-1/2");
    expect(painel.className).toContain("sm:min-w-[640px]");
    expect(painel.className).toContain("right-0");
    const form = painel.querySelector("form") as HTMLFormElement;
    expect(form.className).toContain("flex-col");
    expect(form.querySelector(".overflow-y-auto")).not.toBeNull();
    expect(within(form).getByRole("button", { name: "Criar lead" })).toBeInTheDocument();
  });

  it("tem um só botão de fechar, traduzido (Fechar), e nenhum «Close» por omissão", async () => {
    desenhar();
    abrir();
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getAllByRole("button", { name: "Fechar" })).toHaveLength(1);
    expect(within(painel).queryByText("Close")).toBeNull();
    expect(within(painel).getByRole("navigation", { name: "Percurso" })).toBeInTheDocument();
  });

  it("«Fechar» fecha e o foco volta ao botão «Nova lead»", async () => {
    desenhar();
    abrir();
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Nova lead" })).toHaveFocus());
  });

  it("Escape fecha o painel limpo", async () => {
    desenhar();
    abrir();
    const painel = await screen.findByRole("dialog");
    fireEvent.keyDown(painel, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("clicar fora fecha o painel limpo mas não fecha com o formulário sujo", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    await esperarOuvinteFora();
    cliqueFora();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    abrir();
    await screen.findByRole("dialog");
    escrever(/Nome próprio/, "Ana");
    await esperarOuvinteFora();
    cliqueFora();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome próprio/)).toHaveValue("Ana");
  });

  it("com o formulário sujo, Escape continua a fechar", async () => {
    desenhar();
    abrir();
    const painel = await screen.findByRole("dialog");
    escrever(/Nome próprio/, "Ana");
    fireEvent.keyDown(painel, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("com os duplicados por cima, Escape fecha só o aviso e o painel fica com o que se escreveu", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    desenhar();
    abrir();
    await screen.findByRole("dialog", { name: "Criar nova lead" });
    preencherValido();
    criar();
    const dup = await screen.findByRole("alertdialog", { name: "Esta pessoa já existe" });
    fireEvent.keyDown(dup, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Criar nova lead" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome próprio/)).toHaveValue("Ana");
  });
});

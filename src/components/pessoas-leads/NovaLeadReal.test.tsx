// A «Nova lead» de Pessoas ponta a ponta (Supabase simulado): o diálogo, a validação, criar uma pessoa nova, o bloqueio por duplicados e as
// três saídas (Abrir existente, Atualizar dados com confirmação, Cancelar). Nada vai à rede.
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
    anew_entities: [{ id: "p1", display_name: "Ana Lopes", created_at: "2026-09-01T10:00:00Z" }],
    anew_entity_emails: [{ entity_id: "p1", email: "ana@x.pt", is_primary: true }],
    anew_entity_phones: [{ entity_id: "p1", phone_number: "911 222 333", is_primary: true }],
    anew_leads: (c) => (c.colunas?.includes("field_values")
      ? { data: [{ field_values: {}, status: "new" }], error: null }
      : { data: [{ id: "l1", entity_id: "p1", status: "new", closure_result: null, created_at: "2026-10-01T10:00:00Z", assigned_to: "u1" }], error: null }),
    anew_clients: [],
  };
  rpc();
});

describe("NovaLeadReal: o diálogo", () => {
  it("o botão «Nova lead» abre o diálogo com título e descrição, e o foco vai para o primeiro campo", async () => {
    desenhar();
    expect(screen.queryByRole("dialog")).toBeNull();
    abrir();
    const dialogo = await screen.findByRole("dialog", { name: "Criar nova lead" });
    expect(dialogo).toHaveAccessibleDescription(/Cria uma pessoa nova/);
    await waitFor(() => expect(within(dialogo).getByLabelText("Campanha", { selector: "select" })).toHaveFocus());
  });

  it("tem os campos base de Leads e nenhum de morada", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    for (const nome of [/Nome próprio/, /Apelido/, /^Email/, /Empresa/, /Notas/]) expect(screen.getByLabelText(nome)).toBeInTheDocument();
    expect(document.getElementById("nl-campo-phone")).not.toBeNull();
    expect(screen.queryByLabelText(/Morada|Código postal/)).toBeNull();
  });

  it("os botões e os campos têm tamanho de toque e o botão de criar é de submissão", async () => {
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Criar lead" })).toHaveAttribute("type", "submit");
    for (const b of within(dialogo).getAllByRole("button").filter((x) => /Cancelar|Criar lead|Criar formulário/.test(x.textContent ?? ""))) {
      expect(b.className, b.textContent ?? "").toContain("min-h-11");
    }
  });

  it("escolher uma campanha acrescenta os campos dela e esconde o campo base que ela já cobre", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("option", { name: /Verão/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Campanha", { selector: "select" }), { target: { value: "c1" } });
    expect(await screen.findByLabelText(/Nome do cliente/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campos adicionais da campanha" })).toBeInTheDocument();
    expect(screen.getByText("Orçamento online")).toBeInTheDocument();
    expect(screen.getByText("2 campos extra")).toBeInTheDocument();
    // o nome próprio (base) é coberto pelo campo da campanha, que o mapeia: deixa de se desenhar
    expect(screen.queryByLabelText(/Nome próprio/)).toBeNull();
  });

  it("campos em falta: marca-os, liga a mensagem ao campo, foca o primeiro e não toca na base", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    criar();
    const nome = await screen.findByLabelText(/Nome próprio/);
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(nome).toHaveAccessibleDescription(/obrigatório/);
    await waitFor(() => expect(nome).toHaveFocus());
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
  });

  it("«Cancelar» fecha sem criar e o foco volta ao botão «Nova lead»", async () => {
    desenhar();
    abrir();
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Nova lead" })).toHaveFocus());
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
  });
});

describe("NovaLeadReal: criar", () => {
  it("cria a pessoa e a lead, fecha, abre a ficha da pessoa nova e anuncia", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    preencherValido();
    criar();
    await waitFor(() => expect(aoAbrirPessoa).toHaveBeenCalledWith("ent-novo", screen.getByRole("button", { name: "Nova lead" })));
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados", "create_lead_entity_for_org", "ensure_entity_org_link", "rpc_create_lead_manual"]);
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("rpc_create_lead_manual", expect.objectContaining({
      p_organization_id: ORG, p_entity_created_here: true, p_email: "ana@x.pt", p_phone: "+351912345678",
    }));
    expect(aoAnunciar).toHaveBeenCalledWith("Lead criada: Ana Lopes.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a origem escolhida vai para a lead pelo nome e pelo id", async () => {
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("option", { name: "Feira" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Fonte da lead"), { target: { value: "s1" } });
    preencherValido();
    criar();
    await waitFor(() => expect(aoAbrirPessoa).toHaveBeenCalled());
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("rpc_create_lead_manual", expect.objectContaining({ p_source: "Feira", p_source_id: "s1" }));
  });

  it("se a verificação falha mostra o erro no diálogo, com «Tentar de novo», e não cria nada", async () => {
    rpc({ neg_procurar_duplicados: { data: null, error: { code: "57014", message: "timeout" } } });
    desenhar();
    abrir();
    await screen.findByRole("dialog");
    preencherValido();
    criar();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível confirmar que esta pessoa ainda não existe. Nada foi criado.");
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(aoAbrirPessoa).not.toHaveBeenCalled();
    rpc();
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(aoAbrirPessoa).toHaveBeenCalledWith("ent-novo", expect.anything()));
  });
});

describe("NovaLeadReal: duplicados", () => {
  async function ateOBloqueio() {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    desenhar();
    abrir();
    await screen.findByRole("dialog", { name: "Criar nova lead" });
    preencherValido();
    criar();
    return screen.findByRole("alertdialog", { name: "Esta pessoa já existe" });
  }

  it("email igual ao de uma pessoa: nada é criado e o diálogo oferece só três saídas", async () => {
    const dup = await ateOBloqueio();
    expect(within(dup).getByText("Encontrámos uma pessoa nesta organização com os mesmos dados. Nada foi criado.")).toBeInTheDocument();
    expect(within(dup).getAllByRole("button").map((b) => b.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Abrir existente Ana Lopes", "Atualizar dados Ana Lopes", "Cancelar"]);
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
  });

  it("«Abrir existente» abre a ficha da pessoa que já existe e fecha tudo", async () => {
    const dup = await ateOBloqueio();
    fireEvent.click(within(dup).getByRole("button", { name: /^Abrir existente/ }));
    await waitFor(() => expect(aoAbrirPessoa).toHaveBeenCalledWith("p1", expect.anything()));
    expect(aoAnunciar).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
  });

  it("«Cancelar» volta ao formulário com o que se escreveu, sem criar nada", async () => {
    const dup = await ateOBloqueio();
    fireEvent.click(within(dup).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByLabelText(/Nome próprio/)).toHaveValue("Ana");
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
  });

  it("«Atualizar dados» pede confirmação, mostra o antigo e o novo e só depois substitui o contacto", async () => {
    const dup = await ateOBloqueio();
    fireEvent.click(within(dup).getByRole("button", { name: /^Atualizar dados/ }));
    expect(await screen.findByText("Confirmar a atualização de Ana Lopes")).toBeInTheDocument();
    expect(screen.getByText(/O telefone passa de 911 222 333 para \+351912345678\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toHaveFocus();
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e atualizar" }));
    await waitFor(() => expect(aoAbrirPessoa).toHaveBeenCalledWith("p1", expect.anything()));
    expect(supabaseFalso.rpc).toHaveBeenCalledWith("neg_substituir_contacto", {
      p_organization_id: ORG, p_entity_id: "p1", p_email: null, p_telefone: "+351912345678",
    });
    expect(nomesRpc()).not.toContain("create_lead_entity_for_org");
    expect(aoAnunciar).toHaveBeenCalledWith("Dados de Ana Lopes atualizados.");
  });

  it("cliente ativo: «Já é cliente», sem «Atualizar dados»", async () => {
    supabaseFalso.estado.tabelas.anew_clients = [{ id: "c1", entity_id: "p1", status: "active", created_at: "2026-09-02T10:00:00Z" }];
    const dup = await ateOBloqueio();
    expect(within(dup).getByText("Já é cliente")).toBeInTheDocument();
    expect(within(dup).queryByRole("button", { name: /Atualizar dados/ })).toBeNull();
  });
});

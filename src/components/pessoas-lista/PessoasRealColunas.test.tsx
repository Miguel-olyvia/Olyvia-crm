// A Lista real com colunas à escolha e leituras em lote: telefone, email e WhatsApp (dois pedidos por página, como em Leads) e o nome do comercial
// (uma consulta por página), só quando essas colunas estão visíveis, e a escolha de colunas por organização.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { chaveColunas, escolhaPorOmissao, type EscolhaColuna } from "./colunasPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
// A «Nova lead» do cabeçalho (P7) tem testes próprios; aqui não interessa. Sem permissão `leads.create`, o botão não se desenha.
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, hasAnyPermission: () => false, permissions: [], loading: false }) }));
const contactosMock = vi.hoisted(() => vi.fn());
const inMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const listaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", async (original) => ({
  ...(await original<typeof import("@/hooks/pessoas/useListaPessoas")>()),
  useListaPessoas: (f: FiltrosLista) => listaMock(f),
}));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));

beforeAll(prepararRadixNoJsdom);

const REAL = (org: string): FontePessoas => ({ modo: "real", organizationId: org, momentoGanho: null });
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PESSOAS = [
  pessoaLista(A, { nome: "Ana Lopes", responsavelId: "u-rui" }),
  pessoaLista(B, { nome: "Bruno Reis", responsavelId: null }),
];

function desenhar(fonte: FontePessoas = REAL("org-1")) {
  listaMock.mockReturnValue(listaBase({ linhas: PESSOAS }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}><MemoryRouter><PessoasReal /></MemoryRouter></FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
}
// Com o diálogo das colunas aberto, o resto da página fica aria-hidden: os cabeçalhos procuram-se também entre os escondidos.
const cabecalhos = (): string[] => screen.getAllByRole("columnheader", { hidden: true }).map((c) => c.textContent ?? "");
const guardar = (org: string, escolha: readonly EscolhaColuna[]) =>
  window.localStorage.setItem(chaveColunas(org), JSON.stringify({ v: 1, colunas: escolha }));
const sem = (...ids: string[]) => escolhaPorOmissao().map((c) => (ids.includes(c.id) ? { ...c, visivel: false } : c));

beforeEach(() => {
  window.localStorage.clear();
  [contactosMock, inMock, fromMock, listaMock].forEach((m) => m.mockReset());
  // Comerciais: from("anew_users").select().in(). Contactos, como em Leads: from(tabela).select().in("entity_id", ids).eq("is_primary", true).
  fromMock.mockImplementation((tabela: string) => ({
    select: () => ({
      in: tabela === "anew_users" ? inMock : (coluna: string, ids: string[]) => ({ eq: () => contactosMock(tabela, coluna, ids) }),
    }),
  }));
  contactosMock.mockImplementation((tabela: string) => Promise.resolve({
    data: tabela === "anew_entity_emails"
      ? [{ entity_id: A, email: "ana@exemplo.pt" }]
      : [{ entity_id: A, phone_number: "912345678" }],
    error: null,
  }));
  inMock.mockReturnValue(Promise.resolve({ data: [{ id: "u-rui", name: "Rui Dias" }], error: null }));
});

describe("PessoasReal: colunas por omissão", () => {
  it("mostra o nome, a etapa, o formulário, o último contacto, o próximo passo, a próxima visita, o valor, os negócios, os dados de contacto e o criado em", () => {
    desenhar({ modo: "exemplo" });
    expect(cabecalhos()).toEqual([
      "Pessoa", "Etapa", "Formulário", "Último contacto", "Próximo passo", "Próxima visita", "Valor", "Negócios", "Atribuído a", "Telefone", "Email",
      "WhatsApp", "Criado em",
    ]);
  });
  it("a localidade saiu, e origem e campanha ficam escondidas até a pessoa as escolher", () => {
    desenhar({ modo: "exemplo" });
    for (const sem of ["Localidade", "Origem", "Campanha"]) expect(cabecalhos()).not.toContain(sem);
  });
  it("o botão «Colunas» está na página", () => {
    desenhar({ modo: "exemplo" });
    expect(screen.getByRole("button", { name: "Colunas" })).toBeInTheDocument();
  });
  it("em modo exemplo não há leituras à base", () => {
    desenhar({ modo: "exemplo" });
    expect(contactosMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("PessoasReal: leituras em lote por página", () => {
  it("dois pedidos de contactos (emails e telefones) com os ids das linhas e uma consulta de comerciais com os responsáveis", async () => {
    desenhar();
    await waitFor(() => expect(contactosMock).toHaveBeenCalledTimes(2));
    expect(contactosMock).toHaveBeenCalledWith("anew_entity_emails", "entity_id", [A, B]);
    expect(contactosMock).toHaveBeenCalledWith("anew_entity_phones", "entity_id", [A, B]);
    await waitFor(() => expect(inMock).toHaveBeenCalledTimes(1));
    expect(fromMock).toHaveBeenCalledWith("anew_users");
    expect(inMock).toHaveBeenCalledWith("id", ["u-rui"]);
  });
  it("mostra o telefone, o email, o WhatsApp e o nome do comercial lidos, e «Sem comercial» para quem não tem", async () => {
    desenhar();
    expect(await screen.findByText("912345678")).toBeInTheDocument();
    expect(screen.getByText("ana@exemplo.pt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp.*Ana Lopes/ })).toHaveAttribute("href", "https://wa.me/351912345678");
    expect(await screen.findByText("Rui Dias")).toBeInTheDocument();
    expect(screen.getByText("Sem comercial")).toBeInTheDocument();
  });
  it("com as colunas de contacto escondidas não lê contactos; com a do comercial escondida não lê comerciais", async () => {
    guardar("org-1", sem("phone", "email", "whatsapp", "assigned"));
    desenhar();
    await Promise.resolve();
    await Promise.resolve();
    expect(contactosMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
  it("com só uma das colunas de contacto visível, lê os contactos (uma vez: dois pedidos)", async () => {
    guardar("org-1", sem("email", "whatsapp", "assigned"));
    desenhar();
    await waitFor(() => expect(contactosMock).toHaveBeenCalledTimes(2));
    expect(fromMock).not.toHaveBeenCalledWith("anew_users");
  });
  it("uma falha nos contactos não derruba a lista: as linhas ficam e a célula diz «Sem dado»", async () => {
    contactosMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }));
    desenhar();
    await waitFor(() => expect(contactosMock).toHaveBeenCalled());
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
    expect(screen.queryByText("912345678")).toBeNull();
    expect(screen.getAllByText("Sem dado").length).toBeGreaterThan(0);
  });
});

describe("PessoasReal: escolher as colunas", () => {
  it("desmarcar uma coluna no diálogo tira-a da tabela e guarda a escolha desta organização", () => {
    desenhar({ modo: "exemplo" });
    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Valor" }));
    expect(cabecalhos()).not.toContain("Valor");
    // Só aqui há organização: em exemplo nada se guarda.
    expect(window.localStorage.length).toBe(0);
  });
  it("em modo real a escolha fica guardada para essa organização e a outra não a herda", () => {
    const a = desenhar(REAL("org-1"));
    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Valor" }));
    expect(window.localStorage.getItem(chaveColunas("org-1"))).not.toBeNull();
    expect(window.localStorage.getItem(chaveColunas("org-2"))).toBeNull();
    a.unmount();
    desenhar(REAL("org-2"));
    expect(cabecalhos()).toContain("Valor");
    a.unmount();
  });
  it("uma escolha guardada aplica-se logo ao abrir, na ordem guardada", () => {
    guardar("org-1", [{ id: "person", visivel: true }, { id: "value", visivel: true }, { id: "stage", visivel: true }, ...escolhaPorOmissao().slice(2).filter((c) => c.id !== "value").map((c) => ({ ...c, visivel: false }))]);
    desenhar();
    expect(cabecalhos()).toEqual(["Pessoa", "Valor", "Etapa"]);
  });
  it("Subir muda a ordem do cabeçalho e das células por igual", () => {
    desenhar({ modo: "exemplo" });
    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir Último contacto" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir Último contacto" }));
    expect(cabecalhos().slice(0, 3)).toEqual(["Pessoa", "Último contacto", "Etapa"]);
    // Com o diálogo aberto o resto da página fica aria-hidden: por isso se procura também entre os escondidos.
    const linha = screen.getAllByRole("row", { hidden: true })[1];
    expect(within(linha).getAllByRole("cell", { hidden: true })[0]).toHaveTextContent(/Sem contacto/);
  });
  it("«Repor padrão» volta às colunas por omissão", () => {
    guardar("org-1", sem("value"));
    desenhar();
    expect(cabecalhos()).not.toContain("Valor");
    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    fireEvent.click(screen.getByRole("button", { name: "Repor padrão" }));
    expect(cabecalhos()).toContain("Valor");
    expect(window.localStorage.getItem(chaveColunas("org-1"))).toBeNull();
  });
  it("«Pessoa» fica sempre, mesmo com todas as outras escondidas", () => {
    guardar("org-1", escolhaPorOmissao().map((c) => (c.id === "person" ? c : { ...c, visivel: false })));
    desenhar();
    expect(cabecalhos()).toEqual(["Pessoa"]);
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
  });
});

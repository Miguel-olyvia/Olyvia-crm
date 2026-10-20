// Lote C: a página liga os filtros novos à lista (o que se escolhe chega à função) e pesquisa por nome, email e telefone.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
// A «Nova lead» do cabeçalho (P7) tem testes próprios; aqui não interessa. Sem permissão `leads.create`, o botão não se desenha.
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => null }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, hasAnyPermission: () => false, permissions: [], loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const listaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", async (original) => ({
  ...(await original<typeof import("@/hooks/pessoas/useListaPessoas")>()),
  useListaPessoas: (f: FiltrosLista) => listaMock(f),
}));
vi.mock("@/hooks/pessoas/useFormulariosPessoas", () => ({
  useFormulariosPessoas: () => ({ formularios: [{ id: "f-1", nome: "Pedido de orçamento" }], aCarregar: false, erro: false }),
}));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => new Map() }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => new Map() }));

beforeAll(prepararRadixNoJsdom);

const real = (utilizadorId?: string | null): FontePessoas => ({ modo: "real", organizationId: "org-1", momentoGanho: null, utilizadorId });

function desenhar(fonte: FontePessoas = real("u-rui"), lista = listaBase({ linhas: [pessoaLista("a", { nome: "Ana" })] })) {
  listaMock.mockReturnValue(lista);
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}><MemoryRouter><PessoasReal /></MemoryRouter></FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
}
const ultimosFiltros = (): FiltrosLista => listaMock.mock.calls[listaMock.mock.calls.length - 1][0] as FiltrosLista;

beforeEach(() => listaMock.mockReset());

describe("PessoasReal: pesquisa por nome, email e telefone", () => {
  it("o campo, a dica e o rótulo dizem nome, email e telefone, e nunca localidade", () => {
    desenhar();
    expect(screen.getByRole("searchbox", { name: "Procurar pessoas por nome, email ou telefone" })).toBeInTheDocument();
    expect(screen.getByText(/Pesquise por nome, email ou telefone/)).toBeInTheDocument();
    expect(screen.queryByText(/localidade/i)).toBeNull();
  });
});

describe("PessoasReal: filtros ligados à lista", () => {
  it("sem filtros: tudo desligado", () => {
    desenhar();
    expect(ultimosFiltros()).toMatchObject({
      atribuidoA: null, formularioId: null, ultimoResultado: null, voltou: false, atrasada: false,
    });
  });

  it("«Só as minhas» envia o utilizador da sessão; desligar tira-o", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Só as minhas" }));
    expect(ultimosFiltros().atribuidoA).toBe("u-rui");
    fireEvent.click(screen.getByRole("button", { name: "Só as minhas" }));
    expect(ultimosFiltros().atribuidoA).toBeNull();
  });

  it("sem utilizador na fonte, «Só as minhas» está desativado", () => {
    desenhar(real(null));
    expect(screen.getByRole("button", { name: "Só as minhas" })).toBeDisabled();
  });

  it("«Atrasadas» envia atrasada", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    expect(ultimosFiltros().atrasada).toBe(true);
  });

  it("o painel envia voltou, formulário e resultado", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Voltou a contactar" }));
    fireEvent.change(screen.getByLabelText("Formulário"), { target: { value: "f-1" } });
    fireEvent.change(screen.getByLabelText("Resultado do último contacto"), { target: { value: "semContacto" } });
    expect(ultimosFiltros()).toMatchObject({ voltou: true, formularioId: "f-1", ultimoResultado: "semContacto" });
  });

  it("«Limpar filtros» do painel repõe tudo", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Só as minhas" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Voltou a contactar" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(ultimosFiltros()).toMatchObject({ atribuidoA: null, voltou: false, atrasada: false, formularioId: null, ultimoResultado: null });
  });

  it("com um filtro novo ativo e nenhuma pessoa, o estado vazio é o dos filtros (com «Limpar filtros»), não o de lista vazia", () => {
    desenhar(real("u-rui"), listaBase({ linhas: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    listaMock.mockReturnValue(listaBase({ linhas: [] }));
    expect(screen.getByText("Nenhuma pessoa corresponde aos filtros.")).toBeInTheDocument();
  });
});

// A região viva da página anuncia o resultado de mudar um filtro (quantas pessoas, ou nenhuma), para quem não vê a lista a mudar.
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
  useFormulariosPessoas: () => ({ formularios: [], aCarregar: false, erro: false, repetir: vi.fn() }),
}));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => new Map() }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => new Map() }));

beforeAll(prepararRadixNoJsdom);

const fonte: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null, utilizadorId: "u-rui" };
const regiao = () => document.querySelector<HTMLElement>('[role="status"][aria-live="polite"]') as HTMLElement;

function desenhar() {
  listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista("a", { nome: "Ana" }), pessoaLista("b", { nome: "Rui" })] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}><MemoryRouter><PessoasReal /></MemoryRouter></FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => listaMock.mockReset());

describe("PessoasReal: anúncio ao mudar um filtro", () => {
  it("a região viva está sempre montada e diz quantas pessoas há", () => {
    desenhar();
    expect(regiao()).toHaveTextContent("pessoas carregadas: 2");
  });

  it("depois de ligar «Atrasadas» a região diz o novo total", () => {
    desenhar();
    listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista("a", { nome: "Ana" })] }));
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    expect(regiao()).toHaveTextContent("pessoas carregadas: 1");
  });

  it("com o filtro a dar zero pessoas a região diz zero (e o aviso de «nenhuma pessoa» está à vista)", () => {
    desenhar();
    listaMock.mockReturnValue(listaBase({ linhas: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    expect(regiao()).toHaveTextContent("pessoas carregadas: 0");
    expect(screen.getByText("Nenhuma pessoa corresponde aos filtros.")).toBeInTheDocument();
  });
});

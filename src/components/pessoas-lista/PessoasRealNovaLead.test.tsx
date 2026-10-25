// O botão «Nova lead» do cabeçalho da Lista real: só no modo real e só com a permissão `leads.create` (como em Leads); abre a ficha da pessoa
// criada pelo endereço (?open=) e anuncia o resultado na região viva da página. O diálogo em si tem os seus testes (pessoas-leads).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";
import { ATRASO_LIMPAR_MS } from "./useMensagemAnunciada";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const semLeituras = vi.hoisted(() => new Map());
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => semLeituras }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => semLeituras }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));
vi.mock("./FichaReal", () => ({ FichaReal: (p: { children?: unknown }) => p.children }));
const listaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (f: FiltrosLista) => listaMock(f) }));
vi.mock("@/hooks/pessoas/useQuadroPessoas", async () => (await import("./fabricaQuadro")).moduloSemQuadro());
const permissoes = vi.hoisted(() => ({ ativas: new Set<string>(), aCarregar: false }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => permissoes.ativas.has(p), hasAnyPermission: (ps: string[]) => ps.some((p) => permissoes.ativas.has(p)),
    permissions: [...permissoes.ativas], loading: permissoes.aCarregar,
  }),
}));
// O diálogo é de outro ficheiro de testes: aqui só interessa como o cabeçalho o monta e o que faz com o que ele devolve.
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({
  NovaLeadReal: (p: { aoAbrirPessoa: (id: string, origem?: HTMLElement) => void; aoAnunciar: (m: string) => void }) => (
    <button type="button" onClick={(e) => { p.aoAbrirPessoa("33333333-3333-4333-8333-333333333333", e.currentTarget); p.aoAnunciar("Lead criada: Carla."); }}>
      Nova lead
    </button>
  ),
}));

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

function desenhar(fonte: FontePessoas | null = REAL) {
  listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista("a", { nome: "Ana Lopes" })] } as Partial<ListaPessoas>));
  const pagina = <MemoryRouter><PessoasReal /><Local /></MemoryRouter>;
  return render(fonte ? <FontePessoasContext.Provider value={fonte}>{pagina}</FontePessoasContext.Provider> : pagina);
}

beforeEach(() => {
  listaMock.mockReset();
  permissoes.ativas = new Set(["leads.create"]);
  permissoes.aCarregar = false;
});

describe("PessoasReal: o botão «Nova lead»", () => {
  it("com leads.create, no modo real, o cabeçalho tem «Nova lead»", () => {
    desenhar();
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
  });

  it("sem leads.create não há «Nova lead»", () => {
    permissoes.ativas = new Set(["leads.view", "pessoas.view"]);
    desenhar();
    expect(screen.queryByRole("button", { name: "Nova lead" })).toBeNull();
  });

  it("enquanto as permissões carregam não se mostra (nem pisca)", () => {
    permissoes.aCarregar = true;
    desenhar();
    expect(screen.queryByRole("button", { name: "Nova lead" })).toBeNull();
  });

  it("no modo exemplo o cabeçalho fica como estava, mesmo com a permissão", () => {
    desenhar({ modo: "exemplo" });
    expect(screen.queryByRole("button", { name: "Nova lead" })).toBeNull();
    desenhar(null);
    expect(screen.queryByRole("button", { name: "Nova lead" })).toBeNull();
  });

  it("o resultado da «Nova lead» abre a ficha da pessoa pelo endereço e é anunciado na região viva da página", () => {
    desenhar();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Nova lead" })); });
    expect(screen.getByTestId("url").textContent).toContain("open=33333333-3333-4333-8333-333333333333");
    const viva = screen.getByText("Lead criada: Carla.").closest("[aria-live='polite']");
    expect(viva).not.toBeNull();
    expect(viva?.className).toContain("sr-only");
  });

  it("a mensagem da ação tem a sua região viva: a das contagens não é atómica e não a leva, para não voltar a ser lida quando a mensagem se retira", () => {
    vi.useFakeTimers();
    try {
      desenhar();
      const contagens = screen.getAllByText(/pessoas carregadas/).map((e) => e.closest("[aria-live='polite']")).find(Boolean) as HTMLElement;
      expect(contagens).not.toHaveAttribute("aria-atomic", "true");
      const antes = contagens.textContent;
      act(() => { fireEvent.click(screen.getByRole("button", { name: "Nova lead" })); });
      expect(contagens).not.toHaveTextContent("Lead criada");
      expect(contagens.textContent).toBe(antes);
      const acao = screen.getByText("Lead criada: Carla.").closest("[aria-live='polite']") as HTMLElement;
      expect(acao).not.toBe(contagens);
      expect(acao).not.toHaveAttribute("aria-atomic", "true");
      act(() => { vi.advanceTimersByTime(ATRASO_LIMPAR_MS + 100); });
      expect(screen.queryByText("Lead criada: Carla.")).toBeNull();
      expect(contagens.textContent).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });
});

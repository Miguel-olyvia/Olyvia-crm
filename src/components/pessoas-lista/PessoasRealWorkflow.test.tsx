// O botão «Workflow» do cabeçalho da Lista real: só no modo real (organização com o novo fluxo) e só com a permissão `pessoas.config`
// (não com leads.config nem com leads.create). Fica ao lado de «Nova lead», sem a afetar. O diálogo tem os seus testes (pessoas-workflow).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const semLeituras = vi.hoisted(() => new Map());
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => semLeituras }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => semLeituras }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));
vi.mock("./FichaReal", () => ({ FichaReal: () => null }));
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
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => <button type="button">Nova lead</button> }));
vi.mock("@/components/pessoas-workflow/BotaoWorkflowPessoas", () => ({ BotaoWorkflowPessoas: () => <button type="button">Workflow</button> }));

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };

function desenhar(fonte: FontePessoas | null = REAL) {
  listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista("a", { nome: "Ana Lopes" })] } as Partial<ListaPessoas>));
  const pagina = <MemoryRouter><PessoasReal /></MemoryRouter>;
  return render(fonte ? <FontePessoasContext.Provider value={fonte}>{pagina}</FontePessoasContext.Provider> : pagina);
}

beforeEach(() => {
  listaMock.mockReset();
  permissoes.ativas = new Set(["pessoas.config"]);
  permissoes.aCarregar = false;
});

describe("PessoasReal: o botão «Workflow»", () => {
  it("com pessoas.config, no modo real, o cabeçalho tem «Workflow»", () => {
    desenhar();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
  });

  it("sem pessoas.config não há «Workflow», mesmo com leads.config e leads.create (a permissão de Leads não conta)", () => {
    permissoes.ativas = new Set(["leads.config", "leads.create", "pessoas.view", "pessoas.edit"]);
    desenhar();
    expect(screen.queryByRole("button", { name: "Workflow" })).toBeNull();
  });

  it("enquanto as permissões carregam não se mostra (nem pisca)", () => {
    permissoes.aCarregar = true;
    desenhar();
    expect(screen.queryByRole("button", { name: "Workflow" })).toBeNull();
  });

  it("no modo exemplo, ou sem fonte, não há «Workflow» mesmo com a permissão (só organizações com o novo fluxo)", () => {
    desenhar({ modo: "exemplo" });
    expect(screen.queryByRole("button", { name: "Workflow" })).toBeNull();
    desenhar(null);
    expect(screen.queryByRole("button", { name: "Workflow" })).toBeNull();
  });

  it("é independente de «Nova lead»: cada um com a sua permissão", () => {
    permissoes.ativas = new Set(["pessoas.config", "leads.create"]);
    const { unmount } = desenhar();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
    unmount();
    permissoes.ativas = new Set(["leads.create"]);
    desenhar();
    expect(screen.queryByRole("button", { name: "Workflow" })).toBeNull();
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
  });

  it("«Nova lead» continua depois dos botões que já existiam, e «Workflow» vem depois dela (a ordem de Leads)", () => {
    permissoes.ativas = new Set(["pessoas.config", "leads.create"]);
    desenhar();
    const botoes = screen.getAllByRole("button").map((b) => b.textContent);
    expect(botoes.indexOf("Nova lead")).toBeGreaterThanOrEqual(0);
    expect(botoes.indexOf("Workflow")).toBeGreaterThan(botoes.indexOf("Nova lead"));
  });
});

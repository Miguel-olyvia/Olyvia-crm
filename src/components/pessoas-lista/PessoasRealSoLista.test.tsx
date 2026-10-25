// A página /pessoas é SÓ a lista: sem seletor de vista, sem Quadro (o Quadro vive em /pipeline).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { CHAVE_PREFS_PESSOAS } from "@/components/pessoas/preferenciasPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => <p>NOVA-LEAD</p> }));
vi.mock("@/components/pessoas-workflow/BotaoWorkflowPessoas", () => ({ BotaoWorkflowPessoas: () => <p>WORKFLOW</p> }));
const permissoes = vi.hoisted(() => ({ lista: new Set<string>(["pessoas.view", "leads.create", "pessoas.config"]) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => permissoes.lista.has(p), hasAnyPermission: (ps: string[]) => ps.some((p) => permissoes.lista.has(p)),
    permissions: [], loading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const semLeituras = vi.hoisted(() => new Map());
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => semLeituras }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => semLeituras }));
const listaMock = vi.hoisted(() => vi.fn());
const quadroMock = vi.hoisted(() => vi.fn());
const fichaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (f: FiltrosLista, ativo?: boolean) => listaMock(f, ativo) }));
vi.mock("@/hooks/pessoas/useQuadroPessoas", () => ({ useQuadroPessoas: (...a: unknown[]) => quadroMock(...a) }));
vi.mock("@/hooks/pessoas/useFormulariosPessoas", () => ({ useFormulariosPessoas: () => ({ formularios: [], aCarregar: false, erro: false }) }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));
vi.mock("./FichaReal", () => ({
  FichaReal: (p: { pessoaId: string | null; children?: unknown }) => { fichaMock(p); return p.children; },
}));

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const ultima = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1];

function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

function desenhar() {
  return render(
    <FontePessoasContext.Provider value={REAL}>
      <MemoryRouter initialEntries={["/pessoas"]}><PessoasReal /><Local /></MemoryRouter>
    </FontePessoasContext.Provider>,
  );
}

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  window.localStorage.clear();
  permissoes.lista = new Set(["pessoas.view", "leads.create", "pessoas.config"]);
  listaMock.mockReset().mockReturnValue(listaBase({ linhas: [pessoaLista("a", { nome: "Ana Lopes" })] } as Partial<ListaPessoas>));
  quadroMock.mockReset();
  fichaMock.mockReset();
});

describe("PessoasReal: só a lista", () => {
  it("não tem seletor de vista nem Quadro, mesmo com um «quadro» guardado e pessoas.view", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
    desenhar();
    expect(screen.queryByRole("button", { name: "Quadro" })).toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Orçamento/ })).toBeNull();
  });

  it("consulta sempre a lista (ativo true) e nunca o quadro", () => {
    desenhar();
    expect(ultima(listaMock)[1]).toBe(true);
    expect(quadroMock).not.toHaveBeenCalled();
  });

  it("mantém os filtros de etapa, os extra e as colunas", () => {
    desenhar();
    expect(screen.getByRole("group", { name: "Filtrar por etapa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Colunas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visita" }));
    expect((ultima(listaMock)[0] as FiltrosLista).etapa).toBe("visitaMarcada");
  });

  it("anuncia a contagem numa região live e abre a ficha pelo endereço", () => {
    desenhar();
    expect(screen.getAllByRole("status").some((e) => e.textContent?.includes("pessoas carregadas: 1"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Ana Lopes/ }));
    expect(screen.getByTestId("url").textContent).toBe("/pessoas?open=a");
    expect(ultima(fichaMock)[0].pessoaId).toBe("a");
  });

  it("o cabeçalho tem a ligação para /pessoas e as ações com as mesmas permissões", () => {
    desenhar();
    expect(screen.getByText("NOVA-LEAD")).toBeInTheDocument();
    expect(screen.getByText("WORKFLOW")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('href="/leads"');
  });

  it("sem leads.create e pessoas.config as ações não aparecem", () => {
    permissoes.lista = new Set(["pessoas.view"]);
    desenhar();
    expect(screen.queryByText("NOVA-LEAD")).toBeNull();
    expect(screen.queryByText("WORKFLOW")).toBeNull();
  });
});

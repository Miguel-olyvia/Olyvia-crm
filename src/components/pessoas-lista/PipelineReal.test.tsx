// A página real do Pipeline (/pipeline): só o Quadro, com pesquisa, tipo e ordem. Ficha, Nova lead e Workflow como na lista.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { FiltrosQuadro } from "@/hooks/pessoas/quadroPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { cartaoQuadro, quadroBase } from "./fabricaQuadro";
import { PipelineReal } from "./PipelineReal";

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
const listaMock = vi.hoisted(() => vi.fn());
const quadroMock = vi.hoisted(() => vi.fn());
const fichaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (...a: unknown[]) => listaMock(...a) }));
vi.mock("@/hooks/pessoas/useQuadroPessoas", () => ({ useQuadroPessoas: (f: FiltrosQuadro, ativo?: boolean) => quadroMock(f, ativo) }));
vi.mock("./FichaReal", () => ({
  FichaReal: (p: { pessoaId: string | null; idsVisiveis: string[]; negocioInicial: string | null; children?: unknown }) => { fichaMock(p); return p.children; },
}));

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const CARTOES = [
  cartaoQuadro("a", { nome: "Ana Lopes" }),
  cartaoQuadro("b", { nome: "Bruno Reis", coluna: "visita" }),
  cartaoQuadro("n1", { id: "neg-1", tipo: "negocio", pessoaId: "dono-1", nome: "Carla Dias", coluna: "orcamento", trabalho: "Cozinha", valor: 900, passo: "criarProposta" }),
  cartaoQuadro("n2", { id: "neg-2", tipo: "negocio", pessoaId: "dono-1", nome: "Carla Dias", coluna: "proposta", trabalho: "Sala", valor: 100, passo: "esperarCliente" }),
];
const anunciado = (texto: string) => screen.getAllByRole("status").some((e) => e.textContent?.includes(texto));
const ultima = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1];

function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}
const url = () => screen.getByTestId("url").textContent;

function desenhar() {
  return render(
    <FontePessoasContext.Provider value={REAL}>
      <MemoryRouter initialEntries={["/pipeline"]}><PipelineReal /><Local /></MemoryRouter>
    </FontePessoasContext.Provider>,
  );
}

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  window.localStorage.clear();
  permissoes.lista = new Set(["pessoas.view", "leads.create", "pessoas.config"]);
  listaMock.mockReset();
  quadroMock.mockReset().mockReturnValue(quadroBase({}, CARTOES));
  fichaMock.mockReset();
});

describe("PipelineReal: só o quadro", () => {
  it("mostra as 3 colunas da abordagem e a coluna Negócio (sem sub-fases), sem tabela nem seletor de vista, e o título Pipeline", () => {
    desenhar();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lista" })).toBeNull();
    // 3 colunas de abordagem + a coluna única Negócio.
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Pipeline" })).toBeInTheDocument();
  });

  it("as colunas vêm por ordem: Novo, Contactado, Visita e Negócio", () => {
    desenhar();
    const nomes = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label") ?? r.textContent ?? "");
    expect(nomes[0]).toMatch(/^Novo/);
    expect(nomes[2]).toMatch(/^Visita/);
    expect(nomes[3]).toMatch(/^Negócio/);
    expect(nomes).toHaveLength(4);
  });

  it("usa useQuadroPessoas(filtros, true) e nunca a lista", () => {
    desenhar();
    expect(ultima(quadroMock)[1]).toBe(true);
    expect(ultima(quadroMock)[0]).toEqual({ papel: null, pesquisa: "", ordem: "recentes" });
    expect(listaMock).not.toHaveBeenCalled();
  });

  it("filtros só de pesquisa, tipo e ordem: sem etapa, sem filtros extra, sem colunas", () => {
    desenhar();
    expect(screen.queryByRole("group", { name: "Filtrar por etapa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Colunas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Atrasadas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "nome" } });
    expect(ultima(quadroMock)[0]).toEqual({ papel: "cliente", pesquisa: "", ordem: "nome" });
  });

  it("a contagem é a dos cartões carregados, anunciada numa região live", () => {
    desenhar();
    expect(screen.getAllByText("cartões carregados: 4").length).toBeGreaterThan(0);
    expect(anunciado("cartões carregados: 4")).toBe(true);
  });

  it("carregar, erro e vazio ficam anunciados", () => {
    quadroMock.mockReturnValue(quadroBase({ isLoading: true }, []));
    const a = desenhar();
    expect(anunciado("A carregar o quadro...")).toBe(true);
    a.unmount();
    quadroMock.mockReturnValue(quadroBase({ isError: true, erroSemDados: true }, []));
    const b = desenhar();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    b.unmount();
    quadroMock.mockReturnValue(quadroBase({}, []));
    desenhar();
    expect(screen.getByText("Ainda não há cartões no quadro.")).toBeInTheDocument();
  });
});

describe("PipelineReal: a ficha aberta a partir do quadro", () => {
  it("abre a pessoa pelo endereço, com o negócio, e passa à ficha os ids únicos pela ordem das colunas", () => {
    desenhar();
    const coluna = screen.getByRole("region", { name: /^Negócio/ });
    // A mesma pessoa tem dois negócios na coluna: o botão do primeiro leva o id dele.
    const botoes = within(coluna).getAllByRole("button", { name: "Abrir a ficha de Carla Dias" });
    fireEvent.click(botoes.find((b) => b.getAttribute("data-negocio-id") === "neg-1")!);
    expect(url()).toBe("/pipeline?open=dono-1&negocio=neg-1");
    expect(ultima(fichaMock)[0].idsVisiveis).toEqual(["a", "b", "dono-1"]);
    expect(ultima(fichaMock)[0].pessoaId).toBe("dono-1");
  });

  it("abrir um cartão da abordagem põe ?open= e ?negocio=: o assistente recebe sempre o negócio", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" }));
    expect(url()).toBe("/pipeline?open=a&negocio=neg-a");
    expect(ultima(fichaMock)[0].negocioInicial).toBe("neg-a");
  });
});

describe("PipelineReal: ações do cabeçalho", () => {
  it("Nova lead só com leads.create e Workflow só com pessoas.config", () => {
    desenhar();
    expect(screen.getByText("NOVA-LEAD")).toBeInTheDocument();
    expect(screen.getByText("WORKFLOW")).toBeInTheDocument();
  });

  it("sem essas permissões não aparecem", () => {
    permissoes.lista = new Set(["pessoas.view"]);
    desenhar();
    expect(screen.queryByText("NOVA-LEAD")).toBeNull();
    expect(screen.queryByText("WORKFLOW")).toBeNull();
  });
});

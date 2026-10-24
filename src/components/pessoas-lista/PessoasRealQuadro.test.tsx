// A página real das Pessoas com o Quadro: o seletor de vista, a permissão, os filtros partilhados e o que fica de fora no Quadro.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { FiltrosQuadro } from "@/hooks/pessoas/quadroPessoasTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { CHAVE_PREFS_PESSOAS } from "@/components/pessoas/preferenciasPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { cartaoQuadro, quadroBase } from "./fabricaQuadro";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/components/pessoas-leads/NovaLeadReal", () => ({ NovaLeadReal: () => null }));
const permissoes = vi.hoisted(() => ({ ver: true, carregando: false }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => p === "pessoas.view" && permissoes.ver, hasAnyPermission: () => false, permissions: [], loading: permissoes.carregando }),
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
vi.mock("@/hooks/pessoas/useQuadroPessoas", () => ({ useQuadroPessoas: (f: FiltrosQuadro, ativo?: boolean) => quadroMock(f, ativo) }));
vi.mock("@/hooks/pessoas/useFormulariosPessoas", () => ({ useFormulariosPessoas: () => ({ formularios: [], aCarregar: false, erro: false }) }));
vi.mock("@/components/pessoas/AvatarPessoa", () => ({ AvatarPessoa: () => null }));
vi.mock("./FichaReal", () => ({
  FichaReal: (p: { pessoaId: string | null; idsVisiveis: string[]; negocioInicial: string | null }) => { fichaMock(p); return null; },
}));

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const CARTOES = [
  cartaoQuadro("a", { nome: "Ana Lopes" }),
  cartaoQuadro("b", { nome: "Bruno Reis", coluna: "visita" }),
  cartaoQuadro("n1", { id: "neg-1", tipo: "negocio", pessoaId: "dono-1", nome: "Carla Dias", coluna: "orcamento", trabalho: "Cozinha", valor: 900, passo: "criarProposta" }),
  cartaoQuadro("n2", { id: "neg-2", tipo: "negocio", pessoaId: "dono-1", nome: "Carla Dias", coluna: "proposta", trabalho: "Sala", valor: 100, passo: "esperarCliente" }),
];
const ultima = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1];

function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}
const url = () => screen.getByTestId("url").textContent;

function desenhar(fonte: FontePessoas = REAL) {
  return render(
    <FontePessoasContext.Provider value={fonte}>
      <MemoryRouter initialEntries={["/pessoas"]}><PessoasReal /><Local /></MemoryRouter>
    </FontePessoasContext.Provider>,
  );
}
const irParaQuadro = () => fireEvent.click(screen.getByRole("button", { name: "Quadro" }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  window.localStorage.clear();
  permissoes.ver = true;
  permissoes.carregando = false;
  listaMock.mockReset().mockReturnValue(listaBase({ linhas: [pessoaLista("a", { nome: "Ana Lopes" })] } as Partial<ListaPessoas>));
  quadroMock.mockReset().mockReturnValue(quadroBase({}, CARTOES));
  fichaMock.mockReset();
});

describe("PessoasReal: quem vê o seletor de vista", () => {
  it("modo real com pessoas.view: tem Lista e Quadro, começa na Lista", () => {
    desenhar();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Novo/ })).toBeNull();
  });

  it("sem pessoas.view não há seletor, mesmo em modo real", () => {
    permissoes.ver = false;
    desenhar();
    expect(screen.queryByRole("button", { name: "Quadro" })).toBeNull();
  });

  it("no modo exemplo (sem base) não há seletor", () => {
    desenhar({ modo: "exemplo" });
    expect(screen.queryByRole("button", { name: "Quadro" })).toBeNull();
  });

  it("uma vista «quadro» guardada não vale sem permissão nem sem base", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
    permissoes.ver = false;
    desenhar();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(ultima(quadroMock)[1]).toBe(false);
  });
});

describe("PessoasReal: a vista guardada enquanto as permissões carregam", () => {
  it("com «quadro» guardado não cai na Lista nem a consulta: espera, diz que carrega e só depois consulta o Quadro", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
    permissoes.carregando = true;
    permissoes.ver = false;
    const ui = desenhar();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("A carregar o quadro...")).toBeInTheDocument();
    expect(listaMock.mock.calls.every((c) => c[1] === false)).toBe(true);
    expect(quadroMock.mock.calls.every((c) => c[1] === false)).toBe(true);
    permissoes.carregando = false;
    permissoes.ver = true;
    ui.rerender(
      <FontePessoasContext.Provider value={REAL}>
        <MemoryRouter initialEntries={["/pessoas"]}><PessoasReal /><Local /></MemoryRouter>
      </FontePessoasContext.Provider>,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(ultima(quadroMock)[1]).toBe(true);
    expect(ultima(listaMock)[1]).toBe(false);
  });

  it("com «lista» (ou nada) guardado a Lista consulta logo, sem esperar pelas permissões", () => {
    permissoes.carregando = true;
    permissoes.ver = false;
    desenhar();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(ultima(listaMock)[1]).toBe(true);
  });
});

describe("PessoasReal: o Quadro", () => {
  it("alternar para o Quadro mostra as colunas, tira a tabela e só o Quadro consulta", () => {
    desenhar();
    expect(ultima(listaMock)[1]).not.toBe(false);
    expect(ultima(quadroMock)[1]).toBe(false);
    irParaQuadro();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    expect(ultima(listaMock)[1]).toBe(false);
    expect(ultima(quadroMock)[1]).toBe(true);
  });

  it("alternar mantém o tipo e a ordem, e entrar no Quadro limpa a etapa", () => {
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Clientes" }));
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "nome" } });
    fireEvent.click(screen.getByRole("button", { name: "Visita" }));
    expect((ultima(listaMock)[0] as FiltrosLista).etapa).toBe("visitaMarcada");
    irParaQuadro();
    expect(ultima(quadroMock)[0]).toEqual({ papel: "cliente", pesquisa: "", ordem: "nome" });
    expect((ultima(listaMock)[0] as FiltrosLista).etapa).toBeNull();
    expect(screen.queryByRole("group", { name: "Filtrar por etapa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect((ultima(listaMock)[0] as FiltrosLista)).toMatchObject({ papel: "cliente", ordem: "nome", etapa: null });
  });

  it("entrar no Quadro desliga os filtros que só a Lista aplica (só as minhas, atrasadas, voltou): ficavam ativos sem se verem", () => {
    desenhar({ ...REAL, utilizadorId: "u-rui" });
    fireEvent.click(screen.getByRole("button", { name: "Só as minhas" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Voltou a contactar" }));
    expect(ultima(listaMock)[0] as FiltrosLista).toMatchObject({ atribuidoA: "u-rui", atrasada: true, voltou: true });
    irParaQuadro();
    expect(ultima(listaMock)[0] as FiltrosLista).toMatchObject({ atribuidoA: null, atrasada: false, voltou: false, formularioId: null, ultimoResultado: null });
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("button", { name: "Só as minhas" })).toHaveAttribute("aria-pressed", "false");
  });

  it("no Quadro não há filtros extra nem colunas da lista nem «Carregar mais» da lista", () => {
    listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista("a")], haMais: true } as Partial<ListaPessoas>));
    desenhar();
    expect(screen.getByRole("button", { name: "Colunas" })).toBeInTheDocument();
    irParaQuadro();
    expect(screen.queryByRole("button", { name: "Colunas" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Carregar mais$/ })).toBeNull();
  });

  it("a vista escolhida guarda-se e volta na visita seguinte", () => {
    const { unmount } = desenhar();
    irParaQuadro();
    expect(JSON.parse(window.localStorage.getItem(CHAVE_PREFS_PESSOAS) ?? "{}").vista).toBe("quadro");
    unmount();
    desenhar();
    expect(screen.getAllByRole("region")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a coluna «Novo» e os cartões vêm do hook; a contagem do cabeçalho é a dos cartões carregados", () => {
    desenhar();
    irParaQuadro();
    expect(screen.getByRole("region", { name: /^Novo/ })).toBeInTheDocument();
    expect(screen.getAllByText("cartões carregados: 4").length).toBeGreaterThan(0);
  });
});

describe("PessoasReal: a ficha aberta a partir do Quadro", () => {
  it("abre a pessoa pelo endereço, com o negócio, e passa à ficha os ids únicos pela ordem das colunas", () => {
    desenhar();
    irParaQuadro();
    const coluna = screen.getByRole("region", { name: /^Orçamento/ });
    fireEvent.click(within(coluna).getByRole("button", { name: "Abrir a ficha de Carla Dias" }));
    expect(url()).toBe("/pessoas?open=dono-1&negocio=neg-1");
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    expect(ultima(fichaMock)[0].idsVisiveis).toEqual(["a", "b", "dono-1"]);
  });

  it("abrir uma pessoa em abordagem põe só ?open=", () => {
    desenhar();
    irParaQuadro();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" }));
    expect(url()).toBe("/pessoas?open=a");
  });
});

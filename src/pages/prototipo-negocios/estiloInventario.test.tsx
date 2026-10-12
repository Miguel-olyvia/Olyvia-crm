// Negócios V2 e Pessoas V2 com o estilo do Inventário: cabeçalho com migalhas e título, faixa de KPIs e Fila de trabalho cujos números batem com as listas,
// "Abrir lista filtrada" que aplica o filtro, e a Atual e a V2 funcional sem nada disto. O ecrã "Mockup · cobertura" já não existe.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { NegociosV2, esquecerNegociosV2 } from "./NegociosV2";
import { NegociosFunc, esquecerNegociosFunc } from "./NegociosFunc";
import { PessoasFunc, esquecerPessoasFunc } from "./PessoasFunc";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";
import { LeadsSimples } from "./LeadsSimples";
import { cartoesV2 } from "./negociosDocs";
import { SEM_FILTROS_N, linhasNegocios, selecionarQuadro } from "./filtrosNegocios";
import { SEM_FILTROS_P, linhasDe, selecionar } from "./filtrosPessoas";
import { filaNegocios } from "./filaNegocios";
import { filaPessoas } from "./filaPessoas";
import { NOME_ABA, TITULOS } from "./inventario/menuInv";

const original = window.matchMedia;
const ecra = (largo: boolean): void => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: largo, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
};
const props = (S: Estado) => {
  const run = (fn: () => void) => fn();
  return { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn), q: "", setQ: vi.fn(), repor: vi.fn() };
};
const negocios = (S: Estado) => render(<NegociosV2 {...props(S)} />);
const pessoas = (S: Estado) => render(<PessoasSimples {...props(S)} />);
const separador = (nome: string): void => { fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 }); };
const fila = (): HTMLElement[] => within(screen.getByRole("region", { name: "Fila de trabalho" })).getAllByRole("button");
const numero = (cartao: HTMLElement): number => Number(cartao.querySelector(".qn")!.textContent);
/** Os cartões desenhados nas quatro colunas do computador (a coluna do telemóvel repete uma delas, por isso não se conta). */
const cartoesQuadro = (c: HTMLElement): number => c.querySelectorAll('section[aria-labelledby$="-d"] > ul > li:not([class*="border-dashed"])').length;
const linhasTabela = (): number => within(screen.getByRole("table")).getAllByRole("row").length - 1;

beforeEach(() => { esquecerPessoas(); esquecerNegociosFunc(); esquecerPessoasFunc(); ecra(true); });
afterEach(() => { cleanup(); window.matchMedia = original; });

describe("o ecrã Mockup · cobertura já não existe", () => {
  it("não há título nem nome dele no inventário", () => {
    expect(Object.keys(TITULOS)).not.toContain("cov");
    expect(Object.keys(NOME_ABA)).not.toContain("cov");
    expect(JSON.stringify(TITULOS)).not.toMatch(/cobertura/i);
  });
});

describe("Negócios V2 · cabeçalho", () => {
  it("tem as migalhas, o título e o subtítulo, e a migalha acompanha o separador", () => {
    const { container } = negocios(seed());
    expect(screen.getByRole("heading", { level: 1, name: "Negócios" })).toBeInTheDocument();
    expect(container.querySelector(".crumbs")).toHaveTextContent("Negócios › Quadro");
    expect(container.querySelector("header p")).toHaveTextContent(`${cartoesV2(seed()).length} no Quadro`);
    separador("Dashboard");
    expect(container.querySelector(".crumbs")).toHaveTextContent("Negócios › Dashboard");
    expect(screen.queryByRole("region", { name: "Fila de trabalho" })).toBeNull();
  });
  it("as ações estão no cabeçalho e nenhuma é primária (um negócio nasce na pessoa)", () => {
    const { container } = negocios(seed());
    const botoes = [...container.querySelectorAll<HTMLElement>(".ph-actions button")];
    expect(botoes.map((b) => b.textContent)).toEqual(["Ver em Clientes", "Ver em Operações"]);
    expect(botoes.some((b) => b.className.includes("bg-primary"))).toBe(false);
  });
});

describe("Negócios V2 · KPIs e Fila de trabalho batem com o Quadro", () => {
  it("o KPI No Quadro é o total de cartões, e cada número da fila é o do Quadro que o clique abre", () => {
    const S0 = seed();
    const { container } = negocios(S0);
    const faixa = within(screen.getByRole("region", { name: "Resumo dos negócios" }));
    expect(faixa.getByRole("button", { name: /Ver no Quadro: \d+ negócios$/ }).querySelector(".kv")!.textContent).toBe(String(cartoesV2(S0).length));
    expect(cartoesQuadro(container)).toBe(cartoesV2(S0).length);
    const nomes = fila().map((c) => c.querySelector(".qt")!.textContent);
    expect(nomes).toEqual(["Para enviar", "À espera do cliente", "Por assinar", "Em Financeiro", "Parados há mais de 7 dias", "Com atraso"]);
    let algumNaoVazio = false;
    nomes.forEach((_, i) => {
      cleanup(); esquecerNegociosV2();
      const r = negocios(seed());
      const cartao = fila()[i], n = numero(cartao);
      algumNaoVazio ||= n > 0;
      fireEvent.click(cartao);
      expect(cartoesQuadro(r.container)).toBe(n);
    });
    expect(algumNaoVazio).toBe(true);
  });
  it("Abrir lista filtrada aplica o filtro: aparece como filtro ativo e só ficam os cartões da fase", () => {
    const { container } = negocios(seed());
    const porEnviar = fila().find((c) => c.querySelector(".qt")!.textContent === "Para enviar")!;
    expect(porEnviar).toHaveTextContent("Abrir lista filtrada");
    fireEvent.click(porEnviar);
    expect(within(screen.getByRole("group", { name: "Filtros ativos" })).getByRole("button", { name: "Tirar o filtro: Fase: Orçamento" })).toBeInTheDocument();
    expect(container.querySelectorAll('section[aria-labelledby="v2-col-proposta-d"] > ul > li:not([class*="border-dashed"])')).toHaveLength(0);
    expect(cartoesQuadro(container)).toBe(container.querySelectorAll('section[aria-labelledby="v2-col-orcamento-d"] > ul > li:not([class*="border-dashed"])').length);
  });
  it("a função pura conta o mesmo que o Quadro depois de aplicar o filtro", () => {
    const S = seed(), linhas = linhasNegocios(S), ctx = { rapido: S.filtro, q: "", f: SEM_FILTROS_N };
    expect(filaNegocios(linhas, ctx).map((i) => i.n)).toEqual(
      [{ f: { fase: "orcamento" } }, { f: { fase: "proposta" } }, { f: { fase: "contrato" } }, { f: { fase: "financeiro" } }, { f: { parado: "mais7" } }, { rapido: "atraso" }]
        .map((a) => selecionarQuadro(linhas, { ...ctx, rapido: ("rapido" in a ? a.rapido : ctx.rapido) as string, f: { ...SEM_FILTROS_N, ...("f" in a ? a.f : {}) } as typeof SEM_FILTROS_N }).length));
  });
});

describe("Pessoas V2 · cabeçalho", () => {
  it("tem as migalhas, o título, o subtítulo e uma só ação, a primária", () => {
    const { container } = pessoas(seed());
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
    expect(container.querySelector(".crumbs")).toHaveTextContent("Pessoas › Lista");
    expect(container.querySelector("header p")).toHaveTextContent("14 leads e 5 clientes, mais 2 perdidas");
    const acoes = [...container.querySelectorAll<HTMLElement>(".ph-actions button")];
    expect(acoes.map((b) => b.textContent)).toEqual(["Nova lead"]);
    expect(acoes[0].className).toContain("bg-primary");
    separador("Dashboard");
    expect(container.querySelector(".crumbs")).toHaveTextContent("Pessoas › Dashboard");
    expect(screen.queryByRole("region", { name: "Fila de trabalho" })).toBeNull();
  });
});

describe("Pessoas V2 · KPIs e Fila de trabalho batem com a Lista", () => {
  it("cada cartão da fila mostra o número da lista que abre, e a lista fica filtrada", () => {
    const nomes = (pessoas(seed()), fila().map((c) => c.querySelector(".qt")!.textContent));
    expect(nomes).toEqual(["Por contactar", "Voltaram a contactar", "Com visita", "Atrasadas", "Perdidas"]);
    nomes.forEach((_, i) => {
      cleanup(); esquecerPessoas();
      pessoas(seed());
      const cartao = fila()[i], n = numero(cartao);
      fireEvent.click(cartao);
      if (n > 0) expect(linhasTabela()).toBe(n);
      else expect(screen.getByText("Nenhuma pessoa com este filtro.")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(n === 0 ? "Nenhuma pessoa" : n === 1 ? "1 pessoa" : `${n} pessoas`);
    });
  });
  it("Abrir lista filtrada liga o chip Por contactar", () => {
    pessoas(seed());
    fireEvent.click(fila()[0]);
    expect(within(screen.getByRole("group", { name: "Mostrar" })).getByRole("button", { name: /^Por contactar/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("os KPIs que contam pessoas são o número de linhas da lista que abrem", () => {
    pessoas(seed());
    const faixa = (): HTMLElement => screen.getByRole("region", { name: "Resumo das pessoas" });
    const rotulos = within(faixa()).getAllByRole("button").map((b) => b.getAttribute("aria-label")!);
    expect(rotulos).toHaveLength(6);
    expect(within(faixa()).getAllByRole("button")[0].querySelector(".kv")!.textContent).toBe("14");
    rotulos.forEach((rotulo, i) => {
      cleanup(); esquecerPessoas();
      pessoas(seed());
      const botao = within(faixa()).getAllByRole("button")[i];
      expect(botao.getAttribute("aria-label")).toBe(rotulo);
      const n = Number(botao.querySelector(".kv")!.textContent);
      fireEvent.click(botao);
      expect(linhasTabela()).toBe(n);
    });
  });
  it("nos clientes só há os cartões que fazem sentido (atrasadas e negócio novo) e a função pura bate com a lista", () => {
    const S = seed(), linhas = linhasDe(S);
    expect(filaPessoas(linhas, "clientes", SEM_FILTROS_P).map((i) => i.id)).toEqual(["atrasadas", "novo"]);
    const todas = filaPessoas(linhas, "todos", SEM_FILTROS_P);
    expect(todas.map((i) => i.n)).toEqual([
      selecionar(linhas, "todos", { ...SEM_FILTROS_P, porContactar: true }).length, selecionar(linhas, "todos", { ...SEM_FILTROS_P, voltou: true }).length,
      selecionar(linhas, "todos", { ...SEM_FILTROS_P, visita: true }).length, selecionar(linhas, "todos", { ...SEM_FILTROS_P, atrasadas: true }).length,
      selecionar(linhas, "todos", { ...SEM_FILTROS_P, novoNegocio: true }).length, selecionar(linhas, "todos", { ...SEM_FILTROS_P, estado: "perdidas" }).length,
    ]);
  });
});

describe("a Atual e a V2 funcional não mudam", () => {
  it("a V2 funcional de Negócios e de Pessoas não tem migalhas, KPIs nem fila de trabalho", () => {
    const a = render(<NegociosFunc {...props(seed())} />);
    expect(a.container.querySelector(".pg-root, .crumbs, .qcard, .kpi")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Negócios · dia a dia" })).toBeInTheDocument();
    cleanup();
    const b = render(<PessoasFunc {...props(seed())} />);
    expect(b.container.querySelector(".pg-root, .crumbs, .qcard, .kpi")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas · dia a dia" })).toBeInTheDocument();
  });
  it("a Atual (LeadsSimples) mantém o cabeçalho de sempre", () => {
    const { container } = render(<LeadsSimples {...props(seed())} />);
    expect(container.querySelector(".pg-root, .crumbs, .qcard, .kpi")).toBeNull();
    expect(container.querySelector("header p")).toHaveTextContent("pessoas ainda sem contrato");
  });
});

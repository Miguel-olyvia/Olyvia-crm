// Negócios V2 e Pessoas V2 com o estilo do Inventário, mais leves: cabeçalho com migalhas, resumo numa linha, chips de vista rápida cujos números batem com as listas,
// a vista Lista de Negócios (uma linha por negócio, ordenável), e a Atual e a V2 funcional sem nada disto. O ecrã "Mockup · cobertura" já não existe.
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
import { vistasNegocios } from "./filaNegocios";
import { vistasPessoas } from "./filaPessoas";
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

describe("Negócios V2 · cabeçalho e resumo numa linha", () => {
  it("tem as migalhas, o título e o resumo, e a migalha acompanha o separador e a vista", () => {
    const S = seed();
    const { container } = negocios(S);
    expect(screen.getByRole("heading", { level: 1, name: "Negócios" })).toBeInTheDocument();
    expect(container.querySelector(".crumbs")).toHaveTextContent("Negócios › Quadro");
    expect(container.querySelector("header p")).toHaveTextContent(new RegExp(`^${cartoesV2(S).length} no Quadro · .* € em proposta · \\d+ por fechar · \\d+ % de conversão$`));
    expect(container.querySelector(".kpi, .qcard")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(container.querySelector(".crumbs")).toHaveTextContent("Negócios › Lista");
    separador("Dashboard");
    expect(container.querySelector(".crumbs")).toHaveTextContent("Negócios › Dashboard");
    expect(screen.queryByRole("group", { name: "Vistas rápidas" })).toBeNull();
  });
  it("as ações estão no cabeçalho e nenhuma é primária", () => {
    const { container } = negocios(seed());
    const botoes = [...container.querySelectorAll<HTMLElement>(".ph-actions button")];
    expect(botoes.map((b) => b.textContent)).toEqual(["Ver em Clientes", "Ver em Operações"]);
    expect(botoes.some((b) => b.className.includes("bg-primary"))).toBe(false);
  });
});

describe("Negócios V2 · chips de vista rápida", () => {
  const chips = (): HTMLElement[] => within(screen.getByRole("group", { name: "Vistas rápidas" })).getAllByRole("button");
  const contagem = (b: HTMLElement): number => Number(b.textContent!.match(/(\d+)$/)![1]);
  it("estão numa só linha com a contagem e cada um deixa no Quadro o número que mostra; clicar outra vez desliga", () => {
    const total = cartoesV2(seed()).length;
    const { container } = negocios(seed());
    const nomes = chips().map((c) => c.textContent!.replace(/\s*\d+$/, ""));
    expect(nomes).toEqual(["Para enviar", "À espera do cliente", "Por assinar", "Em Financeiro", "Parados 7+", "Com atraso"]);
    let algumNaoVazio = false;
    nomes.forEach((_, i) => {
      cleanup(); esquecerNegociosV2();
      const S = seed(), r = negocios(S);
      // O "Com atraso" muda o Estado (S.filtro), que fora do teste volta a desenhar a página: aqui desenha-se à mão.
      const redesenhar = (): void => r.rerender(<NegociosV2 {...props(S)} />);
      const chip = chips()[i], n = contagem(chip);
      algumNaoVazio ||= n > 0;
      fireEvent.click(chip); redesenhar();
      expect(cartoesQuadro(r.container)).toBe(n);
      expect(chips()[i]).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(chips()[i]); redesenhar();
      expect(chips()[i]).toHaveAttribute("aria-pressed", "false");
      expect(cartoesQuadro(r.container)).toBe(total);
    });
    expect(algumNaoVazio).toBe(true);
    expect(container).toBeTruthy();
  });
  it("a função pura conta o mesmo que o Quadro depois de aplicar o filtro", () => {
    const S = seed(), linhas = linhasNegocios(S), ctx = { rapido: S.filtro, q: "", f: SEM_FILTROS_N };
    const esperado = [{ fase: "orcamento" }, { fase: "proposta" }, { fase: "contrato" }, { fase: "financeiro" }, { parado: "mais7" }]
      .map((f) => selecionarQuadro(linhas, { ...ctx, f: { ...SEM_FILTROS_N, ...f } as typeof SEM_FILTROS_N }).length);
    esperado.push(selecionarQuadro(linhas, { ...ctx, rapido: "atraso" }).length);
    expect(vistasNegocios(linhas, ctx).map((i) => i.n)).toEqual(esperado);
  });
});

describe("Negócios V2 · vista Lista", () => {
  const modo = (nome: "Quadro" | "Lista"): void => { fireEvent.click(within(screen.getByRole("group", { name: "Ver os negócios como" })).getByRole("button", { name: nome })); };
  it("o seletor tem aria-pressed, a Lista tem uma linha por negócio e as colunas pedidas, e a escolha fica na sessão", () => {
    const total = cartoesV2(seed()).length;
    negocios(seed());
    expect(within(screen.getByRole("group", { name: "Ver os negócios como" })).getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    modo("Lista");
    expect(within(screen.getByRole("group", { name: "Ver os negócios como" })).getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("table")).getAllByRole("columnheader").map((c) => c.textContent?.replace(/[▲▼]/g, ""))).toEqual(
      ["Pessoa ou empresa", "Serviço", "Fase", "Valor", "Parado há", "Próximo passo", "Comercial"]);
    expect(linhasTabela()).toBe(total);
    cleanup();
    negocios(seed());
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("a pesquisa e os filtros valem para a Lista como para o Quadro", () => {
    negocios(seed());
    modo("Lista");
    fireEvent.click(within(screen.getByRole("group", { name: "Vistas rápidas" })).getByRole("button", { name: /^Por assinar/ }));
    const n = Number(within(screen.getByRole("group", { name: "Vistas rápidas" })).getByRole("button", { name: /^Por assinar/ }).textContent!.match(/(\d+)$/)![1]);
    expect(linhasTabela()).toBe(n);
    cleanup(); esquecerNegociosV2();
    const S = seed(); S.filtro = "wc";
    const { container } = negocios(S);
    const noQuadro = cartoesQuadro(container);
    modo("Lista");
    expect(linhasTabela()).toBe(noQuadro);
  });
  it("carregar num cabeçalho ordena, com aria-sort, e carregar outra vez inverte", () => {
    negocios(seed());
    modo("Lista");
    const cab = (nome: string): HTMLElement => within(screen.getByRole("table")).getByRole("columnheader", { name: new RegExp(nome) });
    const valores = (): number[] => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.querySelectorAll("td")[3].textContent!)
      .filter((t) => t !== "—").map((t) => Number(t.replace(/[^\d,]/g, "").replace(",", ".")));
    expect(cab("Valor")).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(cab("Valor")).getByRole("button"));
    expect(cab("Valor")).toHaveAttribute("aria-sort", "descending");
    expect(valores()).toEqual([...valores()].sort((a, b) => b - a));
    fireEvent.click(within(cab("Valor")).getByRole("button"));
    expect(cab("Valor")).toHaveAttribute("aria-sort", "ascending");
    expect(valores()).toEqual([...valores()].sort((a, b) => a - b));
    fireEvent.click(within(cab("Pessoa")).getByRole("button"));
    expect(cab("Pessoa")).toHaveAttribute("aria-sort", "ascending");
    expect(cab("Valor")).toHaveAttribute("aria-sort", "none");
    const nomes = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.querySelector("td button")!.textContent!);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" })));
  });
  it("carregar numa linha de exemplo abre o mesmo painel que o cartão abre no Quadro", () => {
    const S = seed();
    const demo = cartoesV2(S).find((c) => c.demo)!;
    negocios(S);
    modo("Lista");
    const linha = within(screen.getByRole("table")).getAllByRole("row").slice(1).find((r) => r.textContent!.includes("exemplo") && r.textContent!.includes(demo.nome))!;
    fireEvent.click(linha);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Pessoas V2 · cabeçalho, resumo e chips", () => {
  it("tem as migalhas, o título, o resumo numa linha e uma só ação, a primária", () => {
    const { container } = pessoas(seed());
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
    expect(container.querySelector(".crumbs")).toHaveTextContent("Pessoas › Lista");
    expect(container.querySelector("header p")).toHaveTextContent(/^14 leads e 5 clientes, mais 2 perdidas · 4 por contactar · 1 atrasada$/);
    expect(container.querySelector(".kpi, .qcard")).toBeNull();
    const acoes = [...container.querySelectorAll<HTMLElement>(".ph-actions button")];
    expect(acoes.map((b) => b.textContent)).toEqual(["Nova lead"]);
    expect(acoes[0].className).toContain("bg-primary");
    separador("Dashboard");
    expect(container.querySelector(".crumbs")).toHaveTextContent("Pessoas › Dashboard");
  });
  it("os chips extra mostram o número da lista que abrem e ligam e desligam o filtro", () => {
    pessoas(seed());
    const extra = (): HTMLElement[] => within(screen.getByRole("group", { name: "Mais vistas" })).getAllByRole("button");
    expect(extra().map((c) => c.textContent!.replace(/\s*\d+$/, ""))).toEqual(["Voltaram a contactar", "Com visita"]);
    extra().forEach((_, i) => {
      cleanup(); esquecerPessoas();
      pessoas(seed());
      const chip = extra()[i], n = Number(chip.textContent!.match(/(\d+)$/)![1]);
      fireEvent.click(chip);
      if (n > 0) expect(linhasTabela()).toBe(n); else expect(screen.getByText("Nenhuma pessoa com este filtro.")).toBeInTheDocument();
      expect(extra()[i]).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(extra()[i]);
      expect(extra()[i]).toHaveAttribute("aria-pressed", "false");
      expect(linhasTabela()).toBe(14);
    });
  });
  it("a função pura bate com a lista e nos clientes só há os chips que fazem sentido", () => {
    const linhas = linhasDe(seed());
    expect(vistasPessoas(linhas, "clientes", SEM_FILTROS_P).map((i) => i.id)).toEqual(["atrasadas", "novo"]);
    const todas = vistasPessoas(linhas, "todos", SEM_FILTROS_P);
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

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";

const original = window.matchMedia;
const ecra = (largo: boolean): void => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: largo, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
};

function pagina() {
  const S = seed();
  const run = (fn: () => void) => fn();
  const A = acoes(S, vi.fn(), run);
  return render(<PessoasSimples S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
}

const tab = (nome: string | RegExp): void => { fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 }); };
const linhasDaTabela = (): number => within(screen.getByRole("table")).getAllByRole("row").length - 1;
const estado = (): string => screen.getByRole("status").textContent ?? "";
/** O botão de um cartão ou de uma barra: o nome acessível começa pelo texto dado. */
const botao = (inicio: RegExp): HTMLElement => screen.getByRole("button", { name: inicio });
const dashboard = (): void => tab("Dashboard");
const maisGraficos = (): void => { fireEvent.click(screen.getByRole("button", { name: "Mais gráficos" })); };
/** O anúncio para leitores de ecrã depois de um cartão ou de uma barra (a região aria-live sem papel próprio). */
const anuncio = (): string => document.querySelector('[aria-live="polite"]:not([role])')?.textContent ?? "";
const SEM_ACAO = /\. Filtrar por .*$/;
const abrirFiltros = (): HTMLElement => { fireEvent.click(screen.getByRole("button", { name: /^Filtros/ })); return screen.getByRole("dialog"); };

beforeEach(() => { esquecerPessoas(); ecra(true); });
afterEach(() => { cleanup(); window.matchMedia = original; });

describe("Pessoas · separadores Dashboard e Lista", () => {
  it("a Lista é o separador por defeito, e os dois separadores principais existem", () => {
    pagina();
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
  });
  it("o Dashboard mostra os cartões de Leads: 14 ativas, 4 por contactar, 1 atrasada, 4 qualificadas, 2 voltaram, 2 perdidas", () => {
    pagina();
    dashboard();
    const cartoes = within(screen.getByRole("region", { name: "Números das leads" })).getAllByRole("button");
    expect(cartoes.map((c) => c.textContent?.replace(SEM_ACAO, ""))).toEqual([
      "Leads ativas14", "Por contactar4", "Atrasadas1", "Qualificadas (MQL ou SQL)4", "Voltaram a contactar2", "Perdidas2",
    ]);
    expect(screen.queryByRole("table")).toBeNull(); // a lista só aparece no separador Lista
  });
  it("os cartões mudam com Clientes e com Todos", () => {
    pagina();
    dashboard();
    tab(/^Clientes/);
    const clientes = within(screen.getByRole("region", { name: "Números dos clientes" })).getAllByRole("button").map((c) => c.textContent);
    expect(clientes[0]).toContain("5");
    expect(clientes[1]).toContain("39.992,66 €");
    expect(clientes[3]).toContain("37.180 €");
    tab(/^Todos/);
    const todos = within(screen.getByRole("region", { name: "Números de todas as pessoas" })).getAllByRole("button").map((c) => c.textContent?.replace(SEM_ACAO, ""));
    expect(todos.slice(0, 5)).toEqual(["Pessoas21", "Leads14", "Clientes5", "Empresas3", "Perdidas2"]);
  });
  it("os gráficos têm título, número em texto e uma tabela com os mesmos números", () => {
    pagina();
    dashboard();
    const caixa = screen.getByRole("region", { name: "Por formulário" });
    expect(caixa).toHaveTextContent("14 pessoas");
    const ver = within(caixa).getByRole("button", { name: "Ver como tabela" });
    expect(ver).toHaveAttribute("aria-expanded", "false");
    expect(within(caixa).queryByRole("table")).toBeNull();
    fireEvent.click(ver);
    expect(ver).toHaveAttribute("aria-expanded", "true");
    const linhas = within(within(caixa).getByRole("table")).getAllByRole("row").map((r) => [...r.querySelectorAll("th,td")].map((c) => c.textContent));
    const barras = within(within(caixa).getByRole("list", { name: "Por formulário" })).getAllByRole("button").map((b) => b.textContent);
    for (const [rotulo, n] of linhas.slice(1, -1)) expect(barras.some((b) => b?.startsWith(`${rotulo}${n} `))).toBe(true);
    expect(linhas[linhas.length - 1]).toEqual(["Total", "14", "100 %"]);
    expect(linhas.slice(1, -1).reduce((a, l) => a + Number(l[1]), 0)).toBe(14);
    fireEvent.click(ver);
    expect(within(caixa).queryByRole("table")).toBeNull();
  });
  it("o funil, as entradas por dia e os motivos da perda têm os números certos em Todos", () => {
    pagina();
    dashboard();
    tab(/^Todos/);
    const funil = screen.getByRole("list", { name: "Funil por etapa" });
    expect(within(funil).getAllByRole("button").map((b) => b.textContent?.replace(SEM_ACAO, ""))).toEqual([
      "Lead21 pessoas", "Contacto17 · 81 % do passo anterior", "Visita13 · 76 % do passo anterior", "Negócio9 · 69 % do passo anterior", "Cliente5 · 56 % do passo anterior",
    ]);
    const entradas = screen.getByRole("region", { name: "Entradas por dia" });
    expect(entradas).toHaveTextContent("19 pessoas nos últimos 30 dias");
    expect(within(entradas).getByRole("img")).toHaveAccessibleName(/19 pessoas nos últimos 30 dias, de 10\/09 a 10\/10/);
    maisGraficos();
    const perda = within(screen.getByRole("region", { name: "Perdidas com estes filtros" })).getByRole("list", { name: "Perdidas com estes filtros, por motivo" });
    expect(within(perda).getAllByRole("button").map((b) => b.textContent?.replace(SEM_ACAO, ""))).toEqual(["Adiou1 · 50 %", "Preço1 · 50 %"]);
  });
});

describe("Pessoas · densidade: cartões e quatro gráficos, o resto em Mais gráficos", () => {
  const titulos = (): string[] => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
  it("por defeito: Funil, Entradas por dia, Por formulário e Por distrito; o resto atrás do botão (aria-expanded) e a escolha fica na memória", () => {
    const a = pagina();
    dashboard();
    expect(titulos()).toEqual(["Funil por etapa", "Entradas por dia", "Por formulário", "Por distrito"]);
    const botao = screen.getByRole("button", { name: "Mais gráficos" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(titulos()).toEqual([
      "Funil por etapa", "Entradas por dia", "Por formulário", "Por distrito", "Origem, por canal", "Resultado do último contacto", "Perdidas com estes filtros", "Pessoa ou empresa",
    ]);
    a.unmount();
    pagina();
    expect(screen.getByRole("button", { name: "Mais gráficos" })).toHaveAttribute("aria-expanded", "true");
    cleanup(); esquecerPessoas();
    pagina();
    dashboard();
    expect(screen.getByRole("button", { name: "Mais gráficos" })).toHaveAttribute("aria-expanded", "false");
  });
  it("o nome acessível diz o filtro e o resultado, não Ver na lista", () => {
    pagina();
    dashboard();
    expect(screen.getByRole("button", { name: /Filtrar por Leads ativas: 14 pessoas$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filtrar por Lisboa: 7 pessoas$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filtrar por já chegou a Visita: 6 pessoas$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver na lista/ })).toBeNull();
  });
  it("Perdidas com estes filtros avisa que a Lista só as mostra com o estado Perdidas, e a barra aplica esse estado e passa à Lista", () => {
    pagina();
    dashboard();
    maisGraficos();
    const caixa = screen.getByRole("region", { name: "Perdidas com estes filtros" });
    expect(caixa).toHaveTextContent("2 pessoas · a Lista só as mostra com o estado Perdidas");
    fireEvent.click(within(caixa).getByRole("button", { name: /^Adiou1/ }));
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Tirar o filtro: Estado: Perdidas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tirar o filtro: Motivo da perda: Adiou" })).toBeInTheDocument();
    expect(linhasDaTabela()).toBe(1);
  });
});

describe("Pessoas · foco e aviso depois de um cartão ou de uma barra", () => {
  it("o foco passa para o título da Lista e a mudança é anunciada", async () => {
    pagina();
    dashboard();
    fireEvent.click(within(screen.getByRole("region", { name: "Por distrito" })).getByRole("button", { name: /^Lisboa7/ }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: /^Lista/ })));
    expect(anuncio()).toBe("Lista filtrada por Lisboa: 7 pessoas");
    expect(linhasDaTabela()).toBe(7);
  });
  it("o cartão Atrasadas diz 1 pessoa no singular", () => {
    pagina();
    dashboard();
    fireEvent.click(botao(/^Atrasadas1/));
    expect(anuncio()).toBe("Lista filtrada por Atrasadas: 1 pessoa");
  });
});

describe("Pessoas · carregar num cartão ou numa barra aplica o filtro e muda para a Lista", () => {
  it("o cartão Atrasadas: a lista fica com 1 pessoa, o chip aparece e o contador anuncia-o", () => {
    pagina();
    dashboard();
    fireEvent.click(botao(/^Atrasadas1/));
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(linhasDaTabela()).toBe(1);
    expect(within(screen.getByRole("group", { name: "Filtros ativos" })).getByRole("button", { name: "Tirar o filtro: Atrasadas" })).toBeInTheDocument();
    expect(estado()).toBe("1 pessoa");
  });
  it("o cartão Leads em Todos muda para o separador Leads", () => {
    pagina();
    dashboard();
    tab(/^Todos/);
    fireEvent.click(botao(/^Leads14/));
    expect(screen.getByRole("tab", { name: /^Leads/ })).toHaveAttribute("aria-selected", "true");
    expect(linhasDaTabela()).toBe(14);
  });
  it("uma barra de distrito (Lisboa) deixa a lista com as 7 leads de Lisboa e o chip 'Distrito: Lisboa'", () => {
    pagina();
    dashboard();
    const caixa = screen.getByRole("region", { name: "Por distrito" });
    fireEvent.click(within(caixa).getByRole("button", { name: /^Lisboa7/ }));
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(linhasDaTabela()).toBe(7);
    expect(screen.getByRole("button", { name: "Tirar o filtro: Distrito: Lisboa" })).toBeInTheDocument();
  });
  it("uma barra do funil (Visita) junta 'já chegou a Visita': 6 leads", () => {
    pagina();
    dashboard();
    fireEvent.click(within(screen.getByRole("list", { name: "Funil por etapa" })).getByRole("button", { name: /^Visita/ }));
    expect(linhasDaTabela()).toBe(6);
    expect(screen.getByRole("button", { name: "Tirar o filtro: Já chegou a: Visita" })).toBeInTheDocument();
  });
  it("uma origem dentro de um canal e o canal inteiro aplicam filtros diferentes", () => {
    pagina();
    dashboard();
    maisGraficos();
    const caixa = screen.getByRole("region", { name: "Origem, por canal" });
    fireEvent.click(within(caixa).getByRole("button", { name: /^Canal: Outros/ }));
    expect(screen.getByRole("button", { name: "Tirar o filtro: Canal: Outros" })).toBeInTheDocument();
    expect(linhasDaTabela()).toBe(7); // Pedro, Inês, Ricardo e Modas (Site); Manuel, Sérgio e Condomínio (Chamada)
  });
  it("o cartão 'Perdidas' em Leads mostra as 2 perdidas e o mesmo número que o chip Perdidas", () => {
    pagina();
    dashboard();
    fireEvent.click(botao(/^Perdidas2/));
    expect(linhasDaTabela()).toBe(2);
    expect(screen.getByRole("button", { name: /^Perdidas/, pressed: true })).toBeInTheDocument();
  });
  it("o botão das entradas por dia aplica o período de 30 dias", () => {
    pagina();
    dashboard();
    tab(/^Todos/);
    fireEvent.click(screen.getByRole("button", { name: /^Ver estas 19 pessoas na lista/ }));
    expect(estado()).toBe("19 pessoas");
    expect(screen.getByRole("button", { name: "Tirar o filtro: Período: 30 dias" })).toBeInTheDocument();
  });
});

describe("Pessoas · os filtros são uns só para o Dashboard e para a Lista", () => {
  it("a pesquisa feita na Lista vê-se no Dashboard, e o contador é o mesmo nos dois", () => {
    pagina();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cozinha" } });
    const n = linhasDaTabela(), texto = n === 1 ? "1 pessoa" : `${n} pessoas`;
    expect(n).toBeGreaterThan(1);
    expect(estado()).toBe(texto);
    dashboard();
    expect(estado()).toBe(texto);
    expect(screen.getByRole("searchbox")).toHaveValue("cozinha");
    expect(screen.getByRole("region", { name: "Por formulário" })).toHaveTextContent(texto);
  });
  it("um filtro do painel (distrito) aplica-se ao Dashboard: os cartões e os gráficos contam só essas pessoas", () => {
    pagina();
    dashboard();
    const painel = abrirFiltros();
    fireEvent.change(within(painel).getByLabelText("Distrito"), { target: { value: "Setúbal" } });
    expect(screen.getByRole("button", { name: "Tirar o filtro: Distrito: Setúbal" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Por distrito" })).toHaveTextContent("3 pessoas"); // as 3 leads de Setúbal
    expect(screen.getByRole("button", { name: /^Leads ativas3/ })).toBeInTheDocument();
  });
  it("Limpar tudo desliga os filtros todos e os chips desaparecem", () => {
    pagina();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "carla" } });
    fireEvent.click(screen.getByRole("button", { name: /^Atrasadas/ }));
    expect(screen.getAllByRole("group", { name: "Filtros ativos" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Limpar tudo" }));
    expect(screen.queryByRole("group", { name: "Filtros ativos" })).toBeNull();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(linhasDaTabela()).toBe(14);
  });
  it("tirar um chip tira só esse filtro", () => {
    pagina();
    const painel = abrirFiltros();
    fireEvent.change(within(painel).getByLabelText("Qualificação"), { target: { value: "SQL" } });
    fireEvent.change(within(painel).getByLabelText("Período de criação"), { target: { value: "30" } });
    expect(linhasDaTabela()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Tirar o filtro: Período: 30 dias" }));
    expect(screen.queryByRole("button", { name: "Tirar o filtro: Período: 30 dias" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tirar o filtro: Qualificação: SQL" })).toBeInTheDocument();
  });
  it("o painel tem os selects pedidos, todos com etiqueta, e o botão conta os filtros ativos", () => {
    pagina();
    const painel = abrirFiltros();
    for (const rotulo of ["Período de criação", "Origem", "Canal", "Formulário", "Comercial", "Distrito", "Qualificação", "Resultado do último contacto", "Pessoa ou empresa", "Estado"]) {
      expect(within(painel).getByLabelText(rotulo).tagName).toBe("SELECT");
    }
    for (const nome of ["Voltou a contactar", "Com visita", "Atrasadas", "Só as minhas"]) expect(within(painel).getByRole("button", { name: nome })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(painel).getByRole("button", { name: "Voltou a contactar" }));
    expect(estado()).toBe("2 pessoas");
    expect(screen.getByRole("button", { name: /^Filtros\s?\(1\)/ })).toBeInTheDocument();
  });
});

describe("Pessoas · um estado que o separador esconde volta quando o separador volta", () => {
  it("Perdidas guardado em Leads não vale em Clientes (5 pessoas) e reaparece ao voltar a Leads (2 perdidas)", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /^Perdidas/ }));
    expect(linhasDaTabela()).toBe(2);
    tab(/^Clientes/);
    expect(linhasDaTabela()).toBe(5);
    expect(estado()).toBe("5 pessoas");
    tab(/^Leads/);
    expect(linhasDaTabela()).toBe(2);
    expect(screen.getByRole("button", { name: /^Perdidas/, pressed: true })).toBeInTheDocument();
  });
});

describe("Pessoas · o painel dos filtros com o teclado", () => {
  it("abre com o foco lá dentro, o Esc fecha e devolve o foco ao botão Filtros", async () => {
    pagina();
    const botao = screen.getByRole("button", { name: /^Filtros/ });
    fireEvent.click(botao);
    const painel = screen.getByRole("dialog");
    await waitFor(() => expect(painel.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? painel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(botao));
  });
  it("todos os controlos do painel são alcançáveis com o Tab: selects com etiqueta e interruptores com aria-pressed", () => {
    pagina();
    const painel = abrirFiltros();
    const selects = within(painel).getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(10);
    for (const c of [...selects, ...within(painel).getAllByRole("button")]) expect(c.getAttribute("tabindex")).not.toBe("-1");
    for (const s of selects) expect(s.id).not.toBe("");
  });
});

describe("Pessoas · memória, estados vazios e pureza", () => {
  it("ao voltar a montar a página, o separador e os filtros ficam; esquecerPessoas limpa tudo", () => {
    const a = pagina();
    dashboard();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "carla" } });
    a.unmount();
    pagina();
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("carla");
    cleanup();
    esquecerPessoas();
    pagina();
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("sem pessoas o Dashboard diz-o e Limpar filtros devolve os cartões e põe o foco na pesquisa", () => {
    pagina();
    dashboard();
    const pesquisa = screen.getByRole("searchbox");
    fireEvent.change(pesquisa, { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhuma pessoa com estes filtros.")).toBeInTheDocument();
    expect(estado()).toBe("Nenhuma pessoa");
    expect(screen.queryByRole("region", { name: "Por formulário" })).toBeNull(); // nenhum gráfico em branco
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByRole("region", { name: "Por formulário" })).toBeInTheDocument();
    expect(document.activeElement).toBe(pesquisa);
  });
  it("abrir o Dashboard e carregar nas coisas não muda o Estado", () => {
    const S = seed(), run = (fn: () => void) => fn();
    const antes = JSON.stringify(S);
    render(<PessoasSimples S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
    dashboard();
    fireEvent.click(botao(/^Por contactar4/));
    dashboard();
    expect(JSON.stringify(S)).toBe(antes);
  });
});

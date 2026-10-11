import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { SEM_FILTROS_N, linhasNegocios } from "./filtrosNegocios";
import { NegociosDashboard } from "./NegociosDashboard";
import { NegociosV2, esquecerNegociosV2 } from "./NegociosV2";

/** Como a aplicação: o Estado muda no sítio e `run` volta a desenhar a página. */
function Pagina({ S, q }: { S: Estado; q: string }) {
  const [, desenhar] = useState(0);
  const run = (fn: () => void): void => { fn(); desenhar((n) => n + 1); };
  const A = acoes(S, () => desenhar((n) => n + 1), run);
  return <NegociosV2 S={S} A={A} run={run} go={(fn) => () => run(fn)} q={q} setQ={vi.fn()} repor={vi.fn()} />;
}
function pagina(S: Estado = seed(), q = "") {
  return { S, ...render(<Pagina S={S} q={q} />) };
}

const tab = (nome: string): void => { fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 }); };
const estado = (): string => screen.getByRole("status").textContent ?? "";
/** Os cartões desenhados nas quatro colunas do computador. */
const desenhados = (): number => document.querySelectorAll('section[aria-labelledby$="-d"] > ul > li:not([class*="border-dashed"])').length;
const cartoes = (): string[] => [...screen.getByRole("region", { name: "Números dos negócios" }).children].map((c) => c.textContent ?? "");
const abrirFiltros = (): HTMLElement => { fireEvent.click(screen.getByRole("button", { name: /^Filtros/ })); return screen.getByRole("dialog"); };
const todos = (S: Estado): Estado => { S.filtro = "todos"; return S; };
const maisGraficos = (): void => { fireEvent.click(screen.getByRole("button", { name: "Mais gráficos" })); };
/** O anúncio para leitores de ecrã depois de um cartão ou de uma barra (a região aria-live sem papel próprio). */
const anuncio = (): string => document.querySelector('[aria-live="polite"]:not([role])')?.textContent ?? "";

beforeEach(() => { esquecerNegociosV2(); });
afterEach(cleanup);

describe("Negócios V2 · separadores Quadro e Dashboard", () => {
  it("o Quadro é o separador por defeito e há dois separadores", () => {
    pagina(todos(seed()));
    expect(screen.getByRole("tab", { name: "Quadro" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "false");
    expect(desenhados()).toBe(14);
  });
  it("o Dashboard mostra seis cartões: 14 no Quadro, 10 por fechar, 40.492,33 € ponderados, 6 ganhos, 60 % de conversão e 4 com 2 ou mais orçamentos", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    const c = cartoes();
    expect(c).toHaveLength(6);
    expect(c[0]).toContain("No Quadro14");
    expect(c[1]).toContain("Por fechar10no valor de 67.809,04 €");
    expect(c[2]).toContain("Ponderado40.492,33 €");
    expect(c[3]).toBe("Ganhos6em todo o período, no valor de 39.992,66 €.");
    expect(c[4]).toBe("Conversão60 %6 ganhos e 4 perdidos, em todo o período.");
    expect(c[5]).toContain("Com 2 ou mais orçamentos4");
    expect(desenhados()).toBe(0); // o Quadro só aparece no seu separador
  });
  it("só 'No Quadro' e 'Com 2 ou mais orçamentos' são botões: os outros não têm lista que lhes corresponda", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    const regiao = screen.getByRole("region", { name: "Números dos negócios" });
    expect(within(regiao).getAllByRole("button").map((b) => b.textContent?.replace(/\. .*$/, ""))).toHaveLength(2);
    for (const nome of [/^Por fechar/, /^Ponderado/, /^Ganhos/, /^Conversão/]) expect(within(regiao).queryByRole("button", { name: nome })).toBeNull();
  });
  it("o nome acessível dos botões diz o filtro e o resultado, não 'Ver no Quadro'", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    expect(screen.getByRole("button", { name: /Ver no Quadro: 14 negócios$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filtrar por 2 ou mais orçamentos: 4 negócios$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filtrar por Proposta: 4 negócios$/ })).toBeInTheDocument();
  });
  it("por defeito só há quatro gráficos; os outros ficam atrás de 'Mais gráficos' (aria-expanded) e o estado fica na memória", () => {
    const a = pagina(todos(seed()));
    tab("Dashboard");
    const titulos = (): string[] => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(titulos()).toEqual(["Funil por fase", "Casa de banho contra cozinha", "Com contrato contra venda direta", "Próximos passos em atraso"]);
    const botao = screen.getByRole("button", { name: "Mais gráficos" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(titulos()).toEqual([
      "Funil por fase", "Casa de banho contra cozinha", "Com contrato contra venda direta", "Próximos passos em atraso",
      "Valor por comercial", "Negócios por faixa de valor", "Parados em Orçamento e Proposta", "Perdidos por motivo",
    ]);
    a.unmount();
    pagina(todos(seed()));
    expect(screen.getByRole("button", { name: "Mais gráficos" })).toHaveAttribute("aria-expanded", "true"); // a memória de módulo
    cleanup(); esquecerNegociosV2();
    pagina(todos(seed()));
    tab("Dashboard");
    expect(screen.getByRole("button", { name: "Mais gráficos" })).toHaveAttribute("aria-expanded", "false");
  });
  it("com um só comercial o gráfico diz-o em texto, em vez de uma barra a 100 %", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    maisGraficos();
    const caixa = screen.getByRole("region", { name: "Valor por comercial" });
    expect(within(caixa).getByText("Todos os negócios são do Rúben.")).toBeInTheDocument();
    expect(within(caixa).queryByRole("list")).toBeNull();
  });
});

describe("Negócios V2 · o Dashboard bate com o Quadro", () => {
  it("o cartão 'a decorrer' é o número de cartões do Quadro, com o filtro rápido 'Os meus' e sem filtros", () => {
    for (const rapido of ["meus", "todos", "wc", "coz", "atraso"]) {
      cleanup(); esquecerNegociosV2();
      const S = seed(); S.filtro = rapido;
      pagina(S);
      const quadro = desenhados(), contador = estado();
      tab("Dashboard");
      expect(cartoes()[0], rapido).toContain(`No Quadro${quadro}`);
      expect(estado()).toBe(contador);
    }
  });
  it("com um filtro do painel, o número no Quadro, o do cabeçalho e as barras batem com o Quadro", () => {
    pagina(todos(seed()));
    const painel = abrirFiltros();
    fireEvent.change(within(painel).getByLabelText("Distrito da pessoa"), { target: { value: "Faro" } });
    const quadro = desenhados();
    expect(quadro).toBe(2);
    expect(estado()).toBe("2 negócios");
    tab("Dashboard");
    expect(cartoes()[0]).toContain("No Quadro2");
    expect(document.querySelector("header p")).toHaveTextContent("2 no Quadro (de 14)");
    const funil = screen.getByRole("region", { name: "Funil por fase" });
    expect(funil).toHaveTextContent("2 negócios · 27.332,74 €");
  });
  it("a tabela alternativa de um gráfico tem os mesmos números que as barras", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    const caixa = screen.getByRole("region", { name: "Funil por fase" });
    fireEvent.click(within(caixa).getByRole("button", { name: "Ver como tabela" }));
    const linhas = within(within(caixa).getByRole("table")).getAllByRole("row").map((r) => [...r.querySelectorAll("th,td")].map((c) => c.textContent));
    expect(linhas[0]).toEqual(["Valor", "Negócios", "Percentagem", "Valor em euros"]);
    expect(linhas.slice(1, 5)).toEqual([
      ["Orçamento", "5", "36 %", "40.100 €"], ["Proposta", "4", "29 %", "22.479,04 €"], ["Contrato", "1", "7 %", "5.230 €"], ["Financeiro", "4", "29 %", "32.550,94 €"],
    ]);
    expect(linhas[5].slice(0, 3)).toEqual(["Total", "14", "100 %"]);
  });
  it("os gráficos têm os números certos: serviço 5, 5 e 4; tipo 11 e 3; faixas 1, 4 e 9; parados 9, 0 e 0; perdidos Adiou 2 e Preço 2", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    maisGraficos();
    const texto = (nome: string): string[] => within(within(screen.getByRole("region", { name: nome })).getByRole("list", { name: nome })).getAllByRole("listitem").map((l) => l.textContent?.replace(/\. Filtrar por .*$/, "") ?? "");
    expect(texto("Casa de banho contra cozinha").map((t) => t.match(/^\D+(\d+)/)?.[1])).toEqual(["5", "5", "4"]);
    expect(texto("Com contrato contra venda direta").map((t) => t.match(/^\D+(\d+)/)?.[1])).toEqual(["11", "3"]);
    expect(texto("Negócios por faixa de valor").map((t) => t.match(/\D(\d+) · \d+ %/)?.[1])).toEqual(["1", "4", "9"]);
    expect(texto("Parados em Orçamento e Proposta").map((t) => t.match(/dias(\d+) ·/)?.[1])).toEqual(["9", "0", "0"]);
    expect(texto("Perdidos por motivo")).toEqual(["Adiou2 · 50 %", "Preço2 · 50 %"]);
  });
});

describe("Negócios V2 · carregar num cartão ou numa barra aplica o filtro e muda para o Quadro", () => {
  it("o cartão 'Com 2 ou mais orçamentos': o Quadro fica com 4 cartões e o chip aparece", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    fireEvent.click(screen.getByRole("button", { name: /^Com 2 ou mais orçamentos4/ }));
    expect(screen.getByRole("tab", { name: "Quadro" })).toHaveAttribute("aria-selected", "true");
    expect(desenhados()).toBe(4);
    expect(screen.getByRole("button", { name: "Tirar o filtro: 2 ou mais orçamentos" })).toBeInTheDocument();
    expect(estado()).toBe("4 negócios");
  });
  it("uma barra do funil (Proposta) deixa 4 negócios, e uma barra de serviço (Casa de banho) deixa 5", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    fireEvent.click(within(screen.getByRole("region", { name: "Funil por fase" })).getByRole("button", { name: /^Proposta/ }));
    expect(desenhados()).toBe(4);
    expect(screen.getByRole("button", { name: "Tirar o filtro: Fase: Proposta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar tudo" }));
    tab("Dashboard");
    fireEvent.click(within(screen.getByRole("region", { name: "Casa de banho contra cozinha" })).getByRole("button", { name: /^Casa de banho/ }));
    expect(desenhados()).toBe(5);
  });
  it("cada barra com ação leva a tantos cartões do Quadro quantos mostra", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    maisGraficos();
    for (const [titulo, nomes] of [["Funil por fase", /^(Orçamento|Proposta|Contrato|Financeiro)/], ["Negócios por faixa de valor", /^(Até|3\.000|Mais)/], ["Com contrato contra venda direta", /^(Com contrato|Venda direta)/], ["Parados em Orçamento e Proposta", /^0 a 7/]] as const) {
      tab("Dashboard");
      const caixa = screen.getByRole("region", { name: titulo });
      const botoes = within(caixa).getAllByRole("button", { name: nomes });
      for (let i = 0; i < botoes.length; i++) {
        tab("Dashboard");
        const b = within(screen.getByRole("region", { name: titulo })).getAllByRole("button", { name: nomes })[i];
        const n = Number(b.textContent?.match(/\D(\d+) · \d+ %/)?.[1] ?? b.textContent?.match(/(\d+) · \d+ %/)?.[1]);
        fireEvent.click(b);
        expect(desenhados(), `${titulo} ${i}`).toBe(n);
        fireEvent.click(screen.getByRole("button", { name: "Limpar tudo" }));
      }
    }
  });
  it("os próximos passos em atraso: o negócio com atraso aparece e o botão abre o negócio", () => {
    const S = todos(seed());
    S.deals.find((d) => d.id === 1031)!.atraso = true;
    pagina(S);
    tab("Dashboard");
    const caixa = screen.getByRole("region", { name: "Próximos passos em atraso" });
    const botao = within(caixa).getByRole("button", { name: /Carla Nunes · Cozinha/ });
    fireEvent.click(botao);
    expect(S.deal).toBe(1031);
  });
  it("sem atrasos, a caixa diz que não há nenhum em vez de ficar em branco", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    expect(within(screen.getByRole("region", { name: "Próximos passos em atraso" })).getByText("Nenhum próximo passo em atraso.")).toBeInTheDocument();
  });
});

describe("Negócios V2 · filtros partilhados, memória e estados vazios", () => {
  it("os chips rápidos continuam (Os meus, Todos, Com atraso, Casa de banho, Cozinha) e valem nos dois separadores", () => {
    pagina(seed());
    const chips = within(screen.getByRole("group", { name: "Mostrar" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Os meus", "Todos", "Com atraso", "Casa de banho", "Cozinha"]);
    fireEvent.click(chips[4]);
    expect(desenhados()).toBe(5);
    tab("Dashboard");
    expect(cartoes()[0]).toContain("No Quadro5");
    expect(screen.getByRole("button", { name: "Tirar o filtro: Cozinha" })).toBeInTheDocument();
  });
  it("o painel tem os filtros pedidos, todos com etiqueta", () => {
    pagina(todos(seed()));
    const painel = abrirFiltros();
    for (const r of ["Comercial", "Fase", "Tipo", "Número de orçamentos", "Valor", "Distrito da pessoa", "Criado", "Parado em Orçamento ou Proposta"]) {
      expect(within(painel).getByLabelText(r).tagName).toBe("SELECT");
    }
  });
  it("faixas de valor, tipo, número de orçamentos, período e parados filtram o Quadro (contados à mão)", () => {
    pagina(todos(seed()));
    const painel = abrirFiltros();
    const escolher = (rotulo: string, valor: string) => fireEvent.change(within(painel).getByLabelText(rotulo), { target: { value: valor } });
    escolher("Valor", "ate3");
    expect(desenhados()).toBe(1);
    escolher("Valor", "mais6");
    expect(desenhados()).toBe(9);
    escolher("Valor", "");
    escolher("Tipo", "direta");
    expect(desenhados()).toBe(3);
    escolher("Tipo", "");
    escolher("Criado", "7");
    expect(desenhados()).toBe(7);
    escolher("Criado", "");
    escolher("Parado em Orçamento ou Proposta", "mais7");
    expect(desenhados()).toBe(0); // nenhum dos 9 em Orçamento ou Proposta está parado há mais de 7 dias
    expect(screen.getByText("Nenhum negócio encontrado.")).toBeInTheDocument();
    expect(estado()).toBe("Nenhum negócio");
  });
  it("Limpar tudo desliga a pesquisa, o filtro rápido e os do painel", () => {
    const { S } = pagina(seed());
    const painel = abrirFiltros();
    fireEvent.change(within(painel).getByLabelText("Fase"), { target: { value: "contrato" } });
    expect(screen.getByRole("button", { name: "Tirar o filtro: Os meus" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar tudo" }));
    expect(S.filtro).toBe("todos");
    expect(screen.queryByRole("group", { name: "Filtros ativos" })).toBeNull();
    expect(desenhados()).toBe(14);
  });
  it("sem negócios o Dashboard diz-o, mostra Limpar filtros e não desenha gráficos em branco", () => {
    pagina(todos(seed()));
    const painel = abrirFiltros();
    fireEvent.change(within(painel).getByLabelText("Distrito da pessoa"), { target: { value: "Porto" } });
    fireEvent.change(within(painel).getByLabelText("Fase"), { target: { value: "contrato" } });
    tab("Dashboard");
    expect(screen.getByText("Nenhum negócio a decorrer com estes filtros.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Funil por fase" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByRole("region", { name: "Funil por fase" })).toBeInTheDocument();
  });
  it("ao voltar a montar a página o separador e os filtros ficam; esquecerNegociosV2 limpa-os", () => {
    const a = pagina(todos(seed()));
    tab("Dashboard");
    fireEvent.change(within(abrirFiltros()).getByLabelText("Distrito da pessoa"), { target: { value: "Faro" } });
    a.unmount();
    pagina(todos(seed()));
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Tirar o filtro: Distrito: Faro" })).toBeInTheDocument();
    cleanup();
    esquecerNegociosV2();
    pagina(todos(seed()));
    expect(screen.getByRole("tab", { name: "Quadro" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("group", { name: "Filtros ativos" })).toBeNull();
  });
  it("abrir o Dashboard e carregar nas coisas não muda o Estado", () => {
    const S = todos(seed()), antes = JSON.stringify(S);
    pagina(S);
    tab("Dashboard");
    fireEvent.click(screen.getByRole("button", { name: /^Com 2 ou mais orçamentos/ }));
    tab("Dashboard");
    expect(JSON.stringify(S)).toBe(antes);
  });
});

describe("Negócios V2 · foco e aviso depois de um cartão ou de uma barra", () => {
  it("o foco passa para o título do Quadro e a mudança é anunciada", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    fireEvent.click(within(screen.getByRole("region", { name: "Casa de banho contra cozinha" })).getByRole("button", { name: /^Casa de banho/ }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Quadro" }));
    expect(anuncio()).toBe("Quadro filtrado por Casa de banho: 5 negócios");
    expect(desenhados()).toBe(5);
  });
  it("o cartão 'No Quadro' também leva o foco e diz quantos negócios há", () => {
    pagina(todos(seed()));
    tab("Dashboard");
    fireEvent.click(screen.getByRole("button", { name: /^No Quadro14/ }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Quadro" }));
    expect(anuncio()).toBe("Quadro: 14 negócios");
  });
});

describe("Negócios V2 · 'e mais N' nos próximos passos em atraso", () => {
  /** O dashboard sozinho, com seis negócios do Quadro marcados em atraso (a seed só tem três reais com atraso possível, e os exemplos nunca o têm). */
  function dashboardComSeisAtrasos(verAtrasos: () => void) {
    const S = todos(seed());
    const run = (fn: () => void): void => fn();
    const A = acoes(S, vi.fn(), run);
    const ctx = { rapido: "todos", q: "", f: SEM_FILTROS_N };
    let n = 0;
    const linhas = linhasNegocios(S).map((l) => (l.cartao && n++ < 6 ? { ...l, atraso: true } : l));
    return render(<NegociosDashboard linhas={linhas} ctx={ctx} aoAgir={vi.fn()} verAtrasos={verAtrasos} limpar={vi.fn()} A={A} go={(fn) => () => run(fn)} />);
  }
  it("a lista corta aos 5, diz 'e mais 1' e o botão chama 'Com atraso' com o número que o Quadro vai mostrar (6)", () => {
    const ver = vi.fn();
    dashboardComSeisAtrasos(ver);
    const caixa = screen.getByRole("region", { name: "Próximos passos em atraso" });
    expect(caixa).toHaveTextContent("6 negócios");
    expect(within(caixa).getByRole("list", { name: "Próximos passos em atraso" }).querySelectorAll("li")).toHaveLength(6); // 5 passos e a linha do "e mais"
    expect(within(caixa).getByText("e mais 1")).toBeInTheDocument();
    fireEvent.click(within(caixa).getByRole("button", { name: "Ver os 6 com atraso no Quadro" }));
    expect(ver).toHaveBeenCalledTimes(1);
  });
  it("com cinco ou menos não há 'e mais'", () => {
    const S = todos(seed());
    S.deals.find((d) => d.id === 1031)!.atraso = true;
    pagina(S);
    tab("Dashboard");
    expect(screen.queryByText(/^e mais /)).toBeNull();
  });
});

describe("Negócios V2 · o painel dos filtros com o teclado", () => {
  it("abre com o foco lá dentro, o Esc fecha e devolve o foco ao botão Filtros", async () => {
    pagina(todos(seed()));
    const botao = screen.getByRole("button", { name: /^Filtros/ });
    fireEvent.click(botao);
    const painel = screen.getByRole("dialog");
    await waitFor(() => expect(painel.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? painel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(botao));
  });
  it("os selects do painel têm etiqueta e são alcançáveis com o Tab (todos têm tabIndex por defeito)", () => {
    pagina(todos(seed()));
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    const selects = within(screen.getByRole("dialog")).getAllByRole("combobox");
    expect(selects).toHaveLength(9);
    for (const s of selects) { expect(s.getAttribute("tabindex")).not.toBe("-1"); expect(s.id).not.toBe(""); }
  });
});

describe("Negócios V2 · os ganhos e os perdidos com 'Com atraso'", () => {
  it("o filtro 'Com atraso' reduz o Quadro mas não os ganhos nem os perdidos, e o aviso aparece", () => {
    const S = seed(); S.filtro = "atraso";
    pagina(S);
    tab("Dashboard");
    expect(cartoes()[0]).toContain("No Quadro0");
    expect(cartoes()[3]).toContain("Ganhos6");
    expect(cartoes()[3]).toContain("Não depende da fase, do atraso nem do tempo parado.");
    expect(cartoes()[4]).toContain("Conversão60 %");
    maisGraficos();
    expect(screen.getByRole("region", { name: "Perdidos por motivo" })).toHaveTextContent("Não depende da fase, do atraso nem do tempo parado.");
  });
});

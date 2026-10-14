// Arranque do módulo «Custos» do RH de exemplo: mostra as pessoas e os totais, ordena e filtra, abre a ficha já no separador
// Custo e atribuir equipamento muda o custo da pessoa e o módulo. Tudo em memória, sem base. Data fixa (14/10/2026).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { rhExemploCustosTranslations } from "@/translations/rhExemploCustos";
import RhCustos from "./RhCustos";

const noRouter = () =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/rh-exemplo/custos"]}>
        <Routes><Route path="/rh-exemplo/custos" element={<RhCustos />} /></Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeAll(() => {
  // O Radix Select e o ResizeObserver precisam de APIs que o jsdom não traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporCusto();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const linhas = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>("tbody tr[data-pessoa-id]"));
const linhaDe = (nome: string): HTMLElement => linhas().find((l) => l.textContent?.includes(nome)) as HTMLElement;
const totalDoCabecalho = (chave: string): string => screen.getByTestId(`rhcustos-total-${chave}`).textContent ?? "";

describe("traduções do módulo Custos", () => {
  it("en e pt têm exatamente as mesmas chaves", () => {
    const { en, pt } = rhExemploCustosTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("o módulo Custos", () => {
  it("abre em Setembro de 2026 com as pessoas do Cálculo do mês, os totais e os cabeçalhos da tabela", () => {
    noRouter();
    expect(screen.getByRole("heading", { level: 1, name: /Custos/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-09");
    expect(linhas().length).toBeGreaterThanOrEqual(11);
    expect(within(linhaDe("Hugo Teixeira")).getByText("Hugo Teixeira")).toBeInTheDocument();
    const tabela = screen.getByRole("table", { name: /Custo de cada pessoa em setembro de 2026/i });
    const cabecalhos = within(tabela).getAllByRole("columnheader").map((c) => c.textContent);
    for (const nome of ["Pessoa", "Centro e filial", "Retribuição do mês", "Encargos", "Avulsos", "Equipamentos", "Seguro", "Custo total do mês", "Custo por hora", "Composição"]) {
      expect(cabecalhos.some((c) => c?.includes(nome))).toBe(true);
    }
    expect(within(tabela).getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
  });

  it("o total da linha de totais é o total do cabeçalho, e o texto não mostra chaves por traduzir", () => {
    noRouter();
    expect(screen.getByTestId("rhcustos-linha-total").textContent).toBe(totalDoCabecalho("total"));
    expect(totalDoCabecalho("pessoas")).toBe(String(linhas().length));
    expect(document.body.textContent).not.toMatch(/\brhCustos\.[A-Za-z]+/);
  });

  it("ordena por qualquer coluna, nos dois sentidos, e diz a ordem no cabeçalho", () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Custo total do mês/ }));
    const primeira = linhas()[0].getAttribute("data-pessoa-id");
    expect(screen.getByRole("columnheader", { name: /Custo total do mês/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Custo total do mês.*decrescente/ }));
    expect(screen.getByRole("columnheader", { name: /Custo total do mês/ })).toHaveAttribute("aria-sort", "ascending");
    expect(linhas()[0].getAttribute("data-pessoa-id")).not.toBe(primeira);
  });

  it("filtra por nome e mostra um estado vazio útil, com o botão de limpar", () => {
    noRouter();
    const total = linhas().length;
    fireEvent.change(screen.getByLabelText("Procurar por nome"), { target: { value: "ines" } });
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0]).toHaveTextContent("Inês Cardoso");
    expect(screen.getByText(`1 de ${total} pessoas`)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Procurar por nome"), { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhuma pessoa com estes filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Limpar filtros" })[0]);
    expect(linhas()).toHaveLength(total);
  });

  it("filtra por filial e por tipo de contrato", () => {
    noRouter();
    fireEvent.change(screen.getByLabelText("Centro ou filial"), { target: { value: "f:fil-porto" } });
    expect(linhas().map((l) => l.textContent).every((t) => /Porto/.test(t ?? ""))).toBe(true);
    expect(linhas().length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Centro ou filial"), { target: { value: "todos" } });
    fireEvent.change(screen.getByLabelText("Tipo de contrato"), { target: { value: "termo_certo" } });
    expect(linhaDe("Tiago Pinheiro")).toBeDefined();
    expect(linhas().some((l) => l.textContent?.includes("Marta Figueiredo"))).toBe(false);
  });

  it("a composição de cada pessoa tem texto e percentagem, e abre e fecha sem botões dentro de botões", () => {
    noRouter();
    const linha = linhaDe("Hugo Teixeira");
    expect(linha.querySelectorAll("button button")).toHaveLength(0);
    const botao = within(linha).getByRole("button", { name: /Ver composição de Hugo Teixeira/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).toHaveTextContent(/Retribuição \d+,\d %/);
    fireEvent.click(botao);
    const lista = screen.getByRole("list", { name: /Composição do custo de Hugo Teixeira/ });
    expect(within(lista).getByText("Equipamentos")).toBeInTheDocument();
    expect(lista.textContent).toMatch(/\d+,\d %/);
    fireEvent.click(within(linhaDe("Hugo Teixeira")).getByRole("button", { name: /Esconder composição de Hugo Teixeira/ }));
    expect(screen.queryByRole("list", { name: /Composição do custo de Hugo Teixeira/ })).not.toBeInTheDocument();
  });

  it("clicar numa linha abre a ficha da pessoa já no separador Custo", () => {
    noRouter();
    fireEvent.click(within(linhaDe("Tiago Pinheiro")).getByRole("button", { name: /Abrir a ficha de Tiago Pinheiro/ }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("tab", { name: "Custo", selected: true })).toBeInTheDocument();
    expect(within(ficha).getByText("Custo total do mês")).toBeInTheDocument();
    expect(within(ficha).getByRole("heading", { name: "Equipamentos" })).toBeInTheDocument();
    expect(within(ficha).getAllByText("Telemóvel").length).toBeGreaterThan(0);
  });
});

describe("atribuir equipamento e registar valor avulso, em memória", () => {
  it("atribuir na ficha aparece na lista da pessoa e muda o total de equipamentos do módulo", () => {
    noRouter();
    const antes = totalDoCabecalho("equipamentos");
    const custoAntes = totalDoCabecalho("total");
    fireEvent.click(within(linhaDe("Tiago Pinheiro")).getByRole("button", { name: /Abrir a ficha de Tiago Pinheiro/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Atribuir equipamento" }));
    const painel = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.change(within(painel).getByLabelText(/Descrição/), { target: { value: "Tablet de loja" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(within(painel).getByRole("alert")).toHaveTextContent("O valor tem de ser maior que 0.");
    fireEvent.change(within(painel).getByLabelText(/Valor de aquisição/), { target: { value: "720" } });
    fireEvent.change(within(painel).getByLabelText(/Data de entrega/), { target: { value: "2026-09-02" } });
    expect(within(painel).getByRole("status")).toHaveTextContent(/20,00.* por mês, durante 36 meses a partir de setembro de 2026/);
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByText("Tablet de loja")).toBeInTheDocument();
    expect(lerCusto().equipamentos.at(-1)).toMatchObject({ pessoaId: "p-tiago", descricao: "Tablet de loja", valor: 720, estado: "atribuido" });
    expect(totalDoCabecalho("equipamentos")).not.toBe(antes);
    expect(totalDoCabecalho("total")).not.toBe(custoAntes);
    expect(screen.getByTestId("rhcustos-linha-total").textContent).toBe(totalDoCabecalho("total"));
  });

  it("devolver na ficha pede data e estado e deixa o equipamento como devolvido", () => {
    noRouter();
    fireEvent.click(within(linhaDe("Tiago Pinheiro")).getByRole("button", { name: /Abrir a ficha de Tiago Pinheiro/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Devolver Telemóvel" }));
    const dialogo = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolver equipamento" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Escolhe o estado em que volta.");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Estado em que volta/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Com desgaste" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Devolver equipamento" }));
    const devolvido = lerCusto().equipamentos.find((e) => e.pessoaId === "p-tiago" && e.tipo === "telemovel");
    expect(devolvido).toMatchObject({ estado: "devolvido", estadoDevolucao: "desgaste" });
    expect(within(screen.getByRole("dialog")).getByText(/Devolvido em .*: Com desgaste/)).toBeInTheDocument();
  });

  it("o botão do topo abre o painel com a pessoa a escolher e recusa sem pessoa", () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Atribuir equipamento" }));
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByRole("combobox", { name: /Pessoa/ })).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(within(painel).getByRole("alert")).toHaveTextContent("Escolhe a pessoa.");
    fireEvent.keyDown(within(painel).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Hugo Teixeira" }));
    fireEvent.change(within(painel).getByLabelText(/Descrição/), { target: { value: "Colete refletor" } });
    fireEvent.change(within(painel).getByLabelText(/Valor de aquisição/), { target: { value: "36" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Atribuir" }));
    expect(lerCusto().equipamentos.at(-1)).toMatchObject({ pessoaId: "p-hugo", descricao: "Colete refletor", valor: 36 });
    expect(screen.getByText("Equipamento atribuído a Hugo Teixeira.")).toBeInTheDocument();
  });

  it("registar valor avulso no topo escolhe a pessoa, regista e o mês passa a ser aquele em que o valor conta", () => {
    noRouter();
    fireEvent.click(screen.getByRole("button", { name: "Registar valor avulso" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Escolhe a pessoa.");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /Pessoa/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Inês Cardoso" }));
    fireEvent.change(within(dialogo).getByLabelText("Descrição"), { target: { value: "Visita a fornecedor" } });
    fireEvent.change(within(dialogo).getByLabelText("Quilómetros"), { target: { value: "50" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar valor" }));
    expect(lerCusto().avulsos.at(-1)).toMatchObject({ pessoaId: "p-ines", valor: 20, descricao: "Visita a fornecedor" });
    expect(screen.getByText(/Valor registado\. Conta em outubro de 2026\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-10");
  });

  it("o seletor de mês e «Hoje» mudam o mês mostrado", () => {
    noRouter();
    fireEvent.change(screen.getByLabelText("Mês"), { target: { value: "2026-08" } });
    expect(screen.getByRole("table", { name: /agosto de 2026/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByLabelText("Mês")).toHaveValue("2026-10");
    expect(screen.getByRole("button", { name: "Hoje" })).toBeDisabled();
  });
});

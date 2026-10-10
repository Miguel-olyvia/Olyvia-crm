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

beforeEach(() => { esquecerPessoas(); ecra(true); });
afterEach(() => { cleanup(); window.matchMedia = original; });

describe("Pessoas · lista primeiro", () => {
  it("no computador é uma tabela com cabeçalhos de coluna, uma linha por pessoa, e nada vem aberto", () => {
    pagina();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(
      ["Pessoa", "Serviço · localidade", "Etapa", "Origem", "Último contacto", "Próximo passo", "Valor"]);
    expect(within(tabela).getAllByRole("row")).toHaveLength(9);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
    expect(screen.queryByText("Escolhe uma pessoa")).toBeNull();
  });
  it("abaixo de lg a lista são cartões, sem tabela", () => {
    ecra(false);
    pagina();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("list", { name: "Leads" }).querySelectorAll("li")).toHaveLength(8);
  });
  it("o cabeçalho tem os separadores com contagens e uma só fila de chips", () => {
    pagina();
    expect(screen.getByRole("tab", { name: /Leads/ })).toHaveTextContent("8");
    expect(screen.getByRole("tab", { name: /Clientes/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveTextContent("11");
    const chips = within(screen.getByRole("group", { name: "Mostrar" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent?.replace(/\s*\d+$/, ""))).toEqual(["Todas", "Por contactar", "Atrasadas", "Só as minhas"]);
  });
  it("clicar na linha abre a ficha num painel, com a posição, e Esc fecha e devolve o foco à linha", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Pedro Lopes/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("heading", { name: "Pedro Lopes" })).toBeInTheDocument();
    expect(within(painel).getByText("1 de 8")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(within(painel).getByRole("button", { name: /^Seguinte: / }));
    expect(within(painel).getByText("2 de 8")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: /^Anterior: Pedro Lopes/ })).toBeEnabled();
    fireEvent.keyDown(painel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect((document.activeElement as HTMLElement)?.dataset.pessoa).toBeTruthy());
  });
  it("o botão Fechar fecha o painel", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Pedro Lopes/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Pessoas · o separador Negócios da ficha", () => {
  it("mostra o negócio com o seu ícone e, com um só, a informação dele ao lado, sem escolher", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Pedro Lopes/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Negócios" }), { button: 0 });
    const linha = await within(painel).findByRole("button", { name: /WC social/ });
    expect(linha).toHaveAttribute("aria-pressed", "true");
    expect(linha).toHaveTextContent("Em preparação");
    expect(linha).toHaveTextContent("Sem valor ainda");
    expect(linha.querySelector("svg.lucide-handshake")).not.toBeNull();
    const detalhe = within(painel).getByRole("region", { name: "Negócio: WC social" });
    expect(within(detalhe).getByText("O que falta para o orçamento")).toBeInTheDocument();
    expect(within(detalhe).getByText("Documentos")).toBeInTheDocument();
    expect(within(detalhe).getByText("Levantamento")).toBeInTheDocument();
  });
  it("com vários negócios nenhum vem escolhido; ao clicar num, a informação dele aparece ao lado", async () => {
    pagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Marta Lima/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Negócios" }), { button: 0 });
    const linhas = within(await within(painel).findByRole("list", { name: "Negócios desta pessoa" })).getAllByRole("button");
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(within(painel).queryByRole("region", { name: /^Negócio: / })).toBeNull();
    const cozinha = linhas.find((l) => /Cozinha nova/.test(l.textContent ?? ""))!;
    fireEvent.click(cozinha);
    expect(cozinha).toHaveAttribute("aria-pressed", "true");
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Cozinha nova" });
    expect(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).toHaveTextContent("Orçamento");
  });
  it("a proposta conjunta é um documento dentro do negócio, com as suas linhas, e não um negócio novo", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Sérgio Pinto/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Negócios" }), { button: 0 });
    expect(within(await within(painel).findByRole("list", { name: "Negócios desta pessoa" })).getAllByRole("button")).toHaveLength(1);
    const docs = within(painel).getByRole("list", { name: "Documentos do negócio" });
    expect(docs).toHaveTextContent("Proposta conjunta");
    expect(within(docs).getByRole("list", { name: "Linhas do documento" })).toBeInTheDocument();
  });
});

// A página de Negócios da V2 funcional, no ecrã: o Hoje (listas, ordem, abrir, ver pessoa) e o Quadro (vistas, densidade, colunas, ordem, exportar).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { NegociosFunc, esquecerNegociosFunc } from "./NegociosFunc";
import { PessoasFunc, esquecerPessoasFunc } from "./PessoasFunc";

function pagina(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  render(<NegociosFunc S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  return S;
}
const separador = (nome: string): void => { fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 }); };
const lista = (nome: string): HTMLElement => screen.getByRole("list", { name: nome });

beforeEach(() => { esquecerNegociosFunc(); esquecerPessoasFunc(); });
afterEach(async () => {
  if (screen.queryAllByRole("dialog").length) {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryAllByRole("dialog")).toHaveLength(0));
  }
  cleanup(); vi.restoreAllMocks();
});

describe("Negócios funcional · Hoje", () => {
  it("abre no Hoje com as quatro listas e as contagens; a soma bate com o Quadro", () => {
    pagina();
    expect(screen.getByRole("heading", { level: 1, name: "Negócios · dia a dia" })).toBeInTheDocument();
    const cab = ["Orçamentos por enviar", "Propostas à espera do cliente", "Contratos por assinar", "A faturar"].map((n) => screen.getByRole("button", { name: new RegExp(`^${n}`) }));
    expect(cab.map((b) => b.textContent)).toEqual(["Orçamentos por enviar5", "Propostas à espera do cliente4", "Contratos por assinar1", "A faturar4"]);
    expect(screen.getByText("14 negócios para tratar · hoje é 10/10")).toBeInTheDocument();
    expect(screen.getByText("14 no Quadro com estes filtros")).toBeInTheDocument();
  });
  it("cada linha diz a pessoa, o serviço, o valor e o tempo parado", () => {
    pagina();
    const carla = within(lista("Propostas à espera do cliente")).getByRole("button", { name: "Abrir Cozinha de Carla Nunes" });
    expect(carla).toHaveTextContent("Carla Nunes");
    expect(carla).toHaveTextContent("Enviada há 5 dias");
    expect(carla).toHaveTextContent("8.126,60 €");
  });
  it("ordenar por valor põe o maior primeiro em cada lista", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: "Maior valor" }));
    expect(screen.getByRole("button", { name: "Maior valor" })).toHaveAttribute("aria-pressed", "true");
    expect(within(lista("Orçamentos por enviar")).getAllByRole("listitem")[0]).toHaveTextContent("Hotel Praia Dourada");
  });
  it("Abrir: um negócio da seed abre a página dele; um de exemplo abre o painel de exemplo", async () => {
    const S = pagina();
    fireEvent.click(within(lista("A faturar")).getByRole("button", { name: "Abrir Climatização e isolamento de Tiago Almeida" }));
    expect(await screen.findByRole("dialog", { name: "Climatização e isolamento" })).toBeInTheDocument();
    expect(S.view).toBe("negocios");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(lista("Propostas à espera do cliente")).getByRole("button", { name: "Abrir Cozinha de Carla Nunes" }));
    expect(S.view).toBe("negocio");
    expect(S.deal).toBe(1031);
  });
  it("Ver pessoa vai para Pessoas funcional com a ficha dessa pessoa aberta", async () => {
    const S = pagina();
    fireEvent.click(screen.getByRole("button", { name: "Ver a pessoa: Joana Ribeiro" }));
    expect(S.view).toBe("pessoas");
    cleanup();
    const run = (fn: () => void) => fn();
    render(<PessoasFunc S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
    expect(await screen.findByRole("dialog", { name: /Joana Ribeiro/ })).toBeInTheDocument();
  });
  it("as ações não mudam a fase de nenhum negócio", () => {
    const S = pagina(), antes = JSON.stringify(S.deals);
    fireEvent.click(screen.getByRole("button", { name: "Maior valor" }));
    fireEvent.click(screen.getByRole("button", { name: /^A faturar/ }));
    expect(JSON.stringify(S.deals)).toBe(antes);
  });
});

describe("Negócios funcional · Quadro", () => {
  const colunas = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("section[aria-labelledby^='fq-']")];
  it("vistas rápidas com contagem; escolher uma filtra as colunas", () => {
    pagina(); separador("Quadro");
    const vistas = within(screen.getByRole("group", { name: "Vistas rápidas" })).getAllByRole("button");
    expect(vistas.map((b) => b.textContent)).toEqual(["Para enviar 5", "À espera do cliente 4", "Por assinar 1", "A faturar 4", "Parados há 7+ dias 3", "Com 2+ orçamentos 4"]);
    fireEvent.click(vistas[4]);
    expect(document.querySelectorAll("[data-linha-func]")).toHaveLength(3);
  });
  it("densidade compacta: cartões de uma linha", () => {
    pagina(); separador("Quadro");
    const primeiro = (): HTMLElement => within(colunas()[0]).getAllByRole("listitem")[0];
    expect(primeiro()).toHaveTextContent("Em orçamento"); // normal: com o tempo parado e o próximo passo
    fireEvent.click(screen.getByRole("button", { name: "Compacta" }));
    expect(screen.getByRole("button", { name: "Compacta" })).toHaveAttribute("aria-pressed", "true");
    expect(primeiro()).not.toHaveTextContent("Em orçamento"); // compacta: só nome, serviço e valor, numa linha
    expect(document.querySelectorAll("[data-linha-func]")).toHaveLength(14);
  });
  it("recolher uma coluna esconde os cartões dela", () => {
    pagina(); separador("Quadro");
    const b = within(colunas()[0]).getByRole("button", { name: /^Orçamento/ });
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect([...document.querySelectorAll("[data-linha-func]")].filter((el) => !el.closest("[hidden]"))).toHaveLength(9);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "ArrowDown" }); // as setas saltam a coluna recolhida
    expect(document.activeElement).toHaveTextContent("Carla Nunes");
    expect(document.activeElement!.closest("section")).toBe(colunas()[1]);
  });
  it("ordenar todas as colunas por nome, e uma coluna por valor", () => {
    pagina(); separador("Quadro");
    fireEvent.change(screen.getByLabelText("Ordenar todas as colunas"), { target: { value: "nome" } });
    const nomes = (c: HTMLElement) => within(c).getAllByRole("listitem").map((li) => li.querySelector("button span")!.textContent);
    expect(nomes(colunas()[0])[0]).toMatch(/^Carla Nunes/);
    fireEvent.change(within(colunas()[0]).getByLabelText("Ordenar"), { target: { value: "valor" } });
    expect(nomes(colunas()[0])[0]).toMatch(/^Hotel Praia Dourada/);
  });
  it("Exportar CSV exporta o Quadro filtrado e anuncia-o", () => {
    URL.createObjectURL = vi.fn(() => "blob:x") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    pagina(); separador("Quadro");
    fireEvent.click(screen.getByRole("button", { name: /^Por assinar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(screen.getByText("Exportados 1 negócio")).toBeInTheDocument();
  });
  it("as setas passam de cartão em cartão e Enter abre", () => {
    const S = pagina(); separador("Quadro");
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    const primeiro = document.querySelectorAll<HTMLElement>("[data-linha-func]")[0];
    expect(document.activeElement).toBe(primeiro);
    fireEvent.keyDown(primeiro, { key: "j" });
    expect(document.activeElement).toBe(document.querySelectorAll<HTMLElement>("[data-linha-func]")[1]);
    fireEvent.keyDown(document.activeElement!, { key: "k" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(S.view === "negocio" || screen.queryByRole("dialog") !== null).toBe(true);
  });
});

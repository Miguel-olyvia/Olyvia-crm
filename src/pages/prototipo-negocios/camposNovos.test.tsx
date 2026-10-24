// Os sete campos novos da página Pessoas, vistos no ecrã: a lista (tabela e cartões) e a ficha. A lógica pura está em pessoasCampos.test.ts.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import PrototipoNegocios from "./PrototipoNegocios";
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

/** A app inteira, no separador Todos: a confirmação só aparece depois de o ecrã se redesenhar (o run do teste simples não redesenha). */
const appTodos = (): void => {
  localStorage.clear();
  localStorage.setItem("olyvia-prototipo-v2", "1");
  render(<PrototipoNegocios />);
  fireEvent.click(screen.getAllByRole("button", { name: "Pessoas" })[0]);
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }), { button: 0 });
};

const separador = (painel: HTMLElement, nome: string): void => { fireEvent.mouseDown(within(painel).getByRole("tab", { name: nome }), { button: 0 }); };

beforeEach(() => { esquecerPessoas(); ecra(true); });
afterEach(() => { cleanup(); window.matchMedia = original; });

describe("Pessoas · os sete campos novos, na lista e na ficha", () => {
  const abrirTodos = (): void => { pagina(); fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }), { button: 0 }); };
  const linhaDe = (nome: string): HTMLElement => screen.getByRole("button", { name: new RegExp(nome) }).closest("tr")!;
  it("a coluna Formulário diz o formulário do primeiro toque ou 'Registada à mão', e a campanha não aparece na lista", async () => {
    abrirTodos();
    await screen.findByRole("table");
    expect(linhaDe("Pedro Lopes")).toHaveTextContent("Site · pedido de orçamento");
    expect(linhaDe("Hugo Matos")).toHaveTextContent("Registada à mão");
    expect(linhaDe("Filipa Moreira")).toHaveTextContent("Cozinha nova");
    expect(within(screen.getByRole("table")).queryByText(/Cozinhas outubro/)).toBeNull();
  });
  it("o resultado do último contacto é um selo em texto junto do 'há N dias'; sem chamadas diz 'Sem contacto'", async () => {
    abrirTodos();
    await screen.findByRole("table");
    expect(linhaDe("Inês Carvalho")).toHaveTextContent("Sem contacto");
    expect(linhaDe("Bruno Teixeira")).toHaveTextContent("Não atendeu");
    expect(linhaDe("Manuel Costa")).toHaveTextContent("Atendeu · ligar mais tarde");
    expect(linhaDe("Luísa Freitas")).toHaveTextContent("Atendeu · interessado");
  });
  it("MQL, SQL, Empresa, 'Voltou a contactar' e 'exemplo' aparecem por baixo do nome, só em algumas pessoas", async () => {
    abrirTodos();
    await screen.findByRole("table");
    expect(linhaDe("Ricardo Nogueira")).toHaveTextContent("MQL");
    expect(linhaDe("Ricardo Nogueira")).toHaveTextContent("Voltou a contactar");
    expect(linhaDe("Inês Carvalho")).toHaveTextContent("Voltou a contactar");
    expect(linhaDe("Filipa Moreira")).toHaveTextContent("SQL");
    expect(linhaDe("Armando Figueiredo")).toHaveTextContent("SQL");
    expect(linhaDe("Condomínio Jardins do Tejo")).toHaveTextContent("Empresa");
    expect(linhaDe("Hotel Praia Dourada")).toHaveTextContent("Empresa");
    expect(linhaDe("Carla Nunes")).not.toHaveTextContent("Voltou a contactar"); // voltou a preencher, mas já teve contacto depois
    expect(linhaDe("Ana Martins")).not.toHaveTextContent(/MQL|SQL|Empresa|exemplo/);
    expect(linhaDe("Inês Carvalho")).toHaveTextContent("exemplo");
  });
  it("o chip Perdidas mostra só as perdidas, com a etapa 'Perdida' e o motivo curto; a lista de leads não as mostra por defeito", async () => {
    pagina();
    expect(screen.queryByRole("button", { name: /Teresa Antunes/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Perdidas/ }));
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(3);
    expect(linhaDe("Teresa Antunes")).toHaveTextContent("Perdida · Preço");
    expect(linhaDe("Duarte Gouveia")).toHaveTextContent("Perdida · Adiou");
    expect(screen.getByRole("button", { name: /^Perdidas/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("em Todos aparecem também as perdidas", async () => {
    abrirTodos();
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: /Teresa Antunes/ })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(22);
  });
  it("a ficha de uma lead perdida tem a etiqueta Perdida junto ao nome, o motivo no Resumo e nenhum botão de próximo passo nem de marcar como perdida", async () => {
    abrirTodos();
    fireEvent.click(await screen.findByRole("button", { name: /Teresa Antunes/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getAllByText("Perdida").length).toBeGreaterThanOrEqual(2); // a etiqueta junto ao nome e a secção do Resumo
    expect(within(painel).getByText("Motivo da perda: Preço")).toBeInTheDocument();
    expect(within(painel).queryByRole("button", { name: /Abrir negócio|Registar chamada|Enviar|Marcar visita/ })).toBeNull();
    expect(within(painel).queryByRole("button", { name: "Marcar como perdida" })).toBeNull();
  });
  it("a ficha de uma empresa mostra a pessoa de contacto e o NIF da empresa, com a etiqueta Empresa; a de uma pessoa não", async () => {
    abrirTodos();
    fireEvent.click(await screen.findByRole("button", { name: /Hotel Praia Dourada/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getAllByText("Empresa").length).toBeGreaterThanOrEqual(1);
    expect(within(painel).getByText("Pessoa de contacto")).toBeInTheDocument();
    expect(within(painel).getByText(/Sónia Batista/)).toBeInTheDocument();
    expect(within(painel).getByText("NIF da empresa")).toBeInTheDocument();
    expect(within(painel).getByText(/509876543/)).toBeInTheDocument();
    expect(within(painel).getByText("Distrito").nextSibling).toHaveTextContent("Faro");
    fireEvent.click(within(painel).getByRole("button", { name: /^Seguinte: / }));
    await waitFor(() => expect(within(painel).queryByText("Pessoa de contacto")).toBeNull());
  });
  it("a ficha de uma lead que voltou a contactar mostra o aviso nos Avisos, o MQL junto ao papel, o distrito e o resultado do último contacto", async () => {
    abrirTodos();
    fireEvent.click(await screen.findByRole("button", { name: /Ricardo Nogueira/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByText(/Voltou a contactar: preencheu o formulário outra vez/)).toBeInTheDocument();
    expect(within(painel).getByText("MQL")).toBeInTheDocument();
    expect(within(painel).getByText("Distrito").nextSibling).toHaveTextContent("Faro");
    expect(within(painel).getByText("Último contacto").nextSibling).toHaveTextContent("Atendeu · ligar mais tarde");
    separador(painel, "Entradas");
    expect((await within(painel).findAllByText("Distrito")).length).toBeGreaterThanOrEqual(1);
  });
  it("marcar uma pessoa de exemplo como perdida pede o motivo numa lista, guarda-o na sessão e passa-a a Perdidas, sem tocar no negócio base", async () => {
    // Na app inteira: a confirmação só aparece depois de o ecrã se redesenhar (o run do teste simples não redesenha).
    localStorage.clear();
    localStorage.setItem("olyvia-prototipo-v2", "1");
    render(<PrototipoNegocios />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pessoas" })[0]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Inês Carvalho/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Marcar como perdida" }));
    const select = within(painel).getByLabelText("Motivo da perda") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Escolhe o motivo", "Preço", "Adiou", "Foi para outra empresa", "Sem resposta", "Não era o que procurava"]);
    fireEvent.change(select, { target: { value: "Sem resposta" } });
    fireEvent.click(within(painel).getByRole("button", { name: /^Sim, marcar como perdida/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /^Perdidas/ }));
    expect(linhaDe("Inês Carvalho")).toHaveTextContent("Perdida · Sem resposta");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
    esquecerPessoas();
    cleanup();
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /^Perdidas/ }));
    expect(screen.queryByRole("button", { name: /Inês Carvalho/ })).toBeNull();
  });
  it("em cartões (abaixo de lg) a lista também mostra o formulário, o resultado e as etiquetas", () => {
    ecra(false);
    pagina();
    const cartao = screen.getByRole("button", { name: /Ricardo Nogueira/ });
    expect(cartao).toHaveTextContent("Faro");
    expect(cartao).toHaveTextContent("Site · pedido de orçamento");
    expect(cartao).toHaveTextContent("Atendeu · ligar mais tarde");
    expect(cartao).toHaveTextContent("MQL");
    expect(cartao).toHaveTextContent("Voltou a contactar");
    expect(screen.getByRole("button", { name: /Hugo Matos/ })).toHaveTextContent("Registada à mão");
  });
});

describe("Pessoas · marcar uma lead da seed como perdida", () => {
  it("o motivo escolhido fica na sessão: a lead sai de Leads, aparece em Perdidas com 'Perdida · Preço' e o motivo no Resumo; Anular repõe-na", async () => {
    localStorage.clear();
    localStorage.setItem("olyvia-prototipo-v2", "1");
    render(<PrototipoNegocios />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pessoas" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Pedro Lopes/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Marcar como perdida" }));
    fireEvent.change(within(painel).getByLabelText("Motivo da perda"), { target: { value: "Foi para outra empresa" } });
    fireEvent.click(within(painel).getByRole("button", { name: /^Sim, marcar como perdida/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: /Pedro Lopes/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Perdidas/ }));
    const linha = screen.getByRole("button", { name: /Pedro Lopes/ });
    expect(linha.closest("tr")).toHaveTextContent("Perdida · Outra empresa");
    fireEvent.click(linha);
    expect(await within(await screen.findByRole("dialog")).findByText("Motivo da perda: Foi para outra empresa")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Pedro Lopes/ })).toBeNull()); // o chip Perdidas continua escolhido: já não há perdidas
    fireEvent.click(screen.getByRole("button", { name: /^Todas/ }));
    expect(screen.getByRole("button", { name: /Pedro Lopes/ }).closest("tr")).not.toHaveTextContent("Perdida");
  });
  it("Esc cancela só a confirmação (o painel fica aberto, o foco volta ao botão e nada se perde); um segundo Esc fecha o painel", async () => {
    appTodos();
    fireEvent.click(await screen.findByRole("button", { name: /Pedro Lopes/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Marcar como perdida" }));
    const cancelar = await within(painel).findByRole("button", { name: /^Cancelar e manter/ });
    await waitFor(() => expect(cancelar).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(within(painel).queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const botao = within(painel).getByRole("button", { name: "Marcar como perdida" });
    await waitFor(() => expect(botao).toHaveFocus());
    expect(within(painel).queryByText(/Motivo da perda/)).toBeNull();
    // A confirmação não ficou presa: volta a abrir, com o motivo vazio.
    fireEvent.click(botao);
    expect((within(painel).getByLabelText("Motivo da perda") as HTMLSelectElement).value).toBe("");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(within(painel).queryByRole("alertdialog")).toBeNull());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Pedro Lopes/ })).toBeInTheDocument();
  });
  it("numa pessoa de exemplo a confirmação não promete 'Anular' e fica limpa depois de perder", async () => {
    appTodos();
    fireEvent.click(await screen.findByRole("button", { name: /Inês Carvalho/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Marcar como perdida" }));
    expect(within(painel).getByRole("alertdialog").textContent).not.toMatch(/Anular/);
    fireEvent.change(within(painel).getByLabelText("Motivo da perda"), { target: { value: "Adiou" } });
    fireEvent.click(within(painel).getByRole("button", { name: /^Sim, marcar como perdida/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

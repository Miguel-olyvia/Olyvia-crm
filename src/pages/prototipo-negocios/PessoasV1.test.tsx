// A proposta do V1 (16/10) na app inteira: o interruptor, Pessoas (lista, nova lead, ficha), o voltar do negócio e Negócios por documento.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrototipoNegocios from "./PrototipoNegocios";
import { esquecerPessoasV1 } from "./PessoasV1";

const menu = (): HTMLElement => screen.getAllByRole("navigation", { name: "Menu" })[0];
const irPara = (nome: string): void => { fireEvent.click(within(menu()).getByRole("button", { name: new RegExp("^" + nome) })); };
const main = (): HTMLElement => screen.getByRole("main");
const botao = (nome: string | RegExp): HTMLElement => within(main()).getByRole("button", { name: nome });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("olyvia-prototipo-v2", "0");
  localStorage.setItem("olyvia-prototipo-v1-proposta", "1");
  esquecerPessoasV1();
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Proposta do V1 · Pessoas e Negócios", () => {
  it("o menu tem Pessoas no lugar de Leads e Clientes, e Negócios tem quatro colunas por documento", () => {
    render(<PrototipoNegocios />);
    expect(within(menu()).getByRole("button", { name: "Pessoas" })).toBeInTheDocument();
    expect(within(menu()).queryByRole("button", { name: "Leads" })).toBeNull();
    irPara("Negócios");
    for (const c of ["Orçamento", "Proposta", "Contrato", "Pagamento"]) expect(within(main()).getAllByRole("heading", { level: 2, name: new RegExp("^" + c) }).length).toBeGreaterThan(0);
    expect(within(main()).queryByRole("heading", { level: 2, name: /^Lead/ })).toBeNull();
  });

  it("a nova lead cria-se em Pessoas: sem nome diz o que falta; com nome abre a ficha com o próximo passo", () => {
    render(<PrototipoNegocios />);
    irPara("Pessoas");
    fireEvent.click(botao(/Nova lead/));
    const form = screen.getByRole("region", { name: "Nova lead" });
    fireEvent.click(within(form).getByRole("button", { name: "Criar a lead" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Falta o nome");
    expect(within(form).getByRole("textbox", { name: "Nome" })).toHaveAttribute("aria-invalid", "true");
    expect(within(form).getByRole("textbox", { name: "Telefone ou email" })).not.toHaveAttribute("aria-describedby");
    fireEvent.change(within(form).getByRole("textbox", { name: "Nome" }), { target: { value: "Teste Novo" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Telefone ou email" }), { target: { value: "912000000" } });
    fireEvent.click(within(form).getByRole("button", { name: "Criar a lead" }));
    expect(screen.getByRole("heading", { level: 1, name: "Teste Novo" })).toBeInTheDocument();
    expect(botao("Registar chamada")).toBeInTheDocument();
    // as notas inventadas não aparecem numa pessoa criada agora
    expect(within(main()).queryByText(/Decide em conjunto/)).toBeNull();
    // o formulário do motor não fica pendurado: Negócios mostra o quadro por documento
    irPara("Negócios");
    expect(within(main()).queryByRole("textbox", { name: "Nome" })).toBeNull();
  });

  it("da ficha abre-se o negócio e o voltar regressa à pessoa; o menu Pessoas leva sempre à lista", () => {
    render(<PrototipoNegocios />);
    irPara("Pessoas");
    fireEvent.click(botao(/^Hugo Matos/));
    fireEvent.click(botao("Abrir o negócio"));
    fireEvent.click(botao(/^Hugo Matos$/)); // o voltar da página do negócio
    expect(screen.getByRole("heading", { level: 1, name: "Hugo Matos" })).toBeInTheDocument();
    irPara("Pessoas");
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
  });

  it("o passo de outro papel diz de quem é e não tem botão; com esse papel, tem", () => {
    render(<PrototipoNegocios />);
    irPara("Pessoas");
    fireEvent.click(botao(/^Clientes/));
    fireEvent.click(botao(/^Tiago Almeida/));
    const agora = screen.getByRole("region", { name: "O que fazer agora" });
    expect(agora).toHaveTextContent("Este passo é de Sandra.");
    expect(within(agora).queryByRole("button", { name: "Emitir fatura" })).toBeNull();
    fireEvent.change(screen.getAllByRole("combobox", { name: "A ver como" })[0], { target: { value: "financeiro" } });
    expect(within(screen.getByRole("region", { name: "O que fazer agora" })).getByRole("button", { name: "Emitir fatura" })).toBeInTheDocument();
  });

  it("desligar a proposta devolve Leads e Clientes", () => {
    render(<PrototipoNegocios />);
    fireEvent.click(screen.getAllByRole("switch", { name: /Proposta nova/ })[0]);
    expect(within(menu()).getByRole("button", { name: "Leads" })).toBeInTheDocument();
    expect(localStorage.getItem("olyvia-prototipo-v1-proposta")).toBe("0");
  });
});

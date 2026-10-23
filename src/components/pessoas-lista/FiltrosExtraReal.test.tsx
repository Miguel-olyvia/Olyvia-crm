// Lote C: os filtros que o servidor aceita (só as minhas, atrasadas, voltou, formulário e resultado) e o botão «Filtros».
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { FiltrosExtraReal } from "./FiltrosExtraReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
const formsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useFormulariosPessoas", () => ({ useFormulariosPessoas: () => formsMock() }));

beforeAll(prepararRadixNoJsdom);

const BASE: FiltrosLista = {
  papel: null, etapa: null, pesquisa: "", ordem: "recentes",
  atribuidoA: null, formularioId: null, ultimoResultado: null, voltou: false, atrasada: false,
};

function desenhar(sobre: Partial<FiltrosLista> = {}, { soMinhas = false, podeSoMinhas = true } = {}) {
  const acoes = {
    aoMudarSoMinhas: vi.fn(), aoMudarAtrasada: vi.fn(), aoMudarVoltou: vi.fn(),
    aoMudarFormulario: vi.fn(), aoMudarResultado: vi.fn(), aoLimpar: vi.fn(),
  };
  render(<FiltrosExtraReal filtros={{ ...BASE, ...sobre }} soMinhas={soMinhas} podeSoMinhas={podeSoMinhas} {...acoes} />);
  return acoes;
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));

beforeEach(() => {
  formsMock.mockReset();
  formsMock.mockReturnValue({
    formularios: [{ id: "f-1", nome: "Pedido de orçamento" }, { id: "f-2", nome: "Remodelações" }], aCarregar: false, erro: false,
  });
});

describe("FiltrosExtraReal: os chips", () => {
  it("«Atrasadas» e «Só as minhas» são botões de alternar, com o estado em aria-pressed", () => {
    desenhar({ atrasada: true }, { soMinhas: false });
    expect(screen.getByRole("button", { name: "Atrasadas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Só as minhas" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicar em «Atrasadas» liga; clicar outra vez desliga", () => {
    const ligar = desenhar();
    fireEvent.click(screen.getByRole("button", { name: "Atrasadas" }));
    expect(ligar.aoMudarAtrasada).toHaveBeenCalledWith(true);
    const desligar = desenhar({ atrasada: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Atrasadas" })[1]);
    expect(desligar.aoMudarAtrasada).toHaveBeenCalledWith(false);
  });

  it("clicar em «Só as minhas» liga e desliga", () => {
    const a = desenhar({}, { soMinhas: true });
    fireEvent.click(screen.getByRole("button", { name: "Só as minhas" }));
    expect(a.aoMudarSoMinhas).toHaveBeenCalledWith(false);
  });

  it("sem o utilizador conhecido «Só as minhas» fica desativado", () => {
    const a = desenhar({}, { podeSoMinhas: false });
    const botao = screen.getByRole("button", { name: "Só as minhas" });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(a.aoMudarSoMinhas).not.toHaveBeenCalled();
  });
});

describe("FiltrosExtraReal: o botão «Filtros»", () => {
  it("sem filtros do painel ativos, não diz quantos", () => {
    desenhar();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
  });

  it("conta os ativos do painel (voltou, formulário, resultado) e diz-o a quem ouve", () => {
    desenhar({ voltou: true, formularioId: "f-1", ultimoResultado: "naoAtendeu" });
    expect(screen.getByRole("button", { name: "Filtros, 3 ativos" })).toBeInTheDocument();
  });

  it("um só ativo: «1 ativo»", () => {
    desenhar({ voltou: true });
    expect(screen.getByRole("button", { name: "Filtros, 1 ativo" })).toBeInTheDocument();
  });
});

describe("FiltrosExtraReal: o painel", () => {
  it("o interruptor «Voltou a contactar» liga o filtro", () => {
    const a = desenhar();
    abrir();
    fireEvent.click(screen.getByRole("switch", { name: "Voltou a contactar" }));
    expect(a.aoMudarVoltou).toHaveBeenCalledWith(true);
  });

  it("com o filtro ligado o interruptor está ligado e desliga", () => {
    const a = desenhar({ voltou: true });
    abrir();
    const interruptor = screen.getByRole("switch", { name: "Voltou a contactar" });
    expect(interruptor).toBeChecked();
    fireEvent.click(interruptor);
    expect(a.aoMudarVoltou).toHaveBeenCalledWith(false);
  });

  it("o formulário escolhe-se entre os da organização, por id; «Todos» limpa", () => {
    const a = desenhar();
    abrir();
    const seletor = screen.getByLabelText("Formulário");
    expect(within(seletor).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todos", "Pedido de orçamento", "Remodelações"]);
    fireEvent.change(seletor, { target: { value: "f-2" } });
    expect(a.aoMudarFormulario).toHaveBeenCalledWith("f-2");
    fireEvent.change(seletor, { target: { value: "" } });
    expect(a.aoMudarFormulario).toHaveBeenLastCalledWith(null);
  });

  it("não há opção «Registada à mão»: a base não filtra por ela", () => {
    desenhar();
    abrir();
    expect(screen.queryByRole("option", { name: "Registada à mão" })).toBeNull();
  });

  it("o resultado tem os cinco da chamada e «Sem contacto»; «Todos» limpa", () => {
    const a = desenhar();
    abrir();
    const seletor = screen.getByLabelText("Resultado do último contacto");
    expect(within(seletor).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual([
      "", "atendeuInteressado", "atendeuMaisTarde", "naoAtendeu", "semInteresse", "numeroErrado", "semContacto",
    ]);
    fireEvent.change(seletor, { target: { value: "semContacto" } });
    expect(a.aoMudarResultado).toHaveBeenCalledWith("semContacto");
    fireEvent.change(seletor, { target: { value: "" } });
    expect(a.aoMudarResultado).toHaveBeenLastCalledWith(null);
  });

  it("«Limpar filtros» chama aoLimpar", () => {
    const a = desenhar({ voltou: true });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(a.aoLimpar).toHaveBeenCalledTimes(1);
  });

  it("se os formulários não carregam, o resto do painel funciona e o aviso é lido", () => {
    formsMock.mockReturnValue({ formularios: [], aCarregar: false, erro: true });
    const a = desenhar();
    abrir();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os formulários.");
    fireEvent.click(screen.getByRole("switch", { name: "Voltou a contactar" }));
    expect(a.aoMudarVoltou).toHaveBeenCalledWith(true);
  });

  it("o formulário escolhido que ainda não está na lista aparece mesmo assim (não volta a «Todos» em silêncio)", () => {
    formsMock.mockReturnValue({ formularios: [], aCarregar: true, erro: false });
    desenhar({ formularioId: "f-9" });
    abrir();
    expect(screen.getByLabelText("Formulário")).toHaveValue("f-9");
  });
});

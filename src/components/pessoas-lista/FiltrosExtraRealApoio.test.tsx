// Os filtros: o seletor de formulário diz quando está a carregar e deixa repetir quando falha; «Só as minhas» desativado explica porquê.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
function desenhar(podeSoMinhas = true) {
  render(
    <FiltrosExtraReal
      filtros={BASE} soMinhas={false} podeSoMinhas={podeSoMinhas} aoMudarSoMinhas={vi.fn()} aoMudarAtrasada={vi.fn()}
      aoMudarVoltou={vi.fn()} aoMudarFormulario={vi.fn()} aoMudarResultado={vi.fn()} aoLimpar={vi.fn()}
    />,
  );
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
const repetir = vi.fn();

beforeEach(() => {
  repetir.mockReset();
  formsMock.mockReset();
});

describe("FiltrosExtraReal: o seletor de formulário", () => {
  it("a carregar: o seletor fica ocupado e desativado, e diz que está a carregar", () => {
    formsMock.mockReturnValue({ formularios: [], aCarregar: true, erro: false, repetir });
    desenhar();
    abrir();
    const seletor = screen.getByLabelText("Formulário");
    expect(seletor).toBeDisabled();
    expect(seletor).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("A carregar formulários...");
  });

  it("carregados: o seletor está livre e sem aviso de carga", () => {
    formsMock.mockReturnValue({ formularios: [{ id: "f-1", nome: "Pedido" }], aCarregar: false, erro: false, repetir });
    desenhar();
    abrir();
    expect(screen.getByLabelText("Formulário")).not.toBeDisabled();
    expect(screen.queryByText("A carregar formulários...")).toBeNull();
  });

  it("com erro: o aviso traz «Tentar de novo», que repete a leitura", () => {
    formsMock.mockReturnValue({ formularios: [], aCarregar: false, erro: true, repetir });
    desenhar();
    abrir();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os formulários.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(repetir).toHaveBeenCalledTimes(1);
  });
});

describe("FiltrosExtraReal: «Só as minhas» desativado", () => {
  beforeEach(() => formsMock.mockReturnValue({ formularios: [], aCarregar: false, erro: false, repetir }));

  it("diz porquê (ainda não se sabe quem está na sessão), ligado ao botão por aria-describedby", () => {
    desenhar(false);
    const botao = screen.getByRole("button", { name: "Só as minhas" });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAccessibleDescription("A identificar o seu utilizador...");
  });

  it("ativo: sem descrição extra", () => {
    desenhar(true);
    expect(screen.getByRole("button", { name: "Só as minhas" })).not.toHaveAccessibleDescription();
  });
});

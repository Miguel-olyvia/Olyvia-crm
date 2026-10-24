// «Anular a perda» na ficha real: a base exige uma razão (1 a 1000 caracteres), por isso há um diálogo que a pede. Espera pela base
// (a guardar, aria-busy, texto anunciado), mostra o erro traduzido pelo código em role="alert" DENTRO do diálogo e só fecha em sucesso.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { negocioBase } from "@/components/pessoas/fabricaTestes";
import { AnularPerdaDialogo } from "./AnularPerdaDialogo";
import { ComCostura, erroNegFalso, mutacoesFalsas, pendente } from "./costuraTestUtil";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

const negocio = negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "perdido" });

function montar(mutacoes = mutacoesFalsas(), aberto = true) {
  const aoFechar = vi.fn();
  const aoAnulado = vi.fn();
  const { rerender } = render(
    <ComCostura mutacoes={mutacoes}><AnularPerdaDialogo negocio={aberto ? negocio : null} aoFechar={aoFechar} aoAnulado={aoAnulado} /></ComCostura>,
  );
  return { aoFechar, aoAnulado, mutacoes, rerender };
}
const campo = () => screen.getByRole("textbox", { name: "Razão para anular a perda" });
const confirmar = () => screen.getByRole("button", { name: /^(Anular a perda|A guardar…)$/ });
const escrever = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });

describe("AnularPerdaDialogo: abrir", () => {
  it("fechado não desenha nada", () => {
    montar(mutacoesFalsas(), false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aberto diz o negócio e pede a razão, com o foco no campo", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Anular a perda" });
    expect(dialogo).toHaveTextContent("Cozinha");
    expect(dialogo).toHaveTextContent("Ana");
    expect(campo()).toHaveFocus();
  });

  it("sem mutações da ficha real (o exemplo) não desenha nada: nunca é um beco sem saída", () => {
    render(<ComCostura mutacoes={null}><AnularPerdaDialogo negocio={negocio} aoFechar={vi.fn()} /></ComCostura>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("AnularPerdaDialogo: validar a razão", () => {
  it("vazia: o erro diz-se em texto, o campo fica inválido e com o foco, e a base não é chamada", () => {
    const { mutacoes } = montar();
    fireEvent.click(confirmar());
    const erro = screen.getByText("Escreva a razão para anular a perda.");
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(campo().getAttribute("aria-describedby")).toContain(erro.id);
    expect(campo()).toHaveFocus();
    expect(mutacoes.anular).not.toHaveBeenCalled();
  });

  it("só com espaços também é vazia", () => {
    const { mutacoes } = montar();
    escrever("   ");
    fireEvent.click(confirmar());
    expect(screen.getByText("Escreva a razão para anular a perda.")).toBeInTheDocument();
    expect(mutacoes.anular).not.toHaveBeenCalled();
  });

  it("com mais de 1000 caracteres: erro em texto e a base não é chamada", () => {
    const { mutacoes } = montar();
    escrever("x".repeat(1001));
    fireEvent.click(confirmar());
    expect(screen.getByText("A razão tem no máximo 1000 caracteres.")).toBeInTheDocument();
    expect(mutacoes.anular).not.toHaveBeenCalled();
  });

  it("o campo limita a escrita a 1000 caracteres", () => {
    montar();
    expect(campo()).toHaveAttribute("maxlength", "1000");
  });
});

describe("AnularPerdaDialogo: guardar", () => {
  it("chama anular com o negócio e a razão, e só depois fecha e anuncia", async () => {
    const acao = pendente<{ mudou: boolean }>();
    const { aoFechar, aoAnulado, mutacoes } = montar(mutacoesFalsas({ anular: vi.fn(() => acao.promessa) }));
    escrever("O cliente voltou");
    fireEvent.click(confirmar());
    expect(mutacoes.anular).toHaveBeenCalledWith("n1", "O cliente voltou");
    expect(aoFechar).not.toHaveBeenCalled();
    await acao.terminar({ mudou: true });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoAnulado).toHaveBeenCalledWith("Ana: perda anulada. O negócio Cozinha voltou a estar em curso.");
  });

  it("enquanto a base responde: o botão fica aria-disabled e aria-busy (com o nome de sempre), «A guardar…» é anunciado só na região de estado e um segundo clique não repete", () => {
    const acao = pendente<{ mudou: boolean }>();
    const { mutacoes } = montar(mutacoesFalsas({ anular: vi.fn(() => acao.promessa) }));
    escrever("Razão");
    fireEvent.click(confirmar());
    const botao = confirmar();
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("aria-busy", "true");
    // O nome do botão não muda (o «A guardar…» só se anuncia na região de estado, senão leria-se duas vezes) e o aria-disabled tem pista visual.
    expect(botao).toHaveTextContent("Anular a perda");
    expect(botao).not.toHaveTextContent("A guardar…");
    expect(botao.className).toMatch(/aria-disabled:/);
    expect(screen.getByRole("status")).toHaveTextContent("A guardar…");
    fireEvent.click(botao);
    expect(mutacoes.anular).toHaveBeenCalledTimes(1);
  });

  it("a guardar, «Cancelar» não fecha (a gravação já seguiu)", () => {
    const acao = pendente<{ mudou: boolean }>();
    const { aoFechar } = montar(mutacoesFalsas({ anular: vi.fn(() => acao.promessa) }));
    escrever("Razão");
    fireEvent.click(confirmar());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("mudou: false (já estava em curso) diz o mesmo texto e fecha", async () => {
    const { aoFechar, aoAnulado } = montar(mutacoesFalsas({ anular: vi.fn(async () => ({ mudou: false })) }));
    escrever("Razão");
    fireEvent.click(confirmar());
    await screen.findByRole("dialog");
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoAnulado).toHaveBeenCalledWith("Ana: perda anulada. O negócio Cozinha voltou a estar em curso.");
  });

  it("escreve a razão sem espaços nas pontas", () => {
    const { mutacoes } = montar();
    escrever("  Razão certa  ");
    fireEvent.click(confirmar());
    expect(mutacoes.anular).toHaveBeenCalledWith("n1", "Razão certa");
  });
});

describe("AnularPerdaDialogo: erros", () => {
  it("um erro da base traduz-se pelo código, em role=alert DENTRO do diálogo, e o diálogo fica aberto e pronto a repetir", async () => {
    const acao = pendente<{ mudou: boolean }>();
    const anular = vi.fn().mockReturnValueOnce(acao.promessa).mockResolvedValueOnce({ mudou: true });
    const { aoFechar } = montar(mutacoesFalsas({ anular }));
    escrever("Razão");
    fireEvent.click(confirmar());
    await acao.falhar(erroNegFalso("pessoasPagina.erroNeg.ng002", "NG002"));
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("O estado atual não permite esta ação.");
    expect(screen.getByRole("dialog")).toContainElement(alerta);
    expect(aoFechar).not.toHaveBeenCalled();
    expect(confirmar()).not.toHaveAttribute("aria-disabled", "true");
    expect(confirmar()).not.toHaveAttribute("aria-busy", "true");
    fireEvent.click(confirmar());
    await vi.waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(anular).toHaveBeenCalledTimes(2);
  });

  it("um erro sem chave conhecida mostra a mensagem genérica, nunca o texto cru", async () => {
    const acao = pendente<{ mudou: boolean }>();
    montar(mutacoesFalsas({ anular: vi.fn(() => acao.promessa) }));
    escrever("Razão");
    fireEvent.click(confirmar());
    await acao.falhar(new Error("duplicate key value violates unique constraint"));
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir a ação. Tente novamente.");
    expect(screen.queryByText(/duplicate key/)).toBeNull();
  });

  it("o erro some quando se tenta de novo", async () => {
    const primeira = pendente<{ mudou: boolean }>();
    const segunda = pendente<{ mudou: boolean }>();
    montar(mutacoesFalsas({ anular: vi.fn().mockReturnValueOnce(primeira.promessa).mockReturnValueOnce(segunda.promessa) }));
    escrever("Razão");
    fireEvent.click(confirmar());
    await primeira.falhar(erroNegFalso("pessoasPagina.erroNeg.ng001"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(confirmar());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

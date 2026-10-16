import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DirecaoSimulada } from "./DirecaoSimulada";
import type { NegocioDoPasso } from "./tiposProcesso";
import type { FaltaProcesso } from "./portoesProcesso";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);

const NEGOCIO: NegocioDoPasso = { id: "n1", nome: "Ana Silva", trabalho: "Cozinha" };

function montar(extra: { negocio?: NegocioDoPasso | null; faltas?: FaltaProcesso[] } = {}) {
  const aoResponder = vi.fn((_aprovada: boolean): FaltaProcesso[] => extra.faltas ?? []);
  const aoFechar = vi.fn();
  const aoDevolverFoco = vi.fn(() => false);
  const explicar = (faltas: FaltaProcesso[]) => `não: ${faltas.join(",")}`;
  const ui = (negocio: NegocioDoPasso | null) => (
    <DirecaoSimulada negocio={negocio} margem={0.245} aoResponder={aoResponder} explicar={explicar} aoFechar={aoFechar} aoDevolverFoco={aoDevolverFoco} />
  );
  const { rerender } = render(ui(extra.negocio === undefined ? NEGOCIO : extra.negocio));
  return { aoResponder, aoFechar, aoDevolverFoco, fechar: () => rerender(ui(null)) };
}

describe("DirecaoSimulada", () => {
  it("tem título e descrição, com o trabalho, a pessoa e a margem pedida", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Direção (simulada): Cozinha" });
    expect(dialogo).toHaveAccessibleDescription(/Ana Silva.*margem de 24,5 %.*Só exemplo/);
  });

  it("fechado (sem negócio) não mostra nada", () => {
    montar({ negocio: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a resposta é obrigatória: sem escolher, o erro é um alerta ligado ao grupo, o foco vai para ele e nada se regista", () => {
    const { aoResponder } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Registar a resposta" }));
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Escolha a resposta da Direção.");
    const grupo = screen.getByRole("radiogroup");
    expect(grupo).toHaveAttribute("aria-invalid", "true");
    expect(grupo).toHaveAttribute("aria-describedby", alerta.id);
    expect(aoResponder).not.toHaveBeenCalled();
    expect(grupo.contains(document.activeElement)).toBe(true);
  });

  it("o texto do erro não depende da cor (text-foreground) e a cor fica só no ícone", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Registar a resposta" }));
    expect(screen.getByRole("alert").className).toContain("text-foreground");
    expect(screen.getByRole("alert").className).not.toContain("text-destructive");
  });

  it("aprovar a exceção regista a aprovação", () => {
    const { aoResponder } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Aprovar a exceção" }));
    fireEvent.click(screen.getByRole("button", { name: "Registar a resposta" }));
    expect(aoResponder).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recusar regista a recusa", () => {
    const { aoResponder } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Recusar" }));
    fireEvent.click(screen.getByRole("button", { name: "Registar a resposta" }));
    expect(aoResponder).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("se o registo diz que falta algo (já não há pedido), diz-se dentro do diálogo, que continua aberto", () => {
    const { aoFechar } = montar({ faltas: ["semPedido"] });
    fireEvent.click(screen.getByRole("radio", { name: "Recusar" }));
    fireEvent.click(screen.getByRole("button", { name: "Registar a resposta" }));
    expect(screen.getByRole("alert")).toHaveTextContent("não: semPedido");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("Esc e Cancelar fecham sem registar", async () => {
    const { aoFechar, aoResponder } = montar();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(2);
    expect(aoResponder).not.toHaveBeenCalled();
  });

  it("ao fechar pede para devolver o foco (e desmonta)", async () => {
    const { fechar, aoDevolverFoco } = montar();
    fechar();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(aoDevolverFoco).toHaveBeenCalled());
  });

  it("os botões têm 44 px de altura e o grupo tem legenda", () => {
    montar();
    for (const botao of within(screen.getByRole("dialog")).getAllByRole("button")) expect(botao.className).toContain("min-h-11");
    expect(screen.getByRole("group", { name: "Resposta da Direção" })).toBeInTheDocument();
  });
});

describe("DirecaoSimulada: o grupo de respostas", () => {
  it("o radiogroup tem nome (a legenda), é obrigatório e a legenda traz um asterisco que o nome acessível não lê", () => {
    montar();
    const grupo = screen.getByRole("radiogroup", { name: "Resposta da Direção" });
    expect(grupo).toBeRequired();
    const legenda = screen.getByText("Resposta da Direção", { selector: "legend" });
    expect(legenda.querySelector('[aria-hidden="true"]')?.textContent).toBe("*");
  });
});

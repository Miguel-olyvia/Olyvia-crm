// O armazém de módulo das famílias do Configurador (protótipo, só em memória): subscrição, registo em familias.ts e sobrevivência ao desmontar.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { familiaKeranDeTeste } from "./familiaDeTeste";
import { familiaPorId } from "./familias";
import { definirFamiliasConfiguradas, familiasConfiguradas, limparFamiliasConfiguradas, subscreverFamiliasConfiguradas, useFamiliasConfiguradas } from "./familiasConfiguradas";

afterEach(() => { cleanup(); limparFamiliasConfiguradas(); });

function Lista() {
  const l = useFamiliasConfiguradas();
  return <p data-testid="n">{l.map((f) => f.nome).join("|") || "vazio"}</p>;
}

describe("familiasConfiguradas", () => {
  it("começa vazio", () => {
    expect(familiasConfiguradas()).toEqual([]);
    expect(familiaPorId("cfg:lava-loica-keran")).toBeUndefined();
  });

  it("definir guarda a lista, regista-a em familias.ts (origem configurada) e avisa os subscritores", () => {
    const ouvinte = vi.fn();
    const parar = subscreverFamiliasConfiguradas(ouvinte);
    definirFamiliasConfiguradas([familiaKeranDeTeste()]);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(familiasConfiguradas().map((f) => f.id)).toEqual(["cfg:lava-loica-keran"]);
    expect(familiaPorId("cfg:lava-loica-keran")?.origem).toBe("configurada");
    parar();
    definirFamiliasConfiguradas([]);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(familiaPorId("cfg:lava-loica-keran")).toBeUndefined();
  });

  it("não guarda a referência da lista recebida (a lista guardada não muda por fora)", () => {
    const entrada = [familiaKeranDeTeste()];
    definirFamiliasConfiguradas(entrada);
    entrada.pop();
    expect(familiasConfiguradas()).toHaveLength(1);
  });

  it("o hook mostra o estado e volta a desenhar quando muda", () => {
    render(<Lista />);
    expect(screen.getByTestId("n")).toHaveTextContent("vazio");
    act(() => definirFamiliasConfiguradas([familiaKeranDeTeste()]));
    expect(screen.getByTestId("n")).toHaveTextContent("Lava-loiça Keran");
  });

  it("sobrevive a desmontar quem o usa: a lista e o registo ficam", () => {
    const { unmount } = render(<Lista />);
    act(() => definirFamiliasConfiguradas([familiaKeranDeTeste()]));
    unmount();
    expect(familiasConfiguradas()).toHaveLength(1);
    expect(familiaPorId("cfg:lava-loica-keran")).toBeDefined();
    render(<Lista />);
    expect(screen.getByTestId("n")).toHaveTextContent("Lava-loiça Keran");
  });

  it("um desmontar não limpa o registo; só limparFamiliasConfiguradas o faz", () => {
    definirFamiliasConfiguradas([familiaKeranDeTeste()]);
    cleanup();
    expect(familiaPorId("cfg:lava-loica-keran")).toBeDefined();
    limparFamiliasConfiguradas();
    expect(familiaPorId("cfg:lava-loica-keran")).toBeUndefined();
    expect(familiasConfiguradas()).toEqual([]);
  });
});

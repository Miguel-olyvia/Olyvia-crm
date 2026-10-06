/**
 * O ditado: o browser ouve (simulado), o sistema propõe, a pessoa confirma.
 * Nada se grava aqui — só se devolve a proposta a quem chamou.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

type Cb = { aoTexto: (t: string) => void; aoFim: (t: string) => void; aoErro: (m: string) => void };
let ultimo: Cb | null = null;
let suportada = true;

vi.mock("../../lib/fala", () => ({
  falaSuportada: () => suportada,
  ouvir: (cb: Cb) => {
    ultimo = cb;
    return { parar: vi.fn(), cancelar: vi.fn() };
  },
}));

import FalarTarefa, { FolhaDitado } from "../FalarTarefa";

const TAREFA = { nome: "Assentar base de duche", inicio_planeado: "2026-10-06", fim_planeado: "2026-10-06" };

describe("FolhaDitado", () => {
  it("material em falta: propõe um atraso com nova data e devolve-o ao confirmar", () => {
    const aoConfirmar = vi.fn();
    render(<FolhaDitado tarefa={TAREFA} intencoes={["atraso", "feita", "nota"]} aoFechar={() => {}} aoConfirmar={aoConfirmar} hoje="2026-10-06" />);
    expect(screen.getByText(/A ouvir/)).toBeTruthy();

    act(() => ultimo!.aoTexto("falta o sifão"));
    act(() => ultimo!.aoFim("falta o sifão, só chega amanhã"));

    const prop = screen.getByTestId("proposta-fala");
    expect(prop.textContent).toContain("Material em falta");
    expect(prop.textContent).toContain("novo fim a 07/10");

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(aoConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ intencao: "atraso", motivo: "material_em_falta", novoFim: "2026-10-07" })
    );
  });

  it("a pessoa corrige a intenção antes de confirmar", () => {
    const aoConfirmar = vi.fn();
    render(<FolhaDitado tarefa={TAREFA} intencoes={["atraso", "feita", "nota"]} aoFechar={() => {}} aoConfirmar={aoConfirmar} hoje="2026-10-06" />);
    act(() => ultimo!.aoFim("azulejo assente na parede do duche"));
    expect(screen.getByTestId("proposta-fala").textContent).toContain("legenda da próxima foto");
    fireEvent.click(screen.getByRole("button", { name: "Está feita" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ intencao: "feita", texto: "azulejo assente na parede do duche" }));
  });

  it("só atraso (painel do supervisor): uma nota vira atraso 'Outro'", () => {
    const aoConfirmar = vi.fn();
    render(<FolhaDitado tarefa={TAREFA} intencoes={["atraso"]} aoFechar={() => {}} aoConfirmar={aoConfirmar} hoje="2026-10-06" />);
    act(() => ultimo!.aoFim("o cliente pediu para mudar o azulejo"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ intencao: "atraso", motivo: "outro" }));
  });

  it("erro do microfone: diz o que fazer e deixa escrever à mão", () => {
    render(<FolhaDitado tarefa={TAREFA} intencoes={["atraso", "nota"]} aoFechar={() => {}} aoConfirmar={() => {}} hoje="2026-10-06" />);
    act(() => ultimo!.aoErro("O browser não deixou usar o microfone."));
    expect(screen.getByRole("alert").textContent).toContain("microfone");
    const caixa = screen.getByLabelText("O que foi dito");
    fireEvent.change(caixa, { target: { value: "ainda não secou" } });
    fireEvent.blur(caixa);
    expect(screen.getByTestId("proposta-fala").textContent).toContain("Secagem");
  });
});

describe("FalarTarefa", () => {
  it("sem suporte no browser: botão desligado, com o porquê no tooltip", () => {
    suportada = false;
    render(<FalarTarefa tarefa={TAREFA} aoConfirmar={() => {}} />);
    const el = screen.getByText("Ditar").closest("span")!;
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("title")).toContain("não funciona neste browser");
    suportada = true;
  });
});

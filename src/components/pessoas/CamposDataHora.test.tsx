import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CamposDataHora, MensagemErro } from "./CamposDataHora";

describe("MensagemErro", () => {
  it("é um alerta (o erro de um campo que já tem o foco também se anuncia) e liga-se ao campo pelo id", () => {
    render(<MensagemErro id="e1" texto="Escolha o dia." />);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Escolha o dia.");
    expect(alerta).toHaveAttribute("id", "e1");
  });

  it("o texto não usa a cor destrutiva (contraste abaixo de 4,5:1): fica só no ícone, escondido do leitor de ecrã", () => {
    render(<MensagemErro id="e1" texto="Escolha o dia." />);
    const alerta = screen.getByRole("alert");
    expect(alerta.className).toContain("text-foreground");
    expect(alerta.className).not.toContain("text-destructive");
    const icone = alerta.querySelector("svg");
    expect(icone?.getAttribute("class")).toContain("text-destructive");
    expect(icone).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CamposDataHora: erros por campo", () => {
  it("cada erro é um alerta ligado ao seu campo por aria-describedby", () => {
    render(
      <CamposDataHora
        id="x" data="" hora="" hoje="2026-10-13" rotuloData="Dia" rotuloHora="Hora" erroData="Escolha o dia." erroHora="Escolha a hora." aoMudar={() => {}}
      />,
    );
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Escolha o dia.", "Escolha a hora."]);
    expect(screen.getByLabelText("Dia")).toHaveAttribute("aria-describedby", "x-data-erro");
    expect(screen.getByLabelText("Hora")).toHaveAttribute("aria-describedby", "x-hora-erro");
  });

  it("sem erros não há alertas", () => {
    render(<CamposDataHora id="x" data="" hora="" hoje="2026-10-13" rotuloData="Dia" rotuloHora="Hora" erroData={null} erroHora={null} aoMudar={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

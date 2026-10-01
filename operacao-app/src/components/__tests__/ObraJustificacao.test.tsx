import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ObraJustificacao from "../ObraJustificacao";

function montar(obrigatoria: boolean) {
  const aoConfirmar = vi.fn();
  render(
    <ObraJustificacao
      reais={95}
      previstos={60}
      tolerancia={10}
      obrigatoria={obrigatoria}
      aGravar={false}
      erro={null}
      aoCancelar={() => {}}
      aoConfirmar={aoConfirmar}
    />
  );
  return aoConfirmar;
}

describe("ObraJustificacao", () => {
  it("obrigatória: sem motivo não confirma e diz porquê", () => {
    const aoConfirmar = montar(true);
    expect(screen.getByText(/a justificação é obrigatória/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirmar feita"));
    expect(aoConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText("Escolhe o motivo do desvio.")).toBeInTheDocument();
  });

  it("'Outro' exige nota", () => {
    const aoConfirmar = montar(true);
    fireEvent.click(screen.getByText("Outro (explicar)"));
    fireEvent.click(screen.getByText("Confirmar feita"));
    expect(aoConfirmar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/parede ainda húmida/), { target: { value: "Chuva forte" } });
    fireEvent.click(screen.getByText("Confirmar feita"));
    expect(aoConfirmar).toHaveBeenCalledWith("outro", "Chuva forte");
  });

  it("um motivo da lista chega", () => {
    const aoConfirmar = montar(true);
    fireEvent.click(screen.getByText("Secagem / cura"));
    fireEvent.click(screen.getByText("Confirmar feita"));
    expect(aoConfirmar).toHaveBeenCalledWith("secagem", "");
  });

  it("não obrigatória: confirma sem motivo", () => {
    const aoConfirmar = montar(false);
    fireEvent.click(screen.getByText("Confirmar feita"));
    expect(aoConfirmar).toHaveBeenCalledWith(null, "");
  });
});

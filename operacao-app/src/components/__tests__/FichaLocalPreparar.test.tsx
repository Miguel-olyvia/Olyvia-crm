import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FichaLocal from "../FichaLocal";

vi.mock("../../lib/obras", () => ({
  fichaLocalDaObra: vi.fn(async () => ({
    piso: "4.º Esq",
    tem_elevador: false,
    n_andares: 5,
    estacionamento: "pago",
    zona_estacionamento: "vermelha",
    habitada_durante_obra: true,
  })),
  areasDaVisitaDoOrcamento: vi.fn(async () => [
    { diag_tipo_area: "casa_banho", diag_distancia_entrada: "longa", diag_portas_proteger: 2, diag_mobilada: "pouco" },
  ]),
}));

describe("FichaLocal — a preparar", () => {
  it("na ficha da obra mostra as proteções e a logística com os dias do plano", async () => {
    render(<FichaLocal obraId="o-preparar" plano={{ inicio: "2026-10-05", fim: "2026-10-16", orcamentoId: "q1" }} />);
    expect(await screen.findByTestId("ficha-local-preparar")).toBeInTheDocument();
    expect(screen.getByText("Parquímetro da carrinha")).toBeInTheDocument();
    expect(screen.getByText("Proteção das escadas e patamares")).toBeInTheDocument();
    expect(screen.getByText("Porta de pó com fecho (kit)")).toBeInTheDocument();
    expect(await screen.findByText(/distância longa/)).toBeInTheDocument();
    expect(screen.getByText(/10 dias úteis do plano/)).toBeInTheDocument();
  });

  it("no cartão do técnico (sem plano) não mostra a lista", async () => {
    render(<FichaLocal obraId="o-tecnico" compacta />);
    expect(await screen.findByTestId("ficha-local")).toBeInTheDocument();
    expect(screen.queryByTestId("ficha-local-preparar")).not.toBeInTheDocument();
  });
});

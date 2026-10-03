/**
 * A folha "Vai atrasar" e o "Cliente avisado". A base é simulada: as regras
 * de verdade (quem pode, cadeia, plano original) estão em validar-obras.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/supabase", () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }), auth: {}, functions: {}, storage: { from: () => ({}) } } }));

const resposta = (p: Record<string, unknown> = {}) => ({
  ok: true,
  simulado: true,
  atraso_id: null,
  fim_anterior: "2026-10-05",
  novo_fim: "2026-10-07",
  minutos_estimativa: 1260,
  empurradas: [
    { tarefa_id: "t2", nome: "Impermeabilizar", inicio_anterior: "2026-10-06", fim_anterior: "2026-10-06", novo_inicio: "2026-10-08", novo_fim: "2026-10-08" },
  ],
  fim_obra_anterior: "2026-10-09",
  fim_obra_novo: "2026-10-13",
  ...p,
});

vi.mock("../../lib/obras", () => ({
  simularAtraso: vi.fn(async () => resposta()),
  registarAtraso: vi.fn(async () => resposta({ simulado: false, atraso_id: "a1" })),
  marcarClienteAvisado: vi.fn(async () => ({ ok: true, ja_avisado: false })),
}));

import ObraAtraso, { ClienteAvisado } from "../ObraAtraso";
import * as obras from "../../lib/obras";
import { ErroDeEscrita } from "../../lib/dados";

const TAREFA = {
  id: "t1",
  nome: "Assentar base de duche",
  inicio_planeado: "2026-10-05",
  fim_planeado: "2026-10-05",
  minutos_previstos: 300,
  pessoas: ["u1", "u2"],
  pessoas_previstas: 2,
  minutos_por_dia: 480,
};

function montar(p: Partial<Parameters<typeof ObraAtraso>[0]> = {}) {
  const aoGravar = vi.fn();
  const aoFechar = vi.fn();
  render(<ObraAtraso tarefa={TAREFA} atrasoPreviewMs={0} aoFechar={aoFechar} aoGravar={aoGravar} {...p} />);
  return { aoGravar, aoFechar };
}

beforeEach(() => {
  vi.mocked(obras.simularAtraso).mockClear();
  vi.mocked(obras.registarAtraso).mockClear();
  vi.mocked(obras.marcarClienteAvisado).mockClear();
});

describe("ObraAtraso — 'Vai atrasar'", () => {
  it("motivo e contexto são obrigatórios: sem eles não grava e diz porquê", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Registar atraso" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escolhe o motivo do atraso.");
    fireEvent.click(screen.getByRole("button", { name: "Secagem / cura" }));
    fireEvent.change(screen.getByPlaceholderText(/betonilha/), { target: { value: "hum" } });
    fireEvent.click(screen.getByRole("button", { name: "Registar atraso" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/contexto/);
    fireEvent.change(screen.getByPlaceholderText(/betonilha/), { target: { value: "Ainda húmido" } });
    fireEvent.click(screen.getByRole("button", { name: "Registar atraso" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/quanto tempo a mais/);
    expect(obras.registarAtraso).not.toHaveBeenCalled();
  });

  it("'mais 1 dia' com 2 pessoas = 960 min de mão de obra, e mostra o impacto na tarefa e na obra", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "dias" }));
    fireEvent.change(screen.getByLabelText("Quanto tempo a mais"), { target: { value: "1" } });
    await waitFor(() =>
      expect(obras.simularAtraso).toHaveBeenLastCalledWith({
        tarefaId: "t1", motivo: null, contexto: "", minutosExtra: 960, novoFim: null, empurrar: true,
      })
    );
    const impacto = await screen.findByTestId("impacto-atraso");
    await waitFor(() => expect(impacto).toHaveTextContent("07/10/2026"));
    expect(impacto).toHaveTextContent("13/10/2026");
    expect(impacto).toHaveTextContent("+2 dias úteis");
    expect(impacto).toHaveTextContent("Avisar o cliente");
    expect(impacto).toHaveTextContent("Impermeabilizar");
  });

  it("nova data de fim, sem empurrar: grava isso mesmo e devolve a resposta", async () => {
    const { aoGravar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Material em falta" }));
    fireEvent.change(screen.getByPlaceholderText(/betonilha/), { target: { value: "A base só chega quarta" } });
    fireEvent.click(screen.getByRole("button", { name: "Nova data de fim" }));
    fireEvent.change(screen.getByLabelText("Nova data de fim"), { target: { value: "2026-10-07" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Registar atraso" }));
    await waitFor(() =>
      expect(obras.registarAtraso).toHaveBeenCalledWith({
        tarefaId: "t1", motivo: "material_em_falta", contexto: "A base só chega quarta",
        minutosExtra: null, novoFim: "2026-10-07", empurrar: false,
      })
    );
    await waitFor(() => expect(aoGravar).toHaveBeenCalledWith(expect.objectContaining({ atraso_id: "a1" })));
  });

  it("uma data para trás é recusada no ecrã", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Outro" }));
    fireEvent.change(screen.getByPlaceholderText(/betonilha/), { target: { value: "Qualquer coisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Nova data de fim" }));
    fireEvent.change(screen.getByLabelText("Nova data de fim"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Registar atraso" }));
    expect(screen.getByRole("alert")).toHaveTextContent("antes do fim previsto");
    expect(obras.registarAtraso).not.toHaveBeenCalled();
  });

  it("se a base recusar a conta, a pré-visualização diz porquê", async () => {
    vi.mocked(obras.simularAtraso).mockRejectedValueOnce(new ErroDeEscrita("A obra está concluida; já não se registam atrasos."));
    montar();
    fireEvent.change(screen.getByLabelText("Quanto tempo a mais"), { target: { value: "2" } });
    expect(await screen.findByText(/já não se registam atrasos/)).toBeInTheDocument();
  });
});

describe("ClienteAvisado", () => {
  it("marca o atraso como avisado com a nota, e fecha", async () => {
    const aoGravar = vi.fn();
    const aoFechar = vi.fn();
    render(
      <ClienteAvisado atrasoId="a1" titulo="Assentar base" detalhe="Secagem / cura: húmido" aoFechar={aoFechar} aoGravar={aoGravar} />
    );
    expect(screen.getByText("Secagem / cura: húmido")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/liguei/), { target: { value: "  Liguei à D. Maria  " } });
    fireEvent.click(screen.getByRole("button", { name: "Marcar como avisado" }));
    await waitFor(() => expect(obras.marcarClienteAvisado).toHaveBeenCalledWith("a1", "  Liguei à D. Maria  "));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoGravar).toHaveBeenCalled();
  });
});

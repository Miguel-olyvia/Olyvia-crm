// 11/11: na visita, a análise mostra o levantamento à parte: as escolhas peça a peça (decididas ou por decidir), as medidas e os valores.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightsConversa } from "./InsightsConversa";
import type { Insights, InsightsGuardados } from "./chamadaMotor";

afterEach(cleanup);

const base: Insights = {
  resumo: "Casa de banho em cinzento.", temperatura: "morno", pontuacao: 65, porque_temperatura: "Falta o orçamento.", motivacao: null,
  necessidades: [], orcamento: { valor: null, sensibilidade: "desconhecida" }, prazo: { quando: "fevereiro", urgencia: "media" }, decisores: [],
  concorrencia: { outros_orcamentos: "desconhecido" }, objecoes: [], sinais_compra: [], preferencias: [], riscos: [], compromissos: [],
  proximos_passos: [], por_perguntar: [], oportunidades: [], momentos: [], coaching: { correu_bem: [], a_melhorar: [] }, sentimento: { inicio: "neutro", fim: "positivo" },
};
const dados = (x: Partial<Insights>): InsightsGuardados => ({ insights: { ...base, ...x }, tempos: [0, 12, 75], em: "2026-11-11", metricas: { duracaoS: 90, falas: 3, pctComercial: 50, pctCliente: 50, perguntasComercial: 1, maiorFalaClienteS: 5 } });

describe("InsightsConversa: o levantamento da visita (11/11)", () => {
  it("escolhas com o estado, medidas e valores, cada um com o tempo que leva à frase", () => {
    const ir = vi.fn();
    render(<InsightsConversa tipo="visita" onIrPara={ir} dados={dados({
      escolhas: [{ peca: "Base de duche", escolha: "à medida, preta", decidida: true, linha: 1 }, { peca: "Móvel", escolha: "suspenso ou com pés", decidida: false, linha: null }],
      medidas: [{ o_que: "Parede da janela", valor: "2,10 m", linha: 2 }],
      valores: [{ texto: "2 semanas de obra", linha: null }],
    })} />);
    const lista = screen.getByRole("list", { name: "Escolhas peça a peça" });
    expect(within(lista).getByText(/à medida, preta/)).toBeInTheDocument();
    expect(within(lista).getByText("por decidir")).toBeInTheDocument();
    expect(screen.getByText("2,10 m")).toBeInTheDocument();
    expect(screen.getByText(/2 semanas de obra/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir ao minuto 1:15 da conversa" }));
    expect(ir).toHaveBeenCalledWith(75);
  });
  it("sem levantamento (análises antigas ou a chamada), não aparece", () => {
    render(<InsightsConversa tipo="chamada" dados={dados({})} />);
    expect(screen.queryByText("O levantamento")).toBeNull();
  });
});

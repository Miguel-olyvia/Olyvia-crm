import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string, p?: Record<string, unknown>) => (p ? `${chave}|${JSON.stringify(p)}` : chave) }),
}));

import { IndicacaoDoResponsavel } from "./IndicacaoDoResponsavel";

const INDICACOES = [
  { id: "i1", vinculo_id: "v1", ciclo_fim: "2026-12-31", resposta: "nao_pretendo_continuar" as const, indicada_em: "2026-11-05T10:00:00Z" },
];

describe("IndicacaoDoResponsavel: o que o responsável indicou (lido do hook real de fim de contrato)", () => {
  it("mostra a resposta do ciclo atual e quando foi indicada", () => {
    render(<IndicacaoDoResponsavel vinculoId="v1" dataFim="2026-12-31" indicacoes={INDICACOES} />);
    expect(screen.getByText("hr.fimContrato.resposta.nao_pretendo_continuar")).toBeInTheDocument();
    expect(screen.getByText(/rhA\.fimContrato\.indicacaoEm/)).toBeInTheDocument();
  });

  it("sem indicação neste ciclo, diz que o responsável ainda não indicou", () => {
    render(<IndicacaoDoResponsavel vinculoId="v1" dataFim="2027-06-30" indicacoes={INDICACOES} />);
    expect(screen.getByText("rhA.fimContrato.indicacaoAinda")).toBeInTheDocument();
    expect(screen.queryByText(/hr\.fimContrato\.resposta\./)).not.toBeInTheDocument();
  });

  it("lembra sempre que é só uma indicação: quem renova ou termina é o RH", () => {
    render(<IndicacaoDoResponsavel vinculoId="v1" dataFim="2026-12-31" indicacoes={[]} />);
    expect(screen.getByText("rhA.fimContrato.soRhDecide")).toBeInTheDocument();
  });
});

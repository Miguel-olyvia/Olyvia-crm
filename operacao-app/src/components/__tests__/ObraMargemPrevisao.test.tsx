import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObraMargem, { MargemNaLista } from "../ObraMargem";
import ObraPrevisao from "../ObraPrevisao";
import { diasUteisEntre } from "../../domain/obras";
import type { TarefaObra } from "../../lib/obras";

const margem = vi.hoisted(() => ({
  valor: null as unknown,
}));

vi.mock("../../lib/supabase", () => ({ supabase: {} }));

vi.mock("../../lib/margem", () => ({
  margemDaObra: vi.fn(async () => margem.valor),
  margensDaOrganizacao: vi.fn(async () => []),
  gravarLimiarMargem: vi.fn(async () => {}),
  previsaoDaObra: vi.fn(async () => ({
    hoje: "2026-10-01",
    minutos_por_dia: 480,
    p50: 1.5,
    p80: 1.8,
    fonte: "obra",
    n_obra: 2,
    n_historico: 2,
    por_especialidade: [],
    dias_uteis: diasUteisEntre("2026-09-28", "2026-12-31"),
  })),
}));

const MARGEM = {
  ve_custos: true,
  pode_configurar: true,
  custo_hora_padrao: 20,
  obra_id: "o1",
  codigo: "OB-1",
  estado: "em_curso",
  receita: 10000,
  receita_fonte: "orcamento",
  extras: 0,
  receita_total: 10000,
  custo_materiais: 3000,
  mo_orcada: 3000,
  mo_prevista: 3000,
  custo_previsto: 6000,
  margem_prevista: 4000,
  margem_prevista_pct: 40,
  progresso: 0.25,
  mo_real: 1500,
  custo_a_data: 2250,
  margem_a_data: 250,
  margem_a_data_pct: 10,
  mo_projetada: 4500,
  custo_projetado: 7500,
  margem_projetada: 2500,
  margem_projetada_pct: 25,
  ritmo: 1.5,
  ritmo_fonte: "obra",
  custo_hora: 75,
  custo_hora_fonte: "orcamento",
  sem_tarifa: 1,
  minutos_previstos: 2400,
  minutos_reais: 1200,
  limiar: 30,
  semaforo: "amarelo",
};

describe("ObraMargem", () => {
  it("mostra a margem projetada, a da venda e a de hoje, e abre as contas", async () => {
    margem.valor = MARGEM;
    render(<ObraMargem obraId="o1" orgId="org" recarga={0} />);
    const bloco = await screen.findByTestId("obra-margem");
    expect(within(bloco).getByText("25 %")).toBeInTheDocument();
    expect(within(bloco).getByText("40 %")).toBeInTheDocument();
    expect(within(bloco).getByText(/perdeu 15 % face à venda/)).toBeInTheDocument();
    expect(within(bloco).getByText(/1,5× o previsto/)).toBeInTheDocument();
    fireEvent.click(within(bloco).getByRole("button", { name: "Ver as contas" }));
    expect(within(bloco).getByText("Vendido (sem IVA)")).toBeInTheDocument();
    expect(within(bloco).getByText(/1 pessoa sem custo\/hora/)).toBeInTheDocument();
    expect(within(bloco).getByLabelText("Limiar da margem em percentagem")).toHaveValue("30");
  });

  it("quem não vê custos não vê nada", async () => {
    margem.valor = { ve_custos: false };
    const { container } = render(<ObraMargem obraId="o2" orgId="org" recarga={0} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("na lista, um ponto com a percentagem; nada sem dados", () => {
    const { rerender } = render(
      <MargemNaLista m={{ obra_id: "o1", semaforo: "vermelho", margem_prevista_pct: 40, margem_projetada_pct: 5, limiar: 20 }} />
    );
    expect(screen.getByTestId("margem-na-lista")).toHaveTextContent("5 %");
    rerender(<MargemNaLista m={{ obra_id: "o1", semaforo: "sem_dados", margem_prevista_pct: null, margem_projetada_pct: null, limiar: 20 }} />);
    expect(screen.queryByTestId("margem-na-lista")).not.toBeInTheDocument();
  });
});

const tarefa = (p: Partial<TarefaObra> & { id: string; nome: string }): TarefaObra =>
  ({
    organization_id: "org",
    obra_id: "o1",
    fase_id: "f1",
    modelo_tarefa_id: null,
    ordem: 1,
    procedimento: null,
    materiais: null,
    ferramentas: null,
    minutos_previstos: 960,
    inicio_planeado: null,
    fim_planeado: null,
    depende_de: null,
    estado: "por_fazer",
    iniciada_em: null,
    terminada_em: null,
    motivo_desvio: null,
    nota_desvio: null,
    validada_por: null,
    validada_em: null,
    motivo_rejeicao: null,
    fase_ordem: 1,
    fase_nome: "Execução",
    obra_codigo: "OB-1",
    obra_titulo: "Obra",
    obra_estado: "em_curso",
    obra_morada: null,
    tolerancia_percent: 10,
    minutos_reais: 0,
    a_correr: 0,
    pessoas: [],
    dependencias: [],
    ...p,
  }) as TarefaObra;

const TAREFAS = [
  tarefa({ id: "a", nome: "Demolição", inicio_planeado: "2026-10-05", fim_planeado: "2026-10-06", skill_id: "dem" }),
  tarefa({ id: "b", nome: "Canalização", inicio_planeado: "2026-10-07", fim_planeado: "2026-10-08", dependencias: ["a"], skill_id: "can" }),
];

describe("ObraPrevisao", () => {
  it("resumo: fim provável e P80 pelo ritmo da obra", async () => {
    render(<ObraPrevisao obraId="o1" tarefas={TAREFAS} modo="resumo" recarga={0} />);
    const r = await screen.findByTestId("obra-previsao-resumo");
    // 1,5× → 3 + 3 dias: 5–7/10 e 8–12/10.
    expect(r).toHaveTextContent("12/10/2026");
    expect(r).toHaveTextContent("P80");
    expect(r).toHaveTextContent(/ritmo desta obra/);
  });

  it("simulador: +1 pessoa na canalização puxa o fim para trás", async () => {
    render(
      <ObraPrevisao
        obraId="o1"
        tarefas={TAREFAS}
        modo="simulador"
        fases={[{ id: "f1", ordem: 1, nome: "Execução" }]}
        tarefasGantt={[]}
        skills={new Map([["can", "Canalização"], ["dem", "Demolições"]])}
        recarga={0}
      />
    );
    await screen.findByTestId("obra-simulador");
    fireEvent.change(screen.getByLabelText("Ritmo"), { target: { value: "plano" } });
    expect(screen.getByTestId("simulador-fim")).toHaveTextContent("08/10/2026");
    fireEvent.change(screen.getByLabelText("+1 pessoa em"), { target: { value: "can" } });
    expect(screen.getByTestId("simulador-fim")).toHaveTextContent("07/10/2026");
    expect(screen.getByText(/1 dia útil antes/)).toBeInTheDocument();
  });
});

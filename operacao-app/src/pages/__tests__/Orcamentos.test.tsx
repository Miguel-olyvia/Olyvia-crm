/**
 * Orçamentos: só se põe a andar um orçamento ASSINADO E CONTRATUALIZADO.
 * A base recusa o resto (tools/validar-orcamentos.mjs); aqui prova-se que o
 * ecrã bloqueia o botão e diz porquê.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { estadoDoContrato, motivoBloqueio } from "../../lib/orcamentos";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ activeOrgId: "org" }) }));
vi.mock("../../lib/supabase", () => ({ supabase: {} }));
vi.mock("../../components/SeletorDeLocal", () => ({ default: () => null }));

const base = {
  cliente_id: "c1",
  obra_endereco: null,
  estado: "aceite",
  accepted_at: "2026-10-01T10:00:00Z",
  total: 1000,
  moeda: "EUR",
  custo_previsto: 400,
  linhas: 2,
  tem_obra: false,
};

const ORCAMENTOS = [
  { ...base, id: "q1", numero: "ORC-1", titulo: "Assinado", contrato_id: "k1", contrato_numero: "CC-1", contrato_estado: "signed", contratado: true },
  { ...base, id: "q2", numero: "ORC-2", titulo: "Por assinar", contrato_id: "k2", contrato_numero: "CC-2", contrato_estado: "pending_signature", contratado: false },
  { ...base, id: "q3", numero: "ORC-3", titulo: "Sem contrato", contrato_id: null, contrato_numero: null, contrato_estado: null, contratado: false },
];

vi.mock("../../lib/dados", () => ({
  ErroDeDados: class extends Error {},
  ErroDeEscrita: class extends Error {},
  listarOrcamentos: vi.fn(async () => ORCAMENTOS),
  listarClientes: vi.fn(async () => [{ id: "c1", nome: "Cliente Lda" }]),
  listarLocais: vi.fn(async () => []),
  obraDeOrcamento: vi.fn(),
}));

vi.mock("../../lib/previsao", () => ({
  carregarPrevisaoBase: vi.fn(async () => ({
    hoje: "2026-10-06",
    ve_custos: true,
    custo_hora_medio: 22,
    orcamentos: [
      {
        id: "q1", numero: "ORC-1", titulo: "WC grande", estado: "aceite", cliente_id: "c1",
        data: "2026-10-01T10:00:00Z", aceite_em: "2026-10-01T10:00:00Z", comercial_id: "u1", comercial_nome: "Rita",
        total: 1230, valor_sem_iva: 1000, custo_material: 300, mao_obra_orcada: 200, linhas: 2,
        contrato_id: "k1", contrato_numero: "CC-1", contrato_estado: "signed", contratado: true,
      },
    ],
    equipa: [{ utilizador_id: "p1", nome: "Ana", funcao: "tecnico", horas_dia: 8, custo_hora: 20, skills: ["can"] }],
    skills: [{ id: "can", nome: "Canalização" }, { id: "rev", nome: "Revestimentos" }],
    dias_uteis: ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"],
    carga_atual: [],
  })),
  expandirOrcamentos: vi.fn(async () => [
    {
      id: "q1",
      linhas: [
        { id: "l1", ordem: 0, descricao: "WC", qt: 1, unidade: "un", servico_id: "s1", servico_nome: "Remodelação WC",
          cruzamento: "modelo",
          passos: [
            { fase: 2, nome: "Canalização", minutos: 240, pessoas: 1, skill_id: "can", espera_antes_horas: 0, origem: "padrao" },
            { fase: 3, nome: "Revestimento", minutos: 240, pessoas: 2, skill_id: "rev", espera_antes_horas: 0, origem: "padrao" },
          ] },
        { id: "l2", ordem: 1, descricao: "Nicho", qt: 1, unidade: null, servico_id: "s2", servico_nome: "Nicho",
          cruzamento: "sem_ficha",
          passos: [{ fase: 3, nome: "Nicho", minutos: 60, pessoas: 1, skill_id: null, espera_antes_horas: 0, origem: "padrao" }] },
      ],
    },
  ]),
}));

import Orcamentos from "../Orcamentos";

const cartao = (titulo: string) => screen.getByText(titulo).closest("div.p-4") as HTMLElement;

describe("Orçamentos — assinado e contratualizado", () => {
  it("só o contratualizado tem o botão ativo; os outros dizem porquê", async () => {
    render(
      <MemoryRouter>
        <Orcamentos />
      </MemoryRouter>
    );

    await screen.findByText("Assinado");
    expect(screen.getByText(/1 pronto a pôr a andar · 2 à espera de contrato assinado/)).toBeInTheDocument();

    const ok = within(cartao("Assinado"));
    expect(ok.getByRole("button", { name: "Pôr a andar" })).toBeEnabled();
    expect(ok.getByText("pronto a pôr a andar")).toBeInTheDocument();

    const porAssinar = within(cartao("Por assinar"));
    expect(porAssinar.getByRole("button", { name: "Pôr a andar" })).toBeDisabled();
    expect(porAssinar.getByText("falta contrato assinado")).toBeInTheDocument();
    expect(porAssinar.getByTestId("motivo-bloqueio")).toHaveTextContent(
      "O contrato CC-2 está à espera de assinatura"
    );

    const sem = within(cartao("Sem contrato"));
    expect(sem.getByRole("button", { name: "Pôr a andar" })).toBeDisabled();
    expect(sem.getByTestId("motivo-bloqueio")).toHaveTextContent("Sem contrato no CRM");
  });
});

describe("Orçamentos — Previsão", () => {
  it("cruza as linhas com os modelos, mostra o gargalo e o que falta corrigir", async () => {
    render(
      <MemoryRouter>
        <Orcamentos />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Previsão" }));

    const kpis = await screen.findByTestId("kpis");
    expect(await within(kpis).findByText("9 h")).toBeInTheDocument(); // 240 + 240 + 60 min
    // Revestimentos: ninguém na equipa → 0 obras em simultâneo, e é o gargalo
    expect(within(kpis).getByText("gargalo: Revestimentos")).toBeInTheDocument();
    expect(within(screen.getByTestId("tabela-capacidade")).getByText("falta")).toBeInTheDocument();

    // As escolhas são listas, não texto livre.
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByLabelText("Ordem da fila")).toBeInTheDocument();

    // Detalhe: orçamento → linhas → passos; a linha sem modelo aparece marcada.
    fireEvent.click(screen.getByText("WC grande"));
    expect(await screen.findByText("Remodelação WC")).toBeInTheDocument();
    expect(screen.getByText("sem modelo nem ficha")).toBeInTheDocument();
    expect(screen.getByText("Revestimento")).toBeInTheDocument();
    expect(screen.getAllByText(/Ninguém na equipa com Revestimentos/).length).toBeGreaterThan(0);
  });
});

describe("motivoBloqueio", () => {
  const o = { tem_obra: false, cliente_id: "c1", contratado: true, contrato_id: "k", contrato_numero: "CC-9", contrato_estado: "active" };

  it("contratualizado e com cliente: pode andar", () => {
    expect(motivoBloqueio(o)).toBeNull();
  });
  it("contrato cancelado não conta", () => {
    expect(motivoBloqueio({ ...o, contratado: false, contrato_estado: "cancelled" })).toBe(
      "O contrato CC-9 está cancelado. Só se põe a andar depois de assinado no CRM."
    );
  });
  it("sem cliente, mesmo contratualizado, não anda", () => {
    expect(motivoBloqueio({ ...o, cliente_id: null })).toMatch(/Sem cliente/);
  });
  it("estados desconhecidos aparecem tal como vêm", () => {
    expect(estadoDoContrato("qualquer")).toBe("qualquer");
    expect(estadoDoContrato("active")).toBe("assinado e em vigor");
  });
});

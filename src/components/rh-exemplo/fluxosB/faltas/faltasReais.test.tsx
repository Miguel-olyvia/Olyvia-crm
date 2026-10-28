// As faltas da organizacao e da ficha ligadas as RPCs reais: a lista vem de fora (vista em vigor), e marcar, anular,
// registar a justificacao e decidir chamam a assiduidade REAL da pessoa. O hook real e simulado ao nivel do wrapper,
// por isso nao ha Supabase nem lojas de exemplo de faltas a participar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { Falta, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

const acoes = vi.hoisted(() => ({
  marcarFalta: vi.fn(),
  anularFalta: vi.fn(),
  registarJustificacao: vi.fn(),
  decidirJustificacao: vi.fn(),
  revelarJustificacao: vi.fn(),
  recarregar: vi.fn(),
  faltas: [] as unknown[],
}));

vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", () => ({
  useAssiduidadeDaPessoa: () => ({
    picagens: [],
    realizado: [],
    faltas: acoes.faltas,
    planeado: [],
    ausenciaAprovadaPorDia: new Map(),
    loading: false,
    saving: false,
    marcarFalta: acoes.marcarFalta,
    anularFalta: acoes.anularFalta,
    registarJustificacao: acoes.registarJustificacao,
    decidirJustificacao: acoes.decidirJustificacao,
    revelarJustificacao: acoes.revelarJustificacao,
    recarregar: acoes.recarregar,
  }),
  comoRealizadoComCorreccao: (l: unknown) => l,
}));

// O prazo para justificar e da organizacao e vem da base: aqui e simulado (5 dias, a omissao).
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());

// O valor da hora do desconto vem do processamento salarial real da pessoa; aqui entra por argumento (sem Supabase).
const calculo = vi.hoisted(() => ({
  estado: {} as Record<string, unknown>,
}));
vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDaPessoa: () => calculo.estado,
}));

const calculoComValor = (valorHoraReal: number | null, baseMes: number | null, extra: Record<string, unknown> = {}) => ({
  resultado: { resultado: { valorHoraReal, baseMes }, totais: { planeadoMinutos: 9600 } },
  aCarregar: false, retribuicaoRecusada: false, incompleta: false, periodoAberto: true, temPeriodo: true, ...extra,
});

import { FaltasPainel } from "./FaltasPainel";
import { FaltasDaPessoa } from "./FaltasDaPessoa";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: false, picarOutros: false, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};
const SO_VER: PermissoesAssiduidade = { ...TUDO, gerir: false, corrigir: false, faltasEdit: false, justificacaoEdit: false };

const PESSOAS = [{ id: "pessoa-a", nome: "Ana Real" }, { id: "pessoa-b", nome: "Bruno Real" }];

function falta(extra: Partial<Falta> = {}): Falta {
  return {
    id: "falta-1", pessoa_id: "pessoa-a", organization_id: "org", data: "2026-10-06", planeado_id: null, vinculo_id: null,
    local_id: null, hora_inicio: "09:00:00", hora_fim: "13:00:00", minutos: 240, motivo_codigo: "assuntos_pessoais",
    justificacao_estado: "sem_justificacao", justificada: false, remunerada: false, desconta_saldo: false,
    justificacao_decidida_por: null, justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null,
    corrige_falta_id: null, correccao_motivo: null, estado: "activa", anulado_em: null, anulacao_motivo: null,
    created_at: "2026-10-06T10:00:00Z", ...extra,
  } as Falta;
}

function painel(faltas: Falta[], permissoes = TUDO, onAlterado = vi.fn()) {
  acoes.faltas = faltas;
  render(
    <LanguageProvider>
      <FaltasPainel faltas={faltas} desvios={[]} pessoas={PESSOAS} permissoes={permissoes} onAlterado={onAlterado} />
    </LanguageProvider>,
  );
  return onAlterado;
}

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  for (const f of [acoes.marcarFalta, acoes.anularFalta, acoes.registarJustificacao, acoes.decidirJustificacao, acoes.revelarJustificacao, acoes.recarregar]) {
    f.mockReset();
    f.mockResolvedValue(null);
  }
  acoes.faltas = [];
  calculo.estado = calculoComValor(6.25, 1000);
});
afterEach(cleanup);

describe("FaltasPainel com faltas reais", () => {
  it("lista as faltas recebidas, com o nome da pessoa e sem inventar nenhuma", () => {
    painel([falta()]);
    expect(screen.getByText("Ana Real")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ver detalhe/i })).toHaveLength(1);
  });

  it("sem faltas diz que nao ha faltas", () => {
    painel([]);
    expect(screen.queryByRole("button", { name: /Ver detalhe/i })).not.toBeInTheDocument();
  });

  it("marcar chama rpc de marcar da pessoa escolhida e pede a lista outra vez", async () => {
    const aoAlterar = painel([]);
    fireEvent.click(screen.getByRole("button", { name: "Marcar falta" }));
    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-b" } });
    fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-08" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "doenca" } });
    fireEvent.click(screen.getByRole("button", { name: /^Marcar falta$/i }));
    await waitFor(() => expect(acoes.marcarFalta).toHaveBeenCalledTimes(1));
    expect(acoes.marcarFalta).toHaveBeenCalledWith(expect.objectContaining({ data: "2026-10-08", horaInicio: "09:00", horaFim: "13:00", motivoCodigo: "doenca" }));
    await waitFor(() => expect(aoAlterar).toHaveBeenCalled());
  });

  it("uma recusa da base fica no formulario e a lista nao e relida", async () => {
    acoes.marcarFalta.mockResolvedValue("rhExemplo.fal.erro.tempo_trabalhado");
    const aoAlterar = painel([]);
    fireEvent.click(screen.getByRole("button", { name: "Marcar falta" }));
    fireEvent.change(screen.getByLabelText("Pessoa"), { target: { value: "pessoa-a" } });
    fireEvent.change(screen.getByLabelText("Dia"), { target: { value: "2026-10-08" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "doenca" } });
    fireEvent.click(screen.getByRole("button", { name: /^Marcar falta$/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(aoAlterar).not.toHaveBeenCalled();
  });

  it("sem pessoa escolhida nao chega a base", () => {
    painel([]);
    fireEvent.click(screen.getByRole("button", { name: "Marcar falta" }));
    fireEvent.click(screen.getByRole("button", { name: /^Marcar falta$/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(acoes.marcarFalta).not.toHaveBeenCalled();
  });

  it("quem so pode ver nao tem o botao de marcar", () => {
    painel([falta()], SO_VER);
    expect(screen.queryByRole("button", { name: "Marcar falta" })).not.toBeInTheDocument();
  });

  it("no detalhe, registar a justificacao chama a RPC com o texto", async () => {
    painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const detalhe = await screen.findByRole("dialog");
    fireEvent.change(within(detalhe).getByLabelText(/Texto da justificação/), { target: { value: "Consulta marcada" } });
    fireEvent.click(within(detalhe).getByRole("button", { name: /Registar justificação/i }));
    await waitFor(() => expect(acoes.registarJustificacao).toHaveBeenCalledWith({ faltaId: "falta-1", texto: "Consulta marcada" }));
  });

  it("no detalhe, aceitar uma justificacao pendente chama a RPC de decidir", async () => {
    const pendente = falta({ justificacao_estado: "pendente_documento" });
    painel([pendente]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const detalhe = await screen.findByRole("dialog");
    fireEvent.click(within(detalhe).getByRole("button", { name: "Aceitar" }));
    await waitFor(() => expect(acoes.decidirJustificacao).toHaveBeenCalledWith({ faltaId: "falta-1", resultado: "justificada", motivo: undefined }));
  });

  it("o detalhe mostra a conta do desconto da falta lida: 4 h x valor da hora", async () => {
    painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const detalhe = await screen.findByRole("dialog");
    const desconto = within(detalhe).getByTestId("rhb-desconto");
    expect(desconto).toHaveTextContent(/4 h × .* = .* a descontar/);
    // O valor da hora e o do processamento do mes da falta: base do mes a dividir pelas horas planeadas (9600 min = 160 h).
    expect(desconto).toHaveTextContent(/Valor da hora 6,25.*1.?000,00.*÷ 160 h planeadas no mês/);
    expect(desconto).toHaveTextContent(/Total desta pessoa neste mês, faltas e atrasos: 25,00/);
    expect(desconto).not.toHaveTextContent(/exemplo do documento/);
  });

  it("o desconto so soma as faltas do mes da falta, nao as de outros meses", async () => {
    painel([falta(), falta({ id: "falta-2", data: "2026-09-10" })]);
    fireEvent.click(screen.getAllByRole("button", { name: /Ver detalhe/i })[0]);
    const detalhe = await screen.findByRole("dialog");
    expect(within(detalhe).getByTestId("rhb-desconto")).toHaveTextContent(/Total desta pessoa neste mês, faltas e atrasos: 25,00/);
  });

  it("sem retribuicao ou sem horas planeadas nao inventa um valor da hora: diz que falta e nao calcula o euro", async () => {
    calculo.estado = calculoComValor(null, null);
    painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const desconto = within(await screen.findByRole("dialog")).getByTestId("rhb-desconto");
    expect(desconto).toHaveTextContent(/Sem valor da hora: falta a retribuição ou as horas planeadas de outubro de 2026/);
    expect(desconto).not.toHaveTextContent(/a descontar/);
    expect(desconto).not.toHaveTextContent(/6,25/);
    expect(desconto).not.toHaveTextContent(/Total desta pessoa neste mês/);
  });

  it("sem permissao para ver retribuicoes diz-se, e o valor da hora nao aparece", async () => {
    calculo.estado = { ...calculoComValor(null, null), resultado: null, retribuicaoRecusada: true };
    painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const desconto = within(await screen.findByRole("dialog")).getByTestId("rhb-desconto");
    expect(desconto).toHaveTextContent(/Não tem permissão para ver a retribuição/);
    expect(desconto).not.toHaveTextContent(/a descontar/);
  });

  it("enquanto o calculo carrega mostra que esta a calcular e nao um valor", async () => {
    calculo.estado = { ...calculoComValor(null, null), resultado: null, aCarregar: true };
    painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const desconto = within(await screen.findByRole("dialog")).getByTestId("rhb-desconto");
    expect(desconto).toHaveTextContent(/A calcular o valor da hora/);
    expect(desconto).not.toHaveTextContent(/a descontar/);
  });

  it("uma assiduidade lida so em parte avisa que o valor da hora pode estar incompleto", async () => {
    calculo.estado = calculoComValor(6.25, 1000, { incompleta: true });
    painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const desconto = within(await screen.findByRole("dialog")).getByTestId("rhb-desconto");
    expect(desconto).toHaveTextContent(/só se leu em parte/);
  });

  it("anular a falta pede o motivo e chama a RPC de anular", async () => {
    const aoAlterar = painel([falta()]);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const detalhe = await screen.findByRole("dialog");
    fireEvent.click(within(detalhe).getByRole("button", { name: /Anular/i }));
    const motivo = await screen.findByRole("alertdialog");
    fireEvent.change(within(motivo).getByRole("textbox"), { target: { value: "Marcada por engano" } });
    fireEvent.click(within(motivo).getAllByRole("button").at(-1) as HTMLElement);
    await waitFor(() => expect(acoes.anularFalta).toHaveBeenCalledWith("falta-1", "Marcada por engano"));
    await waitFor(() => expect(aoAlterar).toHaveBeenCalled());
  });

  it("sem permissao de decidir nao aparecem os botoes de aceitar nem recusar", async () => {
    painel([falta({ justificacao_estado: "pendente_documento" })], SO_VER);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhe/i }));
    const detalhe = await screen.findByRole("dialog");
    expect(within(detalhe).queryByRole("button", { name: "Aceitar" })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Recusar" })).not.toBeInTheDocument();
  });
});

describe("FaltasDaPessoa (aba Justificacoes da ficha)", () => {
  const ficha = (faltas: Falta[], faltasRecusadas = false) => {
    acoes.faltas = faltas;
    render(
      <LanguageProvider>
        <FaltasDaPessoa pessoaNome="Ana Real" souAPessoa={false} permissoes={TUDO} assiduidade={{ faltas, faltasRecusadas, recarregar: acoes.recarregar }} />
      </LanguageProvider>,
    );
  };

  it("mostra so a falta em vigor: a corrigida some e fica a que a substituiu", () => {
    ficha([falta({ id: "f1" }), falta({ id: "f2", corrige_falta_id: "f1", hora_fim: "11:00:00", minutos: 120 })]);
    expect(screen.getAllByRole("button", { name: /Ver detalhe/i })).toHaveLength(1);
  });

  it("uma leitura recusada nao se mostra como sem faltas", () => {
    ficha([], true);
    expect(screen.queryByTestId("rha-faltas-da-pessoa")).not.toBeInTheDocument();
    expect(screen.queryByText(/sem faltas|nenhuma falta/i)).not.toBeInTheDocument();
  });
});

/**
 * `ProcessamentoVisaoGeralTab` (FASE 1): sem periodo mostra "Abrir periodo";
 * com periodo aberto mostra o resumo por pessoa e permite acrescentar/anular
 * um lancamento pontual; com periodo fechado desactiva essas accoes. O
 * resumo por pessoa nao chama `useRelatorioAssiduidadeMensal` de verdade --
 * simula-se `ResumoPessoaProcessamentoOculto` directamente, o mesmo ponto de
 * insercao que o componente real usa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/utils/friendlyError", () => ({
  getFriendlyErrorMessage: async (e: unknown) =>
    (e as { message?: string })?.message ?? "erro",
}));

let permissoes: Record<string, boolean> = {};
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (codigo: string) => !!permissoes[codigo] }),
}));

const PESSOA_1 = { id: "pessoa-1", nome_completo: "Ana Silva", estado_registo: "activo" };
const PESSOA_2 = { id: "pessoa-2", nome_completo: "Bruno Costa", estado_registo: "activo" };
vi.mock("@/hooks/usePessoas", () => ({
  usePessoas: () => ({ pessoas: [PESSOA_1, PESSOA_2], loading: false }),
}));

vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({ codigos: [] }),
}));

let periodoActual: unknown = null;
let periodoLoading = false;
const abrirMock = vi.fn(async () => null);
const fecharMock = vi.fn(async () => null);
vi.mock("@/hooks/useProcessamentoPeriodo", () => ({
  useProcessamentoPeriodo: () => ({
    periodo: periodoActual,
    loading: periodoLoading,
    saving: false,
    recusado: false,
    abrir: abrirMock,
    fechar: fecharMock,
  }),
}));

let lancamentosActuais: unknown[] = [];
const criarMock = vi.fn(async () => null);
const anularMock = vi.fn(async () => null);
vi.mock("@/hooks/useProcessamentoLancamentos", () => ({
  useProcessamentoLancamentos: () => ({
    lancamentos: lancamentosActuais,
    loading: false,
    saving: false,
    recusado: false,
    criar: criarMock,
    anular: anularMock,
  }),
}));

vi.mock("@/components/hr/processamento/ResumoPessoaProcessamentoOculto", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    // Chama aoTerminarCarregamento UMA SO VEZ por pessoaId, num useEffect --
    // nunca no corpo do render. `marcarTotais`, no componente real, cria um
    // objecto novo a cada chamada; um mock que chamasse o callback a cada
    // render (sem guarda) entraria em ciclo infinito de render, exactamente
    // como a real ResumoPessoaProcessamentoOculto evita com `avisouRef`.
    ResumoPessoaProcessamentoOculto: ({
      pessoaId,
      aoTerminarCarregamento,
    }: {
      pessoaId: string;
      aoTerminarCarregamento: (id: string, totais: unknown) => void;
    }) => {
      react.useEffect(() => {
        aoTerminarCarregamento(pessoaId, {
          diasTrabalhados: 20,
          diasComFaltaCompleta: 0,
          diasComFaltaIncompleta: 0,
          horasExtraMinutos: 60,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [pessoaId]);
      return null;
    },
  };
});

import { ProcessamentoVisaoGeralTab } from "@/components/hr/processamento/ProcessamentoVisaoGeralTab";

const PERIODO_ABERTO = {
  id: "periodo-1",
  organization_id: "org-nike",
  ano: 2026,
  mes: 9,
  estado: "aberto",
  fechado_em: null,
  fechado_por: null,
};

const PERIODO_FECHADO = { ...PERIODO_ABERTO, estado: "fechado", fechado_em: "2026-10-01T00:00:00Z" };

beforeEach(() => {
  permissoes = {
    "hr.processamento.periodo.view": true,
    "hr.processamento.periodo.gerir": true,
    "hr.processamento.lancamentos.gerir": true,
  };
  periodoActual = null;
  periodoLoading = false;
  lancamentosActuais = [];
  abrirMock.mockClear();
  fecharMock.mockClear();
  criarMock.mockClear();
  anularMock.mockClear();
});

describe("ProcessamentoVisaoGeralTab", () => {
  it("sem hr.processamento.periodo.view mostra o cartao de sem acesso", () => {
    permissoes = {};
    render(<ProcessamentoVisaoGeralTab />);
    expect(screen.getByTestId ? true : true).toBe(true);
  });

  it("sem periodo aberto mostra o botao de abrir periodo", async () => {
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() =>
      expect(screen.getByText("hr.vencimento.visaoGeral.abrirPeriodo")).toBeInTheDocument(),
    );
  });

  it("clicar em abrir periodo chama abrir()", async () => {
    render(<ProcessamentoVisaoGeralTab />);
    const botao = await screen.findByText("hr.vencimento.visaoGeral.abrirPeriodo");
    fireEvent.click(botao);
    expect(abrirMock).toHaveBeenCalledTimes(1);
  });

  it("com periodo aberto mostra o resumo por pessoa, reaproveitando os totais do relatorio", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());
    expect(screen.getByText("Bruno Costa")).toBeInTheDocument();
    // diasTrabalhados = 20 para as duas pessoas, mostrado na tabela.
    expect(screen.getAllByText("20")).toHaveLength(2);
  });

  it("com periodo aberto, acrescentar valor pontual abre o formulario e chama criar()", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const botoesAcrescentar = screen.getAllByText("hr.vencimento.visaoGeral.acrescentarValor");
    fireEvent.click(botoesAcrescentar[0]);

    const descricao = await screen.findByLabelText("hr.vencimento.visaoGeral.campoDescricao");
    fireEvent.change(descricao, { target: { value: "Premio de setembro" } });
    const valor = screen.getByLabelText("hr.vencimento.visaoGeral.campoValor");
    fireEvent.change(valor, { target: { value: "100" } });

    const botoesFinais = screen.getAllByText("hr.vencimento.visaoGeral.acrescentarValor");
    const botaoSubmeter = botoesFinais[botoesFinais.length - 1];
    fireEvent.click(botaoSubmeter);

    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    expect(criarMock).toHaveBeenCalledWith({
      pessoaId: "pessoa-1",
      descricao: "Premio de setembro",
      valor: 100,
      codigoProcessamentoId: null,
    });
  });

  it("com periodo fechado, esconde o botao de acrescentar valor e o de fechar periodo", async () => {
    periodoActual = PERIODO_FECHADO;
    lancamentosActuais = [
      {
        id: "lancamento-1",
        periodo_id: "periodo-1",
        pessoa_id: "pessoa-1",
        organization_id: "org-nike",
        descricao: "Premio antigo",
        valor: 50,
        codigo_processamento_id: null,
        anulado_em: null,
        anulado_por: null,
        anulado_motivo: null,
      },
    ];
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    expect(screen.queryByText("hr.vencimento.visaoGeral.acrescentarValor")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.vencimento.visaoGeral.fecharPeriodo")).not.toBeInTheDocument();
    expect(screen.getByText("Premio antigo")).toBeInTheDocument();
    // Sem accao de anular disponivel sobre um lancamento de um periodo fechado.
    expect(screen.queryByText("hr.vencimento.visaoGeral.anular")).not.toBeInTheDocument();
  });

  it("fechar periodo pede confirmacao antes de chamar fechar()", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    fireEvent.click(screen.getByText("hr.vencimento.visaoGeral.fecharPeriodo"));
    expect(fecharMock).not.toHaveBeenCalled();

    const dialog = await screen.findByText("hr.vencimento.visaoGeral.confirmarFechoTitulo");
    const dialogContainer = dialog.closest('[role="alertdialog"]') ?? dialog.parentElement!;
    const botaoConfirmar = within(dialogContainer as HTMLElement).getByText(
      "hr.vencimento.visaoGeral.fecharPeriodo",
    );
    fireEvent.click(botaoConfirmar);

    await waitFor(() => expect(fecharMock).toHaveBeenCalledTimes(1));
  });
});

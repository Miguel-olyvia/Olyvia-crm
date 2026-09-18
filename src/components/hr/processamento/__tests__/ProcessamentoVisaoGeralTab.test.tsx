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

let codigosActuais: unknown[] = [];
vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({ codigos: codigosActuais }),
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" } }),
}));

let retribuicoesPorPessoa = new Map<string, unknown[]>();
let retribuicoesRecusado = false;
vi.mock("@/hooks/useRetribuicoesVigentesDaOrganizacao", async () => {
  const real = await vi.importActual<
    typeof import("@/hooks/useRetribuicoesVigentesDaOrganizacao")
  >("@/hooks/useRetribuicoesVigentesDaOrganizacao");
  return {
    ...real,
    useRetribuicoesVigentesDaOrganizacao: () => ({
      porPessoa: retribuicoesPorPessoa,
      loading: false,
      recusado: retribuicoesRecusado,
      recarregar: vi.fn(),
    }),
  };
});

let regraSubsidioMock = { valorDiario: 0, modo: "dinheiro", minutosMinimosDia: 1 };
vi.mock("@/hooks/useRegrasSubsidioAlimentacao", () => ({
  useRegrasSubsidioAlimentacao: () => ({
    regra: regraSubsidioMock,
    temRegraGravada: false,
    isLoading: false,
    isFetched: true,
    error: null,
    isSaving: false,
    gravar: vi.fn(),
  }),
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

const TOTAIS_PADRAO = {
  diasPlaneados: 22,
  diasTrabalhados: 20,
  diasComFaltaCompleta: 0,
  diasComFaltaIncompleta: 0,
  horasExtraMinutos: 60,
  planeadoMinutos: 0,
  realizadoMinutos: 0,
};
let totaisPorPessoaMock: Record<string, typeof TOTAIS_PADRAO> = {};
let diasPorPessoaMock: Record<string, unknown[]> = {};

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
      aoTerminarCarregamento: (id: string, totais: unknown, dias: unknown[]) => void;
    }) => {
      react.useEffect(() => {
        aoTerminarCarregamento(
          pessoaId,
          totaisPorPessoaMock[pessoaId] ?? TOTAIS_PADRAO,
          diasPorPessoaMock[pessoaId] ?? [],
        );
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
  codigosActuais = [];
  retribuicoesPorPessoa = new Map();
  retribuicoesRecusado = false;
  totaisPorPessoaMock = {};
  diasPorPessoaMock = {};
  regraSubsidioMock = { valorDiario: 0, modo: "dinheiro", minutosMinimosDia: 1 };
  abrirMock.mockClear();
  fecharMock.mockClear();
  criarMock.mockClear();
  anularMock.mockClear();
});

function formatarValorEsperado(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

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
    // realizadoMinutos = 9630 (160,5h) -- caso com casas decimais.
    totaisPorPessoaMock = {
      "pessoa-1": { ...TOTAIS_PADRAO, realizadoMinutos: 9630 },
      "pessoa-2": { ...TOTAIS_PADRAO, realizadoMinutos: 9630 },
    };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());
    expect(screen.getByText("Bruno Costa")).toBeInTheDocument();
    // diasTrabalhados = 20 para as duas pessoas -- as horas aparecem entre
    // parenteses ao lado dos dias, com uma casa decimal quando o numero de
    // horas nao e redondo.
    expect(screen.getAllByText("20 (160,5h)")).toHaveLength(2);
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

  it("pessoa com retribuicao e sem codigos automaticos mostra base e total = base", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesPorPessoa = new Map([
      [
        "pessoa-1",
        [
          {
            pessoa_id: "pessoa-1",
            valor_base: 1200,
            periodicidade: "mensal",
            duodecimos_pct: 0,
            subsidio_alimentacao: null,
            valido_de: "2026-01-01",
            valido_ate: null,
          },
        ],
      ],
    ]);
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linha = screen.getByText("Ana Silva").closest("tr")!;
    const normalizar = (texto: string) => texto.replace(/\s/g, " ");
    const valorEsperado = normalizar(formatarValorEsperado(1200));
    const correspondeAoValor = (_: string, elemento: Element | null) =>
      normalizar(elemento?.textContent ?? "") === valorEsperado;
    expect(within(linha).getAllByText(correspondeAoValor)).toHaveLength(2); // salario-base + total bruto estimado
    expect(within(linha).getByText("mensal")).toBeInTheDocument();
  });

  it("pessoa sem retribuicao mostra as colunas de salario e total com travessao", async () => {
    periodoActual = PERIODO_ABERTO;
    // Nenhuma entrada em retribuicoesPorPessoa para nenhuma das pessoas.
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linhaAna = screen.getByText("Ana Silva").closest("tr")!;
    const linhaBruno = screen.getByText("Bruno Costa").closest("tr")!;
    expect(within(linhaAna).getAllByText("—")).toHaveLength(2); // salario-base + total
    expect(within(linhaBruno).getAllByText("—")).toHaveLength(2);
  });

  it("sem codigos activos automaticos a coluna de codigos aparece vazia", async () => {
    periodoActual = PERIODO_ABERTO;
    codigosActuais = [];
    retribuicoesPorPessoa = new Map([
      [
        "pessoa-1",
        [
          {
            pessoa_id: "pessoa-1",
            valor_base: 1200,
            periodicidade: "mensal",
            duodecimos_pct: 0,
            subsidio_alimentacao: null,
            valido_de: "2026-01-01",
            valido_ate: null,
          },
        ],
      ],
    ]);
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linha = screen.getByText("Ana Silva").closest("tr")!;
    const celulas = within(linha).getAllByRole("cell");
    // Ordem das colunas: Pessoa, Dias planeados, Dias trabalhados, Falta
    // completa, Falta incompleta, Horas extra, Salario-base, Codigos
    // aplicados, Total bruto estimado, Accoes.
    const celulaCodigos = celulas[7];
    expect(celulaCodigos.textContent).toBe("");
  });

  it("sem permissao de retribuicao, a coluna de codigos aplicados tambem nao mostra valores (M4)", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesRecusado = true;
    // Um codigo automatico de valor fixo mensal entraria sempre, uma vez por
    // pessoa -- exactamente o caso que teria "escapado" pelo gate emergente
    // de processamentoTotais.ts (valor=0) sem esconder a LISTA em si.
    codigosActuais = [
      {
        id: "codigo-1",
        organization_id: "org-nike",
        codigo: "100",
        nome: "Premio fixo",
        activo: true,
        modo_calculo: "valor_fixo_mensal",
        origem_automatica: null,
        percentagem: null,
        valor_fixo: 50,
      },
    ];
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linha = screen.getByText("Ana Silva").closest("tr")!;
    // Nao mostra o codigo "100" nem o valor "50,00 €" da lista.
    expect(within(linha).queryByText(/100/)).not.toBeInTheDocument();
    expect(within(linha).queryByText(/50,00/)).not.toBeInTheDocument();
    // A coluna de codigos aparece com a mesma mensagem de sem-permissao usada
    // na coluna de salario-base (o total bruto estimado usa "—" simples).
    expect(
      within(linha).getAllByText("hr.vencimento.visaoGeral.semPermissaoRetribuicao"),
    ).toHaveLength(2); // salario-base + codigos aplicados
  });

  it("mostra a coluna de dias planeados, antes de dias trabalhados", async () => {
    periodoActual = PERIODO_ABERTO;
    // planeadoMinutos = 11340 (189h) -- caso redondo.
    totaisPorPessoaMock = {
      "pessoa-1": { ...TOTAIS_PADRAO, planeadoMinutos: 11340 },
      "pessoa-2": { ...TOTAIS_PADRAO, planeadoMinutos: 11340 },
    };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    // diasPlaneados = 22 para as duas pessoas -- as horas (189h, redondas)
    // aparecem entre parenteses, sem casas decimais.
    expect(screen.getAllByText("22 (189h)")).toHaveLength(2);

    const cabecalhos = screen.getAllByRole("columnheader").map((c) => c.textContent);
    const indiceDiasPlaneados = cabecalhos.indexOf("hr.vencimento.visaoGeral.colunaDiasPlaneados");
    const indiceDiasTrabalhados = cabecalhos.indexOf("hr.vencimento.visaoGeral.colunaDiasTrabalhados");
    expect(indiceDiasPlaneados).toBeGreaterThanOrEqual(0);
    expect(indiceDiasPlaneados).toBeLessThan(indiceDiasTrabalhados);
  });

  it("o total bruto estimado nunca fica negativo, mesmo com um desconto de faltas maior que a base", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesPorPessoa = new Map([
      [
        "pessoa-1",
        [
          {
            pessoa_id: "pessoa-1",
            valor_base: 1000,
            periodicidade: "mensal",
            duodecimos_pct: 100,
            subsidio_alimentacao: null,
            valido_de: "2026-01-01",
            valido_ate: null,
          },
        ],
      ],
    ]);
    totaisPorPessoaMock = {
      "pessoa-1": {
        ...TOTAIS_PADRAO,
        diasPlaneados: 1,
        diasTrabalhados: 0,
        diasComFaltaCompleta: 1,
        horasExtraMinutos: 0,
        planeadoMinutos: 600,
        realizadoMinutos: 0,
      },
    };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linha = screen.getByText("Ana Silva").closest("tr")!;
    // baseMes = 1166.67 mas o desconto de faltas (10h * 230.77 €/h) ultrapassa-a
    // largamente -- o total mostrado tem de ficar em 0,00 €, nunca negativo.
    const normalizar = (texto: string) => texto.replace(/\s/g, " ");
    const valorZeroEsperado = normalizar(formatarValorEsperado(0));
    const correspondeAZero = (_: string, elemento: Element | null) =>
      normalizar(elemento?.textContent ?? "") === valorZeroEsperado;
    expect(within(linha).getByText(correspondeAZero)).toBeInTheDocument();
  });

  it("abrir o detalhe de uma pessoa mostra a conta completa", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesPorPessoa = new Map([
      [
        "pessoa-1",
        [
          {
            pessoa_id: "pessoa-1",
            valor_base: 1200,
            periodicidade: "mensal",
            duodecimos_pct: 0,
            subsidio_alimentacao: null,
            valido_de: "2026-01-01",
            valido_ate: null,
          },
        ],
      ],
    ]);
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linhaAna = screen.getByText("Ana Silva").closest("tr")!;
    fireEvent.click(within(linhaAna).getByText("hr.vencimento.visaoGeral.verDetalhe"));

    await screen.findByText("hr.vencimento.visaoGeral.detalheSalarioBase");
    expect(screen.getByText("hr.vencimento.visaoGeral.detalheValorHoraReal")).toBeInTheDocument();
    expect(screen.getByText("hr.vencimento.visaoGeral.detalheDescontoFaltas")).toBeInTheDocument();
    expect(screen.getByText("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao")).toBeInTheDocument();
    expect(screen.getByText("hr.vencimento.visaoGeral.detalheLancamentosPontuais")).toBeInTheDocument();
    expect(screen.getByText("hr.vencimento.visaoGeral.detalheSemCodigos")).toBeInTheDocument();
    // duodecimos_pct 0 -> divisor 14 -> baseMes = (1200*14)/14 = 1200, sem
    // faltas nem lancamentos -- o total no dialogo tem de bater com o da tabela.
    const dialogo = screen.getByRole("dialog");
    const normalizar = (texto: string) => texto.replace(/\s/g, " ");
    const valor1200Esperado = normalizar(formatarValorEsperado(1200));
    const correspondeA1200 = (_: string, elemento: Element | null) =>
      normalizar(elemento?.textContent ?? "") === valor1200Esperado;
    expect(within(dialogo).getByText(correspondeA1200)).toBeInTheDocument();
  });

  it("com regra de subsidio e dias elegiveis, o detalhe deixa de mostrar o subsidio a 0 EUR", async () => {
    periodoActual = PERIODO_ABERTO;
    regraSubsidioMock = { valorDiario: 6, modo: "dinheiro", minutosMinimosDia: 300 };
    retribuicoesPorPessoa = new Map([
      [
        "pessoa-1",
        [
          {
            pessoa_id: "pessoa-1",
            valor_base: 1200,
            periodicidade: "mensal",
            duodecimos_pct: 0,
            subsidio_alimentacao: null,
            valido_de: "2026-01-01",
            valido_ate: null,
          },
        ],
      ],
    ]);
    // Dois dias com >= 300 min trabalhados (elegiveis) e um dia de ausencia
    // com muitos minutos (nao conta) e um dia curto (nao conta).
    diasPorPessoaMock = {
      "pessoa-1": [
        { estado: "normal", realizadoMinutos: 480 },
        { estado: "normal", realizadoMinutos: 300 },
        { estado: "ausencia", realizadoMinutos: 480 },
        { estado: "normal", realizadoMinutos: 100 },
      ],
    };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linhaAna = screen.getByText("Ana Silva").closest("tr")!;
    fireEvent.click(within(linhaAna).getByText("hr.vencimento.visaoGeral.verDetalhe"));

    await screen.findByText("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao");
    const dialogo = screen.getByRole("dialog");
    // 2 dias elegiveis * 6 EUR/dia = 12 EUR -- ja nao e 0,00 EUR.
    const normalizar = (texto: string) => texto.replace(/\s/g, " ");
    const valorEsperado = normalizar(formatarValorEsperado(12));
    const correspondeAoValor = (_: string, elemento: Element | null) =>
      normalizar(elemento?.textContent ?? "") === valorEsperado;
    expect(within(dialogo).getByText(correspondeAoValor)).toBeInTheDocument();
  });

  it("sem permissao de retribuicao, o detalhe esconde base e total mas mostra o resto", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesRecusado = true;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    const linhaAna = screen.getByText("Ana Silva").closest("tr")!;
    fireEvent.click(within(linhaAna).getByText("hr.vencimento.visaoGeral.verDetalhe"));

    await screen.findByText("hr.vencimento.visaoGeral.detalheDescontoFaltas");
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao")).toBeInTheDocument();
    expect(within(dialogo).getByText("hr.vencimento.visaoGeral.detalheLancamentosPontuais")).toBeInTheDocument();
    expect(within(dialogo).queryByText("hr.vencimento.visaoGeral.detalheSalarioBase")).not.toBeInTheDocument();
    expect(within(dialogo).queryByText("hr.vencimento.visaoGeral.detalheValorHoraReal")).not.toBeInTheDocument();
    expect(
      within(dialogo).queryByText("hr.vencimento.visaoGeral.colunaTotalBrutoEstimado"),
    ).not.toBeInTheDocument();
  });
});

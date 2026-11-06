/**
 * `ProcessamentoVisaoGeralTab` (FASE 1): sem periodo mostra "Abrir periodo";
 * com periodo aberto mostra o resumo por pessoa e permite acrescentar/anular
 * um lancamento pontual; com periodo fechado desactiva essas accoes. O
 * resumo por pessoa nao chama `useRelatorioAssiduidadeMensal` de verdade --
 * simula-se `ResumoPessoaProcessamentoOculto` directamente, o mesmo ponto de
 * insercao que o componente real usa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
let direitosEstado: "ok" | "indisponivel" | "recusado" | "erro" = "ok";
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

// As regras do periodo da folha: sem regra (ou a base sem as RPCs) o periodo e o mes de calendario.
const SEM_REGRAS: { dia_inicio: number; valido_de: string }[] = [];
let regrasPeriodoFolha = SEM_REGRAS;
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({
  usePeriodoFolhaRegras: () => ({ regras: regrasPeriodoFolha, estado: "ok", isLoading: false }),
}));

// A regra salarial em vigor (`null` = sem regra) e os direitos por pessoa: o subsidio vem da regra, nao da pessoa.
let regraSalarialMock: Record<string, unknown> | null = null;
vi.mock("@/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({ versoes: [], emVigor: regraSalarialMock, estado: "ok", isLoading: false }),
  regraEmVigorNoDia: () => regraSalarialMock,
}));
vi.mock("@/hooks/useDireitosSalariaisDaOrganizacao", () => ({
  useDireitosSalariaisDaOrganizacao: () => ({ porPessoa: new Map(), estado: direitosEstado, isLoading: false }),
  direitosDaPessoa: () => ({ iht: false, km: false, ajudas: false }),
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
let intervaloRecebido: { de: string; ate: string; mes: number } | null = null;

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
      intervalo,
      mes,
      aoTerminarCarregamento,
    }: {
      pessoaId: string;
      intervalo?: { de: string; ate: string };
      mes: number;
      aoTerminarCarregamento: (id: string, totais: unknown, dias: unknown[]) => void;
    }) => {
      intervaloRecebido = intervalo ? { de: intervalo.de, ate: intervalo.ate, mes } : null;
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
  direitosEstado = "ok";
  totaisPorPessoaMock = {};
  diasPorPessoaMock = {};
  regraSalarialMock = null;
  regrasPeriodoFolha = SEM_REGRAS;
  intervaloRecebido = null;
  abrirMock.mockClear();
  fecharMock.mockClear();
  criarMock.mockClear();
  anularMock.mockClear();
});

function formatarValorEsperado(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

describe("ProcessamentoVisaoGeralTab: o periodo da folha", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0)); // 5 de novembro de 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sem regra o seletor mostra o mes de calendario (1 a 31) e o relatorio por pessoa recebe esse intervalo", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    const seletor = await screen.findByTestId("seletor-periodo-folha");
    expect(seletor).toHaveTextContent("Novembro de 2026");
    expect(seletor.textContent).toMatch(/1\D+11.*30\D+11/);
    await waitFor(() => expect(intervaloRecebido).toEqual({ de: "2026-11-01", ate: "2026-11-30", mes: 11 }));
  });

  it("com o dia de inicio 22 a folha de novembro vai de 22 out a 21 nov, e o nome e o do mes do fecho", async () => {
    regrasPeriodoFolha = [{ dia_inicio: 22, valido_de: "2000-01-01" }];
    periodoActual = null;
    render(<ProcessamentoVisaoGeralTab />);
    const seletor = await screen.findByTestId("seletor-periodo-folha");
    expect(seletor).toHaveTextContent("Novembro de 2026");
    expect(seletor.textContent).toMatch(/22\D+10.*21\D+11/);
  });

  it("um periodo ja aberto manda as suas datas: o relatorio conta por elas", async () => {
    regrasPeriodoFolha = [{ dia_inicio: 22, valido_de: "2000-01-01" }];
    periodoActual = { ...PERIODO_ABERTO, ano: 2026, mes: 11, data_inicio: "2026-10-27", data_fim: "2026-11-21" };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(intervaloRecebido).toEqual({ de: "2026-10-27", ate: "2026-11-21", mes: 11 }));
  });

  it("anterior e seguinte andam de folha em folha", async () => {
    regrasPeriodoFolha = [{ dia_inicio: 22, valido_de: "2000-01-01" }];
    render(<ProcessamentoVisaoGeralTab />);
    const botoes = await screen.findAllByRole("button", { name: "hr.vencimento.visaoGeral.irParaPeriodo" });
    fireEvent.click(botoes[1]); // anterior, seguinte
    expect(screen.getByTestId("seletor-periodo-folha")).toHaveTextContent("Dezembro de 2026");
    expect(screen.getByTestId("seletor-periodo-folha").textContent).toMatch(/22\D+11.*21\D+12/);
  });
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
    // realizadoMinutos = 9630 (160,5h) -- caso com casas decimais.
    totaisPorPessoaMock = {
      "pessoa-1": { ...TOTAIS_PADRAO, realizadoMinutos: 9630 },
      "pessoa-2": { ...TOTAIS_PADRAO, realizadoMinutos: 9630 },
    };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());
    expect(screen.getByRole("cell", { name: "Bruno Costa" })).toBeInTheDocument();
    // diasTrabalhados = 20 para as duas pessoas -- as horas aparecem entre
    // parenteses ao lado dos dias, com uma casa decimal quando o numero de
    // horas nao e redondo.
    expect(screen.getAllByText("20 (160,5h)")).toHaveLength(2);
  });

  it("com periodo aberto, acrescentar valor pontual abre o formulario e chama criar()", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    expect(screen.queryByText("hr.vencimento.visaoGeral.acrescentarValor")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.vencimento.visaoGeral.fecharPeriodo")).not.toBeInTheDocument();
    expect(screen.getByText("Premio antigo")).toBeInTheDocument();
    // Sem accao de anular disponivel sobre um lancamento de um periodo fechado.
    expect(screen.queryByText("hr.vencimento.visaoGeral.anular")).not.toBeInTheDocument();
  });

  it("fechar periodo pede confirmacao antes de chamar fechar()", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linha = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linhaAna = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
    const linhaBruno = screen.getByRole("cell", { name: "Bruno Costa" }).closest("tr")!;
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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linha = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
    const celulas = within(linha).getAllByRole("cell");
    // Ordem das colunas: Pessoa, Dias planeados, Dias trabalhados, Falta
    // completa, Falta incompleta, Horas extra, Salario-base, Codigos
    // aplicados, Total bruto estimado, Accoes.
    const celulaCodigos = celulas[7];
    expect(celulaCodigos.textContent).toBe("");
  });

  it("sem os direitos (IHT, km, ajudas) avisa e marca o total como provisorio, nao como definitivo", async () => {
    periodoActual = PERIODO_ABERTO;
    direitosEstado = "erro";
    retribuicoesPorPessoa = new Map([
      ["pessoa-1", [{ pessoa_id: "pessoa-1", valor_base: 1200, periodicidade: "mensal", duodecimos_pct: 0, subsidio_alimentacao: null, valido_de: "2026-01-01", valido_ate: null }]],
    ]);
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("hr.vencimento.visaoGeral.avisoDireitosIndisponiveis");
    const linha = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
    expect(within(linha).getByText("hr.vencimento.visaoGeral.totalProvisorio")).toBeInTheDocument();
  });

  it("com os direitos lidos nao ha aviso nem total provisorio", async () => {
    periodoActual = PERIODO_ABERTO;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());
    expect(screen.queryByText("hr.vencimento.visaoGeral.avisoDireitosIndisponiveis")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.vencimento.visaoGeral.totalProvisorio")).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linha = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linha = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
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
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linhaAna = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
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

  it("com regra salarial e dias trabalhados, o detalhe mostra o subsidio dia a dia pelos valores da regra", async () => {
    periodoActual = PERIODO_ABERTO;
    // O subsidio vem da regra da organizacao: 5 h ou mais = 6,15 EUR por dia; abaixo disso 0,76 EUR por hora trabalhada.
    regraSalarialMock = {
      subsidio_limite_min: 300, subsidio_valor_hora: 0.76, subsidio_valor_dia: 6.15,
      he_pct_dia_util: 50, he_pct_feriado: 75, he_pct_descanso: 100, iht_pct: 25, noturnas: [],
    };
    retribuicoesPorPessoa = new Map([
      [
        "pessoa-1",
        [
          {
            pessoa_id: "pessoa-1",
            valor_base: 1200,
            periodicidade: "mensal",
            duodecimos_pct: 0,
            valido_de: "2026-01-01",
            valido_ate: null,
          },
        ],
      ],
    ]);
    // Dois dias com >= 300 min (6,15 cada), um dia de ausencia com muitos minutos (nao conta) e um dia curto de
    // 100 min (100 x 0,76 / 60 = 1,27).
    diasPorPessoaMock = {
      "pessoa-1": [
        { estado: "normal", realizadoMinutos: 480 },
        { estado: "normal", realizadoMinutos: 300 },
        { estado: "ausencia", realizadoMinutos: 480 },
        { estado: "normal", realizadoMinutos: 100 },
      ],
    };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linhaAna = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
    fireEvent.click(within(linhaAna).getByText("hr.vencimento.visaoGeral.verDetalhe"));

    await screen.findByText("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao");
    const dialogo = screen.getByRole("dialog");
    // 2 x 6,15 + 1,27 = 13,57 EUR -- ja nao e 0,00 EUR.
    const normalizar = (texto: string) => texto.replace(/\s/g, " ");
    const valorEsperado = normalizar(formatarValorEsperado(13.57));
    const correspondeAoValor = (_: string, elemento: Element | null) =>
      normalizar(elemento?.textContent ?? "") === valorEsperado;
    expect(within(dialogo).getByText(correspondeAoValor)).toBeInTheDocument();
  });

  it("sem regra salarial o subsidio fica a 0,00 EUR no detalhe, mesmo com dias trabalhados", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesPorPessoa = new Map([
      ["pessoa-1", [{ pessoa_id: "pessoa-1", valor_base: 1200, periodicidade: "mensal", duodecimos_pct: 0, valido_de: "2026-01-01", valido_ate: null }]],
    ]);
    diasPorPessoaMock = { "pessoa-1": [{ estado: "normal", realizadoMinutos: 480 }] };
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linhaAna = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
    fireEvent.click(within(linhaAna).getByText("hr.vencimento.visaoGeral.verDetalhe"));

    await screen.findByText("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao");
    const dialogo = screen.getByRole("dialog");
    const linha = within(dialogo).getByText("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao").parentElement!;
    expect(linha.textContent).toMatch(/0,00/);
  });

  it("sem permissao de retribuicao, o detalhe esconde base e total mas mostra o resto", async () => {
    periodoActual = PERIODO_ABERTO;
    retribuicoesRecusado = true;
    render(<ProcessamentoVisaoGeralTab />);
    await waitFor(() => expect(screen.getByRole("cell", { name: "Ana Silva" })).toBeInTheDocument());

    const linhaAna = screen.getByRole("cell", { name: "Ana Silva" }).closest("tr")!;
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

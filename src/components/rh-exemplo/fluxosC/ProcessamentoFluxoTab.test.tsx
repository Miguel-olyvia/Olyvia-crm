// O separador «Calculo do mes» ligado ao processamento salarial REAL. O calculo partilhado (`useCalculoRealDoMes`) entra
// por argumento, por isso nao ha Supabase nem lojas de exemplo. Cobre: a tabela com as parcelas reais, o periodo
// (abrir, fechar, fechado, sem reabertura), os valores pontuais (criar e anular, com o erro do servidor a vista) e os
// avisos de permissao e de carregamento.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";

const fn = vi.hoisted(() => ({
  abrir: vi.fn(),
  fechar: vi.fn(),
  criar: vi.fn(),
  anular: vi.fn(),
  criarPorQuantidade: vi.fn(),
  sucesso: vi.fn(),
  erro: vi.fn(),
  preparar: vi.fn(),
  faltas: vi.fn(),
  recalcular: vi.fn(),
  horasExtra: vi.fn(),
  detetar: vi.fn(),
}));
const estado = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  calculo: {} as Record<string, unknown>,
  // As pessoas que o fecho tem de enviar e o que o periodo fechado leu da base (hooks simulados).
  fecho: { obrigatorias: ["p1", "p2"] as string[], estado: "ok" as string },
  leitura: {} as Record<string, unknown>,
}));

// As regras do periodo da folha: sem regra (a base ainda sem as RPCs) o periodo e o mes de calendario.
const SEM_REGRAS_PERIODO: never[] = [];
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({ usePeriodoFolhaRegras: () => ({ regras: SEM_REGRAS_PERIODO, estado: "ok", isLoading: false }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: fn.sucesso, error: fn.erro } }));
// A preparacao do fecho (detetar desvios e ler as assinaturas) entra simulada: aqui nao ha base.
// A conferencia das faltas do periodo (le `pessoas_faltas`) entra simulada: aqui nao ha base.
vi.mock("@/lib/hr/faltasFecho", () => ({ conferirFaltasDoFecho: (...args: unknown[]) => fn.faltas(...args) }));
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", () => ({
  prepararFechoComDesvios: (...args: unknown[]) => fn.preparar(...args),
  // As horas extra aprovadas no fecho: a assinatura de cada pessoa (aqui nao ha base): sem assinaturas.
  prepararFechoComHorasExtra: async (...args: unknown[]) => fn.horasExtra(...args),
  // O botao «Detetar horas extra» dos avisos: a deteccao entra simulada.
  useHorasExtraAcoes: () => ({ detetar: (...args: unknown[]) => fn.detetar(...args), aExecutar: false }),
  hojeLisboa: () => "2026-10-20",
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (chave: string) => estado.permissoes.has(chave), loading: false }),
}));
vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDoMes: () => estado.calculo,
  RecolhaDeAssiduidade: () => null,
}));

vi.mock("@/components/rh-exemplo/hooks/useProcessamentoResultados", async () => {
  const real = await vi.importActual<typeof import("@/lib/hr/resultadosFecho")>("@/lib/hr/resultadosFecho");
  return {
    construirResultadosDoFecho: real.construirResultadosDoFecho,
    motivoDeBloqueioDoFecho: real.motivoDeBloqueioDoFecho,
    MAX_DESCRICAO_LANCAMENTO: real.MAX_DESCRICAO_LANCAMENTO,
    resultadoDeLinhaGravada: real.resultadoDeLinhaGravada,
    usePessoasObrigatoriasDoFecho: () => estado.fecho,
    useProcessamentoResultados: () => estado.leitura,
  };
});

import { ProcessamentoFluxoTab } from "./ProcessamentoFluxoTab";
import { lerValorPontual } from "./PontualDialog";

const TUDO = ["hr.processamento.periodo.view", "hr.processamento.periodo.gerir", "hr.processamento.lancamentos.gerir"];

const resultado = (extra: Record<string, unknown> = {}) => ({
  valorHoraReal: 7.5, baseMes: 1000, divisorDuodecimos: 14, linhasAutomaticas: [], totalCodigosAutomaticos: 0,
  linhasRegra: [], totalRegras: 0,
  descontoFaltas: 0, subsidioAlimentacao: 0, lancamentosPontuais: 0, totalBrutoEstimado: 1000, avisos: [], ...extra,
});
const linha = (extra: Record<string, unknown> = {}, valorBase: number | null = 1000) => ({
  resultado: resultado(extra), valorBase, periodicidade: valorBase === null ? null : "mensal", mudouAMeioDoMes: false, totais: { planeadoMinutos: 9600, realizadoMinutos: 9000 },
});

/** O que `useProcessamentoResultados` devolve: por omissao nada (periodo aberto); `ok` com linhas gravadas para um fechado. */
const leituraDe = (estadoLeitura: string, linhas: Array<Record<string, unknown>> = [], extra: Record<string, unknown> = {}) => ({
  estado: estadoLeitura,
  porPessoa: new Map(linhas.map((l) => [l.pessoa_id as string, l])),
  fechadoEm: linhas.length > 0 ? "2026-10-20T10:00:00Z" : null,
  fechadoPorNome: linhas.length > 0 ? "Rita Gomes" : null,
  antesDoRegisto: estadoLeitura === "ok" && linhas.length === 0,
  ...extra,
});
const gravada = (pessoaId: string, extra: Record<string, unknown> = {}) => ({
  pessoa_id: pessoaId, valor_hora: 7.5, total_bruto: 777.77,
  totais: { base_mes: 700, divisor_duodecimos: 14, total_codigos_automaticos: 10, total_regras: 20, desconto_faltas: 5, subsidio_alimentacao: 40, lancamentos_pontuais: 12.77 },
  linhas: [], avisos: [], retribuicao_id: null, cargo_periodo_id: null, regra_salarial_id: "regra-1",
  fechado_em: "2026-10-20T10:00:00Z", fechado_por_nome: "Rita Gomes", ...extra,
});
const PERIODO_FECHADO = { id: "per", estado: "fechado", fechado_em: "2026-10-20T10:00:00Z" };
const calculoFechado = (extra: Record<string, unknown> = {}) =>
  calculo({ periodoHook: { periodo: PERIODO_FECHADO, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar }, pendentes: 2, ...extra });

const ANA_LANCAMENTO = { id: "l1", periodo_id: "per", pessoa_id: "p1", descricao: "Prémio de equipa", valor: 30, anulado_em: null };

function calculo(extra: Record<string, unknown> = {}) {
  return {
    intervalo: { de: "2026-10-01", ate: "2026-10-31", estimado: false },
    intervalo: { de: "2026-10-01", ate: "2026-10-31", estimado: false },
    periodoHook: { periodo: { id: "per", estado: "aberto", fechado_em: null }, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar },
    lancamentosHook: { saving: false, recusado: false, criar: fn.criar, criarPorQuantidade: fn.criarPorQuantidade, anular: fn.anular, lancamentos: [] },
    // So a Ana tem direito a km e ajudas; a regra em vigor traz os valores unitarios.
    direitosHook: { porPessoa: new Map([["p1", { iht: false, km: true, ajudas: true }]]), estado: "ok" },
    direitosLidos: true,
    regra: { id: "regra-1", km_valor: 0.4, ajudas_custo_dia: 65.89 },
    retribuicoesHook: { recusado: false, estado: "ok", porPessoa: new Map([["p1", [{ id: "ret-p1", valido_de: "2026-01-01", valido_ate: null }]]]) },
    codigosEstado: "ok",
    assiduidadeIncompleta: () => false,
    desviosNaoLidos: () => false,
    semDesvios: 0,
    diasPorValidar: 0,
    recalcular: fn.recalcular,
    organizationId: "org-1",
    regrasHook: { estado: "ok", isLoading: false },
    resultados: new Map([
      ["p1", linha({ totalCodigosAutomaticos: 50, descontoFaltas: 20, subsidioAlimentacao: 110, totalRegras: 40, lancamentosPontuais: 30, totalBrutoEstimado: 1210 })],
      ["p2", linha({ baseMes: null, divisorDuodecimos: null, valorHoraReal: null, totalBrutoEstimado: null, avisos: ["sem_retribuicao"] }, null)],
    ]),
    pessoasActivas: [{ id: "p1", nome_completo: "Ana Real" }, { id: "p2", nome_completo: "Bruno Real" }],
    pessoasACarregar: false, pessoasErro: null, pendentes: 0, incompletas: 0,
    lancamentosPorPessoa: new Map([["p1", [ANA_LANCAMENTO]]]),
    codigosActivos: [{ id: "c1", codigo: "100", nome: "Hora extra" }],
    ...extra,
  };
}

const abrir = () => render(<LanguageProvider><ProcessamentoFluxoTab /></LanguageProvider>);
const linhaDe = (nome: RegExp) => screen.getByRole("rowheader", { name: nome }).closest("tr") as HTMLElement;
const celulas = (l: HTMLElement) => within(l).getAllByRole("cell").map((c) => c.textContent ?? "");

beforeAll(() => {
  // O Radix Select precisa de APIs que o jsdom nao traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  for (const f of Object.values(fn)) f.mockReset();
  fn.abrir.mockResolvedValue(null);
  fn.fechar.mockResolvedValue(null);
  fn.criar.mockResolvedValue(null);
  fn.anular.mockResolvedValue(null);
  fn.criarPorQuantidade.mockResolvedValue(null);
  fn.preparar.mockResolvedValue({ ok: true, assinaturas: new Map() });
  fn.horasExtra.mockResolvedValue({ ok: true, assinaturas: new Map() });
  fn.faltas.mockResolvedValue({ ok: true });
  estado.permissoes = new Set(TUDO);
  estado.calculo = calculo();
  estado.fecho = { obrigatorias: ["p1", "p2"], estado: "ok" };
  estado.leitura = leituraDe("inactivo");
});
afterEach(cleanup);

describe("a tabela do calculo do mes", () => {
  it("uma linha por pessoa activa, com cada parcela real e o total do mes", () => {
    abrir();
    const cabecalhos = screen.getAllByRole("columnheader").map((c) => c.textContent);
    for (const nome of ["Pessoa", "Base do mês", "Códigos", "Faltas", "Subsídios", "Noturnas, IHT, km e ajudas", "Pontuais", "Total bruto"]) expect(cabecalhos).toContain(nome);
    expect(cabecalhos).not.toContain("Horas extra");
    const ana = celulas(linhaDe(/Ana Real/));
    expect(ana[0]).toMatch(/1.?000,00/);
    expect(ana[1]).toMatch(/50,00/);
    expect(ana[2]).toMatch(/[-−]20,00/);
    expect(ana[3]).toMatch(/110,00/);
    expect(ana[4]).toMatch(/40,00/);
    expect(ana[5]).toMatch(/30,00/);
    expect(ana[6]).toMatch(/1.?210,00/);
    expect(screen.getByText("Total bruto do mês").closest("tr")).toHaveTextContent(/1.?210,00/);
  });

  it("quem nao tem retribuicao fica «Sem valor», com o aviso, e fora do total", () => {
    abrir();
    const bruno = linhaDe(/Bruno Real/);
    expect(bruno).toHaveTextContent("Sem valor");
    expect(bruno).toHaveTextContent(/1 aviso/);
    expect(screen.getByText(/1 pessoa\(s\) sem retribuição não entram no total/)).toBeInTheDocument();
  });

  it("enquanto a assiduidade de alguem nao chegou, a linha carrega e o total nao se mostra como se estivesse certo", () => {
    estado.calculo = calculo({ resultados: new Map([["p1", linha({ totalBrutoEstimado: 1170 })]]), pendentes: 1 });
    abrir();
    expect(screen.getByText(/A calcular a assiduidade de 1 pessoa/)).toBeInTheDocument();
    expect(screen.getByText("Total bruto do mês").closest("tr")).toHaveTextContent("—");
    expect(screen.getByText("Total bruto do mês").closest("tr")).not.toHaveTextContent(/1.?170/);
  });

  it("sem permissao para ver retribuicoes nao mostra bases nem totais, so avisa", () => {
    estado.calculo = calculo({ retribuicoesHook: { recusado: true, estado: "recusado" } });
    abrir();
    expect(screen.getByText(/Não tem permissão para ver as retribuições/)).toBeInTheDocument();
    const ana = celulas(linhaDe(/Ana Real/));
    expect(ana.slice(0, 5).every((c) => c.includes("—"))).toBe(true);
    expect(ana[6]).toBe("—");
    expect(screen.getByText("Total bruto do mês").closest("tr")).not.toHaveTextContent(/1.?210/);
  });

  it("um erro a carregar as pessoas aparece como alerta, nao como lista vazia", () => {
    estado.calculo = calculo({ pessoasErro: "falha ao ler", pessoasActivas: [], resultados: new Map() });
    abrir();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível carregar as pessoas: falha ao ler/);
  });

  it("assiduidade lida so em parte e valores pontuais recusados sao avisados", () => {
    estado.calculo = calculo({ incompletas: 2, lancamentosHook: { saving: false, recusado: true, criar: fn.criar, anular: fn.anular, lancamentos: [] } });
    abrir();
    expect(screen.getByText(/assiduidade de 2 pessoa\(s\) só se leu em parte/)).toBeInTheDocument();
    expect(screen.getByText(/Não tem permissão para ver os valores pontuais/)).toBeInTheDocument();
  });

  it("sem permissao de ver o periodo nao mostra a tabela", () => {
    estado.permissoes = new Set();
    abrir();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("o periodo: abrir, fechar e estar fechado", () => {
  it("sem periodo diz que nao ha e oferece abrir; abrir chama a RPC e avisa", async () => {
    estado.calculo = calculo({ periodoHook: { periodo: null, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar } });
    abrir();
    expect(screen.getByText(/Ainda não existe periodo de processamento aberto/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir período" }));
    await waitFor(() => expect(fn.abrir).toHaveBeenCalledTimes(1));
    expect(fn.sucesso).toHaveBeenCalledWith("Período aberto.");
  });

  it("sem permissao de gerir nao ha botao de abrir e diz-se porque", () => {
    estado.permissoes = new Set(["hr.processamento.periodo.view"]);
    estado.calculo = calculo({ periodoHook: { periodo: null, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar } });
    abrir();
    expect(screen.queryByRole("button", { name: "Abrir período" })).not.toBeInTheDocument();
    expect(screen.getByText("Não tem permissão para abrir este período.")).toBeInTheDocument();
  });

  it("uma recusa ao abrir fica visivel (aviso de erro) e nao diz que abriu", async () => {
    fn.abrir.mockResolvedValue("A base recusou abrir o período.");
    estado.calculo = calculo({ periodoHook: { periodo: null, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar } });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Abrir período" }));
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith("A base recusou abrir o período."));
    expect(fn.sucesso).not.toHaveBeenCalled();
  });

  it("fechar pede confirmacao e so depois chama a RPC", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Fechar o mês" }));
    const confirmacao = screen.getByRole("alertdialog");
    expect(confirmacao).toHaveTextContent(/irreversível/);
    expect(fn.fechar).not.toHaveBeenCalled();
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Fechar o mês" }));
    await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
    expect(fn.sucesso).toHaveBeenCalledWith("Período fechado.");
  });

  it("uma recusa ao fechar fica visivel", async () => {
    fn.fechar.mockResolvedValue("Não foi possível fechar.");
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Fechar o mês" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Fechar o mês" }));
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith("Não foi possível fechar."));
    expect(fn.sucesso).not.toHaveBeenCalled();
  });

  it("periodo fechado: diz-o, nao deixa fechar nem acrescentar valores, e nao oferece reabrir (nao ha RPC)", () => {
    estado.calculo = calculo({
      intervalo: { de: "2026-10-01", ate: "2026-10-31", estimado: false },
    periodoHook: { periodo: { id: "per", estado: "fechado", fechado_em: "2026-10-20T10:00:00Z" }, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar },
    });
    abrir();
    expect(screen.getByText(/fechado em 20\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/não se volta a abrir/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fechar o mês" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reabrir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Acrescentar valor/ })).not.toBeInTheDocument();
  });

  it("enquanto o periodo carrega nao mostra a tabela nem decide que nao ha periodo", () => {
    estado.calculo = calculo({ periodoHook: { periodo: null, loading: true, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar } });
    abrir();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ainda não existe periodo/)).not.toBeInTheDocument();
  });

  it("sem permissao para ver o periodo diz-se", () => {
    estado.calculo = calculo({ periodoHook: { periodo: null, loading: false, saving: false, recusado: true, abrir: fn.abrir, fechar: fn.fechar } });
    abrir();
    expect(screen.getByText("Não tem permissão para ver o período deste mês.")).toBeInTheDocument();
  });
});

describe("fechar grava o resultado de cada pessoa", () => {
  const fechar = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Fechar o mês" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Fechar o mês" }));
  };

  it("a confirmacao diz que o resultado fica gravado e ja nao se recalcula", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Fechar o mês" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/resultado de cada pessoa fica gravado e já não se recalcula/);
  });

  it("envia p_resultados com UM objecto por pessoa obrigatoria, com os valores que o ecra mostra", async () => {
    abrir();
    await fechar();
    await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
    const enviados = fn.fechar.mock.calls[0][0] as Array<Record<string, unknown> & { totais: Record<string, unknown> }>;
    expect(enviados.map((r) => r.pessoa_id)).toEqual(["p1", "p2"]);
    const ana = enviados[0];
    expect(ana).toMatchObject({ valor_hora: 7.5, total_bruto: 1210, retribuicao_id: "ret-p1", cargo_periodo_id: null, regra_salarial_id: "regra-1", planeado_minutos: 9600, realizado_minutos: 9000 });
    expect(ana.totais).toMatchObject({ base_mes: 1000, total_codigos_automaticos: 50, desconto_faltas: 20, subsidio_alimentacao: 110, total_regras: 40, lancamentos_pontuais: 30 });
    expect(enviados[1]).toMatchObject({ total_bruto: null, retribuicao_id: null, avisos: ["sem_retribuicao"] });
  });

  it("so envia as pessoas obrigatorias (activas com vinculo sobreposto ao periodo)", async () => {
    estado.fecho = { obrigatorias: ["p1"], estado: "ok" };
    abrir();
    await fechar();
    await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
    expect((fn.fechar.mock.calls[0][0] as Array<{ pessoa_id: string }>).map((r) => r.pessoa_id)).toEqual(["p1"]);
  });

  it("uma recusa do servidor (periodo continua aberto) aparece como erro e nao como sucesso", async () => {
    fn.fechar.mockResolvedValue("O período continua aberto: as regras salariais mudaram.");
    abrir();
    await fechar();
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith("O período continua aberto: as regras salariais mudaram."));
    expect(fn.sucesso).not.toHaveBeenCalled();
  });

  it("ANTES de fechar deteta os desvios do periodo e le as assinaturas; cada assinatura segue no resultado da pessoa", async () => {
    estado.calculo = calculo({ chaveDeDesviosUsada: (id: string) => (id === "p1" ? "chave-p1" : "") });
    fn.preparar.mockResolvedValue({ ok: true, assinaturas: new Map([["p1", "assinatura-ana"]]) });
    abrir();
    await fechar();
    await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
    expect(fn.preparar).toHaveBeenCalledWith({ organizationId: "org-1", periodoId: "per", de: "2026-10-01", ate: "2026-10-31", calculadas: new Map([["p1", "chave-p1"], ["p2", ""]]) });
    const enviados = fn.fechar.mock.calls[0][0] as Array<{ pessoa_id: string; desvios_assinatura: string | null }>;
    expect(enviados.map((r) => [r.pessoa_id, r.desvios_assinatura])).toEqual([["p1", "assinatura-ana"], ["p2", null]]);
    expect(fn.preparar.mock.invocationCallOrder[0]).toBeLessThan(fn.fechar.mock.invocationCallOrder[0]);
  });

  it("se a deteccao mudou dias, nao fecha: relê o calculo e di-lo", async () => {
    fn.preparar.mockResolvedValue({ ok: false, motivo: "mudaram", mudou: 3 });
    abrir();
    await fechar();
    await waitFor(() => expect(fn.recalcular).toHaveBeenCalledTimes(1));
    expect(fn.fechar).not.toHaveBeenCalled();
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith(expect.stringContaining("mudou 3 dia(s)")));
  });

  it("antes de gravar confere as faltas com as que o calculo usou (a chave de cada pessoa)", async () => {
    estado.calculo = calculo({ chaveDeFaltasUsada: (id: string) => (id === "p1" ? "faltas-p1" : "") });
    abrir();
    await fechar();
    await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
    expect(fn.faltas).toHaveBeenCalledWith({ organizationId: "org-1", de: "2026-10-01", ate: "2026-10-31", calculadas: new Map([["p1", "faltas-p1"], ["p2", ""]]) });
    expect(fn.faltas.mock.invocationCallOrder[0]).toBeLessThan(fn.fechar.mock.invocationCallOrder[0]);
  });

  it("se as faltas mudaram depois do calculo (justificacao aprovada, falta anulada), nao fecha: relê o calculo e di-lo", async () => {
    fn.faltas.mockResolvedValue({ ok: false, motivo: "mudaram", mudou: 2 });
    abrir();
    await fechar();
    await waitFor(() => expect(fn.recalcular).toHaveBeenCalledTimes(1));
    expect(fn.fechar).not.toHaveBeenCalled();
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith(expect.stringContaining("2 pessoa(s)")));
  });

  it("um erro a ler as faltas impede o fecho", async () => {
    fn.faltas.mockResolvedValue({ ok: false, motivo: "erro" });
    abrir();
    await fechar();
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith(expect.stringContaining("faltas")));
    expect(fn.fechar).not.toHaveBeenCalled();
  });

  it("um erro a detetar os desvios ou a ler as assinaturas impede o fecho e aparece escrito", async () => {
    fn.preparar.mockResolvedValue({ ok: false, motivo: "erro", texto: "Já há uma deteção de desvios a correr nesta organização." });
    abrir();
    await fechar();
    await waitFor(() => expect(fn.erro).toHaveBeenCalledWith("Já há uma deteção de desvios a correr nesta organização."));
    expect(fn.fechar).not.toHaveBeenCalled();
  });

  describe("horas extra aprovadas", () => {
    const totaisDe = (mapa: Record<string, Record<string, unknown>>) => (id: string) => mapa[id];

    it("confere TODAS as pessoas (bruto incluido) e o interruptor; segue a chave do CALCULO (so em modo aprovadas), nunca a assinatura de agora", async () => {
      estado.calculo = calculo({
        totaisDe: totaisDe({
          p1: { horasExtraFonte: "aprovadas", horasExtraChave: "he-p1", horasExtraAprovacaoDesde: "2026-10-01" },
          p2: { horasExtraFonte: "bruto", horasExtraChave: "", horasExtraAprovacaoDesde: "2026-10-01" },
        }),
      });
      // As assinaturas de agora existem para as duas, mas NENHUMA delas segue no resultado.
      fn.horasExtra.mockResolvedValue({ ok: true, assinaturas: new Map([["p1", "fresca-p1"], ["p2", "fresca-p2"]]) });
      abrir();
      await fechar();
      await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
      expect(fn.horasExtra).toHaveBeenCalledWith({
        periodoId: "per",
        calculadas: new Map([["p1", "he-p1"], ["p2", ""]]),
        referencia: { organizationId: "org-1", pessoaId: "p1", de: "2026-10-01", ate: "2026-10-31", desdeCalculo: "2026-10-01" },
      });
      const enviados = fn.fechar.mock.calls[0][0] as Array<{ pessoa_id: string; horas_extra_assinatura?: string }>;
      expect(enviados.map((r) => [r.pessoa_id, r.horas_extra_assinatura])).toEqual([["p1", "he-p1"], ["p2", undefined]]);
      expect(fn.horasExtra.mock.invocationCallOrder[0]).toBeLessThan(fn.fechar.mock.invocationCallOrder[0]);
    });

    it("cenario 2: sem permissao para ler as horas extra nada se confere e nenhuma assinatura segue (a base decide)", async () => {
      estado.calculo = calculo({
        totaisDe: totaisDe({ p1: { horasExtraFonte: "bruto", horasExtraChave: "", horasExtraRecusadas: true }, p2: { horasExtraFonte: "bruto", horasExtraRecusadas: true } }),
      });
      fn.horasExtra.mockResolvedValue({ ok: true, assinaturas: new Map([["p1", "fresca-p1"]]) });
      abrir();
      await fechar();
      await waitFor(() => expect(fn.fechar).toHaveBeenCalledTimes(1));
      expect(fn.horasExtra).toHaveBeenCalledWith({ periodoId: "per", calculadas: new Map(), referencia: undefined });
      const enviados = fn.fechar.mock.calls[0][0] as Array<{ horas_extra_assinatura?: string }>;
      expect(enviados.every((r) => !("horas_extra_assinatura" in r))).toBe(true);
    });

    it("cenario 1: a contagem foi ligada depois de calcular (calculo em bruto): nao fecha, recalcula e di-lo com a frase propria", async () => {
      fn.horasExtra.mockResolvedValue({ ok: false, motivo: "sem_confirmadas" });
      abrir();
      await fechar();
      await waitFor(() => expect(fn.recalcular).toHaveBeenCalledTimes(1));
      expect(fn.fechar).not.toHaveBeenCalled();
      await waitFor(() => expect(fn.erro).toHaveBeenCalledWith(expect.stringContaining("sem as horas extra confirmadas")));
      expect(fn.erro).not.toHaveBeenCalledWith(expect.stringContaining("mudaram"));
    });

    it("horas extra sem permissao e horas extra confirmadas em dias de ausencia: avisa (nao bloqueia o botao)", () => {
      estado.calculo = calculo({ semPermissaoHorasExtra: 1, totalHorasExtraNaoContadas: 45 });
      render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      expect(screen.getByText(/não foram lidas por falta de permissão.*o fecho pode ser recusado/)).toBeInTheDocument();
      expect(screen.getByText(/45 minuto\(s\) de horas extra confirmadas em dias de ausência: não são pagas/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fechar o mês" })).not.toHaveAttribute("aria-disabled", "true");
    });

    it("se as horas extra mudaram depois do calculo, nao fecha: relê o calculo e di-lo", async () => {
      fn.horasExtra.mockResolvedValue({ ok: false, motivo: "mudaram", mudou: 2 });
      abrir();
      await fechar();
      await waitFor(() => expect(fn.recalcular).toHaveBeenCalledTimes(1));
      expect(fn.fechar).not.toHaveBeenCalled();
      await waitFor(() => expect(fn.erro).toHaveBeenCalledWith(expect.stringContaining("horas extra de 2 pessoa(s) mudaram")));
    });

    it("um erro a ler as assinaturas das horas extra impede o fecho", async () => {
      fn.horasExtra.mockResolvedValue({ ok: false, motivo: "erro", texto: "Não foi possível ler as horas extra para o fecho." });
      abrir();
      await fechar();
      await waitFor(() => expect(fn.erro).toHaveBeenCalledWith("Não foi possível ler as horas extra para o fecho."));
      expect(fn.fechar).not.toHaveBeenCalled();
    });

    it("pendentes bloqueiam o botao, com o motivo escrito", () => {
      estado.calculo = calculo({ horasExtraPendentes: (id: string) => (id === "p2" ? 2 : 0), totalHorasExtraPendentes: 2 });
      render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      const botao = screen.getByRole("button", { name: "Fechar o mês" });
      expect(botao).toHaveAttribute("aria-disabled", "true");
      expect(botao).toHaveAccessibleDescription(/1 pessoa\(s\) têm horas extra por decidir/);
      expect(screen.getByText(/2 hora\(s\) extra por decidir/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ver as horas extra na fila de trabalho" })).toHaveAttribute("href", "/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade&fila_tipo=hora_extra");
    });

    it("horas extra por ler bloqueiam o botao e o alerta di-lo", () => {
      estado.calculo = calculo({ horasExtraNaoLidas: (id: string) => id === "p1", semHorasExtra: 1 });
      render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getAllByRole("alert").some((e) => /horas extra de 1 pessoa\(s\) não se leram/.test(e.textContent ?? ""))).toBe(true);
    });

    it("«excesso por detetar»: avisa e o botao corre a deteccao do periodo (ate hoje) e refaz o calculo", async () => {
      fn.detetar.mockResolvedValue({ ok: true, erro: null, resumo: { criadas: 3 } });
      estado.calculo = calculo({ totalExcessoPorDetetar: 3 });
      render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      expect(screen.getByText(/3 dia\(s\) com tempo a mais sem hora extra registada/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Detetar horas extra" }));
      await waitFor(() => expect(fn.detetar).toHaveBeenCalledWith("2026-10-01", "2026-10-20"));
      await waitFor(() => expect(fn.recalcular).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/3 hora\(s\) extra nova\(s\) por decidir/)).toBeInTheDocument();
    });

    it("a resposta da deteccao sobrevive ao recalculo (os totais voltam a zero) e recebe o foco; 0 criadas diz-o e nao refaz o calculo", async () => {
      fn.detetar.mockResolvedValue({ ok: true, erro: null, resumo: { criadas: 0 } });
      estado.calculo = calculo({ totalExcessoPorDetetar: 2 });
      const vista = render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      fireEvent.click(screen.getByRole("button", { name: "Detetar horas extra" }));
      expect(await screen.findByText("Deteção feita: não foram criadas horas extra novas.")).toBeInTheDocument();
      expect(fn.recalcular).not.toHaveBeenCalled();
      // O excesso desaparece (recalculo): a mensagem fica.
      estado.calculo = calculo({ totalExcessoPorDetetar: 0 });
      vista.rerender(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      expect(screen.getByText("Deteção feita: não foram criadas horas extra novas.")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText("Deteção feita: não foram criadas horas extra novas.")).toHaveFocus());
    });

    it("deteccao parcial: mostra o erro e a janela que falhou, e refaz o calculo pelo que ja se criou", async () => {
      fn.detetar.mockResolvedValue({ ok: false, erro: "A base recusou a deteção.", resumo: { criadas: 2 }, janelaFalhada: { de: "2026-10-08", ate: "2026-10-14" } });
      estado.calculo = calculo({ totalExcessoPorDetetar: 2 });
      render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
      fireEvent.click(screen.getByRole("button", { name: "Detetar horas extra" }));
      expect(await screen.findByText(/A base recusou a deteção\..*2026-10-08 a 2026-10-14/)).toBeInTheDocument();
      await waitFor(() => expect(fn.recalcular).toHaveBeenCalledTimes(1));
    });

    it("sem nada a avisar (interruptor desligado) nao aparece nenhum aviso de horas extra", () => {
      abrir();
      expect(screen.queryByTestId("avisos-horas-extra")).not.toBeInTheDocument();
    });
  });

  it("a margem ou os desvios por ler bloqueiam o botao, com o motivo escrito (nunca calcula em silencio)", () => {
    estado.calculo = calculo({ desviosNaoLidos: (id: string) => id === "p2", semDesvios: 1 });
    abrir();
    const botao = screen.getByRole("button", { name: "Fechar o mês" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAccessibleDescription(/margem de tempo ou os desvios de 1 pessoa\(s\) não puderam ser lidos/);
    expect(screen.getAllByRole("alert").some((e) => /margem de tempo ou os desvios de 1 pessoa\(s\) não se leram/.test(e.textContent ?? ""))).toBe(true);
  });

  it("avisa «N dias por validar» com a ligacao para a fila de desvios a validar", () => {
    estado.calculo = calculo({ diasPorValidar: 4 });
    render(<LanguageProvider><MemoryRouter><ProcessamentoFluxoTab /></MemoryRouter></LanguageProvider>);
    expect(screen.getByText(/4 dia\(s\) por validar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver os desvios na fila de trabalho" })).toHaveAttribute("href", "/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade&fila_tipo=desvio_a_validar");
  });

  it("sem dias por validar nao aparece nenhum aviso de desvios", () => {
    abrir();
    expect(screen.queryByTestId("avisos-desvios")).not.toBeInTheDocument();
  });

  it("direitos salariais por ler: o botao fica bloqueado e o motivo esta escrito", () => {
    estado.calculo = calculo({ direitosLidos: false, direitosHook: { porPessoa: new Map(), estado: "erro" } });
    abrir();
    const botao = screen.getByRole("button", { name: "Fechar o mês" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAccessibleDescription(/não foi possível ler os direitos salariais/);
  });

  it("uma pessoa obrigatoria ainda sem calculo bloqueia o botao e diz quantas faltam", () => {
    estado.calculo = calculo({ resultados: new Map([["p1", linha()]]), pendentes: 1 });
    abrir();
    expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/falta o cálculo de 1 pessoa/)).toBeInTheDocument();
    expect(fn.fechar).not.toHaveBeenCalled();
  });

  it("o botao de fechar e aria-disabled (continua focavel) e o clique nao abre a confirmacao", () => {
    estado.calculo = calculo({ codigosEstado: "erro" });
    abrir();
    const botao = screen.getByRole("button", { name: "Fechar o mês" });
    expect(botao).not.toBeDisabled();
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("codigos de processamento que nao se leram por inteiro bloqueiam, com o motivo escrito", () => {
    for (const codigosEstado of ["recusado", "erro", "a_carregar"]) {
      cleanup();
      estado.calculo = calculo({ codigosEstado });
      abrir();
      expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText(/códigos de processamento não puderam ser lidos/)).toBeInTheDocument();
    }
  });

  it("retribuicoes com erro de leitura ou a carregar bloqueiam (nao so a recusa)", () => {
    for (const est of ["erro", "a_carregar"]) {
      cleanup();
      estado.calculo = calculo({ retribuicoesHook: { recusado: false, estado: est, porPessoa: new Map() } });
      abrir();
      expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText(/retribuições não puderam ser lidas por inteiro/)).toBeInTheDocument();
    }
  });

  it("assiduidade lida so em parte (recusada ou com erro) bloqueia o fecho e diz quantas pessoas", () => {
    estado.calculo = calculo({ assiduidadeIncompleta: (id: string) => id === "p2" });
    abrir();
    expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/assiduidade de 1 pessoa\(s\) só se leu em parte/)).toBeInTheDocument();
    expect(fn.fechar).not.toHaveBeenCalled();
  });
  it("sem permissao para ver retribuicoes, regras ilegiveis ou vinculos por ler: bloqueia", () => {
    estado.calculo = calculo({ retribuicoesHook: { recusado: true, estado: "recusado", porPessoa: new Map() } });
    abrir();
    expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
    cleanup();
    estado.calculo = calculo({ regrasHook: { estado: "erro", isLoading: false } });
    abrir();
    expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/regras salariais não puderam ser lidas/)).toBeInTheDocument();
    cleanup();
    estado.calculo = calculo();
    estado.fecho = { obrigatorias: [], estado: "erro" };
    abrir();
    expect(screen.getByRole("button", { name: "Fechar o mês" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/ler os vínculos/)).toBeInTheDocument();
  });
});

describe("periodo fechado: le o gravado e nao recalcula", () => {
  it("mostra os valores GRAVADOS (nao o calculo de agora) e diz quando e por quem foi fechado", () => {
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("ok", [gravada("p1"), gravada("p2", { total_bruto: 500, totais: { base_mes: 500 } })]);
    abrir();
    expect(screen.getByText("Fechado a 20/10/2026 por Rita Gomes")).toBeInTheDocument();
    const ana = celulas(linhaDe(/Ana Real/));
    expect(ana[0]).toMatch(/700,00/);
    expect(ana[6]).toMatch(/777,77/);
    expect(screen.getByText("Total bruto do mês").closest("tr")).toHaveTextContent(/1.?277,77/);
    // O calculo de agora (1210 para a Ana) nao aparece em lado nenhum.
    expect(screen.queryByText(/1.?210,00/)).not.toBeInTheDocument();
  });

  it("nao pede nem mostra a assiduidade a calcular, nem avisos de total provisorio", () => {
    estado.calculo = calculoFechado({ direitosLidos: false, direitosHook: { porPessoa: new Map(), estado: "erro" }, incompletas: 3 });
    estado.leitura = leituraDe("ok", [gravada("p1")]);
    abrir();
    expect(screen.queryByText(/A calcular a assiduidade/)).not.toBeInTheDocument();
    expect(screen.queryByText(/só se leu em parte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/provisório/i)).not.toBeInTheDocument();
  });

  it("fechado antes do registo: diz que os valores nao estao disponiveis e nao mostra numeros nem tabela", () => {
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("ok", []);
    abrir();
    expect(screen.getByText("Fechado antes do registo dos resultados: valores não disponíveis")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/1.?210,00/)).not.toBeInTheDocument();
  });

  it("a ler os resultados gravados: diz-o e nao mostra tabela", () => {
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("a_carregar");
    abrir();
    expect(screen.getByText(/A ler os resultados gravados/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("sem permissao para as retribuicoes: diz-o e nao mostra valores", () => {
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("recusado");
    abrir();
    expect(screen.getAllByText(/Não tem permissão para ver/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uma falha a ler os resultados fica visivel como alerta", () => {
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("erro");
    abrir();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler os resultados gravados/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("o detalhe de uma pessoa mostra o gravado", () => {
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("ok", [gravada("p1")]);
    abrir();
    fireEvent.click(within(linhaDe(/Ana Real/)).getByRole("button", { name: /Como chegámos/ }));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent(/777,77/);
    expect(dialogo).toHaveTextContent(/700,00/);
  });
});

describe("km e ajudas de custo", () => {
  const abrirDialogo = () => {
    abrir();
    fireEvent.click(within(linhaDe(/Ana Real/)).getByRole("button", { name: /Km e ajudas/ }));
    return screen.getByRole("dialog");
  };

  it("so quem tem direito a km ou ajudas tem o botao", () => {
    abrir();
    expect(within(linhaDe(/Ana Real/)).getByRole("button", { name: /Km e ajudas/ })).toBeInTheDocument();
    expect(within(linhaDe(/Bruno Real/)).queryByRole("button", { name: /Km e ajudas/ })).not.toBeInTheDocument();
  });

  it("sem permissao de gerir lancamentos, ou com o periodo fechado, nao ha botao", () => {
    estado.permissoes = new Set(["hr.processamento.periodo.view"]);
    abrir();
    expect(screen.queryByRole("button", { name: /Km e ajudas/ })).not.toBeInTheDocument();
    cleanup();
    estado.permissoes = new Set(TUDO);
    estado.calculo = calculoFechado();
    estado.leitura = leituraDe("ok", [gravada("p1"), gravada("p2")]);
    abrir();
    expect(screen.getByRole("rowheader", { name: /Ana Real/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Km e ajudas/ })).not.toBeInTheDocument();
  });

  it("mostra o valor da regra e a previsao, e grava so tipo e quantidade (virgula decimal aceite), nunca o valor", async () => {
    const dialogo = abrirDialogo();
    expect(within(dialogo).getByText(/0,40/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Quilómetros"), { target: { value: "100" } });
    expect(within(dialogo).getByText(/Valor a lançar: 40,00/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fn.criarPorQuantidade).toHaveBeenCalledWith({ pessoaId: "p1", tipo: "km", quantidade: 100 }));
    expect(fn.criarPorQuantidade.mock.calls[0][0]).not.toHaveProperty("valor");
    expect(fn.sucesso).toHaveBeenCalledWith("Lançamento registado.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("uma quantidade invalida (zero, texto, mais de duas casas) nao chega a base", async () => {
    const dialogo = abrirDialogo();
    for (const invalida of ["", "0", "abc", "1,234"]) {
      fireEvent.change(within(dialogo).getByLabelText("Quilómetros"), { target: { value: invalida } });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
      expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/quantidade maior que zero/);
    }
    expect(fn.criarPorQuantidade).not.toHaveBeenCalled();
  });

  it("uma recusa da base (por exemplo sem direito) fica no dialogo, que continua aberto", async () => {
    fn.criarPorQuantidade.mockResolvedValue("rhFluxosC.lanc.erro.semDireito");
    const dialogo = abrirDialogo();
    fireEvent.change(within(dialogo).getByLabelText("Quilómetros"), { target: { value: "10" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Esta pessoa não tem direito a este tipo de lançamento.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fn.sucesso).not.toHaveBeenCalled();
  });

  it("com a leitura dos direitos falhada avisa, marca o total como provisorio e desactiva o botao (nao diz «sem direito»)", () => {
    estado.calculo = calculo({ direitosHook: { porPessoa: new Map(), estado: "erro" }, direitosLidos: false });
    abrir();
    expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler os direitos \(IHT, km, ajudas\): os totais podem estar incompletos/);
    const botao = within(linhaDe(/Ana Real/)).getByRole("button", { name: /Km e ajudas/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAccessibleDescription(/Não foi possível ler os direitos/);
    expect(screen.getAllByText("provisório").length).toBeGreaterThan(0);
    expect(screen.queryByText(/não tem direito/i)).not.toBeInTheDocument();
  });

  it("Enter no campo da quantidade guarda (o dialogo e um formulario)", async () => {
    const dialogo = abrirDialogo();
    const campo = within(dialogo).getByLabelText("Quilómetros");
    fireEvent.change(campo, { target: { value: "5" } });
    fireEvent.submit(campo.closest("form") as HTMLFormElement);
    await waitFor(() => expect(fn.criarPorQuantidade).toHaveBeenCalledWith({ pessoaId: "p1", tipo: "km", quantidade: 5 }));
  });

  it("o erro fica ligado ao campo por aria-describedby", async () => {
    const dialogo = abrirDialogo();
    const campo = within(dialogo).getByLabelText("Quilómetros");
    fireEvent.change(campo, { target: { value: "0" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await within(dialogo).findByRole("alert");
    expect(campo.getAttribute("aria-describedby")).toContain("ka-erro");
    expect(campo).toHaveAccessibleDescription(/quantidade maior que zero/);
  });

  it("sem regra em vigor diz-o e nao deixa guardar", () => {
    estado.calculo = calculo({ regra: null });
    const dialogo = abrirDialogo();
    expect(within(dialogo).getByText(/Não há regra salarial em vigor/)).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});

describe("valores pontuais", () => {
  const abrirDialogo = () => {
    abrir();
    fireEvent.click(within(linhaDe(/Ana Real/)).getByRole("button", { name: /Acrescentar valor/ }));
    return screen.getByRole("dialog");
  };

  it("guardar chama a RPC com a pessoa, a descricao e o valor (virgula decimal aceite) e fecha", async () => {
    const dialogo = abrirDialogo();
    fireEvent.change(within(dialogo).getByLabelText("Descrição"), { target: { value: "  Prémio  " } });
    fireEvent.change(within(dialogo).getByLabelText("Valor (€)"), { target: { value: "-12,5" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fn.criar).toHaveBeenCalledWith({ pessoaId: "p1", descricao: "Prémio", valor: -12.5, codigoProcessamentoId: null }));
    expect(fn.sucesso).toHaveBeenCalledWith("Valor acrescentado.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sem descricao ou com valor zero/vazio nao chega a base", async () => {
    const dialogo = abrirDialogo();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Escreva uma descrição.");
    fireEvent.change(within(dialogo).getByLabelText("Descrição"), { target: { value: "Prémio" } });
    fireEvent.change(within(dialogo).getByLabelText("Valor (€)"), { target: { value: "0" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Escreva um valor diferente de zero.");
    fireEvent.change(within(dialogo).getByLabelText("Valor (€)"), { target: { value: "" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Escreva um valor diferente de zero.");
    expect(fn.criar).not.toHaveBeenCalled();
  });

  it("uma recusa da base fica no dialogo, que continua aberto, e nao diz que guardou", async () => {
    fn.criar.mockResolvedValue("O período já está fechado.");
    const dialogo = abrirDialogo();
    fireEvent.change(within(dialogo).getByLabelText("Descrição"), { target: { value: "Prémio" } });
    fireEvent.change(within(dialogo).getByLabelText("Valor (€)"), { target: { value: "25" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("O período já está fechado.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fn.sucesso).not.toHaveBeenCalled();
  });

  it("sem permissao de gerir valores pontuais nao ha botao para os acrescentar", () => {
    estado.permissoes = new Set(["hr.processamento.periodo.view"]);
    abrir();
    expect(screen.queryByRole("button", { name: /Acrescentar valor/ })).not.toBeInTheDocument();
  });

  it("lerValorPontual: virgula decimal, negativos aceites; vazio, texto e zero recusados", () => {
    expect(lerValorPontual("25")).toBe(25);
    expect(lerValorPontual(" 12,5 ")).toBe(12.5);
    expect(lerValorPontual("-3")).toBe(-3);
    for (const mau of ["", "  ", "0", "0,00", "abc", "1e999"]) expect(lerValorPontual(mau)).toBeNull();
  });
});

describe("«Como chegamos a este valor» e a anulacao", () => {
  const abrirDetalhe = (nome: RegExp = /Ana Real/) => {
    abrir();
    fireEvent.click(within(linhaDe(nome)).getByRole("button", { name: /Como chegámos a este valor/ }));
    return screen.getByRole("dialog");
  };

  it("mostra os passos reais: salario-base, valor da hora, desconto, pontuais e o total", () => {
    const dialogo = abrirDetalhe();
    for (const passo of ["Salário-base", "Valor da hora (deste mês)", "Desconto de faltas", "Lançamentos pontuais", "Total bruto estimado"]) {
      expect(within(dialogo).getByText(passo)).toBeInTheDocument();
    }
    expect(dialogo).toHaveTextContent(/7,5000 €/);
    expect(dialogo).toHaveTextContent(/−20,00/);
  });

  it("lista os valores pontuais da pessoa e deixa anular com motivo (RPC de anular)", async () => {
    const dialogo = abrirDetalhe();
    expect(dialogo).toHaveTextContent(/Prémio de equipa/);
    fireEvent.click(within(dialogo).getByRole("button", { name: /Anular\s*Prémio de equipa/ }));
    const anulacao = screen.getByRole("dialog");
    fireEvent.click(within(anulacao).getByRole("button", { name: "Anular" }));
    expect(await within(anulacao).findByRole("alert")).toHaveTextContent("Escreva o motivo da anulação.");
    expect(fn.anular).not.toHaveBeenCalled();
    fireEvent.change(within(anulacao).getByLabelText("Motivo da anulação"), { target: { value: "  Engano  " } });
    fireEvent.click(within(anulacao).getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(fn.anular).toHaveBeenCalledWith("l1", "Engano"));
    expect(fn.sucesso).toHaveBeenCalledWith("Lançamento anulado.");
  });

  it("uma recusa ao anular fica no dialogo", async () => {
    fn.anular.mockResolvedValue("Já está anulado.");
    const dialogo = abrirDetalhe();
    fireEvent.click(within(dialogo).getByRole("button", { name: /Anular\s*Prémio de equipa/ }));
    const anulacao = screen.getByRole("dialog");
    fireEvent.change(within(anulacao).getByLabelText("Motivo da anulação"), { target: { value: "Engano" } });
    fireEvent.click(within(anulacao).getByRole("button", { name: "Anular" }));
    expect(await within(anulacao).findByRole("alert")).toHaveTextContent("Já está anulado.");
    expect(fn.sucesso).not.toHaveBeenCalled();
  });

  it("com o periodo fechado ou sem permissao nao se pode anular", () => {
    estado.permissoes = new Set(["hr.processamento.periodo.view"]);
    const dialogo = abrirDetalhe();
    expect(within(dialogo).queryByRole("button", { name: /Anular/ })).not.toBeInTheDocument();
  });

  it("quem nao tem retribuicao ve o aviso do calculo, sem um valor inventado", () => {
    const dialogo = abrirDetalhe(/Bruno Real/);
    expect(dialogo).toHaveTextContent("Sem retribuição registada para este período.");
    expect(dialogo).toHaveTextContent("Sem valor");
    expect(dialogo).not.toHaveTextContent(/1.?000,00/);
  });

  it("sem permissao para ver retribuicoes o detalhe so diz isso", () => {
    estado.calculo = calculo({ retribuicoesHook: { recusado: true, estado: "recusado" } });
    const dialogo = abrirDetalhe();
    expect(dialogo).toHaveTextContent("Sem permissão para ver retribuições");
    expect(within(dialogo).queryByText("Salário-base")).not.toBeInTheDocument();
  });
});

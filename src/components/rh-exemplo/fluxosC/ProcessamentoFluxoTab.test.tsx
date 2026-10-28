// O separador «Calculo do mes» ligado ao processamento salarial REAL. O calculo partilhado (`useCalculoRealDoMes`) entra
// por argumento, por isso nao ha Supabase nem lojas de exemplo. Cobre: a tabela com as parcelas reais, o periodo
// (abrir, fechar, fechado, sem reabertura), os valores pontuais (criar e anular, com o erro do servidor a vista) e os
// avisos de permissao e de carregamento.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";

const fn = vi.hoisted(() => ({
  abrir: vi.fn(),
  fechar: vi.fn(),
  criar: vi.fn(),
  anular: vi.fn(),
  sucesso: vi.fn(),
  erro: vi.fn(),
}));
const estado = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  calculo: {} as Record<string, unknown>,
}));

vi.mock("@/lib/toast", () => ({ toast: { success: fn.sucesso, error: fn.erro } }));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (chave: string) => estado.permissoes.has(chave), loading: false }),
}));
vi.mock("@/components/rh-exemplo/processamento/useCalculoReal", () => ({
  useCalculoRealDoMes: () => estado.calculo,
  RecolhaDeAssiduidade: () => null,
}));

import { ProcessamentoFluxoTab } from "./ProcessamentoFluxoTab";
import { lerValorPontual } from "./PontualDialog";

const TUDO = ["hr.processamento.periodo.view", "hr.processamento.periodo.gerir", "hr.processamento.lancamentos.gerir"];

const resultado = (extra: Record<string, unknown> = {}) => ({
  valorHoraReal: 7.5, baseMes: 1000, divisorDuodecimos: 14, linhasAutomaticas: [], totalCodigosAutomaticos: 0,
  descontoFaltas: 0, subsidioAlimentacao: 0, lancamentosPontuais: 0, totalBrutoEstimado: 1000, avisos: [], ...extra,
});
const linha = (extra: Record<string, unknown> = {}, valorBase: number | null = 1000) => ({
  resultado: resultado(extra), valorBase, periodicidade: valorBase === null ? null : "mensal", mudouAMeioDoMes: false, totais: { planeadoMinutos: 9600 },
});

const ANA_LANCAMENTO = { id: "l1", periodo_id: "per", pessoa_id: "p1", descricao: "Prémio de equipa", valor: 30, anulado_em: null };

function calculo(extra: Record<string, unknown> = {}) {
  return {
    periodoHook: { periodo: { id: "per", estado: "aberto", fechado_em: null }, loading: false, saving: false, recusado: false, abrir: fn.abrir, fechar: fn.fechar },
    lancamentosHook: { saving: false, recusado: false, criar: fn.criar, anular: fn.anular, lancamentos: [] },
    retribuicoesHook: { recusado: false },
    resultados: new Map([
      ["p1", linha({ totalCodigosAutomaticos: 50, descontoFaltas: 20, subsidioAlimentacao: 110, lancamentosPontuais: 30, totalBrutoEstimado: 1170 })],
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
  estado.permissoes = new Set(TUDO);
  estado.calculo = calculo();
});
afterEach(cleanup);

describe("a tabela do calculo do mes", () => {
  it("uma linha por pessoa activa, com cada parcela real e o total do mes", () => {
    abrir();
    const cabecalhos = screen.getAllByRole("columnheader").map((c) => c.textContent);
    for (const nome of ["Pessoa", "Base do mês", "Códigos", "Faltas", "Subsídios", "Pontuais", "Total bruto"]) expect(cabecalhos).toContain(nome);
    expect(cabecalhos).not.toContain("Horas extra");
    const ana = celulas(linhaDe(/Ana Real/));
    expect(ana[0]).toMatch(/1.?000,00/);
    expect(ana[1]).toMatch(/50,00/);
    expect(ana[2]).toMatch(/[-−]20,00/);
    expect(ana[3]).toMatch(/110,00/);
    expect(ana[4]).toMatch(/30,00/);
    expect(ana[5]).toMatch(/1.?170,00/);
    expect(screen.getByText("Total bruto do mês").closest("tr")).toHaveTextContent(/1.?170,00/);
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
    estado.calculo = calculo({ retribuicoesHook: { recusado: true } });
    abrir();
    expect(screen.getByText(/Não tem permissão para ver as retribuições/)).toBeInTheDocument();
    const ana = celulas(linhaDe(/Ana Real/));
    expect(ana.slice(0, 4).every((c) => c.includes("—"))).toBe(true);
    expect(ana[5]).toBe("—");
    expect(screen.getByText("Total bruto do mês").closest("tr")).not.toHaveTextContent(/1.?170/);
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
    estado.calculo = calculo({ retribuicoesHook: { recusado: true } });
    const dialogo = abrirDetalhe();
    expect(dialogo).toHaveTextContent("Sem permissão para ver retribuições");
    expect(within(dialogo).queryByText("Salário-base")).not.toBeInTheDocument();
  });
});

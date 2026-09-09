/**
 * A conta de dias, a leitura dos dois passos, e o travao do minimo legal.
 *
 * Os tres sao o que a interface promete ao utilizador ANTES de a base
 * responder. Se um deles divergir do que a base faz, a pessoa ve um numero no
 * ecra e outro no pedido gravado -- e e esse desencontro que estes testes
 * guardam, nao a aritmetica em si.
 */
import { describe, expect, it } from "vitest";
import {
  MINIMO_LEGAL_DIAS,
  accoesDoPedido,
  avaliarAjuste,
  calcularPedido,
  chaveDoErroDeAusencia,
  dataMinimaDoTipo,
  efeitoNoSaldo,
  indexarFeriados,
  lerPedido,
  periodoDoDia,
  problemasDoPedido,
  sentidoObrigatorio,
} from "@/lib/hr/ausencias";
import type { AusenciaDecisao, AusenciaSaldo, AusenciaTipo } from "@/types/hrAusencias";

const TIPO_FERIAS: AusenciaTipo = {
  id: "tipo-ferias",
  organization_id: "org",
  codigo: "FERIAS",
  nome: "Ferias",
  descricao: null,
  categoria: "ferias",
  cor: "#2563eb",
  remunerada: true,
  desconta_saldo: true,
  conta_minimo_legal: true,
  exige_aprovacao_chefia: true,
  exige_aprovacao_rh: true,
  exige_justificacao: false,
  justificacao_sensivel: false,
  permite_meio_dia: true,
  inclui_fim_de_semana: false,
  inclui_feriados: false,
  antecedencia_minima_dias: 0,
  unidade_apresentacao: "dia",
  activo: true,
};

const saldo = (parcial: Partial<AusenciaSaldo>): AusenciaSaldo => ({
  pessoa_id: "p",
  organization_id: "org",
  tipo_id: "tipo-ferias",
  periodo_inicio: "2026-01-01",
  adquiridos: 22,
  ajustes: 0,
  utilizados: 0,
  pendentes: 0,
  disponiveis: 22,
  ...parcial,
});

describe("calcularPedido", () => {
  it("deixa de fora fins de semana e feriados quando o tipo os exclui", () => {
    // 2026-10-12 e uma segunda-feira; 17 e 18 sao sabado e domingo.
    const calculo = calcularPedido({
      dataInicio: "2026-10-12",
      dataFim: "2026-10-19",
      tipo: TIPO_FERIAS,
      feriados: indexarFeriados([{ holiday_date: "2026-10-14", is_recurring: false }]),
    });

    expect(calculo.diasCivis).toBe(8);
    expect(calculo.dias.map((dia) => dia.data)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-15",
      "2026-10-16",
      "2026-10-19",
    ]);
    expect(calculo.total).toBe(5);
  });

  it("conta tudo quando o tipo inclui fins de semana e feriados", () => {
    const calculo = calcularPedido({
      dataInicio: "2026-10-12",
      dataFim: "2026-10-19",
      tipo: { inclui_fim_de_semana: true, inclui_feriados: true },
      feriados: indexarFeriados([{ holiday_date: "2026-10-14", is_recurring: false }]),
    });
    expect(calculo.total).toBe(8);
  });

  it("apanha o feriado recorrente pelo mes e dia, como a base faz", () => {
    const indice = indexarFeriados([{ holiday_date: "2020-12-25", is_recurring: true }]);
    const calculo = calcularPedido({
      dataInicio: "2026-12-24",
      dataFim: "2026-12-25",
      tipo: TIPO_FERIAS,
      feriados: indice,
    });
    expect(calculo.dias.map((dia) => dia.data)).toEqual(["2026-12-24"]);
  });

  it("aplica o meio dia ao dia de INICIO e ao dia de FIM do pedido", () => {
    const calculo = calcularPedido({
      dataInicio: "2026-10-12",
      dataFim: "2026-10-14",
      tipo: TIPO_FERIAS,
      meioDiaInicio: true,
      meioDiaFim: true,
    });
    expect(calculo.dias.map((dia) => dia.fraccao)).toEqual([0.5, 1, 0.5]);
    expect(calculo.total).toBe(2);
  });

  it("reparte por dois periodos o pedido que atravessa o fim do periodo", () => {
    const periodos = [
      { periodo_inicio: "2026-01-01", periodo_fim: "2026-12-31" },
      { periodo_inicio: "2027-01-01", periodo_fim: "2027-12-31" },
    ];
    const calculo = calcularPedido({
      dataInicio: "2026-12-28",
      dataFim: "2027-01-04",
      tipo: TIPO_FERIAS,
      periodos,
    });
    expect(calculo.porPeriodo).toEqual([
      { periodoInicio: "2026-01-01", dias: 4 },
      { periodoInicio: "2027-01-01", dias: 2 },
    ]);
  });

  it("devolve zero quando o fim e anterior ao inicio", () => {
    const calculo = calcularPedido({
      dataInicio: "2026-10-20",
      dataFim: "2026-10-12",
      tipo: TIPO_FERIAS,
    });
    expect(calculo.total).toBe(0);
    expect(calculo.dias).toHaveLength(0);
  });
});

describe("periodoDoDia", () => {
  it("cai no ano civil quando nenhum direito cobre o dia, como a base", () => {
    expect(periodoDoDia("2026-05-03", [])).toBe("2026-01-01");
  });

  it("prefere o periodo mais recente que contem o dia", () => {
    const periodos = [
      { periodo_inicio: "2026-01-01", periodo_fim: "2026-12-31" },
      { periodo_inicio: "2026-04-01", periodo_fim: "2027-03-31" },
    ];
    expect(periodoDoDia("2026-05-03", periodos)).toBe("2026-04-01");
  });
});

describe("problemasDoPedido e antecedencia", () => {
  const base = {
    dataInicio: "2026-10-12",
    dataFim: "2026-10-13",
    meioDiaInicio: false,
    meioDiaFim: false,
    motivo: "",
    hoje: "2026-09-09",
  };

  it("nao aceita um intervalo sem nenhum dia contavel", () => {
    // 17 e 18 de Outubro de 2026 sao sabado e domingo.
    const calculo = calcularPedido({
      dataInicio: "2026-10-17",
      dataFim: "2026-10-18",
      tipo: TIPO_FERIAS,
    });
    const problemas = problemasDoPedido({
      ...base,
      tipo: TIPO_FERIAS,
      dataInicio: "2026-10-17",
      dataFim: "2026-10-18",
      calculo,
    });
    expect(problemas.map((p) => p.mensagemKey)).toContain("hr.ausencias.erro.semDiasContaveis");
  });

  it("trava a antecedencia minima antes de a base a travar", () => {
    const tipo = { ...TIPO_FERIAS, antecedencia_minima_dias: 15 };
    expect(dataMinimaDoTipo(tipo, "2026-09-09")).toBe("2026-09-24");
    const calculo = calcularPedido({ dataInicio: "2026-09-14", dataFim: "2026-09-15", tipo });
    const problemas = problemasDoPedido({
      ...base,
      tipo,
      dataInicio: "2026-09-14",
      dataFim: "2026-09-15",
      calculo,
    });
    expect(problemas.map((p) => p.mensagemKey)).toContain("hr.ausencias.erro.semAntecedencia");
  });

  it("recusa meio dia num tipo que nao o permite", () => {
    const tipo = { ...TIPO_FERIAS, permite_meio_dia: false };
    const calculo = calcularPedido({ ...base, tipo });
    const problemas = problemasDoPedido({ ...base, tipo, meioDiaInicio: true, calculo });
    expect(problemas.map((p) => p.mensagemKey)).toContain(
      "hr.ausencias.erro.meioDiaNaoPermitido",
    );
  });

  it("nao aponta problema nenhum a um pedido valido", () => {
    const calculo = calcularPedido({ ...base, tipo: TIPO_FERIAS });
    expect(problemasDoPedido({ ...base, tipo: TIPO_FERIAS, calculo })).toEqual([]);
  });

  it("exige motivo escrito num tipo que exige justificacao e NAO e sensivel", () => {
    const tipo = { ...TIPO_FERIAS, exige_justificacao: true, justificacao_sensivel: false };
    const calculo = calcularPedido({ ...base, tipo });
    const problemas = problemasDoPedido({ ...base, tipo, motivo: "", calculo });
    expect(problemas.map((p) => p.mensagemKey)).toContain("hr.ausencias.erro.semMotivo");
  });

  it("NAO exige motivo escrito num tipo sensivel -- a justificacao e o documento, nao o texto livre", () => {
    // O CHECK hr_ausencias_tipos_sensivel_exige_justificacao obriga
    // exige_justificacao=true sempre que justificacao_sensivel=true.
    const tipo = { ...TIPO_FERIAS, exige_justificacao: true, justificacao_sensivel: true };
    const calculo = calcularPedido({ ...base, tipo });
    const problemas = problemasDoPedido({ ...base, tipo, motivo: "", calculo });
    expect(problemas.map((p) => p.mensagemKey)).not.toContain("hr.ausencias.erro.semMotivo");
  });
});

describe("efeitoNoSaldo", () => {
  it("avisa quando o pedido ultrapassa o disponivel, sem o impedir", () => {
    const efeito = efeitoNoSaldo(saldo({ disponiveis: 2.5 }), 5);
    expect(efeito.disponiveisDepois).toBe(-2.5);
    expect(efeito.ultrapassa).toBe(true);
  });

  it("nao avisa quando o pedido cabe no disponivel", () => {
    expect(efeitoNoSaldo(saldo({ disponiveis: 10 }), 5).ultrapassa).toBe(false);
  });
});

describe("avaliarAjuste e o minimo legal", () => {
  it("bloqueia o ajuste que deixa o gozavel abaixo de vinte dias", () => {
    const avaliacao = avaliarAjuste({
      sentido: "retirar",
      diasAbsolutos: 4,
      saldo: saldo({ adquiridos: 22, ajustes: 0 }),
      contaMinimoLegal: true,
    });
    expect(avaliacao.dias).toBe(-4);
    expect(avaliacao.gozavelDepois).toBe(18);
    expect(avaliacao.violaMinimoLegal).toBe(true);
  });

  it("deixa passar o ajuste que fica exactamente no minimo legal", () => {
    const avaliacao = avaliarAjuste({
      sentido: "retirar",
      diasAbsolutos: 2,
      saldo: saldo({ adquiridos: 22 }),
      contaMinimoLegal: true,
    });
    expect(avaliacao.gozavelDepois).toBe(MINIMO_LEGAL_DIAS);
    expect(avaliacao.violaMinimoLegal).toBe(false);
  });

  it("desconta os dias ja vendidos ao calcular o gozavel", () => {
    // adquiridos = direito + positivos; ajustes liquido -3 significa 3 vendidos.
    const avaliacao = avaliarAjuste({
      sentido: "retirar",
      diasAbsolutos: 0.5,
      saldo: saldo({ adquiridos: 22, ajustes: -3 }),
      contaMinimoLegal: true,
    });
    expect(avaliacao.gozavelDepois).toBe(18.5);
    expect(avaliacao.violaMinimoLegal).toBe(true);
  });

  it("ignora o minimo legal num tipo que nao conta para ele", () => {
    const avaliacao = avaliarAjuste({
      sentido: "retirar",
      diasAbsolutos: 30,
      saldo: saldo({ adquiridos: 22 }),
      contaMinimoLegal: false,
    });
    expect(avaliacao.violaMinimoLegal).toBe(false);
  });

  it("marca o ajuste de zero dias, que a base recusa", () => {
    const avaliacao = avaliarAjuste({
      sentido: "acrescentar",
      diasAbsolutos: 0,
      saldo: saldo({}),
      contaMinimoLegal: true,
    });
    expect(avaliacao.eZero).toBe(true);
  });

  it("obriga a troca por dinheiro a ser sempre uma retirada", () => {
    expect(sentidoObrigatorio("troca_por_dinheiro")).toBe("retirar");
    expect(sentidoObrigatorio("premio")).toBeNull();
  });
});

describe("lerPedido: os dois passos", () => {
  const decisao = (parcial: Partial<AusenciaDecisao>): AusenciaDecisao => ({
    id: crypto.randomUUID(),
    pedido_id: "ped",
    pessoa_id: "p",
    organization_id: "org",
    ordem: 1,
    passo: "chefia",
    resultado: "aprovado",
    decidido_por_pessoa_id: "chefe",
    decidido_em: "2026-09-01T10:00:00Z",
    motivo: null,
    ajuste_data_inicio: null,
    ajuste_data_fim: null,
    ajuste_dias: null,
    ...parcial,
  });

  it("diz que a chefia esta aberta e o RH ainda nao chegou", () => {
    const leitura = lerPedido("pendente_chefia", []);
    expect(leitura.chefia.situacao).toBe("aberto");
    expect(leitura.rh.situacao).toBe("porChegar");
    expect(leitura.passoActual).toBe("chefia");
    expect(leitura.terminal).toBe(false);
  });

  it("mostra a chefia aprovada e o RH a espera", () => {
    const leitura = lerPedido("pendente_rh", [decisao({})]);
    expect(leitura.chefia.situacao).toBe("aprovado");
    expect(leitura.rh.situacao).toBe("aberto");
  });

  it("nao esconde um passo dispensado", () => {
    const leitura = lerPedido("aprovado", [
      decisao({ passo: "chefia", resultado: "dispensado", decidido_por_pessoa_id: null }),
      decisao({ passo: "rh", resultado: "aprovado" }),
    ]);
    expect(leitura.chefia.situacao).toBe("dispensado");
    expect(leitura.rh.situacao).toBe("aprovado");
    expect(leitura.terminal).toBe(true);
  });

  it("guarda a volta anterior depois de uma devolucao", () => {
    const leitura = lerPedido("pendente_rh", [
      decisao({ passo: "chefia", ordem: 1, resultado: "aprovado" }),
      decisao({ passo: "rh", ordem: 1, resultado: "devolvido", motivo: "faltam datas" }),
      decisao({ passo: "chefia", ordem: 2, resultado: "aprovado" }),
    ]);
    // A leitura da o ESTADO actual de cada passo; o historico completo fica na
    // lista, que o ecra mostra por inteiro.
    expect(leitura.chefia.decisao?.ordem).toBe(2);
    expect(leitura.rh.situacao).toBe("aberto");
  });
});

describe("accoesDoPedido", () => {
  const base = {
    souOAutor: false,
    podeAprovarChefia: false,
    podeAprovarRh: false,
    podeEditarHistorico: false,
    temChefiaResoluvel: true,
  };

  it("nao oferece nada a quem so pode ver", () => {
    const accoes = accoesDoPedido({ ...base, estado: "pendente_chefia" });
    expect(Object.values(accoes).some(Boolean)).toBe(false);
  });

  it("deixa quem fez o pedido cancelar enquanto esta pendente", () => {
    expect(accoesDoPedido({ ...base, estado: "pendente_chefia", souOAutor: true }).cancelar).toBe(
      true,
    );
    expect(accoesDoPedido({ ...base, estado: "aprovado", souOAutor: true }).cancelar).toBe(false);
  });

  it("esconde o devolver quando nao ha chefia para onde devolver", () => {
    const comChefia = accoesDoPedido({ ...base, estado: "pendente_rh", podeAprovarRh: true });
    const semChefia = accoesDoPedido({
      ...base,
      estado: "pendente_rh",
      podeAprovarRh: true,
      temChefiaResoluvel: false,
    });
    expect(comChefia.devolverAChefia).toBe(true);
    expect(semChefia.devolverAChefia).toBe(false);
  });

  it("so oferece corrigir um aprovado a quem pode editar o historico", () => {
    expect(
      accoesDoPedido({ ...base, estado: "aprovado", podeEditarHistorico: true }).corrigirAprovado,
    ).toBe(true);
    expect(accoesDoPedido({ ...base, estado: "aprovado" }).corrigirAprovado).toBe(false);
  });

  it("nao oferece accoes num pedido ja recusado", () => {
    const accoes = accoesDoPedido({
      ...base,
      estado: "recusado",
      podeAprovarRh: true,
      podeAprovarChefia: true,
      podeEditarHistorico: true,
    });
    expect(Object.values(accoes).some(Boolean)).toBe(false);
  });
});

describe("chaveDoErroDeAusencia", () => {
  it("reconhece o prefixo estavel no meio da mensagem do Postgres", () => {
    expect(
      chaveDoErroDeAusencia({
        message: 'ausencia_sem_dias_uteis: o intervalo de X a Y nao tem nenhum dia contavel',
      }),
    ).toBe("hr.ausencias.erroRpc.semDiasUteis");
  });

  it("reconhece a guarda do minimo legal", () => {
    expect(chaveDoErroDeAusencia({ message: "ferias_minimo_legal: o minimo legal e 20 dias" })).toBe(
      "hr.ausencias.erroRpc.minimoLegal",
    );
  });

  it("devolve null quando nao reconhece -- para o ecra reportar a falta", () => {
    expect(chaveDoErroDeAusencia({ message: "network timeout" })).toBeNull();
    expect(chaveDoErroDeAusencia(null)).toBeNull();
  });
});

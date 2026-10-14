import { describe, expect, it } from "vitest";
import {
  decidirJustificacaoFalta,
  descontoDaFalta,
  foraDoPrazoDeJustificar,
  prazoParaJustificar,
  registarJustificacao,
  rotuloDaJustificacao,
  sugestoesDeFalta,
  totalDeDescontos,
  valorHoraDeExemplo,
  validarMarcacaoFalta,
  type ContextoFalta,
  type FaltaParaDesconto,
} from "@/components/rh-exemplo/lib/faltasB";
import type { AlertaDia } from "@/components/rh-exemplo/lib/alertasFimDia";

const vazio: ContextoFalta = { realizado: [], faltas: [], ausencias: [] };
const periodo = { data: "2026-12-10", inicio: "14:00", fim: "18:00" };

describe("marcar falta: periodo e motivo", () => {
  it("sem data ou horas recusa", () => {
    expect(validarMarcacaoFalta({ ...periodo, data: "" }, "Nao veio", vazio)).toEqual({ ok: false, erro: "rhExemplo.fal.erro.semPeriodo" });
    expect(validarMarcacaoFalta({ ...periodo, inicio: "" }, "Nao veio", vazio)).toEqual({ ok: false, erro: "rhExemplo.fal.erro.semPeriodo" });
  });

  it("hora de fim que nao e depois da de inicio recusa", () => {
    expect(validarMarcacaoFalta({ ...periodo, fim: "14:00" }, "Nao veio", vazio)).toEqual({ ok: false, erro: "rhExemplo.fal.erro.fimAntesInicio" });
  });

  it("motivo com menos de 3 caracteres recusa", () => {
    expect(validarMarcacaoFalta(periodo, " ab ", vazio)).toEqual({ ok: false, erro: "rhExemplo.fal.erro.motivoCurto" });
  });

  it("periodo livre grava, sem avisos", () => {
    expect(validarMarcacaoFalta(periodo, "Nao veio", vazio)).toEqual({ ok: true, avisos: [] });
  });
});

describe("marcar falta: cruzamentos (a mensagem diz qual)", () => {
  it("cruza tempo trabalhado recusa e diz o periodo trabalhado (14:00-18:00 contra 14:00-15:10)", () => {
    const contexto = { ...vazio, realizado: [{ data: periodo.data, hora_inicio: "14:00:00", hora_fim: "15:10:00" }] };
    expect(validarMarcacaoFalta(periodo, "Nao veio", contexto)).toEqual({ ok: false, erro: "rhExemplo.fal.erro.tempo_trabalhado", detalhe: "14:00-15:10" });
  });

  it("o resto do periodo, depois do tempo trabalhado, grava (15:10-18:00)", () => {
    const contexto = { ...vazio, realizado: [{ data: periodo.data, hora_inicio: "14:00:00", hora_fim: "15:10:00" }] };
    expect(validarMarcacaoFalta({ ...periodo, inicio: "15:10" }, "Nao veio", contexto).ok).toBe(true);
  });

  it("tempo trabalhado noutro dia nao cruza", () => {
    const contexto = { ...vazio, realizado: [{ data: "2026-12-09", hora_inicio: "14:00:00", hora_fim: "18:00:00" }] };
    expect(validarMarcacaoFalta(periodo, "Nao veio", contexto).ok).toBe(true);
  });

  it("cruza outra falta ativa recusa; uma anulada nao conta", () => {
    const ativa = { ...vazio, faltas: [{ data: periodo.data, hora_inicio: "13:00", hora_fim: "15:00", estado: "activa" as const }] };
    expect(validarMarcacaoFalta(periodo, "Nao veio", ativa)).toEqual({ ok: false, erro: "rhExemplo.fal.erro.outra_falta", detalhe: "13:00-15:00" });
    const anulada = { ...vazio, faltas: [{ data: periodo.data, hora_inicio: "13:00", hora_fim: "15:00", estado: "anulada" as const }] };
    expect(validarMarcacaoFalta(periodo, "Nao veio", anulada).ok).toBe(true);
  });

  it("falta encostada a outra (18:00 a 19:00 depois de 14:00-18:00) nao cruza", () => {
    const ativa = { ...vazio, faltas: [{ data: periodo.data, hora_inicio: "14:00", hora_fim: "18:00", estado: "activa" as const }] };
    expect(validarMarcacaoFalta({ ...periodo, inicio: "18:00", fim: "19:00" }, "Nao veio", ativa).ok).toBe(true);
  });

  it("ausencia aprovada de dia inteiro recusa", () => {
    const contexto = { ...vazio, ausencias: [{ data: periodo.data, fraccao_dia: 1, estado: "aprovado" }] };
    expect(validarMarcacaoFalta(periodo, "Nao veio", contexto)).toMatchObject({ ok: false, erro: "rhExemplo.fal.erro.ausencia_dia_inteiro" });
  });

  it("meio dia de ausencia: invadir a metade coberta recusa, a outra metade grava com aviso", () => {
    const contexto = { ...vazio, ausencias: [{ data: periodo.data, fraccao_dia: 0.5, estado: "aprovado" }] };
    expect(validarMarcacaoFalta({ ...periodo, inicio: "09:00", fim: "12:00" }, "Nao veio", contexto)).toMatchObject({ ok: false, erro: "rhExemplo.fal.erro.ausencia_meio_dia" });
    expect(validarMarcacaoFalta(periodo, "Nao veio", contexto)).toEqual({ ok: true, avisos: ["rhExemplo.fal.aviso.outraMetade"] });
  });

  it("ausencia ainda pendente grava com aviso", () => {
    const contexto = { ...vazio, ausencias: [{ data: periodo.data, fraccao_dia: 1, estado: "pendente_chefia" }] };
    expect(validarMarcacaoFalta(periodo, "Nao veio", contexto)).toEqual({ ok: true, avisos: ["rhExemplo.fal.aviso.ausenciaPendente"] });
  });
});

describe("sugestoes (o sistema so sugere)", () => {
  const alerta = (campos: Partial<AlertaDia> = {}): AlertaDia => ({
    id: "al1", pessoaId: "p1", data: periodo.data, tipo: "planeado_sem_realizado", horaInicio: "14:00:00", horaFim: "18:00:00",
    minutos: 240, distanciaM: null, estado: "pendente", motivo: null, tratadoPor: null, tratadoEm: null, ...campos,
  });

  it("um periodo planeado sem nada feito sugere o periodo inteiro", () => {
    expect(sugestoesDeFalta([alerta()], [])).toEqual([{ alertaId: "al1", pessoaId: "p1", data: periodo.data, inicio: "14:00", fim: "18:00", minutos: 240 }]);
  });

  it("nao sugere para outros tipos, alertas tratados, sem minutos, nem se ja ha falta ativa nesse periodo", () => {
    const faltas = [{ pessoa_id: "p1", data: periodo.data, hora_inicio: "14:00", hora_fim: "18:00", estado: "activa" as const }];
    expect(sugestoesDeFalta([alerta({ tipo: "realizado_sem_planeado" })], [])).toEqual([]);
    expect(sugestoesDeFalta([alerta({ estado: "aceite" })], [])).toEqual([]);
    expect(sugestoesDeFalta([alerta({ minutos: 0 })], [])).toEqual([]);
    expect(sugestoesDeFalta([alerta()], faltas)).toEqual([]);
  });

  it("parcialmente realizado tambem sugere", () => {
    expect(sugestoesDeFalta([alerta({ tipo: "parcialmente_realizado" })], [])).toHaveLength(1);
  });
});

describe("justificacao com prazo da organizacao", () => {
  it("o prazo conta dias uteis a partir do dia da falta (quinta 10/12 + 5 = quinta 17/12)", () => {
    expect(prazoParaJustificar("2026-12-10", 5)).toBe("2026-12-17");
    expect(prazoParaJustificar("2026-12-10", 2)).toBe("2026-12-14");
    expect(foraDoPrazoDeJustificar("2026-12-10", "2026-12-17", 5)).toBe(false);
    expect(foraDoPrazoDeJustificar("2026-12-10", "2026-12-18", 5)).toBe(true);
  });

  it("dentro do prazo fica pendente de documento; fora do prazo fica sem justificacao", () => {
    const falta = { data: "2026-12-10", estado: "activa" as const };
    expect(registarJustificacao(falta, { texto: "Consulta medica", hoje: "2026-12-11", prazoDias: 5 })).toEqual({ ok: true, estado: "pendente_documento", foraDoPrazo: false });
    expect(registarJustificacao(falta, { texto: "Consulta medica", hoje: "2026-12-30", prazoDias: 5 })).toEqual({ ok: true, estado: "sem_justificacao", foraDoPrazo: true });
  });

  it("sem texto, ou sobre uma falta anulada, recusa", () => {
    expect(registarJustificacao({ data: "2026-12-10", estado: "activa" }, { texto: " ", hoje: "2026-12-11", prazoDias: 5 })).toEqual({ ok: false, erro: "rhExemplo.fal.erro.semTexto" });
    expect(registarJustificacao({ data: "2026-12-10", estado: "anulada" }, { texto: "abc", hoje: "2026-12-11", prazoDias: 5 })).toEqual({ ok: false, erro: "rhExemplo.fal.erro.faltaAnulada" });
  });

  it("o estado mostra os quatro estados do documento", () => {
    expect(rotuloDaJustificacao({ justificacao_estado: "sem_justificacao", remunerada: false })).toBe("sem_justificacao");
    expect(rotuloDaJustificacao({ justificacao_estado: "pendente_documento", remunerada: false })).toBe("pendente_documento");
    expect(rotuloDaJustificacao({ justificacao_estado: "justificada", remunerada: true })).toBe("justificada_paga");
    expect(rotuloDaJustificacao({ justificacao_estado: "justificada", remunerada: false })).toBe("justificada_nao_paga");
    expect(rotuloDaJustificacao({ justificacao_estado: "recusada", remunerada: false })).toBe("recusada");
  });

  const pendente = { estado: "activa" as const, justificacao_estado: "pendente_documento" as const };

  it("o RH justifica como paga ou nao paga", () => {
    const paga = decidirJustificacaoFalta(pendente, "justificada_paga", "");
    expect(paga.ok && paga.patch).toMatchObject({ justificacao_estado: "justificada", justificada: true, remunerada: true });
    const naoPaga = decidirJustificacaoFalta(pendente, "justificada_nao_paga", "Sem direito a pagamento");
    expect(naoPaga.ok && naoPaga.patch).toMatchObject({ justificada: true, remunerada: false, justificacao_motivo: "Sem direito a pagamento" });
  });

  it("recusar exige motivo, e fica com o motivo escrito", () => {
    expect(decidirJustificacaoFalta(pendente, "recusada", " ")).toEqual({ ok: false, erro: "rhExemplo.fal.erro.motivoCurto" });
    const recusada = decidirJustificacaoFalta(pendente, "recusada", "Documento ilegivel");
    expect(recusada.ok && recusada.patch).toMatchObject({ justificacao_estado: "recusada", justificada: false, remunerada: false, justificacao_motivo: "Documento ilegivel" });
  });

  it("so se decide uma falta ativa e pendente de documento", () => {
    expect(decidirJustificacaoFalta({ estado: "anulada", justificacao_estado: "pendente_documento" }, "justificada_paga", "")).toEqual({ ok: false, erro: "rhExemplo.fal.erro.faltaAnulada" });
    expect(decidirJustificacaoFalta({ estado: "activa", justificacao_estado: "sem_justificacao" }, "justificada_paga", "")).toEqual({ ok: false, erro: "rhExemplo.fal.erro.naoPendente" });
  });
});

describe("desconto de vencimento", () => {
  const falta = (campos: Partial<FaltaParaDesconto> = {}): FaltaParaDesconto => ({
    minutos: 240, estado: "activa", justificacao_estado: "sem_justificacao", remunerada: false, motivo_codigo: "ausencia_nao_comunicada", ...campos,
  });

  it("valor da hora de exemplo: 1000 / (40 x 4) = 6,25", () => {
    expect(valorHoraDeExemplo(1000, 40)).toBe(6.25);
    expect(valorHoraDeExemplo(1000, 0)).toBe(0);
  });

  it("falta sem justificacao desconta (4 h x 6,25 = 25,00)", () => {
    expect(descontoDaFalta(falta(), 6.25)).toEqual({ desconta: true, minutos: 240, valor: 25, razao: "sem_justificacao", provisorio: false });
  });

  it("justificada E paga nao desconta (0,00)", () => {
    expect(descontoDaFalta(falta({ justificacao_estado: "justificada", remunerada: true }), 6.25)).toMatchObject({ desconta: false, valor: 0, razao: "justificada_paga" });
  });

  it("justificada mas NAO paga desconta", () => {
    expect(descontoDaFalta(falta({ justificacao_estado: "justificada", remunerada: false }), 6.25)).toMatchObject({ desconta: true, valor: 25, razao: "justificada_nao_paga" });
  });

  it("recusada desconta; pendente de documento desconta de forma provisoria", () => {
    expect(descontoDaFalta(falta({ justificacao_estado: "recusada" }), 6.25)).toMatchObject({ desconta: true, razao: "recusada", provisorio: false });
    expect(descontoDaFalta(falta({ justificacao_estado: "pendente_documento" }), 6.25)).toMatchObject({ desconta: true, razao: "pendente_documento", provisorio: true });
  });

  it("atraso: 5 minutos esta na tolerancia e nao desconta; 12 minutos desconta 12/60 x 6,25 = 1,25", () => {
    expect(descontoDaFalta(falta({ motivo_codigo: "atraso", minutos: 5 }), 6.25)).toMatchObject({ desconta: false, razao: "atraso_dentro_tolerancia" });
    expect(descontoDaFalta(falta({ motivo_codigo: "atraso", minutos: 12 }), 6.25)).toMatchObject({ desconta: true, minutos: 12, valor: 1.25 });
  });

  it("falta anulada ou corrigida nao conta", () => {
    expect(descontoDaFalta(falta({ estado: "anulada" }), 6.25)).toMatchObject({ desconta: false, razao: "anulada" });
    expect(descontoDaFalta(falta({ estado: "corrigida" }), 6.25)).toMatchObject({ desconta: false, valor: 0 });
  });

  it("o total soma so o que desconta (25,00 + 1,25)", () => {
    const todas = [falta(), falta({ motivo_codigo: "atraso", minutos: 12 }), falta({ justificacao_estado: "justificada", remunerada: true })];
    expect(totalDeDescontos(todas, 6.25)).toBe(26.25);
    expect(totalDeDescontos([], 6.25)).toBe(0);
  });
});

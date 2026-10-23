// O que o calendario da pessoa decide, sem ecra: feriados, o previsto de um dia por tipo de horario (e excepcao,
// ausencia, contrato), a diferenca do dia (atraso, falta, hora extra, banco) e os totais do mes.
import { describe, expect, it } from "vitest";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import { configInicial, type ExcecaoDia, type HorarioPessoa, type TipoHorario } from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioRealizado } from "@/components/rh-exemplo/tipos";
import type { Falta } from "@/components/rh-exemplo/tiposAssiduidade";
import { diferencaDoDia, type ArgsDiferenca } from "./diferenca";
import { feriadoDe, feriadosDoAno, pascoa } from "./feriados";
import { duracao, duracaoComSinal, intervalosTexto } from "./formatos";
import { montarMes, type EntradaMes } from "./montarMes";
import { periodosDoPrevisto, resolverPrevistoDoDia, type ContextoPrevisto } from "./previsto";
import { totaisDoMes } from "./totaisMes";

const horarioDe = (tipo: TipoHorario, excecoes: ExcecaoDia[] = []): HorarioPessoa => ({
  versoes: [{ id: "v", config: configInicial(tipo), desde: "2000-01-01", ate: null, motivo: "", anexoNome: null, autor: "", criadaEm: "", corrigeId: null, correccao: false, autorizadaPor: null, substituidaPor: null }],
  excecoes,
});
const ctx = (tipo: TipoHorario, extra: Partial<ContextoPrevisto> = {}): ContextoPrevisto => ({ horario: horarioDe(tipo), contrato: null, ausencias: new Map(), ...extra });
// 2026-09-01 e terca-feira; 2026-09-05 e sabado; 2026-10-05 e segunda-feira (feriado).
const SEGUNDA = "2026-09-07";
const TERCA = "2026-09-01";
const SABADO = "2026-09-05";

describe("feriados nacionais", () => {
  it("calcula a Pascoa e os feriados moveis", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(feriadoDe("2026-04-03")).toBe("sextaSanta");
    expect(feriadoDe("2026-06-04")).toBe("corpoDeus");
  });
  it("tem os fixos e nao tem nenhum em Setembro", () => {
    expect(feriadoDe("2026-10-05")).toBe("republica");
    expect(feriadoDe("2026-12-25")).toBe("natal");
    expect(feriadosDoAno(2026).size).toBe(13);
    for (let d = 1; d <= 30; d += 1) expect(feriadoDe(`2026-09-${String(d).padStart(2, "0")}`)).toBeNull();
  });
});

describe("o previsto de um dia por tipo de horario", () => {
  it("padrao: um intervalo com pausa, que se parte em dois periodos", () => {
    const p = resolverPrevistoDoDia(ctx("padrao"), SEGUNDA);
    expect(p).toMatchObject({ kind: "trabalha", tipo: "padrao", minutos: 480, pausaMin: 60, intervalos: [{ inicio: "09:00", fim: "18:00" }] });
    expect(periodosDoPrevisto(p)).toEqual([{ ini: 540, fim: 780 }, { ini: 840, fim: 1080 }]);
    expect(resolverPrevistoDoDia(ctx("padrao"), SABADO).kind).toBe("nao_trabalha");
  });
  it("repartido: dois periodos", () => {
    const p = resolverPrevistoDoDia(ctx("repartido"), TERCA);
    expect(p).toMatchObject({ kind: "trabalha", tipo: "repartido", minutos: 480 });
    expect(intervalosTexto(p.intervalos)).toBe("11:00–15:00 · 19:00–23:00");
    expect(resolverPrevistoDoDia(ctx("repartido"), SEGUNDA).kind).toBe("nao_trabalha");
  });
  it("isencao: sem horas fixas, com o rateio da semana", () => {
    expect(resolverPrevistoDoDia(ctx("isencao"), SEGUNDA)).toMatchObject({ kind: "trabalha", semHorasFixas: true, minutos: 480, intervalos: [] });
  });
  it("livre: nada por dia, o total da semana reparte-se so para as somas", () => {
    expect(resolverPrevistoDoDia(ctx("livre"), SEGUNDA)).toMatchObject({ kind: "trabalha", semHorasFixas: true, minutos: 0, minutosParaTotais: 480, horasSemanais: 40 });
  });
  it("banco de horas: como o padrao, com o tipo certo", () => {
    expect(resolverPrevistoDoDia(ctx("banco"), SEGUNDA)).toMatchObject({ kind: "trabalha", tipo: "banco", minutos: 480 });
  });
  it("uma excepcao de um dia substitui o horario desse dia", () => {
    const excecao: ExcecaoDia = { id: "e", data: SEGUNDA, dia: { trabalha: true, entrada: "10:00", saida: "15:00", pausaMin: 0 }, motivo: "Consulta", autor: "", criadaEm: "" };
    const p = resolverPrevistoDoDia({ ...ctx("padrao"), horario: horarioDe("padrao", [excecao]) }, SEGUNDA);
    expect(p).toMatchObject({ kind: "trabalha", porExcecao: true, minutos: 300, pausaMin: 0 });
    const folga: ExcecaoDia = { ...excecao, dia: { ...excecao.dia, trabalha: false } };
    expect(resolverPrevistoDoDia({ ...ctx("padrao"), horario: horarioDe("padrao", [folga]) }, SEGUNDA).kind).toBe("nao_trabalha");
  });
  it("feriado e ausencia aprovada tiram as horas do dia, mas o horario continua a contar", () => {
    const feriado = resolverPrevistoDoDia(ctx("padrao"), "2026-10-05");
    expect(feriado).toMatchObject({ kind: "feriado", feriado: "republica", minutos: 0, minutosHorario: 480 });
    const ferias = new Map([[SEGUNDA, { nome: "Férias", fraccao: 1 }]]);
    expect(resolverPrevistoDoDia(ctx("padrao", { ausencias: ferias }), SEGUNDA)).toMatchObject({ kind: "ausencia", minutos: 0, minutosHorario: 480 });
    const meio = new Map([[SEGUNDA, { nome: "Férias", fraccao: 0.5 }]]);
    expect(resolverPrevistoDoDia(ctx("padrao", { ausencias: meio }), SEGUNDA)).toMatchObject({ kind: "trabalha", minutos: 240 });
  });
  it("fora do contrato ou sem horario nao ha previsto", () => {
    const contrato = { desde: "2026-09-10", ate: null };
    expect(resolverPrevistoDoDia(ctx("padrao", { contrato }), SEGUNDA).kind).toBe("sem_contrato");
    expect(resolverPrevistoDoDia(ctx("padrao", { contrato: { desde: "2020-01-01", ate: "2026-09-04" } }), SEGUNDA).kind).toBe("sem_contrato");
    expect(resolverPrevistoDoDia({ horario: undefined, contrato: null, ausencias: new Map() }, SEGUNDA).kind).toBe("sem_horario");
  });
});

const normal = [{ inicio: "09:00", fim: "13:00" }, { inicio: "14:00", fim: "18:00" }];
const falta = (min: number, p: Partial<Falta> = {}): Falta => ({
  id: "f", pessoa_id: "p", organization_id: "o", data: SEGUNDA, planeado_id: null, vinculo_id: null, local_id: null, hora_inicio: "09:00", hora_fim: "09:20", minutos: min,
  motivo_codigo: "atraso", justificacao_estado: "sem_justificacao", justificada: false, remunerada: false, desconta_saldo: false, justificacao_decidida_por: null,
  justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null, corrige_falta_id: null, correccao_motivo: null, estado: "activa", anulado_em: null,
  anulacao_motivo: null, created_at: "", ...p,
});
const hExtra = (min: number, p: Partial<HoraExtra> = {}): HoraExtra => ({
  id: "h", pessoaId: "p", data: SEGUNDA, minutos: min, nocturnoMin: 0, origem: "diaria", motivoOrigem: "", estado: "pendente", acimaDoLimite: false, motivoDecisao: null, decididoPor: null, ...p,
});
const dia = (tipo: TipoHorario, p: Partial<ArgsDiferenca>): ReturnType<typeof diferencaDoDia> =>
  diferencaDoDia({ previsto: resolverPrevistoDoDia(ctx(tipo), SEGUNDA), feitos: normal, faltas: [], horasExtra: [], banco: [], podeHE: true, foraDoLocal: false, passado: true, ...p });
const tipos = (r: ReturnType<typeof diferencaDoDia>): string[] => r.chips.map((c) => c.tipo);

describe("a diferenca do dia", () => {
  it("um dia certo nao tem diferenca nem chips", () => {
    expect(dia("padrao", {})).toMatchObject({ feitoMin: 480, deltaMin: 0, atrasoMin: 0, chips: [] });
  });
  it("um atraso so conta acima da tolerancia de 5 minutos", () => {
    const dentro = dia("padrao", { feitos: [{ inicio: "09:05", fim: "13:00" }, normal[1]] });
    expect(dentro).toMatchObject({ atrasoMin: 5, deltaMin: -5, chips: [] });
    const fora = dia("padrao", { feitos: [{ inicio: "09:12", fim: "13:00" }, normal[1]] });
    expect(tipos(fora)).toEqual(["atraso", "falta_sugerida"]);
    expect(fora.chips[1].minutos).toBe(12);
  });
  it("com a falta marcada deixa de ser sugerida", () => {
    const r = dia("padrao", { feitos: [{ inicio: "09:20", fim: "13:00" }, normal[1]], faltas: [falta(20)] });
    expect(tipos(r)).toEqual(["atraso", "falta_marcada"]);
    expect(r.chips[1].justificacao).toBe("sem_justificacao");
  });
  it("uma manha em falta nao e atraso da tarde", () => {
    const r = dia("padrao", { feitos: [normal[1]], faltas: [falta(240, { hora_fim: "13:00", motivo_codigo: "doenca" })] });
    expect(r.atrasoMin).toBe(0);
    expect(tipos(r)).toEqual(["falta_marcada"]);
  });
  it("tempo a mais: sem marca, abaixo do minimo e por registar; com registo mostra o estado", () => {
    const mais = (min: number) => [normal[0], { inicio: "14:00", fim: `${String(18 + Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}` }];
    expect(dia("padrao", { feitos: mais(90), podeHE: false }).chips[0]).toMatchObject({ tipo: "tempo_a_mais", motivo: "sem_marca", minutos: 90 });
    expect(dia("padrao", { feitos: mais(10) }).chips[0]).toMatchObject({ tipo: "tempo_a_mais", motivo: "abaixo_minimo" });
    expect(dia("padrao", { feitos: mais(70) }).chips[0]).toMatchObject({ tipo: "tempo_a_mais", motivo: "por_registar", minutos: 70 });
    const pendente = dia("padrao", { feitos: mais(70), horasExtra: [hExtra(70)] });
    expect(pendente.chips).toEqual([expect.objectContaining({ tipo: "extra", estado: "pendente", minutos: 70 })]);
    const acima = dia("padrao", { feitos: mais(70), horasExtra: [hExtra(70, { acimaDoLimite: true })] });
    expect(acima.chips[0].estado).toBe("acima_limite");
    expect(dia("padrao", { feitos: mais(70), horasExtra: [hExtra(70, { estado: "rejeitada" })] }).chips[0].estado).toBe("rejeitada");
    expect(dia("padrao", { feitos: mais(70), horasExtra: [hExtra(70, { estado: "confirmada" })] }).chips[0].estado).toBe("confirmada");
  });
  it("banco de horas: o que sobra e credito e o que falta e debito, nunca falta nem hora extra", () => {
    const credito = dia("banco", { feitos: [normal[0], { inicio: "14:00", fim: "19:00" }], banco: [{ id: "b", pessoaId: "p", data: SEGUNDA, minutos: 60, motivo: "", origem: "automatico" }] });
    expect(tipos(credito)).toEqual(["banco_credito"]);
    expect(tipos(dia("banco", { feitos: [normal[0]] }))).toEqual([]);
  });
  it("horario livre e isencao nao tem diferenca por dia", () => {
    expect(dia("livre", {}).deltaMin).toBeNull();
    expect(dia("isencao", { feitos: [] }).deltaMin).toBeNull();
  });
  it("so se julga um dia que ja passou", () => {
    const hoje = dia("padrao", { feitos: [normal[0]], passado: false });
    expect(hoje.deltaMin).toBeNull();
    expect(hoje.chips).toEqual([]);
  });
  it("trabalhar num feriado e estar fora do local tem o seu chip", () => {
    const feriado = diferencaDoDia({ previsto: resolverPrevistoDoDia(ctx("padrao"), "2026-10-05"), feitos: [{ inicio: "09:00", fim: "11:00" }], faltas: [], horasExtra: [], banco: [], podeHE: true, foraDoLocal: true, passado: true });
    expect(tipos(feriado)).toEqual(["trabalho_em_folga", "fora_local"]);
  });
});

describe("formatos", () => {
  it("duracao em horas e minutos", () => {
    expect(duracao(70)).toBe("1 h 10 min");
    expect(duracao(120)).toBe("2 h");
    expect(duracao(45)).toBe("45 min");
    expect(duracaoComSinal(-40)).toBe("−40 min");
    expect(duracaoComSinal(70)).toBe("+1 h 10 min");
  });
});

const linhaFeita = (data: string, ini: string, fim: string): HorarioRealizado => ({
  id: `${data}-${ini}`, pessoa_id: "p", organization_id: "o", vinculo_id: null, local_id: null, planeado_id: null, data, hora_inicio: ini, hora_fim: fim,
  minutos: (Number(fim.slice(0, 2)) - Number(ini.slice(0, 2))) * 60, origem: "picagem", estado: "validado", validado_por: null, validado_em: null, motivo_rejeicao: null, notas: null,
});

function mesDe(tipo: TipoHorario, hoje: string, p: Partial<EntradaMes> = {}) {
  const realizado: HorarioRealizado[] = [];
  for (let d = 1; d <= 30; d += 1) {
    const data = `2026-09-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${data}T00:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5 && data < hoje) realizado.push(linhaFeita(data, "09:00", "13:00"), linhaFeita(data, "14:00", "18:00"));
  }
  return montarMes({
    ano: 2026, mes: 9, hoje, horario: horarioDe(tipo), contrato: null, ausencias: new Map(), realizado, picagens: [], faltas: [], horasExtra: [], banco: [],
    podeHE: true, diasForaDoLocal: new Set(), ...p,
  });
}

describe("os totais do mes", () => {
  it("um mes certo: previsto, feito e planeado batem com a soma dos dias", () => {
    const dias = mesDe("padrao", "2026-10-01");
    expect(dias).toHaveLength(30);
    const t = totaisDoMes(dias, { minimoSubsidioMin: 240 });
    expect(t.horasPlaneadasMin).toBe(22 * 480);
    expect(t.previstoMin).toBe(22 * 480);
    expect(t.feitoMin).toBe(dias.reduce((s, d) => s + d.feitoMin, 0));
    expect(t.feitoMin).toBe(t.previstoMin);
    expect(t.diasElegiveisSubsidio).toBe(22);
    expect(t).toMatchObject({ extraMin: 0, faltasMin: 0, emBanco: false, bancoSaldoMin: null });
  });
  it("so conta ate ontem e, na isencao, presume o previsto", () => {
    const hoje = "2026-09-15";
    const t = totaisDoMes(mesDe("padrao", hoje), { minimoSubsidioMin: 240 });
    expect(t.previstoMin).toBe(10 * 480);
    expect(t.horasPlaneadasMin).toBe(22 * 480);
    const isencao = totaisDoMes(mesDe("isencao", "2026-10-01", { realizado: [] }), { minimoSubsidioMin: 240 });
    expect(isencao.feitoMin).toBe(22 * 480);
    expect(isencao.diasElegiveisSubsidio).toBe(22);
  });
  it("horas extra pendentes e confirmadas somam; as rejeitadas nao", () => {
    const he = [hExtra(60, { data: "2026-09-03" }), hExtra(90, { data: "2026-09-04", estado: "confirmada" }), hExtra(30, { data: "2026-09-08", estado: "rejeitada" })];
    const t = totaisDoMes(mesDe("padrao", "2026-10-01", { horasExtra: he }), { minimoSubsidioMin: 240 });
    expect(t).toMatchObject({ extraPendenteMin: 60, extraConfirmadaMin: 90, extraRejeitadaMin: 30, extraMin: 150 });
  });
  it("so o banco de horas tem saldo", () => {
    expect(totaisDoMes(mesDe("padrao", "2026-10-01"), { minimoSubsidioMin: 240, bancoSaldoMin: 300 }).bancoSaldoMin).toBeNull();
    const banco = totaisDoMes(mesDe("banco", "2026-10-01"), { minimoSubsidioMin: 240, bancoSaldoMin: 300 });
    expect(banco).toMatchObject({ emBanco: true, bancoSaldoMin: 300 });
  });
});

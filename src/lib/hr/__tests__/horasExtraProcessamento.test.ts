/**
 * As horas extra aprovadas no processamento e no fecho: os minutos confirmados por ORIGEM entram nos escalões da regra salarial
 * (diaria e semanal = dia util, feriado, descanso), a fonte fica nas linhas, e o fecho confere a assinatura de cada pessoa.
 * Tudo puro ou com a RPC simulada: sem base nem React.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calcularProcessamentoPessoa,
  type EntradaProcessamentoPessoa,
  type RegraParaCalculo,
} from "@/lib/hr/processamentoTotais";
import { pessoasComHorasExtraMudadas, prepararFechoComHorasExtra } from "@/lib/hr/horasExtraFecho";
import { extraDoDia } from "@/lib/hr/horasExtraRelatorio";
import type { HrCodigoProcessamento } from "@/types/hr";

// A RPC simulada e uma funcao simples (um `vi.fn` que devolve uma promessa rejeitada da erro de «rejeicao nao tratada» ao vitest).
const rpcFalsa = vi.hoisted(() => ({
  comportamento: async (): Promise<Map<string, string>> => new Map(),
  chamadas: [] as unknown[][],
  doPeriodo: async (): Promise<{ aprovacaoDesde: string | null; linhas: unknown[]; assinatura: string | null }> => ({ aprovacaoDesde: null, linhas: [], assinatura: null }),
}));
vi.mock("@/lib/hr/horasExtraContagemRpc", () => ({
  lerAssinaturasDeHorasExtra: (...args: unknown[]) => {
    rpcFalsa.chamadas.push(args);
    return rpcFalsa.comportamento();
  },
  lerHorasExtraDoPeriodo: (...args: unknown[]) => {
    rpcFalsa.chamadas.push(["do_periodo", ...args]);
    return rpcFalsa.doPeriodo();
  },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (chave: string) => `texto:${chave}` }));

/** Um erro da base (o cliente lanca o `error` do PostgREST tal como veio). */
const erroDaBase = (code: string, message: string): Error => Object.assign(new Error(message), { code });

const REGRA: RegraParaCalculo = {
  subsidio_limite_min: 300, subsidio_valor_hora: 0, subsidio_valor_dia: 0,
  he_pct_dia_util: 150, he_pct_feriado: 200, he_pct_descanso: 250, iht_pct: 0, noturnas: [],
};

const codigo = (id: string, origem: HrCodigoProcessamento["origem_automatica"]): HrCodigoProcessamento => ({
  id, organization_id: "org", codigo: id, nome: id, descricao: null, activo: true, modo_calculo: "percentagem_hora_normal",
  percentagem: null, valor_fixo: null, origem_automatica: origem, created_at: "", updated_at: "",
});

const cent = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

/** 160 h planeadas, mensal 1600 EUR a 100 % de duodecimos. */
function entrada(totais: Partial<EntradaProcessamentoPessoa["totais"]>): EntradaProcessamentoPessoa {
  return {
    totais: {
      planeadoMinutos: 9600, realizadoMinutos: 9600, minutosExtraNormal: 0, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0,
      horasExtraNoturnasMinutos: 0, minutosAusenciaRemunerada: 0, faltas: [], diasFeriadoTrabalhados: 0, diasDescansoTrabalhado: 0,
      ...totais,
    },
    minutosPorDia: [],
    minutosNoturnosPorFaixa: [],
    regra: REGRA,
    direitoIht: false,
    retribuicao: { valorBase: 1600, periodicidade: "mensal", duodecimosPct: 100 },
    codigos: [codigo("he", "horas_extra"), codigo("fe", "feriado_trabalhado"), codigo("de", "descanso_trabalhado")],
    lancamentos: [],
  };
}

/** Os totais que o relatorio devolve para um dia de cada origem (so confirmado, cortado pelo limite do dia). */
function totaisDeAprovadas() {
  const util = extraDoDia({
    modo: "aprovadas", estado: "normal", planeadoMinutos: 480, realizadoMinutos: 600,
    linhas: [
      { id: "a", data: "2026-10-05", origem: "diaria", estado: "confirmada", minutos: 60, nocturno_min: 0 },
      { id: "b", data: "2026-10-05", origem: "semanal", estado: "confirmada", minutos: 60, nocturno_min: 0 },
    ],
  });
  const feriado = extraDoDia({
    modo: "aprovadas", estado: "feriado", planeadoMinutos: 0, realizadoMinutos: 240,
    linhas: [{ id: "c", data: "2026-10-12", origem: "feriado", estado: "confirmada", minutos: 120, nocturno_min: 0 }],
  });
  const descanso = extraDoDia({
    modo: "aprovadas", estado: "descanso", planeadoMinutos: 0, realizadoMinutos: 300,
    linhas: [{ id: "d", data: "2026-10-10", origem: "descanso", estado: "confirmada", minutos: 180, nocturno_min: 0 }],
  });
  return {
    minutosExtraNormal: util.porOrigem.diaria + util.porOrigem.semanal,
    minutosFeriadoTrabalhado: feriado.porOrigem.feriado,
    minutosDescansoTrabalhado: descanso.porOrigem.descanso,
  };
}

describe("os minutos confirmados por origem entram nos escaloes da regra", () => {
  it("diaria e semanal pagam a percentagem do dia util (corte pelo liquido: 60 + 0 de 120 pedidos), feriado e descanso as suas", () => {
    const totais = totaisDeAprovadas();
    // O liquido do dia util e 120 (600 - 480): a diaria usa 60 e a semanal os outros 60.
    expect(totais.minutosExtraNormal).toBe(120);
    const r = calcularProcessamentoPessoa(entrada({ ...totais, horasExtraFonte: "aprovadas" }));
    const valor = (cod: string) => r.linhasAutomaticas.find((l) => l.codigo === cod)?.valor;
    // 2 h a 150 % (dia util), 2 h a 200 % (feriado), 3 h a 250 % (descanso), sobre o valor da hora real.
    const vh = r.valorHoraReal as number;
    expect(vh).toBeGreaterThan(0);
    expect(valor("he")).toBe(cent(2 * vh * 1.5));
    expect(valor("fe")).toBe(cent(2 * vh * 2));
    expect(valor("de")).toBe(cent(3 * vh * 2.5));
  });

  it("a fonte e os minutos ficam nas linhas dos tres codigos de horas extra", () => {
    const r = calcularProcessamentoPessoa(entrada({ ...totaisDeAprovadas(), horasExtraFonte: "aprovadas" }));
    expect(r.linhasAutomaticas.map((l) => [l.codigo, l.fonteHorasExtra, l.minutos])).toEqual([
      ["he", "aprovadas", 120], ["fe", "aprovadas", 120], ["de", "aprovadas", 180],
    ]);
  });

  it("fonte bruto (interruptor desligado): as linhas ficam exactamente como sempre, sem fonte nem minutos", () => {
    const r = calcularProcessamentoPessoa(entrada({ minutosExtraNormal: 60, horasExtraFonte: "bruto" }));
    expect(Object.keys(r.linhasAutomaticas[0]).sort()).toEqual(["codigo", "codigoId", "horas", "nome", "origem", "valor"]);
  });

  it("sem fonte conhecida as linhas ficam exactamente como sempre", () => {
    const r = calcularProcessamentoPessoa(entrada({ minutosExtraNormal: 60 }));
    expect(r.linhasAutomaticas[0]).toEqual({ codigoId: "he", codigo: "he", nome: "he", origem: "horas_extra", horas: 1, valor: cent((r.valorHoraReal as number) * 1.5) });
  });

  it("o excesso nao aprovado nao paga: sem hora extra confirmada os tres escaloes ficam a zero", () => {
    const sem = extraDoDia({ modo: "aprovadas", estado: "normal", planeadoMinutos: 480, realizadoMinutos: 660, linhas: [] });
    expect(sem.contaMin).toBe(0);
    const r = calcularProcessamentoPessoa(entrada({ minutosExtraNormal: sem.contaMin, horasExtraFonte: "aprovadas" }));
    expect(r.totalCodigosAutomaticos).toBe(0);
  });
});

describe("conferir as horas extra no fecho", () => {
  beforeEach(() => {
    rpcFalsa.chamadas.length = 0;
    rpcFalsa.comportamento = async () => new Map();
    rpcFalsa.doPeriodo = async () => ({ aprovacaoDesde: null, linhas: [], assinatura: null });
  });

  it("conta as pessoas cuja assinatura mudou (ausente = vazia)", () => {
    expect(pessoasComHorasExtraMudadas(new Map([["p1", "x"], ["p2", ""]]), new Map([["p1", "x"]]))).toBe(0);
    expect(pessoasComHorasExtraMudadas(new Map([["p1", "x"], ["p2", ""]]), new Map([["p1", "y"], ["p2", "z"]]))).toBe(2);
  });

  it("igual: devolve as assinaturas para o fecho; mudou: nao fecha e diz quantas", async () => {
    rpcFalsa.comportamento = async () => new Map([["p1", "x"]]);
    expect(await prepararFechoComHorasExtra({ periodoId: "per", calculadas: new Map([["p1", "x"]]) })).toEqual({ ok: true, assinaturas: new Map([["p1", "x"]]) });
    expect(await prepararFechoComHorasExtra({ periodoId: "per", calculadas: new Map([["p1", "outra"]]) })).toEqual({ ok: false, motivo: "mudaram", mudou: 1 });
    expect(rpcFalsa.chamadas[0]).toEqual(["per"]);
  });

  it("sem pessoas em modo aprovadas nao ha nada a conferir (so se devolvem as assinaturas)", async () => {
    rpcFalsa.comportamento = async () => new Map([["p1", "x"]]);
    expect(await prepararFechoComHorasExtra({ periodoId: "per" })).toEqual({ ok: true, assinaturas: new Map([["p1", "x"]]) });
  });

  it("base sem a RPC (migration por aplicar) ou sem permissao: segue sem assinaturas (a base decide)", async () => {
    rpcFalsa.comportamento = (async () => { throw erroDaBase("PGRST202", "Could not find the function public.rpc_hr_horas_extra_assinaturas"); });
    expect(await prepararFechoComHorasExtra({ periodoId: "per", calculadas: new Map([["p1", "x"]]) })).toEqual({ ok: true, assinaturas: new Map() });
    rpcFalsa.comportamento = (async () => { throw erroDaBase("42501", "insufficient_privilege"); });
    expect(await prepararFechoComHorasExtra({ periodoId: "per" })).toEqual({ ok: true, assinaturas: new Map() });
  });

  it("outro erro impede o fecho, com texto escrito (nunca o codigo em bruto)", async () => {
    rpcFalsa.comportamento = (async () => { throw erroDaBase("XX000", "falha de rede"); });
    const r = await prepararFechoComHorasExtra({ periodoId: "per" });
    expect(r).toMatchObject({ ok: false, motivo: "erro" });
    expect((r as { texto: string }).texto).toBe("texto:rhProcReal.fecho.erroHorasExtra");
  });

  describe("o que segue no resultado e a chave do calculo, nunca a assinatura de agora", () => {
    const referencia = { organizationId: "org", pessoaId: "p1", de: "2026-10-01", ate: "2026-10-31" };

    it("cenario 1: a contagem foi ligada com o ecra aberto (calculo em bruto): nao fecha, mesmo com assinaturas iguais", async () => {
      rpcFalsa.comportamento = async () => new Map([["p1", "x"]]);
      rpcFalsa.doPeriodo = async () => ({ aprovacaoDesde: "2026-10-01", linhas: [], assinatura: "x" });
      const r = await prepararFechoComHorasExtra({ periodoId: "per", calculadas: new Map([["p1", "x"]]), referencia: { ...referencia, desdeCalculo: null } });
      expect(r).toEqual({ ok: false, motivo: "sem_confirmadas" });
    });

    it("interruptor igual ao do calculo: confere as assinaturas de TODAS as pessoas (bruto incluido)", async () => {
      rpcFalsa.doPeriodo = async () => ({ aprovacaoDesde: null, linhas: [], assinatura: null });
      rpcFalsa.comportamento = async () => new Map([["p1", "x"], ["p2", "nova"]]);
      // p2 foi calculada em bruto, sem horas extra; entretanto ganhou uma: nao fecha.
      const r = await prepararFechoComHorasExtra({ periodoId: "per", calculadas: new Map([["p1", "x"], ["p2", ""]]), referencia: { ...referencia, desdeCalculo: null } });
      expect(r).toEqual({ ok: false, motivo: "mudaram", mudou: 1 });
      rpcFalsa.comportamento = async () => new Map([["p1", "x"]]);
      expect(await prepararFechoComHorasExtra({ periodoId: "per", calculadas: new Map([["p1", "x"], ["p2", ""]]), referencia: { ...referencia, desdeCalculo: null } })).toMatchObject({ ok: true });
    });

    it("cenario 2: quem fecha nao le as horas extra (42501 no do_periodo), mas as assinaturas vem: nao ha nada a conferir e o resultado segue sem chave", async () => {
      rpcFalsa.doPeriodo = async () => { throw erroDaBase("42501", "insufficient_privilege"); };
      rpcFalsa.comportamento = async () => new Map([["p1", "fresca"]]);
      // Sem calculadas (todas recusadas) e sem referencia de interruptor conhecida: segue; a chave do calculo e vazia e a base decide.
      const r = await prepararFechoComHorasExtra({ periodoId: "per", referencia: { ...referencia, desdeCalculo: null } });
      expect(r).toMatchObject({ ok: true });
    });

    it("erro tecnico a reler o interruptor impede o fecho com texto escrito", async () => {
      rpcFalsa.doPeriodo = async () => { throw erroDaBase("XX000", "falha de rede"); };
      const r = await prepararFechoComHorasExtra({ periodoId: "per", referencia: { ...referencia, desdeCalculo: null } });
      expect(r).toMatchObject({ ok: false, motivo: "erro", texto: "texto:rhProcReal.fecho.erroHorasExtra" });
    });
  });
});

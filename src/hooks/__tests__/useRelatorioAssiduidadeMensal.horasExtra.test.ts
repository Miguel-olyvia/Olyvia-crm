/**
 * Horas extra APROVADAS no relatorio mensal: `rpc_hr_horas_extra_do_periodo` por pessoa, os dois caminhos (bruto e aprovadas) e
 * as leituras que falham. Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";
const PESSOA_ID = "pessoa-1";

let tabelas: Record<string, unknown[]> = {};
let rpcChamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcPorFuncao: Record<string, { data: unknown; error: unknown }> = {};

function buildChain(table: string) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    then: (ok: any, ko: any) => Promise.resolve({ data: tabelas[table] ?? [], error: null }).then(ok, ko),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcChamadas.push({ fn, args });
      return Promise.resolve(rpcPorFuncao[fn] ?? { data: null, error: null });
    },
  },
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { useRelatorioAssiduidadeMensal } from "@/hooks/useRelatorioAssiduidadeMensal";
import { limparMargemPartilhada } from "@/lib/hr/desviosRpc";

const ANO = 2026;
const MES = 8; // Setembro (0-11); dia 1 e terca-feira.

const planeadoTerca = {
  id: "pl-2", pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, vinculo_id: null, local_id: null, dia_semana: 2, data: null,
  hora_inicio: "09:00", hora_fim: "18:00", nao_trabalha: false, ordem: 0, valido_de: null, valido_ate: null, notas: null,
  corrige_horario_id: null, correccao_motivo: null, corrigido_por_anew_user_id: null, corrigido_por_pessoa_id: null,
};

const realizado = (data: string, ini: string, fim: string, minutos: number) => ({
  id: `r-${data}`, pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, vinculo_id: null, local_id: null, planeado_id: null, data,
  hora_inicio: ini, hora_fim: fim, minutos, origem: "picagem", estado: "validado", validado_por: null, validado_em: null,
  motivo_rejeicao: null, notas: null, corrige_realizado_id: null, correccao_motivo: null, corrigido_por_pessoa_id: null, deleted_at: null,
});

const linhaHE = (extra: Record<string, unknown> = {}) => ({
  id: "he1", data: "2026-09-01", origem: "diaria", estado: "confirmada", minutos: 60, nocturno_min: 0, tipo_registo: "detectada", ...extra,
});

const horasExtra = (aprovacaoDesde: string | null, linhas: unknown[], assinatura: string | null = "a".repeat(32)) => ({
  data: { pessoa_id: PESSOA_ID, aprovacao_desde: aprovacaoDesde, linhas, assinatura },
  error: null,
});

const dia = (result: { current: { dias: Array<{ iso: string }> } }, iso = "2026-09-01") =>
  result.current.dias.find((d) => d.iso === iso) as any;

describe("useRelatorioAssiduidadeMensal: horas extra aprovadas", () => {
  beforeEach(() => {
    tabelas = { pessoas_horario_planeado: [planeadoTerca], pessoas_horario_realizado: [realizado("2026-09-01", "09:00", "19:00", 600)] };
    rpcChamadas = [];
    rpcPorFuncao = {};
    limparMargemPartilhada();
  });

  it("le a RPC por pessoa com o intervalo da folha", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra(null, []);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const c = rpcChamadas.filter((x) => x.fn === "rpc_hr_horas_extra_do_periodo");
    expect(c).toHaveLength(1);
    expect(c[0].args).toEqual({ p_organization_id: ORG_ACTIVA, p_pessoa_id: PESSOA_ID, p_de: "2026-09-01", p_ate: "2026-09-30" });
  });

  it("interruptor desligado: o resultado e o de sempre (excesso em bruto) e a fonte e bruto", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra(null, [linhaHE({ minutos: 10 })]);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(dia(result)).toMatchObject({ horasExtraMinutos: 60, contadoMinutos: 600 });
    expect(dia(result).modoExtra).toBeUndefined();
    expect(result.current.totais).toMatchObject({ horasExtraMinutos: 60, minutosExtraNormal: 60, horasExtraFonte: "bruto", horasExtraChave: "a".repeat(32), horasExtraAprovacaoDesde: null, horasExtraRecusadas: false, horasExtraNaoLidas: false });
    expect(result.current.horasExtraNaoLidas).toBe(false);
  });

  it("base sem a RPC (migration por aplicar): como hoje, sem bloqueio", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = { data: null, error: { message: "Could not find the function public.rpc_hr_horas_extra_do_periodo", code: "PGRST202" } };
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.horasExtraNaoLidas).toBe(false);
    expect(result.current.erro).toBe(false);
    expect(result.current.totais.horasExtraMinutos).toBe(60);
  });

  it("interruptor ligado: so conta o confirmado, cortado pelo limite do dia; a chave e a assinatura da base", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra("2026-09-01", [linhaHE({ minutos: 90, nocturno_min: 30 })], "b".repeat(32));
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(dia(result)).toMatchObject({ modoExtra: "aprovadas", horasExtraMinutos: 60, extraValidadoMinutos: 60, extraCortadoMinutos: 30, horasExtraNoturnasMinutos: 30, contadoMinutos: 600 });
    expect(result.current.totais).toMatchObject({
      horasExtraMinutos: 60, minutosExtraNormal: 60, minutosFeriadoTrabalhado: 0, minutosDescansoTrabalhado: 0,
      horasExtraFonte: "aprovadas", horasExtraChave: "b".repeat(32), horasExtraCortadasMinutos: 30, horasExtraPendentes: 0, excessoSemHoraExtra: 0,
    });
  });

  it("interruptor ligado, sem hora extra: o excesso nao paga e fica «por detetar»", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra("2026-09-01", [], null);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(dia(result).horasExtraMinutos).toBe(0);
    expect(result.current.totais).toMatchObject({ horasExtraMinutos: 0, minutosExtraNormal: 0, excessoSemHoraExtra: 1, excessoSemHoraExtraMinutos: 60, horasExtraChave: "" });
  });

  it("pendente nao conta mas e reportada (bloqueia o fecho); rejeitada nao conta nem e reportada", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra("2026-09-01", [linhaHE({ estado: "pendente", minutos: 45 }), linhaHE({ id: "he2", data: "2026-09-08", estado: "rejeitada", minutos: 20 })]);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totais).toMatchObject({ horasExtraMinutos: 0, horasExtraPendentes: 1, horasExtraPendentesMinutos: 45 });
  });

  it("feriado e descanso pagam o confirmado, pela ORIGEM, e o resto vai para o dia util", async () => {
    tabelas.pessoas_horario_realizado = [
      realizado("2026-09-01", "09:00", "19:00", 600),
      realizado("2026-09-06", "10:00", "14:00", 240), // domingo, sem horario: descanso
      realizado("2026-09-07", "10:00", "13:00", 180), // segunda: feriado
    ];
    tabelas.schedule_holidays = [{ holiday_date: "2026-09-07", is_recurring: false }];
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra("2026-09-01", [
      linhaHE({ minutos: 30 }),
      linhaHE({ id: "he2", data: "2026-09-06", origem: "descanso", minutos: 100 }),
      linhaHE({ id: "he3", data: "2026-09-07", origem: "feriado", minutos: 500 }),
    ]);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totais).toMatchObject({ minutosExtraNormal: 30, minutosDescansoTrabalhado: 100, minutosFeriadoTrabalhado: 180, horasExtraMinutos: 310 });
  });

  it("horas extra confirmadas num dia de ausencia de dia inteiro nao se pagam e ficam como «nao contadas»", async () => {
    tabelas.pessoas_ausencias_dias = [{
      id: "ad1", pedido_id: "ped", pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, tipo_id: "t", data: "2026-09-01", fraccao_dia: 1,
      conta_saldo: true, e_feriado: false, e_fim_semana: false, periodo_inicio: "2026-09-01", estado: "aprovado",
    }];
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra("2026-09-01", [linhaHE({ minutos: 45 })]);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(dia(result)).toMatchObject({ estado: "ausencia", extraNaoContadoMinutos: 45, horasExtraMinutos: 0 });
    expect(result.current.totais).toMatchObject({ horasExtraMinutos: 0, horasExtraAprovadasNaoContadasMinutos: 45 });
  });

  it("a data do interruptor a meio do periodo: antes e bruto, a partir dela aprovadas (fonte misto)", async () => {
    tabelas.pessoas_horario_realizado = [realizado("2026-09-01", "09:00", "19:00", 600), realizado("2026-09-08", "09:00", "19:00", 600)];
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = horasExtra("2026-09-08", [linhaHE({ id: "he9", data: "2026-09-08", minutos: 20 })]);
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(dia(result, "2026-09-01").horasExtraMinutos).toBe(60);
    expect(dia(result, "2026-09-08")).toMatchObject({ modoExtra: "aprovadas", horasExtraMinutos: 20 });
    expect(result.current.totais).toMatchObject({ horasExtraFonte: "misto", horasExtraMinutos: 80 });
  });

  it("erro tecnico da RPC: horasExtraNaoLidas (bloqueia o fecho) e erro de leitura; recusa por permissao: NAO bloqueia (a base decide)", async () => {
    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = { data: null, error: { message: "falha de rede", code: "XX000" } };
    const a = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.horasExtraNaoLidas).toBe(true);
    expect(a.result.current.totais.horasExtraNaoLidas).toBe(true);
    expect(a.result.current.erro).toBe(true);

    rpcPorFuncao.rpc_hr_horas_extra_do_periodo = { data: null, error: { message: "insufficient_privilege", code: "42501" } };
    const b = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.horasExtraNaoLidas).toBe(false);
    expect(b.result.current.horasExtraRecusadas).toBe(true);
    expect(b.result.current.totais.horasExtraNaoLidas).toBe(false);
    // Nao se sabe se a contagem esta ligada: o interruptor lido fica por saber e a chave vazia.
    expect(b.result.current.totais).toMatchObject({ horasExtraRecusadas: true, horasExtraAprovacaoDesde: undefined, horasExtraChave: "" });
    expect(b.result.current.erro).toBe(false);
    // Recusa com o interruptor desligado (sem dados): o calculo e o de hoje.
    expect(b.result.current.totais.horasExtraFonte).toBe("bruto");
    expect(b.result.current.totais.horasExtraMinutos).toBe(60);
  });
});

// O calendario do mes da pessoa alimentado pelo hook REAL de assiduidade (picagens, horas realizadas, faltas e
// ausencias lidas da base), sem passar pelos stores de exemplo. O hook real e entregue por argumento, por isso nao
// ha Supabase nem relogio de exemplo a simular.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// A regra do subsidio vem do wrapper do hook real (`hr_regras_subsidio_alimentacao`); aqui entra por argumento.
const regraSubsidio = vi.hoisted(() => ({ minutosMinimosDia: 1, error: null as unknown }));
vi.mock("@/components/rh-exemplo/hooks/useRegrasSubsidioAlimentacao", () => ({
  useRegrasSubsidioAlimentacao: () => ({ regra: { minutosMinimosDia: regraSubsidio.minutosMinimosDia }, error: regraSubsidio.error }),
}));

import { entradaMesReal, type AssiduidadeDoMes } from "./fonteMes";
import { useMesDaPessoa } from "./useMesDaPessoa";

const PESSOA = "pessoa-real-1";

const falta = (id: string, data: string, extra: Record<string, unknown> = {}) => ({
  id, pessoa_id: PESSOA, organization_id: "org", data, planeado_id: null, vinculo_id: null, local_id: null,
  hora_inicio: "09:00:00", hora_fim: "13:00:00", minutos: 240, motivo_codigo: "assuntos_pessoais",
  justificacao_estado: "sem_justificacao", justificada: false, remunerada: false, desconta_saldo: false,
  justificacao_decidida_por: null, justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null,
  corrige_falta_id: null, correccao_motivo: null, estado: "activa", anulado_em: null, anulacao_motivo: null,
  created_at: "2026-10-01T00:00:00Z", ...extra,
});

const realizado = (id: string, data: string, extra: Record<string, unknown> = {}) => ({
  id, pessoa_id: PESSOA, organization_id: "org", vinculo_id: null, local_id: null, planeado_id: null, data,
  hora_inicio: "09:00:00", hora_fim: "13:00:00", minutos: 240, origem: "picagem", estado: "validado",
  validado_por: null, validado_em: null, motivo_rejeicao: null, notas: null, corrige_realizado_id: null,
  correccao_motivo: null, corrigido_por_pessoa_id: null, deleted_at: null, ...extra,
});

function assiduidade(parcial: Partial<AssiduidadeDoMes> = {}): AssiduidadeDoMes {
  return {
    picagens: [], realizado: [], faltas: [], ausenciaAprovadaPorDia: new Map(), planeado: [], planeadoRecusado: false, ...parcial,
  } as AssiduidadeDoMes;
}

const planeada = (id: string, extra: Record<string, unknown> = {}) => ({
  id, pessoa_id: PESSOA, organization_id: "org", vinculo_id: null, local_id: null, dia_semana: 3, data: null,
  hora_inicio: "09:00:00", hora_fim: "13:00:00", nao_trabalha: false, ordem: 1, valido_de: null, valido_ate: null,
  notas: null, corrige_horario_id: null, correccao_motivo: null, corrigido_por_anew_user_id: null,
  corrigido_por_pessoa_id: null, ...extra,
});

beforeEach(() => {
  regraSubsidio.minutosMinimosDia = 1;
  regraSubsidio.error = null;
});

const base = { ano: 2026, mes: 10, hoje: "2026-10-20", contrato: null, tiposAusencia: [], horario: undefined, horasExtra: [], banco: [], podeHE: false };

describe("entradaMesReal", () => {
  it("usa as faltas lidas da base e deixa de fora a que uma correccao substituiu", () => {
    const entrada = entradaMesReal({
      ...base,
      assiduidade: assiduidade({
        faltas: [
          falta("f1", "2026-10-06"),
          falta("f2", "2026-10-06", { corrige_falta_id: "f1", hora_fim: "11:00:00", minutos: 120 }),
          falta("f3", "2026-10-07", { estado: "anulada" }),
        ] as never,
      }),
    });
    expect(entrada.faltas.map((f) => f.id)).toEqual(["f2"]);
  });

  it("usa so as horas realizadas em vigor: sem corrigidas nem apagadas", () => {
    const entrada = entradaMesReal({
      ...base,
      assiduidade: assiduidade({
        realizado: [
          realizado("r1", "2026-10-06"),
          realizado("r2", "2026-10-06", { corrige_realizado_id: "r1", hora_fim: "14:00:00", minutos: 300 }),
          realizado("r3", "2026-10-08", { deleted_at: "2026-10-09T00:00:00Z" }),
        ] as never,
      }),
    });
    expect(entrada.realizado.map((r) => r.id)).toEqual(["r2"]);
  });

  it("a ausencia aprovada ganha o nome do tipo e a fraccao do dia", () => {
    const entrada = entradaMesReal({
      ...base,
      tiposAusencia: [{ id: "t-ferias", nome: "Férias" }] as never,
      assiduidade: assiduidade({
        ausenciaAprovadaPorDia: new Map([["2026-10-12", { id: "a1", data: "2026-10-12", fraccao_dia: 0.5, estado: "aprovado", tipo_id: "t-ferias" } as never]]),
      }),
    });
    expect(entrada.ausencias.get("2026-10-12")).toEqual({ nome: "Férias", fraccao: 0.5 });
  });

  it("uma ausencia de um tipo desconhecido fica com o nome vazio, sem rebentar", () => {
    const entrada = entradaMesReal({
      ...base,
      assiduidade: assiduidade({
        ausenciaAprovadaPorDia: new Map([["2026-10-12", { id: "a1", data: "2026-10-12", fraccao_dia: 1, estado: "aprovado" }]]),
      }),
    });
    expect(entrada.ausencias.get("2026-10-12")).toEqual({ nome: "", fraccao: 1 });
  });
});

describe("useMesDaPessoa com a assiduidade real", () => {
  it("devolve um dia por data do mes com as faltas e as horas da base", () => {
    const dados = assiduidade({
      faltas: [falta("f1", "2026-10-06")] as never,
      realizado: [realizado("r1", "2026-10-07")] as never,
    });
    const { result } = renderHook(() => useMesDaPessoa(PESSOA, 2026, 10, { assiduidade: dados, dataAdmissao: null }));
    const mes = result.current;
    expect(mes).not.toBeNull();
    expect(mes?.dias).toHaveLength(31);
    expect(mes?.dias.find((d) => d.data === "2026-10-06")?.faltas.map((f) => f.id)).toEqual(["f1"]);
    expect(mes?.dias.find((d) => d.data === "2026-10-07")?.feitos).toEqual([{ inicio: "09:00", fim: "13:00" }]);
  });

  it("nao precisa de a pessoa existir nos stores de exemplo", () => {
    const { result } = renderHook(() => useMesDaPessoa("nao-existe-no-exemplo", 2026, 2, { assiduidade: assiduidade(), dataAdmissao: null }));
    expect(result.current?.dias).toHaveLength(28);
  });

  it("antes da admissao os dias ficam sem contrato", () => {
    const { result } = renderHook(() => useMesDaPessoa(PESSOA, 2026, 10, { assiduidade: assiduidade(), dataAdmissao: "2026-10-15" }));
    expect(result.current?.dias.find((d) => d.data === "2026-10-14")?.previsto.kind).toBe("sem_contrato");
  });
});

describe("useMesDaPessoa com o horario planeado real", () => {
  const dia = (mes: ReturnType<typeof useMesDaPessoa>, data: string) => mes.dias.find((d) => d.data === data);
  const mesDe = (planeado: unknown[], extra: Partial<AssiduidadeDoMes> = {}) =>
    renderHook(() => useMesDaPessoa(PESSOA, 2026, 10, { assiduidade: assiduidade({ planeado: planeado as never, ...extra }), dataAdmissao: null })).result.current;

  it("sem linhas planeadas nao ha horario: nada previsto, e nao se inventa um de exemplo", () => {
    const mes = mesDe([]);
    expect(dia(mes, "2026-10-07")?.previsto.kind).toBe("sem_horario");
    expect(dia(mes, "2026-10-07")?.previsto.minutos).toBe(0);
  });

  it("uma linha recorrente prevê esse intervalo nas quartas-feiras e mais nenhum dia", () => {
    const mes = mesDe([planeada("p1")]);
    expect(dia(mes, "2026-10-07")?.previsto).toMatchObject({ kind: "trabalha", minutos: 240, intervalos: [{ inicio: "09:00", fim: "13:00" }] });
    expect(dia(mes, "2026-10-08")?.previsto.minutos).toBe(0);
  });

  it("dois intervalos no mesmo dia (repartido) somam as horas e a pausa e o buraco entre eles", () => {
    const mes = mesDe([planeada("p1"), planeada("p2", { ordem: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" })]);
    expect(dia(mes, "2026-10-07")?.previsto).toMatchObject({ kind: "trabalha", minutos: 480, pausaMin: 60 });
  });

  it("uma excepcao com data substitui o padrao semanal nesse dia, incluindo quando e folga", () => {
    const mes = mesDe([
      planeada("p1"),
      planeada("x1", { dia_semana: null, data: "2026-10-14", hora_inicio: null, hora_fim: null, nao_trabalha: true }),
    ]);
    expect(dia(mes, "2026-10-14")?.previsto).toMatchObject({ kind: "nao_trabalha", porExcecao: true, minutos: 0 });
    expect(dia(mes, "2026-10-07")?.previsto.kind).toBe("trabalha");
  });

  it("uma linha fechada (valido_ate) deixa de prever depois dessa data", () => {
    const mes = mesDe([planeada("p1", { valido_ate: "2026-10-10" })]);
    expect(dia(mes, "2026-10-07")?.previsto.minutos).toBe(240);
    expect(dia(mes, "2026-10-14")?.previsto.minutos).toBe(0);
  });

  it("uma correcao substitui o intervalo errado e so conta a corrigida", () => {
    const mes = mesDe([planeada("p1"), planeada("p2", { corrige_horario_id: "p1", correccao_motivo: "Hora errada", hora_fim: "12:00:00" })]);
    expect(dia(mes, "2026-10-07")?.previsto.minutos).toBe(180);
  });

  it("diz que o planeado foi recusado, em vez de mostrar um mes vazio como se nao houvesse horario", () => {
    expect(mesDe([], { planeadoRecusado: true } as never).planeadoRecusado).toBe(true);
    expect(mesDe([]).planeadoRecusado).toBe(false);
  });
});

describe("useMesDaPessoa com a regra real do subsidio de alimentacao", () => {
  const horas = [realizado("r1", "2026-02-04")] as never;
  const elegiveis = () =>
    renderHook(() => useMesDaPessoa(PESSOA, 2026, 2, { assiduidade: assiduidade({ realizado: horas }), dataAdmissao: null })).result.current;

  it("conta o dia quando as horas feitas atingem o minimo da organizacao", () => {
    regraSubsidio.minutosMinimosDia = 240;
    expect(elegiveis().totais.diasElegiveisSubsidio).toBe(1);
  });

  it("nao conta o dia quando o minimo da organizacao e superior ao que se fez", () => {
    regraSubsidio.minutosMinimosDia = 241;
    expect(elegiveis().totais.diasElegiveisSubsidio).toBe(0);
  });

  it("avisa quando a regra nao se conseguiu ler", () => {
    regraSubsidio.error = new Error("falhou");
    expect(elegiveis().erroRegraSubsidio).toBe(true);
  });
});

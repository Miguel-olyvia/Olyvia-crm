/**
 * Classificacao dos tres valores por dia (planeado, realizado, obra) e do
 * estado (normal/descanso/feriado/ausencia), mais os totais do mes.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";
const PESSOA_ID = "pessoa-1";

let tabelas: Record<string, unknown[]> = {};
let rpcChamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcResposta: { data: unknown; error: unknown } = { data: "nova-obra-id", error: null };

function buildChain(table: string) {
  const linhas = tabelas[table] ?? [];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve({ data: linhas, error: null }).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcChamadas.push({ fn, args });
      return Promise.resolve(rpcResposta);
    },
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

import { useRelatorioAssiduidadeMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

// Setembro de 2026: dia 1 e terca-feira.
const ANO = 2026;
const MES = 8; // 0-indexado: Setembro

function planeadoSemanal(diaSemana: number, horaInicio: string, horaFim: string) {
  return {
    id: `pl-${diaSemana}`,
    pessoa_id: PESSOA_ID,
    organization_id: ORG_ACTIVA,
    vinculo_id: null,
    local_id: null,
    dia_semana: diaSemana,
    data: null,
    hora_inicio: horaInicio,
    hora_fim: horaFim,
    nao_trabalha: false,
    ordem: 0,
    valido_de: null,
    valido_ate: null,
    notas: null,
    corrige_horario_id: null,
    correccao_motivo: null,
    corrigido_por_anew_user_id: null,
    corrigido_por_pessoa_id: null,
  };
}

function diaDeFolga(diaSemana: number) {
  return {
    ...planeadoSemanal(diaSemana, null, null),
    nao_trabalha: true,
  };
}

describe("useRelatorioAssiduidadeMensal", () => {
  beforeEach(() => {
    tabelas = {};
    rpcChamadas = [];
    rpcResposta = { data: "nova-obra-id", error: null };
  });

  it("classifica um dia normal com planeado, realizado e obra distintos, nunca fundidos", async () => {
    tabelas.pessoas_horario_planeado = [
      planeadoSemanal(2, "09:00", "18:00"), // terca
    ];
    tabelas.pessoas_horario_realizado = [
      {
        id: "r1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-01",
        hora_inicio: "09:00",
        hora_fim: "17:00",
        minutos: 480,
        origem: "picagem",
        estado: "fechado",
        validado_por: null,
        validado_em: null,
        motivo_rejeicao: null,
        notas: null,
        corrige_realizado_id: null,
        correccao_motivo: null,
        corrigido_por_pessoa_id: null,
        deleted_at: null,
      },
    ];
    tabelas.hr_obras_horas = [
      {
        id: "obra-1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        data: "2026-09-01",
        horas: 2,
        descricao: "Obra X",
        registado_por: null,
        anulado_em: null,
        anulado_por: null,
        anulado_motivo: null,
        created_at: "2026-09-01T20:00:00Z",
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1).toBeDefined();
    expect(dia1?.estado).toBe("normal");
    expect(dia1?.planeadoMinutos).toBe(540); // 09:00-18:00
    expect(dia1?.realizadoMinutos).toBe(480); // 09:00-17:00
    expect(dia1?.obraHoras).toBe(2);
  });

  it("um dia sem horario planeado (folga semanal) fica 'descanso'", async () => {
    tabelas.pessoas_horario_planeado = [diaDeFolga(0)]; // domingo

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const domingo = result.current.dias.find((d) => d.iso === "2026-09-06"); // domingo de Set/2026
    expect(domingo?.estado).toBe("descanso");
    expect(domingo?.planeadoMinutos).toBe(0);
  });

  it("um feriado do calendario da organizacao classifica o dia como 'feriado'", async () => {
    tabelas.pessoas_horario_planeado = [diaDeFolga(1)]; // segunda, sem horario
    tabelas.schedule_holidays = [{ holiday_date: "2026-09-07", is_recurring: false }];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const feriado = result.current.dias.find((d) => d.iso === "2026-09-07");
    expect(feriado?.estado).toBe("feriado");
  });

  it("uma ausencia aprovada de dia inteiro substitui o dia pela sua categoria", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
    tabelas.pessoas_ausencias_dias = [
      {
        id: "ad1",
        pedido_id: "ped1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        tipo_id: "tipo-ferias",
        data: "2026-09-01",
        fraccao_dia: 1,
        conta_saldo: true,
        e_feriado: false,
        e_fim_semana: false,
        periodo_inicio: "2026-09-01",
        estado: "aprovado",
      },
    ];
    tabelas.hr_ausencias_tipos = [
      {
        id: "tipo-ferias",
        organization_id: ORG_ACTIVA,
        codigo: "ferias",
        nome: "Ferias",
        categoria: "ferias",
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.estado).toBe("ausencia");
    expect(dia1?.categoriaAusencia).toBe("ferias");
  });

  it("uma falta nao substitui o dia: continua a mostrar planeado/realizado, so assinala temFalta", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
    tabelas.pessoas_faltas = [
      {
        id: "f1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        data: "2026-09-01",
        planeado_id: null,
        vinculo_id: null,
        local_id: null,
        hora_inicio: "09:00",
        hora_fim: "11:00",
        minutos: 120,
        motivo_codigo: "atraso",
        justificacao_estado: "sem_justificacao",
        justificada: false,
        remunerada: false,
        desconta_saldo: false,
        justificacao_decidida_por: null,
        justificacao_decidida_em: null,
        justificacao_motivo: null,
        ausencia_dia_id: null,
        corrige_falta_id: null,
        correccao_motivo: null,
        estado: "activa",
        anulado_em: null,
        anulacao_motivo: null,
        created_at: "2026-09-01T09:00:00Z",
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.estado).toBe("normal");
    expect(dia1?.temFalta).toBe(true);
    expect(dia1?.minutosEmFalta).toBe(120);
  });

  it("uma obra anulada nao entra nos totais nem na coluna do dia", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
    tabelas.hr_obras_horas = [
      {
        id: "obra-anulada",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        data: "2026-09-01",
        horas: 3,
        descricao: "Obra cancelada",
        registado_por: null,
        anulado_em: "2026-09-02T00:00:00Z",
        anulado_por: null,
        anulado_motivo: "Enganei-me",
        created_at: "2026-09-01T20:00:00Z",
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.obraHoras).toBe(0);
    expect(result.current.totais.obraHoras).toBe(0);
    // Continua na lista de obras do mes, so marcada como anulada.
    expect(result.current.obras).toHaveLength(1);
    expect(result.current.obras[0].anulado_em).not.toBeNull();
  });

  it("os totais somam dias trabalhados, minutos e horas de obra do mes inteiro", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
    tabelas.pessoas_horario_realizado = [
      {
        id: "r1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-01",
        hora_inicio: "09:00",
        hora_fim: "17:00",
        minutos: 480,
        origem: "picagem",
        estado: "fechado",
        validado_por: null,
        validado_em: null,
        motivo_rejeicao: null,
        notas: null,
        corrige_realizado_id: null,
        correccao_motivo: null,
        corrigido_por_pessoa_id: null,
        deleted_at: null,
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totais.diasTrabalhados).toBe(1);
    expect(result.current.totais.realizadoMinutos).toBe(480);
  });

  it("registarObra chama a RPC com a pessoa e a organizacao resolvidas", async () => {
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.registarObra({ data: "2026-09-01", horas: 3, descricao: "Obra Y" });

    expect(rpcChamadas).toContainEqual({
      fn: "rpc_hr_obra_horas_registar",
      args: { p_pessoa_id: PESSOA_ID, p_data: "2026-09-01", p_horas: 3, p_descricao: "Obra Y" },
    });
  });

  it("anularObra chama a RPC com o id e o motivo", async () => {
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.anularObra("obra-1", "Enganei-me na data");

    expect(rpcChamadas).toContainEqual({
      fn: "rpc_hr_obra_horas_anular",
      args: { p_obra_id: "obra-1", p_motivo: "Enganei-me na data" },
    });
  });
});

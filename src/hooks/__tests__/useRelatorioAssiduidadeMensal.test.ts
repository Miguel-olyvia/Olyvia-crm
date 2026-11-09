/**
 * Classificacao dos tres valores por dia (planeado, realizado, obra) e do
 * estado (normal/descanso/feriado/ausencia), mais os totais do mes.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";
const PESSOA_ID = "pessoa-1";

let tabelas: Record<string, unknown[]> = {};
let errosPorTabela: Record<string, unknown> = {};
let rpcChamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcResposta: { data: unknown; error: unknown } = { data: "nova-obra-id", error: null };
/** Respostas por RPC (as de desvios); a que nao estiver aqui usa `rpcResposta`. */
let rpcPorFuncao: Record<string, { data: unknown; error: unknown }> = {};

function buildChain(table: string) {
  const linhas = tabelas[table] ?? [];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve({ data: errosPorTabela[table] ? null : linhas, error: errosPorTabela[table] ?? null }).then(
        onFulfilled,
        onRejected,
      ),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcChamadas.push({ fn, args });
      return Promise.resolve(rpcPorFuncao[fn] ?? rpcResposta);
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
import { limparMargemPartilhada } from "@/lib/hr/desviosRpc";

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
    errosPorTabela = {};
    rpcChamadas = [];
    rpcResposta = { data: "nova-obra-id", error: null };
    rpcPorFuncao = {};
    limparMargemPartilhada();
  });

  describe("leituras falhadas nao passam por relatorio completo (o fecho grava para sempre)", () => {
    it("sem falhas, erro e false", async () => {
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.erro).toBe(false);
    });

    it("uma leitura que falha (nao por permissao) expoe erro=true em vez de linhas vazias silenciosas", async () => {
      errosPorTabela.pessoas_horario_realizado = { message: "falha de rede", code: "XX000" };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.erro).toBe(true);
      expect(result.current.realizadoRecusado).toBe(false);
    });

    it("uma recusa por permissao e recusada, nao erro", async () => {
      errosPorTabela.pessoas_faltas = { message: "permission denied", code: "42501" };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.faltasRecusadas).toBe(true);
      expect(result.current.erro).toBe(false);
    });
  });

  describe("'sem_registo' -- depende de 'hoje', por isso corre com o relogio fixado", () => {
    beforeEach(() => {
      // "Hoje" fixado em 2026-09-16: sem isto, o teste do "dia futuro"
      // (2026-09-22) passa a falhar sozinho assim que essa data deixar de
      // estar no futuro, e a contagem de "tercas passadas" muda com o
      // calendario sem ninguem tocar no codigo.
      //
      // So o `Date` e falsificado -- `setTimeout`/`setInterval` ficam reais,
      // porque o `waitFor` do Testing Library depende deles para fazer
      // polling; falsifica-los tambem so trava os testes em timeout.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-16T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("um dia PASSADO com planeado, zero realizado e sem falta fica 'sem_registo' e conta nos totais", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // todas as tercas de Set/2026

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // "Hoje" nos testes e 2026-09-16 (data do sistema, fixada acima) -- as
      // tercas passadas sao 01, 08 e 15.
      const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
      expect(dia1?.estado).toBe("sem_registo");
      expect(dia1?.realizadoMinutos).toBe(0);
      // As 3 tercas passadas sao falta completa por zero picagem -- nenhuma
      // tem linha em pessoas_faltas, por isso entram no total mas nao na
      // parcela "registada".
      expect(result.current.totais.diasComFaltaCompleta).toBe(3);
      expect(result.current.totais.diasComFaltaCompletaRegistada).toBe(0);
    });

    it("desconto por falta: cada dia 'sem_registo' vira uma falta NAO justificada com o defice do dia, e a chave so conta faltas marcadas", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const faltas = result.current.totais.faltasParaDesconto ?? [];
      expect(faltas.map((f) => f.data)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15"]);
      for (const f of faltas) {
        expect(f).toMatchObject({ minutos: 540, estado: "activa", justificacao_estado: "sem_justificacao", remunerada: false, semRegisto: true });
      }
      // Nao ha faltas marcadas (pessoas_faltas): a chave de conferencia do fecho fica vazia.
      expect(result.current.totais.faltasChave).toBe("");
    });

    it("com a falta justificada e paga (justificacao do dia aprovada) o dia deixa de ser 'sem_registo' e a falta entra com o seu estado", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
      tabelas.pessoas_faltas = ["2026-09-01", "2026-09-08", "2026-09-15"].map((data, n) => ({
        id: `f${n}`, pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, data, planeado_id: null, vinculo_id: null, local_id: null,
        hora_inicio: "09:00", hora_fim: "18:00", minutos: 540, motivo_codigo: "ausencia_nao_comunicada",
        justificacao_estado: "justificada", justificada: true, remunerada: true, desconta_saldo: false,
        justificacao_decidida_por: null, justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null,
        corrige_falta_id: null, correccao_motivo: null, estado: "activa", anulado_em: null, anulacao_motivo: null,
        created_at: "2026-09-16T09:00:00Z",
      }));

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const faltas = result.current.totais.faltasParaDesconto ?? [];
      expect(faltas).toHaveLength(3);
      expect(faltas.every((f) => f.justificacao_estado === "justificada" && f.remunerada && !f.semRegisto)).toBe(true);
      expect(result.current.totais.faltasChave).not.toBe("");
    });

    it("dia com falta ANULADA e sem picagem esta tratado: nao e sem_registo, nao desconta e nao ha aviso; sem falta nenhuma continua a descontar", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
      tabelas.pessoas_faltas = [
        {
          id: "f-anulada", pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, data: "2026-09-01", planeado_id: null, vinculo_id: null,
          local_id: null, hora_inicio: "09:00", hora_fim: "18:00", minutos: 540, motivo_codigo: "ausencia_nao_comunicada",
          justificacao_estado: "sem_justificacao", justificada: false, remunerada: false, desconta_saldo: false,
          justificacao_decidida_por: null, justificacao_decidida_em: null, justificacao_motivo: null, ausencia_dia_id: null,
          corrige_falta_id: null, correccao_motivo: null, estado: "anulada", anulado_em: "2026-09-02T10:00:00Z",
          anulacao_motivo: "marcada por engano", created_at: "2026-09-01T18:00:00Z",
        },
      ];

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.dias.find((d) => d.iso === "2026-09-01")?.estado).not.toBe("sem_registo");
      const faltas = result.current.totais.faltasParaDesconto ?? [];
      // O dia anulado nao desconta; os outros dois (08 e 15, sem falta nenhuma) descontam como sem picagem.
      expect(faltas.map((f) => f.data)).toEqual(["2026-09-08", "2026-09-15"]);
      expect(faltas.every((f) => f.semRegisto === true && f.minutos === 540)).toBe(true);
      // Uma anulacao nova invalida o calculo: a chave ja nao e a de "sem faltas".
      expect(result.current.totais.faltasChave).not.toBe("");
    });

    it("meio dia de ausencia remunerada limita as faltas desse dia ao que a ausencia nao cobre; dia inteiro limita a 0", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
      const ausencia = (data: string, fraccao_dia: number) => ({
        id: `ad-${data}`, pedido_id: "ped1", pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, tipo_id: "tipo-ferias", data,
        fraccao_dia, conta_saldo: true, e_feriado: false, e_fim_semana: false, periodo_inicio: data, estado: "aprovado",
      });
      tabelas.pessoas_ausencias_dias = [ausencia("2026-09-01", 0.5), ausencia("2026-09-08", 1)];
      tabelas.hr_ausencias_tipos = [
        { id: "tipo-ferias", organization_id: ORG_ACTIVA, codigo: "ferias", nome: "Ferias", categoria: "ferias", remunerada: true },
      ];

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.totais.limiteFaltaPorDia).toEqual({ "2026-09-01": 270, "2026-09-08": 0 });
      // 09-08 (ausencia total paga) esta explicado; 09-01 (meio dia pago, outra metade sem picagem) so desconta a metade por explicar.
      const semRegisto = (result.current.totais.faltasParaDesconto ?? []).filter((f) => f.semRegisto).map((f) => [f.data, f.minutos]);
      expect(semRegisto).toEqual([["2026-09-01", 270], ["2026-09-15", 540]]);
    });
    it("um dia FUTURO com planeado e zero realizado nao entra em 'sem_registo' -- ainda pode vir a ter picagem", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // tercas, incl. 22 e 29 (futuro)

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const diaFuturo = result.current.dias.find((d) => d.iso === "2026-09-22");
      expect(diaFuturo?.estado).toBe("normal");
    });

    it("um dia PASSADO com falta PARCIAL do planeado (realizado > 0 mas < planeado), sem falta registada, tambem fica 'sem_registo'", async () => {
      // 2026-09-01, terca, passada: excepcao por data (nao semanal, para nao
      // repetir o buraco nas outras tercas do mes) em dois blocos, so o
      // primeiro foi picado.
      tabelas.pessoas_horario_planeado = [
        { ...planeadoSemanal(2, "06:00", "08:00"), id: "pl-2-a", data: "2026-09-01", ordem: 1 },
        { ...planeadoSemanal(2, "17:00", "19:00"), id: "pl-2-b", data: "2026-09-01", ordem: 2 },
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
          hora_inicio: "06:00",
          hora_fim: "08:00",
          minutos: 120,
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

      const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
      expect(dia1?.planeadoMinutos).toBe(240); // 06:00-08:00 + 17:00-19:00
      expect(dia1?.realizadoMinutos).toBe(120); // so o primeiro bloco
      expect(dia1?.estado).toBe("sem_registo");
      // Picagem parcial sem falta registada -- falta incompleta por
      // esclarecer, nao registada.
      expect(result.current.totais.diasComFaltaIncompleta).toBe(1);
      expect(result.current.totais.diasComFaltaIncompletaRegistada).toBe(0);
    });

    it("uma ausencia aprovada PARCIAL (fraccao_dia 0.5) sem picagem na outra metade: o dia e 'sem_registo' so pela metade por explicar", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 2026-09-01, terca, passado
      tabelas.pessoas_ausencias_dias = [
        {
          id: "ad1",
          pedido_id: "ped1",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          tipo_id: "tipo-consulta",
          data: "2026-09-01",
          fraccao_dia: 0.5,
          conta_saldo: true,
          e_feriado: false,
          e_fim_semana: false,
          periodo_inicio: "2026-09-01",
          estado: "aprovado",
        },
      ];
      tabelas.hr_ausencias_tipos = [
        {
          id: "tipo-consulta",
          organization_id: ORG_ACTIVA,
          codigo: "consulta",
          nome: "Consulta medica",
          categoria: "doenca",
          remunerada: true,
        },
      ];

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
      expect(dia1?.realizadoMinutos).toBe(0);
      expect(dia1?.estado).toBe("sem_registo");
      // So a outra metade (270 de 540) desconta: a metade paga nao.
      const doDia = (result.current.totais.faltasParaDesconto ?? []).filter((f) => f.data === "2026-09-01");
      expect(doDia).toHaveLength(1);
      expect(doDia[0]).toMatchObject({ minutos: 270, semRegisto: true });
      expect(result.current.totais.limiteFaltaPorDia?.["2026-09-01"]).toBe(270);
    });

    describe("ausencia NAO remunerada desconta o planeado coberto", () => {
      const ausenciaDia = (data: string, fraccao_dia: number, tipo_id: string) => ({
        id: `ad-${data}`, pedido_id: "ped1", pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, tipo_id, data, fraccao_dia,
        conta_saldo: true, e_feriado: false, e_fim_semana: false, periodo_inicio: data, estado: "aprovado",
      });
      const tipos = [
        { id: "tipo-paga", organization_id: ORG_ACTIVA, codigo: "ferias", nome: "Ferias", categoria: "ferias", remunerada: true },
        { id: "tipo-sem-vencimento", organization_id: ORG_ACTIVA, codigo: "licenca", nome: "Licenca sem vencimento", categoria: "outro", remunerada: false },
      ];

      it("dia inteiro de licenca sem vencimento: falta sintetica nao paga com o planeado do dia; paga: nenhuma", async () => {
        tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
        tabelas.pessoas_ausencias_dias = [ausenciaDia("2026-09-01", 1, "tipo-sem-vencimento"), ausenciaDia("2026-09-08", 1, "tipo-paga")];
        tabelas.hr_ausencias_tipos = tipos;
        const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const faltas = result.current.totais.faltasParaDesconto ?? [];
        expect(faltas.filter((f) => f.data === "2026-09-01")).toEqual([
          expect.objectContaining({ minutos: 540, ausenciaNaoPaga: true, justificacao_estado: "sem_justificacao", remunerada: false }),
        ]);
        expect(faltas.filter((f) => f.data === "2026-09-08")).toEqual([]);
        expect(result.current.totais.limiteFaltaPorDia).toEqual({ "2026-09-01": 540, "2026-09-08": 0 });
      });

      it("meio dia nao pago (outra metade picada): 270 min; meio dia pago (outra metade picada): nenhum", async () => {
        tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
        tabelas.pessoas_ausencias_dias = [ausenciaDia("2026-09-01", 0.5, "tipo-sem-vencimento"), ausenciaDia("2026-09-08", 0.5, "tipo-paga")];
        tabelas.hr_ausencias_tipos = tipos;
        tabelas.pessoas_horario_realizado = ["2026-09-01", "2026-09-08"].map((data) => ({
          id: `r-${data}`, pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, vinculo_id: null, local_id: null, planeado_id: null, data,
          hora_inicio: "09:00", hora_fim: "13:30", minutos: 270, origem: "picagem", estado: "fechado", validado_por: null,
          validado_em: null, motivo_rejeicao: null, notas: null, corrige_realizado_id: null, correccao_motivo: null,
          corrigido_por_pessoa_id: null, deleted_at: null,
        }));
        const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const faltas = result.current.totais.faltasParaDesconto ?? [];
        expect(faltas.filter((f) => f.data === "2026-09-01").map((f) => [f.minutos, f.ausenciaNaoPaga])).toEqual([[270, true]]);
        expect(faltas.filter((f) => f.data === "2026-09-08")).toEqual([]);
      });
    });

    it("picagem PARCIAL num dia sem falta: a falta sintetica e um atraso (tolerancia) e nao conta como dia sem picagem", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
      tabelas.pessoas_horario_realizado = [
        {
          id: "r-parcial", pessoa_id: PESSOA_ID, organization_id: ORG_ACTIVA, vinculo_id: null, local_id: null, planeado_id: null,
          data: "2026-09-01", hora_inicio: "09:00", hora_fim: "17:57", minutos: 537, origem: "picagem", estado: "fechado",
          validado_por: null, validado_em: null, motivo_rejeicao: null, notas: null, corrige_realizado_id: null,
          correccao_motivo: null, corrigido_por_pessoa_id: null, deleted_at: null,
        },
      ];
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const doDia = (result.current.totais.faltasParaDesconto ?? []).filter((f) => f.data === "2026-09-01");
      expect(doDia).toEqual([expect.objectContaining({ minutos: 3, motivo_codigo: "atraso", semRegisto: false })]);
    });
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
    // Planeado (540) e realizado (480) diferem de proposito para provar que
    // nunca se fundem -- mas a diferenca tem de vir explicada por uma falta,
    // senao o dia (ja passado) cai em "sem_registo" e a asserção de "normal"
    // deixa de ser valida.
    tabelas.pessoas_faltas = [
      {
        id: "f1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        data: "2026-09-01",
        planeado_id: null,
        vinculo_id: null,
        local_id: null,
        hora_inicio: "17:00",
        hora_fim: "18:00",
        minutos: 60,
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
        remunerada: true,
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.estado).toBe("ausencia");
    expect(dia1?.categoriaAusencia).toBe("ferias");
  });

  it("um dia de ferias aprovado de dia inteiro entra em minutosAusenciaRemunerada, sem sair de planeadoMinutos", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
        remunerada: true,
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Guarda anti-regressao contra a opcao (a) descartada no desenho: o dia
    // de ferias continua a contar como planeado (a base a hora paga-o).
    expect(result.current.totais.planeadoMinutos).toBeGreaterThanOrEqual(540);
    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.planeadoMinutos).toBe(540);
    expect(result.current.totais.minutosAusenciaRemunerada).toBe(540);
  });

  it("um dia de ferias aprovado com picagem NESSE MESMO dia so entra em minutosAusenciaRemunerada pelo defice, nunca pelo planeado inteiro", async () => {
    // Regressao do bloqueante: picagem num dia de ferias nao pode dar credito
    // a faltas de OUTROS dias. Setembro/2026, tercas planeadas 9h-18h (540
    // min): dia 01 tem ferias aprovadas de dia inteiro E picagem completa
    // (540 min); os restantes dias ficam sem picagem (faltas reais).
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min, todas as tercas
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
        remunerada: true,
      },
    ];
    // Picagem completa no PROPRIO dia de ferias -- e este picado que nao
    // pode ser contado a dobrar (uma vez em realizadoMinutos, outra vez em
    // minutosAusenciaRemunerada via planeadoMinutos inteiro).
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
        hora_fim: "18:00",
        minutos: 540,
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

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.planeadoMinutos).toBe(540);
    expect(dia1?.realizadoMinutos).toBe(540); // o dado em si continua guardado no dia

    // Picagem completa no dia de ferias cobre todo o planeado -- o defice
    // desse dia e zero, por isso NAO pode entrar no desconto de faltas.
    expect(result.current.totais.minutosAusenciaRemunerada).toBe(0);
  });

  it("um dia de ferias aprovado com picagem PARCIAL nesse mesmo dia so credita o defice, nao o planeado inteiro", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
        remunerada: true,
      },
    ];
    // So picou metade do dia de ferias (270 de 540) -- o defice deste dia e
    // 270, e e so isso que pode entrar no desconto de faltas.
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
        hora_fim: "13:30",
        minutos: 270,
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

    expect(result.current.totais.minutosAusenciaRemunerada).toBe(270); // 540 - 270
  });

  it("uma ausencia aprovada com remunerada: false nao entra em minutosAusenciaRemunerada", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
    tabelas.pessoas_ausencias_dias = [
      {
        id: "ad1",
        pedido_id: "ped1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        tipo_id: "tipo-sem-retribuicao",
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
        id: "tipo-sem-retribuicao",
        organization_id: ORG_ACTIVA,
        codigo: "sem_retribuicao",
        nome: "Ausencia sem retribuicao",
        categoria: "sem_retribuicao",
        remunerada: false,
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totais.minutosAusenciaRemunerada).toBe(0);
  });

  it("uma ausencia aprovada PARCIAL (fraccao_dia 0.5) nao entra em minutosAusenciaRemunerada", async () => {
    // Documenta a lacuna conhecida: ausencia parcial nao substitui o dia
    // (estado !== 'ausencia'), por isso tambem nao neutraliza o desconto.
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
    tabelas.pessoas_ausencias_dias = [
      {
        id: "ad1",
        pedido_id: "ped1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        tipo_id: "tipo-ferias",
        data: "2026-09-01",
        fraccao_dia: 0.5,
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
        remunerada: true,
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totais.minutosAusenciaRemunerada).toBe(0);
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

  it("guarda os intervalos planeados e realizados do dia, nao so o total em minutos", async () => {
    tabelas.pessoas_horario_planeado = [
      { ...planeadoSemanal(2, "09:00", "12:00"), id: "pl-2-a", ordem: 1 },
      { ...planeadoSemanal(2, "13:00", "18:00"), id: "pl-2-b", ordem: 2 },
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
        hora_fim: "13:00",
        minutos: 240,
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
      {
        id: "r2",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-01",
        hora_inicio: "14:00",
        hora_fim: "18:00",
        minutos: 240,
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

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.planeadoIntervalos).toEqual([
      { hora_inicio: "09:00", hora_fim: "12:00" },
      { hora_inicio: "13:00", hora_fim: "18:00" },
    ]);
    // O almoco foi picado a horas diferentes do planeado -- 13:00-14:00, nao 12:00-13:00.
    expect(dia1?.realizadoIntervalos).toEqual([
      { hora_inicio: "09:00", hora_fim: "13:00" },
      { hora_inicio: "14:00", hora_fim: "18:00" },
    ]);
  });

  it("horasExtraMinutos e o excedente do realizado sobre o planeado, nunca negativo", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
        hora_fim: "19:00", // saiu 1h mais tarde: 600 min
        minutos: 600,
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

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.horasExtraMinutos).toBe(60);

    const dia2 = result.current.dias.find((d) => d.iso === "2026-09-02"); // sem realizado, so falta
    expect(dia2?.horasExtraMinutos).toBe(0);
  });

  it("trabalhar um feriado sem horario nenhum planeado conta tudo como horas extra", async () => {
    tabelas.pessoas_horario_planeado = [diaDeFolga(1)]; // segunda, sem horario
    tabelas.schedule_holidays = [{ holiday_date: "2026-09-07", is_recurring: false }];
    tabelas.pessoas_horario_realizado = [
      {
        id: "r1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-07",
        hora_inicio: "09:00",
        hora_fim: "13:00",
        minutos: 240,
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

    const feriado = result.current.dias.find((d) => d.iso === "2026-09-07");
    expect(feriado?.estado).toBe("feriado");
    expect(feriado?.horasExtraMinutos).toBe(240);
    expect(result.current.totais.diasFeriadoTrabalhados).toBe(1);
  });

  it("falta completa (cobre todo o planeado) e falta incompleta (cobre so parte) contam-se em separado", async () => {
    // Fixa "hoje" no primeiro dia do mes: sem isto, as outras tercas/quartas
    // do mes (sem falta nenhuma) tambem ficam "sem_registo" e entram nos
    // totais, poluindo a contagem que este teste quer isolar.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T12:00:00"));

    tabelas.pessoas_horario_planeado = [
      planeadoSemanal(2, "09:00", "18:00"), // terca, 2026-09-01, 540 min
      planeadoSemanal(3, "09:00", "18:00"), // quarta, 2026-09-02, 540 min
    ];
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
        hora_fim: "18:00",
        minutos: 540, // falta completa
        motivo_codigo: "falta_total",
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
      {
        id: "f2",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        data: "2026-09-02",
        planeado_id: null,
        vinculo_id: null,
        local_id: null,
        hora_inicio: "09:00",
        hora_fim: "11:00",
        minutos: 120, // falta incompleta (so 120 de 540)
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
        created_at: "2026-09-02T09:00:00Z",
      },
    ];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totais.diasComFaltaCompleta).toBe(1);
    expect(result.current.totais.diasComFaltaCompletaRegistada).toBe(1);
    expect(result.current.totais.diasComFaltaIncompleta).toBe(1);
    expect(result.current.totais.diasComFaltaIncompletaRegistada).toBe(1);

    vi.useRealTimers();
  });

  describe("falta completa/incompleta juntam o registado e o sem_registo no mesmo total", () => {
    beforeEach(() => {
      // "sem_registo" so existe para dias PASSADOS -- fixa "hoje" logo depois
      // do 2o dia de teste (2026-09-08) e ANTES da 3a terca do mes
      // (2026-09-15), para essa nao entrar como "sem_registo" extra e poluir
      // a contagem que este teste quer isolar a dois dias.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-09T12:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("uma falta completa REGISTADA + um dia de falta completa SEM registo somam no mesmo total", async () => {
      tabelas.pessoas_horario_planeado = [
        planeadoSemanal(2, "09:00", "18:00"), // terca, 2026-09-01 e 2026-09-08 (540 min cada)
      ];
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
          hora_fim: "18:00",
          minutos: 540,
          motivo_codigo: "falta_total",
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
      // 2026-09-08: mesmo planeado, zero picagem, sem falta registada -- fica
      // "sem_registo" (falta completa por tratar).

      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const diaRegistado = result.current.dias.find((d) => d.iso === "2026-09-01");
      const diaSemRegisto = result.current.dias.find((d) => d.iso === "2026-09-08");
      expect(diaRegistado?.temFalta).toBe(true);
      expect(diaSemRegisto?.estado).toBe("sem_registo");

      expect(result.current.totais.diasComFaltaCompleta).toBe(2);
      expect(result.current.totais.diasComFaltaCompletaRegistada).toBe(1);
    });

    it("uma falta incompleta REGISTADA + um dia de falta incompleta SEM registo somam no mesmo total", async () => {
      tabelas.pessoas_horario_planeado = [
        { ...planeadoSemanal(2, "09:00", "18:00"), id: "pl-2-a", data: "2026-09-01", ordem: 1 },
        { ...planeadoSemanal(2, "09:00", "18:00"), id: "pl-2-b", data: "2026-09-08", ordem: 1 },
      ];
      tabelas.pessoas_horario_realizado = [
        {
          id: "r1",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          vinculo_id: null,
          local_id: null,
          planeado_id: null,
          data: "2026-09-08",
          hora_inicio: "09:00",
          hora_fim: "13:00",
          minutos: 240, // picagem parcial, sem falta registada -- "sem_registo"
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
      tabelas.pessoas_faltas = [
        {
          id: "f2",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          data: "2026-09-01",
          planeado_id: null,
          vinculo_id: null,
          local_id: null,
          hora_inicio: "09:00",
          hora_fim: "11:00",
          minutos: 120, // falta incompleta registada (so 120 de 540)
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

      const diaRegistado = result.current.dias.find((d) => d.iso === "2026-09-01");
      const diaSemRegisto = result.current.dias.find((d) => d.iso === "2026-09-08");
      expect(diaRegistado?.temFalta).toBe(true);
      expect(diaSemRegisto?.estado).toBe("sem_registo");

      expect(result.current.totais.diasComFaltaIncompleta).toBe(2);
      expect(result.current.totais.diasComFaltaIncompletaRegistada).toBe(1);
    });
  });

  it("trabalhar durante uma ausencia aprovada de dia inteiro nao entra nos totais de horas extra nem de dias trabalhados", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
    // Picou 1h durante as ferias aprovadas -- nao devia poluir os totais do mes.
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
        hora_fim: "10:00",
        minutos: 60,
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

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.estado).toBe("ausencia");
    expect(dia1?.realizadoMinutos).toBe(60); // o dado em si continua guardado no dia
    // Mas os totais do mes tem de ficar como se o dia nao tivesse trabalho,
    // porque a UI nunca mostra este trabalho (ausencia fica sempre escondida).
    expect(result.current.totais.horasExtraMinutos).toBe(0);
    expect(result.current.totais.diasTrabalhados).toBe(0);
  });

  it("horas extra inteiramente de dia nao tem parte nocturna", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
    tabelas.pessoas_horario_realizado = [
      {
        id: "r1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-01",
        hora_inicio: "08:00",
        hora_fim: "18:00", // entrou 1h mais cedo, tudo de dia
        minutos: 600,
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

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.horasExtraMinutos).toBe(60);
    expect(dia1?.horasExtraNoturnasMinutos).toBe(0);
  });

  it("horas extra que atravessam as 22:00 tem parte nocturna maior que zero mas menor que o total", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
        hora_fim: "23:00", // saiu 5h mais tarde, 1h delas depois das 22:00
        minutos: 840,
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

    const dia1 = result.current.dias.find((d) => d.iso === "2026-09-01");
    expect(dia1?.horasExtraMinutos).toBe(300); // 840 - 540
    expect(dia1?.horasExtraNoturnasMinutos).toBe(60); // so 22:00-23:00
    expect(dia1?.horasExtraNoturnasMinutos).toBeGreaterThan(0);
    expect(dia1?.horasExtraNoturnasMinutos).toBeLessThan(dia1?.horasExtraMinutos ?? 0);
  });

  it("um turno nocturno inteiro batido como extra (sem planeado) tem horasExtraNoturnasMinutos igual ao total", async () => {
    tabelas.pessoas_horario_planeado = [diaDeFolga(1)]; // segunda, sem horario planeado
    tabelas.pessoas_horario_realizado = [
      {
        id: "r1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-07", // segunda-feira
        hora_inicio: "23:00",
        hora_fim: "23:59", // "pessoas_horario_realizado" nunca atravessa a meia-noite: uma linha por dia
        minutos: 59,
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

    const dia = result.current.dias.find((d) => d.iso === "2026-09-07");
    expect(dia?.horasExtraMinutos).toBe(59); // sem planeado, tudo conta como extra
    expect(dia?.horasExtraNoturnasMinutos).toBe(dia?.horasExtraMinutos);
  });

  it("um dia com falta registada nao vira 'sem_registo' -- a falta ja explica o buraco", async () => {
    tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
        hora_fim: "18:00",
        minutos: 540,
        motivo_codigo: "falta_total",
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
    expect(dia1?.estado).not.toBe("sem_registo");
    expect(dia1?.estado).toBe("normal");
  });

  it("um feriado ou descanso sem trabalho continua 'feriado'/'descanso', nunca 'sem_registo'", async () => {
    tabelas.pessoas_horario_planeado = [diaDeFolga(1)]; // segunda, sem horario
    tabelas.schedule_holidays = [{ holiday_date: "2026-09-07", is_recurring: false }];

    const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const feriado = result.current.dias.find((d) => d.iso === "2026-09-07"); // segunda com feriado
    expect(feriado?.estado).toBe("feriado");
    const descanso = result.current.dias.find((d) => d.iso === "2026-09-14"); // segunda sem feriado
    expect(descanso?.estado).toBe("descanso");
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

  describe("decomposicao das horas extra por tipo de dia (feriado / descanso / normal)", () => {
    it("um mes sem feriado nem descanso trabalhado: os dois baldes ficam 0 e o extra normal e o total", async () => {
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")]; // 540 min
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
          hora_fim: "19:00", // 1h a mais, tudo em dia normal
          minutos: 600,
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

      expect(result.current.totais.minutosFeriadoTrabalhado).toBe(0);
      expect(result.current.totais.minutosDescansoTrabalhado).toBe(0);
      expect(result.current.totais.minutosExtraNormal).toBe(result.current.totais.horasExtraMinutos);
    });

    it("um mes so com feriado trabalhado: o balde de feriado recebe tudo, descanso e extra normal ficam 0", async () => {
      tabelas.pessoas_horario_planeado = [diaDeFolga(1)]; // segunda, sem horario planeado
      tabelas.schedule_holidays = [{ holiday_date: "2026-09-07", is_recurring: false }];
      tabelas.pessoas_horario_realizado = [
        {
          id: "r1",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          vinculo_id: null,
          local_id: null,
          planeado_id: null,
          data: "2026-09-07",
          hora_inicio: "09:00",
          hora_fim: "13:00",
          minutos: 240,
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

      expect(result.current.totais.minutosFeriadoTrabalhado).toBe(240);
      expect(result.current.totais.minutosDescansoTrabalhado).toBe(0);
      expect(result.current.totais.minutosExtraNormal).toBe(0);
      expect(result.current.totais.horasExtraMinutos).toBe(240);
    });

    it("invariante: feriado trabalhado + descanso trabalhado + extra normal, no mesmo mes, somam sempre horasExtraMinutos", async () => {
      tabelas.pessoas_horario_planeado = [
        planeadoSemanal(2, "09:00", "18:00"), // terca (dia normal, 2026-09-01, 08, 15, 22, 29)
        diaDeFolga(0), // domingo -- descanso (2026-09-06, 13, 20, 27)
      ];
      // Feriado numa segunda sem horario planeado -- 240 min todos excedente.
      tabelas.schedule_holidays = [{ holiday_date: "2026-09-07", is_recurring: false }];
      tabelas.pessoas_horario_realizado = [
        {
          id: "r-feriado",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          vinculo_id: null,
          local_id: null,
          planeado_id: null,
          data: "2026-09-07", // segunda, feriado
          hora_inicio: "09:00",
          hora_fim: "13:00",
          minutos: 240,
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
        {
          id: "r-descanso",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          vinculo_id: null,
          local_id: null,
          planeado_id: null,
          data: "2026-09-06", // domingo, descanso
          hora_inicio: "10:00",
          hora_fim: "12:00",
          minutos: 120,
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
        {
          id: "r-normal",
          pessoa_id: PESSOA_ID,
          organization_id: ORG_ACTIVA,
          vinculo_id: null,
          local_id: null,
          planeado_id: null,
          data: "2026-09-01", // terca normal, 1h de excedente
          hora_inicio: "09:00",
          hora_fim: "19:00",
          minutos: 600,
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

      const { totais } = result.current;
      expect(totais.minutosFeriadoTrabalhado).toBe(240);
      expect(totais.minutosDescansoTrabalhado).toBe(120);
      expect(totais.minutosExtraNormal).toBe(60);
      expect(
        totais.minutosExtraNormal + totais.minutosFeriadoTrabalhado + totais.minutosDescansoTrabalhado,
      ).toBe(totais.horasExtraMinutos);
    });
  });

  describe("margem de tempo (desvios): sem margem tudo igual a antes; com margem contam as decisoes", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-16T12:00:00"));
      tabelas.pessoas_horario_planeado = [planeadoSemanal(2, "09:00", "18:00")];
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const realizadoDe = (inicio: string, fim: string, minutos: number) => [
      {
        id: "r1",
        pessoa_id: PESSOA_ID,
        organization_id: ORG_ACTIVA,
        vinculo_id: null,
        local_id: null,
        planeado_id: null,
        data: "2026-09-01",
        hora_inicio: inicio,
        hora_fim: fim,
        minutos,
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
    const versao = (margem: number | null) => ({
      id: "v1",
      margem_min: margem,
      valido_de: "2026-01-01",
      valido_ate: null,
      substituida_em: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    const configurar = (margem: number | null, desvios: unknown[] = []) => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: { em_vigor: versao(margem), versoes: [versao(margem)] }, error: null };
      rpcPorFuncao.rpc_hr_desvios_listar = { data: desvios, error: null };
    };
    const linhaDesvio = (extra: Record<string, unknown>) => ({
      id: "dv1",
      pessoa_id: PESSOA_ID,
      data: "2026-09-01",
      estado: "a_validar",
      natureza: "hora_extra",
      tipo_horario: "padrao",
      margem_min: 10,
      planeado_min: 540,
      realizado_min: 600,
      fora_min: 60,
      em_falta_min: 0,
      diferenca_min: 60,
      desvio_horario_min: 0,
      realizado_inicio: "09:00:00",
      realizado_fim: "19:00:00",
      decisao: null,
      ...extra,
    });
    const dia1 = (r: { current: { dias: Array<{ iso: string }> } }) => r.current.dias.find((d) => d.iso === "2026-09-01") as any;

    it("SEM margem configurada o caso 9:30-18:30 sai como sempre: conta o realizado, sem extra, sem desvio, sem ler desvios", async () => {
      tabelas.pessoas_horario_realizado = realizadoDe("09:30", "18:30", 540);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const dia = dia1(result);
      expect(dia.realizadoMinutos).toBe(540);
      expect(dia.contadoMinutos).toBe(540);
      expect(dia.horasExtraMinutos).toBe(0);
      expect(dia.desvio).toBeNull();
      expect(result.current.totais.horasExtraMinutos).toBe(0);
      expect(result.current.totais.margemConfigurada).toBe(false);
      expect(result.current.totais.diasPorValidar).toBe(0);
      expect(rpcChamadas.some((c) => c.fn === "rpc_hr_desvios_listar")).toBe(false);
    });

    it("SEM margem o excesso continua a ser hora extra em bruto (10 h picadas contra 9 h planeadas)", async () => {
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(dia1(result).horasExtraMinutos).toBe(60);
      expect(dia1(result).contadoMinutos).toBe(600);
      expect(result.current.totais.horasExtraMinutos).toBe(60);
      expect(result.current.totais.minutosExtraNormal).toBe(60);
    });

    it("uma versao «sem margem» (null) tambem deixa tudo como antes", async () => {
      configurar(null);
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(dia1(result).horasExtraMinutos).toBe(60);
      expect(result.current.totais.margemConfigurada).toBe(false);
      expect(rpcChamadas.some((c) => c.fn === "rpc_hr_desvios_listar")).toBe(false);
    });

    it("COM margem 10 e SEM linha na base (9:30-18:30): o cliente nao inventa desvio; conta como antes e le os desvios da pessoa", async () => {
      configurar(10);
      tabelas.pessoas_horario_realizado = realizadoDe("09:30", "18:30", 540);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const dia = dia1(result);
      expect(dia.realizadoMinutos).toBe(540);
      expect(dia.contadoMinutos).toBe(540);
      expect(dia.desvio).toBeNull();
      expect(result.current.totais.diasPorValidar).toBe(0);
      expect(result.current.totais.margemConfigurada).toBe(true);
      expect(result.current.totais.desviosChave).toBe("");
      const chamada = rpcChamadas.find((c) => c.fn === "rpc_hr_desvios_listar");
      expect(chamada?.args).toMatchObject({ p_organization_id: ORG_ACTIVA, p_pessoa_id: PESSOA_ID, p_estado: null });
    });

    it("a chave dos desvios usados identifica a versao em vigor e a decisao (o fecho compara-a com a da base)", async () => {
      configurar(10, [linhaDesvio({ estado: "validado", decisao: "hora_extra" }), linhaDesvio({ id: "antiga", estado: "substituido" })]);
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.totais.desviosChave).toBe("2026-09-01|dv1|validado|hora_extra");
    });

    it("a margem e lida UMA vez por organizacao, mesmo com varias instancias do relatorio", async () => {
      configurar(10);
      const a = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      const b = renderHook(() => useRelatorioAssiduidadeMensal("pessoa-2", ANO, MES));
      await waitFor(() => expect(a.result.current.loading).toBe(false));
      await waitFor(() => expect(b.result.current.loading).toBe(false));
      expect(rpcChamadas.filter((c) => c.fn === "rpc_hr_desvios_config_ler")).toHaveLength(1);
    });
    it("COM margem, excesso a validar: nao conta como hora extra nem como tempo (conta o planeado, marcado)", async () => {
      configurar(10, [linhaDesvio({})]);
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(dia1(result)).toMatchObject({ realizadoMinutos: 600, contadoMinutos: 540, horasExtraMinutos: 0 });
      expect(dia1(result).desvio).toMatchObject({ id: "dv1", estado: "a_validar" });
      expect(result.current.totais.horasExtraMinutos).toBe(0);
      expect(result.current.totais.minutosExtraNormal).toBe(0);
      expect(result.current.totais.diasPorValidar).toBe(1);
    });

    it("COM margem, validado como hora extra: conta o realizado e a hora extra validada", async () => {
      configurar(10, [linhaDesvio({ estado: "validado", decisao: "hora_extra" })]);
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(dia1(result)).toMatchObject({ contadoMinutos: 600, horasExtraMinutos: 60, extraValidadoMinutos: 60 });
      expect(result.current.totais.horasExtraMinutos).toBe(60);
      expect(result.current.totais.minutosExtraNormal).toBe(60);
      expect(result.current.totais.diasPorValidar).toBe(0);
    });

    it("COM margem, aceitar o desvio de tempo a menos: conta o realizado (o defice desconta) sem extra", async () => {
      configurar(10, [linhaDesvio({ estado: "validado", decisao: "aceitar_desvio", natureza: "tempo_a_menos", realizado_min: 480, diferenca_min: -60 })]);
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "17:00", 480);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(dia1(result)).toMatchObject({ contadoMinutos: 480, horasExtraMinutos: 0 });
    });

    it("uma versao substituida de um desvio nao conta (a lista traz-as com estado «substituido»): sem linha em vigor, como antes", async () => {
      configurar(10, [linhaDesvio({ estado: "substituido", decisao: "hora_extra" })]);
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(dia1(result)).toMatchObject({ contadoMinutos: 600, horasExtraMinutos: 60 });
      expect(dia1(result).desvio).toBeNull();
    });
    it("falha ao ler a margem (nao e permissao): desviosNaoLidos e erro; nunca calcula em silencio", async () => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: null, error: { message: "falha de rede", code: "XX000" } };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.desviosNaoLidos).toBe(true);
      expect(result.current.totais.desviosNaoLidos).toBe(true);
      expect(result.current.erro).toBe(true);
    });

    it("recusa de permissao ao ler os desvios: desviosNaoLidos sem erro de leitura", async () => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: { em_vigor: versao(10), versoes: [versao(10)] }, error: null };
      rpcPorFuncao.rpc_hr_desvios_listar = { data: null, error: { message: "permission denied", code: "42501" } };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.desviosNaoLidos).toBe(true);
      expect(result.current.erro).toBe(false);
    });

    it("base sem as RPCs de desvios (migration por aplicar): sem margem, sem bloqueio", async () => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: null, error: { message: "Could not find the function public.rpc_hr_desvios_config_ler", code: "PGRST202" } };
      tabelas.pessoas_horario_realizado = realizadoDe("09:00", "19:00", 600);
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.desviosNaoLidos).toBe(false);
      expect(result.current.erro).toBe(false);
      expect(dia1(result).horasExtraMinutos).toBe(60);
    });

    it("sem permissao para ler a margem: margemRecusada, SEM bloquear (a base decide no fecho) e sem erro de leitura", async () => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: null, error: { message: "permission denied", code: "42501" } };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.desviosNaoLidos).toBe(false);
      expect(result.current.totais.margemRecusada).toBe(true);
      expect(result.current.erro).toBe(false);
    });

    it("uma funcao em falta que NAO e a chamada nao e «sem desvios»: bloqueia", async () => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: null, error: { message: "Could not find the function public.outra_funcao", code: "PGRST202" } };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.desviosNaoLidos).toBe(true);
    });

    it("se so a RPC de listar falta, mantem as versoes da margem ja lidas", async () => {
      rpcPorFuncao.rpc_hr_desvios_config_ler = { data: { em_vigor: versao(10), versoes: [versao(10)] }, error: null };
      rpcPorFuncao.rpc_hr_desvios_listar = { data: null, error: { message: "Could not find the function public.rpc_hr_desvios_listar", code: "PGRST202" } };
      const { result } = renderHook(() => useRelatorioAssiduidadeMensal(PESSOA_ID, ANO, MES));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.totais.margemConfigurada).toBe(true);
      expect(result.current.desviosNaoLidos).toBe(false);
    });  });
});

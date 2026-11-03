/**
 * A base das horas extra, simulada em memoria, para os testes dos ecras de /rh-exemplo.
 *
 * Os ecras leem e escrevem as horas extra pelo wrapper `@/components/rh-exemplo/hooks/horasExtraReal`, que fala com a base por RPC
 * e precisa de um `CompanyProvider` e de um `QueryClientProvider`. Os testes que so querem ver o ecra trocam o wrapper por este:
 *
 *   vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
 *   vi.mock("@/components/rh-exemplo/hooks/usePermissoesAssiduidade", async () => (await import("@/test/horasExtraFalso")).permissoesFalsas());
 *
 * A «base» faz o que a base faz e que o ecra ve: decidir uma linha que ja nao esta pendente recusa, rejeitar e confirmar sem
 * autorizacao ou acima do limite exigem motivo de 3 caracteres, e confirmar/rejeitar muda o estado. Nada toca em base nenhuma.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  LIMITES_OMISSAO, type EstadoHoraExtra, type HoraExtra, type LimitesHE,
} from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { ResultadoDeteccao, ResultadoRegisto } from "@/components/rh-exemplo/hooks/horasExtraReal";
import {
  DIAS_JANELA_SEMANAL, DIAS_MAX_DETECAO_ORGANIZACAO, DIAS_MAX_DETECAO_PESSOA, MAX_JANELAS_DETECAO, MOTIVO_MIN, dataHaMeses, diasDoIntervalo,
  hojeLisboa, limitesDoMes, planoDeDeteccao, type ResultadoHE, type SaldoHE,
} from "@/lib/hr/horasExtraBase";

export const baseFalsa = {
  horas: [] as HoraExtra[],
  /** Sem entrada = nao pode. */
  autorizacoes: {} as Record<string, boolean>,
  limites: { ...LIMITES_OMISSAO } as LimitesHE,
  omissao: true,
  /** Uma mensagem que as escritas devolvem em vez de gravar. */
  erroDeEscrita: null as string | null,
  /** Uma mensagem que as leituras devolvem em vez de dados. */
  erroDeLeitura: null as string | null,
  decisoes: [] as Array<{ id: string; decisao: "confirmar" | "rejeitar"; motivo: string }>,
  detecoes: [] as Array<{ de: string; ate: string; pessoaId: string | null }>,
  registos: [] as unknown[],
};

let versao = 0;
const ouvintes = new Set<() => void>();
const avisar = (): void => {
  versao += 1;
  ouvintes.forEach((o) => o());
};
const subscrever = (o: () => void): (() => void) => {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
};
const lerVersao = (): number => versao;

export function reporBaseFalsa(): void {
  baseFalsa.horas = [];
  baseFalsa.autorizacoes = {};
  baseFalsa.limites = { ...LIMITES_OMISSAO };
  baseFalsa.omissao = true;
  baseFalsa.erroDeEscrita = null;
  baseFalsa.erroDeLeitura = null;
  baseFalsa.decisoes = [];
  baseFalsa.detecoes = [];
  baseFalsa.registos = [];
  avisar();
}

export function semearHoras(horas: HoraExtra[]): void {
  baseFalsa.horas = horas;
  avisar();
}

const ok: ResultadoHE = { ok: true, erro: null };
const recusa = (erro: string): ResultadoHE => ({ ok: false, erro });

export function wrapperFalso() {
  return {
    CHAVE_HORAS_EXTRA: "hr-horas-extra",
    // As funcoes puras (datas, plano de deteccao) sao as reais.
    DIAS_JANELA_SEMANAL, DIAS_MAX_DETECAO_ORGANIZACAO, DIAS_MAX_DETECAO_PESSOA, MAX_JANELAS_DETECAO, MOTIVO_MIN,
    dataHaMeses, diasDoIntervalo, hojeLisboa, limitesDoMes, planoDeDeteccao,

    useHorasExtraListar: (f: { estado?: EstadoHoraExtra | null; pessoaId?: string | null; de?: string | null; ate?: string | null; enabled?: boolean } = {}) => {
      useSyncExternalStore(subscrever, lerVersao);
      const { estado = null, pessoaId = null, de = null, ate = null, enabled = true } = f;
      const horas = useMemo(
        () => (enabled && !baseFalsa.erroDeLeitura
          ? baseFalsa.horas.filter((h) => (!estado || h.estado === estado) && (!pessoaId || h.pessoaId === pessoaId) && (!de || h.data >= de) && (!ate || h.data <= ate))
          : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [versao, estado, pessoaId, de, ate, enabled],
      );
      return { horas, total: horas.length, aCarregar: false, erro: enabled ? baseFalsa.erroDeLeitura : null, recarregar: async () => undefined };
    },

    useHorasExtraSaldo: (pessoaId: string | null | undefined, ano: number | null = null, enabled = true) => {
      useSyncExternalStore(subscrever, lerVersao);
      if (!enabled || !pessoaId) return { saldo: null, aCarregar: false, erro: null };
      const a = ano ?? new Date().getFullYear();
      const dela = baseFalsa.horas.filter((h) => h.pessoaId === pessoaId && h.estado !== "rejeitada" && h.data.startsWith(`${a}-`));
      const total = dela.reduce((s, h) => s + h.minutos, 0);
      const limite = baseFalsa.limites.anoMin;
      const saldo: SaldoHE = {
        pessoaId, ano: a, totalAnoMin: total,
        confirmadasMin: dela.filter((h) => h.estado === "confirmada").reduce((s, h) => s + h.minutos, 0),
        pendentesMin: dela.filter((h) => h.estado === "pendente").reduce((s, h) => s + h.minutos, 0),
        limiteAnoMin: limite, limiteAnoOrigem: "organizacao", limiteDiaMin: baseFalsa.limites.diaMin, alertaPct: baseFalsa.limites.alertaPct,
        emAlerta: total >= (limite * baseFalsa.limites.alertaPct) / 100, acimaDoLimite: total > limite, restanteMin: Math.max(0, limite - total),
      };
      return { saldo, aCarregar: false, erro: baseFalsa.erroDeLeitura };
    },

    useHorasExtraConfig: (enabled = true) => {
      useSyncExternalStore(subscrever, lerVersao);
      return {
        limites: enabled && !baseFalsa.erroDeLeitura ? baseFalsa.limites : null,
        omissao: baseFalsa.omissao,
        aCarregar: false,
        aGuardar: false,
        erro: enabled ? baseFalsa.erroDeLeitura : null,
        guardar: async (n: LimitesHE): Promise<ResultadoHE> => {
          if (baseFalsa.erroDeEscrita) return recusa(baseFalsa.erroDeEscrita);
          baseFalsa.limites = n;
          baseFalsa.omissao = false;
          avisar();
          return ok;
        },
      };
    },

    useHorasExtraAutorizacoes: (enabled = true) => {
      useSyncExternalStore(subscrever, lerVersao);
      return {
        pode: (pessoaId: string): boolean => enabled && baseFalsa.autorizacoes[pessoaId] === true,
        aCarregar: false,
        aGuardar: false,
        erro: enabled ? baseFalsa.erroDeLeitura : null,
        autorizar: async (pessoaId: string, pode: boolean): Promise<ResultadoHE> => {
          if (baseFalsa.erroDeEscrita) return recusa(baseFalsa.erroDeEscrita);
          baseFalsa.autorizacoes = { ...baseFalsa.autorizacoes, [pessoaId]: pode };
          avisar();
          return ok;
        },
      };
    },

    useHorasExtraAcoes: () => ({
      aExecutar: false,
      decidir: async (id: string, decisao: "confirmar" | "rejeitar", motivo: string, exigeMotivo: boolean): Promise<ResultadoHE> => {
        if (baseFalsa.erroDeEscrita) return recusa(baseFalsa.erroDeEscrita);
        const h = baseFalsa.horas.find((x) => x.id === id);
        if (!h) return recusa("nao encontrada");
        if (h.estado !== "pendente") return recusa("ja decidida");
        if ((exigeMotivo || decisao === "rejeitar") && motivo.trim().length < 3) return recusa("motivo obrigatorio");
        baseFalsa.decisoes.push({ id, decisao, motivo });
        baseFalsa.horas = baseFalsa.horas.map((x) => (x.id === id
          ? { ...x, estado: decisao === "confirmar" ? "confirmada" : "rejeitada", motivoDecisao: motivo.trim() || null, decididoPor: "RH" }
          : x));
        avisar();
        return ok;
      },
      registar: async (p: unknown): Promise<ResultadoRegisto> => {
        baseFalsa.registos.push(p);
        return baseFalsa.erroDeEscrita
          ? { ...recusa(baseFalsa.erroDeEscrita), acimaDoLimite: false, semAutorizacao: false }
          : { ...ok, acimaDoLimite: false, semAutorizacao: false };
      },
      detetar: async (de: string, ate: string, pessoaId: string | null = null): Promise<ResultadoDeteccao> => {
        baseFalsa.detecoes.push({ de, ate, pessoaId });
        const resumo = { criadas: 0, atualizadas: 0, inalteradas: 0, jaDecididas: 0, divergentes: 0, saltadasSemHorario: 0, abaixoMinimo: 0, obsoletas: 0 };
        return { ...(baseFalsa.erroDeEscrita ? recusa(baseFalsa.erroDeEscrita) : ok), resumo, pedidos: 1, ultimoDiaOk: baseFalsa.erroDeEscrita ? null : ate, janelaFalhada: null };
      },
    }),
  };
}

/** As permissoes de assiduidade que os ecras de horas extra consultam: por omissao tudo permitido. */
export function permissoesFalsas(parcial: Record<string, boolean> = {}) {
  const todas = {
    view: true, viewOwn: true, equipaView: true, picar: true, picarOutros: true, gerir: true, corrigir: true, faltasView: true,
    faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: true, ...parcial,
  };
  return { usePermissoesAssiduidade: () => ({ permissoes: todas, loading: false }) };
}

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
import { chaveDoErroDesvios, codigoDeErroDesvios, podeSerHoraExtra } from "@/lib/hr/desviosBase";
import type { MargemLida, ResumoDeteccaoDesvios } from "@/lib/hr/desviosRpc";
import type { ResultadoDesvios } from "@/hooks/hr/useDesvios";
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
  /** O interruptor da contagem das horas extra aprovadas. */
  contagem: { aprovacaoDesde: null, folhasFechadasDesde: null, ultimaFolhaFechadaAte: null, temConfig: false } as { aprovacaoDesde: string | null; folhasFechadasDesde: string | null; ultimaFolhaFechadaAte?: string | null; temConfig: boolean },
  /** Verdadeiro: a RPC ainda nao existe na base (migration por aplicar). */
  contagemIndisponivel: false,
  /** O que o interruptor recebeu a cada gravacao (
ull desliga). */
  contagemGuardada: [] as Array<string | null>,
};

/** A margem de tempo e os desvios simulados (o wrapper real tambem os exporta: ver `desviosReal` em `horasExtraReal`). */
export const desviosBaseFalsa = {
  margem: { emVigor: null, versoes: [] } as MargemLida,
  indisponivel: false,
  /** Uma mensagem que as escritas devolvem em vez de gravar. */
  erroDeEscrita: null as string | null,
  guardados: [] as Array<{ validoDe: string; margemMin: number | null }>,
  validacoes: [] as Array<{ id: string; decisao: "normal" | "hora_extra" | "aceitar_desvio"; motivo: string }>,
  detecoes: [] as Array<{ de: string; ate: string; pessoaId: string | null }>,
  /** O que cada deteccao devolve. */
  resumoDeteccao: { diasVistos: 0, comDesvio: 0, substituidos: 0, criados: 0 } as ResumoDeteccaoDesvios,
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
  baseFalsa.contagem = { aprovacaoDesde: null, folhasFechadasDesde: null, ultimaFolhaFechadaAte: null, temConfig: false };
  baseFalsa.contagemIndisponivel = false;
  baseFalsa.contagemGuardada = [];
  desviosBaseFalsa.margem = { emVigor: null, versoes: [] };
  desviosBaseFalsa.indisponivel = false;
  desviosBaseFalsa.erroDeEscrita = null;
  desviosBaseFalsa.guardados = [];
  desviosBaseFalsa.validacoes = [];
  desviosBaseFalsa.detecoes = [];
  desviosBaseFalsa.resumoDeteccao = { diasVistos: 0, comDesvio: 0, substituidos: 0, criados: 0 };
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
        limiteAnoMin: limite, limiteAnoOrigem: "regra", limiteDiaMin: baseFalsa.limites.diaMin, alertaPct: baseFalsa.limites.alertaPct,
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

    useHorasExtraContagem: (enabled = true) => {
      useSyncExternalStore(subscrever, lerVersao);
      const lida = enabled && !baseFalsa.erroDeLeitura && !baseFalsa.contagemIndisponivel;
      return {
        estado: !enabled ? "a-carregar" : baseFalsa.contagemIndisponivel ? "indisponivel" : baseFalsa.erroDeLeitura ? "erro" : "ok",
        contagem: lida ? { ultimaFolhaFechadaAte: null, ...baseFalsa.contagem } : null,
        aGuardar: false,
        guardar: async (desde: string | null): Promise<ResultadoHE> => {
          if (baseFalsa.erroDeEscrita) return recusa(baseFalsa.erroDeEscrita);
          baseFalsa.contagemGuardada.push(desde);
          baseFalsa.contagem = { ...baseFalsa.contagem, aprovacaoDesde: desde, temConfig: true };
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

    // Margem de tempo e desvios (as funcoes puras sao as reais).
    CHAVE_DESVIOS_MARGEM: "hr-desvios-margem",
    codigoDeErroDesvios, chaveDoErroDesvios, podeSerHoraExtra,
    textoDoErroDesvios: (erro: unknown): string => String((erro as { message?: unknown })?.message ?? erro),
    lerAssinaturasDeDesvios: async (): Promise<Map<string, string>> => new Map(),
    prepararFechoComDesvios: async (): Promise<{ ok: true; assinaturas: Map<string, string> }> => ({ ok: true, assinaturas: new Map() }),
    detetarDesvios: async (): Promise<ResumoDeteccaoDesvios> => desviosBaseFalsa.resumoDeteccao,
    // Horas extra aprovadas no fecho: sem assinaturas (nao ha contagem ligada na base falsa).
    prepararFechoComHorasExtra: async (): Promise<{ ok: true; assinaturas: Map<string, string> }> => ({ ok: true, assinaturas: new Map() }),

    useDesviosMargem: (enabled = true) => {
      useSyncExternalStore(subscrever, lerVersao);
      return {
        margem: enabled ? desviosBaseFalsa.margem : null,
        aCarregar: false,
        aGuardar: false,
        indisponivel: desviosBaseFalsa.indisponivel,
        erro: null,
        guardar: async (validoDe: string, margemMin: number | null): Promise<ResultadoDesvios> => {
          if (desviosBaseFalsa.erroDeEscrita) return { ok: false, erro: desviosBaseFalsa.erroDeEscrita };
          desviosBaseFalsa.guardados.push({ validoDe, margemMin });
          return { ok: true, valor: undefined };
        },
      };
    },

    useDesviosAcoes: () => ({
      aExecutar: false,
      detetar: async (de: string, ate: string, pessoaId: string | null = null): Promise<ResultadoDesvios<ResumoDeteccaoDesvios>> => {
        desviosBaseFalsa.detecoes.push({ de, ate, pessoaId });
        if (desviosBaseFalsa.erroDeEscrita) return { ok: false, erro: desviosBaseFalsa.erroDeEscrita };
        return { ok: true, valor: desviosBaseFalsa.resumoDeteccao };
      },
      validar: async (id: string, decisao: "normal" | "hora_extra" | "aceitar_desvio", motivo = ""): Promise<ResultadoDesvios<{ id: string; pessoaId: string; data: string; decisao: "normal" | "hora_extra" | "aceitar_desvio"; contadoMin: number; extraMin: number }>> => {
        if (desviosBaseFalsa.erroDeEscrita) return { ok: false, erro: desviosBaseFalsa.erroDeEscrita };
        if (decisao === "aceitar_desvio" && motivo.trim().length < 3) return { ok: false, erro: "motivo obrigatorio" };
        desviosBaseFalsa.validacoes.push({ id, decisao, motivo });
        return { ok: true, valor: { id, pessoaId: "p", data: "2026-10-12", decisao, contadoMin: 0, extraMin: 0 } };
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

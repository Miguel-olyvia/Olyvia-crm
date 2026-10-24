/** O fim de contrato de um vinculo de exemplo: regra, renovacoes, avisos e as acoes (em memoria). */
import { useCallback, useMemo } from "react";
import { diaIso, hojeIso } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type {
  AoAtingirLimite,
  AvisoContrato,
  IndicacaoContrato,
  RegraDoContrato,
  RenovacaoContrato,
  UnidadeDuracao,
} from "@/components/rh-exemplo/lib/fimContrato";

export interface ExcepcaoContrato {
  renovacaoAutomatica: boolean | null;
  diasAviso: number | null;
  maxRenovacoes: number | null;
  duracaoValor: number | null;
  duracaoUnidade: UnidadeDuracao | null;
  aoAtingirLimite: AoAtingirLimite | null;
  motivo: string | null;
}

export type ResultadoAccao<T> = { erro: string } | { erro: null; valor: T };

const MAX_RENOVACOES = 2;
const SEM_RENOVACOES: RenovacaoContrato[] = [];
const SEM_AVISOS: AvisoContrato[] = [];
const SEM_INDICACOES: IndicacaoContrato[] = [];

export function usePessoaContratoFim(vinculoId: string | null, _organizationId: string, onMudou?: () => void) {
  const pessoaId = useEstadoRh((e) =>
    vinculoId ? (Object.values(e.fichas).find((f) => f.vinculos.some((v) => v.id === vinculoId))?.pessoa.id ?? null) : null,
  );
  const ficha = useEstadoRh((e) => (pessoaId ? (e.fichas[pessoaId] ?? null) : null));
  const renovacoes = useMemo(
    () => ficha?.renovacoes.filter((r) => r.vinculo_id === vinculoId) ?? SEM_RENOVACOES,
    [ficha, vinculoId],
  );

  const regra = useMemo<RegraDoContrato | null>(() => {
    if (!vinculoId || !ficha) return null;
    const vinculo = ficha.vinculos.find((v) => v.id === vinculoId);
    if (!vinculo || vinculo.data_fim === null) return null;
    return {
      vinculo_id: vinculoId,
      ativo: true,
      renovacao_automatica: false,
      dias_aviso: 30,
      max_renovacoes: MAX_RENOVACOES,
      duracao_valor: 6,
      duracao_unidade: "meses",
      ao_atingir_limite: "decisao_manual_rh",
      fonte: "organizacao",
      renovacoes_realizadas: renovacoes.length,
      renovacoes_restantes: Math.max(0, MAX_RENOVACOES - renovacoes.length),
      no_ambito: true,
    };
  }, [vinculoId, ficha, renovacoes]);

  const concluir = useCallback(
    <T,>(valor: T): ResultadoAccao<T> => {
      onMudou?.();
      return { erro: null, valor };
    },
    [onMudou],
  );

  const guardarExcepcao = useCallback(
    async (_excepcao: ExcepcaoContrato): Promise<ResultadoAccao<null>> => concluir(null),
    [concluir],
  );

  const renovar = useCallback(
    async (motivo: string | null): Promise<ResultadoAccao<string>> => {
      if (!pessoaId || !vinculoId) return { erro: "Sem contrato" };
      const id = novoId("rn");
      atualizarFicha(pessoaId, (f) => {
        const vinculo = f.vinculos.find((v) => v.id === vinculoId);
        if (!vinculo?.data_fim) return f;
        const nova = new Date(Date.parse(`${vinculo.data_fim}T00:00:00Z`) + 180 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        return {
          ...f,
          vinculos: f.vinculos.map((v) => (v.id === vinculoId ? { ...v, data_fim: nova } : v)),
          renovacoes: [
            ...f.renovacoes,
            {
              id,
              vinculo_id: vinculoId,
              numero: f.renovacoes.filter((r) => r.vinculo_id === vinculoId).length + 1,
              tipo: "manual",
              data_fim_anterior: vinculo.data_fim,
              data_fim_nova: nova,
              feita_em: new Date().toISOString(),
              motivo,
            },
          ],
        };
      });
      return concluir(id);
    },
    [pessoaId, vinculoId, concluir],
  );

  const terminar = useCallback(
    async (motivo: string | null): Promise<ResultadoAccao<"terminado" | "agendado">> => {
      if (!pessoaId || !vinculoId) return { erro: "Sem contrato" };
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        vinculos: f.vinculos.map((v) =>
          v.id === vinculoId ? { ...v, estado: "terminado", motivo_termo: motivo, data_fim: v.data_fim ?? diaIso(0) } : v,
        ),
        pessoa: { ...f.pessoa, data_saida: f.pessoa.data_saida ?? hojeIso() },
      }));
      return concluir("terminado");
    },
    [pessoaId, vinculoId, concluir],
  );

  return {
    regra,
    renovacoes,
    avisos: ficha?.avisos ?? SEM_AVISOS,
    indicacoes: ficha?.indicacoes ?? SEM_INDICACOES,
    loading: false,
    erroLeitura: false,
    saving: false,
    guardarExcepcao,
    renovar,
    terminar,
  };
}

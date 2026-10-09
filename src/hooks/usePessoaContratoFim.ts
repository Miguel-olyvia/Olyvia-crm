/**
 * O fim do contrato em vigor de UMA pessoa: a regra efectiva e a sua fonte, o
 * contador de renovacoes, o historico (renovacoes, avisos, indicacoes do
 * responsavel) e as tres accoes do RH -- guardar a excepcao deste contrato,
 * renovar e terminar.
 *
 * LE
 * --
 * - `rpc_hr_vinculo_regra(p_vinculo_id)`: uma linha com a regra EFECTIVA
 *   (a excepcao do contrato ou a da organizacao), `fonte`, as renovacoes
 *   realizadas e restantes e `no_ambito`. Quem a calcula e a base; o ecra nao
 *   recalcula nada.
 * - `hr_contrato_renovacoes`, `hr_contrato_avisos`, `hr_contrato_indicacoes`
 *   por SELECT (`hr.pessoas.vinculos.view`), sempre com o `organization_id`.
 *
 * ESCREVE (todas por RPC, nunca por UPDATE directo)
 * -------------------------------------------------
 * - `rpc_hr_vinculo_regra_guardar`: todos os argumentos NULL = volta a herdar;
 *   a duracao exige valor E unidade.
 * - `rpc_hr_vinculo_renovar(p_vinculo_id, p_motivo)` -> a nova data de fim.
 *   PROLONGA o mesmo contrato, nao cria outro.
 * - `rpc_hr_vinculo_terminar(p_vinculo_id, p_motivo)` -> `terminado` (a data de
 *   fim ja passou) ou `agendado`.
 * Renovar e terminar exigem `hr.pessoas.vinculos.edit` e a funcionalidade
 * ligada; o ecra esconde os botoes, mas quem decide e a base. Depois de cada
 * accao recarrega e chama `onMudou` (a data de fim do contrato pode ter mudado).
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { mensagemDeErroFimContrato } from "@/lib/hr/errosFimContrato";
import type {
  AoAtingirLimite,
  AvisoContrato,
  IndicacaoContrato,
  RegraDoContrato,
  RenovacaoContrato,
  UnidadeDuracao,
} from "@/lib/hr/fimContrato";

const COLUNAS_RENOVACAO =
  "id, vinculo_id, numero, tipo, data_fim_anterior, data_fim_nova, feita_em, motivo";
const COLUNAS_AVISO = "id, vinculo_id, ciclo_fim, marco, destino, estado, created_at";
const COLUNAS_INDICACAO = "id, vinculo_id, ciclo_fim, resposta, indicada_em";

/** A excepcao de um contrato: cada campo `null` herda da organizacao; `todos null` volta a herdar tudo. */
export interface ExcepcaoContrato {
  renovacaoAutomatica: boolean | null;
  diasAviso: number | null;
  maxRenovacoes: number | null;
  duracaoValor: number | null;
  duracaoUnidade: UnidadeDuracao | null;
  aoAtingirLimite: AoAtingirLimite | null;
  motivo: string | null;
}

/** O resultado de uma accao: texto de erro traduzido, ou `null` se correu bem (mais o dado devolvido). */
export type ResultadoAccao<T> = { erro: string } | { erro: null; valor: T };

export function usePessoaContratoFim(
  vinculoId: string | null,
  organizationId: string,
  onMudou?: () => void,
) {
  const [regra, setRegra] = useState<RegraDoContrato | null>(null);
  const [renovacoes, setRenovacoes] = useState<RenovacaoContrato[]>([]);
  const [avisos, setAvisos] = useState<AvisoContrato[]>([]);
  const [indicacoes, setIndicacoes] = useState<IndicacaoContrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroLeitura, setErroLeitura] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!vinculoId) {
      setRegra(null);
      setRenovacoes([]);
      setAvisos([]);
      setIndicacoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const filtrar = (tabela: string, colunas: string, ordem: string) =>
      hrFrom(tabela)
        .select(colunas)
        .eq("vinculo_id", vinculoId)
        .eq("organization_id", organizationId)
        .order(ordem, { ascending: false });
    const [regraRes, renovRes, avisosRes, indicRes] = await Promise.all([
      hrRpc("rpc_hr_vinculo_regra", { p_vinculo_id: vinculoId }),
      filtrar("hr_contrato_renovacoes", COLUNAS_RENOVACAO, "feita_em"),
      filtrar("hr_contrato_avisos", COLUNAS_AVISO, "created_at"),
      filtrar("hr_contrato_indicacoes", COLUNAS_INDICACAO, "indicada_em"),
    ]);

    let falhou = false;
    // Uma recusa por permissao e "nada para mostrar"; o resto e defeito.
    const tratar = (res: { error: unknown }): boolean => {
      if (!res.error) return true;
      if (!isPermissionError(res.error)) {
        captureFlowError(res.error, "hr-contrato-fim-load");
        falhou = true;
      }
      return false;
    };

    setRegra(tratar(regraRes) ? ((regraRes.data ?? [])[0] ?? null) : null);
    setRenovacoes(tratar(renovRes) ? ((renovRes.data ?? []) as RenovacaoContrato[]) : []);
    setAvisos(tratar(avisosRes) ? ((avisosRes.data ?? []) as AvisoContrato[]) : []);
    setIndicacoes(tratar(indicRes) ? ((indicRes.data ?? []) as IndicacaoContrato[]) : []);
    setErroLeitura(falhou);
    setLoading(false);
  }, [vinculoId, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Corre uma RPC de escrita: recarrega, avisa o pai e traduz o erro pelo codigo da base. */
  const executar = useCallback(
    async <T,>(
      rpc: string,
      args: Record<string, unknown>,
    ): Promise<ResultadoAccao<T>> => {
      setSaving(true);
      try {
        const { data, error } = await hrRpc(rpc, args);
        if (error) return { erro: await mensagemDeErroFimContrato(error, "hr-contrato-fim-write") };
        await load();
        onMudou?.();
        return { erro: null, valor: data as T };
      } finally {
        setSaving(false);
      }
    },
    [load, onMudou],
  );

  const guardarExcepcao = useCallback(
    (excepcao: ExcepcaoContrato) =>
      executar<null>("rpc_hr_vinculo_regra_guardar", {
        p_vinculo_id: vinculoId,
        p_renovacao_automatica: excepcao.renovacaoAutomatica,
        p_dias_aviso: excepcao.diasAviso,
        p_max_renovacoes: excepcao.maxRenovacoes,
        p_duracao_valor: excepcao.duracaoValor,
        p_duracao_unidade: excepcao.duracaoUnidade,
        p_ao_atingir_limite: excepcao.aoAtingirLimite,
        p_motivo: excepcao.motivo,
      }),
    [executar, vinculoId],
  );

  const renovar = useCallback(
    (motivo: string | null) =>
      executar<string>("rpc_hr_vinculo_renovar", { p_vinculo_id: vinculoId, p_motivo: motivo }),
    [executar, vinculoId],
  );

  const terminar = useCallback(
    (motivo: string | null) =>
      executar<"terminado" | "agendado">("rpc_hr_vinculo_terminar", {
        p_vinculo_id: vinculoId,
        p_motivo: motivo,
      }),
    [executar, vinculoId],
  );

  return {
    regra,
    renovacoes,
    avisos,
    indicacoes,
    loading,
    erroLeitura,
    saving,
    guardarExcepcao,
    renovar,
    terminar,
  };
}

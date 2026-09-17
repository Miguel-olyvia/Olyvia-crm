/**
 * Os lancamentos pontuais (premios, valores negociados -- `hr_processamento_
 * lancamentos`, 20261201230000) de UM periodo de processamento salarial.
 *
 * ESCRITA SO POR RPC, E SO ENQUANTO O PERIODO ESTIVER ABERTO
 * -------------------------------------------------------------
 * `rpc_hr_processamento_lancamento_criar` / `_anular` recusam qualquer
 * escrita se o periodo ja estiver `fechado` -- este hook nao repete essa
 * verificacao, so propaga o erro da base.
 *
 * NUNCA SE APAGA UM LANCAMENTO -- SO SE ANULA
 * -----------------------------------------------
 * Por isso nao ha `eliminar` nenhum exposto aqui, so `anular`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type { HrProcessamentoLancamento } from "@/types/hr";

const COLUNAS =
  "id, periodo_id, pessoa_id, organization_id, descricao, valor, codigo_processamento_id, " +
  "anulado_em, anulado_por, anulado_motivo, created_at, created_by, updated_at, updated_by";

export interface NovoLancamentoProcessamento {
  pessoaId: string;
  descricao: string;
  valor: number;
  codigoProcessamentoId: string | null;
}

export function useProcessamentoLancamentos(periodoId: string | undefined) {
  const [lancamentos, setLancamentos] = useState<HrProcessamentoLancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!periodoId) {
      setLancamentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("hr_processamento_lancamentos")
      .select(COLUNAS)
      .eq("periodo_id", periodoId)
      .order("created_at", { ascending: false });
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setLancamentos([]);
      } else {
        captureFlowError(error, "hr-processamento-lancamentos-load");
      }
    } else {
      setRecusado(false);
      setLancamentos((data ?? []) as HrProcessamentoLancamento[]);
    }
    setLoading(false);
  }, [periodoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const executar = useCallback(
    async (accao: () => Promise<{ data?: unknown; error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await accao();
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-processamento-lancamentos-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const criar = useCallback(
    (novo: NovoLancamentoProcessamento) =>
      executar(() => {
        if (!periodoId) return Promise.resolve({ error: new Error("Sem periodo activo") });
        return hrRpc("rpc_hr_processamento_lancamento_criar", {
          p_periodo_id: periodoId,
          p_pessoa_id: novo.pessoaId,
          p_descricao: novo.descricao,
          p_valor: novo.valor,
          p_codigo_processamento_id: novo.codigoProcessamentoId,
        });
      }),
    [executar, periodoId],
  );

  const anular = useCallback(
    (lancamentoId: string, motivo: string) =>
      executar(() =>
        hrRpc("rpc_hr_processamento_lancamento_anular", {
          p_lancamento_id: lancamentoId,
          p_motivo: motivo,
        }),
      ),
    [executar],
  );

  return {
    lancamentos,
    loading,
    saving,
    recusado,
    recarregar: load,
    criar,
    anular,
  };
}

export type ProcessamentoLancamentos = ReturnType<typeof useProcessamentoLancamentos>;

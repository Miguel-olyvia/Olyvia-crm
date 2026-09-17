/**
 * O periodo de processamento salarial (`hr_periodos_processamento`,
 * 20261201220000) de UM mes/ano da organizacao activa -- abrir e fechar.
 *
 * ESCRITA SO POR RPC
 * -------------------
 * A tabela bloqueia INSERT/UPDATE directo a `authenticated`; abrir e fechar
 * passam sempre por `rpc_hr_processamento_periodo_abrir` /
 * `rpc_hr_processamento_periodo_fechar`. Fechar e irreversivel nesta fase --
 * ver o cabecalho da migracao 20261201220000 (sem reabertura auditada ainda).
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type { HrPeriodoProcessamento } from "@/types/hr";

const COLUNAS =
  "id, organization_id, ano, mes, estado, fechado_em, fechado_por, created_at, created_by";

export function useProcessamentoPeriodo(ano: number, mes: number) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;

  const [periodo, setPeriodo] = useState<HrPeriodoProcessamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setPeriodo(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("hr_periodos_processamento")
      .select(COLUNAS)
      .eq("organization_id", orgId)
      .eq("ano", ano)
      .eq("mes", mes)
      .maybeSingle();
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setPeriodo(null);
      } else {
        captureFlowError(error, "hr-processamento-periodo-load");
      }
    } else {
      setRecusado(false);
      setPeriodo((data ?? null) as HrPeriodoProcessamento | null);
    }
    setLoading(false);
  }, [orgId, ano, mes]);

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
        if (!isPermissionError(e)) captureFlowError(e, "hr-processamento-periodo-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const abrir = useCallback(
    () =>
      executar(() => {
        if (!orgId) return Promise.resolve({ error: new Error("Sem organizacao activa") });
        return hrRpc("rpc_hr_processamento_periodo_abrir", {
          p_organization_id: orgId,
          p_ano: ano,
          p_mes: mes,
        });
      }),
    [executar, orgId, ano, mes],
  );

  const fechar = useCallback(
    () =>
      executar(() => {
        if (!periodo) return Promise.resolve({ error: new Error("Sem periodo para fechar") });
        return hrRpc("rpc_hr_processamento_periodo_fechar", { p_periodo_id: periodo.id });
      }),
    [executar, periodo],
  );

  return {
    periodo,
    loading,
    saving,
    recusado,
    recarregar: load,
    abrir,
    fechar,
  };
}

export type ProcessamentoPeriodo = ReturnType<typeof useProcessamentoPeriodo>;

/**
 * O catalogo de tipos de ausencia da organizacao activa.
 *
 * `hr_ausencias_tipos` NAO tem seed: uma organizacao acabada de criar nao tem
 * tipo nenhum, e sem tipos nao se consegue pedir absolutamente nada. Por isso
 * este hook devolve `vazio` como estado de primeira classe -- todos os ecras
 * do modulo precisam de o distinguir de "ainda a carregar" e de "sem
 * permissao para ver".
 *
 * E a UNICA tabela do modulo com escrita directa do cliente (SELECT, INSERT e
 * UPDATE; o DELETE esta bloqueado por politica restritiva, e desactivar e
 * `activo = false`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import type { AusenciaTipo } from "@/types/hrAusencias";

const COLUNAS_TIPO = [
  "id",
  "organization_id",
  "codigo",
  "nome",
  "descricao",
  "categoria",
  "cor",
  "remunerada",
  "desconta_saldo",
  "conta_minimo_legal",
  "exige_aprovacao_chefia",
  "exige_aprovacao_rh",
  "exige_justificacao",
  "justificacao_sensivel",
  "permite_meio_dia",
  "inclui_fim_de_semana",
  "inclui_feriados",
  "antecedencia_minima_dias",
  "unidade_apresentacao",
  "activo",
].join(", ");

export function useAusenciasTipos() {
  const { activeCompany } = useCompany();
  const [tipos, setTipos] = useState<AusenciaTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const orgId = activeCompany?.id;
    if (!orgId) {
      setTipos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRecusado(false);
    const { data, error } = await hrFrom("hr_ausencias_tipos")
      .select(COLUNAS_TIPO)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("nome", { ascending: true });

    if (error) {
      if (isPermissionError(error)) setRecusado(true);
      else captureFlowError(error, "hr-ausencias-load");
      setTipos([]);
    } else {
      setTipos((data ?? []) as AusenciaTipo[]);
    }
    setLoading(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const guardar = useCallback(
    async (executar: (autorId: string | null, orgId: string) => Promise<{ error: unknown }>) => {
      const orgId = activeCompany?.id;
      if (!orgId) return "—";
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        const { error } = await executar(autorId, orgId);
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-ausencias-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [activeCompany?.id, load],
  );

  const criarTipo = useCallback(
    (patch: Partial<AusenciaTipo>) =>
      guardar(async (autorId, orgId) =>
        hrFrom("hr_ausencias_tipos").insert({
          ...patch,
          organization_id: orgId,
          created_by: autorId,
          updated_by: autorId,
        }),
      ),
    [guardar],
  );

  const actualizarTipo = useCallback(
    (id: string, patch: Partial<AusenciaTipo>) =>
      guardar(async (autorId) =>
        hrFrom("hr_ausencias_tipos")
          .update({ ...patch, updated_by: autorId })
          .eq("id", id),
      ),
    [guardar],
  );

  const activos = useMemo(() => tipos.filter((tipo) => tipo.activo), [tipos]);
  const porId = useMemo(() => new Map(tipos.map((tipo) => [tipo.id, tipo])), [tipos]);

  return {
    tipos,
    activos,
    porId,
    loading,
    /** A base recusou a leitura: nao ha zero tipos, ha zero permissao. */
    recusado,
    vazio: !loading && !recusado && tipos.length === 0,
    saving,
    criarTipo,
    actualizarTipo,
    recarregar: load,
  };
}

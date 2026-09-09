/**
 * O catalogo de tipos de ausencia da organizacao activa.
 *
 * OS TIPOS SAO FIXOS, NAO CONFIGURAVEIS
 * -------------------------------------
 * `hr_ausencias_tipos` e semeada pela migration `20261122010000` -- os onze
 * tipos nascem com a organizacao, por trigger -- e fechada a escrita pela
 * `20261122020000`: so `service_role` insere ou altera. Este hook so LE.
 * Ainda assim devolve `vazio` como estado de primeira classe: uma
 * organizacao criada antes da migration, ou sem a semente ainda aplicada,
 * nao tem tipo nenhum, e sem tipos nao se consegue pedir absolutamente nada.
 * Todos os ecras do modulo precisam de o distinguir de "ainda a carregar" e
 * de "sem permissao para ver".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
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
    recarregar: load,
  };
}

/**
 * Os feriados da organizacao, prontos a consultar: a MESMA leitura que o mapa de ausencias real faz
 * (`schedule_holidays`: `holiday_date` e `is_recurring`, filtrada pela organizacao activa), numa so peca para os ecras de
 * gestao a reutilizarem. Uma leitura que falha nao passa por "nao ha feriados": `erro` e `recusado` dizem-no, e o ecra
 * mostra-o em vez de pintar os feriados como dias normais.
 */
import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { indexarFeriados, type FeriadoOrg, type IndiceFeriados } from "@/lib/hr/ausencias";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface FeriadosDaOrganizacao {
  feriados: IndiceFeriados;
  loading: boolean;
  /** A leitura falhou por outra razao que nao permissao (rede, 500, timeout). */
  erro: boolean;
  /** A base recusou a leitura a quem consulta. */
  recusado: boolean;
}

export function useFeriadosDaOrganizacao(): FeriadosDaOrganizacao {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const [feriados, setFeriados] = useState<IndiceFeriados>(() => indexarFeriados([]));
  const [loading, setLoading] = useState(Boolean(orgId));
  const [erro, setErro] = useState(false);
  const [recusado, setRecusado] = useState(false);

  useEffect(() => {
    // Mudar de organizacao nao pode deixar os feriados da anterior a passar pelos da nova.
    setFeriados(indexarFeriados([]));
    setErro(false);
    setRecusado(false);
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelado = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await hrFrom("schedule_holidays")
          .select("holiday_date, is_recurring")
          .eq("organization_id", orgId);
        if (cancelado) return;
        if (error) {
          if (isPermissionError(error)) setRecusado(true);
          else {
            captureFlowError(error, "hr-ausencias-load");
            setErro(true);
          }
          return;
        }
        setFeriados(indexarFeriados((data ?? []) as FeriadoOrg[]));
      } catch (e) {
        captureFlowError(e, "hr-ausencias-load");
        if (!cancelado) setErro(true);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [orgId]);

  return { feriados, loading, erro, recusado };
}

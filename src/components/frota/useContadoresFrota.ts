// Os contadores da Frota no menu lateral (pílulas), lidos da BD com as MESMAS chaves dos ecrãs (useDadosFrota): uma ação
// feita na Frota invalida essas chaves e as pílulas atualizam sem refrescar. Hoje = viaturas com alertas graves + multas
// por identificar; Viaturas = viaturas na frota (não vendidas/inativas); Ocorrências = multas por identificar;
// Manutenção = revisões a fazer. Só lê quando o utilizador vê a Frota (fleet.view ou fleet.self).
import { useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { alertas, ativa, multasPend, revisao, useDadosFrota, type TabelaFrota } from "./dados";
import { PERMISSOES_VER_FROTA } from "./contexto";

export type ChaveContadorFrota = "hoje" | "viaturas" | "ocorrencias" | "manutencao";

/** As dicas (title/aria-label) de cada pílula. */
export const DICA_CONTADOR_FROTA: Record<ChaveContadorFrota, string> = {
  hoje: "Alertas graves e multas por identificar",
  viaturas: "Viaturas na frota",
  ocorrencias: "Multas por identificar",
  manutencao: "Revisões a fazer",
};
/** O tom de cada pílula (vermelho no Hoje, laranja em Ocorrências e Manutenção, neutra em Viaturas). */
export const TOM_CONTADOR_FROTA: Record<ChaveContadorFrota, "bad" | "warn" | "default"> = { hoje: "bad", viaturas: "default", ocorrencias: "warn", manutencao: "warn" };

const TABELAS: readonly TabelaFrota[] = ["viaturas", "condutores", "atribuicoes", "ocorrencias"];

export function useContadoresFrota(): (k?: ChaveContadorFrota) => number | null {
  const { hasAnyPermission, loading } = usePermissions();
  const ve = !loading && hasAnyPermission(PERMISSOES_VER_FROTA);
  const { F } = useDadosFrota({ enabled: ve, tabelas: TABELAS });
  return useCallback((k?: ChaveContadorFrota) => {
    if (!k || !ve) return null;
    const vs = F.viaturas.filter(ativa);
    const n = k === "hoje" ? vs.filter((v) => alertas(F, v).some((a) => a.tom === "bad")).length + multasPend(F).length
      : k === "viaturas" ? vs.length
      : k === "ocorrencias" ? multasPend(F).length
      : vs.filter((v) => { const r = revisao(v, F.hoje); return r && r.tom !== "ok"; }).length;
    return n > 0 ? n : null;
  }, [F, ve]);
}

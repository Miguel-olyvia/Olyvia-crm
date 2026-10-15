// Os contadores da Frota de exemplo no menu lateral (pílulas), com a MESMA contagem do protótipo (contagem() em
// itensMenuFrota.ts): Hoje = alertas graves + multas por identificar; Viaturas = viaturas ativas; Ocorrências = multas
// por identificar; Manutenção = revisões a fazer. Lê a mesma loja (useSyncExternalStore): uma ação feita na Frota
// atualiza logo as pílulas, sem refrescar. Só leitura; nada da base de dados.
import { useCallback } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { contagem } from "@/pages/prototipo-negocios/frota/itensMenuFrota";
import { stockCarrinhaExemplo } from "./dados/exemplo";
import { definirOrganizacaoFrotaExemplo, useFrotaExemplo } from "./dados/loja";

export type ChaveContadorFrota = "hoje" | "viaturas" | "ocorrencias" | "manutencao";

/** As dicas (title/aria-label) de cada pílula, as do protótipo. */
export const DICA_CONTADOR_FROTA: Record<ChaveContadorFrota, string> = {
  hoje: "Alertas graves e multas por identificar",
  viaturas: "Viaturas na frota",
  ocorrencias: "Multas por identificar",
  manutencao: "Revisões a fazer",
};
/** O tom de cada pílula (vermelho no Hoje, laranja em Ocorrências e Manutenção, neutra em Viaturas). */
export const TOM_CONTADOR_FROTA: Record<ChaveContadorFrota, "bad" | "warn" | "default"> = { hoje: "bad", viaturas: "default", ocorrencias: "warn", manutencao: "warn" };

export function useContadoresFrota(): (k?: ChaveContadorFrota) => number | null {
  const { activeCompany } = useCompany();
  definirOrganizacaoFrotaExemplo(activeCompany?.id ?? null);
  const F = useFrotaExemplo();
  return useCallback((k?: ChaveContadorFrota) => {
    if (!k) return null;
    const c = contagem(F, "gestor", k, (vid) => stockCarrinhaExemplo(F.viaturas.find((v) => v.id === vid)));
    return c && c.n > 0 ? c.n : null;
  }, [F]);
}

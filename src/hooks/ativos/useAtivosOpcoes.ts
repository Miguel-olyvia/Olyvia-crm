/**
 * Os seletores do formulário de ativos (equipamentos do catálogo e centros de custo), lidos por `rpc_ativos_opcoes(p_organization_id)`:
 * exige `ativos.edit` e não depende de `services.view`. Só se pede com o painel aberto (`ligado`).
 */
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ativosIndisponivel, ativosRecusado } from "@/components/ativos/lib/errosAtivo";
import { opcoesDaResposta, type OpcoesAtivo } from "@/components/ativos/lib/tipos";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";

export const CHAVE_ATIVOS_OPCOES = "ativos-opcoes";

export interface AtivosOpcoesHook {
  opcoes: OpcoesAtivo | null;
  aCarregar: boolean;
  /** O texto traduzido da falha; `null` quando correu bem. */
  erro: string | null;
}

export function useAtivosOpcoes(ligado: boolean): AtivosOpcoesHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_ATIVOS_OPCOES, organizationId],
    enabled: ligado && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<OpcoesAtivo> => {
      try {
        const { data, error } = await hrRpc("rpc_ativos_opcoes", { p_organization_id: organizationId });
        if (error) throw error;
        return opcoesDaResposta(data);
      } catch (e) {
        if (!ativosIndisponivel(e) && !ativosRecusado(e)) captureFlowError(e, "ativos-listar");
        throw e;
      }
    },
  });
  return {
    opcoes: consulta.data ?? null,
    aCarregar: consulta.isLoading,
    erro: consulta.error ? getLocalizedFallback("ativos.opcoes.erro") : null,
  };
}

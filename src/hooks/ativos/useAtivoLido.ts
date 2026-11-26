/**
 * Um ativo lido por `rpc_ativo_ler(p_id, p_organization_id)` (`ativos.view`): o mesmo ativo da lista, mas com as ocupações já com o
 * nome da pessoa (só com `hr.pessoas.retribuicao.view`; a lista só traz o id) e o armazém ligado (só com `inventory.view`). É o que a
 * ficha de um ativo do grupo Pessoas precisa para dizer QUEM pagou cada período. Cliente tolerante: qualquer recusa ou RPC por aplicar
 * devolve `null` e a ficha fica com os dados da lista (sem nomes). Só um defeito vai para o registo de erros.
 */
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ativosIndisponivel, ativosRecusado } from "@/components/ativos/lib/errosAtivo";
import { ativoLidoDaResposta, type Ativo } from "@/components/ativos/lib/tipos";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { CHAVE_ATIVOS } from "./useAtivos";

export interface AtivoLidoHook {
  /** `null` enquanto carrega, ou se a leitura falhou ou foi recusada. */
  ativo: Ativo | null;
  aCarregar: boolean;
  /** A leitura falhou por um defeito (uma recusa por permissão ou uma RPC por aplicar não contam: aí a ficha fica como a lista). */
  falhou: boolean;
}

export function useAtivoLido(id: string | null, ligado: boolean): AtivoLidoHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    // Começa por «ativos»: qualquer escrita (que invalida «ativos») refaz também esta leitura.
    queryKey: [CHAVE_ATIVOS, "ler", organizationId, id],
    enabled: ligado && organizationId !== null && id !== null,
    retry: false,
    queryFn: async (): Promise<Ativo | null> => {
      const { data, error } = await hrRpc("rpc_ativo_ler", { p_id: id, p_organization_id: organizationId });
      if (error) {
        if (ativosIndisponivel(error) || ativosRecusado(error)) return null;
        captureFlowError(error, "ativos-listar");
        // Um defeito (e não uma recusa): a consulta falha, para a ficha poder dizer que não leu os nomes.
        throw new Error("ativos-ler");
      }
      return ativoLidoDaResposta(data);
    },
  });
  return { ativo: consulta.data ?? null, aCarregar: consulta.isLoading, falhou: consulta.isError };
}

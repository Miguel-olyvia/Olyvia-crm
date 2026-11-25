/**
 * A lista de ativos de uma organização, lida só por `rpc_ativos_listar(p_organization_id, p_incluir_desativados)` (a permissão
 * `ativos.view` e o nome das pessoas, que só sai com `hr.pessoas.retribuicao.view`, decidem-se na base). Cliente TOLERANTE:
 * a RPC por aplicar (migration ainda não empurrada) é `indisponivel`, uma recusa é `recusado` e um defeito é `erro`; só o defeito
 * vai para o registo de erros. O ecrã recebe sempre texto traduzido, nunca o código da base. O valor atual NÃO vem daqui:
 * calcula-se no ecrã (`valorAtivo.ts`).
 */
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ativosIndisponivel, ativosRecusado } from "@/components/ativos/lib/errosAtivo";
import { ativosLidosDaResposta, type AtivosLidos } from "@/components/ativos/lib/tipos";
import { hrRpc } from "@/lib/hr/hrDb";
import type { EstadoLeitura } from "@/lib/hr/resultadosFecho";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";

export const CHAVE_ATIVOS = "ativos";

interface Opcoes {
  /** Também os desativados (por omissão só os ativos). Faz parte da chave: mudá-lo volta a pedir a lista. */
  incluirDesativados?: boolean;
  /** Falso: não pede nada. */
  enabled?: boolean;
}

export interface AtivosHook {
  estado: EstadoLeitura;
  /** `null` enquanto carrega, ou quando a leitura foi recusada, falhou ou a RPC ainda não existe. */
  dados: AtivosLidos | null;
  /** O texto traduzido de uma recusa ou de uma falha; `null` quando correu bem. */
  mensagem: string | null;
  /** Sem organização ativa não há nada a ler. */
  semOrganizacao: boolean;
  refazer: () => void;
}

type Lida = AtivosLidos | "indisponivel" | "recusado";

export function useAtivos({ incluirDesativados = false, enabled = true }: Opcoes = {}): AtivosHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_ATIVOS, organizationId, incluirDesativados],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<Lida> => {
      try {
        const { data, error } = await hrRpc("rpc_ativos_listar", { p_organization_id: organizationId, p_incluir_desativados: incluirDesativados });
        if (error) throw error;
        return ativosLidosDaResposta(data);
      } catch (e) {
        if (ativosIndisponivel(e)) return "indisponivel";
        if (ativosRecusado(e)) return "recusado";
        captureFlowError(e, "ativos-listar");
        throw e;
      }
    },
  });

  const lida = consulta.data;
  const estado: EstadoLeitura = consulta.error ? "erro" : lida === "indisponivel" ? "indisponivel" : lida === "recusado" ? "recusado" : lida ? "ok" : "a_carregar";
  const mensagem = estado === "erro" ? getLocalizedFallback("ativos.erroLer") : estado === "recusado" ? getLocalizedFallback("ativos.erro.verSemPermissao") : null;
  return {
    estado,
    dados: lida && lida !== "indisponivel" && lida !== "recusado" ? lida : null,
    mensagem,
    semOrganizacao: organizationId === null,
    refazer: () => { void consulta.refetch(); },
  };
}

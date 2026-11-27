/**
 * As pessoas que saem com itens por devolver, lidas só por `rpc_ativos_por_devolver(p_organization_id, p_pessoa_id, p_dias)`. Quem vê o
 * quê decide-se na base: com o acesso completo vem a lista (pessoas, datas, itens); só com `ativos.view` ou só com
 * `hr.pessoas.vinculos.view` vêm as contagens (`detalhe = false`); pedir uma pessoa sem acesso completo é 42501.
 * Cliente TOLERANTE, como `useAtivos`: a RPC por aplicar é `indisponivel`, uma recusa é `recusado` (a resposta certa para quem não pode,
 * nunca um defeito) e um defeito é `erro`; só o defeito vai para o registo de erros. O ecrã recebe sempre texto traduzido.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ativosIndisponivel, ativosRecusado } from "@/components/ativos/lib/errosAtivo";
import { porDevolverDaResposta, type PorDevolver } from "@/components/ativos/lib/porDevolver";
import { hrRpc } from "@/lib/hr/hrDb";
import type { EstadoLeitura } from "@/lib/hr/resultadosFecho";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";

export const CHAVE_POR_DEVOLVER = "ativos-por-devolver";

interface Opcoes {
  /** A organização (a da ficha ou a ativa). Sem ela não se pede nada. */
  organizationId: string | null;
  /** Só uma pessoa (a ficha, o diálogo de Terminar). Por omissão, a organização inteira. */
  pessoaId?: string | null;
  /** O horizonte em dias (0 a 365); a base recusa o resto com ATV35. */
  dias: number;
  /** Falso: não pede nada. */
  enabled?: boolean;
}

export interface AtivosPorDevolverHook {
  estado: EstadoLeitura;
  /** `null` enquanto carrega, ou quando a leitura foi recusada, falhou ou a RPC ainda não existe. */
  dados: PorDevolver | null;
  /** O texto traduzido de uma falha; `null` quando correu bem (ou foi recusada: não é uma falha). */
  mensagem: string | null;
  aAtualizar: boolean;
  refazer: () => void;
}

type Lida = PorDevolver | "indisponivel" | "recusado";

export function useAtivosPorDevolver({ organizationId, pessoaId = null, dias, enabled = true }: Opcoes): AtivosPorDevolverHook {
  const consulta = useQuery({
    queryKey: [CHAVE_POR_DEVOLVER, organizationId, pessoaId, dias],
    enabled: enabled && organizationId !== null,
    retry: false,
    // Mudar o horizonte muda a chave: a lista anterior fica à vista até chegar a nova (só dentro da mesma organização).
    placeholderData: (anterior, consultaAnterior) => (consultaAnterior?.queryKey[1] === organizationId ? keepPreviousData(anterior) : undefined),
    queryFn: async (): Promise<Lida> => {
      try {
        const { data, error } = await hrRpc("rpc_ativos_por_devolver", { p_organization_id: organizationId, p_pessoa_id: pessoaId, p_dias: dias });
        if (error) throw error;
        return porDevolverDaResposta(data);
      } catch (e) {
        if (ativosIndisponivel(e)) return "indisponivel";
        if (ativosRecusado(e)) return "recusado";
        captureFlowError(e, "ativos-listar");
        throw e;
      }
    },
  });

  const lida = consulta.data;
  const dados = lida && lida !== "indisponivel" && lida !== "recusado" ? lida : null;
  const estado: EstadoLeitura = lida === "indisponivel" ? "indisponivel" : lida === "recusado" ? "recusado" : dados ? "ok" : consulta.error ? "erro" : "a_carregar";
  return {
    estado,
    dados,
    mensagem: consulta.error && estado === "erro" ? getLocalizedFallback("ativos.saidas.erroLer") : null,
    aAtualizar: consulta.isFetching,
    refazer: () => { void consulta.refetch(); },
  };
}

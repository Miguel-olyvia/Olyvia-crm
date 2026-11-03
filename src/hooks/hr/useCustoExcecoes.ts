/**
 * As excecoes de taxa por pessoa (`pessoas_custo_excecoes`): regimes com taxa reduzida. Sem excecao, vale a taxa da empresa.
 *  - listar: `rpc_hr_custo_excecoes_listar(p_organization_id)`, `hr.pessoas.retribuicao.view` (so pessoas nao apagadas).
 *  - definir/remover: `rpc_hr_custo_excecao_definir(p_pessoa_id, p_organization_id, p_taxa)`, `hr.pessoas.retribuicao.edit`.
 *    `p_taxa = NULL` tira a excecao (idempotente); uma taxa fora de 0..100 da HRA73.
 * Depois de escrever, a lista refaz-se (refetch). O ecra so recebe TEXTO traduzido.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import {
  excecoesDasLinhas, falhaDeEscrita, recusaComTexto, SUCESSO_CUSTO, textoDoErro,
  type LinhaExcecao, type ResultadoCusto,
} from "@/lib/hr/custoBase";

export const CHAVE_CUSTO_EXCECOES = "hr-custo-excecoes";

interface Opcoes {
  /** Falso: nao pede nada (por exemplo sem a permissao de ver). */
  enabled?: boolean;
}

export interface CustoExcecoesHook {
  /** Pessoa -> taxa da excecao (so as pessoas que a tem). `null` enquanto carrega, ou quando a leitura falhou. */
  excecoes: Record<string, number | null> | null;
  aCarregar: boolean;
  /** O texto traduzido da falha de leitura; `null` quando correu bem. */
  erro: string | null;
  /** `taxa = null` tira a excecao e volta a taxa da empresa. */
  definir: (pessoaId: string, taxa: number | null) => Promise<ResultadoCusto>;
}

export function useCustoExcecoes({ enabled = true }: Opcoes = {}): CustoExcecoesHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: [CHAVE_CUSTO_EXCECOES, organizationId],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<Record<string, number | null>> => {
      const { data, error } = await hrRpc("rpc_hr_custo_excecoes_listar", { p_organization_id: organizationId });
      if (error) throw new Error(textoDoErro(error, "hr-custo-excecoes-listar"));
      return excecoesDasLinhas((data ?? []) as LinhaExcecao[]);
    },
  });

  const definir = useCallback(
    async (pessoaId: string, taxa: number | null): Promise<ResultadoCusto> => {
      if (!organizationId || pessoaId === "") return recusaComTexto("pedido_invalido");
      if (taxa !== null && !(Number.isFinite(taxa) && taxa >= 0 && taxa <= 100)) return recusaComTexto("taxa_invalida");
      try {
        const { error } = await hrRpc("rpc_hr_custo_excecao_definir", { p_pessoa_id: pessoaId, p_organization_id: organizationId, p_taxa: taxa });
        if (error) return falhaDeEscrita(error, "hr-custo-excecao-definir");
        await queryClient.invalidateQueries({ queryKey: [CHAVE_CUSTO_EXCECOES, organizationId] });
        return SUCESSO_CUSTO;
      } catch (e) {
        return falhaDeEscrita(e, "hr-custo-excecao-definir");
      }
    },
    [organizationId, queryClient],
  );

  return {
    excecoes: consulta.data ?? null,
    aCarregar: consulta.isLoading,
    erro: consulta.error ? (consulta.error as Error).message : null,
    definir,
  };
}

/**
 * As definicoes do custo de UMA organizacao (`hr_custo_definicoes`): taxa da empresa, seguro de acidentes de trabalho, valor
 * por km e ajuda de custo por dia. Sao por ORGANIZACAO: guardar aqui muda o custo de todas as pessoas desta organizacao.
 *  - ler: `rpc_hr_custo_definicoes_ler(p_organization_id)`, `hr.pessoas.retribuicao.view`. Sem linha, a base devolve os
 *    valores de omissao (`omissao: true`).
 *  - guardar: `rpc_hr_custo_definicoes_guardar(...)`, `hr.pessoas.retribuicao.edit`; recusa taxa ou seguro fora de 0..100
 *    (HRA73) e valor por km ou por dia negativo (HRA74).
 * A tabela nao se le nem se escreve directamente. Depois de guardar, a leitura refaz-se (refetch). O ecra so recebe TEXTO
 * traduzido, nunca o codigo em bruto nem a mensagem da base.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import {
  definicoesDaLinha, falhaDeEscrita, recusaComTexto, SUCESSO_CUSTO, textoDoErro,
  type LinhaDefinicoes, type ResultadoCusto,
} from "@/lib/hr/custoBase";
import type { DefinicoesCusto } from "@/components/rh-exemplo/lib/custoMes";

export const CHAVE_CUSTO_DEFINICOES = "hr-custo-definicoes";

interface Opcoes {
  /** Falso: nao pede nada (por exemplo sem a permissao de ver). */
  enabled?: boolean;
}

export interface CustoDefinicoesHook {
  /** `null` enquanto carrega, ou quando a leitura falhou. */
  definicoes: DefinicoesCusto | null;
  /** Verdadeiro: a organizacao ainda nao guardou nada e estes sao os valores de omissao da base. */
  omissao: boolean;
  aCarregar: boolean;
  /** O texto traduzido da falha de leitura; `null` quando correu bem. */
  erro: string | null;
  guardar: (novas: DefinicoesCusto) => Promise<ResultadoCusto>;
}

const taxaValida = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 100;
const valorValido = (n: number): boolean => Number.isFinite(n) && n >= 0;

export function useCustoDefinicoes({ enabled = true }: Opcoes = {}): CustoDefinicoesHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const chave = [CHAVE_CUSTO_DEFINICOES, organizationId];

  const consulta = useQuery({
    queryKey: chave,
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<{ definicoes: DefinicoesCusto; omissao: boolean }> => {
      const { data, error } = await hrRpc("rpc_hr_custo_definicoes_ler", { p_organization_id: organizationId });
      if (error || !data) throw new Error(textoDoErro(error, "hr-custo-definicoes-ler"));
      const linha = data as LinhaDefinicoes;
      return { definicoes: definicoesDaLinha(linha), omissao: linha.omissao === true };
    },
  });

  const guardar = useCallback(
    async (novas: DefinicoesCusto): Promise<ResultadoCusto> => {
      if (!organizationId) return recusaComTexto("pedido_invalido");
      if (!taxaValida(novas.taxaEmpresa) || !taxaValida(novas.seguro)) return recusaComTexto("taxa_invalida");
      if (!valorValido(novas.valorPorKm) || !valorValido(novas.ajudaPorDia)) return recusaComTexto("valor_unitario_invalido");
      try {
        const { error } = await hrRpc("rpc_hr_custo_definicoes_guardar", {
          p_organization_id: organizationId,
          p_taxa_empresa: novas.taxaEmpresa,
          p_seguro: novas.seguro,
          p_valor_km: novas.valorPorKm,
          p_ajuda_dia: novas.ajudaPorDia,
        });
        if (error) return falhaDeEscrita(error, "hr-custo-definicoes-guardar");
        await queryClient.invalidateQueries({ queryKey: [CHAVE_CUSTO_DEFINICOES, organizationId] });
        return SUCESSO_CUSTO;
      } catch (e) {
        return falhaDeEscrita(e, "hr-custo-definicoes-guardar");
      }
    },
    [organizationId, queryClient],
  );

  return {
    definicoes: consulta.data?.definicoes ?? null,
    omissao: consulta.data?.omissao ?? false,
    aCarregar: consulta.isLoading,
    erro: consulta.error ? (consulta.error as Error).message : null,
    guardar,
  };
}

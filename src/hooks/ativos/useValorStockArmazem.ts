/**
 * O valor em produtos que está guardado num armazém, para a ficha de um ativo ligado a ele. Lê-se por `inv_valor_stock_armazens(p_org)`
 * (a base exige `inventory.view` E `products.view_cost`), que devolve o valor de todos os armazéns da empresa numa só chamada; a ficha
 * escolhe o do armazém ligado. Só se pede com `ligado` (o ecrã só o liga a quem tem as duas permissões), e nunca soma a nenhum total.
 * Uma recusa não é um defeito: a ficha simplesmente não mostra a linha.
 */
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ativosRecusado } from "@/components/ativos/lib/errosAtivo";
import { valorStockPorArmazem } from "@/lib/custosStock";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { CHAVE_ATIVOS } from "./useAtivos";

export interface ValorStockArmazem {
  /** `null` enquanto carrega ou se não se pôde ler. Um armazém sem stock vale 0. */
  valor: number | null;
  aCarregar: boolean;
  /** A leitura falhou ou foi recusada: a ficha não mostra a linha. */
  falhou: boolean;
}

export function useValorStockArmazem(armazemId: string | null, ligado: boolean): ValorStockArmazem {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_ATIVOS, "valor-stock", organizationId],
    enabled: ligado && organizationId !== null && armazemId !== null,
    retry: false,
    // O stock muda sem que o registo de ativos saiba: não vale a pena guardá-lo muito tempo.
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      try {
        return await valorStockPorArmazem(organizationId as string);
      } catch (e) {
        if (!ativosRecusado(e)) captureFlowError(e, "ativos-listar");
        throw e;
      }
    },
  });
  const valor = armazemId !== null && consulta.data ? (consulta.data[armazemId] ?? 0) : null;
  return { valor, aCarregar: consulta.isLoading, falhou: consulta.isError };
}

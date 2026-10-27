/**
 * Os vinculos de CADA pessoa da organizacao activa (tipo de contrato e horas por semana contratadas), lidos de uma vez
 * para a organizacao inteira. Serve o ecra de Custos (filtro «Contrato» e custo por hora previsto), que precisa deles
 * para todas as pessoas e nao pessoa a pessoa.
 *
 * Le so colunas que ja existem (`pessoas_vinculos`: tipo_contrato, estado, data_inicio, data_fim e
 * horas_semanais_equivalentes, esta ultima GERADA na base) e pagina como `usePessoas` (o PostgREST corta em silencio as
 * respostas a 1000 linhas, e os vinculos sao historico, varios por pessoa).
 *
 * `vinculoDoMes` escolhe o vinculo que cobre um mes (o de inicio mais recente, se houver mais do que um), para que o
 * custo de um mes passado use o contrato desse mes e nao o de hoje. Quem nao tem nenhum fica sem valor: nunca um valor
 * inventado.
 *
 * Falha de permissao (`hr.pessoas.vinculos.view`) nao e defeito: `recusado` fica verdadeiro e o mapa vazio. Qualquer
 * outra falha sobe em `error` (e nunca deixa um mapa a meio, que daria «sem contrato» a quem ficou de fora).
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { vinculosPorPessoa, type LinhaVinculo, type VinculoLido } from "@/lib/hr/vinculosDoMes";

export { vinculoDoMes, vinculosPorPessoa } from "@/lib/hr/vinculosDoMes";
export type { VinculoLido } from "@/lib/hr/vinculosDoMes";

const PAGINA = 1000;

export function usePessoasVinculosVigentes() {
  const { activeCompany } = useCompany();
  const [vinculos, setVinculos] = useState<Map<string, VinculoLido[]>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const orgId = activeCompany?.id;
    if (!orgId) {
      setVinculos(new Map());
      setRecusado(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const linhas: LinhaVinculo[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error: erro } = await hrFrom("pessoas_vinculos")
          .select("pessoa_id, tipo_contrato, estado, data_inicio, data_fim, horas_semanais_equivalentes")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .order("pessoa_id", { ascending: true })
          .order("data_inicio", { ascending: true })
          .range(inicio, inicio + PAGINA - 1);
        if (erro) throw erro;
        const pagina = (data ?? []) as unknown as LinhaVinculo[];
        linhas.push(...pagina);
        if (pagina.length < PAGINA) break;
      }
      setVinculos(vinculosPorPessoa(linhas));
      setRecusado(false);
    } catch (e) {
      setVinculos(new Map());
      if (isPermissionError(e)) {
        setRecusado(true);
      } else {
        setRecusado(false);
        captureFlowError(e, "hr-pessoas-load");
        setError(await getFriendlyErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { vinculos, loading, recusado, error, recarregar: load };
}

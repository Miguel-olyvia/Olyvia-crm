/**
 * As horas semanais equivalentes EM VIGOR (`pessoas_vinculos_horas`,
 * 20261130180000) de TODA a organizacao -- UMA query, para o resumo de
 * "Processamento Salarial" (`ProcessamentoVisaoGeralTab`), que precisa das
 * horas de todas as pessoas activas ao mesmo tempo.
 *
 * "EM VIGOR" = `valido_ate IS NULL` -- a mesma condicao do indice unico
 * parcial `idx_pessoas_vinculos_horas_aberta` (20261130180000, camada 1 da
 * nao-sobreposicao): no maximo uma linha por pessoa. Ao contrario da
 * retribuicao, aqui NAO se pede o historico -- so a versao actual interessa
 * para o processamento do mes corrente, e a coluna e GERADA (nao ha o que
 * "escolher" entre versoes fechadas).
 *
 * `horas_semanais_equivalentes` e a coluna GERADA (STORED) que converte
 * `horas_periodo`/`horas_frequencia` para uma unidade canonica -- ver o
 * comentario dessa coluna na migracao. Nunca se le `horas_periodo` aqui
 * directamente, porque nao e comparavel entre pessoas com frequencias
 * diferentes.
 *
 * MESMO TRATAMENTO DE PERMISSAO QUE OS OUTROS HOOKS DO MODULO -- ver
 * `useRetribuicoesVigentesDaOrganizacao.ts`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";

const COLUNAS = "pessoa_id, horas_semanais_equivalentes";

export function useHorasVigentesDaOrganizacao(organizationId: string | undefined) {
  const [porPessoa, setPorPessoa] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      setPorPessoa(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("pessoas_vinculos_horas")
      .select(COLUNAS)
      .eq("organization_id", organizationId)
      .is("valido_ate", null)
      .is("deleted_at", null);
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setPorPessoa(new Map());
      } else {
        captureFlowError(error, "hr-horas-vigentes-organizacao-load");
        // Falhar fechado: sem isto, o ecra continuaria a mostrar o mapa do
        // mes anterior, agora rotulado com o mes novo, sem aviso nenhum.
        setPorPessoa(new Map());
      }
    } else {
      setRecusado(false);
      const mapa = new Map<string, number>();
      for (const linha of (data ?? []) as { pessoa_id: string; horas_semanais_equivalentes: number | null }[]) {
        if (linha.horas_semanais_equivalentes !== null) {
          mapa.set(linha.pessoa_id, linha.horas_semanais_equivalentes);
        }
      }
      setPorPessoa(mapa);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { porPessoa, loading, recusado, recarregar: load };
}

/**
 * O prazo para justificar, DA BASE, uma chamada por PERIODO (nao por dia) com cache por (organizacao, periodo).
 *
 * `hr_justificacao_dia_prazo(_organization_id, _data)` devolve o ultimo dia para justificar: o fim do periodo da folha que
 * contem o dia ou, se o periodo ja fechou, o mais cedo entre esse fim e a vespera do fecho. E o que a base vai fazer cumprir, por
 * isso e este o numero que o ecra mostra. Qualquer dia do periodo da o mesmo.
 *
 * Quem consulta passa as datas de que precisa (`datas`). Com as regras do periodo lidas, as datas do mesmo periodo partilham UMA
 * chamada. Sem elas (quem nao tem periodo.view recebe «recusado»), nao se sabe que datas formam um periodo e cada data tem a sua.
 *
 * ESTIMATIVA: se a RPC ainda nao existe na base (PGRST202 / 42883), ou recusa, ou falha, o prazo e o calculado pelas regras
 * (`fimDoPeriodoDoDia`) e `estimativaDe(data)` diz `true`: o ecra escreve «(estimativa)» em vez de o dar por certo.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueries } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { rpcIndisponivel } from "@/lib/hr/justificacaoDia";
import { fimDoPeriodoDoDia, periodoDoDia, type PeriodoDoDia } from "@/lib/hr/periodoFolha";
import { subscreverPrazo, versaoDoPrazo } from "@/lib/hr/prazoCache";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface PrazoPorPeriodo {
  /** O ultimo dia para justificar o dia dado: o da base se ja chegou, senao o calculado pelas regras. */
  prazoDe: (dataDoDia: string) => string;
  /** `true` enquanto o prazo mostrado e so o calculado (a base ainda nao respondeu, ou nao pode). */
  estimativaDe: (dataDoDia: string) => boolean;
  periodoDe: (dataDoDia: string) => PeriodoDoDia;
  aCarregar: boolean;
}

const SEM_DATAS: readonly string[] = [];
const STALE_TIME_MS = 5 * 60 * 1000;

export function usePrazoJustificacaoPorPeriodo(datas: readonly string[] = SEM_DATAS): PrazoPorPeriodo {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { regras, estado } = usePeriodoFolhaRegras();
  // Abrir/fechar um periodo ou gravar uma regra muda o prazo: a versao esta na chave, e mudar de versao refaz o pedido.
  const versao = useSyncExternalStore(subscreverPrazo, () => versaoDoPrazo(orgId));

  const chaveDe = useCallback(
    (data: string): string => {
      if (estado !== "ok") return data;
      const p = periodoDoDia(data, regras);
      return `${p.de}|${p.ate}`;
    },
    [regras, estado],
  );

  const unicas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const data of datas) {
      const chave = chaveDe(data);
      if (!mapa.has(chave)) mapa.set(chave, data);
    }
    return [...mapa.entries()];
  }, [datas, chaveDe]);

  const resultados = useQueries({
    queries: unicas.map(([chave, data]) => ({
      queryKey: ["hr-prazo-periodo", orgId, versao, chave] as const,
      enabled: !!orgId,
      staleTime: STALE_TIME_MS,
      queryFn: async (): Promise<string | null> => {
        try {
          const { data: resposta, error } = await hrRpc("hr_justificacao_dia_prazo", { _organization_id: orgId, _data: data });
          if (error) {
            if (!rpcIndisponivel(error) && !isPermissionError(error)) captureFlowError(error, "hr-prazo-justificar-load");
            return null;
          }
          return typeof resposta === "string" ? resposta.slice(0, 10) : null;
        } catch (e) {
          captureFlowError(e, "hr-prazo-justificar-load");
          return null;
        }
      },
    })),
  });

  const valores = resultados.map((r) => r.data ?? null).join(",");
  const aCarregar = resultados.some((r) => r.isLoading);
  const daBase = useMemo(() => {
    const mapa = new Map<string, string>();
    unicas.forEach(([chave], i) => {
      const valor = valores.split(",")[i];
      if (valor) mapa.set(chave, valor);
    });
    return mapa;
    // `valores` resume os resultados; `unicas` diz a que chave pertence cada um.
  }, [unicas, valores]);

  const prazoDe = useCallback((data: string) => daBase.get(chaveDe(data)) ?? fimDoPeriodoDoDia(data, regras), [daBase, chaveDe, regras]);
  const estimativaDe = useCallback((data: string) => !daBase.has(chaveDe(data)), [daBase, chaveDe]);
  const periodoDe = useCallback((data: string) => periodoDoDia(data, regras), [regras]);

  return useMemo(() => ({ prazoDe, estimativaDe, periodoDe, aCarregar }), [prazoDe, estimativaDe, periodoDe, aCarregar]);
}
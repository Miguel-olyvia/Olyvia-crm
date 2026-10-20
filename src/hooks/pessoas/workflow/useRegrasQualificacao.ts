import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { leadPipelineRulesQueryKey } from "@/hooks/useLeadPipelineRules";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";
import { useFontePessoas } from "../useFontePessoas";
import { lerRegras, lerResultadoGuardar, paraEnvio, type RegrasLidas, type ResultadoGuardar, type RuleGroup } from "./regrasQualificacao";

/** Chave da leitura, com a organização (para não misturar organizações na cache). */
export const regrasQualificacaoQueryKey = (organizationId: string | null | undefined) =>
  ["pessoas-regras-qualificacao", organizationId ?? null] as const;

export interface RegrasQualificacaoHook {
  /** As regras gravadas (null enquanto não chegaram ou se a leitura falhou). */
  dados: RegrasLidas | null;
  isLoading: boolean;
  isError: boolean;
  /** Há uma gravação em curso. */
  aGuardar: boolean;
  /** Grava as duas regras pela função da base. Lança `ErroNeg` se falhar. Um pedido durante outro devolve o que já está em curso. */
  guardar: (mql: RuleGroup | null, sql: RuleGroup | null) => Promise<ResultadoGuardar>;
  recarregar: () => void;
}

// Como em Leads, a leitura é direta à tabela, pela regra de acesso dela (a escrita nunca: só pela função).
async function lerLinha(organizationId: string): Promise<RegrasLidas> {
  // `as any` sai quando os tipos do Supabase forem regenerados.
  const { data, error } = await (supabase as any)
    .from("lead_qualification_rules")
    .select("mql_when, sql_when")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    captureFlowError(error, "pessoas-neg");
    throw error;
  }
  return lerRegras(data);
}

/**
 * As regras MQL/SQL da organização de Pessoas: lê-as da tabela e grava-as SÓ por `neg_guardar_regras_qualificacao`
 * (NG008 organização sem o novo fluxo, NG009 valores, 42501 sem pessoas.config). `habilitado` false não lê nada (diálogo fechado).
 * Depois de gravar, a cache fica com o que a base devolveu e, se mudou, marca as regras de Leads para reler (a tabela é a mesma).
 */
export function useRegrasQualificacao(habilitado = true): RegrasQualificacaoHook {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const chave = regrasQualificacaoQueryKey(organizationId);
  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => lerLinha(organizationId as string),
    enabled: habilitado && !!organizationId,
  });
  const [aGuardar, setAGuardar] = useState(false);
  // O estado só muda no render seguinte: a referência é o que impede dois pedidos num duplo clique.
  const emCurso = useRef<Promise<ResultadoGuardar> | null>(null);

  const guardar = useCallback((mql: RuleGroup | null, sql: RuleGroup | null): Promise<ResultadoGuardar> => {
    if (emCurso.current) return emCurso.current;
    if (!organizationId) return Promise.reject(new ErroNeg(null, null, CHAVE_ERRO_GENERICO));
    setAGuardar(true);
    const voo = (async (): Promise<ResultadoGuardar> => {
      try {
        const resposta = await chamarNeg<unknown>("neg_guardar_regras_qualificacao", {
          p_organization_id: organizationId,
          p_mql_when: paraEnvio(mql),
          p_sql_when: paraEnvio(sql),
        });
        const resultado = lerResultadoGuardar(resposta);
        if (resultado.depois) {
          const lidas: RegrasLidas = { ...resultado.depois, descartadas: 0 };
          client.setQueryData(regrasQualificacaoQueryKey(organizationId), lidas);
        } else if (resultado.mudou) {
          // Gravou, mas a resposta não se reconhece: relê-se da base em vez de mostrar o que se enviou.
          void client.invalidateQueries({ queryKey: regrasQualificacaoQueryKey(organizationId) });
        }
        if (resultado.mudou) void client.invalidateQueries({ queryKey: leadPipelineRulesQueryKey(organizationId) });
        return resultado;
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = voo;
    return voo;
  }, [organizationId, client]);

  const recarregar = useCallback(() => {
    void consulta.refetch();
  }, [consulta]);

  return {
    dados: consulta.data ?? null,
    isLoading: consulta.isLoading,
    isError: consulta.isError,
    aGuardar,
    guardar,
    recarregar,
  };
}

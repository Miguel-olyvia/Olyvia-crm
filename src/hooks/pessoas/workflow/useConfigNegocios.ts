import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "../errosNeg";
import { useFontePessoas } from "../useFontePessoas";
import {
  CANCELAMENTOS, CONVERSOES_AO_GANHAR, lerConfig, lerResultadoConfig, paraEnvio, RECUSAS, REFLEXAO_MAX, REFLEXAO_MIN,
  type ConfigNegocios, type ResultadoGuardarConfig,
} from "./configNegocios";

/** Chave da leitura, com a organização (para não misturar organizações na cache). */
export const configNegociosQueryKey = (organizationId: string | null | undefined) => ["pessoas-config-negocios", organizationId ?? null] as const;

export type EstadoConfigNegocios = "a-carregar" | "erro" | "sem-config" | "pronto";

export interface ConfigNegociosHook {
  estado: EstadoConfigNegocios;
  /** A configuração gravada (só no estado `pronto`). */
  dados: ConfigNegocios | null;
  /** Há uma gravação em curso. */
  aGuardar: boolean;
  /** Grava a configuração pela função da base. Lança `ErroNeg` se falhar. Um pedido durante outro devolve o que já está em curso. */
  guardar: (config: ConfigNegocios) => Promise<ResultadoGuardarConfig>;
  recarregar: () => void;
}

// A leitura é direta à tabela, pela regra de acesso dela, como o separador «Qualificação» lê as regras (a escrita nunca: só pela função).
async function lerLinha(organizationId: string): Promise<ConfigNegocios | null> {
  // `as any` sai quando os tipos do Supabase forem regenerados.
  const { data, error } = await (supabase as any)
    .from("negocio_workflow_config")
    .select("conversao_ao_ganhar, recusa_proposta, recusa_contrato, cancelamento_no_prazo, reflexao_dias")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    captureFlowError(error, "pessoas-neg");
    throw error;
  }
  try {
    return lerConfig(data);
  } catch (falha) {
    captureFlowError(falha, "pessoas-neg");
    throw falha;
  }
}

/** Os valores que a base não aceita recusam-se aqui (NG009), sem gastar uma ida à base. */
function validarLocal(c: ConfigNegocios): void {
  const bom = (CONVERSOES_AO_GANHAR as readonly string[]).includes(c.conversaoAoGanhar)
    && (RECUSAS as readonly string[]).includes(c.recusaProposta) && (RECUSAS as readonly string[]).includes(c.recusaContrato)
    && (CANCELAMENTOS as readonly string[]).includes(c.cancelamentoNoPrazo)
    && (c.reflexaoDias === null || (Number.isInteger(c.reflexaoDias) && c.reflexaoDias >= REFLEXAO_MIN && c.reflexaoDias <= REFLEXAO_MAX));
  if (!bom) throw new ErroNeg(null, "NG009", CHAVES_ERRO_NEG.NG009);
}

/**
 * A configuração do fecho dos negócios da organização de Pessoas: lê-a da tabela e grava-a SÓ por `neg_guardar_config_negocios` (NG008
 * organização sem a configuração ou sem acesso a ela, NG009 valores, 42501 sem pessoas.config; quem nem a vê recebe NG008 em vez de 42501).
 * `habilitado` false não lê nada (separador fora de vista). Não toca em Contratos. Depois de gravar, a cache fica com o que a base devolveu.
 */
export function useConfigNegocios(habilitado = true): ConfigNegociosHook {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: configNegociosQueryKey(organizationId),
    queryFn: () => lerLinha(organizationId as string),
    enabled: habilitado && !!organizationId,
  });
  const [aGuardar, setAGuardar] = useState(false);
  // O estado só muda no render seguinte: a referência é o que impede dois pedidos num duplo clique.
  const emCurso = useRef<Promise<ResultadoGuardarConfig> | null>(null);

  const guardar = useCallback((config: ConfigNegocios): Promise<ResultadoGuardarConfig> => {
    if (emCurso.current) return emCurso.current;
    if (!organizationId) return Promise.reject(new ErroNeg(null, null, CHAVE_ERRO_GENERICO));
    try {
      validarLocal(config);
    } catch (erro) {
      return Promise.reject(erro);
    }
    setAGuardar(true);
    const voo = (async (): Promise<ResultadoGuardarConfig> => {
      try {
        const resposta = await chamarNeg<unknown>("neg_guardar_config_negocios", paraEnvio(organizationId, config));
        const resultado = lerResultadoConfig(resposta);
        if (resultado.depois) {
          client.setQueryData(configNegociosQueryKey(organizationId), resultado.depois);
        } else if (resultado.mudou) {
          // Gravou, mas a resposta não se reconhece: relê-se da base em vez de mostrar o que se enviou.
          void client.invalidateQueries({ queryKey: configNegociosQueryKey(organizationId) });
        }
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

  const estado: EstadoConfigNegocios = consulta.isError ? "erro" : consulta.isSuccess ? (consulta.data ? "pronto" : "sem-config") : "a-carregar";
  return { estado, dados: consulta.data ?? null, aGuardar, guardar, recarregar };
}

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CfgCampos } from "@/emylia/campos";
import type { CfgEfeitos } from "@/emylia/efeitosLevantamento";
import { lerCamposConfig, type CamposConfig } from "@/emylia/real/camposConfig";
import { chamarNeg } from "../chamarNeg";
import { useFontePessoas } from "../useFontePessoas";

/** Chave da leitura, com a organização (para não misturar organizações na cache). */
export const camposConfigQueryKey = (organizationId: string | null | undefined) => ["pessoas-campos-config", organizationId ?? null] as const;

export interface CamposConfigHook {
  estado: "a-carregar" | "erro" | "pronto";
  dados: CamposConfig | null;
  erro: string | null;
  aGuardar: boolean;
  /** Grava um dos lados (o outro fica como está na base). Lança se falhar. Um pedido durante outro devolve o que já está em curso. */
  guardar: (parte: { campos?: CfgCampos; efeitos?: CfgEfeitos }) => Promise<CamposConfig>;
  recarregar: () => void;
}

/**
 * 3/11 (Rúben): os ajustes da organização aos campos das fases e ao impacto no orçamento (negocio_campos_config). Lê-os por
 * neg_ler_campos_config e grava-os SÓ por neg_guardar_campos_config (pessoas.config). `habilitado` false não lê nada (separador fora de vista).
 * Os separadores «Campos das fases» e «Levantamento» partilham a mesma leitura; depois de gravar, a cache fica com o que a base devolveu.
 */
export function useCamposConfig(habilitado = true): CamposConfigHook {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: camposConfigQueryKey(organizationId),
    queryFn: async () => lerCamposConfig(await chamarNeg<unknown>("neg_ler_campos_config", { p_org: organizationId })),
    enabled: habilitado && !!organizationId,
  });
  const [aGuardar, setAGuardar] = useState(false);
  const emCurso = useRef<Promise<CamposConfig> | null>(null);

  const guardar = useCallback((parte: { campos?: CfgCampos; efeitos?: CfgEfeitos }): Promise<CamposConfig> => {
    if (emCurso.current) return emCurso.current;
    if (!organizationId) return Promise.reject(new Error("Sem organização."));
    setAGuardar(true);
    const voo = (async () => {
      try {
        const depois = lerCamposConfig(await chamarNeg<unknown>("neg_guardar_campos_config", { p_org: organizationId, p_campos: parte.campos ?? null, p_efeitos: parte.efeitos ?? null }));
        client.setQueryData(camposConfigQueryKey(organizationId), depois);
        return depois;
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = voo;
    return voo;
  }, [organizationId, client]);

  const recarregar = useCallback(() => { void consulta.refetch(); }, [consulta]);
  const estado = consulta.isError ? "erro" : consulta.isSuccess ? "pronto" : "a-carregar";
  return { estado, dados: consulta.data ?? null, erro: consulta.error ? (consulta.error as Error).message : null, aGuardar, guardar, recarregar };
}

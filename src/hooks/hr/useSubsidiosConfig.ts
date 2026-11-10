/**
 * A configuracao dos subsidios de ferias e de Natal de uma organizacao (desde quando, e em que mes se paga cada um), lida e escrita so
 * pelas RPCs `rpc_hr_subsidios_config_ler` e `_guardar`. Se a base ainda nao tem a RPC (migration por aplicar) o estado e
 * `indisponivel` (conta como desligada); uma recusa de permissao e `recusado`; um defeito, `erro`. O fecho do periodo LE este estado:
 * recusado, com erro ou a carregar bloqueia (fechar sem a configuracao gravaria um periodo sem o subsidio, para sempre).
 * O ecra so recebe TEXTO traduzido, nunca o codigo em bruto. Defeitos (rede, sem codigo legivel) vao para o registo; recusas nao.
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import type { EstadoLeitura } from "@/lib/hr/resultadosFecho";
import type { SubsidiosConfig } from "@/lib/hr/subsidiosExtra";
import {
  guardarSubsidiosConfig,
  lerSubsidiosConfig,
  mesValido,
  subsidiosConfigIndisponivel,
  subsidiosConfigRecusada,
  type SubsidiosConfigLida,
} from "@/lib/hr/subsidiosConfigRpc";

export const CHAVE_SUBSIDIOS_CONFIG = "hr-subsidios-config";

/** Os codigos da base com texto proprio: HRA88 = folha fechada, HRA89 = mes que pagaria duas vezes ou nunca, HRA81 = configuracao invalida. */
const TEXTO_DO_CODIGO: Record<string, string> = {
  HRA88: "rhSubs.erro.folhaFechada",
  HRA89: "rhSubs.erro.meses",
  HRA81: "rhSubs.erro.configInvalida",
};

function codigoDaBase(erro: unknown): string | null {
  const code = erro && typeof erro === "object" ? (erro as { code?: unknown }).code : null;
  return typeof code === "string" && code in TEXTO_DO_CODIGO ? code : null;
}

export type ResultadoGuardarSubsidios = { ok: true } | { ok: false; erro: string };

export interface SubsidiosConfigHook {
  estado: EstadoLeitura;
  /** `null` enquanto carrega, ou quando a leitura foi recusada, falhou ou a RPC ainda nao existe. */
  config: SubsidiosConfigLida | null;
  aGuardar: boolean;
  /** `ativoDesde` null desliga. Devolve o texto traduzido do erro quando nao se guarda. */
  guardar: (config: SubsidiosConfig) => Promise<ResultadoGuardarSubsidios>;
}

type Lida = SubsidiosConfigLida | "indisponivel" | "recusado";

export function useSubsidiosConfig(enabled = true): SubsidiosConfigHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aGuardar, setAGuardar] = useState(false);
  const consulta = useQuery({
    queryKey: [CHAVE_SUBSIDIOS_CONFIG, organizationId],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<Lida> => {
      try {
        return await lerSubsidiosConfig(organizationId as string);
      } catch (e) {
        if (subsidiosConfigIndisponivel(e)) return "indisponivel";
        if (subsidiosConfigRecusada(e)) return "recusado";
        captureFlowError(e, "hr-subsidios-config-ler");
        throw e;
      }
    },
  });

  const guardar = useCallback(
    async (config: SubsidiosConfig): Promise<ResultadoGuardarSubsidios> => {
      if (!organizationId || !mesValido(config.feriasMes) || !mesValido(config.natalMes)) {
        return { ok: false, erro: getLocalizedFallback("rhSubs.erro.guardar") };
      }
      // Guarda SINCRONA: dois cliques no mesmo instante nao chegam a fazer dois pedidos.
      if (ocupado.current) return { ok: false, erro: getLocalizedFallback("rhSubs.erro.emCurso") };
      ocupado.current = true;
      setAGuardar(true);
      try {
        await guardarSubsidiosConfig(organizationId, config);
        await queryClient.invalidateQueries({ queryKey: [CHAVE_SUBSIDIOS_CONFIG, organizationId] });
        return { ok: true };
      } catch (e) {
        if (subsidiosConfigRecusada(e)) return { ok: false, erro: getLocalizedFallback("rhSubs.erro.semPermissao") };
        const codigo = codigoDaBase(e);
        if (codigo) return { ok: false, erro: getLocalizedFallback(TEXTO_DO_CODIGO[codigo]) };
        captureFlowError(e, "hr-subsidios-config-guardar");
        return { ok: false, erro: getLocalizedFallback("rhSubs.erro.guardar") };
      } finally {
        ocupado.current = false;
        setAGuardar(false);
      }
    },
    [organizationId, queryClient],
  );

  const dados = consulta.data;
  const estado: EstadoLeitura = consulta.error
    ? "erro"
    : dados === "indisponivel"
      ? "indisponivel"
      : dados === "recusado"
        ? "recusado"
        : dados
          ? "ok"
          : "a_carregar";
  const config = dados && dados !== "indisponivel" && dados !== "recusado" ? dados : null;
  return { estado, config, aGuardar, guardar };
}

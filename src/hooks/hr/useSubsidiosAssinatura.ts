/**
 * A assinatura da configuracao dos subsidios de ferias e de Natal de UM periodo da folha (`rpc_hr_subsidios_assinatura`), lida
 * quando o periodo existe. E a UNICA fonte da decisao «este periodo paga ferias / Natal» e da assinatura que o fecho confere:
 * ambas vem do MESMO objecto lido, por isso o calculo e a assinatura que segue no fecho nunca sao de configuracoes diferentes. A
 * assinatura NAO se le no momento de fechar (apanharia a configuracao nova e a base nunca daria pela diferenca): envia-se a que veio
 * com o calculo, e a base recusa com HRA90 se a configuracao mudou depois.
 *
 * Estados: `ok`; `indisponivel` (a RPC ainda nao existe na base: conta como desligado); `recusado` (sem permissao); `erro`;
 * `a_carregar`. So `ok` e `indisponivel` deixam fechar. Com periodo mas SEM organizacao (ja carregada) a leitura nao pode correr: `erro`
 * (nunca `a_carregar` para sempre). `aReler` e verdadeiro enquanto uma releitura decorre: os dados antigos continuam `ok` ate ela acabar,
 * por isso quem fecha tem de esperar por ele (senao reenviava a assinatura velha). Defeitos (rede, resposta invalida) vao para o registo; recusas nao.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { EstadoLeitura } from "@/lib/hr/resultadosFecho";
import {
  lerSubsidiosAssinatura,
  subsidiosConfigIndisponivel,
  subsidiosConfigRecusada,
  type SubsidiosAssinaturaLida,
} from "@/lib/hr/subsidiosConfigRpc";
import { CHAVE_SUBSIDIOS_CONFIG } from "@/hooks/hr/useSubsidiosConfig";

type Lida = SubsidiosAssinaturaLida | "indisponivel" | "recusado";

export interface SubsidiosAssinaturaHook {
  estado: EstadoLeitura;
  /** `null` enquanto carrega, ou quando a leitura foi recusada, falhou ou a RPC ainda nao existe. */
  leitura: SubsidiosAssinaturaLida | null;
  /** Volta a ler (depois de o fecho ser recusado por a configuracao ter mudado). */
  reler: () => Promise<void>;
  /** Uma leitura (ou releitura) esta a decorrer: durante ela `leitura` ainda pode ser a anterior. */
  aReler: boolean;
}

export function useSubsidiosAssinatura(periodoId: string | null | undefined): SubsidiosAssinaturaHook {
  const { activeCompany, isLoading: empresaACarregar } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const id = periodoId || null;
  // Debaixo da chave da configuracao: guardar a configuracao invalida tambem esta leitura.
  const chave = [CHAVE_SUBSIDIOS_CONFIG, organizationId, "assinatura", id];
  const consulta = useQuery({
    queryKey: chave,
    enabled: organizationId !== null && id !== null,
    retry: false,
    queryFn: async (): Promise<Lida> => {
      try {
        return await lerSubsidiosAssinatura(id as string);
      } catch (e) {
        if (subsidiosConfigIndisponivel(e)) return "indisponivel";
        if (subsidiosConfigRecusada(e)) return "recusado";
        captureFlowError(e, "hr-subsidios-assinatura-ler");
        throw e;
      }
    },
  });

  const reler = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [CHAVE_SUBSIDIOS_CONFIG, organizationId, "assinatura", id] });
  }, [queryClient, organizationId, id]);

  const dados = consulta.data;
  const semOrganizacao = id !== null && organizationId === null && !empresaACarregar;
  const estado: EstadoLeitura = consulta.error || semOrganizacao
    ? "erro"
    : dados === "indisponivel"
      ? "indisponivel"
      : dados === "recusado"
        ? "recusado"
        : dados
          ? "ok"
          : "a_carregar";
  const leitura = !consulta.error && dados && dados !== "indisponivel" && dados !== "recusado" ? dados : null;
  return { estado, leitura, reler, aReler: consulta.isFetching };
}

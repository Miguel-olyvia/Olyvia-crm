/**
 * As regras salariais da organizacao activa, versionadas (20270107600000, Entrega B).
 *
 * TUDO POR RPC: le o historico por `rpc_hr_regras_salariais_historico` (hr.vencimento.subsidio.view ou .codigos.view) e grava por
 * `rpc_hr_regras_salariais_guardar` (hr.vencimento.codigos.gerir). As tabelas nao tem politicas nem GRANT.
 * A regra em vigor deduz-se do historico (a versao que cobre o dia de hoje em Lisboa): uma so leitura.
 *
 * ENQUANTO A MIGRATION NAO ESTIVER APLICADA as RPCs nao existem (PGRST202 / 42883): `estado` e "indisponivel", a lista e vazia e o
 * resto do ecra continua a funcionar. Uma recusa de permissao da o mesmo, sem erro; so uma falha de rede e reportada.
 * O calculo do processamento so passa a usar estas regras na Entrega C: aqui so se leem e gravam.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { rpcIndisponivel } from "@/lib/hr/justificacaoDia";
import { hojeEmLisboa } from "@/lib/hr/periodoFolha";
import { chaveDoErroDeRegrasSalariais, type PayloadRegraSalarial } from "@/lib/hr/regrasSalariais";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import type { RegraSalarial } from "@/types/hr";

export type EstadoDasRegrasSalariais = "ok" | "indisponivel" | "recusado" | "erro";

interface Lido {
  versoes: RegraSalarial[];
  estado: EstadoDasRegrasSalariais;
}

const SEM_VERSOES = (estado: Exclude<EstadoDasRegrasSalariais, "ok">): Lido => ({ versoes: [], estado });
const STALE_TIME_MS = 5 * 60 * 1000;
/** Uma lista vazia estavel, para o render nao refazer o que depende dela. */
const NENHUMA: RegraSalarial[] = [];

/** Mais recente primeiro: por inicio e, com o mesmo inicio, pela criacao. */
const maisRecentePrimeiro = (a: RegraSalarial, b: RegraSalarial): number =>
  a.valido_de !== b.valido_de ? (a.valido_de < b.valido_de ? 1 : -1) : a.criada_em < b.criada_em ? 1 : a.criada_em > b.criada_em ? -1 : 0;

/** A versao que cobre o dia (valido_de <= dia e sem fim ou com fim >= dia), ignorando as substituidas; ou `null`. */
export function regraEmVigorNoDia(versoes: readonly RegraSalarial[], dia: string): RegraSalarial | null {
  return (
    [...versoes]
      .filter((v) => !v.substituida_em)
      .sort(maisRecentePrimeiro)
      .find((v) => v.valido_de <= dia && (v.valido_ate === null || v.valido_ate >= dia)) ?? null
  );
}

/** A versao mais recente que ainda vale (nao substituida): aquela a que a base compara a data da versao nova. */
export function regraMaisRecente(versoes: readonly RegraSalarial[]): RegraSalarial | null {
  return [...versoes].filter((v) => !v.substituida_em).sort(maisRecentePrimeiro)[0] ?? null;
}

/** O que sai de gravar: `null` em sucesso, ou uma chave de traducao / mensagem amigavel ja escrita. */
export interface ResultadoDeGuardarRegras {
  erro: string | null;
}

export function useRegrasSalariais() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id ?? null;
  const queryKey = useMemo(() => ["hr-regras-salariais", orgId] as const, [orgId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Lido> => {
      try {
        const { data: linhas, error } = await hrRpc("rpc_hr_regras_salariais_historico", { _organization_id: orgId });
        if (error) {
          if (rpcIndisponivel(error)) return SEM_VERSOES("indisponivel");
          if (isPermissionError(error)) return SEM_VERSOES("recusado");
          captureFlowError(error, "hr-regras-salariais-load");
          return SEM_VERSOES("erro");
        }
        return { versoes: (Array.isArray(linhas) ? linhas : []) as RegraSalarial[], estado: "ok" };
      } catch (e) {
        captureFlowError(e, "hr-regras-salariais-load");
        return SEM_VERSOES("erro");
      }
    },
    enabled: !!orgId,
    staleTime: (query) => (query.state.data?.estado === "erro" ? 0 : STALE_TIME_MS),
  });

  // O historico completo (tambem as substituidas, para o ecra as mostrar como tal), mais recente primeiro.
  const versoes = useMemo(() => (data?.versoes ? [...data.versoes].sort(maisRecentePrimeiro) : NENHUMA), [data]);
  const estado: EstadoDasRegrasSalariais = data?.estado ?? "ok";
  const emVigor = useMemo(() => regraEmVigorNoDia(versoes, hojeEmLisboa()), [versoes]);
  const maisRecente = useMemo(() => regraMaisRecente(versoes), [versoes]);

  const { mutateAsync: gravarRegra, isPending: isSaving } = useMutation({
    mutationFn: async (args: { validoDe: string; regra: PayloadRegraSalarial }): Promise<void> => {
      const { error } = await hrRpc("rpc_hr_regras_salariais_guardar", {
        _organization_id: orgId,
        _valido_de: args.validoDe,
        _regra: args.regra,
      });
      if (error) throw error;
    },
    // Devolve a promise: o estado "a gravar" so acaba depois de o historico ser relido.
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  /** Grava uma versao a partir de `validoDe` (a mesma data da mais recente corrige-a). Nunca lanca. */
  const guardar = useCallback(
    async (validoDe: string, regra: PayloadRegraSalarial): Promise<ResultadoDeGuardarRegras> => {
      if (!orgId) return { erro: "hr.regrasSalariais.erro.semOrganizacao" };
      try {
        await gravarRegra({ validoDe, regra });
        return { erro: null };
      } catch (e) {
        if (rpcIndisponivel(e)) return { erro: "hr.regrasSalariais.indisponivel" };
        const chave = chaveDoErroDeRegrasSalariais(e);
        if (chave) return { erro: chave };
        if (isPermissionError(e)) return { erro: "hr.regrasSalariais.erro.semPermissao" };
        captureFlowError(e, "hr-regras-salariais-write");
        return { erro: await getFriendlyErrorMessage(e) };
      }
    },
    [orgId, gravarRegra],
  );

  return {
    versoes,
    emVigor,
    maisRecente,
    estado,
    isLoading,
    isSaving,
    guardar,
    /** Repete a leitura (para o "Tentar de novo" depois de uma falha de rede). */
    recarregar: refetch,
  };
}

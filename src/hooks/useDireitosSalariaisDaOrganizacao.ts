/**
 * Os direitos salariais (IHT, km, ajudas de custo) de TODAS as pessoas da organizacao, numa so leitura: o calculo do
 * processamento precisa de saber, por pessoa, se ha direito a IHT, e o ecra de lancamentos se ha direito a km e ajudas.
 *
 * Le por `rpc_hr_pessoa_direitos_ler` com `_pessoa_id` nulo (hr.pessoas.retribuicao.view). Sem linha = sem direito.
 * Enquanto a migration nao estiver aplicada (PGRST202 / 42883), uma recusa ou uma falha, o mapa fica vazio (ninguem tem
 * direito) e `estado` di-lo; so uma falha de rede e reportada.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { rpcIndisponivel } from "@/lib/hr/justificacaoDia";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { DireitosSalariais } from "@/types/hr";

export type EstadoDosDireitosDaOrganizacao = "ok" | "indisponivel" | "recusado" | "erro";

export const SEM_DIREITOS_SALARIAIS: DireitosSalariais = { iht: false, km: false, ajudas: false };

interface Lido {
  porPessoa: ReadonlyMap<string, DireitosSalariais>;
  estado: EstadoDosDireitosDaOrganizacao;
}

const MAPA_VAZIO: ReadonlyMap<string, DireitosSalariais> = new Map();
const STALE_TIME_MS = 60 * 1000;

const SEM_LINHAS = (estado: Exclude<EstadoDosDireitosDaOrganizacao, "ok">): Lido => ({ porPessoa: MAPA_VAZIO, estado });

export function useDireitosSalariaisDaOrganizacao(organizationId: string | undefined, enabled = true) {
  const queryKey = useMemo(() => ["hr-direitos-salariais-organizacao", organizationId ?? null] as const, [organizationId]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Lido> => {
      try {
        const { data: linhas, error } = await hrRpc("rpc_hr_pessoa_direitos_ler", {
          _organization_id: organizationId,
          _pessoa_id: null,
        });
        if (error) {
          if (rpcIndisponivel(error)) return SEM_LINHAS("indisponivel");
          if (isPermissionError(error)) return SEM_LINHAS("recusado");
          captureFlowError(error, "hr-direitos-salariais-organizacao-load");
          return SEM_LINHAS("erro");
        }
        const mapa = new Map<string, DireitosSalariais>();
        for (const linha of Array.isArray(linhas) ? linhas : []) {
          if (typeof linha?.pessoa_id !== "string") continue;
          mapa.set(linha.pessoa_id, { iht: !!linha.iht, km: !!linha.km, ajudas: !!linha.ajudas });
        }
        return { porPessoa: mapa, estado: "ok" };
      } catch (e) {
        captureFlowError(e, "hr-direitos-salariais-organizacao-load");
        return SEM_LINHAS("erro");
      }
    },
    enabled: enabled && !!organizationId,
    staleTime: (query) => (query.state.data?.estado === "erro" ? 0 : STALE_TIME_MS),
  });

  return {
    porPessoa: data?.porPessoa ?? MAPA_VAZIO,
    estado: (data?.estado ?? "ok") as EstadoDosDireitosDaOrganizacao,
    isLoading: isLoading && enabled,
  };
}

/** Os direitos de uma pessoa; sem linha, nenhum. */
export function direitosDaPessoa(
  porPessoa: ReadonlyMap<string, DireitosSalariais>,
  pessoaId: string,
): DireitosSalariais {
  return porPessoa.get(pessoaId) ?? SEM_DIREITOS_SALARIAIS;
}

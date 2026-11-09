/**
 * Os direitos salariais de uma pessoa (IHT, km, ajudas de custo; 20270107600000, Entrega B). Os VALORES vem da regra da
 * organizacao; aqui so se le e se grava se a pessoa tem direito. Sem linha na base = sem direito (tudo a `false`).
 *
 * Le por `rpc_hr_pessoa_direitos_ler` (hr.pessoas.retribuicao.view) e grava por `rpc_hr_pessoa_direitos_guardar`
 * (hr.pessoas.retribuicao.edit; ninguem muda os proprios direitos).
 *
 * ENQUANTO A MIGRATION NAO ESTIVER APLICADA as RPCs nao existem (PGRST202 / 42883): `estado` e "indisponivel" e o cartao di-lo
 * numa linha calma, sem erro vermelho.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { rpcIndisponivel } from "@/lib/hr/justificacaoDia";
import { chaveDoErroDeRegrasSalariais } from "@/lib/hr/regrasSalariais";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import type { DireitosSalariais } from "@/types/hr";

export type EstadoDosDireitos = "ok" | "indisponivel" | "recusado" | "erro";

interface Lido {
  direitos: DireitosSalariais;
  estado: EstadoDosDireitos;
}

export const SEM_DIREITOS: DireitosSalariais = { iht: false, km: false, ajudas: false };
const STALE_TIME_MS = 60 * 1000;

const LIDO_COM = (estado: Exclude<EstadoDosDireitos, "ok">): Lido => ({ direitos: SEM_DIREITOS, estado });

export interface ResultadoDeGuardarDireitos {
  erro: string | null;
}

export function usePessoaDireitosSalariais(pessoaId: string | undefined, organizationId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["hr-pessoa-direitos-salariais", organizationId ?? null, pessoaId ?? null] as const, [organizationId, pessoaId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Lido> => {
      try {
        const { data: linhas, error } = await hrRpc("rpc_hr_pessoa_direitos_ler", {
          _organization_id: organizationId,
          _pessoa_id: pessoaId,
        });
        if (error) {
          if (rpcIndisponivel(error)) return LIDO_COM("indisponivel");
          if (isPermissionError(error)) return LIDO_COM("recusado");
          captureFlowError(error, "hr-pessoa-direitos-load");
          return LIDO_COM("erro");
        }
        const linha = (Array.isArray(linhas) ? linhas : []).find((l: { pessoa_id?: string }) => l.pessoa_id === pessoaId);
        return {
          direitos: linha ? { iht: !!linha.iht, km: !!linha.km, ajudas: !!linha.ajudas } : SEM_DIREITOS,
          estado: "ok",
        };
      } catch (e) {
        captureFlowError(e, "hr-pessoa-direitos-load");
        return LIDO_COM("erro");
      }
    },
    enabled: enabled && !!organizationId && !!pessoaId,
    staleTime: (query) => (query.state.data?.estado === "erro" ? 0 : STALE_TIME_MS),
  });

  const { mutateAsync: gravarDireitos, isPending: isSaving } = useMutation({
    mutationFn: async (novos: DireitosSalariais): Promise<DireitosSalariais> => {
      const { data: gravado, error } = await hrRpc("rpc_hr_pessoa_direitos_guardar", {
        _organization_id: organizationId,
        _pessoa_id: pessoaId,
        _iht: novos.iht,
        _km: novos.km,
        _ajudas: novos.ajudas,
      });
      if (error) throw error;
      // A base devolve {pessoa_id, iht, km, ajudas}; sem isso, o que se enviou.
      return gravado && typeof gravado === "object"
        ? { iht: !!gravado.iht, km: !!gravado.km, ajudas: !!gravado.ajudas }
        : novos;
    },
    onSuccess: (gravado) => {
      // O que a base confirmou passa a ser a "ultima leitura" logo, e a promise da releitura segura o estado "a gravar".
      queryClient.setQueryData<Lido>(queryKey, { direitos: gravado, estado: "ok" });
      return queryClient.invalidateQueries({ queryKey });
    },
  });

  /** Grava os tres direitos de uma vez (a RPC recebe os tres). Nunca lanca. */
  const guardar = useCallback(
    async (novos: DireitosSalariais): Promise<ResultadoDeGuardarDireitos> => {
      if (!organizationId || !pessoaId) return { erro: "hr.direitosSalariais.erro.dadosEmFalta" };
      try {
        await gravarDireitos(novos);
        return { erro: null };
      } catch (e) {
        if (rpcIndisponivel(e)) return { erro: "hr.direitosSalariais.indisponivel" };
        const chave = chaveDoErroDeRegrasSalariais(e);
        if (chave) return { erro: chave };
        if (isPermissionError(e)) return { erro: "hr.direitosSalariais.erro.semPermissao" };
        captureFlowError(e, "hr-pessoa-direitos-write");
        return { erro: await getFriendlyErrorMessage(e) };
      }
    },
    [organizationId, pessoaId, gravarDireitos],
  );

  return {
    direitos: data?.direitos ?? SEM_DIREITOS,
    estado: (data?.estado ?? "ok") as EstadoDosDireitos,
    isLoading: isLoading && enabled,
    isSaving,
    guardar,
    recarregar: refetch,
  };
}

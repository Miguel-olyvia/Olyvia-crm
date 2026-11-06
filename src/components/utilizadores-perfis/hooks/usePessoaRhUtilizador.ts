// Wrapper: o estado do campo «Pessoa do RH» do formulário de utilizador. A organização é a ATIVA (CompanyContext): é nela
// que `hasPermission` responde por `hr.pessoas.conta.link` e é dela que vêm as fichas, como no ecrã do RH. Sem a permissão
// não se lê nada e o campo não aparece. Depois de ligar, a lista volta a ler-se (a ficha deixa de estar livre).
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import type { EstadoPessoaRh } from "../pessoaRh";
import { mensagemDeErro } from "../rolesReais";
import { ligarPessoaRhNaBase, lerPessoasRh } from "./pessoaRhNaBase";

export const PERMISSAO_LIGAR_PESSOA = "hr.pessoas.conta.link";
const CHAVE_PESSOAS_RH = ["utilizadores-perfis", "pessoas-rh"] as const;

/** `aberto`: o formulário de utilizador está aberto; `utilizadorId`: o `anew_users.id` em edição (nada ao criar). */
export function usePessoaRhUtilizador(aberto: boolean, utilizadorId: string | undefined): EstadoPessoaRh {
  const { activeCompany } = useCompany();
  const { hasPermission, loading } = usePermissions();
  const cliente = useQueryClient();
  const organizacaoId = activeCompany?.id ?? null;
  const podeLigar = !loading && !!organizacaoId && hasPermission(PERMISSAO_LIGAR_PESSOA);
  const consulta = useQuery({
    queryKey: [...CHAVE_PESSOAS_RH, organizacaoId, utilizadorId ?? null],
    queryFn: () => lerPessoasRh(organizacaoId as string, utilizadorId),
    enabled: aberto && podeLigar,
  });
  const ligar = useCallback(async (pessoaId: string, alvo: string) => {
    const r = await ligarPessoaRhNaBase(pessoaId, alvo);
    try { await cliente.invalidateQueries({ queryKey: CHAVE_PESSOAS_RH }); } catch { /* a lista mostra o seu próprio erro */ }
    return r;
  }, [cliente]);
  return useMemo(() => ({
    podeLigar, organizacaoId,
    pessoas: consulta.data?.pessoas ?? [],
    ligadaId: consulta.data?.ligadaId ?? null,
    carregando: podeLigar && aberto && consulta.isLoading,
    erro: consulta.error ? mensagemDeErro(consulta.error) : null,
    ligar,
  }), [podeLigar, organizacaoId, aberto, consulta.data, consulta.isLoading, consulta.error, ligar]);
}

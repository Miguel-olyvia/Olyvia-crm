/**
 * O historico de alteracoes ao contrato de UMA pessoa: uma linha por campo
 * alterado, com o valor antes e depois, quem, quando, o motivo e o documento de
 * suporte (se houver).
 *
 * Le pela RPC `rpc_hr_vinculo_historico(p_pessoa_id)` (20261210310000), e nao
 * pela tabela `pessoas_vinculos_alteracoes`: a RPC devolve o NOME do autor e o
 * TITULO do documento, que a tabela so tem como ids, e aplica a mesma regra de
 * acesso da politica de SELECT (`hr.pessoas.vinculos.view`, ou a propria
 * pessoa com `hr.pessoas.view.own`); o documento so vem a quem pode ver
 * documentos. Sem permissao responde HRV05: nao e um defeito, e "nada para
 * mostrar".
 *
 * So le: a tabela e append-only, escrita por trigger. Inclui as alteracoes ao
 * cargo (`campo = 'cargo'`, `vinculo_id` nulo): fazem parte do mesmo historico.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";

/** Uma linha de `rpc_hr_vinculo_historico`, mais recente primeiro. */
export interface AlteracaoDoVinculo {
  id: string;
  vinculo_id: string | null;
  campo: string;
  valor_antes: string | null;
  valor_depois: string | null;
  data_efeito: string;
  motivo: string | null;
  /** So vem a quem pode ver documentos. */
  documento_id: string | null;
  documento_titulo: string | null;
  created_at: string;
  autor_id: string | null;
  /** `null` se a alteracao nao teve autor (sem sessao) ou o utilizador ja nao existe. */
  autor_nome: string | null;
}

/** HRV05 = sem sessao, sem permissao ou pessoa inexistente (a mesma resposta para as tres). */
function ehRecusa(error: unknown): boolean {
  if (isPermissionError(error)) return true;
  return (
    !!error && typeof error === "object" && (error as { code?: unknown }).code === "HRV05"
  );
}

export function usePessoaVinculoAlteracoes(pessoaId: string | undefined) {
  const [alteracoes, setAlteracoes] = useState<AlteracaoDoVinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId) {
      setAlteracoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrRpc("rpc_hr_vinculo_historico", { p_pessoa_id: pessoaId });
    if (error) {
      // Recusa por permissao = nada para mostrar; o resto e defeito.
      if (ehRecusa(error)) {
        setErro(false);
      } else {
        captureFlowError(error, "hr-vinculo-alteracoes-load");
        setErro(true);
      }
      setAlteracoes([]);
      setLoading(false);
      return;
    }
    setErro(false);
    setAlteracoes((data ?? []) as AlteracaoDoVinculo[]);
    setLoading(false);
  }, [pessoaId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { alteracoes, loading, erro, recarregar: load };
}

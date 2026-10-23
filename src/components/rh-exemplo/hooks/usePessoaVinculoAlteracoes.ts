/** O historico de alteracoes de contrato de uma pessoa de exemplo. */
import { useCallback } from "react";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";

export interface AlteracaoDoVinculo {
  id: string;
  vinculo_id: string | null;
  campo: string;
  valor_antes: string | null;
  valor_depois: string | null;
  data_efeito: string;
  motivo: string | null;
  documento_id: string | null;
  documento_titulo: string | null;
  created_at: string;
  autor_id: string | null;
  autor_nome: string | null;
}

const SEM_ALTERACOES: AlteracaoDoVinculo[] = [];

export function usePessoaVinculoAlteracoes(pessoaId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const recarregar = useCallback(async (): Promise<void> => undefined, []);
  return { alteracoes: ficha?.alteracoesVinculo ?? SEM_ALTERACOES, loading: false, erro: false, recarregar };
}

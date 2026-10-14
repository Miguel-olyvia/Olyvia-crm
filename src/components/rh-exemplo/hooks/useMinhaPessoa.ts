/** Quem está a ver o ecrã, na apresentação: uma pessoa de exemplo fixa (Sofia, de Recursos Humanos). */
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";

export interface MinhaPessoa {
  pessoaId: string | null;
  nome: string | null;
  cargo: string | null;
  dataAdmissao: string | null;
  loading: boolean;
  semFicha: boolean;
}

export function useMinhaPessoa(): MinhaPessoa {
  const minhaId = useEstadoRh((e) => e.minhaPessoaId);
  const pessoa = useEstadoRh((e) => (e.minhaPessoaId ? (e.fichas[e.minhaPessoaId]?.pessoa ?? null) : null));
  return {
    pessoaId: minhaId,
    nome: pessoa?.nome_completo ?? null,
    cargo: pessoa?.cargo ?? null,
    dataAdmissao: pessoa?.data_admissao ?? null,
    loading: false,
    semFicha: minhaId === null,
  };
}

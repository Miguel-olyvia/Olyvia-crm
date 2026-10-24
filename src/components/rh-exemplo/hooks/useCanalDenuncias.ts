/**
 * O contexto do canal de denúncias dentro da app: a ORGANIZAÇÃO ativa (a mesma que o resto do RH de exemplo usa, só o id e
 * o nome) e, em «A minha área», a pessoa que tem a sessão (a Sofia, nos dados de exemplo). Nunca uma filial nem um centro.
 */
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { PessoaLigada } from "@/components/canal-denuncias/lib/pessoaLigada";

export interface ContextoCanal {
  organizacaoId: string;
  organizacaoNome: string;
  /** Null se ninguém tem ficha ligada à sessão. */
  pessoa: PessoaLigada | null;
}

export function useContextoCanal(): ContextoCanal {
  const { activeCompany } = useCompany();
  const minha = useMinhaPessoa();
  const email = useEstadoRh((e) => (e.minhaPessoaId ? (e.fichas[e.minhaPessoaId]?.pessoa.email_trabalho ?? "") : ""));
  const pessoa = minha.pessoaId && minha.nome ? { id: minha.pessoaId, nome: minha.nome, email } : null;
  return { organizacaoId: activeCompany.id, organizacaoNome: activeCompany.name, pessoa };
}

/**
 * O contexto do canal de denúncias dentro da app: a ORGANIZAÇÃO ativa (a mesma que o resto do RH usa, só o id e o nome)
 * e, em «A minha área», a pessoa que tem a sessão. Nunca uma filial nem um centro.
 *
 * A ficha vem da base (useMinhaPessoa) e o email de trabalho da própria ficha (usePessoa): nada vem de dados de exemplo.
 * `carregando` fica verdadeiro até a ficha E o email estarem lidos, para o ecrã não piscar «Sem ficha» nem pré-preencher
 * uma denúncia identificada com o email por chegar.
 */
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { usePessoa } from "@/components/rh-exemplo/hooks/usePessoa";
import type { PessoaLigada } from "@/components/canal-denuncias/lib/pessoaLigada";

export interface ContextoCanal {
  organizacaoId: string;
  organizacaoNome: string;
  /** Null se ninguém tem ficha ligada à sessão (ou se ainda se está a ler: ver `carregando`). */
  pessoa: PessoaLigada | null;
  /** Verdadeiro enquanto a ficha ligada à sessão (e o seu email) ainda se está a ler. */
  carregando: boolean;
}

export function useContextoCanal(): ContextoCanal {
  const { activeCompany } = useCompany();
  const minha = useMinhaPessoa();
  const ficha = usePessoa(minha.pessoaId ?? undefined);
  const carregando = minha.loading || (minha.pessoaId !== null && ficha.loading);
  const email = ficha.pessoa?.email_trabalho ?? "";
  const pessoa = !carregando && minha.pessoaId && minha.nome ? { id: minha.pessoaId, nome: minha.nome, email } : null;
  return { organizacaoId: activeCompany.id, organizacaoNome: activeCompany.name, pessoa, carregando };
}

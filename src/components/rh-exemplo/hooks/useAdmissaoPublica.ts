/** O que a página pública do link precisa de saber: a admissão a que o token pertence e o que mostrar. Só memória. */
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { procurarPorToken, useAdmissoes } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { vistaPublica, type Admissao, type VistaPublica } from "@/components/rh-exemplo/lib/admissaoFluxo";

export interface AdmissaoPublica {
  admissao: Admissao | null;
  /** O token é o link em vigor (e não um que foi substituído). */
  atual: boolean;
  vista: VistaPublica;
  nome: string | null;
}

export function useAdmissaoPublica(token: string | undefined): AdmissaoPublica {
  const admissao = useAdmissoes((e) => procurarPorToken(e, token).admissao);
  const atual = useAdmissoes((e) => procurarPorToken(e, token).atual);
  const ficha = useFichaRh(admissao?.pessoaId);
  return { admissao, atual, vista: vistaPublica(admissao, atual, new Date()), nome: ficha?.pessoa.nome_completo ?? null };
}

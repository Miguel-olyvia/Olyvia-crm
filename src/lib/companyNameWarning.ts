/**
 * Aviso (nunca bloqueia) de que o nome escrito parece o de uma empresa mas o
 * campo Empresa esta vazio, ou de que a Empresa repete nome + apelido. Serve
 * para o nome aparecer certo nas propostas e PDFs: a regra do nome do cliente
 * e «empresa, senao nome + apelido».
 */
import { composeDisplayName } from "@/utils/composeDisplayName";

export type CompanyNameWarning = "looks-like-company" | "company-equals-name";

export interface CompanyNameWarningInput {
  first?: string | null;
  last?: string | null;
  company?: string | null;
}

// Lda, Lda., L.da, Ltda, S.A., Unipessoal, Sociedade em qualquer capitalizacao;
// «SA» so em maiusculas (um apelido «Sa» e uma pessoa).
// Tem de vir depois de outra palavra: «Lda» sozinho nao e uma firma.
const SUFFIX_CI = /\S[\s,]+(?:lda\.?|l\.da\.?|ltda\.?|s\.a\.?|unipessoal|sociedade)\s*$/i;
const SUFFIX_SA = /\S[\s,]+SA\s*$/;

const norm = (v: string | null | undefined): string => (v ?? "").trim().replace(/\s+/g, " ");
const endsLikeCompany = (v: string): boolean => !!v && (SUFFIX_CI.test(v) || SUFFIX_SA.test(v));

export function getCompanyNameWarning(input: CompanyNameWarningInput): CompanyNameWarning | null {
  const first = norm(input.first);
  const last = norm(input.last);
  const company = norm(input.company);
  const person = composeDisplayName(first, last);

  if (!company) {
    return endsLikeCompany(first) || endsLikeCompany(last) || endsLikeCompany(person)
      ? "looks-like-company"
      : null;
  }
  if (person && company.toLowerCase() === person.toLowerCase()) return "company-equals-name";
  return null;
}

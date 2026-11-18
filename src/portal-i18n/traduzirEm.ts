// t() e tn() com o idioma dado de fora, sem armazém nem React: para componentes partilhados com o CRM que recebem
// o idioma por prop (ex.: ProposalPortalDocument) e, sem a prop, ficam em português como sempre.
import { traduzir, traduzirN } from "./traduzir";
import { ehPortalIdioma, IDIOMA_OMISSAO, type PortalIdioma } from "./tipos";
import type { PortalTraducao } from "./usePortalT";

/** Um valor que não seja «pt» nem «en» (vindo de fora, sem tipos) cai no português em vez de rebentar. */
export function traduzirEm(idioma: PortalIdioma): PortalTraducao {
  const efetivo = ehPortalIdioma(idioma) ? idioma : IDIOMA_OMISSAO;
  return {
    idioma: efetivo,
    t: (chave, params) => traduzir(efetivo, chave, params),
    tn: (chaveUm, chaveVarios, n, params) => traduzirN(efetivo, chaveUm, chaveVarios, n, params),
  };
}

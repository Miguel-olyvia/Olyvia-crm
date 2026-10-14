// O que cada aba do painel "Nova pessoa" recebe: os valores, como alterá-los e a mensagem de erro de cada campo.
import type { CampoNova, CodigoErroNova, ValoresNovaPessoa } from "./valores";

export interface CamposNovaProps {
  valores: ValoresNovaPessoa;
  definir: (alteracao: Partial<ValoresNovaPessoa>) => void;
  /** A mensagem (já traduzida) do campo, ou `null` se não há erro ou ainda não se mostra. */
  erro: (campo: CampoNova) => string | null;
}

/** O id do controlo de um campo: o mesmo no rótulo, no `aria-describedby` e no foco ao primeiro erro. */
export const idCampo = (campo: CampoNova): string => `rh-nova-${campo}`;

type Traduzir = (chave: string) => string;

/** A mensagem de um erro: a específica do campo se existir, senão a do código. */
export function mensagemErro(t: Traduzir, campo: CampoNova, codigo: CodigoErroNova): string {
  const especifica = `rhForm.nova.erro.${campo}.${codigo}`;
  const texto = t(especifica);
  return texto === especifica ? t(`rhForm.nova.erro.${codigo}`) : texto;
}

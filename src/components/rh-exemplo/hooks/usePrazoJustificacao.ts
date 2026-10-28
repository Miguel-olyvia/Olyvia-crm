/**
 * O prazo para justificar faltas e justificacoes de dia, em dias uteis: DA ORGANIZACAO, configuravel, 5 por omissao.
 * Delega ao hook real (`useRegrasAssiduidade`, que le e grava por RPC) e entrega aos ecras de /rh-exemplo so o que eles
 * precisam. Substitui o `prazoFaltaDias` que vivia no store em memoria e nao gravava em lado nenhum.
 *
 * QUANDO A LEITURA FALHA (a migration ainda por aplicar, uma recusa de permissao, a rede): `dias` e 5, a omissao, so para
 * CALCULAR a situacao dos dias; `leitura.falhou` e verdadeiro e o ecra tem de o dizer (`AvisoDoPrazo`), porque esse 5 nao
 * e o valor da organizacao. `podeAlterar` e falso nesse caso: nao se oferece gravar sobre uma leitura que nao se fez.
 */
import { useRegrasAssiduidade, type LeituraDasRegras, type ResultadoDeGuardar } from "@/hooks/useRegrasAssiduidade";

export type { LeituraDasRegras, ResultadoDeGuardar };

export interface PrazoJustificacao {
  /** Dias uteis para justificar. A omissao (5) se a leitura falhou: ver `leitura`. */
  dias: number;
  leitura: LeituraDasRegras;
  /** A organizacao ja guardou um valor (senao o 5 e a omissao). */
  gravado: boolean;
  /** Quem consulta pode gravar o prazo (permissao de configuracao, e a leitura foi feita). */
  podeAlterar: boolean;
  aCarregar: boolean;
  aGravar: boolean;
  /** Valida 1 a 30 e grava; devolve `{ erro: null }` ou a chave de traducao / mensagem do erro. Nunca lanca. */
  gravar: (dias: number) => Promise<ResultadoDeGuardar>;
  recarregar: () => void;
}

export function usePrazoJustificacao(): PrazoJustificacao {
  const { prazoJustificacaoDias, leitura, gravado, podeAlterar, isLoading, isSaving, guardar, recarregar } = useRegrasAssiduidade();
  return {
    dias: prazoJustificacaoDias,
    leitura,
    gravado,
    podeAlterar,
    aCarregar: isLoading,
    aGravar: isSaving,
    gravar: guardar,
    recarregar: () => void recarregar(),
  };
}

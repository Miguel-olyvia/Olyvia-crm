/**
 * O limite anual de horas extra de uma pessoa é o «Horas anuais máximas» do vínculo vigente
 * (`pessoas_vinculos.horas_anuais_maximas`, aba Contrato, grupo «Tempo de trabalho»), lido da base pela ficha real.
 * Sem esse valor no contrato vale o limite anual por omissão da organização. O limite por dia é regra da organização.
 */
import { useMemo } from "react";
import { usePessoa } from "@/components/rh-exemplo/hooks/usePessoa";
import { limiteAnualMin } from "./limiteAnualPuro";

export { limiteAnualMin };
export type { VinculoParaLimite } from "./limiteAnualPuro";

export interface LimiteAnualDaPessoa {
  /** O limite a aplicar: o do contrato, ou o da organização quando o contrato não o define. */
  limiteMin: number;
  /** De onde veio `limiteMin`. Enquanto carrega ou se a leitura falhou, é sempre a omissão da organização. */
  origem: "contrato" | "omissao";
  aCarregar: boolean;
  /** Mensagem da leitura que falhou, para o ecrã a mostrar; `null` se correu bem. */
  erro: string | null;
}

/** O limite anual lido do contrato real, dizendo se ainda carrega ou se a leitura falhou (nunca finge que correu bem). */
export function useLimiteAnualDaPessoa(pessoaId: string, omissaoMin: number): LimiteAnualDaPessoa {
  const { vinculos, loading, error } = usePessoa(pessoaId);
  return useMemo(() => {
    const falhou = typeof error === "string" && error !== "";
    const doContrato = loading || falhou ? -1 : limiteAnualMin({ vinculos }, -1);
    return {
      limiteMin: doContrato > 0 ? doContrato : omissaoMin,
      origem: doContrato > 0 ? "contrato" : "omissao",
      aCarregar: loading,
      erro: falhou ? error : null,
    };
  }, [vinculos, loading, error, omissaoMin]);
}

export function useLimiteAnualMin(pessoaId: string, omissaoMin: number): number {
  return useLimiteAnualDaPessoa(pessoaId, omissaoMin).limiteMin;
}

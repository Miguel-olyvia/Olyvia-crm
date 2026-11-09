/**
 * As pessoas cujo resultado o fecho do periodo TEM de enviar: activas, com vinculo sobreposto ao periodo
 * (`[de, ate]`, inclusivos). A RPC recusa quem falta (`resultado_em_falta`) e quem nao tem vinculo
 * (`pessoa_fora_do_periodo`). Os vinculos vem de `usePessoasVinculosVigentes`; sem eles (recusa ou erro) nao se sabe
 * quem e obrigatoria e o fecho fica bloqueado (`estado` != `ok`).
 */
import { useMemo } from "react";
import { usePessoasVinculosVigentes } from "@/hooks/usePessoasVinculosVigentes";
import { pessoasObrigatoriasDoFecho, type EstadoLeitura } from "@/lib/hr/resultadosFecho";

export function usePessoasObrigatoriasDoFecho(pessoasActivas: readonly string[], de: string, ate: string) {
  const { vinculos, loading, recusado, error } = usePessoasVinculosVigentes();
  const estado: EstadoLeitura = loading ? "a_carregar" : recusado ? "recusado" : error ? "erro" : "ok";
  const obrigatorias = useMemo(
    () => (estado === "ok" ? pessoasObrigatoriasDoFecho(pessoasActivas, vinculos, de, ate) : []),
    [estado, pessoasActivas, vinculos, de, ate],
  );
  return { obrigatorias, estado };
}

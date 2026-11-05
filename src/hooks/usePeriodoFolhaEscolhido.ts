/**
 * A folha (periodo) que um ecra de Processamento esta a mostrar: o mes do FECHO (ano, mes 1-12) e quem o escolhe. Por omissao,
 * a folha que contem o dia de hoje (em Lisboa) pelas regras do periodo; sem regra, o mes de calendario.
 *
 * CONVENCAO DE MES: aqui e em todo o ecra o mes e 1-12. O relatorio mensal de assiduidade e 0-11; a conversao faz-se num
 * so sitio, no wrapper `rh-exemplo/hooks/useRelatorioAssiduidadeMensal` e em `ResumoPessoaProcessamentoOculto` (hr).
 */
import { useCallback, useMemo, useState } from "react";
import { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
import { hojeEmLisboa, periodoDoDia } from "@/lib/hr/periodoFolha";

export function usePeriodoFolhaEscolhido() {
  const { regras } = usePeriodoFolhaRegras();
  const [escolha, setEscolha] = useState<{ ano: number; mes: number } | null>(null);
  const porOmissao = useMemo(() => periodoDoDia(hojeEmLisboa(), regras), [regras]);
  const { ano, mes } = escolha ?? porOmissao;
  const escolher = useCallback((novoAno: number, novoMes: number) => setEscolha({ ano: novoAno, mes: novoMes }), []);
  return { ano, mes, escolher, regras };
}
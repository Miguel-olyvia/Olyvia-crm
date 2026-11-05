/**
 * UMA instancia oculta de `useRelatorioAssiduidadeMensal`, por pessoa --
 * MESMO PADRAO de `RelatorioAssiduidadeMensalOrganizacao.tsx`
 * (`aoTerminarCarregamento` + `aoObterDados` via callback para um acumulador
 * no componente pai).
 *
 * PORQUE NAO SE CHAMA O HOOK NUM CICLO
 * -----------------------------------------
 * As regras dos hooks nao deixam chamar `useRelatorioAssiduidadeMensal` dentro
 * de um `for`/`map` no componente pai. A alternativa seria uma vista/RPC do
 * lado da base que agregasse isto por organizacao+mes sem depender do hook
 * React -- mas isso duplicaria, em SQL, a mesma logica de estados do dia
 * (feriado/descanso/ausencia/sem_registo) que `useRelatorioAssiduidadeMensal`
 * ja calcula e que `RelatorioAssiduidadeMensalOrganizacao.tsx` ja resolveu
 * com este padrao exacto. Reaproveitar o padrao existente ganha consistencia
 * (o resumo do processamento nunca pode divergir do relatorio de
 * assiduidade) e evita construir uma segunda fonte de verdade em SQL para o
 * mesmo calculo.
 *
 * Nao renderiza nada visivel -- so dispara o hook e devolve o resultado por
 * callback.
 */
import { useEffect, useRef } from "react";
import { useRelatorioAssiduidadeMensal } from "@/hooks/useRelatorioAssiduidadeMensal";
import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";
import type { IntervaloDaFolha } from "@/lib/hr/periodoFolha";

interface ResumoPessoaProcessamentoOcultoProps {
  pessoaId: string;
  ano: number;
  /** Mes do FECHO da folha, de 1 a 12. A conversao para o 0-11 do relatorio mensal e a unica, aqui. */
  mes: number;
  /** O intervalo da folha (de, ate inclusivos): faltas, horas extra e assiduidade contam por ele. */
  intervalo?: IntervaloDaFolha;
  aoTerminarCarregamento: (
    pessoaId: string,
    totais: TotaisRelatorioMensal,
    dias: readonly DiaRelatorioMensal[],
  ) => void;
}

export function ResumoPessoaProcessamentoOculto({
  pessoaId,
  ano,
  mes,
  intervalo,
  aoTerminarCarregamento,
}: ResumoPessoaProcessamentoOcultoProps) {
  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, ano, mes - 1, intervalo);
  const avisouRef = useRef(false);

  useEffect(() => {
    avisouRef.current = false;
  }, [pessoaId, ano, mes, intervalo?.de, intervalo?.ate]);

  useEffect(() => {
    if (relatorio.loading || avisouRef.current) return;
    avisouRef.current = true;
    aoTerminarCarregamento(pessoaId, relatorio.totais, relatorio.dias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio.loading, relatorio.totais, relatorio.dias, pessoaId]);

  return null;
}

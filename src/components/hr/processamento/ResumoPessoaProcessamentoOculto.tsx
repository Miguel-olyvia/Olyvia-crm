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
import type { TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

interface ResumoPessoaProcessamentoOcultoProps {
  pessoaId: string;
  ano: number;
  mes: number;
  aoTerminarCarregamento: (pessoaId: string, totais: TotaisRelatorioMensal) => void;
}

export function ResumoPessoaProcessamentoOculto({
  pessoaId,
  ano,
  mes,
  aoTerminarCarregamento,
}: ResumoPessoaProcessamentoOcultoProps) {
  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, ano, mes);
  const avisouRef = useRef(false);

  useEffect(() => {
    avisouRef.current = false;
  }, [pessoaId, ano, mes]);

  useEffect(() => {
    if (relatorio.loading || avisouRef.current) return;
    avisouRef.current = true;
    aoTerminarCarregamento(pessoaId, relatorio.totais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio.loading, relatorio.totais, pessoaId]);

  return null;
}

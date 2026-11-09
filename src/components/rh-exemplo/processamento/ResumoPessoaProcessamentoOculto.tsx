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
import { useRelatorioAssiduidadeMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";

interface ResumoPessoaProcessamentoOcultoProps {
  pessoaId: string;
  ano: number;
  /** 1-12 (o wrapper do relatorio converte). */
  mes: number;
  intervalo?: { de: string; ate: string };
  /** As faixas noturnas da regra em vigor (memoizadas por quem chama): sem elas nao ha minutos noturnos por faixa. */
  faixasNoturnas?: readonly { hora_inicio: string; hora_fim: string }[];
  aoTerminarCarregamento: (
    pessoaId: string,
    totais: TotaisRelatorioMensal,
    dias: readonly DiaRelatorioMensal[],
    /** A assiduidade foi lida so em parte (recusada, com erro): o calculo desta pessoa nao pode fechar o periodo. */
    incompleta: boolean,
  ) => void;
}

export function ResumoPessoaProcessamentoOculto({
  pessoaId,
  ano,
  mes,
  intervalo,
  faixasNoturnas,
  aoTerminarCarregamento,
}: ResumoPessoaProcessamentoOcultoProps) {
  const relatorio = useRelatorioAssiduidadeMensal(pessoaId, ano, mes, intervalo, faixasNoturnas);
  const avisouRef = useRef(false);

  useEffect(() => {
    avisouRef.current = false;
  }, [pessoaId, ano, mes, intervalo?.de, intervalo?.ate, faixasNoturnas]);

  useEffect(() => {
    if (relatorio.loading || avisouRef.current) return;
    avisouRef.current = true;
    aoTerminarCarregamento(
      pessoaId,
      relatorio.totais,
      relatorio.dias,
      relatorio.realizadoRecusado || relatorio.faltasRecusadas || relatorio.planeadoRecusado || relatorio.ausenciasRecusadas === true || relatorio.feriadosRecusados === true || relatorio.tiposRecusados === true || relatorio.erro,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio.loading, relatorio.totais, relatorio.dias, pessoaId]);

  return null;
}

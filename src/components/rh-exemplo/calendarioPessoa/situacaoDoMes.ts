/**
 * A situação de justificação de cada dia do mês (pode justificar, enviada, aceite, recusada, prazo terminado), lida do
 * calendário e da loja das justificações. A parte pura (`situacoesDosDias`) serve a célula, o painel do dia e os testes.
 */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { useJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { situacaoDoDia, type JustificacaoDia, type SituacaoDoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { desvioJustificavel, type DesvioJustificavel } from "./desvioJustificavel";
import type { DiaCalendario } from "./montarMes";

export interface SituacaoComDesvio {
  situacao: SituacaoDoDia;
  desvio: DesvioJustificavel | null;
}

export function situacaoDeUmDia(
  dia: DiaCalendario,
  justificacoes: readonly JustificacaoDia[],
  prazoDias: number,
  hoje: string,
): SituacaoComDesvio {
  const desvio = desvioJustificavel(dia);
  return { situacao: situacaoDoDia({ data: dia.data, hoje, prazoDias, temDesvio: desvio !== null, justificacoes }), desvio };
}

export function situacoesDosDias(
  dias: readonly DiaCalendario[],
  justificacoes: readonly JustificacaoDia[],
  prazoDias: number,
  hoje: string,
): Map<string, SituacaoComDesvio> {
  return new Map(dias.map((d) => [d.data, situacaoDeUmDia(d, justificacoes, prazoDias, hoje)]));
}

/** As justificações de uma pessoa (todas as datas), da loja. */
export function useJustificacoesDeDiaDaPessoa(pessoaId: string): JustificacaoDia[] {
  const todas = useJustificacaoDia((e) => e.justificacoes);
  return useMemo(() => todas.filter((j) => j.pessoaId === pessoaId), [todas, pessoaId]);
}

export function useSituacoesDoMes(pessoaId: string, dias: readonly DiaCalendario[] | undefined): Map<string, SituacaoComDesvio> {
  const justificacoes = useJustificacoesDeDiaDaPessoa(pessoaId);
  const prazoDias = useFluxosB((e) => e.prazoFaltaDias);
  return useMemo(() => situacoesDosDias(dias ?? [], justificacoes, prazoDias, hojeIso()), [dias, justificacoes, prazoDias]);
}

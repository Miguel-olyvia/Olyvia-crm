/**
 * A situação de justificação de cada dia do mês (pode justificar, enviada, aceite, recusada, prazo terminado), lida do
 * calendário e das justificações guardadas na base. A parte pura (`situacoesDosDias`) serve a célula, o painel do dia e os
 * testes; a leitura vem de `useJustificacoesDoDia` e acompanha as gravações (registar e decidir relêem todas as leituras).
 */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useJustificacoesDoDia } from "@/components/rh-exemplo/hooks/useJustificacoesDoDia";
import { usePrazoJustificacao } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";
import { somarDias } from "@/components/rh-exemplo/lib/ausencias";
import { situacaoDoDia, type JustificacaoDia, type SituacaoDoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { desvioJustificavel, type DesvioJustificavel } from "./desvioJustificavel";
import type { DiaCalendario } from "./montarMes";

export interface SituacaoComDesvio {
  situacao: SituacaoDoDia;
  desvio: DesvioJustificavel | null;
}

/** Quantos dias para trás se lêem as justificações de uma pessoa quando o ecrã não diz a janela (o prazo é de 5 dias úteis). */
export const DIAS_DE_HISTORICO_DE_JUSTIFICACOES = 90;

export interface JanelaDeJustificacoes {
  de: string;
  ate: string;
}

/** Como correu a leitura das justificações: `ok`, ainda a ler, recusada, falhada ou por aplicar na base. */
export interface LeituraDeJustificacoes {
  loading: boolean;
  recusado: boolean;
  erro: boolean;
  indisponivel: boolean;
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

/**
 * As justificações de uma pessoa numa janela, da base. Sem janela, os últimos `DIAS_DE_HISTORICO_DE_JUSTIFICACOES` dias.
 * `activo: false` não lê nada (o mês ainda não está carregado).
 */
export function useJustificacoesDeDiaDaPessoa(pessoaId: string, janela?: JanelaDeJustificacoes | null, activo = true) {
  const hoje = hojeIso();
  const de = janela?.de ?? somarDias(hoje, -DIAS_DE_HISTORICO_DE_JUSTIFICACOES);
  const ate = janela?.ate ?? hoje;
  return useJustificacoesDoDia({ pessoaId, de, ate, activo: activo && Boolean(pessoaId) });
}

export function useSituacoesDoMes(
  pessoaId: string,
  dias: readonly DiaCalendario[] | undefined,
): { situacoes: Map<string, SituacaoComDesvio>; leitura: LeituraDeJustificacoes } {
  const primeiro = dias?.[0]?.data ?? null;
  const ultimo = dias && dias.length > 0 ? dias[dias.length - 1].data : null;
  const janela = useMemo(() => (primeiro && ultimo ? { de: primeiro, ate: ultimo } : null), [primeiro, ultimo]);
  const { justificacoes, loading, recusado, erro, indisponivel } = useJustificacoesDeDiaDaPessoa(pessoaId, janela, janela !== null);
  // O prazo da organizacao, lido UMA vez (o mes inteiro calcula com o mesmo numero); se a leitura falhar e a omissao (5)
  // e o ecra di-lo onde o prazo e mostrado (AvisoDoPrazo).
  const { dias: prazoDias } = usePrazoJustificacao();
  const situacoes = useMemo(() => situacoesDosDias(dias ?? [], justificacoes, prazoDias, hojeIso()), [dias, justificacoes, prazoDias]);
  return { situacoes, leitura: { loading, recusado, erro, indisponivel } };
}

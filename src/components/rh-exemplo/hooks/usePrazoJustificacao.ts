/**
 * O prazo para justificar faltas e justificacoes de dia: o fim do periodo da folha que contem o dia, DA BASE
 * (`hr_justificacao_dia_prazo`, uma chamada por periodo, em `@/hooks/usePrazoJustificacaoPorPeriodo`). Quem consulta passa as
 * datas de que precisa. Enquanto a base nao responde (RPC por aplicar, recusa, rede) o prazo e o calculado pelas regras, e
 * `estimativaDe(data)` diz que e uma estimativa.
 */
import { usePrazoJustificacaoPorPeriodo, type PrazoPorPeriodo } from "@/hooks/usePrazoJustificacaoPorPeriodo";

export type PrazoJustificacao = PrazoPorPeriodo;

export function usePrazoJustificacao(datas?: readonly string[]): PrazoJustificacao {
  return usePrazoJustificacaoPorPeriodo(datas);
}
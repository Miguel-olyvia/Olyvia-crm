/**
 * Estados de rejeição do funil de leads — uma só fonte de verdade.
 *
 * O problema que isto resolve: o cartão "Lost / Rejected" somava
 * `lost + rejected` mas clicar nele filtrava só pelo `name` da etapa. Numa
 * organização cuja etapa se chama `rejected` (BMGest) o número do cartão e as
 * linhas da lista nunca batiam certo, e uma lead em `lost` ficava invisível.
 *
 * A regra passa a ser: **o número que um cartão mostra tem de ser exactamente
 * o número de linhas que a lista mostra quando se clica nesse cartão.** Para
 * isso, contagem e filtro têm de usar a MESMA lista de nomes — a que estas
 * funções devolvem.
 */

/**
 * Literais sempre incluídos, mesmo que a organização não tenha nenhuma etapa
 * marcada como `is_rejection`: dados antigos e funis por configurar usam-nos.
 * `Rejected` com maiúscula existe em dados legados e era somado à mão no
 * cartão — mantém-se para o filtro continuar a ser um superconjunto do
 * comportamento anterior, nunca um subconjunto.
 */
export const DEFAULT_REJECTION_STATUS_NAMES = ["lost", "rejected", "Rejected"] as const;

/** O mínimo que precisamos de saber de uma etapa para esta decisão. */
export interface RejectionStageLike {
  name?: string | null;
  is_rejection?: boolean | null;
}

/**
 * Nomes de status que contam como rejeição para esta organização: os das
 * etapas marcadas `is_rejection`, mais os literais por omissão. Sem duplicados,
 * com os literais no fim para a ordem ser estável entre renders.
 */
export function getRejectionStatusNames(
  stages: readonly RejectionStageLike[] | null | undefined
): string[] {
  const names: string[] = [];
  for (const stage of stages ?? []) {
    if (!stage?.is_rejection) continue;
    const name = typeof stage.name === "string" ? stage.name.trim() : "";
    if (name && !names.includes(name)) names.push(name);
  }
  for (const literal of DEFAULT_REJECTION_STATUS_NAMES) {
    if (!names.includes(literal)) names.push(literal);
  }
  return names;
}

/**
 * Se o filtro activo é um estado de rejeição — e portanto a consulta deve
 * abranger todos eles em vez de só o nome clicado.
 */
export function shouldApplyRejectionUnion(
  statusFilter: string | null | undefined,
  rejectionStatusNames: readonly string[]
): boolean {
  if (!statusFilter || statusFilter === "all") return false;
  return rejectionStatusNames.includes(statusFilter);
}

/**
 * Soma as contagens de todos os estados de rejeição. É o número do cartão, e
 * tem de corresponder ao que o filtro devolve.
 */
export function sumRejectionStatusCounts(
  counts: Record<string, number> | null | undefined,
  rejectionStatusNames: readonly string[]
): number {
  if (!counts) return 0;
  return rejectionStatusNames.reduce((total, name) => total + (counts[name] || 0), 0);
}

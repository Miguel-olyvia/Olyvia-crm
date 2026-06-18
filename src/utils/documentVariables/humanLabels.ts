/**
 * Fonte única para etiquetas humanas usadas em chips, pickers e mensagens
 * de erro. Reaproveita os labels definidos no registry.
 */

import { VARIABLE_REGISTRY, type VariableGroup, getVariableDefinition, resolveAlias } from "./registry";

export function labelForKey(keyOrAlias: string): string {
  const def = getVariableDefinition(resolveAlias(keyOrAlias));
  return def?.label || keyOrAlias;
}

export function groupedVariables(): Record<VariableGroup, { key: string; label: string }[]> {
  const grouped = {} as Record<VariableGroup, { key: string; label: string }[]>;
  for (const v of VARIABLE_REGISTRY) {
    (grouped[v.group] = grouped[v.group] || []).push({ key: v.key, label: v.label });
  }
  return grouped;
}

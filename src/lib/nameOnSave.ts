/**
 * Gravar a ficha nao pode estragar o nome que o ecra mostra.
 *
 * O cabecalho mostra o `display_name` da ficha (que pode ser o nome de uma
 * EMPRESA, ver getEntityDisplayName) e o formulario de edicao mostra
 * nome/apelido. Gravar sem tocar no nome nao o pode estragar.
 *
 * Regra: se o utilizador alterou nome ou apelido, o display_name passa a ser
 * nome + apelido (troca sempre o antigo, mesmo o de uma empresa). Se nao os
 * alterou, mantem-se EM BRUTO como esta na ficha.
 */
import { composeDisplayName, normalizeFirstLast } from "@/utils/composeDisplayName";

type NameFieldValue = string | null | undefined;

const norm = (value: NameFieldValue): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

/** true se algum dos campos de nome difere do carregado (espacos e null vs vazio nao contam). */
export function nameFieldsChanged(
  loaded: Record<string, NameFieldValue>,
  edited: Record<string, NameFieldValue>,
): boolean {
  const keys = new Set([...Object.keys(loaded), ...Object.keys(edited)]);
  for (const key of keys) {
    if (norm(loaded[key]) !== norm(edited[key])) return true;
  }
  return false;
}

export interface ClientNameForSave {
  displayName: string;
  first: string | null;
  last: string | null;
}

/**
 * Nome a gravar numa ficha de cliente. `current` e o que foi carregado (o
 * display_name da ficha e o nome/apelido que o formulario mostrou); `edited`
 * e o que o utilizador deixou no formulario.
 */
export function resolveClientNameForSave(
  current: { display_name?: string | null; first_name?: string | null; last_name?: string | null },
  edited: { first_name?: string | null; last_name?: string | null },
): ClientNameForSave {
  const normalized = normalizeFirstLast(edited.first_name, edited.last_name);
  const changed = nameFieldsChanged(
    { first: current.first_name, last: current.last_name },
    { first: edited.first_name, last: edited.last_name },
  );
  // Em BRUTO, tal como esta na ficha: gravar sem tocar no nome nao pode mudar
  // o valor guardado (nem espacos duplos ou NBSP). So se normaliza ao compor.
  const stored = typeof current.display_name === "string" ? current.display_name : "";
  const kept = stored.trim() ? stored : "";
  const displayName = !changed && kept
    ? kept
    : composeDisplayName(normalized.first, normalized.last);
  return { displayName, first: normalized.first, last: normalized.last };
}

/**
 * Editar uma lead: se o nome ou o apelido mudaram, o nome da ficha TROCA para
 * nome + apelido (nunca fica o antigo ao lado do novo). O campo «empresa» da
 * lead e so um campo da lead e nao decide o nome. Devolve null quando nao ha
 * nada a gravar (nome intocado, ou apagado por completo).
 */
export function resolveLeadEditNameForSave(
  original: { first?: string | null; last?: string | null },
  edited: { first?: string | null; last?: string | null },
): ClientNameForSave | null {
  if (!nameFieldsChanged(
    { first: original.first, last: original.last },
    { first: edited.first, last: edited.last },
  )) return null;
  const normalized = normalizeFirstLast(edited.first, edited.last);
  const displayName = composeDisplayName(normalized.first, normalized.last);
  if (!displayName) return null;
  return { displayName, first: normalized.first, last: normalized.last };
}

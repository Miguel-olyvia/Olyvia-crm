/**
 * Gravar a ficha nao pode estragar o nome que o ecra mostra.
 *
 * O cabecalho mostra o `display_name` da ficha (que pode ser o nome de uma
 * EMPRESA, ver getEntityDisplayName) e o formulario de edicao mostra
 * nome/apelido. Se a gravacao recompusesse SEMPRE o display_name a partir de
 * nome + apelido, gravar uma ficha sem tocar no nome trocava "Empresa X, Lda"
 * por "Empresa X, Lda" partido em dois campos -- ou pior, por outro texto.
 *
 * Regra: o display_name so e recomposto quando o utilizador alterou os campos
 * de nome em relacao ao que foi carregado. Se nao os alterou, mantem-se.
 */
import { normalizeFirstLast } from "@/utils/composeDisplayName";
import { composeNameForSave } from "@/lib/entityDisplayName";

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
  current: { display_name?: string | null; first_name?: string | null; last_name?: string | null; company_name?: string | null },
  edited: { first_name?: string | null; last_name?: string | null },
): ClientNameForSave {
  const normalized = normalizeFirstLast(edited.first_name, edited.last_name);
  const changed = nameFieldsChanged(
    { first: current.first_name, last: current.last_name },
    { first: edited.first_name, last: edited.last_name },
  );
  const kept = norm(current.display_name);
  const displayName = !changed && kept
    ? kept
    : composeNameForSave({ company: current.company_name, first: normalized.first, last: normalized.last });
  return { displayName, first: normalized.first, last: normalized.last };
}

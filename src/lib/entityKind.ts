/**
 * Pessoa ou Empresa: o tipo da ficha e o nome UM SO.
 *
 * Ao criar ou editar uma lead/cliente escolhe-se Pessoa ou Empresa. Empresa:
 * um so campo «Nome da empresa», e e esse o nome da ficha. Pessoa: nome +
 * apelido. Editar TROCA o nome em todo o lado; nunca ficam o antigo e o novo.
 *
 * A gravacao pelo tipo e feita pela RPC rpc_set_entity_kind. Enquanto ela nao
 * estiver aplicada na base, o ecra cai no caminho anterior (nome explicito pelo
 * tipo escolhido, sem alterar o tipo da ficha) para nunca ficar sem poder editar.
 */
import { composeDisplayName, normalizeFirstLast } from "@/utils/composeDisplayName";
import { nameFieldsChanged } from "@/lib/nameOnSave";

export type EntityKind = "person" | "organization";

export interface KindFormState {
  kind: EntityKind;
  first: string;
  last: string;
  /** «Nome da empresa». Nunca se perde ao trocar o seletor. */
  company: string;
}

const collapse = (v: string | null | undefined): string => (v ?? "").replace(/\s+/g, " ").trim();

/** Estado inicial do formulario a partir da ficha (e da coluna company_name, se ja existir). */
export function initialKindState(
  entity: { type?: string | null; display_name?: string | null; first_name?: string | null; last_name?: string | null },
  companyColumn?: string | null,
): KindFormState {
  const kind: EntityKind = entity.type === "organization" ? "organization" : "person";
  const first = collapse(entity.first_name);
  const last = collapse(entity.last_name);
  const shown = collapse(entity.display_name);
  let company = collapse(companyColumn);
  if (!company) {
    if (kind === "organization") company = shown || first;
    else if (shown && shown.toLowerCase() !== composeDisplayName(first, last).toLowerCase()) company = shown;
  }
  return { kind, first, last, company };
}

export interface NameSavePlan {
  rpcArgs: {
    p_type: EntityKind;
    p_first_name: string | null;
    p_last_name: string | null;
    p_company_name: string | null;
  };
  /** O nome que a ficha deve ficar a mostrar. */
  displayName: string;
  /** Caminho anterior (RPC em falta): nome e campos a mandar a rpc_update_* sem mudar o tipo. */
  fallback: { displayName: string; first: string | null; last: string | null };
}

/**
 * Null = nada do nome/tipo mudou: nao se chama a RPC e o nome fica exactamente
 * como esta. Senao, os argumentos da RPC e o nome esperado.
 */
export function planNameSave(
  original: KindFormState,
  edited: KindFormState,
  originalType: string | null | undefined,
): NameSavePlan | null {
  const changed = edited.kind !== original.kind
    || (edited.kind === "person"
      ? nameFieldsChanged({ first: original.first, last: original.last }, { first: edited.first, last: edited.last })
      : collapse(edited.company) !== collapse(original.company));
  if (!changed) return null;

  if (edited.kind === "organization") {
    const company = collapse(edited.company);
    const wasOrg = originalType === "organization";
    return {
      rpcArgs: { p_type: "organization", p_first_name: null, p_last_name: null, p_company_name: company },
      displayName: company,
      fallback: {
        displayName: company,
        first: wasOrg ? company : original.first || null,
        last: wasOrg ? null : original.last || null,
      },
    };
  }
  const n = normalizeFirstLast(edited.first, edited.last);
  const displayName = composeDisplayName(n.first, n.last);
  return {
    rpcArgs: { p_type: "person", p_first_name: n.first, p_last_name: n.last, p_company_name: null },
    displayName,
    fallback: { displayName, first: n.first, last: n.last },
  };
}

export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "PGRST202" || e.code === "42883") return true;
  const message = (e.message ?? "").toLowerCase();
  return message.includes("could not find the function") && message.includes("rpc_set_entity_kind");
}

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export type SetEntityKindResult = { status: "ok"; displayName: string } | { status: "missing" };

/** Chama rpc_set_entity_kind. «missing» quando a base ainda nao a tem; outro erro propaga. */
export async function setEntityKind(
  client: RpcClient,
  entityId: string,
  plan: NameSavePlan,
): Promise<SetEntityKindResult> {
  const { data, error } = await client.rpc("rpc_set_entity_kind", { p_entity_id: entityId, ...plan.rpcArgs });
  if (error) {
    if (isMissingFunctionError(error)) return { status: "missing" };
    throw error;
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const returned = [d.display_name, d.name, d.nome].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { status: "ok", displayName: returned ?? plan.displayName };
}

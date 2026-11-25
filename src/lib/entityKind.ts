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

export type SetEntityKindResult =
  | { status: "ok"; displayName: string; type: EntityKind; firstName: string | null; lastName: string | null }
  | { status: "missing" };

const asText = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

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
  const returned = [d.display_name, d.name, d.nome].map(asText).find((v): v is string => v !== null);
  return {
    status: "ok",
    displayName: returned ?? plan.displayName,
    type: d.type === "organization" || d.type === "person" ? d.type : plan.rpcArgs.p_type,
    // A base devolve a ficha final; sem esses campos na resposta, vale o que se enviou.
    firstName: "first_name" in d ? asText(d.first_name) : plan.rpcArgs.p_first_name,
    lastName: "last_name" in d ? asText(d.last_name) : plan.rpcArgs.p_last_name,
  };
}

/**
 * Resultado da PRIMEIRA gravacao do ecra (o tipo e o nome):
 *  none    nada do nome/tipo mudou, nao se chamou a base;
 *  ok      a base gravou o tipo e o nome (e devolveu a ficha final);
 *  missing a base ainda nao tem a funcao (codigo publicado antes da migration);
 *  failed  a base recusou (sem permissao, ficha partilhada...): o nome NAO mudou.
 */
export type KindStepOutcome =
  | { status: "none" }
  | Extract<SetEntityKindResult, { status: "ok" }>
  | { status: "missing" }
  | { status: "failed"; error: unknown };

type AuditWrap = <T>(fn: () => Promise<T>) => Promise<T>;

export async function runKindStep(
  client: RpcClient,
  entityId: string,
  plan: NameSavePlan | null,
  wrap: AuditWrap = (fn) => fn(),
): Promise<KindStepOutcome> {
  if (!plan) return { status: "none" };
  try {
    return await wrap(() => setEntityKind(client, entityId, plan));
  } catch (error) {
    return { status: "failed", error };
  }
}

/**
 * A ordem das gravacoes: PRIMEIRO o tipo e o nome (rpc_set_entity_kind), DEPOIS o
 * resto (contactos, NIF, morada...). Assim nunca fica o nome mudado e o tipo nao;
 * se o tipo for recusado o resto corre na mesma, sem o nome. Se o resto falhar, o
 * erro sobe, mas o tipo e o nome ja ficaram certos.
 */
export async function saveKindThenRest<T>(args: {
  client: RpcClient;
  entityId: string;
  plan: NameSavePlan | null;
  wrap?: AuditWrap;
  saveRest: (outcome: KindStepOutcome) => Promise<T>;
}): Promise<{ outcome: KindStepOutcome; rest: T }> {
  const outcome = await runKindStep(args.client, args.entityId, args.plan, args.wrap);
  const rest = await args.saveRest(outcome);
  return { outcome, rest };
}

export interface ClientNameArgs {
  displayName: string;
  first: string | null;
  last: string | null;
  entityType: string;
}

/**
 * O nome e o tipo que a segunda gravacao do cliente (rpc_update_client) leva, conforme o
 * resultado da primeira. Tipo gravado: reenvia o que a base devolveu, nunca o nome de
 * recurso. RPC em falta: nome pelo tipo escolhido e p_entity_type novo (o codigo pode sair
 * antes da base). Tipo recusado: o nome fica como estava.
 */
export function clientNameArgsAfterKindStep(
  outcome: KindStepOutcome,
  plan: NameSavePlan | null,
  resolved: { displayName: string; first: string | null; last: string | null },
  original: { type: string; displayName: string; first: string | null; last: string | null },
): ClientNameArgs {
  switch (outcome.status) {
    case "ok":
      return { displayName: outcome.displayName, first: outcome.firstName, last: outcome.lastName, entityType: outcome.type };
    case "missing":
      return plan
        ? { displayName: plan.fallback.displayName, first: plan.fallback.first, last: plan.fallback.last, entityType: plan.rpcArgs.p_type }
        : { ...resolved, entityType: original.type };
    case "failed":
      return { displayName: original.displayName, first: original.first, last: original.last, entityType: original.type };
    default:
      return { ...resolved, entityType: original.type };
  }
}

export interface LeadNameArgs {
  displayName?: string;
  first?: string;
  last?: string;
}

/** O nome que rpc_update_lead leva: so no caminho de recurso (RPC do tipo em falta). */
export function leadNameArgsAfterKindStep(outcome: KindStepOutcome, plan: NameSavePlan | null): LeadNameArgs {
  if (outcome.status !== "missing" || !plan) return {};
  return {
    displayName: plan.fallback.displayName,
    ...(plan.fallback.first ? { first: plan.fallback.first } : {}),
    ...(plan.fallback.last ? { last: plan.fallback.last } : {}),
  };
}

/**
 * Registry de variáveis disponíveis para os 4 blocos configuráveis.
 *
 * Cada chave tem um `defaultResolver(ctx)` que reproduz EXATAMENTE o binding
 * hardcoded atual (ver INVENTORY.md). Não-regressão é obrigatória: um
 * template sem fieldModes deve renderizar igual a hoje.
 */

import type { RenderContext } from "./context";

export type VariableGroup =
  | "Comercial"
  | "Cliente"
  | "Empresa"
  | "Proposta"
  | "Utilizador autenticado";

export interface VariableDefinition {
  key: string;
  label: string;            // humano com `·`, ex.: "Cliente · Email"
  group: VariableGroup;
  /** Reproduz o binding atual; nunca lê pricing/IVA/fees. */
  defaultResolver: (ctx: RenderContext) => string;
}

export const VARIABLE_REGISTRY: VariableDefinition[] = [
  // --- Comercial (footer PDF, {{nome_utilizador}} no email) ---
  { key: "commercial.name",  label: "Comercial · Nome",     group: "Comercial", defaultResolver: (c) => c.commercial.name },
  { key: "commercial.email", label: "Comercial · Email",    group: "Comercial", defaultResolver: (c) => c.commercial.email },
  { key: "commercial.phone", label: "Comercial · Telefone", group: "Comercial", defaultResolver: (c) => c.commercial.phone },

  // --- Utilizador autenticado (fallback, raramente usado diretamente) ---
  { key: "authUser.name",  label: "Utilizador autenticado · Nome",  group: "Utilizador autenticado", defaultResolver: (c) => c.authUser?.name || "" },
  { key: "authUser.email", label: "Utilizador autenticado · Email", group: "Utilizador autenticado", defaultResolver: (c) => c.authUser?.email || "" },
  { key: "authUser.phone", label: "Utilizador autenticado · Telefone", group: "Utilizador autenticado", defaultResolver: (c) => c.authUser?.phone || "" },

  // --- Cliente ---
  { key: "client.name",    label: "Cliente · Nome",     group: "Cliente", defaultResolver: (c) => c.client.display_name },
  { key: "client.email",   label: "Cliente · Email",    group: "Cliente", defaultResolver: (c) => c.client.email },
  { key: "client.phone",   label: "Cliente · Telefone", group: "Cliente", defaultResolver: (c) => c.client.phone },
  { key: "client.vat",     label: "Cliente · NIF",      group: "Cliente", defaultResolver: (c) => c.client.vat },
  { key: "client.address", label: "Cliente · Morada",   group: "Cliente", defaultResolver: (c) => c.client.address },

  // --- Empresa ---
  { key: "company.name",    label: "Empresa · Nome",     group: "Empresa", defaultResolver: (c) => c.company.name },
  { key: "company.vat",     label: "Empresa · NIF",      group: "Empresa", defaultResolver: (c) => c.company.vat },
  { key: "company.email",   label: "Empresa · Email",    group: "Empresa", defaultResolver: (c) => c.company.email },
  { key: "company.phone",   label: "Empresa · Telefone", group: "Empresa", defaultResolver: (c) => c.company.phone },
  { key: "company.logo",    label: "Empresa · Logótipo", group: "Empresa", defaultResolver: (c) => c.company.logo_url || "" },
  { key: "company.address", label: "Empresa · Morada",   group: "Empresa", defaultResolver: (c) => c.company.address },

  // --- Proposta (email) ---
  { key: "proposal.title",     label: "Proposta · Título",     group: "Proposta", defaultResolver: (c) => c.proposal?.title || "" },
  { key: "proposal.value",     label: "Proposta · Valor",      group: "Proposta", defaultResolver: (c) => c.proposal?.value || "" },
  { key: "proposal.publicUrl", label: "Proposta · Link público", group: "Proposta", defaultResolver: (c) => c.proposal?.publicUrl || "" },
];

const REGISTRY_BY_KEY = new Map(VARIABLE_REGISTRY.map((v) => [v.key, v]));

export function getVariableDefinition(key: string): VariableDefinition | null {
  return REGISTRY_BY_KEY.get(key) || null;
}

/**
 * Aliases legados/email-friendly → chave canónica do registry.
 * Garante paridade entre frontend e edge: a mesma tabela deve existir
 * em supabase/functions/_shared/documentVariables.ts.
 */
export const VARIABLE_ALIASES: Record<string, string> = {
  // Aliases pt-PT obrigatórios (paridade)
  nome_cliente:     "client.name",
  nome_utilizador:  "commercial.name",
  nome_empresa:     "company.name",
  titulo_proposta:  "proposal.title",
  valor_proposta:   "proposal.value",
  link_proposta:    "proposal.publicUrl",

  // Aliases legados em uso nos templates atuais
  client_name:       "client.name",
  client_email:      "client.email",
  client_phone:      "client.phone",
  client_nif:        "client.vat",
  company_name:      "company.name",
  company_email:     "company.email",
  company_phone:     "company.phone",
  commercial_name:   "commercial.name",
  commercial_email:  "commercial.email",
  commercial_phone:  "commercial.phone",
  proposal_title:    "proposal.title",
  proposal_value:    "proposal.value",
  proposal_link:     "proposal.publicUrl",

  // Aliases pt-PT usados nos templates de contrato
  cliente_nome:      "client.name",
  cliente_email:     "client.email",
  cliente_telefone:  "client.phone",
  cliente_nif:       "client.vat",
  cliente_morada:    "client.address",
  empresa_nome:      "company.name",
  empresa_nif:       "company.vat",
  empresa_email:     "company.email",
  empresa_telefone:  "company.phone",
  empresa_morada:    "company.address",
  comercial_nome:    "commercial.name",

};

export function resolveAlias(aliasOrKey: string): string {
  return VARIABLE_ALIASES[aliasOrKey] || aliasOrKey;
}

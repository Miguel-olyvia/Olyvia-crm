/**
 * Edge function adapter (Deno).
 *
 * Frontend e edge NÃO partilham este ficheiro. Partilham a mesma
 * convenção de chaves/aliases. Mudanças aqui devem ser refletidas em
 * src/utils/documentVariables/registry.ts e validadas pelo teste de paridade
 * src/utils/documentVariables/__tests__/email-parity.test.ts.
 */

export interface EdgeRenderContext {
  client: { display_name: string; email: string; phone: string; vat: string; address: string };
  company: { name: string; vat: string; email: string; phone: string; logo_url: string | null; address: string };
  commercial: { name: string; email: string; phone: string };
  authUser?: { name: string; email: string; phone: string } | null;
  proposal?: { title: string; value: string; publicUrl: string };
}

type Resolver = (c: EdgeRenderContext) => string;

const RESOLVERS: Record<string, Resolver> = {
  "client.name":        (c) => c.client.display_name,
  "client.email":       (c) => c.client.email,
  "client.phone":       (c) => c.client.phone,
  "client.vat":         (c) => c.client.vat,
  "client.address":     (c) => c.client.address,
  "company.name":       (c) => c.company.name,
  "company.vat":        (c) => c.company.vat,
  "company.email":      (c) => c.company.email,
  "company.phone":      (c) => c.company.phone,
  "company.logo":       (c) => c.company.logo_url || "",
  "company.address":    (c) => c.company.address,
  "commercial.name":    (c) => c.commercial.name,
  "commercial.email":   (c) => c.commercial.email,
  "commercial.phone":   (c) => c.commercial.phone,
  "authUser.name":      (c) => c.authUser?.name || "",
  "authUser.email":     (c) => c.authUser?.email || "",
  "authUser.phone":     (c) => c.authUser?.phone || "",
  "proposal.title":     (c) => c.proposal?.title || "",
  "proposal.value":     (c) => c.proposal?.value || "",
  "proposal.publicUrl": (c) => c.proposal?.publicUrl || "",
};

export const VARIABLE_ALIASES: Record<string, string> = {
  nome_cliente:     "client.name",
  nome_utilizador:  "commercial.name",
  nome_empresa:     "company.name",
  titulo_proposta:  "proposal.title",
  valor_proposta:   "proposal.value",
  link_proposta:    "proposal.publicUrl",
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
};

export function resolveAlias(aliasOrKey: string): string {
  return VARIABLE_ALIASES[aliasOrKey] || aliasOrKey;
}

export function resolveVariable(keyOrAlias: string, ctx: EdgeRenderContext): string {
  const canonical = resolveAlias(keyOrAlias);
  const fn = RESOLVERS[canonical];
  return fn ? fn(ctx) : "";
}

/** Substitui `{{chave}}` (canónica ou alias) no texto. Mantém match se chave desconhecida. */
export function replaceTemplateVariables(text: string, ctx: EdgeRenderContext): string {
  if (!text) return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, raw: string) => {
    const canonical = resolveAlias(raw);
    if (!(canonical in RESOLVERS)) return match;
    const value = RESOLVERS[canonical](ctx);
    return value ?? "";
  });
}

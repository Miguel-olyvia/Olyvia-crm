/**
 * Resolver de campo único.
 *
 * Regras:
 *   - sem fieldModes[key] OU mode "default" → defaultResolver(ctx) do registry
 *     (reproduz o binding hardcoded atual, NUNCA bloqueia)
 *   - mode "variable" → resolve por outra chave do registry; se vazio no
 *     envio/PDF final, lança EmptyVariableError com label humano
 *   - mode "fixed" → texto literal de fieldFallbacks[key]
 *
 * NUNCA lê pricing, IVA, fees, bundles, snapshots ou catálogo.
 */

import type { RenderContext } from "./context";
import { getVariableDefinition, resolveAlias } from "./registry";

export type FieldMode = "default" | "variable" | "fixed";

export interface SectionSettings {
  fieldModes?: Record<string, FieldMode>;
  fieldMappings?: Record<string, string>;
  fieldFallbacks?: Record<string, string>;
  // ...outras props da secção, ignoradas aqui
  [k: string]: any;
}

export class EmptyVariableError extends Error {
  field: string;
  label: string;
  constructor(field: string, label: string) {
    super(`Variável vazia: ${label}`);
    this.field = field;
    this.label = label;
    this.name = "EmptyVariableError";
  }
}

export interface ResolveOptions {
  /** Quando true, mode "variable" vazio lança EmptyVariableError. Usar no envio/download final. */
  strict?: boolean;
  /** Permite resolver chave que NÃO está no registry (fallback ao binding default registado). */
  defaultRegistryKey?: string;
}

/**
 * @param settings  section.settings (pode ser undefined → tudo default)
 * @param fieldKey  identificador do slot na secção, ex.: "footerEmail", "clientName"
 * @param ctx       RenderContext partilhado por PDF/preview/email
 * @param defaultRegistryKey  chave canónica do registry usada como default
 */
export function resolveField(
  settings: SectionSettings | undefined,
  fieldKey: string,
  ctx: RenderContext,
  defaultRegistryKey: string,
  options: ResolveOptions = {},
): string {
  const mode: FieldMode = settings?.fieldModes?.[fieldKey] || "default";

  if (mode === "fixed") {
    return settings?.fieldFallbacks?.[fieldKey] ?? "";
  }

  if (mode === "variable") {
    const mapped = settings?.fieldMappings?.[fieldKey];
    if (!mapped) {
      // mode="variable" sem mapping é equivalente a default — não bloqueia
      return resolveDefault(defaultRegistryKey, ctx);
    }
    const canonical = resolveAlias(mapped);
    const def = getVariableDefinition(canonical);
    const value = def ? def.defaultResolver(ctx) : "";
    if (!value && options.strict) {
      const label = def?.label || canonical;
      throw new EmptyVariableError(fieldKey, label);
    }
    return value;
  }

  // mode "default" — comportamento atual, nunca bloqueia
  return resolveDefault(defaultRegistryKey, ctx);
}

function resolveDefault(key: string, ctx: RenderContext): string {
  const def = getVariableDefinition(resolveAlias(key));
  return def ? def.defaultResolver(ctx) : "";
}

/**
 * Resolve uma string com placeholders `{{chave}}` (incluindo aliases pt-PT).
 * Usado para o corpo/assunto do email. Não bloqueia: mantém `{{x}}` se chave desconhecida.
 */
export function replaceTemplateVariables(
  text: string,
  ctx: RenderContext,
): string {
  if (!text) return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, rawKey: string) => {
    const canonical = resolveAlias(rawKey);
    const def = getVariableDefinition(canonical);
    if (!def) return match;
    const value = def.defaultResolver(ctx);
    return value ?? "";
  });
}

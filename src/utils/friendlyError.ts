/**
 * Extracts a human-readable error message from various error shapes
 * (Supabase FunctionsHttpError, fetch Response, Error, string) and maps
 * known technical messages to friendly, localized messages.
 */
import { translations } from "@/translations/index";

type Language = "en" | "pt" | "es" | "fr" | "de";

/**
 * Reads the user's selected language outside of React (this module is used
 * from plain async helpers, not hooks/components). Mirrors the storage key
 * and default used by LanguageContext (src/contexts/LanguageContext.tsx).
 */
function getCurrentLanguage(): Language {
  try {
    if (typeof localStorage === "undefined") return "en";
    const saved = localStorage.getItem("language") as Language | null;
    return saved || "en";
  } catch {
    return "en";
  }
}

function translate(key: string): string {
  const lang = getCurrentLanguage();
  const table = translations as unknown as Record<string, Record<string, string>>;
  return table[lang]?.[key] || table.en?.[key] || key;
}

/**
 * Resolves a translation key using the same non-hook locale lookup as
 * getFriendlyErrorMessage, for callers that need a localized fallback
 * message outside of a React component (e.g. requestControlledExport.ts).
 */
export function getLocalizedFallback(key: string): string {
  return translate(key);
}

const FRIENDLY_MAP: Array<{ match: RegExp; key: string }> = [
  { match: /Nenhum SMTP ativo encontrado/i, key: "friendlyError.noSmtp" },
  { match: /SMTP/i, key: "friendlyError.smtpError" },
  { match: /rate limit|too many requests/i, key: "friendlyError.rateLimit" },
  { match: /unauthorized|not authenticated|jwt/i, key: "friendlyError.sessionExpired" },
  { match: /forbidden|not allowed|permission/i, key: "friendlyError.forbidden" },
  { match: /not found/i, key: "friendlyError.notFound" },
  { match: /timeout|timed out/i, key: "friendlyError.timeout" },
  { match: /network|failed to fetch|load failed/i, key: "friendlyError.network" },
  { match: /invalid.*email|email.*invalid/i, key: "friendlyError.invalidEmail" },
  { match: /duplicate|already exists|unique/i, key: "friendlyError.duplicate" },
  // Mensagens da Edge Function export-data. Sem estas, mapFriendly devolvia o
  // texto cru em ingles ("Unable to generate export") a um utilizador com a
  // interface em portugues.
  { match: /unable to generate export/i, key: "friendlyError.exportFailed" },
  { match: /export (not authorized|exceeds)/i, key: "friendlyError.exportFailed" },
  { match: /Edge Function returned a non-2xx/i, key: "friendlyError.serverError" },
];

function mapFriendly(raw: string): string {
  if (!raw) return translate("friendlyError.unexpectedRetry");
  for (const { match, key } of FRIENDLY_MAP) {
    if (match.test(raw)) return translate(key);
  }
  return raw;
}

export async function getFriendlyErrorMessage(
  error: unknown,
  fallback = translate("friendlyError.unexpected"),
): Promise<string> {
  if (!error) return fallback;

  // String
  if (typeof error === "string") return mapFriendly(error);

  const e = error as any;

  // Try to read Supabase FunctionsHttpError response body
  try {
    if (e?.context && typeof e.context.json === "function") {
      const body = await e.context.json();
      const msg = body?.error || body?.message;
      if (msg) return mapFriendly(String(msg));
    } else if (e?.context && typeof e.context.text === "function") {
      const txt = await e.context.text();
      if (txt) {
        try {
          const parsed = JSON.parse(txt);
          const msg = parsed?.error || parsed?.message;
          if (msg) return mapFriendly(String(msg));
        } catch {
          return mapFriendly(txt);
        }
      }
    }
  } catch {
    // ignore — fall back to message
  }

  // Plain object with error/message
  if (e?.error && typeof e.error === "string") return mapFriendly(e.error);
  if (e?.message) return mapFriendly(String(e.message));

  try {
    return mapFriendly(JSON.stringify(error));
  } catch {
    return fallback;
  }
}

import { translations } from "@/translations/index";

type Language = "en" | "pt" | "es" | "fr" | "de";

/**
 * Reads the user's selected language outside of React, consistent with the
 * approach used in src/utils/friendlyError.ts (mirrors the storage key and
 * default used by LanguageContext).
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

function getRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function getUploadErrorMessage(error: unknown): string {
  const raw = getRawMessage(error);
  if (raw.includes("upload_burst_rate_limit_exceeded")) {
    return translate("friendlyError.uploadRateLimit");
  }
  return raw;
}

export interface ValidateUploadResult {
  ok: boolean;
  error?: string;
}

/**
 * Narrows the unknown response body of the `validate-upload` Edge Function
 * invocation into a safe shape, since the function can reply with either
 * `{ ok: true, finalPath }`, `{ ok: false, error }`, or `{ error }` on a
 * non-2xx HTTP status.
 */
export function parseValidateUploadResponse(data: unknown): ValidateUploadResult {
  if (!data || typeof data !== "object") return { ok: false };
  const candidate = data as Record<string, unknown>;
  return {
    ok: candidate.ok === true,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
  };
}

/**
 * On a non-2xx response, supabase-js's functions.invoke() returns `data: null`
 * and wraps the raw HTTP response in `error.context`, so the JSON body (e.g.
 * `{ ok: false, error: "..." }` from validate-upload) never reaches `data`.
 * This reads that body directly so the real rejection reason reaches the UI.
 */
export async function resolveValidateUploadErrorMessage(
  validateResult: ValidateUploadResult,
  error: unknown,
): Promise<string> {
  if (validateResult.error) return validateResult.error;

  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string") {
        return (body as Record<string, unknown>).error as string;
      }
    } catch {
      // Body wasn't JSON or already consumed; fall through to the generic message.
    }
  }

  return getUploadErrorMessage(error);
}

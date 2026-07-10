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
    return "Demasiados uploads em pouco tempo. Aguarde um minuto e tente novamente.";
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

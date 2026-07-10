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

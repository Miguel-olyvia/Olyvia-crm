/**
 * Pedaço puro (sem base) do que no módulo real vive em o acesso a base: só as funções que
 * dizem de que tipo é um erro. Na apresentação não há base, mas os ecrãs copiados
 * continuam a perguntar "isto foi uma recusa por permissão?" — e a resposta é lida
 * do mesmo formato de erro.
 */

/** 42501 = recusa por permissão; PGRST301/401/403 = o PostgREST a recusar. */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/** HR920 = o travão de tentativas disparou (não é um defeito). */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code === "HR920") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /demasiadas_tentativas/i.test(message);
}

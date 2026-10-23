// Cópia de normalizePhoneForMatch e normalizeEmailForMatch (supabase/functions/_shared/leadDedup.ts) para o lado a lado da «Nova lead»:
// a regra pedida é a do formulário online (últimos 9 dígitos, mínimo 7). A deteção continua a ser a da base (neg_procurar_duplicados).
const MIN_PHONE_DIGITS = 7;
const PHONE_SUFFIX_LENGTH = 9;

/** Telefone para comparar: só dígitos, os últimos 9; menos de 7 dígitos não é verificável (nulo). */
export function normalizePhoneForMatch(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS) return null;
  return digits.slice(-PHONE_SUFFIX_LENGTH);
}

/** Email para comparar: minúsculas e sem espaços nas pontas; sem «@» não é um dado verificável (nulo). */
export function normalizeEmailForMatch(email: string | null | undefined): string | null {
  if (!email) return null;
  const norm = String(email).trim().toLowerCase();
  if (!norm || !norm.includes("@")) return null;
  return norm;
}

export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizePhoneForMatch(a);
  return x !== null && x === normalizePhoneForMatch(b);
}

export function mesmoEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeEmailForMatch(a);
  return x !== null && x === normalizeEmailForMatch(b);
}

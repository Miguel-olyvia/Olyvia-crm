// Which surface a hybrid (CRM + client) user chose to enter after login.
//
// This is a UX router, NOT a security boundary. A hybrid genuinely holds both
// memberships, so the real data isolation is still the per-request RLS/route
// guards enforced by their actual roles — this choice only decides which UI we
// show. Never treat a stored context as proof of what a user may access.
//
// Stored as `${authUserId}:${context}` so a stale choice from a previous login
// (different account on the same browser) is ignored rather than misapplied.
export type SessionContext = "crm" | "portal";

const KEY = "olyvia-session-context";

export function getSessionContext(authUserId: string | null | undefined): SessionContext | null {
  if (!authUserId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const sep = raw.indexOf(":");
    if (sep < 0) return null;
    const uid = raw.slice(0, sep);
    const ctx = raw.slice(sep + 1);
    if (uid !== authUserId) return null;
    return ctx === "crm" || ctx === "portal" ? ctx : null;
  } catch {
    // Private mode / blocked storage: behave as "no choice made".
    return null;
  }
}

export function setSessionContext(authUserId: string, context: SessionContext): void {
  try {
    localStorage.setItem(KEY, `${authUserId}:${context}`);
  } catch {
    // Best-effort: if storage is blocked the user simply gets asked again.
  }
}

export function clearSessionContext(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}

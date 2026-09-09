// Deduplicação de submissões de formulário público.
//
// INVARIANTE: uma lead só nasce quando a entidade NÃO tem nenhuma.
//
// Este módulo é PURO: não faz queries nem I/O. Recebe os candidatos já
// recolhidos (filtrados por organização e sem utilizadores internos — ver
// `collectDedupCandidatesForOrg` em `entityScopedLookup.ts`) e o email/telefone
// que chegaram na submissão, e devolve qual dos 8 resultados se aplica.
//
// Só se compara email e telefone. O NIF fica de fora de propósito.

/** Uma entidade candidata, com TODOS os emails e telefones que lhe pertencem. */
export type DedupCandidate = {
  entityId: string;
  emails: string[];
  phones: string[];
};

/** Email/telefone que vieram na submissão, lidos pelo mapeamento do formulário. */
export type DedupSubmission = {
  email?: string | null;
  phone?: string | null;
};

export type DedupOutcome =
  /** 01 — email e telefone batem na MESMA entidade. */
  | { kind: "MATCH_FORTE"; entityId: string }
  /** 02/03 — bate por email; `novoTelefone` quando veio um telefone que a ficha não tem. */
  | { kind: "MATCH_EMAIL"; entityId: string; novoTelefone?: string }
  /** 04/05 — bate por telefone; `novoEmail` quando veio um email que a ficha não tem. */
  | { kind: "MATCH_TELEFONE"; entityId: string; novoEmail?: string }
  /** 06 — o email aponta para uma entidade e o telefone para outra. Vai à fila de revisão. */
  | { kind: "CONFLITO"; entityIdEmail: string; entityIdTelefone: string }
  /** 07 — submissão verificável mas nada bate. Entidade nova + lead nova. */
  | { kind: "SEM_MATCH" }
  /** 08 — a submissão não traz email nem telefone utilizáveis. Entidade nova + lead nova. */
  | { kind: "NAO_VERIFICAVEL" };

/** Mínimo de dígitos úteis para um telefone contar como dado verificável. */
const MIN_PHONE_DIGITS = 7;
/** Nº de dígitos finais usados na comparação de telefones (PT: 9). */
const PHONE_SUFFIX_LENGTH = 9;

/**
 * Email normalizado para comparação: minúsculas, sem espaços à volta.
 * Devolve `null` quando não é um dado verificável — vazio, só espaços, ou sem
 * "@" (formulários públicos trazem "n/a", "-", "sem email" neste campo).
 */
export function normalizeEmailForMatch(email: string | null | undefined): string | null {
  if (!email) return null;
  const norm = String(email).trim().toLowerCase();
  if (!norm) return null;
  if (!norm.includes("@")) return null;
  return norm;
}

/**
 * Telefone normalizado para comparação: só dígitos, últimos 9.
 * Devolve `null` quando tem menos de 7 dígitos úteis.
 */
export function normalizePhoneForMatch(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS) return null;
  return digits.slice(-PHONE_SUFFIX_LENGTH);
}

function entitiesMatchingEmail(candidates: readonly DedupCandidate[], email: string): string[] {
  return candidates
    .filter((c) => (c.emails ?? []).some((e) => normalizeEmailForMatch(e) === email))
    .map((c) => c.entityId);
}

function entitiesMatchingPhone(candidates: readonly DedupCandidate[], phone: string): string[] {
  return candidates
    .filter((c) => (c.phones ?? []).some((p) => normalizePhoneForMatch(p) === phone))
    .map((c) => c.entityId);
}

/**
 * Decide qual dos 8 resultados se aplica a esta submissão.
 *
 * Não muta `candidates` nem `submission`. `candidates` tem de vir já filtrado
 * pela organização do formulário e sem entidades de utilizadores internos.
 */
export function classifyDedupOutcome(
  candidates: readonly DedupCandidate[],
  submission: DedupSubmission,
): DedupOutcome {
  const email = normalizeEmailForMatch(submission?.email);
  const phone = normalizePhoneForMatch(submission?.phone);

  // 08 — nada por onde verificar.
  if (!email && !phone) return { kind: "NAO_VERIFICAVEL" };

  const list = candidates ?? [];
  const byEmail = email ? entitiesMatchingEmail(list, email) : [];
  const byPhone = phone ? entitiesMatchingPhone(list, phone) : [];

  // 01 — a mesma entidade bate pelos dois.
  const forte = byEmail.find((id) => byPhone.includes(id));
  if (forte) return { kind: "MATCH_FORTE", entityId: forte };

  // 06 — email numa entidade, telefone noutra: fila de revisão.
  if (byEmail.length > 0 && byPhone.length > 0) {
    return { kind: "CONFLITO", entityIdEmail: byEmail[0], entityIdTelefone: byPhone[0] };
  }

  // 02/03 — bate por email. Telefone novo fica só assinalado na submissão.
  if (byEmail.length > 0) {
    return phone
      ? { kind: "MATCH_EMAIL", entityId: byEmail[0], novoTelefone: String(submission.phone).trim() }
      : { kind: "MATCH_EMAIL", entityId: byEmail[0] };
  }

  // 04/05 — bate por telefone. Email novo fica só assinalado na submissão.
  if (byPhone.length > 0) {
    return email
      ? { kind: "MATCH_TELEFONE", entityId: byPhone[0], novoEmail: email }
      : { kind: "MATCH_TELEFONE", entityId: byPhone[0] };
  }

  // 07 — verificável, mas nada bate.
  return { kind: "SEM_MATCH" };
}

/**
 * Utilities for working with deal stages.
 *
 * Identity / responsibilities (single rule):
 * - stage.id          → persistence, filters, selects, drag/drop.
 * - stage.stage_key   → translation key (deals.stages.<key>).
 * - stage.is_won / is_lost / is_final → won/lost/closed logic.
 * - stage.name        → presentation fallback only.
 */

export type DealStageKey =
  | "qualification"
  | "proposal"
  | "negotiation"
  | "closedWon"
  | "closedLost";

export type StageLike =
  | {
      stage_key?: string | null;
      name?: string | null;
      is_won?: boolean | null;
      is_lost?: boolean | null;
      is_final?: boolean | null;
    }
  | null
  | undefined;

const CANONICAL_KEYS = new Set<DealStageKey>([
  "qualification",
  "proposal",
  "negotiation",
  "closedWon",
  "closedLost",
]);

function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const NAME_TO_KEY: Record<string, DealStageKey> = {
  qualification: "qualification",
  qualificacao: "qualification",
  proposal: "proposal",
  proposta: "proposal",
  negotiation: "negotiation",
  negociacao: "negotiation",
  "closed won": "closedWon",
  closed_won: "closedWon",
  closedwon: "closedWon",
  won: "closedWon",
  "fechado ganho": "closedWon",
  ganho: "closedWon",
  "closed lost": "closedLost",
  closed_lost: "closedLost",
  closedlost: "closedLost",
  lost: "closedLost",
  "fechado perdido": "closedLost",
  perdido: "closedLost",
};

export function getDealStageKey(stage: StageLike): DealStageKey | null {
  if (!stage) return null;
  const sk = stage.stage_key;
  if (sk && CANONICAL_KEYS.has(sk as DealStageKey)) {
    return sk as DealStageKey;
  }
  const normalized = normalizeName(stage.name);
  if (!normalized) return null;
  return NAME_TO_KEY[normalized] ?? null;
}

export function getDealStageTranslationKey(stage: StageLike): string | null {
  const key = getDealStageKey(stage);
  return key ? `deals.stages.${key}` : null;
}

export function getDealStageLabel(
  stage: StageLike,
  t: (k: string) => string
): string {
  const tKey = getDealStageTranslationKey(stage);
  if (tKey) {
    const translated = t(tKey);
    if (translated && translated !== tKey) return translated;
  }
  return stage?.name ?? "";
}

export function isWonStage(stage: StageLike): boolean {
  if (!stage) return false;
  if (stage.is_won === true) return true;
  if (stage.is_won === false && stage.stage_key) return false;
  return getDealStageKey(stage) === "closedWon";
}

export function isLostStage(stage: StageLike): boolean {
  if (!stage) return false;
  if (stage.is_lost === true) return true;
  if (stage.is_lost === false && stage.stage_key) return false;
  return getDealStageKey(stage) === "closedLost";
}

export function isClosedStage(stage: StageLike): boolean {
  if (!stage) return false;
  if (stage.is_final === true || stage.is_won === true || stage.is_lost === true) {
    return true;
  }
  if (stage.stage_key) {
    return getDealStageKey(stage) === "closedWon" || getDealStageKey(stage) === "closedLost";
  }
  const key = getDealStageKey(stage);
  return key === "closedWon" || key === "closedLost";
}

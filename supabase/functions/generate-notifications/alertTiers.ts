/**
 * Escalating two-tier alerts (normal → urgent).
 *
 * `proposal_no_response` / `proposal_no_response_urgent` and
 * `contract_expiring` / `contract_expiring_urgent` are pairs where the urgent
 * tier supersedes the normal one. The resolver in index.ts retires the normal
 * alert with reason "superseded_by_urgent" as soon as the urgent threshold is
 * met, so the generator must never re-create it after that point.
 *
 * It used to, because the fallback to the normal tier was gated on the urgent
 * alert being *absent* rather than on the urgent tier not *applying*: with an
 * urgent alert already active the first branch was skipped, control fell into
 * the `else if`, and the just-resolved normal alert was regenerated — then
 * resolved again five minutes later, forever. In production this churned 217
 * proposals 288 times a day (~61k rows/day, 260k dead rows, 131 MB).
 */
export type AlertTier = "urgent" | "normal" | null;

export interface TierInput {
  /** The urgent threshold is configured, active and met. */
  urgentApplies: boolean;
  /** An unresolved urgent alert already exists for this (entity, user). */
  urgentAlreadyActive: boolean;
  /** The normal threshold is configured, active and met. */
  normalApplies: boolean;
  /** An unresolved normal alert already exists for this (entity, user). */
  normalAlreadyActive: boolean;
}

/**
 * Which alert, if any, should be queued for an escalating pair.
 *
 * Once `urgentApplies` is true the normal tier is out of the picture entirely —
 * whether or not the urgent alert has already been created.
 */
export function chooseEscalatingTier(input: TierInput): AlertTier {
  if (input.urgentApplies) {
    return input.urgentAlreadyActive ? null : "urgent";
  }
  if (input.normalApplies) {
    return input.normalAlreadyActive ? null : "normal";
  }
  return null;
}

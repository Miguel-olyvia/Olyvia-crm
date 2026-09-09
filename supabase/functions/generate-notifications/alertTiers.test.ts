/**
 * generate-notifications — escalating-tier churn regression tests.
 *
 * ── What this guards against ────────────────────────────────────────────
 * In production, `generate-notifications` (pg_cron job 15, every 5 minutes)
 * was recreating a `proposal_no_response` alert that its own resolver had
 * just retired as "superseded_by_urgent", over and over: 60 978 resolutions
 * and 60 981 creations in 24 hours over only 217 distinct (proposal, user)
 * pairs — exactly 288 repetitions each, one per cron run.
 *
 * The cause was the ordering of the two conditions in index.ts:
 *
 *   if (urgentApplies && !urgentAlreadyActive) { queue urgent }
 *   else if (normalApplies && !normalAlreadyActive) { queue normal }   // ← bug
 *
 * With the urgent alert already present, the first branch is false, so control
 * reaches the `else if` — and since the normal alert was resolved earlier in
 * the same run, `normalAlreadyActive` is false and it gets recreated.
 *
 * The `urgent_active_never_falls_back_to_normal` case below is the red one:
 * it fails against the old logic and passes against `chooseEscalatingTier`.
 *
 * These are pure-function tests: no Deno.serve, no database, no credentials.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { type AlertTier, chooseEscalatingTier, type TierInput } from "./alertTiers.ts";

function tier(overrides: Partial<TierInput>): AlertTier {
  return chooseEscalatingTier({
    urgentApplies: false,
    urgentAlreadyActive: false,
    normalApplies: false,
    normalAlreadyActive: false,
    ...overrides,
  });
}

Deno.test("urgent_active_never_falls_back_to_normal", () => {
  // The regression: proposal is past BOTH thresholds, the urgent alert is
  // already active, and the normal one was just resolved as
  // "superseded_by_urgent". Nothing may be queued — the old code queued the
  // normal alert here, and did so again on every run forever.
  assertEquals(
    tier({
      urgentApplies: true,
      urgentAlreadyActive: true,
      normalApplies: true,
      normalAlreadyActive: false,
    }),
    null,
  );
});

Deno.test("urgent_is_queued_when_threshold_met_and_not_yet_active", () => {
  assertEquals(
    tier({ urgentApplies: true, normalApplies: true }),
    "urgent",
  );
});

Deno.test("normal_is_queued_only_while_urgent_does_not_apply", () => {
  assertEquals(tier({ normalApplies: true }), "normal");
});

Deno.test("normal_is_not_reissued_while_one_is_active", () => {
  assertEquals(
    tier({ normalApplies: true, normalAlreadyActive: true }),
    null,
  );
});

Deno.test("urgent_tier_disabled_in_settings_leaves_normal_in_charge", () => {
  // urgentApplies already folds in cfg.is_active and the threshold check, so a
  // disabled urgent tier must not suppress the normal alert.
  assertEquals(
    tier({ urgentApplies: false, normalApplies: true }),
    "normal",
  );
});

Deno.test("nothing_is_queued_when_no_threshold_is_met", () => {
  assertEquals(tier({}), null);
});

Deno.test("run_is_idempotent_once_the_urgent_alert_exists", () => {
  // Simulate 10 consecutive cron runs on a proposal past the urgent threshold.
  // The first queues the urgent alert; every later run must queue nothing.
  // Under the old logic runs 2..10 each produced a fresh normal alert.
  let urgentAlreadyActive = false;
  const queued: AlertTier[] = [];
  for (let run = 0; run < 10; run++) {
    const decision = tier({
      urgentApplies: true,
      urgentAlreadyActive,
      normalApplies: true,
      // resolved as "superseded_by_urgent" at the start of each run
      normalAlreadyActive: false,
    });
    queued.push(decision);
    if (decision === "urgent") urgentAlreadyActive = true;
  }
  assertEquals(queued, ["urgent", null, null, null, null, null, null, null, null, null]);
});

import * as Sentry from "@sentry/react";

/**
 * Business flows that swallow errors on purpose (the user keeps going) but
 * whose silent failure is invisible in production. The tag groups them in
 * Sentry so an alert can fire per flow instead of drowning in generic noise.
 */
export type BusinessFlow =
  | "proposal-workflow"
  // The proposal's stored value silently drifting out of date after a
  // rejection/reopen. Kept apart from `proposal-workflow` because the symptom
  // is wrong numbers on screen, not a stalled automation.
  | "proposal-value-recalculation"
  // Resolving the sender's `anew_users.id` before writing the interaction
  // record. On failure the interaction is still written, but with no author.
  | "email-sender-identity"
  | "proposal-bulk-send"
  | "proposal-bulk-pdf-export"
  | "contract-send-tracking"
  | "entity-interaction-tracking"
  | "lead-contact-update"
  | "lead-contact-results-load"
  // ---------------------------------------------------------------------
  // Flows added by the "caught errors that only lived in a toast" sweep.
  // Each tag marks a place where the system failed to do what it promised
  // (the record was not saved, the document was not produced, the automation
  // did not run) and where the user cannot fix it themselves. Sites where the
  // error IS the correct answer — validation, permissions, expired session,
  // integration not configured, offline — are deliberately NOT tagged, so the
  // Sentry alerts stay meaningful. See
  // vault/ficheiros/infraestrutura-seguranca/classificacao-erros-toast.md
  // for the site-by-site rationale.
  // ---------------------------------------------------------------------
  // Commercial records: create/update/delete/stage changes that lose the
  // user's work or leave the pipeline in a state nobody asked for.
  | "proposal-lifecycle"
  | "quote-lifecycle"
  | "deal-lifecycle"
  | "client-lifecycle"
  | "contact-lifecycle"
  | "lead-lifecycle"
  | "purchase-order-lifecycle"
  | "stock-lifecycle"
  // The quote was accepted but the automation that turns it into a proposal
  // did not run. Split out because the symptom is a missing follow-up
  // document, not a failed click.
  | "quote-acceptance-workflow"
  // Documents the system promised to produce or deliver.
  | "proposal-document-export"
  | "quote-document-export"
  | "purchase-order-document"
  | "entity-email-send"
  // Bulk data in and out: XLSX/CSV export and import.
  | "record-export-import"
  // What a client sees on the portal. A failure here is invisible to us and
  // the client has no other route.
  | "client-portal-proposal"
  | "client-portal-contract"
  | "client-portal-access"
  // Writes that can land half-applied and leave wrong data behind, rather
  // than simply failing. Grouped by what ends up corrupted.
  | "pricing-partial-write"
  | "config-partial-write"
  | "org-structure-partial-write"
  | "bulk-record-action"
  | "soft-delete-restore"
  | "entity-conversion"
  // Inbound lead capture: if this breaks, leads are lost silently.
  | "form-submission-intake"
  | "campaign-lead-intake"
  // Loading a user's permission scopes: an empty result here can silently
  // wipe scopes on confirm, so a failed read is a security-relevant defect.
  | "permissions-scope-load"
  // Remaining one-offs.
  | "ai-assistant"
  | "account-deletion-request"
  | "media-asset-delete"
  | "onboarding-completion";

/**
 * Reports an error that the calling code deliberately swallows.
 *
 * Purely additive: callers keep their own `console.error` for local debugging
 * and keep whatever recovery behaviour they already had. This never throws —
 * observability must not become the thing that breaks the flow.
 */
export function captureFlowError(error: unknown, flow: BusinessFlow): void {
  try {
    Sentry.captureException(error, { tags: { flow } });
  } catch {
    // Sentry not initialised (tests, local dev without DSN) or transport
    // failure. Nothing useful to do — the console.error at the call site
    // remains the local signal.
  }
}

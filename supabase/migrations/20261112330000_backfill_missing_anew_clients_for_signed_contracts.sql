-- Backfill: anew_clients rows missing for 4 real, already-signed client_contracts
-- 2026-08-19 | Module: Contratos / Clientes — client_contracts -> anew_clients
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROOT CAUSE (read-only investigation — see accompanying report for full detail)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- There is NO database trigger on client_contracts that creates anew_clients.
-- The "contract signed -> convert contact to client" behaviour lives entirely
-- in the execute-workflow Edge Function (supabase/functions/execute-workflow/
-- index.ts, "5. CONTRACT STATUS CHANGES" block, ~line 918 onward), gated by an
-- active contract_stage_actions row with action_type='convert_to_client' for
-- stage_id IN ('signed','assinado'). That config DOES exist for this
-- organization since 2026-03-02 (row eedf0608-d119-42e0-8d1e-c711520641fa), so
-- the gate itself is not the problem.
--
-- execute-workflow is invoked as a **fire-and-forget HTTP fetch** from THREE
-- separate call sites whenever a contract becomes "signed":
--   • supabase/functions/pipeline-automation/index.ts   (finalize_contract, CRM "Marcar como Assinado")
--   • supabase/functions/validate-contract-signature/index.ts (multi-party e-signature)
--   • supabase/functions/client-portal-action/index.ts  (sign_contract, client-portal OTP-SMS signature)
-- All three update client_contracts.status='signed' FIRST (this write always
-- succeeds), then `await fetch(.../execute-workflow, ...)` wrapped in a
-- try/catch that only does console.error/console.log on failure — the HTTP
-- call's outcome is never surfaced to the signer or to the CRM user, and never
-- retried.
--
-- Evidence this fire-and-forget call is broken with a very high silent
-- failure rate (not just for these 4 rows):
--   • Every one of the 59 contracts in `status='signed'` today — including
--     the ones that DO have a matching anew_clients row — has ZERO rows in
--     workflow_execution_log for that conversion (source_record_id = the
--     contract's id). The specific `logWorkflowExecution(...)` INSERT inside
--     execute-workflow's own success/error branches (line ~1140 and ~1151)
--     never lands a single row, for any contract, ever.
--   • Cross-referencing anew_clients.source_type/source_id/created_at against
--     each signed contract shows only 3 of the 53 "already has a client"
--     cases were actually produced by this exact code path (source_type=
--     'contract', source_id = the contract's own id, created_at close to the
--     signature timestamp: contracts c811d2b3…, 697a6e4c…, f9afc74b…). The
--     other 50 already had a pre-existing anew_clients row from an unrelated
--     origin — mostly source_type='contact' with created_at clustered at one
--     identical timestamp (2026-07-31 15:18:19.761408, consistent with a
--     one-off bulk backfill run when the feature launched), plus a few
--     'manual'/'lead' conversions. For those, execute-workflow's contract
--     branch (when/if it ran at all) would have found the client already
--     existing and been a no-op — it did not need to prove itself.
--
-- For the 4 contracts below, all signed through the client-portal OTP-SMS
-- flow (client_contracts.signature_image='OTP_SMS_VERIFIED', status_changed_by
-- IS NULL — the fingerprint of client-portal-action's sign_contract action,
-- not of rpc_update_client_contract_status nor of pipeline-automation), no
-- pre-existing anew_clients row of any kind exists for their entity_id (in any
-- organization, including soft-deleted), and no workflow_execution_log row
-- exists either. The fire-and-forget execute-workflow call for these 4 simply
-- never completed the client-creation step (network failure, cold start,
-- timeout, or an error response silently swallowed by the caller's
-- catch-and-log block) — there is no reproducible logic bug in the trigger
-- CONDITION itself (entity_id is present directly on every one of these
-- contracts, and the org-level convert_to_client config is active), so no
-- trigger/function code change is bundled in this migration. Fixing the
-- reliability of the Edge Function call chain (bounded retries, a durable
-- outbox, or making the conversion synchronous) is a separate, TypeScript-side
-- change requiring its own review/deploy and is intentionally NOT part of this
-- SQL-only migration.
--
-- Affected contracts (verified via direct read-only queries, 2026-08-19):
--   a38c9c43-088b-4574-b15a-dfa255e634a5  CC-2026-0011  signed 2026-05-28
--   9b685c0c-0293-41bc-b32c-6831833f3f11  CC-2026-0085  signed 2026-08-18
--   17ec0e9b-7188-4d1a-8079-73294000d0e9  CC-2026-0086  signed 2026-08-18
--   4a761fbd-3ea0-4651-b80c-69b03d317745  CC-2026-0076  signed 2026-08-15
-- (all organization_id = 3242e925-da26-459a-8258-be04d904e355,
--  root_organization_id = 4e5901c6-ed7d-45c3-a143-ea2bdd09f091, confirmed from
--  the contracts' own columns.)
--
-- A 5th row sometimes surfaced by the same query (client_contracts.id
-- 99be0e29-a3f8-4947-9a27-7f9357b3aaf2, contract_number QA-CHANDASH-0001) has
-- entity_id IS NULL — QA/test debris, not a real entity — and is deliberately
-- excluded from this backfill.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES
-- ═══════════════════════════════════════════════════════════════════════════
-- Inserts the missing anew_clients row for each of the 4 entities above,
-- reproducing field-for-field what execute-workflow's own INSERT would have
-- written (see index.ts ~line 1059-1069: entity_id, organization_id,
-- root_organization_id, status='active', source_type='contract',
-- source_id=<contract id>, client_type left to its table default 'person' —
-- confirmed 'person' on all 3 real executions of this exact path, and matches
-- these 4 entities' anew_entities.type), except for created_by: the real
-- trigger would have used the *caller's* resolved internal user id, which for
-- a portal/OTP-triggered call is NULL (triggered_by is always passed as null
-- from client-portal-action). Per the reasonable-approximation rule for this
-- backfill, created_by here instead uses the contract's own created_by /
-- assigned_to (identical values on all 4 contracts; status_changed_by is NULL
-- on all 4, so that fallback does not apply) — attributing the row to the
-- commercial who owns the contract rather than leaving it ownerless. Because
-- created_by is non-NULL, the existing BEFORE INSERT trigger
-- trg_auto_assign_creator_clients (auto_assign_creator()) will automatically
-- set assigned_to = created_by, exactly as it does for organically-created
-- rows — this migration does not set assigned_to directly.
--
-- created_at/updated_at use each contract's own signature_date (status_
-- changed_at is NULL on all 4) as the best available approximation of the
-- real conversion moment.
--
-- The existing AFTER INSERT triggers on anew_clients
-- (sync_from_client_after_insert_update -> trg_sync_from_client() ->
-- sync_client_contact_roles(), trg_audit_anew_clients -> fn_generic_entity_audit(),
-- trg_client_created -> fn_trg_client_created()) fire normally on this INSERT,
-- exactly as they would for a live conversion — they deactivate the entity's
-- 'contact' role, activate/create its 'client' role, mark the linked
-- anew_contacts row as converted, and write the usual audit/history entries.
-- No app.audit_bypass is set: this is a deliberate, transparent backfill, not
-- a consolidated RPC action, so it is fine (and desirable) for it to appear in
-- entity_audit_log with changed_by = NULL, matching how the OTP-portal-driven
-- writes on these same contracts already read in that log.
--
-- Idempotent: guarded by NOT EXISTS on (entity_id, organization_id) — there is
-- no unique constraint to ON CONFLICT against, so re-running this migration
-- (or running it after a real anew_clients row eventually appears for one of
-- these entities through some other path) is always a safe no-op for rows
-- that already exist.
--
-- Verification queries (not executed by this migration):
--   SELECT entity_id, organization_id, root_organization_id, status,
--          client_type, source_type, source_id, created_by, assigned_to,
--          created_at
--   FROM public.anew_clients
--   WHERE entity_id IN (
--     'd39d51d1-7b35-44cf-8baf-c31a98830891',
--     'ff3f5c06-1af1-4e2f-9695-57552be69006',
--     '149da3ca-afd7-4d23-9935-11726ba826c8',
--     'e0485cc8-ece7-4432-99b0-404446515a81'
--   );
--   -- Expected: 4 rows, status='active', client_type='person',
--   -- source_type='contract', assigned_to = created_by (auto-filled).

INSERT INTO public.anew_clients (
  entity_id, organization_id, root_organization_id,
  status, source_type, source_id,
  created_by, created_at, updated_at
)
SELECT
  v.entity_id, v.organization_id, v.root_organization_id,
  'active', 'contract', v.contract_id,
  v.created_by, v.created_at, v.created_at
FROM (
  VALUES
    -- CC-2026-0011 / Carolina Santana
    ('d39d51d1-7b35-44cf-8baf-c31a98830891'::uuid,
     '3242e925-da26-459a-8258-be04d904e355'::uuid,
     '4e5901c6-ed7d-45c3-a143-ea2bdd09f091'::uuid,
     'a38c9c43-088b-4574-b15a-dfa255e634a5'::uuid,
     'ec8881cf-0e4d-4249-bf30-b0b87952041f'::uuid,
     '2026-05-28 15:47:13.496+00'::timestamptz),
    -- CC-2026-0085 / Francisco Coelho
    ('ff3f5c06-1af1-4e2f-9695-57552be69006'::uuid,
     '3242e925-da26-459a-8258-be04d904e355'::uuid,
     '4e5901c6-ed7d-45c3-a143-ea2bdd09f091'::uuid,
     '9b685c0c-0293-41bc-b32c-6831833f3f11'::uuid,
     'a7c965e5-8447-4a7b-8415-3f676b746a44'::uuid,
     '2026-08-18 15:41:40.759+00'::timestamptz),
    -- CC-2026-0086 / Maria Almeida
    ('149da3ca-afd7-4d23-9935-11726ba826c8'::uuid,
     '3242e925-da26-459a-8258-be04d904e355'::uuid,
     '4e5901c6-ed7d-45c3-a143-ea2bdd09f091'::uuid,
     '17ec0e9b-7188-4d1a-8079-73294000d0e9'::uuid,
     '880ed63d-10e8-4eaa-bee1-df634b0c4efb'::uuid,
     '2026-08-18 16:56:35.182+00'::timestamptz),
    -- CC-2026-0076 / Daniel Paixao
    ('e0485cc8-ece7-4432-99b0-404446515a81'::uuid,
     '3242e925-da26-459a-8258-be04d904e355'::uuid,
     '4e5901c6-ed7d-45c3-a143-ea2bdd09f091'::uuid,
     '4a761fbd-3ea0-4651-b80c-69b03d317745'::uuid,
     'bcea155f-2a0a-4cee-b1d7-1727c2a5c2d1'::uuid,
     '2026-08-15 12:32:54.932+00'::timestamptz)
) AS v(entity_id, organization_id, root_organization_id, contract_id, created_by, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.anew_clients ac
  WHERE ac.entity_id = v.entity_id
    AND ac.organization_id = v.organization_id
);

-- Mirror the other half of execute-workflow's would-be conversion: it also
-- writes the resolved client id back onto client_contracts.client_id
-- ("UPDATE client_contracts SET client_id = resolvedClientId", index.ts
-- ~line 1077) whenever the contract didn't already point at one. All 4
-- contracts here have client_id IS NULL today, so this only ever fills a
-- currently-empty column and never overwrites an existing link — safe to
-- re-run.
UPDATE public.client_contracts c
SET client_id = ac.id
FROM public.anew_clients ac
WHERE c.id IN (
  'a38c9c43-088b-4574-b15a-dfa255e634a5',
  '9b685c0c-0293-41bc-b32c-6831833f3f11',
  '17ec0e9b-7188-4d1a-8079-73294000d0e9',
  '4a761fbd-3ea0-4651-b80c-69b03d317745'
)
AND c.client_id IS NULL
AND ac.entity_id = c.entity_id
AND ac.organization_id = c.organization_id;

-- Fix "Eliminar definitivamente" (purge) failing with a foreign key violation
-- for two entity kinds whose purge path deletes a row that another table
-- still points to via a FK column that has no ON DELETE clause (defaults to
-- NO ACTION), confirmed live (9th audit round):
--
-- 1) purge_entity_facet(kind => 'client'):
--    `anew_leads.converted_to_client_id` -> `anew_clients.id` via
--    "anew_leads_converted_to_client_id_fkey" (no ON DELETE, see baseline
--    20260615130000 line ~18559) is never cleared before
--    `DELETE FROM public.anew_clients WHERE id = p_id`, so purging a client
--    that originated from a lead conversion raises:
--      update or delete on table "anew_clients" violates foreign key
--      constraint "anew_leads_converted_to_client_id_fkey" on table
--      "anew_leads"
--
-- 2) purge_business_entity(kind => 'proposal' or 'deal'):
--    `client_contracts.proposal_id` -> `proposals.id` via
--    "client_contracts_proposal_id_fkey" (also no ON DELETE, see baseline
--    line ~19255) is never cleared before the function's own
--    `DELETE FROM public.proposals WHERE id = p_id` (direct proposal purge)
--    or `DELETE FROM public.proposals WHERE deal_id = p_id` (cascading purge
--    of a deal's child proposals), so purging a proposal/deal that a
--    client_contracts row still references would raise the analogous FK
--    violation on "client_contracts_proposal_id_fkey".
--
-- Every other DELETE inside these two functions purges rows via FKs that
-- already carry ON DELETE CASCADE/SET NULL (verified against baseline
-- 20260615130000: proposal_items, proposal_sends, proposal_verification_codes,
-- quote_lines, quote_fees, quote_sends, client_contract_events,
-- client_contract_parties, client_contract_signature_requests,
-- contract_documents, contract_sends, deals_lead_id_fkey,
-- campaign_leads_anew_lead_id_fkey, deals_client_id_fkey,
-- deals_contact_id_fkey, client_portal_users_*, quotes_deal_id_fkey,
-- quotes_proposal_id_fkey, proposals_deal_id_fkey,
-- proposals_client_contract_id_fkey, schedule_items_deal_id_fkey), so no
-- further FK cleanup is needed beyond these two.
--
-- Fix: same verbatim pg_get_functiondef + textual substitution pattern used
-- by the prior fixes in this session (20261110350000, 20261110360000,
-- 20261110370000) — insert one UPDATE ... SET ... = NULL statement
-- immediately before the relevant DELETE, changing nothing else in either
-- function body. Both LIKE checks tolerate the org-check clause already
-- being in its post-20261110370000 fixed form (`IN (SELECT ...)`), since that
-- migration ran earlier in this same sequence.

DO $outer$
DECLARE
  v_src   text;
  v_fixed text;
BEGIN
  -- purge_entity_facet: clear anew_leads.converted_to_client_id before
  -- deleting the anew_clients row.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'purge_entity_facet';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'purge_entity_facet not found — cannot patch';
  ELSIF v_src LIKE '%converted_to_client_id = NULL WHERE converted_to_client_id = p_id%' THEN
    RAISE NOTICE 'purge_entity_facet already fixed — skipping';
  ELSIF v_src NOT LIKE '%ELSE
    DELETE FROM public.anew_clients WHERE id = p_id;
  END IF;%' THEN
    RAISE EXCEPTION 'purge_entity_facet: expected buggy clause not found verbatim — aborting';
  ELSE
    v_fixed := replace(
      v_src,
      'ELSE
    DELETE FROM public.anew_clients WHERE id = p_id;
  END IF;',
      'ELSE
    UPDATE public.anew_leads SET converted_to_client_id = NULL WHERE converted_to_client_id = p_id;
    DELETE FROM public.anew_clients WHERE id = p_id;
  END IF;'
    );
    IF v_fixed = v_src THEN
      RAISE EXCEPTION 'purge_entity_facet replacement did not match — aborting';
    END IF;
    EXECUTE v_fixed;
    RAISE NOTICE 'Patched purge_entity_facet (clear anew_leads.converted_to_client_id before client purge)';
  END IF;

  -- purge_business_entity: clear client_contracts.proposal_id before
  -- deleting proposals, in both the direct-proposal-purge branch and the
  -- deal-purge branch that cascades into deleting the deal's proposals.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'purge_business_entity';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'purge_business_entity not found — cannot patch';
  ELSIF v_src LIKE '%client_contracts SET proposal_id = NULL%' THEN
    RAISE NOTICE 'purge_business_entity already fixed — skipping';
  ELSIF v_src NOT LIKE '%DELETE FROM public.proposals WHERE deal_id = p_id; -- CASCADE em proposal_*%'
     OR v_src NOT LIKE '%ELSIF p_kind = ''proposal'' THEN
    -- proposal_items, proposal_sends, proposal_access_tokens, proposal_deliveries, proposal_verification_codes têm CASCADE
    DELETE FROM public.proposals WHERE id = p_id;%' THEN
    RAISE EXCEPTION 'purge_business_entity: expected buggy clauses not found verbatim — aborting';
  ELSE
    v_fixed := replace(
      v_src,
      'DELETE FROM public.proposals WHERE deal_id = p_id; -- CASCADE em proposal_*',
      'UPDATE public.client_contracts SET proposal_id = NULL WHERE proposal_id IN (SELECT id FROM public.proposals WHERE deal_id = p_id);
    DELETE FROM public.proposals WHERE deal_id = p_id; -- CASCADE em proposal_*'
    );
    v_fixed := replace(
      v_fixed,
      'ELSIF p_kind = ''proposal'' THEN
    -- proposal_items, proposal_sends, proposal_access_tokens, proposal_deliveries, proposal_verification_codes têm CASCADE
    DELETE FROM public.proposals WHERE id = p_id;',
      'ELSIF p_kind = ''proposal'' THEN
    -- proposal_items, proposal_sends, proposal_access_tokens, proposal_deliveries, proposal_verification_codes têm CASCADE
    UPDATE public.client_contracts SET proposal_id = NULL WHERE proposal_id = p_id;
    DELETE FROM public.proposals WHERE id = p_id;'
    );
    IF v_fixed = v_src THEN
      RAISE EXCEPTION 'purge_business_entity replacement did not match — aborting';
    END IF;
    EXECUTE v_fixed;
    RAISE NOTICE 'Patched purge_business_entity (clear client_contracts.proposal_id before proposal purge, both branches)';
  END IF;
END;
$outer$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. "Eliminar definitivamente" on a client that was converted from a lead
--    (anew_leads.converted_to_client_id pointing to it) no longer raises
--    "violates foreign key constraint anew_leads_converted_to_client_id_fkey"
--    — the lead's converted_to_client_id is nulled first, then the client
--    row is deleted; the lead itself is untouched otherwise.
-- 2. "Eliminar definitivamente" on a proposal (or a deal whose child
--    proposals are purged along with it) that a client_contracts row still
--    references via proposal_id no longer raises
--    "violates foreign key constraint client_contracts_proposal_id_fkey" —
--    the referencing client_contracts.proposal_id is nulled first.
-- 3. Authorization behavior (Sem permissao checks) is unchanged in both
--    functions; only the two DELETE branches gained a preceding UPDATE.

-- ============================================================================
-- Fix: opening a client's detail dialog took ~4s (regular user) to ~10s
-- (System Admin) just to display the address, because the identity link
-- tables had no index other than their primary key.
--
-- Measured on the live database, simulated session, reading one client's
-- address (Rua Penha de França / 1170-302 Lisboa):
--
--   before   System Admin  10084 ms      regular user  3915 ms
--   after    System Admin     50 ms      regular user     8 ms
--
-- Why an index mattered so much here: the SELECT policy on anew_addresses is
--
--   EXISTS (SELECT 1 FROM anew_entity_addresses ea
--            WHERE ea.address_id = anew_addresses.id
--              AND is_entity_in_user_scope(ea.entity_id, auth.uid()))
--
-- With no index on anew_entity_addresses.address_id the planner could not run
-- that as a correlated lookup, so it materialised the FULL set of visible
-- address ids instead: a Seq Scan over all 3004 rows of
-- anew_entity_addresses, calling is_entity_in_user_scope per row, and each of
-- those calls scanning anew_entity_roles (6946 rows). EXPLAIN showed 821258
-- shared buffers to return a single row. System Admins paid it twice, because
-- the RESTRICTIVE system_admin_pii_default_deny policy repeats the same shape.
--
-- The index on entity_id serves the direct lookups (fetch this entity's
-- address/email/phone), which is how every detail screen and the quote /
-- proposal PDF read identity data.
--
-- This is step 2 of vault/ficheiros/performance/2026-08-17/
-- plano-correcao-propostas-clientes.md ("Índices entity_id"), extended with
-- address_id once EXPLAIN showed that was the one unblocking the RLS subplan.
--
-- Risk: near zero. Indexes only — no policy, function, schema or data change,
-- so no user can see anything they could not see before. CONCURRENTLY does not
-- block writes.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block. This
-- migration must not be wrapped in BEGIN/COMMIT.
--
-- Reversal: DROP INDEX CONCURRENTLY IF EXISTS <name>; for each index below.
--
-- Already applied to the live database (recorded in
-- supabase_migrations.schema_migrations); this file brings it into git.
--
-- Only the two anew_entity_addresses indexes have measured before/after
-- numbers. The remaining three are the same defect on the sibling identity
-- tables, read by the same screens, and are included per the plan's step 2.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anew_entity_addresses_entity_id
  ON public.anew_entity_addresses (entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anew_entity_addresses_address_id
  ON public.anew_entity_addresses (address_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anew_entity_emails_entity_id
  ON public.anew_entity_emails (entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anew_entity_phones_entity_id
  ON public.anew_entity_phones (entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_anew_entity_fiscal_entities_entity_id
  ON public.anew_entity_fiscal_entities (entity_id);

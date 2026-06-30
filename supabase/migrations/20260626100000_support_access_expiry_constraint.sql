-- Migration: 20260626100000_support_access_expiry_constraint.sql
-- Purpose: Add explicit CHECK constraint ensuring expires_at IS NOT NULL
--          whenever status = 'approved' on support_access_log.
--
-- Note: The table already carries support_access_log_expires_consistency which
-- expresses the same rule. This migration adds chk_approved_requires_expiry
-- as the canonically-named constraint requested, making the invariant
-- visible under both names and forward-compatible with any future rename of
-- the original constraint.

ALTER TABLE public.support_access_log
  ADD CONSTRAINT chk_approved_requires_expiry
  CHECK (status != 'approved' OR expires_at IS NOT NULL);

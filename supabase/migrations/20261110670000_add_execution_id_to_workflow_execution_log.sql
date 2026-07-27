-- Add an additive, nullable execution_id column to workflow_execution_log so
-- all log rows produced by a single execute-workflow invocation (both the
-- generic automation-rule action and the hardcoded cascade actions) can be
-- grouped together. Indexed for lookups by invocation.
ALTER TABLE "public"."workflow_execution_log"
  ADD COLUMN IF NOT EXISTS "execution_id" uuid;

CREATE INDEX IF NOT EXISTS "idx_workflow_execution_log_execution_id"
  ON "public"."workflow_execution_log" ("execution_id");

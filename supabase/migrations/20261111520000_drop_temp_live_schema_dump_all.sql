-- Drop the temporary all-schemas live-schema-dump function added in
-- 20261111510000, no longer needed now that the one-off dump has been saved.

DROP FUNCTION IF EXISTS public._temp_live_schema_dump_all();

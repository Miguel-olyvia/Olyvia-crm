-- Drop the temporary live-schema-dump function added in 20261111390000, no
-- longer needed now that the one-off schema dump it produced has been saved.

DROP FUNCTION IF EXISTS public._temp_live_schema_dump();

-- TEMPORARY function, same purpose as 20261111390000/20261111500000, but
-- generalized to loop over EVERY real schema (excluding only the internal
-- pg_catalog/information_schema), not just public. Dropped right after use.

CREATE OR REPLACE FUNCTION public._temp_live_schema_dump_all()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  out text := '';
  sch record;
  r record;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema')
      AND nspname NOT LIKE 'pg_toast%'
      AND nspname NOT LIKE 'pg_temp%'
    ORDER BY nspname
  LOOP
    out := out || format(E'\n-- ===================== SCHEMA: %s =====================\n', sch.nspname);
    out := out || format('CREATE SCHEMA IF NOT EXISTS %I;', sch.nspname) || E'\n\n';

    -- Enum types
    FOR r IN
      SELECT t.typname,
             string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = sch.nspname
      GROUP BY t.typname
      ORDER BY t.typname
    LOOP
      out := out || format('CREATE TYPE %I.%I AS ENUM (%s);', sch.nspname, r.typname, r.labels) || E'\n';
    END LOOP;
    out := out || E'\n';

    -- Tables + columns
    FOR r IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = sch.nspname AND c.relkind = 'r'
      ORDER BY c.relname
    LOOP
      out := out || format('CREATE TABLE %I.%I (', sch.nspname, r.relname) || E'\n';
      out := out || (
        SELECT string_agg(
          '  ' || format('%I %s%s%s', a.attname,
            format_type(a.atttypid, a.atttypmod),
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
            COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
          ), ',' || E'\n' ORDER BY a.attnum
        )
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = (quote_ident(sch.nspname) || '.' || quote_ident(r.relname))::regclass
          AND a.attnum > 0 AND NOT a.attisdropped
      );
      out := out || E'\n);\n\n';
    END LOOP;

    -- Constraints (PK, FK, UNIQUE, CHECK)
    FOR r IN
      SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE connamespace = (quote_ident(sch.nspname))::regnamespace
      ORDER BY conrelid::regclass::text, conname
    LOOP
      out := out || format('ALTER TABLE %s ADD CONSTRAINT %I %s;', r.tbl, r.conname, r.def) || E'\n';
    END LOOP;
    out := out || E'\n';

    -- Indexes (skip ones backing a constraint, already emitted above)
    FOR r IN
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = sch.nspname
        AND indexname NOT IN (
          SELECT conname FROM pg_constraint WHERE connamespace = (quote_ident(sch.nspname))::regnamespace
        )
      ORDER BY indexname
    LOOP
      out := out || r.indexdef || ';' || E'\n';
    END LOOP;
    out := out || E'\n';

    -- RLS enable + policies
    FOR r IN
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = sch.nspname AND c.relkind = 'r' AND c.relrowsecurity
      ORDER BY c.relname
    LOOP
      out := out || format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', sch.nspname, r.relname) || E'\n';
    END LOOP;
    out := out || E'\n';

    FOR r IN
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = sch.nspname
      ORDER BY tablename, policyname
    LOOP
      out := out || format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
        r.policyname, sch.nspname, r.tablename,
        CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        r.cmd,
        array_to_string(r.roles, ', '),
        COALESCE(' USING (' || r.qual || ')', ''),
        COALESCE(' WITH CHECK (' || r.with_check || ')', '')
      ) || E'\n';
    END LOOP;
    out := out || E'\n';

    -- Functions
    FOR r IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = sch.nspname
      ORDER BY p.proname
    LOOP
      BEGIN
        out := out || pg_get_functiondef(r.oid) || ';' || E'\n\n';
      EXCEPTION WHEN OTHERS THEN
        out := out || format('-- SKIPPED function oid %s: %s', r.oid, SQLERRM) || E'\n';
      END;
    END LOOP;

    -- Triggers
    FOR r IN
      SELECT pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = sch.nspname AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    LOOP
      out := out || r.def || ';' || E'\n';
    END LOOP;
  END LOOP;

  RETURN out;
END;
$function$;

REVOKE ALL ON FUNCTION public._temp_live_schema_dump_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._temp_live_schema_dump_all() TO authenticated, service_role;

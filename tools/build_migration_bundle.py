#!/usr/bin/env python3
"""Build /mnt/documents/migration-bundle/ from schema-app-only.sql + live DB."""
import os, re, subprocess, sys, textwrap

SRC = "/mnt/documents/schema-app-only.sql"
OUT = "/mnt/documents/migration-bundle"
os.makedirs(OUT, exist_ok=True)

def psql(q):
    r = subprocess.run(["psql","-t","-A","-F","\x1f","-c",q],
                       capture_output=True, text=True, check=True)
    return [ln.split("\x1f") for ln in r.stdout.strip().split("\n") if ln]

# ---------- 00-extensions.sql ----------
ext = """\
-- 00-extensions.sql — Olyvia migration bundle
-- Run first on an empty Supabase Pro+ project.

SET statement_timeout = '0';
SET lock_timeout = '0';
SET idle_in_transaction_session_timeout = '0';
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
-- pg_cron / pg_net require Supabase Pro+; will no-op on free tier:
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net        WITH SCHEMA extensions;
"""
open(f"{OUT}/00-extensions.sql","w").write(ext)

# ---------- 01-schema.sql ----------
# Stream source, drop lines that belong to other files (storage buckets/policies
# already aren't in source; ALTER PUBLICATION supabase_realtime is — strip it).
src_lines = open(SRC).readlines()

filtered = []
skip_block = False
buf = []
for line in src_lines:
    s = line.strip()
    # drop initial SET/SCHEMA header (now in 00)
    if s.startswith("SET ") and not skip_block and len(filtered) == 0:
        continue
    if s.startswith("CREATE SCHEMA IF NOT EXISTS extensions"):
        continue
    # drop ALTER PUBLICATION supabase_realtime (moved to 03)
    if "ALTER PUBLICATION supabase_realtime" in s:
        continue
    # drop INSERT INTO storage.buckets statements + their multi-line tail
    if s.startswith("INSERT INTO storage.buckets"):
        skip_block = True
    if skip_block:
        if ";" in s:
            skip_block = False
        continue
    filtered.append(line)

with open(f"{OUT}/01-schema.sql","w") as f:
    f.write("-- 01-schema.sql — public schema (enums, tables, FKs, indexes,\n")
    f.write("-- functions, triggers, RLS, policies, grants, views).\n")
    f.write("-- Generated from schema-app-only.sql (migration-ordered, 241 tables).\n\n")
    f.write("BEGIN;\n\n")
    f.writelines(filtered)
    f.write("\nCOMMIT;\n")

# ---------- 02-storage.sql ----------
ALLOWED_BUCKETS = ('documents','contract-documents','company-logos','media','proposal-templates')
FORBIDDEN_REFS = ('quote_documents','client_portal_documents','portal_user_can_see_doc')

buckets = psql("""SELECT id, name, public::text,
    COALESCE(file_size_limit::text,'NULL'),
    CASE WHEN allowed_mime_types IS NULL THEN 'NULL'
         ELSE quote_literal(allowed_mime_types::text) END
    FROM storage.buckets
    WHERE id IN ('documents','contract-documents','company-logos','media','proposal-templates')
    ORDER BY id;""")

# Use pg_dump for the policies on storage.objects (correct quoting of complex expressions)
pol = subprocess.run(
    ["pg_dump","--schema=storage","--no-owner","--no-privileges",
     "--no-publications","--no-subscriptions","--no-tablespaces",
     "-t","storage.objects","--section=post-data"],
    capture_output=True, text=True, check=True).stdout

# Keep only CREATE POLICY blocks; drop ones referencing reverted tables/functions.
storage_policies = []
buf = []
in_policy = False
for line in pol.splitlines():
    if line.startswith("CREATE POLICY"):
        in_policy = True
        buf = [line]
    elif in_policy:
        buf.append(line)
        if line.rstrip().endswith(";"):
            body = "\n".join(buf)
            if not any(ref in body for ref in FORBIDDEN_REFS):
                storage_policies.append(body)
            in_policy = False
            buf = []

with open(f"{OUT}/02-storage.sql","w") as f:
    f.write("-- 02-storage.sql — storage buckets + storage.objects policies.\n")
    f.write("-- Only buckets in active use: documents, contract-documents,\n")
    f.write("-- company-logos, media, proposal-templates.\n\n")
    for b in buckets:
        bid, name, pub, fsl, mimes = b
        fsl_sql = "NULL" if fsl == "NULL" else fsl
        mimes_sql = "NULL" if mimes == "NULL" else f"{mimes}::text[]"
        f.write(
            f"INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) "
            f"VALUES ('{bid}', '{name}', {pub}, {fsl_sql}, {mimes_sql}) "
            f"ON CONFLICT (id) DO NOTHING;\n"
        )
    f.write("\n-- Policies on storage.objects (quote_documents / client_portal_documents\n")
    f.write("-- references skipped — those tables were reverted on 2026-04-30).\n")
    for p in storage_policies:
        f.write(p + "\n\n")


# Fixed allowlist — the live publication still includes legacy `leads` and
# `scheduled_emails` entries that no longer exist in the public schema.
REALTIME_TABLES = [
    "internal_chat_messages",
    "anew_leads",
    "notifications",
    "team_hub_comments",
    "team_hub_entries",
    "user_presence",
]
with open(f"{OUT}/03-realtime-cron.sql","w") as f:
    f.write("-- 03-realtime-cron.sql — realtime publication tables + cron jobs.\n\n")
    f.write("-- Ensure supabase_realtime publication exists (created by Supabase by default).\n")
    f.write("DO $$ BEGIN\n")
    f.write("  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN\n")
    f.write("    CREATE PUBLICATION supabase_realtime;\n")
    f.write("  END IF;\n")
    f.write("END $$;\n\n")
    for t in REALTIME_TABLES:
        f.write(f"ALTER PUBLICATION supabase_realtime ADD TABLE public.{t};\n")
    f.write("\n-- Cron jobs (require pg_cron extension, Supabase Pro+).\n")

    f.write("-- Idempotent: unschedule first if exists.\n")
    f.write("""
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname='process-scheduled-emails';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
  PERFORM cron.schedule(
    'process-scheduled-emails',
    '* * * * *',
    $cron$ SELECT net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/process-scheduled-emails',
      headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
    ); $cron$
  );

  SELECT jobid INTO jid FROM cron.job WHERE jobname='auto-schedule';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
  PERFORM cron.schedule(
    'auto-schedule',
    '*/5 * * * *',
    $cron$ SELECT net.http_post(
      url:='https://<PROJECT_REF>.supabase.co/functions/v1/auto-schedule',
      headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
    ); $cron$
  );
EXCEPTION WHEN undefined_table OR undefined_function THEN
  RAISE NOTICE 'pg_cron not available — skipping cron jobs (enable pg_cron and re-run this block).';
END $$;
""")

# ---------- 04-seed.sql ----------
SEED_TABLES = ["countries","uom","permissions","administrative_divisions",
               "channel_types","lead_sources","role_permissions","deal_stages"]

with open(f"{OUT}/04-seed.sql","w") as f:
    f.write("-- 04-seed.sql — reference / lookup data (idempotent).\n")
    f.write("-- Dumped from live DB; uses ON CONFLICT DO NOTHING.\n\n")
    for t in SEED_TABLES:
        f.write(f"\n-- ---- {t} ----\n")
        dump = subprocess.run(
            ["pg_dump","--data-only","--column-inserts","--no-owner",
             "-t",f"public.{t}"],

            capture_output=True, text=True, check=True).stdout
        # keep only INSERT statements, convert to ON CONFLICT DO NOTHING
        for line in dump.splitlines():
            if line.startswith("INSERT INTO"):
                if line.rstrip().endswith(";"):
                    line = line.rstrip()[:-1] + " ON CONFLICT DO NOTHING;"
                f.write(line + "\n")

# ---------- RUN_ALL.sql ----------
open(f"{OUT}/RUN_ALL.sql","w").write("""\
-- RUN_ALL.sql — execute the full bundle in order.
-- Usage: psql --set ON_ERROR_STOP=on -f RUN_ALL.sql
\\echo 'Step 1/5: extensions'
\\i 00-extensions.sql
\\echo 'Step 2/5: schema (public)'
\\i 01-schema.sql
\\echo 'Step 3/5: storage buckets + policies'
\\i 02-storage.sql
\\echo 'Step 4/5: realtime publication + cron'
\\i 03-realtime-cron.sql
\\echo 'Step 5/5: reference seed data'
\\i 04-seed.sql
\\echo 'Done.'
""")

# ---------- README.md ----------
open(f"{OUT}/README.md","w").write("""\
# Olyvia migration bundle

Recria a estrutura completa do backend num Supabase **Pro+ vazio** (Pro+
necessário para `pg_cron`/`pg_net`).

## Conteúdo

| Ficheiro | O que faz |
|---|---|
| `00-extensions.sql` | Extensões Postgres (pgcrypto, pg_trgm, unaccent, uuid-ossp, pg_cron, pg_net). |
| `01-schema.sql` | Schema `public`: enums, tabelas (241), FKs, indexes, funções, triggers, RLS, policies, grants, views. Em transacção única. |
| `02-storage.sql` | 7 buckets de storage + policies em `storage.objects`. |
| `03-realtime-cron.sql` | Tabelas no `supabase_realtime` publication + 2 cron jobs. |
| `04-seed.sql` | Dados de referência (countries, uom, permissions, administrative_divisions, channel_types, lead_sources, role_permissions, deal_stages). |
| `RUN_ALL.sql` | Executa tudo na ordem. |

## Como correr

```bash
cd migration-bundle
psql "$NEW_DATABASE_URL" --set ON_ERROR_STOP=on -f RUN_ALL.sql
```

Antes de correr `03-realtime-cron.sql` substitui `<PROJECT_REF>` e
`<SERVICE_ROLE_KEY>` pelos valores do novo projecto Supabase.

## Fora de scope

- Dados de negócio (leads, deals, quotes, contracts, anew_entities, etc.) — usa
  `pg_dump --data-only` separado.
- `auth.users` (passwords, providers) — script dedicado.
- Ficheiros físicos em `storage.objects` — `supabase storage cp` ou `rclone`.
- Edge functions — `supabase functions deploy`.
- Secrets das edge functions — configurar manualmente.
""")
print("done")

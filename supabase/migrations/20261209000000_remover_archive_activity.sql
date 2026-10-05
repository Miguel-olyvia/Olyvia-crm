-- Remove a funcao public.archive_activity(uuid).
--
-- O QUE FAZ
-- A funcao copiava uma actividade para public.activities_archive e apagava-a de
-- public.activities. A tabela activities_archive NAO existe em nenhuma base
-- (nenhuma migration a cria), por isso a funcao nunca funcionou: o bloco
-- EXCEPTION WHEN OTHERS escondia o erro e devolvia false. Ninguem a chama: nem a
-- aplicacao, nem as Edge Functions, nem outras funcoes ou gatilhos da base.
-- Estava concedida a anon, authenticated e service_role (a anon podia chama-la
-- sem sessao, embora falhasse sempre).
--
-- DECISAO do Miguel (05/10/2026): eliminar.
--
-- PRECISA DE CODIGO NOVO? Nao. A unica outra referencia e a linha gerada em
-- src/integrations/supabase/types.ts, retirada no mesmo commit.
--
-- COMO REVERTER: recriar a funcao a partir de 20260615130000_baseline_new_database
-- (nao recomendado: nunca funcionou).

BEGIN;

DROP FUNCTION IF EXISTS public.archive_activity(uuid);

DO $conferir$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'archive_activity'
  ) THEN
    RAISE EXCEPTION 'public.archive_activity ainda existe depois do DROP';
  END IF;
END
$conferir$;

COMMIT;

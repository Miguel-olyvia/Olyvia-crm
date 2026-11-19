-- ============================================================
-- 20270124030000 adendas_taxa_iva_por_linha
-- ============================================================
-- Auditoria de 19/11/2026 (lote 2), ponto 4: a taxa de IVA das linhas das adendas não fica na base.
--
-- O problema: o browser manda a taxa de cada linha da adenda (negocioReal.ts, LinhaAdendaLinha.taxa_iva: 6 ou 23), mas a base deita-a
-- fora. As linhas das adendas NÃO vivem em adenda_linhas (essa tabela, de 20261231940000, não é escrita por nenhuma função nem pelo
-- browser): vivem em quote_lines, nas propostas da adenda (quotes.adenda_id), escritas por fn_neg_guardar_adendas e lidas por
-- fn_neg_ler_adendas. A gravação punha sempre iva_percent = 6 e iva_explicita = false, e a leitura não devolvia a taxa. Por isso o
-- browser deduzia 23% pelo nome na linha dos produtos do acerto.
--
-- O que muda (trocas de texto guardadas sobre o pg_get_functiondef VIVO; nenhuma coluna nova):
--   1. fn_neg_guardar_adendas: a linha com taxa_iva 6 ou 23 grava-a em quote_lines.iva_percent com iva_explicita = true (e o
--      total_com_iva da linha com essa taxa). Sem taxa (ou outra), fica como antes: 6% e iva_explicita = false. As versões aceites
--      ou em curso não se reescrevem (a regra de 20261231994000 fica igual), por isso as linhas antigas continuam sem taxa.
--   2. fn_neg_ler_adendas: cada linha devolve taxa_iva = iva_percent quando iva_explicita; NULL nas antigas. É a mesma regra das
--      linhas do orçamento principal (fn_neg_ler_orcamento: 'taxa_iva', CASE WHEN l.iva_explicita THEN l.iva_percent END).
-- Permissões, GRANTs (só service_role), dono, SECURITY DEFINER e search_path ficam iguais.
--
-- Reversão (só como migration nova): desfazer as três trocas marcadas «20270124030000» (ver o fim deste ficheiro). As linhas gravadas
-- entretanto ficam com a taxa certa em iva_percent; a leitura volta a não a devolver.
-- ============================================================
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva; a função mudou. Rever antes de aplicar 20270124030000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 1. gravar a taxa
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
BEGIN
  IF position('20270124030000' IN d) > 0 THEN
    RAISE NOTICE 'fn_neg_guardar_adendas já tem as trocas 20270124030000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, E'        v_iva := 6;\n',
       E'        -- 20270124030000: a taxa da linha (6 ou 23) quando o browser a manda; sem ela, 6% como antes\n'
    || E'        v_iva := CASE WHEN (l->>\'taxa_iva\')::numeric IN (6, 23) THEN (l->>\'taxa_iva\')::numeric ELSE 6 END;\n',
       'fn_neg_guardar_adendas (taxa)');
  d := pg_temp.trocar(d, E'          v_iva, false, v_tot,',
       E'          v_iva, coalesce((l->>\'taxa_iva\')::numeric IN (6, 23), false) /* 20270124030000: iva_explicita */, v_tot,',
       'fn_neg_guardar_adendas (iva_explicita)');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 2. ler a taxa
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.fn_neg_ler_adendas(uuid)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'\'horas_un\', coalesce(c.horas_un, 0), \'perfil\', coalesce(l.perfil_nome, \'\'), \'perfil_chave\', l.perfil_chave,\n';
BEGIN
  IF position('20270124030000' IN d) > 0 THEN
    RAISE NOTICE 'fn_neg_ler_adendas já tem a troca 20270124030000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, v_antes,
       v_antes
    || E'            -- 20270124030000: a taxa da linha (só as gravadas com ela; as antigas vêm sem taxa)\n'
    || E'            \'taxa_iva\', CASE WHEN l.iva_explicita THEN l.iva_percent END,\n',
       'fn_neg_ler_adendas (taxa_iva)');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE r record;
BEGIN
  FOR r IN SELECT x FROM unnest(ARRAY['public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)', 'public.fn_neg_ler_adendas(uuid)']) AS t(x) LOOP
    IF position('20270124030000' IN pg_get_functiondef(r.x::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'CONFERIR: % ficou sem as trocas 20270124030000', r.x;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = r.x::regprocedure) THEN
      RAISE EXCEPTION 'CONFERIR: % deixou de ser SECURITY DEFINER', r.x;
    END IF;
    IF has_function_privilege('authenticated', r.x, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: % ficou aberta a authenticated', r.x;
    END IF;
  END LOOP;
END $c$;

-- Reversão das trocas (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text;
-- BEGIN
--   d := replace(pg_get_functiondef('public.fn_neg_guardar_adendas(uuid,uuid,jsonb,uuid)'::regprocedure), chr(13) || chr(10), chr(10));
--   d := regexp_replace(d, E'        -- 20270124030000: a taxa da linha[^\n]*\n        v_iva := CASE[^\n]*\n', E'        v_iva := 6;\n');
--   d := replace(d, E'coalesce((l->>''taxa_iva'')::numeric IN (6, 23), false) /* 20270124030000: iva_explicita */', 'false');
--   EXECUTE d;
--   d := replace(pg_get_functiondef('public.fn_neg_ler_adendas(uuid)'::regprocedure), chr(13) || chr(10), chr(10));
--   d := regexp_replace(d, E'            -- 20270124030000: a taxa da linha[^\n]*\n            ''taxa_iva'', CASE WHEN l.iva_explicita THEN l.iva_percent END,\n', '');
--   EXECUTE d;
-- END $r$;

-- ============================================================
-- 20270125020000 negocio_versao_ao_gravar
-- ============================================================
-- Auditoria de 19/11/2026 (Lote 3, dados, achado 2, primeira parte): duas pessoas a gravar o mesmo negócio apagavam-se uma à outra.
--
-- O problema: neg_guardar_negocio apaga e volta a escrever as respostas, as medidas, os serviços, os produtos e o histórico com o que o
-- ecrã manda, sem saber que versão o ecrã leu. Um separador aberto há mais tempo apagava o que outra pessoa gravou entretanto.
-- (O ecrã já junta as respostas da base antes de gravar, sincronizarNegocios.ts/juntarRespostasDaBase, mas só as respostas e sem trinco.)
--
-- O que muda:
--   1. Tabela negocio_versoes (nova): uma linha por negócio com a versão das gravações (0 para quem nunca gravou depois disto). Só as
--      funções escrevem (RLS activa, sem políticas, sem privilégios para anon nem authenticated). À parte de negocios para não disparar
--      os gatilhos de negocios nem a política negocios_update (um UPDATE direto não a mexe).
--   2. neg_versoes(org) (nova): {id do negócio: versão} dos negócios que o utilizador lê (fn_neg_ids_legiveis, o critério de
--      neg_ler_negocios). O ecrã lê-a ANTES de neg_ler_negocios: uma gravação a meio dá, no pior caso, um conflito a mais, nunca a menos.
--   3. fn_neg_versao_conferir(negócio, linhas) (nova, interna): tranca a linha da versão até ao fim da transação (duas gravações do mesmo
--      negócio deixam de se cruzar), compara com p_linhas.versao_lida (se vier) e sobe a versão. Diferente: NE015 «Este negócio foi
--      alterado noutro lado…» e nada se grava. Sem versao_lida (os chamadores antigos e as outras apps): grava como antes, e sobe a versão.
--   4. neg_guardar_negocio: UMA troca de texto guardada sobre o pg_get_functiondef VIVO (o texto antigo tem de aparecer exatamente uma
--      vez; senão a migration pára e explica): logo a seguir à verificação do âmbito de pessoas.edit, chama fn_neg_versao_conferir e relê
--      o negócio já trancado. O resto da função fica byte a byte. A assinatura, os GRANT, o dono, SECURITY DEFINER e search_path não mudam.
--      Partiu da definição de 20270117830000 (corpo inteiro) com a troca de 20270117960000 (sai o bloqueio do contrato); a troca daqui
--      não toca nesse sítio.
--   O ecrã manda versao_lida e, se a base disser NE015, relê o negócio e diz «Este negócio foi alterado noutro lado; atualizei. Volte a
--   fazer a alteração.». Depois de gravar bem, a versão do ecrã é a lida + 1 (a linha esteve trancada).
-- NE015 é um código novo.
--
-- Reversão (só como migration nova): tirar de neg_guardar_negocio o bloco entre «-- 20270125020000 início» e «-- 20270125020000 fim»
-- (ver o fim deste ficheiro) e depois DROP FUNCTION public.fn_neg_versao_conferir(uuid, jsonb), public.neg_versoes(uuid);
-- DROP TABLE public.negocio_versoes. O ecrã novo continua a funcionar sem isto (sem versões, grava como antes).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF to_regprocedure('public.neg_guardar_negocio(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Falta neg_guardar_negocio: rever antes de aplicar 20270125020000.';
  END IF;
  IF position('20270117830000' IN pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'neg_guardar_negocio não tem as mudanças de 20270117830000: aplicar essa migration (e 20270117960000) antes de 20270125020000.';
  END IF;
  IF to_regprocedure('public.fn_neg_ids_legiveis()') IS NULL THEN
    RAISE EXCEPTION 'Falta fn_neg_ids_legiveis (20270112210000): aplicar essa migration antes de 20270125020000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. a versão de cada negócio
CREATE TABLE IF NOT EXISTS public.negocio_versoes (
  negocio_id      uuid        PRIMARY KEY,
  organization_id uuid        NOT NULL,
  versao          bigint      NOT NULL DEFAULT 0 CHECK (versao >= 0),
  gravado_em      timestamptz,
  gravado_por     uuid,
  CONSTRAINT negocio_versoes_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
ALTER TABLE public.negocio_versoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_versoes FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_versoes IS 'Negócio: a versão das gravações (neg_guardar_negocio sobe-a; o ecrã manda a que leu em versao_lida). Sem políticas: só as funções. 20270125020000.';

-- ---------------------------------------------------------------- 2. ler as versões
CREATE OR REPLACE FUNCTION public.neg_versoes(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270125020000: {id: versão} dos negócios que o utilizador lê (o critério de neg_ler_negocios); 0 para quem nunca gravou
  SELECT coalesce(jsonb_object_agg(n.id::text, coalesce(v.versao, 0)), '{}'::jsonb)
  FROM public.negocios n
  LEFT JOIN public.negocio_versoes v ON v.negocio_id = n.id
  WHERE p_org IS NOT NULL AND n.organization_id = p_org AND n.deleted_at IS NULL
    AND n.id IN (SELECT public.fn_neg_ids_legiveis())
$function$;
REVOKE ALL ON FUNCTION public.neg_versoes(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_versoes(uuid) TO authenticated;
COMMENT ON FUNCTION public.neg_versoes(uuid) IS 'Negócio: {id: versão} dos negócios que o utilizador lê; o ecrã manda a versão lida em neg_guardar_negocio (versao_lida). 20270125020000.';

-- ---------------------------------------------------------------- 3. conferir e subir a versão (interna)
CREATE OR REPLACE FUNCTION public.fn_neg_versao_conferir(p_negocio_id uuid, p_linhas jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v bigint; v_lida bigint;
BEGIN
  SELECT n.organization_id INTO v_org FROM negocios n WHERE n.id = p_negocio_id;
  IF v_org IS NULL THEN RETURN NULL; END IF; -- quem chama já recusou o negócio que não existe
  INSERT INTO negocio_versoes (negocio_id, organization_id) VALUES (p_negocio_id, v_org) ON CONFLICT (negocio_id) DO NOTHING;
  -- o trinco: fica até ao fim da transação de neg_guardar_negocio
  SELECT x.versao INTO v FROM negocio_versoes x WHERE x.negocio_id = p_negocio_id FOR UPDATE;
  IF jsonb_typeof(p_linhas->'versao_lida') = 'number' THEN
    v_lida := (p_linhas->>'versao_lida')::bigint;
    IF v_lida IS DISTINCT FROM v THEN
      RAISE EXCEPTION 'Este negócio foi alterado noutro lado depois de o abrir: volte a ler o negócio e faça a alteração outra vez.'
        USING ERRCODE = 'NE015', DETAIL = format('versão na base %s, versão lida %s', v, v_lida);
    END IF;
  END IF;
  UPDATE negocio_versoes SET versao = v + 1, gravado_em = now(), gravado_por = auth.uid() WHERE negocio_id = p_negocio_id;
  RETURN v + 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_versao_conferir(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_versao_conferir(uuid, jsonb) TO service_role;
COMMENT ON FUNCTION public.fn_neg_versao_conferir(uuid, jsonb) IS 'Negócio: tranca e sobe a versão; com p_linhas.versao_lida diferente da base, NE015. Chamada por neg_guardar_negocio. 20270125020000.';

-- ---------------------------------------------------------------- uma substituição exata (o texto antigo tem de aparecer uma só vez)
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva de neg_guardar_negocio; a função mudou desde 20270117960000. Rever antes de aplicar 20270125020000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 4. neg_guardar_negocio
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'  IF NOT public.fn_neg_no_ambito(v_neg, ''pessoas.edit'') THEN\n'
               || E'    RAISE EXCEPTION ''Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.'' USING ERRCODE = ''CT001'';\n'
               || E'  END IF;\n';
BEGIN
  IF position('20270125020000' IN d) > 0 THEN
    RAISE NOTICE 'neg_guardar_negocio já tem o bloco 20270125020000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, v_antes,
       v_antes
    || E'  -- 20270125020000 início (auditoria 19/11): a versão que o ecrã leu (p_linhas.versao_lida, de neg_versoes). Outra gravação depois\n'
    || E'  --   dessa leitura: NE015 e nada se grava. Sem versao_lida (os chamadores antigos), grava como antes. Tranca a versão até ao fim\n'
    || E'  --   (duas gravações do mesmo negócio já não se cruzam) e sobe-a; o negócio relê-se já com o trinco.\n'
    || E'  PERFORM public.fn_neg_versao_conferir(p_negocio_id, p_linhas);\n'
    || E'  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;\n'
    || E'  -- 20270125020000 fim\n', 'versão');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE v_def text := pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure);
BEGIN
  IF position('fn_neg_versao_conferir(p_negocio_id, p_linhas)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_negocio ficou sem o bloco 20270125020000';
  END IF;
  IF position('20270117830000' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_negocio perdeu os blocos de 20270117830000';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_negocio deixou de ser SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_guardar_negocio(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: os privilégios de neg_guardar_negocio mudaram';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_versao_conferir(uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.neg_versoes(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.neg_versoes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: os privilégios das funções da versão não ficaram certos';
  END IF;
  IF has_table_privilege('authenticated', 'public.negocio_versoes', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'CONFERIR: negocio_versoes ficou com privilégios diretos para authenticated';
  END IF;
END $c$;

NOTIFY pgrst, 'reload schema';

-- Reversão (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '  -- 20270125020000 início.*?  -- 20270125020000 fim\n', '');
--   EXECUTE d;
-- END $r$;
-- DROP FUNCTION public.fn_neg_versao_conferir(uuid, jsonb); DROP FUNCTION public.neg_versoes(uuid); DROP TABLE public.negocio_versoes;

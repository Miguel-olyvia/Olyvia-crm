-- ============================================================
-- 20270125500000 obra_ler_negocios_desde
-- ============================================================
-- Auditoria de 19/11/2026, lote 3: as leituras pesadas de 20 em 20 segundos.
--
-- Desde 19/11 (commits 3fd9e2d1 e 7ff66e67) a página dos negócios relê as obras de 20 em 20 segundos, para o Hoje do técnico e o Estúdio
-- da obra ficarem ligados. Relia-as todas por obra_ler_negocios: todas as obras da organização, com o estado_emylia inteiro, incluindo as
-- concluídas e as canceladas, em cada separador aberto em /negocios.
--
-- O que muda:
--   1. obra_ler_negocios_desde(p_org, p_desde) (nova): a mesma leitura que obra_ler_negocios (as mesmas permissões, o mesmo âmbito, a
--      leitura reduzida do técnico, os custos e o €/h tirados a quem não os vê), feita por troca de texto sobre a definição VIVA de
--      obra_ler_negocios. Muda só:
--        - com p_desde, só as obras com atualizada_em >= p_desde (todas as que mudaram, também as que acabaram de fechar);
--        - sem p_desde (null), todas, como obra_ler_negocios;
--        - devolve {"agora": now(), "obras": [...]} em vez da lista: «agora» é a hora do servidor a que se leu, para a próxima leitura.
--      O ecrã lê tudo uma vez e depois só o que mudou desde «agora» menos 2 minutos (cobre as gravações a meio). obra_guardar_negocio já
--      põe atualizada_em = now() sempre que muda o estado_emylia (todas as versões desde 20261231999000).
--   2. Um índice em ops_obra (organization_id, atualizada_em) para a leitura do que mudou.
-- obra_ler_negocios fica igual (o abrir da página e o gravar continuam a usá-la). Sem a função nova, o ecrã relê como antes.
-- Permissões: SECURITY DEFINER e search_path iguais aos de obra_ler_negocios; EXECUTE só para authenticated e service_role.
--
-- Reversão (só como migration nova): DROP FUNCTION public.obra_ler_negocios_desde(uuid, timestamp with time zone);
-- DROP INDEX public.ops_obra_org_atualizada_idx. O ecrã volta sozinho à leitura completa.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF position('20270112150000' IN pg_get_functiondef('public.obra_ler_negocios(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'obra_ler_negocios não é a de 20270112150000: rever antes de aplicar 20270125500000.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'ops_obra' AND column_name = 'atualizada_em') THEN
    RAISE EXCEPTION 'ops_obra sem atualizada_em: rever antes de aplicar 20270125500000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- uma substituição exata (o texto antigo tem de aparecer n vezes)
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_vezes int, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> p_vezes THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente % vez(es) na definição viva; a função mudou. Rever antes de aplicar 20270125500000.', p_onde, p_vezes;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 1. obra_ler_negocios_desde
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.obra_ler_negocios(uuid)'::regprocedure), chr(13) || chr(10), chr(10));
  v_filtro text := E'\n      AND (p_desde IS NULL OR o.atualizada_em >= p_desde) /* 20270125500000 */';
BEGIN
  -- o nome e o parâmetro novo
  d := pg_temp.trocar(d, 'FUNCTION public.obra_ler_negocios(p_org uuid)',
                         'FUNCTION public.obra_ler_negocios_desde(p_org uuid, p_desde timestamp with time zone)', 1, 'nome');
  -- a leitura reduzida do técnico: só o que mudou
  d := pg_temp.trocar(d, 'AND n.id = ANY (v_ids))', 'AND n.id = ANY (v_ids)' || v_filtro || ')', 1, 'filtro do técnico');
  -- a leitura completa: só o que mudou
  d := pg_temp.trocar(d, E'WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL\n      AND (v_tudo OR',
                         E'WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL' || v_filtro || E'\n      AND (v_tudo OR', 1, 'filtro completo');
  -- devolve a hora do servidor com as obras (nas duas leituras)
  d := pg_temp.trocar(d, 'RETURN coalesce((', 'RETURN jsonb_build_object(''agora'', now(), ''obras'', coalesce((', 2, 'agora (início)');
  d := pg_temp.trocar(d, '''[]''::jsonb);', '''[]''::jsonb)); -- 20270125500000: {agora, obras}', 2, 'agora (fim)');
  EXECUTE d;
END $m$;

COMMENT ON FUNCTION public.obra_ler_negocios_desde(uuid, timestamp with time zone) IS 'Negócio da Emylia: as obras como obra_ler_negocios, só as mudadas desde p_desde (atualizada_em; null: todas), com a hora do servidor: {agora, obras}. Para a releitura periódica da página dos negócios. 20270125500000.';
REVOKE ALL ON FUNCTION public.obra_ler_negocios_desde(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obra_ler_negocios_desde(uuid, timestamp with time zone) TO authenticated, service_role;

-- ---------------------------------------------------------------- 2. o índice da leitura do que mudou
CREATE INDEX IF NOT EXISTS ops_obra_org_atualizada_idx ON public.ops_obra USING btree (organization_id, atualizada_em);

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE d text := pg_get_functiondef('public.obra_ler_negocios_desde(uuid,timestamp with time zone)'::regprocedure);
BEGIN
  IF (length(d) - length(replace(d, '20270125500000', ''))) / length('20270125500000') < 4 THEN
    RAISE EXCEPTION 'CONFERIR: obra_ler_negocios_desde sem os filtros e o «agora» de 20270125500000';
  END IF;
  IF position('fn_cat_exigir(p_org, ''pessoas.view'')' IN d) = 0 OR position('fn_neg_so_execucao' IN d) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: obra_ler_negocios_desde perdeu as permissões de obra_ler_negocios';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.obra_ler_negocios_desde(uuid,timestamp with time zone)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: obra_ler_negocios_desde não é SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.obra_ler_negocios_desde(uuid,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: obra_ler_negocios_desde ficou aberta a anon';
  END IF;
  IF position('20270125500000' IN pg_get_functiondef('public.obra_ler_negocios(uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'CONFERIR: obra_ler_negocios mudou (não devia)';
  END IF;
END $c$;

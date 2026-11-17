-- 17/11: o ecrã das margens (e quem só precisa da margem mínima e da margem alvo) chamava cat_ler_catalogo, que na Mudelar devolve
-- 32,3 MB (os 29 785 produtos, os 58 893 preços e os fornecedores) para ler uma só linha de cat_parametros.
-- Função NOVA cat_ler_parametros_catalogo(p_org): devolve exatamente o que cat_ler_catalogo(p_org) -> 'parametros' devolve
-- (meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo), com as MESMAS verificações de
-- permissão (v_tec; CT001 sem services.view, sem pessoas.view e sem negocios.*) e o mesmo corte: o técnico recebe JSON null.
-- Sem produtos, serviços nem as outras chaves. v_mat e v_ret não entram: não afetam 'parametros'.
-- Forma: onde cat_ler_catalogo dá a chave 'parametros' com JSON null (técnico, ou organização sem linha em cat_parametros), esta
-- devolve o jsonb 'null' (não SQL NULL), o mesmo valor que `cat_ler_catalogo(p_org) -> 'parametros'`.
-- cat_ler_catalogo NÃO muda. O código que passa a chamar esta função entra no mesmo envio: sem ele, esta migration não muda nada no ecrã.
-- Parte da definição viva de cat_ler_catalogo (pg_get_functiondef, md5 abaixo, 17/11/2026).
DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.cat_ler_catalogo(uuid)'::regprocedure)) <> '9bab4c913eab4db4e61f5088be681052' THEN
    RAISE EXCEPTION 'cat_ler_catalogo mudou desde a leitura (md5): rever cat_ler_parametros_catalogo antes de aplicar';
  END IF;
  IF to_regprocedure('public.cat_ler_parametros_catalogo(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'cat_ler_parametros_catalogo(uuid) já existe na base: rever antes de aplicar';
  END IF;
END $g$;

CREATE FUNCTION public.cat_ler_parametros_catalogo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tec boolean;
BEGIN
  -- as permissões e o corte são os de cat_ler_catalogo (20270111100000 e 20270113100000), sem mudança
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap
                 WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN
    PERFORM public.fn_cat_exigir(p_org, 'services.view');
  END IF;
  IF v_tec THEN
    RETURN 'null'::jsonb;
  END IF;
  RETURN coalesce((SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x), 'null'::jsonb);
END $function$;

COMMENT ON FUNCTION public.cat_ler_parametros_catalogo(uuid) IS
  'O que cat_ler_catalogo(p_org) -> ''parametros'' devolve (margens mínima e alvo e os outros parâmetros), com as mesmas permissões e cortes, sem o resto do catálogo (20270121300000).';

REVOKE ALL ON FUNCTION public.cat_ler_parametros_catalogo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_parametros_catalogo(uuid) TO authenticated, service_role;

DO $c$
BEGIN
  IF has_function_privilege('anon', 'public.cat_ler_parametros_catalogo(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cat_ler_parametros_catalogo: anon não pode ter EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.cat_ler_parametros_catalogo(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cat_ler_parametros_catalogo: authenticated tem de ter EXECUTE';
  END IF;
END $c$;

-- ============================================================
-- 20270108520000_versao_nova_orcamento_sem_decidir
-- ============================================================
-- Só permissões (P2 da auditoria de 05/11/2026, ponto P4 do grupo A).
-- Criar uma versão nova do orçamento (negocios.orcamento.editar) falhava sem negocios.proposta.decidir.
-- Causa: fn_neg_marcas_decisao_principal punha "aceite_antes": null (JSON null) em cada versão; numa versão nova a
-- fotografia de antes não tem a chave (SQL NULL) e neg_guardar_negocio comparava JSON null com SQL NULL com
-- IS DISTINCT FROM -> verdadeiro -> tratava-a como «decisão do cliente».
-- Correção: as chaves com valor nulo deixam de entrar no objeto de cada versão (jsonb_strip_nulls). Ausente e nulo
-- passam a ser a mesma coisa nas duas fotografias. Uma data «aceite antes» posta, mudada ou tirada continua a ser
-- diferente (valor vs NULL), e as passagens de estado para/de aceite/rejeitado/recusado também: a decisão principal
-- continua a exigir negocios.proposta.decidir. Só neg_guardar_negocio usa esta função.
-- Parte da definição VIVA (pg_get_functiondef); se mudou entretanto, a migração pára sem mexer.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.fn_neg_marcas_decisao_principal(uuid)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '2c19014235ac4869ce5b644110f09854' THEN
    RAISE EXCEPTION 'fn_neg_marcas_decisao_principal mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_marcas_decisao_principal(p_negocio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270108520000: jsonb_strip_nulls em cada versão (nulo = ausente), para uma versão nova não parecer uma decisão.
  SELECT jsonb_build_object(
    'versoes', coalesce((SELECT jsonb_object_agg('v' || q.versao, jsonb_strip_nulls(jsonb_build_object(
                   'estado', q.estado, 'aceite_antes', to_jsonb(date_trunc('milliseconds', q.aceite_antes_em)))))
                 FROM quotes q
                 WHERE q.negocio_id = p_negocio AND q.adenda_id IS NULL AND q.fluxo_emylia AND q.deleted_at IS NULL), '{}'::jsonb),
    'propostas', coalesce((SELECT jsonb_object_agg(p.id::text, p.status)
                   FROM proposals p WHERE p.negocio_id = p_negocio AND coalesce(p.is_deleted, false) = false), '{}'::jsonb))
$function$;

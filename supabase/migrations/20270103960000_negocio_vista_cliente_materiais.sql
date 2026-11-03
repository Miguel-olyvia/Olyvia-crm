-- Negócio (2/11/2026): a vista do cliente não perde o estado dos materiais.
--
-- A vista leva o resumo da encomenda de cliente calculado no CRM (chave 'ec'). A ficha do negócio em Pessoas também grava a vista,
-- mas lá as encomendas da base podem não estar carregadas: a vista chegava sem 'ec' e o portal voltava a dizer só «encomendados».
-- Agora, se a vista nova não traz 'ec' e a gravada traz, para a mesma encomenda (d.obra.ec.ref igual), fica a 'ec' gravada.
-- Só muda neg_vista_cliente_guardar (20270103800000); o resto fica igual.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.neg_vista_cliente_guardar(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta a 20270103800000.';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.neg_vista_cliente_guardar(p_org uuid, p_negocio_id uuid, p_vista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marca text;
  v_n     integer;
  v_velha jsonb;
BEGIN
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF p_vista IS NULL OR jsonb_typeof(p_vista) IS DISTINCT FROM 'object' OR jsonb_typeof(p_vista -> 'd') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente tem de ter o negócio (d).' USING ERRCODE = 'NE006';
  END IF;
  -- sem o estado dos materiais (quem gravou não tinha as encomendas carregadas): fica o da vista gravada, se for a mesma encomenda
  IF NOT (p_vista ? 'ec') THEN
    SELECT x.vista INTO v_velha FROM public.negocio_vista_cliente x WHERE x.negocio_id = p_negocio_id AND x.organization_id = p_org;
    IF v_velha ? 'ec' AND (v_velha #>> '{d,obra,ec,ref}') IS NOT NULL AND (v_velha #>> '{d,obra,ec,ref}') = (p_vista #>> '{d,obra,ec,ref}') THEN
      p_vista := p_vista || jsonb_build_object('ec', v_velha -> 'ec');
    END IF;
  END IF;
  IF octet_length(p_vista::text) > 6 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente passa de 6 MB.' USING ERRCODE = 'NE006';
  END IF;
  v_marca := md5(p_vista::text);
  INSERT INTO public.negocio_vista_cliente AS x (negocio_id, organization_id, vista, marca, atualizada_em, atualizada_por)
  VALUES (p_negocio_id, p_org, p_vista, v_marca, now(), public.current_business_user_id())
  ON CONFLICT (negocio_id) DO UPDATE
     SET vista = EXCLUDED.vista, marca = EXCLUDED.marca, atualizada_em = now(), atualizada_por = EXCLUDED.atualizada_por
   WHERE x.marca IS DISTINCT FROM EXCLUDED.marca AND x.organization_id = EXCLUDED.organization_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('gravada', v_n > 0, 'marca', v_marca);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_vista_cliente_guardar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_vista_cliente_guardar(uuid, uuid, jsonb) TO authenticated;

-- Registo: fix da regressao do soft_delete_business_entity (aceita actor de confianca so via service_role).

CREATE OR REPLACE FUNCTION public.soft_delete_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_actor uuid := public.resolve_business_user_id(auth.uid());
BEGIN
  IF v_auth IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._soft_delete_business_entity_impl(p_kind, p_id, v_actor, v_auth);
END;
$function$
;

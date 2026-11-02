-- ============================================================
-- 20270103110000_cp_zona_aproximada
-- ============================================================
-- O que faz: fn_postal_code_coords passa a dar uma zona aproximada quando o
--   CP não está na cache postal_codes: CP7 exato ('cp7') → média do CP4
--   ('cp4') → NOVO média dos CP com os mesmos 3 primeiros dígitos ('cp3') →
--   NOVO com os mesmos 2 ('cp2'). Sem estrutura nova; permissões iguais
--   (CREATE OR REPLACE mantém o ACL: só postgres e service_role).
-- Base: pg_get_functiondef vivo da BD RH (20270103100000).
-- Reversão (só como migration nova): repor a versão de 20270103100000.
-- ============================================================
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_postal_code_coords(p_postal_code text)
 RETURNS TABLE(lat numeric, lon numeric, cp_used text, cp_precision text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cp  text := public.fn_normalize_pt_postal_code(p_postal_code);
  v_cp4 text;
  v_cp3 text;
  v_lat numeric;
  v_lon numeric;
BEGIN
  IF v_cp IS NULL THEN
    RETURN;
  END IF;
  v_cp4 := split_part(v_cp, '-', 1);
  v_cp3 := nullif(split_part(v_cp, '-', 2), '');

  IF v_cp3 IS NOT NULL THEN
    SELECT pc.latitude, pc.longitude
      INTO v_lat, v_lon
    FROM public.postal_codes pc
    WHERE pc.postal_code = v_cp4
      AND pc.postal_code_extension = v_cp3
      AND pc.latitude IS NOT NULL
      AND pc.longitude IS NOT NULL
      AND pc.is_active IS NOT FALSE
    ORDER BY pc.id
    LIMIT 1;

    IF v_lat IS NOT NULL THEN
      RETURN QUERY SELECT v_lat, v_lon, v_cp, 'cp7'::text;
      RETURN;
    END IF;
  END IF;

  SELECT avg(pc.latitude), avg(pc.longitude)
    INTO v_lat, v_lon
  FROM public.postal_codes pc
  WHERE pc.postal_code = v_cp4
    AND pc.latitude IS NOT NULL
    AND pc.longitude IS NOT NULL
    AND pc.is_active IS NOT FALSE;

  IF v_lat IS NOT NULL THEN
    RETURN QUERY SELECT v_lat, v_lon, v_cp, 'cp4'::text;
    RETURN;
  END IF;

  -- NOVO (zona aproximada): CP4 fora da cache → média dos CP da cache com os
  -- mesmos 3 primeiros dígitos ('cp3'); senão com os mesmos 2 ('cp2').
  SELECT avg(pc.latitude), avg(pc.longitude)
    INTO v_lat, v_lon
  FROM public.postal_codes pc
  WHERE left(pc.postal_code, 3) = left(v_cp4, 3)
    AND pc.latitude IS NOT NULL
    AND pc.longitude IS NOT NULL
    AND pc.is_active IS NOT FALSE;

  IF v_lat IS NOT NULL THEN
    RETURN QUERY SELECT v_lat, v_lon, v_cp, 'cp3'::text;
    RETURN;
  END IF;

  SELECT avg(pc.latitude), avg(pc.longitude)
    INTO v_lat, v_lon
  FROM public.postal_codes pc
  WHERE left(pc.postal_code, 2) = left(v_cp4, 2)
    AND pc.latitude IS NOT NULL
    AND pc.longitude IS NOT NULL
    AND pc.is_active IS NOT FALSE;

  IF v_lat IS NOT NULL THEN
    RETURN QUERY SELECT v_lat, v_lon, v_cp, 'cp2'::text;
  END IF;
END;
$function$
;

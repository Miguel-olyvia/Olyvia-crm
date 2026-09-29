-- Regra 4: quando um distrito não tem nenhum comercial activo a cobri-lo,
-- find_nearest_resources devia devolver vazio (nenhum comercial disponível
-- nessa zona) -- hoje devolve TODOS os recursos da organização, por causa
-- de "OR NOT v_district_has_coverage" no filtro. Confirmado ao vivo na nike
-- antes desta migration: pedir o distrito Bragança (sem nenhum
-- resource_districts activo) devolvia os mesmos 2 recursos que pedir sem
-- filtro nenhum, enquanto Lisboa (com cobertura) filtrava correctamente
-- para 1.
--
-- Mesma assinatura (7 parâmetros) -- CREATE OR REPLACE chega, sem DROP.
CREATE OR REPLACE FUNCTION public.find_nearest_resources(
  p_board_id uuid,
  p_target_postal_code text DEFAULT NULL::text,
  p_target_date date DEFAULT NULL::date,
  p_duration_minutes integer DEFAULT 60,
  p_limit integer DEFAULT 10,
  p_district_id uuid DEFAULT NULL::uuid,
  p_min_advance_hours integer DEFAULT NULL::integer
)
RETURNS TABLE(resource_id uuid, resource_name text, resource_type text, distance_km numeric, available_slots jsonb, priority integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_lat decimal;
  v_target_lng decimal;
  v_target_prefix varchar(4);
  v_board_org_id uuid;
  v_has_postal boolean;
BEGIN
  IF p_target_date IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO v_board_org_id
  FROM schedule_boards
  WHERE id = p_board_id
  LIMIT 1;

  v_has_postal := p_target_postal_code IS NOT NULL AND p_target_postal_code != '';

  IF v_has_postal THEN
    v_target_prefix := LEFT(REPLACE(p_target_postal_code, '-', ''), 4);

    SELECT AVG(latitude), AVG(longitude) INTO v_target_lat, v_target_lng
    FROM postal_codes
    WHERE postal_code = v_target_prefix
      AND latitude IS NOT NULL;

    IF v_target_lat IS NULL THEN
      SELECT AVG(latitude), AVG(longitude) INTO v_target_lat, v_target_lng
      FROM postal_codes
      WHERE LEFT(postal_code, 2) = LEFT(v_target_prefix, 2)
        AND latitude IS NOT NULL;
    END IF;

    IF v_target_lat IS NULL THEN
      v_has_postal := false;
    END IF;
  END IF;

  RETURN QUERY
  WITH resource_best_distance AS (
    SELECT
      sr.id as res_id,
      sr.name as res_name,
      sr.resource_type as res_type,
      CASE
        WHEN v_has_postal AND sr.latitude IS NOT NULL AND sr.longitude IS NOT NULL THEN
          calculate_distance_km(v_target_lat, v_target_lng, sr.latitude, sr.longitude)
        ELSE NULL
      END as dist_km,
      1 as res_priority
    FROM schedule_resources sr
    WHERE sr.organization_id = v_board_org_id
      AND sr.is_active = true
      AND (
        p_district_id IS NULL
        OR sr.id IN (
          SELECT rd.resource_id FROM resource_districts rd
          WHERE rd.district_id = p_district_id AND rd.is_active = true
        )
      )
  ),
  resource_availability AS (
    SELECT
      rd.res_id,
      rd.res_name,
      rd.res_type,
      rd.dist_km,
      rd.res_priority,
      (
        SELECT jsonb_agg(jsonb_build_object('start', slot_start, 'end', slot_end))
        FROM get_resource_available_slots(rd.res_id, p_target_date, p_duration_minutes, v_board_org_id, p_min_advance_hours)
      ) as slots
    FROM resource_best_distance rd
  )
  SELECT
    ra.res_id,
    ra.res_name,
    ra.res_type,
    ra.dist_km,
    COALESCE(ra.slots, '[]'::jsonb) as available_slots,
    ra.res_priority
  FROM resource_availability ra
  WHERE ra.slots IS NOT NULL AND jsonb_array_length(ra.slots) > 0
  ORDER BY ra.res_priority DESC, ra.dist_km ASC NULLS LAST, jsonb_array_length(ra.slots) DESC
  LIMIT p_limit;
END;
$function$;

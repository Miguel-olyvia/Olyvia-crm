-- Regras 4/5: escolher o comercial mais perto exigia distância real
-- (dist_km em find_nearest_resources), mas essa distância só era calculada
-- a partir de resource_service_areas -- mecanismo antigo, sem nenhum ecrã a
-- preenchê-lo hoje (ver ResourceServiceAreas.tsx, que já escreve tudo em
-- resource_districts). Confirmado ao vivo (23/09): o recurso activo da nike
-- não tem nenhuma linha em resource_service_areas, por isso dist_km fica
-- sempre nulo e a escolha do comercial cai só no filtro binário de distrito.
--
-- Dá-se ao recurso uma localização própria e directa (código postal +
-- coordenadas, geocodificadas via a API Olyvia de códigos postais), em vez
-- de reviver o mecanismo antigo. resource_service_areas fica intocada no
-- esquema, mas deixa de alimentar esta função.
ALTER TABLE public.schedule_resources
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

COMMENT ON COLUMN public.schedule_resources.postal_code IS
  'Código postal completo (CP7, "XXXX-XXX") da morada-base do recurso -- usado para calcular a distância real ao cliente nas regras 4/5. Geocodificado via a API Olyvia (fidelidadeapi.quickflowai.com/Olyvia/postcodes).';
COMMENT ON COLUMN public.schedule_resources.latitude IS
  'Latitude resolvida a partir de postal_code. Nula até o código postal ser preenchido e geocodificado.';
COMMENT ON COLUMN public.schedule_resources.longitude IS
  'Longitude resolvida a partir de postal_code. Nula até o código postal ser preenchido e geocodificado.';

-- Substitui a fonte de dist_km: em vez de resource_service_areas (órfão,
-- sem UI), usa directamente sr.latitude/sr.longitude. Resto da função
-- inalterado -- mesmo filtro de distrito, mesma disponibilidade, mesma
-- ordenação. Assinatura e colunas devolvidas mantêm-se idênticas (chamada
-- por book-slot/index.ts sem mudanças).
CREATE OR REPLACE FUNCTION public.find_nearest_resources(
  p_board_id uuid,
  p_target_postal_code text DEFAULT NULL::text,
  p_target_date date DEFAULT NULL::date,
  p_duration_minutes integer DEFAULT 60,
  p_limit integer DEFAULT 10,
  p_district_id uuid DEFAULT NULL::uuid
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
  v_district_has_coverage boolean;
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

  v_district_has_coverage := false;
  IF p_district_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM resource_districts rd
      JOIN schedule_resources sr ON sr.id = rd.resource_id
      WHERE rd.district_id = p_district_id
        AND rd.is_active = true
        AND sr.organization_id = v_board_org_id
        AND sr.is_active = true
    ) INTO v_district_has_coverage;
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
        OR NOT v_district_has_coverage
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
        FROM get_resource_available_slots(rd.res_id, p_target_date, p_duration_minutes, v_board_org_id)
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

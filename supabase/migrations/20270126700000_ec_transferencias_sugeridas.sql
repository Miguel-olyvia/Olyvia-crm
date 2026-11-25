-- Transferências sugeridas para as Encomendas de Cliente (EC) — 25/11/2026.
--
-- Regra (decisão do utilizador):
--  * O armazém "da casa" da EC é o mais próximo da morada da EC (mesma ordem do motor:
--    distância, armazém por omissão, nome). Sem coordenadas nem armazém por omissão -> sem sugestão.
--  * Quando o motor (fn_client_order_line_reservations_wh) reserva stock dessa EC noutro armazém
--    (o Porto serve tudo ou parte), sugere-se transferir esse stock para o armazém da casa.
--  * Só se sugere o que falta: desconta-se o stock livre que o armazém da casa já tem para o produto
--    (stock - o que o motor lá reservou para todas as EC), pela ordem das EC (FIFO).
--  * Só sugestão: a transferência continua manual (rpc_register_stock_transfer pelo diálogo).
--    Depois de transferir, o motor passa a reservar no armazém da casa e a sugestão desaparece.
-- Só leitura de dados (VOLATILE só pela tabela temporária de trabalho), sem tabelas/colunas novas. Exige inventory.view na organização.

CREATE OR REPLACE FUNCTION public.rpc_ec_transfer_suggestions(p_organization_id uuid)
 RETURNS TABLE(
   contract_id uuid, order_number text, client_name text,
   product_id uuid, product_name text, product_sku text,
   from_warehouse_id uuid, from_warehouse_name text,
   to_warehouse_id uuid, to_warehouse_name text,
   qty numeric, distance_km numeric)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_free  jsonb := '{}'::jsonb;   -- "<armazém><produto>" -> livre ainda por usar
  v_home  uuid;
  v_hname text;
  v_hdist numeric;
  v_lat   numeric;
  v_lon   numeric;
  v_key   text;
  v_f     numeric;
  v_take  numeric;
  c       record;
  r       record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT COALESCE(public.has_anew_permission_for_org(v_uid, 'inventory.view', p_organization_id), false) THEN
    RAISE EXCEPTION 'Sem permissão para ver o inventário desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resultado do motor uma só vez.
  CREATE TEMP TABLE IF NOT EXISTS _ects_lines (
    contract_id uuid, product_id uuid, seq bigint, alloc jsonb
  ) ON COMMIT DROP;
  TRUNCATE _ects_lines;
  INSERT INTO _ects_lines
  SELECT l.contract_id, l.product_id, l.seq, l.warehouse_alloc
  FROM public.fn_client_order_line_reservations_wh(p_organization_id, NULL) l
  WHERE NOT l.is_served AND l.qty_reserved > 0;

  -- Livre por armazém/produto = stock - o que o motor reservou lá (todas as EC).
  SELECT COALESCE(jsonb_object_agg(k, q), '{}'::jsonb) INTO v_free
  FROM (
    SELECT s.warehouse_id::text || s.product_id::text AS k,
           SUM(s.quantity) - COALESCE((
             SELECT SUM((e ->> 'qty')::numeric)
             FROM _ects_lines l2
             CROSS JOIN LATERAL jsonb_array_elements(l2.alloc) e
             WHERE (e ->> 'warehouse_id')::uuid = s.warehouse_id
               AND l2.product_id = s.product_id), 0) AS q
    FROM public.stocks s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.product_id IN (SELECT l3.product_id FROM _ects_lines l3)
    GROUP BY s.warehouse_id, s.product_id
  ) f;

  -- EC por ordem de fila (FIFO).
  FOR c IN
    SELECT l.contract_id AS cid, MIN(l.seq) AS s
    FROM _ects_lines l
    GROUP BY l.contract_id
    ORDER BY 2, 1
  LOOP
    v_lat := NULL; v_lon := NULL;
    SELECT co.lat, co.lon INTO v_lat, v_lon FROM public.fn_client_order_coords(c.cid) co LIMIT 1;

    v_home := NULL; v_hname := NULL; v_hdist := NULL;
    SELECT w.warehouse_id, w.warehouse_name,
           CASE WHEN v_lat IS NOT NULL AND w.lat IS NOT NULL
                THEN round(public.calculate_distance_km(v_lat, v_lon, w.lat, w.lon), 1) END
      INTO v_home, v_hname, v_hdist
    FROM public.fn_client_order_warehouses(p_organization_id) w
    WHERE (v_lat IS NOT NULL AND w.lat IS NOT NULL) OR w.is_default
    ORDER BY CASE WHEN v_lat IS NOT NULL AND w.lat IS NOT NULL
                  THEN public.calculate_distance_km(v_lat, v_lon, w.lat, w.lon) END NULLS LAST,
             w.is_default DESC, w.sort_order
    LIMIT 1;
    CONTINUE WHEN v_home IS NULL;

    -- Reservado desta EC fora do armazém da casa, por produto e origem.
    FOR r IN
      SELECT l.product_id AS pid, (e ->> 'warehouse_id')::uuid AS wid, e ->> 'warehouse_name' AS wname,
             SUM((e ->> 'qty')::numeric) AS q
      FROM _ects_lines l
      CROSS JOIN LATERAL jsonb_array_elements(l.alloc) e
      WHERE l.contract_id = c.cid
        AND (e ->> 'warehouse_id')::uuid IS DISTINCT FROM v_home
      GROUP BY 1, 2, 3
      ORDER BY 1, 4 DESC, 2
    LOOP
      -- O que o armazém da casa já tem livre não precisa de vir.
      v_key := v_home::text || r.pid::text;
      v_f := GREATEST(COALESCE((v_free ->> v_key)::numeric, 0), 0);
      v_take := GREATEST(r.q - v_f, 0);
      v_free := v_free || jsonb_build_object(v_key, GREATEST(v_f - r.q, 0));
      CONTINUE WHEN v_take <= 0;

      contract_id := c.cid;
      SELECT cc.order_number,
             COALESCE(NULLIF(btrim(en.display_name), ''), NULLIF(btrim(en.fiscal_name), ''),
                      NULLIF(btrim(concat_ws(' ', en.first_name, en.last_name)), ''))
        INTO order_number, client_name
      FROM public.client_contracts cc
      LEFT JOIN public.anew_entities en ON en.id = cc.entity_id
      WHERE cc.id = c.cid;
      product_id := r.pid;
      SELECT p.name, p.sku INTO product_name, product_sku FROM public.products p WHERE p.id = r.pid;
      from_warehouse_id := r.wid;
      from_warehouse_name := r.wname;
      to_warehouse_id := v_home;
      to_warehouse_name := v_hname;
      qty := v_take;
      distance_km := v_hdist;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_ec_transfer_suggestions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ec_transfer_suggestions(uuid) TO authenticated, service_role;

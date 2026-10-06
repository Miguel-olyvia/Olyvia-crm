-- ============================================================
--  Operações — distância ao armazém, encomendas na data certa e
--  dados em falta que pioram o plano
-- ============================================================
--  Correr DEPOIS de: obras.sql. Idempotente (pode correr-se outra vez).
--
--  1. Distância ao armazém, SEM serviço externo: o CRM já tem `postal_codes`
--     com coordenadas (863 códigos a 06/10/2026). A morada procura-se pelo
--     código postal completo (CP7); sem ele, pela média do CP4 (85 % das
--     moradas do CRM); sem esse, pela do CP2 (99 %). A distância é em linha
--     reta × 1,3 (fator de estrada) — boa para logística, não para GPS. O
--     armazém é o mais próximo dos `warehouses` ativos da organização.
--  2. Encomendas na data certa: para cada material em falta numa tarefa por
--     fazer (`materiais_crm`), "encomendar até" = início planeado − prazo do
--     fornecedor − 2 dias de margem. Se já há encomenda em aberto com esse
--     produto, diz quando chega. Avisa no sino (supervisor + gestores) quando
--     a data-limite está a 3 dias ou já passou — uma vez por dia (pg_cron).
--  3. Dados em falta: o que, faltando, faz o plano da obra pior (ficha do
--     local, medidas da visita, prazos dos fornecedores, ofícios sem gente…),
--     com o sítio onde se preenche.
--
--  Escreve fora de `ops_*`? Só os avisos (`notifications`, pela mesma
--  ops_obra_notificar do obras.sql, que nunca avisa clientes). Só LÊ o CRM,
--  e de forma dinâmica: instala numa base sem estas tabelas.
-- ============================================================

BEGIN;

-- ─────────────────────────── 1. Distância ───────────────────────────

-- Coordenadas aproximadas de um código postal português.
CREATE OR REPLACE FUNCTION public.ops_geo_cp(_cp text)
RETURNS TABLE (lat numeric, lng numeric, precisao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d   text := regexp_replace(COALESCE(_cp, ''), '\D', '', 'g');
  cp4 text;
  cp3 text;
BEGIN
  IF length(d) < 4
     OR NOT public.ops_obra_crm_tem('postal_codes', ARRAY['postal_code','postal_code_extension','latitude','longitude']) THEN
    RETURN;
  END IF;
  cp4 := left(d, 4);
  cp3 := nullif(substr(d, 5, 3), '');

  IF cp3 IS NOT NULL THEN
    RETURN QUERY EXECUTE
      'SELECT avg(latitude)::numeric(10,6), avg(longitude)::numeric(10,6), ''cp7''::text
         FROM public.postal_codes
        WHERE postal_code = $1 AND postal_code_extension = $2 AND latitude IS NOT NULL
       HAVING count(*) > 0'
      USING cp4, cp3;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY EXECUTE
    'SELECT avg(latitude)::numeric(10,6), avg(longitude)::numeric(10,6), ''cp4''::text
       FROM public.postal_codes
      WHERE postal_code = $1 AND latitude IS NOT NULL
     HAVING count(*) > 0'
    USING cp4;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY EXECUTE
    'SELECT avg(latitude)::numeric(10,6), avg(longitude)::numeric(10,6), ''cp2''::text
       FROM public.postal_codes
      WHERE left(postal_code, 2) = $1 AND latitude IS NOT NULL
     HAVING count(*) > 0'
    USING left(cp4, 2);
END
$$;
REVOKE ALL ON FUNCTION public.ops_geo_cp(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_geo_cp(text) TO service_role;

-- Distância em linha reta (haversine), em km.
CREATE OR REPLACE FUNCTION public.ops_geo_km(_lat1 numeric, _lng1 numeric, _lat2 numeric, _lng2 numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT (2 * 6371 * asin(sqrt(
           power(sin(radians((_lat2 - _lat1)::float8) / 2), 2)
           + cos(radians(_lat1::float8)) * cos(radians(_lat2::float8))
             * power(sin(radians((_lng2 - _lng1)::float8) / 2), 2))))::numeric
$$;
REVOKE ALL ON FUNCTION public.ops_geo_km(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_geo_km(numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- Do armazém mais próximo da organização até ao código postal. {} se não
-- se souber (sem armazém com código postal, ou código postal desconhecido).
--   km_estrada  = linha reta × 1,3
--   minutos     = a 30 km/h até 10 km (cidade), 50 km/h acima, + 5 (estacionar)
CREATE OR REPLACE FUNCTION public.ops_distancia_armazem(_org uuid, _cp text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_obra record;
  v_arm  record;
  v_best jsonb;
  v_km   numeric;
BEGIN
  SELECT * INTO v_obra FROM public.ops_geo_cp(_cp);
  IF v_obra.lat IS NULL
     OR NOT public.ops_obra_crm_tem('warehouses', ARRAY['organization_id','name','postal_code','is_active','deleted_at']) THEN
    RETURN '{}'::jsonb;
  END IF;

  FOR v_arm IN EXECUTE
    'SELECT w.name, w.postal_code FROM public.warehouses w
      WHERE w.organization_id = $1 AND w.deleted_at IS NULL AND COALESCE(w.is_active, true)
        AND nullif(btrim(w.postal_code), '''') IS NOT NULL'
    USING _org
  LOOP
    DECLARE g record;
    BEGIN
      SELECT * INTO g FROM public.ops_geo_cp(v_arm.postal_code);
      CONTINUE WHEN g.lat IS NULL;
      v_km := public.ops_geo_km(v_obra.lat, v_obra.lng, g.lat, g.lng);
      IF v_best IS NULL OR v_km < (v_best->>'km_reta')::numeric THEN
        v_best := jsonb_build_object(
          'armazem', v_arm.name, 'armazem_cp', btrim(v_arm.postal_code),
          'km_reta', round(v_km, 1),
          'precisao_obra', v_obra.precisao, 'precisao_armazem', g.precisao);
      END IF;
    END;
  END LOOP;

  IF v_best IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_km := round((v_best->>'km_reta')::numeric * 1.3, 1);
  RETURN v_best || jsonb_build_object(
    'km_estrada', v_km,
    'km_ida_volta', round(v_km * 2),
    'minutos', (round(CASE WHEN v_km <= 10 THEN v_km / 30 * 60 ELSE 20 + (v_km - 10) / 50 * 60 END) + 5)::int);
END
$$;
REVOKE ALL ON FUNCTION public.ops_distancia_armazem(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_distancia_armazem(uuid, text) TO service_role;

-- Para o CRM (sugestão da ficha do local no orçamento): quem é da
-- organização pergunta a distância de um código postal. Não revela nada
-- além do nome do armazém e de uma distância.
CREATE OR REPLACE FUNCTION public.rpc_ops_distancia_armazem(p_org uuid, p_cp text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_org IS NULL OR auth.uid() IS NULL
     OR NOT (p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN public.ops_distancia_armazem(p_org, p_cp);
END
$$;
REVOKE ALL ON FUNCTION public.rpc_ops_distancia_armazem(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_distancia_armazem(uuid, text) TO authenticated, service_role;

-- O código postal da obra: o da morada de obra do orçamento (CRM) e, sem
-- ela, o que estiver escrito na morada da obra (NNNN-NNN).
CREATE OR REPLACE FUNCTION public.ops_obra_codigo_postal(_obra uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o   record;
  v_orc uuid;
  v_cp  text;
BEGIN
  SELECT id, orcamento_id, contrato_id, morada INTO v_o FROM public.ops_obra WHERE id = _obra;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_orc := v_o.orcamento_id;
  IF v_orc IS NULL AND v_o.contrato_id IS NOT NULL THEN
    v_orc := public.ops_contrato_orcamento(v_o.contrato_id);
  END IF;
  IF v_orc IS NOT NULL
     AND public.ops_obra_crm_tem('quotes', ARRAY['id','site_address_id'])
     AND public.ops_obra_crm_tem('anew_addresses', ARRAY['id','postal_code']) THEN
    EXECUTE 'SELECT a.postal_code FROM public.quotes q JOIN public.anew_addresses a ON a.id = q.site_address_id WHERE q.id = $1'
       INTO v_cp USING v_orc;
  END IF;
  IF nullif(btrim(COALESCE(v_cp, '')), '') IS NULL THEN
    v_cp := substring(COALESCE(v_o.morada, '') FROM '\d{4}-\d{3}');
  END IF;
  RETURN nullif(btrim(COALESCE(v_cp, '')), '');
END
$$;
REVOKE ALL ON FUNCTION public.ops_obra_codigo_postal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_codigo_postal(uuid) TO service_role;

-- Para a ficha da obra: distância do armazém mais próximo. Quem vê a obra.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_distancia(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_cp  text;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_obra WHERE id = p_obra_id;
  IF v_org IS NULL OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  v_cp := public.ops_obra_codigo_postal(p_obra_id);
  IF v_cp IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN public.ops_distancia_armazem(v_org, v_cp) || jsonb_build_object('codigo_postal', v_cp);
END
$$;
REVOKE ALL ON FUNCTION public.rpc_ops_obra_distancia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_distancia(uuid) TO authenticated, service_role;


-- ─────────────────────── 2. Encomendas na data certa ───────────────────────

-- Por produto em falta numa tarefa (o mesmo critério de
-- ops_obra_material_prazo): a encomenda em aberto mais cedo e o prazo do
-- fornecedor (o preferido primeiro; senão o SLA do fornecedor).
CREATE OR REPLACE FUNCTION public.ops_obra_material_itens(_org uuid, _materiais jsonb, _desde date)
RETURNS TABLE (produto_id uuid, nome text, quantidade numeric, unidade text,
               encomenda_chega date, prazo_dias integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prod uuid[];
  v_po   text := 'SELECT NULL::uuid AS product_id, NULL::date AS d WHERE false';
  v_lt   text := 'SELECT NULL::uuid AS product_id, NULL::integer AS dias WHERE false';
BEGIN
  IF jsonb_typeof(_materiais) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;
  SELECT array_agg(DISTINCT (m->>'produto_id')::uuid) INTO v_prod
    FROM jsonb_array_elements(_materiais) m
   WHERE nullif(m->>'produto_id', '') IS NOT NULL
     AND (public.ops_num(m->>'disponivel') IS NULL
          OR public.ops_num(m->>'disponivel') < COALESCE(public.ops_num(m->>'quantidade'), 0));
  IF v_prod IS NULL THEN
    RETURN;
  END IF;

  IF public.ops_obra_crm_tem('purchase_orders', ARRAY['id','organization_id','status','deleted_at','expected_delivery'])
     AND public.ops_obra_crm_tem('purchase_order_items', ARRAY['purchase_order_id','product_id','quantity','received_quantity']) THEN
    v_po := 'SELECT poi.product_id, min(po.expected_delivery) AS d
               FROM public.purchase_orders po
               JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
              WHERE po.organization_id = $1 AND po.deleted_at IS NULL
                AND po.status IN (''pending'', ''ordered'', ''partially_received'')
                AND po.expected_delivery IS NOT NULL AND po.expected_delivery >= $3
                AND COALESCE(poi.received_quantity, 0) < poi.quantity
                AND poi.product_id = ANY ($2)
              GROUP BY poi.product_id';
  END IF;
  IF public.ops_obra_crm_tem('item_suppliers',
       ARRAY['product_id','supplier_id','lead_time_days','is_preferred','is_active','deleted_at']) THEN
    v_lt := 'SELECT DISTINCT ON (s.product_id) s.product_id,
                    COALESCE(nullif(s.lead_time_days, 0), sp.delivery_sla_days) AS dias
               FROM public.item_suppliers s '
         || CASE WHEN public.ops_obra_crm_tem('suppliers', ARRAY['id','delivery_sla_days'])
                 THEN 'LEFT JOIN public.suppliers sp ON sp.id = s.supplier_id '
                 ELSE 'LEFT JOIN (SELECT NULL::uuid AS id, NULL::integer AS delivery_sla_days) sp ON false ' END
         || 'WHERE s.deleted_at IS NULL AND COALESCE(s.is_active, true)
                AND s.product_id = ANY ($2)
                AND COALESCE(nullif(s.lead_time_days, 0), sp.delivery_sla_days) > 0
              ORDER BY s.product_id, s.is_preferred DESC NULLS LAST,
                       COALESCE(nullif(s.lead_time_days, 0), sp.delivery_sla_days)';
  END IF;

  RETURN QUERY EXECUTE format($q$
    WITH m AS (
      SELECT DISTINCT ON ((e->>'produto_id')::uuid) (e->>'produto_id')::uuid AS pid,
             COALESCE(nullif(btrim(e->>'nome'), ''), 'Material') AS nome,
             public.ops_num(e->>'quantidade') AS qt,
             nullif(btrim(e->>'unidade'), '') AS un
        FROM jsonb_array_elements($4) e
       WHERE nullif(e->>'produto_id', '') IS NOT NULL AND (e->>'produto_id')::uuid = ANY ($2)
    ),
    po AS (%s),
    lt AS (%s)
    SELECT m.pid, m.nome, m.qt, m.un, po.d, lt.dias
      FROM m LEFT JOIN po ON po.product_id = m.pid LEFT JOIN lt ON lt.product_id = m.pid $q$, v_po, v_lt)
  USING _org, v_prod, _desde, _materiais;
END
$$;
REVOKE ALL ON FUNCTION public.ops_obra_material_itens(uuid, jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_material_itens(uuid, jsonb, date) TO service_role;

-- Margem antes do início planeado (dias de calendário): o material deve
-- chegar 2 dias antes, não no próprio dia.
CREATE OR REPLACE FUNCTION public.ops_obra_encomenda_margem_dias()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;

-- Tudo o que há a encomendar nas obras planeadas/em curso de uma
-- organização (ou de uma obra), SEM filtro de quem vê (interna).
--   estado: em_atraso   — a data-limite já passou e não há encomenda
--           esta_semana — encomendar nos próximos 7 dias
--           mais_tarde  — há tempo
--           encomendado — há encomenda em aberto que chega a tempo, ou a
--                         data de chegada foi dada à mão
--           chega_tarde — há encomenda, mas chega depois do início
--           sem_prazo   — não se sabe o prazo do fornecedor (dado em falta)
CREATE OR REPLACE FUNCTION public.ops_obra_encomendas_lista(_org uuid, _obra uuid DEFAULT NULL)
RETURNS TABLE (
  obra_id uuid, obra_codigo text, obra_titulo text,
  tarefa_id uuid, tarefa_nome text, inicio_planeado date,
  produto_id uuid, produto_nome text, quantidade numeric, unidade text,
  prazo_dias integer, encomenda_chega date, encomendar_ate date,
  estado text, detalhe text, supervisor_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date AS d),
  base AS (
    SELECT o.id AS obra_id, o.codigo, o.titulo, o.supervisor_id,
           t.id AS tarefa_id, t.nome AS tarefa_nome, t.inicio_planeado,
           t.material_chega_em, t.material_chega_origem, t.materiais_crm
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra o ON o.id = t.obra_id
     WHERE t.organization_id = _org
       AND (_obra IS NULL OR t.obra_id = _obra)
       AND o.estado IN ('planeada','em_curso')
       AND t.estado = 'por_fazer'
       AND t.inicio_planeado IS NOT NULL
       AND jsonb_typeof(t.materiais_crm) = 'array' AND jsonb_array_length(t.materiais_crm) > 0
  ),
  itens AS (
    SELECT b.*, i.produto_id, i.nome AS produto_nome, i.quantidade, i.unidade,
           i.prazo_dias, i.encomenda_chega,
           CASE WHEN i.prazo_dias IS NOT NULL
                THEN b.inicio_planeado - i.prazo_dias - public.ops_obra_encomenda_margem_dias() END AS ate
      FROM base b
      CROSS JOIN LATERAL public.ops_obra_material_itens(_org, b.materiais_crm, (SELECT d FROM hoje)) i
  )
  SELECT i.obra_id, i.codigo, i.titulo, i.tarefa_id, i.tarefa_nome, i.inicio_planeado,
         i.produto_id, i.produto_nome, i.quantidade, i.unidade,
         i.prazo_dias, i.encomenda_chega, i.ate,
         x.estado,
         CASE x.estado
           WHEN 'encomendado' THEN
             CASE WHEN i.material_chega_origem = 'manual' AND i.encomenda_chega IS NULL
                  THEN 'Data de chegada dada à mão: ' || to_char(i.material_chega_em, 'DD/MM')
                  ELSE 'Encomenda em aberto chega a ' || to_char(i.encomenda_chega, 'DD/MM') END
           WHEN 'chega_tarde' THEN
             'A encomenda chega a ' || to_char(i.encomenda_chega, 'DD/MM') || ', depois do início ('
               || to_char(i.inicio_planeado, 'DD/MM') || ')'
           WHEN 'sem_prazo' THEN 'Sem prazo do fornecedor: não se sabe quando encomendar'
           WHEN 'em_atraso' THEN
             'Devia ter sido encomendado até ' || to_char(i.ate, 'DD/MM') || ' (prazo ' || i.prazo_dias || ' dias)'
           ELSE 'Encomendar até ' || to_char(i.ate, 'DD/MM') || ' (prazo ' || i.prazo_dias || ' dias, início a '
                  || to_char(i.inicio_planeado, 'DD/MM') || ')'
         END,
         i.supervisor_id
    FROM itens i
    CROSS JOIN hoje h
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN i.encomenda_chega IS NOT NULL AND i.encomenda_chega > i.inicio_planeado THEN 'chega_tarde'
        WHEN i.encomenda_chega IS NOT NULL THEN 'encomendado'
        WHEN i.material_chega_origem = 'manual' AND i.material_chega_em IS NOT NULL THEN 'encomendado'
        WHEN i.ate IS NULL THEN 'sem_prazo'
        WHEN i.ate < h.d THEN 'em_atraso'
        WHEN i.ate <= h.d + 7 THEN 'esta_semana'
        ELSE 'mais_tarde' END AS estado
    ) x
$$;
REVOKE ALL ON FUNCTION public.ops_obra_encomendas_lista(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_encomendas_lista(uuid, uuid) TO service_role;

-- Para os ecrãs ("A encomendar" e o bloco da obra). Gestor/admin: tudo;
-- os outros: as obras que veem. Pior primeiro.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_encomendas(p_org uuid, p_obra_id uuid DEFAULT NULL)
RETURNS TABLE (
  obra_id uuid, obra_codigo text, obra_titulo text,
  tarefa_id uuid, tarefa_nome text, inicio_planeado date,
  produto_id uuid, produto_nome text, quantidade numeric, unidade text,
  prazo_dias integer, encomenda_chega date, encomendar_ate date,
  estado text, detalhe text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_funcao text;
BEGIN
  SELECT q.funcao INTO v_funcao FROM public.ops_quem_sou(p_org) q;
  IF NOT public.ops_pode(p_org, 'operations.orders.view') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT e.obra_id, e.obra_codigo, e.obra_titulo, e.tarefa_id, e.tarefa_nome, e.inicio_planeado,
         e.produto_id, e.produto_nome, e.quantidade, e.unidade, e.prazo_dias,
         e.encomenda_chega, e.encomendar_ate, e.estado, e.detalhe
    FROM public.ops_obra_encomendas_lista(p_org, p_obra_id) e
   WHERE v_funcao IN ('admin','gestor') OR public.ops_pode_ver_obra(e.obra_id)
   ORDER BY array_position(ARRAY['em_atraso','chega_tarde','esta_semana','sem_prazo','mais_tarde','encomendado'], e.estado),
            e.encomendar_ate NULLS LAST, e.inicio_planeado, e.obra_codigo, e.produto_nome;
END
$$;
REVOKE ALL ON FUNCTION public.rpc_ops_obra_encomendas(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_encomendas(uuid, uuid) TO authenticated, service_role;

-- Avisos no sino: por obra, ao supervisor e aos gestores, quando há
-- material em atraso, a chegar tarde, ou a encomendar nos próximos 3 dias.
-- Resolve os avisos das obras que já não têm nada disto. Sem _org: todas.
CREATE OR REPLACE FUNCTION public.ops_obra_avisar_encomendas(_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org   uuid;
  v_a     record;
  v_p     uuid;
  v_com   uuid[];
  v_novos integer := 0;
  v_res   integer := 0;
  v_r     text;
  v_hoje  date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN jsonb_build_object('avisos', 0);
  END IF;
  FOR v_org IN
    SELECT DISTINCT o.organization_id FROM public.ops_obra o
     WHERE (_org IS NULL OR o.organization_id = _org) AND o.estado IN ('planeada','em_curso')
  LOOP
    v_com := '{}';
    FOR v_a IN
      SELECT e.obra_id, max(e.obra_codigo) AS codigo, max(e.obra_titulo) AS titulo, count(*)::int AS n,
             bool_or(e.estado IN ('em_atraso','chega_tarde')) AS grave,
             array_agg(e.estado || ':' || e.produto_id || ':' || e.tarefa_id || ':' || COALESCE(e.encomendar_ate::text, '')) AS chaves,
             string_agg(e.produto_nome || ' (' ||
               CASE e.estado WHEN 'em_atraso' THEN 'em atraso desde ' || to_char(e.encomendar_ate, 'DD/MM')
                             WHEN 'chega_tarde' THEN 'chega a ' || to_char(e.encomenda_chega, 'DD/MM') || ', tarde'
                             ELSE 'até ' || to_char(e.encomendar_ate, 'DD/MM') END || ')',
               ' · ' ORDER BY e.encomendar_ate NULLS LAST) AS lista
        FROM public.ops_obra_encomendas_lista(v_org, NULL) e
       WHERE e.estado IN ('em_atraso','chega_tarde')
          OR (e.estado = 'esta_semana' AND e.encomendar_ate <= v_hoje + 3)
       GROUP BY e.obra_id
    LOOP
      v_com := v_com || v_a.obra_id;
      FOREACH v_p IN ARRAY public.ops_obra_coordenacao(v_a.obra_id) LOOP
        v_r := public.ops_obra_notificar(v_org, v_p, 'operacoes_obra_encomendas', v_a.obra_id,
          v_a.codigo || ': ' || v_a.n || CASE WHEN v_a.n = 1 THEN ' material a encomendar' ELSE ' materiais a encomendar' END,
          COALESCE(v_a.titulo, 'Obra') || '. ' || left(v_a.lista, 400) || '.',
          '/operacao/obras/' || v_a.codigo,
          CASE WHEN v_a.grave THEN 'high' ELSE 'medium' END,
          v_a.chaves, jsonb_build_object('codigo', v_a.codigo));
        IF v_r IN ('novo','de_novo') THEN v_novos := v_novos + 1; END IF;
      END LOOP;
    END LOOP;
    v_res := v_res + public.ops_obra_notificacoes_resolver(v_org, 'operacoes_obra_encomendas', v_com, NULL, 'encomendas_em_dia');
  END LOOP;
  RETURN jsonb_build_object('avisos', v_novos, 'resolvidos', v_res);
END
$$;
REVOKE ALL ON FUNCTION public.ops_obra_avisar_encomendas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_avisar_encomendas(uuid) TO service_role;


-- ─────────────────────── 3. Dados em falta ───────────────────────

-- O que falta e piora o plano da obra. `destino`: 'crm' (link na Olyvia,
-- fora de /operacao) ou 'ops' (dentro das Operações). Gravidade 1 = muda
-- datas/quantidades; 2 = pior estimativa; 3 = conveniência.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_dados_em_falta(p_obra_id uuid)
RETURNS TABLE (chave text, gravidade smallint, titulo text, detalhe text,
               onde text, link text, destino text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_orc    uuid;
  v_deal   uuid;
  v_site   uuid;
  v_tem_ficha boolean;
  v_ficha  jsonb;
  v_faltam text[];
  v_n      integer;
  v_nomes  text;
  v_cp     text;
  v_dist   jsonb;
BEGIN
  SELECT id, organization_id, codigo, orcamento_id, contrato_id, supervisor_id, estado, morada
    INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  v_orc := v_o.orcamento_id;
  IF v_orc IS NULL AND v_o.contrato_id IS NOT NULL THEN
    v_orc := public.ops_contrato_orcamento(v_o.contrato_id);
  END IF;

  -- Orçamento, morada de obra e ficha do local
  IF v_orc IS NULL THEN
    RETURN QUERY SELECT 'sem_orcamento'::text, 2::smallint, 'Obra sem orçamento ligado'::text,
      'Sem orçamento não há ficha do local, nem medidas da visita, nem distância ao armazém.'::text,
      NULL::text, NULL::text, NULL::text;
  ELSIF public.ops_obra_crm_tem('quotes', ARRAY['id','site_address_id']) THEN
    EXECUTE 'SELECT site_address_id FROM public.quotes WHERE id = $1' INTO v_site USING v_orc;
    IF v_site IS NULL THEN
      RETURN QUERY SELECT 'sem_morada_obra'::text, 1::smallint, 'O orçamento não tem morada de obra'::text,
        'Sem ela não há ficha do local: o plano não sabe do andar, do elevador nem do estacionamento.'::text,
        'Orçamento → Morada de entrega / do serviço'::text, '/quotes?open=' || v_orc, 'crm'::text;
    ELSIF public.ops_obra_crm_tem('anew_address_building', ARRAY['address_id']) THEN
      EXECUTE 'SELECT to_jsonb(b) FROM public.anew_address_building b WHERE b.address_id = $1'
         INTO v_ficha USING v_site;
      v_tem_ficha := v_ficha IS NOT NULL;
      IF NOT v_tem_ficha THEN
        RETURN QUERY SELECT 'sem_ficha_local'::text, 1::smallint, 'Ficha do local por preencher'::text,
          'O andar, o elevador, o acesso e se a casa está habitada mudam a duração das tarefas e as proteções.'::text,
          'Orçamento → Morada de entrega → Editar'::text, '/quotes?open=' || v_orc, 'crm'::text;
      ELSE
        SELECT array_agg(r) INTO v_faltam FROM (
          SELECT 'acesso' AS r WHERE v_ficha ? 'acesso' AND nullif(v_ficha->>'acesso', '') IS NULL
          UNION ALL SELECT 'estacionamento' WHERE v_ficha ? 'estacionamento' AND nullif(v_ficha->>'estacionamento', '') IS NULL
          UNION ALL SELECT 'elevador' WHERE v_ficha ? 'tem_elevador' AND v_ficha->'tem_elevador' = 'null'::jsonb
          UNION ALL SELECT 'casa habitada' WHERE v_ficha ? 'habitada_durante_obra' AND v_ficha->'habitada_durante_obra' = 'null'::jsonb
          UNION ALL SELECT 'pavimento' WHERE v_ficha ? 'pavimento' AND nullif(v_ficha->>'pavimento', '') IS NULL
        ) x;
        IF v_faltam IS NOT NULL THEN
          RETURN QUERY SELECT 'ficha_incompleta'::text, 2::smallint, 'Ficha do local incompleta'::text,
            ('Falta: ' || array_to_string(v_faltam, ', ') || '.')::text,
            'Orçamento → Morada de entrega → Editar'::text, '/quotes?open=' || v_orc, 'crm'::text;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Distância ao armazém
  v_cp := public.ops_obra_codigo_postal(p_obra_id);
  IF v_cp IS NULL THEN
    RETURN QUERY SELECT 'sem_codigo_postal'::text, 2::smallint, 'Morada da obra sem código postal'::text,
      'Sem código postal a distância ao armazém e as deslocações ficam estimadas (30 km).'::text,
      CASE WHEN v_orc IS NOT NULL THEN 'Orçamento → Morada de entrega' END,
      CASE WHEN v_orc IS NOT NULL THEN '/quotes?open=' || v_orc END,
      CASE WHEN v_orc IS NOT NULL THEN 'crm' END;
  ELSE
    v_dist := public.ops_distancia_armazem(v_o.organization_id, v_cp);
    IF v_dist = '{}'::jsonb THEN
      RETURN QUERY SELECT 'sem_distancia'::text, 3::smallint, 'Distância ao armazém desconhecida'::text,
        ('Não se encontrou o código postal ' || v_cp || ', ou a empresa não tem armazém com código postal.')::text,
        'Inventário → Armazéns'::text, '/warehouses'::text, 'crm'::text;
    END IF;
  END IF;

  -- Medidas da visita (diagnóstico das necessidades do negócio)
  IF v_orc IS NOT NULL
     AND public.ops_obra_crm_tem('deal_needs', ARRAY['id','deal_id','title','diag_m2_pavimento','diag_tipo_area'])
     AND public.ops_obra_crm_tem('quotes', ARRAY['id','deal_id']) THEN
    EXECUTE 'SELECT deal_id FROM public.quotes WHERE id = $1' INTO v_deal USING v_orc;
    IF v_deal IS NOT NULL THEN
      -- Sem m² de pavimento (nem a área antiga diag_area_m2, se existir) —
      -- o mesmo critério do aviso "sem medidas" no negócio, no CRM.
      EXECUTE 'SELECT count(*)::int, string_agg(COALESCE(nullif(btrim(title), ''''), ''Área''), '', '')
                 FROM public.deal_needs
                WHERE deal_id = $1 AND COALESCE(diag_m2_pavimento, 0) <= 0'
           || CASE WHEN public.ops_obra_crm_tem('deal_needs', ARRAY['diag_area_m2'])
                   THEN ' AND COALESCE(diag_area_m2, 0) <= 0' ELSE '' END
         INTO v_n, v_nomes USING v_deal;
      IF v_n > 0 THEN
        RETURN QUERY SELECT 'medidas_em_falta'::text, 1::smallint,
          (v_n || CASE WHEN v_n = 1 THEN ' área sem medidas da visita' ELSE ' áreas sem medidas da visita' END)::text,
          ('Sem m² de pavimento os tempos das tarefas ficam pelos valores padrão: ' || left(v_nomes, 200) || '.')::text,
          'Pedido de Proposta → Necessidade → Diagnóstico'::text, '/deals?open=' || v_deal, 'crm'::text;
      END IF;
    END IF;
  END IF;

  -- Materiais sem prazo do fornecedor
  SELECT count(DISTINCT e.produto_id)::int, string_agg(DISTINCT e.produto_nome, ', ')
    INTO v_n, v_nomes
    FROM public.ops_obra_encomendas_lista(v_o.organization_id, p_obra_id) e
   WHERE e.estado = 'sem_prazo';
  IF v_n > 0 THEN
    RETURN QUERY SELECT 'sem_prazo_fornecedor'::text, 1::smallint,
      (v_n || CASE WHEN v_n = 1 THEN ' material sem prazo do fornecedor' ELSE ' materiais sem prazo do fornecedor' END)::text,
      ('Não se sabe quando encomendar: ' || left(v_nomes, 200) || '.')::text,
      'Produtos → Fornecedores → Prazo de entrega'::text, '/products'::text, 'crm'::text;
  END IF;

  -- Ofícios sem ninguém (as tarefas por fazer precisam deles)
  SELECT count(DISTINCT k.id)::int, string_agg(DISTINCT k.nome, ', ')
    INTO v_n, v_nomes
    FROM public.ops_obra_tarefa t
    JOIN public.ops_skill k ON k.id = t.skill_id
   WHERE t.obra_id = p_obra_id AND t.estado IN ('por_fazer','rejeitada')
     AND NOT EXISTS (
       SELECT 1 FROM public.ops_utilizador_skill us
         JOIN public.ops_utilizador_perfil p ON p.utilizador_id = us.utilizador_id
                                            AND p.organization_id = v_o.organization_id AND p.ativo
        WHERE us.skill_id = k.id);
  IF v_n > 0 THEN
    RETURN QUERY SELECT 'oficio_sem_pessoas'::text, 1::smallint,
      ('Ninguém na equipa com ' || v_nomes)::text,
      'A distribuição automática não tem a quem dar estas tarefas.'::text,
      'Definições → Equipa → especialidades'::text, '/definicoes'::text, 'ops'::text;
  END IF;

  -- Tarefas próximas sem ninguém atribuído
  SELECT count(*)::int INTO v_n
    FROM public.ops_obra_tarefa t
   WHERE t.obra_id = p_obra_id AND t.estado = 'por_fazer'
     AND t.inicio_planeado IS NOT NULL
     AND t.inicio_planeado <= (now() AT TIME ZONE 'Europe/Lisbon')::date + 7
     AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id);
  IF v_n > 0 THEN
    RETURN QUERY SELECT 'tarefas_sem_pessoa'::text, 2::smallint,
      (v_n || CASE WHEN v_n = 1 THEN ' tarefa desta semana sem ninguém' ELSE ' tarefas desta semana sem ninguém' END)::text,
      'Começam nos próximos 7 dias e não têm pessoa atribuída.'::text,
      'Plano da obra'::text, NULL::text, NULL::text;
  END IF;

  IF v_o.supervisor_id IS NULL AND v_o.estado IN ('planeada','em_curso') THEN
    RETURN QUERY SELECT 'sem_supervisor'::text, 2::smallint, 'Obra sem supervisor'::text,
      'Os alertas e os avisos da obra só chegam aos gestores.'::text,
      'Ficha da obra → Editar'::text, NULL::text, NULL::text;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.rpc_ops_obra_dados_em_falta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_dados_em_falta(uuid) TO authenticated, service_role;

COMMIT;

-- Os avisos das encomendas põem-se em dia todos os dias às 07:00 UTC (8 h
-- em Lisboa no verão), se a base tiver pg_cron.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('ops-obras-encomendas', '0 7 * * *', 'SELECT public.ops_obra_avisar_encomendas()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Encomendas: não ficou agendado no pg_cron (%).', SQLERRM;
END
$cron$;

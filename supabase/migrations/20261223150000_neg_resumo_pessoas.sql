-- ============================================================
-- 20261223150000_neg_resumo_pessoas
-- ============================================================
-- O que faz: função NOVA de leitura neg_resumo_pessoas (Lista e Quadro da
--   página Pessoas) e a auxiliar fn_neg_valor_negocio. Ambas STABLE e
--   SECURITY INVOKER: a RLS existente decide quem vê cada pessoa (lead com
--   leads.view ou cliente com clients.view, com âmbito).
--   D1 como nas escritas: organização sem linha de configuração (ou sem
--   pessoas.view nela) devolve lista vazia, sem correr a parte pesada.
--   Página por chave (keyset), até 100 linhas. Os candidatos pedem-se
--   directamente a anew_leads e a anew_clients pela chave de ordenação, com
--   LIMIT p_limite + 1 em cada ramo ANTES de juntar; só depois entram a lead,
--   o cliente, o nome e os agregados (LATERAL) das linhas da página. A chave
--   de uma pessoa em 'recentes' é a maior entre a lead (list_sort_at) e o
--   cliente (updated_at/created_at); em 'nome' é COALESCE(lower(nome), '')
--   (a RLS de anew_entities pode esconder o nome: fica '' e nunca NG009).
--   ha_mais diz se há página seguinte; a seguinte pede-se com a chave_ordem
--   e o entity_id da última linha.
--   p_pesquisa: mínimo 2 caracteres (menos dá NG009), sobre o nome.
--   Visitas por sondas de índice (lead_id = ANY(leads da pessoa) e client_id,
--   em dois ramos), sem OR sobre subconsulta. statement_timeout de 5 s na
--   própria função.
--   Etapa (chaves de EtapaPessoa): calculada a partir dos agregados da
--   própria linha. Com p_etapa, o filtro é calculado uma vez, por conjunto,
--   para a organização (sem consultas por pessoa), antes de paginar.
--   Valor (D7, sem coluna nova): por negócio aberto, a proposta ligada mais
--   recente não rejeitada; senão o orçamento aceite; senão o maior orçamento
--   vivo. valor_em_jogo é a soma dos negócios abertos.
--   pronto_a_ganhar (D2): algum negócio aberto cumpre a regra da
--   organização (só com proposta_aceite / contrato_assinado).
-- SÓ ACRESCENTA: nenhuma tabela, trigger, política, configuração ou função
--   existente é alterada; nenhum índice novo. Não escreve nada.
-- DESEMPENHO: não medido. Medir na nike antes de ligar a Lista (plano no
--   relatório; p95 alvo < 300 ms); nunca medir com a Mudelar.
-- PRECISA DE CÓDIGO: a Lista e o Quadro passam a ler daqui (o contacto vem
--   de get_entity_contact_summary, só para as linhas da página); regenerar
--   os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, extensions;

DO $$
BEGIN
  IF to_regclass('public.negocio_workflow_config') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta 20261223100000 (negocio_workflow_config); nada feito.';
  END IF;
END;
$$;

-- Valor derivado de um negócio (D7).
CREATE FUNCTION public.fn_neg_valor_negocio(p_negocio_id uuid)
  RETURNS numeric
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    (SELECT pr.value::numeric
     FROM public.proposals pr
     WHERE pr.negocio_id = p_negocio_id AND pr.status IS DISTINCT FROM 'rejected'
       AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
     ORDER BY pr.created_at DESC
     LIMIT 1),
    (SELECT q.total::numeric
     FROM public.quotes q
     WHERE q.negocio_id = p_negocio_id AND q.estado = 'aceite' AND q.deleted_at IS NULL
     ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC
     LIMIT 1),
    (SELECT max(q.total)::numeric
     FROM public.quotes q
     WHERE q.negocio_id = p_negocio_id AND q.deleted_at IS NULL
       AND q.estado IS DISTINCT FROM 'rejeitado' AND q.estado IS DISTINCT FROM 'perdido'));
$function$;

CREATE FUNCTION public.neg_resumo_pessoas(
  p_organization_id uuid,
  p_papel text DEFAULT NULL,
  p_etapa text DEFAULT NULL,
  p_pesquisa text DEFAULT NULL,
  p_ordem text DEFAULT 'recentes',
  p_depois_de_chave text DEFAULT NULL,
  p_depois_de_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 50)
  RETURNS TABLE (
    entity_id uuid,
    nome text,
    papel text,
    lead_id uuid,
    client_id uuid,
    assigned_to uuid,
    lead_status text,
    closure_result text,
    etapa text,
    negocios_abertos integer,
    negocios_ganhos integer,
    negocios_perdidos integer,
    fase_mais_avancada text,
    pronto_a_ganhar boolean,
    valor_em_jogo numeric,
    ultimo_contacto_em timestamptz,
    proxima_visita_em timestamptz,
    ultima_visita_feita_em timestamptz,
    ultimo_negocio_em timestamptz,
    por_ligar_contactos integer,
    por_ligar_visitas integer,
    por_ligar_levantamentos integer,
    chave_ordem text,
    ha_mais boolean)
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_ordem    text := COALESCE(p_ordem, 'recentes');
  v_pesquisa text := NULLIF(btrim(p_pesquisa), '');
  v_padrao   text;
  v_depois   timestamptz;
  v_momento  text;
  v_ents     uuid[];
BEGIN
  IF p_organization_id IS NULL
     OR v_ordem NOT IN ('recentes', 'nome')
     OR (p_papel IS NOT NULL AND p_papel NOT IN ('lead', 'cliente'))
     OR (p_etapa IS NOT NULL AND p_etapa NOT IN ('nova', 'emContacto', 'visitaMarcada', 'qualificada', 'cliente'))
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois_de_chave IS NULL) <> (p_depois_de_id IS NULL)
     OR char_length(v_pesquisa) < 2 OR char_length(v_pesquisa) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: organização, ordem, papel, etapa, limite (1 a 100), página ou pesquisa (2 a 200 caracteres).'
      USING ERRCODE = 'NG009';
  END IF;

  -- D1: sem linha de configuração visível, lista vazia.
  SELECT c.momento_ganho INTO v_momento
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_pesquisa IS NOT NULL THEN
    v_padrao := '%' || replace(replace(replace(v_pesquisa, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  IF v_ordem = 'recentes' AND p_depois_de_chave IS NOT NULL THEN
    BEGIN
      v_depois := p_depois_de_chave::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Valor inválido: chave da página.' USING ERRCODE = 'NG009';
    END;
  END IF;

  -- Filtro de etapa: uma vez, por conjunto, para a organização.
  IF p_etapa IS NOT NULL THEN
    v_ents := ARRAY(
      SELECT b.ent
      FROM (
        SELECT x.ent, bool_or(x.cliente) AS cliente
        FROM (
          SELECT l.entity_id AS ent, false AS cliente
          FROM public.anew_leads l
          WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
          UNION ALL
          SELECT c.entity_id, true
          FROM public.anew_clients c
          WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
        ) x
        GROUP BY x.ent
      ) b
      LEFT JOIN (
        SELECT DISTINCT n.entity_id AS ent
        FROM public.negocios n
        WHERE n.organization_id = p_organization_id AND n.estado = 'aberto' AND n.deleted_at IS NULL
      ) na ON na.ent = b.ent
      LEFT JOIN (
        SELECT DISTINCT l.entity_id AS ent
        FROM public.schedule_items s
        JOIN public.anew_leads l ON l.id = s.lead_id
        WHERE l.organization_id = p_organization_id AND s.organization_id = p_organization_id
          AND s.status <> 'cancelled'::public.schedule_item_status
          AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      ) vi ON vi.ent = b.ent
      LEFT JOIN (
        SELECT DISTINCT i.entity_id AS ent
        FROM public.entity_interactions i
        WHERE i.organization_id = p_organization_id AND i.interaction_type = 'call'
      ) co ON co.ent = b.ent
      WHERE CASE
              WHEN b.cliente THEN 'cliente'
              WHEN na.ent IS NOT NULL THEN 'qualificada'
              WHEN vi.ent IS NOT NULL THEN 'visitaMarcada'
              WHEN co.ent IS NOT NULL THEN 'emContacto'
              ELSE 'nova'
            END = p_etapa);
  END IF;

  RETURN QUERY
  WITH cand_leads AS (
    -- recentes: a lead mais recente de cada pessoa (a chave da pessoa), pelo
    -- índice (organization_id, list_sort_at DESC), com LIMIT antes de juntar.
    SELECT l.entity_id AS ent, l.list_sort_at AS k
    FROM public.anew_leads l
    WHERE v_ordem = 'recentes'
      AND l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.anew_leads l2
                      WHERE l2.entity_id = l.entity_id AND l2.organization_id = p_organization_id
                        AND l2.deleted_at IS NULL
                        AND (l2.list_sort_at, l2.id) > (l.list_sort_at, l.id))
      AND NOT EXISTS (SELECT 1 FROM public.anew_clients c2
                      WHERE c2.entity_id = l.entity_id AND c2.organization_id = p_organization_id
                        AND c2.deleted_at IS NULL
                        AND COALESCE(c2.updated_at, c2.created_at) > l.list_sort_at)
      AND (p_papel IS NULL
           OR (p_papel = 'cliente') = EXISTS (SELECT 1 FROM public.anew_clients c3
                                             WHERE c3.entity_id = l.entity_id
                                               AND c3.organization_id = p_organization_id
                                               AND c3.deleted_at IS NULL))
      AND (p_etapa IS NULL OR EXISTS (SELECT 1 FROM unnest(v_ents) AS t(ent) WHERE t.ent = l.entity_id))
      AND (v_padrao IS NULL OR EXISTS (SELECT 1 FROM public.anew_entities e
                                       WHERE e.id = l.entity_id AND e.display_name ILIKE v_padrao ESCAPE '\'))
      AND (p_depois_de_id IS NULL OR (l.list_sort_at, l.entity_id) < (v_depois, p_depois_de_id))
    ORDER BY l.list_sort_at DESC, l.entity_id DESC
    LIMIT p_limite + 1
  ), cand_clientes AS (
    -- recentes: pessoas cuja chave vem do cliente (mais recente do que todas as leads).
    SELECT c.entity_id AS ent, COALESCE(c.updated_at, c.created_at) AS k
    FROM public.anew_clients c
    WHERE v_ordem = 'recentes' AND p_papel IS DISTINCT FROM 'lead'
      AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.anew_clients c2
                      WHERE c2.entity_id = c.entity_id AND c2.organization_id = p_organization_id
                        AND c2.deleted_at IS NULL
                        AND (COALESCE(c2.updated_at, c2.created_at), c2.id)
                            > (COALESCE(c.updated_at, c.created_at), c.id))
      AND NOT EXISTS (SELECT 1 FROM public.anew_leads l2
                      WHERE l2.entity_id = c.entity_id AND l2.organization_id = p_organization_id
                        AND l2.deleted_at IS NULL
                        AND l2.list_sort_at >= COALESCE(c.updated_at, c.created_at))
      AND (p_etapa IS NULL OR EXISTS (SELECT 1 FROM unnest(v_ents) AS t(ent) WHERE t.ent = c.entity_id))
      AND (v_padrao IS NULL OR EXISTS (SELECT 1 FROM public.anew_entities e
                                       WHERE e.id = c.entity_id AND e.display_name ILIKE v_padrao ESCAPE '\'))
      AND (p_depois_de_id IS NULL
           OR (COALESCE(c.updated_at, c.created_at), c.entity_id) < (v_depois, p_depois_de_id))
    ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.entity_id DESC
    LIMIT p_limite + 1
  ), cand_nome AS (
    -- nome: pessoas (leads e clientes vivos) pelo nome, com LIMIT antes dos agregados.
    SELECT x.ent, COALESCE(lower(e.display_name), '') AS nm
    FROM (
      SELECT l.entity_id AS ent
      FROM public.anew_leads l
      WHERE v_ordem = 'nome' AND p_papel IS DISTINCT FROM 'cliente'
        AND l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
        AND (p_papel IS NULL OR NOT EXISTS (SELECT 1 FROM public.anew_clients c3
                                            WHERE c3.entity_id = l.entity_id
                                              AND c3.organization_id = p_organization_id
                                              AND c3.deleted_at IS NULL))
      UNION
      SELECT c.entity_id
      FROM public.anew_clients c
      WHERE v_ordem = 'nome' AND p_papel IS DISTINCT FROM 'lead'
        AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
    ) x
    LEFT JOIN public.anew_entities e ON e.id = x.ent
    WHERE (p_etapa IS NULL OR EXISTS (SELECT 1 FROM unnest(v_ents) AS t(ent) WHERE t.ent = x.ent))
      AND (v_padrao IS NULL OR e.display_name ILIKE v_padrao ESCAPE '\')
      AND (p_depois_de_id IS NULL
           OR (COALESCE(lower(e.display_name), ''), x.ent) > (p_depois_de_chave, p_depois_de_id))
    ORDER BY COALESCE(lower(e.display_name), ''), x.ent
    LIMIT p_limite + 1
  ), candidatos AS (
    SELECT u.ent, u.k, NULL::text AS nm
    FROM (SELECT * FROM cand_leads UNION ALL SELECT * FROM cand_clientes) u
    UNION ALL
    SELECT n.ent, NULL::timestamptz, n.nm FROM cand_nome n
  ), pagina AS (
    SELECT cd.ent, cd.k, cd.nm,
           row_number() OVER (ORDER BY
             CASE WHEN v_ordem = 'recentes' THEN cd.k END DESC,
             CASE WHEN v_ordem = 'recentes' THEN cd.ent END DESC,
             CASE WHEN v_ordem = 'nome' THEN cd.nm END ASC,
             CASE WHEN v_ordem = 'nome' THEN cd.ent END ASC) AS rn,
           count(*) OVER () AS lidas
    FROM candidatos cd
  )
  SELECT
    pg.ent::uuid,
    e2.display_name::text,
    (CASE WHEN cl.cid IS NOT NULL THEN 'cliente' ELSE 'lead' END)::text,
    ld.lid::uuid,
    cl.cid::uuid,
    COALESCE(cl.cassigned, ld.lassigned)::uuid,
    ld.lstatus::text,
    ld.lclosure::text,
    (CASE
       WHEN cl.cid IS NOT NULL THEN 'cliente'
       WHEN COALESCE(ng.abertos, 0) > 0 THEN 'qualificada'
       WHEN COALESCE(vs.visitas_lead, 0) > 0 THEN 'visitaMarcada'
       WHEN ct.ultimo IS NOT NULL THEN 'emContacto'
       ELSE 'nova'
     END)::text,
    COALESCE(ng.abertos, 0)::integer,
    COALESCE(ng.ganhos, 0)::integer,
    COALESCE(ng.perdidos, 0)::integer,
    fs.fase::text,
    COALESCE(vl.pronto, false)::boolean,
    vl.valor::numeric,
    ct.ultimo::timestamptz,
    vs.proxima::timestamptz,
    vs.ultima_feita::timestamptz,
    ng.ultimo_em::timestamptz,
    COALESCE(ct.por_ligar, 0)::integer,
    COALESCE(vs.por_ligar, 0)::integer,
    COALESCE(lv.por_ligar, 0)::integer,
    (CASE WHEN v_ordem = 'nome' THEN COALESCE(pg.nm, '')
          ELSE to_char(pg.k AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)::text,
    (pg.lidas > p_limite)::boolean
  FROM pagina pg
  LEFT JOIN public.anew_entities e2 ON e2.id = pg.ent
  LEFT JOIN LATERAL (
    SELECT l.id AS lid, l.status::text AS lstatus, l.closure_result AS lclosure, l.assigned_to AS lassigned
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = pg.ent AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
    LIMIT 1
  ) ld ON true
  LEFT JOIN LATERAL (
    SELECT c.id AS cid, c.assigned_to AS cassigned
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.entity_id = pg.ent AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 1
  ) cl ON true
  LEFT JOIN LATERAL (
    -- ids de todas as leads da pessoa (sondas por índice nas visitas)
    SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) AS ids
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = pg.ent
  ) lds ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           max(n.created_at) AS ultimo_em
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent AND n.deleted_at IS NULL
  ) ng ON true
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.client_contracts cc JOIN public.negocios n ON n.id = cc.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL AND cc.deleted_at IS NULL) THEN 'contrato'
      WHEN EXISTS (SELECT 1 FROM public.proposals pr JOIN public.negocios n ON n.id = pr.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL
                     AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN 'proposta'
      WHEN EXISTS (SELECT 1 FROM public.quotes q JOIN public.negocios n ON n.id = q.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL AND q.deleted_at IS NULL) THEN 'orcamento'
    END AS fase
  ) fs ON true
  LEFT JOIN LATERAL (
    SELECT sum(public.fn_neg_valor_negocio(n.id)) AS valor,
           bool_or(CASE
             WHEN v_momento = 'proposta_aceite' THEN EXISTS (
               SELECT 1 FROM public.proposals pr
               WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
             WHEN v_momento = 'contrato_assinado' THEN EXISTS (
               SELECT 1 FROM public.client_contracts cc
               WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado') AND cc.deleted_at IS NULL)
             ELSE false
           END) AS pronto
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
      AND n.estado = 'aberto' AND n.deleted_at IS NULL
  ) vl ON true
  LEFT JOIN LATERAL (
    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
    FROM public.entity_interactions i
    WHERE i.entity_id = pg.ent AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
  ) ct ON true
  LEFT JOIN LATERAL (
    SELECT min(s.start_datetime) FILTER (
             WHERE s.start_datetime >= now()
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(s.start_datetime) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE s.lead_id IS NOT NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
    FROM (
      -- dois ramos por índice, sem OR sobre subconsulta: pelas leads e pelo cliente
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE si.lead_id = ANY (lds.ids)
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
      UNION ALL
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE cl.cid IS NOT NULL AND si.client_id = cl.cid
        AND (si.lead_id IS NULL OR si.lead_id <> ALL (lds.ids))
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s
  ) vs ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS por_ligar
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = pg.ent
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)
  ) lv ON true
  WHERE pg.rn <= p_limite
  ORDER BY pg.rn;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_valor_negocio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_resumo_pessoas(uuid, text, text, text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_valor_negocio(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_resumo_pessoas(uuid, text, text, text, text, text, uuid, integer) TO authenticated, service_role;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, INVOKER, STABLE, search_path fixo, sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_valor_negocio(uuid)'),
              ('public.neg_resumo_pessoas(uuid,text,text,text,text,text,uuid,integer)')
            ) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 's'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM
                  CASE WHEN p.proname = 'neg_resumo_pessoas'
                       THEN 'search_path=public, pg_temp,statement_timeout=5s'
                       ELSE 'search_path=public, pg_temp' END
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções novas): falha em %', v_txt;
  END IF;

  -- 2. colunas de que o resumo depende, com o tipo esperado
  v_txt := (SELECT count(*)
            FROM (VALUES
              ('anew_leads', 'list_sort_at', 'timestamp with time zone'),
              ('anew_leads', 'closure_result', 'text'),
              ('proposals', 'value', 'numeric(15,2)'),
              ('proposals', 'is_deleted', 'boolean'),
              ('quotes', 'total', 'numeric(12,2)'),
              ('quotes', 'estado', 'text'),
              ('schedule_items', 'negocio_id', 'uuid'),
              ('entity_interactions', 'negocio_id', 'uuid'),
              ('client_contracts', 'negocio_id', 'uuid')
            ) AS e(t, c, ty)
            JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.t)
                               AND a.attname::text = e.c AND NOT a.attisdropped
                               AND format_type(a.atttypid, a.atttypmod) = e.ty)::text;
  IF v_txt IS DISTINCT FROM '9' THEN
    RAISE EXCEPTION 'CONFERIR (2. colunas esperadas): obtido %, esperado 9', v_txt;
  END IF;

  -- 3. tabelas usadas existem
  v_txt := (SELECT string_agg(t, ',') FROM unnest(ARRAY[
              'negocios', 'negocio_workflow_config', 'levantamentos', 'anew_entities']) AS t
            WHERE to_regclass('public.' || t) IS NULL);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. tabelas em falta): %', v_txt;
  END IF;
END;
$$;

COMMIT;

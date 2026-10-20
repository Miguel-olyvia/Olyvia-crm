-- ============================================================
-- 20261226100000_neg_ficha_rapida_nome_limites_respostas
-- ============================================================
-- O que faz:
--   1. FICHA RÁPIDA. A secção de visitas da ficha (fn_neg_ficha_seccao) lia
--      os responsáveis de cada visita em schedule_item_assignees; a política
--      de leitura dessa tabela volta a ler toda a agenda da organização com a
--      RLS de quem chama, e isso era cerca de 1,5 s dos 2 s da ficha na nike.
--      Agora a página de visitas lê-se como antes (RLS de quem chama) e os
--      responsáveis dessas visitas vêm de fn_neg_ficha_visitas_recursos (NOVA,
--      SECURITY DEFINER, só leitura, só authenticated): recebe os ids da
--      página, volta a aplicar-lhes as três políticas de leitura de
--      schedule_items com o auth.uid() de quem chama (cópia literal, md5
--      conferido abaixo) e devolve só pares (visita_id, recurso_id). O nome,
--      user_id e ativo dos recursos continuam a ler-se de schedule_resources
--      com a RLS de quem chama. Resultado igual; políticas e tabelas da
--      agenda intocadas.
--   2. NOME EM PARTES. neg_ficha_pessoa devolve também pessoa.first_name e
--      pessoa.last_name (anew_entities); só acrescenta.
--   3. LIMITES DAS RESPOSTAS. CHECK levantamento_respostas_escolhas_limites_check:
--      escolhas com 1 a 30 elementos, cada um no formato de chave de opção
--      (o de levantamento_opcoes.chave, até 40); escolhas_texto com 1 a 30
--      elementos, cada um com 1 a 80 caracteres (o de levantamento_opcoes.texto)
--      e sem o carácter 0x01. É o que neg_guardar_levantamento já grava (chave
--      e texto da opção); fecha a escrita directa pela API.
-- Substitui as versões de 20261226090000 (pré-condição por md5 lido no
--   remoto; mesma assinatura, atributos e privilégios).
-- MUDELAR: as funções da ficha dão-lhe NG008 (sem negocio_workflow_config);
--   a função nova só devolve visitas que quem chama já vê; o CHECK vale para
--   toda a tabela, que hoje não tem respostas que o violem (conferido abaixo).
--   Nenhuma política nem tabela da agenda é alterada.
-- PRECISA DE CÓDIGO? Não parte nada (só acrescenta chaves). O ecrã da ficha
--   deve passar a ler pessoa.first_name e pessoa.last_name em vez de partir
--   pessoa.nome; regenerar os tipos do Supabase.
-- ORDEM: depois de 20261226090000.
-- Reversão: fora da pasta das migrations.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $pre$
DECLARE
  v_txt text;
  v_n   bigint;
BEGIN
  -- As duas funções a substituir são as de 20261226090000 (md5 lido no remoto
  -- a 20/10 depois de aplicada, igual ao calculado do ficheiro dela).
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)', 'ac85c503c90227661c5ffd2211179237'),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])',  '1b6e5065d14d4ebd5bfe3a17651d4b5c')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: não estão as versões de 20261226090000: %; nada feito.', v_txt;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace s ON s.oid = p.pronamespace
             WHERE s.nspname::text = 'public' AND p.proname::text = 'fn_neg_ficha_visitas_recursos') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_neg_ficha_visitas_recursos já existe; nada feito.';
  END IF;

  -- As políticas de leitura de schedule_items e schedule_item_assignees são
  -- as de 20/10 (a função nova copia as de schedule_items).
  IF (SELECT md5(string_agg(c.relname::text || '|' || p.polname::text || '|' || p.polcmd::text || '|'
                         || p.polpermissive::text || '|'
                         || COALESCE((SELECT string_agg(r::text, ',' ORDER BY r) FROM unnest(p.polroles) AS r), '')
                         || '|' || COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
                         E'\n' ORDER BY c.relname::text, p.polname::text))
          FROM pg_catalog.pg_policy p
          JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
          WHERE c.relnamespace = 'public'::regnamespace
            AND c.relname::text IN ('schedule_items', 'schedule_item_assignees')
            AND p.polcmd::text IN ('r', '*')) IS DISTINCT FROM '5895bc07278d429ff59f19f0176cc09b' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as políticas de leitura da agenda mudaram desde 20/10; nada feito.';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.levantamento_respostas'::regclass AND NOT a.attisdropped
        AND a.attname::text IN ('escolhas', 'escolhas_texto')
        AND pg_catalog.format_type(a.atttypid, a.atttypmod)::text = 'text[]') <> 2 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam as colunas escolhas e escolhas_texto; nada feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
             WHERE c.conrelid = 'public.levantamento_respostas'::regclass
               AND c.conname::text = 'levantamento_respostas_escolhas_limites_check') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: o CHECK dos limites já existe; nada feito.';
  END IF;

  v_n := (SELECT count(*) FROM public.levantamento_respostas lr
       WHERE NOT ((lr.escolhas IS NULL
                   OR (array_ndims(lr.escolhas) = 1 AND cardinality(lr.escolhas) BETWEEN 1 AND 30
                       AND array_position(lr.escolhas, NULL::text) IS NULL
                       AND strpos(array_to_string(lr.escolhas, ''), ',') = 0
                       AND array_to_string(lr.escolhas, ',')
                           ~ '^[a-z0-9][A-Za-z0-9]{0,39}(,[a-z0-9][A-Za-z0-9]{0,39})*$'))
                  AND (lr.escolhas_texto IS NULL
                   OR (array_ndims(lr.escolhas_texto) = 1 AND cardinality(lr.escolhas_texto) BETWEEN 1 AND 30
                       AND array_position(lr.escolhas_texto, NULL::text) IS NULL
                       AND '' <> ALL (lr.escolhas_texto)
                       AND strpos(array_to_string(lr.escolhas_texto, ''), chr(1)) = 0
                       AND array_to_string(lr.escolhas_texto, chr(1)) !~ '[^\x01]{81}'))));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: % respostas fora dos limites novos; nada feito.', v_n;
  END IF;
END
$pre$;

-- ============================================================
-- 1. fn_neg_ficha_visitas_recursos (nova)
-- ============================================================

CREATE FUNCTION public.fn_neg_ficha_visitas_recursos(p_organization_id uuid, p_visitas uuid[])
 RETURNS TABLE(visita_id uuid, recurso_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A ficha pede no máximo uma página (100) mais uma.
  IF p_organization_id IS NULL OR p_visitas IS NULL OR cardinality(p_visitas) > 101 THEN
    RAISE EXCEPTION 'Valor inválido: visitas.' USING ERRCODE = 'NG009';
  END IF;

  -- Só as visitas que quem chama vê: as três políticas de leitura de
  -- schedule_items, copiadas à letra (a migration confere o md5 delas), com
  -- auth.uid() de quem chama; as funções que usam são todas SECURITY DEFINER,
  -- por isso dão aqui o mesmo que na RLS. Dada a visita visível, as políticas
  -- de leitura de schedule_item_assignees ficam todas satisfeitas: quem vê a
  -- visita vê os seus responsáveis, como hoje. Só os ids; os recursos lêem-se
  -- fora daqui, com a RLS de schedule_resources de quem chama.
  RETURN QUERY
  SELECT a.item_id, a.resource_id
  FROM public.schedule_items si
  JOIN public.schedule_item_assignees a ON a.item_id = si.id
  WHERE si.id = ANY (p_visitas)
    AND si.organization_id = p_organization_id
    AND ((public.is_system_admin(auth.uid())
          AND si.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
         OR (public.is_system_admin(auth.uid())
             AND public.has_active_support_access(si.organization_id))
         OR (public.has_scheduling_permission(auth.uid(), 'scheduling.items.view'::text)
             AND si.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
             AND EXISTS (SELECT 1
                         FROM public.get_schedule_item_scope_context(si.organization_id,
                                                                     'scheduling.items.view'::text)
                                AS ctx(applied_scope, owner_ids)
                         WHERE ctx.applied_scope = 'ORG'::text
                            OR si.created_by = ANY (ctx.owner_ids)
                            OR si.user_id = ANY (ctx.owner_ids)
                            OR public.schedule_item_assigned_to_owners(si.id, ctx.owner_ids))));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_ficha_visitas_recursos(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_ficha_visitas_recursos(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_neg_ficha_visitas_recursos(uuid, uuid[]) IS
  'Pessoas, ficha: pares (visita_id, recurso_id) dos responsáveis das visitas dadas que quem chama vê (as políticas de leitura de schedule_items, copiadas). Só leitura. Usada por fn_neg_ficha_seccao para não passar pela política de schedule_item_assignees. 20261226100000.';

-- ============================================================
-- 2. fn_neg_ficha_seccao (a partir da versão de 20261226090000; só muda a
--    leitura dos responsáveis das visitas)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_neg_ficha_seccao(p_organization_id uuid, p_entity_id uuid, p_tipo text, p_limite integer, p_depois jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_lim    int;
  v_ts     timestamptz;
  v_dt     date;
  v_id     uuid;
  v_leads  uuid[];
  v_clis   uuid[];
  v_total  bigint;
  v_itens  jsonb;
  v_mais   boolean;
  v_ult_ts timestamptz;
  v_ult_dt date;
  v_ult_id uuid;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: secção, limite (1 a 100) ou página.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    BEGIN
      v_id := (p_depois ->> 'id')::uuid;
      IF p_tipo = 'levantamentos' THEN
        v_dt := (p_depois ->> 'em')::date;
      ELSE
        v_ts := (p_depois ->> 'em')::timestamptz;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- qualquer erro de conversão (uuid, data, fuso): página inválida
      RAISE EXCEPTION 'Valor inválido: página.' USING ERRCODE = 'NG009';
    END;
    IF v_id IS NULL OR (v_ts IS NULL AND v_dt IS NULL) THEN
      RAISE EXCEPTION 'Valor inválido: página.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- Guardas: saltadas só se neg_ficha_pessoa já as passou nesta transacção
  -- para esta organização e pessoa (variável local que a API não escreve).
  IF COALESCE(current_setting('app.neg_ficha_verificada', true), '')
     IS DISTINCT FROM p_organization_id::text || ':' || p_entity_id::text THEN
    PERFORM public.fn_neg_exigir_config(p_organization_id);
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  END IF;

  -- 20261226060000: os levantamentos paginam como as outras secções, com
  -- p_limite por página (antes, no máximo 10).
  v_lim := p_limite;

  IF p_tipo IN ('contactos', 'atividade') THEN
    SELECT count(*) INTO v_total
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
      AND (p_tipo = 'atividade' OR i.interaction_type = 'call');

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_ts, v_ult_id
    FROM (
      SELECT i.id, i.interaction_at AS em,
             row_number() OVER (ORDER BY i.interaction_at DESC, i.id DESC) AS rn,
             CASE WHEN p_tipo = 'contactos' THEN
               jsonb_build_object('id', i.id, 'resultado', i.result, 'notas', i.notes,
                                  'em', i.interaction_at, 'proxima_acao_em', i.next_action_date,
                                  'negocio_id', i.negocio_id, 'criado_por_nome', cu.name)
             ELSE
               jsonb_build_object('id', i.id, 'tipo', i.interaction_type, 'assunto', i.subject,
                                  'resultado', i.result, 'notas', i.notes, 'em', i.interaction_at,
                                  'negocio_id', i.negocio_id, 'criado_por_nome', cu.name)
             END AS item
      FROM (
        SELECT ei.*
        FROM public.entity_interactions ei
        WHERE ei.entity_id = p_entity_id AND ei.organization_id = p_organization_id
          AND (p_tipo = 'atividade' OR ei.interaction_type = 'call')
          AND (v_ts IS NULL OR (ei.interaction_at, ei.id) < (v_ts, v_id))
        ORDER BY ei.interaction_at DESC, ei.id DESC
        LIMIT v_lim + 1
      ) i
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = CASE WHEN i.created_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN i.created_by::uuid END
        LIMIT 1
      ) cu ON true
    ) z;

  ELSIF p_tipo = 'visitas' THEN
    -- Dois ramos por índice (leads e clientes da pessoa); sem ausências,
    -- férias nem quadros de ausências ou de frota. 20261226060000: as
    -- canceladas passam a vir (antes eram escondidas), marcadas com
    -- 'cancelada' = true; o total e a paginação contam-nas.
    v_leads := ARRAY(SELECT l.id FROM public.anew_leads l
                     WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                       AND l.deleted_at IS NULL);
    v_clis  := ARRAY(SELECT c.id FROM public.anew_clients c
                     WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                       AND c.deleted_at IS NULL);

    SELECT count(*) INTO v_total
    FROM (SELECT si.id FROM public.schedule_items si
          WHERE si.lead_id = ANY (v_leads) AND si.organization_id = p_organization_id
          UNION
          SELECT si.id FROM public.schedule_items si
          WHERE si.client_id = ANY (v_clis) AND si.organization_id = p_organization_id) ids
    JOIN public.schedule_items s ON s.id = ids.id
    LEFT JOIN public.schedule_boards b ON b.id = s.board_id
    WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'));

    -- 20261226100000: a página primeiro (com a RLS de quem chama, como antes) e
    -- os responsáveis dessas visitas por fn_neg_ficha_visitas_recursos, que não
    -- passa pela política de schedule_item_assignees (essa voltava a ler toda a
    -- agenda da organização com a RLS de quem chama: cerca de 1,5 s por ficha).
    -- Os recursos continuam a vir de schedule_resources com a RLS de quem chama.
    WITH pagina AS MATERIALIZED (
      SELECT si.*, b.name AS board_nome
      FROM (SELECT x.id FROM public.schedule_items x
            WHERE x.lead_id = ANY (v_leads) AND x.organization_id = p_organization_id
            UNION
            SELECT x.id FROM public.schedule_items x
            WHERE x.client_id = ANY (v_clis) AND x.organization_id = p_organization_id) ids
      JOIN public.schedule_items si ON si.id = ids.id
      LEFT JOIN public.schedule_boards b ON b.id = si.board_id
      WHERE si.time_off_type IS NULL AND si.vacation_id IS NULL
        AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))
        AND (v_ts IS NULL OR (si.start_datetime, si.id) < (v_ts, v_id))
      ORDER BY si.start_datetime DESC, si.id DESC
      LIMIT v_lim + 1
    ),
    atrib AS MATERIALIZED (
      SELECT h.visita_id, h.recurso_id
      FROM public.fn_neg_ficha_visitas_recursos(p_organization_id,
                                                ARRAY(SELECT pg.id FROM pagina pg)) AS h
    )
    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_ts, v_ult_id
    FROM (
      SELECT s.id, s.start_datetime AS em,
             row_number() OVER (ORDER BY s.start_datetime DESC, s.id DESC) AS rn,
             jsonb_build_object(
               'id', s.id, 'inicio', s.start_datetime, 'fim', s.end_datetime, 'status', s.status,
               'resultado', s.visit_outcome, 'tipo', s.visit_kind, 'titulo', s.title,
               'notas', s.description, 'local', s.location, 'negocio_id', s.negocio_id,
               'feito_por_nome', fp.name, 'board_id', s.board_id, 'board_nome', s.board_nome,
               'recursos', rc.lista, 'detalhes', s.metadata -> 'pessoas',
               'cancelada', s.status = 'cancelled'::public.schedule_item_status) AS item
      FROM pagina s
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = s.created_by OR u.auth_user_id = s.created_by
        LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.name,
                                                     'user_id', r.user_id, 'ativo', r.is_active)
                                  ORDER BY r.name, r.id), '[]'::jsonb) AS lista
        FROM atrib a
        JOIN public.schedule_resources r ON r.id = a.recurso_id
        WHERE a.visita_id = s.id
      ) rc ON true
    ) z;

  ELSE -- levantamentos
    SELECT count(*) INTO v_total
    FROM public.levantamentos lt
    WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
      AND lt.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(z.item ORDER BY z.rn) FILTER (WHERE z.rn <= v_lim), '[]'::jsonb),
           count(*) > v_lim,
           (array_agg(z.em ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1],
           (array_agg(z.id ORDER BY z.rn) FILTER (WHERE z.rn = v_lim))[1]
      INTO v_itens, v_mais, v_ult_dt, v_ult_id
    FROM (
      SELECT lt.id, lt.data_levantamento AS em,
             row_number() OVER (ORDER BY lt.data_levantamento DESC, lt.id DESC) AS rn,
             jsonb_build_object(
               'id', lt.id, 'visita_id', lt.visita_id, 'negocio_id', lt.negocio_id,
               'data', lt.data_levantamento, 'estado', lt.estado, 'notas', lt.notas,
               'feito_por_id', lt.feito_por, 'feito_por_nome', fp.name,
               'morada', jsonb_build_object('rua', lt.morada_rua, 'codigo_postal', lt.morada_codigo_postal,
                                            'localidade', lt.morada_localidade, 'andar', lt.morada_andar),
               'n_linhas', ln.n, 'n_respostas', rs.n,
               'linhas', ln.lista, 'respostas', rs.lista) AS item
      FROM (
        SELECT l2.*
        FROM public.levantamentos l2
        WHERE l2.entity_id = p_entity_id AND l2.organization_id = p_organization_id
          AND l2.deleted_at IS NULL
          AND (v_dt IS NULL OR (l2.data_levantamento, l2.id) < (v_dt, v_id))
        ORDER BY l2.data_levantamento DESC, l2.id DESC
        LIMIT v_lim + 1
      ) lt
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u WHERE u.id = lt.feito_por LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'divisao', ll.divisao, 'trabalho', ll.trabalho, 'trabalho_outro', ll.trabalho_outro,
                 'medida', ll.medida, 'unidade', ll.unidade, 'observacoes', ll.observacoes,
                 'ordem', ll.ordem) ORDER BY ll.ordem, ll.id), '[]'::jsonb) AS lista
        FROM public.levantamento_linhas ll
        WHERE ll.levantamento_id = lt.id
      ) ln ON true
      LEFT JOIN LATERAL (
        -- 20261226090000: cada resposta traz o snapshot (o que a pessoa viu e
        -- respondeu); tipo NULL = resposta antiga, só com a chave em 'resposta'.
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'seccao', lr.seccao, 'pergunta', lr.pergunta, 'resposta', lr.resposta,
                 'tipo', lr.tipo, 'pergunta_texto', lr.pergunta_texto, 'seccao_titulo', lr.seccao_titulo,
                 'bloco', lr.bloco, 'ordem', lr.ordem, 'escolhas', lr.escolhas,
                 'escolhas_texto', lr.escolhas_texto, 'valor_texto', lr.valor_texto,
                 'valor_numero', lr.valor_numero)
                 ORDER BY lr.ordem NULLS LAST, lr.seccao, lr.pergunta), '[]'::jsonb) AS lista
        FROM public.levantamento_respostas lr
        WHERE lr.levantamento_id = lt.id
      ) rs ON true
    ) z;
  END IF;

  RETURN jsonb_build_object(
    'total', v_total,
    'tem_mais', v_mais,
    'proximo', CASE WHEN v_mais THEN jsonb_build_object(
                 'em', CASE WHEN p_tipo = 'levantamentos' THEN to_char(v_ult_dt, 'YYYY-MM-DD')
                            ELSE to_char(v_ult_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
                 'id', v_ult_id) END,
    'itens', v_itens);
END;
$function$;

-- ============================================================
-- 3. neg_ficha_pessoa (a partir da versão de 20261226090000; só acrescenta
--    first_name e last_name)
-- ============================================================

CREATE OR REPLACE FUNCTION public.neg_ficha_pessoa(p_organization_id uuid, p_entity_id uuid, p_limite integer DEFAULT 30, p_depois jsonb DEFAULT NULL::jsonb, p_partes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_momento   text;
  v_base      boolean;
  v_lead      public.anew_leads;
  v_cli       public.anew_clients;
  v_lds       uuid[];
  v_pessoa    jsonb;
  v_lead_j    jsonb;
  v_abertas   jsonb;
  v_agreg     jsonb;
  v_perm      jsonb;
  v_negocios  jsonb;
  v_docs      jsonb;
  v_ng        record;
  v_ct        record;
  v_vs        record;
  v_lv_por    bigint;
  v_etapa     text;
  v_res       jsonb;
BEGIN
  -- 1. Valores
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_partes IS NOT NULL AND (cardinality(p_partes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(p_partes) AS x(parte)
           WHERE x.parte IS NULL
              OR x.parte NOT IN ('base', 'contactos', 'visitas', 'levantamentos', 'atividade'))))
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: limite (1 a 100), partes ou páginas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_depois) AS k(chave)
               WHERE k.chave NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')) THEN
      RAISE EXCEPTION 'Valor inválido: páginas.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- 2. Guardas, antes de qualquer leitura de registos; as secções não as
  --    repetem para esta organização e pessoa nesta transacção.
  v_momento := public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  PERFORM set_config('app.neg_ficha_verificada',
                     p_organization_id::text || ':' || p_entity_id::text, true);

  v_base := p_partes IS NULL OR 'base' = ANY (p_partes);

  IF v_base THEN
    -- A lead (a mais recente viva) e o cliente (o mais antigo vivo), como no resumo.
    SELECT l.* INTO v_lead
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 1;
    SELECT c.* INTO v_cli
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
    v_lds := ARRAY(SELECT l.id FROM public.anew_leads l
                   WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                     AND l.deleted_at IS NULL);

    -- Agregados: os mesmos predicados de neg_resumo_pessoas.
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           count(*) AS total,
           max(n.created_at) AS ultimo_em
      INTO v_ng
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id AND n.deleted_at IS NULL;

    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           count(*) AS total
      INTO v_ct
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id AND i.interaction_type = 'call';

    SELECT min(s.start_datetime) FILTER (
             WHERE s.start_datetime >= now()
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(s.start_datetime) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE s.lead_id IS NOT NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
      INTO v_vs
    FROM (
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE si.lead_id = ANY (v_lds)
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
      UNION ALL
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE v_cli.id IS NOT NULL AND si.client_id = v_cli.id
        AND (si.lead_id IS NULL OR si.lead_id <> ALL (v_lds))
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s;

    SELECT count(*) INTO v_lv_por
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = p_entity_id
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz);

    v_etapa := CASE
      WHEN v_cli.id IS NOT NULL THEN 'cliente'
      WHEN v_ng.abertos > 0 THEN 'qualificada'
      WHEN v_vs.visitas_lead > 0 THEN 'visitaMarcada'
      WHEN v_ct.ultimo IS NOT NULL THEN 'emContacto'
      ELSE 'nova'
    END;

    v_agreg := jsonb_build_object(
      'ultimo_contacto_em', v_ct.ultimo,
      'ultimo_resultado', (SELECT i.result FROM public.entity_interactions i
                           WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
                             AND i.interaction_type = 'call'
                           ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1),
      'proximo_contacto_em', public.fn_neg_proximo_contacto(p_organization_id, p_entity_id),
      -- 20261225150000: o contacto EFECTIVO, a regra da Lista (ultimo_resultado):
      -- o mais recente entre a última chamada (acima) e o último contacto
      -- guardado na lead mostrada pela página de Leads (last_contact_at e
      -- last_contact_result); em empate ganha a chamada. É o que a UI deve usar.
      'ultimo_contacto_efetivo_em', GREATEST(v_ct.ultimo, v_lead.last_contact_at),
      'ultimo_resultado_efetivo', CASE
         WHEN v_ct.ultimo IS NULL AND v_lead.last_contact_at IS NULL THEN NULL
         WHEN v_lead.last_contact_at IS NULL OR v_ct.ultimo >= v_lead.last_contact_at THEN
           (SELECT i.result FROM public.entity_interactions i
            WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
              AND i.interaction_type = 'call'
            ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1)
         ELSE v_lead.last_contact_result::text END,
      'ultima_visita_feita_em', v_vs.ultima_feita,
      'proxima_visita_em', v_vs.proxima,
      'por_ligar', jsonb_build_object('contactos', v_ct.por_ligar, 'visitas', v_vs.por_ligar,
                                      'levantamentos', v_lv_por),
      'negocios', jsonb_build_object('abertos', v_ng.abertos, 'ganhos', v_ng.ganhos,
                                     'perdidos', v_ng.perdidos),
      'total_contactos', v_ct.total,
      'total_visitas', (SELECT count(*)
                        FROM (SELECT si.id FROM public.schedule_items si
                              WHERE si.lead_id = ANY (v_lds) AND si.organization_id = p_organization_id
                              UNION
                              SELECT si.id FROM public.schedule_items si
                              WHERE si.organization_id = p_organization_id
                                AND si.client_id IN (SELECT c.id FROM public.anew_clients c
                                                     WHERE c.organization_id = p_organization_id
                                                       AND c.entity_id = p_entity_id
                                                       AND c.deleted_at IS NULL)) ids
                        JOIN public.schedule_items s ON s.id = ids.id
                        LEFT JOIN public.schedule_boards b ON b.id = s.board_id
                        WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
                          AND s.status <> 'cancelled'::public.schedule_item_status
                          AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))),
      'total_levantamentos', (SELECT count(*) FROM public.levantamentos lt
                              WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
                                AND lt.deleted_at IS NULL),
      'total_atividade', (SELECT count(*) FROM public.entity_interactions i
                          WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id));

    -- Pessoa
    SELECT jsonb_build_object(
      'id', p_entity_id,
      'nome', e.display_name,
      -- 20261226100000: o nome em partes (anew_entities), para o ecrã não ter de
      -- partir display_name; NULL quando a entidade não as tem.
      'first_name', e.first_name,
      'last_name', e.last_name,
      'papel', CASE WHEN v_cli.id IS NOT NULL THEN 'cliente' ELSE 'lead' END,
      'lead_id', v_lead.id,
      'client_id', v_cli.id,
      'responsavel_id', COALESCE(v_cli.assigned_to, v_lead.assigned_to),
      'responsavel_nome', (SELECT u.name FROM public.anew_users u
                           WHERE u.id = COALESCE(v_cli.assigned_to, v_lead.assigned_to)),
      'etapa', v_etapa,
      'desde', LEAST((SELECT min(l.created_at) FROM public.anew_leads l
                      WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                        AND l.deleted_at IS NULL),
                     v_cli.created_at),
      'contacto', jsonb_build_object(
        'telefone', (SELECT ph.phone_number FROM public.anew_entity_phones ph
                     WHERE ph.entity_id = p_entity_id
                     ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC LIMIT 1),
        'email', (SELECT em.email FROM public.anew_entity_emails em
                  WHERE em.entity_id = p_entity_id
                  ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1)),
      'morada', (SELECT jsonb_build_object(
                          'rua', NULLIF(btrim(concat_ws(' ', a.street, a.number)), ''),
                          'codigo_postal', a.postal_code, 'localidade', a.city,
                          'andar', a.floor, 'distrito', a.district)
                 FROM public.anew_entity_addresses ea
                 JOIN public.anew_addresses a ON a.id = ea.address_id
                 WHERE ea.entity_id = p_entity_id
                   AND (ea.valid_to IS NULL OR ea.valid_to > now())
                 ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
                 LIMIT 1),
      -- As respostas da aba Qualificação do levantamento vivo mais recente que as tenha
      -- (ql, abaixo). 20261226090000: 'qualificacao' fica {pergunta: chave} só com as de
      -- escolha única (hoje são todas); 'qualificacao_respostas' traz as mesmas com o
      -- snapshot (textos, tipo, escolhas, valores), do mesmo levantamento.
      'qualificacao', (SELECT jsonb_object_agg(lr.pergunta, lr.resposta) FILTER (WHERE lr.resposta IS NOT NULL)
                       FROM public.levantamento_respostas lr
                       WHERE lr.seccao = 'qualificacao'
                         AND lr.levantamento_id = ql.id),
      'qualificacao_respostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'seccao', lr.seccao, 'pergunta', lr.pergunta, 'resposta', lr.resposta,
                                   'tipo', lr.tipo, 'pergunta_texto', lr.pergunta_texto,
                                   'seccao_titulo', lr.seccao_titulo, 'bloco', lr.bloco, 'ordem', lr.ordem,
                                   'escolhas', lr.escolhas, 'escolhas_texto', lr.escolhas_texto,
                                   'valor_texto', lr.valor_texto, 'valor_numero', lr.valor_numero)
                                   ORDER BY lr.ordem NULLS LAST, lr.pergunta), '[]'::jsonb)
                                 FROM public.levantamento_respostas lr
                                 WHERE lr.seccao = 'qualificacao'
                                   AND lr.levantamento_id = ql.id),
      'origem', CASE WHEN v_lead.id IS NULL THEN NULL ELSE jsonb_build_object(
                  'origin', v_lead.origin,
                  'source', v_lead.source,
                  'campanha_id', v_lead.campaign_id,
                  'campanha', (SELECT ca.name FROM public.campaigns ca WHERE ca.id = v_lead.campaign_id),
                  'formulario_id', (SELECT f.id FROM public.campaigns ca
                                    JOIN public.forms f ON f.id = ca.form_id
                                    WHERE ca.id = v_lead.campaign_id),
                  'formulario', (SELECT f.name FROM public.campaigns ca
                                 JOIN public.forms f ON f.id = ca.form_id
                                 WHERE ca.id = v_lead.campaign_id)) END,
      'nif', NULL,
      'empresa', NULL,
      -- 20261225150000: MQL/SQL da lead mostrada (v_lead); as respostas da aba
      -- Qualificação continuam na chave 'qualificacao', acima.
      'qualificacao_tipo', v_lead.qualification_type,
      -- «Voltou a contactar»: a regra da página de Leads, contando também as
      -- chamadas registadas (entity_interactions 'call', onde escreve
      -- neg_registar_contacto).
      'ultima_atividade_em', v_lead.last_activity_at,
      'ultimo_contacto_lead_em', v_lead.last_contact_at,
      'voltou_a_contactar', (v_lead.last_activity_at IS NOT NULL
                             AND (GREATEST(v_lead.last_contact_at, v_ct.ultimo) IS NULL
                                  OR v_lead.last_activity_at > GREATEST(v_lead.last_contact_at, v_ct.ultimo))),
      -- Identidade: tipo da entidade, nome da empresa (organização) e se há
      -- NIF, só em leitura. O NIF nunca sai daqui, nem o id da entidade
      -- fiscal: só se há uma ligação fiscal PRINCIPAL em vigor.
      'tipo', e.type,
      'empresa_nome', CASE WHEN e.type = 'organization' THEN e.display_name END,
      'tem_nif', fe.fid IS NOT NULL)
      INTO v_pessoa
    FROM (SELECT 1) AS um
    LEFT JOIN public.anew_entities e ON e.id = p_entity_id
    LEFT JOIN LATERAL (
      SELECT aef.fiscal_entity_id AS fid
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.entity_id = p_entity_id AND aef.is_primary IS TRUE
        AND (aef.valid_to IS NULL OR aef.valid_to > now())
      ORDER BY aef.created_at DESC, aef.id DESC
      LIMIT 1
    ) fe ON true
    LEFT JOIN LATERAL (
      SELECT lt.id FROM public.levantamentos lt
      WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
        AND lt.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.levantamento_respostas q
                    WHERE q.levantamento_id = lt.id AND q.seccao = 'qualificacao')
      ORDER BY lt.data_levantamento DESC, lt.created_at DESC, lt.id DESC
      LIMIT 1
    ) ql ON true;

    -- Lead e encerramento (a nota 'Abordagem encerrada' mais recente).
    IF v_lead.id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', v_lead.id,
        'estado', v_lead.status,
        'aberta', public.fn_neg_lead_aberta(v_lead.status::text) AND v_lead.closure_result IS NULL,
        'encerramento', CASE WHEN v_lead.closure_result IS NULL THEN NULL ELSE jsonb_build_object(
          'resultado', v_lead.closure_result,
          'motivo', nt.result,
          'motivo_outro', CASE WHEN nt.result = 'outro' THEN nt.notes END,
          'em', nt.interaction_at) END)
        INTO v_lead_j
      FROM (SELECT 1) AS um
      LEFT JOIN LATERAL (
        SELECT i.result, i.notes, i.interaction_at
        FROM public.entity_interactions i
        WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
          AND i.interaction_type = 'note' AND i.subject = 'Abordagem encerrada'
        ORDER BY i.interaction_at DESC, i.id DESC
        LIMIT 1
      ) nt ON true;
    END IF;

    v_abertas := (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                           'id', l.id, 'status', l.status, 'created_at', l.created_at,
                           'closure_result', l.closure_result) ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb)
                  FROM (SELECT l1.* FROM public.anew_leads l1
                        WHERE l1.organization_id = p_organization_id AND l1.entity_id = p_entity_id
                          AND l1.deleted_at IS NULL AND public.fn_neg_lead_aberta(l1.status::text)
                        ORDER BY l1.created_at DESC, l1.id DESC
                        LIMIT 20) l);

    v_perm := jsonb_build_object(
      'editar', public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'),
      'criar',  public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create'));

    -- Negócios (até 50, recentes primeiro), com documentos e os últimos 10 eventos.
    v_negocios := jsonb_build_object(
      'total', v_ng.total,
      'itens', (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
                FROM (
                  SELECT n.id, n.created_at,
                    jsonb_build_object(
                      'id', n.id, 'titulo', n.titulo, 'notas', n.notas, 'estado', n.estado,
                      'criado_em', n.created_at, 'ganho_em', n.ganho_em, 'perdido_em', n.perdido_em,
                      'fase_perda', n.fase_perda, 'motivo_perda', n.motivo_perda,
                      'responsavel_id', n.assigned_to,
                      'responsavel_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = n.assigned_to),
                      'valor', public.fn_neg_valor_negocio(n.id),
                      'pronto_a_ganhar', n.estado = 'aberto' AND CASE
                        WHEN v_momento = 'proposta_aceite' THEN EXISTS (
                          SELECT 1 FROM public.proposals pr
                          WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                            AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
                        WHEN v_momento = 'contrato_assinado' THEN EXISTS (
                          SELECT 1 FROM public.client_contracts cc
                          WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado')
                            AND cc.deleted_at IS NULL)
                        ELSE false END,
                      'parado_desde', CASE WHEN n.estado = 'aberto'
                                           THEN public.fn_neg_parado_desde(n.id) END,
                      'levantamento_id', (SELECT lt.id FROM public.levantamentos lt
                                          WHERE lt.negocio_id = n.id AND lt.deleted_at IS NULL LIMIT 1),
                      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                                       'total', q.total, 'criado_em', q.created_at)
                                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                                     FROM public.quotes q
                                     WHERE q.negocio_id = n.id AND q.deleted_at IS NULL),
                      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                                      'criado_em', pr.created_at)
                                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                                    FROM public.proposals pr
                                    WHERE pr.negocio_id = n.id AND pr.deleted_at IS NULL
                                      AND pr.is_deleted IS NOT TRUE),
                      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                                      'criado_em', cc.created_at,
                                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                                    FROM public.client_contracts cc
                                    WHERE cc.negocio_id = n.id AND cc.deleted_at IS NULL),
                      'eventos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                    'id', ev.id, 'tipo', ev.tipo, 'fase', ev.fase, 'motivo', ev.motivo,
                                    'motivo_reabertura', ev.motivo_reabertura, 'criado_em', ev.created_at,
                                    'criado_por_nome', (SELECT u.name FROM public.anew_users u
                                                        WHERE u.id = ev.created_by))
                                    ORDER BY ev.created_at DESC, ev.id DESC), '[]'::jsonb)
                                  FROM (SELECT e1.* FROM public.negocio_eventos e1
                                        WHERE e1.negocio_id = n.id
                                        ORDER BY e1.created_at DESC, e1.id DESC
                                        LIMIT 10) ev)
                    ) AS item
                  FROM (SELECT n1.* FROM public.negocios n1
                        WHERE n1.organization_id = p_organization_id AND n1.entity_id = p_entity_id
                          AND n1.deleted_at IS NULL
                        ORDER BY n1.created_at DESC, n1.id DESC
                        LIMIT 50) n
                ) x));

    -- Documentos da pessoa ainda sem negócio (até 50 de cada).
    v_docs := jsonb_build_object(
      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                       'total', q.total, 'criado_em', q.created_at)
                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                     FROM (SELECT q1.* FROM public.quotes q1
                           WHERE q1.entity_id = p_entity_id AND q1.organization_id = p_organization_id
                             AND q1.deleted_at IS NULL AND q1.negocio_id IS NULL
                           ORDER BY q1.created_at DESC, q1.id DESC LIMIT 50) q),
      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                      'criado_em', pr.created_at)
                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                    FROM (SELECT p1.* FROM public.proposals p1
                          WHERE p1.entity_id = p_entity_id AND p1.organization_id = p_organization_id
                            AND p1.deleted_at IS NULL AND p1.is_deleted IS NOT TRUE AND p1.negocio_id IS NULL
                          ORDER BY p1.created_at DESC, p1.id DESC LIMIT 50) pr),
      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                      'criado_em', cc.created_at,
                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                    FROM (SELECT c1.* FROM public.client_contracts c1
                          WHERE c1.entity_id = p_entity_id AND c1.organization_id = p_organization_id
                            AND c1.deleted_at IS NULL AND c1.negocio_id IS NULL
                          ORDER BY c1.created_at DESC, c1.id DESC LIMIT 50) cc));
  END IF;

  v_res := jsonb_build_object(
    'pessoa', v_pessoa,
    'lead', v_lead_j,
    'leads_abertas', v_abertas,
    'agregados', v_agreg,
    'permissoes', v_perm,
    'negocios', v_negocios,
    'documentos_por_ligar', v_docs,
    'contactos', CASE WHEN p_partes IS NULL OR 'contactos' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'contactos', p_limite,
                                              p_depois -> 'contactos') END,
    'visitas', CASE WHEN p_partes IS NULL OR 'visitas' = ANY (p_partes) THEN
                 public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'visitas', p_limite,
                                            p_depois -> 'visitas') END,
    'levantamentos', CASE WHEN p_partes IS NULL OR 'levantamentos' = ANY (p_partes) THEN
                       public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'levantamentos', p_limite,
                                                  p_depois -> 'levantamentos') END,
    'atividade', CASE WHEN p_partes IS NULL OR 'atividade' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'atividade', p_limite,
                                              p_depois -> 'atividade') END);

  -- Repõe a marca: as guardas só ficam dispensadas durante esta chamada.
  PERFORM set_config('app.neg_ficha_verificada', '', true);
  RETURN v_res;
END;
$function$;

-- Privilégios das substituídas: os de antes (CREATE OR REPLACE mantém-nos;
-- o CONFERIR confirma).

-- ============================================================
-- 4. Limites das respostas de escolha
-- ============================================================

ALTER TABLE public.levantamento_respostas
  ADD CONSTRAINT levantamento_respostas_escolhas_limites_check
    CHECK ((escolhas IS NULL
            OR (array_ndims(escolhas) = 1 AND cardinality(escolhas) BETWEEN 1 AND 30
                AND array_position(escolhas, NULL::text) IS NULL
                AND strpos(array_to_string(escolhas, ''), ',') = 0
                AND array_to_string(escolhas, ',')
                    ~ '^[a-z0-9][A-Za-z0-9]{0,39}(,[a-z0-9][A-Za-z0-9]{0,39})*$'))
           AND (escolhas_texto IS NULL
            OR (array_ndims(escolhas_texto) = 1 AND cardinality(escolhas_texto) BETWEEN 1 AND 30
                AND array_position(escolhas_texto, NULL::text) IS NULL
                AND '' <> ALL (escolhas_texto)
                AND strpos(array_to_string(escolhas_texto, ''), chr(1)) = 0
                AND array_to_string(escolhas_texto, chr(1)) !~ '[^\x01]{81}')));

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  c_nike CONSTANT uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_txt  text;
  v_n    bigint;
  v_con  text;
  v_caso record;
BEGIN
  -- 1. Atributos e privilégios.
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_ficha_visitas_recursos(uuid,uuid[])',         true,  false),
              ('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)',   false, true),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])',    false, true)
            ) AS e(sig, definer, service)
            LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef <> e.definer
               OR p.provolatile::text <> 's'
               OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres'
               OR array_to_string(p.proconfig, ',') NOT LIKE 'search_path=public, pg_temp%'
               OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
               OR NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR (NOT e.service AND pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))
               OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
                          WHERE a.grantee = 0));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. atributos ou privilégios): %', v_txt;
  END IF;

  -- 2. As versões são as desta migration.
  IF md5(pg_catalog.pg_get_functiondef('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)'::regprocedure))
       IS DISTINCT FROM 'ec1004c414153983125c51c56fe44528'
     OR md5(pg_catalog.pg_get_functiondef('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])'::regprocedure))
       IS DISTINCT FROM '4259d437c0325056eafa10a984b9fc01'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                    WHERE p.oid = 'public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)'::regprocedure
                      AND p.prosrc LIKE '%public.fn_neg_ficha_visitas_recursos(p_organization_id%'
                      AND p.prosrc NOT LIKE '%schedule_item_assignees a%') THEN
    RAISE EXCEPTION 'CONFERIR (2. versões das funções substituídas)';
  END IF;

  -- 3. A função nova: sem sessão não devolve nada; mais de 101 ids, NG009.
  SELECT count(*) INTO v_n
  FROM public.fn_neg_ficha_visitas_recursos(c_nike,
         ARRAY(SELECT si.id FROM public.schedule_items si WHERE si.organization_id = c_nike LIMIT 101));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR (3. sem sessão devolveu responsáveis)';
  END IF;
  BEGIN
    PERFORM public.fn_neg_ficha_visitas_recursos(c_nike, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 102)));
    RAISE EXCEPTION 'CONFERIR (3. 102 ids sem NG009)';
  EXCEPTION WHEN SQLSTATE 'NG009' THEN
    NULL;
  END;

  -- 4. As políticas da agenda ficaram como estavam.
  IF (SELECT md5(string_agg(c.relname::text || '|' || p.polname::text || '|' || p.polcmd::text || '|'
                         || p.polpermissive::text || '|'
                         || COALESCE((SELECT string_agg(r::text, ',' ORDER BY r) FROM unnest(p.polroles) AS r), '')
                         || '|' || COALESCE(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
                         E'\n' ORDER BY c.relname::text, p.polname::text))
          FROM pg_catalog.pg_policy p
          JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
          WHERE c.relnamespace = 'public'::regnamespace
            AND c.relname::text IN ('schedule_items', 'schedule_item_assignees')
            AND p.polcmd::text IN ('r', '*')) IS DISTINCT FROM '5895bc07278d429ff59f19f0176cc09b' THEN
    RAISE EXCEPTION 'CONFERIR (4. políticas da agenda)';
  END IF;

  -- 5. O CHECK, validado e a funcionar: numa cópia temporária da tabela com
  --    os mesmos CHECK (sem gatilhos nem chaves estrangeiras).
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
                 WHERE c.conrelid = 'public.levantamento_respostas'::regclass
                   AND c.conname::text = 'levantamento_respostas_escolhas_limites_check'
                   AND c.contype::text = 'c' AND c.convalidated) THEN
    RAISE EXCEPTION 'CONFERIR (5. CHECK em falta ou por validar)';
  END IF;
  CREATE TEMP TABLE t_conferir_respostas
    (LIKE public.levantamento_respostas INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
  FOR v_caso IN
    SELECT x.nome, x.tipo, x.esc, x.txt, x.passa
    FROM (VALUES
      ('unica',            'escolha_unica',    ARRAY['facil'],                      ARRAY['Fácil'],                       true),
      ('multipla',         'escolha_multipla', ARRAY['p5', 'p10'],                  ARRAY['5%', '10%'],                  true),
      ('80 caracteres',    'escolha_multipla', ARRAY['a1'],                         ARRAY[repeat('x', 80)],               true),
      ('30 elementos',     'escolha_multipla', ARRAY(SELECT 'o' || g::text FROM generate_series(1, 30) AS g),
                                               ARRAY(SELECT 'T' || g::text FROM generate_series(1, 30) AS g),   true),
      ('81 caracteres',    'escolha_multipla', ARRAY['a1'],                         ARRAY[repeat('x', 81)],               false),
      ('texto vazio',      'escolha_multipla', ARRAY['a1', 'a2'],                   ARRAY['A', ''],                       false),
      ('0x01 no texto',    'escolha_multipla', ARRAY['a1', 'a2'],                   ARRAY['A', 'B' || chr(1) || 'C'],     false),
      ('chave com hífen',  'escolha_multipla', ARRAY['a-1'],                        ARRAY['A'],                           false),
      ('chave longa',      'escolha_multipla', ARRAY['a' || repeat('b', 40)],       ARRAY['A'],                           false),
      ('chave com vírgula','escolha_multipla', ARRAY['a,b'],                        ARRAY['A'],                           false),
      ('31 elementos',     'escolha_multipla', ARRAY(SELECT 'o' || g::text FROM generate_series(1, 31) AS g),
                                               ARRAY(SELECT 'T' || g::text FROM generate_series(1, 31) AS g),   false)
    ) AS x(nome, tipo, esc, txt, passa)
  LOOP
    v_con := NULL;
    BEGIN
      INSERT INTO t_conferir_respostas
        (levantamento_id, organization_id, seccao, pergunta, resposta, tipo, pergunta_texto,
         seccao_titulo, ordem, escolhas, escolhas_texto)
      VALUES (gen_random_uuid(), c_nike, 'exterior', 'acesso',
              CASE WHEN v_caso.tipo = 'escolha_unica' THEN v_caso.esc[1] END,
              v_caso.tipo, 'Pergunta', 'Secção', 0, v_caso.esc, v_caso.txt);
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      v_con := COALESCE(v_con, '?');
    END;
    IF v_caso.passa AND v_con IS NOT NULL THEN
      RAISE EXCEPTION 'CONFERIR (5. % recusado por %)', v_caso.nome, v_con;
    ELSIF NOT v_caso.passa AND v_con IS NULL THEN
      RAISE EXCEPTION 'CONFERIR (5. % passou)', v_caso.nome;
    ELSIF NOT v_caso.passa AND v_caso.nome <> '31 elementos'
          AND v_con <> 'levantamento_respostas_escolhas_limites_check' THEN
      RAISE EXCEPTION 'CONFERIR (5. % recusado por %, não pelo CHECK novo)', v_caso.nome, v_con;
    END IF;
  END LOOP;
END
$conferir$;

COMMIT;

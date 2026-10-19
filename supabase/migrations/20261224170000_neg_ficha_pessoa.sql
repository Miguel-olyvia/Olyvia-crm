-- ============================================================
-- 20261224170000_neg_ficha_pessoa (M2)
-- ============================================================
-- O que faz: funções NOVAS de leitura da ficha da pessoa, todas STABLE e
--   INVOKER (a RLS de cada tabela decide; uma linha invisível não vem):
--   - neg_ficha_pessoa: a ficha numa chamada (pessoa, lead, leads abertas,
--     agregados, permissões, negócios com documentos e eventos, documentos
--     por ligar e a 1.ª página de contactos, visitas, levantamentos e
--     actividade). p_partes escolhe as partes ('base', 'contactos',
--     'visitas', 'levantamentos', 'atividade'); as chaves vêm sempre, a
--     null quando não pedidas.
--   - neg_registos_pessoa: a página seguinte de uma secção (mesmo formato).
--   - fn_neg_ficha_seccao: uma secção paginada por chave (em, id); usada
--     pelas duas. Tem as próprias guardas, porque também se pode chamar;
--     salta-as só quando neg_ficha_pessoa já as passou nesta transacção para
--     a mesma organização e pessoa (app.neg_ficha_verificada, local à
--     transacção; o PostgREST não deixa o cliente escrevê-la). Não pode ser
--     uma variante sem EXECUTE para authenticated: as chamadoras são INVOKER
--     e correm como authenticated.
--   - fn_neg_parado_desde e fn_neg_proximo_contacto: as duas regras
--     partilhadas com o Quadro (neg_resumo_quadro, M9), uma só definição.
--     Só lêem o que a RLS já mostra directamente pela API.
--   Guardas, antes de ler qualquer registo: valores (NG009), configuração
--   (NG008; a linha de configuração só se lê com pessoas.view na
--   organização) e pessoa visível (NG003, fn_neg_exigir_pessoa). É esta
--   guarda que impede ler as notas de quem não se vê: a RLS de
--   entity_interactions só pede a organização.
--   A etapa, os agregados e os negócios abertos seguem as regras de
--   neg_resumo_pessoas, salvo as visitas: aqui (e no Quadro) contam só as
--   das leads vivas; o resumo conta também as de leads apagadas. As visitas
--   por ligar usam o cliente vivo mais antigo, como o resumo e o Quadro. nif e empresa vêm a null (sem fonte confirmada).
-- SÓ ACRESCENTA. Não escreve nada. Não bloqueia tabelas. Nada da Mudelar
--   (D1: sem configuração dá NG008).
-- DESEMPENHO: não medido. statement_timeout de 5 s em cada função. Medir na
--   nike antes de ligar a ficha (alvo p95 abaixo de 300 ms).
-- A UI precisa de: ler a ficha daqui; pedir mais registos a
--   neg_registos_pessoa com o "proximo" recebido; regenerar os tipos.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_valor_negocio(uuid)') IS NULL
     OR to_regprocedure('public.fn_neg_exigir_pessoa(uuid,uuid)') IS NULL
     OR to_regprocedure('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])') IS NOT NULL
     OR to_regprocedure('public.fn_neg_parado_desde(uuid)') IS NOT NULL
     OR to_regprocedure('public.fn_neg_proximo_contacto(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam as funções neg anteriores ou a ficha já existe; nada feito.';
  END IF;
END;
$$;

-- Partilhada com neg_resumo_quadro (M9): desde quando um negócio está
-- parado. Só em orçamento ou proposta: o created_at mais recente dos
-- documentos vivos da fase actual; com contrato, ou sem documentos, NULL.
CREATE FUNCTION public.fn_neg_parado_desde(p_negocio_id uuid)
  RETURNS timestamptz
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.client_contracts cc
                 WHERE cc.negocio_id = p_negocio_id AND cc.deleted_at IS NULL) THEN NULL
    ELSE COALESCE(
      (SELECT max(pr.created_at) FROM public.proposals pr
       WHERE pr.negocio_id = p_negocio_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE),
      (SELECT max(q.created_at) FROM public.quotes q
       WHERE q.negocio_id = p_negocio_id AND q.deleted_at IS NULL))
  END;
$function$;

-- Partilhada com neg_resumo_quadro (M9): o próximo contacto de uma pessoa
-- é o do registo mais recente entre contactos e adiamentos (nota com
-- callback); um contacto posterior sem próxima acção apaga-o.
CREATE FUNCTION public.fn_neg_proximo_contacto(p_organization_id uuid, p_entity_id uuid)
  RETURNS timestamptz
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT i.next_action_date
  FROM public.entity_interactions i
  WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
    AND (i.interaction_type = 'call'
         OR (i.interaction_type = 'note' AND i.next_action_type = 'callback'))
  ORDER BY i.interaction_at DESC, i.id DESC
  LIMIT 1;
$function$;

-- Uma secção da ficha, paginada por (em, id) descendente.
CREATE FUNCTION public.fn_neg_ficha_seccao(
  p_organization_id uuid,
  p_entity_id uuid,
  p_tipo text,
  p_limite integer,
  p_depois jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
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

  v_lim := CASE WHEN p_tipo = 'levantamentos' THEN LEAST(p_limite, 10) ELSE p_limite END;

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
    -- férias, quadros de ausências ou de frota, nem canceladas.
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
      AND s.status <> 'cancelled'::public.schedule_item_status
      AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'));

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
               'recursos', rc.lista, 'detalhes', s.metadata -> 'pessoas') AS item
      FROM (
        SELECT si.*, b.name AS board_nome
        FROM (SELECT x.id FROM public.schedule_items x
              WHERE x.lead_id = ANY (v_leads) AND x.organization_id = p_organization_id
              UNION
              SELECT x.id FROM public.schedule_items x
              WHERE x.client_id = ANY (v_clis) AND x.organization_id = p_organization_id) ids
        JOIN public.schedule_items si ON si.id = ids.id
        LEFT JOIN public.schedule_boards b ON b.id = si.board_id
        WHERE si.time_off_type IS NULL AND si.vacation_id IS NULL
          AND si.status <> 'cancelled'::public.schedule_item_status
          AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))
          AND (v_ts IS NULL OR (si.start_datetime, si.id) < (v_ts, v_id))
        ORDER BY si.start_datetime DESC, si.id DESC
        LIMIT v_lim + 1
      ) s
      LEFT JOIN LATERAL (
        SELECT u.name FROM public.anew_users u
        WHERE u.id = s.created_by OR u.auth_user_id = s.created_by
        LIMIT 1
      ) fp ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.name,
                                                     'user_id', r.user_id, 'ativo', r.is_active)
                                  ORDER BY r.name, r.id), '[]'::jsonb) AS lista
        FROM public.schedule_item_assignees a
        JOIN public.schedule_resources r ON r.id = a.resource_id
        WHERE a.item_id = s.id
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
        SELECT count(*) AS n,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'seccao', lr.seccao, 'pergunta', lr.pergunta, 'resposta', lr.resposta)
                 ORDER BY lr.seccao, lr.pergunta), '[]'::jsonb) AS lista
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

CREATE FUNCTION public.neg_registos_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_tipo text,
  p_limite integer DEFAULT 30,
  p_depois jsonb DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
  SELECT public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, p_tipo, p_limite, p_depois);
$function$;

CREATE FUNCTION public.neg_ficha_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_limite integer DEFAULT 30,
  p_depois jsonb DEFAULT NULL,
  p_partes text[] DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
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
    ORDER BY l.created_at DESC
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
      -- As respostas da aba Qualificação do levantamento vivo mais recente que as tenha.
      'qualificacao', (SELECT jsonb_object_agg(lr.pergunta, lr.resposta)
                       FROM public.levantamento_respostas lr
                       WHERE lr.seccao = 'qualificacao'
                         AND lr.levantamento_id = (
                           SELECT lt.id FROM public.levantamentos lt
                           WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
                             AND lt.deleted_at IS NULL
                             AND EXISTS (SELECT 1 FROM public.levantamento_respostas q
                                         WHERE q.levantamento_id = lt.id AND q.seccao = 'qualificacao')
                           ORDER BY lt.data_levantamento DESC, lt.created_at DESC, lt.id DESC
                           LIMIT 1)),
      'origem', CASE WHEN v_lead.id IS NULL THEN NULL ELSE jsonb_build_object(
                  'origin', v_lead.origin,
                  'source', v_lead.source,
                  'campanha', (SELECT ca.name FROM public.campaigns ca WHERE ca.id = v_lead.campaign_id),
                  'formulario', (SELECT f.name FROM public.campaigns ca
                                 JOIN public.forms f ON f.id = ca.form_id
                                 WHERE ca.id = v_lead.campaign_id)) END,
      'nif', NULL,
      'empresa', NULL)
      INTO v_pessoa
    FROM (SELECT 1) AS um
    LEFT JOIN public.anew_entities e ON e.id = p_entity_id;

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

REVOKE ALL ON FUNCTION public.fn_neg_parado_desde(uuid)                              FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_proximo_contacto(uuid, uuid)                    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_parado_desde(uuid)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_proximo_contacto(uuid, uuid)                 TO authenticated;
REVOKE ALL ON FUNCTION public.fn_neg_ficha_seccao(uuid, uuid, text, integer, jsonb)  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_registos_pessoa(uuid, uuid, text, integer, jsonb)  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_ficha_pessoa(uuid, uuid, integer, jsonb, text[])   FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_ficha_seccao(uuid, uuid, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_registos_pessoa(uuid, uuid, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_ficha_pessoa(uuid, uuid, integer, jsonb, text[])  TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, INVOKER, STABLE, search_path e timeout fixos,
  --    sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)'),
              ('public.neg_registos_pessoa(uuid,uuid,text,integer,jsonb)'),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])')
            ) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 's'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp,statement_timeout=5s'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções novas): falha em %', v_txt;
  END IF;

  -- 1b. auxiliares partilhadas com o Quadro: INVOKER, STABLE, search_path fixo,
  --     sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_parado_desde(uuid)'),
              ('public.fn_neg_proximo_contacto(uuid,uuid)')
            ) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 's'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1b. auxiliares partilhadas): falha em %', v_txt;
  END IF;

  -- 2. funções de que dependem, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',     '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_lead_aberta(text)',            'cb988326544ed75840624bfb78e55b7f'),
              ('public.fn_neg_valor_negocio(uuid)',          '2d3b4bc5cdbdb147b6638a2411506298')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 3. colunas lidas cujo nome ou tipo não é óbvio
  IF (SELECT count(*)
      FROM (VALUES
              ('entity_interactions', 'next_action_date', 'timestamp with time zone'),
              ('entity_interactions', 'created_by', 'text'),
              ('proposals', 'proposal_number', 'text'),
              ('proposals', 'terms', 'jsonb'),
              ('quotes', 'quote_number', 'text'),
              ('client_contracts', 'contract_number', 'text'),
              ('client_contracts', 'signature_date', 'timestamp with time zone'),
              ('client_contracts', 'total_value', 'numeric'),
              ('anew_addresses', 'postal_code', 'text'),
              ('anew_entity_addresses', 'valid_to', 'timestamp with time zone'),
              ('campaigns', 'form_id', 'uuid'),
              ('anew_leads', 'origin', 'text'),
              ('schedule_items', 'metadata', 'jsonb'),
              ('levantamentos', 'data_levantamento', 'date')
            ) AS e(t, c, ty)
      JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.t)
                         AND a.attname::text = e.c AND NOT a.attisdropped
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 14 THEN
    RAISE EXCEPTION 'CONFERIR (3. colunas lidas)';
  END IF;
END;
$$;

COMMIT;

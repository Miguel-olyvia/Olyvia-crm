-- ============================================================
-- 20261226060000_neg_ficha_visitas_canceladas_levantamentos
-- ============================================================
-- O que faz: duas decisões do utilizador (20/10) sobre a ficha da página
--   Pessoas. Só leitura. Altera UMA função, fn_neg_ficha_seccao, que serve
--   as secções da ficha (neg_ficha_pessoa e neg_registos_pessoa chamam-na
--   com o p_limite que recebem e NÃO mudam).
--   1. VISITAS CANCELADAS NA FICHA (secção 'visitas'): as canceladas passam
--      a vir, em vez de serem escondidas. Cada visita ganha a chave
--      'cancelada' (boolean); 'status' já dizia 'cancelled'. O 'total' e a
--      paginação da secção passam a contá-las. agregados.total_visitas (em
--      neg_ficha_pessoa) continua SEM as canceladas, como a Lista.
--      Continuam de fora as ausências, as férias e os quadros de ausências
--      e de frota.
--   2. TODOS OS LEVANTAMENTOS (secção 'levantamentos'): a página deixa de
--      ter o tecto de 10 e passa a ter p_limite itens (1 a 100; a ficha da
--      UI pede 30), como os contactos, as visitas e a actividade. Os
--      seguintes vêm pelo mecanismo que já existe: 'tem_mais' e 'proximo'
--      da secção, pedidos com p_depois = {"levantamentos": proximo} e
--      p_partes = {levantamentos} (useFichaPessoa.carregarMais) ou por
--      neg_registos_pessoa. Mesma ordem e mesma chave de página.
-- NÃO FAZ (decisão do utilizador, 20/10): uma pessoa com visita marcada tem
--   simplesmente visita marcada. Marcar uma visita NÃO conta como contacto,
--   não se grava nota nenhuma e nada do motor de leads muda.
--   neg_guardar_visita, neg_ficha_pessoa, neg_resumo_pessoas e
--   fn_neg_filtro_pessoas ficam como estão no remoto (não são recriadas).
-- RETORNO: só aditivo na forma (chave nova 'cancelada' em cada visita; as
--   chaves e os tipos de todas as secções iguais). Muda o conteúdo: a
--   secção de visitas traz também as canceladas, e a de levantamentos traz
--   até p_limite por página.
-- O resto da função é o texto lido no remoto a 20/10 (pg_get_functiondef),
--   com as alterações acima e nada mais.
-- SÓ ALTERA um objecto NOSSO. Nenhuma tabela, índice, política, trigger ou
--   função partilhada. Não bloqueia tabelas. Nenhuma escrita.
-- MUDELAR: a função exige a configuração da página Pessoas
--   (negocio_workflow_config); a Mudelar não a tem (segundo
--   20261225150000), por isso nada muda para ela. Não foi relido agora.
-- PERMISSÕES: EXECUTE só para authenticated (sem PUBLIC, anon nem
--   service_role), como estava; INVOKER; search_path fixo;
--   statement_timeout de 5 s, como estava.
-- PRECISA DE CÓDIGO, NA MESMA ENTREGA (sem ele o ecrã fica errado):
--   - adaptarRegistos.ts (estadoDaVisita) trata hoje TUDO o que não é
--     'completed' como «por fazer»: uma visita cancelada passaria a aparecer
--     como por fazer, a pedir resultado, a contar para escolher o tipo
--     (levantamento ou revisita) e a ser oferecida para ligar a um negócio
--     ou a um levantamento. Ler 'cancelada' (ou status 'cancelled') ANTES
--     de publicar esta migration.
--   - Levantamentos: para ter todos, pedir as páginas seguintes enquanto
--     'tem_mais' (carregarMais('levantamentos')); o «levantamento livre mais
--     recente» só é garantido depois de ter todas as páginas.
--   Os tipos do Supabase não mudam (a função devolve jsonb).
-- DESEMPENHO: medido a 20/10 na nike, só leitura: a consulta da secção de
--   visitas, antiga e nova, custa o mesmo (a primeira execução ~1,55 s nas
--   duas, pela política de schedule_item_assignees que já existia; em
--   repetição ~11 ms antes e ~12,5 ms depois, com mais uma visita). Os
--   levantamentos não se mediram com dados (a nike não tem nenhum); cada
--   item usa os índices por levantamento_id das linhas e das respostas.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: a função a substituir é a lida no remoto a 20/10 (md5 de
-- pg_get_functiondef), e só há uma com este nome.
DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)') IS NULL
     OR md5(pg_get_functiondef(to_regprocedure('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)')))
        <> 'd0d0aaa314790c12c0d3b09bd266645e' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_neg_ficha_seccao mudou desde 20/10; nada feito.';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname = 'public' AND p.proname = 'fn_neg_ficha_seccao') <> 1 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: há sobrecargas de fn_neg_ficha_seccao; nada feito.';
  END IF;
END;
$$;

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

REVOKE ALL ON FUNCTION public.fn_neg_ficha_seccao(uuid, uuid, text, integer, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_ficha_seccao(uuid, uuid, text, integer, jsonb) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. uma só; atributos e permissões (EXECUTE só para authenticated)
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname = 'public' AND p.proname = 'fn_neg_ficha_seccao') <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (1. sobrecargas)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)')
                   AND NOT p.prosecdef
                   AND p.provolatile::text = 's'
                   AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp,statement_timeout=5s'
                   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
                   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS x
                                   WHERE x.grantee = 0)) THEN
    RAISE EXCEPTION 'CONFERIR (1. atributos ou permissões)';
  END IF;

  -- 2. a versão é a desta migration
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)')
                   AND p.prosrc LIKE '%''cancelada'', s.status = ''cancelled''::public.schedule_item_status%'
                   AND p.prosrc LIKE '%v_lim := p_limite;%'
                   AND p.prosrc NOT LIKE '%LEAST(p_limite, 10)%'
                   AND p.prosrc NOT LIKE '%status <> ''cancelled''%') THEN
    RAISE EXCEPTION 'CONFERIR (2. versão nova)';
  END IF;

  -- 3. funções que ela chama, iguais (md5 lidos no remoto a 20/10)
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',      '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)', '4dbbe481640899b70e05dc3d5ea2f4c5')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. funções chamadas mudaram): %', v_txt;
  END IF;

  -- 4. coluna comparada, com o tipo esperado
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = to_regclass('public.schedule_items')
                   AND a.attname::text = 'status' AND NOT a.attisdropped
                   AND format_type(a.atttypid, a.atttypmod) IN ('schedule_item_status', 'public.schedule_item_status')) THEN
    RAISE EXCEPTION 'CONFERIR (4. coluna schedule_items.status)';
  END IF;
END;
$$;

COMMIT;

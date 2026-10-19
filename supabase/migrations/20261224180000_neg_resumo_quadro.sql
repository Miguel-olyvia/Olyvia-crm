-- ============================================================
-- 20261224180000_neg_resumo_quadro (M9)
-- ============================================================
-- O que faz: função NOVA de leitura neg_resumo_quadro, o Quadro da página
--   Pessoas (P4): um cartão por negócio aberto e um cartão por pessoa em
--   abordagem, em 7 colunas, com totais e valor por coluna. STABLE e
--   INVOKER (a RLS decide o que se vê), statement_timeout 5 s.
--   - Negócio aberto (não apagado): coluna pela fase dos documentos ligados
--     vivos: contrato, senão proposta, senão orçamento; sem documentos, com
--     levantamento ligado vai para 'orcamento', sem nada fica em
--     'levantamento'. valor (fn_neg_valor_negocio) é null em 'levantamento'.
--   - Pessoa (regra R-A): sem negócios abertos E closure_result nulo E
--     ((lead aberta E (sem negócios OU algo por ligar)) OU (sem lead aberta
--     E com negócios E algo por ligar)). Coluna: visitas por ligar ->
--     'visita'; senão contactos por ligar -> 'contactado'; senão
--     'porContactar'. "Por ligar" segue o resumo (posterior ao último
--     negócio criado); calculado por conjunto, só para as pessoas sem
--     negócio aberto, uma passagem por interacções, visitas e levantamentos.
--   - Totais e valor da coluna inteira antes do cursor e do limite; o cursor
--     só vale com UMA coluna pedida; limite por coluna.
--   - parado_desde usa a auxiliar do M2 (fn_neg_parado_desde), só para as
--     linhas devolvidas. O próximo contacto segue a regra de
--     fn_neg_proximo_contacto, mas calculado por conjunto (DISTINCT ON) só
--     para as pessoas da página; o valor segue a precedência de
--     fn_neg_valor_negocio, calculado no mesmo LATERAL dos documentos. Se uma
--     destas regras mudar, muda nos dois sítios.
--   - Um só scan de leads e outro de clientes (com a chave de cada pessoa);
--     visitas por lead_id = ANY (leads vivas da pessoa) e client_id = ANY (o
--     cliente vivo mais antigo), como a ficha; o nome só se lê para todos com
--     pesquisa ou ordem por nome.
--   - chave_ordem nunca é nula (data fixa de 1970 como último recurso).
--   D1: sem linha de configuração (ou sem pessoas.view) devolve vazio. Erro
--   só NG009 (também para uma página malformada, nunca erro bruto de
--   conversão). EXECUTE só para authenticated.
-- SÓ ACRESCENTA. Não escreve nada. Não bloqueia tabelas. Nada da Mudelar.
-- Pré-condição: a migration 20261224170000 (M2) aplicada.
-- DESEMPENHO: não medido. Medir na nike (alvo p95 abaixo de 300 ms na
--   primeira chamada, 7 colunas x 25); nunca na Mudelar.
-- A UI precisa de: o Quadro lê daqui (1.ª chamada com p_colunas NULL;
--   "Carregar mais" com uma coluna e o cursor); regenerar os tipos.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_parado_desde(uuid)') IS NULL
     OR to_regprocedure('public.fn_neg_proximo_contacto(uuid,uuid)') IS NULL
     OR to_regprocedure('public.neg_resumo_quadro(uuid,text[],text,text,text,text,uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta 20261224170000 (M2) ou o Quadro já existe; nada feito.';
  END IF;
END;
$$;

CREATE FUNCTION public.neg_resumo_quadro(
  p_organization_id uuid,
  p_colunas text[] DEFAULT NULL,
  p_papel text DEFAULT NULL,
  p_pesquisa text DEFAULT NULL,
  p_ordem text DEFAULT 'recentes',
  p_depois_de_chave text DEFAULT NULL,
  p_depois_de_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 25)
  RETURNS TABLE (
    coluna text,
    tipo text,
    cartao_id uuid,
    entity_id uuid,
    nome text,
    papel text,
    lead_id uuid,
    client_id uuid,
    assigned_to uuid,
    negocio_id uuid,
    titulo text,
    valor numeric,
    pronto_a_ganhar boolean,
    n_orcamentos integer,
    proposta_status text,
    parado_desde timestamptz,
    proximo_prazo_em timestamptz,
    por_ligar_contactos integer,
    por_ligar_visitas integer,
    por_ligar_visitas_feitas integer,
    por_ligar_levantamentos integer,
    chave_ordem text,
    ha_mais boolean,
    total_coluna bigint,
    valor_coluna numeric)
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
#variable_conflict use_column
DECLARE
  k_todas    constant text[] := ARRAY['porContactar', 'contactado', 'visita', 'levantamento',
                                      'orcamento', 'proposta', 'contrato'];
  v_cols     text[];
  v_ordem    text := COALESCE(p_ordem, 'recentes');
  v_pesquisa text := NULLIF(btrim(p_pesquisa), '');
  v_padrao   text;
  v_depois   timestamptz;
  v_momento  text;
  v_quer_pes boolean;
  v_quer_neg boolean;
  v_nome_cedo boolean;
BEGIN
  IF p_organization_id IS NULL
     OR (p_colunas IS NOT NULL AND (cardinality(p_colunas) = 0 OR EXISTS (
           SELECT 1 FROM unnest(p_colunas) AS x(c) WHERE x.c IS NULL OR NOT (x.c = ANY (k_todas)))))
     OR (p_papel IS NOT NULL AND p_papel NOT IN ('lead', 'cliente'))
     OR v_ordem NOT IN ('recentes', 'nome')
     OR char_length(v_pesquisa) < 2 OR char_length(v_pesquisa) > 200
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois_de_chave IS NULL) <> (p_depois_de_id IS NULL) THEN
    RAISE EXCEPTION 'Valor inválido: organização, colunas, papel, ordem, pesquisa (2 a 200), limite (1 a 100) ou página.'
      USING ERRCODE = 'NG009';
  END IF;

  v_cols := ARRAY(SELECT DISTINCT x.c FROM unnest(COALESCE(p_colunas, k_todas)) AS x(c));
  IF p_depois_de_id IS NOT NULL AND (p_colunas IS NULL OR cardinality(v_cols) <> 1) THEN
    RAISE EXCEPTION 'Valor inválido: a página seguinte pede-se para uma só coluna.' USING ERRCODE = 'NG009';
  END IF;
  IF v_ordem = 'recentes' AND p_depois_de_chave IS NOT NULL THEN
    BEGIN
      v_depois := p_depois_de_chave::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      -- qualquer erro de conversão (data, fuso): página inválida
      RAISE EXCEPTION 'Valor inválido: chave da página.' USING ERRCODE = 'NG009';
    END;
  END IF;

  -- D1: sem linha de configuração visível, Quadro vazio.
  SELECT c.momento_ganho INTO v_momento
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_pesquisa IS NOT NULL THEN
    v_padrao := '%' || replace(replace(replace(v_pesquisa, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  v_quer_pes := v_cols && ARRAY['porContactar', 'contactado', 'visita'];
  v_quer_neg := v_cols && ARRAY['levantamento', 'orcamento', 'proposta', 'contrato'];
  v_nome_cedo := v_padrao IS NOT NULL OR v_ordem = 'nome';

  RETURN QUERY
  WITH lds AS (
    -- um só scan das leads vivas: a mais recente de cada pessoa, a chave de
    -- ordem (a maior) e todas as leads vivas da pessoa (para as visitas)
    SELECT DISTINCT ON (l.entity_id)
           l.entity_id AS ent, l.id AS lid, l.status::text AS lstatus, l.closure_result AS lclosure,
           l.assigned_to AS lassigned,
           max(COALESCE(l.list_sort_at, l.created_at)) OVER w AS k,
           array_agg(l.id) OVER w AS lids
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
    WINDOW w AS (PARTITION BY l.entity_id)
    ORDER BY l.entity_id, l.created_at DESC, l.id DESC
  ), cls AS (
    -- um só scan dos clientes vivos: o mais antigo (como o resumo) e a chave
    SELECT DISTINCT ON (c.entity_id)
           c.entity_id AS ent, c.id AS cid, c.assigned_to AS cassigned,
           max(COALESCE(c.updated_at, c.created_at)) OVER w AS k
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
    WINDOW w AS (PARTITION BY c.entity_id)
    ORDER BY c.entity_id, c.created_at ASC, c.id ASC
  ), pes AS (
    SELECT b.*
    FROM (
      SELECT e.ent,
             -- o nome só se lê aqui com pesquisa ou ordem por nome; senão só
             -- para as linhas devolvidas
             CASE WHEN v_nome_cedo THEN (SELECT en.display_name FROM public.anew_entities en
                                         WHERE en.id = e.ent) END AS nome,
             ld.lid, ld.lstatus, ld.lclosure, ld.lids, cl.cid,
             COALESCE(cl.cassigned, ld.lassigned) AS assigned,
             GREATEST(ld.k, cl.k) AS k
      FROM (SELECT x.ent FROM lds x UNION SELECT y.ent FROM cls y) e
      LEFT JOIN lds ld ON ld.ent = e.ent
      LEFT JOIN cls cl ON cl.ent = e.ent
      WHERE p_papel IS NULL OR (p_papel = 'cliente') = (cl.cid IS NOT NULL)
    ) b
    WHERE v_padrao IS NULL OR b.nome ILIKE v_padrao ESCAPE '\'
  ), ng AS (
    SELECT n.entity_id AS ent,
           count(*) FILTER (WHERE n.estado = 'aberto') AS abertos,
           count(*) AS total,
           max(n.created_at) AS ultimo_em
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.deleted_at IS NULL
    GROUP BY n.entity_id
  ), cart_neg AS (
    -- um cartão por negócio aberto
    SELECT CASE
             WHEN d.tem_contrato THEN 'contrato'
             WHEN d.tem_proposta THEN 'proposta'
             WHEN d.n_orc > 0 OR d.tem_lev THEN 'orcamento'
             ELSE 'levantamento'
           END AS col,
           'negocio'::text AS tp, n.id AS cid_cartao, p.ent, p.nome, p.lid, p.cid,
           n.assigned_to AS assigned, n.id AS neg_id, n.titulo AS tit,
           d.pronto, d.n_orc::integer AS n_orc, d.prop_status,
           NULL::timestamptz AS primeira_visita,
           NULL::integer AS plc, NULL::integer AS plv, NULL::integer AS plvf, NULL::integer AS pll,
           n.created_at AS k,
           d.valor AS val
    FROM public.negocios n
    JOIN pes p ON p.ent = n.entity_id
    LEFT JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM public.client_contracts cc
                     WHERE cc.negocio_id = n.id AND cc.deleted_at IS NULL) AS tem_contrato,
             EXISTS (SELECT 1 FROM public.proposals pr
                     WHERE pr.negocio_id = n.id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) AS tem_proposta,
             (SELECT count(*) FROM public.quotes q
              WHERE q.negocio_id = n.id AND q.deleted_at IS NULL) AS n_orc,
             EXISTS (SELECT 1 FROM public.levantamentos lt
                     WHERE lt.negocio_id = n.id AND lt.deleted_at IS NULL) AS tem_lev,
             (SELECT pr.status FROM public.proposals pr
              WHERE pr.negocio_id = n.id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
              ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS prop_status,
             -- valor com a precedência de fn_neg_valor_negocio: a proposta mais
             -- recente não rejeitada, senão o orçamento aceite, senão o maior
             -- orçamento vivo que não esteja rejeitado nem perdido
             COALESCE(
               (SELECT pr.value::numeric FROM public.proposals pr
                WHERE pr.negocio_id = n.id AND pr.status IS DISTINCT FROM 'rejected'
                  AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
                ORDER BY pr.created_at DESC LIMIT 1),
               (SELECT q.total::numeric FROM public.quotes q
                WHERE q.negocio_id = n.id AND q.estado = 'aceite' AND q.deleted_at IS NULL
                ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC LIMIT 1),
               (SELECT max(q.total)::numeric FROM public.quotes q
                WHERE q.negocio_id = n.id AND q.deleted_at IS NULL
                  AND q.estado IS DISTINCT FROM 'rejeitado' AND q.estado IS DISTINCT FROM 'perdido')) AS valor,
             CASE
               WHEN v_momento = 'proposta_aceite' THEN EXISTS (
                 SELECT 1 FROM public.proposals pr
                 WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                   AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
               WHEN v_momento = 'contrato_assinado' THEN EXISTS (
                 SELECT 1 FROM public.client_contracts cc
                 WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado') AND cc.deleted_at IS NULL)
               ELSE false
             END AS pronto
    ) d ON true
    WHERE v_quer_neg
      AND n.organization_id = p_organization_id AND n.estado = 'aberto' AND n.deleted_at IS NULL
  ), cand AS (
    -- pessoas sem negócio aberto e sem abordagem encerrada
    SELECT p.*, COALESCE(g.total, 0) AS total_neg, g.ultimo_em
    FROM pes p
    LEFT JOIN ng g ON g.ent = p.ent
    WHERE v_quer_pes AND COALESCE(g.abertos, 0) = 0 AND p.lclosure IS NULL
  ), cand_l AS (
    SELECT c.ent, u.lid, c.ultimo_em FROM cand c CROSS JOIN LATERAL unnest(c.lids) AS u(lid)
  ), cand_c AS (
    -- visitas por ligar pelo cliente: só o cliente vivo mais antigo (regra do
    -- resumo e da ficha)
    SELECT c.ent, c.cid, c.ultimo_em FROM cand c WHERE c.cid IS NOT NULL
  ), ct AS (
    SELECT i.entity_id AS ent, count(*) AS n
    FROM public.entity_interactions i
    JOIN cand c ON c.ent = i.entity_id
    WHERE i.organization_id = p_organization_id AND i.interaction_type = 'call'
      AND i.negocio_id IS NULL
      AND i.interaction_at > COALESCE(c.ultimo_em, '-infinity'::timestamptz)
    GROUP BY i.entity_id
  ), vis AS (
    -- dois ramos por índice (lead_id e client_id), como neg_resumo_pessoas
    SELECT v.ent,
           count(*) FILTER (WHERE v.st <> 'cancelled'::public.schedule_item_status) AS n,
           count(*) FILTER (WHERE v.st = 'completed'::public.schedule_item_status) AS feitas,
           min(v.inicio) FILTER (WHERE v.st NOT IN ('cancelled'::public.schedule_item_status,
                                                    'completed'::public.schedule_item_status)) AS primeira
    FROM (
      SELECT x.ent, s.id, s.status AS st, s.start_datetime AS inicio
      FROM public.schedule_items s
      JOIN cand_l x ON x.lid = s.lead_id
      WHERE s.lead_id = ANY (ARRAY(SELECT y.lid FROM cand_l y))
        AND s.organization_id = p_organization_id
        AND s.time_off_type IS NULL AND s.vacation_id IS NULL AND s.negocio_id IS NULL
        AND s.start_datetime > COALESCE(x.ultimo_em, '-infinity'::timestamptz)
      UNION
      SELECT x.ent, s.id, s.status, s.start_datetime
      FROM public.schedule_items s
      JOIN cand_c x ON x.cid = s.client_id
      WHERE s.client_id = ANY (ARRAY(SELECT y.cid FROM cand_c y))
        AND s.organization_id = p_organization_id
        AND s.time_off_type IS NULL AND s.vacation_id IS NULL AND s.negocio_id IS NULL
        AND s.start_datetime > COALESCE(x.ultimo_em, '-infinity'::timestamptz)
    ) v
    GROUP BY v.ent
  ), lvs AS (
    SELECT lt.entity_id AS ent, count(*) AS n
    FROM public.levantamentos lt
    JOIN cand c ON c.ent = lt.entity_id
    WHERE lt.organization_id = p_organization_id AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(c.ultimo_em, '-infinity'::timestamptz)
    GROUP BY lt.entity_id
  ), pes_pl AS (
    SELECT c.*,
           COALESCE(ct.n, 0)::integer AS plc, COALESCE(vis.n, 0)::integer AS plv,
           COALESCE(vis.feitas, 0)::integer AS plvf, COALESCE(lvs.n, 0)::integer AS pll,
           vis.primeira,
           (c.lid IS NOT NULL AND public.fn_neg_lead_aberta(c.lstatus)) AS lead_aberta
    FROM cand c
    LEFT JOIN ct ON ct.ent = c.ent
    LEFT JOIN vis ON vis.ent = c.ent
    LEFT JOIN lvs ON lvs.ent = c.ent
  ), cart_pes AS (
    -- regra R-A
    SELECT CASE WHEN x.plv > 0 THEN 'visita' WHEN x.plc > 0 THEN 'contactado' ELSE 'porContactar' END AS col,
           'pessoa'::text AS tp, x.ent AS cid_cartao, x.ent, x.nome, x.lid, x.cid,
           x.assigned, NULL::uuid AS neg_id, NULL::text AS tit,
           NULL::boolean AS pronto, NULL::integer AS n_orc, NULL::text AS prop_status,
           x.primeira AS primeira_visita,
           x.plc, x.plv, x.plvf, x.pll,
           x.k,
           NULL::numeric AS val
    FROM pes_pl x
    WHERE (x.lead_aberta AND (x.total_neg = 0 OR x.plc + x.plv + x.pll > 0))
       OR (NOT x.lead_aberta AND x.total_neg > 0 AND x.plc + x.plv + x.pll > 0)
  ), cartoes AS (
    SELECT u.col, u.tp, u.cid_cartao, u.ent, u.nome, u.lid, u.cid, u.assigned, u.neg_id, u.tit,
           u.pronto, u.n_orc, u.prop_status, u.primeira_visita, u.plc, u.plv, u.plvf, u.pll,
           COALESCE(u.k, '1970-01-01 00:00:00+00'::timestamptz) AS k,
           CASE WHEN u.tp = 'negocio' AND u.col <> 'levantamento' THEN u.val END AS val,
           COALESCE(lower(u.nome), '') AS nm
    FROM (SELECT * FROM cart_neg UNION ALL SELECT * FROM cart_pes) u
    WHERE u.col = ANY (v_cols)
  ), totais AS (
    SELECT t.*,
           count(*) OVER (PARTITION BY t.col) AS tot_col,
           sum(t.val) OVER (PARTITION BY t.col) AS val_col
    FROM cartoes t
  ), pos AS (
    SELECT t.*,
           row_number() OVER (PARTITION BY t.col ORDER BY
             CASE WHEN v_ordem = 'recentes' THEN t.k END DESC,
             CASE WHEN v_ordem = 'recentes' THEN t.cid_cartao END DESC,
             CASE WHEN v_ordem = 'nome' THEN t.nm END ASC,
             CASE WHEN v_ordem = 'nome' THEN t.cid_cartao END ASC) AS rn,
           count(*) OVER (PARTITION BY t.col) AS restantes
    FROM totais t
    WHERE p_depois_de_id IS NULL
       OR (v_ordem = 'recentes' AND (t.k, t.cid_cartao) < (v_depois, p_depois_de_id))
       OR (v_ordem = 'nome' AND (t.nm, t.cid_cartao) > (p_depois_de_chave, p_depois_de_id))
  ), pag AS (
    SELECT q.* FROM pos q WHERE q.rn <= p_limite
  ), pc AS (
    -- próximo contacto, por conjunto, só para as pessoas da página (a mesma
    -- regra de fn_neg_proximo_contacto, usada pela ficha)
    SELECT DISTINCT ON (i.entity_id) i.entity_id AS ent, i.next_action_date
    FROM public.entity_interactions i
    WHERE i.organization_id = p_organization_id
      AND i.entity_id = ANY (ARRAY(SELECT g.ent FROM pag g WHERE g.tp = 'pessoa'))
      AND (i.interaction_type = 'call'
           OR (i.interaction_type = 'note' AND i.next_action_type = 'callback'))
    ORDER BY i.entity_id, i.interaction_at DESC, i.id DESC
  )
  SELECT
    q.col::text,
    q.tp::text,
    q.cid_cartao::uuid,
    q.ent::uuid,
    COALESCE(q.nome, (SELECT en.display_name FROM public.anew_entities en WHERE en.id = q.ent))::text,
    (CASE WHEN q.cid IS NOT NULL THEN 'cliente' ELSE 'lead' END)::text,
    q.lid::uuid,
    q.cid::uuid,
    q.assigned::uuid,
    q.neg_id::uuid,
    q.tit::text,
    q.val::numeric,
    q.pronto::boolean,
    q.n_orc::integer,
    q.prop_status::text,
    (CASE WHEN q.tp = 'negocio' AND q.col IN ('orcamento', 'proposta')
          THEN public.fn_neg_parado_desde(q.neg_id) END)::timestamptz,
    (CASE WHEN q.tp = 'pessoa' THEN LEAST(q.primeira_visita, pc.next_action_date) END)::timestamptz,
    q.plc::integer,
    q.plv::integer,
    q.plvf::integer,
    q.pll::integer,
    COALESCE(CASE WHEN v_ordem = 'nome' THEN q.nm
                  ELSE to_char(q.k AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
             '1970-01-01T00:00:00.000000Z')::text,
    (q.restantes > p_limite)::boolean,
    q.tot_col::bigint,
    q.val_col::numeric
  FROM pag q
  LEFT JOIN pc ON pc.ent = q.ent AND q.tp = 'pessoa'
  ORDER BY array_position(k_todas, q.col), q.rn;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_resumo_quadro(uuid, text[], text, text, text, text, uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.neg_resumo_quadro(uuid, text[], text, text, text, text, uuid, integer) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. função nova: assinatura, INVOKER, STABLE, search_path e timeout fixos,
  --    sem anon, com authenticated
  IF NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.neg_resumo_quadro(uuid,text[],text,text,text,text,uuid,integer)')
         AND NOT p.prosecdef
         AND p.provolatile::text = 's'
         AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp,statement_timeout=5s'
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'CONFERIR (1. neg_resumo_quadro)';
  END IF;

  -- 2. auxiliares do M2 que usa: INVOKER, search_path fixo (md5 a fixar depois do M2)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES ('public.fn_neg_parado_desde(uuid)'),
                         ('public.fn_neg_proximo_contacto(uuid,uuid)')) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL OR p.prosecdef
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. auxiliares do M2): %', v_txt;
  END IF;

  -- 3. funções existentes de que depende, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_lead_aberta(text)',   'cb988326544ed75840624bfb78e55b7f'),
              ('public.fn_neg_valor_negocio(uuid)', '2d3b4bc5cdbdb147b6638a2411506298')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. funções existentes mudaram): %', v_txt;
  END IF;

  -- 4. colunas de ordenação, com o tipo esperado
  IF (SELECT count(*)
      FROM (VALUES ('anew_leads', 'list_sort_at', 'timestamp with time zone'),
                   ('anew_leads', 'closure_result', 'text'),
                   ('anew_clients', 'updated_at', 'timestamp with time zone'),
                   ('negocios', 'created_at', 'timestamp with time zone')) AS e(t, c, ty)
      JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.t)
                         AND a.attname::text = e.c AND NOT a.attisdropped
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 4 THEN
    RAISE EXCEPTION 'CONFERIR (4. colunas de ordenação)';
  END IF;
END;
$$;

COMMIT;

-- ============================================================
-- 20270108530000_ficha_editar_pessoa_com_ambito
-- ============================================================
-- Só permissões (P2 da auditoria de 05/11/2026, ponto P6 do grupo A).
-- Na ficha da pessoa, o lápis da identidade e do contacto aparecia com pessoas.edit (permissoes.editar), mas as RPCs
-- que gravam (neg_guardar_identidade_pessoa, neg_guardar_contacto_pessoa, neg_substituir_contacto) exigem pessoas.edit
-- E o âmbito de edição sobre a pessoa (fn_neg_pessoa_no_ambito 'edit' = leads.edit numa lead / clients.edit num
-- cliente, conforme client_since, com o âmbito ORG/TEAM/OWNED). Escolha (a mais segura, sem ninguém perder acesso):
-- o ecrã passa a pedir o mesmo que o servidor. neg_ficha_pessoa devolve uma flag nova, permissoes.editar_pessoa, com
-- exatamente a condição das RPCs; a flag 'editar' (usada noutros sítios da ficha) não muda. As RPCs não mudam.
-- Parte da definição VIVA (pg_get_functiondef); só muda o bloco v_perm. Se mudou entretanto, a migração pára.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '63c1e6fb3f54537e381a9ff19d68a73b' THEN
    RAISE EXCEPTION 'neg_ficha_pessoa mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.neg_ficha_pessoa(p_organization_id uuid, p_entity_id uuid, p_limite integer DEFAULT 30, p_depois jsonb DEFAULT NULL::jsonb, p_partes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_momento   text;
  v_conv      text;
  v_base      boolean;
  v_ent       record;
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
  v_uid       uuid;
  v_ch_editar text[];
  v_ch_apagar text[];
  v_q_titulo  text;
  v_neg1      uuid;
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

  -- 2. Guardas
  v_momento := public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  PERFORM set_config('app.neg_ficha_verificada',
                     p_organization_id::text || ':' || p_entity_id::text, true);

  v_base := p_partes IS NULL OR 'base' = ANY (p_partes);

  IF v_base THEN
    SELECT e.client_since, e.assigned_to, e.origin_id, e.campaign_id,
           e.last_activity_at, e.created_at, e.closure_result
      INTO v_ent
    FROM public.anew_entities e
    WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL;

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
           count(*) FILTER (WHERE s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
      INTO v_vs
    FROM (
      SELECT si.start_datetime, si.status, si.negocio_id
      FROM public.schedule_items si
      WHERE si.entity_id = p_entity_id
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s;

    SELECT count(*) INTO v_lv_por
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = p_entity_id
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz);

    IF v_ent.client_since IS NULL AND v_ng.abertos > 0 THEN
      SELECT n.id INTO v_neg1
      FROM public.negocios n
      WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id
        AND n.estado = 'aberto' AND n.deleted_at IS NULL
      ORDER BY n.created_at, n.id
      LIMIT 1;
    END IF;

    v_etapa := CASE
      WHEN v_ent.client_since IS NOT NULL THEN 'cliente'
      WHEN v_ng.abertos > 0 AND v_neg1 IS NULL THEN 'qualificada'
      WHEN v_ng.abertos > 0 THEN CASE
        WHEN EXISTS (SELECT 1 FROM public.levantamentos lt
                    WHERE lt.negocio_id = v_neg1 AND lt.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.quotes q
                    WHERE q.negocio_id = v_neg1 AND q.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.proposals pr
                    WHERE pr.negocio_id = v_neg1 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
          OR EXISTS (SELECT 1 FROM public.client_contracts cc
                    WHERE cc.negocio_id = v_neg1 AND cc.deleted_at IS NULL) THEN 'qualificada'
        WHEN EXISTS (SELECT 1 FROM public.schedule_items s
                    WHERE s.negocio_id = v_neg1
                      AND s.organization_id = p_organization_id
                      AND s.status <> 'cancelled'::public.schedule_item_status
                      AND s.time_off_type IS NULL AND s.vacation_id IS NULL) THEN 'visitaMarcada'
        WHEN EXISTS (SELECT 1 FROM public.entity_interactions i
                    WHERE i.negocio_id = v_neg1
                      AND i.organization_id = p_organization_id
                      AND i.interaction_type = 'call') THEN 'emContacto'
        ELSE 'nova'
      END
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
      'ultimo_contacto_efetivo_em', v_ct.ultimo,
      'ultimo_resultado_efetivo', (SELECT i.result FROM public.entity_interactions i
                                   WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
                                     AND i.interaction_type = 'call'
                                   ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1),
      'ultima_visita_feita_em', v_vs.ultima_feita,
      'proxima_visita_em', v_vs.proxima,
      'por_ligar', jsonb_build_object('contactos', v_ct.por_ligar, 'visitas', v_vs.por_ligar,
                                      'levantamentos', v_lv_por),
      'negocios', jsonb_build_object('abertos', v_ng.abertos, 'ganhos', v_ng.ganhos,
                                     'perdidos', v_ng.perdidos),
      'total_contactos', v_ct.total,
      'total_visitas', (SELECT count(*)
                        FROM (SELECT si.id FROM public.schedule_items si
                              WHERE si.entity_id = p_entity_id AND si.organization_id = p_organization_id) ids
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

    v_q_titulo := (SELECT s.titulo FROM public.levantamento_seccoes s
                   WHERE s.organization_id = p_organization_id AND s.chave = 'qualificacao'
                   ORDER BY s.apagada_em NULLS FIRST LIMIT 1);

    -- Pessoa
    SELECT jsonb_build_object(
      'id', p_entity_id,
      'nome', e.display_name,
      'first_name', e.first_name,
      'last_name', e.last_name,
      'papel', CASE WHEN v_ent.client_since IS NOT NULL THEN 'cliente' ELSE 'lead' END,
      'lead_id', NULL,
      'client_id', NULL,
      'cliente_desde', v_ent.client_since,
      'responsavel_id', v_ent.assigned_to,
      'responsavel_nome', (SELECT u.name FROM public.anew_users u
                           WHERE u.id = v_ent.assigned_to),
      'etapa', v_etapa,
      'desde', v_ent.created_at,
      -- 20270101260000: le primeiro de anew_entities (fonte primaria),
      -- fallback para as tabelas normalizadas.
      'contacto', jsonb_build_object(
        'telefone', COALESCE(NULLIF(btrim(e.phone), ''),
                     (SELECT ph.phone_number FROM public.anew_entity_phones ph
                      WHERE ph.entity_id = p_entity_id
                      ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC LIMIT 1)),
        'email', COALESCE(NULLIF(btrim(e.email), ''),
                  (SELECT em.email FROM public.anew_entity_emails em
                   WHERE em.entity_id = p_entity_id
                   ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1))),
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
      'qualificacao', (SELECT jsonb_object_agg(qr.pergunta, qr.resposta) FILTER (WHERE qr.resposta IS NOT NULL)
                       FROM public.negocio_qualificacao_respostas qr
                       WHERE qr.qualificacao_id = ql.id),
      'qualificacao_respostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'seccao', 'qualificacao', 'pergunta', qr.pergunta, 'resposta', qr.resposta,
                                   'tipo', qr.tipo, 'pergunta_texto', qr.pergunta_texto,
                                   'seccao_titulo', v_q_titulo, 'bloco', qr.bloco, 'ordem', qr.ordem,
                                   'escolhas', qr.escolhas, 'escolhas_texto', qr.escolhas_texto,
                                   'valor_texto', qr.valor_texto, 'valor_numero', qr.valor_numero)
                                   ORDER BY qr.ordem, qr.pergunta), '[]'::jsonb)
                                 FROM public.negocio_qualificacao_respostas qr
                                 WHERE qr.qualificacao_id = ql.id),
      'origem', CASE WHEN v_ent.origin_id IS NULL AND v_ent.campaign_id IS NULL AND fm.fid IS NULL
                     THEN NULL ELSE jsonb_build_object(
                  'origem_id', v_ent.origin_id,
                  'origin', (SELECT ls.name FROM public.lead_sources ls WHERE ls.id = v_ent.origin_id),
                  'source', NULL,
                  'campanha_id', v_ent.campaign_id,
                  'campanha', (SELECT ca.name FROM public.campaigns ca WHERE ca.id = v_ent.campaign_id),
                  'formulario_id', fm.fid,
                  'formulario', fm.fnome) END,
      'nif', NULL,
      'nif_ultimos3', CASE WHEN e.nif_last3 ~ '^[0-9]{3}$' THEN e.nif_last3 END,
      'empresa', NULL,
      'qualificacao_tipo', NULL,
      'ultima_atividade_em', v_ent.last_activity_at,
      'ultimo_contacto_lead_em', NULL,
      'voltou_a_contactar', (v_ent.last_activity_at IS NOT NULL
                             AND (v_ct.ultimo IS NULL OR v_ent.last_activity_at > v_ct.ultimo)),
      'tipo', e.type,
      'empresa_nome', CASE WHEN e.type = 'organization' THEN e.display_name END,
      'tem_nif', fe.fid IS NOT NULL
                 OR COALESCE(public.fn_neg_pessoa_tem_nif(p_organization_id, p_entity_id), false),
      'preferred_contact', e.preferred_contact,
      'preferred_time', e.preferred_time,
      'locale', e.locale,
      'organization_kind', e.organization_kind,
      'tipo_cliente', CASE WHEN e.type IS NULL THEN NULL
                           WHEN e.type = 'organization' AND e.organization_kind = 'condominio' THEN 'condominio'
                           WHEN e.type = 'organization' THEN 'empresa'
                           ELSE 'particular' END)
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
      SELECT q.id FROM public.negocio_qualificacoes q
      JOIN public.negocios n ON n.id = q.negocio_id
      WHERE n.entity_id = p_entity_id AND n.organization_id = p_organization_id
        AND n.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.negocio_qualificacao_respostas r
                    WHERE r.qualificacao_id = q.id)
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 1
    ) ql ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(cf.id, f1.id) AS fid,
             CASE WHEN cf.id IS NOT NULL THEN cf.name ELSE f1.name END AS fnome
      FROM (SELECT 1) AS um2
      LEFT JOIN LATERAL (
        SELECT f.id, f.name FROM public.campaigns ca
        JOIN public.forms f ON f.id = ca.form_id
        WHERE ca.id = v_ent.campaign_id
      ) cf ON true
      LEFT JOIN LATERAL (
        SELECT f.id, f.name
        FROM public.form_submissions fsb
        JOIN public.forms f ON f.id = fsb.form_id
        WHERE fsb.entity_id = p_entity_id AND fsb.organization_id = p_organization_id
          AND fsb.deleted_at IS NULL
        ORDER BY fsb.created_at, fsb.id
        LIMIT 1
      ) f1 ON true
    ) fm ON true;

    IF v_ent.client_since IS NULL THEN
      SELECT jsonb_build_object(
        'id', NULL,
        'entity_id', p_entity_id,
        'estado', NULL,
        'aberta', v_ent.closure_result IS NULL,
        'encerramento', CASE WHEN v_ent.closure_result IS NULL THEN NULL ELSE jsonb_build_object(
          'resultado', v_ent.closure_result,
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

    v_abertas := '[]'::jsonb;

    v_conv := (SELECT c.conversao_ao_ganhar FROM public.negocio_workflow_config c
               WHERE c.organization_id = p_organization_id);

    -- 20270108530000: 'editar_pessoa' = o que neg_guardar_identidade_pessoa, neg_guardar_contacto_pessoa e
    -- neg_substituir_contacto exigem (pessoas.edit na organização E âmbito de edição sobre a pessoa: leads.edit numa
    -- lead, clients.edit num cliente). O ecrã usa-a para o lápis da identidade e do contacto; 'editar' não muda.
    v_perm := jsonb_build_object(
      'editar', public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'),
      'editar_pessoa', COALESCE(public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'), false)
                       AND COALESCE(public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit'), false),
      'criar',  public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create'));

    v_uid := auth.uid();
    v_ch_editar := CASE WHEN v_uid IS NOT NULL
                          AND p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))
                          AND public.has_anew_permission(v_uid, 'pessoas.edit')
                        THEN public.crm_scope_keys('pessoas.edit')
                        ELSE ARRAY[]::text[] END;
    v_ch_apagar := CASE WHEN v_uid IS NOT NULL
                          AND public.has_anew_permission(v_uid, 'pessoas.delete')
                        THEN public.crm_scope_keys('pessoas.delete')
                        ELSE ARRAY[]::text[] END;

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
                      'fecho', n.fecho,
                      'pode_editar', pm.editar,
                      'pode_apagar', pm.editar AND pm.apagar,
                      'pode_restaurar', pm.editar AND pm.apagar,
                      'alerta_codigo', n.alerta_codigo,
                      'alerta_em', n.alerta_em,
                      'alerta_texto', CASE WHEN n.alerta_codigo IS NOT NULL THEN (
                                        SELECT ea.detalhe FROM public.negocio_eventos ea
                                        WHERE ea.negocio_id = n.id AND ea.tipo = 'alerta'
                                          AND ea.created_at >= n.alerta_em
                                        ORDER BY ea.created_at DESC, ea.id DESC LIMIT 1) END,
                      'decisao_origem_tipo', n.decisao_origem_tipo,
                      'decisao_origem_id', n.decisao_origem_id,
                      'decisao_origem_numero', CASE n.decisao_origem_tipo
                        WHEN 'proposta' THEN (SELECT po.proposal_number FROM public.proposals po
                                              WHERE po.id = n.decisao_origem_id)
                        WHEN 'contrato' THEN (SELECT co.contract_number FROM public.client_contracts co
                                              WHERE co.id = n.decisao_origem_id) END,
                      'decisao_origem_em', CASE WHEN n.decisao_origem_id IS NOT NULL THEN
                        CASE n.estado WHEN 'ganho' THEN n.ganho_em WHEN 'perdido' THEN n.perdido_em END END,
                      'decisao_origem_prova', dv.prova,
                      'decisao_origem_canal', dv.canal,
                      'perda_automatica', CASE WHEN n.estado = 'perdido' THEN n.decisao_origem_id IS NOT NULL END,
                      'conversao_pendente', CASE WHEN n.estado = 'ganho' THEN
                        v_ent.client_since IS NULL
                        AND COALESCE(v_conv, 'nao_alterar') IS DISTINCT FROM 'nao_alterar' END,
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
                                                        WHERE u.id = ev.created_by),
                                    'detalhe', ev.detalhe, 'origem_tipo', ev.origem_tipo,
                                    'origem_id', ev.origem_id, 'origem_estado', ev.origem_estado,
                                    'canal', ev.canal, 'prova', ev.prova)
                                    ORDER BY ev.created_at DESC, ev.id DESC), '[]'::jsonb)
                                  FROM (SELECT e1.* FROM public.negocio_eventos e1
                                        WHERE e1.negocio_id = n.id
                                        ORDER BY e1.created_at DESC, e1.id DESC
                                        LIMIT 30) ev),
                      'eventos_tem_mais', EXISTS (SELECT 1 FROM public.negocio_eventos e2
                                                  WHERE e2.negocio_id = n.id
                                                  ORDER BY e2.created_at DESC, e2.id DESC
                                                  OFFSET 30 LIMIT 1),
                      'pedido_cliente', n.pedido_cliente,
                      'versao_questionario', nq.versao_questionario,
                      'qualificacao', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                         'seccao', 'qualificacao', 'pergunta', r.pergunta,
                                         'resposta', r.resposta, 'tipo', r.tipo,
                                         'pergunta_texto', r.pergunta_texto, 'seccao_titulo', v_q_titulo,
                                         'bloco', r.bloco, 'ordem', r.ordem, 'escolhas', r.escolhas,
                                         'escolhas_texto', r.escolhas_texto, 'valor_texto', r.valor_texto,
                                         'valor_numero', r.valor_numero)
                                         ORDER BY r.ordem, r.pergunta), '[]'::jsonb)
                                       FROM public.negocio_qualificacao_respostas r
                                       WHERE r.qualificacao_id = nq.id)
                    ) AS item
                  FROM (SELECT n1.* FROM public.negocios n1
                        WHERE n1.organization_id = p_organization_id AND n1.entity_id = p_entity_id
                          AND n1.deleted_at IS NULL
                        ORDER BY n1.created_at DESC, n1.id DESC
                        LIMIT 50) n
                  LEFT JOIN LATERAL (
                    SELECT ed.prova, ed.canal FROM public.negocio_eventos ed
                    WHERE n.decisao_origem_id IS NOT NULL
                      AND ed.negocio_id = n.id AND ed.origem_id = n.decisao_origem_id
                      AND ed.tipo = CASE n.estado WHEN 'ganho' THEN 'ganhou' WHEN 'perdido' THEN 'perdeu' END
                    ORDER BY ed.created_at DESC, ed.id DESC
                    LIMIT 1
                  ) dv ON true
                  LEFT JOIN public.negocio_qualificacoes nq ON nq.negocio_id = n.id
                  CROSS JOIN LATERAL (
                    SELECT EXISTS (SELECT 1 FROM unnest(v_ch_editar) AS k(chave)
                                   WHERE k.chave = n.organization_id::text || ':*'
                                      OR k.chave = n.organization_id::text || ':' || n.assigned_to::text
                                      OR k.chave = n.organization_id::text || ':' || n.created_by::text) AS editar,
                           EXISTS (SELECT 1 FROM unnest(v_ch_apagar) AS k(chave)
                                   WHERE k.chave = n.organization_id::text || ':*'
                                      OR k.chave = n.organization_id::text || ':' || n.assigned_to::text
                                      OR k.chave = n.organization_id::text || ':' || n.created_by::text) AS apagar
                  ) pm
                ) x));

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

  PERFORM set_config('app.neg_ficha_verificada', '', true);
  RETURN v_res;
END;
$function$;

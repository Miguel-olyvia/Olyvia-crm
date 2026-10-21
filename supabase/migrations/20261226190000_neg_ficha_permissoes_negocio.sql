-- ============================================================
-- 20261226190000_neg_ficha_permissoes_negocio
-- ============================================================
-- Decisões do utilizador (21/10): ponto 5 (um negócio perdido reabre-se e só
--   depois se edita) e ponto 6 (o lixo tem permissões próprias: só quem as
--   tem é que deve conseguir). O ecrã precisa de saber, por negócio, o que
--   quem está a ver pode fazer, em vez de mostrar o botão e falhar.
--
-- O que faz: neg_ficha_pessoa passa a devolver, em cada negócio
--   (negocios.itens[]), três chaves novas. Só ACRESCENTA; nada muda de nome
--   nem de forma.
--     pode_editar     a regra da política negocios_update e de
--                     fn_neg_pode_editar: sessão, organização CRM de quem
--                     chama, pessoas.edit, e a chave de âmbito da organização
--                     inteira (org:*), do comercial (assigned_to) ou de quem
--                     criou (created_by); o âmbito de equipa chega pelas
--                     chaves de crm_scope_keys (a equipa que lidera). Só a
--                     permissão: o estado (aberto, ganho, perdido) já vem em
--                     'estado' e o ecrã combina os dois (ponto 5).
--     pode_apagar     mandar para o lixo: é um UPDATE de deleted_at, por isso
--                     exige pode_editar (a política) E a permissão própria do
--                     lixo, pessoas.delete com o mesmo tipo de chave, que o
--                     gatilho fn_negocios_guardar_alteracao verifica
--                     (fn_negocios_exigir_permissao_lixo).
--     pode_restaurar  a mesma regra de pode_apagar (o gatilho usa o mesmo
--                     teste nos dois sentidos e a política é a mesma). Os
--                     negócios no lixo não vêm na ficha (deleted_at nulo): a
--                     chave serve o ecrã que mostra o que se pode restaurar
--                     depois de apagar; a lista do lixo é lida à parte.
--   As chaves de âmbito são lidas UMA vez por chamada (crm_scope_keys de
--   pessoas.edit e de pessoas.delete), não uma vez por negócio.
--   Fica igual: assinatura (uuid, uuid, integer, jsonb, text[]), INVOKER,
--   STABLE, search_path, statement_timeout e privilégios (EXECUTE só para
--   authenticated; CREATE OR REPLACE mantém-nos; o CONFERIR confirma).
--
-- A MANTER JUNTAS (a mesma regra escrita em quatro sítios): pode_editar,
--   fn_neg_pode_editar (20261226140000), a política negocios_update e o gatilho
--   fn_negocios_exigir_permissao_lixo. Mudar um obriga a rever os outros. A
--   cláusula da organização CRM (organization_id IN get_user_crm_org_ids) só
--   está em pode_editar: pode_apagar não a repete porque crm_scope_keys só
--   devolve chaves das organizações de quem chama e o gatilho do lixo também
--   não a testa; a de pessoas.delete só tem sentido ligada a pode_editar.
--
-- DECISÃO DE PRODUTO POR TOMAR (ponto 6, «só quem tem as permissões»): hoje
--   apagar exige pode_editar E pessoas.delete, porque passar para o lixo é um
--   UPDATE e a política negocios_update pede pessoas.edit. Quem tem
--   pessoas.delete sem pessoas.edit continua sem poder apagar nem restaurar.
--   Se o lixo passar a depender só de pessoas.delete, muda a política
--   negocios_update ou a função que manda para o lixo; esta migration não o
--   faz. pode_restaurar é igual a pode_apagar e, como os negócios do lixo não
--   vêm na ficha, não chega ao botão Restaurar: a lista do lixo continua a
--   seguir a regra antiga e é a base que recusa (o ecrã traduz o erro).
--
-- Desempenho: nenhuma leitura de catálogo na função; duas chamadas a
--   crm_scope_keys e duas a has_anew_permission por ficha; por negócio só
--   comparações em memória. Medido na nike a 21/10 (só leitura): ver o
--   relatório, com um utilizador de UMA organização. NÃO MEDIDO com várias:
--   crm_scope_keys percorre as organizações de quem chama (uma subtransação
--   por organização, num bloco com EXCEPTION), duas vezes por ficha, e o
--   remoto tem utilizadores com até 20 organizações (20261118030000), sobre os
--   79 a 90 ms da ficha e um statement_timeout de 5 s. Medir na nike com um
--   utilizador de várias organizações antes de ligar a bandeira.
--
-- MUDELAR: nada. neg_ficha_pessoa dá-lhe NG008 (sem negocio_workflow_config),
--   como antes, e nenhuma tabela nem política é tocada.
-- PRECISA DE CÓDIGO? Não parte nada (só acrescenta chaves). Para servir, o
--   ecrã lê-as como opcionais (fichaTipos.ts, NegocioFichaDb) e esconde ou
--   desliga editar, lixo e restaurar quando vêm false. Regenerar os tipos do
--   Supabase.
-- ORDEM: depois de 20261226170000 (a versão substituída).
-- Pré-condição: md5 da versão de 20261226170000 lido no remoto a 21/10
--   (acddaca05ca01cedae0fc86d8b9fcf52).
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226190000_neg_ficha_permissoes_negocio.sql).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  -- A versão a substituir é a de 20261226170000 (md5 lido no remoto a 21/10).
  IF pg_catalog.to_regprocedure('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])') IS NULL
     OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])')))
        IS DISTINCT FROM 'acddaca05ca01cedae0fc86d8b9fcf52' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_ficha_pessoa não está na versão de 20261226170000; nada feito.';
  END IF;
  -- Uma só assinatura (não se cria outra ao lado).
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_ficha_pessoa') <> 1 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: há mais do que uma neg_ficha_pessoa; nada feito.';
  END IF;
  -- As funções de permissão de que a nova versão depende.
  IF pg_catalog.to_regprocedure('public.crm_scope_keys(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.has_anew_permission(uuid,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.get_user_crm_org_ids(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam funções de permissão; nada feito.';
  END IF;
END
$pre$;

-- ============================================================
-- neg_ficha_pessoa (a de 20261226170000; só acrescenta)
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
  v_conv      text;
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
  v_uid       uuid;
  v_ch_editar text[];
  v_ch_apagar text[];
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

    -- 20261226170000: a conversão ao ganhar (uma leitura por chave), para
    -- dizer se um ganho tem a conversão em cliente por fazer.
    v_conv := (SELECT c.conversao_ao_ganhar FROM public.negocio_workflow_config c
               WHERE c.organization_id = p_organization_id);

    v_perm := jsonb_build_object(
      'editar', public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'),
      'criar',  public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create'));

    -- 20261226190000: as chaves de âmbito de quem chama, lidas UMA vez (não
    -- por negócio). Editar: a regra de fn_neg_pode_editar e da política
    -- negocios_update (sessão, organização CRM do utilizador, pessoas.edit e
    -- a chave da organização inteira, do comercial ou de quem criou; a
    -- equipa entra pelas chaves de crm_scope_keys). Apagar e restaurar: a
    -- regra de fn_negocios_exigir_permissao_lixo (pessoas.delete com o mesmo
    -- tipo de chave).
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

    -- Negócios (até 50, recentes primeiro), com documentos e os últimos 30 eventos.
    -- 20261226170000: o fecho v4 (tipo de fecho, alerta em aberto com o texto,
    -- origem da decisão com prova e canal, perda automática, conversão por
    -- fazer) e os eventos com detalhe, origem, canal e prova.
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
                      -- 20261226190000: o que quem chama pode fazer a ESTE negócio.
                      -- pode_editar: a política negocios_update (só a permissão e o
                      -- âmbito; o estado do negócio é à parte, em 'estado').
                      -- pode_apagar e pode_restaurar: o lixo é um UPDATE de deleted_at,
                      -- por isso exige a política de edição E a permissão própria do
                      -- lixo (pessoas.delete com âmbito), que o gatilho verifica.
                      'pode_editar', pm.editar,
                      'pode_apagar', pm.editar AND pm.apagar,
                      'pode_restaurar', pm.editar AND pm.apagar,
                      'alerta_codigo', n.alerta_codigo,
                      'alerta_em', n.alerta_em,
                      -- O texto do alerta em aberto: o detalhe do evento 'alerta' mais
                      -- recente desde que o código ficou (mesma transacção, mesmo instante).
                      'alerta_texto', CASE WHEN n.alerta_codigo IS NOT NULL THEN (
                                        SELECT ea.detalhe FROM public.negocio_eventos ea
                                        WHERE ea.negocio_id = n.id AND ea.tipo = 'alerta'
                                          AND ea.created_at >= n.alerta_em
                                        ORDER BY ea.created_at DESC, ea.id DESC LIMIT 1) END,
                      -- A origem da decisão (nula numa decisão manual): o documento, o
                      -- número dele, o instante do ganho ou da perda, e a prova e o canal
                      -- do evento que a registou.
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
                      -- Ganho com a conversão em cliente por fazer: a pessoa não é cliente
                      -- desta organização, tem lead aberta e a configuração converte.
                      'conversao_pendente', CASE WHEN n.estado = 'ganho' THEN
                        v_cli.id IS NULL AND COALESCE(v_conv, 'nao_alterar') IS DISTINCT FROM 'nao_alterar'
                        AND jsonb_array_length(v_abertas) > 0 END,
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
                      -- Há mais de 30 eventos (a ficha mostra os 30 mais recentes).
                      'eventos_tem_mais', EXISTS (SELECT 1 FROM public.negocio_eventos e2
                                                  WHERE e2.negocio_id = n.id
                                                  ORDER BY e2.created_at DESC, e2.id DESC
                                                  OFFSET 30 LIMIT 1)
                    ) AS item
                  FROM (SELECT n1.* FROM public.negocios n1
                        WHERE n1.organization_id = p_organization_id AND n1.entity_id = p_entity_id
                          AND n1.deleted_at IS NULL
                        ORDER BY n1.created_at DESC, n1.id DESC
                        LIMIT 50) n
                  -- 20261226170000: o evento que registou a decisão (índice
                  -- idx_negocio_eventos_origem), para a prova e o canal.
                  LEFT JOIN LATERAL (
                    SELECT ed.prova, ed.canal FROM public.negocio_eventos ed
                    WHERE n.decisao_origem_id IS NOT NULL
                      AND ed.negocio_id = n.id AND ed.origem_id = n.decisao_origem_id
                      AND ed.tipo = CASE n.estado WHEN 'ganho' THEN 'ganhou' WHEN 'perdido' THEN 'perdeu' END
                    ORDER BY ed.created_at DESC, ed.id DESC
                    LIMIT 1
                  ) dv ON true
                  -- 20261226190000: as permissões deste negócio, contra as chaves
                  -- lidas acima (só memória; nenhuma leitura de tabela por negócio).
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

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  v_txt text;
BEGIN
  -- Atributos e privilégios: os de antes (INVOKER, STABLE, dono postgres,
  -- search_path, statement_timeout, EXECUTE só para o dono e authenticated,
  -- como lido no remoto a 21/10), uma só assinatura, e a versão desta migration.
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])')) AS e(sig)
            LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 's'
               OR pg_catalog.pg_get_userbyid(p.proowner)::text <> 'postgres'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp,statement_timeout=5s'
               OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
               OR md5(pg_catalog.pg_get_functiondef(p.oid)) IS DISTINCT FROM '660ab3965289041b46032bc52b597d59');
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_ficha_pessoa') <> 1 THEN
    v_txt := COALESCE(v_txt || ', ', '') || 'mais do que uma neg_ficha_pessoa';
  END IF;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (atributos, privilégios ou versão de neg_ficha_pessoa): %', v_txt;
  END IF;
END
$conferir$;

COMMIT;

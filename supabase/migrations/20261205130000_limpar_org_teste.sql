-- =============================================================================
-- Limpar os dados da organização de teste «teste»
-- (id 1ee94593-5916-4186-9342-3f39482248b7)
--
-- AUTORIZAÇÃO: Miguel, «ELLLIMIN TUDO DESSA ORG TESTE AH VONTADE». O âmbito é
-- APENAS a organização «teste». A Mudelar (Mudelar, Mudelar - Lisboa (Sede),
-- Mudelar - Delegação Norte) é a única produção real e NUNCA é tocada.
--
-- O QUE APAGA (eliminação real, não soft delete, para não ficarem dados
-- pessoais):
--   - leads, contactos, clientes, contratos (e eventos) da «teste»;
--   - campanhas e tudo o que pende delas (canais, métricas, gastos, UTM,
--     objectivos, fontes, ligações campanha-lead) e os formulários
--     (campos, passos, branding);
--   - produtos, preços e histórico, marcas, pacotes, categorias, fornecedores
--     e as ligações produto/marca/categoria-organização da «teste»;
--   - conversas de IA;
--   - itens e recursos de agenda da «teste» e o quadro «Férias e Ausências»;
--   - as 21 entidades usadas SÓ pela «teste» (com emails, telefones, histórico,
--     moradas e papéis) — as entidades são calculadas em runtime;
--   - as ligações entidade-organização e os papéis de entidade da «teste»;
--   - os 3 papéis próprios da «teste» (Administrador, Colaborador,
--     Visualizador) e as suas permissões, se nada os referenciar;
--   - o mapa de migração de contactos da «teste» e o registo de auditoria da
--     «teste» (por último).
--
-- O QUE MANTÉM, E PORQUÊ:
--   - o quadro de agenda «hb» e os seus itens: 31 itens de organizações
--     Mudelar apontam para ele, e schedule_items.board_id é ON DELETE CASCADE.
--     Por isso o quadro «hb» NUNCA é apagado, e a linha da organização também
--     não (o cascade levaria os itens da Mudelar). A migration conta os itens
--     do «hb» antes e confere-os depois; se algum desaparecer, tudo recua;
--   - as entidades de23d1e0-c64a-4f4f-bf31-0f74b83dbf47 (partilhada com Grupo
--     BMLar, BM24, BMGest e uma Mudelar) e a0000001-0000-0000-0000-000000000006
--     (partilhada com uma Mudelar, 22 leads lá): só se apagam as linhas da
--     «teste» (ligação à organização e papéis de entidade); as entidades, os
--     seus emails/telefones/histórico/moradas e os registos das outras
--     organizações ficam intactos e são conferidos antes e depois;
--   - a «casca» da organização: a linha da organização, a entidade própria
--     (8b2a96a7-...) e a morada, a membership da Beatriz (papel global) e o
--     utilizador, e a subscrição. Só se apagariam se o utilizador pedir para
--     apagar a própria organização.
--
-- NÃO É REVERSÍVEL. É uma migration de DADOS: não há rollback de dados. Se
-- alguma verificação falhar, a transacção inteira recua e nada é apagado; depois
-- de aplicada com sucesso, só um backup da base recupera os dados apagados.
-- Esta migration não precisa de código novo e não altera o esquema.
--
-- Segura numa base reconstruída: se a organização não existir ou não se chamar
-- exactamente «teste», só emite um NOTICE e sai.
-- =============================================================================

DO $limpar$
DECLARE
  c_org         constant uuid := '1ee94593-5916-4186-9342-3f39482248b7';
  c_own_entity  constant uuid := '8b2a96a7-6a73-4c64-9945-b8164bc3efac';
  c_hb          constant uuid := 'e365acc3-b075-4df8-9985-de987c112337';
  c_shared_1    constant uuid := 'de23d1e0-c64a-4f4f-bf31-0f74b83dbf47';
  c_shared_2    constant uuid := 'a0000001-0000-0000-0000-000000000006';
  c_shared      constant uuid[] := ARRAY[
                  'de23d1e0-c64a-4f4f-bf31-0f74b83dbf47'::uuid,
                  'a0000001-0000-0000-0000-000000000006'::uuid];
  c_only_expected constant int := 21;

  v_nome        text;
  v_ent_all     uuid[];
  v_ent_foreign uuid[];
  v_ent_only    uuid[];
  v_campaigns   uuid[];
  v_channels    uuid[];
  v_forms       uuid[];
  v_products    uuid[];
  v_contracts   uuid[];
  v_items       uuid[];
  v_roles_del   uuid[];
  v_hb_items    uuid[];
  v_sh_leads    uuid[];
  v_sh_clients  uuid[];
  v_sh_contacts uuid[];
  v_sh_children text;
  v_sh_children_depois text;
  v_members_antes int;
  v_subs_antes  int;
  v_n           int;
  v_t           text;
  v_pair        text[];
BEGIN
  -- 0. Guarda: a organização existe e chama-se exactamente «teste».
  SELECT name INTO v_nome FROM public.anew_organizations WHERE id = c_org;
  IF v_nome IS DISTINCT FROM 'teste' THEN
    RAISE NOTICE 'limpar_org_teste: organização % ausente ou com outro nome (%); nada a fazer.',
      c_org, v_nome;
    RETURN;
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);
  -- Os triggers de auditoria respeitam isto: os deletes não escrevem novas
  -- linhas de auditoria com os dados pessoais apagados.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- 1. Estado ANTES (âncoras das verificações).
  SELECT coalesce(array_agg(id), '{}') INTO v_hb_items
    FROM public.schedule_items WHERE board_id = c_hb;

  SELECT coalesce(array_agg(id), '{}') INTO v_sh_leads
    FROM public.anew_leads WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org;
  SELECT coalesce(array_agg(id), '{}') INTO v_sh_clients
    FROM public.anew_clients WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org;
  SELECT coalesce(array_agg(id), '{}') INTO v_sh_contacts
    FROM public.anew_contacts WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org;

  v_sh_children :=
       (SELECT count(*) FROM public.anew_entities WHERE id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_emails WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_phones WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_history WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_addresses WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_org_links
         WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org)::text || '/'
    || (SELECT count(*) FROM public.anew_entity_roles
         WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org)::text;

  SELECT count(*) INTO v_members_antes FROM public.anew_memberships WHERE organization_id = c_org;
  SELECT count(*) INTO v_subs_antes FROM public.organization_subscriptions WHERE organization_id = c_org;
  IF v_members_antes < 1 THEN
    RAISE EXCEPTION 'limpar_org_teste: a organização teste não tem memberships (esperava pelo menos a da Beatriz).';
  END IF;

  -- 2. Conjunto explícito das entidades usadas SÓ pela «teste» (sem a entidade
  --    própria da organização, que fica).
  SELECT coalesce(array_agg(DISTINCT e), '{}') INTO v_ent_all FROM (
    SELECT entity_id AS e FROM public.anew_entity_org_links WHERE organization_id = c_org
    UNION SELECT entity_id FROM public.anew_leads    WHERE organization_id = c_org
    UNION SELECT entity_id FROM public.anew_clients  WHERE organization_id = c_org
    UNION SELECT entity_id FROM public.anew_contacts WHERE organization_id = c_org
    UNION SELECT entity_id FROM public.anew_entity_roles WHERE organization_id = c_org
  ) s WHERE e IS NOT NULL;

  SELECT coalesce(array_agg(DISTINCT e), '{}') INTO v_ent_foreign FROM (
    SELECT entity_id AS e FROM public.anew_entity_org_links
      WHERE entity_id = ANY (v_ent_all) AND organization_id IS DISTINCT FROM c_org
    UNION SELECT entity_id FROM public.anew_leads
      WHERE entity_id = ANY (v_ent_all) AND organization_id IS DISTINCT FROM c_org
    UNION SELECT entity_id FROM public.anew_clients
      WHERE entity_id = ANY (v_ent_all) AND organization_id IS DISTINCT FROM c_org
    UNION SELECT entity_id FROM public.anew_contacts
      WHERE entity_id = ANY (v_ent_all) AND organization_id IS DISTINCT FROM c_org
    UNION SELECT entity_id FROM public.anew_entity_roles
      WHERE entity_id = ANY (v_ent_all) AND organization_id IS DISTINCT FROM c_org
  ) s;

  SELECT coalesce(array_agg(e), '{}') INTO v_ent_only
    FROM unnest(v_ent_all) e
   WHERE e <> c_own_entity AND NOT (e = ANY (v_ent_foreign));

  IF c_shared_1 = ANY (v_ent_only) OR c_shared_2 = ANY (v_ent_only) OR c_own_entity = ANY (v_ent_only) THEN
    RAISE EXCEPTION 'limpar_org_teste: uma entidade partilhada ou a entidade própria entrou no conjunto a apagar.';
  END IF;
  IF cardinality(v_ent_only) <> c_only_expected THEN
    RAISE EXCEPTION 'limpar_org_teste: esperava % entidades só da teste, medi %.',
      c_only_expected, cardinality(v_ent_only);
  END IF;

  -- Referências de OUTRAS organizações (ou sem FK a travar) às entidades a
  -- apagar: tem de ser zero, senão um ON DELETE SET NULL limpava-as em silêncio.
  SELECT
      (SELECT count(*) FROM public.deals WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.proposals WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.quotes WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.direct_sales WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.client_portal_users WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.data_erasure_requests WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.form_submissions
        WHERE entity_id = ANY (v_ent_only) OR conflicting_entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.entity_interactions
        WHERE entity_id = ANY (v_ent_only) AND organization_id IS DISTINCT FROM c_org)
    + (SELECT count(*) FROM public.client_contracts
        WHERE entity_id = ANY (v_ent_only) AND organization_id IS DISTINCT FROM c_org)
    + (SELECT count(*) FROM public.anew_entity_org_links
        WHERE entity_id = ANY (v_ent_only) AND organization_id IS DISTINCT FROM c_org)
    + (SELECT count(*) FROM public.entity_audit_log
        WHERE entity_id = ANY (v_ent_only) AND organization_id IS DISTINCT FROM c_org)
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % referências externas às entidades da teste; abortado.', v_n;
  END IF;

  -- Conjuntos de pais (para apagar filhos sem organization_id e para conferir).
  SELECT coalesce(array_agg(id), '{}') INTO v_campaigns FROM public.campaigns WHERE organization_id = c_org;
  SELECT coalesce(array_agg(id), '{}') INTO v_channels  FROM public.channels WHERE campaign_id = ANY (v_campaigns);
  SELECT coalesce(array_agg(id), '{}') INTO v_forms     FROM public.forms WHERE organization_id = c_org;
  SELECT coalesce(array_agg(id), '{}') INTO v_products  FROM public.products WHERE organization_id = c_org;
  SELECT coalesce(array_agg(id), '{}') INTO v_contracts FROM public.client_contracts WHERE organization_id = c_org;
  SELECT coalesce(array_agg(id), '{}') INTO v_items
    FROM public.schedule_items WHERE organization_id = c_org AND board_id IS DISTINCT FROM c_hb;

  -- Pré-condições que, se falhassem, fariam um cascade/SET NULL tocar noutras
  -- organizações (ou no quadro «hb»).
  -- a) campaign_leads de campanhas de outras organizações apontando a leads da teste.
  SELECT count(*) INTO v_n FROM public.campaign_leads
   WHERE anew_lead_id IN (SELECT id FROM public.anew_leads WHERE organization_id = c_org)
     AND NOT (campaign_id = ANY (v_campaigns));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % campaign_leads de campanhas alheias apontam a leads da teste.', v_n;
  END IF;
  -- b) nada de outras organizações nos quadros que vão ser apagados (todos menos «hb»).
  SELECT count(*) INTO v_n FROM public.schedule_items
   WHERE board_id IN (SELECT id FROM public.schedule_boards WHERE organization_id = c_org AND id <> c_hb)
     AND organization_id IS DISTINCT FROM c_org;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % itens de outras organizações em quadros da teste (que não o hb).', v_n;
  END IF;
  -- c) a atribuição (assignees) de recursos da teste a itens de outras organizações.
  SELECT count(*) INTO v_n FROM public.schedule_item_assignees a
   WHERE a.resource_id IN (SELECT id FROM public.schedule_resources WHERE organization_id = c_org)
     AND a.item_id IN (SELECT id FROM public.schedule_items WHERE organization_id IS DISTINCT FROM c_org);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % atribuições de recursos da teste a itens alheios.', v_n;
  END IF;
  -- d) itens de outras organizações ligados a leads da teste (SET NULL em silêncio).
  SELECT count(*) INTO v_n FROM public.schedule_items
   WHERE lead_id IN (SELECT id FROM public.anew_leads WHERE organization_id = c_org)
     AND organization_id IS DISTINCT FROM c_org;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % itens de outras organizações apontam a leads da teste.', v_n;
  END IF;
  -- e) categorias de outras organizações filhas de categorias da teste (cascade).
  SELECT count(*) INTO v_n FROM public.product_categories
   WHERE (parent_id IN (SELECT id FROM public.product_categories WHERE organization_id = c_org)
       OR parent_category_id IN (SELECT id FROM public.product_categories WHERE organization_id = c_org))
     AND organization_id IS DISTINCT FROM c_org;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % categorias de outras organizações dependem de categorias da teste.', v_n;
  END IF;
  -- f) produtos/marcas/categorias da teste usados por outras organizações.
  SELECT
      (SELECT count(*) FROM public.product_organizations
        WHERE product_id = ANY (v_products) AND organization_id IS DISTINCT FROM c_org)
    + (SELECT count(*) FROM public.brand_organizations
        WHERE brand_id IN (SELECT id FROM public.brands WHERE organization_id = c_org)
          AND organization_id IS DISTINCT FROM c_org)
    + (SELECT count(*) FROM public.product_category_organizations
        WHERE category_id IN (SELECT id FROM public.product_categories WHERE organization_id = c_org)
          AND organization_id IS DISTINCT FROM c_org)
    + (SELECT count(*) FROM public.products
        WHERE organization_id IS DISTINCT FROM c_org
          AND (brand_id IN (SELECT id FROM public.brands WHERE organization_id = c_org)
            OR category_id IN (SELECT id FROM public.product_categories WHERE organization_id = c_org)
            OR subcategory_id IN (SELECT id FROM public.product_categories WHERE organization_id = c_org)
            OR supplier_id IN (SELECT id FROM public.suppliers WHERE organization_id = c_org)))
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % ligações de outras organizações a catálogo da teste.', v_n;
  END IF;

  -- Papéis da teste que podem ser apagados: não-sistema e sem referências.
  SELECT coalesce(array_agg(r.id), '{}') INTO v_roles_del
    FROM public.anew_roles r
   WHERE r.organization_id = c_org
     AND coalesce(r.is_system, false) = false
     AND NOT EXISTS (SELECT 1 FROM public.anew_memberships m WHERE m.role_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM public.user_creation_templates t WHERE t.default_role_id = r.id);

  -- 3. Apagar, por ordem das chaves estrangeiras.
  -- 3.1 Campanhas: ligações e filhos.
  DELETE FROM public.campaign_leads WHERE campaign_id = ANY (v_campaigns);
  DELETE FROM public.channel_metrics WHERE channel_id = ANY (v_channels);
  DELETE FROM public.channel_spend_entries WHERE channel_id = ANY (v_channels);
  DELETE FROM public.channel_utm_mappings
   WHERE channel_id = ANY (v_channels) OR campaign_id = ANY (v_campaigns);
  DELETE FROM public.campaign_goals WHERE campaign_id = ANY (v_campaigns);
  DELETE FROM public.campaign_sources WHERE campaign_id = ANY (v_campaigns);
  DELETE FROM public.channels WHERE campaign_id = ANY (v_campaigns);

  -- 3.2 Leads (antes das campanhas e dos clientes), contactos, contratos, clientes.
  DELETE FROM public.anew_leads WHERE organization_id = c_org;
  DELETE FROM public.anew_contacts WHERE organization_id = c_org;
  DELETE FROM public.client_contract_events WHERE contract_id = ANY (v_contracts);
  DELETE FROM public.client_contracts WHERE organization_id = c_org;
  DELETE FROM public.anew_clients WHERE organization_id = c_org;

  -- 3.3 Campanhas e formulários (campanhas primeiro: campaigns.form_id é NO ACTION).
  DELETE FROM public.campaigns WHERE organization_id = c_org;
  DELETE FROM public.forms WHERE organization_id = c_org;

  -- 3.4 Catálogo.
  DELETE FROM public.product_price_history WHERE product_id = ANY (v_products);
  DELETE FROM public.product_prices WHERE product_id = ANY (v_products);
  DELETE FROM public.product_organizations WHERE organization_id = c_org OR product_id = ANY (v_products);
  DELETE FROM public.products WHERE organization_id = c_org;
  DELETE FROM public.product_category_organizations WHERE organization_id = c_org;
  DELETE FROM public.brand_organizations WHERE organization_id = c_org;
  DELETE FROM public.brands WHERE organization_id = c_org;
  DELETE FROM public.bundles WHERE organization_id = c_org;
  DELETE FROM public.product_categories WHERE organization_id = c_org;
  DELETE FROM public.suppliers WHERE organization_id = c_org;

  -- 3.5 Conversas de IA.
  DELETE FROM public.ai_suggestion_ratings
   WHERE conversation_id IN (SELECT id FROM public.ai_conversations WHERE organization_id = c_org);
  DELETE FROM public.ai_conversations WHERE organization_id = c_org;

  -- 3.6 Agenda: itens próprios fora do «hb», recursos, e o quadro «Férias e
  --     Ausências». O quadro «hb» nunca é apagado.
  DELETE FROM public.schedule_item_events WHERE item_id = ANY (v_items);
  DELETE FROM public.schedule_items WHERE id = ANY (v_items);
  DELETE FROM public.schedule_resources WHERE organization_id = c_org;
  DELETE FROM public.schedule_boards WHERE organization_id = c_org AND id <> c_hb;

  -- 3.7 Entidades usadas só pela teste (a própria da organização fica).
  DELETE FROM public.anew_entity_emails WHERE entity_id = ANY (v_ent_only);
  DELETE FROM public.anew_entity_phones WHERE entity_id = ANY (v_ent_only);
  DELETE FROM public.anew_entity_history WHERE entity_id = ANY (v_ent_only);
  DELETE FROM public.anew_entity_addresses WHERE entity_id = ANY (v_ent_only);
  DELETE FROM public.anew_entity_roles WHERE entity_id = ANY (v_ent_only);
  DELETE FROM public.anew_entity_org_links WHERE entity_id = ANY (v_ent_only);
  DELETE FROM public.anew_entities WHERE id = ANY (v_ent_only);
  DELETE FROM public.anew_entity_roles WHERE organization_id = c_org;
  DELETE FROM public.anew_entity_org_links WHERE organization_id = c_org;
  DELETE FROM public._migration_contacts_to_leads_map WHERE organization_id = c_org;

  -- 3.8 Papéis próprios (apenas os não referenciados).
  DELETE FROM public.anew_role_permissions WHERE role_id = ANY (v_roles_del);
  DELETE FROM public.anew_roles WHERE id = ANY (v_roles_del);

  -- 3.9 Auditoria da teste, por último.
  DELETE FROM public.entity_audit_log WHERE organization_id = c_org;

  -- 4. Verificações finais (qualquer falha recua tudo).
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ['anew_leads','organization_id'], ['anew_contacts','organization_id'],
    ['anew_clients','organization_id'], ['client_contracts','organization_id'],
    ['campaigns','organization_id'], ['forms','organization_id'],
    ['products','organization_id'], ['brands','organization_id'],
    ['bundles','organization_id'], ['product_categories','organization_id'],
    ['suppliers','organization_id'], ['product_organizations','organization_id'],
    ['product_category_organizations','organization_id'],
    ['brand_organizations','organization_id'], ['ai_conversations','organization_id'],
    ['schedule_items','organization_id'], ['schedule_resources','organization_id'],
    ['anew_entity_roles','organization_id'], ['anew_entity_org_links','organization_id'],
    ['_migration_contacts_to_leads_map','organization_id'],
    ['entity_audit_log','organization_id']
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_pair[1], v_pair[2])
      INTO v_n USING c_org;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'limpar_org_teste: ficaram % linhas em % para a teste.', v_n, v_pair[1];
    END IF;
  END LOOP;

  -- Papéis: só podem ficar os que ainda estão referenciados ou são de sistema.
  SELECT count(*) INTO v_n FROM public.anew_roles WHERE id = ANY (v_roles_del);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % papéis da teste por apagar.', v_n;
  END IF;

  -- Quadros: só o «hb».
  SELECT count(*) INTO v_n FROM public.schedule_boards WHERE organization_id = c_org AND id <> c_hb;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: % quadros da teste por apagar (além do hb).', v_n;
  END IF;

  -- Filhos sem organization_id.
  SELECT
      (SELECT count(*) FROM public.campaign_leads WHERE campaign_id = ANY (v_campaigns))
    + (SELECT count(*) FROM public.campaign_goals WHERE campaign_id = ANY (v_campaigns))
    + (SELECT count(*) FROM public.campaign_sources WHERE campaign_id = ANY (v_campaigns))
    + (SELECT count(*) FROM public.channels WHERE campaign_id = ANY (v_campaigns))
    + (SELECT count(*) FROM public.channel_utm_mappings WHERE campaign_id = ANY (v_campaigns) OR channel_id = ANY (v_channels))
    + (SELECT count(*) FROM public.channel_spend_entries WHERE channel_id = ANY (v_channels))
    + (SELECT count(*) FROM public.form_fields WHERE form_id = ANY (v_forms))
    + (SELECT count(*) FROM public.form_steps WHERE form_id = ANY (v_forms))
    + (SELECT count(*) FROM public.form_branding WHERE form_id = ANY (v_forms))
    + (SELECT count(*) FROM public.product_prices WHERE product_id = ANY (v_products))
    + (SELECT count(*) FROM public.product_price_history WHERE product_id = ANY (v_products))
    + (SELECT count(*) FROM public.client_contract_events WHERE contract_id = ANY (v_contracts))
    + (SELECT count(*) FROM public.schedule_item_events WHERE item_id = ANY (v_items))
    + (SELECT count(*) FROM public.anew_entities WHERE id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.anew_entity_emails WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.anew_entity_phones WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.anew_entity_history WHERE entity_id = ANY (v_ent_only))
    + (SELECT count(*) FROM public.anew_entity_addresses WHERE entity_id = ANY (v_ent_only))
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'limpar_org_teste: ficaram % linhas filhas por apagar.', v_n;
  END IF;

  -- Quadro «hb»: todos os itens que lá estavam continuam lá.
  SELECT count(*) INTO v_n FROM public.schedule_items WHERE id = ANY (v_hb_items) AND board_id = c_hb;
  IF v_n <> cardinality(v_hb_items) THEN
    RAISE EXCEPTION 'limpar_org_teste: itens do hb antes %, depois %.', cardinality(v_hb_items), v_n;
  END IF;

  -- Entidades partilhadas: registos de outras organizações intactos.
  SELECT count(*) INTO v_n FROM public.anew_leads WHERE id = ANY (v_sh_leads) AND entity_id = ANY (c_shared);
  IF v_n <> cardinality(v_sh_leads) THEN
    RAISE EXCEPTION 'limpar_org_teste: leads alheias nas entidades partilhadas antes %, depois %.',
      cardinality(v_sh_leads), v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_clients WHERE id = ANY (v_sh_clients) AND entity_id = ANY (c_shared);
  IF v_n <> cardinality(v_sh_clients) THEN
    RAISE EXCEPTION 'limpar_org_teste: clientes alheios nas entidades partilhadas antes %, depois %.',
      cardinality(v_sh_clients), v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_contacts WHERE id = ANY (v_sh_contacts) AND entity_id = ANY (c_shared);
  IF v_n <> cardinality(v_sh_contacts) THEN
    RAISE EXCEPTION 'limpar_org_teste: contactos alheios nas entidades partilhadas antes %, depois %.',
      cardinality(v_sh_contacts), v_n;
  END IF;

  v_sh_children_depois :=
       (SELECT count(*) FROM public.anew_entities WHERE id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_emails WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_phones WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_history WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_addresses WHERE entity_id = ANY (c_shared))::text || '/'
    || (SELECT count(*) FROM public.anew_entity_org_links
         WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org)::text || '/'
    || (SELECT count(*) FROM public.anew_entity_roles
         WHERE entity_id = ANY (c_shared) AND organization_id IS DISTINCT FROM c_org)::text;
  IF v_sh_children_depois <> v_sh_children THEN
    RAISE EXCEPTION 'limpar_org_teste: entidades partilhadas mudaram (antes %, depois %).',
      v_sh_children, v_sh_children_depois;
  END IF;

  -- Casca da organização intacta.
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c_org) THEN
    RAISE EXCEPTION 'limpar_org_teste: a linha da organização desapareceu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_entities WHERE id = c_own_entity) THEN
    RAISE EXCEPTION 'limpar_org_teste: a entidade própria da organização desapareceu.';
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_memberships WHERE organization_id = c_org;
  IF v_n <> v_members_antes THEN
    RAISE EXCEPTION 'limpar_org_teste: memberships antes %, depois %.', v_members_antes, v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.organization_subscriptions WHERE organization_id = c_org;
  IF v_n <> v_subs_antes THEN
    RAISE EXCEPTION 'limpar_org_teste: subscrições antes %, depois %.', v_subs_antes, v_n;
  END IF;

  RAISE NOTICE 'limpar_org_teste: concluído. Entidades apagadas: %, itens do hb preservados: %.',
    cardinality(v_ent_only), cardinality(v_hb_items);
END
$limpar$;

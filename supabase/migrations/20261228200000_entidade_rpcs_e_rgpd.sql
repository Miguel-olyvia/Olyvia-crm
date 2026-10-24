-- ============================================================
-- 20261228200000_entidade_rpcs_e_rgpd
-- ============================================================
-- Alvo: SO a base de RH (uetjghdkwbywbftedtth). Ultima migration de base de
-- dados da entidade unica (a 20261228100000 ja esta aplicada: anew_entities
-- tem organizacao, contacto, fiscal, cliente desde, responsavel, origem,
-- campanha e atividade). Especificacao:
-- vault/ficheiros/crm/nova-base/entidade-unica-antes-e-depois.html
-- Decisao do utilizador: PROJETO DE RAIZ. A RH nao tem leads, clientes,
-- visitas, convites nem submissoes (lido no catalogo: 0 em todas); por isso
-- nada se copia e as colunas lead_id/client_id das visitas e dos convites
-- APAGAM-SE, recriando antes tudo o que as usava.
--
-- O que faz, por ordem
--   0. GUARDAS iniciais: aborta se houver visitas com lead_id/client_id ou
--      convites (nada se copia), se ja existir alguma das funcoes novas, ou
--      se as funcoes de ambito (1.6.2b) e as que elas chamam faltarem ou
--      tiverem outra assinatura.
--   1. VISITAS E CONVITES POR ENTIDADE
--      - schedule_items.entity_id e scheduling_invites.entity_id (uuid), com
--        FK composta (entity_id, organization_id) -> anew_entities(id,
--        organization_id) ON DELETE SET NULL (entity_id): a pessoa e sempre da
--        mesma organizacao da visita/convite, e apagar a pessoa so limpa a
--        ligacao. Indices (entity_id, organization_id) parciais.
--      - Funcao nova fn_schedule_items_resolver_entidade (DEFINER, so para
--        as RPCs da agenda): resolve a pessoa a partir de entity_id, ou de
--        uma lead/cliente antigos, na organizacao; recusa pessoa de outra
--        organizacao, apagada, ou lead/cliente/pessoa que nao coincidem.
--      - Recriadas SEM lead_id/client_id da visita (mesma assinatura, dono,
--        seguranca, search_path e EXECUTE, por CREATE OR REPLACE):
--        fn_levantamentos_validar_ligacoes, fn_neg_ficha_seccao,
--        fn_neg_pode_mudar_dono_lead, fn_neg_visita_editavel,
--        fn_owner_sync_entity_from_visit, fn_owner_sync_future_visits,
--        neg_alterar_visita, neg_ficha_pessoa, neg_ligar_registo,
--        neg_resultado_visita. Corpo = versao em vigor na RH
--        (pg_get_functiondef), com a ligacao da visita trocada para
--        entity_id; neg_ficha_pessoa e neg_resultado_visita tambem passam a
--        tirar a pessoa e a abordagem da entidade (ver 1.6).
--        O responsavel que a troca de recursos de uma visita futura mexe passa
--        a ser anew_entities.assigned_to (e as outras visitas futuras da
--        pessoa seguem-no, por fn_owner_sync_apply('entity', ...)).
--      - rpc_create_schedule_item e rpc_update_schedule_item ganham
--        p_entity_id (e p_set_entity_id), no fim e com valor por omissao; a
--        assinatura antiga e apagada antes (nunca ficam duas). p_lead_id e
--        p_client_id continuam aceites e resolvem-se para a entidade.
--        EXECUTE reposto igual ao em vigor (authenticated e service_role).
--      - Trigger trg_schedule_items_sync_lead_contact e a sua funcao
--        fn_schedule_items_sync_lead_contact apagadas (so sincronizavam
--        lead_id <-> contact_id).
--      - Apaga os indices idx_schedule_items_lead, idx_schedule_items_client,
--        idx_scheduling_invites_lead, as FKs schedule_items_lead_id_fkey e
--        scheduling_invites_lead_id_fkey e as colunas schedule_items.lead_id,
--        schedule_items.client_id e scheduling_invites.lead_id, sem CASCADE,
--        com guarda no catalogo (pg_depend) de que nada mais depende delas.
--        scheduling_invites NUNCA teve client_id (lido no catalogo).
--      - 1.6 A PESSOA E A ENTIDADE: uma entidade criada so pelo formulario
--        (sem anew_leads, anew_clients nem anew_entity_org_links) abre-se e
--        trabalha-se. anew_entities ganha closure_result (abordagem
--        encerrada: semInteresse|obraInviavel, NULL = aberta). Funcao nova
--        fn_neg_pessoa_no_ambito (DEFINER, so boolean): entidade viva da
--        organizacao e ambito de quem chama (leads.<acao> para leads,
--        clients.<acao> para clientes; org:*, responsavel, criador).
--        fn_neg_exigir_pessoa passa a usa-la (deixa de exigir lead/cliente e
--        ligacao), e com ela neg_ficha_pessoa, fn_neg_ficha_seccao,
--        neg_registar_contacto, fn_neg_gravar_nota, neg_criar_lead,
--        neg_guardar_levantamento e as abaixo. Recriadas pela entidade:
--        neg_guardar_visita (grava a visita com p_entity_id),
--        fn_neg_mudar_abordagem (DEFINER; encerra/reabre em closure_result),
--        neg_criar_negocio (abordagem da entidade), neg_guardar_identidade_pessoa
--        e neg_substituir_contacto (ambito pela entidade).
--        neg_ficha_pessoa tira papel, etapa, responsavel, origem, campanha,
--        formulario, atividade, abordagem e conversao_pendente da entidade
--        (como a lista); neg_resultado_visita encerra a abordagem da entidade.
--        Politicas negocios_insert e levantamentos_insert: entidade viva da
--        organizacao em vez de anew_entity_org_links.
--        1.6.2b Funcoes de ambito das politicas (CREATE OR REPLACE, mesma
--        assinatura, DEFINER, search_path 'public' e EXECUTE em vigor):
--        can_see_entity, is_entity_in_user_scope e
--        is_entity_contact_in_owner_scope mantem todos os ramos e ganham um
--        ramo pela organizacao da propria entidade (viva, organizacao visivel,
--        ambito leads.*/clients.* por client_since). Passam a deixar ver e
--        editar uma entidade criada so pelo formulario as 28 politicas que as
--        chamam: SELECT/INSERT/UPDATE/DELETE de anew_entity_emails,
--        anew_entity_phones, anew_entity_addresses,
--        anew_entity_fiscal_entities e anew_entity_history; SELECT/UPDATE/DELETE
--        de anew_addresses e de anew_entities; SELECT/UPDATE de
--        fiscal_entities. E as funcoes que as chamam: preview_entity_erasure,
--        filter_visible_entity_ids, search_visible_entity_ids,
--        fn_entity_delivery_address_access, resolve_quote_address,
--        resolve_proposal_address, sync_entity_primary_address,
--        upsert_entity_identity e rpc_finalize_user_profile_full.
--        Ambito sem escrita direta: authenticated perde o UPDATE de tabela em
--        anew_entities e fica com UPDATE por coluna sem assigned_to,
--        created_by, client_since, deleted_at/by, organization_id, origin_id,
--        campaign_id, last_activity_at, legacy_* e closure_result. RPCs novas
--        para essa escrita: neg_atribuir_pessoa (responsavel) e
--        neg_apagar_pessoa (lixo e restauro).
--      - 1.6.10 PASSAR A CLIENTE pela entidade: fn_neg_converter_pessoa (a
--        conversao automatica ao ganhar, por fn_neg_ganhar_interno) passa a
--        escrever so anew_entities.client_since (dia do ganho em Lisboa, se
--        vazio) e a limpar closure_result; deixa de criar anew_clients e de
--        fechar anew_leads. Funcao nova fn_neg_tornar_cliente (DEFINER,
--        EXECUTE authenticated e service_role): a conversao pedida no ecra,
--        com sessao, negocio ganho editavel e leads.convert com ambito sobre
--        a entidade (fn_neg_pessoa_no_ambito ganha a acao 'convert').
--        neg_ganhar_negocio usa-a (mesma assinatura e chaves; conversao
--        'feita' ou 'ja_cliente'; sem NG015) e neg_reavaliar_negocio decide
--        quem converte pela entidade.
--      - 1.6.11 Sem qualificacao MQL/SQL: neg_classificar_lead fica inerte
--        (valida, nao escreve, devolve as mesmas chaves com mudou false).
--      - 1.6.12 Pela entidade, mesma assinatura, seguranca e EXECUTE:
--        neg_criar_lead (a lead e a propria entidade: nao cria nada; cliente
--        da NG009), fn_neg_tem_lead_aberta (lead = client_since nulo e sem
--        negocio aberto), fn_neg_filtro_pessoas (regras da lista),
--        neg_procurar_duplicados (universo = entidades vivas da organizacao e
--        do grupo; email, telefone e NIF tambem da propria entidade) e
--        neg_cancelar_visita (corpo igual, sem referencia as leads).
--   2. FORMULARIO E SUBMISSOES (o formulario so cria a entidade e nunca
--      recusa a captacao; a campanha e opcional)
--      - form_submissions ganha origin_id (FK lead_sources), origin_recognized,
--        channel_id (FK channels), negocio_id (FK negocios), todas ON DELETE
--        SET NULL e anulaveis, campaign_via (link|formulario|mao|nenhuma) e
--        needs_manual_scheduling (pedido manual de agendamento, false por
--        omissao). form_id e campaign_id ja eram anulaveis; entity_id
--        continua obrigatorio. target_type e target_id passam a anulaveis e
--        aceitam 'entity' (a submissao aponta para a entidade); o trigger
--        check_form_submissions_target valida tambem 'entity'.
--      - A politica form_submissions_select_org passa a decidir pela
--        entidade (organizacao + ambito leads.view/clients.view sobre o
--        responsavel ou o criador da entidade), em vez de anew_leads/clients.
--      - upsert_form_submission: apagada e recriada com os mesmos 12
--        parametros, pela mesma ordem, e 6 novos no fim, todos opcionais;
--        target_type/target_id por omissao 'entity'/entity_id. Mesmo
--        SECURITY DEFINER, search_path e EXECUTE (so service_role).
--      - Funcao nova fn_form_resolver_captacao(p_form_id, p_campaign_id,
--        p_origem): campanha valida so se for da organizacao do formulario
--        (senao nenhuma, sem erro), campaign_via, origem reconhecida por nome
--        ou sinonimo (lead_sources.utm_aliases) e se foi reconhecida, e o
--        canal. SECURITY DEFINER, search_path fixo, EXECUTE so service_role.
--        Canal «Outros» = channel_id NULL (channels exige campanha; nao se cria
--        tabela nem linha nova: e o minimo).
--   3. LISTA E QUADRO pela entidade
--      - anew_entities: quem ve a entidade ve todas as suas colunas;
--        authenticated passa a ler as 20 que ainda nao lia (responsavel,
--        origem, campanha, ultima atividade, abordagem, contacto, fiscal,
--        notas, extra...). So as 3 fiscais cifradas (nif_encrypted,
--        nif_hash, billing_nif_encrypted) continuam SEM leitura direta.
--        A escrita nao muda (1.6.7): responsavel so por neg_atribuir_pessoa,
--        organizacao e colunas de sistema sem UPDATE direto.
--        fn_generic_entity_audit passa a retirar do log so as 3 cifradas.
--      - Indices de pagina: (organization_id, GREATEST(created_at,
--        last_activity_at) DESC, id DESC) e (organization_id,
--        COALESCE(lower(display_name), ''), id), so entidades vivas.
--      - neg_resumo_quadro e neg_resumo_pessoas recriadas (CREATE OR
--        REPLACE: mesma assinatura e o mesmo formato de resposta, SECURITY
--        INVOKER, search_path e statement_timeout, EXECUTE) a ler
--        anew_entities: lead se client_since e nulo, cliente se tem data;
--        sem apagadas; so a organizacao pedida; ambito em vigor (leads.view
--        para leads e clients.view para clientes, chaves org:*,
--        org:responsavel, org:criador de crm_scope_keys) mais a RLS de quem
--        chama. fn_neg_pesquisa_pessoas (DEFINER) recriada pela entidade
--        (nome, email e telefone da entidade e das tabelas de emails e
--        telefones). Colunas que eram da lead e ja nao existem (lead_id,
--        client_id, lead_status, qualificacao_tipo,
--        ultimo_contacto_lead_em, origem_detalhe) vem a NULL. A abordagem
--        encerrada e a da entidade (closure_result): como na versao em vigor,
--        quem a tem encerrada nao entra em Por contactar, Contactado nem
--        Visita; a lista devolve closure_result e uma encerrada nunca esta
--        atrasada (a etapa continua a ser uma das 5, o encerramento e a parte).
--   4. RGPD: execute_entity_erasure e preview_entity_erasure
--      - bloqueiam tambem por negocios e levantamentos (FK RESTRICT);
--      - em apagar e em anonimizar limpam as colunas novas de anew_entities
--        (email, phone, preferred_contact, preferred_time, fiscal_name,
--        billing_email, nif_*, billing_nif_*, referred_by,
--        gdpr_consented_at, notes, extra, assigned_to) e as respostas das
--        submissoes; em apagar apagam as submissoes da entidade;
--      - nos dois modos limpam as visitas da entidade (titulo, notas, local,
--        coordenadas, metadata) antes de a FK SET NULL as soltar; a
--        pre-visualizacao conta-as (schedule_items, nao bloqueiam);
--      - nos dois modos ofuscam as mesmas chaves em old_values/new_values de
--        schedule_item_events das visitas da entidade (o evento 'created'
--        guarda a visita inteira e o trigger nao respeita app.audit_bypass);
--      - ofuscam as chaves de dados pessoais do entity_audit_log da entidade
--        (incluindo as linhas das moradas, dos dados fiscais e das visitas,
--        que o log guarda pelo id proprio). O log continua sem UPDATE para
--        authenticated (politica restritiva intacta): so esta funcao,
--        SECURITY DEFINER do dono, com search_path fixo, o altera, e so
--        essas chaves. Durante o apagamento a auditoria generica fica
--        desligada (app.audit_bypass local) para nao gravar de novo os
--        dados que esta a apagar.
--   5. CONFERIR: falha se faltar alguma peca (ver o bloco no fim).
--
-- O que NAO faz
--   - Nao escreve dados de leads nem clientes na entidade (nao ha nada).
--   - Nao apaga anew_leads, anew_clients, papeis, ligacoes, emails,
--     telefones nem fiscal (etapa de limpeza). Nao poe NOT NULL em
--     anew_entities.organization_id.
--   - Nao converte as funcoes do modulo antigo de Leads/Clientes que a
--     pagina Pessoas nao usa (rpc_create_lead_manual, rpc_convert_lead_to_client,
--     rpc_resolve_form_submission, get_lead_dashboard_stats_scoped, ...),
--     nem fn_neg_escolher_lead (devolve o tipo anew_leads e deixa de ter quem
--     a chame; sai na limpeza).
--   - Nao estreita as politicas de SELECT/INSERT/DELETE de anew_entities nem
--     concede leitura direta das colunas com dado pessoal (o UPDATE fica
--     sem as colunas de ambito e de estado, 1.6.7).
--   - Nao mexe nos privilegios de tabela de schedule_items nem de
--     scheduling_invites (anon tem-nos hoje; a RLS bloqueia-o).
--
-- PRECISA DE CODIGO NOVO (entrar junto com o push)
--   - Tudo o que le ou escreve schedule_items.lead_id/client_id ou
--     scheduling_invites.lead_id passa a usar entity_id: Edge Functions
--     book-slot, get-scheduling-invite, scheduling-invite-optout,
--     _shared/formEmails, auto-schedule, cancel-booking, get-booking,
--     reschedule-booking, update-booking-address, chat-widget-ai,
--     ai-assistant (tools/schedule, tools/reports), e no ecra
--     useScheduling, useCalendarScheduling, useMyDay, agenda/types,
--     AnewLeadContactDialog, VisitReassignDialog, PublicLeadForm e os tipos
--     gerados (src/integrations/supabase/types.ts). Um insert/select com
--     lead_id ou client_id em schedule_items falha a partir do push.
--   - create-lead (Edge Function) deve passar a chamar
--     fn_form_resolver_captacao e os parametros novos de
--     upsert_form_submission, criar so a entidade e nunca recusar.
--   - O ecra do quadro e da lista deixa de contar com lead_id/client_id
--     (vem NULL): usa entity_id e papel.
--   - rpc_update_schedule_item_assignees e rpc_reassign_visit devolvem
--     lead_id/client_id NULL; a pessoa vem em entity_id do resultado de
--     fn_owner_sync_entity_from_visit.
--   - A ficha (neg_ficha_pessoa): pessoa.lead_id/client_id vem NULL e ha
--     pessoa.cliente_desde; 'lead' traz id NULL, entity_id, aberta e
--     encerramento da entidade; leads_abertas vem []; origem traz origem_id
--     e o nome em 'origin'. O ecra deixa de escolher a lead
--     (leadDaAbordagem) e encerra/reabre por entity_id.
--   - Responsavel e lixo de uma pessoa: neg_atribuir_pessoa e
--     neg_apagar_pessoa (o UPDATE direto dessas colunas passa a falhar).
--   - «Converter em cliente» (neg_ganhar_negocio): p_lead_id deixa de contar;
--     conversao vem 'feita' ou 'ja_cliente', lead_id/client_id NULL e
--     outras_leads_abertas 0. O papel cliente le-se de client_since.
--   - Classificar MQL/SQL (neg_classificar_lead) nao grava nada: o ecra tira
--     os botoes e o selo.
--   - neg_criar_lead nao cria lead (devolve ja_existia para uma lead e NG009
--     para um cliente); a «Nova lead» manual cria a entidade
--     (create_lead_entity_for_org) e deixa de chamar rpc_create_lead_manual.
--   - O quadro e a lista leem a abordagem encerrada em closure_result.
--   - request-data-erasure (Edge Function) chama can_see_entity com a chave de
--     servico e p_auth_uid: o ramo novo pela organizacao (1.6.2b) so vale com
--     a sessao do proprio utilizador (o ambito por nivel le auth.uid()). Para
--     uma entidade criada so pelo formulario, a verificacao tem de ser feita
--     com o cliente do utilizador (JWT dele), por exemplo chamando
--     can_see_entity ou preview_entity_erasure com esse cliente; senao o
--     pedido continua a dar 404.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ------------------------------------------------------------
-- 0. Guardas iniciais (projeto de raiz: nada para copiar)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_n       int;
  v_missing text;
BEGIN
  SELECT count(*) INTO v_n FROM public.schedule_items
  WHERE lead_id IS NOT NULL OR client_id IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % visitas com lead_id ou client_id. Esta migration apaga as colunas sem copiar; decidir antes.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.scheduling_invites;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % convites de agendamento existentes. Esta migration apaga scheduling_invites.lead_id sem copiar; decidir antes.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_schedule_items_resolver_entidade', 'fn_form_resolver_captacao',
                      'fn_neg_pessoa_no_ambito', 'neg_atribuir_pessoa', 'neg_apagar_pessoa',
                      'fn_neg_tornar_cliente');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: ja existem % das funcoes novas desta migration; confirmar o estado antes.', v_n;
  END IF;

  -- uma so assinatura de cada funcao que esta migration recria
  SELECT count(*) INTO v_n FROM (
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('neg_resumo_quadro', 'neg_resumo_pessoas', 'upsert_form_submission',
                        'rpc_create_schedule_item', 'rpc_update_schedule_item',
                        'execute_entity_erasure', 'preview_entity_erasure',
                        'fn_neg_pesquisa_pessoas', 'fn_neg_exigir_pessoa',
                        'fn_neg_mudar_abordagem', 'neg_guardar_visita', 'neg_criar_negocio',
                        'neg_guardar_identidade_pessoa', 'neg_substituir_contacto',
                        'neg_ficha_pessoa', 'neg_resultado_visita',
                        'neg_ganhar_negocio', 'fn_neg_converter_pessoa', 'neg_reavaliar_negocio',
                        'neg_classificar_lead', 'neg_criar_lead', 'neg_procurar_duplicados',
                        'fn_neg_filtro_pessoas', 'fn_neg_tem_lead_aberta', 'neg_cancelar_visita',
                        'fn_neg_visita_editavel', 'neg_alterar_visita', 'neg_ligar_registo',
                        'fn_neg_pode_mudar_dono_lead', 'fn_neg_ficha_seccao',
                        'can_see_entity', 'is_entity_in_user_scope',
                        'is_entity_contact_in_owner_scope')
    GROUP BY p.proname
    HAVING count(*) > 1
  ) t;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: % funcoes a recriar tem mais do que uma assinatura no remoto; confirmar qual esta em uso.', v_n;
  END IF;

  -- as funcoes de ambito que 1.6.2b recria e as que elas chamam existem com
  -- a assinatura usada (lido no catalogo da RH)
  SELECT string_agg(x.nome || '(' || x.args || ')', ', ') INTO v_missing
  FROM (VALUES ('can_see_entity', 'p_entity_id uuid, p_auth_uid uuid'),
               ('is_entity_in_user_scope', '_entity_id uuid, _auth_uid uuid'),
               ('is_entity_contact_in_owner_scope',
                '_entity_id uuid, _lead_scope_keys text[], _client_scope_keys text[]'),
               ('get_user_visible_org_ids', '_auth_uid uuid'),
               ('has_anew_permission', '_auth_uid uuid, _permission_code text'),
               ('crm_scope_keys', 'p_permission_code text'),
               ('is_system_admin', '_user_id uuid'),
               ('current_business_user_id', '')) AS x(nome, args)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = x.nome
      AND pg_get_function_identity_arguments(p.oid) = x.args);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'GUARDA: funcoes de ambito em falta ou com outra assinatura: %', v_missing;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 1. Visitas e convites por entidade
-- ------------------------------------------------------------
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.scheduling_invites
  ADD COLUMN IF NOT EXISTS entity_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'schedule_items'
      AND c.conname = 'schedule_items_entity_id_fkey'
  ) THEN
    ALTER TABLE public.schedule_items
      ADD CONSTRAINT schedule_items_entity_id_fkey
      FOREIGN KEY (entity_id, organization_id)
      REFERENCES public.anew_entities (id, organization_id)
      ON DELETE SET NULL (entity_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'scheduling_invites'
      AND c.conname = 'scheduling_invites_entity_id_fkey'
  ) THEN
    ALTER TABLE public.scheduling_invites
      ADD CONSTRAINT scheduling_invites_entity_id_fkey
      FOREIGN KEY (entity_id, organization_id)
      REFERENCES public.anew_entities (id, organization_id)
      ON DELETE SET NULL (entity_id);
  END IF;
END
$$;

COMMENT ON COLUMN public.schedule_items.entity_id IS
  'Pessoa da visita (anew_entities), da mesma organizacao; o negocio e opcional (negocio_id). Substitui lead_id e client_id.';
COMMENT ON COLUMN public.scheduling_invites.entity_id IS
  'Pessoa convidada a agendar (anew_entities), da mesma organizacao. Substitui lead_id.';

CREATE INDEX IF NOT EXISTS idx_schedule_items_entity
  ON public.schedule_items (entity_id, organization_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduling_invites_entity
  ON public.scheduling_invites (entity_id, organization_id)
  WHERE entity_id IS NOT NULL;

-- 1.1 Pessoa de uma visita, a partir da entidade ou de uma lead/cliente
--     antigos, sempre na organizacao indicada. Usada so pelas RPCs da agenda
--     (DEFINER do mesmo dono), por isso sem EXECUTE para ninguem mais.
CREATE FUNCTION public.fn_schedule_items_resolver_entidade(
  p_organization_id uuid,
  p_entity_id uuid,
  p_lead_id uuid,
  p_client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_de_lead    uuid;
  v_de_cliente uuid;
  v_entidade   uuid;
BEGIN
  IF p_lead_id IS NOT NULL THEN
    SELECT l.entity_id INTO v_de_lead
    FROM public.anew_leads l
    WHERE l.id = p_lead_id AND l.organization_id = p_organization_id;
    IF v_de_lead IS NULL THEN
      RAISE EXCEPTION 'A lead indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT c.entity_id INTO v_de_cliente
    FROM public.anew_clients c
    WHERE c.id = p_client_id AND c.organization_id = p_organization_id;
    IF v_de_cliente IS NULL THEN
      RAISE EXCEPTION 'O cliente indicado não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF (SELECT count(DISTINCT x.id)
      FROM unnest(ARRAY[p_entity_id, v_de_lead, v_de_cliente]) AS x(id)
      WHERE x.id IS NOT NULL) > 1 THEN
    RAISE EXCEPTION 'A pessoa, a lead e o cliente indicados não são a mesma pessoa.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_entidade := COALESCE(p_entity_id, v_de_lead, v_de_cliente);

  IF v_entidade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_entities e
    WHERE e.id = v_entidade
      AND e.organization_id = p_organization_id
      AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A pessoa indicada não existe nesta organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_entidade;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_schedule_items_resolver_entidade(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- 1.2 Funcoes que liam a lead/cliente da visita: corpo em vigor na RH, com a
--     ligacao da visita trocada para entity_id (CREATE OR REPLACE mantem dono,
--     seguranca, search_path e EXECUTE).

CREATE OR REPLACE FUNCTION public.fn_levantamentos_validar_ligacoes(p_organization_id uuid, p_entity_id uuid, p_feito_por uuid, p_visita_id uuid, p_negocio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_visita record;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(p_organization_id);

  IF p_feito_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.user_id = p_feito_por
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Quem fez o levantamento tem de ser membro activo da organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_visita_id IS NOT NULL THEN
    SELECT s.organization_id, s.entity_id, s.contact_id, s.deal_id,
           s.time_off_type, s.vacation_id
      INTO v_visita
    FROM public.schedule_items s
    WHERE s.id = p_visita_id;

    IF NOT FOUND OR v_visita.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'A visita indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_visita.entity_id IS NOT NULL THEN
      -- A visita liga à entidade (20261228200000): tem de ser a pessoa do
      -- levantamento, e nunca uma ausência ou umas férias.
      IF v_visita.entity_id IS DISTINCT FROM p_entity_id
         OR v_visita.time_off_type IS NOT NULL
         OR v_visita.vacation_id IS NOT NULL THEN
        RAISE EXCEPTION 'A visita indicada é de outra pessoa.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_visita.contact_id IS NOT NULL
       OR v_visita.deal_id IS NOT NULL
       OR v_visita.time_off_type IS NOT NULL
       OR v_visita.vacation_id IS NOT NULL THEN
      -- D5: sem pessoa só se aceita uma visita "solta" (sem contacto, negócio,
      -- ausência nem férias): nunca uma folga, umas férias ou uma reunião de
      -- outra pessoa.
      RAISE EXCEPTION 'A visita indicada é de outra pessoa ou não é uma visita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_negocio_id IS NOT NULL THEN
    -- Negócio vivo, da mesma organização e pessoa e, com sessão, com
    -- pessoas.edit de quem liga sobre esse negócio (espelha negocios_update:
    -- chave org:*, org:assigned_to ou org:created_by). Uma só mensagem para
    -- "não existe", "é de outra pessoa", "está no lixo" e "sem acesso".
    IF NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.deleted_at IS NULL
        AND (
          v_uid IS NULL
          OR (
            public.has_anew_permission(v_uid, 'pessoas.edit')
            AND EXISTS (
              SELECT 1
              FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
              WHERE k.scope_key = n.organization_id::text || ':*'
                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'O negócio indicado não está disponível para ligar a este levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Serializa as ligações ao mesmo negócio: a segunda espera pelo fim da
    -- primeira e, com um snapshot novo, vê-a. Assim "já tem levantamento"
    -- dá esta mensagem e não o erro 23505 do UNIQUE (que mostraria o uuid).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('levantamentos.negocio_id:' || p_negocio_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.negocio_id = p_negocio_id
    ) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$function$;

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
    -- 20261228200000: a visita liga à entidade (schedule_items.entity_id).

    SELECT count(*) INTO v_total
    FROM (SELECT si.id FROM public.schedule_items si
          WHERE si.entity_id = p_entity_id AND si.organization_id = p_organization_id) ids
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
            WHERE x.entity_id = p_entity_id AND x.organization_id = p_organization_id) ids
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

CREATE OR REPLACE FUNCTION public.fn_neg_visita_editavel(p_visita_id uuid, p_aceitar_cancelada boolean)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis  public.schedule_items;
  v_org  uuid;
  v_tipo text;
BEGIN
  SELECT s.organization_id INTO v_org
  FROM public.schedule_items s
  WHERE s.id = p_visita_id;
  IF v_org IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = v_org) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  SELECT s.* INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.organization_id = v_org
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  SELECT b.board_type INTO v_tipo FROM public.schedule_boards b WHERE b.id = v_vis.board_id;
  IF v_vis.time_off_type IS NOT NULL OR v_vis.vacation_id IS NOT NULL
     OR v_tipo IN ('time_off', 'fleet')
     OR v_vis.entity_id IS NULL THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG017';
  END IF;

  IF NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_aceitar_cancelada AND v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RETURN v_vis;
  END IF;

  IF v_vis.status IN ('completed'::public.schedule_item_status, 'cancelled'::public.schedule_item_status)
     OR v_vis.visit_outcome IS NOT NULL
     OR (v_vis.negocio_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.negocios n
                         WHERE n.id = v_vis.negocio_id AND n.estado = 'aberto' AND n.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'A visita já foi feita, cancelada ou tem resultado, ou o negócio dela está fechado: não se altera.'
      USING ERRCODE = 'NG018';
  END IF;

  RETURN v_vis;
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_alterar_visita(p_visita_id uuid, p_board_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_titulo text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_local text DEFAULT NULL::text, p_recursos uuid[] DEFAULT NULL::uuid[], p_visit_kind text DEFAULT NULL::text, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis        public.schedule_items;
  v_titulo     text := NULLIF(btrim(p_titulo), '');
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_local      text := NULLIF(btrim(p_local), '');
  v_tipo       text;
  v_ativo      boolean;
  v_det        jsonb;
  v_meta       jsonb;
  v_atuais     uuid[];
  v_recursos   uuid[];
  v_r          uuid;
  v_m_quadro   boolean;
  v_m_titulo   boolean;
  v_m_notas    boolean;
  v_m_local    boolean;
  v_m_horas    boolean;
  v_m_meta     boolean;
  v_m_tipo     boolean;
  v_m_recursos boolean;
  v_dono       jsonb;
  v_n          int;
BEGIN
  -- 1. Visita: configuração, existência, permissão, estado.
  v_vis := public.fn_neg_visita_editavel(p_visita_id, false);

  -- 2. Quadro e recursos da organização e activos (NG008); quadro de
  --    ausências ou de frota não serve (NG009).
  SELECT b.board_type, b.is_active INTO v_tipo, v_ativo
  FROM public.schedule_boards b
  WHERE b.id = p_board_id AND b.organization_id = v_vis.organization_id;
  IF NOT FOUND OR v_ativo IS FALSE THEN
    RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
  END IF;
  IF v_tipo IN ('time_off', 'fleet') THEN
    RAISE EXCEPTION 'Valor inválido: este quadro não serve para visitas.' USING ERRCODE = 'NG009';
  END IF;

  v_atuais := (SELECT COALESCE(array_agg(a.resource_id ORDER BY a.resource_id), ARRAY[]::uuid[])
               FROM public.schedule_item_assignees a WHERE a.item_id = v_vis.id);
  IF p_recursos IS NULL THEN
    v_recursos := v_atuais;
  ELSE
    IF cardinality(p_recursos) = 0 OR cardinality(p_recursos) > 20
       OR array_position(p_recursos, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Valor inválido: recursos (1 a 20, sem vazios).' USING ERRCODE = 'NG009';
    END IF;
    v_recursos := (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_recursos) AS u(x));
    IF (SELECT count(*) FROM public.schedule_resources r
        WHERE r.id = ANY (v_recursos) AND r.organization_id = v_vis.organization_id
          AND r.is_active = true) <> cardinality(v_recursos) THEN
      RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
    END IF;
  END IF;

  -- 3. Valores.
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim <= p_inicio OR p_fim - p_inicio > interval '1 day' THEN
    RAISE EXCEPTION 'Valor inválido: horário da visita (fim depois do início, até 1 dia).' USING ERRCODE = 'NG009';
  END IF;
  IF (p_visit_kind IS NOT NULL AND p_visit_kind NOT IN ('levantamento', 'medicao', 'materiais', 'revisita'))
     OR char_length(v_titulo) > 200 OR char_length(v_notas) > 5000 OR char_length(v_local) > 500 THEN
    RAISE EXCEPTION 'Valor inválido: tipo, título, notas ou local da visita.' USING ERRCODE = 'NG009';
  END IF;
  v_det := public.fn_neg_detalhes_visita(p_detalhes);

  -- O que muda. Título NULL mantém o actual; notas, local, tipo e detalhes
  -- NULL limpam. O metadata vai inteiro, com a chave 'pessoas' trocada.
  v_titulo := COALESCE(v_titulo, v_vis.title);
  v_meta := (COALESCE(v_vis.metadata, '{}'::jsonb) - 'pessoas')
            || CASE WHEN v_det IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pessoas', v_det) END;
  v_m_quadro   := p_board_id IS DISTINCT FROM v_vis.board_id;
  v_m_titulo   := v_titulo IS DISTINCT FROM v_vis.title;
  v_m_notas    := v_notas IS DISTINCT FROM v_vis.description;
  v_m_local    := v_local IS DISTINCT FROM v_vis.location;
  v_m_horas    := p_inicio IS DISTINCT FROM v_vis.start_datetime OR p_fim IS DISTINCT FROM v_vis.end_datetime;
  v_m_meta     := v_meta IS DISTINCT FROM COALESCE(v_vis.metadata, '{}'::jsonb);
  v_m_tipo     := p_visit_kind IS DISTINCT FROM v_vis.visit_kind;
  v_m_recursos := p_recursos IS NOT NULL AND v_recursos IS DISTINCT FROM v_atuais;

  IF NOT (v_m_quadro OR v_m_titulo OR v_m_notas OR v_m_local OR v_m_horas OR v_m_meta
          OR v_m_tipo OR v_m_recursos) THEN
    RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', false, 'recursos_mudaram', false,
                              'dono_alterado', false, 'novo_dono', NULL, 'outras_visitas', '[]'::jsonb,
                              'desconfirmada', false);
  END IF;

  -- 3b. Trocar os recursos de uma visita futura pode mudar o dono da lead ou
  --     do cliente (fn_owner_sync_entity_from_visit, DEFINER). Exige poder
  --     editar essa lead (leads.edit, pelo auxiliar DEFINER) e esse cliente
  --     (clients.edit: a leitura FOR NO KEY UPDATE aplica a política de UPDATE).
  IF v_m_recursos AND p_inicio > now() THEN
    -- A lead é resolvida como fn_owner_sync_entity_from_visit a resolve
    -- (lead_id, metadata.lead_id, scheduled_visit_id), também a que o
    -- chamador não vê: auxiliar DEFINER que só devolve boolean. Falha
    -- fechada, mensagem genérica.
    IF NOT public.fn_neg_pode_mudar_dono_lead(v_vis.id) THEN
      RAISE EXCEPTION 'Sem permissão para alterar os recursos desta visita.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 20261228200000: a visita liga à entidade; a verificação do
    -- responsável (lead ou cliente) faz-se em fn_neg_pode_mudar_dono_lead.
  END IF;

  -- 4. Conflitos, por ordem de uuid, com bloqueio consultivo por recurso
  --    (exclui a própria visita).
  IF v_m_horas OR v_m_recursos THEN
    FOREACH v_r IN ARRAY v_recursos LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || v_r::text, 0));
      IF public.check_schedule_conflict(v_r, p_inicio, p_fim, v_vis.id) THEN
        RAISE EXCEPTION 'O recurso já tem outra marcação nesse horário.'
          USING ERRCODE = 'NG010', DETAIL = v_r::text;
      END IF;
    END LOOP;
  END IF;

  -- 5. Escritas: a visita pelo rpc do calendário (horas antes dos recursos,
  --    porque a troca de dono olha para a data já gravada).
  IF v_m_quadro OR v_m_titulo OR v_m_notas OR v_m_local OR v_m_horas OR v_m_meta THEN
    PERFORM public.rpc_update_schedule_item(
      p_id                 => v_vis.id,
      p_board_id           => p_board_id,     p_set_board_id       => v_m_quadro,
      p_title              => v_titulo,       p_set_title          => v_m_titulo,
      p_description        => v_notas,        p_set_description    => v_m_notas,
      p_location           => v_local,        p_set_location       => v_m_local,
      p_start_datetime     => p_inicio,       p_set_start_datetime => v_m_horas,
      p_end_datetime       => p_fim,          p_set_end_datetime   => v_m_horas,
      p_metadata           => v_meta,         p_set_metadata       => v_m_meta);
  END IF;

  IF v_m_recursos THEN
    v_dono := public.rpc_update_schedule_item_assignees(v_vis.id, v_recursos);
  END IF;

  -- Os rpc deixam a auditoria genérica desligada: volta a ligar antes da escrita própria.
  PERFORM set_config('app.audit_bypass', 'off', true);

  IF v_m_tipo THEN
    UPDATE public.schedule_items s SET visit_kind = p_visit_kind WHERE s.id = v_vis.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'visita_id', v_vis.id,
    'mudou', true,
    'recursos_mudaram', v_m_recursos,
    'dono_alterado', v_dono IS NOT NULL,
    'novo_dono', v_dono -> 'new_owner',
    'outras_visitas', COALESCE(v_dono -> 'other_visit_ids', '[]'::jsonb),
    -- Mudar as horas de uma visita confirmada passa-a a 'scheduled' (trigger existente).
    'desconfirmada', v_m_horas AND v_vis.status = 'confirmed'::public.schedule_item_status);
END;
$function$;

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
    -- 20261228200000: a pessoa é a entidade, como no quadro e na lista
    -- (papel por client_since, responsável, origem, campanha, atividade e
    -- abordagem da entidade); já não se leem as tabelas de leads nem de clientes.
    SELECT e.client_since, e.assigned_to, e.origin_id, e.campaign_id,
           e.last_activity_at, e.created_at, e.closure_result
      INTO v_ent
    FROM public.anew_entities e
    WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL;

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
           count(*) FILTER (WHERE s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
      INTO v_vs
    FROM (
      -- 20261228200000: as visitas da entidade (schedule_items.entity_id)
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

    v_etapa := CASE
      WHEN v_ent.client_since IS NOT NULL THEN 'cliente'
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
      -- O contacto EFECTIVO, a regra da Lista (ultimo_resultado). 20261228200000:
      -- sem lead, é a última chamada (entity_interactions 'call').
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

    -- Pessoa
    SELECT jsonb_build_object(
      'id', p_entity_id,
      'nome', e.display_name,
      -- 20261226100000: o nome em partes (anew_entities), para o ecrã não ter de
      -- partir display_name; NULL quando a entidade não as tem.
      'first_name', e.first_name,
      'last_name', e.last_name,
      -- 20261228200000: papel, responsável e «desde» da entidade (como a lista);
      -- lead_id e client_id vêm a NULL.
      'papel', CASE WHEN v_ent.client_since IS NOT NULL THEN 'cliente' ELSE 'lead' END,
      'lead_id', NULL,
      'client_id', NULL,
      'cliente_desde', v_ent.client_since,
      'responsavel_id', v_ent.assigned_to,
      'responsavel_nome', (SELECT u.name FROM public.anew_users u
                           WHERE u.id = v_ent.assigned_to),
      'etapa', v_etapa,
      'desde', v_ent.created_at,
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
      -- 20261228200000: origem e campanha da entidade (do primeiro contacto),
      -- como a lista: origem = nome em lead_sources; formulário = o da
      -- campanha ou, sem campanha, o da primeira submissão da pessoa. A
      -- campanha é opcional. NULL só sem origem, campanha nem formulário.
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
      'empresa', NULL,
      -- MQL/SQL era da lead: NULL (como na lista). As respostas da aba
      -- Qualificação continuam na chave 'qualificacao', acima.
      'qualificacao_tipo', NULL,
      -- «Voltou a contactar»: a regra da lista (atividade da entidade depois
      -- da última chamada registada).
      'ultima_atividade_em', v_ent.last_activity_at,
      'ultimo_contacto_lead_em', NULL,
      'voltou_a_contactar', (v_ent.last_activity_at IS NOT NULL
                             AND (v_ct.ultimo IS NULL OR v_ent.last_activity_at > v_ct.ultimo)),
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
    ) ql ON true
    LEFT JOIN LATERAL (
      -- formulário: o da campanha da entidade, senão o da primeira submissão
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

    -- Abordagem (lead) e encerramento: 20261228200000, da entidade
    -- (anew_entities.closure_result) e da nota 'Abordagem encerrada' mais
    -- recente. Só para entidades lead; 'id' vem a NULL (não há linha de lead).
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

    -- 20261228200000: sem linhas de lead, não há leads abertas a listar (a
    -- abordagem é a da entidade, em 'lead').
    v_abertas := '[]'::jsonb;

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
                      -- Ganho com a conversão em cliente por fazer: 20261228200000, a
                      -- entidade ainda não é cliente (client_since nulo) e a
                      -- configuração converte.
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

CREATE OR REPLACE FUNCTION public.neg_ligar_registo(p_negocio_id uuid, p_tipo text, p_registo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_existe   boolean;
  v_atual    uuid;
  v_n        int;
  v_sem_base boolean;
  v_criado   timestamptz;
  v_activado timestamptz;
BEGIN
  IF p_registo_id IS NULL OR p_tipo IS NULL
     OR p_tipo NOT IN ('contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo ou registo.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF p_tipo = 'contrato' AND v_neg.fecho = 'proposta' THEN
    RAISE EXCEPTION 'Este negócio fecha na proposta (venda directa): não se ligam contratos.'
      USING ERRCODE = 'NG023';
  END IF;

  -- Documentos: só os criados antes da activação de Pessoas na organização.
  SELECT c.created_at INTO v_activado
  FROM public.negocio_workflow_config c WHERE c.organization_id = v_neg.organization_id;

  IF p_tipo = 'contacto' THEN
    SELECT true, i.negocio_id INTO v_existe, v_atual
    FROM public.entity_interactions i
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.entity_interactions i SET negocio_id = v_neg.id
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id AND i.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'visita' THEN
    SELECT true, s.negocio_id INTO v_existe, v_atual
    FROM public.schedule_items s
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND s.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.schedule_items s SET negocio_id = v_neg.id
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL AND s.negocio_id IS NULL
      AND s.entity_id = v_neg.entity_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'levantamento' THEN
    -- O trigger do levantamento valida o resto (um por negócio, permissão).
    SELECT true, lv.negocio_id INTO v_existe, v_atual
    FROM public.levantamentos lv
    WHERE lv.id = p_registo_id AND lv.organization_id = v_neg.organization_id
      AND lv.entity_id = v_neg.entity_id AND lv.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = v_neg.id AND o.id <> p_registo_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
    UPDATE public.levantamentos lv SET negocio_id = v_neg.id
    WHERE lv.id = p_registo_id AND lv.organization_id = v_neg.organization_id
      AND lv.entity_id = v_neg.entity_id AND lv.deleted_at IS NULL AND lv.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'orcamento' THEN
    SELECT true, q.negocio_id, q.created_at INTO v_existe, v_atual, v_criado
    FROM public.quotes q
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF v_existe AND v_criado >= v_activado THEN
      RAISE EXCEPTION 'Só os documentos anteriores à activação se ligam à mão.' USING ERRCODE = 'NG024';
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.quotes q SET negocio_id = v_neg.id
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.deleted_at IS NULL AND q.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);

  ELSIF p_tipo = 'proposta' THEN
    SELECT true, pr.negocio_id, pr.created_at INTO v_existe, v_atual, v_criado
    FROM public.proposals pr
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF v_existe AND v_criado >= v_activado THEN
      RAISE EXCEPTION 'Só os documentos anteriores à activação se ligam à mão.' USING ERRCODE = 'NG024';
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.proposals pr SET negocio_id = v_neg.id
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
      AND pr.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);

  ELSE -- contrato
    SELECT true, cc.negocio_id,
           (cc.status NOT IN ('signed', 'assinado') AND cc.quote_id IS NULL AND cc.proposal_id IS NULL),
           cc.created_at
      INTO v_existe, v_atual, v_sem_base, v_criado
    FROM public.client_contracts cc
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF v_existe AND v_criado >= v_activado THEN
      RAISE EXCEPTION 'Só os documentos anteriores à activação se ligam à mão.' USING ERRCODE = 'NG024';
    END IF;
    -- Contrato por assinar sem orçamento nem proposta: o trigger existente
    -- set_client_contract_total_value_sem_iva poria o valor a NULL.
    IF v_existe AND v_sem_base THEN
      RAISE EXCEPTION 'Este contrato não tem orçamento nem proposta: não se liga antes de ser assinado.'
        USING ERRCODE = 'NG014';
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.client_contracts cc SET negocio_id = v_neg.id
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.deleted_at IS NULL AND cc.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
  END IF;
  RETURN jsonb_build_object('mudou', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_resultado_visita(p_visita_id uuid, p_resultado text, p_feita boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis      record;
  v_entity   uuid;
  v_cliente  boolean;
  v_feita    boolean := COALESCE(p_feita, false);
  v_concluir boolean;
  v_mudou    boolean := false;
  v_motivo   text;
  v_n        int;
BEGIN
  IF p_visita_id IS NULL
     OR (p_resultado IS NULL AND NOT v_feita)
     OR p_resultado NOT IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado da visita.' USING ERRCODE = 'NG009';
  END IF;

  SELECT s.organization_id, s.negocio_id, s.entity_id, s.visit_outcome, s.status,
         s.start_datetime, s.created_by, s.user_id
    INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.time_off_type IS NULL AND s.vacation_id IS NULL;
  -- "Não existe", "não se vê" e "organização sem a página Pessoas": a mesma resposta.
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = v_vis.organization_id) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG004';
  END IF;

  -- pessoas.edit com âmbito sobre a visita (org:*, criador ou utilizador).
  IF NOT (public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Uma visita cancelada não se dá como feita nem recebe resultado (com e sem resultado).
  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RAISE EXCEPTION 'A visita foi cancelada: não recebe resultado.' USING ERRCODE = 'NG018';
  END IF;

  IF v_feita AND v_vis.start_datetime > now() THEN
    RAISE EXCEPTION 'Valor inválido: uma visita no futuro não pode ser dada como feita.' USING ERRCODE = 'NG009';
  END IF;

  -- status só entra no UPDATE quando muda (o trigger dos feriados corre em UPDATE OF status).
  v_concluir := v_feita AND v_vis.status <> 'completed'::public.schedule_item_status;

  IF p_resultado IS NULL THEN
    -- Só "feita": não toca no resultado nem na abordagem.
    IF v_concluir THEN
      UPDATE public.schedule_items s
      SET status = 'completed'::public.schedule_item_status
      WHERE s.id = p_visita_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_mudou := true;
    END IF;
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  IF v_concluir THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado, status = 'completed'::public.schedule_item_status
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_vis.visit_outcome IS DISTINCT FROM p_resultado THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := -1;
  END IF;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_mudou := v_n = 1;

  IF p_resultado NOT IN ('semInteresse', 'obraInviavel') THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  -- 20261228200000: a pessoa é a entidade viva da visita, na mesma
  -- organização; a abordagem é a dela (anew_entities.closure_result). Só uma
  -- entidade lead (client_since nulo) se encerra: um cliente dá 'sem_lead'.
  SELECT e.id, e.client_since IS NOT NULL INTO v_entity, v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_vis.entity_id AND e.organization_id = v_vis.organization_id
    AND e.deleted_at IS NULL;

  IF v_vis.negocio_id IS NOT NULL THEN
    v_motivo := 'visita_de_negocio';
  ELSIF v_entity IS NULL THEN
    v_motivo := 'sem_pessoa';
  ELSIF public.fn_neg_tem_negocio_aberto(v_vis.organization_id, v_entity) THEN
    v_motivo := 'negocios_abertos';
  ELSIF v_cliente THEN
    v_motivo := 'sem_lead';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', v_motivo);
  END IF;

  v_mudou := (public.fn_neg_mudar_abordagem(
    v_vis.organization_id, v_entity, NULL, p_resultado, NULL, 'Resultado da visita')
    ->> 'mudou')::boolean OR v_mudou;

  RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', true,
                            'motivo_nao_encerrada', NULL);
END;
$function$;

-- fn_neg_pode_mudar_dono_lead: o responsavel que a troca de recursos mexe e o
-- da entidade da visita. Mesmo teste de pessoas.edit sobre a visita; depois,
-- leads.edit (entidade lead) ou clients.edit (entidade cliente) com ambito
-- sobre o responsavel ou o criador da entidade. Sem pessoa viva: true.
CREATE OR REPLACE FUNCTION public.fn_neg_pode_mudar_dono_lead(p_visita_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_ent     uuid;
  v_criou   uuid;
  v_user    uuid;
  v_cliente boolean;
  v_dono    uuid;
  v_ecriou  uuid;
  v_perm    text;
BEGIN
  SELECT s.organization_id, s.entity_id, s.created_by, s.user_id
    INTO v_org, v_ent, v_criou, v_user
  FROM public.schedule_items s
  WHERE s.id = p_visita_id;
  IF v_uid IS NULL OR v_org IS NULL
     OR NOT (v_org IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = v_org) THEN
    RETURN false;
  END IF;

  -- Sem pessoas.edit com âmbito sobre a visita (o mesmo teste de
  -- fn_neg_visita_editavel), false sem olhar para a pessoa: não é oráculo.
  IF NOT (public.has_anew_permission(v_uid, 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_org::text || ':*'
                         OR k.scope_key = v_org::text || ':' || v_criou::text
                         OR k.scope_key = v_org::text || ':' || v_user::text)) THEN
    RETURN false;
  END IF;

  IF v_ent IS NULL THEN
    RETURN true;
  END IF;

  SELECT e.client_since IS NOT NULL, e.assigned_to, e.created_by
    INTO v_cliente, v_dono, v_ecriou
  FROM public.anew_entities e
  WHERE e.id = v_ent AND e.organization_id = v_org AND e.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  v_perm := CASE WHEN v_cliente THEN 'clients.edit' ELSE 'leads.edit' END;
  IF NOT public.has_anew_permission(v_uid, v_perm) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(public.crm_scope_keys(v_perm)) AS k(scope_key)
    WHERE k.scope_key = v_org::text || ':*'
       OR k.scope_key = v_org::text || ':' || v_dono::text
       OR k.scope_key = v_org::text || ':' || v_ecriou::text);
END;
$function$;

-- fn_owner_sync_entity_from_visit: trocar os recursos de uma visita futura
-- passa o responsavel da ENTIDADE da visita para o utilizador do recurso
-- (como fazia com a lead e o cliente), e as outras visitas futuras da pessoa
-- seguem o novo responsavel (fn_owner_sync_apply('entity', ...)). Resposta
-- com as mesmas chaves e mais entity_id; lead_id e client_id vem a NULL.
CREATE OR REPLACE FUNCTION public.fn_owner_sync_entity_from_visit(p_item_id uuid, p_old_resource_ids uuid[], p_new_resource_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item        public.schedule_items;
  v_old         uuid[] := COALESCE(p_old_resource_ids, ARRAY[]::uuid[]);
  v_new         uuid[] := COALESCE(p_new_resource_ids, ARRAY[]::uuid[]);
  v_ent         uuid;
  v_cur_owner   uuid;
  v_all_users   uuid[];
  v_added_users uuid[];
  v_new_owner   uuid;
  v_outras      uuid[];
BEGIN
  SELECT * INTO v_item FROM public.schedule_items WHERE id = p_item_id;
  IF NOT FOUND
     OR v_item.start_datetime <= now()
     OR v_item.status IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
     OR v_item.time_off_type IS NOT NULL
     OR v_item.entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Conjunto de recursos inalterado: nada a fazer (o ecra grava sempre os recursos).
  IF (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(v_old) x)
     = (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(v_new) x) THEN
    RETURN NULL;
  END IF;
  IF array_length(v_new, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Utilizadores dos recursos novos, pela ordem do array.
  SELECT COALESCE(array_agg(r.user_id ORDER BY u.ord), ARRAY[]::uuid[]) INTO v_all_users
  FROM unnest(v_new) WITH ORDINALITY u(id, ord)
  JOIN public.schedule_resources r ON r.id = u.id
  WHERE r.user_id IS NOT NULL AND r.organization_id = v_item.organization_id;

  SELECT COALESCE(array_agg(r.user_id ORDER BY u.ord), ARRAY[]::uuid[]) INTO v_added_users
  FROM unnest(v_new) WITH ORDINALITY u(id, ord)
  JOIN public.schedule_resources r ON r.id = u.id
  WHERE r.user_id IS NOT NULL AND r.organization_id = v_item.organization_id
    AND NOT (u.id = ANY (v_old));

  IF array_length(v_all_users, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  v_ent := v_item.entity_id;
  SELECT e.assigned_to INTO v_cur_owner
  FROM public.anew_entities e
  WHERE e.id = v_ent AND e.organization_id = v_item.organization_id AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND
     OR (v_cur_owner IS NOT NULL AND v_cur_owner = ANY (v_all_users)) THEN
    RETURN NULL;
  END IF;

  v_new_owner := COALESCE(v_added_users[1], v_all_users[1]);
  UPDATE public.anew_entities SET assigned_to = v_new_owner WHERE id = v_ent;

  -- As outras visitas futuras da pessoa passam para o recurso do novo
  -- responsavel (a propria visita fica como o ecra a gravou).
  v_outras := public.fn_owner_sync_apply('entity', v_ent, v_item.organization_id,
                                         v_cur_owner, v_new_owner, p_item_id);

  RETURN jsonb_build_object(
    'entity_id', v_ent,
    'lead_id', NULL,
    'client_id', NULL,
    'old_owner', v_cur_owner,
    'new_owner', v_new_owner,
    'other_visit_ids', to_jsonb(COALESCE(v_outras, ARRAY[]::uuid[]))
  );
END;
$function$;

-- fn_owner_sync_future_visits: as visitas futuras da pessoa. p_kind 'entity'
-- recebe a entidade; 'lead' e 'client' (os triggers antigos de anew_leads e
-- anew_clients) recebem o id da lead/cliente e chegam a entidade por ele.
CREATE OR REPLACE FUNCTION public.fn_owner_sync_future_visits(p_kind text, p_entity_id uuid, p_org uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT si.id
  FROM public.schedule_items si
  WHERE si.organization_id = p_org
    AND si.start_datetime > now()
    AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
    AND si.time_off_type IS NULL
    AND si.entity_id = (
      CASE p_kind
        WHEN 'entity' THEN p_entity_id
        WHEN 'lead' THEN (SELECT l.entity_id FROM public.anew_leads l
                          WHERE l.id = p_entity_id AND l.organization_id = p_org)
        WHEN 'client' THEN (SELECT c.entity_id FROM public.anew_clients c
                            WHERE c.id = p_entity_id AND c.organization_id = p_org)
      END);
$function$;

-- 1.3 RPCs da agenda: + p_entity_id (no fim, com valor por omissao). A
--     assinatura antiga sai primeiro para nunca haver duas.
DROP FUNCTION public.rpc_create_schedule_item(uuid, uuid, text, text, public.schedule_item_status,
  public.schedule_item_origin, timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text,
  numeric, numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.rpc_create_schedule_item(p_organization_id uuid, p_board_id uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_status schedule_item_status DEFAULT NULL::schedule_item_status, p_origin schedule_item_origin DEFAULT NULL::schedule_item_origin, p_start_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_all_day boolean DEFAULT NULL::boolean, p_client_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_deal_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text, p_location_lat numeric DEFAULT NULL::numeric, p_location_lng numeric DEFAULT NULL::numeric, p_color text DEFAULT NULL::text, p_priority integer DEFAULT NULL::integer, p_tags text[] DEFAULT NULL::text[], p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_time_off_type text DEFAULT NULL::text, p_approval_status text DEFAULT NULL::text, p_assignee_resource_ids uuid[] DEFAULT NULL::uuid[], p_lead_id uuid DEFAULT NULL::uuid, p_entity_id uuid DEFAULT NULL::uuid)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor          uuid;
  v_item           public.schedule_items;
  v_effective_ids  uuid[];
  v_creator_res    uuid;
  v_creator_name   text;
  v_new_res_id     uuid;
  v_resource_diff  jsonb := NULL;
  v_assignee_diff  jsonb := NULL;
  v_audit_org      uuid;
  v_diff           jsonb;
  v_entity         uuid;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ──────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items INSERT RLS ───────────────────
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Pessoa da visita (20261228200000): schedule_items.entity_id. p_lead_id
  --    e p_client_id continuam aceites e resolvem-se para a entidade.
  v_entity := public.fn_schedule_items_resolver_entidade(
    p_organization_id, p_entity_id, p_lead_id, p_client_id);

  -- ── INSERT schedule_items (identical column set / defaults to createItem,
  --    com entity_id) ──
  INSERT INTO public.schedule_items
    (board_id, title, description, status, origin,
     start_datetime, end_datetime, all_day,
     entity_id, contact_id, deal_id, employee_id, user_id,
     location, location_lat, location_lng, color, priority,
     tags, notes, metadata, time_off_type, approval_status,
     created_by, organization_id)
  VALUES
    (p_board_id,
     COALESCE(p_title, 'Novo Agendamento'),
     p_description,
     COALESCE(p_status, 'draft'::public.schedule_item_status),
     COALESCE(p_origin, 'manual'::public.schedule_item_origin),
     p_start_datetime,
     p_end_datetime,
     COALESCE(p_all_day, false),
     v_entity,
     p_contact_id,
     p_deal_id,
     p_employee_id,
     p_user_id,
     p_location,
     p_location_lat,
     p_location_lng,
     p_color,
     COALESCE(p_priority, 0),
     p_tags,
     p_notes,
     COALESCE(p_metadata, '{}'::jsonb),
     p_time_off_type,
     p_approval_status,
     v_actor,
     p_organization_id)
  RETURNING * INTO v_item;

  -- ── Resolve effective assignees (mirrors the FE fallback exactly) ─────────
  v_effective_ids := COALESCE(p_assignee_resource_ids, ARRAY[]::uuid[]);

  IF array_length(v_effective_ids, 1) IS NULL THEN
    -- No assignees provided → fall back to the creator's resource.
    SELECT id INTO v_creator_res
    FROM public.schedule_resources
    WHERE user_id = v_actor
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_creator_res IS NULL THEN
      -- Create a schedule_resources row for the creator (same shape as the FE).
      SELECT name INTO v_creator_name
      FROM public.anew_users
      WHERE id = v_actor
      LIMIT 1;

      -- Authorization parity with schedule_resources INSERT RLS. The FE relies on
      -- RLS to allow this insert; replicate the same predicate here.
      IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.resources.create') THEN
        RAISE EXCEPTION 'Sem permissão para criar recursos de agenda' USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.schedule_resources
        (name, resource_type, user_id, color, is_active, metadata,
         created_by, organization_id)
      VALUES
        (COALESCE(v_creator_name, 'Utilizador'),
         'user',
         v_actor,
         '#10b981',
         true,
         '{}'::jsonb,
         v_actor,
         p_organization_id)
      RETURNING id INTO v_new_res_id;

      v_creator_res := v_new_res_id;

      -- Record the created resource in the combined diff (it is a real side effect).
      v_resource_diff := jsonb_build_object(
        'id',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_res_id)),
        'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(v_creator_name, 'Utilizador'))),
        'resource_type',   jsonb_build_object('old', NULL, 'new', to_jsonb('user'::text)),
        'user_id',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_actor)),
        'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(p_organization_id))
      );
    END IF;

    IF v_creator_res IS NOT NULL THEN
      v_effective_ids := ARRAY[v_creator_res];
    END IF;
  END IF;

  -- ── INSERT assignees (deduped), mirroring the FE ──────────────────────────
  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    -- Authorization parity with schedule_item_assignees INSERT RLS
    -- (create OR edit permission; item belongs to a visible org — it does, we
    -- just inserted it into p_organization_id which was validated above).
    IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
            OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
      RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT v_item.id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;

    v_assignee_diff := jsonb_build_object(
      'resource_id', jsonb_build_object(
        'old', NULL,
        'new', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_effective_ids) ORDER BY 1))
      )
    );
  END IF;

  -- ── Build combined diff: schedule_items snapshot + side effects ───────────
  v_diff := jsonb_build_object(
    'schedule_items', jsonb_build_object(
      'board_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.board_id)),
      'title',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.title)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.status)),
      'origin',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.origin)),
      'start_datetime',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.start_datetime)),
      'end_datetime',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.end_datetime)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.organization_id))
    )
  );

  IF v_resource_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_resources', v_resource_diff);
  END IF;
  IF v_assignee_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_item_assignees', v_assignee_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'schedule_items', v_item.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_item;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_schedule_item(uuid, uuid, text, text, public.schedule_item_status,
  public.schedule_item_origin, timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text,
  numeric, numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_schedule_item(uuid, uuid, text, text, public.schedule_item_status,
  public.schedule_item_origin, timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text,
  numeric, numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid, uuid)
  TO authenticated, service_role;

DROP FUNCTION public.rpc_update_schedule_item(uuid, uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean, public.schedule_item_status, boolean,
  public.schedule_item_origin, boolean, uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean, uuid, boolean,
  timestamptz, boolean, uuid, boolean);

CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item(p_id uuid, p_board_id uuid DEFAULT NULL::uuid, p_set_board_id boolean DEFAULT false, p_title text DEFAULT NULL::text, p_set_title boolean DEFAULT false, p_description text DEFAULT NULL::text, p_set_description boolean DEFAULT false, p_location text DEFAULT NULL::text, p_set_location boolean DEFAULT false, p_start_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_start_datetime boolean DEFAULT false, p_end_datetime timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_end_datetime boolean DEFAULT false, p_status schedule_item_status DEFAULT NULL::schedule_item_status, p_set_status boolean DEFAULT false, p_origin schedule_item_origin DEFAULT NULL::schedule_item_origin, p_set_origin boolean DEFAULT false, p_contact_id uuid DEFAULT NULL::uuid, p_set_contact_id boolean DEFAULT false, p_client_id uuid DEFAULT NULL::uuid, p_set_client_id boolean DEFAULT false, p_employee_id uuid DEFAULT NULL::uuid, p_set_employee_id boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid, p_set_user_id boolean DEFAULT false, p_notes text DEFAULT NULL::text, p_set_notes boolean DEFAULT false, p_metadata jsonb DEFAULT NULL::jsonb, p_set_metadata boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_set_organization_id boolean DEFAULT false, p_time_off_type text DEFAULT NULL::text, p_set_time_off_type boolean DEFAULT false, p_approval_status text DEFAULT NULL::text, p_set_approval_status boolean DEFAULT false, p_approved_by uuid DEFAULT NULL::uuid, p_set_approved_by boolean DEFAULT false, p_approved_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_approved_at boolean DEFAULT false, p_lead_id uuid DEFAULT NULL::uuid, p_set_lead_id boolean DEFAULT false, p_entity_id uuid DEFAULT NULL::uuid, p_set_entity_id boolean DEFAULT false)
 RETURNS schedule_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.schedule_items;
  v_item       public.schedule_items;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_item_diff  jsonb := '{}'::jsonb;
  v_key        text;
  v_noise_cols text[] := ARRAY['updated_at', 'created_at', 'duration_minutes'];
  v_audit_org  uuid;
  v_diff       jsonb;
  v_set_parts  text[]  := ARRAY[]::text[];
  v_sql        text;
  v_entity     uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image + guards) ──────────────────────────
  SELECT * INTO v_before FROM public.schedule_items WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items UPDATE RLS ───────────────────
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ambito (a5): so pode agir sobre itens dentro do seu ambito.
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(v_before.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE ctx.applied_scope = 'ORG'
       OR v_before.created_by = ANY (ctx.owner_ids)
       OR v_before.user_id = ANY (ctx.owner_ids)
       OR public.schedule_item_assigned_to_owners(v_before.id, ctx.owner_ids)
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_set_organization_id THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Build the SET clause from ONLY the supplied whitelisted columns ───────
  IF p_set_board_id        THEN v_set_parts := v_set_parts || format('board_id = %L::uuid', p_board_id); END IF;
  IF p_set_title           THEN v_set_parts := v_set_parts || format('title = %L::text', p_title); END IF;
  IF p_set_description     THEN v_set_parts := v_set_parts || format('description = %L::text', p_description); END IF;
  IF p_set_location        THEN v_set_parts := v_set_parts || format('location = %L::text', p_location); END IF;
  IF p_set_start_datetime  THEN v_set_parts := v_set_parts || format('start_datetime = %L::timestamptz', p_start_datetime); END IF;
  IF p_set_end_datetime    THEN v_set_parts := v_set_parts || format('end_datetime = %L::timestamptz', p_end_datetime); END IF;
  IF p_set_status          THEN v_set_parts := v_set_parts || format('status = %L::public.schedule_item_status', p_status); END IF;
  IF p_set_origin          THEN v_set_parts := v_set_parts || format('origin = %L::public.schedule_item_origin', p_origin); END IF;
  IF p_set_contact_id      THEN v_set_parts := v_set_parts || format('contact_id = %L::uuid', p_contact_id); END IF;
  IF p_set_employee_id     THEN v_set_parts := v_set_parts || format('employee_id = %L::uuid', p_employee_id); END IF;
  IF p_set_user_id         THEN v_set_parts := v_set_parts || format('user_id = %L::uuid', p_user_id); END IF;
  IF p_set_notes           THEN v_set_parts := v_set_parts || format('notes = %L::text', p_notes); END IF;
  IF p_set_metadata        THEN v_set_parts := v_set_parts || format('metadata = %L::jsonb', p_metadata); END IF;
  IF p_set_organization_id THEN v_set_parts := v_set_parts || format('organization_id = %L::uuid', p_organization_id); END IF;
  IF p_set_time_off_type   THEN v_set_parts := v_set_parts || format('time_off_type = %L::text', p_time_off_type); END IF;
  IF p_set_approval_status THEN v_set_parts := v_set_parts || format('approval_status = %L::text', p_approval_status); END IF;
  IF p_set_approved_by     THEN v_set_parts := v_set_parts || format('approved_by = %L::uuid', p_approved_by); END IF;
  IF p_set_approved_at     THEN v_set_parts := v_set_parts || format('approved_at = %L::timestamptz', p_approved_at); END IF;
  -- 20261228200000: a pessoa da visita é schedule_items.entity_id. p_lead_id e
  -- p_client_id continuam aceites e resolvem-se para a entidade, na
  -- organização final do item.
  IF p_set_entity_id OR p_set_lead_id OR p_set_client_id THEN
    v_entity := public.fn_schedule_items_resolver_entidade(
      CASE WHEN p_set_organization_id THEN p_organization_id ELSE v_before.organization_id END,
      CASE WHEN p_set_entity_id THEN p_entity_id END,
      CASE WHEN p_set_lead_id THEN p_lead_id END,
      CASE WHEN p_set_client_id THEN p_client_id END);
    v_set_parts := v_set_parts || format('entity_id = %L::uuid', v_entity);
  ELSIF p_set_organization_id AND v_before.entity_id IS NOT NULL THEN
    -- mudar de organização sem mudar a pessoa: a pessoa tem de ser da nova
    PERFORM public.fn_schedule_items_resolver_entidade(p_organization_id, v_before.entity_id, NULL, NULL);
  END IF;

  IF array_length(v_set_parts, 1) IS NULL THEN
    RETURN v_before;
  END IF;

  v_sql := format(
    'UPDATE public.schedule_items SET %s WHERE id = %L::uuid RETURNING *',
    array_to_string(v_set_parts, ', '),
    p_id
  );
  EXECUTE v_sql INTO v_item;

  -- ── Build the diff (same noise-column exclusions as the schedule trigger) ─
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_item);

  FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
  LOOP
    CONTINUE WHEN v_key = ANY(v_noise_cols);
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_item_diff := v_item_diff || jsonb_build_object(
        v_key,
        jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  v_diff := '{}'::jsonb;
  IF v_item_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('schedule_items', v_item_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'schedule_items', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_item;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_update_schedule_item(uuid, uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean, public.schedule_item_status, boolean,
  public.schedule_item_origin, boolean, uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean, uuid, boolean,
  timestamptz, boolean, uuid, boolean, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_schedule_item(uuid, uuid, boolean, text, boolean, text, boolean, text, boolean,
  timestamptz, boolean, timestamptz, boolean, public.schedule_item_status, boolean,
  public.schedule_item_origin, boolean, uuid, boolean, uuid, boolean, uuid, boolean, uuid, boolean,
  text, boolean, jsonb, boolean, uuid, boolean, text, boolean, text, boolean, uuid, boolean,
  timestamptz, boolean, uuid, boolean, uuid, boolean)
  TO authenticated, service_role;

-- 1.4 O trigger que sincronizava lead_id <-> contact_id sai com a coluna.
DROP TRIGGER IF EXISTS trg_schedule_items_sync_lead_contact ON public.schedule_items;
DROP FUNCTION IF EXISTS public.fn_schedule_items_sync_lead_contact();

-- 1.5 GUARDA: alem dos 3 indices e das 2 FKs que se apagam a seguir, nada
--     pode depender das colunas (vistas, politicas, triggers, regras...).
DO $$
DECLARE
  v_lista text;
BEGIN
  SELECT string_agg(DISTINCT d.classid::regclass::text || ' ' || d.objid::text
                    || ' -> ' || a.attrelid::regclass::text || '.' || a.attname::text, '; ')
    INTO v_lista
  FROM pg_depend d
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE d.refclassid = 'pg_class'::regclass
    AND a.attrelid IN ('public.schedule_items'::regclass, 'public.scheduling_invites'::regclass)
    AND a.attname IN ('lead_id', 'client_id')
    AND NOT (d.classid = 'pg_class'::regclass AND d.objid IN (
               SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public'
                 AND c.relname IN ('idx_schedule_items_lead', 'idx_schedule_items_client',
                                   'idx_scheduling_invites_lead')))
    AND NOT (d.classid = 'pg_constraint'::regclass AND d.objid IN (
               SELECT co.oid FROM pg_constraint co
               WHERE co.conname IN ('schedule_items_lead_id_fkey', 'scheduling_invites_lead_id_fkey')
                 AND co.conrelid IN ('public.schedule_items'::regclass, 'public.scheduling_invites'::regclass)));
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'GUARDA: ainda ha objetos que dependem das colunas a apagar: %', v_lista;
  END IF;
END
$$;

DROP INDEX IF EXISTS public.idx_schedule_items_lead;
DROP INDEX IF EXISTS public.idx_schedule_items_client;
DROP INDEX IF EXISTS public.idx_scheduling_invites_lead;
ALTER TABLE public.schedule_items DROP CONSTRAINT IF EXISTS schedule_items_lead_id_fkey;
ALTER TABLE public.scheduling_invites DROP CONSTRAINT IF EXISTS scheduling_invites_lead_id_fkey;

ALTER TABLE public.schedule_items DROP COLUMN lead_id;
ALTER TABLE public.schedule_items DROP COLUMN client_id;
ALTER TABLE public.scheduling_invites DROP COLUMN lead_id;

-- ------------------------------------------------------------
-- 1.6 A PESSOA E A ENTIDADE (o formulario so cria a entidade)
-- ------------------------------------------------------------
-- Uma entidade viva da organizacao (organization_id, deleted_at nulo) passa a
-- ser uma pessoa da pagina, com ou sem linha em anew_leads/anew_clients e com
-- ou sem anew_entity_org_links. O ambito e o da lista: leads.<acao> para
-- entidades lead (client_since nulo) e clients.<acao> para clientes, chaves
-- org:*, org:responsavel e org:criador.

-- 1.6.1 Abordagem da entidade: o encerramento que antes vivia em
--       anew_leads.closure_result. NULL = aberta. So fn_neg_mudar_abordagem
--       o escreve (sem UPDATE direto, ver 1.6.6).
ALTER TABLE public.anew_entities
  ADD COLUMN IF NOT EXISTS closure_result text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.anew_entities'::regclass
      AND c.conname = 'anew_entities_closure_result_check'
  ) THEN
    ALTER TABLE public.anew_entities
      ADD CONSTRAINT anew_entities_closure_result_check
      CHECK (closure_result IS NULL OR closure_result IN ('semInteresse', 'obraInviavel'));
  END IF;
END
$$;

COMMENT ON COLUMN public.anew_entities.closure_result IS
  'Abordagem encerrada desta pessoa (semInteresse ou obraInviavel); NULL = aberta. Escreve-se so por fn_neg_mudar_abordagem.';

-- 1.6.2 A pessoa no ambito de quem chama. DEFINER (le responsavel e criador
--       sem depender da RLS), so devolve boolean. 'view', 'edit' e 'convert'
--       exigem a entidade viva; 'delete' aceita-a apagada (para restaurar).
--       'convert' (passar a cliente) e sempre leads.convert. Sem sessao
--       (service_role): so a organizacao (e a entidade viva).
CREATE FUNCTION public.fn_neg_pessoa_no_ambito(
  p_organization_id uuid,
  p_entity_id uuid,
  p_acao text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_org     text := p_organization_id::text;
  v_cliente boolean;
  v_dono    uuid;
  v_criou   uuid;
  v_apagada boolean;
  v_perm    text;
BEGIN
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR p_acao IS NULL OR p_acao NOT IN ('view', 'edit', 'delete', 'convert') THEN
    RETURN false;
  END IF;

  SELECT e.client_since IS NOT NULL, e.assigned_to, e.created_by, e.deleted_at IS NOT NULL
    INTO v_cliente, v_dono, v_criou, v_apagada
  FROM public.anew_entities e
  WHERE e.id = p_entity_id
    AND e.organization_id = p_organization_id;
  IF NOT FOUND OR (v_apagada AND p_acao <> 'delete') THEN
    RETURN false;
  END IF;

  IF v_uid IS NULL THEN
    RETURN true;
  END IF;

  v_perm := CASE WHEN p_acao = 'convert' THEN 'leads.convert'
                 WHEN v_cliente THEN 'clients.' || p_acao
                 ELSE 'leads.' || p_acao END;
  IF NOT public.has_anew_permission(v_uid, v_perm) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(public.crm_scope_keys(v_perm)) AS k(scope_key)
    WHERE k.scope_key = v_org || ':*'
       OR k.scope_key = v_org || ':' || v_dono::text
       OR k.scope_key = v_org || ':' || v_criou::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_pessoa_no_ambito(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_pessoa_no_ambito(uuid, uuid, text) TO authenticated, service_role;

-- 1.6.2b As funcoes de ambito das politicas reconhecem a entidade pela sua
--        propria organizacao. Uma entidade criada so pelo formulario (sem
--        lead, cliente, contacto, ligacao antiga, criador, orcamento, deal nem
--        contrato) ficava sem contacto, morada e NIF na ficha, com UPDATE e
--        DELETE diretos a afetar 0 linhas e com o RGPD a recusar. Corpo = versao
--        em vigor na RH (pg_get_functiondef), com UM ramo novo no fim, antes do
--        RETURN false: entidade VIVA (deleted_at nulo, como 'view' em
--        fn_neg_pessoa_no_ambito), organization_id dentro de
--        get_user_visible_org_ids e ambito leads.*/clients.* por client_since
--        (org:*, org:responsavel, org:criador). Mesma assinatura, DEFINER,
--        search_path 'public' e EXECUTE (CREATE OR REPLACE preserva-os).
--        - is_entity_contact_in_owner_scope: usa as chaves que a politica passa
--          (leads.view/edit/delete e clients.view/edit/delete), escolhidas por
--          client_since. Sem sessao continua a devolver false.
--        - is_entity_in_user_scope e can_see_entity: so quando o utilizador
--          pedido e o da sessao (auth.uid()), por fn_neg_pessoa_no_ambito(...,
--          'view'). anon e service_role sem sessao nao entram por este ramo.
CREATE OR REPLACE FUNCTION public.is_entity_contact_in_owner_scope(_entity_id uuid, _lead_scope_keys text[], _client_scope_keys text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_visible  uuid[];
BEGIN
  IF _entity_id IS NULL OR v_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Ramo LEAD, agora com ambito de dono (org:*, org:assigned_to, org:created_by).
  IF _lead_scope_keys IS NOT NULL AND array_length(_lead_scope_keys, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = _entity_id
        AND (
             (l.organization_id::text || ':*') = ANY (_lead_scope_keys)
          OR (l.organization_id::text || ':' || l.assigned_to::text) = ANY (_lead_scope_keys)
          OR (l.organization_id::text || ':' || l.created_by::text) = ANY (_lead_scope_keys)
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Ramo CLIENTE, tambem com ambito de dono.
  IF _client_scope_keys IS NOT NULL AND array_length(_client_scope_keys, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.anew_clients cl
      WHERE cl.entity_id = _entity_id
        AND (
             (cl.organization_id::text || ':*') = ANY (_client_scope_keys)
          OR (cl.organization_id::text || ':' || cl.assigned_to::text) = ANY (_client_scope_keys)
          OR (cl.organization_id::text || ':' || cl.created_by::text) = ANY (_client_scope_keys)
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- Ramo ORGANIZACAO: cabecalhos de organizacao. Inalterado face a
  -- is_entity_in_user_scope (get_user_visible_org_ids) -- nao e a fuga, e
  -- visibilidade de organizacao, igual para toda a gente da organizacao.
  SELECT ARRAY(SELECT public.get_user_visible_org_ids(v_auth_uid))
  INTO v_visible;

  IF EXISTS (
    SELECT 1
    FROM public.anew_organizations o
    WHERE o.entity_id = _entity_id
      AND o.id = ANY (COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  -- Ramo CRIADOR: entidades que o proprio criou. Mantido palavra por palavra
  -- de is_entity_in_user_scope (inclui o e.created_by = v_auth_uid que quase
  -- nunca acerta e o join a anew_users que e o que cobre o caso real).
  IF EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = _entity_id
      AND (
        e.created_by = v_auth_uid
        OR EXISTS (
          SELECT 1 FROM public.anew_users au
          WHERE au.auth_user_id = v_auth_uid
            AND e.created_by = au.id
        )
      )
  ) THEN
    RETURN true;
  END IF;

  -- Ramo ENTIDADE (20261228200000): a entidade viva pela sua organizacao, com
  -- as chaves de lead (client_since nulo) ou de cliente que a politica passou.
  IF EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = _entity_id
      AND e.deleted_at IS NULL
      AND e.organization_id = ANY (COALESCE(v_visible, ARRAY[]::uuid[]))
      AND (CASE WHEN e.client_since IS NULL THEN _lead_scope_keys ELSE _client_scope_keys END)
          && ARRAY[e.organization_id::text || ':*',
                   e.organization_id::text || ':' || e.assigned_to::text,
                   e.organization_id::text || ':' || e.created_by::text]
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_entity_in_user_scope(_entity_id uuid, _auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visible uuid[];
BEGIN
  IF _entity_id IS NULL OR _auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Uma unica travessia de organizacoes por chamada (antes: quatro).
  SELECT ARRAY(SELECT public.get_user_visible_org_ids(_auth_uid))
  INTO v_visible;

  IF EXISTS (
    SELECT 1 FROM public.anew_contacts c
    WHERE c.entity_id = _entity_id
      AND c.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_leads l
    WHERE l.entity_id = _entity_id
      AND l.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_clients cl
    WHERE cl.entity_id = _entity_id
      AND cl.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_organizations o
    WHERE o.entity_id = _entity_id
      AND o.id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  -- Ramo do criador, mantido palavra por palavra (ver nota acima sobre
  -- `e.created_by = _auth_uid`).
  IF EXISTS (
    SELECT 1 FROM public.anew_entities e
    WHERE e.id = _entity_id
      AND (
        e.created_by = _auth_uid
        OR EXISTS (
          SELECT 1 FROM public.anew_users au
          WHERE au.auth_user_id = _auth_uid
            AND e.created_by = au.id
        )
      )
  ) THEN
    RETURN true;
  END IF;

  -- Ramo ENTIDADE (20261228200000): so para o utilizador da sessao (o ambito
  -- por nivel vem de crm_scope_keys, que le auth.uid()); anon e chamadas sem
  -- sessao nao entram. Entidade viva da organizacao no ambito 'view'.
  IF _auth_uid = auth.uid() AND EXISTS (
    SELECT 1 FROM public.anew_entities e
    WHERE e.id = _entity_id
      AND e.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      AND public.fn_neg_pessoa_no_ambito(e.organization_id, e.id, 'view')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_see_entity(p_entity_id uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visible uuid[];
  v_business_uid uuid;
BEGIN
  IF p_entity_id IS NULL OR p_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- SECURITY FIX (20261112090000): System Admin always sees every entity,
  -- cross-tenant, matching the full-access role the rest of the app already
  -- grants it (e.g. 20261112060000_grant_all_permissions_system_admin_role).
  IF public.is_system_admin(p_auth_uid) THEN
    RETURN true;
  END IF;

  -- Condition A-prime: creator check via auth_user_id without needing v_business_uid.
  -- Runs before the COALESCE fallback chain so it never depends on
  -- current_business_user_id() or auth_to_business_user_map being populated.
  IF EXISTS (
    SELECT 1
    FROM public.anew_entities e
    JOIN public.anew_users au ON au.id = e.created_by
    WHERE e.id = p_entity_id
      AND au.auth_user_id = p_auth_uid
  ) THEN
    RETURN true;
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_visible_org_ids(p_auth_uid)
  )
  INTO v_visible;

  SELECT COALESCE(
           public.current_business_user_id(),
           (
             SELECT m.business_user_id
             FROM public.auth_to_business_user_map m
             WHERE m.auth_user_id = p_auth_uid
             LIMIT 1
           ),
           (
             SELECT au.id
             FROM public.anew_users au
             WHERE au.auth_user_id = p_auth_uid
             LIMIT 1
           )
         )
  INTO v_business_uid;

  -- Condition A: original creator check via v_business_uid (kept for completeness).
  IF v_business_uid IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = p_entity_id
      AND e.created_by = v_business_uid
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_entity_org_links l
    WHERE l.entity_id = p_entity_id
      AND l.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  -- SECURITY FIX (20261112090000): staff users have no organization_id/
  -- assigned_to of their own (unlike leads/contacts/clients/quotes/deals/
  -- client_contracts below) - anew_memberships is their only link to an
  -- organization. Without this, any staff user's entity is invisible to
  -- everyone but its literal creator, blocking edits to teammates an
  -- Org Admin or System Admin plainly has access to in the Users UI.
  IF EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    WHERE au.entity_id = p_entity_id
      AND am.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_leads x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_contacts x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.anew_clients x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotes x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.deals x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.client_contracts x
    WHERE x.entity_id = p_entity_id
      AND (
        x.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
        OR x.root_organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      )
  ) THEN
    RETURN true;
  END IF;

  -- Ramo ENTIDADE (20261228200000): so para o utilizador da sessao (o ambito
  -- por nivel vem de crm_scope_keys, que le auth.uid()). Chamadas com a chave
  -- de servico e outro p_auth_uid (request-data-erasure) nao entram aqui.
  IF p_auth_uid = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = p_entity_id
      AND e.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
      AND public.fn_neg_pessoa_no_ambito(e.organization_id, e.id, 'view')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- 1.6.3 A guarda de todas as acoes da ficha: entidade viva da organizacao no
--       ambito de leitura. Deixa de exigir anew_entity_org_links e uma lead ou
--       um cliente vivos (mesma assinatura, INVOKER, EXECUTE).
CREATE OR REPLACE FUNCTION public.fn_neg_exigir_pessoa(p_organization_id uuid, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE(public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'view'), false) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
END;
$function$;

-- 1.6.4 Encerrar/reabrir a abordagem pela entidade. Passa a DEFINER (a coluna
--       closure_result nao tem UPDATE direto) com as verificacoes explicitas:
--       pessoas.edit na organizacao, pessoa no ambito de leitura e de edicao
--       (leads.edit/clients.edit). p_lead_id fica na assinatura e deixa de ser
--       usado. So as leads (client_since nulo) se encerram.
CREATE OR REPLACE FUNCTION public.fn_neg_mudar_abordagem(p_organization_id uuid, p_entity_id uuid, p_lead_id uuid, p_resultado text, p_nota_resultado text, p_nota_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cliente boolean;
  v_atual   text;
BEGIN
  IF p_resultado IS NOT NULL AND p_resultado NOT IN ('semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado do encerramento.' USING ERRCODE = 'NG009';
  END IF;
  IF char_length(p_nota_resultado) > 300 OR char_length(p_nota_texto) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo até 300 e texto até 1000 caracteres.' USING ERRCODE = 'NG009';
  END IF;

  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar a abordagem desta pessoa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar a abordagem desta pessoa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_resultado IS NOT NULL
     AND public.fn_neg_tem_negocio_aberto(p_organization_id, p_entity_id) THEN
    RAISE EXCEPTION 'A pessoa tem negócios abertos.' USING ERRCODE = 'NG011';
  END IF;

  SELECT e.client_since IS NOT NULL, e.closure_result
    INTO v_cliente, v_atual
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  IF v_atual IS NOT DISTINCT FROM p_resultado THEN
    RETURN jsonb_build_object('mudou', false, 'lead_id', NULL, 'entity_id', p_entity_id);
  END IF;
  IF v_cliente AND p_resultado IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: só as leads se encerram.' USING ERRCODE = 'NG009';
  END IF;

  UPDATE public.anew_entities e
  SET closure_result = p_resultado,
      updated_at     = now()
  WHERE e.id = p_entity_id;

  INSERT INTO public.entity_interactions
    (entity_id, organization_id, root_organization_id, interaction_type, subject,
     result, notes, interaction_at, created_by)
  VALUES
    (p_entity_id, p_organization_id, public.resolve_root_organization_id(p_organization_id),
     'note',
     CASE WHEN p_resultado IS NULL THEN 'Abordagem reaberta' ELSE 'Abordagem encerrada' END,
     p_nota_resultado, p_nota_texto, now(), public.fn_neg_actor()::text);

  RETURN jsonb_build_object('mudou', true, 'lead_id', NULL, 'entity_id', p_entity_id);
END;
$function$;

-- 1.6.5 Acoes da ficha que procuravam a lead/cliente (corpo em vigor na RH,
--       pg_get_functiondef, so com a pessoa trocada para a entidade; mesma
--       assinatura, seguranca, search_path e EXECUTE):
--       neg_guardar_visita (a visita liga a entidade por p_entity_id),
--       neg_guardar_identidade_pessoa e neg_substituir_contacto (ambito de
--       leitura e de edicao pela entidade; a guarda de entidade partilhada
--       com outra organizacao fica igual), neg_criar_negocio (a abordagem
--       encerrada e a da entidade).

CREATE OR REPLACE FUNCTION public.neg_guardar_visita(p_organization_id uuid, p_entity_id uuid, p_board_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_titulo text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_local text DEFAULT NULL::text, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_recursos uuid[] DEFAULT NULL::uuid[], p_visit_kind text DEFAULT NULL::text, p_negocio_id uuid DEFAULT NULL::uuid, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_titulo     text := NULLIF(btrim(p_titulo), '');
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_local      text := NULLIF(btrim(p_local), '');
  v_det        jsonb;
  v_keys_pes   text[];
  v_neg_id     uuid;
  v_tipo_quadro text;
  v_recursos   uuid[];
  v_conflito   uuid[];
  v_r          uuid;
  v_item       public.schedule_items;
BEGIN
  -- 1. Sessão e actor
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Parâmetros
  IF p_board_id IS NULL OR p_inicio IS NULL OR p_fim IS NULL
     OR p_fim <= p_inicio OR p_fim - p_inicio > interval '1 day' THEN
    RAISE EXCEPTION 'Valor inválido: quadro ou horário da visita (fim depois do início, até 1 dia).'
      USING ERRCODE = 'NG009';
  END IF;
  IF (p_visit_kind IS NOT NULL AND p_visit_kind NOT IN ('levantamento', 'medicao', 'materiais', 'revisita'))
     OR char_length(v_titulo) > 200 OR char_length(v_notas) > 5000 OR char_length(v_local) > 500
     OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
     OR COALESCE(cardinality(p_recursos), 0) > 20 THEN
    RAISE EXCEPTION 'Valor inválido: tipo, título, notas, local, coordenadas ou recursos da visita.'
      USING ERRCODE = 'NG009';
  END IF;
  v_det := public.fn_neg_detalhes_visita(p_detalhes);

  -- 2. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':'))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- 3 e 4. Pessoa: entidade viva desta organização, no âmbito de leitura
  --    (leads.view para leads, clients.view para clientes). 20261228200000:
  --    a visita liga à entidade (schedule_items.entity_id), sem lead nem cliente.
  IF NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'view') THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Quadro e recursos DESTA organização, antes de bloquear o negócio ou
  --    de ler ocupação. Quadro: existe nesta organização e não é de ausências.
  --    "Não existe" e "é de outra organização" dão a mesma mensagem.
  SELECT b.board_type INTO v_tipo_quadro
  FROM public.schedule_boards b
  WHERE b.id = p_board_id AND b.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
  END IF;
  IF v_tipo_quadro = 'time_off' THEN
    RAISE EXCEPTION 'Valor inválido: o quadro de ausências não serve para visitas.' USING ERRCODE = 'NG009';
  END IF;

  --    Recursos: sem recursos, o rpc usa o recurso activo do criador nesta
  --    organização; verifica-se esse (se ainda não existir, o rpc cria-o e não
  --    há conflito).
  v_recursos := (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_recursos) AS u(x) WHERE x IS NOT NULL);
  IF v_recursos IS NULL THEN
    v_conflito := ARRAY(
      SELECT r.id FROM public.schedule_resources r
      WHERE r.user_id = v_actor AND r.organization_id = p_organization_id AND r.is_active = true
      ORDER BY r.created_at ASC
      LIMIT 1);
  ELSE
    -- Cada recurso pedido existe, está activo e é desta organização (antes
    -- de qualquer bloqueio ou leitura de ocupação: sem oráculo de recursos
    -- alheios).
    IF (SELECT count(*) FROM public.schedule_resources r
        WHERE r.id = ANY (v_recursos) AND r.organization_id = p_organization_id
          AND r.is_active = true) <> cardinality(v_recursos) THEN
      RAISE EXCEPTION 'Quadro ou recurso indisponível.' USING ERRCODE = 'NG008';
    END IF;
    v_conflito := v_recursos;
  END IF;

  -- 6. Negócio: aberto, da mesma organização e pessoa, com pessoas.edit e
  --    âmbito (cópia do teste de negocios_update). Só se bloqueia a linha
  --    que passa em tudo.
  IF p_negocio_id IS NOT NULL THEN
    IF public.has_anew_permission(v_uid, 'pessoas.edit') THEN
      SELECT n.id INTO v_neg_id
      FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.estado = 'aberto'
        AND n.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                    WHERE k.scope_key = n.organization_id::text || ':*'
                       OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                       OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)
      FOR NO KEY UPDATE;
    END IF;
    IF v_neg_id IS NULL THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
  END IF;

  -- 7. Conflitos, por ordem de uuid, com bloqueio consultivo por recurso.
  FOREACH v_r IN ARRAY COALESCE(v_conflito, ARRAY[]::uuid[]) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || v_r::text, 0));
    IF public.check_schedule_conflict(v_r, p_inicio, p_fim, NULL::uuid) THEN
      RAISE EXCEPTION 'O recurso já tem outra marcação nesse horário.'
        USING ERRCODE = 'NG010', DETAIL = v_r::text;
    END IF;
  END LOOP;

  -- 8. Criar pela função do calendário (verificações dela com o auth.uid() real).
  SELECT si.* INTO v_item
  FROM public.rpc_create_schedule_item(
    p_organization_id      => p_organization_id,
    p_board_id             => p_board_id,
    p_title                => COALESCE(v_titulo, 'Visita'),
    p_description          => v_notas,
    p_status               => 'scheduled'::public.schedule_item_status,
    p_origin               => 'manual'::public.schedule_item_origin,
    p_start_datetime       => p_inicio,
    p_end_datetime         => p_fim,
    p_all_day              => false,
    p_location             => v_local,
    p_location_lat         => p_lat,
    p_location_lng         => p_lng,
    p_metadata             => CASE WHEN v_det IS NULL THEN NULL
                                   ELSE jsonb_build_object('pessoas', v_det) END,
    p_assignee_resource_ids => v_recursos,
    p_entity_id            => p_entity_id) AS si;

  -- 9. O resto do INSERT, auditado (o rpc deixou a auditoria genérica desligada).
  PERFORM set_config('app.audit_bypass', 'off', true);
  IF p_visit_kind IS NOT NULL OR v_neg_id IS NOT NULL THEN
    UPDATE public.schedule_items s
    SET visit_kind = p_visit_kind, negocio_id = v_neg_id
    WHERE s.id = v_item.id;
  END IF;

  RETURN jsonb_build_object('visita_id', v_item.id, 'mudou', true, 'ligado_a', v_neg_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_guardar_identidade_pessoa(p_organization_id uuid, p_entity_id uuid, p_tipo text DEFAULT NULL::text, p_nome_empresa text DEFAULT NULL::text, p_nome_proprio text DEFAULT NULL::text, p_apelido text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_nome       text := NULLIF(btrim(p_nome_empresa), '');
  v_keys_pes   text[];
  v_ent        public.anew_entities;
  v_tipo       text;
  v_mudou      boolean := false;
  -- como .trim().replace(/\s+/g, " ") do ecrã: primeiro junta todo o espaço
  -- (tabulações, quebras de linha e o espaço inseparável U+00A0, que o \s do
  -- Postgres também apanha), depois apara.
  v_f          text := NULLIF(btrim(regexp_replace(p_nome_proprio, '\s+', ' ', 'g')), '');
  v_l          text := NULLIF(btrim(regexp_replace(p_apelido, '\s+', ' ', 'g')), '');
  v_disp       text;
  v_first      text;
  v_last       text;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('person', 'organization'))
     OR char_length(v_nome) > 200
     OR v_nome ~ '[[:cntrl:]]'
     OR char_length(v_f) > 100 OR char_length(v_l) > 100
     OR v_f ~ '[[:cntrl:]]' OR v_l ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa, tipo, nome da empresa (até 200 caracteres) ou nome e apelido (até 100).'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Pessoa: entidade viva desta organização, no âmbito de leitura (leads.view
  --    para leads, clients.view para clientes), e que não é a ficha de uma
  --    organização do sistema. 20261228200000: pela entidade, sem lead nem cliente.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organização e âmbito de edição sobre a entidade
  --    (leads.edit para leads, clients.edit para clientes).
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. Não muda o tipo nem o nome de uma entidade que aparece noutra organização
  --     (ligação, lead viva, cliente vivo, papel vivo, ou linha viva de uma tabela
  --     com chave estrangeira para anew_entities; ver PARTILHADA).
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
             WHERE lk.entity_id = p_entity_id AND lk.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.anew_leads l
                WHERE l.entity_id = p_entity_id AND l.organization_id <> p_organization_id
                  AND l.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_clients c
                WHERE c.entity_id = p_entity_id AND c.organization_id <> p_organization_id
                  AND c.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_roles er
                WHERE er.entity_id = p_entity_id AND er.organization_id <> p_organization_id
                  AND er.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_contacts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_contracts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_portal_users t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.contact_tags t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.data_erasure_requests t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.deals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.direct_sales t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.entity_interactions t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.form_submissions t
                WHERE (t.entity_id = p_entity_id OR t.conflicting_entity_id = p_entity_id)
                  AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.levantamentos t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.negocios t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.organization_counted_entities t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.proposals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.quotes t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     -- a ficha de um utilizador do sistema não é uma pessoa da página
     OR EXISTS (SELECT 1 FROM public.anew_users u
                WHERE u.entity_id = p_entity_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 6. Bloqueio: uma alteração de cada vez por pessoa.
  SELECT e.* INTO v_ent FROM public.anew_entities e WHERE e.id = p_entity_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 7. Tipo e nome (só escreve se alguma coisa muda).
  v_tipo := COALESCE(p_tipo, v_ent.type);
  IF v_tipo = 'organization' THEN
    -- Empresa: o nome visível é o da empresa; nome próprio e apelido a NULL.
    IF v_f IS NOT NULL OR v_l IS NOT NULL
       OR (v_ent.type IS DISTINCT FROM 'organization' AND v_nome IS NULL) THEN
      RAISE EXCEPTION 'Valor inválido: uma empresa tem só o nome da empresa (obrigatório ao mudar para empresa).'
        USING ERRCODE = 'NG009';
    END IF;
    v_disp  := COALESCE(v_nome, v_ent.display_name);
    v_first := NULL;
    v_last  := NULL;
  ELSE
    -- Pessoa: nome próprio e apelido (os dois, ou nenhum se já era pessoa).
    IF v_nome IS NOT NULL
       OR ((v_f IS NULL) <> (v_l IS NULL))
       OR (v_ent.type IS DISTINCT FROM 'person' AND (v_f IS NULL OR v_l IS NULL)) THEN
      RAISE EXCEPTION 'Valor inválido: uma pessoa tem nome próprio e apelido (obrigatórios ao mudar para pessoa).'
        USING ERRCODE = 'NG009';
    END IF;
    IF v_f IS NULL THEN
      v_disp  := v_ent.display_name;
      v_first := v_ent.first_name;
      v_last  := v_ent.last_name;
    ELSE
      -- normalizeFirstLast (src/utils/composeDisplayName.ts:19-30)
      IF lower(v_f) = lower(v_l) AND position(' ' IN v_f) > 0 THEN
        v_first := split_part(v_f, ' ', 1);
        v_last  := substr(v_f, position(' ' IN v_f) + 1);
      ELSE
        v_first := v_f;
        v_last  := v_l;
      END IF;
      -- composeDisplayName (src/utils/composeDisplayName.ts:8-17)
      v_disp := CASE
        WHEN v_first IS NULL THEN COALESCE(v_last, '')
        WHEN v_last IS NULL THEN v_first
        WHEN lower(v_first) = lower(v_last) THEN v_first
        WHEN starts_with(lower(v_last), lower(v_first) || ' ') THEN v_last
        WHEN right(lower(v_first), char_length(v_last) + 1) = ' ' || lower(v_last) THEN v_first
        ELSE v_first || ' ' || v_last
      END;
    END IF;
  END IF;
  IF v_tipo IS DISTINCT FROM v_ent.type
     OR v_disp IS DISTINCT FROM v_ent.display_name
     OR v_first IS DISTINCT FROM v_ent.first_name
     OR v_last IS DISTINCT FROM v_ent.last_name THEN
    UPDATE public.anew_entities e
    SET type         = v_tipo,
        display_name = v_disp,
        first_name   = v_first,
        last_name    = v_last,
        updated_at   = now()
    WHERE e.id = p_entity_id;
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object(
    'tipo', v_tipo,
    'nome', v_disp,
    'empresa_nome', CASE WHEN v_tipo = 'organization' THEN v_disp END,
    'mudou', v_mudou);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_substituir_contacto(p_organization_id uuid, p_entity_id uuid, p_email text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_email       text := lower(NULLIF(btrim(p_email), ''));
  v_tel         text := NULLIF(btrim(p_telefone), '');
  v_dig         text;
  v_keys_pes    text[];
  v_email_antes text;
  v_tel_antes   text;
  v_tel_cc      text;
  v_email_ja    boolean := false;
  v_tel_ja      boolean := false;
  v_email_mudou boolean := false;
  v_tel_mudou   boolean := false;
  v_manter      uuid;
  v_n_prim      int;
  v_n_iguais    int;
  v_n           int;
BEGIN
  -- 1. Valores
  v_dig := regexp_replace(COALESCE(v_tel, ''), '\D', '', 'g');
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (v_email IS NULL AND v_tel IS NULL)
     OR (v_email IS NOT NULL AND (char_length(v_email) > 254
                                  OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     OR (v_tel IS NOT NULL AND (char_length(v_tel) > 30
                                OR v_tel !~ '^\+?[0-9 ().-]+$'
                                OR char_length(v_dig) NOT BETWEEN 7 AND 15)) THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa, email ou telefone (7 a 15 dígitos).'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Pessoa: entidade viva desta organização, no âmbito de leitura (leads.view
  --    para leads, clients.view para clientes), e que não é a ficha de uma
  --    organização do sistema. 20261228200000: pela entidade, sem lead nem cliente.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organização e âmbito de edição sobre a entidade
  --    (leads.edit para leads, clients.edit para clientes).
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. Não escreve em contactos de uma entidade que aparece noutra organização
  --     (ligação, lead viva, cliente vivo, papel vivo, ou linha viva de uma tabela
  --     com chave estrangeira para anew_entities; ver PARTILHADA).
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
             WHERE lk.entity_id = p_entity_id AND lk.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.anew_leads l
                WHERE l.entity_id = p_entity_id AND l.organization_id <> p_organization_id
                  AND l.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_clients c
                WHERE c.entity_id = p_entity_id AND c.organization_id <> p_organization_id
                  AND c.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_roles er
                WHERE er.entity_id = p_entity_id AND er.organization_id <> p_organization_id
                  AND er.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_contacts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_contracts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_portal_users t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.contact_tags t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.data_erasure_requests t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.deals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.direct_sales t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.entity_interactions t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.form_submissions t
                WHERE (t.entity_id = p_entity_id OR t.conflicting_entity_id = p_entity_id)
                  AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.levantamentos t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.negocios t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.organization_counted_entities t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.proposals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.quotes t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     -- a ficha de um utilizador do sistema não é uma pessoa da página
     OR EXISTS (SELECT 1 FROM public.anew_users u
                WHERE u.entity_id = p_entity_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 6. Bloqueios: a pessoa, depois cada valor (sempre email antes de telefone).
  PERFORM 1 FROM public.anew_entities e WHERE e.id = p_entity_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('neg_contacto_email:' || p_organization_id::text || ':' || v_email, 0));
  END IF;
  IF v_tel IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('neg_contacto_tel:' || p_organization_id::text || ':' || right(v_dig, 7), 0));
  END IF;

  -- 7. Valor de outra pessoa da organização: recusa sem dizer de quem. Um valor
  --    que a pessoa já tem não se verifica (era dela; um duplicado antigo de
  --    outra pessoa não a impede de o manter).
  IF v_email IS NOT NULL THEN
    v_email_ja := EXISTS (SELECT 1 FROM public.anew_entity_emails em
                          WHERE em.entity_id = p_entity_id AND lower(btrim(em.email)) = v_email);
  END IF;
  IF v_tel IS NOT NULL THEN
    v_tel_ja := EXISTS (SELECT 1 FROM public.anew_entity_phones ph
                        WHERE ph.entity_id = p_entity_id
                          AND regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig);
  END IF;
  IF v_email IS NOT NULL AND NOT v_email_ja AND EXISTS (
       SELECT 1 FROM public.anew_entity_emails em
       WHERE em.entity_id <> p_entity_id
         -- 20261228200000: outra pessoa desta organização pela entidade (ou pela ligação antiga)
         AND (EXISTS (SELECT 1 FROM public.anew_entities oe
                      WHERE oe.id = em.entity_id AND oe.organization_id = p_organization_id
                        AND oe.deleted_at IS NULL)
              OR EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
                         WHERE lk.entity_id = em.entity_id AND lk.organization_id = p_organization_id))
         AND lower(btrim(em.email)) = v_email) THEN
    RAISE EXCEPTION 'Contacto indisponível: pertence a outra pessoa.' USING ERRCODE = 'NG019';
  END IF;
  IF v_tel IS NOT NULL AND NOT v_tel_ja AND EXISTS (
       SELECT 1 FROM public.anew_entity_phones ph
       WHERE ph.entity_id <> p_entity_id
         AND (EXISTS (SELECT 1 FROM public.anew_entities oe
                      WHERE oe.id = ph.entity_id AND oe.organization_id = p_organization_id
                        AND oe.deleted_at IS NULL)
              OR EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
                         WHERE lk.entity_id = ph.entity_id AND lk.organization_id = p_organization_id))
         AND char_length(regexp_replace(ph.phone_number, '\D', '', 'g')) >= 7
         AND (regexp_replace(ph.phone_number, '\D', '', 'g') LIKE '%' || v_dig
              OR v_dig LIKE '%' || regexp_replace(ph.phone_number, '\D', '', 'g'))) THEN
    RAISE EXCEPTION 'Contacto indisponível: pertence a outra pessoa.' USING ERRCODE = 'NG019';
  END IF;

  -- 8. Email: uma só linha principal, nenhuma repetida.
  SELECT em.email INTO v_email_antes
  FROM public.anew_entity_emails em
  WHERE em.entity_id = p_entity_id AND em.is_primary IS TRUE
  ORDER BY em.created_at DESC, em.id DESC
  LIMIT 1;
  IF v_email IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE em.is_primary IS TRUE),
           count(*) FILTER (WHERE lower(btrim(em.email)) = v_email)
      INTO v_n_prim, v_n_iguais
    FROM public.anew_entity_emails em
    WHERE em.entity_id = p_entity_id;
    SELECT em.id INTO v_manter
    FROM public.anew_entity_emails em
    WHERE em.entity_id = p_entity_id AND lower(btrim(em.email)) = v_email
    ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC
    LIMIT 1;

    IF NOT (v_n_prim = 1 AND v_n_iguais = 1 AND EXISTS (
              SELECT 1 FROM public.anew_entity_emails em
              WHERE em.id = v_manter AND em.is_primary IS TRUE)) THEN
      BEGIN
        DELETE FROM public.anew_entity_emails em
        WHERE em.entity_id = p_entity_id
          AND em.id IS DISTINCT FROM v_manter
          AND (em.is_primary IS TRUE OR lower(btrim(em.email)) = v_email);
        IF v_manter IS NOT NULL THEN
          -- sem reescrever o texto: o trigger de unicidade só dispara se o email mudar
          UPDATE public.anew_entity_emails em
          SET is_primary = true
          WHERE em.id = v_manter AND em.is_primary IS NOT TRUE;
        ELSE
          INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, created_by)
          VALUES (p_entity_id, v_email, 'personal', true, v_actor);
        END IF;
      EXCEPTION WHEN unique_violation THEN
        -- o trigger de unicidade (também nas outras organizações da pessoa)
        RAISE EXCEPTION 'Contacto indisponível: pertence a outra pessoa.' USING ERRCODE = 'NG019';
      END;
      v_email_mudou := true;
    END IF;
  END IF;

  -- 9. Telefone: uma só linha principal, nenhuma repetida (pelos dígitos).
  v_manter := NULL;
  SELECT ph.phone_number, ph.country_code INTO v_tel_antes, v_tel_cc
  FROM public.anew_entity_phones ph
  WHERE ph.entity_id = p_entity_id AND ph.is_primary IS TRUE
  ORDER BY ph.created_at DESC, ph.id DESC
  LIMIT 1;
  IF v_tel IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE ph.is_primary IS TRUE),
           count(*) FILTER (WHERE regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig)
      INTO v_n_prim, v_n_iguais
    FROM public.anew_entity_phones ph
    WHERE ph.entity_id = p_entity_id;
    SELECT ph.id INTO v_manter
    FROM public.anew_entity_phones ph
    WHERE ph.entity_id = p_entity_id
      AND regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig
    ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC
    LIMIT 1;

    IF NOT (v_n_prim = 1 AND v_n_iguais = 1 AND EXISTS (
              SELECT 1 FROM public.anew_entity_phones ph
              WHERE ph.id = v_manter AND ph.is_primary IS TRUE)) THEN
      DELETE FROM public.anew_entity_phones ph
      WHERE ph.entity_id = p_entity_id
        AND ph.id IS DISTINCT FROM v_manter
        AND (ph.is_primary IS TRUE
             OR regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig);
      IF v_manter IS NOT NULL THEN
        UPDATE public.anew_entity_phones ph
        SET is_primary = true
        WHERE ph.id = v_manter AND ph.is_primary IS NOT TRUE;
      ELSE
        INSERT INTO public.anew_entity_phones
          (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
        VALUES (p_entity_id, v_tel, v_tel_cc, 'mobile', true, v_actor);
      END IF;
      v_tel_mudou := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'email_antes', v_email_antes,
    'email_depois', (SELECT em.email FROM public.anew_entity_emails em
                     WHERE em.entity_id = p_entity_id AND em.is_primary IS TRUE
                     ORDER BY em.created_at DESC, em.id DESC LIMIT 1),
    'telefone_antes', v_tel_antes,
    'telefone_depois', (SELECT ph.phone_number FROM public.anew_entity_phones ph
                        WHERE ph.entity_id = p_entity_id AND ph.is_primary IS TRUE
                        ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1),
    'email_mudou', v_email_mudou,
    'telefone_mudou', v_tel_mudou,
    'mudou', v_email_mudou OR v_tel_mudou);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_criar_negocio(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_titulo text, p_notas text DEFAULT NULL::text, p_assigned_to uuid DEFAULT NULL::uuid, p_registos jsonb DEFAULT '[]'::jsonb, p_levantamento_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_reabrir_abordagem boolean DEFAULT false, p_fecho text DEFAULT 'contrato'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_titulo     text := btrim(p_titulo);
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_registos   jsonb := COALESCE(p_registos, '[]'::jsonb);
  v_encerrada  text;
  v_existente  public.negocios;
  v_reg        record;
  v_ligados    jsonb := '[]'::jsonb;
  v_recusados  jsonb := '[]'::jsonb;
  v_n          int;
BEGIN
  IF p_id IS NULL OR v_titulo IS NULL OR v_titulo = '' OR char_length(v_titulo) > 200
     OR char_length(v_notas) > 5000 THEN
    RAISE EXCEPTION 'Valor inválido: identificador, título (1 a 200) ou notas (até 5000).' USING ERRCODE = 'NG009';
  END IF;
  IF p_fecho IS NULL OR p_fecho NOT IN ('proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo de fecho (proposta ou contrato).' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(v_registos) <> 'array' THEN
    RAISE EXCEPTION 'Valor inválido: registos.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_registos) > 100 OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_registos) AS e(valor)
       WHERE jsonb_typeof(e.valor) <> 'object'
          OR (e.valor ->> 'tipo') IS NULL
          OR (e.valor ->> 'tipo') NOT IN ('contacto', 'visita', 'orcamento', 'proposta', 'contrato')
          OR (e.valor ->> 'id') IS NULL
          OR (e.valor ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Valor inválido: registos (até 100; tipo contacto, visita, orcamento, proposta ou contrato; id uuid).'
      USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- Reenvio do mesmo id: devolve-o como está, antes de qualquer outra regra.
  SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
  IF FOUND THEN
    IF v_existente.organization_id <> p_organization_id OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- 20261228200000: a abordagem é da entidade (anew_entities.closure_result);
  -- p_lead_id deixa de ser usado (fica na assinatura).
  SELECT e.closure_result INTO v_encerrada
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL;
  IF v_encerrada IS NOT NULL AND NOT COALESCE(p_reabrir_abordagem, false) THEN
    RAISE EXCEPTION 'A abordagem desta pessoa está encerrada.' USING ERRCODE = 'NG002';
  END IF;

  -- Criar (RLS negocios_insert: pessoas.create na organização, pessoa ligada,
  -- comercial membro activo). Corrida com outro reenvio: devolve-o como está.
  INSERT INTO public.negocios (id, organization_id, entity_id, titulo, notas, assigned_to, fecho)
  VALUES (p_id, p_organization_id, p_entity_id, v_titulo, v_notas, p_assigned_to, p_fecho)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
    IF NOT FOUND OR v_existente.organization_id <> p_organization_id
       OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- Ligações (exigem pessoas.edit: NG001 aborta tudo; NG004, NG014, NG023 e
  -- NG024 vão para recusados).
  FOR v_reg IN
    SELECT e.valor ->> 'tipo' AS tipo, (e.valor ->> 'id')::uuid AS id
    FROM jsonb_array_elements(v_registos) AS e(valor)
    UNION ALL
    SELECT 'levantamento', p_levantamento_id WHERE p_levantamento_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.neg_ligar_registo(p_id, v_reg.tipo, v_reg.id);
      v_ligados := v_ligados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    EXCEPTION WHEN SQLSTATE 'NG004' OR SQLSTATE 'NG014' OR SQLSTATE 'NG023' OR SQLSTATE 'NG024' THEN
      v_recusados := v_recusados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    END;
  END LOOP;

  IF v_encerrada IS NOT NULL THEN
    PERFORM public.fn_neg_mudar_abordagem(
      p_organization_id, p_entity_id, NULL, NULL, NULL, 'Reaberta ao criar um negócio');
  END IF;

  RETURN jsonb_build_object('negocio_id', p_id, 'mudou', true, 'ligados', v_ligados,
                            'recusados', v_recusados,
                            'lead_escolhida', NULL);
END;
$function$;

-- 1.6.6 Negocios e levantamentos de uma entidade sem ligacao antiga: as
--       politicas de INSERT deixam de exigir anew_entity_org_links e pedem a
--       entidade viva da mesma organizacao (o resto igual ao em vigor).
DROP POLICY IF EXISTS negocios_insert ON public.negocios;
CREATE POLICY negocios_insert
  ON public.negocios
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.create'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1
                FROM unnest((SELECT public.crm_scope_keys('pessoas.create'))) AS k(scope_key)
                WHERE starts_with(k.scope_key, negocios.organization_id::text || ':'))
    AND (created_by IS NULL
         OR created_by = (SELECT COALESCE((SELECT au.id FROM public.anew_users au
                                           WHERE au.auth_user_id = (SELECT auth.uid())
                                           LIMIT 1),
                                          public.current_business_user_id())))
    AND EXISTS (SELECT 1 FROM public.anew_entities e
                WHERE e.id = negocios.entity_id
                  AND e.organization_id = negocios.organization_id
                  AND e.deleted_at IS NULL)
    AND (assigned_to IS NULL
         OR EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = negocios.assigned_to
                      AND m.organization_id = negocios.organization_id
                      AND m.status = 'active'))
  );

DROP POLICY IF EXISTS levantamentos_insert ON public.levantamentos;
CREATE POLICY levantamentos_insert
  ON public.levantamentos
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.has_anew_permission((SELECT auth.uid()), 'pessoas.create'))
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (SELECT 1
                FROM unnest((SELECT public.crm_scope_keys('pessoas.create'))) AS k(scope_key)
                WHERE starts_with(k.scope_key, levantamentos.organization_id::text || ':'))
    AND (created_by IS NULL
         OR created_by = (SELECT COALESCE((SELECT au.id FROM public.anew_users au
                                           WHERE au.auth_user_id = (SELECT auth.uid())
                                           LIMIT 1),
                                          public.current_business_user_id())))
    AND EXISTS (SELECT 1 FROM public.anew_entities e
                WHERE e.id = levantamentos.entity_id
                  AND e.organization_id = levantamentos.organization_id
                  AND e.deleted_at IS NULL)
    AND (feito_por IS NULL
         OR EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = levantamentos.feito_por
                      AND m.organization_id = levantamentos.organization_id
                      AND m.status = 'active'
                      AND m.role_is_client IS NOT TRUE))
    AND negocio_id IS NULL
  );

-- 1.6.7 Ambito sem escrita direta: o quadro, a lista, a pesquisa e a politica
--       das submissoes decidem por assigned_to, created_by e client_since.
--       authenticated tinha UPDATE na tabela inteira (e a politica de UPDATE
--       so pede uma linha visivel); deixa de poder escrever as colunas de
--       ambito e de estado. Continua a escrever o resto (nome, tipo,
--       contacto, fiscal, notas...). As colunas fechadas so se escrevem por
--       funcoes DEFINER: neg_atribuir_pessoa (responsavel), neg_apagar_pessoa
--       (apagar/restaurar), fn_neg_mudar_abordagem (abordagem),
--       fn_neg_converter_pessoa (cliente desde, 1.6.10), e as que ja
--       existiam (create-lead com service_role, fn_owner_sync_entity_from_visit,
--       fn_entity_interactions_sync_last_activity, execute_entity_erasure).
REVOKE UPDATE ON public.anew_entities FROM authenticated;
GRANT UPDATE (id, type, display_name, status, created_at, updated_at, first_name, last_name,
              search_text, email, phone, preferred_contact, preferred_time, locale,
              fiscal_name, billing_email, nif_encrypted, nif_hash, nif_last3,
              billing_nif_encrypted, billing_nif_last3, referred_by, gdpr_consented_at,
              notes, extra)
  ON public.anew_entities TO authenticated;

-- 1.6.8 Responsavel da pessoa (a escrita que saiu do UPDATE direto).
--       pessoas.edit na organizacao, pessoa no ambito de edicao e, numa lead,
--       leads.assign. O novo responsavel e membro ativo da organizacao (ou
--       NULL). As visitas futuras da pessoa seguem-no (fn_owner_sync_apply).
CREATE FUNCTION public.neg_atribuir_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_assigned_to uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_cliente boolean;
  v_atual   uuid;
  v_outras  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: organização ou pessoa.' USING ERRCODE = 'NG009';
  END IF;
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = p_assigned_to
         AND m.organization_id = p_organization_id
         AND m.status = 'active'
         AND m.role_is_client IS NOT TRUE) THEN
    RAISE EXCEPTION 'O responsável tem de ser membro activo da organização.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT e.client_since IS NOT NULL, e.assigned_to
    INTO v_cliente, v_atual
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  IF NOT v_cliente AND NOT public.has_anew_permission(v_uid, 'leads.assign') THEN
    RAISE EXCEPTION 'Sem permissão para atribuir esta lead.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_atual IS NOT DISTINCT FROM p_assigned_to THEN
    RETURN jsonb_build_object('mudou', false, 'assigned_to', v_atual, 'outras_visitas', '[]'::jsonb);
  END IF;

  UPDATE public.anew_entities e
  SET assigned_to = p_assigned_to,
      updated_at  = now()
  WHERE e.id = p_entity_id;

  IF p_assigned_to IS NOT NULL THEN
    v_outras := public.fn_owner_sync_apply('entity', p_entity_id, p_organization_id,
                                           v_atual, p_assigned_to, NULL::uuid);
  END IF;

  RETURN jsonb_build_object('mudou', true, 'assigned_to', p_assigned_to,
                            'outras_visitas', to_jsonb(COALESCE(v_outras, ARRAY[]::uuid[])));
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_atribuir_pessoa(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_atribuir_pessoa(uuid, uuid, uuid) TO authenticated;

-- 1.6.9 Apagar (para o lixo) e restaurar a pessoa: deleted_at/deleted_by.
--       pessoas.delete na organizacao e leads.delete/clients.delete com
--       ambito sobre a pessoa. Nao se apaga uma pessoa com negocios abertos
--       (sairia do quadro com eles). O apagamento RGPD continua a ser
--       execute_entity_erasure.
CREATE FUNCTION public.neg_apagar_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_apagar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_apagada boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL OR p_entity_id IS NULL OR p_apagar IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa ou ação.' USING ERRCODE = 'NG009';
  END IF;
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.delete') THEN
    RAISE EXCEPTION 'Sem permissão para apagar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  -- Uma so resposta para "nao existe", "e de outra organizacao" e "sem ambito".
  IF NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'delete') THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  SELECT e.deleted_at IS NOT NULL INTO v_apagada
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  IF v_apagada = p_apagar THEN
    RETURN jsonb_build_object('mudou', false, 'apagada', v_apagada);
  END IF;

  IF p_apagar AND public.fn_neg_tem_negocio_aberto(p_organization_id, p_entity_id) THEN
    RAISE EXCEPTION 'A pessoa tem negócios abertos.' USING ERRCODE = 'NG011';
  END IF;

  UPDATE public.anew_entities e
  SET deleted_at = CASE WHEN p_apagar THEN now() END,
      deleted_by = CASE WHEN p_apagar THEN public.current_business_user_id() END,
      updated_at = now()
  WHERE e.id = p_entity_id;

  RETURN jsonb_build_object('mudou', true, 'apagada', p_apagar);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_apagar_pessoa(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_apagar_pessoa(uuid, uuid, boolean) TO authenticated;

-- 1.6.10 Passar a cliente pela entidade. Uma entidade criada so pelo
--        formulario (sem anew_leads nem anew_clients) ganha um negocio e
--        passa a cliente: anew_entities.client_since fica com a data do ganho
--        (dia de Lisboa de negocios.ganho_em), so se estiver vazio. Ninguem
--        escreve anew_leads nem anew_clients.
--        fn_neg_converter_pessoa (DEFINER, sem EXECUTE para ninguem: so
--        fn_neg_ganhar_interno e fn_neg_tornar_cliente a chamam) e a unica
--        escrita; devolve o id da entidade (fn_neg_ganhar_interno ignora-o).
--        Ao passar a cliente a abordagem deixa de estar encerrada.
CREATE OR REPLACE FUNCTION public.fn_neg_converter_pessoa(p_negocio_id uuid, p_doc_tipo text, p_doc_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg   public.negocios;
  v_antes date;
  v_desde date;
  v_n     integer := 0;
BEGIN
  SELECT n.* INTO v_neg FROM public.negocios n WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- Uma conversão de cada vez por pessoa (o mesmo bloqueio de neg_ganhar_negocio).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  -- 20261228200000: a pessoa é a entidade; cliente desde o dia do ganho.
  SELECT e.client_since INTO v_antes
  FROM public.anew_entities e
  WHERE e.id = v_neg.entity_id AND e.organization_id = v_neg.organization_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  v_desde := (COALESCE(v_neg.ganho_em, now()) AT TIME ZONE 'Europe/Lisbon')::date;
  IF v_antes IS NULL THEN
    UPDATE public.anew_entities e
    SET client_since   = v_desde,
        closure_result = NULL,
        updated_at     = now()
    WHERE e.id = v_neg.entity_id AND e.client_since IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  INSERT INTO public.workflow_execution_log (
    source_entity, source_record_id, target_entity, target_record_id,
    action_type, status, execution_data
  ) VALUES (
    'negocio', v_neg.id, 'entity', v_neg.entity_id,
    'trigger:negocio_conversao', 'success',
    jsonb_build_object('cliente_desde', COALESCE(v_antes, v_desde), 'ja_cliente', v_antes IS NOT NULL,
                       'convertida', v_n > 0, 'documento', p_doc_tipo, 'documento_id', p_doc_id)
  );

  RETURN v_neg.entity_id;
END;
$function$;

-- fn_neg_tornar_cliente (nova): a conversão pedida no ecrã («Converter em
-- cliente», neg_ganhar_negocio). DEFINER porque client_since não tem UPDATE
-- direto (1.6.7); verifica explicitamente: sessão, negócio vivo e ganho,
-- editável por quem chama (fn_neg_pode_editar), configuração, e, se a pessoa
-- ainda for lead, leads.convert com âmbito sobre ela.
CREATE FUNCTION public.fn_neg_tornar_cliente(p_negocio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg     public.negocios;
  v_cliente date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF NOT FOUND OR NOT public.fn_neg_pode_editar(v_neg) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);
  IF v_neg.estado <> 'ganho' THEN
    RAISE EXCEPTION 'O negócio não está ganho: esta acção não é possível.' USING ERRCODE = 'NG002';
  END IF;

  -- Uma conversão de cada vez por pessoa (a mesma chave de fn_neg_converter_pessoa).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  SELECT e.client_since INTO v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_neg.entity_id AND e.organization_id = v_neg.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
  IF v_cliente IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', false, 'conversao', 'ja_cliente', 'cliente_desde', v_cliente);
  END IF;

  IF NOT public.fn_neg_pessoa_no_ambito(v_neg.organization_id, v_neg.entity_id, 'convert') THEN
    RAISE EXCEPTION 'Sem permissão para converter a lead.' USING ERRCODE = 'NG007';
  END IF;

  PERFORM public.fn_neg_converter_pessoa(v_neg.id, NULL::text, NULL::uuid);

  SELECT e.client_since INTO v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_neg.entity_id;

  RETURN jsonb_build_object('mudou', true, 'conversao', 'feita', 'cliente_desde', v_cliente);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_tornar_cliente(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_tornar_cliente(uuid) TO authenticated, service_role;

-- neg_ganhar_negocio: mesma assinatura, INVOKER e EXECUTE. A conversão é a da
-- entidade (fn_neg_tornar_cliente); p_lead_id e p_client_data ficam na
-- assinatura sem uso. Resposta com as mesmas chaves: conversao 'feita' ou
-- 'ja_cliente'; lead_id e client_id a NULL; outras_leads_abertas 0. Deixa de
-- haver NG015 (entidade sem lead).
CREATE OR REPLACE FUNCTION public.neg_ganhar_negocio(p_negocio_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_client_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg public.negocios;
  v_res jsonb;
BEGIN
  IF p_client_data IS NOT NULL AND jsonb_typeof(p_client_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados do cliente.' USING ERRCODE = 'NG009';
  END IF;

  -- 1. Negócio editável e JÁ ganho (o ganho vem dos documentos; aberto ou
  --    perdido: NG002).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['ganho']);

  -- 2. 20261228200000: a pessoa passa a cliente pela entidade (client_since).
  v_res := public.fn_neg_tornar_cliente(v_neg.id);

  -- 3. A conversão que falhou deixa de estar em alerta.
  IF v_neg.alerta_codigo = 'conversao_falhou' THEN
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.negocios n SET alerta_codigo = NULL
    WHERE n.id = v_neg.id AND n.alerta_codigo = 'conversao_falhou';
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;

  RETURN jsonb_build_object('mudou', COALESCE((v_res ->> 'mudou')::boolean, false), 'estado', 'ganho',
                            'conversao', v_res ->> 'conversao',
                            'lead_id', NULL, 'client_id', NULL,
                            'outras_leads_abertas', 0);
END;
$function$;

-- neg_reavaliar_negocio: mesma assinatura, DEFINER e EXECUTE. Só muda a regra
-- de quem pode converter: a pessoa já é cliente, ou quem fecha tem
-- leads.convert com âmbito sobre a entidade (antes: sobre as leads dela).
CREATE OR REPLACE FUNCTION public.neg_reavaliar_negocio(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_pos      record;
  v_conv     text;
  v_hash     text;
  v_converte boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND OR NOT public.fn_neg_pode_editar(v_neg) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);
  IF v_neg.estado <> 'aberto' THEN
    RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
      USING ERRCODE = 'NG002';
  END IF;

  SELECT d.tipo, d.id, d.estado, d.prova INTO v_pos FROM public.fn_neg_positivo_decisivo(v_neg) AS d;
  IF NOT FOUND OR v_pos.id IS NULL THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'aberto', 'motivo', 'sem_positivo_com_prova');
  END IF;

  v_hash := public.fn_neg_conteudo_hash(v_pos.tipo, v_pos.id);

  -- Conversão automática pela configuração: quem carrega no botão tem de poder
  -- converter (20261228200000: leads.convert com âmbito sobre a entidade, como
  -- fn_neg_tornar_cliente), salvo se a pessoa já for cliente. Sem isso dá o
  -- ganho, não converte e deixa a conversão por fazer («Converter em
  -- cliente»). Esta função exige sessão; sem sessão (portal) a conversão vem
  -- dos gatilhos, por fn_neg_ganhar_interno.
  SELECT c.conversao_ao_ganhar INTO v_conv
  FROM public.negocio_workflow_config c WHERE c.organization_id = v_neg.organization_id;
  IF v_conv = 'automatica' THEN
    v_converte := EXISTS (SELECT 1 FROM public.anew_entities e
                          WHERE e.id = v_neg.entity_id AND e.organization_id = v_neg.organization_id
                            AND e.client_since IS NOT NULL)
                  OR (public.fn_neg_tem_permissao_org(v_neg.organization_id, 'leads.convert')
                      AND public.fn_neg_pessoa_no_ambito(v_neg.organization_id, v_neg.entity_id, 'convert'));
  END IF;

  IF v_conv = 'automatica' AND NOT v_converte THEN
    PERFORM public.fn_neg_mudar_estado(v_neg.id, 'ganho', NULL, NULL, NULL,
      v_pos.tipo, v_pos.id, v_pos.estado, 'crm', v_pos.prova, v_hash, 'Fechar agora (reparação)');
    PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
      'Conversão em cliente por fazer: quem fechou não tem a permissão de converter leads. Use «Converter em cliente».',
      v_pos.tipo, v_pos.id, v_pos.estado, 'crm', NULL, NULL);
    v_conv := 'por_fazer';
  ELSE
    v_conv := public.fn_neg_ganhar_interno(v_neg.id, v_pos.tipo, v_pos.id, v_pos.estado, 'crm',
                                            v_pos.prova, v_hash, 'Fechar agora (reparação)');
  END IF;

  RETURN jsonb_build_object('mudou', true, 'estado', 'ganho', 'origem_tipo', v_pos.tipo,
                            'origem_id', v_pos.id, 'prova', v_pos.prova, 'conversao', v_conv);
END;
$function$;

-- 1.6.11 Sem qualificação MQL/SQL (decisão do utilizador): neg_classificar_lead
--        fica inerte. Mesma assinatura, INVOKER e EXECUTE; valida os valores e
--        a sessão, não escreve nada e devolve as mesmas chaves (mudou false,
--        qualificação a NULL). p_lead_id pode vir NULL (a ficha já não tem lead).
CREATE OR REPLACE FUNCTION public.neg_classificar_lead(p_organization_id uuid, p_lead_id uuid, p_tipo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_organization_id IS NULL
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('mql', 'sql')) THEN
    RAISE EXCEPTION 'Valor inválido: organização, lead ou classificação (mql, sql ou nula).'
      USING ERRCODE = 'NG009';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessão ou sem perfil de utilizador: não é possível classificar a lead.' USING ERRCODE = '42501';
  END IF;

  -- 20261228200000: a qualificação MQL/SQL deixou de existir; nada se grava.
  RETURN jsonb_build_object('mudou', false, 'qualificacao_tipo', NULL, 'qualificado_em', NULL);
END;
$function$;

-- 1.6.12 «Criar lead» de uma pessoa: a pessoa É a entidade (lead enquanto
--        client_since é nulo), por isso não se cria nada (nem lead, nem
--        papel, nem negócio). Mesma assinatura, INVOKER, EXECUTE e chaves de
--        resposta: ja_existia true para uma lead (lead_id NULL, encerrada pela
--        abordagem da entidade); um cliente não volta a lead (NG009).
--        p_id, p_source e o comercial ficam validados como antes e sem uso
--        (o responsável muda-se por neg_atribuir_pessoa).
CREATE OR REPLACE FUNCTION public.neg_criar_lead(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source    text := btrim(COALESCE(p_source, 'manual'));
  v_comercial uuid;
  v_cliente   date;
  v_encerrada text;
BEGIN
  -- 1. Valores
  IF p_id IS NULL OR v_source = '' OR char_length(v_source) > 50 THEN
    RAISE EXCEPTION 'Valor inválido: identificador ou origem (1 a 50 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  -- 2. Configuração (D1), permissão, pessoa visível
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar leads nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- 3. Comercial: o indicado ou quem cria; membro activo e não cliente.
  v_comercial := COALESCE(p_assigned_to, public.fn_neg_actor());
  IF v_comercial IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = v_comercial AND m.organization_id = p_organization_id
         AND m.status = 'active' AND m.role_is_client IS NOT TRUE) THEN
    RAISE EXCEPTION 'Valor inválido: o comercial tem de ser membro activo da organização.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 4. 20261228200000: a lead é a própria entidade.
  SELECT e.client_since, e.closure_result INTO v_cliente, v_encerrada
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
  IF v_cliente IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: a pessoa já é cliente e não volta a lead.' USING ERRCODE = 'NG009';
  END IF;

  RETURN jsonb_build_object(
    'criada', false, 'ja_existia', true, 'mudou', false, 'lead_id', NULL,
    'encerrada', v_encerrada IS NOT NULL);
END;
$function$;

-- fn_neg_tem_lead_aberta: mesma assinatura, DEFINER e EXECUTE. A pessoa é a
-- entidade viva da organização (em vez da ligação antiga) e tem lead aberta
-- quando é lead (client_since nulo) e não tem negócio aberto.
CREATE OR REPLACE FUNCTION public.fn_neg_tem_lead_aberta(p_organization_id uuid, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Não é um oráculo: só para quem tem leads.create nesta organização e só
  -- em organizações com a página Pessoas activa (mesma mensagem para tudo).
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.create')
     OR NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id)
     OR p_entity_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_entities e
                    WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
                      AND e.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  RETURN EXISTS (
           SELECT 1 FROM public.anew_entities e
           WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
             AND e.deleted_at IS NULL AND e.client_since IS NULL)
     AND NOT EXISTS (
           SELECT 1 FROM public.negocios n
           WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id
             AND n.estado = 'aberto' AND n.deleted_at IS NULL);
END;
$function$;

-- fn_neg_filtro_pessoas: mesma assinatura, DEFINER, search_path,
-- statement_timeout e EXECUTE; o mesmo contrato (NULL = usar o caminho
-- normal). Pela entidade, com as regras de neg_resumo_pessoas: responsável e
-- atividade da entidade, formulário da campanha da entidade ou da primeira
-- submissão, último resultado e «voltou» pelas chamadas.
CREATE OR REPLACE FUNCTION public.fn_neg_filtro_pessoas(p_organization_id uuid, p_atribuido_a uuid, p_formulario_id uuid, p_ultimo_resultado text, p_voltou boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_keys_lead text[];
  v_keys_cli  text[];
  v_admin     boolean;
  v_visiveis  uuid[];
  v_org       text := p_organization_id::text;
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.chaves_lead, a.chaves_cliente, a.admin
    INTO v_keys_lead, v_keys_cli, v_admin
  FROM public.fn_neg_ambito_pessoas(p_organization_id) a;
  IF v_admin IS NOT FALSE OR cardinality(v_keys_lead) + cardinality(v_keys_cli) = 0 THEN
    RETURN NULL;
  END IF;
  v_visiveis := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  IF NOT (p_organization_id = ANY (v_visiveis)) THEN
    RETURN NULL;
  END IF;

  RETURN ARRAY(
    SELECT e.id
    FROM public.anew_entities e
    LEFT JOIN (
      SELECT i.entity_id AS ent, max(i.interaction_at) AS ultimo,
             (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
      FROM public.entity_interactions i
      WHERE (p_ultimo_resultado IS NOT NULL OR p_voltou IS NOT NULL)
        AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
      GROUP BY i.entity_id
    ) ct ON ct.ent = e.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
               (SELECT f.id
                FROM public.campaigns ca
                JOIN public.forms f ON f.id = ca.form_id
                WHERE ca.id = e.campaign_id
                  AND ca.organization_id = ANY (v_visiveis) AND f.organization_id = ANY (v_visiveis)),
               (SELECT fs.form_id
                FROM public.form_submissions fs
                WHERE fs.entity_id = e.id AND fs.organization_id = p_organization_id
                  AND fs.form_id IS NOT NULL AND fs.deleted_at IS NULL
                ORDER BY fs.created_at, fs.id
                LIMIT 1)) AS fid
      WHERE p_formulario_id IS NOT NULL
    ) fm ON true
    WHERE e.organization_id = p_organization_id AND e.deleted_at IS NULL
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_keys_lead)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_keys_lead)
                  OR v_org || ':' || e.created_by::text = ANY (v_keys_lead))
               ELSE
                 (v_org || ':*' = ANY (v_keys_cli)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_keys_cli)
                  OR v_org || ':' || e.created_by::text = ANY (v_keys_cli))
          END
      AND (p_atribuido_a IS NULL OR e.assigned_to = p_atribuido_a)
      AND (p_formulario_id IS NULL OR fm.fid = p_formulario_id)
      AND (p_ultimo_resultado IS NULL
           OR (CASE WHEN ct.ultimo IS NULL THEN 'semContacto' ELSE ct.resultado END) = p_ultimo_resultado)
      AND (p_voltou IS NULL
           OR (e.last_activity_at IS NOT NULL
               AND (ct.ultimo IS NULL OR e.last_activity_at > ct.ultimo)) = p_voltou));
EXCEPTION WHEN OTHERS THEN
  -- falha fechada no caminho rápido: a Lista usa o caminho normal, pela RLS
  RETURN NULL;
END;
$function$;

-- neg_cancelar_visita: o corpo em vigor (a visita já se resolve pela
-- entidade, em fn_neg_visita_editavel), só sem a referência às leads.
CREATE OR REPLACE FUNCTION public.neg_cancelar_visita(p_visita_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis public.schedule_items;
BEGIN
  v_vis := public.fn_neg_visita_editavel(p_visita_id, true);

  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', false);
  END IF;

  -- Nunca DELETE; o levantamento que aponte para esta visita fica como está,
  -- e a pessoa (a entidade) também.
  PERFORM public.rpc_update_schedule_item(
    p_id         => v_vis.id,
    p_status     => 'cancelled'::public.schedule_item_status,
    p_set_status => true);
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object('visita_id', v_vis.id, 'mudou', true);
END;
$function$;

-- neg_procurar_duplicados: mesma assinatura, DEFINER, EXECUTE, limites e
-- formato. O universo são as entidades vivas desta organização e das do
-- grupo que quem chama vê (anew_entities.organization_id), em vez de leads,
-- clientes, papéis e ligações; coincide também pelo email, telefone e NIF
-- (hash) da própria entidade. «visivel» pelo âmbito em vigor (leads.view para
-- leads, clients.view para clientes, sobre o responsável ou o criador).
CREATE OR REPLACE FUNCTION public.neg_procurar_duplicados(p_organization_id uuid, p_email text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_nif_hash text DEFAULT NULL::text, p_pais text DEFAULT 'PT'::text)
 RETURNS TABLE(pessoa integer, campo text, ambito text, entity_id uuid, nome text, visivel boolean, organizacao_id uuid, organizacao_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  c_bucket_utilizador   CONSTANT text    := 'neg_procurar_duplicados:utilizador';
  c_bucket_organizacao  CONSTANT text    := 'neg_procurar_duplicados:organizacao';
  c_max_utilizador_5min CONSTANT integer := 30;
  c_max_utilizador_hora CONSTANT integer := 200;
  c_max_organizacao_hora CONSTANT integer := 2000;
  v_uid       uuid := auth.uid();
  v_email     text := lower(NULLIF(btrim(p_email), ''));
  v_tel       text := NULLIF(btrim(p_telefone), '');
  v_dig       text;
  v_nif       text := lower(NULLIF(btrim(p_nif_hash), ''));
  v_pais      text := upper(COALESCE(NULLIF(btrim(p_pais), ''), 'PT'));
  v_orgs      uuid[];
  v_keys_pes  text[];
  v_keys_lead text[];
  v_keys_cli  text[];
  v_org       text := p_organization_id::text;
  v_n_5min    integer;
  v_n_hora    integer;
  v_n_org     integer;
  v_linhas    integer;
BEGIN
  -- 1. Valores
  v_dig := regexp_replace(COALESCE(v_tel, ''), '[^0-9]', '', 'g');
  IF p_organization_id IS NULL
     OR (v_email IS NULL AND v_tel IS NULL AND v_nif IS NULL)
     OR (v_email IS NOT NULL AND (char_length(v_email) > 254
                                  OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     OR (v_tel IS NOT NULL AND (char_length(v_tel) > 30
                                OR v_tel !~ '^\+?[0-9 ().-]+$'
                                OR char_length(v_dig) NOT BETWEEN 7 AND 15))
     OR (v_nif IS NOT NULL AND v_nif !~ '^[0-9a-f]{64}$')
     OR v_pais !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Valor inválido: organização, email, telefone (7 a 15 dígitos) ou NIF.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração.
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Quem procura duplicados é quem pode criar a lead nesta organização.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar leads nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Limite de pedidos (por utilizador e por organização).
  PERFORM pg_advisory_xact_lock(hashtextextended(c_bucket_utilizador || ':' || v_uid::text, 0));

  SELECT count(*) FILTER (WHERE r.created_at > now() - interval '5 minutes'),
         count(*)
    INTO v_n_5min, v_n_hora
  FROM public.rate_limit_attempts r
  WHERE r.bucket = c_bucket_utilizador
    AND r.identifier = v_uid::text
    AND r.created_at > now() - interval '1 hour';

  SELECT count(*) INTO v_n_org
  FROM public.rate_limit_attempts r
  WHERE r.bucket = c_bucket_organizacao
    AND r.identifier = p_organization_id::text
    AND r.created_at > now() - interval '1 hour';

  IF v_n_5min >= c_max_utilizador_5min
     OR v_n_hora >= c_max_utilizador_hora
     OR v_n_org >= c_max_organizacao_hora THEN
    RAISE EXCEPTION 'Demasiadas verificações seguidas. Tente de novo mais tarde.'
      USING ERRCODE = 'NG020';
  END IF;

  -- 6. Organizações onde se procura: esta e as do grupo que quem chama vê.
  v_orgs := ARRAY[p_organization_id]
         || ARRAY(SELECT g.id
                  FROM public.get_org_group_ids(p_organization_id) AS g(id)
                  WHERE g.id <> p_organization_id
                    AND g.id IN (SELECT public.get_user_visible_org_ids(v_uid)));

  -- 7. Âmbito de leitura de quem chama (para entity_id e nome).
  v_keys_lead := CASE WHEN public.has_anew_permission(v_uid, 'leads.view')
                      THEN public.crm_scope_keys('leads.view') ELSE ARRAY[]::text[] END;
  v_keys_cli  := CASE WHEN public.has_anew_permission(v_uid, 'clients.view')
                      THEN public.crm_scope_keys('clients.view') ELSE ARRAY[]::text[] END;

  -- 8. Procura (20261228200000: pela entidade).
  RETURN QUERY
  WITH universo AS (
    SELECT e.id AS ent, e.organization_id AS org
    FROM public.anew_entities e
    WHERE e.organization_id = ANY (v_orgs) AND e.deleted_at IS NULL
  ),
  coincide AS (
    SELECT u.ent, 'email'::text AS cmp
    FROM universo u
    JOIN public.anew_entity_emails em ON em.entity_id = u.ent
    WHERE v_email IS NOT NULL
      AND lower(btrim(em.email)) = v_email
    UNION
    SELECT u.ent, 'email'::text
    FROM universo u
    JOIN public.anew_entities e ON e.id = u.ent
    WHERE v_email IS NOT NULL
      AND lower(btrim(e.email)) = v_email
    UNION
    SELECT u.ent, 'telefone'::text
    FROM universo u
    JOIN public.anew_entity_phones ph ON ph.entity_id = u.ent
    WHERE v_tel IS NOT NULL
      AND char_length(regexp_replace(COALESCE(ph.phone_number, ''), '[^0-9]', '', 'g')) >= 7
      AND (regexp_replace(COALESCE(ph.phone_number, ''), '[^0-9]', '', 'g') LIKE '%' || v_dig
           OR v_dig LIKE '%' || regexp_replace(COALESCE(ph.phone_number, ''), '[^0-9]', '', 'g'))
    UNION
    SELECT u.ent, 'telefone'::text
    FROM universo u
    JOIN public.anew_entities e ON e.id = u.ent
    WHERE v_tel IS NOT NULL
      AND char_length(regexp_replace(COALESCE(e.phone, ''), '[^0-9]', '', 'g')) >= 7
      AND (regexp_replace(COALESCE(e.phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_dig
           OR v_dig LIKE '%' || regexp_replace(COALESCE(e.phone, ''), '[^0-9]', '', 'g'))
    UNION
    SELECT u.ent, 'nif'::text
    FROM universo u
    JOIN public.anew_entity_fiscal_entities aef ON aef.entity_id = u.ent
    JOIN public.fiscal_entities fe ON fe.id = aef.fiscal_entity_id
    WHERE v_nif IS NOT NULL
      AND fe.nif_hash = v_nif
      AND fe.country_code = v_pais
    UNION
    SELECT u.ent, 'nif'::text
    FROM universo u
    JOIN public.anew_entities e ON e.id = u.ent
    WHERE v_nif IS NOT NULL
      AND e.nif_hash = v_nif
  ),
  nesta AS (
    SELECT c.ent, c.cmp
    FROM coincide c
    WHERE EXISTS (SELECT 1 FROM universo u WHERE u.ent = c.ent AND u.org = p_organization_id)
  ),
  nesta_vista AS (
    SELECT n.ent,
           n.cmp,
           dense_rank() OVER (ORDER BY n.ent)::integer AS num,
           EXISTS (SELECT 1 FROM public.anew_entities e
                   WHERE e.id = n.ent AND e.organization_id = p_organization_id
                     AND e.deleted_at IS NULL
                     AND CASE WHEN e.client_since IS NULL THEN
                                (v_org || ':*' = ANY (v_keys_lead)
                                 OR v_org || ':' || e.assigned_to::text = ANY (v_keys_lead)
                                 OR v_org || ':' || e.created_by::text = ANY (v_keys_lead))
                              ELSE
                                (v_org || ':*' = ANY (v_keys_cli)
                                 OR v_org || ':' || e.assigned_to::text = ANY (v_keys_cli)
                                 OR v_org || ':' || e.created_by::text = ANY (v_keys_cli))
                         END) AS ve
    FROM nesta n
  ),
  no_grupo AS (
    SELECT DISTINCT c.cmp, u.org
    FROM coincide c
    JOIN universo u ON u.ent = c.ent AND u.org <> p_organization_id
    WHERE NOT EXISTS (SELECT 1 FROM nesta n WHERE n.ent = c.ent)
  ),
  linhas AS (
    SELECT 1 AS ordem,
           nv.num AS r_pessoa,
           nv.cmp AS r_campo,
           'organizacao'::text AS r_ambito,
           CASE WHEN nv.ve THEN nv.ent END AS r_entity_id,
           CASE WHEN nv.ve THEN ent.display_name END AS r_nome,
           nv.ve AS r_visivel,
           p_organization_id AS r_org,
           NULL::text AS r_org_nome
    FROM nesta_vista nv
    LEFT JOIN public.anew_entities ent ON ent.id = nv.ent
    UNION ALL
    SELECT 2,
           NULL::integer,
           g.cmp,
           'grupo'::text,
           NULL::uuid,
           NULL::text,
           NULL::boolean,
           g.org,
           o.name::text
    FROM no_grupo g
    LEFT JOIN public.anew_organizations o ON o.id = g.org
  )
  SELECT x.r_pessoa, x.r_campo, x.r_ambito, x.r_entity_id, x.r_nome, x.r_visivel, x.r_org, x.r_org_nome
  FROM linhas x
  ORDER BY x.ordem, x.r_pessoa, x.r_campo, x.r_org_nome
  LIMIT 50;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- 9. Registo da tentativa (sem o valor procurado).
  INSERT INTO public.rate_limit_attempts (bucket, identifier, success)
  VALUES (c_bucket_utilizador,  v_uid::text,               v_linhas = 0),
         (c_bucket_organizacao, p_organization_id::text,   v_linhas = 0);

  RETURN;
END;
$function$;


-- ------------------------------------------------------------
-- 2. Formulario e submissoes
-- ------------------------------------------------------------
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS origin_id uuid
    CONSTRAINT form_submissions_origin_id_fkey REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_recognized boolean,
  ADD COLUMN IF NOT EXISTS channel_id uuid
    CONSTRAINT form_submissions_channel_id_fkey REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS negocio_id uuid
    CONSTRAINT form_submissions_negocio_id_fkey REFERENCES public.negocios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_via text
    CONSTRAINT form_submissions_campaign_via_check
      CHECK (campaign_via IS NULL OR campaign_via IN ('link', 'formulario', 'mao', 'nenhuma')),
  ADD COLUMN IF NOT EXISTS needs_manual_scheduling boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.form_submissions.origin_id IS 'Origem desta entrada (lead_sources), reconhecida pelo nome ou sinonimo.';
COMMENT ON COLUMN public.form_submissions.origin_recognized IS 'true: a origem foi reconhecida na lista; false: veio texto que ficou por mapear; NULL: sem origem.';
COMMENT ON COLUMN public.form_submissions.channel_id IS 'Canal da campanha desta entrada. NULL = «Outros» (sem campanha ou sem canal).';
COMMENT ON COLUMN public.form_submissions.negocio_id IS 'Negocio que esta submissao criou ou alimentou (opcional).';
COMMENT ON COLUMN public.form_submissions.campaign_via IS 'Como chegou a campanha: link, formulario, mao ou nenhuma.';
COMMENT ON COLUMN public.form_submissions.needs_manual_scheduling IS 'A pessoa pediu marcacao e nao havia hora: agendamento manual pendente.';

CREATE INDEX IF NOT EXISTS idx_form_submissions_origin_id
  ON public.form_submissions (origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_channel_id
  ON public.form_submissions (channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_negocio_id
  ON public.form_submissions (negocio_id) WHERE negocio_id IS NOT NULL;

-- A submissao aponta para a entidade: target_type/target_id deixam de ser
-- obrigatorios e aceitam 'entity'.
ALTER TABLE public.form_submissions ALTER COLUMN target_type DROP NOT NULL;
ALTER TABLE public.form_submissions ALTER COLUMN target_id DROP NOT NULL;
ALTER TABLE public.form_submissions DROP CONSTRAINT IF EXISTS form_submissions_target_type_check;
ALTER TABLE public.form_submissions
  ADD CONSTRAINT form_submissions_target_type_check
  CHECK (target_type IS NULL OR target_type IN ('lead', 'contact', 'client', 'entity'));

-- Trigger de validacao do alvo: mesma seguranca (INVOKER), agora com
-- search_path fixo e o ramo 'entity'.
CREATE OR REPLACE FUNCTION public.check_form_submissions_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW."target_type" = 'contact' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_contacts" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_contacts', NEW."target_id";
    END IF;
  ELSIF NEW."target_type" = 'client' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_clients" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_clients', NEW."target_id";
    END IF;
  ELSIF NEW."target_type" = 'lead' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_leads" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_leads', NEW."target_id";
    END IF;
  ELSIF NEW."target_type" = 'entity' THEN
    IF NEW."target_id" IS DISTINCT FROM NEW."entity_id" THEN
      RAISE EXCEPTION 'form_submissions.target_id % must be the submission entity_id', NEW."target_id";
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- E uma funcao de trigger (o EXECUTE so conta ao criar o trigger): anon e
-- PUBLIC deixam de a ter; authenticated e service_role ficam como estavam.
REVOKE ALL ON FUNCTION public.check_form_submissions_target() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_form_submissions_target() TO authenticated, service_role;

-- Politica de leitura por organizacao: pela entidade da submissao, com o
-- ambito em vigor (leads.view para leads, clients.view para clientes, sobre o
-- responsavel ou o criador), em vez de anew_leads/anew_clients por target_id.
DROP POLICY IF EXISTS form_submissions_select_org ON public.form_submissions;
CREATE POLICY form_submissions_select_org
  ON public.form_submissions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM public.anew_entities e
      WHERE e.id = form_submissions.entity_id
        AND e.organization_id = form_submissions.organization_id
        AND e.deleted_at IS NULL
        AND public.can_access_contact_row(
              e.organization_id, e.created_by, e.assigned_to,
              CASE WHEN e.client_since IS NULL THEN 'leads.view' ELSE 'clients.view' END)
    )
  );

-- upsert_form_submission: os mesmos 12 parametros, pela mesma ordem, e 6
-- novos no fim; tudo depois de p_entity_id e opcional. A assinatura antiga
-- sai primeiro (nunca ficam duas).
DROP FUNCTION public.upsert_form_submission(uuid, uuid, uuid, uuid, uuid, text, uuid, jsonb, text,
  boolean, integer, integer);

CREATE FUNCTION public.upsert_form_submission(
  p_organization_id uuid,
  p_root_organization_id uuid,
  p_entity_id uuid,
  p_form_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_field_values jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'in_progress',
  p_is_complete boolean DEFAULT false,
  p_current_step integer DEFAULT 1,
  p_total_steps integer DEFAULT NULL,
  p_origin_id uuid DEFAULT NULL,
  p_origin_recognized boolean DEFAULT NULL,
  p_channel_id uuid DEFAULT NULL,
  p_negocio_id uuid DEFAULT NULL,
  p_campaign_via text DEFAULT NULL,
  p_needs_manual_scheduling boolean DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_target_type text := COALESCE(p_target_type, 'entity');
  v_target_id uuid := CASE WHEN p_target_type IS NULL THEN p_entity_id ELSE p_target_id END;
BEGIN
  INSERT INTO public.form_submissions (
    organization_id, root_organization_id, entity_id, form_id, campaign_id,
    target_type, target_id, field_values, status, is_complete, current_step, total_steps,
    origin_id, origin_recognized, channel_id, negocio_id, campaign_via, needs_manual_scheduling
  ) VALUES (
    p_organization_id, p_root_organization_id, p_entity_id, p_form_id, p_campaign_id,
    v_target_type, v_target_id, COALESCE(p_field_values, '{}'::jsonb),
    COALESCE(p_status, 'in_progress'), COALESCE(p_is_complete, false), p_current_step, p_total_steps,
    p_origin_id, p_origin_recognized, p_channel_id, p_negocio_id, p_campaign_via,
    COALESCE(p_needs_manual_scheduling, false)
  )
  ON CONFLICT (
    organization_id, entity_id,
    COALESCE(form_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  DO UPDATE SET
    target_type   = EXCLUDED.target_type,
    target_id     = EXCLUDED.target_id,
    field_values  = EXCLUDED.field_values,
    status        = EXCLUDED.status,
    is_complete   = EXCLUDED.is_complete,
    current_step  = EXCLUDED.current_step,
    total_steps   = EXCLUDED.total_steps,
    -- os novos so se escrevem quando vem valor: um passo seguinte sem eles
    -- nao apaga o que o primeiro gravou
    origin_id         = COALESCE(EXCLUDED.origin_id, form_submissions.origin_id),
    origin_recognized = COALESCE(EXCLUDED.origin_recognized, form_submissions.origin_recognized),
    channel_id        = COALESCE(EXCLUDED.channel_id, form_submissions.channel_id),
    negocio_id        = COALESCE(EXCLUDED.negocio_id, form_submissions.negocio_id),
    campaign_via      = COALESCE(EXCLUDED.campaign_via, form_submissions.campaign_via),
    needs_manual_scheduling = CASE WHEN p_needs_manual_scheduling IS NULL
                                   THEN form_submissions.needs_manual_scheduling
                                   ELSE p_needs_manual_scheduling END,
    updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_form_submission(uuid, uuid, uuid, uuid, uuid, text, uuid, jsonb, text,
  boolean, integer, integer, uuid, boolean, uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_form_submission(uuid, uuid, uuid, uuid, uuid, text, uuid, jsonb, text,
  boolean, integer, integer, uuid, boolean, uuid, uuid, text, boolean)
  TO service_role;

-- Captacao de uma entrada do formulario: nunca recusa. Devolve a
-- organizacao do formulario, a campanha valida (a do link, so se for da
-- mesma organizacao; senao a do formulario; senao nenhuma), como chegou, a
-- origem reconhecida (nome ou sinonimo, da organizacao primeiro e depois das
-- globais), se foi reconhecida, e o canal da campanha (NULL = «Outros»).
CREATE FUNCTION public.fn_form_resolver_captacao(
  p_form_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_origem text DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid,
  campaign_id uuid,
  campaign_via text,
  origin_id uuid,
  origin_recognized boolean,
  channel_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_org    uuid;
  v_camp   uuid;
  v_via    text := 'nenhuma';
  v_texto  text := NULLIF(lower(btrim(p_origem)), '');
  v_origem uuid;
  v_recon  boolean;
  v_canal  uuid;
BEGIN
  SELECT f.organization_id INTO v_org
  FROM public.forms f
  WHERE f.id = p_form_id;

  IF v_org IS NOT NULL THEN
    -- 1. a campanha do link, so da organizacao do formulario
    IF p_campaign_id IS NOT NULL THEN
      SELECT ca.id INTO v_camp
      FROM public.campaigns ca
      WHERE ca.id = p_campaign_id AND ca.organization_id = v_org;
      IF v_camp IS NOT NULL THEN
        v_via := 'link';
      END IF;
    END IF;

    -- 2. senao, a campanha que usa este formulario (a ativa mais recente)
    IF v_camp IS NULL THEN
      SELECT ca.id INTO v_camp
      FROM public.campaigns ca
      WHERE ca.form_id = p_form_id AND ca.organization_id = v_org
      ORDER BY (ca.status = 'active') DESC, ca.created_at DESC, ca.id DESC
      LIMIT 1;
      IF v_camp IS NOT NULL THEN
        v_via := 'formulario';
      END IF;
    END IF;

    -- 3. origem: o texto pelo nome ou sinonimo (da organizacao primeiro)
    IF v_texto IS NOT NULL THEN
      SELECT ls.id INTO v_origem
      FROM public.lead_sources ls
      WHERE (ls.organization_id = v_org OR ls.organization_id IS NULL)
        AND ls.is_active IS NOT FALSE
        AND (lower(btrim(ls.name)) = v_texto
             OR EXISTS (SELECT 1 FROM unnest(ls.utm_aliases) AS a(sinonimo)
                        WHERE lower(btrim(a.sinonimo)) = v_texto))
      ORDER BY (ls.organization_id IS NULL), (lower(btrim(ls.name)) = v_texto) DESC,
               ls.created_at NULLS LAST, ls.id
      LIMIT 1;
      v_recon := v_origem IS NOT NULL;
    ELSIF v_camp IS NOT NULL THEN
      -- sem texto: a origem por omissao da campanha
      SELECT COALESCE(
               (SELECT cs.source_id FROM public.campaign_sources cs
                JOIN public.lead_sources ls ON ls.id = cs.source_id
                WHERE cs.campaign_id = v_camp
                  AND (ls.organization_id = v_org OR ls.organization_id IS NULL)
                ORDER BY cs.is_default DESC, cs.created_at, cs.id
                LIMIT 1),
               (SELECT ca.source_id FROM public.campaigns ca
                JOIN public.lead_sources ls ON ls.id = ca.source_id
                WHERE ca.id = v_camp
                  AND (ls.organization_id = v_org OR ls.organization_id IS NULL)))
        INTO v_origem;
      v_recon := CASE WHEN v_origem IS NOT NULL THEN true END;
    END IF;

    -- 4. canal: o da campanha (o da origem, senao o ativo mais antigo)
    IF v_camp IS NOT NULL THEN
      SELECT ch.id INTO v_canal
      FROM public.channels ch
      WHERE ch.campaign_id = v_camp AND ch.is_active
      ORDER BY (ch.source_id IS NOT DISTINCT FROM v_origem AND v_origem IS NOT NULL) DESC,
               ch.created_at, ch.id
      LIMIT 1;
    END IF;
  END IF;

  RETURN QUERY SELECT v_org, v_camp, v_via, v_origem, v_recon, v_canal;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_form_resolver_captacao(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_form_resolver_captacao(uuid, uuid, text) TO service_role;

-- ------------------------------------------------------------
-- 3. Lista e quadro pela entidade
-- ------------------------------------------------------------

-- 3.1 Quem ve a entidade (RLS) ve todas as suas colunas, incluindo o
--     responsavel, o contacto, o fiscal, as notas e a abordagem
--     (closure_result, 1.6.1). So as 3 fiscais cifradas (nif_encrypted,
--     nif_hash, billing_nif_encrypted) continuam sem leitura direta
--     (conferido no fim). A escrita nao muda: ver 1.6.7.
GRANT SELECT (assigned_to, origin_id, campaign_id, last_activity_at, closure_result,
              email, phone, preferred_contact, preferred_time, fiscal_name,
              billing_email, nif_last3, billing_nif_last3, referred_by,
              gdpr_consented_at, notes, extra, deleted_by, legacy_lead_id,
              legacy_client_id)
  ON public.anew_entities TO authenticated;

-- 3.2 A auditoria so retira do log as 3 fiscais cifradas (corpo em vigor na
--     RH; so a lista v_entity_hidden_cols muda).
CREATE OR REPLACE FUNCTION public.fn_generic_entity_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_changed_by    uuid;
  v_source        text;
  v_org_id        uuid;
  v_entity_id     uuid;
  v_record_id     uuid;
  v_old           jsonb;
  v_new           jsonb;
  v_changed       jsonb;
  v_full          jsonb;
  v_key           text;
  -- Columns that carry no semantic meaning for change-tracking
  v_noise_cols    text[] := ARRAY[
    'updated_at', 'search_text', 'contact_attempts', 'last_activity_at'
  ];
  -- Columns that must never be copied to entity_audit_log (column-masked
  -- secrets; the log is readable without that mask). Absent keys are a no-op.
  v_secret_cols   text[] := ARRAY[
    'nif_encrypted', 'nif_hash', 'billing_nif_encrypted'
  ];
  -- public.anew_entities only: every column authenticated cannot SELECT
  -- (only the fiscal secrets). Other tables keep auditing their own
  -- columns with the same names.
  v_entity_hidden_cols text[] := ARRAY[
    'nif_encrypted', 'nif_hash', 'billing_nif_encrypted'
  ];
  v_strip         text[];
BEGIN

  -- Audit bypass: a business RPC that already wrote a consolidated row via
  -- fn_manual_audit_log() sets app.audit_bypass='on' (SET LOCAL).
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve actor
  BEGIN
    v_changed_by := (current_setting('app.audit_user_id', true))::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  -- Resolve source
  v_source := current_setting('app.audit_source', true);
  IF v_source = '' THEN
    v_source := NULL;
  END IF;

  -- Resolve record_id (the audited row's own PK)
  IF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_record_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;

  -- Resolve entity_id (anew_entities falls back to its own id)
  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
    END IF;
  ELSE
    v_entity_id := (to_jsonb(NEW) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    END IF;
  END IF;

  -- Resolve organization_id. Strategy A: table carries organization_id.
  IF TG_OP = 'DELETE' THEN
    v_org_id := (to_jsonb(OLD) ->> 'organization_id')::uuid;
  ELSE
    v_org_id := (to_jsonb(NEW) ->> 'organization_id')::uuid;
  END IF;

  -- Strategy B: via role tables.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT er.organization_id
    INTO   v_org_id
    FROM   public.anew_entity_roles er
    WHERE  er.entity_id  = v_entity_id
      AND  er.deleted_at IS NULL
    ORDER BY er.created_at DESC
    LIMIT 1;
  END IF;

  -- Strategy C: via parent lead/contact/client.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT COALESCE(l.organization_id, c.organization_id, cl.organization_id)
    INTO   v_org_id
    FROM   (SELECT NULL::uuid) dummy
    LEFT JOIN public.anew_leads    l  ON l.entity_id  = v_entity_id AND l.deleted_at IS NULL
    LEFT JOIN public.anew_contacts c  ON c.entity_id  = v_entity_id AND c.deleted_at IS NULL
    LEFT JOIN public.anew_clients  cl ON cl.entity_id = v_entity_id AND cl.deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Cannot determine org: skip silently to avoid polluting the log.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Columns never copied to the log for this table.
  IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'anew_entities' THEN
    v_strip := v_entity_hidden_cols;
  ELSE
    v_strip := v_secret_cols;
  END IF;

  -- Build changed_fields / full_record (without the stripped columns)
  IF TG_OP = 'INSERT' THEN
    v_changed := NULL;
    v_full    := to_jsonb(NEW) - v_strip;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'INSERT',
         v_changed, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) - v_strip;
    v_new := to_jsonb(NEW) - v_strip;
    v_changed := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      END IF;
    END LOOP;

    -- Only write a row when something meaningful actually changed.
    IF v_changed = '{}'::jsonb OR v_changed IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'UPDATE',
         v_changed, NULL, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_full := to_jsonb(OLD) - v_strip;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'DELETE',
         NULL, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN OLD;
  END IF;

  -- Fallback: should never reach here.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- The audit trigger must never block the originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- 3.3 Indices de pagina da lista (so entidades vivas).
CREATE INDEX IF NOT EXISTS idx_anew_entities_org_recentes
  ON public.anew_entities (organization_id, (GREATEST(created_at, last_activity_at)) DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_anew_entities_org_nome
  ON public.anew_entities (organization_id, (COALESCE(lower(display_name), '')), id)
  WHERE deleted_at IS NULL;

-- 3.4 Pesquisa de pessoas (DEFINER, como antes): nome, email e telefone da
--     entidade (e das tabelas de emails e telefones, ainda escritas pelo
--     codigo antigo), com o ambito em vigor: leads.view para entidades lead e
--     clients.view para clientes, sobre o responsavel ou o criador.
CREATE OR REPLACE FUNCTION public.fn_neg_pesquisa_pessoas(p_organization_id uuid, p_pesquisa text)
 RETURNS TABLE(entity_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid       uuid := auth.uid();
  v_q         text := NULLIF(btrim(p_pesquisa), '');
  v_padrao    text;
  v_digitos   text;
  v_keys_lead text[];
  v_keys_cli  text[];
  v_admin     boolean;
  v_org       text := p_organization_id::text;
BEGIN
  IF char_length(v_q) < 2 OR char_length(v_q) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: pesquisa (2 a 200 caracteres).' USING ERRCODE = 'NG009';
  END IF;
  IF v_q IS NULL THEN
    RETURN;
  END IF;
  SELECT a.chaves_lead, a.chaves_cliente, a.admin
    INTO v_keys_lead, v_keys_cli, v_admin
  FROM public.fn_neg_ambito_pessoas(p_organization_id) a;
  IF cardinality(v_keys_lead) + cardinality(v_keys_cli) = 0 THEN
    RETURN;
  END IF;
  IF v_admin AND NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RETURN;
  END IF;

  v_padrao := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF v_q ~ '^[0-9 +().-]+$' THEN
    v_digitos := regexp_replace(v_q, '\D', '', 'g');
    IF char_length(v_digitos) < 7 THEN
      v_digitos := NULL;
    END IF;
  END IF;

  RETURN QUERY
  SELECT e.id
  FROM public.anew_entities e
  WHERE e.organization_id = p_organization_id
    AND e.deleted_at IS NULL
    AND CASE WHEN e.client_since IS NULL THEN
               (v_org || ':*' = ANY (v_keys_lead)
                OR v_org || ':' || e.assigned_to::text = ANY (v_keys_lead)
                OR v_org || ':' || e.created_by::text = ANY (v_keys_lead))
             ELSE
               (v_org || ':*' = ANY (v_keys_cli)
                OR v_org || ':' || e.assigned_to::text = ANY (v_keys_cli)
                OR v_org || ':' || e.created_by::text = ANY (v_keys_cli))
        END
    AND (e.display_name ILIKE v_padrao ESCAPE '\'
         OR e.email ILIKE v_padrao ESCAPE '\'
         OR EXISTS (SELECT 1 FROM public.anew_entity_emails em
                    WHERE em.entity_id = e.id AND em.email ILIKE v_padrao ESCAPE '\')
         OR (v_digitos IS NOT NULL AND (
               EXISTS (SELECT 1
                       FROM (SELECT regexp_replace(e.phone, '\D', '', 'g') AS d) x
                       WHERE char_length(x.d) >= 7
                         AND (x.d LIKE '%' || v_digitos OR v_digitos LIKE '%' || x.d))
               OR EXISTS (
                 SELECT 1
                 FROM public.anew_entity_phones ph
                 CROSS JOIN LATERAL (SELECT regexp_replace(ph.phone_number, '\D', '', 'g') AS d) x
                 WHERE ph.entity_id = e.id AND char_length(x.d) >= 7
                   AND (x.d LIKE '%' || v_digitos OR v_digitos LIKE '%' || x.d)))));
END;
$function$;

-- 3.5 Quadro (Pipeline) pela entidade. Mesma assinatura e o mesmo formato de
--     resposta. Pessoas: entidades vivas da organizacao, lead se client_since
--     e nulo, cliente se tem data, com o ambito em vigor (leads.view /
--     clients.view, chaves org:*, org:responsavel, org:criador) e a RLS de
--     quem chama. Colunas de pessoa (so entidades sem negocio aberto):
--     «porContactar» sem chamada e sem visita depois do ultimo negocio,
--     «contactado» com chamada e sem visita, «visita» com visita
--     (schedule_items.entity_id). Uma lead sem negocio acabada de criar pelo
--     formulario cai em «porContactar». Como na versao em vigor, quem tem a
--     abordagem encerrada (anew_entities.closure_result) nao entra nestas tres
--     colunas. Colunas de negocio como estavam.
--     lead_id e client_id vem a NULL (a pessoa e entity_id; o papel diz se e
--     lead ou cliente).
CREATE OR REPLACE FUNCTION public.neg_resumo_quadro(p_organization_id uuid, p_colunas text[] DEFAULT NULL::text[], p_papel text DEFAULT NULL::text, p_pesquisa text DEFAULT NULL::text, p_ordem text DEFAULT 'recentes'::text, p_depois_de_chave text DEFAULT NULL::text, p_depois_de_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 25)
 RETURNS TABLE(coluna text, tipo text, cartao_id uuid, entity_id uuid, nome text, papel text, lead_id uuid, client_id uuid, assigned_to uuid, negocio_id uuid, titulo text, valor numeric, pronto_a_ganhar boolean, n_orcamentos integer, proposta_status text, parado_desde timestamp with time zone, proximo_prazo_em timestamp with time zone, por_ligar_contactos integer, por_ligar_visitas integer, por_ligar_visitas_feitas integer, por_ligar_levantamentos integer, chave_ordem text, ha_mais boolean, total_coluna bigint, valor_coluna numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
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
  v_uid      uuid := auth.uid();
  v_org      text := p_organization_id::text;
  v_kl       text[];
  v_kc       text[];
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

  -- Âmbito em vigor: leads.view para as entidades lead, clients.view para as
  -- clientes (as mesmas chaves das políticas antigas de leads e de clientes).
  v_kl := CASE WHEN public.has_anew_permission(v_uid, 'leads.view')
               THEN public.crm_scope_keys('leads.view') ELSE ARRAY[]::text[] END;
  v_kc := CASE WHEN public.has_anew_permission(v_uid, 'clients.view')
               THEN public.crm_scope_keys('clients.view') ELSE ARRAY[]::text[] END;
  IF cardinality(v_kl) + cardinality(v_kc) = 0 THEN
    RETURN;
  END IF;

  IF v_pesquisa IS NOT NULL THEN
    v_padrao := '%' || replace(replace(replace(v_pesquisa, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  v_quer_pes := v_cols && ARRAY['porContactar', 'contactado', 'visita'];
  v_quer_neg := v_cols && ARRAY['levantamento', 'orcamento', 'proposta', 'contrato'];

  RETURN QUERY
  WITH pes AS (
    -- um só scan das entidades vivas da organização que o utilizador vê
    SELECT e.id AS ent, e.display_name AS nome, (e.client_since IS NOT NULL) AS cliente,
           e.assigned_to AS assigned, GREATEST(e.created_at, e.last_activity_at) AS k,
           e.closure_result AS encerr
    FROM public.anew_entities e
    WHERE e.organization_id = p_organization_id
      AND e.deleted_at IS NULL
      AND (p_papel IS NULL OR (p_papel = 'cliente') = (e.client_since IS NOT NULL))
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_kl)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || e.created_by::text = ANY (v_kl))
               ELSE
                 (v_org || ':*' = ANY (v_kc)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || e.created_by::text = ANY (v_kc))
          END
      AND (v_padrao IS NULL OR e.display_name ILIKE v_padrao ESCAPE '\')
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
           'negocio'::text AS tp, n.id AS cid_cartao, p.ent, p.nome, p.cliente,
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
    -- pessoas sem negócio aberto e sem abordagem encerrada (como a versão
    -- anterior, agora pela entidade: anew_entities.closure_result)
    SELECT p.*, COALESCE(g.total, 0) AS total_neg, g.ultimo_em
    FROM pes p
    LEFT JOIN ng g ON g.ent = p.ent
    WHERE v_quer_pes AND COALESCE(g.abertos, 0) = 0 AND p.encerr IS NULL
  ), ct AS (
    -- chamadas depois do último negócio, sem negócio
    SELECT i.entity_id AS ent, count(*) AS n
    FROM public.entity_interactions i
    JOIN cand c ON c.ent = i.entity_id
    WHERE i.organization_id = p_organization_id AND i.interaction_type = 'call'
      AND i.negocio_id IS NULL
      AND i.interaction_at > COALESCE(c.ultimo_em, '-infinity'::timestamptz)
    GROUP BY i.entity_id
  ), vis AS (
    -- visitas da entidade (índice entity_id, organization_id) depois do
    -- último negócio, sem negócio
    SELECT s.entity_id AS ent,
           count(*) FILTER (WHERE s.status <> 'cancelled'::public.schedule_item_status) AS n,
           count(*) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS feitas,
           min(s.start_datetime) FILTER (WHERE s.status NOT IN ('cancelled'::public.schedule_item_status,
                                                                'completed'::public.schedule_item_status)) AS primeira
    FROM public.schedule_items s
    JOIN cand c ON c.ent = s.entity_id
    WHERE s.entity_id = ANY (ARRAY(SELECT y.ent FROM cand y))
      AND s.organization_id = p_organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL AND s.negocio_id IS NULL
      AND s.start_datetime > COALESCE(c.ultimo_em, '-infinity'::timestamptz)
    GROUP BY s.entity_id
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
           vis.primeira
    FROM cand c
    LEFT JOIN ct ON ct.ent = c.ent
    LEFT JOIN vis ON vis.ent = c.ent
    LEFT JOIN lvs ON lvs.ent = c.ent
  ), cart_pes AS (
    -- regra R-A pela entidade: a lead aparece se não tem negócios ou tem
    -- registos por ligar; o cliente só com negócios e registos por ligar
    SELECT CASE WHEN x.plv > 0 THEN 'visita' WHEN x.plc > 0 THEN 'contactado' ELSE 'porContactar' END AS col,
           'pessoa'::text AS tp, x.ent AS cid_cartao, x.ent, x.nome, x.cliente,
           x.assigned, NULL::uuid AS neg_id, NULL::text AS tit,
           NULL::boolean AS pronto, NULL::integer AS n_orc, NULL::text AS prop_status,
           x.primeira AS primeira_visita,
           x.plc, x.plv, x.plvf, x.pll,
           x.k,
           NULL::numeric AS val
    FROM pes_pl x
    WHERE (NOT x.cliente AND (x.total_neg = 0 OR x.plc + x.plv + x.pll > 0))
       OR (x.cliente AND x.total_neg > 0 AND x.plc + x.plv + x.pll > 0)
  ), cartoes AS (
    SELECT u.col, u.tp, u.cid_cartao, u.ent, u.nome, u.cliente, u.assigned, u.neg_id, u.tit,
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
    q.nome::text,
    (CASE WHEN q.cliente THEN 'cliente' ELSE 'lead' END)::text,
    NULL::uuid,
    NULL::uuid,
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

-- 3.6 Lista (Pessoas) pela entidade. Mesma assinatura e o mesmo formato de
--     resposta (37 colunas). As que eram da lead e ja nao existem vem a NULL:
--     lead_id, client_id, lead_status, qualificacao_tipo,
--     ultimo_contacto_lead_em, origem_detalhe. closure_result e o da
--     entidade (abordagem encerrada); a etapa continua a ser uma das 5 do
--     percurso e o encerramento vem a parte, como na versao em vigor; uma
--     lead encerrada nunca esta «atrasada» (coluna e filtro). origem = nome da origem da
--     entidade (lead_sources), campanha = a da entidade, formulario = o da
--     campanha ou, sem campanha, o da primeira submissao da pessoa.
CREATE OR REPLACE FUNCTION public.neg_resumo_pessoas(p_organization_id uuid, p_papel text DEFAULT NULL::text, p_etapa text DEFAULT NULL::text, p_pesquisa text DEFAULT NULL::text, p_ordem text DEFAULT 'recentes'::text, p_depois_de_chave text DEFAULT NULL::text, p_depois_de_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50, p_atribuido_a uuid DEFAULT NULL::uuid, p_formulario_id uuid DEFAULT NULL::uuid, p_ultimo_resultado text DEFAULT NULL::text, p_voltou boolean DEFAULT NULL::boolean, p_atrasada boolean DEFAULT NULL::boolean)
 RETURNS TABLE(entity_id uuid, nome text, papel text, lead_id uuid, client_id uuid, assigned_to uuid, lead_status text, closure_result text, etapa text, negocios_abertos integer, negocios_ganhos integer, negocios_perdidos integer, fase_mais_avancada text, pronto_a_ganhar boolean, valor_em_jogo numeric, ultimo_contacto_em timestamp with time zone, proxima_visita_em timestamp with time zone, ultima_visita_feita_em timestamp with time zone, ultimo_negocio_em timestamp with time zone, por_ligar_contactos integer, por_ligar_visitas integer, por_ligar_levantamentos integer, chave_ordem text, ha_mais boolean, criado_em timestamp with time zone, qualificacao_tipo text, ultima_atividade_em timestamp with time zone, ultimo_contacto_lead_em timestamp with time zone, voltou_a_contactar boolean, origem text, origem_detalhe text, campanha_id uuid, campanha text, formulario_id uuid, formulario text, ultimo_resultado text, atrasada boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_ordem    text := COALESCE(p_ordem, 'recentes');
  v_pesquisa text := NULLIF(btrim(p_pesquisa), '');
  v_padrao   text;
  v_depois   timestamptz;
  v_momento  text;
  v_ents     uuid[];
  v_pesq     uuid[];
  v_filtro   uuid[];
  v_filtrar  boolean;
  v_conjunto boolean;
  v_uid      uuid := auth.uid();
  v_org      text := p_organization_id::text;
  v_kl       text[];
  v_kc       text[];
  -- «hoje» da regra de atraso: o dia civil de Lisboa
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF p_organization_id IS NULL
     OR v_ordem NOT IN ('recentes', 'nome')
     OR (p_papel IS NOT NULL AND p_papel NOT IN ('lead', 'cliente'))
     OR (p_etapa IS NOT NULL AND p_etapa NOT IN ('nova', 'emContacto', 'visitaMarcada', 'qualificada', 'cliente'))
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois_de_chave IS NULL) <> (p_depois_de_id IS NULL)
     OR char_length(v_pesquisa) < 2 OR char_length(v_pesquisa) > 200
     OR (p_ultimo_resultado IS NOT NULL AND p_ultimo_resultado NOT IN
           ('atendeuInteressado', 'atendeuMaisTarde', 'naoAtendeu', 'semInteresse', 'numeroErrado', 'semContacto')) THEN
    RAISE EXCEPTION 'Valor inválido: organização, ordem, papel, etapa, limite (1 a 100), página, pesquisa (2 a 200 caracteres) ou resultado.'
      USING ERRCODE = 'NG009';
  END IF;

  -- D1: sem linha de configuração visível, lista vazia.
  SELECT c.momento_ganho INTO v_momento
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Âmbito em vigor: leads.view para as entidades lead, clients.view para as
  -- clientes (as mesmas chaves das políticas antigas de leads e de clientes).
  v_kl := CASE WHEN public.has_anew_permission(v_uid, 'leads.view')
               THEN public.crm_scope_keys('leads.view') ELSE ARRAY[]::text[] END;
  v_kc := CASE WHEN public.has_anew_permission(v_uid, 'clients.view')
               THEN public.crm_scope_keys('clients.view') ELSE ARRAY[]::text[] END;
  IF cardinality(v_kl) + cardinality(v_kc) = 0 THEN
    RETURN;
  END IF;

  IF v_pesquisa IS NOT NULL THEN
    v_padrao := '%' || replace(replace(replace(v_pesquisa, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- nome, email e telefone: uma vez, pela auxiliar
    v_pesq := ARRAY(SELECT x.entity_id FROM public.fn_neg_pesquisa_pessoas(p_organization_id, v_pesquisa) x);
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
      SELECT e.id
      FROM public.anew_entities e
      LEFT JOIN (
        SELECT DISTINCT n.entity_id AS ent
        FROM public.negocios n
        WHERE n.organization_id = p_organization_id AND n.estado = 'aberto' AND n.deleted_at IS NULL
      ) na ON na.ent = e.id
      LEFT JOIN (
        SELECT DISTINCT s.entity_id AS ent
        FROM public.schedule_items s
        WHERE s.organization_id = p_organization_id AND s.entity_id IS NOT NULL
          AND s.status <> 'cancelled'::public.schedule_item_status
          AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      ) vi ON vi.ent = e.id
      LEFT JOIN (
        SELECT DISTINCT i.entity_id AS ent
        FROM public.entity_interactions i
        WHERE i.organization_id = p_organization_id AND i.interaction_type = 'call'
      ) co ON co.ent = e.id
      WHERE e.organization_id = p_organization_id AND e.deleted_at IS NULL
        AND CASE
              WHEN e.client_since IS NOT NULL THEN 'cliente'
              WHEN na.ent IS NOT NULL THEN 'qualificada'
              WHEN vi.ent IS NOT NULL THEN 'visitaMarcada'
              WHEN co.ent IS NOT NULL THEN 'emContacto'
              ELSE 'nova'
            END = p_etapa);
  END IF;

  -- Filtros (responsável, formulário, último resultado, voltou, atrasada):
  -- um conjunto, calculado uma vez para a organização, com as MESMAS
  -- expressões das colunas devolvidas abaixo.
  v_filtrar := p_atribuido_a IS NOT NULL OR p_formulario_id IS NOT NULL OR p_ultimo_resultado IS NOT NULL
               OR p_voltou IS NOT NULL OR p_atrasada IS NOT NULL;
  IF v_filtrar THEN
    v_filtro := ARRAY(
      SELECT e.id
      FROM public.anew_entities e
      LEFT JOIN (
        -- chamadas: uma passagem agrupada pelas da organização
        SELECT i.entity_id AS ent, max(i.interaction_at) AS ultimo,
               (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
        FROM public.entity_interactions i
        WHERE (p_ultimo_resultado IS NOT NULL OR p_voltou IS NOT NULL)
          AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
        GROUP BY i.entity_id
      ) ct ON ct.ent = e.id
      LEFT JOIN (
        -- formulário da campanha da entidade
        SELECT ca.id AS camp, ca.form_id AS fid
        FROM public.campaigns ca
        WHERE p_formulario_id IS NOT NULL AND ca.form_id IS NOT NULL
      ) fc ON fc.camp = e.campaign_id
      LEFT JOIN (
        -- sem campanha: o formulário da primeira submissão da pessoa
        SELECT DISTINCT ON (fs.entity_id) fs.entity_id AS ent, fs.form_id AS fid
        FROM public.form_submissions fs
        WHERE p_formulario_id IS NOT NULL
          AND fs.organization_id = p_organization_id AND fs.form_id IS NOT NULL
          AND fs.deleted_at IS NULL
        ORDER BY fs.entity_id, fs.created_at, fs.id
      ) f1 ON f1.ent = e.id
      LEFT JOIN (
        -- a visita por fazer mais antiga ainda por ligar a um negócio, por
        -- pessoa, depois do último negócio (as mesmas de vs, abaixo)
        SELECT si.entity_id AS ent, min(si.start_datetime) AS por_fazer_desde
        FROM public.schedule_items si
        LEFT JOIN (
          SELECT n.entity_id AS ent, max(n.created_at) AS ultimo_em
          FROM public.negocios n
          WHERE p_atrasada IS NOT NULL AND n.organization_id = p_organization_id AND n.deleted_at IS NULL
          GROUP BY n.entity_id
        ) un ON un.ent = si.entity_id
        WHERE p_atrasada IS NOT NULL
          AND si.organization_id = p_organization_id AND si.entity_id IS NOT NULL
          AND si.time_off_type IS NULL AND si.vacation_id IS NULL
          AND si.negocio_id IS NULL
          AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
          AND si.start_datetime > COALESCE(un.ultimo_em, '-infinity'::timestamptz)
        GROUP BY si.entity_id
      ) vf ON vf.ent = e.id
      WHERE e.organization_id = p_organization_id AND e.deleted_at IS NULL
        AND (p_atribuido_a IS NULL OR e.assigned_to = p_atribuido_a)
        AND (p_formulario_id IS NULL OR COALESCE(fc.fid, f1.fid) = p_formulario_id)
        AND (p_ultimo_resultado IS NULL
             OR (CASE WHEN ct.ultimo IS NULL THEN 'semContacto' ELSE ct.resultado END) = p_ultimo_resultado)
        AND (p_voltou IS NULL
             OR (e.last_activity_at IS NOT NULL
                 AND (ct.ultimo IS NULL OR e.last_activity_at > ct.ultimo)) = p_voltou)
        AND (CASE WHEN p_atrasada IS NULL THEN true
                  ELSE COALESCE(CASE WHEN e.client_since IS NULL AND e.closure_result IS NULL THEN
                                  (LEAST(public.fn_neg_proximo_contacto(p_organization_id, e.id), vf.por_fazer_desde)
                                   AT TIME ZONE 'Europe/Lisbon')::date < v_hoje END, false) = p_atrasada
             END));
    v_ents := CASE WHEN p_etapa IS NULL THEN v_filtro
                   ELSE ARRAY(SELECT unnest(v_ents) INTERSECT SELECT unnest(v_filtro)) END;
  END IF;
  v_conjunto := p_etapa IS NOT NULL OR v_filtrar;

  RETURN QUERY
  WITH cand_r AS (
    -- recentes: pelo índice (organization_id, GREATEST(created_at,
    -- last_activity_at) DESC, id DESC), com LIMIT antes dos agregados
    SELECT e.id AS ent, GREATEST(e.created_at, e.last_activity_at) AS k, NULL::text AS nm
    FROM public.anew_entities e
    WHERE v_ordem = 'recentes'
      AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
      AND (p_papel IS NULL OR (p_papel = 'cliente') = (e.client_since IS NOT NULL))
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_kl)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || e.created_by::text = ANY (v_kl))
               ELSE
                 (v_org || ':*' = ANY (v_kc)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || e.created_by::text = ANY (v_kc))
          END
      AND (NOT v_conjunto OR e.id = ANY (v_ents))
      AND (v_padrao IS NULL OR e.id = ANY (v_pesq))
      AND (p_depois_de_id IS NULL
           OR (GREATEST(e.created_at, e.last_activity_at), e.id) < (v_depois, p_depois_de_id))
    ORDER BY GREATEST(e.created_at, e.last_activity_at) DESC, e.id DESC
    LIMIT p_limite + 1
  ), cand_n AS (
    -- nome: pelo índice (organization_id, COALESCE(lower(display_name), ''), id)
    SELECT e.id AS ent, NULL::timestamptz AS k, COALESCE(lower(e.display_name), '') AS nm
    FROM public.anew_entities e
    WHERE v_ordem = 'nome'
      AND e.organization_id = p_organization_id AND e.deleted_at IS NULL
      AND (p_papel IS NULL OR (p_papel = 'cliente') = (e.client_since IS NOT NULL))
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_kl)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || e.created_by::text = ANY (v_kl))
               ELSE
                 (v_org || ':*' = ANY (v_kc)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || e.created_by::text = ANY (v_kc))
          END
      AND (NOT v_conjunto OR e.id = ANY (v_ents))
      AND (v_padrao IS NULL OR e.id = ANY (v_pesq))
      AND (p_depois_de_id IS NULL
           OR (COALESCE(lower(e.display_name), ''), e.id) > (p_depois_de_chave, p_depois_de_id))
    ORDER BY COALESCE(lower(e.display_name), ''), e.id
    LIMIT p_limite + 1
  ), pagina AS (
    SELECT cd.ent, cd.k, cd.nm,
           row_number() OVER (ORDER BY
             CASE WHEN v_ordem = 'recentes' THEN cd.k END DESC,
             CASE WHEN v_ordem = 'recentes' THEN cd.ent END DESC,
             CASE WHEN v_ordem = 'nome' THEN cd.nm END ASC,
             CASE WHEN v_ordem = 'nome' THEN cd.ent END ASC) AS rn,
           count(*) OVER () AS lidas
    FROM (SELECT * FROM cand_r UNION ALL SELECT * FROM cand_n) cd
  )
  SELECT
    pg.ent::uuid,
    e2.display_name::text,
    (CASE WHEN e2.client_since IS NOT NULL THEN 'cliente' ELSE 'lead' END)::text,
    NULL::uuid,
    NULL::uuid,
    e2.assigned_to::uuid,
    NULL::text,
    -- a abordagem encerrada da entidade (semInteresse | obraInviavel), que a
    -- Lista mostra como estado à parte da etapa
    e2.closure_result::text,
    (CASE
       WHEN e2.client_since IS NOT NULL THEN 'cliente'
       WHEN COALESCE(ng.abertos, 0) > 0 THEN 'qualificada'
       WHEN COALESCE(vs.visitas, 0) > 0 THEN 'visitaMarcada'
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
    (pg.lidas > p_limite)::boolean,
    e2.created_at::timestamptz,
    NULL::text,
    e2.last_activity_at::timestamptz,
    NULL::timestamptz,
    (e2.last_activity_at IS NOT NULL
     AND (ct.ultimo IS NULL OR e2.last_activity_at > ct.ultimo))::boolean,
    og.onome::text,
    NULL::text,
    e2.campaign_id::uuid,
    cp.cnome::text,
    COALESCE(cp.fid, f1.fid)::uuid,
    (CASE WHEN cp.fid IS NOT NULL THEN cp.fnome ELSE f1.fnome END)::text,
    -- resultado da chamada mais recente (entity_interactions 'call'); nulo
    -- sem chamada (a UI diz «Sem contacto») ou com uma chamada sem resultado
    ct.resultado::text,
    -- atrasada: lead não encerrada cujo próximo contacto (a chamada agendada,
    -- fn_neg_proximo_contacto, ou a visita por fazer mais antiga ainda por
    -- ligar) é anterior a hoje em Lisboa. Cliente ou encerrada: nunca.
    COALESCE(CASE WHEN e2.client_since IS NULL AND e2.closure_result IS NULL THEN
               (LEAST(public.fn_neg_proximo_contacto(p_organization_id, pg.ent), vs.por_fazer_desde)
                AT TIME ZONE 'Europe/Lisbon')::date < v_hoje END, false)::boolean
  FROM pagina pg
  JOIN public.anew_entities e2 ON e2.id = pg.ent
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
                              AND i.interaction_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
    FROM public.entity_interactions i
    WHERE i.entity_id = pg.ent AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
  ) ct ON true
  LEFT JOIN LATERAL (
    -- visitas da entidade (índice entity_id, organization_id)
    SELECT min(si.start_datetime) FILTER (
             WHERE si.start_datetime >= now()
               AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(si.start_datetime) FILTER (WHERE si.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE si.status <> 'cancelled'::public.schedule_item_status) AS visitas,
           count(*) FILTER (WHERE si.negocio_id IS NULL
                              AND si.status <> 'cancelled'::public.schedule_item_status
                              AND si.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           min(si.start_datetime) FILTER (
             WHERE si.negocio_id IS NULL
               AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
               AND si.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_fazer_desde
    FROM public.schedule_items si
    WHERE si.entity_id = pg.ent
      AND si.organization_id = p_organization_id
      AND si.time_off_type IS NULL AND si.vacation_id IS NULL
  ) vs ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS por_ligar
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = pg.ent
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)
  ) lv ON true
  LEFT JOIN LATERAL (
    -- campanha da entidade e o seu formulário
    SELECT ca.name AS cnome, f.id AS fid, f.name AS fnome
    FROM public.campaigns ca
    LEFT JOIN public.forms f ON f.id = ca.form_id
    WHERE ca.id = e2.campaign_id
  ) cp ON true
  LEFT JOIN LATERAL (
    -- sem formulário de campanha: o da primeira submissão da pessoa
    SELECT f.id AS fid, f.name AS fnome
    FROM public.form_submissions fsb
    JOIN public.forms f ON f.id = fsb.form_id
    WHERE fsb.entity_id = pg.ent AND fsb.organization_id = p_organization_id
      AND fsb.deleted_at IS NULL
    ORDER BY fsb.created_at, fsb.id
    LIMIT 1
  ) f1 ON true
  LEFT JOIN LATERAL (
    SELECT ls.name AS onome
    FROM public.lead_sources ls
    WHERE ls.id = e2.origin_id
  ) og ON true
  WHERE pg.rn <= p_limite
  ORDER BY pg.rn;
END;
$function$;

-- ------------------------------------------------------------
-- 4. RGPD
-- ------------------------------------------------------------

-- 4.1 Pre-visualizacao: as mesmas contagens que o apagamento usa, agora com
--     negocios e levantamentos (FK RESTRICT para a entidade: com eles a
--     entidade nao se apaga, anonimiza-se). Mesma assinatura, seguranca,
--     search_path e EXECUTE (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.preview_entity_erasure(p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_leads            integer;
  v_contacts         integer;
  v_clients          integer;
  v_deals            integer;
  v_quotes           integer;
  v_proposals        integer;
  v_client_contracts integer;
  v_portal_users     integer;
  v_negocios         integer;
  v_levantamentos    integer;
  v_visitas          integer;
  v_total            integer;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'p_entity_id is required';
  END IF;

  IF NOT public.is_system_admin((SELECT auth.uid()))
     AND NOT public.can_see_entity(p_entity_id, (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Entity not visible to caller' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_leads            FROM public.anew_leads            WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_contacts         FROM public.anew_contacts         WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_clients          FROM public.anew_clients          WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_deals            FROM public.deals                 WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_quotes           FROM public.quotes                WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_proposals        FROM public.proposals             WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_client_contracts FROM public.client_contracts      WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_portal_users     FROM public.client_portal_users   WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_negocios         FROM public.negocios              WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_levantamentos    FROM public.levantamentos         WHERE entity_id = p_entity_id;
  -- 20261228200000: as visitas da entidade (não bloqueiam: limpam-se nos dois
  -- modos, ver execute_entity_erasure).
  SELECT count(*) INTO v_visitas          FROM public.schedule_items        WHERE entity_id = p_entity_id;

  v_total := v_leads + v_contacts + v_clients + v_deals + v_quotes
           + v_proposals + v_client_contracts + v_portal_users
           + v_negocios + v_levantamentos;

  RETURN jsonb_build_object(
    'entity_id',           p_entity_id,
    'leads',               v_leads,
    'contacts',            v_contacts,
    'clients',             v_clients,
    'deals',               v_deals,
    'quotes',              v_quotes,
    'proposals',           v_proposals,
    'client_contracts',    v_client_contracts,
    'client_portal_users', v_portal_users,
    'negocios',            v_negocios,
    'levantamentos',       v_levantamentos,
    'schedule_items',      v_visitas,
    'blocking_total',      v_total,
    'mode',                CASE WHEN v_total = 0 THEN 'delete' ELSE 'anonymize' END
  );
END;
$function$;

-- 4.2 Apagamento. Mesma assinatura, dono, SECURITY DEFINER, search_path e
--     EXECUTE (CREATE OR REPLACE). Diferencas para a versao em vigor:
--     - bloqueia tambem por negocios e levantamentos (como a pre-visualizacao);
--     - auditoria generica desligada enquanto apaga (app.audit_bypass local,
--       reposto no fim): apagar nao volta a escrever os dados no log;
--     - limpa as colunas novas de anew_entities nos dois modos, e as
--       respostas das submissoes (field_values) da entidade; em apagar, apaga
--       as submissoes da entidade (a FK nao tem ON DELETE);
--     - ofusca as chaves de dados pessoais do entity_audit_log da entidade e
--       das linhas das moradas e dos dados fiscais dela (que o log guarda
--       pelo id proprio). So esta funcao o faz: entity_audit_log continua
--       sem UPDATE para authenticated (politica restritiva intacta);
--     - nos dois modos ofusca as mesmas chaves em old_values/new_values de
--       schedule_item_events das visitas da entidade (o trigger
--       log_schedule_item_event guarda a visita inteira no evento 'created'
--       e nao respeita app.audit_bypass).
CREATE OR REPLACE FUNCTION public.execute_entity_erasure(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_apagado                constant jsonb := to_jsonb('[apagado RGPD]'::text);
  -- chaves de dados pessoais ofuscadas no log (so estas; o resto fica)
  k_chaves                 constant text[] := ARRAY[
    'display_name', 'first_name', 'last_name', 'search_text',
    'email', 'phone', 'phone_number', 'preferred_contact', 'preferred_time',
    'fiscal_name', 'billing_email', 'nif', 'nif_encrypted', 'nif_hash', 'nif_last3',
    'billing_nif_encrypted', 'billing_nif_last3', 'legal_name', 'commercial_name',
    'referred_by', 'gdpr_consented_at', 'notes', 'notas', 'extra', 'metadata',
    'street', 'number', 'floor', 'unit', 'postal_code', 'city', 'district', 'address_key',
    'morada_rua', 'morada_codigo_postal', 'morada_localidade', 'morada_andar',
    'field_values', 'title', 'description', 'location', 'location_lat', 'location_lng'];
  v_request               public.data_erasure_requests%ROWTYPE;
  v_blocking_total         integer;
  v_preview                jsonb;
  v_mode                   text;
  v_address_ids            uuid[];
  v_fiscal_ids             uuid[];
  v_visit_ids              uuid[];
  v_visits_scrubbed        integer := 0;
  v_visit_events_scrubbed  integer := 0;
  v_bypass_antes           text;
  v_emails_deleted         integer := 0;
  v_phones_deleted         integer := 0;
  v_addr_links_deleted     integer := 0;
  v_addr_rows_deleted      integer := 0;
  v_fiscal_links_deleted   integer := 0;
  v_fiscal_rows_deleted    integer := 0;
  v_history_deleted        integer := 0;
  v_relationships_deleted  integer := 0;
  v_roles_deleted          integer := 0;
  v_org_links_deleted      integer := 0;
  v_submissions_scrubbed   integer := 0;
  v_submissions_deleted    integer := 0;
  v_audit_rows_scrubbed    integer := 0;
  v_entity_deleted         boolean := false;
BEGIN
  SELECT * INTO v_request
  FROM public.data_erasure_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Erasure request % not found', p_request_id;
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Erasure request % is not in approved state (current: %)', p_request_id, v_request.status;
  END IF;

  IF v_request.entity_id IS NULL THEN
    RAISE EXCEPTION 'Erasure request % has no entity to act on', p_request_id;
  END IF;

  -- Apagar nao volta a gravar no log os dados que esta a apagar.
  v_bypass_antes := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  SELECT
    (SELECT count(*) FROM public.anew_leads          WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.anew_contacts       WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.anew_clients        WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.deals               WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.quotes              WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.proposals           WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.client_contracts    WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.client_portal_users WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.negocios            WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.levantamentos       WHERE entity_id = v_request.entity_id)
  INTO v_blocking_total;

  v_preview := jsonb_build_object('blocking_total', v_blocking_total);
  v_mode := CASE WHEN v_blocking_total = 0 THEN 'delete' ELSE 'anonymize' END;

  -- ── Contact-channel satellites: always scrubbed regardless of mode ───────
  WITH deleted AS (
    DELETE FROM public.anew_entity_emails WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_emails_deleted FROM deleted;

  WITH deleted AS (
    DELETE FROM public.anew_entity_phones WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_phones_deleted FROM deleted;

  SELECT array_agg(address_id) INTO v_address_ids
  FROM public.anew_entity_addresses WHERE entity_id = v_request.entity_id;

  WITH deleted AS (
    DELETE FROM public.anew_entity_addresses WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_addr_links_deleted FROM deleted;

  IF v_address_ids IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.anew_addresses a
      WHERE a.id = ANY (v_address_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.address_id = a.id
        )
      RETURNING 1
    ) SELECT count(*) INTO v_addr_rows_deleted FROM deleted;
  END IF;

  SELECT array_agg(fiscal_entity_id) INTO v_fiscal_ids
  FROM public.anew_entity_fiscal_entities WHERE entity_id = v_request.entity_id;

  WITH deleted AS (
    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_fiscal_links_deleted FROM deleted;

  IF v_fiscal_ids IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.fiscal_entities fe
      WHERE fe.id = ANY (v_fiscal_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.anew_entity_fiscal_entities efe WHERE efe.fiscal_entity_id = fe.id
        )
      RETURNING 1
    ) SELECT count(*) INTO v_fiscal_rows_deleted FROM deleted;
  END IF;

  -- ── Colunas de contacto, fiscais e livres da entidade: nos dois modos ────
  UPDATE public.anew_entities
  SET email               = NULL,
      phone               = NULL,
      preferred_contact   = NULL,
      preferred_time      = NULL,
      fiscal_name         = NULL,
      billing_email       = NULL,
      nif_encrypted       = NULL,
      nif_hash            = NULL,
      nif_last3           = NULL,
      billing_nif_encrypted = NULL,
      billing_nif_last3   = NULL,
      referred_by         = NULL,
      gdpr_consented_at   = NULL,
      notes               = NULL,
      extra               = '{}'::jsonb,
      assigned_to         = NULL,
      updated_at          = now()
  WHERE id = v_request.entity_id;

  -- ── Respostas dos formularios da entidade ────────────────────────────────
  WITH scrubbed AS (
    UPDATE public.form_submissions
    SET field_values = '{}'::jsonb
    WHERE entity_id = v_request.entity_id
      AND field_values IS DISTINCT FROM '{}'::jsonb
    RETURNING 1
  ) SELECT count(*) INTO v_submissions_scrubbed FROM scrubbed;

  -- ── Visitas da entidade: nos dois modos ──────────────────────────────────
  --    20261228200000: a visita liga à entidade (FK SET NULL). Antes de
  --    apagar a entidade guardam-se os ids (para o log, que as audita pelo id
  --    da visita) e limpam-se os dados pessoais: título, notas, local,
  --    coordenadas e metadata (inclui metadata.pessoas). A marcação fica na
  --    agenda (recurso, horas, estado), sem a pessoa.
  SELECT array_agg(s.id) INTO v_visit_ids
  FROM public.schedule_items s
  WHERE s.entity_id = v_request.entity_id;

  IF v_visit_ids IS NOT NULL THEN
    WITH scrubbed AS (
      UPDATE public.schedule_items s
      SET title        = 'Visita',
          description  = NULL,
          location     = NULL,
          location_lat = NULL,
          location_lng = NULL,
          notes        = NULL,
          metadata     = '{}'::jsonb,
          updated_at   = now()
      WHERE s.id = ANY (v_visit_ids)
      RETURNING 1
    ) SELECT count(*) INTO v_visits_scrubbed FROM scrubbed;

    -- ── Eventos das visitas (schedule_item_events): nos dois modos ─────────
    --    O trigger log_schedule_item_event grava a visita inteira no evento
    --    'created' (new_values = to_jsonb(NEW): título, descrição, local,
    --    notas, metadata...) e não respeita app.audit_bypass. Ofuscam-se só
    --    as chaves de dados pessoais de old_values e new_values das linhas
    --    das visitas da entidade (item_id); o resto do evento fica. Corre
    --    depois da limpeza acima (que só gera eventos de estado ou de horas,
    --    sem dados pessoais, e aqui não muda nem um nem outro).
    WITH scrubbed AS (
      UPDATE public.schedule_item_events ev
      SET old_values = CASE
            WHEN jsonb_typeof(ev.old_values) = 'object' THEN COALESCE(
              (SELECT jsonb_object_agg(x.k, CASE WHEN x.k = ANY (k_chaves) AND x.v <> 'null'::jsonb
                                                 THEN k_apagado ELSE x.v END)
               FROM jsonb_each(ev.old_values) AS x(k, v)), '{}'::jsonb)
            ELSE ev.old_values END,
          new_values = CASE
            WHEN jsonb_typeof(ev.new_values) = 'object' THEN COALESCE(
              (SELECT jsonb_object_agg(x.k, CASE WHEN x.k = ANY (k_chaves) AND x.v <> 'null'::jsonb
                                                 THEN k_apagado ELSE x.v END)
               FROM jsonb_each(ev.new_values) AS x(k, v)), '{}'::jsonb)
            ELSE ev.new_values END
      WHERE ev.item_id = ANY (v_visit_ids)
        AND ((jsonb_typeof(ev.old_values) = 'object' AND ev.old_values ?| k_chaves)
          OR (jsonb_typeof(ev.new_values) = 'object' AND ev.new_values ?| k_chaves))
      RETURNING 1
    ) SELECT count(*) INTO v_visit_events_scrubbed FROM scrubbed;
  END IF;

  IF v_mode = 'delete' THEN
    -- No lead/contact/client/deal/quote/proposal/contract/portal-user/
    -- negocio/levantamento row references this entity — safe to remove it.

    WITH deleted AS (
      DELETE FROM public.anew_entity_history WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_history_deleted FROM deleted;

    WITH deleted AS (
      DELETE FROM public.anew_entity_relationships
      WHERE from_entity_id = v_request.entity_id OR to_entity_id = v_request.entity_id
      RETURNING 1
    ) SELECT count(*) INTO v_relationships_deleted FROM deleted;

    WITH deleted AS (
      DELETE FROM public.anew_entity_roles WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_roles_deleted FROM deleted;

    WITH deleted AS (
      DELETE FROM public.anew_entity_org_links WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_org_links_deleted FROM deleted;

    -- form_submissions.entity_id nao tem ON DELETE: as submissoes saem antes.
    WITH deleted AS (
      DELETE FROM public.form_submissions WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_submissions_deleted FROM deleted;

    -- contact_tags and entity_interactions cascade automatically (ON DELETE CASCADE);
    -- schedule_items.entity_id e scheduling_invites.entity_id ficam vazios (SET NULL).
    DELETE FROM public.anew_entities WHERE id = v_request.entity_id;
    v_entity_deleted := true;

  ELSE
    -- At least one fiscal/contractual record depends on this entity — the
    -- entity row itself, and every proposal/quote/deal/contract/lead/contact/
    -- client/negocio row pointing at it, are left in place. Only the
    -- identification fields are scrubbed (the contact/fiscal/free columns
    -- were already cleared above).
    UPDATE public.anew_entities
    SET display_name = 'Titular de Dados Anonimizado',
        first_name   = NULL,
        last_name    = NULL,
        status       = 'anonymized',
        updated_at   = now()
    WHERE id = v_request.entity_id;
  END IF;

  -- ── Log de auditoria: ofuscar so as chaves de dados pessoais ─────────────
  --    Linhas da entidade (entity_id) e das moradas e dados fiscais dela, que
  --    o log guarda pelo id proprio (record_id/entity_id = id da morada ou do
  --    registo fiscal).
  WITH alvo AS (
    SELECT a.id
    FROM public.entity_audit_log a
    WHERE (a.entity_id = v_request.entity_id
           OR a.record_id = ANY (COALESCE(v_address_ids, ARRAY[]::uuid[]) || COALESCE(v_fiscal_ids, ARRAY[]::uuid[])
                                 || COALESCE(v_visit_ids, ARRAY[]::uuid[]))
           OR a.entity_id = ANY (COALESCE(v_address_ids, ARRAY[]::uuid[]) || COALESCE(v_fiscal_ids, ARRAY[]::uuid[])
                                 || COALESCE(v_visit_ids, ARRAY[]::uuid[])))
      AND ((jsonb_typeof(a.full_record) = 'object' AND a.full_record ?| k_chaves)
        OR (jsonb_typeof(a.changed_fields) = 'object' AND a.changed_fields ?| k_chaves))
  ), scrubbed AS (
    UPDATE public.entity_audit_log a
    SET full_record = CASE
          WHEN jsonb_typeof(a.full_record) = 'object' THEN COALESCE(
            (SELECT jsonb_object_agg(x.k, CASE WHEN x.k = ANY (k_chaves) AND x.v <> 'null'::jsonb
                                               THEN k_apagado ELSE x.v END)
             FROM jsonb_each(a.full_record) AS x(k, v)), '{}'::jsonb)
          ELSE a.full_record END,
        changed_fields = CASE
          WHEN jsonb_typeof(a.changed_fields) = 'object' THEN COALESCE(
            (SELECT jsonb_object_agg(x.k, CASE WHEN x.k = ANY (k_chaves)
                                               THEN jsonb_build_object('old', k_apagado, 'new', k_apagado)
                                               ELSE x.v END)
             FROM jsonb_each(a.changed_fields) AS x(k, v)), '{}'::jsonb)
          ELSE a.changed_fields END
    FROM alvo
    WHERE a.id = alvo.id
    RETURNING 1
  ) SELECT count(*) INTO v_audit_rows_scrubbed FROM scrubbed;

  PERFORM set_config('app.audit_bypass', COALESCE(v_bypass_antes, ''), true);

  UPDATE public.data_erasure_requests
  SET status        = 'completed',
      decision_mode = CASE WHEN v_mode = 'delete' THEN 'deleted' ELSE 'anonymized' END,
      executed_at   = now(),
      result        = jsonb_build_object(
        'preview',                v_preview,
        'emails_deleted',         v_emails_deleted,
        'phones_deleted',         v_phones_deleted,
        'address_links_deleted',  v_addr_links_deleted,
        'address_rows_deleted',   v_addr_rows_deleted,
        'fiscal_links_deleted',   v_fiscal_links_deleted,
        'fiscal_rows_deleted',    v_fiscal_rows_deleted,
        'history_deleted',        v_history_deleted,
        'relationships_deleted',  v_relationships_deleted,
        'roles_deleted',          v_roles_deleted,
        'org_links_deleted',      v_org_links_deleted,
        'submissions_scrubbed',   v_submissions_scrubbed,
        'submissions_deleted',    v_submissions_deleted,
        'visits_scrubbed',        v_visits_scrubbed,
        'visit_events_scrubbed',  v_visit_events_scrubbed,
        'audit_rows_scrubbed',    v_audit_rows_scrubbed,
        'entity_deleted',         v_entity_deleted
      ),
      error_message = NULL
  WHERE id = p_request_id;

  RETURN (SELECT result FROM public.data_erasure_requests WHERE id = p_request_id);

EXCEPTION WHEN OTHERS THEN
  -- o bloco foi desfeito; repor a auditoria antes de registar a falha
  PERFORM set_config('app.audit_bypass', COALESCE(v_bypass_antes, ''), true);
  UPDATE public.data_erasure_requests
  SET status        = 'failed',
      executed_at   = now(),
      error_message = SQLERRM
  WHERE id = p_request_id;
  RAISE;
END;
$function$;

-- ------------------------------------------------------------
-- 5. CONFERIR
-- ------------------------------------------------------------
DO $$
DECLARE
  v_n        int;
  v_missing  text;
  v_def      text;
  v_col      text;
  v_old      text[] := ARRAY['id','type','display_name','status','created_by','created_at',
    'updated_at','first_name','last_name','search_text'];
  v_auth_new text[] := ARRAY['organization_id','client_since','locale','deleted_at',
    'assigned_to','origin_id','campaign_id','last_activity_at','closure_result',
    'email','phone','preferred_contact','preferred_time',
    'fiscal_name','billing_email','nif_last3','billing_nif_last3','referred_by',
    'gdpr_consented_at','notes','extra','deleted_by','legacy_lead_id','legacy_client_id'];
  -- colunas de ambito e de estado: sem UPDATE direto para authenticated (1.6.7)
  v_sem_upd  text[] := ARRAY['assigned_to','created_by','client_since','deleted_at','deleted_by',
    'organization_id','origin_id','campaign_id','last_activity_at','legacy_lead_id',
    'legacy_client_id','closure_result'];
  -- retidas: nenhuma (quem ve a entidade ve todas as colunas menos as secretas)
  v_held     text[] := '{}'::text[];
  v_secret   text[] := ARRAY['nif_encrypted','nif_hash','billing_nif_encrypted'];
  v_limpar   text[] := ARRAY['email','phone','preferred_contact','preferred_time','fiscal_name',
    'billing_email','nif_encrypted','nif_hash','nif_last3','billing_nif_encrypted',
    'billing_nif_last3','referred_by','gdpr_consented_at','notes','extra','assigned_to'];
  r          record;
  v_sd       boolean;
  v_na       int;
  v_cfg      text;
  v_own      text;
  v_quem     text;
BEGIN
  -- 5.1 Visitas e convites
  SELECT string_agg(c.table_name::text || '.' || c.column_name::text, ', ') INTO v_missing
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND ((c.table_name = 'schedule_items' AND c.column_name IN ('lead_id', 'client_id'))
      OR (c.table_name = 'scheduling_invites' AND c.column_name IN ('lead_id', 'client_id')));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: colunas que deviam ter saido: %', v_missing;
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'entity_id' AND c.data_type = 'uuid'
    AND c.is_nullable = 'YES' AND c.table_name IN ('schedule_items', 'scheduling_invites');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: schedule_items.entity_id e scheduling_invites.entity_id (uuid, anulaveis): encontradas %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.conname IN ('schedule_items_entity_id_fkey', 'scheduling_invites_entity_id_fkey')
    AND c.conrelid IN ('public.schedule_items'::regclass, 'public.scheduling_invites'::regclass)
    AND c.confrelid = 'public.anew_entities'::regclass
    AND c.confdeltype::text = 'n'
    AND cardinality(c.conkey) = 2
    AND cardinality(c.confdelsetcols) = 1;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: FKs (entity_id, organization_id) -> anew_entities com SET NULL (entity_id): encontradas %', v_n;
  END IF;

  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(ARRAY['idx_schedule_items_entity', 'idx_scheduling_invites_entity',
                    'idx_form_submissions_origin_id', 'idx_form_submissions_channel_id',
                    'idx_form_submissions_negocio_id', 'idx_anew_entities_org_recentes',
                    'idx_anew_entities_org_nome']) AS x
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes i WHERE i.schemaname = 'public' AND i.indexname = x);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: faltam indices: %', v_missing;
  END IF;

  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(ARRAY['idx_schedule_items_lead', 'idx_schedule_items_client',
                    'idx_scheduling_invites_lead']) AS x
  WHERE EXISTS (SELECT 1 FROM pg_indexes i WHERE i.schemaname = 'public' AND i.indexname = x);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: indices que deviam ter saido: %', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.schedule_items'::regclass
             AND t.tgname = 'trg_schedule_items_sync_lead_contact')
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'fn_schedule_items_sync_lead_contact') THEN
    RAISE EXCEPTION 'CONFERIR: o trigger lead_id <-> contact_id devia ter saido';
  END IF;

  -- nenhuma funcao le ainda a lead/cliente de uma visita ou convite
  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~* '(schedule_items|scheduling_invites)'
    AND p.prosrc ~* '\m(s|si|x|v_vis|v_visita|v_item|v_before|new|old)\.(lead_id|client_id)\M';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funcoes ainda leem lead_id/client_id de visitas ou convites: %', v_missing;
  END IF;

  -- 5.2 Submissoes
  SELECT string_agg(x.c, ', ') INTO v_missing
  FROM (VALUES ('origin_id', 'uuid', 'YES'), ('origin_recognized', 'boolean', 'YES'),
               ('channel_id', 'uuid', 'YES'), ('negocio_id', 'uuid', 'YES'),
               ('campaign_via', 'text', 'YES'), ('needs_manual_scheduling', 'boolean', 'NO'),
               ('form_id', 'uuid', 'YES'), ('campaign_id', 'uuid', 'YES'),
               ('target_type', 'text', 'YES'), ('target_id', 'uuid', 'YES'),
               ('entity_id', 'uuid', 'NO')) AS x(c, t, nul)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'form_submissions'
      AND c.column_name::text = x.c AND c.data_type::text = x.t AND c.is_nullable::text = x.nul);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: colunas de form_submissions com tipo ou obrigatoriedade errados: %', v_missing;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_constraint c
  WHERE c.conrelid = 'public.form_submissions'::regclass
    AND ((c.conname IN ('form_submissions_origin_id_fkey', 'form_submissions_channel_id_fkey',
                        'form_submissions_negocio_id_fkey') AND c.contype = 'f' AND c.confdeltype::text = 'n')
      OR (c.conname IN ('form_submissions_campaign_via_check', 'form_submissions_target_type_check')
          AND c.contype = 'c'));
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'CONFERIR: esperadas 3 FKs SET NULL e 2 CHECK em form_submissions, encontradas %', v_n;
  END IF;

  SELECT pg_get_expr(po.polqual, po.polrelid) INTO v_def
  FROM pg_policy po
  WHERE po.polrelid = 'public.form_submissions'::regclass AND po.polname = 'form_submissions_select_org';
  IF v_def IS NULL OR v_def ~* 'anew_leads|anew_clients' OR v_def !~* 'anew_entities' THEN
    RAISE EXCEPTION 'CONFERIR: form_submissions_select_org devia decidir pela entidade';
  END IF;

  -- 5.3 Uma so assinatura, a seguranca, o search_path e o EXECUTE esperados
  FOR r IN
    SELECT * FROM (VALUES
      ('fn_levantamentos_validar_ligacoes', true,  5,  'service_role'),
      ('fn_neg_ficha_seccao',               false, 5,  'authenticated'),
      ('fn_neg_pode_mudar_dono_lead',       true,  1,  'authenticated'),
      ('fn_neg_visita_editavel',            false, 2,  'authenticated'),
      ('fn_owner_sync_entity_from_visit',   true,  3,  'service_role'),
      ('fn_owner_sync_future_visits',       true,  3,  'service_role'),
      ('neg_alterar_visita',                false, 10, 'authenticated'),
      ('neg_ficha_pessoa',                  false, 5,  'authenticated'),
      ('neg_ligar_registo',                 false, 3,  'authenticated,service_role'),
      ('neg_resultado_visita',              false, 3,  'authenticated,service_role'),
      ('rpc_create_schedule_item',          true,  27, 'authenticated,service_role'),
      ('rpc_update_schedule_item',          true,  43, 'authenticated,service_role'),
      ('upsert_form_submission',            true,  18, 'service_role'),
      ('check_form_submissions_target',     false, 0,  'authenticated,service_role'),
      ('fn_neg_pesquisa_pessoas',           true,  2,  'authenticated'),
      ('neg_resumo_quadro',                 false, 8,  'authenticated'),
      ('neg_resumo_pessoas',                false, 13, 'authenticated'),
      ('preview_entity_erasure',            true,  1,  'authenticated,service_role'),
      ('execute_entity_erasure',            true,  1,  'service_role'),
      ('fn_generic_entity_audit',           true,  0,  'authenticated,service_role'),
      ('fn_form_resolver_captacao',         true,  3,  'service_role'),
      ('fn_schedule_items_resolver_entidade', true, 4, ''),
      ('fn_neg_pessoa_no_ambito',           true,  3,  'authenticated,service_role'),
      ('fn_neg_exigir_pessoa',              false, 2,  'authenticated,service_role'),
      ('fn_neg_mudar_abordagem',            true,  6,  'authenticated,service_role'),
      ('neg_guardar_visita',                true,  14, 'authenticated'),
      ('neg_criar_negocio',                 false, 11, 'authenticated'),
      ('neg_guardar_identidade_pessoa',     true,  6,  'authenticated'),
      ('neg_substituir_contacto',           true,  4,  'authenticated'),
      ('neg_atribuir_pessoa',               true,  3,  'authenticated'),
      ('neg_apagar_pessoa',                 true,  3,  'authenticated'),
      ('fn_neg_converter_pessoa',           true,  3,  ''),
      ('fn_neg_tornar_cliente',             true,  1,  'authenticated,service_role'),
      ('neg_ganhar_negocio',                false, 3,  'authenticated,service_role'),
      ('neg_reavaliar_negocio',             true,  1,  'authenticated'),
      ('neg_classificar_lead',              false, 3,  'authenticated'),
      ('neg_criar_lead',                    false, 5,  'authenticated'),
      ('fn_neg_tem_lead_aberta',            true,  2,  'authenticated'),
      ('fn_neg_filtro_pessoas',             true,  5,  'authenticated'),
      ('neg_cancelar_visita',               false, 1,  'authenticated'),
      ('neg_procurar_duplicados',           true,  5,  'authenticated'),
      ('can_see_entity',                    true,  2,  'authenticated,service_role'),
      ('is_entity_contact_in_owner_scope',  true,  3,  'authenticated,service_role'),
      ('is_entity_in_user_scope',           true,  2,  'PUBLIC,anon,authenticated,service_role')
    ) AS t(nome, definer, nargs, quem)
  LOOP
    SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'CONFERIR: % tem % assinaturas (esperada 1)', r.nome, v_n;
    END IF;

    SELECT p.prosecdef, p.pronargs::int, COALESCE(array_to_string(p.proconfig, ','), ''),
           pg_get_userbyid(p.proowner)::text,
           COALESCE((SELECT string_agg(g.quem, ',' ORDER BY g.quem)
                     FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                       ELSE pg_get_userbyid(a.grantee)::text END AS quem
                           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                           WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner) g), '')
      INTO v_sd, v_na, v_cfg, v_own, v_quem
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.nome;

    IF v_sd IS DISTINCT FROM r.definer OR v_na <> r.nargs OR v_own <> 'postgres'
       OR position('search_path=' IN v_cfg) = 0 OR v_quem <> r.quem THEN
      RAISE EXCEPTION 'CONFERIR: % difere do esperado (definer %, args %, dono %, config [%], EXECUTE [%]; esperado definer %, args %, EXECUTE [%])',
        r.nome, v_sd, v_na, v_own, v_cfg, v_quem, r.definer, r.nargs, r.quem;
    END IF;
  END LOOP;

  -- 5.4 Lista e quadro: so a entidade (nem anew_leads nem anew_clients)
  SELECT string_agg(p.proname::text, ', ') INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('neg_resumo_quadro', 'neg_resumo_pessoas', 'fn_neg_pesquisa_pessoas')
    AND (p.prosrc ~* 'anew_leads|anew_clients' OR p.prosrc !~* 'anew_entities');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: ainda leem leads/clientes em vez da entidade: %', v_missing;
  END IF;

  -- 5.4b A pessoa e a entidade: a guarda e as acoes da ficha ja nao exigem
  --      lead/cliente nem a ligacao antiga (anew_entity_org_links).
  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_neg_exigir_pessoa', 'fn_neg_pessoa_no_ambito', 'fn_neg_ficha_seccao',
                      'neg_ficha_pessoa', 'neg_guardar_visita', 'fn_neg_mudar_abordagem',
                      'neg_criar_negocio', 'neg_resultado_visita', 'neg_atribuir_pessoa',
                      'neg_apagar_pessoa', 'neg_ganhar_negocio', 'fn_neg_converter_pessoa',
                      'fn_neg_tornar_cliente', 'neg_reavaliar_negocio', 'neg_classificar_lead',
                      'neg_criar_lead', 'neg_procurar_duplicados', 'fn_neg_filtro_pessoas',
                      'fn_neg_tem_lead_aberta', 'neg_cancelar_visita', 'fn_neg_visita_editavel',
                      'neg_alterar_visita', 'neg_ligar_registo', 'fn_neg_pode_mudar_dono_lead')
    AND p.prosrc ~* 'anew_leads|anew_clients|anew_entity_org_links|fn_neg_escolher_lead|rpc_create_lead_manual|rpc_convert_lead_to_client|qualification_type';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: ainda exigem lead, cliente ou ligacao antiga: %', v_missing;
  END IF;

  -- 5.4c As funcoes de ambito das politicas reconhecem a entidade pela sua
  --      organizacao (1.6.2b): search_path so 'public' como em vigor, o ramo
  --      novo presente, e as 28 politicas que as chamam continuam a existir e
  --      a chama-las.
  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('can_see_entity', 'is_entity_in_user_scope', 'is_entity_contact_in_owner_scope')
    AND (COALESCE(array_to_string(p.proconfig, ','), '') <> 'search_path=public'
         OR p.provolatile::text <> 's'
         OR p.prosrc !~ 'e\.organization_id = ANY'
         OR (p.proname <> 'is_entity_contact_in_owner_scope'
             AND (p.prosrc !~ '= auth\.uid\(\) AND EXISTS'
                  OR p.prosrc !~ 'fn_neg_pessoa_no_ambito\(e\.organization_id, e\.id, ''view''\)'))
         OR (p.proname = 'is_entity_contact_in_owner_scope'
             AND p.prosrc !~ 'e\.deleted_at IS NULL'));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funcoes de ambito sem o ramo da entidade pela organizacao: %', v_missing;
  END IF;

  SELECT string_agg(x.t || '.' || x.pol, ', ') INTO v_missing
  FROM (VALUES
      ('anew_addresses', 'authenticated_delete_anew_addresses', 'is_entity_contact_in_owner_scope'),
      ('anew_addresses', 'authenticated_select_anew_addresses', 'is_entity_contact_in_owner_scope'),
      ('anew_addresses', 'authenticated_update_anew_addresses', 'is_entity_contact_in_owner_scope'),
      ('anew_entities', 'authenticated_delete_anew_entities', 'is_entity_in_user_scope'),
      ('anew_entities', 'authenticated_select_anew_entities', 'can_see_entity'),
      ('anew_entities', 'authenticated_update_anew_entities', 'is_entity_in_user_scope'),
      ('anew_entity_addresses', 'authenticated_delete_anew_entity_addresses', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_addresses', 'authenticated_insert_anew_entity_addresses', 'is_entity_in_user_scope'),
      ('anew_entity_addresses', 'authenticated_select_anew_entity_addresses', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_addresses', 'authenticated_update_anew_entity_addresses', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_emails', 'authenticated_delete_anew_entity_emails', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_emails', 'authenticated_insert_anew_entity_emails', 'is_entity_in_user_scope'),
      ('anew_entity_emails', 'authenticated_select_anew_entity_emails', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_emails', 'authenticated_update_anew_entity_emails', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_fiscal_entities', 'authenticated_delete_anew_entity_fiscal_entities', 'is_entity_in_user_scope'),
      ('anew_entity_fiscal_entities', 'authenticated_insert_anew_entity_fiscal_entities', 'is_entity_in_user_scope'),
      ('anew_entity_fiscal_entities', 'authenticated_select_anew_entity_fiscal_entities', 'is_entity_in_user_scope'),
      ('anew_entity_fiscal_entities', 'authenticated_update_anew_entity_fiscal_entities', 'is_entity_in_user_scope'),
      ('anew_entity_history', 'authenticated_delete_anew_entity_history', 'is_entity_in_user_scope'),
      ('anew_entity_history', 'authenticated_insert_anew_entity_history', 'is_entity_in_user_scope'),
      ('anew_entity_history', 'authenticated_select_anew_entity_history', 'is_entity_in_user_scope'),
      ('anew_entity_history', 'authenticated_update_anew_entity_history', 'is_entity_in_user_scope'),
      ('anew_entity_phones', 'authenticated_delete_anew_entity_phones', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_phones', 'authenticated_insert_anew_entity_phones', 'is_entity_in_user_scope'),
      ('anew_entity_phones', 'authenticated_select_anew_entity_phones', 'is_entity_contact_in_owner_scope'),
      ('anew_entity_phones', 'authenticated_update_anew_entity_phones', 'is_entity_contact_in_owner_scope'),
      ('fiscal_entities', 'authenticated_select_fiscal_entities', 'is_entity_in_user_scope'),
      ('fiscal_entities', 'authenticated_update_fiscal_entities', 'is_entity_in_user_scope')
    ) AS x(t, pol, fn)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies pp
    WHERE pp.schemaname = 'public' AND pp.tablename::text = x.t AND pp.policyname::text = x.pol
      AND (COALESCE(pp.qual, '') || ' ' || COALESCE(pp.with_check, '')) ~ ('\m' || x.fn || '\('));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: politicas que deviam chamar as funcoes de ambito: %', v_missing;
  END IF;

  -- ninguem chama ja a escolha de lead (fica so ela, sem uso, ate a limpeza)
  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname <> 'fn_neg_escolher_lead'
    AND p.prosrc ~ '\mfn_neg_escolher_lead\M';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: ainda chamam fn_neg_escolher_lead: %', v_missing;
  END IF;

  -- passar a cliente e pela entidade: a unica escrita e client_since
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'fn_neg_converter_pessoa'
                   AND p.prosrc ~ 'client_since\s+=\s+v_desde')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'neg_ganhar_negocio'
                      AND p.prosrc ~ 'fn_neg_tornar_cliente')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'fn_neg_pessoa_no_ambito'
                      AND p.prosrc ~ '''convert''') THEN
    RAISE EXCEPTION 'CONFERIR: a conversao em cliente nao escreve client_since pela entidade';
  END IF;

  -- o quadro deixa de fora as abordagens encerradas; a lista devolve-as
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'neg_resumo_quadro'
                   AND p.prosrc ~ 'p\.encerr IS NULL')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'neg_resumo_pessoas'
                      AND p.prosrc ~ 'e2\.closure_result::text') THEN
    RAISE EXCEPTION 'CONFERIR: quadro ou lista nao respeitam a abordagem encerrada da entidade';
  END IF;

  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_neg_exigir_pessoa', 'neg_guardar_visita', 'fn_neg_mudar_abordagem',
                      'neg_guardar_identidade_pessoa', 'neg_substituir_contacto',
                      'neg_atribuir_pessoa', 'neg_apagar_pessoa')
    AND p.prosrc !~ 'fn_neg_pessoa_no_ambito';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: nao decidem a pessoa pela entidade (fn_neg_pessoa_no_ambito): %', v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'neg_guardar_visita'
                   AND p.prosrc ~ 'p_entity_id\s+=>\s+p_entity_id') THEN
    RAISE EXCEPTION 'CONFERIR: neg_guardar_visita nao liga a visita a entidade';
  END IF;

  SELECT string_agg(po.polname::text, ', ') INTO v_missing
  FROM pg_policy po
  WHERE po.polrelid IN ('public.negocios'::regclass, 'public.levantamentos'::regclass)
    AND po.polname IN ('negocios_insert', 'levantamentos_insert')
    AND (pg_get_expr(po.polwithcheck, po.polrelid) ~ 'anew_entity_org_links'
         OR pg_get_expr(po.polwithcheck, po.polrelid) !~ 'anew_entities');
  SELECT count(*) INTO v_n
  FROM pg_policy po
  WHERE po.polrelid IN ('public.negocios'::regclass, 'public.levantamentos'::regclass)
    AND po.polname IN ('negocios_insert', 'levantamentos_insert');
  IF v_missing IS NOT NULL OR v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: politicas de INSERT de negocios/levantamentos pela entidade (encontradas %; erradas: %)',
      v_n, COALESCE(v_missing, '');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid = 'public.anew_entities'::regclass
                   AND c.conname = 'anew_entities_closure_result_check' AND c.contype::text = 'c') THEN
    RAISE EXCEPTION 'CONFERIR: falta anew_entities.closure_result com o CHECK';
  END IF;

  -- 5.5 Leitura de anew_entities: as listas classificam as 37 colunas (36 + closure_result);
  --     authenticated le exatamente v_old || v_auth_new (todas menos as 3
  --     secretas; v_held vazia); anon nada de novo.
  SELECT count(*) INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities';
  IF v_n <> cardinality(v_old) + cardinality(v_auth_new) + cardinality(v_held) + cardinality(v_secret)
     OR EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities'
                  AND NOT (c.column_name::text = ANY (v_old || v_auth_new || v_held || v_secret))) THEN
    RAISE EXCEPTION 'CONFERIR: as listas de leitura nao classificam exatamente as colunas de anew_entities (% colunas)', v_n;
  END IF;

  IF has_table_privilege('authenticated', 'public.anew_entities', 'SELECT')
     OR has_table_privilege('anon', 'public.anew_entities', 'SELECT')
     OR has_table_privilege('anon', 'public.anew_entities', 'INSERT')
     OR has_table_privilege('anon', 'public.anew_entities', 'UPDATE')
     OR has_table_privilege('anon', 'public.anew_entities', 'DELETE') THEN
    RAISE EXCEPTION 'CONFERIR: privilegio de tabela em anew_entities anula a leitura por coluna';
  END IF;

  FOREACH v_col IN ARRAY v_old || v_auth_new LOOP
    IF NOT has_column_privilege('authenticated', 'public.anew_entities', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'CONFERIR: authenticated nao le %', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY v_held || v_secret LOOP
    IF has_column_privilege('authenticated', 'public.anew_entities', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'CONFERIR: authenticated le a coluna %, que devia estar fechada', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY v_auth_new || v_held || v_secret LOOP
    IF has_column_privilege('anon', 'public.anew_entities', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'CONFERIR: anon le a coluna nova %', v_col;
    END IF;
  END LOOP;

  -- 5.5b Escrita: sem UPDATE de tabela; as colunas de ambito e de estado sem
  --      UPDATE; as restantes com UPDATE (o ecra antigo escreve o nome).
  IF has_table_privilege('authenticated', 'public.anew_entities', 'UPDATE') THEN
    RAISE EXCEPTION 'CONFERIR: authenticated ainda tem UPDATE de tabela em anew_entities';
  END IF;
  FOR v_col IN
    SELECT c.column_name::text FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'anew_entities'
  LOOP
    IF has_column_privilege('authenticated', 'public.anew_entities', v_col, 'UPDATE')
       = (v_col = ANY (v_sem_upd)) THEN
      RAISE EXCEPTION 'CONFERIR: UPDATE de authenticated em anew_entities.% devia ser %',
        v_col, NOT (v_col = ANY (v_sem_upd));
    END IF;
  END LOOP;

  -- 5.6 Auditoria: retira exatamente as colunas sem leitura (v_held || v_secret,
  --     ou seja so as 3 secretas)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generic_entity_audit';
  SELECT string_agg(d.x, ', ') INTO v_missing
  FROM (
    (SELECT m[1] AS x
       FROM regexp_matches(substring(v_def FROM 'v_entity_hidden_cols text\[\] := ARRAY\[([^]]*)\]'),
                           '''([a-z0-9_]+)''', 'g') AS m
     EXCEPT SELECT unnest(v_held || v_secret))
    UNION ALL
    (SELECT unnest(v_held || v_secret)
     EXCEPT SELECT m[1]
       FROM regexp_matches(substring(v_def FROM 'v_entity_hidden_cols text\[\] := ARRAY\[([^]]*)\]'),
                           '''([a-z0-9_]+)''', 'g') AS m)
  ) d;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: v_entity_hidden_cols da auditoria difere das colunas sem leitura: %', v_missing;
  END IF;

  -- 5.7 RGPD: o apagamento limpa as colunas novas, as submissoes e o log
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'execute_entity_erasure';
  FOREACH v_col IN ARRAY v_limpar LOOP
    IF v_def !~ ('\m' || v_col || '\s+=\s+(NULL|''\{\}''::jsonb)') THEN
      RAISE EXCEPTION 'CONFERIR: execute_entity_erasure nao limpa a coluna %', v_col;
    END IF;
  END LOOP;
  IF position('UPDATE public.entity_audit_log' IN v_def) = 0
     OR position('app.audit_bypass' IN v_def) = 0
     OR position('DELETE FROM public.form_submissions' IN v_def) = 0
     OR position('FROM public.negocios' IN v_def) = 0
     OR position('FROM public.levantamentos' IN v_def) = 0
     OR position('UPDATE public.schedule_items' IN v_def) = 0
     OR position('UPDATE public.schedule_item_events' IN v_def) = 0
     OR position('v_visit_ids' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: execute_entity_erasure sem log, auditoria desligada, submissoes, visitas, eventos das visitas ou bloqueio por negocios/levantamentos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'preview_entity_erasure'
                   AND p.prosrc ~ 'FROM public\.schedule_items') THEN
    RAISE EXCEPTION 'CONFERIR: preview_entity_erasure nao conta as visitas da entidade';
  END IF;

  -- o log continua fechado a escrita para authenticated
  SELECT count(*) INTO v_n
  FROM pg_policy po
  WHERE po.polrelid = 'public.entity_audit_log'::regclass
    AND po.polname IN ('entity_audit_log_no_update', 'entity_audit_log_no_delete')
    AND NOT po.polpermissive;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: entity_audit_log perdeu as politicas restritivas de UPDATE/DELETE';
  END IF;

  RAISE NOTICE 'CONFERIR: visitas e convites por entidade (lead_id/client_id apagados), submissoes com origem, canal, negocio e campanha, captacao, lista e quadro pela entidade, conversao em cliente por client_since, ambito das politicas pela organizacao da entidade, RGPD com colunas novas, log e eventos das visitas ofuscados.';
END
$$;

COMMIT;

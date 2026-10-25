-- ============================================================
-- 20261229100000_form_criar_entidade
-- ============================================================
-- !!! NAO APLICAR SEM AUTORIZACAO EXPRESSA DO UTILIZADOR !!!
--
-- Alvo: SO a base de RH (uetjghdkwbywbftedtth). NUNCA a base principal
-- (tzbfgwpckrfbqcolqxtm, producao da Mudelar): la nao existem as funcoes e
-- colunas de que esta depende (20261228100000 e 20261228200000).
--
-- ENTRA JUNTO COM O CODIGO NOVO, NO MESMO MOMENTO, NUNCA SOZINHA:
--   Edge Functions create-lead, insert-lead, update-lead, get-form-data,
--   book-slot, get-scheduling-invite, scheduling-invite-optout,
--   _shared/formEmails (e o nucleo novo _shared/formCaptacao) e a pagina
--   src/pages/PublicLeadForm.tsx.
--   - Aplicar esta migration sem esse codigo PARTE create-lead (o resolver
--     muda de assinatura), update-lead e book-slot nesta base.
--   - Publicar esse codigo sem esta migration faz falhar TODOS os envios
--     de formulario (as funcoes novas nao existem).
--   - A Mudelar usa estas Edge Functions (codigo partilhado com a principal):
--     o codigo novo nao se publica na principal sem autorizacao e sem a
--     principal ter o equivalente desta migration.
--
-- Especificacao: vault/ficheiros/crm/fluxos-formularios-hoje-e-novo.html
-- (aba #novo). O formulario SO cria a ENTIDADE (anew_entities, sem negocio,
-- sem lead, sem papeis, sem anew_entity_org_links). Origem e campanha sao da
-- entidade (primeiro contacto, nunca reescritas); campanha opcional; um so
-- email e um so telefone por entidade; lead/cliente deduz-se por
-- client_since; o formulario nunca recusa a captacao.
--
-- O que faz, por ordem
--   A1. GUARDAS no catalogo: o que se substitui esta como foi lido na RH
--       (trigger e funcao do trigger a citar anew_leads, indice unico das
--       submissoes, upsert_form_submission com 18 argumentos,
--       fn_form_resolver_captacao com 3), nenhum dos nomes novos existe,
--       nenhuma outra funcao referencia o upsert, o resolver ou o indice.
--   A2. TRIGGER form_submissions_check_target (decisao do utilizador):
--       check_form_submissions_target() passa ao modelo novo. target_type
--       'lead' e 'client' exigem que target_id seja uma anew_entities VIVA
--       da MESMA organizacao da submissao (a entidade e o identificador;
--       lead = sem client_since, cliente = com client_since, mas isso nao se
--       valida aqui). 'contact' e 'entity' ficam iguais. Mesma assinatura,
--       INVOKER, search_path e EXECUTE (CREATE OR REPLACE). Linhas antigas
--       nao se alteram (a RH tem 0 submissoes).
--   A3. UM TOQUE POR ENVIO: upsert_form_submission (mesma assinatura de 18
--       argumentos, mesmo EXECUTE so service_role) passa a inserir SEMPRE uma
--       linha nova; apaga-se o indice unico
--       uniq_form_submissions_org_entity_form_campaign. Um envio de terceiro
--       com o email de outra pessoa deixa de reescrever a submissao dela.
--   A4. fn_form_resolver_captacao: apagada a de 3 argumentos e criada a de
--       5 (p_form_id, p_campaign_id, p_origem, p_organization_id,
--       p_origin_id), que devolve tambem form_id. Organizacao do formulario
--       (ou da campanha, se so vier campanha); organizacao pedida diferente
--       -> organization_id NULL. Campanha so conta se ativa, dentro das datas
--       (hoje em Europe/Lisbon), da organizacao e do formulario; senao o
--       envio segue sem campanha.
--   A5. fn_form_achar_entidades (nova): entidades vivas da organizacao por
--       email, telefone (ultimos 9 digitos) ou nif_hash, sem utilizadores
--       internos.
--   A6. fn_form_criar_entidade (nova): valida tudo contra a organizacao
--       (22023), cria a entidade (sem dono, created_by NULL), o email e o
--       telefone primarios nas tabelas-satelite, a morada (so com rua e
--       codigo postal) e o toque (target lead = entity_id). Corrida apanhada
--       por unique_violation: devolve a entidade vencedora com created false.
--   A7. fn_form_completar_entidade (nova): passos 2..N preenchem nome e
--       morada em falta SO na entidade criada por esse envio.
--   A8. scheduling_invites.submission_id (uuid, nulo, FK ON DELETE SET NULL)
--       e indice parcial.
--   A9. CONFERIR: falha a migration inteira se algo divergir.
--
-- O que NAO faz
--   - Nao toca em create_entity_with_contacts_and_roles (o ai-assistant usa-a),
--     em rpc_resolve_form_submission (continua no modelo antigo; com o trigger
--     novo a troca de dono por ids de anew_leads/anew_clients passa a ser
--     recusada: proxima peca a adaptar), nem em campaign_leads.
--   - Nao escreve dados. Nao muda privilegios de tabelas.
--
-- NAO VERIFICADO (so possivel com escrita na RH, por autorizar): o
-- comportamento das funcoes em escrita real (criar, reenvio, corrida, trigger
-- a recusar entidade apagada ou de outra organizacao). Antes do push correm-se
-- so as pre-condicoes de catalogo (o bloco A1 repete-as).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ------------------------------------------------------------
-- A1. Guardas iniciais
-- ------------------------------------------------------------
DO $$
DECLARE
  v_n    int;
  v_txt  text;
BEGIN
  -- o trigger existe, ligado a funcao lida, e a funcao ainda exige anew_leads
  SELECT count(*) INTO v_n
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.form_submissions'::regclass
    AND t.tgname = 'form_submissions_check_target'
    AND NOT t.tgisinternal
    AND t.tgfoid = 'public.check_form_submissions_target()'::regprocedure;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARDA: trigger form_submissions_check_target nao esta como foi lido';
  END IF;

  SELECT p.prosrc INTO v_txt
  FROM pg_proc p
  WHERE p.oid = 'public.check_form_submissions_target()'::regprocedure;
  IF v_txt !~ 'anew_leads' OR v_txt !~ '''entity''' THEN
    RAISE EXCEPTION 'GUARDA: check_form_submissions_target mudou desde a leitura (esperava os ramos lead/anew_leads e entity)';
  END IF;

  -- o CHECK da coluna aceita exatamente lead, contact, client, entity
  SELECT pg_get_constraintdef(c.oid) INTO v_txt
  FROM pg_constraint c
  WHERE c.conrelid = 'public.form_submissions'::regclass
    AND c.conname = 'form_submissions_target_type_check';
  IF v_txt IS NULL OR v_txt !~ '''lead''' OR v_txt !~ '''client''' OR v_txt !~ '''contact''' OR v_txt !~ '''entity''' THEN
    RAISE EXCEPTION 'GUARDA: form_submissions_target_type_check nao esta como foi lido';
  END IF;

  -- o indice unico que o upsert usava existe
  SELECT count(*) INTO v_n
  FROM pg_class i JOIN pg_namespace n ON n.oid = i.relnamespace
  WHERE n.nspname = 'public' AND i.relname = 'uniq_form_submissions_org_entity_form_campaign'
    AND i.relkind::text = 'i';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARDA: indice uniq_form_submissions_org_entity_form_campaign nao existe';
  END IF;

  -- uma so assinatura do upsert (18) e do resolver (3)
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'upsert_form_submission';
  IF v_n <> 1 OR to_regprocedure('public.upsert_form_submission(uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,text,boolean,integer,integer,uuid,boolean,uuid,uuid,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'GUARDA: upsert_form_submission nao tem a assinatura unica de 18 argumentos lida';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_form_resolver_captacao';
  IF v_n <> 1 OR to_regprocedure('public.fn_form_resolver_captacao(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'GUARDA: fn_form_resolver_captacao nao tem a assinatura unica de 3 argumentos lida';
  END IF;

  -- a RPC antiga (ai-assistant) esta como lida e nao se toca
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_entity_with_contacts_and_roles';
  IF v_n <> 1 OR to_regprocedure('public.create_entity_with_contacts_and_roles(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'GUARDA: create_entity_with_contacts_and_roles nao tem a assinatura unica de 7 argumentos lida';
  END IF;

  -- nenhum nome novo existe
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_form_achar_entidades', 'fn_form_criar_entidade', 'fn_form_completar_entidade');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: ja existem % das funcoes novas desta migration; confirmar o estado antes', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_attribute a
  WHERE a.attrelid = 'public.scheduling_invites'::regclass
    AND a.attname = 'submission_id' AND NOT a.attisdropped;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'GUARDA: scheduling_invites.submission_id ja existe';
  END IF;

  -- nenhuma outra funcao depende do upsert, do resolver ou do indice
  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname NOT IN ('upsert_form_submission', 'fn_form_resolver_captacao')
    AND p.prosrc ~* 'upsert_form_submission|fn_form_resolver_captacao|uniq_form_submissions_org_entity_form_campaign';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'GUARDA: funcoes que dependem do que esta migration substitui: %', v_txt;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- A2. Trigger: lead e client validam a ENTIDADE (decisao do utilizador)
-- ------------------------------------------------------------
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
  ELSIF NEW."target_type" IN ('lead', 'client') THEN
    -- Modelo novo: a entidade e o identificador. lead = entidade sem
    -- client_since, cliente = com client_since; aqui so se exige que seja uma
    -- entidade viva da mesma organizacao da submissao.
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_entities" e
                   WHERE e."id" = NEW."target_id"
                     AND e."organization_id" = NEW."organization_id"
                     AND e."deleted_at" IS NULL) THEN
      RAISE EXCEPTION 'form_submissions.target_id % (target_type %) tem de ser uma entidade viva da mesma organizacao',
        NEW."target_id", NEW."target_type";
    END IF;
  ELSIF NEW."target_type" = 'entity' THEN
    IF NEW."target_id" IS DISTINCT FROM NEW."entity_id" THEN
      RAISE EXCEPTION 'form_submissions.target_id % must be the submission entity_id', NEW."target_id";
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- A3. Um toque por envio: upsert passa a INSERT e sai o indice unico
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_form_submission(
  p_organization_id uuid,
  p_root_organization_id uuid,
  p_entity_id uuid,
  p_form_id uuid DEFAULT NULL::uuid,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_target_type text DEFAULT NULL::text,
  p_target_id uuid DEFAULT NULL::uuid,
  p_field_values jsonb DEFAULT '{}'::jsonb,
  p_status text DEFAULT 'in_progress'::text,
  p_is_complete boolean DEFAULT false,
  p_current_step integer DEFAULT 1,
  p_total_steps integer DEFAULT NULL::integer,
  p_origin_id uuid DEFAULT NULL::uuid,
  p_origin_recognized boolean DEFAULT NULL::boolean,
  p_channel_id uuid DEFAULT NULL::uuid,
  p_negocio_id uuid DEFAULT NULL::uuid,
  p_campaign_via text DEFAULT NULL::text,
  p_needs_manual_scheduling boolean DEFAULT NULL::boolean)
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
  -- Um toque por envio: cada envio e sempre uma linha nova (so INSERT, nunca atualiza a anterior).
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
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.upsert_form_submission(uuid, uuid, uuid, uuid, uuid, text, uuid, jsonb, text,
  boolean, integer, integer, uuid, boolean, uuid, uuid, text, boolean) IS
  'Grava UM toque por envio de formulario: insere sempre uma linha nova em form_submissions (desde 20261229100000 ja nao faz upsert; o nome mantem-se por compatibilidade). So service_role.';

DROP INDEX public.uniq_form_submissions_org_entity_form_campaign;

-- ------------------------------------------------------------
-- A4. Resolver da captacao (5 argumentos)
-- ------------------------------------------------------------
DROP FUNCTION public.fn_form_resolver_captacao(uuid, uuid, text);

CREATE FUNCTION public.fn_form_resolver_captacao(
  p_form_id uuid,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organization_id uuid, form_id uuid, campaign_id uuid, campaign_via text,
               origin_id uuid, origin_recognized boolean, channel_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_org    uuid;
  v_form   uuid;
  v_camp   uuid;
  v_via    text := 'nenhuma';
  v_texto  text := NULLIF(lower(btrim(p_origem)), '');
  v_origem uuid;
  v_recon  boolean;
  v_canal  uuid;
  v_hoje   date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  -- 1. organizacao: do formulario; se so vier campanha, da campanha
  IF p_form_id IS NOT NULL THEN
    SELECT f.organization_id, f.id INTO v_org, v_form
    FROM public.forms f
    WHERE f.id = p_form_id;
  ELSIF p_campaign_id IS NOT NULL THEN
    SELECT ca.organization_id, ca.form_id INTO v_org, v_form
    FROM public.campaigns ca
    WHERE ca.id = p_campaign_id;
    -- o formulario da campanha so conta se for da mesma organizacao
    IF v_form IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.forms f WHERE f.id = v_form AND f.organization_id = v_org) THEN
      v_form := NULL;
    END IF;
  END IF;

  -- formulario/campanha inexistente, sem organizacao, ou de outra
  -- organizacao que nao a pedida: organization_id NULL e nada mais
  IF v_org IS NULL OR (p_organization_id IS NOT NULL AND v_org <> p_organization_id) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::text,
                        NULL::uuid, NULL::boolean, NULL::uuid;
    RETURN;
  END IF;

  -- 2. a campanha do link: ativa na data, da organizacao e do formulario
  IF p_campaign_id IS NOT NULL THEN
    SELECT ca.id INTO v_camp
    FROM public.campaigns ca
    WHERE ca.id = p_campaign_id
      AND ca.organization_id = v_org
      AND ca.status = 'active'
      AND (ca.start_date IS NULL OR ca.start_date <= v_hoje)
      AND (ca.end_date IS NULL OR ca.end_date >= v_hoje)
      AND (ca.form_id IS NULL OR ca.form_id = v_form);
    IF v_camp IS NOT NULL THEN
      v_via := 'link';
    END IF;
  END IF;

  -- 3. senao, a campanha ativa na data mais recente deste formulario
  IF v_camp IS NULL AND v_form IS NOT NULL THEN
    SELECT ca.id INTO v_camp
    FROM public.campaigns ca
    WHERE ca.form_id = v_form
      AND ca.organization_id = v_org
      AND ca.status = 'active'
      AND (ca.start_date IS NULL OR ca.start_date <= v_hoje)
      AND (ca.end_date IS NULL OR ca.end_date >= v_hoje)
    ORDER BY ca.created_at DESC, ca.id DESC
    LIMIT 1;
    IF v_camp IS NOT NULL THEN
      v_via := 'formulario';
    END IF;
  END IF;

  -- 4. origem: id explicito valido; senao o texto (nome ou sinonimo);
  --    senao a omissao da campanha; sem nada fica NULL
  IF p_origin_id IS NOT NULL THEN
    SELECT ls.id INTO v_origem
    FROM public.lead_sources ls
    WHERE ls.id = p_origin_id
      AND (ls.organization_id = v_org OR ls.organization_id IS NULL)
      AND ls.is_active IS NOT FALSE;
    IF v_origem IS NOT NULL THEN
      v_recon := true;
    END IF;
  END IF;

  IF v_origem IS NULL AND v_texto IS NOT NULL THEN
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
  ELSIF v_origem IS NULL AND v_camp IS NOT NULL THEN
    SELECT COALESCE(
             (SELECT cs.source_id FROM public.campaign_sources cs
              JOIN public.lead_sources ls ON ls.id = cs.source_id
              WHERE cs.campaign_id = v_camp
                AND (ls.organization_id = v_org OR ls.organization_id IS NULL)
                AND ls.is_active IS NOT FALSE
              ORDER BY cs.is_default DESC, cs.created_at, cs.id
              LIMIT 1),
             (SELECT ca.source_id FROM public.campaigns ca
              JOIN public.lead_sources ls ON ls.id = ca.source_id
              WHERE ca.id = v_camp
                AND (ls.organization_id = v_org OR ls.organization_id IS NULL)
                AND ls.is_active IS NOT FALSE))
      INTO v_origem;
    v_recon := CASE WHEN v_origem IS NOT NULL THEN true END;
  END IF;

  -- 5. canal: o ativo da campanha (o da origem primeiro, senao o mais antigo)
  IF v_camp IS NOT NULL THEN
    SELECT ch.id INTO v_canal
    FROM public.channels ch
    WHERE ch.campaign_id = v_camp AND ch.is_active
    ORDER BY (ch.source_id IS NOT DISTINCT FROM v_origem AND v_origem IS NOT NULL) DESC,
             ch.created_at, ch.id
    LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_org, v_form, v_camp, v_via, v_origem, v_recon, v_canal;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_form_resolver_captacao(uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_form_resolver_captacao(uuid, uuid, text, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_form_resolver_captacao(uuid, uuid, text, uuid, uuid) IS
  'Captacao do formulario: organizacao (do formulario, ou da campanha), formulario, campanha ativa na data (link ou do formulario; senao nenhuma), origem e canal. organization_id NULL = formulario/campanha inexistente ou de outra organizacao que nao p_organization_id. So service_role.';

-- ------------------------------------------------------------
-- A5. Achar entidades da organizacao (email, telefone, nif_hash)
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_form_achar_entidades(
  p_organization_id uuid,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_nif_hash text DEFAULT NULL::text)
 RETURNS TABLE(entity_id uuid, matched_by text[], email text, phone text,
               client_since date, assigned_to uuid, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_email  text := NULLIF(lower(btrim(p_email)), '');
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_phone9 text;
  v_nif    text := NULLIF(btrim(p_nif_hash), '');
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN;
  END IF;

  -- telefone: so com 7 ou mais digitos (como o dedup), ultimos 9 (como o
  -- indice uq_anew_entities_org_phone9)
  IF length(v_digits) >= 7 THEN
    v_phone9 := right(v_digits, 9);
  END IF;

  IF v_email IS NULL AND v_phone9 IS NULL AND v_nif IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id,
         array_remove(ARRAY[
           CASE WHEN v_email IS NOT NULL
                 AND (lower(e.email) = v_email OR lower(btrim(e.email)) = v_email) THEN 'email' END,
           CASE WHEN v_phone9 IS NOT NULL AND e.phone IS NOT NULL
                 AND right(regexp_replace(e.phone, '[^0-9]', '', 'g'), 9) = v_phone9 THEN 'phone' END,
           CASE WHEN v_nif IS NOT NULL AND e.nif_hash = v_nif THEN 'nif' END
         ], NULL)::text[],
         e.email, e.phone, e.client_since, e.assigned_to, e.created_by
  FROM public.anew_entities e
  WHERE e.organization_id = p_organization_id
    AND e.deleted_at IS NULL
    AND (   (v_email IS NOT NULL AND (lower(e.email) = v_email OR lower(btrim(e.email)) = v_email))
         OR (v_phone9 IS NOT NULL AND e.phone IS NOT NULL
             AND regexp_replace(e.phone, '[^0-9]', '', 'g') <> ''
             AND right(regexp_replace(e.phone, '[^0-9]', '', 'g'), 9) = v_phone9)
         OR (v_nif IS NOT NULL AND e.nif_hash = v_nif))
    -- fora entidades de utilizadores internos (como collectDedupCandidatesForOrg)
    AND NOT EXISTS (SELECT 1 FROM public.anew_users u
                    WHERE u.entity_id = e.id AND u.registration_origin = 'invited')
  ORDER BY e.created_at, e.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_form_achar_entidades(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_form_achar_entidades(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_form_achar_entidades(uuid, text, text, text) IS
  'Formulario: entidades vivas da organizacao que batem por email, telefone (ultimos 9 digitos, 7+) ou nif_hash, sem utilizadores internos; uma linha por entidade com matched_by. So service_role.';

-- ------------------------------------------------------------
-- A6. Criar a entidade e o toque (uma transacao)
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_form_criar_entidade(
  p_organization_id uuid,
  p_form_id uuid DEFAULT NULL::uuid,
  p_campaign_id uuid DEFAULT NULL::uuid,
  p_campaign_via text DEFAULT NULL::text,
  p_origin_id uuid DEFAULT NULL::uuid,
  p_origin_recognized boolean DEFAULT NULL::boolean,
  p_channel_id uuid DEFAULT NULL::uuid,
  p_first_name text DEFAULT NULL::text,
  p_last_name text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_locale text DEFAULT NULL::text,
  p_street text DEFAULT NULL::text,
  p_postal_code text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_extra jsonb DEFAULT NULL::jsonb,
  p_field_values jsonb DEFAULT NULL::jsonb,
  p_status text DEFAULT 'in_progress'::text,
  p_is_complete boolean DEFAULT false,
  p_current_step integer DEFAULT 1,
  p_total_steps integer DEFAULT NULL::integer,
  p_needs_manual_scheduling boolean DEFAULT NULL::boolean)
 RETURNS TABLE(entity_id uuid, submission_id uuid, created boolean)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_root    uuid;
  v_first   text := NULLIF(btrim(p_first_name), '');
  v_last    text := NULLIF(btrim(p_last_name), '');
  v_email   text := NULLIF(lower(btrim(p_email)), '');
  v_phone   text := NULLIF(btrim(p_phone), '');
  v_digits  text;
  v_locale  text := COALESCE(NULLIF(btrim(p_locale), ''), 'pt');
  v_street  text := NULLIF(btrim(p_street), '');
  v_postal  text := NULLIF(btrim(p_postal_code), '');
  v_city    text := NULLIF(btrim(p_city), '');
  v_notes   text := NULLIF(btrim(p_notes), '');
  v_extra   jsonb := COALESCE(p_extra, '{}'::jsonb);
  v_fv      jsonb := COALESCE(p_field_values, '{}'::jsonb);
  v_meta    jsonb;
  v_display text;
  v_entity  uuid;
  v_created boolean := true;
  v_address uuid;
  v_sub     uuid;
BEGIN
  -- --- validacao contra a organizacao (qualquer falha: 22023) ---
  IF p_organization_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: organizacao invalida' USING ERRCODE = '22023';
  END IF;

  IF p_form_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.forms f
       WHERE f.id = p_form_id AND f.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: formulario de outra organizacao ou inexistente' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.campaigns ca
       WHERE ca.id = p_campaign_id AND ca.organization_id = p_organization_id
         AND (ca.form_id IS NULL OR p_form_id IS NULL OR ca.form_id = p_form_id)) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: campanha de outra organizacao, de outro formulario ou inexistente' USING ERRCODE = '22023';
  END IF;

  IF p_channel_id IS NOT NULL AND (p_campaign_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.channels ch
       WHERE ch.id = p_channel_id AND ch.campaign_id = p_campaign_id)) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: canal que nao pertence a campanha' USING ERRCODE = '22023';
  END IF;

  IF p_origin_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.lead_sources ls
       WHERE ls.id = p_origin_id
         AND (ls.organization_id = p_organization_id OR ls.organization_id IS NULL)
         AND ls.is_active IS NOT FALSE) THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: origem de outra organizacao, inativa ou inexistente' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_extra) <> 'object' OR jsonb_typeof(v_fv) <> 'object' THEN
    RAISE EXCEPTION 'fn_form_criar_entidade: p_extra e p_field_values tem de ser objetos' USING ERRCODE = '22023';
  END IF;

  v_root := public.resolve_root_organization_id(p_organization_id);

  -- type e display_name sao NOT NULL; display_name nunca vazio
  v_display := COALESCE(NULLIF(btrim(concat_ws(' ', v_first, v_last)), ''), v_email, v_phone, 'Sem nome');

  -- --- a entidade e os contactos primarios; corrida -> a entidade vencedora ---
  BEGIN
    INSERT INTO public.anew_entities (
      type, display_name, status, created_by, first_name, last_name,
      organization_id, client_since, email, phone, locale,
      origin_id, campaign_id, notes, extra
    ) VALUES (
      'person', v_display, 'active', NULL, v_first, v_last,
      p_organization_id, NULL, v_email, v_phone, v_locale,
      p_origin_id, p_campaign_id, v_notes, v_extra
    )
    RETURNING id INTO v_entity;

    -- neg_ficha_pessoa le email e telefone SO destas tabelas
    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, created_by)
      VALUES (v_entity, v_email, 'personal', true, NULL);
    END IF;
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, phone_type, is_primary, created_by)
      VALUES (v_entity, v_phone, 'mobile', true, NULL);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- outro envio criou a mesma pessoa entre o achar e este INSERT: pelos
    -- mesmos criterios dos indices unicos (email; telefone nos 9 digitos)
    v_digits := regexp_replace(COALESCE(v_phone, ''), '[^0-9]', '', 'g');
    SELECT e.id INTO v_entity
    FROM public.anew_entities e
    WHERE e.organization_id = p_organization_id
      AND e.deleted_at IS NULL
      AND (   (v_email IS NOT NULL AND e.email IS NOT NULL AND lower(e.email) = v_email)
           OR (v_digits <> '' AND e.phone IS NOT NULL
               AND regexp_replace(e.phone, '[^0-9]', '', 'g') <> ''
               AND right(regexp_replace(e.phone, '[^0-9]', '', 'g'), 9) = right(v_digits, 9)))
    ORDER BY (v_email IS NOT NULL AND lower(e.email) = v_email) DESC, e.created_at, e.id
    LIMIT 1;
    IF v_entity IS NULL THEN
      RAISE;
    END IF;
    v_created := false;
  END;

  -- --- morada: so com rua E codigo postal (mesma address_key do create-lead) ---
  IF v_created AND v_street IS NOT NULL AND v_postal IS NOT NULL THEN
    INSERT INTO public.anew_addresses (
      address_key, street, number, postal_code, city, country, created_by
    ) VALUES (
      lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, ''))),
      v_street, '', v_postal, COALESCE(v_city, ''), 'PT', NULL
    )
    RETURNING id INTO v_address;

    INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary, created_by)
    VALUES (v_entity, v_address, 'primary', true, NULL);
  END IF;

  -- --- o toque: target lead = a entidade; a marca entidade_nova so o servidor escreve ---
  v_meta := CASE WHEN jsonb_typeof(v_fv -> '_meta') = 'object' THEN v_fv -> '_meta' ELSE '{}'::jsonb END;
  v_fv := v_fv || jsonb_build_object('_meta', v_meta || jsonb_build_object('entidade_nova', v_created));

  v_sub := public.upsert_form_submission(
    p_organization_id         => p_organization_id,
    p_root_organization_id    => v_root,
    p_entity_id               => v_entity,
    p_form_id                 => p_form_id,
    p_campaign_id             => p_campaign_id,
    p_target_type             => 'lead',
    p_target_id               => v_entity,
    p_field_values            => v_fv,
    p_status                  => COALESCE(p_status, 'in_progress'),
    p_is_complete             => COALESCE(p_is_complete, false),
    p_current_step            => COALESCE(p_current_step, 1),
    p_total_steps             => p_total_steps,
    p_origin_id               => p_origin_id,
    p_origin_recognized       => p_origin_recognized,
    p_channel_id              => p_channel_id,
    p_negocio_id              => NULL,
    p_campaign_via            => p_campaign_via,
    p_needs_manual_scheduling => p_needs_manual_scheduling
  );

  RETURN QUERY SELECT v_entity, v_sub, v_created;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean) TO service_role;

COMMENT ON FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean) IS
  'Formulario: cria a entidade (sem dono, lead por client_since NULL), email e telefone primarios, morada (rua e codigo postal) e o toque (target lead = entity_id), numa transacao. Valida formulario, campanha, canal e origem contra a organizacao (22023). Corrida: devolve a entidade vencedora com created false. So service_role.';

-- ------------------------------------------------------------
-- A7. Completar a entidade nova nos passos 2..N
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_form_completar_entidade(
  p_submission_id uuid,
  p_first_name text DEFAULT NULL::text,
  p_last_name text DEFAULT NULL::text,
  p_street text DEFAULT NULL::text,
  p_postal_code text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid;
  v_entity  uuid;
  v_fv      jsonb;
  v_cur_first text;
  v_cur_last  text;
  v_first   text := NULLIF(btrim(p_first_name), '');
  v_last    text := NULLIF(btrim(p_last_name), '');
  v_street  text := NULLIF(btrim(p_street), '');
  v_postal  text := NULLIF(btrim(p_postal_code), '');
  v_city    text := NULLIF(btrim(p_city), '');
  v_new_first text;
  v_new_last  text;
  v_address uuid;
  v_wrote   boolean := false;
BEGIN
  IF p_submission_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.organization_id, s.entity_id, s.field_values
    INTO v_org, v_entity, v_fv
  FROM public.form_submissions s
  WHERE s.id = p_submission_id AND s.deleted_at IS NULL;

  -- so a entidade que ESTE envio criou (marca escrita so pelo servidor)
  IF v_entity IS NULL
     OR jsonb_typeof(v_fv -> '_meta' -> 'entidade_nova') IS DISTINCT FROM 'boolean'
     OR (v_fv -> '_meta' ->> 'entidade_nova') <> 'true' THEN
    RETURN false;
  END IF;

  SELECT e.first_name, e.last_name INTO v_cur_first, v_cur_last
  FROM public.anew_entities e
  WHERE e.id = v_entity AND e.organization_id = v_org AND e.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- nome: so o que esta vazio
  v_new_first := COALESCE(NULLIF(btrim(v_cur_first), ''), v_first);
  v_new_last  := COALESCE(NULLIF(btrim(v_cur_last), ''), v_last);
  IF v_new_first IS DISTINCT FROM v_cur_first OR v_new_last IS DISTINCT FROM v_cur_last THEN
    UPDATE public.anew_entities e
       SET first_name   = v_new_first,
           last_name    = v_new_last,
           display_name = COALESCE(NULLIF(btrim(concat_ws(' ', v_new_first, v_new_last)), ''), e.display_name),
           updated_at   = now()
     WHERE e.id = v_entity AND e.organization_id = v_org;
    v_wrote := true;
  END IF;

  -- morada: so se a entidade nao tem nenhuma e vier rua E codigo postal
  IF v_street IS NOT NULL AND v_postal IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.entity_id = v_entity) THEN
    INSERT INTO public.anew_addresses (
      address_key, street, number, postal_code, city, country, created_by
    ) VALUES (
      lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, ''))),
      v_street, '', v_postal, COALESCE(v_city, ''), 'PT', NULL
    )
    RETURNING id INTO v_address;

    INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary, created_by)
    VALUES (v_entity, v_address, 'primary', true, NULL);
    v_wrote := true;
  END IF;

  RETURN v_wrote;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_form_completar_entidade(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_form_completar_entidade(uuid, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_form_completar_entidade(uuid, text, text, text, text, text) IS
  'Formulario, passos 2..N: preenche nome e morada em falta SO na entidade criada por esta submissao (_meta.entidade_nova = true). Nunca toca em email, telefone, origem nem campanha. So service_role.';

-- ------------------------------------------------------------
-- A8. A chave primaria da form_submissions e, a seguir, o convite que aponta a submissao
-- Lido na RH antes de a migration falhar: a form_submissions nao tem chave primaria (0 chaves,
-- 0 linhas, id NOT NULL com gen_random_uuid()), e sem ela a FK do convite falha
-- (SQLSTATE 42830). Cria-se so se nao existir e se nao houver ids repetidos.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.form_submissions'::regclass AND contype = 'p') THEN
    IF EXISTS (SELECT 1 FROM public.form_submissions GROUP BY id HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'form_submissions tem ids repetidos: nao se cria a chave primaria.';
    END IF;
    ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);
  END IF;
END
$$;

-- ------------------------------------------------------------
-- A8b. O convite aponta a submissao a retomar
-- ------------------------------------------------------------
ALTER TABLE public.scheduling_invites
  ADD COLUMN submission_id uuid
    CONSTRAINT scheduling_invites_submission_id_fkey
    REFERENCES public.form_submissions(id) ON DELETE SET NULL;

CREATE INDEX idx_scheduling_invites_submission
  ON public.scheduling_invites (submission_id)
  WHERE submission_id IS NOT NULL;

COMMENT ON COLUMN public.scheduling_invites.submission_id IS
  'Submissao (toque) que este convite retoma. Com um toque por envio, retomar pela submissao mais recente da entidade podia continuar o envio de outra pessoa.';

-- ------------------------------------------------------------
-- A9. Conferir (falha a migration inteira se algo divergir)
-- ------------------------------------------------------------
DO $$
DECLARE
  r       record;
  v_n     int;
  v_sd    boolean;
  v_na    int;
  v_cfg   text;
  v_own   text;
  v_quem  text;
  v_txt   text;
BEGIN
  -- uma so assinatura, seguranca, search_path, dono e EXECUTE
  FOR r IN
    SELECT * FROM (VALUES
      ('check_form_submissions_target',          false, 0,  'authenticated,service_role'),
      ('upsert_form_submission',                 true,  18, 'service_role'),
      ('fn_form_resolver_captacao',              true,  5,  'service_role'),
      ('fn_form_achar_entidades',                true,  4,  'service_role'),
      ('fn_form_criar_entidade',                 true,  23, 'service_role'),
      ('fn_form_completar_entidade',             true,  6,  'service_role'),
      ('create_entity_with_contacts_and_roles',  true,  7,  'service_role')
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
                           WHERE a.privilege_type::text = 'EXECUTE' AND a.grantee <> p.proowner) g), '')
      INTO v_sd, v_na, v_cfg, v_own, v_quem
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.nome;

    IF v_sd IS DISTINCT FROM r.definer OR v_na <> r.nargs OR v_own <> 'postgres'
       OR position('search_path=' IN v_cfg) = 0 OR v_quem <> r.quem THEN
      RAISE EXCEPTION 'CONFERIR: % difere do esperado (definer %, args %, dono %, config [%], EXECUTE [%]; esperado definer %, args %, EXECUTE [%])',
        r.nome, v_sd, v_na, v_own, v_cfg, v_quem, r.definer, r.nargs, r.quem;
    END IF;
  END LOOP;

  -- as funcoes novas tem search_path public, pg_temp
  SELECT string_agg(p.proname::text, ', ' ORDER BY p.proname) INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_form_resolver_captacao', 'fn_form_achar_entidades',
                      'fn_form_criar_entidade', 'fn_form_completar_entidade', 'upsert_form_submission')
    AND COALESCE(array_to_string(p.proconfig, ','), '') <> 'search_path=public, pg_temp';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: search_path diferente de public, pg_temp em: %', v_txt;
  END IF;

  -- o resolver devolve as 7 colunas do contrato, por esta ordem
  SELECT array_to_string(p.proargnames[6:12], ',') INTO v_txt
  FROM pg_proc p
  WHERE p.oid = 'public.fn_form_resolver_captacao(uuid,uuid,text,uuid,uuid)'::regprocedure;
  IF v_txt IS DISTINCT FROM 'organization_id,form_id,campaign_id,campaign_via,origin_id,origin_recognized,channel_id' THEN
    RAISE EXCEPTION 'CONFERIR: colunas de saida do resolver [%]', v_txt;
  END IF;

  -- o trigger: corpo novo pela entidade, ligado a INSERT e UPDATE OF target_type, target_id
  SELECT p.prosrc INTO v_txt
  FROM pg_proc p
  WHERE p.oid = 'public.check_form_submissions_target()'::regprocedure;
  IF v_txt ~ 'anew_leads|anew_clients' OR v_txt !~ 'anew_entities'
     OR v_txt !~ 'organization_id' OR v_txt !~ 'deleted_at' OR v_txt !~ 'anew_contacts' THEN
    RAISE EXCEPTION 'CONFERIR: check_form_submissions_target nao esta no modelo da entidade';
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO v_txt
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.form_submissions'::regclass
    AND t.tgname = 'form_submissions_check_target'
    AND t.tgenabled::text = 'O'
    AND t.tgfoid = 'public.check_form_submissions_target()'::regprocedure;
  IF v_txt IS NULL OR v_txt !~ 'BEFORE INSERT OR UPDATE OF target_type, target_id' THEN
    RAISE EXCEPTION 'CONFERIR: trigger form_submissions_check_target com definicao inesperada [%]', v_txt;
  END IF;

  -- um toque por envio: sem indice unico e sem ON CONFLICT
  IF to_regclass('public.uniq_form_submissions_org_entity_form_campaign') IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: o indice unico das submissoes ainda existe';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_index ix
  WHERE ix.indrelid = 'public.form_submissions'::regclass
    AND ix.indisunique AND NOT ix.indisprimary;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: form_submissions ainda tem % indices unicos alem da chave', v_n;
  END IF;

  SELECT p.prosrc INTO v_txt
  FROM pg_proc p
  WHERE p.oid = 'public.upsert_form_submission(uuid,uuid,uuid,uuid,uuid,text,uuid,jsonb,text,boolean,integer,integer,uuid,boolean,uuid,uuid,text,boolean)'::regprocedure;
  IF v_txt ~* 'ON\s+CONFLICT' THEN
    RAISE EXCEPTION 'CONFERIR: upsert_form_submission ainda faz ON CONFLICT';
  END IF;

  -- as funcoes novas: organizacao, marca e lead pela entidade
  SELECT p.prosrc INTO v_txt FROM pg_proc p
  WHERE p.oid = 'public.fn_form_criar_entidade(uuid,uuid,uuid,text,uuid,boolean,uuid,text,text,text,text,text,text,text,text,text,jsonb,jsonb,text,boolean,integer,integer,boolean)'::regprocedure;
  IF v_txt !~ 'unique_violation' OR v_txt !~ 'entidade_nova' OR v_txt !~ 'p_target_type\s+=>\s+''lead'''
     OR v_txt ~ 'anew_leads|anew_clients|anew_entity_roles|anew_entity_org_links' THEN
    RAISE EXCEPTION 'CONFERIR: fn_form_criar_entidade nao esta como desenhado';
  END IF;

  SELECT p.prosrc INTO v_txt FROM pg_proc p
  WHERE p.oid = 'public.fn_form_completar_entidade(uuid,text,text,text,text,text)'::regprocedure;
  IF v_txt !~ 'entidade_nova' OR v_txt !~ 'organization_id' OR v_txt ~ 'e\.email|e\.phone|origin_id|campaign_id' THEN
    RAISE EXCEPTION 'CONFERIR: fn_form_completar_entidade nao esta como desenhada';
  END IF;

  SELECT p.prosrc INTO v_txt FROM pg_proc p
  WHERE p.oid = 'public.fn_form_achar_entidades(uuid,text,text,text)'::regprocedure;
  IF v_txt !~ 'organization_id = p_organization_id' OR v_txt !~ 'deleted_at IS NULL' OR v_txt !~ 'invited' THEN
    RAISE EXCEPTION 'CONFERIR: fn_form_achar_entidades nao filtra por organizacao, vivas e internos';
  END IF;

  -- scheduling_invites.submission_id: uuid, nula, FK SET NULL para form_submissions
  SELECT count(*) INTO v_n
  FROM pg_attribute a
  WHERE a.attrelid = 'public.scheduling_invites'::regclass
    AND a.attname = 'submission_id' AND NOT a.attisdropped
    AND NOT a.attnotnull AND a.atttypid = 'uuid'::regtype;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: scheduling_invites.submission_id em falta ou com tipo/nulidade errados';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_constraint c
  WHERE c.conrelid = 'public.scheduling_invites'::regclass
    AND c.conname = 'scheduling_invites_submission_id_fkey'
    AND c.contype::text = 'f'
    AND c.confrelid = 'public.form_submissions'::regclass
    AND c.confdeltype::text = 'n';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: FK scheduling_invites_submission_id_fkey em falta ou sem ON DELETE SET NULL';
  END IF;
END
$$;

COMMIT;

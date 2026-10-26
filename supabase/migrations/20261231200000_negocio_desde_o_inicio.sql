-- =============================================================================
-- 20261231200000_negocio_desde_o_inicio.sql  (base RH)
--
-- «Negócio desde o início»: cada pessoa nova que chega por formulário nasce já
-- com um negócio aberto; os toques de quem já existe vão para a fila, onde se
-- ligam (nota), se transformam em negócio novo ou se ignoram. O quadro passa a
-- ter só cartões de negócio (porContactar, contactado e visita incluídos).
--
-- SÓ RH. Não toca na Mudelar nem na base principal.
--
-- ATENÇÃO: ESTA MIGRATION ENTRA JUNTO COM formCaptacao.ts, create-lead,
-- insert-lead, book-slot E O FRONTEND. NÃO APLICAR SOZINHA.
--   * supabase/functions/_shared/formCaptacao.ts (lê a 4.ª coluna negocio_id
--     de fn_form_criar_entidade e devolve negocioId);
--   * supabase/functions/create-lead e insert-lead (limites por formulário e
--     por impressão digital, honeypot, zod, getClientIp);
--   * supabase/functions/book-slot/pessoa.ts (negocio_id lido no servidor,
--     atribuir também o negócio);
--   * src/pages/PublicLeadForm.tsx (honeypot), src/pages/PendingFormSubmissions.tsx
--     (acções ligar / criar_negocio / ignorar, nova assinatura da RPC),
--     src/integrations/supabase/types.ts e o adaptador e cartões do quadro
--     (adaptarCartaoQuadro.ts, cartoesQuadroPessoas.ts, QuadroReal, PipelineReal),
--     a ficha (seletor de origem -> neg_guardar_origem_pessoa).
--   * Logo a seguir ao push, as Edge Functions publicadas na RH (que esperam 3
--     colunas de fn_form_criar_entidade) ficam incompatíveis até serem
--     publicadas as novas; e o ecrã de submissões pendentes actual (merge /
--     new_lead) deixa de funcionar até sair o novo.
--
-- O que muda na base:
--   1. fn_neg_titulo_de_nome(text) nova (título normalizado a partir do nome).
--   2. CHECK form_submissions_resolution_check aceita também 'ligada',
--      'negocio_criado', 'duplicada' e 'negocio_automatico'.
--   3. fn_negocios_preparar_insercao: com app.neg_sem_autor = 'on' não preenche
--      created_by (e por isso não há dono automático).
--   4. fn_form_entidade_no_ambito nova + política form_submissions_select_org
--      (vê o toque quem vê a pessoa OU é dono/criador de um negócio dela).
--   5. fn_neg_pessoa_no_ambito NÃO muda (a guarda e o conferir provam o md5):
--      é ela que is_entity_in_user_scope e can_see_entity usam na RLS de
--      anew_entities e das satélites, e alargá-la abria UPDATE/DELETE directos.
--      O dono/criador de um negócio vivo da pessoa (mesma organização) passa
--      só pelas funções de aplicação: fn_neg_pessoa_por_negocio nova (DEFINER)
--      e um ramo em fn_neg_exigir_pessoa (INVOKER, mesma ACL). Mudam, por
--      tabela, as que chamam fn_neg_exigir_pessoa SEM verificar 'edit' a
--      seguir: neg_ficha_pessoa, fn_neg_ficha_seccao, fn_neg_gravar_nota,
--      neg_registar_contacto, neg_criar_negocio, neg_criar_lead e
--      neg_guardar_levantamento. As que exigem 'edit' (neg_guardar_contacto_
--      pessoa, neg_guardar_identidade_pessoa, neg_substituir_contacto,
--      neg_atribuir_pessoa, fn_neg_mudar_abordagem, neg_guardar_origem_pessoa)
--      não mudam. neg_guardar_visita chama fn_neg_pessoa_no_ambito('view')
--      directamente e também não muda.
--      LIMITE CONHECIDO: essas sete são INVOKER, por isso o dono só do negócio
--      lê a pessoa (anew_entities_org_member_select é por organização) e
--      escreve notas, contactos e negócios (RLS por organização), mas NÃO lê
--      emails, telefones e moradas (RLS das satélites por donos da entidade).
--      A ficha dele abre sem contactos; ver o relatório antes de aplicar.
--      fn_neg_entidade_partilhada nova: a guarda 5b de
--      neg_guardar_identidade_pessoa numa função (só a chamam funções DEFINER).
--   6. fn_form_criar_entidade: devolve negocio_id; pessoa nova -> negócio aberto
--      sem dono e toque resolvido 'negocio_automatico' (com app.neg_sem_autor
--      ligado só à volta do INSERT); notas até 5000 e display_name até 200.
--   7. fn_form_completar_entidade: o título automático acompanha o nome.
--   8. rpc_resolve_form_submission: nova assinatura (ligar, criar_negocio,
--      ignorar; idempotente; NG029 único para indisponível). Lê a submissão
--      sem bloquear, verifica organização e âmbito, e só depois a bloqueia
--      (FOR UPDATE) e volta a verificar âmbito e resolved_at. Correcções exigem
--      pessoas.edit, âmbito 'edit' e entidade não partilhada (NG003); NG003
--      para a candidata E para a entidade ORIGINAL (fichas de utilizador e de
--      organização) em ligar e criar_negocio; ignorar exige pessoas.view e
--      não aceita p_entity_id.
--   9. neg_resumo_quadro: só cartões de negócio.
--  10. neg_guardar_origem_pessoa nova.
--  11. Backfill: só na org nike (b6ffce4f-f630-4933-833a-008649757a33). Hoje 0 linhas.
--
-- Corpos copiados LITERALMENTE de pg_get_functiondef no remoto RH (as guardas
-- conferem o md5 de cada um), com só as mudanças acima.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas (falham antes de mudar o que quer que seja)
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  v_n    bigint;
  v_nome text;
  v_txt  text;
  r      record;
BEGIN
  -- 0a. uma só assinatura das funções que se recriam ou que se usam
  FOREACH v_nome IN ARRAY ARRAY['fn_form_criar_entidade', 'fn_form_completar_entidade',
                                'rpc_resolve_form_submission', 'fn_negocios_preparar_insercao',
                                'fn_neg_pessoa_no_ambito', 'neg_resumo_quadro',
                                'neg_guardar_contacto_pessoa', 'can_access_contact_row',
                                'crm_scope_keys', 'get_user_crm_org_ids', 'has_anew_permission',
                                'fn_negocios_actor', 'fn_neg_tem_permissao_org',
                                'fn_neg_exigir_config', 'fn_neg_exigir_pessoa',
                                'neg_guardar_identidade_pessoa',
                                'upsert_form_submission', 'resolve_root_organization_id',
                                'fn_neg_parado_desde', 'auto_assign_creator',
                                'is_entity_in_user_scope', 'can_see_entity']
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Guarda: a função public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;

  -- 0b. as funções copiadas ainda são exactamente a versão copiada (md5 de
  --     pg_get_functiondef). Se alguém as mudou, recopiar antes de aplicar.
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      ('fn_form_criar_entidade',        'fac9f0bdb1b150efd528d43f2bc3a7fc'),
      ('fn_form_completar_entidade',    '5d3aa9df08c69408869f014d09ced73a'),
      ('rpc_resolve_form_submission',   '1d0aaf0768158d804db1508170dc9c0c'),
      ('fn_negocios_preparar_insercao', '7d5350475f3ba6433691448c206ee16a'),
      ('fn_neg_pessoa_no_ambito',       'c7a7be70424773fad627a460dd0e7030'),
      ('neg_resumo_quadro',             '63671b77be88b0ed69a023431b1c5d07'),
      ('neg_guardar_contacto_pessoa',   'f21badc29bebc0b294508f7c40dc0ff2'),
      -- copiada (ramo do dono do negócio)
      ('fn_neg_exigir_pessoa',          '019ad32281387e457a7bd41709c998f0'),
      -- a guarda 5b é copiada daqui para fn_neg_entidade_partilhada
      ('neg_guardar_identidade_pessoa', '2b0f1a283dd439f7a07d31af0cabd97e'),
      -- não se mudam: a RLS de anew_entities e satélites (o conferir 12g
      -- prova que ficaram iguais, com fn_neg_pessoa_no_ambito)
      ('is_entity_in_user_scope',       '560e5adb4100388bed68920701642d68'),
      ('can_see_entity',                '593bd418631f20683b817ffc74371522')
    ) AS x(nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Guarda: public.% no remoto já não é a versão copiada (md5 %, esperado %).',
        r.nome, v_txt, r.h;
    END IF;
  END LOOP;

  -- 0c. assinaturas exactas das duas funções que se largam (DROP)
  SELECT pg_get_function_identity_arguments(p.oid)::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'rpc_resolve_form_submission';
  IF v_txt IS DISTINCT FROM 'p_submission_id uuid, p_action text, p_field_overrides jsonb, p_entity_id uuid' THEN
    RAISE EXCEPTION 'Guarda: rpc_resolve_form_submission tem outra assinatura: %.', v_txt;
  END IF;
  SELECT pg_get_function_result(p.oid)::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_form_criar_entidade';
  IF v_txt IS DISTINCT FROM 'TABLE(entity_id uuid, submission_id uuid, created boolean)' THEN
    RAISE EXCEPTION 'Guarda: fn_form_criar_entidade devolve outra coisa: %.', v_txt;
  END IF;

  -- 0d. o CHECK das resoluções é o antigo
  SELECT pg_get_constraintdef(c.oid)::text INTO v_txt
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.form_submissions'::regclass
    AND c.conname::text = 'form_submissions_resolution_check';
  IF v_txt IS DISTINCT FROM 'CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY[''merged''::text, ''new_lead''::text]))))' THEN
    RAISE EXCEPTION 'Guarda: form_submissions_resolution_check não é o esperado: %.', v_txt;
  END IF;

  -- 0e. as funções novas ainda não existem
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname::text IN ('fn_neg_titulo_de_nome', 'fn_form_entidade_no_ambito',
                            'neg_guardar_origem_pessoa', 'fn_neg_pessoa_por_negocio',
                            'fn_neg_entidade_partilhada');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existem % funções com os nomes novos.', v_n;
  END IF;

  -- 0f. o código NG029 ainda não é usado por nenhuma função
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc::text LIKE '%NG029%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % funções já usam o código NG029.', v_n;
  END IF;

  -- 0g. a política que se recria existe (e só leitura, para authenticated)
  SELECT count(*) INTO v_n FROM pg_catalog.pg_policies pol
  WHERE pol.schemaname::text = 'public' AND pol.tablename::text = 'form_submissions'
    AND pol.policyname::text = 'form_submissions_select_org'
    AND pol.cmd::text = 'SELECT' AND pol.roles::text = '{authenticated}';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Guarda: a política form_submissions_select_org não está como esperado (% linhas).', v_n;
  END IF;

  -- 0h. a cadeia de gatilhos BEFORE INSERT de negocios que se assume (ordem
  --     alfabética: preparar a inserção antes do dono automático)
  SELECT count(*) INTO v_n FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal
    AND t.tgname::text IN ('trg_00_negocios_preparar_insercao', 'trg_auto_assign_creator_negocios');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Guarda: faltam gatilhos BEFORE INSERT de negocios (encontrados %).', v_n;
  END IF;

  -- 0i. nenhuma resolução gravada fica fora do CHECK novo
  SELECT count(*) INTO v_n FROM public.form_submissions s
  WHERE s.resolution IS NOT NULL
    AND s.resolution NOT IN ('merged', 'new_lead', 'ligada', 'negocio_criado', 'duplicada',
                             'negocio_automatico');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: % submissões com resolução fora do CHECK novo.', v_n;
  END IF;
END
$guarda$;

-- -----------------------------------------------------------------------------
-- 1. fn_neg_titulo_de_nome: título de negócio a partir do nome da pessoa
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.fn_neg_titulo_de_nome(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public, pg_temp
AS $function$
  -- caracteres de controlo -> espaço; espaços seguidos -> um; aparar; até 200;
  -- aparar outra vez; vazio -> 'Sem nome' (negocios_titulo_check: 1 a 200)
  SELECT COALESCE(
           NULLIF(btrim(left(btrim(regexp_replace(
             regexp_replace(COALESCE(p_nome, ''), '[[:cntrl:]]', ' ', 'g'),
             '\s+', ' ', 'g')), 200)), ''),
           'Sem nome');
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_titulo_de_nome(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_neg_titulo_de_nome(text) IS
  'Título de negócio a partir do nome da pessoa (sem caracteres de controlo, espaços juntos, até 200, ''Sem nome'' se vazio). Só a chamam funções DEFINER do postgres.';

-- -----------------------------------------------------------------------------
-- 2. CHECK das resoluções (antes de fn_form_criar_entidade, que já grava
--    'negocio_automatico')
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_submissions DROP CONSTRAINT form_submissions_resolution_check;
ALTER TABLE public.form_submissions ADD CONSTRAINT form_submissions_resolution_check
  CHECK (resolution IS NULL
         OR resolution IN ('merged', 'new_lead', 'ligada', 'negocio_criado', 'duplicada',
                           'negocio_automatico')) NOT VALID;
ALTER TABLE public.form_submissions VALIDATE CONSTRAINT form_submissions_resolution_check;

-- -----------------------------------------------------------------------------
-- 3. fn_negocios_preparar_insercao (mesma assinatura e ACL; só a variável
--    app.neg_sem_autor)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_negocios_preparar_insercao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'aberto'
     AND COALESCE(current_setting('app.neg_via_funcao', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Um negócio é criado aberto; o estado só muda pelas acções da página Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.root_organization_id := public.resolve_root_organization_id(NEW.organization_id);

  -- 20261231200000: com app.neg_sem_autor = 'on' (só o põem, na própria
  -- transacção e só à volta do INSERT, rpc_resolve_form_submission ao criar o
  -- negócio da fila e fn_form_criar_entidade no negócio automático) o
  -- negócio fica sem criador e, por isso, sem dono automático
  -- (trg_auto_assign_creator_negocios corre a seguir e só copia um criador).
  IF NEW.created_by IS NULL
     AND COALESCE(current_setting('app.neg_sem_autor', true), '') <> 'on' THEN
    NEW.created_by := public.fn_negocios_actor();
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  NEW.perdido_em := CASE WHEN NEW.estado = 'perdido' THEN now() END;
  NEW.ganho_em   := CASE WHEN NEW.estado = 'ganho'   THEN now() END;

  -- Fase N: a origem e o alerta só aparecem por decisão posterior.
  NEW.decisao_origem_tipo := NULL;
  NEW.decisao_origem_id   := NULL;
  NEW.alerta_codigo       := NULL;
  NEW.alerta_em           := NULL;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Âmbito do toque: fn_form_entidade_no_ambito + política de leitura
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.fn_form_entidade_no_ambito(p_organization_id uuid, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  -- a entidade está viva nesta organização E o utilizador vê-a pelos donos da
  -- entidade OU pelo dono/criador de um negócio vivo dela nesta organização
  -- (leads.view se não é cliente, clients.view se é)
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_entities e
    WHERE e.id = p_entity_id
      AND e.organization_id = p_organization_id
      AND e.deleted_at IS NULL
      AND (public.can_access_contact_row(
             e.organization_id, e.created_by, e.assigned_to,
             CASE WHEN e.client_since IS NULL THEN 'leads.view' ELSE 'clients.view' END)
           OR EXISTS (
             SELECT 1
             FROM public.negocios n
             WHERE n.entity_id = e.id
               AND n.organization_id = p_organization_id
               AND n.deleted_at IS NULL
               AND public.can_access_contact_row(
                     n.organization_id, n.created_by, n.assigned_to,
                     CASE WHEN e.client_since IS NULL THEN 'leads.view' ELSE 'clients.view' END))));
$function$;

REVOKE ALL ON FUNCTION public.fn_form_entidade_no_ambito(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_form_entidade_no_ambito(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_form_entidade_no_ambito(uuid, uuid) IS
  'Verdadeiro se a entidade está viva na organização e o utilizador a vê pelos donos da entidade ou pelo dono/criador de um negócio vivo dela. Usada pela política form_submissions_select_org e por rpc_resolve_form_submission.';

DROP POLICY form_submissions_select_org ON public.form_submissions;
CREATE POLICY form_submissions_select_org ON public.form_submissions
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND public.fn_form_entidade_no_ambito(organization_id, entity_id)
  );

-- -----------------------------------------------------------------------------
-- 5. Dono/criador de um negócio vivo: só no caminho das funções de aplicação.
--    fn_neg_pessoa_no_ambito NÃO muda (is_entity_in_user_scope e
--    can_see_entity, e por elas a RLS de anew_entities e das satélites,
--    ficam como estavam).
-- -----------------------------------------------------------------------------
-- 5a. fn_neg_pessoa_por_negocio: o utilizador é dono (assigned_to) ou criou
--     (created_by) um negócio vivo desta pessoa nesta organização, pelas
--     mesmas chaves de leads.view (pessoa) ou clients.view (cliente) que
--     fn_neg_pessoa_no_ambito usa para 'view'. DEFINER porque a chama
--     fn_neg_exigir_pessoa, que é INVOKER (a RLS de negocios não interfere).
CREATE FUNCTION public.fn_neg_pessoa_por_negocio(p_organization_id uuid, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_org     text := p_organization_id::text;
  v_cliente boolean;
  v_perm    text;
  v_keys    text[];
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT e.client_since IS NOT NULL INTO v_cliente
  FROM public.anew_entities e
  WHERE e.id = p_entity_id
    AND e.organization_id = p_organization_id
    AND e.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_perm := CASE WHEN v_cliente THEN 'clients.view' ELSE 'leads.view' END;
  IF NOT public.has_anew_permission(v_uid, v_perm) THEN
    RETURN false;
  END IF;
  v_keys := public.crm_scope_keys(v_perm);
  RETURN EXISTS (
    SELECT 1 FROM public.negocios n
    WHERE n.entity_id = p_entity_id
      AND n.organization_id = p_organization_id
      AND n.deleted_at IS NULL
      AND (v_org || ':' || n.assigned_to::text = ANY (v_keys)
           OR v_org || ':' || n.created_by::text = ANY (v_keys)));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_pessoa_por_negocio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_pessoa_por_negocio(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_pessoa_por_negocio(uuid, uuid) IS
  'Verdadeiro se o utilizador é dono ou criador de um negócio vivo da pessoa nesta organização (chaves de leads.view ou clients.view). Só a usa fn_neg_exigir_pessoa; NÃO entra na RLS (is_entity_in_user_scope e can_see_entity não a chamam).';

-- 5b. fn_neg_exigir_pessoa (mesma assinatura, INVOKER e ACL; cópia do corpo
--     vivo com o ramo do dono do negócio)
CREATE OR REPLACE FUNCTION public.fn_neg_exigir_pessoa(p_organization_id uuid, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20261231200000: também quem é dono/criador de um negócio vivo da pessoa
  -- nesta organização (fn_neg_pessoa_por_negocio). fn_neg_pessoa_no_ambito
  -- não muda, por isso a RLS de escrita de anew_entities também não.
  IF NOT COALESCE(public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'view'), false)
     AND NOT COALESCE(public.fn_neg_pessoa_por_negocio(p_organization_id, p_entity_id), false) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
END;
$function$;

-- 5c. fn_neg_entidade_partilhada: a guarda 5b de neg_guardar_identidade_pessoa
--     (cópia literal das condições). Verdadeiro se a entidade aparece noutra
--     organização (ligação, lead viva, cliente vivo, papel vivo, ou linha viva
--     de uma tabela com chave estrangeira para anew_entities) ou é a ficha de
--     um utilizador do sistema. Só a chamam funções DEFINER do postgres.
CREATE FUNCTION public.fn_neg_entidade_partilhada(p_organization_id uuid, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
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
                WHERE u.entity_id = p_entity_id AND u.deleted_at IS NULL);
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_entidade_partilhada(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_neg_entidade_partilhada(uuid, uuid) IS
  'A guarda 5b de neg_guardar_identidade_pessoa: a entidade aparece noutra organização ou é ficha de utilizador. Só a chamam funções DEFINER do postgres (rpc_resolve_form_submission, antes de escrever correcções).';

-- -----------------------------------------------------------------------------
-- 6. fn_form_criar_entidade (mesmos 23 argumentos; devolve também negocio_id)
-- -----------------------------------------------------------------------------
DROP FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.fn_form_criar_entidade(p_organization_id uuid, p_form_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_campaign_via text DEFAULT NULL::text, p_origin_id uuid DEFAULT NULL::uuid, p_origin_recognized boolean DEFAULT NULL::boolean, p_channel_id uuid DEFAULT NULL::uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_locale text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_extra jsonb DEFAULT NULL::jsonb, p_field_values jsonb DEFAULT NULL::jsonb, p_status text DEFAULT 'in_progress'::text, p_is_complete boolean DEFAULT false, p_current_step integer DEFAULT 1, p_total_steps integer DEFAULT NULL::integer, p_needs_manual_scheduling boolean DEFAULT NULL::boolean)
 RETURNS TABLE(entity_id uuid, submission_id uuid, created boolean, negocio_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  -- 20261231100000: a língua da página só se grava com o formato de código de
  -- língua (o CHECK anew_entities_locale_check); qualquer outra coisa -> 'pt'.
  v_locale  text := CASE WHEN btrim(p_locale) ~ '^[a-z]{2}(-[a-z]{2,4})?$'
                         THEN btrim(p_locale) ELSE 'pt' END;
  v_street  text := NULLIF(btrim(p_street), '');
  v_postal  text := NULLIF(btrim(p_postal_code), '');
  v_city    text := NULLIF(btrim(p_city), '');
  -- 20261231200000: limites no servidor (formulário público): notas até 5000
  v_notes   text := NULLIF(btrim(left(btrim(p_notes), 5000)), '');
  v_extra   jsonb := COALESCE(p_extra, '{}'::jsonb);
  v_fv      jsonb := COALESCE(p_field_values, '{}'::jsonb);
  v_meta    jsonb;
  v_display text;
  v_entity  uuid;
  v_created boolean := true;
  v_address uuid;
  v_sub     uuid;
  v_neg     uuid;
  v_sem_autor text;
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
  -- 20261231200000: display_name até 200 (aparado outra vez depois de cortar)
  v_display := btrim(left(COALESCE(NULLIF(btrim(concat_ws(' ', v_first, v_last)), ''), v_email, v_phone, 'Sem nome'), 200));

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

  -- --- 20261231200000: pessoa nova -> negócio aberto desde o início ---
  -- Sem sessão (service_role) o actor é NULL: o negócio nasce sem criador e
  -- sem dono. O toque fica resolvido como 'negocio_automatico'. Uma falha aqui
  -- não perde a pessoa nem o toque: o toque fica por resolver, na fila.
  -- Corrida (v_created falso): não se cria nada.
  -- app.neg_sem_autor ligado só à volta do INSERT (sem criador mesmo que haja
  -- sessão) e reposto a seguir com o valor que tinha, também na falha.
  IF v_created THEN
    v_sem_autor := COALESCE(current_setting('app.neg_sem_autor', true), '');
    BEGIN
      PERFORM set_config('app.neg_sem_autor', 'on', true);
      INSERT INTO public.negocios (organization_id, entity_id, titulo, fecho)
      VALUES (p_organization_id, v_entity, public.fn_neg_titulo_de_nome(v_display), 'contrato')
      RETURNING id INTO v_neg;
      PERFORM set_config('app.neg_sem_autor', v_sem_autor, true);

      UPDATE public.form_submissions s
         SET negocio_id  = v_neg,
             resolved_at = now(),
             resolution  = 'negocio_automatico',
             resolved_by = NULL
       WHERE s.id = v_sub
         AND s.organization_id = p_organization_id;
    EXCEPTION WHEN OTHERS THEN
      v_neg := NULL;
      PERFORM set_config('app.neg_sem_autor', v_sem_autor, true);
      RAISE WARNING 'fn_form_criar_entidade: negocio automatico nao criado (SQLSTATE %): %',
        SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN QUERY SELECT v_entity, v_sub, v_created, v_neg;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text,
  text, text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text,
  text, text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean)
  TO service_role;

COMMENT ON FUNCTION public.fn_form_criar_entidade(uuid, uuid, uuid, text, uuid, boolean, uuid, text,
  text, text, text, text, text, text, text, text, jsonb, jsonb, text, boolean, integer, integer, boolean) IS
  'Formulário público (só service_role): cria a pessoa, os contactos, a morada e o toque. Pessoa nova -> negócio aberto sem dono e toque resolvido negocio_automatico (devolve negocio_id; NULL se não criou).';

-- -----------------------------------------------------------------------------
-- 7. fn_form_completar_entidade (mesma assinatura e ACL; o título automático
--    do negócio acompanha o nome)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_form_completar_entidade(p_submission_id uuid, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  v_neg     uuid;
  v_old_display text;
  v_new_display text;
BEGIN
  IF p_submission_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.organization_id, s.entity_id, s.field_values, s.negocio_id
    INTO v_org, v_entity, v_fv, v_neg
  FROM public.form_submissions s
  WHERE s.id = p_submission_id AND s.deleted_at IS NULL;

  -- so a entidade que ESTE envio criou (marca escrita so pelo servidor)
  IF v_entity IS NULL
     OR jsonb_typeof(v_fv -> '_meta' -> 'entidade_nova') IS DISTINCT FROM 'boolean'
     OR (v_fv -> '_meta' ->> 'entidade_nova') <> 'true' THEN
    RETURN false;
  END IF;

  SELECT e.first_name, e.last_name, e.display_name INTO v_cur_first, v_cur_last, v_old_display
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
     WHERE e.id = v_entity AND e.organization_id = v_org
    RETURNING e.display_name INTO v_new_display;
    v_wrote := true;

    -- 20261231200000: o título do negócio deste envio acompanha o nome, só se
    -- ainda for o título automático (ninguém o mudou) e o negócio estiver
    -- aberto e vivo. Uma falha aqui não desfaz o nome.
    IF v_neg IS NOT NULL AND v_new_display IS DISTINCT FROM v_old_display THEN
      BEGIN
        UPDATE public.negocios n
           SET titulo = public.fn_neg_titulo_de_nome(v_new_display)
         WHERE n.id = v_neg
           AND n.organization_id = v_org
           AND n.entity_id = v_entity
           AND n.estado = 'aberto'
           AND n.deleted_at IS NULL
           AND n.titulo = public.fn_neg_titulo_de_nome(v_old_display);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fn_form_completar_entidade: titulo do negocio nao actualizado (SQLSTATE %): %',
          SQLSTATE, SQLERRM;
      END;
    END IF;
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

-- -----------------------------------------------------------------------------
-- 8. rpc_resolve_form_submission (nova assinatura)
-- -----------------------------------------------------------------------------
DROP FUNCTION public.rpc_resolve_form_submission(uuid, text, jsonb, uuid);

CREATE FUNCTION public.rpc_resolve_form_submission(
  p_submission_id uuid,
  p_action text,
  p_field_overrides jsonb DEFAULT NULL::jsonb,
  p_entity_id uuid DEFAULT NULL::uuid,
  p_confirmar_negocio_aberto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  k_uuid      constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_uid       uuid := auth.uid();
  v_sub       public.form_submissions;
  v_org       uuid;
  v_ent       uuid;
  v_trocou    boolean := false;
  v_actor     uuid;
  v_pessoa    public.anew_entities;
  v_display   text;
  v_ov        jsonb := p_field_overrides;
  v_first     text;
  v_last      text;
  v_street    text;
  v_postal    text;
  v_city      text;
  v_new_first text;
  v_new_last  text;
  v_address   uuid;
  v_aberto    uuid;
  v_neg       uuid;
  v_visita    text;
  v_nota      uuid;
  v_fv        jsonb;
  v_resolucao text;
  v_sem_autor text;
BEGIN
  -- 1. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Acção
  IF p_action IS NULL OR p_action NOT IN ('ligar', 'criar_negocio', 'ignorar') THEN
    RAISE EXCEPTION 'Valor inválido: acção (ligar, criar_negocio ou ignorar).' USING ERRCODE = 'NG009';
  END IF;

  -- 3. Correcções: nulo ou objecto; só first_name, last_name, street,
  --    postal_code e city; cada valor string até 200; só com ligar ou
  --    criar_negocio. Email, telefone e NIF ficam de fora.
  IF v_ov IS NOT NULL THEN
    IF jsonb_typeof(v_ov) <> 'object' OR p_action = 'ignorar' THEN
      RAISE EXCEPTION 'Valor inválido: correcções.' USING ERRCODE = 'NG009';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(v_ov) AS x(chave, valor)
               WHERE x.chave NOT IN ('first_name', 'last_name', 'street', 'postal_code', 'city')
                  OR jsonb_typeof(x.valor) <> 'string'
                  OR char_length(x.valor #>> '{}') > 200) THEN
      RAISE EXCEPTION 'Valor inválido: correcções.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- 3b. Ignorar não escolhe pessoa: a entidade da submissão não muda.
  IF p_action = 'ignorar' AND p_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'Valor inválido: ignorar não escolhe pessoa.' USING ERRCODE = 'NG009';
  END IF;

  -- 4. A submissão viva, lida SEM bloquear. O mesmo NG029 quando não existe,
  --    quando é de outra organização e quando está fora do âmbito: o âmbito
  --    sai sempre da organização gravada na submissão. Só quem passa aqui
  --    chega a bloquear a linha.
  SELECT s.* INTO v_sub
  FROM public.form_submissions s
  WHERE s.id = p_submission_id AND s.deleted_at IS NULL;
  IF NOT FOUND
     OR NOT (v_sub.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT COALESCE(public.fn_form_entidade_no_ambito(v_sub.organization_id, v_sub.entity_id), false) THEN
    RAISE EXCEPTION 'Submissão indisponível.' USING ERRCODE = 'NG029';
  END IF;
  v_org := v_sub.organization_id;

  -- 4b. Agora o bloqueio, e outra vez sobre a linha bloqueada (pode ter sido
  --     apagada, resolvida ou passada a outra pessoa entretanto).
  SELECT s.* INTO v_sub
  FROM public.form_submissions s
  WHERE s.id = p_submission_id AND s.organization_id = v_org AND s.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND
     OR NOT COALESCE(public.fn_form_entidade_no_ambito(v_org, v_sub.entity_id), false) THEN
    RAISE EXCEPTION 'Submissão indisponível.' USING ERRCODE = 'NG029';
  END IF;

  -- 5. Idempotência (depois do âmbito, sobre a linha bloqueada): já
  --    resolvida -> devolve como está.
  IF v_sub.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'mudou', false,
      'resolution', v_sub.resolution,
      'negocio_id', v_sub.negocio_id,
      'entity_id', v_sub.entity_id);
  END IF;

  -- 6. Candidata: só a outra pessoa gravada na submissão, viva, desta
  --    organização e no âmbito. Ainda não se escreve (ver 9).
  v_ent := v_sub.entity_id;
  IF p_entity_id IS NOT NULL AND p_entity_id <> v_sub.entity_id THEN
    IF v_sub.conflicting_entity_id IS NULL
       OR p_entity_id <> v_sub.conflicting_entity_id
       OR NOT COALESCE(public.fn_form_entidade_no_ambito(v_org, p_entity_id), false) THEN
      RAISE EXCEPTION 'Submissão indisponível.' USING ERRCODE = 'NG029';
    END IF;
    v_ent := p_entity_id;
    v_trocou := true;
  END IF;

  -- 6b. Nem a pessoa em que se escreve (v_ent, a candidata depois da troca)
  --     nem a ORIGINAL da submissão (v_sub.entity_id) são a ficha de um
  --     utilizador ou de uma organização: uma troca não serve para tirar da
  --     fila um toque gravado numa ficha destas. Ignorar não escreve na pessoa
  --     e por isso pode arrumar um toque destes.
  IF p_action <> 'ignorar'
     AND (EXISTS (SELECT 1 FROM public.anew_users u
                  WHERE u.entity_id IN (v_ent, v_sub.entity_id))
          OR EXISTS (SELECT 1 FROM public.anew_organizations o
                     WHERE o.entity_id IN (v_ent, v_sub.entity_id))) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 7. Quem resolve: utilizador de negócio, membro activo desta organização.
  v_actor := public.fn_negocios_actor();
  IF v_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = v_actor AND m.organization_id = v_org AND m.status = 'active') THEN
    RAISE EXCEPTION 'Sem permissão nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 8. Bloqueio da pessoa: duas submissões da mesma pessoa, uma de cada vez.
  SELECT e.* INTO v_pessoa
  FROM public.anew_entities e
  WHERE e.id = v_ent AND e.organization_id = v_org AND e.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submissão indisponível.' USING ERRCODE = 'NG029';
  END IF;
  v_display := v_pessoa.display_name;

  -- Permissões e confirmação de cada acção, ANTES de qualquer escrita (o
  -- pedido de confirmação não escreve nada).
  -- 8a. Correcções escrevem na ficha: pessoas.edit, âmbito de edição sobre a
  --     pessoa e (como neg_guardar_identidade_pessoa, guarda 5b) não numa
  --     entidade que aparece noutra organização ou é ficha de utilizador.
  IF v_ov IS NOT NULL THEN
    IF NOT public.fn_neg_tem_permissao_org(v_org, 'pessoas.edit')
       OR NOT COALESCE(public.fn_neg_pessoa_no_ambito(v_org, v_ent, 'edit'), false) THEN
      RAISE EXCEPTION 'Sem permissão para corrigir os dados desta pessoa.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF public.fn_neg_entidade_partilhada(v_org, v_ent) THEN
      RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
    END IF;
  END IF;

  IF p_action = 'ligar' THEN
    IF NOT public.fn_neg_tem_permissao_org(v_org, 'pessoas.view') THEN
      RAISE EXCEPTION 'Sem permissão para ligar este envio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_action = 'criar_negocio' THEN
    PERFORM public.fn_neg_exigir_config(v_org);
    IF NOT public.fn_neg_tem_permissao_org(v_org, 'pessoas.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar negócios.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pessoa.closure_result IS NOT NULL THEN
      RAISE EXCEPTION 'A abordagem desta pessoa está encerrada: reabra-a na página Pessoas.'
        USING ERRCODE = 'NG002';
    END IF;
    SELECT n.id INTO v_aberto
    FROM public.negocios n
    WHERE n.entity_id = v_ent AND n.organization_id = v_org
      AND n.estado = 'aberto' AND n.deleted_at IS NULL
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 1;
    IF v_aberto IS NOT NULL AND NOT COALESCE(p_confirmar_negocio_aberto, false) THEN
      RETURN jsonb_build_object(
        'acao', 'confirmar',
        'motivo', 'negocio_aberto',
        'negocio_aberto_id', v_aberto,
        'mudou', false);
    END IF;
  ELSE
    -- ignorar
    IF NOT public.fn_neg_tem_permissao_org(v_org, 'pessoas.view') THEN
      RAISE EXCEPTION 'Sem permissão para ignorar este envio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 9. A submissão passa para a candidata escolhida.
  IF v_trocou THEN
    UPDATE public.form_submissions s
       SET entity_id             = v_ent,
           target_type           = 'lead',
           target_id             = v_ent,
           conflicting_entity_id = NULL
     WHERE s.id = v_sub.id;
  END IF;

  -- 10. Correcções: só escrevem campos VAZIOS (a regra de
  --     fn_form_completar_entidade; a morada só se não houver nenhuma).
  IF v_ov IS NOT NULL THEN
    v_first  := NULLIF(btrim(v_ov ->> 'first_name'), '');
    v_last   := NULLIF(btrim(v_ov ->> 'last_name'), '');
    v_street := NULLIF(btrim(v_ov ->> 'street'), '');
    v_postal := NULLIF(btrim(v_ov ->> 'postal_code'), '');
    v_city   := NULLIF(btrim(v_ov ->> 'city'), '');

    v_new_first := COALESCE(NULLIF(btrim(v_pessoa.first_name), ''), v_first);
    v_new_last  := COALESCE(NULLIF(btrim(v_pessoa.last_name), ''), v_last);
    IF v_new_first IS DISTINCT FROM v_pessoa.first_name OR v_new_last IS DISTINCT FROM v_pessoa.last_name THEN
      UPDATE public.anew_entities e
         SET first_name   = v_new_first,
             last_name    = v_new_last,
             display_name = COALESCE(NULLIF(btrim(concat_ws(' ', v_new_first, v_new_last)), ''), e.display_name),
             updated_at   = now()
       WHERE e.id = v_ent AND e.organization_id = v_org
      RETURNING e.display_name INTO v_display;
    END IF;

    IF v_street IS NOT NULL AND v_postal IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.entity_id = v_ent) THEN
      INSERT INTO public.anew_addresses (
        address_key, street, number, postal_code, city, country, created_by
      ) VALUES (
        lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, ''))),
        v_street, '', v_postal, COALESCE(v_city, ''), 'PT', NULL
      )
      RETURNING id INTO v_address;

      INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary, created_by)
      VALUES (v_ent, v_address, 'primary', true, NULL);
    END IF;
  END IF;

  -- 11. A acção.
  IF p_action = 'ligar' THEN
    -- só nota: os valores enviados, sem _meta e sem caracteres de controlo
    v_fv := CASE WHEN jsonb_typeof(v_sub.field_values) = 'object'
                 THEN v_sub.field_values - '_meta' ELSE '{}'::jsonb END;
    INSERT INTO public.entity_interactions (
      entity_id, organization_id, root_organization_id, interaction_type,
      subject, notes, interaction_at, created_by
    ) VALUES (
      v_ent, v_org, v_sub.root_organization_id, 'note',
      'Reenvio de formulário associado à pessoa',
      left(regexp_replace('Valores enviados (não verificados): ' || v_fv::text,
                          '[[:cntrl:]]', ' ', 'g'), 5000),
      now(), v_actor::text
    )
    RETURNING id INTO v_nota;

    v_resolucao := 'ligada';
    UPDATE public.form_submissions s
       SET resolved_at = now(),
           resolved_by = v_actor,
           resolution  = v_resolucao
     WHERE s.id = v_sub.id;

  ELSIF p_action = 'criar_negocio' THEN
    -- sem criador e sem dono: quem criou fica em form_submissions.resolved_by
    -- ligado só à volta do INSERT e reposto com o valor que tinha
    v_sem_autor := COALESCE(current_setting('app.neg_sem_autor', true), '');
    PERFORM set_config('app.neg_sem_autor', 'on', true);
    INSERT INTO public.negocios (organization_id, entity_id, titulo, fecho, assigned_to)
    VALUES (v_org, v_ent, public.fn_neg_titulo_de_nome(v_display), 'contrato', NULL)
    RETURNING id INTO v_neg;
    PERFORM set_config('app.neg_sem_autor', v_sem_autor, true);

    v_resolucao := 'negocio_criado';
    UPDATE public.form_submissions s
       SET negocio_id  = v_neg,
           resolved_at = now(),
           resolved_by = v_actor,
           resolution  = v_resolucao
     WHERE s.id = v_sub.id;

    -- só a visita marcada por ESTA submissão (book-slot grava-a em
    -- _meta.visita.schedule_item_id); nada de adoptar registos anteriores
    v_visita := CASE WHEN jsonb_typeof(v_sub.field_values #> '{_meta,visita,schedule_item_id}') = 'string'
                     THEN v_sub.field_values #>> '{_meta,visita,schedule_item_id}' END;
    IF v_visita ~* k_uuid THEN
      UPDATE public.schedule_items si
         SET negocio_id = v_neg
       WHERE si.id = v_visita::uuid
         AND si.organization_id = v_org
         AND si.entity_id = v_ent
         AND si.negocio_id IS NULL
         AND si.status <> 'cancelled'::public.schedule_item_status
         AND si.time_off_type IS NULL
         AND si.vacation_id IS NULL;
    END IF;

  ELSE
    -- ignorar: não apaga nada
    v_resolucao := 'duplicada';
    UPDATE public.form_submissions s
       SET resolved_at = now(),
           resolved_by = v_actor,
           resolution  = v_resolucao
     WHERE s.id = v_sub.id;
  END IF;

  RETURN jsonb_build_object(
    'acao', p_action,
    'mudou', true,
    'resolution', v_resolucao,
    'negocio_id', v_neg,
    'entity_id', v_ent,
    'interaction_id', v_nota,
    'trocou', v_trocou);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_resolve_form_submission(uuid, text, jsonb, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_form_submission(uuid, text, jsonb, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.rpc_resolve_form_submission(uuid, text, jsonb, uuid, boolean) IS
  'Fila de envios de formulário: ligar (nota), criar_negocio (pede confirmação se já houver negócio aberto) ou ignorar (duplicada; pessoas.view, sem p_entity_id). Correcções exigem pessoas.edit, âmbito de edição e entidade não partilhada. Idempotente. NG029 = submissão indisponível (inexistente, de outra organização ou fora do âmbito).';

-- -----------------------------------------------------------------------------
-- 9. neg_resumo_quadro (mesma assinatura, saída e ACL; só cartões de negócio)
-- -----------------------------------------------------------------------------
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

  -- 20261231200000: só há cartões de negócio. Parte dos negócios abertos da
  -- organização (idx_negocios_org_estado) com a entidade pela chave primária.
  -- Âmbito por cartão: org:*, os donos da entidade, ou o assigned_to/created_by
  -- do próprio negócio (leads.view para a entidade lead, clients.view para a
  -- cliente). Sendo INVOKER, a RLS negocios_select aplica-se por cima.
  RETURN QUERY
  WITH base AS (
    SELECT n.id AS neg_id, n.entity_id AS ent, n.titulo AS tit, n.assigned_to AS assigned,
           n.created_at AS k, e.display_name AS nome, (e.client_since IS NOT NULL) AS cliente
    FROM public.negocios n
    JOIN public.anew_entities e
      ON e.id = n.entity_id
     AND e.organization_id = p_organization_id
     AND e.deleted_at IS NULL
    WHERE n.organization_id = p_organization_id
      AND n.estado = 'aberto'
      AND n.deleted_at IS NULL
      AND (p_papel IS NULL OR (p_papel = 'cliente') = (e.client_since IS NOT NULL))
      AND CASE WHEN e.client_since IS NULL THEN
                 (v_org || ':*' = ANY (v_kl)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || e.created_by::text = ANY (v_kl)
                  OR v_org || ':' || n.assigned_to::text = ANY (v_kl)
                  OR v_org || ':' || n.created_by::text = ANY (v_kl))
               ELSE
                 (v_org || ':*' = ANY (v_kc)
                  OR v_org || ':' || e.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || e.created_by::text = ANY (v_kc)
                  OR v_org || ':' || n.assigned_to::text = ANY (v_kc)
                  OR v_org || ':' || n.created_by::text = ANY (v_kc))
          END
      AND (v_padrao IS NULL OR e.display_name ILIKE v_padrao ESCAPE '\')
  ), cart_neg AS (
    -- coluna: contrato > proposta > orçamento > levantamento (só com levantamento
    -- ligado) > visita (ligada, não cancelada) > contactado (chamada ligada) >
    -- porContactar
    SELECT CASE
             WHEN d.tem_contrato THEN 'contrato'
             WHEN d.tem_proposta THEN 'proposta'
             WHEN d.n_orc > 0 THEN 'orcamento'
             WHEN d.tem_lev THEN 'levantamento'
             WHEN d.tem_visita THEN 'visita'
             WHEN d.tem_chamada THEN 'contactado'
             ELSE 'porContactar'
           END AS col,
           'negocio'::text AS tp, x.neg_id AS cid_cartao, x.ent, x.nome, x.cliente,
           x.assigned, x.neg_id, x.tit,
           d.pronto, d.n_orc::integer AS n_orc, d.prop_status,
           0::integer AS plc, 0::integer AS plv, 0::integer AS plvf, 0::integer AS pll,
           x.k,
           d.valor AS val
    FROM base x
    LEFT JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM public.client_contracts cc
                     WHERE cc.negocio_id = x.neg_id AND cc.deleted_at IS NULL) AS tem_contrato,
             EXISTS (SELECT 1 FROM public.proposals pr
                     WHERE pr.negocio_id = x.neg_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) AS tem_proposta,
             (SELECT count(*) FROM public.quotes q
              WHERE q.negocio_id = x.neg_id AND q.deleted_at IS NULL) AS n_orc,
             EXISTS (SELECT 1 FROM public.levantamentos lt
                     WHERE lt.negocio_id = x.neg_id AND lt.deleted_at IS NULL) AS tem_lev,
             EXISTS (SELECT 1 FROM public.schedule_items s
                     WHERE s.negocio_id = x.neg_id
                       AND s.organization_id = p_organization_id
                       AND s.status <> 'cancelled'::public.schedule_item_status
                       AND s.time_off_type IS NULL AND s.vacation_id IS NULL) AS tem_visita,
             EXISTS (SELECT 1 FROM public.entity_interactions i
                     WHERE i.negocio_id = x.neg_id
                       AND i.organization_id = p_organization_id
                       AND i.interaction_type = 'call') AS tem_chamada,
             (SELECT pr.status FROM public.proposals pr
              WHERE pr.negocio_id = x.neg_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
              ORDER BY pr.created_at DESC, pr.id DESC LIMIT 1) AS prop_status,
             -- valor com a precedência de fn_neg_valor_negocio: a proposta mais
             -- recente não rejeitada, senão o orçamento aceite, senão o maior
             -- orçamento vivo que não esteja rejeitado nem perdido
             COALESCE(
               (SELECT pr.value::numeric FROM public.proposals pr
                WHERE pr.negocio_id = x.neg_id AND pr.status IS DISTINCT FROM 'rejected'
                  AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
                ORDER BY pr.created_at DESC LIMIT 1),
               (SELECT q.total::numeric FROM public.quotes q
                WHERE q.negocio_id = x.neg_id AND q.estado = 'aceite' AND q.deleted_at IS NULL
                ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC LIMIT 1),
               (SELECT max(q.total)::numeric FROM public.quotes q
                WHERE q.negocio_id = x.neg_id AND q.deleted_at IS NULL
                  AND q.estado IS DISTINCT FROM 'rejeitado' AND q.estado IS DISTINCT FROM 'perdido')) AS valor,
             CASE
               WHEN v_momento = 'proposta_aceite' THEN EXISTS (
                 SELECT 1 FROM public.proposals pr
                 WHERE pr.negocio_id = x.neg_id AND pr.status = 'accepted'
                   AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
               WHEN v_momento = 'contrato_assinado' THEN EXISTS (
                 SELECT 1 FROM public.client_contracts cc
                 WHERE cc.negocio_id = x.neg_id AND cc.status IN ('signed', 'assinado') AND cc.deleted_at IS NULL)
               ELSE false
             END AS pronto
    ) d ON true
  ), cartoes AS (
    SELECT u.col, u.tp, u.cid_cartao, u.ent, u.nome, u.cliente, u.assigned, u.neg_id, u.tit,
           u.pronto, u.n_orc, u.prop_status, u.plc, u.plv, u.plvf, u.pll,
           COALESCE(u.k, '1970-01-01 00:00:00+00'::timestamptz) AS k,
           -- valor só de orçamento para cima
           CASE WHEN u.col IN ('orcamento', 'proposta', 'contrato') THEN u.val END AS val,
           COALESCE(lower(u.nome), '') AS nm
    FROM cart_neg u
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
  ), pv AS (
    -- próxima visita ligada, só para os negócios da página nas três primeiras colunas
    SELECT s.negocio_id AS neg_ref, min(s.start_datetime) AS primeira
    FROM public.schedule_items s
    WHERE s.negocio_id = ANY (ARRAY(SELECT g.neg_id FROM pag g
                                    WHERE g.col IN ('porContactar', 'contactado', 'visita')))
      AND s.organization_id = p_organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND s.status NOT IN ('cancelled'::public.schedule_item_status,
                           'completed'::public.schedule_item_status)
    GROUP BY s.negocio_id
  ), pc AS (
    -- callback mais recente ligado (a mesma regra de fn_neg_proximo_contacto,
    -- agora por negócio), só para os negócios da página nas três primeiras colunas
    SELECT DISTINCT ON (i.negocio_id) i.negocio_id AS neg_ref, i.next_action_date
    FROM public.entity_interactions i
    WHERE i.organization_id = p_organization_id
      AND i.negocio_id = ANY (ARRAY(SELECT g.neg_id FROM pag g
                                    WHERE g.col IN ('porContactar', 'contactado', 'visita')))
      AND (i.interaction_type = 'call'
           OR (i.interaction_type = 'note' AND i.next_action_type = 'callback'))
    ORDER BY i.negocio_id, i.interaction_at DESC, i.id DESC
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
    (CASE WHEN q.col IN ('orcamento', 'proposta')
          THEN public.fn_neg_parado_desde(q.neg_id) END)::timestamptz,
    (CASE WHEN q.col IN ('porContactar', 'contactado', 'visita')
          THEN LEAST(pv.primeira, pc.next_action_date) END)::timestamptz,
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
  LEFT JOIN pv ON pv.neg_ref = q.neg_id
  LEFT JOIN pc ON pc.neg_ref = q.neg_id
  ORDER BY array_position(k_todas, q.col), q.rn;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 10. neg_guardar_origem_pessoa (estrutura de neg_guardar_contacto_pessoa;
--     os passos 2 a 5b são cópia literal)
--     Nota: fn_form_criar_entidade aceita também origens globais
--     (organization_id NULL); esta só aceita as da organização.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.neg_guardar_origem_pessoa(p_organization_id uuid, p_entity_id uuid, p_origin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_keys_pes text[];
  v_ent      public.anew_entities;
  v_mudou    boolean := false;
BEGIN
  -- 1. Valores (NULL limpa a origem)
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (p_origin_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.lead_sources ls
           WHERE ls.id = p_origin_id
             AND ls.organization_id = p_organization_id
             AND ls.is_active IS NOT FALSE)) THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa ou origem.' USING ERRCODE = 'NG009';
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

  -- 4. Pessoa: entidade viva desta organização, no âmbito de leitura, e que
  --    não é a ficha de uma organização do sistema.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  IF EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organização e âmbito de edição sobre a entidade.
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. (como neg_guardar_identidade_pessoa) Não muda os dados de uma entidade que aparece noutra organização
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
  SELECT e.* INTO v_ent FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 7. Só escreve se mudar.
  IF p_origin_id IS DISTINCT FROM v_ent.origin_id THEN
    UPDATE public.anew_entities e
    SET origin_id  = p_origin_id,
        updated_at = now()
    WHERE e.id = p_entity_id;
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object(
    'origin_id', p_origin_id,
    'mudou', v_mudou);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_origem_pessoa(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_origem_pessoa(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.neg_guardar_origem_pessoa(uuid, uuid, uuid) IS
  'Ficha da pessoa: muda a origem (lead_sources activa da organização; NULL limpa). Exige pessoas.edit e âmbito de edição. Devolve {origin_id, mudou}.';

-- -----------------------------------------------------------------------------
-- 11. Backfill: só a org nike. Pessoas vivas, não clientes, sem abordagem
--     encerrada e sem negócio nenhum (apagados incluídos); fora as fichas de
--     utilizadores e de organizações. Não marca submissões. Hoje: 0 linhas.
-- -----------------------------------------------------------------------------
INSERT INTO public.negocios (organization_id, entity_id, titulo, fecho)
SELECT e.organization_id, e.id, public.fn_neg_titulo_de_nome(e.display_name), 'contrato'
FROM public.anew_entities e
WHERE e.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
  AND e.type = 'person'
  AND e.deleted_at IS NULL
  AND e.client_since IS NULL
  AND e.closure_result IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.entity_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = e.id);

-- -----------------------------------------------------------------------------
-- 12. Conferir (só leituras do catálogo; falha se algo não ficou como devia)
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  v_n     bigint;
  v_nome  text;
  v_txt   text;
  v_ok    boolean;
  r       record;
BEGIN
  -- 12a. exactamente uma assinatura por nome
  FOREACH v_nome IN ARRAY ARRAY['fn_neg_titulo_de_nome', 'fn_negocios_preparar_insercao',
                                'fn_form_entidade_no_ambito', 'fn_neg_pessoa_no_ambito',
                                'fn_form_criar_entidade', 'fn_form_completar_entidade',
                                'rpc_resolve_form_submission', 'neg_resumo_quadro',
                                'neg_guardar_origem_pessoa', 'fn_neg_exigir_pessoa',
                                'fn_neg_pessoa_por_negocio', 'fn_neg_entidade_partilhada']
  LOOP
    SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: public.% tem % assinaturas (esperava 1).', v_nome, v_n;
    END IF;
  END LOOP;

  -- 12b. DEFINER, search_path e ACL de cada função
  FOR r IN
    SELECT p.proname::text AS nome,
           p.prosecdef AS definer,
           (p.proacl IS NULL) AS acl_nula,
           COALESCE(p.proacl::text, '') AS acl_txt,
           COALESCE(p.proconfig, ARRAY[]::text[]) AS cfg,
           EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                   WHERE a.grantee = 0 AND a.privilege_type::text = 'EXECUTE') AS g_public,
           EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                   JOIN pg_catalog.pg_roles ro ON ro.oid = a.grantee
                   WHERE ro.rolname::text = 'anon' AND a.privilege_type::text = 'EXECUTE') AS g_anon,
           EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                   JOIN pg_catalog.pg_roles ro ON ro.oid = a.grantee
                   WHERE ro.rolname::text = 'authenticated' AND a.privilege_type::text = 'EXECUTE') AS g_auth,
           EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                   JOIN pg_catalog.pg_roles ro ON ro.oid = a.grantee
                   WHERE ro.rolname::text = 'service_role' AND a.privilege_type::text = 'EXECUTE') AS g_srv
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname::text IN ('fn_neg_titulo_de_nome', 'fn_negocios_preparar_insercao',
                              'fn_form_entidade_no_ambito', 'fn_neg_pessoa_no_ambito',
                              'fn_form_criar_entidade', 'fn_form_completar_entidade',
                              'rpc_resolve_form_submission', 'neg_resumo_quadro',
                              'neg_guardar_origem_pessoa', 'fn_neg_exigir_pessoa',
                              'fn_neg_pessoa_por_negocio', 'fn_neg_entidade_partilhada')
  LOOP
    IF NOT ('search_path=public, pg_temp' = ANY (r.cfg)) THEN
      RAISE EXCEPTION 'Conferir: public.% sem search_path public, pg_temp (%).', r.nome, r.cfg::text;
    END IF;

    v_ok := CASE r.nome
      -- só funções DEFINER do postgres a chamam
      WHEN 'fn_neg_titulo_de_nome' THEN
        NOT r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND NOT r.g_auth
      WHEN 'fn_neg_entidade_partilhada' THEN
        NOT r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND NOT r.g_auth
      -- authenticated e service_role (a chama fn_neg_exigir_pessoa, INVOKER)
      WHEN 'fn_neg_pessoa_por_negocio' THEN
        r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND r.g_auth AND r.g_srv
      -- só service_role
      WHEN 'fn_form_criar_entidade' THEN
        r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND NOT r.g_auth AND r.g_srv
      -- authenticated, sem anon nem PUBLIC
      WHEN 'rpc_resolve_form_submission' THEN
        r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND r.g_auth
      WHEN 'neg_guardar_origem_pessoa' THEN
        r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND r.g_auth
      WHEN 'fn_form_entidade_no_ambito' THEN
        r.definer AND NOT r.acl_nula AND NOT r.g_public AND NOT r.g_anon AND r.g_auth
      -- recriadas com CREATE OR REPLACE: a ACL é a de antes
      WHEN 'neg_resumo_quadro' THEN
        NOT r.definer AND r.acl_txt = '{postgres=X/postgres,authenticated=X/postgres}'
        AND 'statement_timeout=5s' = ANY (r.cfg)
      -- fn_neg_pessoa_no_ambito não se recria (fica como estava)
      WHEN 'fn_neg_pessoa_no_ambito' THEN
        r.definer AND r.acl_txt = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      WHEN 'fn_neg_exigir_pessoa' THEN
        NOT r.definer AND r.acl_txt = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      WHEN 'fn_negocios_preparar_insercao' THEN
        r.definer AND r.acl_txt = '{postgres=X/postgres,service_role=X/postgres}'
      WHEN 'fn_form_completar_entidade' THEN
        r.definer AND r.acl_txt = '{postgres=X/postgres,service_role=X/postgres}'
      ELSE false
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Conferir: public.% com segurança ou ACL inesperada (definer %, acl %).',
        r.nome, r.definer::text, r.acl_txt;
    END IF;
  END LOOP;

  -- 12c. assinaturas e resultado
  SELECT pg_get_function_identity_arguments(p.oid)::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'rpc_resolve_form_submission';
  IF v_txt IS DISTINCT FROM
     'p_submission_id uuid, p_action text, p_field_overrides jsonb, p_entity_id uuid, p_confirmar_negocio_aberto boolean' THEN
    RAISE EXCEPTION 'Conferir: rpc_resolve_form_submission com assinatura %.', v_txt;
  END IF;
  SELECT pg_get_function_result(p.oid)::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_form_criar_entidade';
  IF v_txt IS DISTINCT FROM 'TABLE(entity_id uuid, submission_id uuid, created boolean, negocio_id uuid)' THEN
    RAISE EXCEPTION 'Conferir: fn_form_criar_entidade devolve %.', v_txt;
  END IF;

  -- 12d. o CHECK novo, com o texto esperado e validado
  SELECT pg_get_constraintdef(c.oid)::text, c.convalidated INTO v_txt, v_ok
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.form_submissions'::regclass
    AND c.conname::text = 'form_submissions_resolution_check';
  IF v_txt IS DISTINCT FROM 'CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY[''merged''::text, ''new_lead''::text, ''ligada''::text, ''negocio_criado''::text, ''duplicada''::text, ''negocio_automatico''::text]))))'
     OR v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conferir: form_submissions_resolution_check ficou % (validado %).', v_txt, v_ok::text;
  END IF;

  -- 12e. as políticas de leitura de form_submissions
  SELECT pol.qual::text INTO v_txt
  FROM pg_catalog.pg_policies pol
  WHERE pol.schemaname::text = 'public' AND pol.tablename::text = 'form_submissions'
    AND pol.policyname::text = 'form_submissions_select_org'
    AND pol.cmd::text = 'SELECT' AND pol.roles::text = '{authenticated}'
    AND pol.permissive::text = 'PERMISSIVE';
  -- só os nomes das funções (a forma exacta da expressão é do deparser)
  IF v_txt IS NULL
     OR position('get_user_crm_org_ids' IN v_txt) = 0
     OR position('fn_form_entidade_no_ambito' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: form_submissions_select_org ficou %.', COALESCE(v_txt, '(em falta)');
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_policies pol
  WHERE pol.schemaname::text = 'public' AND pol.tablename::text = 'form_submissions'
    AND pol.cmd::text = 'SELECT';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Conferir: form_submissions tem % políticas de leitura (esperava 2).', v_n;
  END IF;

  -- 12f. o gatilho de inserção honra app.neg_sem_autor
  SELECT pg_get_functiondef(p.oid)::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_negocios_preparar_insercao';
  IF position('app.neg_sem_autor' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: fn_negocios_preparar_insercao sem app.neg_sem_autor.';
  END IF;

  -- 12g. a RLS de anew_entities e satélites não mudou: as três funções em que
  --      assenta têm o mesmo md5 de antes (a guarda 0b conferiu-o à entrada)
  FOR r IN
    SELECT x.nome, x.h FROM (VALUES
      ('fn_neg_pessoa_no_ambito', 'c7a7be70424773fad627a460dd0e7030'),
      ('is_entity_in_user_scope', '560e5adb4100388bed68920701642d68'),
      ('can_see_entity',          '593bd418631f20683b817ffc74371522')
    ) AS x(nome, h)
  LOOP
    SELECT md5(pg_get_functiondef(p.oid))::text INTO v_txt
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = r.nome;
    IF v_txt IS DISTINCT FROM r.h THEN
      RAISE EXCEPTION 'Conferir: public.% mudou (md5 %, esperado %).', r.nome, v_txt, r.h;
    END IF;
  END LOOP;

  -- 12h. fn_neg_exigir_pessoa leva o ramo do dono do negócio
  SELECT p.prosrc::text INTO v_txt
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'fn_neg_exigir_pessoa';
  IF position('fn_neg_pessoa_por_negocio' IN v_txt) = 0 THEN
    RAISE EXCEPTION 'Conferir: fn_neg_exigir_pessoa sem fn_neg_pessoa_por_negocio.';
  END IF;
END
$conferir$;

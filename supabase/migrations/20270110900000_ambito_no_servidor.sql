-- =============================================================================
-- 20270110400000 — permissões, lote 2: o âmbito (NONE/OWNED/TEAM/ORG) aplicado no servidor (aprovado pelo utilizador, 09/11)
-- =============================================================================
-- Só permissões ("quem pode ver/fazer o quê"). Sem tabelas nem colunas novas: funções e policies.
-- Âmbito: anew_membership_permission_scopes (sem linha = OWNED), crm_scope_keys / resolve_lead_access_context.
-- "Próprio" não muda de definição: assigned_to / created_by (anew_users.id e auth.uid). Onde o ecrã e a RLS diferem, o servidor usa
-- a UNIÃO das duas (nunca esconde o que o ecrã hoje mostra com o seu próprio filtro de âmbito).
-- Admin (super_admin na organização ou numa acima; system_admin) = ORG.
--
-- 1. Negócios: neg_ler_negocios / obra_ler_negocios filtram pelo âmbito de pessoas.view; neg_guardar_negocio /
--    obra_guardar_negocio pedem o âmbito de pessoas.edit sobre o negócio. O Papel no Negócio mantém-se: quem entra sem a
--    permissão no perfil, ou tem um Papel no Negócio (pessoas_papeis_negocio) que a dá, vê/grava todos (fn_neg_ambito_tudo).
--    O técnico mantém as obras onde tem tarefas (ops_obra_tarefa_rh / tasks[].tec - fn_neg_tem_tarefa).
-- 2. rpc_save_quote: quotes.create (novo) / quotes.edit (existente) na organização + o âmbito de quotes.edit sobre o orçamento.
--    Chamadores: QuoteBuilder (Orçamentos e a ficha da pessoa) e neg_criar_orcamento (INVOKER, mesmo utilizador). Os Negócios
--    gravam orçamentos por neg_guardar_negocio, que não passa por aqui. Nenhum caminho sem utilizador (já pedia
--    current_business_user_id()).
-- 3. SELECT de quotes / proposals / client_contracts com o âmbito da permissão view: a cadeia do negócio comercial
--    (fn_doc_no_ambito: o próprio registo, o pedido de proposta e a lead, a proposta/orçamento/contrato ligados, o negócio que a
--    pessoa vê em Negócios). Portal do cliente ("Client can view own ..."), RPCs SECURITY DEFINER e a service_role não mudam.
-- 4. Editar/eliminar com as chaves da própria ação (antes as de view): quotes_update_policy, proposals UPDATE, client_contracts
--    UPDATE/DELETE; cancel_and_replace_contract com o bloco de âmbito de rpc_update_client_contract; _soft_delete_business_entity_impl:
--    proposals.delete por organização (como quotes.delete) e âmbito de quotes.delete / proposals.delete.
-- 5. NONE nega no servidor: resolve_lead_access_context (e por ele crm_scope_keys), get_schedule_item_scope_context,
--    get_proposal_edit_scope. Em 09/11 não há nenhuma linha NONE (nem TEAM/ORG) em anew_membership_permission_scopes.
-- 6. get_proposal_edit_scope: atalho de admin (ORG), como os outros.
-- Corpos a partir de pg_get_functiondef VIVO (09/11/2026); a guarda para se algum corpo ou policy mudou desde a leitura.
-- =============================================================================

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.resolve_lead_access_context(uuid,text,text)'::regprocedure) IS DISTINCT FROM '8a979aaf50a50a5482fde5d9aa3fcb56' THEN
    RAISE EXCEPTION 'public.resolve_lead_access_context(uuid,text,text) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_schedule_item_scope_context(uuid,text)'::regprocedure) IS DISTINCT FROM '46f62eb2e3cc19a48203fff3f34da192' THEN
    RAISE EXCEPTION 'public.get_schedule_item_scope_context(uuid,text) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_proposal_edit_scope(uuid,uuid)'::regprocedure) IS DISTINCT FROM '0e1bedd199f78b6524846a0c621bb783' THEN
    RAISE EXCEPTION 'public.get_proposal_edit_scope(uuid,uuid) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.neg_ler_negocios(uuid)'::regprocedure) IS DISTINCT FROM '623e5f7d73d522717bb4c395ba972d6f' THEN
    RAISE EXCEPTION 'public.neg_ler_negocios(uuid) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.obra_ler_negocios(uuid)'::regprocedure) IS DISTINCT FROM '1dd9aa09c7d1620ea08d4ef801a1f6f5' THEN
    RAISE EXCEPTION 'public.obra_ler_negocios(uuid) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) IS DISTINCT FROM 'd8078abf941569b4538bcd14d9368260' THEN
    RAISE EXCEPTION 'public.neg_guardar_negocio(uuid,uuid,jsonb) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure) IS DISTINCT FROM 'd8118365e14039f017965216bb551490' THEN
    RAISE EXCEPTION 'public.obra_guardar_negocio(uuid,uuid,jsonb) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure) IS DISTINCT FROM 'd92ea74c7c13ecec17ddeebaa654cc29' THEN
    RAISE EXCEPTION 'public.rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.cancel_and_replace_contract(uuid,text,boolean)'::regprocedure) IS DISTINCT FROM 'a313f87f8739500cba33a9e8794edaaf' THEN
    RAISE EXCEPTION 'public.cancel_and_replace_contract(uuid,text,boolean) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._soft_delete_business_entity_impl(text,uuid,uuid,uuid)'::regprocedure) IS DISTINCT FROM 'fab25d08f88c88529967a10a69c7aa50' THEN
    RAISE EXCEPTION 'public._soft_delete_business_entity_impl(text,uuid,uuid,uuid) mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quotes' AND policyname = 'quotes_select_policy') IS DISTINCT FROM 'ed16453946d03ca889e05fe58bdeae52' THEN
    RAISE EXCEPTION 'policy quotes."quotes_select_policy" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposals' AND policyname = 'Users can view proposals in their scope') IS DISTINCT FROM '7ed24fc5569b43cbb39ba3803f229cbc' THEN
    RAISE EXCEPTION 'policy proposals."Users can view proposals in their scope" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_contracts' AND policyname = 'client_contracts_select') IS DISTINCT FROM '5a252d9ff21a969326a7f84aa4c4e2fe' THEN
    RAISE EXCEPTION 'policy client_contracts."client_contracts_select" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quotes' AND policyname = 'quotes_update_policy') IS DISTINCT FROM '5fbc14a70fce079209a7e89689d4b09f' THEN
    RAISE EXCEPTION 'policy quotes."quotes_update_policy" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'proposals' AND policyname = 'Users with permission can update proposals') IS DISTINCT FROM 'd9f598512781b7d5298d170393b983d4' THEN
    RAISE EXCEPTION 'policy proposals."Users with permission can update proposals" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_contracts' AND policyname = 'client_contracts_update') IS DISTINCT FROM '9499cf242c70068ed5b8eb30c2b979b8' THEN
    RAISE EXCEPTION 'policy client_contracts."client_contracts_update" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_contracts' AND policyname = 'client_contracts_delete') IS DISTINCT FROM 'ad4c36ec9700db5f82b13e3279241393' THEN
    RAISE EXCEPTION 'policy client_contracts."client_contracts_delete" mudou desde a leitura de 09/11: rever antes de aplicar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.anew_membership_permission_scopes WHERE scope_level = 'NONE') THEN
    RAISE NOTICE 'Há linhas NONE em anew_membership_permission_scopes: passam a negar no servidor';
  END IF;
END
$guarda$;

-- ── Funções auxiliares novas (só leitura; sem tabelas nem colunas) ─────────────────────────────────────────────────────────────

-- O atalho de admin, o mesmo de resolve_lead_access_context: system_admin (o papel global, ou uma associação com esse código) e
-- super_admin na organização ou numa acima = ORG.
CREATE OR REPLACE FUNCTION public.fn_ambito_admin(p_auth uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_auth IS NOT NULL AND p_org IS NOT NULL AND (
    public.is_system_admin(p_auth)
    OR EXISTS (
      WITH RECURSIVE cadeia(org) AS (
        SELECT p_org
        UNION
        SELECT h.parent_org_id FROM public.anew_hierarchy h JOIN cadeia c ON c.org = h.child_org_id
        WHERE h.parent_org_id IS NOT NULL
      )
      SELECT 1
      FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id
      JOIN public.anew_roles r ON r.id = m.role_id
      WHERE u.auth_user_id = p_auth AND m.status = 'active'
        AND (r.code = 'system_admin' OR (r.code = 'super_admin' AND m.organization_id IN (SELECT org FROM cadeia)))))
$function$;

-- As chaves de crm_scope_keys casam com o dono de um registo? (org:* ou org:<um dos donos>; os donos nulos não contam)
CREATE OR REPLACE FUNCTION public.fn_ambito_casa(p_chaves text[], p_org uuid, p_donos uuid[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p_org IS NOT NULL AND coalesce(p_chaves, '{}'::text[]) && (
    ARRAY[p_org::text || ':*']
    || ARRAY(SELECT p_org::text || ':' || d::text FROM unnest(coalesce(p_donos, '{}'::uuid[])) AS d WHERE d IS NOT NULL))
$function$;

-- Negócios: quem vê/grava TODOS os negócios da organização com esta permissão (decisão 09/11: o Papel no Negócio mantém-se como
-- está). Usar SÓ depois da guarda da própria função (fn_cat_exigir/fn_cat_exigir_uma), que já decidiu que a pessoa entra:
--   admin (fn_ambito_admin)
--   OU não tem a permissão no perfil nesta organização (entrou pelo Papel no Negócio, ou por outra permissão da guarda, p.ex.
--      negocios.obra.planear/executar) - fica como antes
--   OU tem um Papel no Negócio (pessoas_papeis_negocio) que dá a permissão.
-- Quem tem a permissão no perfil e nenhum destes fica com o âmbito do perfil (crm_scope_keys).
-- O 'tecnico' que vem do cargo (fn_rh_pessoa_tecnica) não está em pessoas_papeis_negocio: o técnico com perfil fica com o âmbito
-- do perfil MAIS as obras onde tem tarefas (fn_neg_tem_tarefa).
CREATE OR REPLACE FUNCTION public.fn_neg_ambito_tudo(p_org uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_org IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.fn_ambito_admin(auth.uid(), p_org)
    OR NOT public.has_anew_permission_in_org(auth.uid(), p_perm, p_org)
    OR EXISTS (SELECT 1
               FROM public.pessoas_papeis_negocio pp
               JOIN public.neg_papeis_permissoes m ON m.papel = pp.papel AND m.permission_code = p_perm
               WHERE pp.pessoa_id = public.fn_neg_pessoa_da_conta(p_org) AND pp.organization_id = p_org))
$function$;

-- As organizações (das do utilizador) onde ele vê todos os negócios com esta permissão - para as policies, onde não há a guarda
-- da função: aqui pede-se também fn_cat_pode (perfil, papel ou admin de sistema).
CREATE OR REPLACE FUNCTION public.fn_neg_orgs_tudo(p_perm text)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(array_agg(x.o), '{}'::uuid[])
  FROM (SELECT DISTINCT o FROM public.get_user_crm_org_ids(auth.uid()) AS o) x
  WHERE public.fn_cat_pode(x.o, p_perm) AND public.fn_neg_ambito_tudo(x.o, p_perm)
$function$;

-- A pessoa (ficha do RH) tem tarefas na obra deste negócio? (ops_obra_tarefa_rh, ou tasks[].tec no estado da Emylia - os mesmos
-- dois sítios que obra_guardar_negocio / fn_obra_execucao_permitida usam para "as tarefas dele")
CREATE OR REPLACE FUNCTION public.fn_neg_tem_tarefa(p_negocio uuid, p_pessoa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_negocio IS NOT NULL AND p_pessoa IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ops_obra o
    WHERE o.negocio_id = p_negocio
      AND (EXISTS (SELECT 1 FROM public.ops_obra_tarefa_rh r WHERE r.obra_id = o.id AND r.pessoa_id = p_pessoa)
           OR EXISTS (SELECT 1
                      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.estado_emylia -> 'plano' -> 'tasks') = 'array'
                                                     THEN o.estado_emylia -> 'plano' -> 'tasks' ELSE '[]'::jsonb END) t
                      WHERE t ->> 'tec' = p_pessoa::text)))
$function$;

-- Os negócios em cuja obra a pessoa tem tarefas (o mesmo critério de fn_neg_tem_tarefa), de uma vez: numa organização, ou em
-- todas as do utilizador (p_org NULL, para as policies). Calculado uma vez por consulta, em vez de ler o plano de cada obra por linha.
CREATE OR REPLACE FUNCTION public.fn_neg_ids_com_tarefa(p_org uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH orgs AS (
    SELECT p_org AS org WHERE p_org IS NOT NULL
    UNION
    SELECT o FROM public.get_user_crm_org_ids(auth.uid()) AS o WHERE p_org IS NULL
  ), eu AS (
    SELECT orgs.org, public.fn_neg_pessoa_da_conta(orgs.org) AS pessoa FROM orgs
  )
  SELECT coalesce(array_agg(DISTINCT o.negocio_id), '{}'::uuid[])
  FROM eu
  JOIN public.ops_obra o ON o.organization_id = eu.org AND o.negocio_id IS NOT NULL
  WHERE auth.uid() IS NOT NULL AND eu.pessoa IS NOT NULL
    AND (EXISTS (SELECT 1 FROM public.ops_obra_tarefa_rh r WHERE r.obra_id = o.id AND r.pessoa_id = eu.pessoa)
         OR EXISTS (SELECT 1
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.estado_emylia -> 'plano' -> 'tasks') = 'array'
                                                   THEN o.estado_emylia -> 'plano' -> 'tasks' ELSE '[]'::jsonb END) t
                    WHERE t ->> 'tec' = eu.pessoa::text))
$function$;

-- Um negócio está no âmbito desta permissão (gravar)? Usar SÓ depois da guarda da função (ver fn_neg_ambito_tudo).
CREATE OR REPLACE FUNCTION public.fn_neg_no_ambito(p_neg negocios, p_perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_neg.id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF public.fn_neg_ambito_tudo(p_neg.organization_id, p_perm) THEN
    RETURN true;
  END IF;
  IF public.fn_ambito_casa(public.crm_scope_keys(p_perm), p_neg.organization_id, ARRAY[p_neg.assigned_to, p_neg.created_by]) THEN
    RETURN true;
  END IF;
  RETURN public.fn_neg_tem_tarefa(p_neg.id, public.fn_neg_pessoa_da_conta(p_neg.organization_id));
END
$function$;

-- Orçamento / proposta / contrato no âmbito? A UNIÃO do "próprio" dos ecrãs e da RLS, sobre a cadeia do negócio comercial:
--   o próprio registo (created_by, assigned_to);
--   o pedido de proposta (deals: created_by, assigned_to) e a lead dele (anew_leads: created_by, assigned_to) - a lista de
--     Orçamentos e a de Propostas contam estes como "meus";
--   a proposta, o orçamento e o contrato ligados entre si (quotes.proposal_id, client_contracts.quote_id/proposal_id,
--     proposals.client_contract_id) - os ecrãs abrem uns a partir dos outros (PDF da proposta, documento do contrato);
--   o negócio (negocio_id): os donos dele, ou o negócio que a pessoa vê em Negócios (p_orgs_neg = vê todos; p_chaves_neg =
--     âmbito de pessoas.view; p_negs_tarefa = tem tarefas na obra) - neg_ler_negocios já mostra os orçamentos e contratos do negócio.
-- p_chaves = crm_scope_keys(<permissão do documento>). Nas policies os quatro arrays vêm de subconsultas (calculados uma vez por
-- consulta). Não verifica a permissão nem a organização visível: isso fica na policy / na RPC que a chama.
CREATE OR REPLACE FUNCTION public.fn_doc_no_ambito(p_tipo text, p_id uuid, p_org uuid, p_chaves text[], p_chaves_neg text[], p_orgs_neg uuid[], p_negs_tarefa uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 COST 1000
AS $function$
DECLARE
  v_donos uuid[] := '{}';
  v_deals uuid[] := '{}';
  v_negs  uuid[] := '{}';
  v_prop  uuid;
  v_cc    uuid;
  v_a     uuid[];
  v_b     uuid[];
  v_c     uuid[];
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_org IS NULL THEN
    RETURN false;
  END IF;
  IF (p_org::text || ':*') = ANY (coalesce(p_chaves, '{}'::text[])) THEN
    RETURN true;
  END IF;

  -- 1. o registo e o que está a um passo (por chave primária / índice)
  IF p_tipo = 'quote' THEN
    SELECT ARRAY[q.created_by, q.assigned_to, p.created_by, p.assigned_to], ARRAY[q.deal_id, p.deal_id],
           ARRAY[q.negocio_id, p.negocio_id], q.proposal_id, p.client_contract_id
      INTO v_donos, v_deals, v_negs, v_prop, v_cc
    FROM public.quotes q LEFT JOIN public.proposals p ON p.id = q.proposal_id
    WHERE q.id = p_id;
  ELSIF p_tipo = 'proposal' THEN
    SELECT ARRAY[p.created_by, p.assigned_to], ARRAY[p.deal_id], ARRAY[p.negocio_id], p.id, p.client_contract_id
      INTO v_donos, v_deals, v_negs, v_prop, v_cc
    FROM public.proposals p WHERE p.id = p_id;
    SELECT array_agg(q.created_by) || array_agg(q.assigned_to), array_agg(q.deal_id), array_agg(q.negocio_id)
      INTO v_a, v_b, v_c
    FROM public.quotes q WHERE q.proposal_id = p_id;
    v_donos := v_donos || coalesce(v_a, '{}'); v_deals := v_deals || coalesce(v_b, '{}'); v_negs := v_negs || coalesce(v_c, '{}');
  ELSIF p_tipo = 'contract' THEN
    SELECT ARRAY[c.created_by, c.assigned_to, p.created_by, p.assigned_to, q.created_by, q.assigned_to],
           ARRAY[p.deal_id, q.deal_id], ARRAY[c.negocio_id, p.negocio_id, q.negocio_id]
      INTO v_donos, v_deals, v_negs
    FROM public.client_contracts c
    LEFT JOIN public.proposals p ON p.id = c.proposal_id
    LEFT JOIN public.quotes q ON q.id = c.quote_id
    WHERE c.id = p_id;
    SELECT array_agg(p.created_by) || array_agg(p.assigned_to), array_agg(p.deal_id), array_agg(p.negocio_id)
      INTO v_a, v_b, v_c
    FROM public.proposals p WHERE p.client_contract_id = p_id;
    v_donos := v_donos || coalesce(v_a, '{}'); v_deals := v_deals || coalesce(v_b, '{}'); v_negs := v_negs || coalesce(v_c, '{}');
  ELSE
    RETURN false;
  END IF;

  IF public.fn_ambito_casa(p_chaves, p_org, v_donos) THEN
    RETURN true;
  END IF;

  -- 2. o pedido de proposta e a lead dele
  IF EXISTS (SELECT 1 FROM public.deals d LEFT JOIN public.anew_leads l ON l.id = d.lead_id
             WHERE d.id = ANY (v_deals)
               AND public.fn_ambito_casa(p_chaves, d.organization_id, ARRAY[d.created_by, d.assigned_to, l.created_by, l.assigned_to])) THEN
    RETURN true;
  END IF;

  -- 3. os contratos ligados ao orçamento / à proposta (a tabela não tem índice por quote_id/proposal_id: fica para o fim)
  IF p_tipo IN ('quote', 'proposal') THEN
    v_a := NULL; v_c := NULL;
    SELECT array_agg(c.created_by) || array_agg(c.assigned_to), array_agg(c.negocio_id)
      INTO v_a, v_c
    FROM public.client_contracts c
    WHERE c.id = v_cc
       OR (p_tipo = 'quote' AND c.quote_id = p_id)
       OR (v_prop IS NOT NULL AND c.proposal_id = v_prop);
    IF public.fn_ambito_casa(p_chaves, p_org, v_a) THEN
      RETURN true;
    END IF;
    v_negs := v_negs || coalesce(v_c, '{}');
  END IF;

  -- 4. o negócio
  RETURN EXISTS (
    SELECT 1 FROM public.negocios n
    WHERE n.id = ANY (v_negs) AND n.deleted_at IS NULL
      AND (n.organization_id = ANY (coalesce(p_orgs_neg, '{}'::uuid[]))
           OR public.fn_ambito_casa(p_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR public.fn_ambito_casa(p_chaves_neg, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (coalesce(p_negs_tarefa, '{}'::uuid[]))));
END
$function$;

-- Para as RPCs (um registo de cada vez): admin = ORG; senão fn_doc_no_ambito com as chaves da ação (p_perm) e, para o negócio,
-- as de p_perm_neg (gravar/apagar: pessoas.edit - quem grava o negócio grava os documentos dele).
CREATE OR REPLACE FUNCTION public.fn_doc_no_ambito_acao(p_tipo text, p_id uuid, p_perm text, p_perm_neg text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL THEN
    RETURN false;
  END IF;
  v_org := CASE p_tipo
             WHEN 'quote' THEN (SELECT q.organization_id FROM public.quotes q WHERE q.id = p_id)
             WHEN 'proposal' THEN (SELECT p.organization_id FROM public.proposals p WHERE p.id = p_id)
             WHEN 'contract' THEN (SELECT c.organization_id FROM public.client_contracts c WHERE c.id = p_id)
           END;
  IF v_org IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.fn_ambito_admin(auth.uid(), v_org)
      OR public.fn_doc_no_ambito(p_tipo, p_id, v_org, public.crm_scope_keys(p_perm), public.crm_scope_keys(p_perm_neg),
                                 public.fn_neg_orgs_tudo(p_perm_neg), public.fn_neg_ids_com_tarefa(NULL::uuid));
END
$function$;

-- Permissões de execução, como as auxiliares que já existem: as duas que as policies chamam ficam como crm_scope_keys
-- (authenticated e service_role); as internas só são chamadas por funções SECURITY DEFINER (como fn_neg_ambito_pessoas).
REVOKE ALL ON FUNCTION public.fn_doc_no_ambito(text, uuid, uuid, text[], text[], uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_doc_no_ambito(text, uuid, uuid, text[], text[], uuid[], uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_orgs_tudo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_orgs_tudo(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_ids_com_tarefa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_ids_com_tarefa(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_ambito_admin(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_ambito_casa(text[], uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_ambito_tudo(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_tem_tarefa(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_no_ambito(negocios, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_doc_no_ambito_acao(text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;


-- ── Funções alteradas (a partir de pg_get_functiondef VIVO de 09/11/2026; só as linhas marcadas 20270110400000) ─────────────


-- resolve_lead_access_context(uuid,text,text)
CREATE OR REPLACE FUNCTION public.resolve_lead_access_context(p_org_id uuid, p_requested_scope text DEFAULT 'ORG'::text, p_permission_code text DEFAULT 'leads.view'::text)
 RETURNS TABLE(auth_user_id uuid, anew_user_id uuid, visible_org_ids uuid[], requested_scope text, permitted_scope text, applied_scope text, team_user_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_visible_org_ids uuid[];
  v_requested_scope text;
  v_permitted_scope text := 'OWNED';
  v_applied_scope text := 'OWNED';
  v_team_user_ids uuid[] := ARRAY[]::uuid[];
  v_is_admin boolean := false;
  v_has_permission boolean := false;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  SELECT au.id
  INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'business user not found for auth user';
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_crm_org_ids(v_auth_uid)
  )
  INTO v_visible_org_ids;

  IF NOT (p_org_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'permission denied: organization not visible';
  END IF;

  v_requested_scope := UPPER(COALESCE(NULLIF(BTRIM(p_requested_scope), ''), 'ORG'));
  IF v_requested_scope = 'ALL' THEN
    v_requested_scope := 'ORG';
  END IF;
  IF v_requested_scope NOT IN ('ORG', 'TEAM', 'OWNED') THEN
    v_requested_scope := 'ORG';
  END IF;

  WITH RECURSIVE
  admin_memberships AS (
    SELECT m.id, m.organization_id, r.code AS role_code
    FROM public.anew_memberships m
    JOIN public.anew_roles r ON r.id = m.role_id
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND r.code IN ('system_admin', 'super_admin')
  ),
  super_roots AS (
    SELECT organization_id
    FROM admin_memberships
    WHERE role_code = 'super_admin'
  ),
  super_descendants AS (
    SELECT organization_id FROM super_roots
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN super_descendants d ON d.organization_id = h.parent_org_id
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM admin_memberships
      WHERE role_code = 'system_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM super_descendants
      WHERE organization_id = p_org_id
    )
  INTO v_is_admin;

  WITH RECURSIVE org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped_memberships sm
    JOIN public.anew_role_permissions arp
      ON arp.role_id = sm.role_id
     AND arp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  IF NOT v_is_admin AND NOT v_has_permission THEN
    RAISE EXCEPTION 'permission denied: % required', p_permission_code;
  END IF;

  IF v_is_admin THEN
    v_permitted_scope := 'ORG';
  ELSE
    -- Scope comes ONLY from memberships in this organization.
    WITH own_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id = p_org_id
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      -- 20270110400000: uma linha NONE (e nenhuma OWNED) para esta permissão nesta organização = sem acesso, como o ecrã
      -- (usePermissionScope: o âmbito mais alto ganha, NONE é o mais baixo). Antes caía em OWNED.
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'NONE'
      ) AND NOT EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'OWNED'
      ) THEN 'NONE'
      ELSE 'OWNED'
    END
    INTO v_permitted_scope;

    IF v_permitted_scope = 'NONE' THEN
      RAISE EXCEPTION 'permission denied: % required', p_permission_code;
    END IF;
  END IF;

  IF v_requested_scope = 'ORG' THEN
    v_applied_scope := v_permitted_scope;
  ELSIF v_requested_scope = 'TEAM' THEN
    v_applied_scope := CASE
      WHEN v_permitted_scope IN ('ORG', 'TEAM') THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSE
    v_applied_scope := 'OWNED';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
  INTO v_team_user_ids
  FROM public.organization_teams t
  JOIN public.organization_team_members tm ON tm.team_id = t.id
  WHERE t.organization_id = p_org_id
    AND t.leader_id = v_anew_user_id;

  RETURN QUERY
  SELECT
    v_auth_uid,
    v_anew_user_id,
    COALESCE(v_visible_org_ids, ARRAY[]::uuid[]),
    v_requested_scope,
    v_permitted_scope,
    v_applied_scope,
    COALESCE(v_team_user_ids, ARRAY[]::uuid[]);
END;
$function$;


-- get_schedule_item_scope_context(uuid,text)
CREATE OR REPLACE FUNCTION public.get_schedule_item_scope_context(p_org_id uuid, p_permission_code text)
 RETURNS TABLE(applied_scope text, owner_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE me AS (
    SELECT au.id AS anew_user_id
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid()
    LIMIT 1
  ),
  org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m, me
    WHERE m.user_id = me.anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  ),
  own_memberships AS (
    SELECT m.id
    FROM public.anew_memberships m, me
    WHERE m.user_id = me.anew_user_id
      AND m.status = 'active'
      AND m.organization_id = p_org_id
  ),
  resolved AS (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM scoped_memberships sm
        JOIN public.anew_roles r ON r.id = sm.role_id
        WHERE r.code IN ('system_admin', 'super_admin')
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      -- 20270110400000: uma linha NONE (e nenhuma OWNED) nesta organização = sem acesso (owner_ids vazio). Antes caía em OWNED.
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'NONE'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'OWNED'
      ) THEN 'NONE'
      ELSE 'OWNED'
    END AS scope
  )
  SELECT
    r.scope,
    CASE WHEN r.scope = 'NONE' THEN ARRAY[]::uuid[] ELSE (
      COALESCE(
        (SELECT ARRAY_AGG(DISTINCT tm.user_id)
         FROM public.organization_teams t
         JOIN public.organization_team_members tm ON tm.team_id = t.id, me
         WHERE t.organization_id IN (SELECT org_id FROM org_chain)
           AND t.leader_id = me.anew_user_id
           AND r.scope = 'TEAM'),
        ARRAY[]::uuid[]
      ) || (SELECT anew_user_id FROM me)
    ) END
  FROM resolved r, me;
$function$;


-- get_proposal_edit_scope(uuid,uuid)
CREATE OR REPLACE FUNCTION public.get_proposal_edit_scope(_auth_uid uuid, _org_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _org_id IS NULL THEN NULL
    -- 20270110400000: super_admin na organização (ou numa acima) e system_admin = ORG, como resolve_lead_access_context
    WHEN public.fn_ambito_admin(_auth_uid, _org_id) THEN 'ORG'
    -- No active membership IN THIS ORGANIZATION grants proposals.edit -> NULL.
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_role_permissions arp
        ON arp.role_id = am.role_id
       AND arp.permission_code = 'proposals.edit'
      WHERE au.auth_user_id = _auth_uid
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'ORG'
      WHERE au.auth_user_id = _auth_uid
    ) THEN 'ORG'
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'TEAM'
      WHERE au.auth_user_id = _auth_uid
    ) THEN 'TEAM'
    -- 20270110400000: só linhas NONE (nenhuma OWNED) = sem acesso, como o ecrã
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'NONE'
      WHERE au.auth_user_id = _auth_uid
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'OWNED'
      WHERE au.auth_user_id = _auth_uid
    ) THEN NULL
    -- Has proposals.edit in this org but no ORG/TEAM scope row -> OWNED.
    ELSE 'OWNED'
  END
$function$;


-- neg_ler_negocios(uuid)
CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ver boolean := public.fn_quote_custos_pode(p_org); -- 20270102210000: sem ele, o custo dos produtos vem a null (20270110200000: a regra única)
  -- 20270110400000: o âmbito de pessoas.view (dono = assigned_to/created_by). Vê tudo: admin, quem entra só pelo Papel no Negócio ou
  -- tem um Papel no Negócio que dá pessoas.view (fn_neg_ambito_tudo). Mais: as obras onde a pessoa tem tarefas.
  v_tudo boolean; v_chaves text[]; v_tarefas uuid[];
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  v_tudo := public.fn_neg_ambito_tudo(p_org, 'pessoas.view');
  IF NOT v_tudo THEN
    v_chaves := public.crm_scope_keys('pessoas.view');
    v_tarefas := public.fn_neg_ids_com_tarefa(p_org);
  END IF;
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.numero), '[]') INTO r FROM (
    SELECT n.numero, jsonb_build_object(
      'negocio', jsonb_build_object('id', n.id, 'entity_id', n.entity_id, 'numero', n.numero, 'titulo', n.titulo,
        'telefone', coalesce(nullif(btrim(e.phone), ''), (SELECT ep.phone_number FROM anew_entity_phones ep WHERE ep.entity_id = e.id
                     ORDER BY ep.is_primary DESC NULLS LAST, ep.created_at DESC LIMIT 1), ''), -- 20270101390000
        'email', COALESCE(NULLIF(btrim(e.email), ''),
                   (SELECT em.email FROM public.anew_entity_emails em
                    WHERE em.entity_id = n.entity_id
                    ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1), ''),
        'fase', CASE WHEN n.anulado_em IS NULL THEN greatest(coalesce(n.fase, 0), public.fn_neg_fase_minima(n.id)) ELSE coalesce(n.fase, 0) END, 'linha', coalesce(n.linha, 'geral'), 'linha_por_definir', n.linha_por_definir, 'servico_pedido', coalesce(n.servico_pedido, ''),
        'morada_obra', coalesce(n.morada_obra, ''), 'origem', coalesce(n.origem, ''), 'pedido_em', n.pedido_em, 'dono_papel', coalesce(n.dono_papel, 'comercial'),
        'estado', CASE WHEN n.estado = 'perdido' THEN 'perdido' ELSE 'aberto' END, 'estado_crm', n.estado, 'motivo_perda', n.motivo_perda,
        'anulado_em', n.anulado_em, 'anulado_por', n.anulado_por, 'anulado_motivo', n.anulado_motivo, 'anulado_origem', n.anulado_origem,
        'fatura_numero', n.fatura_numero, 'fatura_em', n.fatura_em, 'fatura_paga', n.fatura_paga, 'recibo_numero', n.recibo_numero, 'recibo_em', n.recibo_em,
        'fluxo_emylia', n.fluxo_emylia,
        -- tem documentos do CRM: o ecrã da Emylia abre-o só de leitura (20261231994000)
        'docs_crm', public.fn_neg_docs_crm(n.id)),
      'respostas', coalesce((SELECT jsonb_agg(jsonb_build_object('campo_chave', r.campo_chave, 'valor', r.valor, 'sugerido', r.sugerido) ORDER BY r.campo_chave)
                    FROM negocio_respostas r WHERE r.negocio_id = n.id AND r.divisao = ''), '[]'),
      'visitas', to_jsonb(coalesce(m.visitas, '{}')),
      'medidas', jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0),
        'ptf', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptf END, 'ptq', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptq END,
        'necessidades', to_jsonb(coalesce(m.necessidades, '{}')), 'slot', coalesce(m.slot, ''), 'fotos_total', coalesce(m.fotos_total, 0),
        'fotos_exterior', NULLIF(m.fotos_exterior, 0), 'fotos_interior', NULLIF(m.fotos_interior, 0), 'fotos_area', NULLIF(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false)),
      'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                    'cliente_compra', s.cliente_compra, 'ordem', s.ordem) ORDER BY s.ordem) FROM negocio_servicos s WHERE s.negocio_id = n.id), '[]'),
      'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', CASE WHEN v_ver THEN p.custo_un END,
                    'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', p.cliente_fornece, 'servico', p.servico_id,
                    'fator', p.fator, 'sem_instalacao', p.sem_instalacao) ORDER BY p.ordem) FROM negocio_produtos p WHERE p.negocio_id = n.id),
      'partes_fora', (SELECT jsonb_agg(pf.parte ORDER BY pf.parte) FROM negocio_partes_fora pf WHERE pf.negocio_id = n.id),
      'orcamentos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_orcamento(q.id) ORDER BY q.versao) FROM quotes q
                    WHERE q.negocio_id = n.id AND q.fluxo_emylia AND q.deleted_at IS NULL), '[]'),
      'contratos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_contrato(c.id) ORDER BY c.versao) FROM client_contracts c
                    WHERE c.negocio_id = n.id AND c.versao IS NOT NULL AND c.deleted_at IS NULL), '[]'),
      'faturas', (SELECT jsonb_agg(jsonb_build_object('chave', f.chave, 'numero', f.numero, 'emitida_em', f.emitida_em, 'total', f.total,
                    'prestacao_ordem', qp.ordem, 'pdf_caminho', f.pdf_caminho,
                    'pagamento', (SELECT jsonb_build_object('validado_em', pg.validado_em, 'conta_destino', coalesce(pg.conta_destino, ''), 'referencia', coalesce(pg.referencia, ''))
                                  FROM pagamentos pg WHERE pg.fatura_id = f.id ORDER BY pg.comunicado_em LIMIT 1),
                    'recibo', (SELECT rc.numero FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id WHERE pg.fatura_id = f.id LIMIT 1))
                    ORDER BY f.emitida_em, f.numero)
                    FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM quotes qa WHERE qa.id = qp.quote_id AND qa.adenda_id IS NOT NULL)),
      -- a encomenda de cliente emitida no servidor (o contrato em vigor ou, na venda direta, o de suporte) e as das adendas (20261231999700)
      'ec', public.fn_neg_ler_ec(n.id),
      -- as adendas (20261231990000)
      'adendas', public.fn_neg_ler_adendas(n.id),
      'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', h.ordem, 'texto', h.texto, 'tipo', h.tipo, 'ocorrido_em', h.ocorrido_em) ORDER BY h.ordem)
                    FROM negocio_historico h WHERE h.negocio_id = n.id), '[]')
    ) j
    FROM negocios n
    LEFT JOIN anew_entities e ON e.id = n.entity_id
    LEFT JOIN negocio_medidas m ON m.negocio_id = n.id
    WHERE n.organization_id = p_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
      AND (v_tudo OR public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (v_tarefas)) -- 20270110400000
  ) x;
  RETURN r;
END $function$;


-- obra_ler_negocios(uuid)
CREATE OR REPLACE FUNCTION public.obra_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270110400000: as mesmas obras que neg_ler_negocios (o âmbito de pessoas.view sobre o negócio)
  v_tudo boolean; v_chaves text[]; v_tarefas uuid[];
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  v_tudo := public.fn_neg_ambito_tudo(p_org, 'pessoas.view');
  IF NOT v_tudo THEN
    v_chaves := public.crm_scope_keys('pessoas.view');
    v_tarefas := public.fn_neg_ids_com_tarefa(p_org);
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('negocio_id', o.negocio_id, 'obra_id', o.id, 'codigo', o.codigo, 'estado', o.estado,
                                        'emylia', o.estado_emylia) ORDER BY o.criada_em)
    FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL
    WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL
      AND (v_tudo OR public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (v_tarefas))), '[]'::jsonb); -- 20270110400000
END $function$;


-- neg_guardar_negocio(uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.neg_guardar_negocio(p_org uuid, p_negocio_id uuid, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; b jsonb := p_linhas->'negocio'; e jsonb; o jsonb; l jsonb; k jsonb;
  v_q uuid; v_l uuid; v_z uuid; v_prop uuid; v_atual uuid; v_aceite uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid;
  i int; v_iva numeric; v_tot numeric; v_estado text; v_status text; v_ids uuid[] := '{}'; v_avisos text[] := '{}';
  v_docs_crm boolean; v_q_base text; v_c_base text; v_fixo boolean;
  v_min smallint; v_fase smallint; v_ignorado boolean := false;
  v_antes jsonb; v_depois jsonb; -- 20270102210000
  v_dec_antes jsonb; v_dec_depois jsonb; -- 20270106040000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  -- 20270110400000: o âmbito de pessoas.edit sobre o negócio (dono = assigned_to/created_by; TEAM/ORG pelas chaves). Mantêm o acesso
  -- de antes: admin, quem entra sem pessoas.edit no perfil (Papel no Negócio, obra.planear/executar) ou tem um Papel no Negócio
  -- que dá pessoas.edit, e quem tem tarefas na obra deste negócio (fn_neg_no_ambito).
  IF NOT public.fn_neg_no_ambito(v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;

  -- um negócio do CRM (orçamentos, contratos ou vendas diretas do CRM) não se grava por aqui: abre-se em Contratos/Propostas; e o
  -- negócio só passa ao fluxo da Emylia se não tiver documentos do CRM (com fluxo_emylia a encomenda do CRM deixava de reservar) (20261231994000)
  v_docs_crm := public.fn_neg_docs_crm(p_negocio_id);
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND v_docs_crm THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- as permissões finas (20270102210000): pessoas.edit grava o comum (lead, visita, levantamento, serviços, histórico); o orçamento, a
  -- aprovação da margem, o envio da proposta e o contrato pedem cada um a sua, só quando mudam de verdade (a fotografia da base antes e
  -- depois). Quem não vê custos grava com os custos da base (a leitura deu-lhos a null); quem não edita o orçamento, com os totais da base.
  v_antes := public.fn_neg_marcas_permissoes(p_negocio_id);
  v_dec_antes := public.fn_neg_marcas_decisao_principal(p_negocio_id); -- 20270106040000
  -- 20270110200000: "vê custos" é a regra única fn_quote_custos_pode (a mesma da leitura): quem os vê grava-os.
  IF NOT public.fn_quote_custos_pode(p_org) THEN p_linhas := public.fn_neg_repor_custos(p_negocio_id, p_linhas); END IF;
  IF NOT public.fn_cat_pode(p_org, 'negocios.orcamento.editar') THEN p_linhas := public.fn_neg_repor_totais(p_negocio_id, p_linhas); END IF;

  -- a fase 4 (contrato assinado ou venda direta aceite) e a 5 (encomenda de cliente emitida) são do servidor, como a fatura, o
  -- pagamento, o recibo e a anulação (neg_registar_fatura, neg_validar_pagamento, neg_anular_contrato): do JSON fica só a fase até ao
  -- Negócio (3); o resto fica o da base, com aviso (20261231999700)
  v_min := public.fn_neg_fase_minima(p_negocio_id);
  v_fase := CASE WHEN v_neg.anulado_em IS NOT NULL THEN v_neg.fase
                 WHEN v_min > 0 THEN v_min
                 ELSE least(coalesce((b->>'fase')::smallint, 0), 3)::smallint END;
  IF b ? 'fase' AND (b->>'fase')::smallint IS DISTINCT FROM v_fase AND greatest(coalesce((b->>'fase')::smallint, 0), coalesce(v_fase, 0)) >= 4 THEN
    v_avisos := v_avisos || format('A fase %s só a dão o portal e o Financeiro (ficou %s).', b->>'fase', coalesce(v_fase, 0));
  END IF;
  IF (b ? 'fatura_numero' AND b->>'fatura_numero' IS DISTINCT FROM v_neg.fatura_numero)
     OR (b ? 'fatura_paga' AND coalesce((b->>'fatura_paga')::boolean, false) IS DISTINCT FROM coalesce(v_neg.fatura_paga, false))
     OR (b ? 'recibo_numero' AND b->>'recibo_numero' IS DISTINCT FROM v_neg.recibo_numero)
     OR (b ? 'anulado_em' AND (b->>'anulado_em' IS NULL) IS DISTINCT FROM (v_neg.anulado_em IS NULL)) THEN
    v_ignorado := true;
  END IF;

  -- o negócio (o título só muda num negócio aberto: o CRM protege o dos fechados)
  UPDATE negocios SET fase = v_fase, linha = b->>'linha', linha_por_definir = coalesce((b->>'linha_por_definir')::boolean, false),
    servico_pedido = b->>'servico_pedido', morada_obra = b->>'morada_obra', origem = b->>'origem', pedido_em = (b->>'pedido_em')::timestamptz,
    dono_papel = b->>'dono_papel',
    fluxo_emylia = coalesce(v_neg.fluxo_emylia, false) OR NOT v_docs_crm,
    titulo = CASE WHEN v_neg.estado = 'aberto' AND coalesce(b->>'titulo', '') <> '' THEN b->>'titulo' ELSE titulo END
  WHERE id = p_negocio_id;

  -- respostas, medidas, serviços e produtos da visita, partes tiradas, histórico (substituem-se)
  DELETE FROM negocio_respostas WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, valor, sugerido, atualizado_por)
  SELECT p_org, p_negocio_id, x->>'campo_chave', coalesce(x->>'valor', ''), coalesce((x->>'sugerido')::boolean, false), v_user
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'respostas')) x;
  e := p_linhas->'medidas';
  INSERT INTO negocio_medidas AS m (organization_id, negocio_id, pav, par, ptf, ptq, pts, pcs, necessidades, slot, fotos_total, fotos_exterior, fotos_interior, fotos_area, fechada, visitas)
  VALUES (p_org, p_negocio_id, coalesce((e->>'pav')::numeric, 0), coalesce((e->>'par')::numeric, 0), coalesce((e->>'ptf')::numeric, 0), coalesce((e->>'ptq')::numeric, 0),
    coalesce((e->>'pts')::numeric, 0), coalesce((e->>'pcs')::numeric, 0), ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(e->'necessidades'))), e->>'slot',
    coalesce((e->>'fotos_total')::smallint, 0), coalesce((e->>'fotos_exterior')::smallint, 0), coalesce((e->>'fotos_interior')::smallint, 0),
    coalesce((e->>'fotos_area')::smallint, 0), coalesce((e->>'fechada')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'visitas'))::smallint))
  ON CONFLICT (negocio_id) DO UPDATE SET pav = EXCLUDED.pav, par = EXCLUDED.par, ptf = EXCLUDED.ptf, ptq = EXCLUDED.ptq, pts = EXCLUDED.pts, pcs = EXCLUDED.pcs,
    necessidades = EXCLUDED.necessidades, slot = EXCLUDED.slot, fotos_total = EXCLUDED.fotos_total, fotos_exterior = EXCLUDED.fotos_exterior,
    fotos_interior = EXCLUDED.fotos_interior, fotos_area = EXCLUDED.fotos_area, fechada = EXCLUDED.fechada, visitas = EXCLUDED.visitas;
  DELETE FROM negocio_servicos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_servicos (organization_id, negocio_id, servico_id, inclusao, quantidade, mantem, cliente_compra, ordem)
  SELECT p_org, p_negocio_id, (x->>'servico')::uuid, x->>'inclusao', (x->>'quantidade')::numeric, (x->>'mantem')::boolean, x->>'cliente_compra', coalesce((x->>'ordem')::int, 0)
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'servicos')) x;
  DELETE FROM negocio_produtos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_produtos (organization_id, negocio_id, produto_id, quantidade, cliente_fornece, servico_id, sem_instalacao, ordem, nome, unidade, custo_un, pvp_un, categoria_id, fator)
  SELECT p_org, p_negocio_id, (x->>'produto')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid,
    coalesce((x->>'sem_instalacao')::boolean, false), (x->>'ordem')::int, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
    (x->>'categoria')::uuid, (x->>'fator')::numeric
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'produtos')) x;
  DELETE FROM negocio_partes_fora WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_partes_fora (organization_id, negocio_id, parte)
  SELECT DISTINCT p_org, p_negocio_id, x FROM jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'partes_fora')) x;
  DELETE FROM negocio_historico WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)
  SELECT p_org, p_negocio_id, (x->>'ordem')::int, coalesce((x->>'ocorrido_em')::timestamptz, now()), x->>'texto', x->>'tipo', NULL
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'historico')) x;

  -- orçamentos (quotes), uma linha por versão
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'orcamentos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id INTO v_q FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND versao = (o->>'versao')::smallint;
    IF v_q IS NULL THEN
      INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, modelo_base, versao, fluxo_emylia, estado)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero || ' · versão ' || (o->>'versao'),
        coalesce(o->>'modelo', ''), (o->>'versao')::smallint, true, 'rascunho')
      RETURNING id INTO v_q;
    END IF;
    -- a decisão do cliente (aceite, recusado) só a escreve o portal: a versão decidida fica como está (só passa a substituída, quando
    -- há versão nova); o JSON não a dá como aceite nem recusada; accepted_at, recusada_em e recusa_* ficam os da base (20261231994000)
    SELECT estado INTO v_q_base FROM quotes WHERE id = v_q;
    v_estado := o->>'estado';
    IF v_q_base IN ('aceite', 'rejeitado', 'recusado') THEN
      IF v_estado IS DISTINCT FROM 'substituido' THEN v_estado := v_q_base; END IF;
    ELSIF v_estado IN ('aceite', 'recusado', 'rejeitado') THEN
      v_avisos := v_avisos || format('Orçamento versão %s: a decisão do cliente só se regista no portal (ficou %s).', o->>'versao', coalesce(v_q_base, 'rascunho'));
      v_estado := coalesce(v_q_base, 'rascunho');
    END IF;
    UPDATE quotes SET modelo_base = coalesce(o->>'modelo', ''), estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
      desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2), venda_direta = coalesce((o->>'venda_direta')::boolean, false),
      inicio_obra = (o->>'inicio_obra')::date, equipa = (o->>'equipa')::smallint,
      verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END,
      aprovacao = o->>'aprovacao', motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos_versao'))), nota_versao = o->>'nota_versao',
      onde_refeita = o->>'onde_refeita',
      pedido_cliente_motivos = CASE WHEN o->'pedido_cliente' IS NOT NULL AND jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(o->'pedido_cliente'->'motivos')) END,
      pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
      enviado_em = (o->>'enviado_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
      aceite_antes_em = (o->>'aceite_antes_em')::timestamptz, preco_final = (o->>'preco_final')::numeric, total_com_iva = (o->>'total_com_iva')::numeric,
      subtotal = coalesce((o->>'preco_final')::numeric, subtotal), total = coalesce((o->>'total_com_iva')::numeric, total),
      prestacoes_por_fases = coalesce((o->>'prestacoes_por_fases')::boolean, false), sem_demolicao = coalesce((o->>'sem_demolicao')::boolean, false), updated_at = now()
    WHERE id = v_q;
    IF v_estado <> 'substituido' THEN v_atual := v_q; END IF;
    IF v_estado = 'aceite' THEN v_aceite := v_q; END IF;

    -- as linhas de uma versão aceite, assinada, com a encomenda emitida ou já usadas (encomenda a fornecedor, tarefa da obra) não se
    -- apagam nem se reescrevem: os ids ficam; se o JSON divergir, avisa-se (20261231994000)
    v_fixo := v_q_base = 'aceite'
      OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.quote_id = v_q AND c.deleted_at IS NULL
                 AND (c.status IN ('signed', 'assinado', 'active') OR c.ec_emitida_em IS NOT NULL))
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN purchase_order_items pi ON pi.quote_line_id = ql.id WHERE ql.quote_id = v_q)
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN ops_obra_tarefa t ON t.orcamento_linha_id = ql.id WHERE ql.quote_id = v_q);
    IF v_fixo THEN
      IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> jsonb_array_length(public.fn_neg_lista(o->'linhas'))
         OR (SELECT coalesce(sum(total_sem_iva), 0) FROM quote_lines WHERE quote_id = v_q)
            <> (SELECT coalesce(sum(round((x->>'quantidade')::numeric * (x->>'preco_un')::numeric, 2)), 0) FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) x) THEN
        v_avisos := v_avisos || format('Orçamento versão %s: já está aceite ou em curso, as linhas ficaram como estavam.', o->>'versao');
      END IF;
    ELSE
    -- linhas (substituem-se; as filhas vão com elas) e zonas
    DELETE FROM quote_lines WHERE quote_id = v_q;
    DELETE FROM quote_zonas WHERE quote_id = v_q;
    i := 0;
    FOR k IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'zonas')) LOOP
      i := i + 1;
      INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome) VALUES (p_org, v_q, i, k #>> '{}');
    END LOOP;
    -- as zonas que as linhas usam e não estão na lista (as versões anteriores não guardam a lista): criam-se pela ordem em que aparecem
    INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome)
    SELECT p_org, v_q, (SELECT coalesce(max(ordem), 0) FROM quote_zonas WHERE quote_id = v_q) + row_number() OVER (ORDER BY min(x.pos)), x.nome
    FROM (SELECT z.v->>'zona' AS nome, ln.n * 1000 + z.n AS pos
          FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) WITH ORDINALITY ln(v, n),
               jsonb_array_elements(public.fn_neg_lista(ln.v->'zonas')) WITH ORDINALITY z(v, n)) x
    WHERE NOT EXISTS (SELECT 1 FROM quote_zonas q2 WHERE q2.quote_id = v_q AND lower(btrim(q2.nome)) = lower(btrim(x.nome)))
    GROUP BY x.nome;
    FOR l IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) LOOP
      v_iva := coalesce((l->>'taxa_iva')::numeric, CASE WHEN l->>'parte_iva' = 'mao_obra' THEN 6 ELSE 23 END);
      v_tot := round((l->>'quantidade')::numeric * (l->>'preco_un')::numeric, 2);
      INSERT INTO quote_lines (quote_id, categoria, descricao_snapshot, qt, quantidade_exata, retail_price_unit, preco_un_exato, cost_price, custo_un_exato,
        iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, product_id, unidade, section_name, tipo_emylia, custo_manual, fornecedor,
        qtd_origem, preco_un_origem, custo_un_origem, custo_mao_obra_unit, custo_material_unit, margem_percent)
      VALUES (v_q, CASE WHEN l->>'tipo' = 'servico' THEN 'Serviços' ELSE 'Materiais' END,
        coalesce((SELECT s.name FROM services s WHERE s.id = (l->>'servico')::uuid), l->>'descricao', ''),
        -- uma linha de produto guarda o total (quantidade 1); qt e o preço unitário do CRM ficam com a quantidade real do produto, para a
        -- reserva e o pedido ao fornecedor da encomenda de cliente o verem (20261231980000)
        CASE WHEN l->>'tipo' = 'produto' AND l->>'qtd_origem' IS NOT NULL THEN round((l->>'qtd_origem')::numeric, 2) ELSE round((l->>'quantidade')::numeric, 2) END,
        (l->>'quantidade')::numeric,
        CASE WHEN l->>'tipo' = 'produto' AND l->>'preco_un_origem' IS NOT NULL THEN round((l->>'preco_un_origem')::numeric, 2) ELSE round((l->>'preco_un')::numeric, 2) END,
        (l->>'preco_un')::numeric,
        (l->'custo'->>'custo_un')::numeric, (l->'custo'->>'custo_un')::numeric, v_iva, l->>'taxa_iva' IS NOT NULL,
        v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int, (l->>'servico')::uuid, (l->>'produto')::uuid, l->>'unidade',
        coalesce(l->'zonas'->0->>'zona', 'Geral'), l->>'tipo', coalesce((l->'custo'->>'manual')::boolean, false), l->>'fornecedor',
        (l->>'qtd_origem')::numeric, (l->>'preco_un_origem')::numeric, (l->>'custo_un_origem')::numeric,
        CASE WHEN l->>'tipo' = 'servico' THEN round((l->'custo'->>'custo_un')::numeric, 2) ELSE 0 END,
        CASE WHEN l->>'tipo' = 'servico' THEN 0 ELSE round((l->'custo'->>'custo_un')::numeric, 2) END, 0)
      RETURNING id INTO v_l;
      k := l->'custo';
      INSERT INTO quote_line_custos (organization_id, quote_line_id, congelado, congelado_em, horas_un, mao_obra_un, equipamentos_un, consumiveis_un, estrutura_hora, estrutura_un, ajuste_un)
      VALUES (p_org, v_l, coalesce((k->>'congelado')::boolean, false), (k->>'congelado_em')::timestamptz, coalesce((k->>'horas_un')::numeric, 0),
        coalesce((k->>'mao_obra_un')::numeric, 0), coalesce((k->>'equipamentos_un')::numeric, 0), coalesce((k->>'consumiveis_un')::numeric, 0),
        coalesce((k->>'estrutura_hora')::numeric, 0), coalesce((k->>'estrutura_un')::numeric, 0), coalesce((k->>'ajuste_un')::numeric, 0));
      INSERT INTO quote_line_oficios (organization_id, quote_line_id, ordem, perfil_chave, nome, horas_un, custo_hora, tecnicos)
      SELECT p_org, v_l, (x.n - 1)::smallint, x.v->>'perfil_chave', x.v->>'nome', (x.v->>'horas_un')::numeric, (x.v->>'custo_hora')::numeric,
        CASE WHEN jsonb_typeof(x.v->'tecnicos') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(x.v->'tecnicos')) END
      FROM jsonb_array_elements(public.fn_neg_lista(k->'oficios')) WITH ORDINALITY x(v, n);
      INSERT INTO quote_line_zonas (organization_id, quote_line_id, zona_id, ordem, quantidade, valor)
      SELECT p_org, v_l, z.id, (x.n - 1)::smallint, (x.v->>'quantidade')::numeric, (x.v->>'valor')::numeric
      FROM jsonb_array_elements(public.fn_neg_lista(l->'zonas')) WITH ORDINALITY x(v, n)
      JOIN quote_zonas z ON z.quote_id = v_q AND lower(btrim(z.nome)) = lower(btrim(x.v->>'zona'));
    END LOOP;
    -- uma linha com zonas cujo nome não está na lista de zonas do orçamento: a zona cria-se (a Emylia deixa)
    -- (não acontece nos dados da Emylia: as zonas das linhas vêm da lista; fica a nota)
    END IF;

    DELETE FROM quote_prazo WHERE quote_id = v_q;
    INSERT INTO quote_prazo (organization_id, quote_id, tarefa, dias)
    SELECT p_org, v_q, x->>'tarefa', (x->>'dias')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'prazo')) x;
    -- prestações: as faturas apontam para elas, por isso atualizam-se pela ordem em vez de se apagarem
    INSERT INTO quote_prestacoes AS qp (organization_id, quote_id, ordem, rotulo, pct, marco, fase)
    SELECT p_org, v_q, (x->>'ordem')::smallint, x->>'rotulo', (x->>'pct')::numeric, x->>'marco', (x->>'fase')::smallint
    FROM jsonb_array_elements(public.fn_neg_lista(o->'prestacoes')) x
    ON CONFLICT (quote_id, ordem) DO UPDATE SET rotulo = EXCLUDED.rotulo, pct = EXCLUDED.pct, marco = EXCLUDED.marco, fase = EXCLUDED.fase;
    DELETE FROM quote_prestacoes p WHERE p.quote_id = v_q
      AND p.ordem > jsonb_array_length(public.fn_neg_lista(o->'prestacoes'))
      AND NOT EXISTS (SELECT 1 FROM faturas f WHERE f.quote_prestacao_id = p.id);
    DELETE FROM quote_avisos_vistos WHERE quote_id = v_q;
    INSERT INTO quote_avisos_vistos (organization_id, quote_id, chave) SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'avisos')) x;
    DELETE FROM quote_precos_manuais WHERE quote_id = v_q;
    INSERT INTO quote_precos_manuais (organization_id, quote_id, descricao, preco)
    SELECT p_org, v_q, x->>'descricao', (x->>'preco')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'precos_manuais')) x;
    DELETE FROM quote_versao_produtos WHERE quote_id = v_q;
    INSERT INTO quote_versao_produtos (organization_id, quote_id, ordem, produto_id, nome, unidade, custo_un, pvp_un, categoria_id, quantidade, cliente_fornece, servico_id, fator, sem_instalacao)
    SELECT p_org, v_q, (x->>'ordem')::int, (x->>'produto')::uuid, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
      (x->>'categoria')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid, (x->>'fator')::numeric,
      coalesce((x->>'sem_instalacao')::boolean, false)
    FROM jsonb_array_elements(public.fn_neg_lista(o->'produtos')) x;
    DELETE FROM quote_versao_partes WHERE quote_id = v_q;
    INSERT INTO quote_versao_partes (organization_id, quote_id, parte)
    SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'partes_fora')) x;
  END LOOP;

  -- a proposta (uma por negócio): nasce no primeiro envio; a versão atual liga-se a ela, as anteriores desligam-se
  SELECT id INTO v_prop FROM proposals WHERE negocio_id = p_negocio_id AND coalesce(is_deleted, false) = false ORDER BY created_at LIMIT 1;
  IF v_prop IS NULL AND EXISTS (SELECT 1 FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND enviado_em IS NOT NULL) THEN
    INSERT INTO proposals (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, value, status)
    VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero, 0, 'draft')
    RETURNING id INTO v_prop;
  END IF;
  IF v_prop IS NOT NULL THEN
    UPDATE quotes SET proposal_id = CASE WHEN id = v_atual THEN v_prop END
    WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND proposal_id IS DISTINCT FROM CASE WHEN id = v_atual THEN v_prop END;
    -- o estado só se sincroniza entre rascunho e enviada; aceite e recusada são do portal (e accepted_at, rejected_at e rejection_notes
    -- também) (20261231994000)
    SELECT CASE q.estado WHEN 'enviado' THEN 'sent' WHEN 'rascunho' THEN 'draft' END INTO v_status
    FROM quotes q WHERE q.id = v_atual;
    UPDATE proposals p SET status = v_status, sent_at = coalesce(q.enviado_em, p.sent_at),
      value = coalesce(q.preco_final, p.value), value_sem_iva = coalesce(q.preco_final, p.value_sem_iva), updated_at = now()
    FROM quotes q WHERE p.id = v_prop AND q.id = v_atual AND v_status IS NOT NULL AND p.status IN ('draft', 'sent', 'viewed')
      AND p.status IS DISTINCT FROM v_status;
  END IF;

  -- contratos (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
  v_c_ant := NULL;
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'contratos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id, status INTO v_c, v_c_base FROM client_contracts WHERE negocio_id = p_negocio_id AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
    IF v_c IS NULL THEN
      -- depois de uma versão assinada no portal não nasce outra: escondia a assinada (20261231994000)
      IF v_c_ant IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE id = v_c_ant AND status IN ('signed', 'assinado', 'active')) THEN
        v_avisos := v_avisos || format('O contrato já está assinado no portal: a versão %s não foi criada.', o->>'versao');
        EXIT;
      END IF;
      INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, negocio_id, created_by, status, versao, quote_id, proposal_id, replaces_contract_id)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'draft', (o->>'versao')::smallint, coalesce(v_aceite, v_atual), v_prop, v_c_ant)
      RETURNING id, status INTO v_c, v_c_base;
    END IF;
    IF v_c_ant IS NOT NULL THEN
      UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
      WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c AND status NOT IN ('signed', 'assinado', 'active', 'rejected', 'cancelled');
    END IF;
    -- um contrato assinado, recusado ou cancelado não se mexe; a assinatura (signature_*, signed_by_name, signature_date) e o estado
    -- assinado só os escreve o portal: "assinado" no JSON ignora-se, com aviso (20261231994000)
    IF v_c_base IN ('signed', 'assinado', 'active', 'rejected', 'cancelled') THEN
      v_c_ant := v_c;
      CONTINUE;
    END IF;
    IF o->>'estado' = 'assinado' THEN v_avisos := v_avisos || 'A assinatura só se faz no portal do cliente.'::text; END IF;
    v_status := CASE o->>'estado' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                  WHEN 'substituido' THEN 'cancelled' WHEN 'assinado' THEN v_c_base ELSE 'draft' END;
    UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
      quote_id = coalesce(quote_id, v_aceite, v_atual), proposal_id = coalesce(proposal_id, v_prop), updated_at = now()
    WHERE id = v_c;
    -- o estado à parte, para os gatilhos do CRM verem a passagem
    UPDATE client_contracts SET status = v_status, status_changed_by = v_user, status_changed_at = now()
    -- a versão substituída só muda de estado quando se liga à seguinte (no mesmo UPDATE): cancelada sem substituta seria perda
    WHERE id = v_c AND status IS DISTINCT FROM v_status AND replaced_by_contract_id IS NULL AND o->>'estado' <> 'substituido';
    DELETE FROM client_contract_pedidos WHERE contract_id = v_c;
    INSERT INTO client_contract_pedidos (organization_id, contract_id, ordem, clausula, nota, pedido_em)
    SELECT p_org, v_c, (x.n - 1)::smallint, x.v->>'clausula', x.v->>'nota', coalesce((x.v->>'pedido_em')::timestamptz, now())
    FROM jsonb_array_elements(public.fn_neg_lista(o->'pedidos')) WITH ORDINALITY x(v, n);
    DELETE FROM client_contract_clausulas WHERE contract_id = v_c;
    INSERT INTO client_contract_clausulas (organization_id, contract_id, titulo, texto)
    SELECT p_org, v_c, x->>'titulo', x->>'texto' FROM jsonb_array_elements(public.fn_neg_lista(o->'clausulas')) x;
    v_c_ant := v_c;
  END LOOP;

  -- a encomenda de cliente nasce no servidor (fn_neg_emitir_ec_se_pronta: fatura registada e pagamento validado): a do JSON ignora-se
  -- (20261231999700)
  IF jsonb_typeof(p_linhas->'ec') = 'object' AND public.fn_neg_fase_minima(p_negocio_id) < 5 THEN
    v_ignorado := true;
  END IF;

  -- as faturas, os pagamentos e os recibos são do Financeiro (neg_registar_fatura, neg_validar_pagamento): do JSON só o PDF de uma
  -- fatura que já existe; uma fatura nova ou um pagamento por validar ficam de fora, com aviso (20261231999700)
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'faturas')) LOOP
    SELECT id INTO v_f FROM faturas WHERE negocio_id = p_negocio_id AND chave = o->>'chave';
    IF v_f IS NULL THEN v_ignorado := true; CONTINUE; END IF;
    UPDATE faturas SET pdf_caminho = coalesce(o->>'pdf_caminho', pdf_caminho) WHERE id = v_f;
    IF jsonb_typeof(o->'pagamento') = 'object'
       AND NOT EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = v_f AND validado_em IS NOT NULL) THEN
      v_ignorado := true;
    END IF;
  END LOOP;

  -- as adendas (20261231990000); os avisos delas juntam-se aos do negócio (20261231994000)
  v_avisos := v_avisos || public.fn_neg_guardar_adendas(p_org, p_negocio_id, p_linhas->'adendas', v_user);

  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)
  v_avisos := v_avisos || public.fn_neg_sincronizar_visitas(p_org, p_negocio_id, p_linhas->'respostas', p_linhas->'visitas');

  IF v_ignorado THEN
    v_avisos := v_avisos || 'A fatura, o pagamento, o recibo, a encomenda de cliente e a anulação só se registam no Financeiro: ficou o que está na base.'::text;
  END IF;

  -- 20270102210000: o que mudou de verdade pede a permissão de cada parte (a exceção desfaz a gravação toda)
  v_depois := public.fn_neg_marcas_permissoes(p_negocio_id);
  IF (v_depois->'orc') IS DISTINCT FROM (v_antes->'orc') AND NOT public.fn_cat_pode(p_org, 'negocios.orcamento.editar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.orcamento.editar): não pode mudar o orçamento (linhas, preços, custos, desconto, versões ou adendas).' USING ERRCODE = 'CT001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(v_depois->'aprov') d WHERE d.value <> 'pedida' AND d.value IS DISTINCT FROM (v_antes->'aprov'->>d.key))
     AND NOT public.fn_cat_pode(p_org, 'negocios.margem.aprovar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.margem.aprovar): não pode aprovar a margem do orçamento (é da Direção).' USING ERRCODE = 'CT001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(v_depois->'envio') d WHERE d.value = 'enviado' AND (v_antes->'envio'->>d.key) IS DISTINCT FROM 'enviado')
     AND NOT public.fn_cat_pode(p_org, 'negocios.proposta.enviar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.proposta.enviar): não pode enviar a proposta ao cliente.' USING ERRCODE = 'CT001';
  END IF;
  IF (v_depois->'contrato') IS DISTINCT FROM (v_antes->'contrato') AND NOT public.fn_cat_pode(p_org, 'negocios.contrato.editar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.contrato.editar): não pode mudar o contrato (estado, cláusulas, pedidos do cliente ou revisão).' USING ERRCODE = 'CT001';
  END IF;
  -- 20270105200000: a passagem de fase dada pelo ecrã (0 a 3; a que não é dada pelo servidor) divide-se: entre Por contactar (0) e
  --   Contacto (1) é do contacto; a que chega à Visita (2) ou ao Negócio (3) é da visita (0→2 pede as duas).
  -- o contacto: o resultado da chamada, as tentativas, o voltar a ligar e a passagem a Contacto
  IF ((v_depois->'contacto') IS DISTINCT FROM (v_antes->'contacto')
      OR (v_min = 0 AND v_neg.anulado_em IS NULL AND coalesce(v_neg.fase, 0) <> v_fase AND greatest(coalesce(v_neg.fase, 0), v_fase) <= 3
          AND least(coalesce(v_neg.fase, 0), v_fase) = 0))
     AND NOT public.fn_cat_pode(p_org, 'negocios.contacto.registar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.contacto.registar): não pode registar o contacto nem passar o negócio a Contacto.' USING ERRCODE = 'CT001';
  END IF;
  -- a visita e o diagnóstico no local (marcar/cancelar/apagar visitas, medidas, fotografias, serviços e produtos da visita, fechar ou
  --   reabrir o levantamento) e a passagem à Visita ou ao Negócio
  IF ((v_depois->'visita') IS DISTINCT FROM (v_antes->'visita')
      OR (v_min = 0 AND v_neg.anulado_em IS NULL AND coalesce(v_neg.fase, 0) <> v_fase AND greatest(coalesce(v_neg.fase, 0), v_fase) BETWEEN 2 AND 3))
     AND NOT public.fn_cat_pode(p_org, 'negocios.visita.gerir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode gerir as visitas nem o diagnóstico no local.' USING ERRCODE = 'CT001';
  END IF;
  -- 20270105200000: registar a decisão do cliente: um pedido de alterações novo (ou mudado) numa versão (limpar não pede nada: é o que a
  --   versão nova faz), ou uma adenda a passar a aceite, assinada ou recusada (ou o motivo da recusa). O que o cliente respondeu no portal
  --   (negocio_respostas_cliente da adenda) passa sem ela: é o espelho do que já está na base.
  IF (EXISTS (SELECT 1 FROM jsonb_each(v_depois->'decisao'->'pedidos') d
              WHERE d.value IS DISTINCT FROM (v_antes->'decisao'->'pedidos'->d.key)
                AND NOT EXISTS (SELECT 1 FROM adendas a JOIN negocio_respostas_cliente r ON r.negocio_id = a.negocio_id AND r.ref = a.referencia
                                WHERE a.negocio_id = p_negocio_id AND d.key LIKE 'a' || a.numero || '.%'
                                  AND r.tipo IN ('adenda_alterar', 'adenda_contrato_alterar')))
      OR EXISTS (SELECT 1 FROM jsonb_each(v_depois->'decisao'->'adendas') d
                 WHERE (((d.value->>'estado') IN ('aceite', 'assinada', 'recusada')
                         AND (d.value->>'estado') IS DISTINCT FROM (v_antes->'decisao'->'adendas'->d.key->>'estado'))
                        OR ((d.value->>'recusa') IS NOT NULL AND (d.value->>'recusa') IS DISTINCT FROM (v_antes->'decisao'->'adendas'->d.key->>'recusa')))
                   AND NOT EXISTS (SELECT 1 FROM negocio_respostas_cliente r
                                   WHERE r.negocio_id = p_negocio_id AND r.ref = d.value->>'referencia'
                                     AND r.tipo = CASE d.value->>'estado' WHEN 'aceite' THEN 'adenda_aceitar' WHEN 'assinada' THEN 'adenda_assinar'
                                                                          ELSE 'adenda_recusar' END)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.proposta.decidir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.proposta.decidir): não pode registar a aceitação, a recusa nem o pedido de alterações do cliente.' USING ERRCODE = 'CT001';
  END IF;

  -- 20270106040000: a decisão do cliente sobre a proposta PRINCIPAL (as versões do orçamento sem adenda e a proposta do negócio)
  --   também pede negocios.proposta.decidir: uma versão a entrar ou a sair de aceite/rejeitado/recusado (salvo a passagem normal
  --   recusada -> substituída, ao fazer a versão seguinte), a data "aceite antes" de uma versão, ou a proposta a entrar ou a sair de
  --   accepted/rejected. (Hoje o JSON não consegue aceitar nem recusar - fica o da base, com aviso -, mas consegue desfazer uma
  --   aceitação passando a versão a substituída, e escrever aceite_antes_em: isso passa a pedir a permissão.)
  v_dec_depois := public.fn_neg_marcas_decisao_principal(p_negocio_id);
  IF (EXISTS (SELECT 1 FROM jsonb_each(v_dec_depois->'versoes') d
              LEFT JOIN LATERAL (SELECT v_dec_antes->'versoes'->d.key AS a) x ON true
              WHERE ((d.value->>'estado') IS DISTINCT FROM (x.a->>'estado')
                     AND ((d.value->>'estado') IN ('aceite', 'rejeitado', 'recusado')
                          OR ((x.a->>'estado') IN ('aceite', 'rejeitado', 'recusado')
                              AND NOT ((x.a->>'estado') IN ('rejeitado', 'recusado') AND (d.value->>'estado') = 'substituido'))))
                 OR (d.value->'aceite_antes') IS DISTINCT FROM (x.a->'aceite_antes'))
      OR EXISTS (SELECT 1 FROM jsonb_each_text(v_dec_depois->'propostas') d
                 WHERE d.value IS DISTINCT FROM (v_dec_antes->'propostas'->>d.key)
                   AND (d.value IN ('accepted', 'rejected') OR (v_dec_antes->'propostas'->>d.key) IN ('accepted', 'rejected'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.proposta.decidir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.proposta.decidir): não pode registar nem desfazer a aceitação ou a recusa da proposta.' USING ERRCODE = 'CT001';
  END IF;

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $function$;


-- obra_guardar_negocio(uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  -- 20270110400000: o âmbito de pessoas.edit sobre o negócio (dono = assigned_to/created_by; TEAM/ORG pelas chaves). Mantêm o acesso
  -- de antes: admin, quem entra sem pessoas.edit no perfil (Papel no Negócio, obra.planear/executar) ou tem um Papel no Negócio
  -- que dá pessoas.edit, e quem tem tarefas na obra deste negócio (fn_neg_no_ambito).
  IF NOT public.fn_neg_no_ambito(v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear');
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      -- 20270105700000: sem negocios.obra.executar o que falta é ela (não planear)
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar %; só regista a execução das tarefas atribuídas a si.',
        CASE WHEN v_executar THEN 'negocios.obra.planear' ELSE 'negocios.obra.executar' END, v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnico_obra(p_org, v_pessoa) THEN -- 20270110600000: cargo ou perfil
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem cargo técnico de obra no RH nem o perfil de técnico de obra.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$;


-- rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
CREATE OR REPLACE FUNCTION public.rpc_save_quote(p_quote_id uuid, p_quote_data jsonb, p_lines jsonb, p_fees jsonb, p_totals jsonb, p_inline_quotes jsonb DEFAULT '[]'::jsonb, p_diagnostic_suggestions jsonb DEFAULT '[]'::jsonb)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_saved_id     uuid;
  v_org_id       uuid;
  v_before       public.quotes;
  v_after        public.quotes;
  v_quote        public.quotes;
  v_entity_id    uuid;
  v_proposal_id  uuid;
  v_deal_id      uuid;
  v_root_org_id  uuid;
  v_line         jsonb;
  v_line_idx     bigint;
  v_line_id      uuid;
  -- 20270109100000: custos das linhas que o ecrã não mostrou a quem grava sem quotes.view_costs/quotes.manage
  v_old_lines    jsonb := '{}'::jsonb;
  v_src          jsonb;
  v_cm           numeric;
  v_cmo          numeric;
  v_mg           numeric;
  v_cp           numeric;
  v_retail       numeric;
  v_int          numeric;
  v_lines_audit  jsonb := '[]'::jsonb;
  v_suggestion   jsonb;
  v_fee          jsonb;
  v_existing_link uuid;
  v_link_op      text;           -- 'update' | 'insert' | NULL
  v_link_id      uuid;
  v_proposal_val numeric;
  v_proposal_old numeric;

  -- inline-quote locals
  v_iq           jsonb;
  v_iq_data      jsonb;
  v_iq_line      jsonb;
  v_iq_id        uuid;
  v_iq_ids       uuid[] := ARRAY[]::uuid[];

  -- diff accumulators
  v_diff         jsonb := '{}'::jsonb;
  v_quote_diff   jsonb := '{}'::jsonb;
  v_key          text;
  v_new_json     jsonb;
  v_old_json     jsonb;
  v_editable_cols text[] := ARRAY[
    'deal_id','cliente_id','organization_id','root_organization_id','entity_id',
    'title','obra_notas','modelo_base','desconto_global_percent','estado',
    'validade_dias','iva_rate','client_notes','conditions','proposal_id',
    'assigned_to','template_id'
  ];
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve target org from the incoming payload ──────────────────────────
  v_org_id      := nullif(p_quote_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_quote_data ->> 'root_organization_id', '')::uuid;
  v_entity_id   := nullif(p_quote_data ->> 'entity_id', '')::uuid;
  v_proposal_id := nullif(p_quote_data ->> 'proposal_id', '')::uuid;
  v_deal_id     := nullif(p_quote_data ->> 'deal_id', '')::uuid;

  -- ── Authorization parity with quotes RLS: org must be in caller's scope ───
  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270110400000: gravar pede a permissão na organização de destino: quotes.create para um orçamento novo, quotes.edit para um
  -- que já existe (e, mais abaixo, o âmbito de quotes.edit sobre ele). Antes bastava a organização ser visível.
  IF NOT public.has_anew_permission_for_org(auth.uid(), CASE WHEN p_quote_id IS NULL THEN 'quotes.create' ELSE 'quotes.edit' END, v_org_id) THEN
    RAISE EXCEPTION 'Sem permissão para % orçamentos', CASE WHEN p_quote_id IS NULL THEN 'criar' ELSE 'editar' END
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. quotes: INSERT (new) or UPDATE metadata (edit)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    INSERT INTO public.quotes (
      deal_id, cliente_id, organization_id, root_organization_id, entity_id,
      title, obra_notas, modelo_base, desconto_global_percent, estado,
      validade_dias, iva_rate, client_notes, conditions, proposal_id,
      assigned_to, template_id, created_by
    )
    VALUES (
      v_deal_id,
      nullif(p_quote_data ->> 'cliente_id', '')::uuid,
      v_org_id,
      v_root_org_id,
      v_entity_id,
      nullif(p_quote_data ->> 'title', ''),
      p_quote_data ->> 'obra_notas',
      p_quote_data ->> 'modelo_base',
      COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
      COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
      (p_quote_data ->> 'validade_dias')::integer,
      (p_quote_data ->> 'iva_rate')::numeric,
      nullif(p_quote_data ->> 'client_notes', ''),
      nullif(p_quote_data ->> 'conditions', ''),
      v_proposal_id,
      nullif(p_quote_data ->> 'assigned_to', '')::uuid,
      nullif(p_quote_data ->> 'template_id', '')::uuid,
      v_actor
    )
    RETURNING * INTO v_after;

    v_saved_id := v_after.id;

  ELSE
    -- Load the before-image and enforce org scope on the existing row too.
    SELECT * INTO v_before FROM public.quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
      RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 20270110400000: quotes.edit na organização do orçamento e o âmbito dela sobre ele: o mesmo "próprio" da lista de Orçamentos
    -- (criador, pedido/lead do utilizador) unido ao da RLS (assigned_to), mais a proposta/contrato/negócio ligados (fn_doc_no_ambito).
    IF NOT public.has_anew_permission_for_org(auth.uid(), 'quotes.edit', v_before.organization_id)
       OR NOT public.fn_doc_no_ambito_acao('quote', p_quote_id, 'quotes.edit', 'pessoas.edit') THEN
      RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.quotes
    SET deal_id                 = v_deal_id,
        cliente_id              = nullif(p_quote_data ->> 'cliente_id', '')::uuid,
        organization_id         = v_org_id,
        root_organization_id    = v_root_org_id,
        entity_id               = v_entity_id,
        title                   = nullif(p_quote_data ->> 'title', ''),
        obra_notas              = p_quote_data ->> 'obra_notas',
        modelo_base             = p_quote_data ->> 'modelo_base',
        desconto_global_percent = COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
        estado                  = COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
        validade_dias           = (p_quote_data ->> 'validade_dias')::integer,
        iva_rate                = (p_quote_data ->> 'iva_rate')::numeric,
        client_notes            = nullif(p_quote_data ->> 'client_notes', ''),
        conditions              = nullif(p_quote_data ->> 'conditions', ''),
        proposal_id             = v_proposal_id,
        assigned_to             = nullif(p_quote_data ->> 'assigned_to', '')::uuid,
        template_id             = nullif(p_quote_data ->> 'template_id', '')::uuid
    WHERE id = p_quote_id
    RETURNING * INTO v_after;

    v_saved_id := p_quote_id;

    -- delete-all children (mirrors handleSave: delete quote_lines on edit; fees below)
    -- 20270109100000: guarda as linhas antes de as apagar. Quem grava sem ver os custos recebeu do ecrã um custo que não
    -- é o verdadeiro (o ecrã não o tem: rpc_quote_lines_custos); essas linhas vêm marcadas com custos_ocultos e o custo
    -- verdadeiro volta a ser gravado a partir daqui.
    SELECT coalesce(jsonb_object_agg(ql.id::text, to_jsonb(ql)), '{}'::jsonb) INTO v_old_lines
    FROM public.quote_lines ql WHERE ql.quote_id = p_quote_id;

    DELETE FROM public.quote_lines WHERE quote_id = p_quote_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. quote_lines: insert the full computed set (both new and edit paths)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line, v_line_idx IN
      SELECT value, ordinality - 1
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(value, ordinality)
    LOOP
      -- 20270109100000: por omissão grava-se o custo que veio do ecrã (como sempre). Uma linha marcada com
      -- custos_ocultos = true (o ecrã de quem não vê custos não a alterou: mesmo artigo, mesmo custo que recebeu) e com o
      -- id de uma linha existente da mesma organização fica com o custo, a mão de obra, a margem e o cost_price
      -- VERDADEIROS dessa linha. Se o preço de venda definido mudou, a margem passa a ser o markup que o reproduz
      -- (o mesmo cálculo do ecrã: markupFromCostAndPrice).
      v_cm  := (v_line ->> 'custo_material_unit')::numeric;
      v_cmo := (v_line ->> 'custo_mao_obra_unit')::numeric;
      v_mg  := (v_line ->> 'margem_percent')::numeric;
      v_cp  := COALESCE((v_line ->> 'cost_price')::numeric, 0);
      v_src := NULL;
      IF (v_line -> 'custos_ocultos') = 'true'::jsonb
         AND (v_line ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_src := v_old_lines -> lower(v_line ->> 'id');
        IF v_src IS NULL THEN
          SELECT to_jsonb(ql) INTO v_src
          FROM public.quote_lines ql JOIN public.quotes q ON q.id = ql.quote_id
          WHERE ql.id = (v_line ->> 'id')::uuid AND q.organization_id = v_org_id;
        END IF;
        IF v_src IS NOT NULL
           AND lower(v_src ->> 'product_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'product_id', ''))
           AND lower(v_src ->> 'service_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'service_id', ''))
           AND lower(v_src ->> 'bundle_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'bundle_id', ''))
           AND lower(v_src ->> 'item_supplier_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'item_supplier_id', '')) THEN
          v_cm  := (v_src ->> 'custo_material_unit')::numeric;
          v_cmo := (v_src ->> 'custo_mao_obra_unit')::numeric;
          v_mg  := (v_src ->> 'margem_percent')::numeric;
          v_cp  := COALESCE((v_src ->> 'cost_price')::numeric, 0);
          v_retail := nullif(v_line ->> 'retail_price_unit', '')::numeric;
          v_int := COALESCE((v_line ->> 'int_percent')::numeric, 0);
          IF v_retail IS DISTINCT FROM (v_src ->> 'retail_price_unit')::numeric AND v_retail > 0
             AND COALESCE(v_cm, 0) + COALESCE(v_cmo, 0) > 0 THEN
            v_mg := greatest(0, round(((v_retail / (1 + v_int / 100)) / (COALESCE(v_cm, 0) + COALESCE(v_cmo, 0)) - 1) * 100, 2));
          END IF;
        ELSE
          v_src := NULL;
        END IF;
      END IF;
      -- o registo de auditoria não leva o custo inventado pelo ecrã
      v_lines_audit := v_lines_audit || jsonb_build_array(
        CASE WHEN v_src IS NOT NULL
             THEN v_line - ARRAY['custo_material_unit', 'custo_mao_obra_unit', 'margem_percent', 'cost_price']
             ELSE v_line END);

      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
        retail_price_unit, visible_to_client, source_deal_need_item_id,
        source_deal_need_id,
        uom_id
      )
      VALUES (
        v_saved_id,
        nullif(v_line ->> 'catalog_item_id', '')::uuid,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'service_id', '')::uuid,
        nullif(v_line ->> 'bundle_id', '')::uuid,
        nullif(v_line ->> 'item_supplier_id', '')::uuid,
        COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
        v_line ->> 'categoria',
        v_line ->> 'descricao_snapshot',
        (v_line ->> 'qt')::numeric,
        v_cm,
        v_cmo,
        v_mg,
        (v_line ->> 'iva_percent')::numeric,
        (v_line ->> 'int_percent')::numeric,
        (v_line ->> 'discount_percent')::numeric,
        (v_line ->> 'total_sem_iva')::numeric,
        (v_line ->> 'total_com_iva')::numeric,
        (v_line ->> 'total_com_desconto')::numeric,
        (v_line ->> 'ordem')::integer,
        COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
        nullif(v_line ->> 'unidade', ''),
        nullif(v_line ->> 'item_description', ''),
        v_cp,
        nullif(v_line ->> 'retail_price_unit', '')::numeric,
        COALESCE((v_line ->> 'visible_to_client')::boolean, true),
        -- NOVO (20261203030000): origem da linha. Ausente/'' => NULL, exatamente
        -- como todas as outras referências opcionais desta função.
        nullif(v_line ->> 'source_deal_need_item_id', '')::uuid,
        -- NOVO (20261203060000): a origem ESTÁVEL — é esta que serve de chave à
        -- idempotência da importação; a de cima é volátil (delete+reinsert).
        nullif(v_line ->> 'source_deal_need_id', '')::uuid,
        -- NOVO (20261204204500): unidade da linha; units_per_uom é calculado
        -- no servidor pelo gatilho trg_quote_lines_units_per_uom.
        nullif(v_line ->> 'uom_id', '')::uuid
      )
      RETURNING id INTO v_line_id;

      -- Fecha o gap de quote_diagnostic_area_suggestions nunca ser escrita:
      -- para cada sugestão da Fase 1 cujo line_index aponta para a posição
      -- (0-based) desta linha dentro de p_lines, grava a auditoria de origem
      -- (regra ou IA) já ligada ao id real da linha que acabou de ser inserida.
      -- Nunca se aplica a p_inline_quotes — essas sugestões só se tornam
      -- linhas "principais" (ver 7º parâmetro, comentário acima da função).
      IF p_diagnostic_suggestions IS NOT NULL AND jsonb_typeof(p_diagnostic_suggestions) = 'array' THEN
        FOR v_suggestion IN
          SELECT * FROM jsonb_array_elements(p_diagnostic_suggestions)
          WHERE (value ->> 'line_index')::integer = v_line_idx
        LOOP
          INSERT INTO public.quote_diagnostic_area_suggestions (
            diagnostic_area_id, quote_line_id, source, rule_id, ai_rationale,
            ai_confidence, source_field, suggested_qty, was_edited_by_user
          )
          VALUES (
            nullif(v_suggestion ->> 'diagnostic_area_id', '')::uuid,
            v_line_id,
            v_suggestion ->> 'source',
            nullif(v_suggestion ->> 'rule_id', '')::uuid,
            v_suggestion ->> 'ai_rationale',
            (v_suggestion ->> 'ai_confidence')::numeric,
            v_suggestion ->> 'source_field',
            (v_suggestion ->> 'suggested_qty')::numeric,
            COALESCE((v_suggestion ->> 'was_edited_by_user')::boolean, false)
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. quote_fees: delete-all (edit) then insert full set
  -- ══════════════════════════════════════════════════════════════════════════
  -- handleSave() only deletes existing fees in edit mode (a fresh quote has none).
  IF p_quote_id IS NOT NULL THEN
    DELETE FROM public.quote_fees WHERE quote_id = v_saved_id;
  END IF;

  IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
    LOOP
      INSERT INTO public.quote_fees (
        quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
      )
      VALUES (
        v_saved_id,
        nullif(v_fee ->> 'fee_type_id', '')::uuid,
        (v_fee ->> 'base_amount')::numeric,
        (v_fee ->> 'calculated_value')::numeric,
        (v_fee ->> 'vat_rate')::numeric,
        (v_fee ->> 'vat_amount')::numeric
      );
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. quotes totals UPDATE (folded into the same tx — was a separate call in FE)
  -- ══════════════════════════════════════════════════════════════════════════
  UPDATE public.quotes
  SET subtotal   = (p_totals ->> 'subtotal')::numeric,
      total_fees = (p_totals ->> 'total_fees')::numeric,
      total      = (p_totals ->> 'total')::numeric
  WHERE id = v_saved_id
  RETURNING * INTO v_quote;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. proposals value sync (conditional) — regra de negócio real, via
  --    calculate_proposal_value_from_quotes() (FIX: substitui a soma manual
  --    ingénua que ignorava `estado`, sobrepondo-se ao valor correto que o
  --    trigger do passo 4 acabou de calcular)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Written in THIS transaction together with quotes.proposal_id + pipeline_links
  -- so the FK linkage and the aggregate can never desynchronize.
  IF v_saved_id IS NOT NULL AND v_proposal_id IS NOT NULL THEN
    SELECT value INTO v_proposal_old FROM public.proposals WHERE id = v_proposal_id;

    v_proposal_val := public.calculate_proposal_value_from_quotes(v_proposal_id);

    UPDATE public.proposals
    SET value         = v_proposal_val,
        value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(v_proposal_id)
    WHERE id = v_proposal_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. pipeline_links UPDATE/INSERT (conditional on deal_id)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_saved_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
    SELECT id INTO v_existing_link
    FROM   public.pipeline_links
    WHERE  deal_id = v_deal_id
      AND  status  = 'active'
    LIMIT  1;

    IF v_existing_link IS NOT NULL THEN
      UPDATE public.pipeline_links
      SET quote_id   = v_saved_id,
          updated_at = now()
      WHERE id = v_existing_link;
      v_link_op := 'update';
      v_link_id := v_existing_link;
    ELSE
      INSERT INTO public.pipeline_links
        (deal_id, quote_id, organization_id, root_organization_id, status)
      VALUES
        (v_deal_id, v_saved_id, v_org_id, COALESCE(v_root_org_id, v_org_id), 'active')
      RETURNING id INTO v_link_id;
      v_link_op := 'insert';
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. inline quotes: each is a full standalone quote (INSERT + lines + totals)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
    FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
    LOOP
      v_iq_data := v_iq -> 'data';
      -- FE skips inline quotes with no qt>0 lines.
      IF v_iq_data IS NULL
         OR jsonb_typeof(v_iq -> 'lines') <> 'array'
         OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.quotes (
        deal_id, organization_id, root_organization_id, title, obra_notas,
        modelo_base, desconto_global_percent, estado, validade_dias, iva_rate,
        client_notes, conditions, created_by
      )
      VALUES (
        nullif(v_iq_data ->> 'deal_id', '')::uuid,
        v_org_id,
        COALESCE(v_root_org_id, v_org_id),
        nullif(v_iq_data ->> 'title', ''),
        nullif(v_iq_data ->> 'obra_notas', ''),
        COALESCE(nullif(v_iq_data ->> 'modelo_base', ''), 'default'),
        COALESCE((v_iq_data ->> 'desconto_global_percent')::numeric, 0),
        COALESCE(nullif(v_iq_data ->> 'estado', ''), 'rascunho'),
        (v_iq_data ->> 'validade_dias')::integer,
        (v_iq_data ->> 'iva_rate')::numeric,
        nullif(v_iq_data ->> 'client_notes', ''),
        nullif(v_iq_data ->> 'conditions', ''),
        v_actor
      )
      RETURNING id INTO v_iq_id;

      -- FIX 1: filter qt > 0 here (mirrors handleSave iq.lines.filter(l => l.qt > 0)),
      -- rather than trusting the caller to pre-filter. Lines with qt <= 0 (or null) are
      -- skipped exactly as the current FE code does.
      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_iq -> 'lines')
      LOOP
        CONTINUE WHEN COALESCE((v_iq_line ->> 'qt')::numeric, 0) <= 0;

        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
          retail_price_unit, visible_to_client, uom_id
        )
        VALUES (
          v_iq_id,
          nullif(v_iq_line ->> 'catalog_item_id', '')::uuid,
          nullif(v_iq_line ->> 'product_id', '')::uuid,
          nullif(v_iq_line ->> 'service_id', '')::uuid,
          nullif(v_iq_line ->> 'bundle_id', '')::uuid,
          nullif(v_iq_line ->> 'item_supplier_id', '')::uuid,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          -- FIX 2: inline quote lines always persist categoria = '' to match handleSave
          -- (QuoteBuilder.tsx:2087), which never forwards l.categoria for inline lines.
          '',
          v_iq_line ->> 'descricao_snapshot',
          (v_iq_line ->> 'qt')::numeric,
          (v_iq_line ->> 'custo_material_unit')::numeric,
          (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
          (v_iq_line ->> 'margem_percent')::numeric,
          (v_iq_line ->> 'iva_percent')::numeric,
          (v_iq_line ->> 'int_percent')::numeric,
          (v_iq_line ->> 'discount_percent')::numeric,
          (v_iq_line ->> 'total_sem_iva')::numeric,
          (v_iq_line ->> 'total_com_iva')::numeric,
          (v_iq_line ->> 'total_com_desconto')::numeric,
          (v_iq_line ->> 'ordem')::integer,
          COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
          nullif(v_iq_line ->> 'unidade', ''),
          nullif(v_iq_line ->> 'item_description', ''),
          COALESCE((v_iq_line ->> 'cost_price')::numeric, 0),
          nullif(v_iq_line ->> 'retail_price_unit', '')::numeric,
          COALESCE((v_iq_line ->> 'visible_to_client')::boolean, true),
          nullif(v_iq_line ->> 'uom_id', '')::uuid  -- NOVO (20261204204500)
        );
      END LOOP;

      UPDATE public.quotes
      SET subtotal = (v_iq -> 'totals' ->> 'subtotal')::numeric,
          total    = (v_iq -> 'totals' ->> 'total')::numeric
      WHERE id = v_iq_id;

      v_iq_ids := v_iq_ids || v_iq_id;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. Build ONE combined diff and write ONE audit row
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    -- INSERT: snapshot the editable columns of the created quote.
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY v_editable_cols LOOP
      v_quote_diff := v_quote_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
      );
    END LOOP;
  ELSE
    -- UPDATE: diff before-image vs. metadata after-image (v_after captured the
    -- metadata UPDATE; totals were applied afterwards into v_quote — include those too).
    v_old_json := to_jsonb(v_before);
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY (v_editable_cols || ARRAY['subtotal','total_fees','total']) LOOP
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_quote_diff := v_quote_diff || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;
  END IF;

  IF v_quote_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('quotes', v_quote_diff);
  END IF;

  -- quote_lines / quote_fees are rewritten wholesale (delete-all + reinsert). Record
  -- the resulting sets so the single log row still reflects what the save produced.
  v_diff := v_diff || jsonb_build_object(
    'quote_lines', jsonb_build_object('new', CASE WHEN p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN v_lines_audit ELSE COALESCE(p_lines, '[]'::jsonb) END),
    'quote_fees',  jsonb_build_object('new', COALESCE(p_fees,  '[]'::jsonb))
  );

  IF v_proposal_id IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'proposals', jsonb_build_object(
        'value', jsonb_build_object('old', to_jsonb(v_proposal_old), 'new', to_jsonb(v_proposal_val))
      )
    );
  END IF;

  IF v_link_op IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'pipeline_links', jsonb_build_object(
        'op',       to_jsonb(v_link_op),
        'id',       to_jsonb(v_link_id),
        'deal_id',  to_jsonb(v_deal_id),
        'quote_id', to_jsonb(v_saved_id)
      )
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  -- Single consolidated audit row for the primary quote.
  PERFORM public.fn_manual_audit_log(
    'quotes',
    v_saved_id,
    v_org_id,
    CASE WHEN p_quote_id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_diff,
    'web_app'
  );

  -- Each inline quote is an independent creation — one INSERT row apiece so the log
  -- does not hide the fact that extra quotes were created.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_org_id, 'INSERT',
        jsonb_build_object('inline_of', to_jsonb(v_saved_id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_quote;
END;
$function$;


-- cancel_and_replace_contract(uuid,text,boolean)
CREATE OR REPLACE FUNCTION public.cancel_and_replace_contract(p_contract_id uuid, p_reason text, p_create_replacement boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_actor uuid := public.resolve_business_user_id(auth.uid());
  v_new_contract_id uuid;
  -- 20270110400000
  v_scope        text;
  v_team_ids     uuid[];
  v_eu           uuid;
  v_created_by   uuid;
  v_assigned     uuid;
BEGIN
  SELECT organization_id, status, deleted_at
  INTO v_org_id, v_status, v_deleted_at
  FROM public.client_contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  -- 20270110400000: o âmbito de client_contracts.edit sobre o contrato, o mesmo bloco de rpc_update_client_contract
  -- (_client_contracts_effective_edit_scope; dono = created_by OU assigned_to, como canActOnContract no ecrã).
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_org_id);
  v_eu := public.current_business_user_id();
  SELECT created_by, assigned_to INTO v_created_by, v_assigned
  FROM public.client_contracts WHERE id = p_contract_id;

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'insufficient_permission';
  ELSIF v_scope = 'OWNED' THEN
    IF v_eu IS DISTINCT FROM v_created_by AND v_eu IS DISTINCT FROM v_assigned THEN
      RAISE EXCEPTION 'insufficient_permission';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_eu IS DISTINCT FROM v_created_by AND v_eu IS DISTINCT FROM v_assigned
       AND NOT (v_created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[])))
       AND NOT (v_assigned = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'insufficient_permission';
    END IF;
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contract_already_deleted';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'contract_already_cancelled';
  END IF;

  IF v_status NOT IN ('signed', 'active', 'draft') THEN
    RAISE EXCEPTION 'contract_not_cancellable';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.client_contracts
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      status_changed_by = v_actor,
      status_changed_at = now()
  WHERE id = p_contract_id;

  IF p_create_replacement THEN
    INSERT INTO public.client_contracts (
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, status, contract_body_html,
      replaces_contract_id, created_by
    )
    SELECT
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, 'draft', NULL,
      id, v_actor
    FROM public.client_contracts
    WHERE id = p_contract_id
    RETURNING id INTO v_new_contract_id;

    UPDATE public.client_contracts
    SET replaced_by_contract_id = v_new_contract_id
    WHERE id = p_contract_id;

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object('replacement_contract_id', v_new_contract_id),
      v_actor
    );

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      v_new_contract_id, 'contract_replaced', 'Contrato de substituicao criado',
      jsonb_build_object('replaces_contract_id', p_contract_id),
      v_actor
    );
  ELSE
    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object('replacement_contract_id', NULL),
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'cancelled_contract_id', p_contract_id,
    'replacement_contract_id', v_new_contract_id
  );
END;
$function$;


-- _soft_delete_business_entity_impl(text,uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public._soft_delete_business_entity_impl(p_kind text, p_id uuid, p_actor uuid, p_auth_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid;
  v_target_org uuid;
  v_proposal_status text;
  -- NOVO (20261204900000)
  v_contract_status     text;
  v_contract_manual     boolean;
  v_contract_created_by uuid;
  v_contract_assigned   uuid;
  v_full_access         boolean;
BEGIN
  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id, status INTO v_target_org, v_proposal_status FROM public.proposals WHERE id = p_id;
  ELSE
    -- NOVO (20261204900000): também estado, origem e dono.
    SELECT organization_id, status, is_manual_order, created_by, assigned_to
      INTO v_target_org, v_contract_status, v_contract_manual, v_contract_created_by, v_contract_assigned
      FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(p_auth_uid))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270108310000: pedidos de proposta e orçamentos exigem a permissão de apagar NA organização do registo (ou numa acima;
  -- o admin de sistema passa). Antes bastava a organização ser visível (auditoria de permissões 05/11, P1.6).
  IF p_kind = 'deal' AND NOT public.has_anew_permission_in_org_or_ancestor(p_auth_uid, 'deals.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para eliminar pedidos de proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind = 'quote' AND NOT public.has_anew_permission_in_org_or_ancestor(p_auth_uid, 'quotes.delete', v_target_org) THEN
    RAISE EXCEPTION 'Sem permissao para eliminar orcamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Eliminar uma proposta exige 'proposals.delete'; eliminar uma que já
  -- saiu de rascunho exige adicionalmente 'proposals.delete_sent'. Fecha
  -- o caminho da RPC directa, da eliminação em massa e da ferramenta
  -- cancel_proposal do assistente de IA (que só verificava
  -- 'proposals.edit').
  IF p_kind = 'proposal' THEN
    -- 20270110400000: na organização da proposta (ou numa acima), como quotes.delete; antes valia em qualquer organização
    IF NOT public.has_anew_permission_in_org_or_ancestor(p_auth_uid, 'proposals.delete', v_target_org) THEN
      RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_proposal_status IS DISTINCT FROM 'draft'
       AND NOT public.has_anew_permission(p_auth_uid, 'proposals.delete_sent') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar propostas ja enviadas' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 20270110400000: orçamentos e propostas com o âmbito de quotes.delete / proposals.delete sobre o registo (o "próprio" da lista:
  -- criador/responsável, o pedido/lead, o negócio, a proposta/contrato ligados - fn_doc_no_ambito; admin = ORG). Só quando quem
  -- chama é o próprio utilizador: pela service_role a agir por outro (assistente, p_actor_id) fica como estava.
  IF p_kind IN ('quote', 'proposal') AND p_auth_uid IS NOT DISTINCT FROM auth.uid()
     AND NOT public.fn_doc_no_ambito_acao(p_kind, p_id, CASE p_kind WHEN 'quote' THEN 'quotes.delete' ELSE 'proposals.delete' END, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissao para eliminar este registo (fora do seu ambito)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204900000): contratos exigem client_contracts.delete com
  -- âmbito, nunca assinados, e nunca encomendas de cliente (essas têm de
  -- passar por rpc_delete_client_order, que estorna stock e cancela POs).
  IF p_kind = 'contract' THEN
    IF NOT public.has_anew_permission(p_auth_uid, 'client_contracts.delete') THEN
      RAISE EXCEPTION 'Sem permissao para eliminar contratos' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF COALESCE(v_contract_manual, false) THEN
      RAISE EXCEPTION 'Encomendas de cliente eliminam-se em Encomendas Clientes (rpc_delete_client_order), que devolve o stock e cancela os pedidos a fornecedor'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_contract_status IN ('signed', 'active', 'assinado') THEN
      RAISE EXCEPTION 'Contratos assinados têm de ser anulados antes de eliminar' USING ERRCODE = 'check_violation';
    END IF;

    -- Âmbito: system admin mantém o comportamento anterior (organização
    -- visível chega); super admin na organização ou num antepassado = ORG
    -- (como resolve_lead_access_context e o frontend). Restantes: chaves de
    -- client_contracts.delete casadas com created_by/assigned_to, como a RLS
    -- client_contracts_delete. crm_scope_keys usa auth.uid(): um chamador
    -- service_role a agir por outro utilizador não tem chaves e é recusado.
    v_full_access :=
      public.is_system_admin(p_auth_uid)
      OR EXISTS (
        WITH RECURSIVE chain AS (
          SELECT v_target_org AS org_id
          UNION
          SELECT h.parent_org_id
            FROM public.anew_hierarchy h
            JOIN chain c ON c.org_id = h.child_org_id
           WHERE h.parent_org_id IS NOT NULL
        )
        SELECT 1
          FROM public.anew_memberships m
          JOIN public.anew_users u ON u.id = m.user_id
          JOIN public.anew_roles r ON r.id = m.role_id
         WHERE u.auth_user_id = p_auth_uid
           AND m.status = 'active'
           AND r.code = 'super_admin'
           AND m.organization_id IN (SELECT org_id FROM chain)
      );

    IF NOT v_full_access AND (
         p_auth_uid IS DISTINCT FROM auth.uid()
         OR NOT EXISTS (
           SELECT 1
             FROM unnest(public.crm_scope_keys('client_contracts.delete')) AS k(scope_key)
            WHERE k.scope_key = v_target_org::text || ':*'
               OR k.scope_key = v_target_org::text || ':' || v_contract_created_by::text
               OR k.scope_key = v_target_org::text || ':' || v_contract_assigned::text
         )
       ) THEN
      RAISE EXCEPTION 'Sem permissao para eliminar este contrato (fora do seu ambito)' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at=now(), deleted_by=p_actor, is_deleted=true
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at=now(), deleted_by=p_actor
      WHERE id=p_id AND deleted_at IS NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'deleted', p_kind, NULL, p_id::text, p_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Retirar do portal do cliente na mesma transação (20261201070000).
    -- 'deal' não tem portal_document_type e fica de fora deste bloco.
    IF p_kind IN ('quote', 'proposal', 'contract') THEN
      UPDATE public.client_portal_documents
      SET is_visible = false,
          revoked_at = now(),
          revoked_by = p_actor
      WHERE document_type = p_kind::public.portal_document_type
        AND document_id = p_id
        AND is_visible = true;
    END IF;
  END IF;
  RETURN TRUE;
END;
$function$;


-- ── Policies (a partir de pg_policies VIVO de 09/11/2026) ─────────────────────────────────────────────────────────────────


-- quotes / "quotes_select_policy"
-- antes: USING ((organization_id IN ( SELECT get_user_crm_org_ids(auth.uid()) AS get_user_crm_org_ids)) AND has_anew_permission(auth.uid(), 'quotes.view'::text))
ALTER POLICY "quotes_select_policy" ON public.quotes
  USING ((((organization_id IN ( SELECT get_user_crm_org_ids(auth.uid()) AS get_user_crm_org_ids)) AND has_anew_permission(auth.uid(), 'quotes.view'::text)) AND ((((organization_id)::text || ':*'::text) = ANY ((( SELECT public.crm_scope_keys('quotes.view'::text) AS crm_scope_keys))::text[])) OR public.fn_doc_no_ambito('quote'::text, id, organization_id, ( SELECT public.crm_scope_keys('quotes.view'::text) AS crm_scope_keys), ( SELECT public.crm_scope_keys('pessoas.view'::text) AS crm_scope_keys), ( SELECT public.fn_neg_orgs_tudo('pessoas.view'::text) AS fn_neg_orgs_tudo), ( SELECT public.fn_neg_ids_com_tarefa(NULL::uuid) AS fn_neg_ids_com_tarefa)))));

-- proposals / "Users can view proposals in their scope"
-- antes: USING (has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.view'::text) AND ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) OR ((organization_id IS NULL) AND (EXISTS ( SELECT 1
--      FROM deals d
--     WHERE ((d.id = proposals.deal_id) AND (d.organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids))))))))
ALTER POLICY "Users can view proposals in their scope" ON public.proposals
  USING ((has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.view'::text) AND (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND ((((organization_id)::text || ':*'::text) = ANY ((( SELECT public.crm_scope_keys('proposals.view'::text) AS crm_scope_keys))::text[])) OR public.fn_doc_no_ambito('proposal'::text, id, organization_id, ( SELECT public.crm_scope_keys('proposals.view'::text) AS crm_scope_keys), ( SELECT public.crm_scope_keys('pessoas.view'::text) AS crm_scope_keys), ( SELECT public.fn_neg_orgs_tudo('pessoas.view'::text) AS fn_neg_orgs_tudo), ( SELECT public.fn_neg_ids_com_tarefa(NULL::uuid) AS fn_neg_ids_com_tarefa)))) OR ((organization_id IS NULL) AND (EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = proposals.deal_id) AND (d.organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)))))))));

-- client_contracts / "client_contracts_select"
-- antes: USING (has_anew_permission(auth.uid(), 'client_contracts.view'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(auth.uid()) AS get_user_crm_org_ids)))
ALTER POLICY "client_contracts_select" ON public.client_contracts
  USING (((has_anew_permission(auth.uid(), 'client_contracts.view'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(auth.uid()) AS get_user_crm_org_ids))) AND ((((organization_id)::text || ':*'::text) = ANY ((( SELECT public.crm_scope_keys('client_contracts.view'::text) AS crm_scope_keys))::text[])) OR public.fn_doc_no_ambito('contract'::text, id, organization_id, ( SELECT public.crm_scope_keys('client_contracts.view'::text) AS crm_scope_keys), ( SELECT public.crm_scope_keys('pessoas.view'::text) AS crm_scope_keys), ( SELECT public.fn_neg_orgs_tudo('pessoas.view'::text) AS fn_neg_orgs_tudo), ( SELECT public.fn_neg_ids_com_tarefa(NULL::uuid) AS fn_neg_ids_com_tarefa)))));

-- quotes / "quotes_update_policy"
-- antes: USING ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND has_anew_permission(( SELECT auth.uid() AS uid), 'quotes.edit'::text) AND (EXISTS ( SELECT 1
--      FROM unnest(( SELECT crm_scope_keys('quotes.view'::text) AS crm_scope_keys)) k(scope_key)
--     WHERE ((k.scope_key = ((quotes.organization_id)::text || ':*'::text)) OR (k.scope_key = (((quotes.organization_id)::text || ':'::text) || (quotes.assigned_to)::text)) OR (k.scope_key = (((quotes.organization_id)::text || ':'::text) || (quotes.created_by)::text))))))
ALTER POLICY "quotes_update_policy" ON public.quotes
  USING (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND has_anew_permission(( SELECT auth.uid() AS uid), 'quotes.edit'::text) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('quotes.edit'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((quotes.organization_id)::text || ':*'::text)) OR (k.scope_key = (((quotes.organization_id)::text || ':'::text) || (quotes.assigned_to)::text)) OR (k.scope_key = (((quotes.organization_id)::text || ':'::text) || (quotes.created_by)::text)))))));

-- proposals / "Users with permission can update proposals"
-- antes: USING (((created_by = current_business_user_id()) AND ( SELECT has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.edit'::text) AS has_anew_permission)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.edit'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND (EXISTS ( SELECT 1
--      FROM unnest(( SELECT crm_scope_keys('proposals.view'::text) AS crm_scope_keys)) k(scope_key)
--     WHERE ((k.scope_key = ((proposals.organization_id)::text || ':*'::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.assigned_to)::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.created_by)::text)))))))
ALTER POLICY "Users with permission can update proposals" ON public.proposals
  USING ((((created_by = current_business_user_id()) AND ( SELECT has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.edit'::text) AS has_anew_permission)) OR (has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.edit'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('proposals.edit'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((proposals.organization_id)::text || ':*'::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.assigned_to)::text)) OR (k.scope_key = (((proposals.organization_id)::text || ':'::text) || (proposals.created_by)::text))))))));

-- client_contracts / "client_contracts_update"
-- antes: USING (has_anew_permission(( SELECT auth.uid() AS uid), 'client_contracts.edit'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND (EXISTS ( SELECT 1
--      FROM unnest(( SELECT crm_scope_keys('client_contracts.view'::text) AS crm_scope_keys)) k(scope_key)
--     WHERE ((k.scope_key = ((client_contracts.organization_id)::text || ':*'::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.assigned_to)::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.created_by)::text))))))
ALTER POLICY "client_contracts_update" ON public.client_contracts
  USING ((has_anew_permission(( SELECT auth.uid() AS uid), 'client_contracts.edit'::text) AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('client_contracts.edit'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((client_contracts.organization_id)::text || ':*'::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.assigned_to)::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.created_by)::text)))))));

-- client_contracts / "client_contracts_delete"
-- antes: USING ((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND has_anew_permission(( SELECT auth.uid() AS uid), 'client_contracts.delete'::text) AND (EXISTS ( SELECT 1
--      FROM unnest(( SELECT crm_scope_keys('client_contracts.view'::text) AS crm_scope_keys)) k(scope_key)
--     WHERE ((k.scope_key = ((client_contracts.organization_id)::text || ':*'::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.assigned_to)::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.created_by)::text))))))
ALTER POLICY "client_contracts_delete" ON public.client_contracts
  USING (((organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids)) AND has_anew_permission(( SELECT auth.uid() AS uid), 'client_contracts.delete'::text) AND (EXISTS ( SELECT 1
   FROM unnest(( SELECT crm_scope_keys('client_contracts.delete'::text) AS crm_scope_keys)) k(scope_key)
  WHERE ((k.scope_key = ((client_contracts.organization_id)::text || ':*'::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.assigned_to)::text)) OR (k.scope_key = (((client_contracts.organization_id)::text || ':'::text) || (client_contracts.created_by)::text)))))));

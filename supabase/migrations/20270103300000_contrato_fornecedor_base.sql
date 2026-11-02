-- ============================================================
-- 20270103300000_contrato_fornecedor_base
-- ============================================================
-- Contrato de Fornecedor, Fase 1 (base de dados). Base RH (uetjghdkwbywbftedtth). NUNCA a principal.
--
-- O que faz (só coisas novas; nenhuma função existente é reescrita)
--   1. Permissão nova suppliers.contract_manage (categoria suppliers), dada ao super_admin global (padrão de
--      20270102200000: request.jwt.claims=service_role LOCAL à volta do INSERT; nenhum trigger desligado).
--   2. Tabelas novas (RLS ligada; authenticated só lê, pelas policies; escritas SÓ pelas RPCs SECURITY DEFINER):
--        supplier_contract_templates  modelos por organização (material | servico), corpo HTML com {{variaveis}}
--        supplier_contracts           o contrato: condições estruturadas, documento congelado no envio (HTML + SHA-256),
--                                     estado, assinatura do fornecedor, contra-assinatura, recusa, cancelamento, versões
--        supplier_contract_files      PDF do fornecedor e anexos (bucket supplier-contracts), com SHA-256
--        supplier_contract_events     histórico (só acrescenta)
--   3. Colunas novas
--        suppliers: condições vigentes (payment_terms_days, payment_method, shipping_terms, shipping_free_from,
--          discount_percent, min_order_value, returns_accepted, returns_days, returns_notes) + commercial_terms_contract_id,
--          commercial_terms_valid_until, commercial_terms_updated_at. O prazo de entrega reutiliza delivery_sla_days.
--        purchase_orders: payment_terms_days, payment_due_date (= order_date + prazo), preenchidos por gatilho a partir do
--          fornecedor.
--        supplier_portal_users: phone (E.164) e phone_updated_at — o telemóvel para o SMS da assinatura.
--   4. Gatilhos novos
--        trg_suppliers_05_guarda_condicoes      condições só de leitura enquanto houver contrato assinado e em vigor
--                                               (para TODOS os papéis; só a contra-assinatura passa, com app.sc_condicoes)
--        trg_purchase_orders_02_guarda_prazo    authenticated/anon não escrevem o prazo/vencimento da PO à mão
--        trg_purchase_orders_10_prazo_pagamento preenche prazo (do fornecedor) e vencimento (data da encomenda + prazo)
--        trg_supplier_contracts_00_guarda       imutável depois de enviado; transições de estado válidas; assinaturas fixas
--        trg_supplier_contract_files_00_guarda  ficheiros imutáveis; CRM só em rascunho, portal só enviado
--        trg_supplier_contract_events_00_guarda histórico só acrescenta
--   5. Bucket privado supplier-contracts: escrita só pela service_role (Edge supplier-contract-action, Fase 2, que
--      calcula o SHA-256 dos bytes); leitura pelo CRM (suppliers.view/contract_manage na org) e pelo portal (só os
--      contratos enviados do próprio fornecedor), por fn_sc_ficheiro_legivel.
--   6. RPCs (assinaturas no fim do ficheiro, secção 9).
--
-- Assinaturas (decisão): as duas RPCs de assinatura (sp_supplier_contract_sign e rpc_supplier_contract_countersign)
--   são chamadas pelo próprio utilizador (authenticated) e validam no servidor o OTP já verificado pela Edge sms-otp,
--   consumindo-o atomicamente, como rpc_contra_assinar_contrato: o OTP está preso ao auth_user_id, à referência
--   (o contrato), ao propósito e — no fornecedor — ao telemóvel atual do titular. Assim a prova não depende de mais
--   nenhuma Edge com service_role; a Edge da Fase 2 só trata dos ficheiros (SHA-256 dos bytes) e dos e-mails.
--   Só o registo de ficheiros é service_role-only (p_caller_auth_uid, como rpc_supplier_portal_invite_prepare),
--   porque o SHA-256 tem de vir de quem leu os bytes.
--
-- Reversão (só como migration nova): DROP das 4 tabelas, das colunas novas, dos gatilhos e funções fn_sc_*,
--   rpc_supplier_contract*, sp_supplier_contract*, sp_*_my_phone, das policies supplier_contracts_* em storage.objects,
--   do bucket (vazio) e da permissão (com a claim local).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- 0. Guardas ------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
BEGIN
  IF to_regclass('public.supplier_contracts') IS NOT NULL OR to_regclass('public.supplier_contract_templates') IS NOT NULL
     OR to_regclass('public.supplier_contract_files') IS NOT NULL OR to_regclass('public.supplier_contract_events') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: as tabelas do contrato de fornecedor já existem.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.suppliers'::regclass AND NOT attisdropped
     AND attname IN ('payment_terms_days', 'payment_method', 'shipping_terms', 'shipping_free_from', 'discount_percent',
                     'min_order_value', 'returns_accepted', 'returns_days', 'returns_notes', 'commercial_terms_contract_id',
                     'commercial_terms_valid_until', 'commercial_terms_updated_at');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: suppliers já tem % das colunas novas.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.suppliers'::regclass AND attname = 'delivery_sla_days'
                  AND NOT attisdropped AND atttypid = 'integer'::regtype) THEN
    RAISE EXCEPTION 'Guarda: suppliers.delivery_sla_days (integer) não existe.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.purchase_orders'::regclass AND NOT attisdropped
              AND attname IN ('payment_terms_days', 'payment_due_date'))
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.supplier_portal_users'::regclass AND NOT attisdropped
              AND attname IN ('phone', 'phone_updated_at')) THEN
    RAISE EXCEPTION 'Guarda: purchase_orders ou supplier_portal_users já têm as colunas novas.';
  END IF;

  IF to_regprocedure('public.fn_sp_actor()') IS NULL
     OR to_regprocedure('public.fn_pode_assinar_contratos(uuid,uuid)') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.has_anew_permission(uuid,text)') IS NULL
     OR to_regprocedure('public.get_user_visible_org_ids(uuid)') IS NULL
     OR to_regprocedure('public.fn_sp_html_escape(text)') IS NULL
     OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das funções base (fn_sp_actor, fn_pode_assinar_contratos, has_anew_permission*, get_user_visible_org_ids, fn_sp_html_escape, extensions.digest).';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND (p.proname LIKE 'fn\_sc\_%' OR p.proname LIKE 'rpc\_supplier\_contract%'
                   OR p.proname LIKE 'sp\_supplier\_contract%' OR p.proname IN ('sp_set_my_phone', 'sp_get_my_phone'))) THEN
    RAISE EXCEPTION 'Guarda: já existem funções com os nomes novos (fn_sc_*, rpc_supplier_contract*, sp_supplier_contract*, sp_*_my_phone).';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'supplier-contracts') THEN
    RAISE EXCEPTION 'Guarda: o bucket supplier-contracts já existe.';
  END IF;

  -- sms_otp_codes: as colunas que as assinaturas usam.
  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = 'public.sms_otp_codes'::regclass AND NOT attisdropped
     AND attname IN ('phone_number', 'purpose', 'reference_id', 'reference_type', 'verified_at', 'consumed_at',
                     'auth_user_id', 'ip_address', 'user_agent');
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'Guarda: sms_otp_codes não tem as 9 colunas esperadas (encontradas %).', v_n;
  END IF;

  -- O aviso no sino do CRM usa este índice no ON CONFLICT.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'notifications_dedup') THEN
    RAISE EXCEPTION 'Guarda: falta o índice notifications_dedup.';
  END IF;
END $$;

-- 1. Permissão -----------------------------------------------------------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('suppliers.contract_manage', 'Gerir contratos de fornecedor',
   'Criar, editar e enviar os contratos de condições comerciais aos fornecedores, gerir os modelos e contra-assinar pela empresa (a contra-assinatura exige também um papel com poderes para assinar contratos).',
   'suppliers', NULL, 4, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_role       uuid;
  v_n          int;
  v_prev_claim text;
BEGIN
  SELECT count(*) INTO v_n FROM public.anew_roles r WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'Papel super_admin global não existe nesta base: não se concede nada.';
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papéis super_admin globais de sistema (esperado 1)', v_n;
  END IF;
  SELECT r.id INTO v_role FROM public.anew_roles r WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;

  v_prev_claim := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  VALUES (v_role, 'suppliers.contract_manage', NULL::uuid)
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);

  IF NOT EXISTS (SELECT 1 FROM public.anew_role_permissions WHERE role_id = v_role AND permission_code = 'suppliers.contract_manage') THEN
    RAISE EXCEPTION 'CONFERIR: o super_admin não ficou com suppliers.contract_manage';
  END IF;
END $$;

-- 2. Tabelas -------------------------------------------------------------------------------------------------------
CREATE TABLE public.supplier_contract_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  kind            text NOT NULL DEFAULT 'material' CHECK (kind IN ('material', 'servico')),
  description     text CHECK (description IS NULL OR char_length(description) <= 2000),
  body_html       text NOT NULL CHECK (char_length(body_html) BETWEEN 1 AND 500000),
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_contract_templates_org ON public.supplier_contract_templates (organization_id, kind) WHERE is_active;

CREATE TABLE public.supplier_contracts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES public.anew_organizations(id),
  supplier_id                uuid NOT NULL REFERENCES public.suppliers(id),
  -- Conta e ligação do portal, fixadas no envio (sem FK: não prendem a gestão do portal).
  supplier_account_id        uuid,
  supplier_account_link_id   uuid,
  contract_number            text NOT NULL CHECK (contract_number ~ '^CF-[0-9]{4}-[0-9]{4,}$'),
  version                    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  previous_contract_id       uuid REFERENCES public.supplier_contracts(id),
  superseded_by_id           uuid REFERENCES public.supplier_contracts(id),
  kind                       text NOT NULL DEFAULT 'material' CHECK (kind IN ('material', 'servico')),
  origin                     text NOT NULL DEFAULT 'modelo' CHECK (origin IN ('modelo', 'pdf_fornecedor')),
  template_id                uuid REFERENCES public.supplier_contract_templates(id),
  title                      text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body_html                  text CHECK (body_html IS NULL OR char_length(body_html) <= 500000),
  -- Condições estruturadas
  payment_terms_days         integer CHECK (payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365),
  payment_method             text CHECK (payment_method IS NULL OR payment_method IN
                               ('transferencia', 'multibanco', 'debito_direto', 'cheque', 'numerario', 'cartao', 'outro')),
  delivery_sla_days          integer CHECK (delivery_sla_days IS NULL OR delivery_sla_days BETWEEN 0 AND 365),
  shipping_terms             text CHECK (shipping_terms IS NULL OR shipping_terms IN
                               ('incluidos', 'a_cargo_comprador', 'gratis_acima_minimo', 'a_combinar')),
  shipping_free_from         numeric(12,2) CHECK (shipping_free_from IS NULL OR shipping_free_from >= 0),
  discount_percent           numeric(5,2) CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
  min_order_value            numeric(12,2) CHECK (min_order_value IS NULL OR min_order_value >= 0),
  returns_accepted           boolean,
  returns_days               integer CHECK (returns_days IS NULL OR returns_days BETWEEN 0 AND 365),
  returns_notes              text CHECK (returns_notes IS NULL OR char_length(returns_notes) <= 2000),
  conditions_notes           text CHECK (conditions_notes IS NULL OR char_length(conditions_notes) <= 4000),
  valid_from                 date,
  valid_until                date,
  -- Documento congelado no envio
  document_html              text,
  document_sha256            text CHECK (document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$'),
  document_frozen_at         timestamptz,
  main_file_id               uuid,
  status                     text NOT NULL DEFAULT 'draft' CHECK (status IN
                               ('draft', 'sent', 'signed_supplier', 'signed', 'refused', 'cancelled', 'expired', 'superseded')),
  sent_at                    timestamptz,
  sent_by                    uuid,
  -- Assinatura do fornecedor (titular do portal, OTP SMS)
  supplier_signed_at               timestamptz,
  supplier_signed_by_portal_user_id uuid,
  supplier_signed_by_name          text,
  supplier_signed_by_email         text,
  supplier_signed_phone            text,
  supplier_signed_ip               text,
  supplier_signed_user_agent       text,
  supplier_signed_document_sha256  text CHECK (supplier_signed_document_sha256 IS NULL OR supplier_signed_document_sha256 ~ '^[0-9a-f]{64}$'),
  supplier_signed_files            jsonb,
  supplier_signature_sha256        text CHECK (supplier_signature_sha256 IS NULL OR supplier_signature_sha256 ~ '^[0-9a-f]{64}$'),
  supplier_signature_otp_id        uuid,
  -- Contra-assinatura da empresa
  company_signed_at          timestamptz,
  company_signed_by_id       uuid,
  company_signed_by_name     text,
  company_signature_mode     text CHECK (company_signature_mode IS NULL OR company_signature_mode IN ('sms_otp')),
  company_signature_otp_id   uuid,
  company_signed_ip          text,
  company_signed_user_agent  text,
  -- Recusa, cancelamento, substituição, expiração
  refused_at                 timestamptz,
  refused_by_portal_user_id  uuid,
  refusal_reason             text CHECK (refusal_reason IS NULL OR char_length(refusal_reason) BETWEEN 3 AND 2000),
  cancelled_at               timestamptz,
  cancelled_by               uuid,
  cancel_reason              text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 2000),
  superseded_at              timestamptz,
  expired_at                 timestamptz,
  created_by                 uuid,
  updated_by                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_contracts_numero_versao_uniq UNIQUE (organization_id, contract_number, version),
  CONSTRAINT supplier_contracts_validade_chk CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CONSTRAINT supplier_contracts_enviado_chk CHECK (status IN ('draft', 'cancelled')
    OR (document_html IS NOT NULL AND document_sha256 IS NOT NULL AND document_frozen_at IS NOT NULL AND sent_at IS NOT NULL)),
  CONSTRAINT supplier_contracts_assin_forn_chk CHECK (status NOT IN ('signed_supplier', 'signed', 'expired', 'superseded')
    OR supplier_signed_at IS NOT NULL),
  CONSTRAINT supplier_contracts_assin_emp_chk CHECK (status NOT IN ('signed', 'expired', 'superseded')
    OR company_signed_at IS NOT NULL),
  CONSTRAINT supplier_contracts_recusa_chk CHECK (status <> 'refused' OR (refused_at IS NOT NULL AND refusal_reason IS NOT NULL)),
  CONSTRAINT supplier_contracts_cancel_chk CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);
-- Um contrato em curso de cada vez por fornecedor; um só assinado.
CREATE UNIQUE INDEX supplier_contracts_um_em_curso ON public.supplier_contracts (supplier_id)
  WHERE status IN ('draft', 'sent', 'signed_supplier');
CREATE UNIQUE INDEX supplier_contracts_um_assinado ON public.supplier_contracts (supplier_id) WHERE status = 'signed';
CREATE INDEX idx_supplier_contracts_org_status ON public.supplier_contracts (organization_id, status);
CREATE INDEX idx_supplier_contracts_supplier ON public.supplier_contracts (supplier_id, version DESC);
CREATE INDEX idx_supplier_contracts_validade ON public.supplier_contracts (valid_until) WHERE status = 'signed';

CREATE TABLE public.supplier_contract_files (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id                 uuid NOT NULL REFERENCES public.supplier_contracts(id),
  organization_id             uuid NOT NULL REFERENCES public.anew_organizations(id),
  kind                        text NOT NULL CHECK (kind IN ('contrato_fornecedor', 'anexo')),
  storage_bucket              text NOT NULL DEFAULT 'supplier-contracts' CHECK (storage_bucket = 'supplier-contracts'),
  storage_path                text NOT NULL UNIQUE CHECK (char_length(storage_path) <= 400),
  file_name                   text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type                   text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes                  bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  sha256                      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_via                text NOT NULL CHECK (uploaded_via IN ('crm', 'portal')),
  uploaded_by_user_id         uuid,
  uploaded_by_portal_user_id  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_contract_files_autor_chk CHECK (
    (uploaded_via = 'crm' AND uploaded_by_user_id IS NOT NULL AND uploaded_by_portal_user_id IS NULL)
    OR (uploaded_via = 'portal' AND uploaded_by_portal_user_id IS NOT NULL AND uploaded_by_user_id IS NULL))
);
CREATE INDEX idx_supplier_contract_files_contract ON public.supplier_contract_files (contract_id, created_at);

ALTER TABLE public.supplier_contracts
  ADD CONSTRAINT supplier_contracts_main_file_fkey FOREIGN KEY (main_file_id) REFERENCES public.supplier_contract_files(id);

CREATE TABLE public.supplier_contract_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id           uuid NOT NULL REFERENCES public.supplier_contracts(id),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id),
  event_type            text NOT NULL CHECK (event_type IN
                          ('created', 'updated', 'conditions_updated', 'sent', 'file_added', 'supplier_signed',
                           'company_signed', 'refused', 'cancelled', 'superseded', 'expired', 'new_version')),
  description           text,
  data                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id         uuid,
  actor_portal_user_id  uuid,
  ip                    text,
  user_agent            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_contract_events_contract ON public.supplier_contract_events (contract_id, created_at);

-- 3. Colunas novas -------------------------------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN payment_terms_days integer CHECK (payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365),
  ADD COLUMN payment_method text CHECK (payment_method IS NULL OR payment_method IN
    ('transferencia', 'multibanco', 'debito_direto', 'cheque', 'numerario', 'cartao', 'outro')),
  ADD COLUMN shipping_terms text CHECK (shipping_terms IS NULL OR shipping_terms IN
    ('incluidos', 'a_cargo_comprador', 'gratis_acima_minimo', 'a_combinar')),
  ADD COLUMN shipping_free_from numeric(12,2) CHECK (shipping_free_from IS NULL OR shipping_free_from >= 0),
  ADD COLUMN discount_percent numeric(5,2) CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
  ADD COLUMN min_order_value numeric(12,2) CHECK (min_order_value IS NULL OR min_order_value >= 0),
  ADD COLUMN returns_accepted boolean,
  ADD COLUMN returns_days integer CHECK (returns_days IS NULL OR returns_days BETWEEN 0 AND 365),
  ADD COLUMN returns_notes text CHECK (returns_notes IS NULL OR char_length(returns_notes) <= 2000),
  ADD COLUMN commercial_terms_contract_id uuid REFERENCES public.supplier_contracts(id),
  ADD COLUMN commercial_terms_valid_until date,
  ADD COLUMN commercial_terms_updated_at timestamptz;

ALTER TABLE public.purchase_orders
  ADD COLUMN payment_terms_days integer CHECK (payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365),
  ADD COLUMN payment_due_date date;

ALTER TABLE public.supplier_portal_users
  ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  ADD COLUMN phone_updated_at timestamptz;

COMMENT ON COLUMN public.suppliers.payment_terms_days IS 'Prazo de pagamento (dias). Vem do contrato de fornecedor assinado; só de leitura enquanto ele estiver em vigor.';
COMMENT ON COLUMN public.suppliers.commercial_terms_contract_id IS 'Contrato de fornecedor de onde vieram as condições comerciais vigentes (só a contra-assinatura escreve).';
COMMENT ON COLUMN public.purchase_orders.payment_due_date IS 'Vencimento = order_date + payment_terms_days (gatilho trg_purchase_orders_10_prazo_pagamento).';
COMMENT ON COLUMN public.supplier_portal_users.phone IS 'Telemóvel (E.164) para o SMS da assinatura do contrato de fornecedor; pedido no passo confirmar dados.';

-- 4. Funções internas (sem EXECUTE para anon/authenticated) -------------------------------------------------------

-- 4.1 Permissão na organização indicada ou numa ascendente (como o signatario_minuta de rpc_contra_assinar_contrato).
CREATE FUNCTION public.fn_sc_pode(p_uid uuid, p_perm text, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE orgs(org) AS (
    SELECT p_org
    UNION
    SELECT h.parent_org_id FROM public.anew_hierarchy h JOIN orgs o ON h.child_org_id = o.org
  )
  SELECT p_uid IS NOT NULL AND p_org IS NOT NULL
     AND p_org IN (SELECT public.get_user_visible_org_ids(p_uid))
     AND EXISTS (SELECT 1 FROM orgs WHERE public.has_anew_permission_in_org(p_uid, p_perm, orgs.org))
$$;

-- 4.2 Ver contratos: o mesmo critério da policy de suppliers (org visível + suppliers.view), ou quem os gere.
CREATE FUNCTION public.fn_sc_pode_ver(p_uid uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_uid IS NOT NULL AND p_org IS NOT NULL
     AND p_org IN (SELECT public.get_user_visible_org_ids(p_uid))
     AND (public.has_anew_permission(p_uid, 'suppliers.view')
          OR public.fn_sc_pode(p_uid, 'suppliers.contract_manage', p_org))
$$;

-- 4.3 O utilizador do CRM (anew_users) do auth.uid().
CREATE FUNCTION public.fn_sc_crm_actor(p_uid uuid)
RETURNS public.anew_users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.anew_users;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT u.* INTO v FROM public.anew_users u WHERE u.auth_user_id = p_uid AND u.deleted_at IS NULL LIMIT 1;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN v;
END;
$$;

-- 4.4 O portal tem acesso ativo a (fornecedor, organização)?
CREATE FUNCTION public.fn_sc_portal_tem_acesso(p_portal_user_id uuid, p_supplier_id uuid, p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_account_links l ON l.id = x.link_id
    JOIN public.suppliers s ON s.id = l.supplier_id
    WHERE x.portal_user_id = p_portal_user_id AND x.revoked_at IS NULL
      AND l.status = 'active' AND s.deleted_at IS NULL
      AND l.supplier_id = p_supplier_id AND l.organization_id = p_org)
$$;

-- 4.5 Telemóvel normalizado para E.164 (PT: 9[1236]xxxxxxx com ou sem +351/00351; estrangeiro: E.164). NULL = inválido.
CREATE FUNCTION public.fn_sc_normalizar_telemovel(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v text := regexp_replace(COALESCE(p, ''), '[[:space:]()./-]', '', 'g');
BEGIN
  IF v = '' THEN
    RETURN NULL;
  END IF;
  IF v ~ '^00[1-9]' THEN
    v := '+' || substr(v, 3);
  END IF;
  IF v ~ '^9[1236][0-9]{7}$' THEN
    v := '+351' || v;
  END IF;
  IF v !~ '^\+[1-9][0-9]{6,14}$' THEN
    RETURN NULL;
  END IF;
  IF v ~ '^\+351' AND v !~ '^\+3519[1236][0-9]{7}$' THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$;

CREATE FUNCTION public.fn_sc_mascarar_telemovel(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN p IS NULL OR char_length(p) < 8 THEN p
              ELSE left(p, 4) || repeat('*', char_length(p) - 7) || right(p, 3) END
$$;

-- 4.6 IP e agente do pedido PostgREST (vazio fora dele).
CREATE FUNCTION public.fn_sc_pedido(p_campo text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  h jsonb;
  v text;
BEGIN
  BEGIN
    h := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF h IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_campo = 'ip' THEN
    v := btrim(split_part(COALESCE(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1));
  ELSE
    v := h ->> 'user-agent';
  END IF;
  RETURN left(NULLIF(v, ''), 500);
END;
$$;

-- 4.7 Leitura validada de campos jsonb (erros legíveis, HINT validation).
CREATE FUNCTION public.fn_sc_j_int(p jsonb, k text, rotulo text, vmin int, vmax int)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  t text;
  v integer;
BEGIN
  IF p IS NULL OR NOT (p ? k) OR jsonb_typeof(p -> k) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> k) NOT IN ('number', 'string') THEN
    RAISE EXCEPTION 'O campo «%» tem de ser um número inteiro.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  t := btrim(p ->> k);
  IF t = '' THEN
    RETURN NULL;
  END IF;
  IF t !~ '^-?[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'O campo «%» tem de ser um número inteiro.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  v := t::integer;
  IF v < vmin OR v > vmax THEN
    RAISE EXCEPTION 'O campo «%» tem de estar entre % e %.', rotulo, vmin, vmax USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  RETURN v;
END;
$$;

CREATE FUNCTION public.fn_sc_j_num(p jsonb, k text, rotulo text, vmin numeric, vmax numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  t text;
  v numeric;
BEGIN
  IF p IS NULL OR NOT (p ? k) OR jsonb_typeof(p -> k) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> k) NOT IN ('number', 'string') THEN
    RAISE EXCEPTION 'O campo «%» tem de ser um número.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  t := replace(btrim(p ->> k), ',', '.');
  IF t = '' THEN
    RETURN NULL;
  END IF;
  IF t !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'O campo «%» tem de ser um número (até 2 casas decimais).', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  v := t::numeric;
  IF v < vmin OR v > vmax THEN
    RAISE EXCEPTION 'O campo «%» tem de estar entre % e %.', rotulo, vmin, vmax USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  RETURN v;
END;
$$;

CREATE FUNCTION public.fn_sc_j_text(p jsonb, k text, rotulo text, maxlen int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  IF p IS NULL OR NOT (p ? k) OR jsonb_typeof(p -> k) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> k) <> 'string' THEN
    RAISE EXCEPTION 'O campo «%» tem um valor inválido.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  v := NULLIF(regexp_replace(p ->> k, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  IF v IS NOT NULL AND char_length(v) > maxlen THEN
    RAISE EXCEPTION 'O campo «%» deve ter no máximo % caracteres.', rotulo, maxlen USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF v ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
    RAISE EXCEPTION 'O campo «%» tem caracteres inválidos.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  RETURN v;
END;
$$;

CREATE FUNCTION public.fn_sc_j_bool(p jsonb, k text, rotulo text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p IS NULL OR NOT (p ? k) OR jsonb_typeof(p -> k) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> k) <> 'boolean' THEN
    RAISE EXCEPTION 'O campo «%» tem de ser sim/não.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  RETURN (p -> k)::boolean;
END;
$$;

CREATE FUNCTION public.fn_sc_j_date(p jsonb, k text, rotulo text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  t text;
BEGIN
  IF p IS NULL OR NOT (p ? k) OR jsonb_typeof(p -> k) = 'null' THEN
    RETURN NULL;
  END IF;
  t := btrim(COALESCE(p ->> k, ''));
  IF t = '' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> k) <> 'string' OR t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'O campo «%» tem de ser uma data (AAAA-MM-DD).', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  BEGIN
    RETURN t::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'O campo «%» tem uma data inválida.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END;
END;
$$;

CREATE FUNCTION public.fn_sc_j_uuid(p jsonb, k text, rotulo text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  t text;
BEGIN
  IF p IS NULL OR NOT (p ? k) OR jsonb_typeof(p -> k) = 'null' THEN
    RETURN NULL;
  END IF;
  t := lower(btrim(COALESCE(p ->> k, '')));
  IF t = '' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> k) <> 'string' OR t !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'O campo «%» tem um identificador inválido.', rotulo USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  RETURN t::uuid;
END;
$$;

-- Só as chaves aceites; qualquer outra é erro (apanha gralhas do frontend).
CREATE FUNCTION public.fn_sc_so_chaves(p jsonb, p_aceites text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_fora text;
BEGIN
  IF p IS NULL THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora FROM jsonb_object_keys(p) k WHERE NOT (k = ANY (p_aceites));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Campos desconhecidos: %', v_fora USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
END;
$$;

-- 4.8 Variáveis dos modelos (chave, rótulo, exemplo). tabela_condicoes é HTML gerado pelo servidor.
CREATE FUNCTION public.fn_sc_variaveis()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('key', 'empresa_nome', 'label', 'Nome da empresa', 'example', 'Empresa, Lda.'),
    jsonb_build_object('key', 'fornecedor_nome', 'label', 'Nome do fornecedor', 'example', 'Fornecedor, S.A.'),
    jsonb_build_object('key', 'fornecedor_nif', 'label', 'NIF do fornecedor', 'example', '500000000'),
    jsonb_build_object('key', 'fornecedor_morada', 'label', 'Morada do fornecedor', 'example', 'Rua Exemplo, 1'),
    jsonb_build_object('key', 'fornecedor_codigo_postal', 'label', 'Código postal do fornecedor', 'example', '1000-001'),
    jsonb_build_object('key', 'fornecedor_localidade', 'label', 'Localidade do fornecedor', 'example', 'Lisboa'),
    jsonb_build_object('key', 'fornecedor_email', 'label', 'E-mail do fornecedor', 'example', 'geral@fornecedor.pt'),
    jsonb_build_object('key', 'numero_contrato', 'label', 'Número do contrato', 'example', 'CF-2026-0001'),
    jsonb_build_object('key', 'versao', 'label', 'Versão do contrato', 'example', '1'),
    jsonb_build_object('key', 'titulo', 'label', 'Título do contrato', 'example', 'Condições comerciais'),
    jsonb_build_object('key', 'data_envio', 'label', 'Data de envio', 'example', '02/11/2026'),
    jsonb_build_object('key', 'prazo_pagamento_dias', 'label', 'Prazo de pagamento (dias)', 'example', '30'),
    jsonb_build_object('key', 'forma_pagamento', 'label', 'Forma de pagamento', 'example', 'Transferência bancária'),
    jsonb_build_object('key', 'prazo_entrega_dias', 'label', 'Prazo de entrega (dias)', 'example', '5'),
    jsonb_build_object('key', 'portes', 'label', 'Portes', 'example', 'Incluídos no preço'),
    jsonb_build_object('key', 'portes_gratis_a_partir', 'label', 'Portes grátis a partir de', 'example', '250,00 €'),
    jsonb_build_object('key', 'desconto_percentagem', 'label', 'Desconto (%)', 'example', '5'),
    jsonb_build_object('key', 'encomenda_minima', 'label', 'Encomenda mínima', 'example', '100,00 €'),
    jsonb_build_object('key', 'devolucoes', 'label', 'Devoluções aceites', 'example', 'Sim'),
    jsonb_build_object('key', 'devolucoes_dias', 'label', 'Prazo de devolução (dias)', 'example', '15'),
    jsonb_build_object('key', 'devolucoes_condicoes', 'label', 'Condições de devolução', 'example', 'Material por abrir'),
    jsonb_build_object('key', 'observacoes', 'label', 'Observações', 'example', ''),
    jsonb_build_object('key', 'validade_inicio', 'label', 'Início da validade', 'example', '01/01/2027'),
    jsonb_build_object('key', 'validade_fim', 'label', 'Fim da validade', 'example', '31/12/2027'),
    jsonb_build_object('key', 'tabela_condicoes', 'label', 'Tabela com todas as condições', 'example', '(tabela)')
  )
$$;

-- 4.9 O corpo do modelo: sem conteúdo ativo e só variáveis conhecidas.
CREATE FUNCTION public.fn_sc_validar_corpo(p_body text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_fora text;
BEGIN
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'O texto do contrato está vazio.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF p_body ~* '<\s*/?\s*(script|iframe|object|embed|form|base|meta)\M' OR p_body ~* '<[^>]*[[:space:]/]on[a-z]+[[:space:]]*='
     OR p_body ~* 'javascript[[:space:]]*:' THEN
    RAISE EXCEPTION 'O texto do contrato tem conteúdo não permitido (scripts, formulários ou eventos).'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF regexp_replace(p_body, '\{\{[[:space:]]*[a-z_]+[[:space:]]*\}\}', '', 'g') ~ '\{\{|\}\}' THEN
    RAISE EXCEPTION 'O texto do contrato tem uma variável mal escrita (use {{nome_da_variavel}}, em minúsculas).'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  SELECT string_agg(DISTINCT '{{' || m[1] || '}}', ', ') INTO v_fora
  FROM regexp_matches(p_body, '\{\{[[:space:]]*([a-z_]+)[[:space:]]*\}\}', 'g') m
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.fn_sc_variaveis()) e WHERE e ->> 'key' = m[1]);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Variáveis desconhecidas no texto do contrato: %', v_fora USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
END;
$$;

-- 4.10 Formatação
CREATE FUNCTION public.fn_sc_euros(v numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN v IS NULL THEN NULL ELSE replace(to_char(round(v, 2), 'FM999999999990.00'), '.', ',') || ' €' END
$$;

CREATE FUNCTION public.fn_sc_numero(v numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN v IS NULL THEN NULL
              ELSE replace(rtrim(rtrim(to_char(round(v, 2), 'FM999999999990.00'), '0'), '.'), '.', ',') END
$$;

-- 4.11 Valores das variáveis (texto já escapado para HTML) de um contrato.
CREATE FUNCTION public.fn_sc_valores(c public.supplier_contracts, p_data_envio timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s        public.suppliers;
  v_emp    text;
  v_na     constant text := 'Não aplicável';
  v_fp     text;
  v_portes text;
  v        jsonb;
  v_tab    text;
  e        jsonb;
  r        record;
BEGIN
  SELECT * INTO s FROM public.suppliers WHERE id = c.supplier_id;
  SELECT COALESCE(NULLIF(btrim(en.fiscal_name), ''), o.name) INTO v_emp
  FROM public.anew_organizations o LEFT JOIN public.anew_entities en ON en.id = o.entity_id
  WHERE o.id = c.organization_id;

  v_fp := CASE c.payment_method
            WHEN 'transferencia' THEN 'Transferência bancária' WHEN 'multibanco' THEN 'Referência Multibanco'
            WHEN 'debito_direto' THEN 'Débito direto' WHEN 'cheque' THEN 'Cheque' WHEN 'numerario' THEN 'Numerário'
            WHEN 'cartao' THEN 'Cartão' WHEN 'outro' THEN 'Outra (ver observações)' END;
  v_portes := CASE c.shipping_terms
            WHEN 'incluidos' THEN 'Incluídos no preço' WHEN 'a_cargo_comprador' THEN 'A cargo do comprador'
            WHEN 'gratis_acima_minimo' THEN 'Grátis a partir de ' || COALESCE(public.fn_sc_euros(c.shipping_free_from), '—')
            WHEN 'a_combinar' THEN 'A combinar em cada encomenda' END;

  v := jsonb_build_object(
    'empresa_nome', v_emp,
    'fornecedor_nome', s.name,
    'fornecedor_nif', COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')),
    'fornecedor_morada', s.address,
    'fornecedor_codigo_postal', s.postal_code,
    'fornecedor_localidade', s.city,
    'fornecedor_email', s.email,
    'numero_contrato', c.contract_number,
    'versao', c.version::text,
    'titulo', c.title,
    'data_envio', to_char(COALESCE(p_data_envio, now()) AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'),
    'prazo_pagamento_dias', c.payment_terms_days::text,
    'forma_pagamento', v_fp,
    'prazo_entrega_dias', c.delivery_sla_days::text,
    'portes', v_portes,
    'portes_gratis_a_partir', public.fn_sc_euros(c.shipping_free_from),
    'desconto_percentagem', public.fn_sc_numero(c.discount_percent),
    'encomenda_minima', public.fn_sc_euros(c.min_order_value),
    'devolucoes', CASE c.returns_accepted WHEN true THEN 'Sim' WHEN false THEN 'Não' END,
    'devolucoes_dias', c.returns_days::text,
    'devolucoes_condicoes', c.returns_notes,
    'observacoes', c.conditions_notes,
    'validade_inicio', to_char(c.valid_from, 'DD/MM/YYYY'),
    'validade_fim', COALESCE(to_char(c.valid_until, 'DD/MM/YYYY'), 'Sem termo')
  );

  -- Escapar tudo; vazio → "Não aplicável".
  e := '{}'::jsonb;
  FOR r IN SELECT key, value FROM jsonb_each_text(v) LOOP
    e := e || jsonb_build_object(r.key,
           CASE WHEN NULLIF(btrim(r.value), '') IS NULL THEN v_na
                ELSE replace(public.fn_sp_html_escape(r.value), E'\n', '<br>') END);
  END LOOP;

  v_tab := '<table class="condicoes-comerciais"><tbody>'
    || '<tr><th>Prazo de pagamento</th><td>' || CASE WHEN c.payment_terms_days IS NULL THEN v_na ELSE (e ->> 'prazo_pagamento_dias') || ' dias' END || '</td></tr>'
    || '<tr><th>Forma de pagamento</th><td>' || (e ->> 'forma_pagamento') || '</td></tr>'
    || '<tr><th>Prazo de entrega</th><td>' || CASE WHEN c.delivery_sla_days IS NULL THEN v_na ELSE (e ->> 'prazo_entrega_dias') || ' dias' END || '</td></tr>'
    || '<tr><th>Portes</th><td>' || (e ->> 'portes') || '</td></tr>'
    || '<tr><th>Desconto</th><td>' || CASE WHEN c.discount_percent IS NULL THEN v_na ELSE (e ->> 'desconto_percentagem') || ' %' END || '</td></tr>'
    || '<tr><th>Encomenda mínima</th><td>' || (e ->> 'encomenda_minima') || '</td></tr>'
    || '<tr><th>Devoluções</th><td>' || (e ->> 'devolucoes')
         || CASE WHEN c.returns_days IS NOT NULL THEN ' (' || (e ->> 'devolucoes_dias') || ' dias)' ELSE '' END
         || CASE WHEN c.returns_notes IS NOT NULL THEN ' — ' || (e ->> 'devolucoes_condicoes') ELSE '' END || '</td></tr>'
    || '<tr><th>Validade</th><td>' || (e ->> 'validade_inicio') || ' a ' || (e ->> 'validade_fim') || '</td></tr>'
    || CASE WHEN c.conditions_notes IS NOT NULL THEN '<tr><th>Observações</th><td>' || (e ->> 'observacoes') || '</td></tr>' ELSE '' END
    || '</tbody></table>';

  RETURN e || jsonb_build_object('tabela_condicoes', v_tab);
END;
$$;

-- 4.12 O documento (HTML) de um contrato: modelo com as variáveis substituídas, ou o resumo das condições + o PDF.
CREATE FUNCTION public.fn_sc_render(c public.supplier_contracts, p_data_envio timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vals jsonb := public.fn_sc_valores(c, p_data_envio);
  v_html text;
  f      public.supplier_contract_files;
  m      record;
BEGIN
  IF c.origin = 'modelo' THEN
    PERFORM public.fn_sc_validar_corpo(c.body_html);
    v_html := c.body_html;
    FOR m IN SELECT DISTINCT x[1] AS inteiro, x[2] AS chave
             FROM regexp_matches(c.body_html, '(\{\{[[:space:]]*([a-z_]+)[[:space:]]*\}\})', 'g') x LOOP
      v_html := replace(v_html, m.inteiro, v_vals ->> m.chave);
    END LOOP;
    RETURN v_html;
  END IF;

  SELECT * INTO f FROM public.supplier_contract_files WHERE id = c.main_file_id;
  RETURN '<h2>' || (v_vals ->> 'titulo') || '</h2>'
      || '<p>' || (v_vals ->> 'empresa_nome') || ' e ' || (v_vals ->> 'fornecedor_nome')
      || ' — contrato ' || (v_vals ->> 'numero_contrato') || ', versão ' || (v_vals ->> 'versao') || '.</p>'
      || '<h3>Condições comerciais</h3>' || (v_vals ->> 'tabela_condicoes')
      || '<h3>Contrato do fornecedor</h3><p>'
      || CASE WHEN f.id IS NULL THEN 'Por anexar.'
              ELSE public.fn_sp_html_escape(f.file_name) || ' (SHA-256 ' || f.sha256 || ')' END
      || '</p>';
END;
$$;

-- 4.13 Número novo CF-AAAA-NNNN por organização.
CREATE FUNCTION public.fn_sc_novo_numero(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ano text := to_char(now() AT TIME ZONE 'Europe/Lisbon', 'YYYY');
  v_n   integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sc_numero:' || p_org::text, 0));
  SELECT COALESCE(max(substr(contract_number, 9)::integer), 0) + 1 INTO v_n
  FROM public.supplier_contracts
  WHERE organization_id = p_org AND contract_number LIKE 'CF-' || v_ano || '-%';
  RETURN 'CF-' || v_ano || '-' || lpad(v_n::text, 4, '0');
END;
$$;

-- 4.14 Condições bloqueadas: há um contrato assinado e em vigor.
CREATE FUNCTION public.fn_sc_condicoes_bloqueadas(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_contracts c
    WHERE c.supplier_id = p_supplier_id AND c.status = 'signed'
      AND (c.valid_until IS NULL OR c.valid_until >= (now() AT TIME ZONE 'Europe/Lisbon')::date))
$$;

-- 4.15 Evento
CREATE FUNCTION public.fn_sc_evento(c public.supplier_contracts, p_tipo text, p_desc text, p_data jsonb,
                                    p_user uuid, p_portal_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.supplier_contract_events
    (contract_id, organization_id, event_type, description, data, actor_user_id, actor_portal_user_id, ip, user_agent,
     created_at)
  VALUES
    (c.id, c.organization_id, p_tipo, p_desc, COALESCE(p_data, '{}'::jsonb), p_user, p_portal_user,
     public.fn_sc_pedido('ip'), public.fn_sc_pedido('ua'), clock_timestamp());
$$;

-- 4.16 Aviso no sino do CRM a quem gere contratos na org (falha não desfaz a operação).
CREATE FUNCTION public.fn_sc_notificar(c public.supplier_contracts, p_tipo text, p_titulo text, p_msg text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
  SELECT au.auth_user_id, c.organization_id, 'notification', p_tipo, p_titulo, p_msg,
         '/suppliers?open=' || c.supplier_id::text || '&tab=contratos',
         'supplier_contract', c.id, 'normal',
         jsonb_build_object('modulo', 'compras', 'supplier_id', c.supplier_id, 'contract_id', c.id, 'status', c.status)
  FROM (
    SELECT DISTINCT au0.auth_user_id
    FROM public.anew_memberships m
    JOIN public.anew_users au0 ON au0.id = m.user_id
    WHERE m.organization_id = c.organization_id
      AND m.status = 'active' AND m.role_is_client IS NOT TRUE
      AND au0.deleted_at IS NULL AND au0.auth_user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                  WHERE rp.role_id = m.role_id AND rp.permission_code = 'suppliers.contract_manage')
  ) au
  ON CONFLICT (type, entity_id, user_id) WHERE is_resolved = false DO UPDATE SET
    organization_id = EXCLUDED.organization_id, title = EXCLUDED.title, message = EXCLUDED.message,
    link = EXCLUDED.link, data = EXCLUDED.data, priority = EXCLUDED.priority,
    is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso do contrato de fornecedor não enviado: %', SQLERRM;
END;
$$;

-- 4.17 JSON de um contrato. p_para: 'crm' (tudo) ou 'portal' (sem dados internos).
CREATE FUNCTION public.fn_sc_contrato_json(c public.supplier_contracts, p_para text, p_completo boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hoje   date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v        jsonb;
  v_files  jsonb;
  v_events jsonb;
  v_sname  text;
  v_oname  text;
BEGIN
  SELECT s.name INTO v_sname FROM public.suppliers s WHERE s.id = c.supplier_id;
  SELECT o.name INTO v_oname FROM public.anew_organizations o WHERE o.id = c.organization_id;

  v := jsonb_build_object(
    'id', c.id, 'organization_id', c.organization_id, 'organization_name', v_oname,
    'supplier_id', c.supplier_id, 'supplier_name', v_sname,
    'contract_number', c.contract_number, 'version', c.version, 'previous_contract_id', c.previous_contract_id,
    'superseded_by_id', c.superseded_by_id,
    'kind', c.kind, 'origin', c.origin, 'title', c.title, 'status', c.status,
    'conditions', jsonb_build_object(
      'payment_terms_days', c.payment_terms_days, 'payment_method', c.payment_method,
      'delivery_sla_days', c.delivery_sla_days, 'shipping_terms', c.shipping_terms,
      'shipping_free_from', c.shipping_free_from, 'discount_percent', c.discount_percent,
      'min_order_value', c.min_order_value, 'returns_accepted', c.returns_accepted,
      'returns_days', c.returns_days, 'returns_notes', c.returns_notes, 'conditions_notes', c.conditions_notes),
    'valid_from', c.valid_from, 'valid_until', c.valid_until,
    'days_to_expiry', CASE WHEN c.valid_until IS NULL THEN NULL ELSE c.valid_until - v_hoje END,
    'expires_soon', c.status = 'signed' AND c.valid_until IS NOT NULL AND c.valid_until - v_hoje BETWEEN 0 AND 30,
    'sent_at', c.sent_at, 'document_sha256', c.document_sha256, 'document_frozen_at', c.document_frozen_at,
    'main_file_id', c.main_file_id,
    'supplier_signed_at', c.supplier_signed_at, 'supplier_signed_by_name', c.supplier_signed_by_name,
    'supplier_signed_phone_masked', public.fn_sc_mascarar_telemovel(c.supplier_signed_phone),
    'supplier_signature_sha256', c.supplier_signature_sha256,
    'company_signed_at', c.company_signed_at, 'company_signed_by_name', c.company_signed_by_name,
    'refused_at', c.refused_at, 'refusal_reason', c.refusal_reason,
    'cancelled_at', c.cancelled_at, 'superseded_at', c.superseded_at, 'expired_at', c.expired_at,
    'created_at', c.created_at, 'updated_at', c.updated_at);

  IF p_para = 'crm' THEN
    v := v || jsonb_build_object(
      'template_id', c.template_id, 'supplier_account_id', c.supplier_account_id,
      'supplier_account_link_id', c.supplier_account_link_id, 'sent_by', c.sent_by,
      'supplier_signed_by_portal_user_id', c.supplier_signed_by_portal_user_id,
      'supplier_signed_by_email', c.supplier_signed_by_email, 'supplier_signed_ip', c.supplier_signed_ip,
      'supplier_signed_user_agent', c.supplier_signed_user_agent,
      'supplier_signed_document_sha256', c.supplier_signed_document_sha256,
      'supplier_signed_files', c.supplier_signed_files,
      'company_signed_by_id', c.company_signed_by_id, 'company_signature_mode', c.company_signature_mode,
      'company_signed_ip', c.company_signed_ip,
      'cancelled_by', c.cancelled_by, 'cancel_reason', c.cancel_reason,
      'created_by', c.created_by, 'updated_by', c.updated_by);
  END IF;

  IF p_completo THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', f.id, 'kind', f.kind, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
             'sha256', f.sha256, 'storage_bucket', f.storage_bucket, 'storage_path', f.storage_path,
             'uploaded_via', f.uploaded_via, 'created_at', f.created_at,
             'is_main', COALESCE(f.id = c.main_file_id, false)) ORDER BY f.created_at, f.id), '[]'::jsonb)
    INTO v_files
    FROM public.supplier_contract_files f WHERE f.contract_id = c.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', e.id, 'event_type', e.event_type, 'description', e.description, 'created_at', e.created_at)
             || CASE WHEN p_para = 'crm'
                     THEN jsonb_build_object('data', e.data, 'actor_user_id', e.actor_user_id,
                                             'actor_portal_user_id', e.actor_portal_user_id, 'ip', e.ip)
                     ELSE '{}'::jsonb END
             ORDER BY e.created_at, e.id), '[]'::jsonb)
    INTO v_events
    FROM public.supplier_contract_events e
    WHERE e.contract_id = c.id
      AND (p_para = 'crm' OR e.event_type IN ('sent', 'file_added', 'supplier_signed', 'company_signed', 'refused',
                                              'cancelled', 'superseded', 'expired'));

    v := v || jsonb_build_object('document_html', c.document_html, 'files', v_files, 'events', v_events);
    IF p_para = 'crm' THEN
      v := v || jsonb_build_object('body_html', c.body_html);
    END IF;
  END IF;

  RETURN v;
END;
$$;

-- 4.17b Para as policies das tabelas novas (avaliadas como quem pede; só sobre o próprio auth.uid()).
CREATE FUNCTION public.fn_sc_rls_ver(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.fn_sc_pode_ver(auth.uid(), p_org)
$$;

-- 4.18 Leitura de um ficheiro do bucket (usada nas policies de storage.objects).
CREATE FUNCTION public.fn_sc_ficheiro_legivel(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.supplier_contract_files f
    JOIN public.supplier_contracts c ON c.id = f.contract_id
    WHERE f.storage_path = p_name
      AND (public.fn_sc_pode_ver(auth.uid(), c.organization_id)
           OR (c.status <> 'draft' AND EXISTS (
                 SELECT 1
                 FROM public.supplier_portal_users u
                 JOIN public.supplier_accounts a ON a.id = u.supplier_account_id AND a.status = 'active'
                 WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
                   AND public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id)))))
$$;

-- 5. Gatilhos ------------------------------------------------------------------------------------------------------

-- 5.1 suppliers: condições vigentes. Para TODOS os papéis (também funções definer e service_role): só a
--     contra-assinatura (app.sc_condicoes = 'on', LOCAL) escreve as colunas commercial_terms_*, e as condições não mudam
--     enquanto houver um contrato assinado e em vigor.
CREATE FUNCTION public.fn_sc_suppliers_guarda_condicoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(current_setting('app.sc_condicoes', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.commercial_terms_contract_id IS NOT NULL OR NEW.commercial_terms_valid_until IS NOT NULL
       OR NEW.commercial_terms_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'As condições do contrato só são registadas pela contra-assinatura do contrato de fornecedor'
        USING ERRCODE = 'insufficient_privilege', HINT = 'conditions_locked';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.commercial_terms_contract_id, NEW.commercial_terms_valid_until, NEW.commercial_terms_updated_at)
     IS DISTINCT FROM (OLD.commercial_terms_contract_id, OLD.commercial_terms_valid_until, OLD.commercial_terms_updated_at) THEN
    RAISE EXCEPTION 'As condições do contrato só são registadas pela contra-assinatura do contrato de fornecedor'
      USING ERRCODE = 'insufficient_privilege', HINT = 'conditions_locked';
  END IF;

  IF (NEW.payment_terms_days, NEW.payment_method, NEW.delivery_sla_days, NEW.shipping_terms, NEW.shipping_free_from,
      NEW.discount_percent, NEW.min_order_value, NEW.returns_accepted, NEW.returns_days, NEW.returns_notes)
     IS DISTINCT FROM
     (OLD.payment_terms_days, OLD.payment_method, OLD.delivery_sla_days, OLD.shipping_terms, OLD.shipping_free_from,
      OLD.discount_percent, OLD.min_order_value, OLD.returns_accepted, OLD.returns_days, OLD.returns_notes)
     AND public.fn_sc_condicoes_bloqueadas(OLD.id) THEN
    RAISE EXCEPTION 'As condições comerciais deste fornecedor vêm de um contrato assinado: para as mudar, faça uma nova versão do contrato.'
      USING ERRCODE = 'insufficient_privilege', HINT = 'conditions_locked';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_suppliers_05_guarda_condicoes
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_sc_suppliers_guarda_condicoes();

-- 5.2 purchase_orders: o prazo vem do fornecedor. INVOKER de propósito (current_user = quem escreve).
--     authenticated/anon: no INSERT o valor enviado é ignorado (o 10_ recalcula); no UPDATE não o mudam à mão.
CREATE FUNCTION public.fn_sc_po_guarda_prazo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.payment_terms_days := NULL;
    RETURN NEW;
  END IF;
  IF NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.order_date IS NOT DISTINCT FROM OLD.order_date
     AND (NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days
          OR NEW.payment_due_date IS DISTINCT FROM OLD.payment_due_date) THEN
    RAISE EXCEPTION 'O prazo de pagamento e o vencimento da encomenda vêm das condições do fornecedor'
      USING ERRCODE = 'insufficient_privilege', HINT = 'payment_terms_from_supplier';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_orders_02_guarda_prazo
  BEFORE INSERT OR UPDATE OF supplier_id, order_date, payment_terms_days, payment_due_date ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_sc_po_guarda_prazo();

-- DEFINER: lê suppliers sem depender da RLS de quem cria a encomenda.
CREATE FUNCTION public.fn_sc_po_prazo_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_terms_days IS NULL AND NEW.supplier_id IS NOT NULL THEN
      SELECT s.payment_terms_days INTO NEW.payment_terms_days FROM public.suppliers s WHERE s.id = NEW.supplier_id;
    END IF;
  ELSIF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
        AND NEW.payment_terms_days IS NOT DISTINCT FROM OLD.payment_terms_days THEN
    NEW.payment_terms_days := NULL;
    IF NEW.supplier_id IS NOT NULL THEN
      SELECT s.payment_terms_days INTO NEW.payment_terms_days FROM public.suppliers s WHERE s.id = NEW.supplier_id;
    END IF;
  END IF;
  NEW.payment_due_date := CASE WHEN NEW.payment_terms_days IS NULL OR NEW.order_date IS NULL THEN NULL
                               ELSE NEW.order_date + NEW.payment_terms_days END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_orders_10_prazo_pagamento
  BEFORE INSERT OR UPDATE OF supplier_id, order_date, payment_terms_days, payment_due_date ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_sc_po_prazo_pagamento();

-- 5.3 supplier_contracts: imutável depois de enviado. INVOKER (current_user = quem escreve).
CREATE FUNCTION public.fn_sc_contrato_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Os contratos de fornecedor só se alteram pelas funções do sistema'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Um contrato de fornecedor enviado não pode ser apagado' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
    RETURN OLD;
  END IF;

  IF (NEW.id, NEW.organization_id, NEW.supplier_id, NEW.contract_number, NEW.version, NEW.previous_contract_id,
      NEW.created_at, NEW.created_by)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.supplier_id, OLD.contract_number, OLD.version, OLD.previous_contract_id,
      OLD.created_at, OLD.created_by) THEN
    RAISE EXCEPTION 'A identificação do contrato de fornecedor não pode ser alterada' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF OLD.status <> 'draft' AND
     (NEW.kind, NEW.origin, NEW.template_id, NEW.title, NEW.body_html, NEW.payment_terms_days, NEW.payment_method,
      NEW.delivery_sla_days, NEW.shipping_terms, NEW.shipping_free_from, NEW.discount_percent, NEW.min_order_value,
      NEW.returns_accepted, NEW.returns_days, NEW.returns_notes, NEW.conditions_notes, NEW.valid_from, NEW.valid_until,
      NEW.document_html, NEW.document_sha256, NEW.document_frozen_at, NEW.main_file_id, NEW.supplier_account_id,
      NEW.supplier_account_link_id, NEW.sent_at, NEW.sent_by)
     IS DISTINCT FROM
     (OLD.kind, OLD.origin, OLD.template_id, OLD.title, OLD.body_html, OLD.payment_terms_days, OLD.payment_method,
      OLD.delivery_sla_days, OLD.shipping_terms, OLD.shipping_free_from, OLD.discount_percent, OLD.min_order_value,
      OLD.returns_accepted, OLD.returns_days, OLD.returns_notes, OLD.conditions_notes, OLD.valid_from, OLD.valid_until,
      OLD.document_html, OLD.document_sha256, OLD.document_frozen_at, OLD.main_file_id, OLD.supplier_account_id,
      OLD.supplier_account_link_id, OLD.sent_at, OLD.sent_by) THEN
    RAISE EXCEPTION 'Um contrato de fornecedor enviado não pode ser alterado: faça uma nova versão'
      USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF OLD.supplier_signed_at IS NOT NULL AND
     (NEW.supplier_signed_at, NEW.supplier_signed_by_portal_user_id, NEW.supplier_signed_by_name, NEW.supplier_signed_by_email,
      NEW.supplier_signed_phone, NEW.supplier_signed_ip, NEW.supplier_signed_user_agent, NEW.supplier_signed_document_sha256,
      NEW.supplier_signed_files, NEW.supplier_signature_sha256, NEW.supplier_signature_otp_id)
     IS DISTINCT FROM
     (OLD.supplier_signed_at, OLD.supplier_signed_by_portal_user_id, OLD.supplier_signed_by_name, OLD.supplier_signed_by_email,
      OLD.supplier_signed_phone, OLD.supplier_signed_ip, OLD.supplier_signed_user_agent, OLD.supplier_signed_document_sha256,
      OLD.supplier_signed_files, OLD.supplier_signature_sha256, OLD.supplier_signature_otp_id) THEN
    RAISE EXCEPTION 'A assinatura do fornecedor não pode ser alterada' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF OLD.company_signed_at IS NOT NULL AND
     (NEW.company_signed_at, NEW.company_signed_by_id, NEW.company_signed_by_name, NEW.company_signature_mode,
      NEW.company_signature_otp_id, NEW.company_signed_ip, NEW.company_signed_user_agent)
     IS DISTINCT FROM
     (OLD.company_signed_at, OLD.company_signed_by_id, OLD.company_signed_by_name, OLD.company_signature_mode,
      OLD.company_signature_otp_id, OLD.company_signed_ip, OLD.company_signed_user_agent) THEN
    RAISE EXCEPTION 'A contra-assinatura da empresa não pode ser alterada' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF (OLD.refused_at IS NOT NULL AND (NEW.refused_at, NEW.refused_by_portal_user_id, NEW.refusal_reason)
        IS DISTINCT FROM (OLD.refused_at, OLD.refused_by_portal_user_id, OLD.refusal_reason))
     OR (OLD.cancelled_at IS NOT NULL AND (NEW.cancelled_at, NEW.cancelled_by, NEW.cancel_reason)
        IS DISTINCT FROM (OLD.cancelled_at, OLD.cancelled_by, OLD.cancel_reason))
     OR (OLD.superseded_at IS NOT NULL AND (NEW.superseded_at, NEW.superseded_by_id)
        IS DISTINCT FROM (OLD.superseded_at, OLD.superseded_by_id))
     OR (OLD.expired_at IS NOT NULL AND NEW.expired_at IS DISTINCT FROM OLD.expired_at) THEN
    RAISE EXCEPTION 'O registo de recusa, cancelamento, substituição ou expiração não pode ser alterado'
      USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status, NEW.status) NOT IN (
       ('draft', 'sent'), ('draft', 'cancelled'),
       ('sent', 'signed_supplier'), ('sent', 'refused'), ('sent', 'cancelled'),
       ('signed_supplier', 'signed'), ('signed_supplier', 'cancelled'),
       ('signed', 'superseded'), ('signed', 'expired'), ('expired', 'superseded')) THEN
    RAISE EXCEPTION 'Mudança de estado inválida no contrato de fornecedor (% → %)', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_contracts_00_guarda
  BEFORE UPDATE OR DELETE ON public.supplier_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_sc_contrato_guarda();

-- 5.4 Ficheiros: imutáveis; CRM só em rascunho, portal só enquanto enviado; apagar só em rascunho.
CREATE FUNCTION public.fn_sc_ficheiro_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_org    uuid;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Os ficheiros dos contratos de fornecedor só se registam pelas funções do sistema'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Um ficheiro de contrato de fornecedor não pode ser alterado' USING ERRCODE = 'check_violation', HINT = 'immutable';
  END IF;
  SELECT c.status, c.organization_id INTO v_status, v_org
  FROM public.supplier_contracts c WHERE c.id = COALESCE(NEW.contract_id, OLD.contract_id);
  IF TG_OP = 'DELETE' THEN
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Um ficheiro de um contrato enviado não pode ser apagado' USING ERRCODE = 'check_violation', HINT = 'immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org
     OR (NEW.uploaded_via = 'crm' AND v_status IS DISTINCT FROM 'draft')
     OR (NEW.uploaded_via = 'portal' AND v_status IS DISTINCT FROM 'sent') THEN
    RAISE EXCEPTION 'Não é possível anexar ficheiros a este contrato no estado atual' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_contract_files_00_guarda
  BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_contract_files
  FOR EACH ROW EXECUTE FUNCTION public.fn_sc_ficheiro_guarda();

-- 5.5 Histórico: só acrescenta.
CREATE FUNCTION public.fn_sc_evento_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'O histórico do contrato de fornecedor não pode ser alterado' USING ERRCODE = 'check_violation', HINT = 'immutable';
END;
$$;

CREATE TRIGGER trg_supplier_contract_events_00_guarda
  BEFORE UPDATE OR DELETE ON public.supplier_contract_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_sc_evento_guarda();

-- 6. RLS (só leitura no CRM; o portal lê pelas RPCs sp_*) --------------------------------------------------------
ALTER TABLE public.supplier_contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contract_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contract_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_contract_templates, public.supplier_contracts, public.supplier_contract_files,
              public.supplier_contract_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_contract_templates, public.supplier_contracts, public.supplier_contract_files,
                public.supplier_contract_events TO authenticated;
GRANT ALL ON public.supplier_contract_templates, public.supplier_contracts, public.supplier_contract_files,
             public.supplier_contract_events TO service_role;

CREATE POLICY supplier_contract_templates_select_crm ON public.supplier_contract_templates
  FOR SELECT TO authenticated USING (public.fn_sc_rls_ver(organization_id));
CREATE POLICY supplier_contracts_select_crm ON public.supplier_contracts
  FOR SELECT TO authenticated USING (public.fn_sc_rls_ver(organization_id));
CREATE POLICY supplier_contract_files_select_crm ON public.supplier_contract_files
  FOR SELECT TO authenticated USING (public.fn_sc_rls_ver(organization_id));
CREATE POLICY supplier_contract_events_select_crm ON public.supplier_contract_events
  FOR SELECT TO authenticated USING (public.fn_sc_rls_ver(organization_id));

-- 7. Storage --------------------------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-contracts', 'supplier-contracts', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- Escrita: só a service_role (a Edge calcula o SHA-256 dos bytes antes de registar).
CREATE POLICY supplier_contracts_block_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id <> 'supplier-contracts');
CREATE POLICY supplier_contracts_block_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING (bucket_id <> 'supplier-contracts') WITH CHECK (bucket_id <> 'supplier-contracts');
CREATE POLICY supplier_contracts_block_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (bucket_id <> 'supplier-contracts');
-- Leitura: só ficheiros registados e visíveis a quem pede (CRM pela permissão; portal só do próprio fornecedor).
CREATE POLICY supplier_contracts_guard_select ON storage.objects AS RESTRICTIVE
  FOR SELECT TO anon, authenticated USING (bucket_id <> 'supplier-contracts' OR public.fn_sc_ficheiro_legivel(name));
CREATE POLICY supplier_contracts_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'supplier-contracts' AND public.fn_sc_ficheiro_legivel(name));

-- 8. RPCs -----------------------------------------------------------------------------------------------------------

-- 8.1 Modelos ------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.rpc_supplier_contract_template_variables()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.fn_sc_variaveis()
$$;

CREATE FUNCTION public.rpc_supplier_contract_templates_list(p_organization_id uuid, p_kind text DEFAULT NULL,
                                                            p_include_inactive boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.fn_sc_pode_ver(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para ver os modelos de contrato de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id, 'organization_id', t.organization_id, 'name', t.name, 'kind', t.kind,
             'description', t.description, 'body_html', t.body_html, 'is_active', t.is_active,
             'created_at', t.created_at, 'updated_at', t.updated_at) ORDER BY t.is_active DESC, t.name)
    FROM public.supplier_contract_templates t
    WHERE t.organization_id = p_organization_id
      AND (p_kind IS NULL OR t.kind = p_kind)
      AND (p_include_inactive OR t.is_active)), '[]'::jsonb);
END;
$$;

-- p_template_id NULL cria. p_data: name, kind, description, body_html, is_active.
CREATE FUNCTION public.rpc_supplier_contract_template_save(p_template_id uuid, p_organization_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  t       public.supplier_contract_templates;
  v_kind  text;
BEGIN
  PERFORM public.fn_sc_so_chaves(p_data, ARRAY['name', 'kind', 'description', 'body_html', 'is_active']);
  p_data := COALESCE(p_data, '{}'::jsonb);

  IF p_template_id IS NULL THEN
    IF NOT public.fn_sc_pode(v_uid, 'suppliers.contract_manage', p_organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
    t.id := gen_random_uuid();
    t.organization_id := p_organization_id;
    t.kind := 'material';
    t.is_active := true;
    t.created_by := v_actor.id;
    t.created_at := now();
  ELSE
    SELECT * INTO t FROM public.supplier_contract_templates WHERE id = p_template_id FOR UPDATE;
    IF t.id IS NULL OR NOT public.fn_sc_pode_ver(v_uid, t.organization_id) THEN
      RAISE EXCEPTION 'Modelo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF p_organization_id IS NOT NULL AND p_organization_id IS DISTINCT FROM t.organization_id THEN
      RAISE EXCEPTION 'O modelo é de outra organização' USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    IF NOT public.fn_sc_pode(v_uid, 'suppliers.contract_manage', t.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
  END IF;

  IF p_data ? 'name' THEN
    t.name := public.fn_sc_j_text(p_data, 'name', 'Nome', 200);
  END IF;
  IF p_data ? 'kind' THEN
    v_kind := public.fn_sc_j_text(p_data, 'kind', 'Tipo', 20);
    IF v_kind IS NULL OR v_kind NOT IN ('material', 'servico') THEN
      RAISE EXCEPTION 'O tipo do modelo tem de ser material ou serviço' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    t.kind := v_kind;
  END IF;
  IF p_data ? 'description' THEN
    t.description := public.fn_sc_j_text(p_data, 'description', 'Descrição', 2000);
  END IF;
  IF p_data ? 'body_html' THEN
    IF jsonb_typeof(p_data -> 'body_html') <> 'string' THEN
      RAISE EXCEPTION 'O texto do modelo é inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    t.body_html := p_data ->> 'body_html';
  END IF;
  IF p_data ? 'is_active' THEN
    t.is_active := COALESCE(public.fn_sc_j_bool(p_data, 'is_active', 'Ativo'), true);
  END IF;

  IF t.name IS NULL THEN
    RAISE EXCEPTION 'O campo «Nome» é obrigatório.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF t.body_html IS NULL OR char_length(t.body_html) > 500000 THEN
    RAISE EXCEPTION 'O texto do modelo é obrigatório (até 500 000 caracteres).' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  PERFORM public.fn_sc_validar_corpo(t.body_html);

  t.updated_by := v_actor.id;
  t.updated_at := now();

  INSERT INTO public.supplier_contract_templates AS x
    (id, organization_id, name, kind, description, body_html, is_active, created_by, updated_by, created_at, updated_at)
  VALUES (t.id, t.organization_id, t.name, t.kind, t.description, t.body_html, t.is_active, t.created_by, t.updated_by,
          t.created_at, t.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, kind = EXCLUDED.kind, description = EXCLUDED.description, body_html = EXCLUDED.body_html,
    is_active = EXCLUDED.is_active, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('id', t.id, 'organization_id', t.organization_id, 'name', t.name, 'kind', t.kind,
                            'is_active', t.is_active, 'updated_at', t.updated_at);
END;
$$;

-- 8.2 Contratos no CRM ---------------------------------------------------------------------------------------------

-- Condições a partir de jsonb (só as chaves enviadas; null limpa). Interna.
CREATE FUNCTION public.fn_sc_aplicar_condicoes(c public.supplier_contracts, p jsonb)
RETURNS public.supplier_contracts
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  PERFORM public.fn_sc_so_chaves(p, ARRAY['payment_terms_days', 'payment_method', 'delivery_sla_days', 'shipping_terms',
    'shipping_free_from', 'discount_percent', 'min_order_value', 'returns_accepted', 'returns_days', 'returns_notes',
    'conditions_notes']);
  IF p IS NULL THEN
    RETURN c;
  END IF;
  IF p ? 'payment_terms_days' THEN c.payment_terms_days := public.fn_sc_j_int(p, 'payment_terms_days', 'Prazo de pagamento (dias)', 0, 365); END IF;
  IF p ? 'payment_method' THEN
    v := public.fn_sc_j_text(p, 'payment_method', 'Forma de pagamento', 30);
    IF v IS NOT NULL AND v NOT IN ('transferencia', 'multibanco', 'debito_direto', 'cheque', 'numerario', 'cartao', 'outro') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.payment_method := v;
  END IF;
  IF p ? 'delivery_sla_days' THEN c.delivery_sla_days := public.fn_sc_j_int(p, 'delivery_sla_days', 'Prazo de entrega (dias)', 0, 365); END IF;
  IF p ? 'shipping_terms' THEN
    v := public.fn_sc_j_text(p, 'shipping_terms', 'Portes', 30);
    IF v IS NOT NULL AND v NOT IN ('incluidos', 'a_cargo_comprador', 'gratis_acima_minimo', 'a_combinar') THEN
      RAISE EXCEPTION 'Condição de portes inválida' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.shipping_terms := v;
  END IF;
  IF p ? 'shipping_free_from' THEN c.shipping_free_from := public.fn_sc_j_num(p, 'shipping_free_from', 'Portes grátis a partir de', 0, 9999999999.99); END IF;
  IF p ? 'discount_percent' THEN c.discount_percent := public.fn_sc_j_num(p, 'discount_percent', 'Desconto (%)', 0, 100); END IF;
  IF p ? 'min_order_value' THEN c.min_order_value := public.fn_sc_j_num(p, 'min_order_value', 'Encomenda mínima', 0, 9999999999.99); END IF;
  IF p ? 'returns_accepted' THEN c.returns_accepted := public.fn_sc_j_bool(p, 'returns_accepted', 'Devoluções aceites'); END IF;
  IF p ? 'returns_days' THEN c.returns_days := public.fn_sc_j_int(p, 'returns_days', 'Prazo de devolução (dias)', 0, 365); END IF;
  IF p ? 'returns_notes' THEN c.returns_notes := public.fn_sc_j_text(p, 'returns_notes', 'Condições de devolução', 2000); END IF;
  IF p ? 'conditions_notes' THEN c.conditions_notes := public.fn_sc_j_text(p, 'conditions_notes', 'Observações', 4000); END IF;
  RETURN c;
END;
$$;

-- Grava o row de rascunho (todas as colunas editáveis). Interna.
CREATE FUNCTION public.fn_sc_gravar_rascunho(c public.supplier_contracts)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.supplier_contracts SET
    kind = c.kind, origin = c.origin, template_id = c.template_id, title = c.title, body_html = c.body_html,
    payment_terms_days = c.payment_terms_days, payment_method = c.payment_method, delivery_sla_days = c.delivery_sla_days,
    shipping_terms = c.shipping_terms, shipping_free_from = c.shipping_free_from, discount_percent = c.discount_percent,
    min_order_value = c.min_order_value, returns_accepted = c.returns_accepted, returns_days = c.returns_days,
    returns_notes = c.returns_notes, conditions_notes = c.conditions_notes, valid_from = c.valid_from,
    valid_until = c.valid_until, main_file_id = c.main_file_id, updated_by = c.updated_by, updated_at = now()
  WHERE id = c.id AND status = 'draft';
$$;

-- Contrato para escrita no CRM (lock + permissão). Interna.
CREATE FUNCTION public.fn_sc_crm_contrato_para_escrita(p_contract_id uuid, p_uid uuid)
RETURNS public.supplier_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.supplier_contracts;
BEGIN
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id FOR UPDATE;
  IF c.id IS NULL OR NOT public.fn_sc_pode_ver(p_uid, c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.fn_sc_pode(p_uid, 'suppliers.contract_manage', c.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN c;
END;
$$;

-- Cria (p_contract_id NULL, com p_supplier_id) ou edita um rascunho.
-- p_data: title, kind, origin ('modelo'|'pdf_fornecedor'), template_id, body_html, valid_from, valid_until,
--         conditions (objeto, como em rpc_supplier_contract_set_conditions).
CREATE FUNCTION public.rpc_supplier_contract_save_draft(p_contract_id uuid, p_supplier_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_actor  public.anew_users := public.fn_sc_crm_actor(auth.uid());
  s        public.suppliers;
  c        public.supplier_contracts;
  v_prev   public.supplier_contracts;
  t        public.supplier_contract_templates;
  v_novo   boolean := p_contract_id IS NULL;
  v_txt    text;
  v_tpl    uuid;
BEGIN
  PERFORM public.fn_sc_so_chaves(p_data, ARRAY['title', 'kind', 'origin', 'template_id', 'body_html', 'valid_from',
                                               'valid_until', 'conditions']);
  p_data := COALESCE(p_data, '{}'::jsonb);

  IF v_novo THEN
    SELECT * INTO s FROM public.suppliers WHERE id = p_supplier_id AND deleted_at IS NULL;
    IF s.id IS NULL OR NOT public.fn_sc_pode_ver(v_uid, s.organization_id) THEN
      RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF NOT public.fn_sc_pode(v_uid, 'suppliers.contract_manage', s.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('sc_supplier:' || s.id::text, 0));
    IF EXISTS (SELECT 1 FROM public.supplier_contracts x WHERE x.supplier_id = s.id AND x.status IN ('draft', 'sent', 'signed_supplier')) THEN
      RAISE EXCEPTION 'Já existe um contrato em curso para este fornecedor' USING ERRCODE = 'check_violation', HINT = 'open_contract_exists';
    END IF;
    SELECT * INTO v_prev FROM public.supplier_contracts x WHERE x.supplier_id = s.id ORDER BY x.version DESC LIMIT 1;

    c.id := gen_random_uuid();
    c.organization_id := s.organization_id;
    c.supplier_id := s.id;
    c.contract_number := COALESCE(v_prev.contract_number, public.fn_sc_novo_numero(s.organization_id));
    c.version := COALESCE(v_prev.version, 0) + 1;
    c.previous_contract_id := v_prev.id;
    c.kind := 'material';
    c.origin := 'modelo';
    c.title := left('Condições comerciais — ' || s.name, 200);
    c.status := 'draft';
    c.created_by := v_actor.id;

    INSERT INTO public.supplier_contracts
      (id, organization_id, supplier_id, contract_number, version, previous_contract_id, kind, origin, title, status,
       created_by, updated_by)
    VALUES (c.id, c.organization_id, c.supplier_id, c.contract_number, c.version, c.previous_contract_id, c.kind,
            c.origin, c.title, c.status, c.created_by, v_actor.id);
    SELECT * INTO c FROM public.supplier_contracts WHERE id = c.id;
  ELSE
    c := public.fn_sc_crm_contrato_para_escrita(p_contract_id, v_uid);
    IF p_supplier_id IS NOT NULL AND p_supplier_id IS DISTINCT FROM c.supplier_id THEN
      RAISE EXCEPTION 'O contrato é de outro fornecedor' USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    IF c.status <> 'draft' THEN
      RAISE EXCEPTION 'Só um rascunho pode ser alterado: faça uma nova versão' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
  END IF;

  IF p_data ? 'title' THEN
    v_txt := public.fn_sc_j_text(p_data, 'title', 'Título', 200);
    IF v_txt IS NULL THEN
      RAISE EXCEPTION 'O campo «Título» é obrigatório.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.title := v_txt;
  END IF;
  IF p_data ? 'origin' THEN
    v_txt := public.fn_sc_j_text(p_data, 'origin', 'Origem', 20);
    IF v_txt IS NULL OR v_txt NOT IN ('modelo', 'pdf_fornecedor') THEN
      RAISE EXCEPTION 'A origem tem de ser modelo ou pdf_fornecedor' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.origin := v_txt;
  END IF;
  IF p_data ? 'kind' THEN
    v_txt := public.fn_sc_j_text(p_data, 'kind', 'Tipo', 20);
    IF v_txt IS NULL OR v_txt NOT IN ('material', 'servico') THEN
      RAISE EXCEPTION 'O tipo tem de ser material ou serviço' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.kind := v_txt;
  END IF;
  IF p_data ? 'template_id' THEN
    v_tpl := public.fn_sc_j_uuid(p_data, 'template_id', 'Modelo');
    IF v_tpl IS NULL THEN
      c.template_id := NULL;
    ELSE
      SELECT * INTO t FROM public.supplier_contract_templates WHERE id = v_tpl;
      IF t.id IS NULL OR t.organization_id IS DISTINCT FROM c.organization_id OR NOT t.is_active THEN
        RAISE EXCEPTION 'Modelo não encontrado ou inativo' USING ERRCODE = 'no_data_found', HINT = 'not_found';
      END IF;
      IF p_data ? 'kind' AND c.kind IS DISTINCT FROM t.kind THEN
        RAISE EXCEPTION 'O tipo do contrato não coincide com o do modelo' USING ERRCODE = 'check_violation', HINT = 'validation';
      END IF;
      c.template_id := t.id;
      c.kind := t.kind;
      IF NOT (p_data ? 'body_html') THEN
        c.body_html := t.body_html;
      END IF;
    END IF;
  END IF;
  IF p_data ? 'body_html' THEN
    IF jsonb_typeof(p_data -> 'body_html') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'O texto do contrato é inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
    END IF;
    c.body_html := NULLIF(p_data ->> 'body_html', '');
    IF c.body_html IS NOT NULL THEN
      IF char_length(c.body_html) > 500000 THEN
        RAISE EXCEPTION 'O texto do contrato é demasiado longo.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
      END IF;
      PERFORM public.fn_sc_validar_corpo(c.body_html);
    END IF;
  END IF;
  IF p_data ? 'valid_from' THEN c.valid_from := public.fn_sc_j_date(p_data, 'valid_from', 'Início da validade'); END IF;
  IF p_data ? 'valid_until' THEN c.valid_until := public.fn_sc_j_date(p_data, 'valid_until', 'Fim da validade'); END IF;
  IF c.valid_from IS NOT NULL AND c.valid_until IS NOT NULL AND c.valid_until < c.valid_from THEN
    RAISE EXCEPTION 'O fim da validade não pode ser antes do início.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF p_data ? 'conditions' THEN
    c := public.fn_sc_aplicar_condicoes(c, p_data -> 'conditions');
  END IF;
  -- Ao passar a modelo, o PDF principal deixa de contar como o documento.
  IF c.origin = 'modelo' THEN
    c.main_file_id := NULL;
  END IF;

  c.updated_by := v_actor.id;
  PERFORM public.fn_sc_gravar_rascunho(c);
  SELECT * INTO c FROM public.supplier_contracts WHERE id = c.id;

  PERFORM public.fn_sc_evento(c, CASE WHEN v_novo THEN 'created' ELSE 'updated' END,
    CASE WHEN v_novo THEN 'Rascunho criado (versão ' || c.version || ')' ELSE 'Rascunho alterado' END,
    jsonb_build_object('fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(p_data) k)),
    v_actor.id, NULL);

  RETURN public.fn_sc_contrato_json(c, 'crm', true);
END;
$$;

CREATE FUNCTION public.rpc_supplier_contract_set_conditions(p_contract_id uuid, p_conditions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  c       public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
BEGIN
  IF c.status <> 'draft' THEN
    RAISE EXCEPTION 'Só um rascunho pode ser alterado: faça uma nova versão' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) <> 'object' THEN
    RAISE EXCEPTION 'Dados inválidos' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  c := public.fn_sc_aplicar_condicoes(c, p_conditions);
  c.updated_by := v_actor.id;
  PERFORM public.fn_sc_gravar_rascunho(c);
  SELECT * INTO c FROM public.supplier_contracts WHERE id = c.id;
  PERFORM public.fn_sc_evento(c, 'conditions_updated', 'Condições comerciais alteradas',
    jsonb_build_object('conditions', p_conditions), v_actor.id, NULL);
  RETURN public.fn_sc_contrato_json(c, 'crm', true);
END;
$$;

-- Nova versão (rascunho) a partir de um contrato existente que já não está em curso.
CREATE FUNCTION public.rpc_supplier_contract_new_version(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  o       public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  v_ult   public.supplier_contracts;
  n       public.supplier_contracts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sc_supplier:' || o.supplier_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.supplier_contracts x WHERE x.supplier_id = o.supplier_id AND x.status IN ('draft', 'sent', 'signed_supplier')) THEN
    RAISE EXCEPTION 'Já existe um contrato em curso para este fornecedor' USING ERRCODE = 'check_violation', HINT = 'open_contract_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = o.supplier_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_ult FROM public.supplier_contracts x WHERE x.supplier_id = o.supplier_id ORDER BY x.version DESC LIMIT 1;

  INSERT INTO public.supplier_contracts
    (organization_id, supplier_id, contract_number, version, previous_contract_id, kind, origin, template_id, title,
     body_html, payment_terms_days, payment_method, delivery_sla_days, shipping_terms, shipping_free_from,
     discount_percent, min_order_value, returns_accepted, returns_days, returns_notes, conditions_notes, valid_from,
     valid_until, status, created_by, updated_by)
  VALUES
    (o.organization_id, o.supplier_id, o.contract_number, v_ult.version + 1, v_ult.id, o.kind, o.origin, o.template_id,
     o.title, o.body_html, o.payment_terms_days, o.payment_method, o.delivery_sla_days, o.shipping_terms,
     o.shipping_free_from, o.discount_percent, o.min_order_value, o.returns_accepted, o.returns_days, o.returns_notes,
     o.conditions_notes, NULL, NULL, 'draft', v_actor.id, v_actor.id)
  RETURNING * INTO n;

  PERFORM public.fn_sc_evento(n, 'new_version', 'Nova versão ' || n.version || ' a partir da versão ' || o.version,
    jsonb_build_object('from_contract_id', o.id, 'from_version', o.version), v_actor.id, NULL);
  RETURN public.fn_sc_contrato_json(n, 'crm', true);
END;
$$;

-- Pré-visualização do documento (rascunho: renderizado agora; enviado: o congelado).
CREATE FUNCTION public.rpc_supplier_contract_preview(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.supplier_contracts;
BEGIN
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  IF c.id IS NULL OR NOT public.fn_sc_pode_ver(auth.uid(), c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF c.status <> 'draft' THEN
    RETURN jsonb_build_object('html', c.document_html, 'sha256', c.document_sha256, 'frozen', true);
  END IF;
  IF c.origin = 'modelo' AND c.body_html IS NULL THEN
    RETURN jsonb_build_object('html', NULL, 'sha256', NULL, 'frozen', false);
  END IF;
  RETURN jsonb_build_object('html', public.fn_sc_render(c, now()), 'sha256', NULL, 'frozen', false);
END;
$$;

-- Enviar: congela o documento (HTML + SHA-256) e fixa a conta/ligação do portal.
CREATE FUNCTION public.rpc_supplier_contract_send(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  c       public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  l       public.supplier_account_links;
  v_now   timestamptz := now();
  v_html  text;
  v_hash  text;
BEGIN
  IF c.status <> 'draft' THEN
    RAISE EXCEPTION 'Este contrato já foi enviado' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = c.supplier_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links x
  WHERE x.supplier_id = c.supplier_id AND x.organization_id = c.organization_id AND x.status = 'active'
  ORDER BY x.created_at DESC LIMIT 1;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'O fornecedor ainda não tem acesso ao portal: envie primeiro as credenciais' USING ERRCODE = 'check_violation', HINT = 'no_portal';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_portal_users u
    JOIN public.supplier_accounts a ON a.id = u.supplier_account_id AND a.status = 'active'
    JOIN public.supplier_portal_user_access x ON x.portal_user_id = u.id AND x.link_id = l.id AND x.revoked_at IS NULL
    WHERE u.supplier_account_id = l.supplier_account_id AND u.role = 'owner' AND u.status = 'active') THEN
    RAISE EXCEPTION 'A conta do fornecedor no portal não tem um titular ativo para assinar' USING ERRCODE = 'check_violation', HINT = 'no_portal_owner';
  END IF;

  IF c.payment_terms_days IS NULL OR c.payment_method IS NULL THEN
    RAISE EXCEPTION 'Preencha pelo menos o prazo e a forma de pagamento antes de enviar' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF c.shipping_terms = 'gratis_acima_minimo' AND c.shipping_free_from IS NULL THEN
    RAISE EXCEPTION 'Indique a partir de que valor os portes são grátis' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < (v_now AT TIME ZONE 'Europe/Lisbon')::date THEN
    RAISE EXCEPTION 'O fim da validade já passou' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF c.origin = 'modelo' AND c.body_html IS NULL THEN
    RAISE EXCEPTION 'Escolha um modelo ou escreva o texto do contrato antes de enviar' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF c.origin = 'pdf_fornecedor' AND c.main_file_id IS NULL THEN
    RAISE EXCEPTION 'Anexe o PDF do contrato do fornecedor antes de enviar' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  v_html := public.fn_sc_render(c, v_now);
  v_hash := encode(extensions.digest(convert_to(v_html, 'UTF8'), 'sha256'), 'hex');

  UPDATE public.supplier_contracts SET
    status = 'sent', sent_at = v_now, sent_by = v_actor.id,
    document_html = v_html, document_sha256 = v_hash, document_frozen_at = v_now,
    supplier_account_id = l.supplier_account_id, supplier_account_link_id = l.id,
    updated_by = v_actor.id, updated_at = v_now
  WHERE id = c.id
  RETURNING * INTO c;

  PERFORM public.fn_sc_evento(c, 'sent', 'Contrato enviado ao fornecedor',
    jsonb_build_object('document_sha256', v_hash, 'supplier_account_id', l.supplier_account_id, 'link_id', l.id,
                       'main_file_id', c.main_file_id), v_actor.id, NULL);

  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'sent_at', c.sent_at,
                            'document_sha256', c.document_sha256, 'supplier_account_id', c.supplier_account_id,
                            'supplier_id', c.supplier_id, 'organization_id', c.organization_id);
END;
$$;

CREATE FUNCTION public.rpc_supplier_contract_cancel(p_contract_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  public.anew_users := public.fn_sc_crm_actor(auth.uid());
  c        public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  v_reason text := NULLIF(regexp_replace(COALESCE(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
BEGIN
  IF c.status NOT IN ('draft', 'sent', 'signed_supplier') THEN
    RAISE EXCEPTION 'Este contrato já não pode ser cancelado (estado %)', c.status USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF c.status <> 'draft' AND (v_reason IS NULL OR char_length(v_reason) < 3) THEN
    RAISE EXCEPTION 'Indique o motivo do cancelamento' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'O motivo deve ter no máximo 2000 caracteres.' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  UPDATE public.supplier_contracts SET
    status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor.id, cancel_reason = v_reason,
    updated_by = v_actor.id, updated_at = now()
  WHERE id = c.id RETURNING * INTO c;
  PERFORM public.fn_sc_evento(c, 'cancelled', 'Contrato cancelado pela empresa', jsonb_build_object('reason', v_reason), v_actor.id, NULL);
  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'cancelled_at', c.cancelled_at);
END;
$$;

-- Contra-assinatura da empresa (OTP SMS do próprio, consumido aqui; como rpc_contra_assinar_contrato 'proprio').
-- OTP: sms_otp_codes reference_type 'supplier_contract_company', reference_id = contrato, purpose 'company_signature',
--      auth_user_id = auth.uid(), verificado há <= 10 min e por consumir.
-- Copia as condições para suppliers e substitui o contrato assinado anterior.
CREATE FUNCTION public.rpc_supplier_contract_countersign(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_actor public.anew_users := public.fn_sc_crm_actor(auth.uid());
  c       public.supplier_contracts := public.fn_sc_crm_contrato_para_escrita(p_contract_id, auth.uid());
  v_otp   uuid;
  v_name  text;
  v_now   timestamptz := now();
  v_ant   public.supplier_contracts;
BEGIN
  IF c.status <> 'signed_supplier' THEN
    RAISE EXCEPTION 'O contrato tem de estar assinado pelo fornecedor (estado %)', c.status USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < (v_now AT TIME ZONE 'Europe/Lisbon')::date THEN
    RAISE EXCEPTION 'O fim da validade do contrato já passou: faça uma nova versão' USING ERRCODE = 'check_violation', HINT = 'expired';
  END IF;
  IF NOT public.fn_pode_assinar_contratos(v_actor.id, c.organization_id) THEN
    RAISE EXCEPTION 'Não tem poderes para assinar contratos nesta organização' USING ERRCODE = 'insufficient_privilege', HINT = 'no_signing_power';
  END IF;

  UPDATE public.sms_otp_codes o
     SET consumed_at = v_now
   WHERE o.id = (
           SELECT s.id FROM public.sms_otp_codes s
           WHERE s.reference_type = 'supplier_contract_company'
             AND s.reference_id   = c.id
             AND s.purpose        = 'company_signature'
             AND s.auth_user_id   = v_uid
             AND s.verified_at IS NOT NULL
             AND s.verified_at >= v_now - interval '10 minutes'
             AND s.consumed_at IS NULL
           ORDER BY s.verified_at DESC
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
     AND o.consumed_at IS NULL
  RETURNING o.id INTO v_otp;
  IF v_otp IS NULL THEN
    RAISE EXCEPTION 'Código SMS não verificado, expirado ou já utilizado. Peça um novo código.' USING ERRCODE = 'insufficient_privilege', HINT = 'otp_required';
  END IF;

  v_name := COALESCE(NULLIF(btrim(v_actor.name), ''), 'Representante');

  -- Substituir o assinado anterior (o índice só deixa um 'signed' por fornecedor).
  FOR v_ant IN SELECT * FROM public.supplier_contracts x
               WHERE x.supplier_id = c.supplier_id AND x.id <> c.id AND x.status IN ('signed', 'expired') FOR UPDATE LOOP
    UPDATE public.supplier_contracts SET status = 'superseded', superseded_at = v_now, superseded_by_id = c.id,
           updated_by = v_actor.id, updated_at = v_now
    WHERE id = v_ant.id RETURNING * INTO v_ant;
    PERFORM public.fn_sc_evento(v_ant, 'superseded', 'Substituído pela versão ' || c.version,
      jsonb_build_object('superseded_by_id', c.id), v_actor.id, NULL);
  END LOOP;

  UPDATE public.supplier_contracts SET
    status = 'signed', company_signed_at = v_now, company_signed_by_id = v_actor.id, company_signed_by_name = v_name,
    company_signature_mode = 'sms_otp', company_signature_otp_id = v_otp,
    company_signed_ip = public.fn_sc_pedido('ip'), company_signed_user_agent = public.fn_sc_pedido('ua'),
    updated_by = v_actor.id, updated_at = v_now
  WHERE id = c.id RETURNING * INTO c;

  -- Condições vigentes no fornecedor (o prazo de entrega só se o contrato o define).
  PERFORM set_config('app.audit_user_id', v_actor.id::text, true);
  PERFORM set_config('app.audit_source', 'supplier_contract', true);
  PERFORM set_config('app.sc_condicoes', 'on', true);
  UPDATE public.suppliers s SET
    payment_terms_days = c.payment_terms_days, payment_method = c.payment_method,
    delivery_sla_days = COALESCE(c.delivery_sla_days, s.delivery_sla_days),
    shipping_terms = c.shipping_terms, shipping_free_from = c.shipping_free_from,
    discount_percent = c.discount_percent, min_order_value = c.min_order_value,
    returns_accepted = c.returns_accepted, returns_days = c.returns_days, returns_notes = c.returns_notes,
    commercial_terms_contract_id = c.id, commercial_terms_valid_until = c.valid_until,
    commercial_terms_updated_at = v_now
  WHERE s.id = c.supplier_id;
  PERFORM set_config('app.sc_condicoes', '', true);

  PERFORM public.fn_sc_evento(c, 'company_signed', 'Contrato contra-assinado pela empresa (SMS) por ' || v_name,
    jsonb_build_object('company_signed_by_id', v_actor.id, 'otp_id', v_otp), v_actor.id, NULL);

  UPDATE public.notifications SET is_resolved = true
  WHERE type = 'supplier_contract_signed' AND entity_id = c.id AND is_resolved = false;

  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'company_signed_at', c.company_signed_at,
                            'company_signed_by_name', c.company_signed_by_name, 'supplier_id', c.supplier_id);
END;
$$;

CREATE FUNCTION public.rpc_supplier_contracts_list(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s     public.suppliers;
  v_act public.anew_users;
BEGIN
  SELECT * INTO s FROM public.suppliers WHERE id = p_supplier_id;
  IF s.id IS NULL OR NOT public.fn_sc_pode_ver(v_uid, s.organization_id) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_act FROM public.anew_users WHERE auth_user_id = v_uid AND deleted_at IS NULL LIMIT 1;
  RETURN jsonb_build_object(
    'supplier_id', s.id,
    'conditions_locked', public.fn_sc_condicoes_bloqueadas(s.id),
    'active_contract_id', s.commercial_terms_contract_id,
    'can_manage', public.fn_sc_pode(v_uid, 'suppliers.contract_manage', s.organization_id),
    'can_countersign', public.fn_sc_pode(v_uid, 'suppliers.contract_manage', s.organization_id)
                       AND public.fn_pode_assinar_contratos(v_act.id, s.organization_id),
    'contracts', COALESCE((SELECT jsonb_agg(public.fn_sc_contrato_json(c, 'crm', false) ORDER BY c.version DESC)
                           FROM public.supplier_contracts c WHERE c.supplier_id = s.id), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.rpc_supplier_contract_get(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c     public.supplier_contracts;
  v_act public.anew_users;
BEGIN
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  IF c.id IS NULL OR NOT public.fn_sc_pode_ver(v_uid, c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_act FROM public.anew_users WHERE auth_user_id = v_uid AND deleted_at IS NULL LIMIT 1;
  RETURN public.fn_sc_contrato_json(c, 'crm', true) || jsonb_build_object(
    'can_manage', public.fn_sc_pode(v_uid, 'suppliers.contract_manage', c.organization_id),
    'can_countersign', c.status = 'signed_supplier'
                       AND public.fn_sc_pode(v_uid, 'suppliers.contract_manage', c.organization_id)
                       AND public.fn_pode_assinar_contratos(v_act.id, c.organization_id));
END;
$$;

-- Contratos assinados a expirar dentro de p_days (e os já fora de prazo ainda marcados 'signed').
CREATE FUNCTION public.rpc_supplier_contracts_expiring(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_days IS NULL OR p_days < 0 OR p_days > 365 THEN
    RAISE EXCEPTION 'Número de dias inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'contract_id', c.id, 'organization_id', c.organization_id, 'supplier_id', c.supplier_id,
             'supplier_name', s.name, 'contract_number', c.contract_number, 'version', c.version,
             'valid_until', c.valid_until, 'days_left', c.valid_until - v_hoje, 'expired', c.valid_until < v_hoje)
           ORDER BY c.valid_until, s.name)
    FROM public.supplier_contracts c
    JOIN public.suppliers s ON s.id = c.supplier_id AND s.deleted_at IS NULL
    WHERE c.status = 'signed' AND c.valid_until IS NOT NULL AND c.valid_until <= v_hoje + p_days
      AND c.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
      AND public.fn_sc_pode_ver(v_uid, c.organization_id)), '[]'::jsonb);
END;
$$;

-- Marca como expirados os assinados fora de prazo (para um agendamento; service_role).
CREATE FUNCTION public.fn_supplier_contracts_mark_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c   public.supplier_contracts;
  v_n integer := 0;
BEGIN
  FOR c IN SELECT * FROM public.supplier_contracts
           WHERE status = 'signed' AND valid_until IS NOT NULL
             AND valid_until < (now() AT TIME ZONE 'Europe/Lisbon')::date
           FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.supplier_contracts SET status = 'expired', expired_at = now(), updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
    PERFORM public.fn_sc_evento(c, 'expired', 'Contrato expirado (as condições mantêm-se no fornecedor)', '{}'::jsonb, NULL, NULL);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- 8.3 Ficheiros (service_role: a Edge supplier-contract-action leu os bytes e calculou o SHA-256) ------------------
-- Caminho: {organization_id}/{contract_id}/{folha}; o objeto já tem de estar no bucket supplier-contracts.
-- CRM (suppliers.contract_manage): só em rascunho; 'contrato_fornecedor' passa a ser o PDF principal se a origem for
--   pdf_fornecedor. Portal (titular): só enquanto 'sent'.
CREATE FUNCTION public.rpc_supplier_contract_register_file(p_caller_auth_uid uuid, p_contract_id uuid, p_kind text,
                                                           p_storage_path text, p_file_name text, p_mime text,
                                                           p_sha256 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c       public.supplier_contracts;
  u       public.supplier_portal_users;
  v_act   public.anew_users;
  v_via   text;
  v_pref  text;
  v_leaf  text;
  v_name  text := btrim(COALESCE(p_file_name, ''));
  v_mime  text := lower(btrim(COALESCE(p_mime, '')));
  v_sha   text := lower(btrim(COALESCE(p_sha256, '')));
  v_objsz text;
  v_size  bigint;
  f       public.supplier_contract_files;
BEGIN
  IF p_caller_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  SELECT pu.* INTO u FROM public.supplier_portal_users pu
  JOIN public.supplier_accounts a ON a.id = pu.supplier_account_id AND a.status = 'active'
  WHERE pu.auth_user_id = p_caller_auth_uid AND pu.status = 'active';

  IF u.id IS NOT NULL THEN
    v_via := 'portal';
    IF c.status = 'draft' OR NOT public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id) THEN
      RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF u.role IS DISTINCT FROM 'owner' OR u.supplier_account_id IS DISTINCT FROM c.supplier_account_id THEN
      RAISE EXCEPTION 'Só o responsável da conta pode anexar ficheiros ao contrato' USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
    END IF;
    IF c.status <> 'sent' THEN
      RAISE EXCEPTION 'Já não é possível anexar ficheiros a este contrato' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
  ELSE
    v_via := 'crm';
    SELECT * INTO v_act FROM public.anew_users WHERE auth_user_id = p_caller_auth_uid AND deleted_at IS NULL LIMIT 1;
    IF v_act.id IS NULL OR NOT public.fn_sc_pode_ver(p_caller_auth_uid, c.organization_id) THEN
      RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    IF NOT public.fn_sc_pode(p_caller_auth_uid, 'suppliers.contract_manage', c.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para gerir contratos de fornecedor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
    IF c.status <> 'draft' THEN
      RAISE EXCEPTION 'Só se anexam ficheiros a um rascunho' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
    END IF;
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('contrato_fornecedor', 'anexo') THEN
    RAISE EXCEPTION 'Tipo de ficheiro inválido' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  v_pref := c.organization_id::text || '/' || c.id::text || '/';
  IF p_storage_path IS NULL OR left(p_storage_path, char_length(v_pref)) <> v_pref THEN
    RAISE EXCEPTION 'Caminho do ficheiro inválido para este contrato' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_leaf := substr(p_storage_path, char_length(v_pref) + 1);
  IF v_leaf !~ '^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$' THEN
    RAISE EXCEPTION 'Caminho do ficheiro inválido para este contrato' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_name = '' OR char_length(v_name) > 255 OR v_name ~ '[\x01-\x1F\x7F/\\]' THEN
    RAISE EXCEPTION 'Nome do ficheiro inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     OR (p_kind = 'contrato_fornecedor' AND v_mime <> 'application/pdf') THEN
    RAISE EXCEPTION 'Tipo de ficheiro não permitido (o contrato tem de ser PDF; anexos PDF, JPEG, PNG ou WEBP)'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'SHA-256 inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  -- Repetição do mesmo caminho → devolve o que já está.
  SELECT * INTO f FROM public.supplier_contract_files WHERE storage_path = p_storage_path;
  IF f.id IS NOT NULL THEN
    IF f.contract_id <> c.id OR f.sha256 <> v_sha THEN
      RAISE EXCEPTION 'Caminho do ficheiro já usado' USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
    RETURN jsonb_build_object('file_id', f.id, 'already_registered', true, 'is_main', COALESCE(f.id = c.main_file_id, false));
  END IF;

  IF (SELECT count(*) FROM public.supplier_contract_files WHERE contract_id = c.id) >= 20 THEN
    RAISE EXCEPTION 'Limite de 20 ficheiros por contrato' USING ERRCODE = 'check_violation', HINT = 'limit';
  END IF;

  SELECT o.metadata ->> 'size' INTO v_objsz FROM storage.objects o
  WHERE o.bucket_id = 'supplier-contracts' AND o.name = p_storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficheiro não encontrado: carregue-o de novo' USING ERRCODE = 'no_data_found', HINT = 'validation';
  END IF;
  IF v_objsz ~ '^[0-9]{1,18}$' THEN
    v_size := v_objsz::bigint;
  END IF;
  IF v_size IS NULL OR v_size <= 0 OR v_size > 20971520 THEN
    RAISE EXCEPTION 'O ficheiro tem de ter até 20 MB' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  INSERT INTO public.supplier_contract_files
    (contract_id, organization_id, kind, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_via,
     uploaded_by_user_id, uploaded_by_portal_user_id)
  VALUES (c.id, c.organization_id, p_kind, p_storage_path, v_name, v_mime, v_size, v_sha, v_via,
          CASE WHEN v_via = 'crm' THEN v_act.id END, CASE WHEN v_via = 'portal' THEN u.id END)
  RETURNING * INTO f;

  IF v_via = 'crm' AND p_kind = 'contrato_fornecedor' AND c.origin = 'pdf_fornecedor' THEN
    UPDATE public.supplier_contracts SET main_file_id = f.id, updated_by = v_act.id, updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  END IF;

  PERFORM public.fn_sc_evento(c, 'file_added',
    CASE WHEN v_via = 'portal' THEN 'Ficheiro anexado pelo fornecedor: ' ELSE 'Ficheiro anexado: ' END || v_name,
    jsonb_build_object('file_id', f.id, 'kind', p_kind, 'sha256', v_sha, 'size', v_size, 'via', v_via),
    v_act.id, u.id);

  IF v_via = 'portal' THEN
    PERFORM public.fn_sc_notificar(c, 'supplier_contract_file', 'Fornecedor anexou um ficheiro ao contrato',
      format('O fornecedor anexou «%s» ao contrato %s (versão %s).', v_name, c.contract_number, c.version));
  END IF;

  RETURN jsonb_build_object('file_id', f.id, 'already_registered', false, 'is_main', COALESCE(f.id = c.main_file_id, false),
                            'size_bytes', v_size, 'via', v_via);
END;
$$;

-- 8.4 Portal do fornecedor -----------------------------------------------------------------------------------------

-- Contrato visível ao utilizador do portal (enviado, do próprio fornecedor). Interna.
CREATE FUNCTION public.fn_sc_portal_contrato(p_contract_id uuid, u public.supplier_portal_users, p_lock boolean)
RETURNS public.supplier_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.supplier_contracts;
BEGIN
  IF p_lock THEN
    SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id FOR UPDATE;
  ELSE
    SELECT * INTO c FROM public.supplier_contracts WHERE id = p_contract_id;
  END IF;
  IF c.id IS NULL OR c.status = 'draft' OR NOT public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  RETURN c;
END;
$$;

CREATE FUNCTION public.sp_get_my_phone()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
BEGIN
  RETURN jsonb_build_object('phone', u.phone, 'phone_masked', public.fn_sc_mascarar_telemovel(u.phone),
                            'phone_updated_at', u.phone_updated_at);
END;
$$;

-- Telemóvel do próprio (passo "confirmar dados"; sem validação por SMS, decisão 3).
CREATE FUNCTION public.sp_set_my_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u   public.supplier_portal_users := public.fn_sp_actor();
  v   text := public.fn_sc_normalizar_telemovel(p_phone);
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'Indique um telemóvel válido (ex.: 912 345 678 ou +34 600 000 000)'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  IF v IS DISTINCT FROM u.phone THEN
    UPDATE public.supplier_portal_users SET phone = v, phone_updated_at = now(), updated_at = now() WHERE id = u.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'phone', v, 'phone_masked', public.fn_sc_mascarar_telemovel(v));
END;
$$;

CREATE FUNCTION public.sp_supplier_contracts_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
BEGIN
  RETURN jsonb_build_object(
    'is_owner', u.role = 'owner',
    'phone_set', u.phone IS NOT NULL,
    'phone_masked', public.fn_sc_mascarar_telemovel(u.phone),
    'contracts', COALESCE((
      SELECT jsonb_agg(public.fn_sc_contrato_json(c, 'portal', false)
                       || jsonb_build_object('can_sign', u.role = 'owner' AND c.status = 'sent'
                                                         AND u.supplier_account_id = c.supplier_account_id)
                       ORDER BY c.sent_at DESC NULLS LAST, c.version DESC)
      FROM public.supplier_contracts c
      WHERE c.status <> 'draft'
        AND public.fn_sc_portal_tem_acesso(u.id, c.supplier_id, c.organization_id)), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.sp_supplier_contract_get(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
  c public.supplier_contracts := public.fn_sc_portal_contrato(p_contract_id, u, false);
BEGIN
  RETURN public.fn_sc_contrato_json(c, 'portal', true) || jsonb_build_object(
    'is_owner', u.role = 'owner',
    'can_sign', u.role = 'owner' AND c.status = 'sent' AND u.supplier_account_id = c.supplier_account_id,
    'can_refuse', u.role = 'owner' AND c.status = 'sent' AND u.supplier_account_id = c.supplier_account_id,
    'can_attach', u.role = 'owner' AND c.status = 'sent' AND u.supplier_account_id = c.supplier_account_id,
    'phone_set', u.phone IS NOT NULL,
    'phone_masked', public.fn_sc_mascarar_telemovel(u.phone));
END;
$$;

CREATE FUNCTION public.sp_supplier_contract_refuse(p_contract_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  c        public.supplier_contracts := public.fn_sc_portal_contrato(p_contract_id, u, true);
  v_reason text := NULLIF(regexp_replace(COALESCE(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
BEGIN
  IF u.role IS DISTINCT FROM 'owner' OR u.supplier_account_id IS DISTINCT FROM c.supplier_account_id THEN
    RAISE EXCEPTION 'Só o responsável da conta pode recusar o contrato' USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF c.status <> 'sent' THEN
    RAISE EXCEPTION 'Este contrato já não pode ser recusado' USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 OR char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'Indique o motivo da recusa (3 a 2000 caracteres)' USING ERRCODE = 'invalid_parameter_value', HINT = 'validation';
  END IF;
  UPDATE public.supplier_contracts SET
    status = 'refused', refused_at = now(), refused_by_portal_user_id = u.id, refusal_reason = v_reason, updated_at = now()
  WHERE id = c.id RETURNING * INTO c;
  PERFORM public.fn_sc_evento(c, 'refused', 'Contrato recusado pelo fornecedor', jsonb_build_object('reason', v_reason), NULL, u.id);
  PERFORM public.fn_sc_notificar(c, 'supplier_contract_refused', 'Contrato de fornecedor recusado',
    format('O fornecedor recusou o contrato %s (versão %s): %s', c.contract_number, c.version, left(v_reason, 200)));
  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'refused_at', c.refused_at);
END;
$$;

-- Assinatura do fornecedor: titular da conta, OTP SMS verificado (Edge sms-otp) e consumido aqui.
-- OTP: sms_otp_codes reference_type 'supplier_contract', reference_id = contrato, purpose 'supplier_signature',
--      auth_user_id = auth.uid(), verificado há <= 10 min, por consumir, e phone_number = telemóvel atual do titular.
-- p_document_sha256: o SHA-256 do documento que o fornecedor viu (tem de ser o congelado).
CREATE FUNCTION public.sp_supplier_contract_sign(p_contract_id uuid, p_document_sha256 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  u       public.supplier_portal_users := public.fn_sp_actor();
  c       public.supplier_contracts := public.fn_sc_portal_contrato(p_contract_id, u, true);
  v_now   timestamptz := now();
  v_otp   public.sms_otp_codes;
  v_files jsonb;
  v_sig   text;
BEGIN
  IF u.role IS DISTINCT FROM 'owner' OR u.supplier_account_id IS DISTINCT FROM c.supplier_account_id THEN
    RAISE EXCEPTION 'Só o responsável da conta pode assinar o contrato' USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF c.status <> 'sent' THEN
    RAISE EXCEPTION 'Este contrato já não pode ser assinado (estado %)', c.status USING ERRCODE = 'check_violation', HINT = 'invalid_state';
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < (v_now AT TIME ZONE 'Europe/Lisbon')::date THEN
    RAISE EXCEPTION 'O prazo de validade deste contrato já passou' USING ERRCODE = 'check_violation', HINT = 'expired';
  END IF;
  IF lower(btrim(COALESCE(p_document_sha256, ''))) IS DISTINCT FROM c.document_sha256 THEN
    RAISE EXCEPTION 'O documento mudou desde que o abriu: recarregue a página' USING ERRCODE = 'check_violation', HINT = 'document_changed';
  END IF;
  IF u.phone IS NULL THEN
    RAISE EXCEPTION 'Indique primeiro o seu telemóvel nos dados da conta' USING ERRCODE = 'check_violation', HINT = 'no_phone';
  END IF;

  UPDATE public.sms_otp_codes o
     SET consumed_at = v_now
   WHERE o.id = (
           SELECT s.id FROM public.sms_otp_codes s
           WHERE s.reference_type = 'supplier_contract'
             AND s.reference_id   = c.id
             AND s.purpose        = 'supplier_signature'
             AND s.auth_user_id   = v_uid
             AND s.verified_at IS NOT NULL
             AND s.verified_at >= v_now - interval '10 minutes'
             AND s.consumed_at IS NULL
             AND public.fn_sc_normalizar_telemovel(s.phone_number) = u.phone
           ORDER BY s.verified_at DESC
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
     AND o.consumed_at IS NULL
  RETURNING o.* INTO v_otp;
  IF v_otp.id IS NULL THEN
    RAISE EXCEPTION 'Código SMS não verificado, expirado ou já utilizado. Peça um novo código.' USING ERRCODE = 'insufficient_privilege', HINT = 'otp_required';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'file_name', f.file_name, 'sha256', f.sha256)
                            ORDER BY f.created_at, f.id), '[]'::jsonb)
  INTO v_files FROM public.supplier_contract_files f WHERE f.contract_id = c.id;

  -- Selo da assinatura: documento + ficheiros (pela ordem) + quem + quando.
  v_sig := encode(extensions.digest(convert_to(
             c.document_sha256 || '|' ||
             COALESCE((SELECT string_agg(e ->> 'sha256', ',' ORDER BY ord) FROM jsonb_array_elements(v_files) WITH ORDINALITY x(e, ord)), '') || '|' ||
             u.id::text || '|' || u.phone || '|' || to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
             'UTF8'), 'sha256'), 'hex');

  UPDATE public.supplier_contracts SET
    status = 'signed_supplier', supplier_signed_at = v_now, supplier_signed_by_portal_user_id = u.id,
    supplier_signed_by_name = COALESCE(NULLIF(btrim(u.name), ''), u.email), supplier_signed_by_email = u.email,
    supplier_signed_phone = u.phone,
    supplier_signed_ip = COALESCE(public.fn_sc_pedido('ip'), NULLIF(v_otp.ip_address, 'unknown')),
    supplier_signed_user_agent = COALESCE(public.fn_sc_pedido('ua'), NULLIF(v_otp.user_agent, 'unknown')),
    supplier_signed_document_sha256 = c.document_sha256, supplier_signed_files = v_files,
    supplier_signature_sha256 = v_sig, supplier_signature_otp_id = v_otp.id, updated_at = v_now
  WHERE id = c.id RETURNING * INTO c;

  PERFORM public.fn_sc_evento(c, 'supplier_signed', 'Contrato assinado pelo fornecedor (SMS) por ' || c.supplier_signed_by_name,
    jsonb_build_object('portal_user_id', u.id, 'otp_id', v_otp.id, 'signature_sha256', v_sig,
                       'phone_masked', public.fn_sc_mascarar_telemovel(u.phone)), NULL, u.id);
  PERFORM public.fn_sc_notificar(c, 'supplier_contract_signed', 'Contrato de fornecedor por contra-assinar',
    format('O fornecedor assinou o contrato %s (versão %s): falta a contra-assinatura da empresa.', c.contract_number, c.version));

  RETURN jsonb_build_object('contract_id', c.id, 'status', c.status, 'supplier_signed_at', c.supplier_signed_at,
                            'signature_sha256', v_sig);
END;
$$;

-- 9. Privilégios das funções ----------------------------------------------------------------------------------------
-- O default ACL do schema dá EXECUTE a anon/authenticated: tirar a tudo o que é novo e dar só o necessário.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND (p.proname LIKE 'fn\_sc\_%' OR p.proname LIKE 'rpc\_supplier\_contract%'
                  OR p.proname LIKE 'sp\_supplier\_contract%' OR p.proname IN ('sp_set_my_phone', 'sp_get_my_phone',
                  'fn_supplier_contracts_mark_expired')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f);
  END LOOP;
END $$;

-- CRM
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_template_variables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_templates_list(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_template_save(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_save_draft(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_set_conditions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_new_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_send(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_countersign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contracts_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contract_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_contracts_expiring(integer) TO authenticated;
-- Portal
GRANT EXECUTE ON FUNCTION public.sp_get_my_phone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_set_my_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_supplier_contracts_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_supplier_contract_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_supplier_contract_refuse(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_supplier_contract_sign(uuid, text) TO authenticated;
-- Storage (policies avaliadas como quem pede)
GRANT EXECUTE ON FUNCTION public.fn_sc_ficheiro_legivel(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sc_rls_ver(uuid) TO authenticated;
-- service_role-only: rpc_supplier_contract_register_file, fn_supplier_contracts_mark_expired (e as internas).

COMMIT;

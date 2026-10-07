-- ============================================================
-- 20261211110000_portal_fornecedor_f31_contas_catalogo
-- ============================================================
-- Portal do Fornecedor, F3.1 (âmbito simplificado em 07/10/2026):
--   1. CRM: "Enviar acesso ao portal" na ficha do fornecedor. O email leva um
--      LINK para definir a password (edge function create-supplier-portal-access,
--      que usa as duas RPCs service_role desta migration). Nunca há password
--      temporária nem password devolvida ao operador.
--   2. Portal: o fornecedor entra e gere o SEU catálogo (importar Excel/CSV com
--      pré-visualização, ver/editar/desativar artigos) — RPCs sp_*.
--   3. CRM: o catálogo do fornecedor na ficha/SupplierCatalogPanel, lista
--      "por ligar" e sugestões para ligar às nossas referências — RPCs rpc_*.
-- Encomendas, expedição, preços por empresa e aprovação de preços ficam para
-- fatias seguintes.
--
-- Decisões (não reabrir):
--   • Conta global por NIF (fn_nif_key: dígito de controlo PT; prefixo UE).
--   • O fornecedor NÃO tem anew_users nem anew_memberships. A conta Auth é
--     criada com user_metadata.admin_created='true' (handle_new_user salta) e
--     um gatilho novo em anew_users recusa associar-lhe um perfil do CRM
--     (fecha o "lazy-create" de create-client-portal-access/create-user).
--   • create_initial_organization já recusa estas contas: exige anew_users com
--     registration_origin='self_registration' (verificado ao vivo; teste D).
--   • Acesso por empresa (supplier_portal_user_access): quem a empresa A
--     convida só tem acesso à ligação da A.
--   • Email que já é utilizador interno, cliente do portal, ou utilizador de
--     outro fornecedor → recusado (mensagem genérica, sem revelar porquê).
--   • Portal só por RPCs sp_* SECURITY DEFINER que começam por fn_sp_actor().
--     As tabelas novas não têm nenhuma política para o portal.
--   • CRM lê por RLS por organização (SELECT) onde a tabela tem organização;
--     supplier_accounts / supplier_portal_users / supplier_catalog_items /
--     supplier_catalog_imports são globais → só por RPC.
--   • O catálogo é da CONTA (global). Cada empresa ligada vê-o pelo CRM.
--   • Escrever no catálogo: só o utilizador "owner" da conta (o primeiro
--     convidado). Os restantes ("member") só leem. Ver riscos no contrato.
--   • A ligação ref↔SKU é feita por nós: item_suppliers.catalog_item_id +
--     product_codes (kind supplier_ref, source 'catalog'). O preço que conta no
--     CRM continua a ser item_suppliers.purchase_price.
--
-- Erros: mensagens em PT; o HINT leva um código estável para o frontend/edge
-- (no_supplier_access, not_owner, not_found, invalid_nif, email_not_allowed,
--  no_permission, validation, conflict, not_linked, too_many_rows).
--
-- Prerequisites: 20261211100000_portal_fornecedor_f30_seguranca.sql
--                20261210100000_aprender_codigos.sql (product_codes,
--                fn_product_code_key)
-- ============================================================


-- ============================================================
-- 0. Funções puras
-- ============================================================

-- Chave do NIF: país + identificador. NULL = inválido (não se pode convidar).
--   • só dígitos (9) → NIF português, valida o dígito de controlo → 'PT…'
--   • 'PT' + 9 dígitos → idem
--   • outro prefixo de país da UE (GR→EL, XI Irlanda do Norte) + 2..13
--     alfanuméricos → sem validação de controlo
--   • ignora espaços, pontos, hífens e barras; maiúsculas.
CREATE FUNCTION public.fn_nif_key(p_nif text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  s    text;
  cc   text;
  body text;
  i    integer;
  tot  integer := 0;
  r    integer;
  chk  integer;
BEGIN
  s := upper(regexp_replace(COALESCE(p_nif, ''), '[\s\.\-/' || chr(160) || ']', '', 'g'));
  IF s = '' THEN
    RETURN NULL;
  END IF;

  IF s ~ '^[0-9]{9}$' THEN
    cc := 'PT'; body := s;
  ELSIF s ~ '^[A-Z]{2}[0-9A-Z]{2,13}$' THEN
    cc := left(s, 2); body := substr(s, 3);
    IF cc = 'GR' THEN cc := 'EL'; END IF;
    IF cc NOT IN ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE',
                  'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI') THEN
      RETURN NULL;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  IF cc = 'PT' THEN
    IF body !~ '^[1-9][0-9]{8}$' THEN
      RETURN NULL;
    END IF;
    FOR i IN 1..8 LOOP
      tot := tot + substr(body, i, 1)::integer * (10 - i);
    END LOOP;
    r := tot % 11;
    chk := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
    IF chk <> substr(body, 9, 1)::integer THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN cc || body;
END;
$function$;

COMMENT ON FUNCTION public.fn_nif_key(text) IS
  'Portal do fornecedor F3.1: chave global do NIF (PT + 9 dígitos com dígito de controlo válido, ou prefixo de país da UE + identificador). NULL = inválido.';

-- Número vindo de Excel/CSV: aceita 12.5, 12,5, 1.234,56, 1,234.56, " 12 € ".
-- '' → NULL; inválido → NULL (quem chama distingue pelo texto de origem).
CREATE FUNCTION public.fn_catalog_parse_number(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  s text := regexp_replace(COALESCE(p_value, ''), '[\s€' || chr(160) || ']', '', 'g');
BEGIN
  IF s = '' THEN
    RETURN NULL;
  END IF;
  IF s ~ '^[+-]?[0-9]+$' THEN
    RETURN s::numeric;
  ELSIF s ~ '^[+-]?[0-9]*[\.,][0-9]+$' THEN
    RETURN replace(s, ',', '.')::numeric;
  ELSIF s ~ '^[+-]?[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?$' THEN
    RETURN replace(replace(s, '.', ''), ',', '.')::numeric;
  ELSIF s ~ '^[+-]?[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$' THEN
    RETURN replace(s, ',', '')::numeric;
  ELSIF s ~ '^[+-]?[0-9]+(\.[0-9]+)?[eE][+-]?[0-9]{1,3}$' THEN
    RETURN s::numeric;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.fn_catalog_parse_number(text) IS
  'Portal do fornecedor F3.1: lê um número de uma célula de Excel/CSV (vírgula ou ponto decimal, separador de milhares, €). Inválido → NULL.';

REVOKE ALL ON FUNCTION public.fn_nif_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_catalog_parse_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nif_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_catalog_parse_number(text) TO authenticated, service_role;


-- ============================================================
-- 1. Tabelas
-- ============================================================

-- 1.1 Conta global do fornecedor (uma por NIF)
CREATE TABLE public.supplier_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nif_key           text NOT NULL,
  display_name      text NOT NULL,
  status            text NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by_org_id uuid REFERENCES public.anew_organizations(id) ON DELETE SET NULL,
  CONSTRAINT supplier_accounts_nif_key_uniq UNIQUE (nif_key),
  CONSTRAINT supplier_accounts_nif_key_chk CHECK (nif_key ~ '^[A-Z]{2}[0-9A-Z]{2,13}$'),
  CONSTRAINT supplier_accounts_display_name_chk CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT supplier_accounts_status_chk CHECK (status IN ('active', 'suspended'))
);
COMMENT ON TABLE public.supplier_accounts IS
  'Portal do fornecedor F3.1: conta global do fornecedor, uma por NIF (fn_nif_key). Sem organization_id: o CRM só a lê por RPC.';

-- 1.2 Ligação da conta a uma linha de suppliers de uma organização
CREATE TABLE public.supplier_account_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_account_id uuid NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL REFERENCES public.anew_organizations(id),
  supplier_id         uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'active',
  invited_by          uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  revoked_by          uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT supplier_account_links_status_chk CHECK (status IN ('active', 'revoked')),
  CONSTRAINT supplier_account_links_revoked_chk CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT supplier_account_links_supplier_account_uniq UNIQUE (supplier_id, supplier_account_id)
);
CREATE UNIQUE INDEX uq_supplier_account_links_active_supplier
  ON public.supplier_account_links (supplier_id) WHERE status = 'active';
CREATE INDEX idx_supplier_account_links_account ON public.supplier_account_links (supplier_account_id);
CREATE INDEX idx_supplier_account_links_org ON public.supplier_account_links (organization_id);
COMMENT ON TABLE public.supplier_account_links IS
  'Portal do fornecedor F3.1: liga uma conta global (NIF) a uma linha de suppliers de uma organização. Uma ligação ativa por fornecedor.';

-- 1.3 Utilizadores do portal (cada conta Auth pertence a uma só conta de fornecedor)
CREATE TABLE public.supplier_portal_users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_account_id uuid NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  auth_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text NOT NULL,
  name                text,
  role                text NOT NULL DEFAULT 'member',
  status              text NOT NULL DEFAULT 'active',
  first_login         boolean NOT NULL DEFAULT true,
  password_changed_at timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by_org_id   uuid REFERENCES public.anew_organizations(id) ON DELETE SET NULL,
  invited_by          uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT supplier_portal_users_auth_uniq UNIQUE (auth_user_id),
  CONSTRAINT supplier_portal_users_role_chk CHECK (role IN ('owner', 'member')),
  CONSTRAINT supplier_portal_users_status_chk CHECK (status IN ('active', 'disabled')),
  CONSTRAINT supplier_portal_users_email_chk CHECK (char_length(email) BETWEEN 3 AND 320),
  CONSTRAINT supplier_portal_users_name_chk CHECK (name IS NULL OR char_length(name) <= 200)
);
CREATE INDEX idx_supplier_portal_users_account ON public.supplier_portal_users (supplier_account_id);
CREATE UNIQUE INDEX uq_supplier_portal_users_one_owner
  ON public.supplier_portal_users (supplier_account_id) WHERE role = 'owner' AND status = 'active';
COMMENT ON TABLE public.supplier_portal_users IS
  'Portal do fornecedor F3.1: utilizador do portal (conta Auth sem anew_users). owner = primeiro convidado da conta; só o owner escreve no catálogo.';

-- 1.4 Concessão por empresa
CREATE TABLE public.supplier_portal_user_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id  uuid NOT NULL REFERENCES public.supplier_portal_users(id) ON DELETE CASCADE,
  link_id         uuid NOT NULL REFERENCES public.supplier_account_links(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  granted_by      uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  CONSTRAINT supplier_portal_user_access_uniq UNIQUE (portal_user_id, link_id)
);
CREATE INDEX idx_supplier_portal_user_access_link ON public.supplier_portal_user_access (link_id);
CREATE INDEX idx_supplier_portal_user_access_org ON public.supplier_portal_user_access (organization_id);
COMMENT ON TABLE public.supplier_portal_user_access IS
  'Portal do fornecedor F3.1: acesso de um utilizador do portal a UMA ligação (empresa). Quem a empresa A convida só vê a ligação da A.';

-- 1.5 Catálogo da conta
CREATE TABLE public.supplier_catalog_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_account_id    uuid NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  supplier_ref           text NOT NULL,
  ref_key                text GENERATED ALWAYS AS (public.fn_product_code_key(supplier_ref)) STORED,
  barcode                text,
  barcode_key            text GENERATED ALWAYS AS (public.fn_product_code_key(barcode)) STORED,
  name                   text NOT NULL,
  description            text,
  brand                  text,
  unit_label             text,
  units_per_pack         numeric(14,4),
  base_price             numeric(14,4),
  currency               text NOT NULL DEFAULT 'EUR',
  moq                    numeric(14,4),
  lead_time_days         integer,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_portal_user uuid REFERENCES public.supplier_portal_users(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by_portal_user uuid REFERENCES public.supplier_portal_users(id) ON DELETE SET NULL,
  CONSTRAINT supplier_catalog_items_ref_chk CHECK (char_length(btrim(supplier_ref)) BETWEEN 1 AND 100),
  CONSTRAINT supplier_catalog_items_barcode_chk CHECK (barcode IS NULL OR barcode ~ '^[0-9]{8,14}$'),
  CONSTRAINT supplier_catalog_items_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 300),
  CONSTRAINT supplier_catalog_items_description_chk CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT supplier_catalog_items_brand_chk CHECK (brand IS NULL OR char_length(brand) <= 100),
  CONSTRAINT supplier_catalog_items_unit_chk CHECK (unit_label IS NULL OR char_length(unit_label) <= 30),
  CONSTRAINT supplier_catalog_items_upp_chk CHECK (units_per_pack IS NULL OR units_per_pack > 0),
  CONSTRAINT supplier_catalog_items_price_chk CHECK (base_price IS NULL OR base_price >= 0),
  CONSTRAINT supplier_catalog_items_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_catalog_items_moq_chk CHECK (moq IS NULL OR moq > 0),
  CONSTRAINT supplier_catalog_items_lead_chk CHECK (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 3650)
);
CREATE UNIQUE INDEX uq_supplier_catalog_items_ref
  ON public.supplier_catalog_items (supplier_account_id, ref_key);
CREATE INDEX idx_supplier_catalog_items_barcode
  ON public.supplier_catalog_items (supplier_account_id, barcode_key) WHERE barcode_key IS NOT NULL;
CREATE INDEX idx_supplier_catalog_items_name_trgm
  ON public.supplier_catalog_items USING gin (name extensions.gin_trgm_ops);
COMMENT ON TABLE public.supplier_catalog_items IS
  'Portal do fornecedor F3.1: catálogo da conta (global). Cada empresa ligada vê-o pelo CRM; a ligação ao nosso produto é item_suppliers.catalog_item_id.';

-- 1.6 Registo de cada importação gravada (o dry-run não fica registado)
CREATE TABLE public.supplier_catalog_imports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_account_id uuid NOT NULL REFERENCES public.supplier_accounts(id) ON DELETE CASCADE,
  portal_user_id      uuid REFERENCES public.supplier_portal_users(id) ON DELETE SET NULL,
  file_name           text,
  total_rows          integer NOT NULL,
  summary             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_catalog_imports_file_chk CHECK (file_name IS NULL OR char_length(file_name) <= 255)
);
CREATE INDEX idx_supplier_catalog_imports_account ON public.supplier_catalog_imports (supplier_account_id, created_at DESC);

-- 1.7 "Não vendemos isto" — sai da fila "por ligar" da empresa
CREATE TABLE public.supplier_catalog_dismissals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  link_id         uuid NOT NULL REFERENCES public.supplier_account_links(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.supplier_catalog_items(id) ON DELETE CASCADE,
  dismissed_by    uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  reason          text,
  CONSTRAINT supplier_catalog_dismissals_uniq UNIQUE (link_id, catalog_item_id),
  CONSTRAINT supplier_catalog_dismissals_reason_chk CHECK (reason IS NULL OR char_length(reason) <= 500)
);
CREATE INDEX idx_supplier_catalog_dismissals_org ON public.supplier_catalog_dismissals (organization_id);

-- 1.8 Ligação ref↔SKU
ALTER TABLE public.item_suppliers
  ADD COLUMN catalog_item_id uuid REFERENCES public.supplier_catalog_items(id) ON DELETE SET NULL;
CREATE INDEX idx_item_suppliers_catalog_item
  ON public.item_suppliers (catalog_item_id) WHERE catalog_item_id IS NOT NULL;
CREATE UNIQUE INDEX uq_item_suppliers_supplier_catalog_item
  ON public.item_suppliers (supplier_id, catalog_item_id)
  WHERE catalog_item_id IS NOT NULL AND deleted_at IS NULL;
COMMENT ON COLUMN public.item_suppliers.catalog_item_id IS
  'Portal do fornecedor F3.1: artigo do catálogo do fornecedor ligado a esta linha. Só escrito por rpc_catalog_link/rpc_catalog_unlink.';


-- ============================================================
-- 2. RLS e privilégios das tabelas
-- ============================================================
ALTER TABLE public.supplier_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_account_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_portal_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_portal_user_access  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_dismissals  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_accounts, public.supplier_account_links, public.supplier_portal_users,
              public.supplier_portal_user_access, public.supplier_catalog_items,
              public.supplier_catalog_imports, public.supplier_catalog_dismissals
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.supplier_accounts, public.supplier_account_links, public.supplier_portal_users,
             public.supplier_portal_user_access, public.supplier_catalog_items,
             public.supplier_catalog_imports, public.supplier_catalog_dismissals
  TO service_role;

-- SELECT do CRM, por organização (tabelas com organization_id). Sem escrita direta.
GRANT SELECT ON public.supplier_account_links, public.supplier_portal_user_access,
                public.supplier_catalog_dismissals TO authenticated;

CREATE POLICY supplier_account_links_select_crm ON public.supplier_account_links
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'suppliers.view')
  );
CREATE POLICY supplier_portal_user_access_select_crm ON public.supplier_portal_user_access
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'suppliers.view')
  );
CREATE POLICY supplier_catalog_dismissals_select_crm ON public.supplier_catalog_dismissals
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'suppliers.view')
  );
-- supplier_accounts, supplier_portal_users, supplier_catalog_items, supplier_catalog_imports:
-- sem políticas (globais; CRM e portal só por RPC).


-- ============================================================
-- 3. Auditoria (tabelas com organization_id; o ator pode ser NULL)
-- ============================================================
CREATE TRIGGER trg_audit_supplier_account_links
  AFTER INSERT OR DELETE OR UPDATE ON public.supplier_account_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();
CREATE TRIGGER trg_audit_supplier_portal_user_access
  AFTER INSERT OR DELETE OR UPDATE ON public.supplier_portal_user_access
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();
CREATE TRIGGER trg_audit_supplier_catalog_dismissals
  AFTER INSERT OR DELETE OR UPDATE ON public.supplier_catalog_dismissals
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();


-- ============================================================
-- 4. Gatilhos de guarda
-- ============================================================

-- 4.1 suppliers: NIF e organização não mudam com uma ligação ativa ao portal
--     (mudanças só de formatação — espaços, pontos, prefixo PT — passam).
CREATE FUNCTION public.fn_suppliers_portal_nif_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text;
BEGIN
  IF NEW.tax_id IS NOT DISTINCT FROM OLD.tax_id
     AND NEW.vat_number IS NOT DISTINCT FROM OLD.vat_number
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT a.nif_key INTO v_key
  FROM public.supplier_account_links l
  JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
  WHERE l.supplier_id = NEW.id AND l.status = 'active'
  LIMIT 1;

  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Este fornecedor tem acesso ao portal ativo: desligue o portal antes de o mudar de empresa'
      USING ERRCODE = 'check_violation', HINT = 'portal_link_active';
  END IF;

  IF (NULLIF(btrim(NEW.tax_id), '') IS NOT NULL AND public.fn_nif_key(NEW.tax_id) IS DISTINCT FROM v_key)
     OR (NULLIF(btrim(NEW.vat_number), '') IS NOT NULL AND public.fn_nif_key(NEW.vat_number) IS DISTINCT FROM v_key)
     OR (NULLIF(btrim(NEW.tax_id), '') IS NULL AND NULLIF(btrim(NEW.vat_number), '') IS NULL) THEN
    RAISE EXCEPTION 'Este fornecedor tem acesso ao portal ativo: desligue o portal antes de mudar o NIF'
      USING ERRCODE = 'check_violation', HINT = 'portal_link_active';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_suppliers_portal_nif_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_suppliers_portal_nif_guard
  BEFORE UPDATE OF tax_id, vat_number, organization_id ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_suppliers_portal_nif_guard();

-- 4.2 item_suppliers.catalog_item_id: só pelas RPCs (current_user postgres).
--     Mudar a linha para outro fornecedor desfaz a ligação ao catálogo.
CREATE FUNCTION public.fn_item_suppliers_catalog_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     AND NEW.catalog_item_id IS NOT NULL AND NEW.catalog_item_id IS NOT DISTINCT FROM OLD.catalog_item_id THEN
    NEW.catalog_item_id := NULL;
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF (TG_OP = 'INSERT' AND NEW.catalog_item_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.catalog_item_id IS DISTINCT FROM OLD.catalog_item_id
           AND NEW.catalog_item_id IS NOT NULL) THEN
      RAISE EXCEPTION 'A ligação ao catálogo do fornecedor só pode ser feita pelo painel do catálogo'
        USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_item_suppliers_catalog_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_item_suppliers_00_catalog_guard
  BEFORE INSERT OR UPDATE OF catalog_item_id, supplier_id ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_item_suppliers_catalog_guard();

-- 4.3 anew_users: uma conta do portal do fornecedor nunca recebe perfil do CRM
--     (fecha o lazy-create de create-client-portal-access e de create-user).
CREATE FUNCTION public.fn_anew_users_block_supplier_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.auth_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id)
     AND EXISTS (SELECT 1 FROM public.supplier_portal_users s WHERE s.auth_user_id = NEW.auth_user_id) THEN
    RAISE EXCEPTION 'Esta conta é do portal do fornecedor e não pode ser usada no CRM nem no portal do cliente'
      USING ERRCODE = 'check_violation', HINT = 'supplier_account';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_anew_users_block_supplier_accounts() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_anew_users_00_block_supplier_accounts
  BEFORE INSERT OR UPDATE OF auth_user_id ON public.anew_users
  FOR EACH ROW EXECUTE FUNCTION public.fn_anew_users_block_supplier_accounts();


-- ============================================================
-- 5. Permissão nova suppliers.portal_manage
-- ============================================================
INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('suppliers.portal_manage',
   'Gerir acesso dos fornecedores ao portal',
   'Permite enviar o convite de acesso ao Portal do Fornecedor (o fornecedor recebe por email um link para definir a password), reenviar o link e revogar o acesso. Ver o estado do portal e o catálogo do fornecedor exige só Ver fornecedores; ligar artigos do catálogo aos nossos produtos exige Editar produtos.',
   'suppliers', NULL, 3, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- Semeada em todos os papéis (não apagados) que hoje têm suppliers.edit:
-- org_admin, org_editor, purchase_technician, super_admin, system_admin
-- (127 papéis a 07/10/2026). DISABLE TRIGGER USER: trg_protect_system_role_perms
-- recusa papéis is_system fora de service_role (mesmo padrão de 20261210130000).
ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'suppliers.portal_manage', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.anew_role_permissions rp
    WHERE rp.role_id = ro.id AND rp.permission_code = 'suppliers.edit'
  )
ON CONFLICT (role_id, permission_code) DO NOTHING;
ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;


-- ============================================================
-- 6. Auxiliares internas (não executáveis por authenticated)
-- ============================================================

-- 6.1 Ator do portal: utilizador ativo, conta ativa, com pelo menos um acesso
--     ativo (ligação ativa, fornecedor não apagado). Senão, erro.
CREATE FUNCTION public.fn_sp_actor()
RETURNS public.supplier_portal_users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v public.supplier_portal_users;
BEGIN
  SELECT u.* INTO v
  FROM public.supplier_portal_users u
  JOIN public.supplier_accounts a ON a.id = u.supplier_account_id
  WHERE u.auth_user_id = auth.uid()
    AND u.status = 'active'
    AND a.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.supplier_portal_user_access x
      JOIN public.supplier_account_links l ON l.id = x.link_id
      JOIN public.suppliers s ON s.id = l.supplier_id
      WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL
        AND l.status = 'active' AND s.deleted_at IS NULL
    );
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Sem acesso ao portal do fornecedor'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_supplier_access';
  END IF;
  RETURN v;
END;
$function$;
COMMENT ON FUNCTION public.fn_sp_actor() IS
  'Portal do fornecedor F3.1: resolve auth.uid() para um utilizador do portal ativo, numa conta ativa, com pelo menos um acesso ativo; senão erro 42501 (HINT no_supplier_access). Chamada no início de cada sp_*.';
REVOKE ALL ON FUNCTION public.fn_sp_actor() FROM PUBLIC, anon, authenticated;

-- 6.2 Fornecedor visível ao utilizador do CRM com a permissão pedida.
--     Não encontrado e sem acesso dão a mesma mensagem.
CREATE FUNCTION public.fn_sp_crm_supplier_org(p_supplier_id uuid, p_permission text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT s.organization_id INTO v_org
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.deleted_at IS NULL;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.has_anew_permission(v_uid, p_permission) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (%)', p_permission
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN v_org;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_crm_supplier_org(uuid, text) FROM PUBLIC, anon, authenticated;

-- 6.3 Limpeza e validação de uma linha do catálogo (importação e edição).
--     Devolve só as chaves presentes no objeto (chave ausente = manter o valor
--     atual; chave presente com '' = limpar, exceto obrigatórios).
CREATE FUNCTION public.fn_sp_catalog_clean(p_row jsonb, OUT data jsonb, OUT errors text[])
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k     text;
  raw   text;
  v     text;
  n     numeric;
  ctrl  text := '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]';
  lim   integer;
  labels jsonb := '{"supplier_ref":"Referência","name":"Nome","description":"Descrição","brand":"Marca","unit_label":"Unidade","barcode":"Código de barras","currency":"Moeda","base_price":"Preço","units_per_pack":"Unidades por embalagem","moq":"Quantidade mínima","lead_time_days":"Prazo de entrega (dias)","is_active":"Ativo"}';
BEGIN
  data := '{}'::jsonb;
  errors := ARRAY[]::text[];

  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    errors := errors || 'Linha inválida'::text;
    RETURN;
  END IF;

  -- Texto
  FOR k, lim IN SELECT * FROM (VALUES ('supplier_ref', 100), ('name', 300), ('description', 2000),
                                      ('brand', 100), ('unit_label', 30)) t(k, lim) LOOP
    IF p_row ? k THEN
      raw := CASE WHEN jsonb_typeof(p_row -> k) = 'null' THEN NULL ELSE p_row ->> k END;
      v := NULLIF(btrim(regexp_replace(COALESCE(raw, ''), ctrl, '', 'g')), '');
      IF v IS NOT NULL AND char_length(v) > lim THEN
        errors := errors || format('%s demasiado longo (máx. %s caracteres)', labels ->> k, lim);
      ELSIF v IS NULL AND k IN ('supplier_ref', 'name') THEN
        errors := errors || format('%s obrigatório', labels ->> k);
      ELSE
        data := data || jsonb_build_object(k, v);
      END IF;
    END IF;
  END LOOP;
  IF NOT (p_row ? 'supplier_ref') THEN
    errors := errors || 'Referência obrigatória'::text;
  END IF;

  -- Código de barras: 8 a 14 dígitos
  IF p_row ? 'barcode' THEN
    raw := CASE WHEN jsonb_typeof(p_row -> 'barcode') = 'null' THEN NULL ELSE p_row ->> 'barcode' END;
    v := NULLIF(regexp_replace(COALESCE(raw, ''), '[\s' || chr(160) || ']', '', 'g'), '');
    IF v IS NOT NULL AND v !~ '^[0-9]{8,14}$' THEN
      errors := errors || 'Código de barras inválido (8 a 14 dígitos)'::text;
    ELSE
      data := data || jsonb_build_object('barcode', v);
    END IF;
  END IF;

  -- Moeda
  IF p_row ? 'currency' THEN
    v := upper(NULLIF(btrim(COALESCE(p_row ->> 'currency', '')), ''));
    IF v IS NULL THEN
      data := data || jsonb_build_object('currency', 'EUR');
    ELSIF v !~ '^[A-Z]{3}$' THEN
      errors := errors || 'Moeda inválida (código de 3 letras, ex.: EUR)'::text;
    ELSE
      data := data || jsonb_build_object('currency', v);
    END IF;
  END IF;

  -- Números
  FOR k IN SELECT unnest(ARRAY['base_price', 'units_per_pack', 'moq', 'lead_time_days']) LOOP
    IF p_row ? k THEN
      raw := CASE WHEN jsonb_typeof(p_row -> k) = 'null' THEN NULL ELSE btrim(p_row ->> k) END;
      IF raw IS NULL OR raw = '' THEN
        data := data || jsonb_build_object(k, NULL);
        CONTINUE;
      END IF;
      n := public.fn_catalog_parse_number(raw);
      IF n IS NULL THEN
        errors := errors || format('%s inválido: «%s»', labels ->> k, left(raw, 40));
      ELSIF k = 'base_price' AND (n < 0 OR n > 1000000000) THEN
        errors := errors || 'Preço fora do intervalo (0 a 1 000 000 000)'::text;
      ELSIF k IN ('units_per_pack', 'moq') AND (n <= 0 OR n > 1000000000) THEN
        errors := errors || format('%s tem de ser maior que zero', labels ->> k);
      ELSIF k = 'lead_time_days' AND (n < 0 OR n > 3650 OR n <> trunc(n)) THEN
        errors := errors || 'Prazo de entrega inválido (dias inteiros, 0 a 3650)'::text;
      ELSE
        data := data || jsonb_build_object(k, CASE WHEN k = 'lead_time_days' THEN to_jsonb(n::integer)
                                                  ELSE to_jsonb(trim_scale(round(n, 4))) END);
      END IF;
    END IF;
  END LOOP;

  -- Ativo
  IF p_row ? 'is_active' THEN
    v := lower(btrim(COALESCE(p_row ->> 'is_active', '')));
    IF v IN ('', 'true', 'sim', 's', 'yes', 'y', '1', 'ativo', 'activo', 'x') THEN
      data := data || jsonb_build_object('is_active', true);
    ELSIF v IN ('false', 'não', 'nao', 'n', 'no', '0', 'inativo', 'inactivo') THEN
      data := data || jsonb_build_object('is_active', false);
    ELSE
      errors := errors || format('Ativo inválido: «%s» (use sim/não)', left(v, 20));
    END IF;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_clean(jsonb) FROM PUBLIC, anon, authenticated;

-- 6.4 Diferenças entre o artigo gravado e os dados limpos (só chaves presentes)
CREATE FUNCTION public.fn_sp_catalog_diff(p_item public.supplier_catalog_items, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cur jsonb := to_jsonb(p_item);
  out jsonb := '{}'::jsonb;
  k   text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF k IN ('base_price', 'units_per_pack', 'moq', 'lead_time_days') THEN
      IF (cur ->> k)::numeric IS DISTINCT FROM (p_data ->> k)::numeric THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    ELSIF k = 'is_active' THEN
      IF (cur ->> k)::boolean IS DISTINCT FROM (p_data ->> k)::boolean THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    ELSIF k IN ('supplier_ref', 'name', 'description', 'brand', 'unit_label', 'barcode', 'currency') THEN
      IF (cur ->> k) IS DISTINCT FROM (p_data ->> k) THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    END IF;
  END LOOP;
  RETURN out;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_diff(public.supplier_catalog_items, jsonb) FROM PUBLIC, anon, authenticated;

-- 6.5 Artigo do catálogo em JSON (colunas escolhidas uma a uma)
CREATE FUNCTION public.fn_sp_catalog_item_json(p_item public.supplier_catalog_items, p_with_price boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', p_item.id,
    'supplier_ref', p_item.supplier_ref,
    'barcode', p_item.barcode,
    'name', p_item.name,
    'description', p_item.description,
    'brand', p_item.brand,
    'unit_label', p_item.unit_label,
    'units_per_pack', p_item.units_per_pack,
    'base_price', CASE WHEN p_with_price THEN p_item.base_price END,
    'currency', p_item.currency,
    'moq', p_item.moq,
    'lead_time_days', p_item.lead_time_days,
    'is_active', p_item.is_active,
    'updated_at', p_item.updated_at
  )
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_item_json(public.supplier_catalog_items, boolean) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 7. RPCs do portal (sp_*)
-- ============================================================

-- 7.1 Quem sou eu. Nunca dá erro: é chamada para qualquer conta sem anew_users
--     (fetchAccessKind) para distinguir supplier_only de no_profile.
CREATE FUNCTION public.sp_whoami()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  u        public.supplier_portal_users;
  a        public.supplier_accounts;
  v_active boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_supplier', false);
  END IF;
  SELECT * INTO u FROM public.supplier_portal_users WHERE auth_user_id = v_uid;
  IF u.id IS NULL THEN
    RETURN jsonb_build_object('is_supplier', false);
  END IF;
  SELECT * INTO a FROM public.supplier_accounts WHERE id = u.supplier_account_id;

  v_active := u.status = 'active' AND a.status = 'active' AND EXISTS (
    SELECT 1
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_account_links l ON l.id = x.link_id
    JOIN public.suppliers s ON s.id = l.supplier_id
    WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL AND l.status = 'active' AND s.deleted_at IS NULL
  );

  IF v_active AND (u.last_login_at IS NULL OR u.last_login_at < now() - interval '10 minutes') THEN
    UPDATE public.supplier_portal_users SET last_login_at = now() WHERE id = u.id;
  END IF;

  RETURN jsonb_build_object(
    'is_supplier', true,
    'active', v_active,
    'first_login', u.password_changed_at IS NULL,
    'can_manage_catalog', v_active AND u.role = 'owner',
    'user', jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name, 'role', u.role,
                               'password_changed_at', u.password_changed_at),
    'account', CASE WHEN v_active THEN jsonb_build_object('id', a.id, 'display_name', a.display_name, 'nif_key', a.nif_key) END
  );
END;
$function$;

-- 7.2 Empresas a que tenho acesso (nome e logótipo)
CREATE FUNCTION public.sp_my_companies()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u public.supplier_portal_users := public.fn_sp_actor();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'organization_id', o.id,
             'name', o.name,
             'logo_url', o.logo_url,
             'granted_at', x.granted_at) ORDER BY o.name)
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_account_links l ON l.id = x.link_id
    JOIN public.suppliers s ON s.id = l.supplier_id
    JOIN public.anew_organizations o ON o.id = l.organization_id
    WHERE x.portal_user_id = u.id AND x.revoked_at IS NULL
      AND l.status = 'active' AND s.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$function$;

-- 7.3 Password definida (chamar depois de auth.updateUser no /reset-password
--     ou no primeiro acesso). Não exige acesso ativo, só utilizador do portal.
CREATE FUNCTION public.sp_mark_password_changed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.supplier_portal_users
     SET password_changed_at = now(), first_login = false, updated_at = now()
   WHERE auth_user_id = auth.uid() AND status = 'active'
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sem acesso ao portal do fornecedor'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_supplier_access';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 7.4 Listar o catálogo da minha conta
CREATE FUNCTION public.sp_catalog_list(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_include_inactive boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_q      text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like   text;
  v_total  integer;
  v_items  jsonb;
BEGIN
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.supplier_catalog_items ci
  WHERE ci.supplier_account_id = u.supplier_account_id
    AND (COALESCE(p_include_inactive, false) OR ci.is_active)
    AND (v_like IS NULL OR ci.supplier_ref ILIKE v_like OR ci.name ILIKE v_like
         OR ci.barcode ILIKE v_like OR ci.brand ILIKE v_like);

  SELECT COALESCE(jsonb_agg(public.fn_sp_catalog_item_json(ci, true) ORDER BY ci.supplier_ref, ci.id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT c.id
    FROM public.supplier_catalog_items c
    WHERE c.supplier_account_id = u.supplier_account_id
      AND (COALESCE(p_include_inactive, false) OR c.is_active)
      AND (v_like IS NULL OR c.supplier_ref ILIKE v_like OR c.name ILIKE v_like
           OR c.barcode ILIKE v_like OR c.brand ILIKE v_like)
    ORDER BY c.supplier_ref, c.id
    LIMIT v_limit OFFSET v_offset
  ) z
  JOIN public.supplier_catalog_items ci ON ci.id = z.id;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'can_edit', u.role = 'owner',
    'items', v_items
  );
END;
$function$;

-- 7.5 Importar (dry-run = pré-visualização, não grava)
CREATE FUNCTION public.sp_catalog_import(
  p_rows jsonb,
  p_dry_run boolean DEFAULT true,
  p_file_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u         public.supplier_portal_users := public.fn_sp_actor();
  v_n       integer;
  v_dry     boolean := COALESCE(p_dry_run, true);
  v_file    text := NULLIF(left(btrim(regexp_replace(COALESCE(p_file_name, ''), '[\x01-\x1F\x7F]', '', 'g')), 255), '');
  v_new     integer;
  v_chg     integer;
  v_same    integer;
  v_err     integer;
  v_rows    jsonb;
  v_summary jsonb;
  v_import  uuid;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Envie as linhas como uma lista' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_n := jsonb_array_length(p_rows);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'O ficheiro não tem linhas' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_n > 5000 THEN
    RAISE EXCEPTION 'Demasiadas linhas (%); o máximo é 5000 por importação', v_n
      USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;

  -- Uma importação de cada vez por conta.
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_catalog:' || u.supplier_account_id::text, 0));

  CREATE TEMP TABLE IF NOT EXISTS _sp_cat_import (
    idx         integer,
    rownum      integer,
    data        jsonb,
    errors      text[],
    ref_key     text,
    existing_id uuid,
    status      text,
    changes     jsonb
  ) ON COMMIT DROP;
  TRUNCATE pg_temp._sp_cat_import;

  INSERT INTO pg_temp._sp_cat_import (idx, rownum, data, errors, ref_key)
  SELECT e.ord::integer,
         CASE WHEN jsonb_typeof(e.v) = 'object' AND (e.v ->> '_row') ~ '^[0-9]{1,7}$'
              THEN (e.v ->> '_row')::integer ELSE e.ord::integer END,
         c.data, c.errors,
         public.fn_product_code_key(c.data ->> 'supplier_ref')
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(v, ord)
  CROSS JOIN LATERAL public.fn_sp_catalog_clean(e.v) c;

  -- Referência repetida no próprio ficheiro: fica a primeira.
  UPDATE pg_temp._sp_cat_import t
     SET errors = t.errors || format('Referência repetida no ficheiro (já na linha %s)', d.first_row)
  FROM (
    SELECT idx, first_value(rownum) OVER (PARTITION BY ref_key ORDER BY idx) AS first_row,
           row_number() OVER (PARTITION BY ref_key ORDER BY idx) AS rn
    FROM pg_temp._sp_cat_import
    WHERE ref_key IS NOT NULL
  ) d
  WHERE d.idx = t.idx AND d.rn > 1;

  UPDATE pg_temp._sp_cat_import t
     SET existing_id = ci.id
  FROM public.supplier_catalog_items ci
  WHERE ci.supplier_account_id = u.supplier_account_id AND ci.ref_key = t.ref_key;

  -- Artigo novo precisa de nome.
  UPDATE pg_temp._sp_cat_import t
     SET errors = t.errors || 'Nome obrigatório'::text
  WHERE t.existing_id IS NULL AND NOT (t.data ? 'name')
    AND NOT ('Nome obrigatório' = ANY (t.errors));

  UPDATE pg_temp._sp_cat_import t
     SET status = 'error'
  WHERE cardinality(t.errors) > 0;

  UPDATE pg_temp._sp_cat_import t
     SET changes = public.fn_sp_catalog_diff(ci, t.data),
         status = CASE WHEN public.fn_sp_catalog_diff(ci, t.data) = '{}'::jsonb THEN 'unchanged' ELSE 'changed' END
  FROM public.supplier_catalog_items ci
  WHERE t.status IS NULL AND t.existing_id = ci.id;

  UPDATE pg_temp._sp_cat_import SET status = 'new' WHERE status IS NULL;

  SELECT count(*) FILTER (WHERE status = 'new'),
         count(*) FILTER (WHERE status = 'changed'),
         count(*) FILTER (WHERE status = 'unchanged'),
         count(*) FILTER (WHERE status = 'error')
  INTO v_new, v_chg, v_same, v_err
  FROM pg_temp._sp_cat_import;

  IF NOT v_dry THEN
    INSERT INTO public.supplier_catalog_items (
      supplier_account_id, supplier_ref, barcode, name, description, brand, unit_label,
      units_per_pack, base_price, currency, moq, lead_time_days, is_active,
      created_by_portal_user, updated_by_portal_user
    )
    SELECT u.supplier_account_id,
           t.data ->> 'supplier_ref', t.data ->> 'barcode', t.data ->> 'name', t.data ->> 'description',
           t.data ->> 'brand', t.data ->> 'unit_label',
           (t.data ->> 'units_per_pack')::numeric, (t.data ->> 'base_price')::numeric,
           COALESCE(t.data ->> 'currency', 'EUR'), (t.data ->> 'moq')::numeric,
           (t.data ->> 'lead_time_days')::integer, COALESCE((t.data ->> 'is_active')::boolean, true),
           u.id, u.id
    FROM pg_temp._sp_cat_import t
    WHERE t.status = 'new';

    UPDATE public.supplier_catalog_items ci SET
      supplier_ref   = CASE WHEN t.data ? 'supplier_ref'   THEN t.data ->> 'supplier_ref' ELSE ci.supplier_ref END,
      barcode        = CASE WHEN t.data ? 'barcode'        THEN t.data ->> 'barcode' ELSE ci.barcode END,
      name           = CASE WHEN t.data ? 'name'           THEN t.data ->> 'name' ELSE ci.name END,
      description    = CASE WHEN t.data ? 'description'    THEN t.data ->> 'description' ELSE ci.description END,
      brand          = CASE WHEN t.data ? 'brand'          THEN t.data ->> 'brand' ELSE ci.brand END,
      unit_label     = CASE WHEN t.data ? 'unit_label'     THEN t.data ->> 'unit_label' ELSE ci.unit_label END,
      units_per_pack = CASE WHEN t.data ? 'units_per_pack' THEN (t.data ->> 'units_per_pack')::numeric ELSE ci.units_per_pack END,
      base_price     = CASE WHEN t.data ? 'base_price'     THEN (t.data ->> 'base_price')::numeric ELSE ci.base_price END,
      currency       = CASE WHEN t.data ? 'currency'       THEN t.data ->> 'currency' ELSE ci.currency END,
      moq            = CASE WHEN t.data ? 'moq'            THEN (t.data ->> 'moq')::numeric ELSE ci.moq END,
      lead_time_days = CASE WHEN t.data ? 'lead_time_days' THEN (t.data ->> 'lead_time_days')::integer ELSE ci.lead_time_days END,
      is_active      = CASE WHEN t.data ? 'is_active'      THEN (t.data ->> 'is_active')::boolean ELSE ci.is_active END,
      updated_at = now(),
      updated_by_portal_user = u.id
    FROM pg_temp._sp_cat_import t
    WHERE t.status = 'changed' AND ci.id = t.existing_id;
  END IF;

  v_summary := jsonb_build_object('total', v_n, 'new', v_new, 'changed', v_chg, 'unchanged', v_same, 'errors', v_err);

  IF NOT v_dry THEN
    INSERT INTO public.supplier_catalog_imports (supplier_account_id, portal_user_id, file_name, total_rows, summary)
    VALUES (u.supplier_account_id, u.id, v_file, v_n, v_summary)
    RETURNING id INTO v_import;
  END IF;

  -- Detalhe só das linhas novas, alteradas ou com erro (as iguais só contam).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'row', t.rownum,
           'status', t.status,
           'supplier_ref', t.data ->> 'supplier_ref',
           'name', COALESCE(t.data ->> 'name', ci.name),
           'changes', CASE WHEN t.status = 'changed' THEN t.changes END,
           'errors', CASE WHEN t.status = 'error' THEN to_jsonb(t.errors) END
         ) ORDER BY t.idx), '[]'::jsonb)
  INTO v_rows
  FROM pg_temp._sp_cat_import t
  LEFT JOIN public.supplier_catalog_items ci ON ci.id = t.existing_id
  WHERE t.status <> 'unchanged';

  TRUNCATE pg_temp._sp_cat_import;

  RETURN v_summary || jsonb_build_object('dry_run', v_dry, 'import_id', v_import, 'rows', v_rows);
END;
$function$;

-- 7.6 Criar ou editar um artigo
--     p_item.id presente → editar esse artigo (chaves ausentes ficam como estão);
--     sem id → criar (recusa referência que já exista).
CREATE FUNCTION public.sp_catalog_upsert_item(p_item jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u      public.supplier_portal_users := public.fn_sp_actor();
  v_id   uuid;
  v_errs text[];
  cur    public.supplier_catalog_items;
  v_key  text;
  v_data jsonb;
  v_row  jsonb;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Artigo inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF NULLIF(p_item ->> 'id', '') IS NOT NULL THEN
    BEGIN
      v_id := (p_item ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END;
    SELECT * INTO cur FROM public.supplier_catalog_items
    WHERE id = v_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
    IF cur.id IS NULL THEN
      RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    -- Na edição a referência é opcional: sem ela fica a atual.
    v_row := p_item - 'id';
    IF NOT (v_row ? 'supplier_ref') THEN
      v_row := v_row || jsonb_build_object('supplier_ref', cur.supplier_ref);
    END IF;
  ELSE
    v_row := p_item - 'id';
  END IF;

  SELECT x.data, x.errors INTO v_data, v_errs FROM public.fn_sp_catalog_clean(v_row) x;
  IF cur.id IS NULL AND NOT (v_data ? 'name') AND NOT ('Nome obrigatório' = ANY (v_errs)) THEN
    v_errs := v_errs || 'Nome obrigatório'::text;
  END IF;
  IF cardinality(v_errs) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(v_errs, '; ')
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sp_catalog:' || u.supplier_account_id::text, 0));
  v_key := public.fn_product_code_key(v_data ->> 'supplier_ref');
  IF EXISTS (SELECT 1 FROM public.supplier_catalog_items
             WHERE supplier_account_id = u.supplier_account_id AND ref_key = v_key
               AND id IS DISTINCT FROM cur.id) THEN
    RAISE EXCEPTION 'Já existe um artigo com a referência «%»', v_data ->> 'supplier_ref'
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  IF cur.id IS NULL THEN
    INSERT INTO public.supplier_catalog_items (
      supplier_account_id, supplier_ref, barcode, name, description, brand, unit_label,
      units_per_pack, base_price, currency, moq, lead_time_days, is_active,
      created_by_portal_user, updated_by_portal_user
    ) VALUES (
      u.supplier_account_id, v_data ->> 'supplier_ref', v_data ->> 'barcode', v_data ->> 'name',
      v_data ->> 'description', v_data ->> 'brand', v_data ->> 'unit_label',
      (v_data ->> 'units_per_pack')::numeric, (v_data ->> 'base_price')::numeric,
      COALESCE(v_data ->> 'currency', 'EUR'), (v_data ->> 'moq')::numeric,
      (v_data ->> 'lead_time_days')::integer, COALESCE((v_data ->> 'is_active')::boolean, true), u.id, u.id
    ) RETURNING * INTO cur;
    RETURN jsonb_build_object('created', true, 'item', public.fn_sp_catalog_item_json(cur, true));
  END IF;

  UPDATE public.supplier_catalog_items ci SET
    supplier_ref   = v_data ->> 'supplier_ref',
    barcode        = CASE WHEN v_data ? 'barcode'        THEN v_data ->> 'barcode' ELSE ci.barcode END,
    name           = CASE WHEN v_data ? 'name'           THEN v_data ->> 'name' ELSE ci.name END,
    description    = CASE WHEN v_data ? 'description'    THEN v_data ->> 'description' ELSE ci.description END,
    brand          = CASE WHEN v_data ? 'brand'          THEN v_data ->> 'brand' ELSE ci.brand END,
    unit_label     = CASE WHEN v_data ? 'unit_label'     THEN v_data ->> 'unit_label' ELSE ci.unit_label END,
    units_per_pack = CASE WHEN v_data ? 'units_per_pack' THEN (v_data ->> 'units_per_pack')::numeric ELSE ci.units_per_pack END,
    base_price     = CASE WHEN v_data ? 'base_price'     THEN (v_data ->> 'base_price')::numeric ELSE ci.base_price END,
    currency       = CASE WHEN v_data ? 'currency'       THEN v_data ->> 'currency' ELSE ci.currency END,
    moq            = CASE WHEN v_data ? 'moq'            THEN (v_data ->> 'moq')::numeric ELSE ci.moq END,
    lead_time_days = CASE WHEN v_data ? 'lead_time_days' THEN (v_data ->> 'lead_time_days')::integer ELSE ci.lead_time_days END,
    is_active      = CASE WHEN v_data ? 'is_active'      THEN (v_data ->> 'is_active')::boolean ELSE ci.is_active END,
    updated_at = now(),
    updated_by_portal_user = u.id
  WHERE ci.id = cur.id
  RETURNING ci.* INTO cur;

  RETURN jsonb_build_object('created', false, 'item', public.fn_sp_catalog_item_json(cur, true));
END;
$function$;

-- 7.7 Ativar / desativar artigos
CREATE FUNCTION public.sp_catalog_set_active(p_item_ids uuid[], p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u   public.supplier_portal_users := public.fn_sp_actor();
  v_n integer;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF p_active IS NULL OR p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Indique os artigos e o estado' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF cardinality(p_item_ids) > 5000 THEN
    RAISE EXCEPTION 'Demasiados artigos (máx. 5000)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;

  UPDATE public.supplier_catalog_items
     SET is_active = p_active, updated_at = now(), updated_by_portal_user = u.id
   WHERE supplier_account_id = u.supplier_account_id
     AND id = ANY (p_item_ids)
     AND is_active IS DISTINCT FROM p_active;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_n);
END;
$function$;


-- ============================================================
-- 8. RPCs do CRM
-- ============================================================

-- 8.1 Estado do portal na ficha do fornecedor (suppliers.view)
CREATE FUNCTION public.rpc_supplier_portal_status(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  s       record;
  l       public.supplier_account_links;
  v_key   text;
  v_users jsonb := '[]'::jsonb;
  v_items integer;
BEGIN
  SELECT id, name, tax_id, vat_number, email INTO s FROM public.suppliers WHERE id = p_supplier_id;
  v_key := public.fn_nif_key(COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')));

  SELECT * INTO l FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id
  ORDER BY (status = 'active') DESC, created_at DESC
  LIMIT 1;

  IF l.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'portal_user_id', pu.id,
             'email', pu.email,
             'name', pu.name,
             'access_status', CASE WHEN x.revoked_at IS NULL AND pu.status = 'active' THEN 'active' ELSE 'revoked' END,
             'granted_at', x.granted_at,
             'revoked_at', x.revoked_at,
             'password_set', pu.password_changed_at IS NOT NULL,
             'last_login_at', pu.last_login_at
           ) ORDER BY x.granted_at), '[]'::jsonb)
    INTO v_users
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_portal_users pu ON pu.id = x.portal_user_id
    WHERE x.link_id = l.id;
  END IF;

  IF l.status = 'active' THEN
    SELECT count(*) INTO v_items FROM public.supplier_catalog_items
    WHERE supplier_account_id = l.supplier_account_id AND is_active;
  END IF;

  RETURN jsonb_build_object(
    'supplier_id', p_supplier_id,
    'nif', COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')),
    'nif_valid', v_key IS NOT NULL,
    'nif_key', v_key,
    'supplier_email', s.email,
    'portal_status', CASE WHEN l.id IS NULL THEN 'not_invited' WHEN l.status = 'active' THEN 'active' ELSE 'revoked' END,
    'link_id', l.id,
    'linked_at', l.created_at,
    'revoked_at', l.revoked_at,
    'users', v_users,
    'catalog_active_items', v_items,
    'can_manage', public.has_anew_permission(auth.uid(), 'suppliers.portal_manage')
  );
END;
$function$;

-- 8.2 Revogar acesso (suppliers.portal_manage)
--     p_portal_user_id NULL → desliga o portal deste fornecedor (todos os
--     acessos e a ligação). Senão revoga só esse utilizador nesta empresa.
CREATE FUNCTION public.rpc_supplier_portal_revoke_access(p_supplier_id uuid, p_portal_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.portal_manage');
  v_actor uuid := public.current_business_user_id();
  l       public.supplier_account_links;
  v_n     integer := 0;
BEGIN
  SELECT * INTO l FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id AND status = 'active'
  FOR UPDATE;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não tem acesso ativo ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;

  IF p_portal_user_id IS NOT NULL THEN
    UPDATE public.supplier_portal_user_access
       SET revoked_at = now(), revoked_by = v_actor
     WHERE link_id = l.id AND portal_user_id = p_portal_user_id AND revoked_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Utilizador do portal não encontrado neste fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    RETURN jsonb_build_object('revoked_users', v_n, 'link_revoked', false);
  END IF;

  UPDATE public.supplier_portal_user_access
     SET revoked_at = now(), revoked_by = v_actor
   WHERE link_id = l.id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.supplier_account_links
     SET status = 'revoked', revoked_at = now(), revoked_by = v_actor, updated_at = now()
   WHERE id = l.id;

  RETURN jsonb_build_object('revoked_users', v_n, 'link_revoked', true);
END;
$function$;

-- 8.3 Preparar convite — SÓ service_role (edge function create-supplier-portal-access).
--     Volta a verificar quem chama (p_caller_auth_uid, do JWT validado na edge).
--     p_check_only: só valida (antes de criar a conta Auth). Atómica.
CREATE FUNCTION public.rpc_supplier_portal_invite_prepare(
  p_caller_auth_uid uuid,
  p_organization_id uuid,
  p_supplier_id uuid,
  p_email text,
  p_name text DEFAULT NULL,
  p_check_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid;
  v_email    text := lower(btrim(COALESCE(p_email, '')));
  v_name     text := NULLIF(left(btrim(regexp_replace(COALESCE(p_name, ''), '[\x01-\x1F\x7F]', '', 'g')), 200), '');
  s          record;
  v_key      text;
  v_auth     uuid;
  a          public.supplier_accounts;
  l          public.supplier_account_links;
  pu         public.supplier_portal_users;
  v_new_user boolean := false;
  v_org_name text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só disponível para o servidor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT u.id INTO v_caller FROM public.anew_users u
  WHERE u.auth_user_id = p_caller_auth_uid AND u.status = 'active' AND u.deleted_at IS NULL;
  IF v_caller IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(p_caller_auth_uid))
     OR NOT public.has_anew_permission(p_caller_auth_uid, 'suppliers.portal_manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir o acesso dos fornecedores ao portal'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT id, name, tax_id, vat_number, organization_id, primary_contact_name INTO s
  FROM public.suppliers
  WHERE id = p_supplier_id AND organization_id = p_organization_id AND deleted_at IS NULL
  FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  v_key := public.fn_nif_key(COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')));
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'O NIF do fornecedor é inválido ou está vazio. Para fornecedores estrangeiros use o prefixo do país (ex.: ESB12345678).'
      USING ERRCODE = 'check_violation', HINT = 'invalid_nif';
  END IF;

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 320 THEN
    RAISE EXCEPTION 'Email inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  -- Email que é (ou foi) do CRM ou do portal do cliente, ou de outro fornecedor → recusado.
  SELECT id INTO v_auth FROM auth.users WHERE lower(email) = v_email ORDER BY created_at LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.anew_users WHERE lower(email) = v_email)
     OR (v_auth IS NOT NULL AND (
           EXISTS (SELECT 1 FROM public.anew_users WHERE auth_user_id = v_auth)
        OR EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = v_auth)
        OR EXISTS (SELECT 1 FROM public.supplier_portal_users x
                   JOIN public.supplier_accounts xa ON xa.id = x.supplier_account_id
                   WHERE x.auth_user_id = v_auth AND (xa.nif_key <> v_key OR x.status <> 'active'))
     )) THEN
    RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
      USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supplier_accounts WHERE nif_key = v_key AND status <> 'active') THEN
    RAISE EXCEPTION 'Não foi possível enviar o convite para este fornecedor. Contacte o suporte.'
      USING ERRCODE = 'check_violation', HINT = 'account_unavailable';
  END IF;

  -- Já ligado a outra conta (NIF mudou fora do gatilho)? Pede para desligar.
  IF EXISTS (SELECT 1 FROM public.supplier_account_links sl JOIN public.supplier_accounts sa ON sa.id = sl.supplier_account_id
             WHERE sl.supplier_id = s.id AND sl.status = 'active' AND sa.nif_key <> v_key) THEN
    RAISE EXCEPTION 'Este fornecedor está ligado ao portal com outro NIF. Desligue o portal e volte a convidar.'
      USING ERRCODE = 'check_violation', HINT = 'conflict';
  END IF;

  IF COALESCE(p_check_only, false) THEN
    RETURN jsonb_build_object('ok', true, 'auth_user_exists', v_auth IS NOT NULL);
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'A conta de acesso ainda não existe' USING ERRCODE = 'no_data_found', HINT = 'auth_user_missing';
  END IF;

  PERFORM set_config('app.audit_user_id', v_caller::text, true);
  PERFORM set_config('app.audit_source', 'supplier_portal_invite', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier_account:' || v_key, 0));

  -- Conta
  INSERT INTO public.supplier_accounts (nif_key, display_name, created_by_org_id)
  VALUES (v_key, left(btrim(s.name), 200), p_organization_id)
  ON CONFLICT (nif_key) DO NOTHING;
  SELECT * INTO a FROM public.supplier_accounts WHERE nif_key = v_key FOR UPDATE;

  -- Ligação
  SELECT * INTO l FROM public.supplier_account_links
  WHERE supplier_id = s.id AND supplier_account_id = a.id FOR UPDATE;
  IF l.id IS NULL THEN
    INSERT INTO public.supplier_account_links (supplier_account_id, organization_id, supplier_id, invited_by)
    VALUES (a.id, p_organization_id, s.id, v_caller)
    RETURNING * INTO l;
  ELSIF l.status <> 'active' THEN
    UPDATE public.supplier_account_links
       SET status = 'active', revoked_at = NULL, revoked_by = NULL, invited_by = v_caller,
           organization_id = p_organization_id, updated_at = now()
     WHERE id = l.id
    RETURNING * INTO l;
  END IF;

  -- Utilizador do portal
  SELECT * INTO pu FROM public.supplier_portal_users WHERE auth_user_id = v_auth FOR UPDATE;
  IF pu.id IS NULL THEN
    INSERT INTO public.supplier_portal_users (supplier_account_id, auth_user_id, email, name, role, created_by_org_id, invited_by)
    VALUES (a.id, v_auth, v_email, COALESCE(v_name, NULLIF(btrim(s.primary_contact_name), ''), left(btrim(s.name), 200)),
            CASE WHEN EXISTS (SELECT 1 FROM public.supplier_portal_users
                              WHERE supplier_account_id = a.id AND role = 'owner' AND status = 'active')
                 THEN 'member' ELSE 'owner' END,
            p_organization_id, v_caller)
    RETURNING * INTO pu;
    v_new_user := true;
  END IF;

  -- Acesso desta empresa
  INSERT INTO public.supplier_portal_user_access AS x (portal_user_id, link_id, organization_id, granted_by)
  VALUES (pu.id, l.id, p_organization_id, v_caller)
  ON CONFLICT (portal_user_id, link_id) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL, granted_by = EXCLUDED.granted_by, granted_at = now(),
        organization_id = EXCLUDED.organization_id
    WHERE x.revoked_at IS NOT NULL;

  SELECT name INTO v_org_name FROM public.anew_organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'portal_user_id', pu.id,
    'link_id', l.id,
    'auth_user_id', v_auth,
    'email', pu.email,
    'user_name', pu.name,
    'is_new_user', v_new_user,
    'password_set', pu.password_changed_at IS NOT NULL,
    'organization_name', v_org_name,
    'supplier_name', s.name
  );
END;
$function$;

-- 8.4 Preparar reenvio — SÓ service_role. O email vem da BD, nunca do pedido.
CREATE FUNCTION public.rpc_supplier_portal_resend_prepare(
  p_caller_auth_uid uuid,
  p_organization_id uuid,
  p_supplier_id uuid,
  p_portal_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid;
  r          record;
  v_org_name text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só disponível para o servidor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT u.id INTO v_caller FROM public.anew_users u
  WHERE u.auth_user_id = p_caller_auth_uid AND u.status = 'active' AND u.deleted_at IS NULL;
  IF v_caller IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(p_caller_auth_uid))
     OR NOT public.has_anew_permission(p_caller_auth_uid, 'suppliers.portal_manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir o acesso dos fornecedores ao portal'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT pu.id, pu.email, pu.name, pu.auth_user_id, pu.password_changed_at, s.name AS supplier_name
  INTO r
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_account_links l ON l.id = x.link_id
  JOIN public.supplier_portal_users pu ON pu.id = x.portal_user_id
  JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
  JOIN public.suppliers s ON s.id = l.supplier_id
  WHERE l.supplier_id = p_supplier_id AND l.organization_id = p_organization_id
    AND l.status = 'active' AND x.revoked_at IS NULL AND x.portal_user_id = p_portal_user_id
    AND pu.status = 'active' AND a.status = 'active' AND s.deleted_at IS NULL;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Utilizador do portal não encontrado neste fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  SELECT name INTO v_org_name FROM public.anew_organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'portal_user_id', r.id,
    'auth_user_id', r.auth_user_id,
    'email', r.email,
    'user_name', r.name,
    'password_set', r.password_changed_at IS NOT NULL,
    'organization_name', v_org_name,
    'supplier_name', r.supplier_name
  );
END;
$function$;

-- 8.5 Catálogo do fornecedor no CRM (suppliers.view; preços só com suppliers.view_pricing)
--     p_filter: 'all' | 'linked' | 'unlinked' (por ligar) | 'dismissed'
CREATE FUNCTION public.rpc_supplier_catalog_list(
  p_supplier_id uuid,
  p_filter text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_include_inactive boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_uid     uuid := auth.uid();
  v_pricing boolean;
  v_filter  text := lower(COALESCE(NULLIF(btrim(p_filter), ''), 'all'));
  v_limit   integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset  integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_q       text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like    text;
  l         public.supplier_account_links;
  v_counts  jsonb;
  v_total   integer;
  v_items   jsonb;
BEGIN
  IF v_filter NOT IN ('all', 'linked', 'unlinked', 'dismissed') THEN
    RAISE EXCEPTION 'Filtro inválido (all, linked, unlinked, dismissed)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_pricing := public.has_anew_permission(v_uid, 'suppliers.view_pricing')
            OR public.has_anew_permission(v_uid, 'products.view_cost');

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RETURN jsonb_build_object('linked_account', false, 'counts', jsonb_build_object('all', 0, 'linked', 0, 'unlinked', 0, 'dismissed', 0),
                              'total', 0, 'limit', v_limit, 'offset', v_offset, 'items', '[]'::jsonb,
                              'can_link', false, 'can_view_pricing', v_pricing);
  END IF;

  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH f AS (
    SELECT ci.id, ci.supplier_ref,
           EXISTS (SELECT 1 FROM public.item_suppliers isup
                   WHERE isup.supplier_id = p_supplier_id AND isup.catalog_item_id = ci.id AND isup.deleted_at IS NULL) AS is_linked,
           EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d WHERE d.link_id = l.id AND d.catalog_item_id = ci.id) AS is_dismissed
    FROM public.supplier_catalog_items ci
    WHERE ci.supplier_account_id = l.supplier_account_id
      AND (COALESCE(p_include_inactive, false) OR ci.is_active)
      AND (v_like IS NULL OR ci.supplier_ref ILIKE v_like OR ci.name ILIKE v_like
           OR ci.barcode ILIKE v_like OR ci.brand ILIKE v_like)
  ),
  fx AS (
    SELECT f.*,
           (v_filter = 'all'
            OR (v_filter = 'linked' AND f.is_linked)
            OR (v_filter = 'unlinked' AND NOT f.is_linked AND NOT f.is_dismissed)
            OR (v_filter = 'dismissed' AND f.is_dismissed AND NOT f.is_linked)) AS in_filter
    FROM f
  ),
  page AS (
    SELECT fx.id, fx.is_linked, fx.is_dismissed
    FROM fx WHERE fx.in_filter
    ORDER BY fx.supplier_ref, fx.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT jsonb_build_object(
              'all', count(*),
              'linked', count(*) FILTER (WHERE is_linked),
              'unlinked', count(*) FILTER (WHERE NOT is_linked AND NOT is_dismissed),
              'dismissed', count(*) FILTER (WHERE is_dismissed AND NOT is_linked))
       FROM fx),
    (SELECT count(*) FROM fx WHERE in_filter),
    (SELECT COALESCE(jsonb_agg(
           public.fn_sp_catalog_item_json(ci, v_pricing)
           || jsonb_build_object(
                'is_linked', f.is_linked,
                'is_dismissed', f.is_dismissed,
                'links', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'item_supplier_id', isup.id,
                           'product_id', p.id,
                           'product_name', p.name,
                           'product_sku', p.sku,
                           'uom_id', isup.uom_id,
                           'supplier_sku', isup.supplier_sku,
                           'purchase_price', CASE WHEN v_pricing THEN isup.purchase_price END,
                           'currency', isup.currency,
                           'is_preferred', isup.is_preferred) ORDER BY p.name)
                  FROM public.item_suppliers isup
                  JOIN public.products p ON p.id = isup.product_id
                  WHERE isup.supplier_id = p_supplier_id AND isup.catalog_item_id = ci.id AND isup.deleted_at IS NULL
                ), '[]'::jsonb))
           ORDER BY ci.supplier_ref, ci.id), '[]'::jsonb)
       FROM page f
       JOIN public.supplier_catalog_items ci ON ci.id = f.id)
  INTO v_counts, v_total, v_items;

  RETURN jsonb_build_object(
    'linked_account', true,
    'counts', v_counts,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_link', public.has_anew_permission(v_uid, 'products.edit'),
    'can_view_pricing', v_pricing
  );
END;
$function$;

-- 8.6 Sugestões de ligação (suppliers.view + products.view), até 5 por artigo.
--     Ordem: supplier_sku já usado neste fornecedor (1.00) → referência do
--     fornecedor em product_codes (0.98) → código de barras (0.95) → nome
--     (pg_trgm + unaccent, ≥ 0.30). exact = true nas três primeiras.
CREATE FUNCTION public.rpc_catalog_link_suggestions(p_supplier_id uuid, p_catalog_item_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_acc uuid;
  v_res jsonb;
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.view') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.view)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_catalog_item_ids IS NULL OR cardinality(p_catalog_item_ids) = 0 THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;
  IF cardinality(p_catalog_item_ids) > 200 THEN
    RAISE EXCEPTION 'Demasiados artigos (máx. 200 por pedido)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;

  SELECT supplier_account_id INTO v_acc FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id AND status = 'active';
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;

  WITH ci AS (
    SELECT c.id, c.ref_key, c.barcode_key, c.name,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) AS uname
    FROM public.supplier_catalog_items c
    WHERE c.supplier_account_id = v_acc AND c.id = ANY (p_catalog_item_ids)
  ),
  cand AS (
    SELECT ci.id AS catalog_item_id, isup.product_id, 'supplier_sku'::text AS reason, 1.00::numeric AS score, isup.id AS item_supplier_id
    FROM ci
    JOIN public.item_suppliers isup
      ON isup.supplier_id = p_supplier_id AND isup.deleted_at IS NULL AND isup.product_id IS NOT NULL
     AND isup.catalog_item_id IS NULL
     AND public.fn_product_code_key(isup.supplier_sku) = ci.ref_key
    UNION ALL
    SELECT ci.id, pc.product_id, 'supplier_ref_code', 0.98, NULL
    FROM ci
    JOIN public.product_codes pc
      ON pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
     AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key
    UNION ALL
    SELECT ci.id, p.id, 'barcode', 0.95, NULL
    FROM ci
    JOIN public.products p
      ON ci.barcode_key IS NOT NULL AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
     AND public.fn_product_code_key(p.barcode) = ci.barcode_key
    UNION ALL
    SELECT ci.id, pc.product_id, 'barcode', 0.95, NULL
    FROM ci
    JOIN public.product_codes pc
      ON ci.barcode_key IS NOT NULL AND pc.organization_id = v_org AND pc.kind = 'barcode'
     AND pc.deleted_at IS NULL AND pc.code_key = ci.barcode_key
    UNION ALL
    SELECT ci.id, n.id, 'name', n.score, NULL
    FROM ci
    CROSS JOIN LATERAL (
      SELECT p.id,
             round(extensions.similarity(lower(extensions.unaccent('extensions.unaccent'::regdictionary, p.name)), ci.uname)::numeric, 3) AS score
      FROM public.products p
      WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
        AND p.name OPERATOR(extensions.%) ci.name
      ORDER BY 2 DESC, p.id
      LIMIT 10
    ) n
    WHERE n.score >= 0.30
  ),
  best AS (
    SELECT DISTINCT ON (c.catalog_item_id, c.product_id)
           c.catalog_item_id, c.product_id, c.reason, c.score, c.item_supplier_id
    FROM cand c
    JOIN public.products p ON p.id = c.product_id AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    WHERE NOT EXISTS (
      SELECT 1 FROM public.item_suppliers x
      WHERE x.supplier_id = p_supplier_id AND x.catalog_item_id = c.catalog_item_id
        AND x.product_id = c.product_id AND x.deleted_at IS NULL)
    ORDER BY c.catalog_item_id, c.product_id, c.score DESC, c.item_supplier_id NULLS LAST
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (PARTITION BY b.catalog_item_id ORDER BY b.score DESC, b.product_id) AS rn
    FROM best b
  )
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object(
           'catalog_item_id', ci.id,
           'suggestions', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'product_id', p.id,
                      'product_name', p.name,
                      'product_sku', p.sku,
                      'product_barcode', p.barcode,
                      'reason', r.reason,
                      'score', r.score,
                      'exact', r.reason <> 'name',
                      'item_supplier_id', r.item_supplier_id) ORDER BY r.rn)
             FROM ranked r JOIN public.products p ON p.id = r.product_id
             WHERE r.catalog_item_id = ci.id AND r.rn <= 5
           ), '[]'::jsonb)) ORDER BY ci.id), '[]'::jsonb))
  INTO v_res
  FROM ci;

  RETURN v_res;
END;
$function$;

-- 8.7 Ligar um artigo do catálogo a um produto nosso (products.edit + suppliers.view)
--     • se já existe item_suppliers ativo (produto, fornecedor, unidade) → liga essa linha;
--       senão cria (preferencial se o produto não tiver nenhum fornecedor, como o painel);
--     • preço: p_apply_catalog_price (por omissão true) → purchase_price = base_price;
--     • product_codes: supplier_ref (source 'catalog') e, se faltar e estiver livre,
--       o código de barras do artigo.
CREATE FUNCTION public.rpc_catalog_link(
  p_supplier_id uuid,
  p_catalog_item_id uuid,
  p_product_id uuid,
  p_uom_id uuid DEFAULT NULL,
  p_apply_catalog_price boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor    uuid := public.current_business_user_id();
  l          public.supplier_account_links;
  ci         public.supplier_catalog_items;
  p          record;
  isup       public.item_suppliers;
  v_other    record;
  v_created  boolean := false;
  v_warn     jsonb := '[]'::jsonb;
  v_codes    jsonb := '[]'::jsonb;
  v_price    boolean := COALESCE(p_apply_catalog_price, true);
  v_pref     boolean;
  v_code_id  uuid;
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = l.supplier_account_id;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT id, name, sku, barcode INTO p FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted
  FOR NO KEY UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.product_id = p.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb);
    END IF;
    SELECT name, sku INTO v_other FROM public.products WHERE id = isup.product_id;
    RAISE EXCEPTION 'A referência «%» já está ligada ao produto «%» (%)', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- A referência já aponta para outro produto em product_codes?
  SELECT pr.name, pr.sku INTO v_other
  FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
    AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key AND pc.product_id <> p.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A referência «%» já está associada ao produto «%» (%) nos códigos do fornecedor', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- Linha existente (produto, fornecedor, unidade)?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE product_id = p.id AND supplier_id = p_supplier_id AND deleted_at IS NULL
    AND COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE;

  IF isup.id IS NOT NULL THEN
    IF isup.catalog_item_id IS NOT NULL THEN
      SELECT supplier_ref INTO v_other FROM public.supplier_catalog_items WHERE id = isup.catalog_item_id;
      RAISE EXCEPTION 'Este produto já está ligado a outra referência do catálogo («%»)', v_other.supplier_ref
        USING ERRCODE = 'unique_violation', HINT = 'conflict';
    END IF;
    IF isup.supplier_sku IS NOT NULL AND public.fn_product_code_key(isup.supplier_sku) IS DISTINCT FROM ci.ref_key THEN
      v_warn := v_warn || jsonb_build_array(format('Referência do fornecedor alterada de «%s» para «%s»', isup.supplier_sku, ci.supplier_ref));
    END IF;
    UPDATE public.item_suppliers SET
      catalog_item_id = ci.id,
      supplier_sku = ci.supplier_ref,
      purchase_price = CASE WHEN v_price AND ci.base_price IS NOT NULL THEN ci.base_price ELSE purchase_price END,
      currency = CASE WHEN v_price AND ci.base_price IS NOT NULL THEN ci.currency ELSE currency END,
      moq = COALESCE(moq, ci.moq),
      lead_time_days = COALESCE(lead_time_days, ci.lead_time_days),
      updated_at = now()
    WHERE id = isup.id
    RETURNING * INTO isup;
  ELSE
    v_pref := NOT EXISTS (SELECT 1 FROM public.item_suppliers WHERE product_id = p.id AND deleted_at IS NULL);
    INSERT INTO public.item_suppliers (
      organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price,
      currency, moq, lead_time_days, is_preferred, is_active, created_by, catalog_item_id
    ) VALUES (
      v_org, 'product', p.id, p_supplier_id, p_uom_id, ci.supplier_ref,
      CASE WHEN v_price THEN ci.base_price END, ci.currency, ci.moq, ci.lead_time_days,
      v_pref, true, v_actor, ci.id
    ) RETURNING * INTO isup;
    v_created := true;
  END IF;

  -- product_codes: referência do fornecedor
  IF NOT EXISTS (SELECT 1 FROM public.product_codes
                 WHERE organization_id = v_org AND supplier_id = p_supplier_id AND kind = 'supplier_ref'
                   AND deleted_at IS NULL AND code_key = ci.ref_key) THEN
    v_code_id := gen_random_uuid();
    INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
    VALUES (v_code_id, v_org, ci.supplier_ref, 'supplier_ref', p.id, p_uom_id, p_supplier_id, 'catalog',
            jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
    v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'supplier_ref', 'code', ci.supplier_ref));
  END IF;

  -- product_codes: código de barras do artigo, se faltar no produto e estiver livre
  IF ci.barcode_key IS NOT NULL
     AND public.fn_product_code_key(p.barcode) IS DISTINCT FROM ci.barcode_key
     AND NOT EXISTS (SELECT 1 FROM public.product_codes
                     WHERE organization_id = v_org AND kind = 'barcode' AND deleted_at IS NULL
                       AND code_key = ci.barcode_key AND product_id = p.id) THEN
    SELECT pr.name, pr.sku INTO v_other
    FROM public.products pr
    WHERE pr.organization_id = v_org AND pr.id <> p.id AND pr.deleted_at IS NULL AND NOT pr.is_deleted
      AND public.fn_product_code_key(pr.barcode) = ci.barcode_key
    UNION ALL
    SELECT pr.name, pr.sku
    FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
      AND pc.code_key = ci.barcode_key AND pc.product_id <> p.id
    LIMIT 1;
    IF FOUND THEN
      v_warn := v_warn || jsonb_build_array(format('O código de barras %s já está no produto «%s» (%s); não foi associado', ci.barcode, v_other.name, v_other.sku));
    ELSE
      v_code_id := gen_random_uuid();
      INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
      VALUES (v_code_id, v_org, ci.barcode, 'barcode', p.id, p_uom_id, p_supplier_id, 'catalog',
              jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
      v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'barcode', 'code', ci.barcode));
    END IF;
  END IF;

  -- Ligado deixa de estar "dispensado".
  DELETE FROM public.supplier_catalog_dismissals WHERE link_id = l.id AND catalog_item_id = ci.id;

  RETURN jsonb_build_object(
    'item_supplier_id', isup.id,
    'created', v_created,
    'already_linked', false,
    'is_preferred', isup.is_preferred,
    'codes', v_codes,
    'warnings', v_warn
  );
END;
$function$;

-- 8.8 Desligar (products.edit + suppliers.view). Funciona mesmo com o portal revogado.
--     p_remove_item_supplier = true → apaga (soft) a linha item_suppliers; senão só a desliga.
--     Os product_codes criados pela ligação (source 'catalog' desse artigo) são anulados.
CREATE FUNCTION public.rpc_catalog_unlink(
  p_supplier_id uuid,
  p_catalog_item_id uuid,
  p_remove_item_supplier boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor uuid := public.current_business_user_id();
  v_n     integer;
  v_codes integer;
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  IF COALESCE(p_remove_item_supplier, false) THEN
    UPDATE public.item_suppliers
       SET catalog_item_id = NULL, deleted_at = now(), deleted_by = v_actor, is_preferred = false, updated_at = now()
     WHERE supplier_id = p_supplier_id AND organization_id = v_org
       AND catalog_item_id = p_catalog_item_id AND deleted_at IS NULL;
  ELSE
    UPDATE public.item_suppliers
       SET catalog_item_id = NULL, updated_at = now()
     WHERE supplier_id = p_supplier_id AND organization_id = v_org
       AND catalog_item_id = p_catalog_item_id AND deleted_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Este artigo não está ligado a nenhum produto deste fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  UPDATE public.product_codes
     SET deleted_at = now(), deleted_by = v_actor, delete_reason = 'Ligação ao catálogo do fornecedor removida'
   WHERE organization_id = v_org AND supplier_id = p_supplier_id AND source = 'catalog'
     AND deleted_at IS NULL AND context ->> 'catalog_item_id' = p_catalog_item_id::text;
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  RETURN jsonb_build_object('unlinked', v_n, 'codes_removed', v_codes,
                            'item_supplier_removed', COALESCE(p_remove_item_supplier, false));
END;
$function$;

-- 8.9 Dispensar ("não vendemos isto") ou repor na fila (products.edit + suppliers.view)
CREATE FUNCTION public.rpc_catalog_dismiss(
  p_supplier_id uuid,
  p_catalog_item_ids uuid[],
  p_dismissed boolean DEFAULT true,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor uuid := public.current_business_user_id();
  l       public.supplier_account_links;
  v_n     integer;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_catalog_item_ids IS NULL OR cardinality(p_catalog_item_ids) = 0 THEN
    RAISE EXCEPTION 'Indique os artigos' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF cardinality(p_catalog_item_ids) > 5000 THEN
    RAISE EXCEPTION 'Demasiados artigos (máx. 5000)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;
  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;

  IF COALESCE(p_dismissed, true) THEN
    INSERT INTO public.supplier_catalog_dismissals (organization_id, link_id, catalog_item_id, dismissed_by, reason)
    SELECT v_org, l.id, ci.id, v_actor, v_reason
    FROM public.supplier_catalog_items ci
    WHERE ci.supplier_account_id = l.supplier_account_id AND ci.id = ANY (p_catalog_item_ids)
    ON CONFLICT (link_id, catalog_item_id) DO NOTHING;
  ELSE
    DELETE FROM public.supplier_catalog_dismissals
    WHERE link_id = l.id AND catalog_item_id = ANY (p_catalog_item_ids);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('changed', v_n);
END;
$function$;


-- ============================================================
-- 9. Privilégios das funções
-- ============================================================
-- Portal: só authenticated (a conta do fornecedor). anon nunca.
REVOKE ALL ON FUNCTION public.sp_whoami() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_my_companies() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_mark_password_changed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_catalog_list(text, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_catalog_import(jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_catalog_upsert_item(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_catalog_set_active(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_whoami() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_my_companies() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_mark_password_changed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_catalog_list(text, integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_catalog_import(jsonb, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_catalog_upsert_item(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_catalog_set_active(uuid[], boolean) TO authenticated, service_role;

-- CRM
REVOKE ALL ON FUNCTION public.rpc_supplier_portal_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_supplier_portal_revoke_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_supplier_catalog_list(uuid, text, text, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_catalog_link_suggestions(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_catalog_link(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_catalog_unlink(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_catalog_dismiss(uuid, uuid[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_revoke_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_catalog_list(uuid, text, text, integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_catalog_link_suggestions(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_catalog_link(uuid, uuid, uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_catalog_unlink(uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_catalog_dismiss(uuid, uuid[], boolean, text) TO authenticated, service_role;

-- Só servidor (edge function)
REVOKE ALL ON FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_supplier_portal_resend_prepare(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_resend_prepare(uuid, uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual, por esta ordem)
-- ============================================================
-- DROP FUNCTION public.rpc_catalog_dismiss(uuid, uuid[], boolean, text);
-- DROP FUNCTION public.rpc_catalog_unlink(uuid, uuid, boolean);
-- DROP FUNCTION public.rpc_catalog_link(uuid, uuid, uuid, uuid, boolean);
-- DROP FUNCTION public.rpc_catalog_link_suggestions(uuid, uuid[]);
-- DROP FUNCTION public.rpc_supplier_catalog_list(uuid, text, text, integer, integer, boolean);
-- DROP FUNCTION public.rpc_supplier_portal_resend_prepare(uuid, uuid, uuid, uuid);
-- DROP FUNCTION public.rpc_supplier_portal_invite_prepare(uuid, uuid, uuid, text, text, boolean);
-- DROP FUNCTION public.rpc_supplier_portal_revoke_access(uuid, uuid);
-- DROP FUNCTION public.rpc_supplier_portal_status(uuid);
-- DROP FUNCTION public.sp_catalog_set_active(uuid[], boolean);
-- DROP FUNCTION public.sp_catalog_upsert_item(jsonb);
-- DROP FUNCTION public.sp_catalog_import(jsonb, boolean, text);
-- DROP FUNCTION public.sp_catalog_list(text, integer, integer, boolean);
-- DROP FUNCTION public.sp_mark_password_changed();
-- DROP FUNCTION public.sp_my_companies();
-- DROP FUNCTION public.sp_whoami();
-- DROP FUNCTION public.fn_sp_catalog_item_json(public.supplier_catalog_items, boolean);
-- DROP FUNCTION public.fn_sp_catalog_diff(public.supplier_catalog_items, jsonb);
-- DROP FUNCTION public.fn_sp_catalog_clean(jsonb);
-- DROP FUNCTION public.fn_sp_crm_supplier_org(uuid, text);
-- DROP FUNCTION public.fn_sp_actor();
-- ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;
-- DELETE FROM public.anew_role_permissions WHERE permission_code = 'suppliers.portal_manage';
-- ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;
-- DELETE FROM public.anew_permissions WHERE code = 'suppliers.portal_manage';
-- DROP TRIGGER trg_anew_users_00_block_supplier_accounts ON public.anew_users;
-- DROP FUNCTION public.fn_anew_users_block_supplier_accounts();
-- DROP TRIGGER trg_item_suppliers_00_catalog_guard ON public.item_suppliers;
-- DROP FUNCTION public.fn_item_suppliers_catalog_guard();
-- DROP TRIGGER trg_suppliers_portal_nif_guard ON public.suppliers;
-- DROP FUNCTION public.fn_suppliers_portal_nif_guard();
-- ALTER TABLE public.item_suppliers DROP COLUMN catalog_item_id;
-- DROP TABLE public.supplier_catalog_dismissals, public.supplier_catalog_imports,
--            public.supplier_catalog_items, public.supplier_portal_user_access,
--            public.supplier_portal_users, public.supplier_account_links, public.supplier_accounts;
-- DROP FUNCTION public.fn_catalog_parse_number(text);
-- DROP FUNCTION public.fn_nif_key(text);
-- NOTIFY pgrst, 'reload schema';

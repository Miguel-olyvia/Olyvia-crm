-- ============================================================
-- 20261211130000_portal_fornecedor_f32_encomendas
-- ============================================================
-- Portal do Fornecedor, F3.2 (âmbito simples aprovado em 07/10/2026):
--   1. CRM: "Encomendar" (rpc_po_send_to_supplier) passa a encomenda de
--      pending para ordered (exige purchase_orders.approve). Se o fornecedor
--      tem ligação ativa ao portal, a encomenda fica publicada
--      (supplier_po_publications) e os utilizadores do portal com acesso a
--      essa empresa recebem um email pela fila existente (scheduled_emails →
--      process-scheduled-emails, a cada minuto; SMTP do utilizador que envia
--      ou da organização). Sem ligação: só muda o estado, como hoje.
--   2. Portal: o fornecedor vê as encomendas publicadas das empresas que lhe
--      deram acesso, abre o detalhe (só colunas seguras), descarrega o PDF,
--      marca como vista e CONFIRMA indicando (opcional) a data de entrega
--      prevista e um comentário.
--   3. CRM: estado no portal (rpc_po_supplier_status), retirar
--      (rpc_po_withdraw_from_supplier, só antes da confirmação e sem
--      receções), aceitar a data prometida para expected_delivery
--      (rpc_po_accept_promised_date) e aviso no sino quando o fornecedor
--      confirma (criador da PO + quem tem purchase_orders.approve na org).
--   4. purchase_orders.supplier_notes: notas PARA O FORNECEDOR (o PDF passa a
--      imprimi-las em vez de notes, que é texto interno VD/EC).
--   5. Guarda: com publicação ativa (não withdrawn) rpc_update_purchase_order
--      não reescreve linhas nem muda fornecedor, data da encomenda ou estado;
--      deixa gravar notes, supplier_notes e expected_delivery. Escritas
--      diretas (PostgREST) nas linhas/fornecedor/data de uma PO publicada são
--      recusadas por gatilho.
--
-- Fora do âmbito (não reabrir aqui): aceitar/recusar linha a linha, propor
-- quantidades, preços por empresa.
--
-- Erros: mensagens em PT; HINT com código estável (no_supplier_access,
-- no_permission, not_found, validation, not_published, already_confirmed,
-- has_receipts, stale_revision, order_closed, po_published).
--
-- Prerequisites: 20261211110000_portal_fornecedor_f31_contas_catalogo.sql
--                20261211100000_portal_fornecedor_f30_seguranca.sql
-- NÃO depende de 20261211120000_portal_fornecedor_f31_convite_seguro.sql.
-- ============================================================


-- ============================================================
-- 1. Colunas e tabela
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN supplier_notes text;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_notes_len_chk
  CHECK (supplier_notes IS NULL OR char_length(supplier_notes) <= 2000);
COMMENT ON COLUMN public.purchase_orders.supplier_notes IS
  'Portal do fornecedor F3.2: notas para o fornecedor (impressas no PDF e mostradas no portal). notes continua a ser texto interno.';

CREATE TABLE public.supplier_po_publications (
  purchase_order_id          uuid PRIMARY KEY REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  organization_id            uuid NOT NULL REFERENCES public.anew_organizations(id),
  link_id                    uuid NOT NULL REFERENCES public.supplier_account_links(id) ON DELETE CASCADE,
  revision                   integer NOT NULL DEFAULT 1,
  status                     text NOT NULL DEFAULT 'sent',
  sent_at                    timestamptz NOT NULL DEFAULT now(),
  sent_by                    uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  viewed_at                  timestamptz,
  viewed_by                  uuid REFERENCES public.supplier_portal_users(id) ON DELETE SET NULL,
  confirmed_at               timestamptz,
  confirmed_by               uuid REFERENCES public.supplier_portal_users(id) ON DELETE SET NULL,
  promised_date              date,
  supplier_comment           text,
  promised_date_accepted_at  timestamptz,
  promised_date_accepted_by  uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  withdrawn_at               timestamptz,
  withdrawn_by               uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  withdraw_reason            text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_po_publications_revision_chk CHECK (revision >= 1),
  CONSTRAINT supplier_po_publications_status_chk CHECK (status IN ('sent', 'viewed', 'confirmed', 'withdrawn')),
  CONSTRAINT supplier_po_publications_withdrawn_chk CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL)),
  CONSTRAINT supplier_po_publications_confirmed_chk CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL)),
  CONSTRAINT supplier_po_publications_viewed_chk CHECK (status <> 'viewed' OR viewed_at IS NOT NULL),
  CONSTRAINT supplier_po_publications_comment_chk CHECK (supplier_comment IS NULL OR char_length(supplier_comment) <= 1000),
  CONSTRAINT supplier_po_publications_reason_chk CHECK (withdraw_reason IS NULL OR char_length(withdraw_reason) <= 500)
);
CREATE INDEX idx_supplier_po_publications_link_active
  ON public.supplier_po_publications (link_id, sent_at DESC) WHERE status <> 'withdrawn';
CREATE INDEX idx_supplier_po_publications_org
  ON public.supplier_po_publications (organization_id);
COMMENT ON TABLE public.supplier_po_publications IS
  'Portal do fornecedor F3.2: encomenda a fornecedor publicada no portal (uma linha por PO; revision sobe a cada reenvio depois de retirada). O portal só lê/escreve por sp_*; o CRM lê por RLS (purchase_orders.view) e escreve por rpc_po_*.';

CREATE TRIGGER update_supplier_po_publications_updated_at
  BEFORE UPDATE ON public.supplier_po_publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_po_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_po_publications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.supplier_po_publications TO service_role;
GRANT SELECT ON public.supplier_po_publications TO authenticated;

CREATE POLICY supplier_po_publications_select_crm ON public.supplier_po_publications
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'purchase_orders.view')
  );
-- Sem políticas para o portal (só sp_*) e sem escrita direta.
-- Auditoria: linhas manuais em entity_audit_log com table_name
-- 'purchase_orders' (a tabela não tem coluna id; o gatilho genérico não a
-- conseguiria identificar).


-- ============================================================
-- 2. Auxiliares internas (não executáveis por authenticated, salvo indicado)
-- ============================================================

CREATE FUNCTION public.fn_sp_html_escape(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT replace(replace(replace(replace(replace(
           COALESCE(p_text, ''),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_html_escape(text) FROM PUBLIC, anon, authenticated;

-- 2.1 Existe publicação ativa? Usada pelo gatilho de guarda (INVOKER) e pelas
--     RPCs. EXECUTE para authenticated: o gatilho corre como o utilizador.
CREATE FUNCTION public.fn_po_has_active_publication(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_po_publications
    WHERE purchase_order_id = p_po_id AND status <> 'withdrawn'
  );
$function$;
REVOKE ALL ON FUNCTION public.fn_po_has_active_publication(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_po_has_active_publication(uuid) TO authenticated, service_role;

-- 2.2 PO publicada visível ao utilizador do portal (acesso ativo à ligação
--     da publicação; ligação ativa; fornecedor da PO = fornecedor da
--     ligação; PO não apagada nem pendente). NULL = não visível.
CREATE FUNCTION public.fn_sp_po_publication(p_po_id uuid, p_portal_user_id uuid)
RETURNS public.supplier_po_publications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.*
  FROM public.supplier_po_publications p
  JOIN public.purchase_orders po ON po.id = p.purchase_order_id
  JOIN public.supplier_account_links l ON l.id = p.link_id
  JOIN public.suppliers s ON s.id = l.supplier_id
  JOIN public.supplier_portal_user_access x ON x.link_id = l.id
  WHERE p.purchase_order_id = p_po_id
    AND p.status <> 'withdrawn'
    AND po.deleted_at IS NULL
    AND po.status <> 'pending'
    AND po.supplier_id = l.supplier_id
    AND po.organization_id = p.organization_id
    AND l.organization_id = p.organization_id
    AND l.status = 'active'
    AND s.deleted_at IS NULL
    AND x.portal_user_id = p_portal_user_id
    AND x.revoked_at IS NULL
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_po_publication(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2.2b Conjunto das POs publicadas visíveis ao utilizador do portal (lista).
--      Mesmas condições de fn_sp_po_publication.
CREATE FUNCTION public.fn_sp_orders_visible(p_portal_user_id uuid, p_org_id uuid, p_like text)
RETURNS TABLE (
  purchase_order_id uuid, organization_id uuid, org_name text, org_logo text, order_number text,
  order_date date, expected_delivery date, order_status text, pub_status text, revision integer,
  sent_at timestamptz, viewed_at timestamptz, confirmed_at timestamptz, promised_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT po.id, po.organization_id, o.name, o.logo_url, po.order_number, po.order_date, po.expected_delivery,
         po.status, p.status, p.revision, p.sent_at, p.viewed_at, p.confirmed_at, p.promised_date
  FROM public.supplier_po_publications p
  JOIN public.purchase_orders po ON po.id = p.purchase_order_id
  JOIN public.supplier_account_links l ON l.id = p.link_id
  JOIN public.suppliers s ON s.id = l.supplier_id
  JOIN public.supplier_portal_user_access x ON x.link_id = l.id
  JOIN public.anew_organizations o ON o.id = po.organization_id
  WHERE x.portal_user_id = p_portal_user_id
    AND x.revoked_at IS NULL
    AND l.status = 'active'
    AND s.deleted_at IS NULL
    AND p.status <> 'withdrawn'
    AND po.deleted_at IS NULL
    AND po.status <> 'pending'
    AND po.supplier_id = l.supplier_id
    AND po.organization_id = p.organization_id
    AND l.organization_id = p.organization_id
    AND (p_org_id IS NULL OR po.organization_id = p_org_id)
    AND (p_like IS NULL OR po.order_number ILIKE p_like OR o.name ILIKE p_like);
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_orders_visible(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 2.3 PO do CRM: existe, não apagada, org visível, permissão. Não encontrada
--     e fora do âmbito dão a mesma mensagem. Bloqueia a linha (FOR UPDATE)
--     quando p_lock.
CREATE FUNCTION public.fn_po_crm_load(p_po_id uuid, p_permission text, p_lock boolean)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_po  public.purchase_orders;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_lock THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL FOR UPDATE;
  ELSE
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL;
  END IF;
  IF v_po.id IS NULL OR NOT public.fn_deal_org_in_scope(v_po.organization_id) THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.has_anew_permission(v_uid, p_permission) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (%)', p_permission
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN v_po;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_po_crm_load(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- 2.4 Linhas da PO em JSON seguro para o portal (sem notes, quote_line_id,
--     component_index, product_id, custos/preços de venda).
CREATE FUNCTION public.fn_sp_po_lines_json(p_po_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'item_type', i.item_type,
           'description', i.description,
           'sku', i.sku,
           'supplier_sku', i.supplier_sku,
           'uom_code', lu.code,
           'base_uom_code', bu.code,
           'units_per_uom', i.units_per_uom,
           'quantity', i.quantity,
           'unit_price', i.unit_price,
           'vat_rate', i.vat_rate,
           'vat_amount', COALESCE(i.vat_amount, 0),
           'subtotal', round(i.unit_price * i.quantity, 2),
           'total', round(i.unit_price * i.quantity + COALESCE(i.vat_amount, 0), 2),
           'received_quantity', i.received_quantity,
           'selected_attributes', COALESCE(i.selected_attributes, '{}'::jsonb)
         ) ORDER BY i.created_at, i.id), '[]'::jsonb)
  FROM public.purchase_order_items i
  LEFT JOIN public.uom lu ON lu.id = i.uom_id
  LEFT JOIN public.products pr ON pr.id = i.product_id
  LEFT JOIN public.uom bu ON bu.id = pr.uom_id
  WHERE i.purchase_order_id = p_po_id;
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_po_lines_json(uuid) FROM PUBLIC, anon, authenticated;

-- 2.5 Email ao fornecedor pela fila existente (scheduled_emails). Devolve
--     quantos emails ficaram na fila. Nunca rebenta: o email é acessório.
--     user_id = auth.uid() de quem envia (resolve o SMTP do utilizador e,
--     sem ele, o da organização — process-scheduled-emails/_shared/smtp.ts).
CREATE FUNCTION public.fn_sp_po_queue_email(p_po public.purchase_orders, p_pub public.supplier_po_publications)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     text;
  v_subject text;
  v_link    text := 'https://www.olyvia-ai.com/supplier-portal/orders/' || p_po.id::text;
  v_html    text;
  v_n       integer := 0;
  v_sender  uuid := auth.uid();
BEGIN
  IF v_sender IS NULL THEN
    RETURN 0;
  END IF;
  SELECT name INTO v_org FROM public.anew_organizations WHERE id = p_po.organization_id;
  v_org := COALESCE(NULLIF(btrim(v_org), ''), 'A empresa');

  v_subject := CASE WHEN p_pub.revision > 1
                    THEN format('Encomenda %s atualizada — %s', p_po.order_number, v_org)
                    ELSE format('Nova encomenda %s — %s', p_po.order_number, v_org) END;
  v_html := format(
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222;">'
    || '<h2 style="color: #333;">%s</h2>'
    || '<p><strong>%s</strong> %s a encomenda <strong>%s</strong> no Portal do Fornecedor.</p>'
    || '<p>Entre no portal para ver o detalhe, descarregar o PDF e confirmar a encomenda com a data de entrega prevista.</p>'
    || '<p style="margin: 24px 0;"><a href="%s" style="background: #2563eb; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Ver encomenda</a></p>'
    || '<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">'
    || '<p style="color: #999; font-size: 13px;">Enviado por %s através da Olyvia. Se não esperava este email, pode ignorá-lo.</p></div>',
    CASE WHEN p_pub.revision > 1 THEN 'Encomenda atualizada' ELSE 'Nova encomenda' END,
    public.fn_sp_html_escape(v_org),
    CASE WHEN p_pub.revision > 1 THEN 'atualizou' ELSE 'enviou-lhe' END,
    public.fn_sp_html_escape(p_po.order_number),
    public.fn_sp_html_escape(v_link),
    public.fn_sp_html_escape(v_org));

  INSERT INTO public.scheduled_emails
    (entity_type, entity_id, to_email, subject, body_html, user_id, organization_id, scheduled_for, status)
  SELECT 'purchase_orders', p_po.id, u.email, v_subject, v_html, v_sender, p_po.organization_id, now(), 'pending'
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_portal_users u ON u.id = x.portal_user_id
  JOIN public.supplier_accounts a ON a.id = u.supplier_account_id
  WHERE x.link_id = p_pub.link_id
    AND x.revoked_at IS NULL
    AND u.status = 'active'
    AND a.status = 'active';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Email ao fornecedor não posto na fila: %', SQLERRM;
  RETURN 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_sp_po_queue_email(public.purchase_orders, public.supplier_po_publications) FROM PUBLIC, anon, authenticated;

-- 2.6 Sino no CRM quando o fornecedor confirma: criador da PO (se ainda vê a
--     organização) + membros diretos (não clientes) da organização com
--     purchase_orders.approve. Sem repetidos (mesmo tipo/PO/pessoa por ler).
--     Nunca rebenta.
CREATE FUNCTION public.fn_po_notify_supplier_confirmed(p_po public.purchase_orders, p_pub public.supplier_po_publications)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier text;
  v_msg      text;
  v_n        integer := 0;
BEGIN
  SELECT name INTO v_supplier FROM public.suppliers WHERE id = p_po.supplier_id;
  v_msg := format('%s confirmou a encomenda %s', COALESCE(v_supplier, 'O fornecedor'), p_po.order_number)
           || CASE WHEN p_pub.promised_date IS NOT NULL
                   THEN ' · entrega prevista ' || to_char(p_pub.promised_date, 'DD/MM/YYYY') ELSE '' END;

  INSERT INTO public.notifications
    (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
  SELECT r.auth_user_id, p_po.organization_id, 'notification', 'supplier_po_confirmed',
         'Encomenda confirmada pelo fornecedor', v_msg,
         '/purchase-orders?open=' || p_po.id::text, 'purchase_order', p_po.id, 'medium',
         jsonb_build_object('modulo', 'compras', 'purchase_order_id', p_po.id, 'revision', p_pub.revision,
                            'promised_date', p_pub.promised_date, 'supplier_comment', p_pub.supplier_comment)
  FROM (
    SELECT DISTINCT u.auth_user_id
    FROM public.anew_users u
    WHERE u.deleted_at IS NULL
      AND u.auth_user_id IS NOT NULL
      AND (
        (u.id = p_po.created_by
         AND p_po.organization_id IN (SELECT public.get_user_visible_org_ids(u.auth_user_id)))
        OR EXISTS (
          SELECT 1
          FROM public.anew_memberships m
          JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id AND rp.permission_code = 'purchase_orders.approve'
          WHERE m.user_id = u.id AND m.organization_id = p_po.organization_id
            AND m.status = 'active' AND m.role_is_client IS NOT TRUE
        )
      )
  ) r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = r.auth_user_id AND n.type = 'supplier_po_confirmed' AND n.entity_id = p_po.id
      AND n.is_read = false AND n.is_dismissed = false AND n.is_resolved = false
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso de confirmação não enviado: %', SQLERRM;
  RETURN 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_po_notify_supplier_confirmed(public.purchase_orders, public.supplier_po_publications) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 3. Gatilho de guarda para escritas diretas (PostgREST)
-- ============================================================
-- Com publicação ativa: authenticated/anon não inserem, alteram nem apagam
-- linhas da PO, nem mudam o fornecedor/data da encomenda, nem apagam a PO.
-- Dentro das RPCs SECURITY DEFINER (receções, anular resto, ...) o
-- current_user é o dono (postgres) e passa. O frontend não escreve
-- diretamente nestas tabelas (verificado em src/ a 07/10/2026).
CREATE FUNCTION public.fn_po_published_direct_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'purchase_order_items' THEN
    IF (TG_OP <> 'INSERT' AND public.fn_po_has_active_publication(OLD.purchase_order_id))
       OR (TG_OP <> 'DELETE' AND public.fn_po_has_active_publication(NEW.purchase_order_id)) THEN
      RAISE EXCEPTION 'Esta encomenda está no portal do fornecedor: as linhas não podem ser alteradas'
        USING ERRCODE = 'check_violation', HINT = 'po_published';
    END IF;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    IF TG_OP = 'DELETE' THEN
      IF public.fn_po_has_active_publication(OLD.id) THEN
        RAISE EXCEPTION 'Esta encomenda está no portal do fornecedor: retire-a do portal antes de a apagar'
          USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
    ELSIF (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.order_date IS DISTINCT FROM OLD.order_date)
          AND public.fn_po_has_active_publication(OLD.id) THEN
      RAISE EXCEPTION 'Esta encomenda está no portal do fornecedor: o fornecedor e a data da encomenda não podem ser alterados'
        USING ERRCODE = 'check_violation', HINT = 'po_published';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_po_published_direct_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_purchase_order_items_01_guard_published
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_po_published_direct_guard();
CREATE TRIGGER trg_purchase_orders_01_guard_published
  BEFORE UPDATE OF supplier_id, order_date OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_po_published_direct_guard();


-- ============================================================
-- 4. rpc_create_purchase_order / rpc_update_purchase_order
-- ============================================================
-- A partir das definições VIVAS (pg_get_functiondef, 07/10/2026). Alterações
-- marcadas com "F3.2 (20261211130000)".

-- 4.1 Criar: grava também supplier_notes (chave opcional).
CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(p_organization_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_order       public.purchase_orders;
  v_item        jsonb;
  v_diff        jsonb;
  v_new         jsonb;
  v_source_type text;
  v_source_id   uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS ─────────────────
  -- Predicate (2): the create permission (checked first — fail before any write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Predicate (1): the target org must be in the caller's visible-org scope.
  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ligação opcional a uma Encomenda Cliente (novo, 20261115200000) ───────
  v_source_type := nullif(p_order ->> 'source_type', '');
  v_source_id   := nullif(p_order ->> 'source_id', '')::uuid;
  IF v_source_type IS NOT NULL THEN
    IF v_source_type NOT IN ('contract', 'proposal') THEN
      RAISE EXCEPTION 'source_type inválido: %', v_source_type USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_id IS NULL THEN
      RAISE EXCEPTION 'source_id é obrigatório quando source_type é indicado' USING ERRCODE = 'check_violation';
    END IF;
    IF v_source_type = 'contract' AND NOT EXISTS (
      SELECT 1 FROM public.client_contracts
      WHERE id = v_source_id AND organization_id = p_organization_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── INSERT the order (identical column set to handleSubmit, order_number ''
  --    so trigger_set_po_number auto-generates it) ───────────────────────────
  INSERT INTO public.purchase_orders (
    order_number, supplier_id, order_date, expected_delivery, status,
    total_value, notes, organization_id, created_by, source_type, source_id,
    supplier_notes  -- F3.2 (20261211130000)
  )
  VALUES (
    '',
    nullif(p_order ->> 'supplier_id', '')::uuid,
    (p_order ->> 'order_date')::date,
    nullif(p_order ->> 'expected_delivery', '')::date,
    COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
    COALESCE((p_order ->> 'total_value')::numeric, 0),
    nullif(p_order ->> 'notes', ''),
    p_organization_id,
    v_actor,
    v_source_type,
    v_source_id,
    nullif(p_order ->> 'supplier_notes', '')  -- F3.2 (20261211130000)
  )
  RETURNING * INTO v_order;

  -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
      )
      VALUES (
        v_order.id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', ''),
        nullif(v_item ->> 'uom_id', '')::uuid,
        -- Snapshot da referência do fornecedor: a enviada, senão a da ligação
        -- item_suppliers deste fornecedor na mesma unidade.
        COALESCE(
          nullif(btrim(v_item ->> 'supplier_sku'), ''),
          (SELECT isup.supplier_sku
             FROM public.item_suppliers isup
            WHERE isup.product_id = nullif(v_item ->> 'product_id', '')::uuid
              AND isup.supplier_id = v_order.supplier_id
              AND isup.uom_id IS NOT DISTINCT FROM nullif(v_item ->> 'uom_id', '')::uuid
              AND isup.deleted_at IS NULL
            LIMIT 1)
        )
      );
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot of the created PO + item set ───────
  v_new := to_jsonb(v_order);
  v_diff := jsonb_build_object(
    'purchase_orders', jsonb_build_object(
      'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
      'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
      'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
      'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
      'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
      'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
      'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
      'supplier_notes',    jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_notes'),  -- F3.2
      'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id'),
      'source_type',       jsonb_build_object('old', NULL, 'new', v_new -> 'source_type'),
      'source_id',         jsonb_build_object('old', NULL, 'new', v_new -> 'source_id')
    ),
    'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
  );

  -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_order;
END;
$function$;

-- 4.2 Editar. Alterações mínimas (F3.2):
--   a) a linha da PO é bloqueada (FOR UPDATE) antes das verificações —
--      serializa com rpc_po_send_to_supplier;
--   b) supplier_notes: só muda se a chave vier no p_order (o frontend em
--      main não a envia e não a apaga);
--   c) com publicação ativa: recusa mudar fornecedor, data da encomenda ou
--      estado, e recusa linhas diferentes das gravadas (comparação como
--      multiconjunto; chaves opcionais ausentes em TODAS as linhas enviadas
--      não entram na comparação — o frontend em main não envia uom_id nem
--      supplier_sku). Linhas iguais ou p_items NULL → as linhas NÃO são
--      reescritas (os ids mantêm-se) e total_value fica como está;
--   d) sem publicação ativa: comportamento igual ao vivo (DELETE + INSERT).
CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(p_purchase_order_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid;
  v_before     public.purchase_orders;
  v_order      public.purchase_orders;
  v_item       jsonb;
  v_diff       jsonb := '{}'::jsonb;
  v_po_diff    jsonb := '{}'::jsonb;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_key        text;
  v_new_status text;
  v_editable_cols text[] := ARRAY[
    'supplier_id','order_date','expected_delivery','status','total_value','notes',
    'supplier_notes'  -- F3.2 (20261211130000)
  ];
  -- F3.2 (20261211130000)
  v_pub        public.supplier_po_publications;
  v_published  boolean := false;
  v_opt_keys   text[];
  v_drop_keys  text[];
  v_sent_sig   text[];
  v_cur_sig    text[];
  v_pub_msg    text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_update RLS ──────────────────
  -- Predicate (2): the edit permission (checked first — fail before any read/write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load the before-image (for the diff + org-scope guard) ────────────────
  -- F3.2 (20261211130000): FOR UPDATE — serializa com rpc_po_send_to_supplier.
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
    RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261114040000): impede editar (DELETE+INSERT de itens) uma
  --    encomenda com progresso de receção — apagaria received_quantity sem
  --    deixar rasto. Isto bloqueia também, de facto, status='cancelled'
  --    (a chamada inteira falha antes de qualquer escrita): não se cancela
  --    uma encomenda já parcial/totalmente recebida, o caminho correto é
  --    rpc_register_supplier_return.
  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND received_quantity > 0
  ) THEN
    RAISE EXCEPTION 'Esta encomenda já tem linhas recebidas (parcial ou totalmente) — não é possível editá-la nem cancelá-la. Para devolver mercadoria já recebida, usa rpc_register_supplier_return.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── NOVO (20261113290000): exige purchase_orders.approve ADICIONALMENTE a
  --    .edit, só quando esta chamada está mesmo a transitar o status para
  --    'ordered' (não em updates que já estavam em 'ordered' e mantêm o
  --    estado, nem em updates que mudam outros campos sem tocar no status).
  v_new_status := COALESCE(nullif(p_order ->> 'status', ''), 'pending');
  IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
    IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.approve') THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── F3.2 (20261211130000): encomenda publicada no portal do fornecedor ───
  SELECT * INTO v_pub FROM public.supplier_po_publications
  WHERE purchase_order_id = p_purchase_order_id AND status <> 'withdrawn';
  v_published := FOUND;
  IF v_published THEN
    v_pub_msg := CASE WHEN v_pub.status = 'confirmed'
      THEN 'O fornecedor já confirmou esta encomenda no portal: as linhas, o fornecedor, a data da encomenda e o estado já não podem ser alterados (pode mudar as notas e a entrega prevista; para reduzir quantidades use "Anular resto").'
      ELSE 'Esta encomenda está no portal do fornecedor: para alterar linhas, fornecedor, data da encomenda ou estado, retire-a primeiro do portal (pode mudar as notas e a entrega prevista).' END;

    IF nullif(p_order ->> 'supplier_id', '')::uuid IS DISTINCT FROM v_before.supplier_id
       OR (p_order ->> 'order_date')::date IS DISTINCT FROM v_before.order_date
       OR v_new_status IS DISTINCT FROM v_before.status THEN
      RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
    END IF;

    IF p_items IS NOT NULL THEN
      IF jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
      -- Chaves opcionais que não vêm em nenhuma linha enviada ficam de fora.
      v_opt_keys := ARRAY['sku', 'uom_id', 'supplier_sku', 'notes', 'selected_attributes', 'description', 'vat_rate'];
      SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_drop_keys
      FROM unnest(v_opt_keys) k
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e) = 'object' AND e ? k);

      SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[]) INTO v_sent_sig
      FROM (
        SELECT (jsonb_build_object(
                  'item_type', e ->> 'item_type',
                  'product_id', nullif(e ->> 'product_id', '')::uuid,
                  'service_id', nullif(e ->> 'service_id', '')::uuid,
                  'description', e ->> 'description',
                  'sku', nullif(e ->> 'sku', ''),
                  'quantity', trim_scale((e ->> 'quantity')::numeric),
                  'unit_price', trim_scale((e ->> 'unit_price')::numeric),
                  'vat_rate', trim_scale((e ->> 'vat_rate')::numeric),
                  'uom_id', nullif(e ->> 'uom_id', '')::uuid,
                  'supplier_sku', nullif(btrim(e ->> 'supplier_sku'), ''),
                  'notes', nullif(e ->> 'notes', ''),
                  'selected_attributes', COALESCE(nullif(nullif(e -> 'selected_attributes', 'null'::jsonb), '{}'::jsonb), '{}'::jsonb)
                ) - v_drop_keys)::text AS s
        FROM jsonb_array_elements(p_items) e
      ) z;

      SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[]) INTO v_cur_sig
      FROM (
        SELECT (jsonb_build_object(
                  'item_type', i.item_type,
                  'product_id', i.product_id,
                  'service_id', i.service_id,
                  'description', i.description,
                  'sku', nullif(i.sku, ''),
                  'quantity', trim_scale(i.quantity),
                  'unit_price', trim_scale(i.unit_price),
                  'vat_rate', trim_scale(i.vat_rate),
                  'uom_id', i.uom_id,
                  'supplier_sku', nullif(btrim(i.supplier_sku), ''),
                  'notes', nullif(i.notes, ''),
                  'selected_attributes', COALESCE(nullif(nullif(i.selected_attributes, 'null'::jsonb), '{}'::jsonb), '{}'::jsonb)
                ) - v_drop_keys)::text AS s
        FROM public.purchase_order_items i
        WHERE i.purchase_order_id = p_purchase_order_id
      ) z;

      IF v_sent_sig IS DISTINCT FROM v_cur_sig THEN
        RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
    END IF;
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = v_new_status,
      -- F3.2: publicada → as linhas não mudam, o total também não.
      total_value       = CASE WHEN v_published THEN total_value
                               ELSE COALESCE((p_order ->> 'total_value')::numeric, 0) END,
      notes             = nullif(p_order ->> 'notes', ''),
      -- F3.2 (20261211130000): só muda se a chave vier no pedido.
      supplier_notes    = CASE WHEN p_order ? 'supplier_notes'
                               THEN nullif(p_order ->> 'supplier_notes', '')
                               ELSE supplier_notes END
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  -- F3.2 (20261211130000): não com publicação ativa (linhas já verificadas
  -- iguais acima; os ids mantêm-se).
  IF NOT v_published THEN
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
      )
      VALUES (
        p_purchase_order_id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', ''),
        nullif(v_item ->> 'uom_id', '')::uuid,
        -- Snapshot da referência do fornecedor: a enviada, senão a da ligação
        -- item_suppliers deste fornecedor na mesma unidade.
        COALESCE(
          nullif(btrim(v_item ->> 'supplier_sku'), ''),
          (SELECT isup.supplier_sku
             FROM public.item_suppliers isup
            WHERE isup.product_id = nullif(v_item ->> 'product_id', '')::uuid
              AND isup.supplier_id = v_order.supplier_id
              AND isup.uom_id IS NOT DISTINCT FROM nullif(v_item ->> 'uom_id', '')::uuid
              AND isup.deleted_at IS NULL
            LIMIT 1)
        )
      );
    END LOOP;
  END IF;
  END IF;  -- F3.2: NOT v_published

  -- ── Build the combined diff across both tables ────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_order);
  FOREACH v_key IN ARRAY v_editable_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_po_diff := v_po_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  -- ── Emit the single consolidated UPDATE audit row only when the PO itself
  --    actually changed — same pattern as rpc_update_deal (20260730010000), which
  --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
  --    (no real change in purchase_orders) every time the user re-submits the form
  --    without editing any field. When there IS a real PO change we also attach the
  --    resulting item set so the single row reflects the full save. ───────────
  IF v_po_diff <> '{}'::jsonb THEN
    v_diff := v_diff
      || jsonb_build_object('purchase_orders', v_po_diff)
      || jsonb_build_object(
           'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_order;
END;
$function$;


-- ============================================================
-- 5. RPCs do CRM
-- ============================================================

-- 5.1 "Encomendar" (purchase_orders.approve)
--     pending → ordered. Fornecedor com ligação ativa ao portal → publica
--     (revision 1, ou revision+1 se tinha sido retirada) e põe na fila um
--     email para cada utilizador do portal com acesso ativo a esta empresa.
--     ordered sem publicação ativa e com ligação → só publica.
--     ordered com publicação ativa → nada muda (already_published).
CREATE FUNCTION public.rpc_po_send_to_supplier(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor    uuid := public.current_business_user_id();
  v_po       public.purchase_orders := public.fn_po_crm_load(p_po_id, 'purchase_orders.approve', true);
  v_old      text := v_po.status;
  v_link     public.supplier_account_links;
  v_pub      public.supplier_po_publications;
  v_prev     public.supplier_po_publications;
  v_changed  boolean := false;
  v_already  boolean := false;
  v_emails   integer := 0;
  v_warning  text;
  v_bypass   text := current_setting('app.audit_bypass', true);
  v_diff     jsonb := '{}'::jsonb;
BEGIN
  IF v_po.status NOT IN ('pending', 'ordered') THEN
    RAISE EXCEPTION 'Só se pode encomendar uma encomenda pendente (estado atual: %)', v_po.status
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_po.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o fornecedor antes de encomendar' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = v_po.id) THEN
    RAISE EXCEPTION 'A encomenda não tem linhas' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  IF v_po.status = 'pending' THEN
    UPDATE public.purchase_orders SET status = 'ordered', updated_at = now()
    WHERE id = v_po.id
    RETURNING * INTO v_po;
    v_changed := true;
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('old', v_old, 'new', 'ordered'));
  END IF;

  SELECT * INTO v_prev FROM public.supplier_po_publications WHERE purchase_order_id = v_po.id FOR UPDATE;

  IF v_prev.purchase_order_id IS NOT NULL AND v_prev.status <> 'withdrawn' THEN
    v_already := true;
    v_pub := v_prev;
  ELSE
    SELECT l.* INTO v_link
    FROM public.supplier_account_links l
    JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
    WHERE l.supplier_id = v_po.supplier_id
      AND l.organization_id = v_po.organization_id
      AND l.status = 'active'
      AND a.status = 'active'
    LIMIT 1;

    IF v_link.id IS NOT NULL THEN
      IF v_prev.purchase_order_id IS NULL THEN
        INSERT INTO public.supplier_po_publications
          (purchase_order_id, organization_id, link_id, revision, status, sent_at, sent_by)
        VALUES (v_po.id, v_po.organization_id, v_link.id, 1, 'sent', now(), v_actor)
        RETURNING * INTO v_pub;
      ELSE
        UPDATE public.supplier_po_publications
           SET link_id = v_link.id,
               organization_id = v_po.organization_id,
               revision = revision + 1,
               status = 'sent',
               sent_at = now(), sent_by = v_actor,
               viewed_at = NULL, viewed_by = NULL,
               confirmed_at = NULL, confirmed_by = NULL,
               promised_date = NULL, supplier_comment = NULL,
               promised_date_accepted_at = NULL, promised_date_accepted_by = NULL,
               withdrawn_at = NULL, withdrawn_by = NULL, withdraw_reason = NULL
         WHERE purchase_order_id = v_po.id
        RETURNING * INTO v_pub;
      END IF;

      v_diff := v_diff || jsonb_build_object('supplier_publication', jsonb_build_object(
        'old', CASE WHEN v_prev.purchase_order_id IS NULL THEN NULL
                    ELSE jsonb_build_object('status', v_prev.status, 'revision', v_prev.revision) END,
        'new', jsonb_build_object('status', v_pub.status, 'revision', v_pub.revision, 'link_id', v_pub.link_id)));

      v_emails := public.fn_sp_po_queue_email(v_po, v_pub);
      IF v_emails = 0 THEN
        v_warning := 'no_portal_users';
      ELSIF NOT EXISTS (SELECT 1 FROM public.organization_smtp_settings
                        WHERE organization_id = v_po.organization_id AND is_active)
            AND NOT EXISTS (SELECT 1 FROM public.user_smtp_settings
                            WHERE user_id IN (auth.uid(), v_actor) AND is_active) THEN
        v_warning := 'no_smtp';
      END IF;
    END IF;
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log('purchase_orders', v_po.id, v_po.organization_id, 'UPDATE', v_diff, 'web_app');
  END IF;
  PERFORM set_config('app.audit_bypass', COALESCE(v_bypass, ''), true);

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'order_status', v_po.status,
    'status_changed', v_changed,
    'published', v_pub.purchase_order_id IS NOT NULL,
    'already_published', v_already,
    'revision', v_pub.revision,
    'emails_queued', v_emails,
    'warning', v_warning
  );
END;
$function$;
COMMENT ON FUNCTION public.rpc_po_send_to_supplier(uuid) IS
  'Portal do fornecedor F3.2: "Encomendar" (purchase_orders.approve). pending→ordered; com ligação ativa ao portal publica (revision+1 após retirada) e põe na fila scheduled_emails um email por utilizador do portal com acesso a esta empresa.';

-- 5.2 Retirar do portal (purchase_orders.approve). Só antes da confirmação e
--     sem receções. ordered volta a pending (é o inverso de "Encomendar").
CREATE FUNCTION public.rpc_po_withdraw_from_supplier(p_po_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid := public.current_business_user_id();
  v_po     public.purchase_orders := public.fn_po_crm_load(p_po_id, 'purchase_orders.approve', true);
  v_pub    public.supplier_po_publications;
  v_reason text := NULLIF(btrim(regexp_replace(COALESCE(p_reason, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  v_old    text := v_po.status;
  v_bypass text := current_setting('app.audit_bypass', true);
  v_diff   jsonb;
  v_prev_status text;
BEGIN
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Motivo demasiado longo (máx. 500 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  SELECT * INTO v_pub FROM public.supplier_po_publications
  WHERE purchase_order_id = v_po.id AND status <> 'withdrawn'
  FOR UPDATE;
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Esta encomenda não está no portal do fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_published';
  END IF;
  IF v_pub.status = 'confirmed' THEN
    RAISE EXCEPTION 'O fornecedor já confirmou esta encomenda: já não pode ser retirada do portal'
      USING ERRCODE = 'check_violation', HINT = 'already_confirmed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = v_po.id AND received_quantity > 0) THEN
    RAISE EXCEPTION 'Esta encomenda já tem receções: já não pode ser retirada do portal'
      USING ERRCODE = 'check_violation', HINT = 'has_receipts';
  END IF;

  v_prev_status := v_pub.status;
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.supplier_po_publications
     SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = v_actor, withdraw_reason = v_reason
   WHERE purchase_order_id = v_po.id
  RETURNING * INTO v_pub;

  IF v_po.status = 'ordered' THEN
    UPDATE public.purchase_orders SET status = 'pending', updated_at = now()
    WHERE id = v_po.id
    RETURNING * INTO v_po;
  END IF;

  v_diff := jsonb_build_object('supplier_publication', jsonb_build_object(
              'old', jsonb_build_object('status', v_prev_status, 'revision', v_pub.revision),
              'new', jsonb_build_object('status', 'withdrawn', 'revision', v_pub.revision, 'reason', v_reason)));
  IF v_po.status IS DISTINCT FROM v_old THEN
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('old', v_old, 'new', v_po.status));
  END IF;
  PERFORM public.fn_manual_audit_log('purchase_orders', v_po.id, v_po.organization_id, 'UPDATE', v_diff, 'web_app');
  PERFORM set_config('app.audit_bypass', COALESCE(v_bypass, ''), true);

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'order_status', v_po.status,
    'withdrawn', true,
    'revision', v_pub.revision
  );
END;
$function$;

-- 5.3 Estado no portal (purchase_orders.view)
CREATE FUNCTION public.rpc_po_supplier_status(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_po       public.purchase_orders := public.fn_po_crm_load(p_po_id, 'purchase_orders.view', false);
  v_link     public.supplier_account_links;
  v_pub      public.supplier_po_publications;
  v_users    integer := 0;
  v_rcv      boolean;
  v_active   boolean;
  v_approve  boolean := public.has_anew_permission(v_uid, 'purchase_orders.approve');
  v_edit     boolean := public.has_anew_permission(v_uid, 'purchase_orders.edit');
  v_emails   jsonb;
BEGIN
  SELECT l.* INTO v_link
  FROM public.supplier_account_links l
  JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
  WHERE l.supplier_id = v_po.supplier_id AND l.organization_id = v_po.organization_id
    AND l.status = 'active' AND a.status = 'active'
  LIMIT 1;
  IF v_link.id IS NOT NULL THEN
    SELECT count(*) INTO v_users
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_portal_users u ON u.id = x.portal_user_id
    WHERE x.link_id = v_link.id AND x.revoked_at IS NULL AND u.status = 'active';
  END IF;

  SELECT * INTO v_pub FROM public.supplier_po_publications WHERE purchase_order_id = v_po.id;
  v_active := v_pub.purchase_order_id IS NOT NULL AND v_pub.status <> 'withdrawn';
  v_rcv := EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = v_po.id AND received_quantity > 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'to_email', e.to_email, 'status', e.status, 'scheduled_for', e.scheduled_for,
           'sent_at', e.sent_at, 'error_message', e.error_message) ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_emails
  FROM (
    SELECT * FROM public.scheduled_emails
    WHERE entity_type = 'purchase_orders' AND entity_id = v_po.id
      AND organization_id = v_po.organization_id
    ORDER BY created_at DESC
    LIMIT 10
  ) e;

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'order_status', v_po.status,
    'supplier_id', v_po.supplier_id,
    'expected_delivery', v_po.expected_delivery,
    'portal', jsonb_build_object('linked', v_link.id IS NOT NULL, 'link_id', v_link.id, 'active_users', v_users),
    'publication', CASE WHEN v_pub.purchase_order_id IS NULL THEN NULL ELSE jsonb_build_object(
        'status', v_pub.status,
        'revision', v_pub.revision,
        'sent_at', v_pub.sent_at,
        'sent_by', jsonb_build_object('id', v_pub.sent_by, 'name', (SELECT name FROM public.anew_users WHERE id = v_pub.sent_by)),
        'viewed_at', v_pub.viewed_at,
        'confirmed_at', v_pub.confirmed_at,
        'confirmed_by_name', (SELECT COALESCE(name, email) FROM public.supplier_portal_users WHERE id = v_pub.confirmed_by),
        'promised_date', v_pub.promised_date,
        'supplier_comment', v_pub.supplier_comment,
        'promised_date_accepted_at', v_pub.promised_date_accepted_at,
        'promised_date_accepted_by_name', (SELECT name FROM public.anew_users WHERE id = v_pub.promised_date_accepted_by),
        'withdrawn_at', v_pub.withdrawn_at,
        'withdrawn_by_name', (SELECT name FROM public.anew_users WHERE id = v_pub.withdrawn_by),
        'withdraw_reason', v_pub.withdraw_reason) END,
    'emails', v_emails,
    'can_send', v_approve AND v_po.supplier_id IS NOT NULL
                AND (v_po.status = 'pending' OR (v_po.status = 'ordered' AND NOT v_active AND v_link.id IS NOT NULL)),
    'can_withdraw', v_approve AND v_active AND v_pub.status <> 'confirmed' AND NOT v_rcv,
    'can_accept_date', v_edit AND v_active AND v_pub.status = 'confirmed' AND v_pub.promised_date IS NOT NULL
                       AND v_pub.promised_date IS DISTINCT FROM v_po.expected_delivery,
    'can_edit_lines', NOT v_active AND NOT v_rcv
  );
END;
$function$;

-- 5.4 Aceitar a data prometida pelo fornecedor (purchase_orders.edit):
--     copia promised_date para purchase_orders.expected_delivery.
CREATE FUNCTION public.rpc_po_accept_promised_date(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid := public.current_business_user_id();
  v_po     public.purchase_orders := public.fn_po_crm_load(p_po_id, 'purchase_orders.edit', true);
  v_pub    public.supplier_po_publications;
  v_old    date := v_po.expected_delivery;
  v_bypass text := current_setting('app.audit_bypass', true);
BEGIN
  SELECT * INTO v_pub FROM public.supplier_po_publications
  WHERE purchase_order_id = v_po.id AND status <> 'withdrawn'
  FOR UPDATE;
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Esta encomenda não está no portal do fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_published';
  END IF;
  IF v_pub.status <> 'confirmed' OR v_pub.promised_date IS NULL THEN
    RAISE EXCEPTION 'O fornecedor ainda não indicou uma data de entrega' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF v_old IS NOT DISTINCT FROM v_pub.promised_date THEN
    IF v_pub.promised_date_accepted_at IS NULL THEN
      UPDATE public.supplier_po_publications
         SET promised_date_accepted_at = now(), promised_date_accepted_by = v_actor
       WHERE purchase_order_id = v_po.id;
    END IF;
    RETURN jsonb_build_object('purchase_order_id', v_po.id, 'expected_delivery', v_old, 'already_accepted', true);
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);
  UPDATE public.purchase_orders SET expected_delivery = v_pub.promised_date, updated_at = now()
  WHERE id = v_po.id
  RETURNING * INTO v_po;
  UPDATE public.supplier_po_publications
     SET promised_date_accepted_at = now(), promised_date_accepted_by = v_actor
   WHERE purchase_order_id = v_po.id;
  PERFORM public.fn_manual_audit_log('purchase_orders', v_po.id, v_po.organization_id, 'UPDATE',
    jsonb_build_object('expected_delivery', jsonb_build_object('old', v_old, 'new', v_po.expected_delivery),
                       'source', 'supplier_promised_date'), 'web_app');
  PERFORM set_config('app.audit_bypass', COALESCE(v_bypass, ''), true);

  RETURN jsonb_build_object('purchase_order_id', v_po.id, 'expected_delivery', v_po.expected_delivery, 'already_accepted', false);
END;
$function$;


-- ============================================================
-- 6. RPCs do portal (sp_*)
-- ============================================================

-- 6.1 Lista das encomendas publicadas (todas as empresas com acesso, ou uma)
--     p_status: NULL/'all' | 'to_confirm' | 'confirmed' | 'open' | 'received' | 'cancelled'
CREATE FUNCTION public.sp_list_orders(
  p_org_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_status text := COALESCE(NULLIF(btrim(p_status), ''), 'all');
  v_q      text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like   text;
  v_counts jsonb;
  v_total  integer;
  v_items  jsonb;
BEGIN
  IF v_status NOT IN ('all', 'to_confirm', 'confirmed', 'open', 'received', 'cancelled') THEN
    RAISE EXCEPTION 'Filtro de estado inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  SELECT jsonb_build_object(
           'all', count(*),
           'to_confirm', count(*) FILTER (WHERE pub_status IN ('sent', 'viewed') AND order_status IN ('ordered', 'partially_received')),
           'confirmed', count(*) FILTER (WHERE pub_status = 'confirmed'),
           'open', count(*) FILTER (WHERE order_status IN ('ordered', 'partially_received')),
           'received', count(*) FILTER (WHERE order_status = 'received'),
           'cancelled', count(*) FILTER (WHERE order_status = 'cancelled'))
  INTO v_counts
  FROM public.fn_sp_orders_visible(u.id, p_org_id, v_like);

  v_total := (v_counts ->> CASE WHEN v_status = 'all' THEN 'all' ELSE v_status END)::integer;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_id', v.purchase_order_id,
           'order_number', v.order_number,
           'organization', jsonb_build_object('id', v.organization_id, 'name', v.org_name, 'logo_url', v.org_logo),
           'order_date', v.order_date,
           'expected_delivery', v.expected_delivery,
           'order_status', v.order_status,
           'publication_status', v.pub_status,
           'revision', v.revision,
           'sent_at', v.sent_at,
           'viewed_at', v.viewed_at,
           'confirmed_at', v.confirmed_at,
           'promised_date', v.promised_date,
           'lines', t.n,
           'subtotal', t.subtotal,
           'vat_total', t.vat_total,
           'total', t.subtotal + t.vat_total,
           'currency', 'EUR',
           'can_confirm', v.pub_status IN ('sent', 'viewed') AND v.order_status IN ('ordered', 'partially_received')
         ) ORDER BY v.sent_at DESC, v.purchase_order_id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT * FROM public.fn_sp_orders_visible(u.id, p_org_id, v_like) z
    WHERE v_status = 'all'
       OR (v_status = 'to_confirm' AND z.pub_status IN ('sent', 'viewed') AND z.order_status IN ('ordered', 'partially_received'))
       OR (v_status = 'confirmed' AND z.pub_status = 'confirmed')
       OR (v_status = 'open' AND z.order_status IN ('ordered', 'partially_received'))
       OR (v_status = 'received' AND z.order_status = 'received')
       OR (v_status = 'cancelled' AND z.order_status = 'cancelled')
    ORDER BY z.sent_at DESC, z.purchase_order_id
    LIMIT v_limit OFFSET v_offset
  ) v
  CROSS JOIN LATERAL (
    SELECT count(*) AS n,
           round(COALESCE(sum(i.unit_price * i.quantity), 0), 2) AS subtotal,
           round(COALESCE(sum(COALESCE(i.vat_amount, 0)), 0), 2) AS vat_total
    FROM public.purchase_order_items i
    WHERE i.purchase_order_id = v.purchase_order_id
  ) t;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset,
                            'counts', v_counts, 'items', v_items);
END;
$function$;

-- 6.2 Detalhe (só colunas seguras)
CREATE FUNCTION public.sp_get_order(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_pub    public.supplier_po_publications := public.fn_sp_po_publication(p_po_id, u.id);
  v_po     public.purchase_orders;
  v_org    public.anew_organizations;
  v_sup    record;
  v_snd    record;
  v_nif    text;
  v_addr   text;
  v_lines  jsonb;
  v_tot    record;
BEGIN
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_pub.purchase_order_id;
  SELECT * INTO v_org FROM public.anew_organizations WHERE id = v_po.organization_id;
  SELECT name, tax_id, email, phone INTO v_sup FROM public.suppliers WHERE id = v_po.supplier_id;
  SELECT name, email, phone INTO v_snd FROM public.anew_users WHERE id = v_pub.sent_by;

  SELECT fe.nif INTO v_nif
  FROM public.anew_entity_fiscal_entities efe
  JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
  WHERE efe.entity_id = v_org.entity_id AND (efe.valid_to IS NULL OR efe.valid_to > now())
  ORDER BY efe.is_primary DESC NULLS LAST, efe.created_at DESC
  LIMIT 1;

  SELECT concat_ws(', ', NULLIF(concat_ws(' ', a.street, a.number), ''), NULLIF(concat_ws(' ', a.postal_code, a.city), ''), a.country)
  INTO v_addr
  FROM public.anew_entity_addresses ea
  JOIN public.anew_addresses a ON a.id = ea.address_id
  WHERE ea.entity_id = v_org.entity_id AND (ea.valid_to IS NULL OR ea.valid_to > now())
  ORDER BY ea.is_fiscal DESC NULLS LAST, ea.is_primary DESC NULLS LAST, ea.created_at DESC
  LIMIT 1;

  v_lines := public.fn_sp_po_lines_json(v_po.id);
  SELECT round(COALESCE(sum(i.unit_price * i.quantity), 0), 2) AS subtotal,
         round(COALESCE(sum(COALESCE(i.vat_amount, 0)), 0), 2) AS vat_total
  INTO v_tot
  FROM public.purchase_order_items i WHERE i.purchase_order_id = v_po.id;

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'order_number', v_po.order_number,
    'order_date', v_po.order_date,
    'expected_delivery', v_po.expected_delivery,
    'order_status', v_po.status,
    'supplier_notes', v_po.supplier_notes,
    'currency', 'EUR',
    'publication', jsonb_build_object(
      'status', v_pub.status,
      'revision', v_pub.revision,
      'sent_at', v_pub.sent_at,
      'viewed_at', v_pub.viewed_at,
      'confirmed_at', v_pub.confirmed_at,
      'confirmed_by_name', (SELECT COALESCE(name, email) FROM public.supplier_portal_users WHERE id = v_pub.confirmed_by),
      'promised_date', v_pub.promised_date,
      'supplier_comment', v_pub.supplier_comment,
      'promised_date_accepted', v_pub.promised_date_accepted_at IS NOT NULL),
    'can_confirm', v_pub.status IN ('sent', 'viewed') AND v_po.status IN ('ordered', 'partially_received'),
    'company', jsonb_build_object(
      'organization_id', v_org.id, 'name', v_org.name, 'nif', v_nif, 'address', NULLIF(v_addr, ''),
      'phone', v_org.phone, 'logo_url', v_org.logo_url),
    'supplier', jsonb_build_object('name', v_sup.name, 'tax_id', v_sup.tax_id, 'email', v_sup.email, 'phone', v_sup.phone),
    'sent_by', CASE WHEN v_pub.sent_by IS NULL THEN NULL
                    ELSE jsonb_build_object('name', v_snd.name, 'email', v_snd.email, 'phone', v_snd.phone) END,
    'lines', v_lines,
    'totals', jsonb_build_object('subtotal', v_tot.subtotal, 'vat_total', v_tot.vat_total,
                                 'total', v_tot.subtotal + v_tot.vat_total)
  );
END;
$function$;

-- 6.3 Marcar como vista (primeira abertura)
CREATE FUNCTION public.sp_mark_order_viewed(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u      public.supplier_portal_users := public.fn_sp_actor();
  v_pub  public.supplier_po_publications := public.fn_sp_po_publication(p_po_id, u.id);
  v_at   timestamptz;
BEGIN
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF v_pub.viewed_at IS NOT NULL THEN
    RETURN jsonb_build_object('purchase_order_id', p_po_id, 'viewed_at', v_pub.viewed_at, 'first_view', false);
  END IF;
  UPDATE public.supplier_po_publications
     SET viewed_at = now(), viewed_by = u.id,
         status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END
   WHERE purchase_order_id = p_po_id AND viewed_at IS NULL AND status <> 'withdrawn'
  RETURNING viewed_at INTO v_at;
  IF v_at IS NULL THEN
    SELECT viewed_at INTO v_at FROM public.supplier_po_publications WHERE purchase_order_id = p_po_id;
    RETURN jsonb_build_object('purchase_order_id', p_po_id, 'viewed_at', v_at, 'first_view', false);
  END IF;
  RETURN jsonb_build_object('purchase_order_id', p_po_id, 'viewed_at', v_at, 'first_view', true);
END;
$function$;

-- 6.4 Confirmar (idempotente). Recusa revisão antiga, encomenda retirada
--     (= não encontrada), recebida ou cancelada.
CREATE FUNCTION public.sp_confirm_order(
  p_po_id uuid,
  p_revision integer,
  p_promised_date date DEFAULT NULL,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u         public.supplier_portal_users := public.fn_sp_actor();
  v_pub     public.supplier_po_publications;
  v_po      public.purchase_orders;
  v_comment text := NULLIF(btrim(regexp_replace(COALESCE(p_comment, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  v_today   date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_n       integer;
BEGIN
  -- Bloqueia a publicação e volta a verificar o acesso com a linha bloqueada.
  PERFORM 1 FROM public.supplier_po_publications WHERE purchase_order_id = p_po_id FOR UPDATE;
  v_pub := public.fn_sp_po_publication(p_po_id, u.id);
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;

  IF p_revision IS DISTINCT FROM v_pub.revision THEN
    RAISE EXCEPTION 'A empresa atualizou esta encomenda: recarregue a página para ver a versão nova'
      USING ERRCODE = 'check_violation', HINT = 'stale_revision';
  END IF;

  IF v_pub.status = 'confirmed' THEN
    RETURN jsonb_build_object(
      'purchase_order_id', p_po_id, 'revision', v_pub.revision, 'publication_status', v_pub.status,
      'confirmed_at', v_pub.confirmed_at, 'promised_date', v_pub.promised_date,
      'supplier_comment', v_pub.supplier_comment, 'already_confirmed', true);
  END IF;

  IF v_po.status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Esta encomenda já está fechada (%): não é possível confirmá-la', v_po.status
      USING ERRCODE = 'check_violation', HINT = 'order_closed';
  END IF;
  IF v_comment IS NOT NULL AND char_length(v_comment) > 1000 THEN
    RAISE EXCEPTION 'Comentário demasiado longo (máx. 1000 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_promised_date IS NOT NULL AND (p_promised_date < LEAST(v_po.order_date, v_today) OR p_promised_date > v_today + 730) THEN
    RAISE EXCEPTION 'Data de entrega inválida (entre a data da encomenda e daqui a 2 anos)'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  UPDATE public.supplier_po_publications
     SET status = 'confirmed', confirmed_at = now(), confirmed_by = u.id,
         viewed_at = COALESCE(viewed_at, now()), viewed_by = COALESCE(viewed_by, u.id),
         promised_date = p_promised_date, supplier_comment = v_comment
   WHERE purchase_order_id = p_po_id
  RETURNING * INTO v_pub;

  PERFORM public.fn_manual_audit_log('purchase_orders', p_po_id, v_po.organization_id, 'UPDATE',
    jsonb_build_object('supplier_publication', jsonb_build_object(
      'old', jsonb_build_object('status', 'sent'),
      'new', jsonb_build_object('status', 'confirmed', 'revision', v_pub.revision, 'promised_date', v_pub.promised_date,
                                'confirmed_by_portal_user', u.id))), 'supplier_portal');

  v_n := public.fn_po_notify_supplier_confirmed(v_po, v_pub);

  RETURN jsonb_build_object(
    'purchase_order_id', p_po_id, 'revision', v_pub.revision, 'publication_status', v_pub.status,
    'confirmed_at', v_pub.confirmed_at, 'promised_date', v_pub.promised_date,
    'supplier_comment', v_pub.supplier_comment, 'already_confirmed', false);
END;
$function$;


-- ============================================================
-- 7. Privilégios das funções
-- ============================================================
REVOKE ALL ON FUNCTION public.sp_list_orders(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_get_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_mark_order_viewed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_confirm_order(uuid, integer, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_list_orders(uuid, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_get_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_mark_order_viewed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_confirm_order(uuid, integer, date, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_po_send_to_supplier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_po_withdraw_from_supplier(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_po_supplier_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_po_accept_promised_date(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_po_send_to_supplier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_po_withdraw_from_supplier(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_po_supplier_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_po_accept_promised_date(uuid) TO authenticated, service_role;

-- rpc_create_purchase_order / rpc_update_purchase_order: CREATE OR REPLACE
-- mantém a ACL viva (postgres, authenticated, service_role).

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual, por esta ordem)
-- ============================================================
-- 1. Repor rpc_update_purchase_order e rpc_create_purchase_order a partir das
--    definições vivas guardadas antes de aplicar (pg_get_functiondef a
--    07/10/2026; cópia em C:\Users\Geral\AppData\Local\Temp\claude\f32\now\).
-- 2. DROP FUNCTION public.sp_confirm_order(uuid, integer, date, text);
--    DROP FUNCTION public.sp_mark_order_viewed(uuid);
--    DROP FUNCTION public.sp_get_order(uuid);
--    DROP FUNCTION public.sp_list_orders(uuid, text, text, integer, integer);
--    DROP FUNCTION public.rpc_po_accept_promised_date(uuid);
--    DROP FUNCTION public.rpc_po_supplier_status(uuid);
--    DROP FUNCTION public.rpc_po_withdraw_from_supplier(uuid, text);
--    DROP FUNCTION public.rpc_po_send_to_supplier(uuid);
--    DROP TRIGGER trg_purchase_orders_01_guard_published ON public.purchase_orders;
--    DROP TRIGGER trg_purchase_order_items_01_guard_published ON public.purchase_order_items;
--    DROP FUNCTION public.fn_po_published_direct_guard();
--    DROP FUNCTION public.fn_po_notify_supplier_confirmed(public.purchase_orders, public.supplier_po_publications);
--    DROP FUNCTION public.fn_sp_po_queue_email(public.purchase_orders, public.supplier_po_publications);
--    DROP FUNCTION public.fn_sp_po_lines_json(uuid);
--    DROP FUNCTION public.fn_po_crm_load(uuid, text, boolean);
--    DROP FUNCTION public.fn_sp_orders_visible(uuid, uuid, text);
--    DROP FUNCTION public.fn_sp_po_publication(uuid, uuid);
--    DROP FUNCTION public.fn_po_has_active_publication(uuid);
--    DROP FUNCTION public.fn_sp_html_escape(text);
--    DROP TABLE public.supplier_po_publications;
--    ALTER TABLE public.purchase_orders DROP COLUMN supplier_notes;
--    NOTIFY pgrst, 'reload schema';

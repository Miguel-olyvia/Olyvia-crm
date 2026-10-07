-- ============================================================
-- 20261211150000_portal_fornecedor_aprovacao_precos
-- ============================================================
-- Portal do Fornecedor, F3.4b — aprovação de preços:
--   1. Quando o fornecedor muda, no catálogo do portal, o preço (ou a moeda,
--      ou a unidade/embalagem) de um artigo que uma empresa LIGOU a um produto
--      (item_suppliers.catalog_item_id), nasce um pedido em
--      supplier_price_change_requests para essa empresa. Um por ligação
--      (item_suppliers). Cobre sp_catalog_upsert_item e sp_catalog_import (e
--      qualquer UPDATE futuro) com UM gatilho por instrução em
--      supplier_catalog_items (tabelas de transição).
--   2. Sino: um aviso por utilizador e por fornecedor (notifications_dedup),
--      atualizado a cada lote — uma importação de 500 linhas dá 1 aviso por
--      pessoa, não 500. Destinatários: membros ativos (não clientes) da
--      empresa com products.edit E products.manage_prices.
--   3. CRM: rpc_price_changes_list (por fornecedor, produto ou empresa) e
--      rpc_price_changes_decide (aceitar / recusar, um ou vários).
--   4. rpc_catalog_link com "usar o preço do catálogo" passa a atualizar
--      também o custo do produto, com a MESMA regra (CREATE OR REPLACE a
--      partir da definição viva; chaves novas no retorno). Permissão alinhada
--      com aceitar: usar o preço do catálogo (com o artigo a ter preço) exige
--      também products.manage_prices (HINT no_price_permission); ligar sem o
--      preço continua só com products.edit.
--   5. rpc_supplier_catalog_list devolve can_manage_prices (o ecrã esconde a
--      opção "usar o preço do catálogo" a quem não a pode usar).
--
-- Tipo do aviso: 'supplier_price_pending'. NÃO usar 'supplier_price_change':
-- já existe (alerta "Aumento de preço de fornecedor" do generate-notifications,
-- a partir de item_supplier_price_history, kind 'alert'). Esse alerta continua
-- a disparar depois de um preço aceite que suba acima do limiar.
--
-- Regra do custo do produto (verificada no código e na BD a 07/10/2026):
--   • "Preço de Compra (Custo)" da ficha = product_prices (price_type
--     'purchase'), custo UNITÁRIO, numeric(10,2), por produto (sem empresa).
--     Na compra em pack o ecrã mostra o preço do pack da ligação PREFERIDA
--     (item_suppliers.is_preferred, is_active) e grava unitário = pack / N.
--   • As encomendas tiram o preço de item_suppliers.purchase_price do
--     fornecedor escolhido (preço da unidade da ligação, uom_id); o
--     product_prices.purchase só como recurso. As linhas guardam unit_price,
--     por isso encomendas existentes não mudam.
--   • Ao aceitar: item_suppliers.purchase_price = novo preço (histórico pelo
--     gatilho existente trg_item_suppliers_price_history). O custo do produto
--     só muda se: produto (não serviço) não apagado; empresa do pedido =
--     empresa principal do produto (como rpc_update_product); a ligação é a
--     preferencial ativa; fn_uom_units_per(ligação.uom_id, produto) resolve;
--     moeda igual à do custo atual; unitário = round(novo / N, 2) > 0 e
--     < 100 000 000. Senão só muda a ligação e o retorno diz porquê
--     (product_cost_reason + product_cost_message).
--   • Produtos com várias linhas 'purchase' (792 em 07/10/2026, dados
--     antigos): atualizam-se TODAS as da moeda do pedido, para a ficha
--     mostrar o novo custo seja qual for a linha que lê.
--
-- Unidades: o preço do catálogo vale para a unidade/embalagem com que o
-- artigo foi ligado (convenção de rpc_catalog_link: purchase_price =
-- base_price, na unidade item_suppliers.uom_id). Se o fornecedor muda
-- unit_label ou units_per_pack, o pedido fica unit_changed = true e aceitar
-- exige p_accept_unit_change = true (confirmar que a ligação continua certa).
-- item_suppliers.purchase_price é numeric(12,2): o novo preço é
-- round(base_price, 2); 4 casas que arredondam para o preço atual não criam
-- pedido.
--
-- Pedido pendente anterior da mesma ligação → superseded (superseded_by
-- aponta para o novo). Preço que volta ao atual (ou deixa de existir) →
-- o pendente fica superseded e não nasce outro.
--
-- Fora do âmbito: o fornecedor ver no portal o estado da aprovação; preços
-- por empresa; pedidos retroativos para diferenças já existentes.
--
-- Erros: mensagens em PT; HINT com código estável (no_permission, not_found,
-- validation, too_many_rows).
--
-- Prerequisites: 20261211110000_portal_fornecedor_f31_contas_catalogo.sql
--                (supplier_catalog_items, supplier_account_links,
--                item_suppliers.catalog_item_id, fn_sp_crm_supplier_org)
-- ============================================================


-- ============================================================
-- 1. Tabela
-- ============================================================
CREATE TABLE public.supplier_price_change_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.anew_organizations(id),
  link_id                  uuid NOT NULL REFERENCES public.supplier_account_links(id) ON DELETE CASCADE,
  supplier_id              uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  catalog_item_id          uuid NOT NULL REFERENCES public.supplier_catalog_items(id) ON DELETE CASCADE,
  item_supplier_id         uuid NOT NULL REFERENCES public.item_suppliers(id) ON DELETE CASCADE,
  product_id               uuid REFERENCES public.products(id) ON DELETE SET NULL,
  uom_id                   uuid,
  old_price                numeric(12,2),
  old_currency             text,
  new_price                numeric(12,2) NOT NULL,
  currency                 text NOT NULL,
  catalog_old_price        numeric(14,4),
  catalog_new_price        numeric(14,4) NOT NULL,
  old_unit_label           text,
  unit_label               text,
  old_units_per_pack       numeric(14,4),
  units_per_pack           numeric(14,4),
  unit_changed             boolean NOT NULL DEFAULT false,
  status                   text NOT NULL DEFAULT 'pending',
  batch_id                 uuid NOT NULL,
  requested_at             timestamptz NOT NULL DEFAULT now(),
  requested_by_portal_user uuid REFERENCES public.supplier_portal_users(id) ON DELETE SET NULL,
  superseded_at            timestamptz,
  superseded_batch_id      uuid,
  superseded_by            uuid REFERENCES public.supplier_price_change_requests(id) ON DELETE SET NULL,
  decided_at               timestamptz,
  decided_by               uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  decision_note            text,
  result                   jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_price_change_requests_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  CONSTRAINT supplier_price_change_requests_decided_chk
    CHECK ((status IN ('approved', 'rejected')) = (decided_at IS NOT NULL)),
  CONSTRAINT supplier_price_change_requests_superseded_chk
    CHECK ((status = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT supplier_price_change_requests_price_chk CHECK (new_price >= 0),
  CONSTRAINT supplier_price_change_requests_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_price_change_requests_note_chk
    CHECK (decision_note IS NULL OR char_length(decision_note) <= 500)
);
CREATE UNIQUE INDEX uq_supplier_price_change_requests_pending
  ON public.supplier_price_change_requests (item_supplier_id) WHERE status = 'pending';
CREATE INDEX idx_supplier_price_change_requests_org_supplier
  ON public.supplier_price_change_requests (organization_id, supplier_id, status);
CREATE INDEX idx_supplier_price_change_requests_product
  ON public.supplier_price_change_requests (product_id, status) WHERE product_id IS NOT NULL;
CREATE INDEX idx_supplier_price_change_requests_catalog_pending
  ON public.supplier_price_change_requests (catalog_item_id) WHERE status = 'pending';
CREATE INDEX idx_supplier_price_change_requests_batch
  ON public.supplier_price_change_requests (batch_id);
CREATE INDEX idx_supplier_price_change_requests_superseded_batch
  ON public.supplier_price_change_requests (superseded_batch_id) WHERE superseded_batch_id IS NOT NULL;
COMMENT ON TABLE public.supplier_price_change_requests IS
  'Portal do fornecedor F3.4b: pedido de alteração de preço nascido de uma mudança no catálogo do fornecedor num artigo ligado (item_suppliers.catalog_item_id). Aceitar atualiza item_suppliers.purchase_price e, se a ligação é a preferencial, o custo do produto (product_prices purchase). Escrita só pelo gatilho e por rpc_price_changes_decide.';

CREATE TRIGGER update_supplier_price_change_requests_updated_at
  BEFORE UPDATE ON public.supplier_price_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_supplier_price_change_requests
  AFTER INSERT OR DELETE OR UPDATE ON public.supplier_price_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();


-- ============================================================
-- 2. RLS e privilégios da tabela (CRM só lê; escrita só por funções)
-- ============================================================
ALTER TABLE public.supplier_price_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_price_change_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.supplier_price_change_requests TO service_role;
GRANT SELECT ON public.supplier_price_change_requests TO authenticated;

CREATE POLICY supplier_price_change_requests_select_crm ON public.supplier_price_change_requests
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'suppliers.view')
    AND (public.has_anew_permission((SELECT auth.uid()), 'suppliers.view_pricing')
         OR public.has_anew_permission((SELECT auth.uid()), 'products.view_cost'))
  );


-- ============================================================
-- 3. Plano do custo do produto (interna)
-- ============================================================
-- O que aceitar este preço faz ao "Preço de Compra (Custo)" do produto.
-- Usada pela lista (pré-visualização) e pela decisão (mesma regra).
CREATE FUNCTION public.fn_price_change_cost_plan(
  p_item_supplier_id uuid,
  p_organization_id  uuid,
  p_new_price        numeric,
  p_currency         text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  isup       public.item_suppliers;
  p          record;
  v_factor   integer;
  v_unit     numeric;
  v_cur      numeric;
  v_cur_ccy  text;
  v_sale     numeric;
  v_reason   text;
  v_msg      text;
  v_pref     text;
  v_same_ccy boolean;
  v_any_rows boolean;
BEGIN
  SELECT * INTO isup FROM public.item_suppliers WHERE id = p_item_supplier_id;
  IF isup.id IS NULL OR isup.product_id IS NULL THEN
    RETURN jsonb_build_object('will_update', false, 'reason', 'not_product',
                              'message', 'Esta ligação não é de um produto: o custo não muda');
  END IF;

  SELECT pr.id, pr.organization_id, pr.deleted_at, pr.is_deleted INTO p
  FROM public.products pr WHERE pr.id = isup.product_id;

  SELECT pp.price, pp.currency::text INTO v_cur, v_cur_ccy
  FROM public.product_prices pp
  WHERE pp.product_id = isup.product_id AND pp.price_type = 'purchase'
  ORDER BY (pp.currency::text = p_currency) DESC, pp.updated_at DESC, pp.created_at DESC
  LIMIT 1;

  SELECT pp.price INTO v_sale
  FROM public.product_prices pp
  WHERE pp.product_id = isup.product_id AND pp.price_type = 'retail' AND pp.currency::text = p_currency
  ORDER BY pp.updated_at DESC, pp.created_at DESC
  LIMIT 1;

  BEGIN
    v_factor := public.fn_uom_units_per(isup.uom_id, isup.product_id);
  EXCEPTION WHEN OTHERS THEN
    v_factor := NULL;
  END;
  IF v_factor IS NOT NULL AND v_factor > 0 AND p_new_price IS NOT NULL THEN
    v_unit := round(p_new_price / v_factor, 2);
  END IF;

  v_same_ccy := EXISTS (SELECT 1 FROM public.product_prices
                        WHERE product_id = isup.product_id AND price_type = 'purchase' AND currency::text = p_currency);
  v_any_rows := EXISTS (SELECT 1 FROM public.product_prices
                        WHERE product_id = isup.product_id AND price_type = 'purchase');

  IF p.id IS NULL OR p.deleted_at IS NOT NULL OR p.is_deleted THEN
    v_reason := 'product_deleted';
    v_msg := 'O produto foi apagado: só o preço do fornecedor foi atualizado';
  ELSIF p.organization_id IS DISTINCT FROM p_organization_id THEN
    v_reason := 'other_primary_company';
    v_msg := 'O custo do produto só muda na empresa principal do produto: só o preço deste fornecedor foi atualizado';
  ELSIF NOT (isup.is_preferred AND isup.is_active AND isup.deleted_at IS NULL) THEN
    SELECT s.name INTO v_pref
    FROM public.item_suppliers i JOIN public.suppliers s ON s.id = i.supplier_id
    WHERE i.product_id = isup.product_id AND i.is_preferred AND i.deleted_at IS NULL
    LIMIT 1;
    v_reason := 'not_preferred';
    v_msg := CASE WHEN v_pref IS NULL
                  THEN 'Este fornecedor não é o preferencial do produto: só o preço deste fornecedor foi atualizado'
                  ELSE format('O custo do produto vem do fornecedor preferencial (%s): só o preço deste fornecedor foi atualizado', v_pref) END;
  ELSIF v_factor IS NULL THEN
    v_reason := 'uom_incompatible';
    v_msg := 'A unidade de compra desta ligação não é compatível com a unidade do produto: o custo do produto não mudou';
  ELSIF p_new_price IS NULL OR v_unit <= 0 THEN
    v_reason := 'zero_price';
    v_msg := 'O custo unitário daria 0: o custo do produto não mudou';
  ELSIF v_unit >= 100000000 THEN
    v_reason := 'out_of_range';
    v_msg := 'O custo unitário é demasiado alto para a ficha do produto: o custo do produto não mudou';
  ELSIF v_any_rows AND NOT v_same_ccy THEN
    v_reason := 'currency_mismatch';
    v_msg := format('O custo do produto está noutra moeda (%s): o custo do produto não mudou', v_cur_ccy);
  ELSIF NOT v_any_rows AND NOT EXISTS (SELECT 1 FROM pg_enum
                                       WHERE enumtypid = 'public.currency_code'::regtype AND enumlabel = p_currency) THEN
    v_reason := 'currency_unsupported';
    v_msg := format('A moeda %s não é suportada no custo do produto: o custo do produto não mudou', p_currency);
  END IF;

  RETURN jsonb_build_object(
    'will_update', v_reason IS NULL,
    'reason', v_reason,
    'message', v_msg,
    'is_preferred', (isup.is_preferred AND isup.is_active AND isup.deleted_at IS NULL),
    'preferred_supplier_name', v_pref,
    'units_per_purchase_uom', v_factor,
    'new_unit_cost', v_unit,
    'current_unit_cost', v_cur,
    'current_cost_currency', v_cur_ccy,
    'sale_price', v_sale,
    'margin_current_pct', CASE WHEN v_sale > 0 AND v_cur IS NOT NULL AND v_cur_ccy = p_currency
                               THEN round((v_sale - v_cur) / v_sale * 100, 2) END,
    'margin_new_pct', CASE WHEN v_sale > 0 AND v_unit IS NOT NULL
                           THEN round((v_sale - v_unit) / v_sale * 100, 2) END
  );
END;
$function$;
COMMENT ON FUNCTION public.fn_price_change_cost_plan(uuid, uuid, numeric, text) IS
  'Portal do fornecedor F3.4b: o que aceitar um preço faz ao custo do produto (product_prices purchase). will_update + reason/message; custo unitário = round(preço / fn_uom_units_per(ligação.uom_id), 2); margens sobre o preço de venda (retail).';
REVOKE ALL ON FUNCTION public.fn_price_change_cost_plan(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;

-- Aplica o plano: atualiza TODAS as linhas product_prices 'purchase' da moeda
-- (ou cria uma se o produto não tem nenhuma). Histórico pelo gatilho
-- existente product_price_change_trigger (só em UPDATE, como na ficha).
-- Quem chama já validou permissões e trancou a ligação.
CREATE FUNCTION public.fn_apply_product_cost_from_supplier(
  p_item_supplier_id uuid,
  p_organization_id  uuid,
  p_new_price        numeric,
  p_currency         text,
  p_actor            uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan    jsonb := public.fn_price_change_cost_plan(p_item_supplier_id, p_organization_id, p_new_price, p_currency);
  v_product uuid;
  v_unit    numeric;
  v_rows    integer := 0;
  v_upd     boolean := false;
BEGIN
  IF (v_plan ->> 'will_update')::boolean THEN
    SELECT product_id INTO v_product FROM public.item_suppliers WHERE id = p_item_supplier_id;
    v_unit := (v_plan ->> 'new_unit_cost')::numeric;
    UPDATE public.product_prices
       SET price = v_unit, created_by = p_actor
     WHERE product_id = v_product AND price_type = 'purchase'
       AND currency::text = p_currency AND price IS DISTINCT FROM v_unit;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF NOT EXISTS (SELECT 1 FROM public.product_prices
                   WHERE product_id = v_product AND price_type = 'purchase') THEN
      INSERT INTO public.product_prices (product_id, price_type, price, currency, vat_rate, created_by)
      VALUES (v_product, 'purchase', v_unit, p_currency::public.currency_code,
              COALESCE((SELECT pp.vat_rate FROM public.product_prices pp
                        WHERE pp.product_id = v_product AND pp.vat_rate IS NOT NULL
                        ORDER BY pp.updated_at DESC LIMIT 1), 23),
              p_actor);
      v_rows := 1;
    END IF;
    v_upd := true;
  END IF;

  RETURN jsonb_build_object(
    'product_cost_updated', v_upd,
    'product_cost_rows', v_rows,
    'product_cost_reason', v_plan ->> 'reason',
    'product_cost_message', v_plan ->> 'message',
    'new_unit_cost', CASE WHEN v_upd THEN v_unit END,
    'units_per_purchase_uom', (v_plan ->> 'units_per_purchase_uom')::integer);
END;
$function$;
COMMENT ON FUNCTION public.fn_apply_product_cost_from_supplier(uuid, uuid, numeric, text, uuid) IS
  'Portal do fornecedor F3.4b: aplica ao custo do produto (product_prices purchase) o preço de uma ligação item_suppliers, se fn_price_change_cost_plan o permitir. Usada por rpc_price_changes_decide e rpc_catalog_link.';
REVOKE ALL ON FUNCTION public.fn_apply_product_cost_from_supplier(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 4. Gatilho em supplier_catalog_items (por instrução)
-- ============================================================
CREATE FUNCTION public.fn_supplier_catalog_price_change_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sci_new n JOIN sci_old o ON o.id = n.id
    WHERE n.base_price IS DISTINCT FROM o.base_price
       OR n.currency IS DISTINCT FROM o.currency
       OR n.unit_label IS DISTINCT FROM o.unit_label
       OR n.units_per_pack IS DISTINCT FROM o.units_per_pack
  ) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(current_setting('app.audit_source', true), '') = '' THEN
    PERFORM set_config('app.audit_source', 'supplier_portal', true);
  END IF;

  -- 1. O estado novo do artigo substitui qualquer pedido pendente dele.
  UPDATE public.supplier_price_change_requests r
     SET status = 'superseded', superseded_at = now(), superseded_batch_id = v_batch
    FROM sci_new n
    JOIN sci_old o ON o.id = n.id
   WHERE r.catalog_item_id = n.id
     AND r.status = 'pending'
     AND (n.base_price IS DISTINCT FROM o.base_price
          OR n.currency IS DISTINCT FROM o.currency
          OR n.unit_label IS DISTINCT FROM o.unit_label
          OR n.units_per_pack IS DISTINCT FROM o.units_per_pack);

  -- 2. Um pedido por ligação ativa (empresa) cujo preço/unidade difere.
  INSERT INTO public.supplier_price_change_requests (
    organization_id, link_id, supplier_id, catalog_item_id, item_supplier_id, product_id, uom_id,
    old_price, old_currency, new_price, currency, catalog_old_price, catalog_new_price,
    old_unit_label, unit_label, old_units_per_pack, units_per_pack, unit_changed,
    status, batch_id, requested_by_portal_user
  )
  SELECT isup.organization_id, l.id, isup.supplier_id, n.id, isup.id, isup.product_id, isup.uom_id,
         isup.purchase_price, isup.currency, x.np, n.currency, o.base_price, n.base_price,
         x.old_unit, n.unit_label, x.old_upp, n.units_per_pack, x.unit_chg,
         'pending', v_batch, n.updated_by_portal_user
  FROM sci_new n
  JOIN sci_old o ON o.id = n.id
  JOIN public.item_suppliers isup ON isup.catalog_item_id = n.id AND isup.deleted_at IS NULL
  JOIN public.supplier_account_links l
    ON l.supplier_id = isup.supplier_id AND l.supplier_account_id = n.supplier_account_id AND l.status = 'active'
  LEFT JOIN LATERAL (
    SELECT pv.unit_changed, pv.old_unit_label, pv.old_units_per_pack
    FROM public.supplier_price_change_requests pv
    WHERE pv.item_supplier_id = isup.id AND pv.superseded_batch_id = v_batch
    ORDER BY pv.requested_at DESC, pv.id
    LIMIT 1
  ) prev ON true
  CROSS JOIN LATERAL (
    SELECT round(n.base_price, 2) AS np,
           CASE WHEN prev.unit_changed THEN prev.old_unit_label ELSE o.unit_label END AS old_unit,
           CASE WHEN prev.unit_changed THEN prev.old_units_per_pack ELSE o.units_per_pack END AS old_upp
  ) x0
  CROSS JOIN LATERAL (
    SELECT x0.np, x0.old_unit, x0.old_upp,
           (x0.old_unit IS DISTINCT FROM n.unit_label OR x0.old_upp IS DISTINCT FROM n.units_per_pack) AS unit_chg
  ) x
  WHERE n.base_price IS NOT NULL
    AND (n.base_price IS DISTINCT FROM o.base_price
         OR n.currency IS DISTINCT FROM o.currency
         OR n.unit_label IS DISTINCT FROM o.unit_label
         OR n.units_per_pack IS DISTINCT FROM o.units_per_pack)
    AND (x.unit_chg
         OR x.np IS DISTINCT FROM isup.purchase_price
         OR n.currency IS DISTINCT FROM isup.currency);

  -- 3. Encadear os substituídos ao novo pedido da mesma ligação.
  UPDATE public.supplier_price_change_requests s
     SET superseded_by = nw.id
    FROM public.supplier_price_change_requests nw
   WHERE s.superseded_batch_id = v_batch
     AND nw.batch_id = v_batch
     AND nw.item_supplier_id = s.item_supplier_id;

  -- 4. Sino: um aviso por pessoa e fornecedor (atualizado a cada lote).
  BEGIN
    INSERT INTO public.notifications
      (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
    SELECT u.auth_user_id, g.organization_id, 'notification', 'supplier_price_pending',
           'Preços do fornecedor por aprovar',
           format('%s alterou o preço de %s %s no portal. Por aprovar: %s.',
                  COALESCE(s.name, 'O fornecedor'), g.n_batch,
                  CASE WHEN g.n_batch = 1 THEN 'artigo' ELSE 'artigos' END, pc.n_pending),
           '/suppliers?open=' || g.supplier_id::text || '&tab=portal&prices=pending',
           'supplier', g.supplier_id, 'medium',
           jsonb_build_object('modulo', 'compras', 'supplier_id', g.supplier_id, 'batch_id', v_batch,
                              'batch_count', g.n_batch, 'pending_count', pc.n_pending)
    FROM (
      SELECT organization_id, supplier_id, count(*) AS n_batch
      FROM public.supplier_price_change_requests
      WHERE batch_id = v_batch
      GROUP BY organization_id, supplier_id
    ) g
    JOIN public.suppliers s ON s.id = g.supplier_id
    CROSS JOIN LATERAL (
      SELECT count(*) AS n_pending
      FROM public.supplier_price_change_requests q
      WHERE q.organization_id = g.organization_id AND q.supplier_id = g.supplier_id AND q.status = 'pending'
    ) pc
    JOIN LATERAL (
      SELECT DISTINCT au.auth_user_id
      FROM public.anew_memberships m
      JOIN public.anew_users au ON au.id = m.user_id
      WHERE m.organization_id = g.organization_id
        AND m.status = 'active' AND m.role_is_client IS NOT TRUE
        AND au.deleted_at IS NULL AND au.auth_user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = m.role_id AND rp.permission_code = 'products.manage_prices')
        AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = m.role_id AND rp.permission_code = 'products.edit')
    ) u ON true
    ON CONFLICT (type, entity_id, user_id) WHERE is_resolved = false DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      link = EXCLUDED.link,
      data = EXCLUDED.data,
      priority = EXCLUDED.priority,
      is_read = false,
      read_at = NULL,
      is_dismissed = false,
      created_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso de preços por aprovar não enviado: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;
COMMENT ON FUNCTION public.fn_supplier_catalog_price_change_requests() IS
  'Portal do fornecedor F3.4b: gatilho por instrução em supplier_catalog_items. Cria pedidos de alteração de preço (um por ligação ativa com o artigo ligado), substitui pendentes e avisa no sino (um aviso por pessoa e fornecedor).';
REVOKE ALL ON FUNCTION public.fn_supplier_catalog_price_change_requests() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_supplier_catalog_items_price_change
  AFTER UPDATE ON public.supplier_catalog_items
  REFERENCING OLD TABLE AS sci_old NEW TABLE AS sci_new
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_supplier_catalog_price_change_requests();


-- ============================================================
-- 5. RPCs do CRM
-- ============================================================

-- 5.1 Lista (suppliers.view + suppliers.view_pricing ou products.view_cost).
--     Âmbito: fornecedor, produto e/ou empresa (todos opcionais; sempre só
--     empresas visíveis). p_limit 0 = só contagens.
CREATE FUNCTION public.rpc_price_changes_list(
  p_supplier_id     uuid DEFAULT NULL,
  p_status          text DEFAULT 'pending',
  p_product_id      uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_limit           integer DEFAULT 100,
  p_offset          integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text := lower(COALESCE(NULLIF(btrim(p_status), ''), 'pending'));
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_orgs   uuid[];
  v_counts jsonb;
  v_total  integer;
  v_items  jsonb;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF v_status NOT IN ('pending', 'approved', 'rejected', 'superseded', 'decided', 'all') THEN
    RAISE EXCEPTION 'Estado inválido (pending, approved, rejected, superseded, decided, all)'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    PERFORM public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  ELSIF NOT public.has_anew_permission(v_uid, 'suppliers.view') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT (public.has_anew_permission(v_uid, 'suppliers.view_pricing')
          OR public.has_anew_permission(v_uid, 'products.view_cost')) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view_pricing)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  v_orgs := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY (v_orgs)) THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.products pr
       WHERE pr.id = p_product_id
         AND (pr.organization_id = ANY (v_orgs)
              OR EXISTS (SELECT 1 FROM public.product_organizations po
                         WHERE po.product_id = pr.id AND po.organization_id = ANY (v_orgs)))) THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  WITH sc AS (
    SELECT r.*
    FROM public.supplier_price_change_requests r
    WHERE r.organization_id = ANY (v_orgs)
      AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
      AND (p_product_id IS NULL OR r.product_id = p_product_id)
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  ),
  f AS (
    SELECT sc.* FROM sc
    WHERE v_status = 'all' OR sc.status = v_status
       OR (v_status = 'decided' AND sc.status IN ('approved', 'rejected'))
  ),
  page AS (
    SELECT f.* FROM f
    ORDER BY f.requested_at DESC, f.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT jsonb_build_object(
              'pending', count(*) FILTER (WHERE status = 'pending'),
              'approved', count(*) FILTER (WHERE status = 'approved'),
              'rejected', count(*) FILTER (WHERE status = 'rejected'),
              'superseded', count(*) FILTER (WHERE status = 'superseded'))
       FROM sc),
    (SELECT count(*) FROM f),
    (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.requested_at DESC, x.id), '[]'::jsonb)
       FROM (
         SELECT pg.requested_at, pg.id,
                jsonb_build_object(
                  'id', pg.id,
                  'status', pg.status,
                  'organization_id', pg.organization_id,
                  'requested_at', pg.requested_at,
                  'batch_id', pg.batch_id,
                  'supplier', jsonb_build_object('id', s.id, 'name', s.name),
                  'catalog_item', jsonb_build_object(
                    'id', ci.id, 'supplier_ref', ci.supplier_ref, 'name', ci.name, 'is_active', ci.is_active),
                  'item_supplier_id', pg.item_supplier_id,
                  'product', CASE WHEN pr.id IS NULL THEN NULL
                                  ELSE jsonb_build_object('id', pr.id, 'name', pr.name, 'sku', pr.sku) END,
                  'purchase_uom', jsonb_build_object('id', isup.uom_id, 'code', um.code),
                  'is_preferred', COALESCE(isup.is_preferred AND isup.is_active, false),
                  'current_price', isup.purchase_price,
                  'current_currency', isup.currency,
                  'old_price', pg.old_price,
                  'new_price', pg.new_price,
                  'currency', pg.currency,
                  'catalog_old_price', pg.catalog_old_price,
                  'catalog_new_price', pg.catalog_new_price,
                  'diff', CASE WHEN isup.purchase_price IS NOT NULL THEN pg.new_price - isup.purchase_price END,
                  'diff_pct', CASE WHEN isup.purchase_price > 0
                                   THEN round((pg.new_price - isup.purchase_price) / isup.purchase_price * 100, 2) END,
                  'unit_changed', pg.unit_changed,
                  'old_unit_label', pg.old_unit_label,
                  'unit_label', pg.unit_label,
                  'old_units_per_pack', pg.old_units_per_pack,
                  'units_per_pack', pg.units_per_pack,
                  'stale', (isup.id IS NULL OR isup.deleted_at IS NOT NULL
                            OR isup.catalog_item_id IS DISTINCT FROM pg.catalog_item_id
                            OR isup.supplier_id IS DISTINCT FROM pg.supplier_id),
                  'already_applied', (isup.purchase_price IS NOT DISTINCT FROM pg.new_price
                                      AND isup.currency IS NOT DISTINCT FROM pg.currency),
                  'product_cost', CASE WHEN pg.status = 'pending'
                                       THEN public.fn_price_change_cost_plan(pg.item_supplier_id, pg.organization_id, pg.new_price, pg.currency) END,
                  'decided_at', pg.decided_at,
                  'decided_by', CASE WHEN du.id IS NULL THEN NULL
                                     ELSE jsonb_build_object('id', du.id, 'name', du.name) END,
                  'decision_note', pg.decision_note,
                  'superseded_at', pg.superseded_at,
                  'superseded_by', pg.superseded_by,
                  'result', pg.result
                ) AS item
         FROM page pg
         JOIN public.suppliers s ON s.id = pg.supplier_id
         JOIN public.supplier_catalog_items ci ON ci.id = pg.catalog_item_id
         LEFT JOIN public.item_suppliers isup ON isup.id = pg.item_supplier_id
         LEFT JOIN public.uom um ON um.id = isup.uom_id
         LEFT JOIN public.products pr ON pr.id = pg.product_id
         LEFT JOIN public.anew_users du ON du.id = pg.decided_by
       ) x)
  INTO v_counts, v_total, v_items;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_decide', public.has_anew_permission(v_uid, 'products.edit')
                  AND public.has_anew_permission(v_uid, 'products.manage_prices')
  );
END;
$function$;
COMMENT ON FUNCTION public.rpc_price_changes_list(uuid, text, uuid, uuid, integer, integer) IS
  'Portal do fornecedor F3.4b: pedidos de alteração de preço (suppliers.view + suppliers.view_pricing ou products.view_cost). Por fornecedor, produto e/ou empresa; só empresas visíveis. product_cost = pré-visualização do efeito no custo do produto (só pendentes).';

-- 5.2 Aceitar / recusar (products.edit + products.manage_prices).
--     Pedidos fora das empresas visíveis → not_found (tudo ou nada). Por
--     pedido: approved | rejected | skipped (not_pending, stale, unit_changed).
CREATE FUNCTION public.rpc_price_changes_decide(
  p_ids                uuid[],
  p_approve            boolean,
  p_note               text DEFAULT NULL,
  p_accept_unit_change boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_actor    uuid := public.current_business_user_id();
  v_ids      uuid[];
  v_orgs     uuid[];
  v_note     text;
  v_n        integer;
  r          public.supplier_price_change_requests;
  isup       public.item_suppliers;
  v_stale    boolean;
  v_is_upd   boolean;
  v_plan     jsonb;
  v_res      jsonb;
  v_results  jsonb := '[]'::jsonb;
  v_approved integer := 0;
  v_rejected integer := 0;
  v_skipped  integer := 0;
  v_items_upd integer := 0;
  v_costs_upd integer := 0;
BEGIN
  IF v_uid IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT public.has_anew_permission(v_uid, 'products.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.manage_prices)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Indique se aceita ou recusa' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Indique os pedidos' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF cardinality(v_ids) > 1000 THEN
    RAISE EXCEPTION 'Demasiados pedidos (máx. 1000)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;
  v_note := NULLIF(btrim(regexp_replace(COALESCE(p_note, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Nota demasiado longa (máx. 500 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  v_orgs := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  SELECT count(*) INTO v_n
  FROM public.supplier_price_change_requests
  WHERE id = ANY (v_ids) AND organization_id = ANY (v_orgs);
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Pedido de alteração de preço não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  PERFORM set_config('app.audit_source', 'supplier_price_approval', true);

  FOR r IN
    SELECT * FROM public.supplier_price_change_requests
    WHERE id = ANY (v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF r.status <> 'pending' THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'not_pending', 'status', r.status,
        'message', 'Este pedido já não está por aprovar'));
      CONTINUE;
    END IF;

    SELECT * INTO isup FROM public.item_suppliers WHERE id = r.item_supplier_id FOR UPDATE;
    v_stale := isup.id IS NULL OR isup.deleted_at IS NOT NULL
               OR isup.catalog_item_id IS DISTINCT FROM r.catalog_item_id
               OR isup.supplier_id IS DISTINCT FROM r.supplier_id;

    IF NOT p_approve THEN
      UPDATE public.supplier_price_change_requests
         SET status = 'rejected', decided_at = now(), decided_by = v_actor, decision_note = v_note,
             result = jsonb_build_object('item_supplier_updated', false, 'product_cost_updated', false)
       WHERE id = r.id;
      v_rejected := v_rejected + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('id', r.id, 'outcome', 'rejected'));
      CONTINUE;
    END IF;

    IF v_stale THEN
      UPDATE public.supplier_price_change_requests
         SET status = 'superseded', superseded_at = now(),
             result = jsonb_build_object('reason', 'link_changed')
       WHERE id = r.id;
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'stale',
        'message', 'A ligação deste artigo ao produto mudou ou foi removida: o pedido foi arquivado'));
      CONTINUE;
    END IF;

    IF r.unit_changed AND NOT COALESCE(p_accept_unit_change, false) THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'unit_changed',
        'message', 'O fornecedor mudou a unidade/embalagem deste artigo: confirme que a ligação continua certa antes de aceitar'));
      CONTINUE;
    END IF;

    -- Preço do fornecedor (histórico pelo gatilho existente).
    v_is_upd := isup.purchase_price IS DISTINCT FROM r.new_price OR isup.currency IS DISTINCT FROM r.currency;
    IF v_is_upd THEN
      UPDATE public.item_suppliers
         SET purchase_price = r.new_price, currency = r.currency, updated_at = now()
       WHERE id = isup.id;
      v_items_upd := v_items_upd + 1;
    END IF;

    -- Custo do produto (mesma regra que rpc_catalog_link com preço do catálogo).
    v_plan := public.fn_apply_product_cost_from_supplier(isup.id, r.organization_id, r.new_price, r.currency, v_actor);
    IF (v_plan ->> 'product_cost_rows')::integer > 0 THEN
      v_costs_upd := v_costs_upd + 1;
    END IF;

    v_res := jsonb_build_object(
      'item_supplier_updated', v_is_upd,
      'accepted_unit_change', r.unit_changed) || v_plan;

    UPDATE public.supplier_price_change_requests
       SET status = 'approved', decided_at = now(), decided_by = v_actor, decision_note = v_note, result = v_res
     WHERE id = r.id;
    v_approved := v_approved + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object('id', r.id, 'outcome', 'approved') || v_res);
  END LOOP;

  -- Sino: sem pendentes para o fornecedor nessa empresa → aviso resolvido.
  BEGIN
    UPDATE public.notifications n
       SET is_resolved = true, resolved_at = now(), resolved_reason = 'prices_decided'
      FROM (SELECT DISTINCT organization_id, supplier_id
              FROM public.supplier_price_change_requests WHERE id = ANY (v_ids)) s
     WHERE n.type = 'supplier_price_pending'
       AND n.entity_id = s.supplier_id
       AND n.organization_id = s.organization_id
       AND n.is_resolved = false
       AND NOT EXISTS (SELECT 1 FROM public.supplier_price_change_requests q
                       WHERE q.organization_id = s.organization_id AND q.supplier_id = s.supplier_id
                         AND q.status = 'pending');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso de preços não resolvido: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'approved', v_approved,
    'rejected', v_rejected,
    'skipped', v_skipped,
    'item_suppliers_updated', v_items_upd,
    'product_costs_updated', v_costs_upd,
    'results', v_results
  );
END;
$function$;
COMMENT ON FUNCTION public.rpc_price_changes_decide(uuid[], boolean, text, boolean) IS
  'Portal do fornecedor F3.4b: aceitar (item_suppliers.purchase_price e, se for a ligação preferencial na empresa principal, product_prices purchase = preço / fator) ou recusar pedidos de alteração de preço. products.edit + products.manage_prices. Encomendas existentes não mudam.';


-- 5.3 rpc_catalog_link: "Usar o preço do catálogo como preço de compra"
--     passa a atualizar também o custo do produto, com a regra de 5.2
--     (fn_apply_product_cost_from_supplier). Base: definição VIVA
--     (pg_get_functiondef a 07/10/2026). Alterações só: variáveis
--     v_old_price/v_old_ccy/v_price_upd/v_cost; captura do preço anterior no
--     ramo UPDATE; bloco F3.4b depois de gravar a ligação; chaves novas no
--     retorno (item_supplier_price_updated, product_cost_updated,
--     product_cost_rows, product_cost_reason, product_cost_message,
--     new_unit_cost, units_per_purchase_uom; também no already_linked).
--     Permissões: products.edit como antes; com "usar o preço do catálogo"
--     (p_apply_catalog_price, por omissão true) e o artigo COM preço no
--     catálogo, exige também products.manage_prices (a mesma de aceitar um
--     pedido) — senão recusa com HINT no_price_permission, antes de mexer em
--     nada. Artigo sem preço no catálogo: o flag não muda preços, não exige.
--     Assinatura, SECURITY DEFINER e search_path inalterados;
--     CREATE OR REPLACE mantém a ACL (postgres, authenticated, service_role).
CREATE OR REPLACE FUNCTION public.rpc_catalog_link(p_supplier_id uuid, p_catalog_item_id uuid, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_apply_catalog_price boolean DEFAULT true)
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
  v_old_price numeric;
  v_old_ccy  text;
  v_price_upd boolean := false;
  v_cost     jsonb;
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

  -- F3.4b: usar o preço do catálogo muda preços (ligação e custo do produto):
  -- a mesma permissão de aceitar um pedido de alteração de preço.
  IF v_price AND ci.base_price IS NOT NULL
     AND NOT public.has_anew_permission(auth.uid(), 'products.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços: liga sem usar o preço do catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_price_permission';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.product_id = p.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb,
                                'item_supplier_price_updated', false, 'product_cost_updated', false,
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL);
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
    v_old_price := isup.purchase_price;
    v_old_ccy := isup.currency;
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
    v_price_upd := v_price AND ci.base_price IS NOT NULL
                   AND (isup.purchase_price IS DISTINCT FROM v_old_price OR isup.currency IS DISTINCT FROM v_old_ccy);
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
    v_price_upd := v_price AND ci.base_price IS NOT NULL;
  END IF;

  -- F3.4b: com o preço do catálogo, o custo do produto segue a mesma regra
  -- de aceitar um preço (ligação preferencial, empresa principal, unidade).
  IF v_price AND ci.base_price IS NOT NULL THEN
    v_cost := public.fn_apply_product_cost_from_supplier(isup.id, v_org, isup.purchase_price, isup.currency, v_actor);
  ELSE
    v_cost := jsonb_build_object(
      'product_cost_updated', false, 'product_cost_rows', 0,
      'product_cost_reason', CASE WHEN v_price THEN 'no_catalog_price' ELSE 'catalog_price_not_used' END,
      'product_cost_message', CASE WHEN v_price THEN 'O artigo não tem preço no catálogo: preços não mudaram'
                                   ELSE 'Preço do catálogo não usado: preços não mudaram' END,
      'new_unit_cost', NULL, 'units_per_purchase_uom', NULL);
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
    'warnings', v_warn,
    'item_supplier_price_updated', v_price_upd
  ) || v_cost;
END;
$function$;


-- 5.4 rpc_supplier_catalog_list: chave nova can_manage_prices
--     (products.manage_prices) nos dois retornos, para o ecrã esconder
--     "usar o preço do catálogo" a quem rpc_catalog_link recusaria. Base:
--     definição VIVA (pg_get_functiondef a 07/10/2026); nada mais muda.
--     CREATE OR REPLACE mantém a ACL (postgres, authenticated, service_role).
CREATE OR REPLACE FUNCTION public.rpc_supplier_catalog_list(p_supplier_id uuid, p_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_inactive boolean DEFAULT false)
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
                              'can_link', false, 'can_view_pricing', v_pricing,
                              'can_manage_prices', public.has_anew_permission(v_uid, 'products.manage_prices'));
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
    'can_view_pricing', v_pricing,
    'can_manage_prices', public.has_anew_permission(v_uid, 'products.manage_prices')
  );
END;
$function$;


-- ============================================================
-- 6. Privilégios das funções
-- ============================================================
REVOKE ALL ON FUNCTION public.rpc_price_changes_list(uuid, text, uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_price_changes_decide(uuid[], boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_price_changes_list(uuid, text, uuid, uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_price_changes_decide(uuid[], boolean, text, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual, por esta ordem)
-- ============================================================
--    DROP FUNCTION public.rpc_price_changes_decide(uuid[], boolean, text, boolean);
--    DROP FUNCTION public.rpc_price_changes_list(uuid, text, uuid, uuid, integer, integer);
--    Repor rpc_catalog_link a partir da definição viva guardada antes de aplicar
--    (C:\Users\Geral\AppData\Local\Temp\claude\f34b\live_rpc_catalog_link_20261007.sql)
--    — ANTES de apagar fn_apply_product_cost_from_supplier.
--    Repor rpc_supplier_catalog_list a partir da definição viva guardada
--    (C:\Users\Geral\AppData\Local\Temp\claude\f34b\live_rpc_supplier_catalog_list_20261007.sql).
--    DROP TRIGGER trg_supplier_catalog_items_price_change ON public.supplier_catalog_items;
--    DROP FUNCTION public.fn_supplier_catalog_price_change_requests();
--    DROP FUNCTION public.fn_apply_product_cost_from_supplier(uuid, uuid, numeric, text, uuid);
--    DROP FUNCTION public.fn_price_change_cost_plan(uuid, uuid, numeric, text);
--    UPDATE public.notifications SET is_resolved = true, resolved_at = now(), resolved_reason = 'feature_removed'
--     WHERE type = 'supplier_price_pending' AND is_resolved = false;
--    DROP TABLE public.supplier_price_change_requests;
--    NOTIFY pgrst, 'reload schema';
-- Os preços já aceites ficam (item_suppliers / product_prices e históricos).

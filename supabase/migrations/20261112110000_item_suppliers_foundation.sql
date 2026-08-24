-- Fornecedores múltiplos por artigo — Fase 1 (Fundação de dados)
-- 2026-11-12 | Módulos: Products, Services, Suppliers, Purchase Orders
-- Origem: C:\Olyvia\vault\plano-fornecedores-multi-stock.md, secções 2 e 3.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problema resolvido
-- -------------------
-- public.products e public.services só suportam UM fornecedor cada
-- (supplier_id FK simples). O mesmo artigo comprado a fornecedores
-- diferentes tem código de compra, preço, prazo de entrega e MOQ
-- diferentes por fornecedor — não é uma ligação N:N simples, precisa de
-- dados próprios por par (artigo, fornecedor). Esta migration introduz
-- essa fundação de dados sem tocar em frontend (Fase 2) nem em
-- stock_movements (Fase 4).
--
-- O que esta migration cria
-- --------------------------
--   1. public.item_suppliers            — par (produto|serviço, fornecedor)
--      com preço/prazo/MOQ/código de compra + soft delete.
--   2. public.item_supplier_price_history — histórico append-only de
--      preço/prazo, populado por trigger AFTER UPDATE.
--   3. Índices únicos parciais (soft-delete-aware) para:
--        a) 1 só par ativo (produto|serviço, fornecedor);
--        b) 1 só fornecedor preferencial ativo por artigo.
--   4. Trigger BEFORE INSERT/UPDATE (mensagem amigável antes do
--      UNIQUE VIOLATION do índice de preferencial — best-effort, não é a
--      garantia de integridade).
--   5. Trigger AFTER UPDATE (histórico de preço/prazo).
--   6. Trigger AFTER INSERT/UPDATE/DELETE (sincroniza products.supplier_id /
--      services.supplier_id com o fornecedor preferencial ativo).
--   7. RLS completa em ambas as tabelas, reaproveitando
--      products.view/edit e services.view/edit (nenhum código de
--      permissão novo — confirmado que ambos já existem em
--      anew_permissions).
--   8. Audit triggers via fn_generic_entity_audit() (Strategy A) em
--      item_suppliers.
--   9. RPC de soft-delete dedicado (rpc_delete_item_supplier /
--      rpc_restore_item_supplier) — nunca .delete() direto do frontend.
--  10. Backfill a partir de products/services com supplier_id IS NOT NULL.
--  11. Comentário SQL a marcar products.supplier_id / services.supplier_id
--      como DEPRECATED (mantidos como cache do preferencial atual).
--
-- Prerequisites (confirmados por leitura do schema real, supabase db query --linked):
--   20260615130000_baseline_new_database.sql          — products, services,
--                                                        suppliers, uom,
--                                                        get_user_visible_org_ids(),
--                                                        has_anew_permission(),
--                                                        is_system_admin_user(),
--                                                        current_business_user_id(),
--                                                        update_updated_at_column()
--   20260625010000_entity_audit_log.sql                — entity_audit_log,
--                                                        fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql     — app.audit_bypass GUC,
--                                                        fn_manual_audit_log()
--   20260714010000_suppliers_audit_triggers.sql        — padrão de registo do
--                                                        audit trigger (Strategy A)
--   20261108010000_suppliers_warehouses_stocks_purchase_orders_soft_delete.sql
--                                                       — padrão exato do RPC de
--                                                        soft-delete replicado abaixo
--
-- Divergências confirmadas entre o plano e o schema real (ver relatório
-- completo fora desta migration) — resumo do que foi ajustado aqui:
--   · public.products NÃO tem coluna business_unit_id (só public.services
--     tem). item_suppliers.business_unit_id mantém-se nullable sem FK
--     (não existe tabela business_units no schema — nenhuma FK a
--     denormalizar, tal como suppliers/services já fazem hoje).
--   · O plano definia UNIQUE (product_id, supplier_id) / UNIQUE
--     (service_id, supplier_id) como CONSTRAINTs de tabela simples. Isso
--     bloquearia permanentemente voltar a associar o mesmo par depois de
--     um soft-delete (deleted_at não entra na constraint). Substituído
--     por ÍNDICES ÚNICOS PARCIAIS "WHERE deleted_at IS NULL", seguindo o
--     mesmo padrão soft-delete-aware já usado no projeto
--     (idx_suppliers_active / idx_suppliers_trash em 20261108010000).
--   · created_by é NOT NULL mas a FK usa ON DELETE SET NULL — parece
--     contraditório, mas é exatamente o padrão já em produção em
--     products.created_by / services.created_by / suppliers.created_by
--     (confirmado via information_schema), não uma inconsistência nova
--     introduzida aqui.
--   · A RLS real de products/services inclui um bypass
--     is_system_admin_user((SELECT auth.uid())) OR (...) que a secção 3.4
--     do plano não escreve explicitamente. Incluído aqui para manter
--     paridade com o padrão vivo de RLS já em produção.
--   · products.organization_id / services.organization_id são nullable
--     (1 linha NULL em cada, confirmado). O backfill exclui essas linhas
--     explicitamente (organization_id NOT NULL em item_suppliers).


-- ============================================================
-- 1. public.item_suppliers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.item_suppliers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id),
    business_unit_id  uuid,
    item_type         text NOT NULL CHECK (item_type IN ('product','service')),
    product_id        uuid REFERENCES public.products(id) ON DELETE CASCADE,
    service_id        uuid REFERENCES public.services(id) ON DELETE CASCADE,
    supplier_id       uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    supplier_sku      text,
    purchase_price    numeric(12,2),
    currency          text NOT NULL DEFAULT 'EUR',
    lead_time_days    integer,
    moq               numeric(10,2),
    uom_id            uuid REFERENCES public.uom(id),
    is_preferred      boolean NOT NULL DEFAULT false,
    is_active         boolean NOT NULL DEFAULT true,
    notes             text,
    created_by        uuid NOT NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    deleted_by        uuid,
    CONSTRAINT item_suppliers_item_type_match CHECK (
        (item_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL) OR
        (item_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL)
    )
);

COMMENT ON TABLE public.item_suppliers IS
  'Fase 1 do plano fornecedores multi-stock: par (produto|serviço, fornecedor) com dados de compra próprios (preço, prazo, MOQ, código de compra). Soft delete via deleted_at/deleted_by + rpc_delete_item_supplier/rpc_restore_item_supplier — nunca .delete() direto.';

-- Índices de navegação/lookup normais.
CREATE INDEX IF NOT EXISTS idx_item_suppliers_product  ON public.item_suppliers(product_id)  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_suppliers_service  ON public.item_suppliers(service_id)  WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_suppliers_supplier ON public.item_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_item_suppliers_org      ON public.item_suppliers(organization_id);

-- Partial indexes ativos/eliminados, mesmo padrão de
-- idx_suppliers_active/idx_suppliers_trash (20261108010000).
CREATE INDEX IF NOT EXISTS idx_item_suppliers_active
  ON public.item_suppliers (organization_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_item_suppliers_trash
  ON public.item_suppliers (organization_id) WHERE (deleted_at IS NOT NULL);

-- ------------------------------------------------------------
-- Garantias atómicas (índices únicos parciais, não trigger EXISTS sem lock)
-- ------------------------------------------------------------

-- 1 só par (artigo, fornecedor) ativo — soft-delete-aware. Divergência
-- deliberada do plano (ver cabeçalho): não é um UNIQUE de tabela simples,
-- para permitir voltar a associar o mesmo par depois de um soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS item_suppliers_product_supplier_active_uniq
  ON public.item_suppliers (product_id, supplier_id)
  WHERE deleted_at IS NULL AND product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS item_suppliers_service_supplier_active_uniq
  ON public.item_suppliers (service_id, supplier_id)
  WHERE deleted_at IS NULL AND service_id IS NOT NULL;

-- 1 só fornecedor preferencial ativo por artigo — exatamente a secção 3.1
-- do plano. Atómico ao nível do B-tree, independente de timing/concorrência
-- (o padrão EXISTS-sem-lock de anew_entity_org_links, citado no plano como
-- tendo um bug de concorrência confirmado, NÃO é replicado aqui).
CREATE UNIQUE INDEX IF NOT EXISTS item_suppliers_one_preferred_per_product
  ON public.item_suppliers (product_id) WHERE is_preferred AND deleted_at IS NULL AND product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS item_suppliers_one_preferred_per_service
  ON public.item_suppliers (service_id) WHERE is_preferred AND deleted_at IS NULL AND service_id IS NOT NULL;


-- ------------------------------------------------------------
-- Trigger de manutenção de updated_at (mesma função reutilizada em todo o projeto)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_item_suppliers_updated_at ON public.item_suppliers;
CREATE TRIGGER update_item_suppliers_updated_at
  BEFORE UPDATE ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ------------------------------------------------------------
-- Trigger opcional: mensagem amigável antes do UNIQUE VIOLATION do índice
-- de preferencial (secção 3.1 do plano — "pode manter-se... mas a
-- garantia de integridade tem de vir do índice, nunca só da trigger").
-- Não é atómico por si só; é só melhor UX de erro.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_item_suppliers_check_preferred_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_preferred AND NEW.deleted_at IS NULL THEN
    IF NEW.product_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.item_suppliers
      WHERE product_id = NEW.product_id AND is_preferred AND deleted_at IS NULL AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Já existe um fornecedor preferencial para este produto. Desmarque o atual antes de definir outro.'
        USING ERRCODE = 'unique_violation';
    END IF;

    IF NEW.service_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.item_suppliers
      WHERE service_id = NEW.service_id AND is_preferred AND deleted_at IS NULL AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Já existe um fornecedor preferencial para este serviço. Desmarque o atual antes de definir outro.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_suppliers_preferred_guard ON public.item_suppliers;
CREATE TRIGGER trg_item_suppliers_preferred_guard
  BEFORE INSERT OR UPDATE ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_item_suppliers_check_preferred_conflict();


-- ============================================================
-- 2. public.item_supplier_price_history (secção 3.2 do plano)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.item_supplier_price_history (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id),
    item_supplier_id      uuid NOT NULL REFERENCES public.item_suppliers(id) ON DELETE CASCADE,
    old_price             numeric(12,2),
    new_price             numeric(12,2),
    old_lead_time_days    integer,
    new_lead_time_days    integer,
    changed_by            uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
    changed_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.item_supplier_price_history IS
  'Histórico append-only de preço/prazo por par (artigo, fornecedor). Nunca editado nem apagado pela aplicação — só inserido por trg_item_suppliers_price_history. changed_by nullable (mesmo padrão de entity_audit_log.changed_by) para nunca bloquear a escrita se a resolução do ator falhar.';

CREATE INDEX IF NOT EXISTS idx_item_supplier_price_history_item ON public.item_supplier_price_history(item_supplier_id);
CREATE INDEX IF NOT EXISTS idx_item_supplier_price_history_org  ON public.item_supplier_price_history(organization_id);

-- Trigger AFTER UPDATE ON item_suppliers: só insere quando o preço ou o
-- prazo mudam de facto (secção 3.2 do plano).
CREATE OR REPLACE FUNCTION public.fn_item_suppliers_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NEW.purchase_price IS DISTINCT FROM OLD.purchase_price
     OR NEW.lead_time_days IS DISTINCT FROM OLD.lead_time_days THEN

    v_actor := COALESCE(public.current_business_user_id(), NEW.created_by);

    INSERT INTO public.item_supplier_price_history
      (organization_id, item_supplier_id, old_price, new_price, old_lead_time_days, new_lead_time_days, changed_by)
    VALUES
      (NEW.organization_id, NEW.id, OLD.purchase_price, NEW.purchase_price, OLD.lead_time_days, NEW.lead_time_days, v_actor);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_suppliers_price_history ON public.item_suppliers;
CREATE TRIGGER trg_item_suppliers_price_history
  AFTER UPDATE ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_item_suppliers_price_history();


-- ============================================================
-- 3. Trigger de sincronização com products.supplier_id / services.supplier_id
--    (secção 3.3 do plano)
-- ============================================================
-- Mantém products.supplier_id / services.supplier_id como "fornecedor
-- preferencial atual" durante a transição (Fase 2/3 ainda dependem disto).
-- SECURITY DEFINER para poder escrever em products/services independente
-- da RLS de quem está a editar item_suppliers (que já validou
-- products.edit/services.edit antes de chegar aqui).

CREATE OR REPLACE FUNCTION public.fn_item_suppliers_sync_preferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product        uuid := COALESCE(NEW.product_id, OLD.product_id);
  v_service        uuid := COALESCE(NEW.service_id, OLD.service_id);
  v_current_pref   uuid;
BEGIN
  -- Caso 1: esta linha passa a ser (ou continua a ser) o preferencial ativo.
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.is_preferred AND NEW.deleted_at IS NULL THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.products SET supplier_id = NEW.supplier_id
      WHERE id = NEW.product_id AND supplier_id IS DISTINCT FROM NEW.supplier_id;
    ELSIF NEW.service_id IS NOT NULL THEN
      UPDATE public.services SET supplier_id = NEW.supplier_id
      WHERE id = NEW.service_id AND supplier_id IS DISTINCT FROM NEW.supplier_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Caso 2: uma linha que ERA a preferencial ativa deixou de o ser
  -- (flag desmarcada, soft-deleted, ou hard-deleted) — re-deriva a partir
  -- do que sobra, ou limpa se não sobrar nenhuma.
  IF (TG_OP = 'UPDATE' AND OLD.is_preferred AND OLD.deleted_at IS NULL
       AND (NOT NEW.is_preferred OR NEW.deleted_at IS NOT NULL))
     OR (TG_OP = 'DELETE' AND OLD.is_preferred AND OLD.deleted_at IS NULL)
  THEN
    IF v_product IS NOT NULL THEN
      SELECT supplier_id INTO v_current_pref
      FROM public.item_suppliers
      WHERE product_id = v_product AND is_preferred AND deleted_at IS NULL
      LIMIT 1;

      UPDATE public.products SET supplier_id = v_current_pref WHERE id = v_product;
    ELSIF v_service IS NOT NULL THEN
      SELECT supplier_id INTO v_current_pref
      FROM public.item_suppliers
      WHERE service_id = v_service AND is_preferred AND deleted_at IS NULL
      LIMIT 1;

      UPDATE public.services SET supplier_id = v_current_pref WHERE id = v_service;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_item_suppliers_sync_preferred ON public.item_suppliers;
CREATE TRIGGER trg_item_suppliers_sync_preferred
  AFTER INSERT OR UPDATE OR DELETE ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_item_suppliers_sync_preferred();


-- ============================================================
-- 4. RLS — public.item_suppliers (secção 3.4 do plano + padrão vivo de
--    products/services, que inclui bypass de system admin)
-- ============================================================

ALTER TABLE public.item_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_suppliers_select_policy ON public.item_suppliers;
CREATE POLICY item_suppliers_select_policy ON public.item_suppliers
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.view'))
        OR (item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.view'))
      )
    )
  );

DROP POLICY IF EXISTS item_suppliers_insert_policy ON public.item_suppliers;
CREATE POLICY item_suppliers_insert_policy ON public.item_suppliers
  FOR INSERT WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.edit'))
        OR (item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.edit'))
      )
    )
  );

DROP POLICY IF EXISTS item_suppliers_update_policy ON public.item_suppliers;
CREATE POLICY item_suppliers_update_policy ON public.item_suppliers
  FOR UPDATE USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.edit'))
        OR (item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.edit'))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.edit'))
        OR (item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.edit'))
      )
    )
  );

-- DELETE: mesma lógica com '.edit' (secção 3.4 do plano). Defesa-em-
-- profundidade — o caminho normal da aplicação é sempre
-- rpc_delete_item_supplier (soft delete), nunca um DELETE real.
DROP POLICY IF EXISTS item_suppliers_delete_policy ON public.item_suppliers;
CREATE POLICY item_suppliers_delete_policy ON public.item_suppliers
  FOR DELETE USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        (item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.edit'))
        OR (item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.edit'))
      )
    )
  );


-- ============================================================
-- 5. RLS — public.item_supplier_price_history (SELECT apenas — secção 3.2)
-- ============================================================

ALTER TABLE public.item_supplier_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_supplier_price_history_select_policy ON public.item_supplier_price_history;
CREATE POLICY item_supplier_price_history_select_policy ON public.item_supplier_price_history
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND EXISTS (
        SELECT 1 FROM public.item_suppliers isup
        WHERE isup.id = item_supplier_price_history.item_supplier_id
          AND (
            (isup.item_type = 'product' AND public.has_anew_permission((SELECT auth.uid()), 'products.view'))
            OR (isup.item_type = 'service' AND public.has_anew_permission((SELECT auth.uid()), 'services.view'))
          )
      )
    )
  );

-- INSERT permissivo org-scoped, mesmo padrão de entity_audit_log_insert
-- (20260625010000) — na prática só o trigger SECURITY DEFINER
-- fn_item_suppliers_price_history() insere aqui, mas esta policy existe
-- por paridade com o precedente já em produção.
DROP POLICY IF EXISTS item_supplier_price_history_insert_policy ON public.item_supplier_price_history;
CREATE POLICY item_supplier_price_history_insert_policy ON public.item_supplier_price_history
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

-- Append-only: nunca editado nem apagado (secção 3.2 do plano), mesmo
-- precedente RESTRICTIVE de entity_audit_log (20260625010000) /
-- stock_movements (secção 6.1 do plano, Fase 4).
DROP POLICY IF EXISTS item_supplier_price_history_no_update ON public.item_supplier_price_history;
CREATE POLICY item_supplier_price_history_no_update ON public.item_supplier_price_history
  AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS item_supplier_price_history_no_delete ON public.item_supplier_price_history;
CREATE POLICY item_supplier_price_history_no_delete ON public.item_supplier_price_history
  AS RESTRICTIVE FOR DELETE USING (false);


-- ============================================================
-- 6. Audit triggers — reutiliza fn_generic_entity_audit() (Strategy A,
--    organization_id direto), tal como 20260714010000_suppliers_audit_triggers.sql
-- ============================================================

DROP TRIGGER IF EXISTS trg_audit_item_suppliers ON public.item_suppliers;
CREATE TRIGGER trg_audit_item_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- item_supplier_price_history NÃO tem audit trigger próprio — a tabela já
-- É o histórico; auditar o histórico seria redundante (mesma lógica de
-- entity_audit_log, que também não se audita a si próprio).


-- ============================================================
-- 7. RPC de soft-delete dedicado (nunca hard delete) — replica exatamente
--    o padrão de 20261108010000_suppliers_warehouses_stocks_purchase_orders_soft_delete.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_item_supplier(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.item_suppliers;
  v_perm   text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.item_suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associação fornecedor/artigo não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_perm := CASE v_before.item_type WHEN 'product' THEN 'products.edit' ELSE 'services.edit' END;
  IF NOT public.has_anew_permission(auth.uid(), v_perm) THEN
    RAISE EXCEPTION 'Sem permissão para remover este fornecedor do artigo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Associação já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.item_suppliers
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'item_suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_item_supplier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_item_supplier(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_item_supplier(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.item_suppliers;
  v_perm   text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.item_suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associação fornecedor/artigo não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_perm := CASE v_before.item_type WHEN 'product' THEN 'products.edit' ELSE 'services.edit' END;
  IF NOT public.has_anew_permission(auth.uid(), v_perm) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar este fornecedor do artigo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Associação já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.item_suppliers
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'item_suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_item_supplier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_item_supplier(uuid) TO authenticated;


-- ============================================================
-- 8. Backfill (secção 3.3 do plano)
-- ============================================================
-- Exclui explicitamente organization_id IS NULL (1 linha em products, 1 em
-- services, confirmado via supabase db query --linked) porque
-- item_suppliers.organization_id é NOT NULL. products não tem
-- business_unit_id (divergência do plano, ver cabeçalho) — usa NULL.
-- ON CONFLICT ... WHERE ... DO NOTHING dá idempotência caso esta migration
-- seja corrida mais do que uma vez sobre a mesma base (defesa-em-
-- profundidade; não deveria ser necessário em condições normais).
--
-- NOT EXISTS acrescentado (confirmado ao vivo, supabase db query --linked):
-- esta base já tinha 141 linhas em item_suppliers seedadas manualmente antes
-- desta migration correr via CLI, várias delas já correspondendo exatamente
-- ao par (product_id/service_id, supplier_id) que o backfill ia tentar
-- recriar. O ON CONFLICT sozinho não chega para esses casos: o trigger
-- "1 só preferencial por artigo" corre em BEFORE INSERT, antes da resolução
-- do conflito, e rejeita a tentativa mesmo quando a linha seria idêntica à
-- já existente. O NOT EXISTS filtra esses pares fora do próprio SELECT, para
-- o INSERT nunca chegar a tentar recriá-los — o trigger nem chega a avaliar
-- essas linhas. Não altera a regra de negócio nem o trigger.

INSERT INTO public.item_suppliers
  (organization_id, business_unit_id, item_type, product_id, supplier_id, is_preferred, is_active, created_by)
SELECT p.organization_id, NULL::uuid, 'product', p.id, p.supplier_id, true, true, p.created_by
FROM public.products p
WHERE p.supplier_id IS NOT NULL
  AND p.is_deleted = false
  AND p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.item_suppliers isup
    WHERE isup.product_id = p.id
      AND isup.supplier_id = p.supplier_id
      AND isup.deleted_at IS NULL
  )
ON CONFLICT (product_id, supplier_id) WHERE deleted_at IS NULL AND product_id IS NOT NULL DO NOTHING;

INSERT INTO public.item_suppliers
  (organization_id, business_unit_id, item_type, service_id, supplier_id, is_preferred, is_active, created_by)
SELECT s.organization_id, s.business_unit_id, 'service', s.id, s.supplier_id, true, true, s.created_by
FROM public.services s
WHERE s.supplier_id IS NOT NULL
  AND s.is_deleted = false
  AND s.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.item_suppliers isup
    WHERE isup.service_id = s.id
      AND isup.supplier_id = s.supplier_id
      AND isup.deleted_at IS NULL
  )
ON CONFLICT (service_id, supplier_id) WHERE deleted_at IS NULL AND service_id IS NOT NULL DO NOTHING;


-- ============================================================
-- 9. Marcar products.supplier_id / services.supplier_id como DEPRECATED
--    (ver plano Fase 3) — sem os remover.
-- ============================================================

COMMENT ON COLUMN public.products.supplier_id IS
  'DEPRECATED (ver plano Fase 3, C:\Olyvia\vault\plano-fornecedores-multi-stock.md secção 3.3) — mantido como cache do fornecedor preferencial atual, sincronizado automaticamente por trg_item_suppliers_sync_preferred a partir de item_suppliers.is_preferred. Não escrever diretamente nesta coluna a partir da Fase 2; a fonte de verdade passa a ser item_suppliers.';

COMMENT ON COLUMN public.services.supplier_id IS
  'DEPRECATED (ver plano Fase 3, C:\Olyvia\vault\plano-fornecedores-multi-stock.md secção 3.3) — mantido como cache do fornecedor preferencial atual, sincronizado automaticamente por trg_item_suppliers_sync_preferred a partir de item_suppliers.is_preferred. Não escrever diretamente nesta coluna a partir da Fase 2; a fonte de verdade passa a ser item_suppliers.';


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Contagem esperada do backfill (medida em 2026-11-12 contra a base real):
--      products com supplier_id IS NOT NULL AND is_deleted=false           → 139
--      services com supplier_id IS NOT NULL AND is_deleted=false          → 2
--    (menos qualquer linha com organization_id NULL, que é excluída).
--
--   SELECT item_type, count(*) FROM public.item_suppliers GROUP BY item_type;
--
-- 2. Confirmar 1 só preferencial por artigo (deve ser sempre 0 linhas):
--
--   SELECT product_id, count(*) FROM public.item_suppliers
--   WHERE is_preferred AND deleted_at IS NULL AND product_id IS NOT NULL
--   GROUP BY product_id HAVING count(*) > 1;
--
-- 3. Confirmar sincronização: para um produto com item_suppliers preferencial,
--    products.supplier_id deve bater certo com o supplier_id da linha
--    is_preferred=true, deleted_at IS NULL:
--
--   SELECT p.id, p.supplier_id, isup.supplier_id AS preferred_supplier_id
--   FROM public.products p
--   JOIN public.item_suppliers isup ON isup.product_id = p.id AND isup.is_preferred AND isup.deleted_at IS NULL
--   WHERE p.supplier_id IS DISTINCT FROM isup.supplier_id;
--   -- Esperado: 0 linhas.
--
-- 4. rpc_delete_item_supplier / rpc_restore_item_supplier produzem exatamente
--    UM entity_audit_log (operation='UPDATE', source='web_app') por chamada,
--    mesmo teste do padrão de 20261108010000.
--
-- 5. Um utilizador sem products.edit/services.edit não consegue INSERT/UPDATE/
--    DELETE em item_suppliers (RLS) nem chamar rpc_delete_item_supplier com
--    sucesso (insufficient_privilege).

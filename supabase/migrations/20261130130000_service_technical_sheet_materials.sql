-- Ficha técnica de serviços — mão de obra + materiais associados
-- Módulos: Services, Products, Quote (Fase 1 diagnóstico)
--
-- Objetivo
-- --------
-- Permitir que cada serviço tenha uma "ficha técnica" estruturada (descrição
-- e quantidade de mão de obra + lista de materiais/produtos do catálogo
-- necessários), para a feature "Fase 1 diagnóstico"
-- (src/components/quote/QuoteDiagnosticPhase.tsx) poder ler automaticamente
-- os materiais de um serviço em vez de depender só de regras/IA.
--
-- Esta migration é aditiva: cria colunas nullable em public.services, uma
-- tabela nova (public.service_materials) e três RPCs novas. NÃO altera nem
-- substitui rpc_update_service / rpc_create_service (só leitura de
-- referência, confirmadas como fora de âmbito). Forward-only — não fazer
-- fold no baseline nem editar depois de aplicada.
--
-- Padrão seguido (ficheiro de referência lido integralmente antes de
-- escrever esta migration):
--   supabase/migrations/20261112110000_item_suppliers_foundation.sql
--   → RLS baseada em services.view/services.edit + is_system_admin_user() +
--     get_user_visible_org_ids(); soft-delete via deleted_at/deleted_by;
--     audit trigger fn_generic_entity_audit(); RPCs dedicadas para
--     soft-delete (nunca .delete() direto do frontend).
--
-- Suposições confirmadas por leitura direta do schema (não são suposições
-- por adivinhação — todas verificadas nos ficheiros indicados):
--   · public.uom existe com PK uom.id uuid (confirmado em
--     20260615130000_baseline_new_database.sql, linha ~12337). Usa-se
--     uuid REFERENCES public.uom(id) tal como pedido, sem fallback para
--     text.
--   · public.services.organization_id é NULLABLE (confirmado no baseline e
--     já documentado como tal em 20261112110000). rpc_update_service_technical_sheet
--     trata explicitamente o caso organization_id IS NULL como "fora do
--     âmbito" para utilizadores não-system-admin, para nunca deixar passar
--     um NOT IN (...) com NULL a avaliar para NULL/UNKNOWN.
--   · public.services já tem is_deleted/deleted_at/deleted_by e
--     created_by NOT NULL (sem tocar nestas colunas aqui).
--   · fn_generic_entity_audit() (20260625010000) resolve organization_id
--     "Strategy A" diretamente da linha (to_jsonb(NEW)->>'organization_id'),
--     por isso basta service_materials ter organization_id direto (tal
--     como item_suppliers) para o audit trigger funcionar sem alterações.
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text) (definida em
--     20260719010000_roles_audit_bypass_and_rpcs.sql) nunca lança exceção
--     (swallow interno) mesmo que p_organization_id seja NULL — seguro
--     chamar em qualquer caso.
--   · created_by em service_materials leva FK para public.anew_users(id)
--     ON DELETE SET NULL, nullable — mesmo padrão usado noutras tabelas
--     "created_by" recentes do projeto quando o valor não é garantidamente
--     conhecido no momento do insert (ex.: backfills). Não estava
--     explicitamente pedido no enunciado, mas mantém consistência e não
--     contradiz a lista de colunas pedida (o enunciado só definia o tipo,
--     não proibia a FK).
--   · update_updated_at_column() é a trigger function reutilizada em todo o
--     projeto para manter updated_at (confirmado em uso em
--     20261112110000, linha 165) — reaproveitada aqui em vez de criar uma
--     nova.


-- ============================================================
-- 1. Colunas novas em public.services (ficha técnica — mão de obra)
-- ============================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS technical_sheet_labor_description text,
  ADD COLUMN IF NOT EXISTS technical_sheet_labor_quantity numeric(10,2),
  ADD COLUMN IF NOT EXISTS technical_sheet_labor_uom_id uuid REFERENCES public.uom(id);

COMMENT ON COLUMN public.services.technical_sheet_labor_description IS
  'Ficha técnica do serviço: descrição da mão de obra necessária. Editável via rpc_update_service_technical_sheet — nunca diretamente via UPDATE do frontend (permissão services.edit validada na RPC).';
COMMENT ON COLUMN public.services.technical_sheet_labor_quantity IS
  'Ficha técnica do serviço: quantidade de mão de obra (na unidade de technical_sheet_labor_uom_id). Editável via rpc_update_service_technical_sheet.';
COMMENT ON COLUMN public.services.technical_sheet_labor_uom_id IS
  'Ficha técnica do serviço: unidade de medida da mão de obra (FK para public.uom). Editável via rpc_update_service_technical_sheet.';


-- ============================================================
-- 2. public.service_materials — materiais/produtos associados à ficha técnica
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_materials (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id),
    service_id        uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    product_id        uuid NOT NULL REFERENCES public.products(id),
    quantity          numeric(10,2) NOT NULL DEFAULT 1,
    uom_id            uuid REFERENCES public.uom(id),
    notes             text,
    sort_order        int,
    created_by        uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    deleted_by        uuid
);

COMMENT ON TABLE public.service_materials IS
  'Ficha técnica de serviços: lista de materiais/produtos do catálogo necessários para um serviço, para leitura automática pela Fase 1 diagnóstico (src/components/quote/QuoteDiagnosticPhase.tsx). Soft delete via deleted_at/deleted_by + rpc_delete_service_material/rpc_restore_service_material — nunca .delete() direto do frontend.';

-- Índices de navegação/lookup normais (mesmo padrão de item_suppliers).
CREATE INDEX IF NOT EXISTS idx_service_materials_service  ON public.service_materials(service_id);
CREATE INDEX IF NOT EXISTS idx_service_materials_product  ON public.service_materials(product_id);
CREATE INDEX IF NOT EXISTS idx_service_materials_org      ON public.service_materials(organization_id);

CREATE INDEX IF NOT EXISTS idx_service_materials_active
  ON public.service_materials (organization_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_service_materials_trash
  ON public.service_materials (organization_id) WHERE (deleted_at IS NOT NULL);

-- 1 só material ativo por par (serviço, produto) — soft-delete-aware, mesmo
-- padrão dos índices únicos parciais de item_suppliers (permite voltar a
-- associar o mesmo produto depois de um soft-delete).
CREATE UNIQUE INDEX IF NOT EXISTS service_materials_service_product_active_uniq
  ON public.service_materials (service_id, product_id)
  WHERE deleted_at IS NULL;


-- ------------------------------------------------------------
-- Trigger de manutenção de updated_at (mesma função reutilizada em todo o projeto)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_service_materials_updated_at ON public.service_materials;
CREATE TRIGGER update_service_materials_updated_at
  BEFORE UPDATE ON public.service_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 3. RLS — public.service_materials (mesmo padrão de item_suppliers,
--    validação feita via JOIN a services em vez de coluna item_type)
-- ============================================================

ALTER TABLE public.service_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_materials_select_policy ON public.service_materials;
CREATE POLICY service_materials_select_policy ON public.service_materials
  FOR SELECT USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'services.view')
      AND EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.id = service_materials.service_id
      )
    )
  );

DROP POLICY IF EXISTS service_materials_insert_policy ON public.service_materials;
CREATE POLICY service_materials_insert_policy ON public.service_materials
  FOR INSERT WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.id = service_materials.service_id
      )
    )
  );

DROP POLICY IF EXISTS service_materials_update_policy ON public.service_materials;
CREATE POLICY service_materials_update_policy ON public.service_materials
  FOR UPDATE USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.id = service_materials.service_id
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.id = service_materials.service_id
      )
    )
  );

-- DELETE bloqueado por completo (RESTRICTIVE) — o único caminho da aplicação
-- é rpc_delete_service_material (soft delete via SECURITY DEFINER), nunca um
-- DELETE real, nem sequer para quem tem services.edit.
DROP POLICY IF EXISTS service_materials_no_delete ON public.service_materials;
CREATE POLICY service_materials_no_delete ON public.service_materials
  AS RESTRICTIVE FOR DELETE USING (false);


-- ============================================================
-- 4. Audit trigger — reutiliza fn_generic_entity_audit() (Strategy A,
--    organization_id direto), tal como item_suppliers.
-- ============================================================

DROP TRIGGER IF EXISTS trg_audit_service_materials ON public.service_materials;
CREATE TRIGGER trg_audit_service_materials
  AFTER INSERT OR UPDATE OR DELETE ON public.service_materials
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();


-- ============================================================
-- 5. RPC — rpc_update_service_technical_sheet
-- ============================================================
-- Atualiza as 3 colunas de mão de obra em public.services. Valida
-- services.edit sobre o serviço-alvo antes de escrever. Nunca altera
-- rpc_update_service (fora de âmbito, só leitura de referência).

CREATE OR REPLACE FUNCTION public.rpc_update_service_technical_sheet(
  p_service_id        uuid,
  p_labor_description text,
  p_labor_quantity    numeric,
  p_labor_uom_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.services;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Serviço eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_system_admin_user((SELECT auth.uid())) THEN
    -- services.organization_id é nullable (confirmado no baseline) — trata-se
    -- explicitamente como "fora do âmbito" em vez de confiar num
    -- NOT IN (...) com NULL, que avaliaria para UNKNOWN e nunca bloquearia.
    IF v_before.organization_id IS NULL
       OR v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.has_anew_permission((SELECT auth.uid()), 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar a ficha técnica deste serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.services
  SET    technical_sheet_labor_description = p_labor_description,
         technical_sheet_labor_quantity    = p_labor_quantity,
         technical_sheet_labor_uom_id      = p_labor_uom_id,
         updated_at = now()
  WHERE  id = p_service_id;

  PERFORM public.fn_manual_audit_log(
    'services', p_service_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'technical_sheet_labor_description',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_description), 'new', to_jsonb(p_labor_description)),
      'technical_sheet_labor_quantity',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_quantity), 'new', to_jsonb(p_labor_quantity)),
      'technical_sheet_labor_uom_id',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_uom_id), 'new', to_jsonb(p_labor_uom_id))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_service_technical_sheet(uuid, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_service_technical_sheet(uuid, text, numeric, uuid) TO authenticated;


-- ============================================================
-- 6. RPC — rpc_delete_service_material (soft delete, nunca hard delete)
-- ============================================================
-- Replica o padrão de rpc_delete_item_supplier (20261112110000), adaptado
-- para validar permissão via JOIN a services em vez de item_type.

CREATE OR REPLACE FUNCTION public.rpc_delete_service_material(p_material_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.service_materials;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_materials WHERE id = p_material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material da ficha técnica não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_system_admin_user((SELECT auth.uid())) THEN
    IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.has_anew_permission((SELECT auth.uid()), 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para remover este material da ficha técnica' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Material já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.service_materials
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_material_id;

  PERFORM public.fn_manual_audit_log(
    'service_materials', p_material_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_service_material(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_service_material(uuid) TO authenticated;


-- ============================================================
-- 7. RPC — rpc_restore_service_material (reverte o soft delete)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_service_material(p_material_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.service_materials;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_materials WHERE id = p_material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material da ficha técnica não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_system_admin_user((SELECT auth.uid())) THEN
    IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.has_anew_permission((SELECT auth.uid()), 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar este material da ficha técnica' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Material já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.service_materials
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_material_id;

  PERFORM public.fn_manual_audit_log(
    'service_materials', p_material_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_service_material(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_service_material(uuid) TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- 1. Colunas novas em services, todas nullable, sem afetar linhas existentes:
--
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'services'
--     AND column_name LIKE 'technical_sheet_%';
--
-- 2. RLS de service_materials espelha services.view/services.edit — um
--    utilizador sem services.edit não consegue INSERT/UPDATE, e ninguém
--    (nem services.edit) consegue DELETE direto:
--
--   -- como utilizador sem services.edit:
--   INSERT INTO service_materials (...) VALUES (...); -- deve falhar (RLS)
--   DELETE FROM service_materials WHERE id = '...';    -- deve falhar sempre (RESTRICTIVE)
--
-- 3. rpc_delete_service_material / rpc_restore_service_material produzem
--    exatamente UM entity_audit_log (operation='UPDATE', source='web_app')
--    por chamada, mesmo padrão de rpc_delete_item_supplier.
--
-- 4. rpc_update_service_technical_sheet não escreve nada se o serviço
--    pertencer a uma organização fora do âmbito do utilizador, mesmo que o
--    utilizador tenha services.edit noutra organização.

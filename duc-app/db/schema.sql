-- ============================================================================
-- DUC — Documento Único de Cliente · esquema da app separada
-- ----------------------------------------------------------------------------
-- Aplica-se à MESMA base de dados Supabase da Olyvia, mas é ADITIVO:
--   * cria apenas tabelas NOVAS (anew_client_ducs, anew_client_duc_items);
--   * NÃO altera nenhuma tabela, política ou permissão existente da Olyvia;
--   * NÃO insere nada em anew_permissions / anew_role_permissions;
--   * a RLS reutiliza apenas funções READ-ONLY que já existem no projeto
--     (get_user_visible_org_ids, current_business_user_id, is_system_admin,
--      has_active_support_access).
--
-- Modelo de acesso (mesmo user do sistema) — VISIBILIDADE POR ÁREA/ORGANIZAÇÃO:
--   O DUC é colaborativo (cada departamento preenche a sua etapa), por isso a
--   fronteira de segurança é a ORGANIZAÇÃO, não o criador:
--     - SELECT/UPDATE: qualquer utilizador com acesso à org do DUC
--       (organization_id ∈ get_user_visible_org_ids(auth.uid())).
--     - INSERT/DELETE: além do org scope, ficam restritos ao criador
--       (created_by = current_business_user_id()).
--   → "quem tem acesso à área vê/edita todos os DUCs dela".
--
-- Como aplicar (uma vez), com o mesmo projeto Supabase:
--   psql "$DATABASE_URL" -f duc-app/db/schema.sql
--   (ou colar no SQL Editor do Supabase Studio)
-- Idempotente: pode ser corrido mais do que uma vez.
-- ============================================================================

-- ============================================================
-- 1. anew_client_ducs — cabeçalho do documento
-- ============================================================

CREATE TABLE IF NOT EXISTS public.anew_client_ducs (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL,
  root_organization_id uuid,
  client_id            uuid        REFERENCES public.anew_clients (id) ON DELETE SET NULL,
  duc_number           text,
  title                text,
  variant              text        NOT NULL DEFAULT 'universal'
                         CHECK (variant IN ('universal', 'mudelar_obra', 'bmg_contrato')),
  current_stage        integer     NOT NULL DEFAULT 1
                         CHECK (current_stage >= 1),
  status               text        NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'in_progress', 'delivered', 'closed')),
  assigned_to          uuid        REFERENCES public.anew_users (id),
  blocks               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  tracking             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by           uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  deleted_by           uuid,
  CONSTRAINT anew_client_ducs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_client_ducs_org
  ON public.anew_client_ducs (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_ducs_client
  ON public.anew_client_ducs (client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_ducs_assigned
  ON public.anew_client_ducs (assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_ducs_created_by
  ON public.anew_client_ducs (created_by) WHERE deleted_at IS NULL;

-- Migração idempotente: relaxa o limite superior de etapas (era BETWEEN 1 AND 9).
-- O nº de etapas é dinâmico por organização (config), por isso só se exige >= 1.
-- CREATE TABLE IF NOT EXISTS não altera a constraint numa BD já aplicada — daí o ALTER.
ALTER TABLE public.anew_client_ducs
  DROP CONSTRAINT IF EXISTS anew_client_ducs_current_stage_check;
ALTER TABLE public.anew_client_ducs
  ADD CONSTRAINT anew_client_ducs_current_stage_check CHECK (current_stage >= 1);

-- ============================================================
-- 2. anew_client_duc_items — linhas tabulares genéricas
-- ============================================================

CREATE TABLE IF NOT EXISTS public.anew_client_duc_items (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  duc_id           uuid        NOT NULL REFERENCES public.anew_client_ducs (id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL,
  section          text        NOT NULL
                     CHECK (section IN ('scope', 'material', 'consumable',
                                        'control_point', 'change_log', 'service_map')),
  position         integer     NOT NULL DEFAULT 0,
  label            text,
  description      text,
  qty              numeric,
  unit             text,
  included         boolean,
  meta             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anew_client_duc_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_client_duc_items_duc
  ON public.anew_client_duc_items (duc_id, section, position);

-- ============================================================
-- 3. updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_client_duc_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_ducs_touch ON public.anew_client_ducs;
CREATE TRIGGER trg_client_ducs_touch
  BEFORE UPDATE ON public.anew_client_ducs
  FOR EACH ROW EXECUTE FUNCTION public.fn_client_duc_touch_updated_at();

DROP TRIGGER IF EXISTS trg_client_duc_items_touch ON public.anew_client_duc_items;
CREATE TRIGGER trg_client_duc_items_touch
  BEFORE UPDATE ON public.anew_client_duc_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_client_duc_touch_updated_at();

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.anew_client_ducs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anew_client_duc_items ENABLE ROW LEVEL SECURITY;

-- Condição de visibilidade de um DUC para o utilizador atual.
-- SELECT/UPDATE: org visível (get_user_visible_org_ids). INSERT/DELETE: org
-- visível AND criador (created_by = current_business_user_id()).

-- ---- anew_client_ducs -------------------------------------------------------

DROP POLICY IF EXISTS anew_client_ducs_select ON public.anew_client_ducs;
-- Visibilidade por ÁREA: qualquer utilizador com acesso à organização vê os DUCs
-- dela (o DUC é colaborativo — cada departamento preenche a sua etapa). A RLS por
-- organização (get_user_visible_org_ids) é a fronteira de segurança.
CREATE POLICY anew_client_ducs_select
  ON public.anew_client_ducs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS anew_client_ducs_insert ON public.anew_client_ducs;
CREATE POLICY anew_client_ducs_insert
  ON public.anew_client_ducs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = public.current_business_user_id()
    AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS anew_client_ducs_update ON public.anew_client_ducs;
-- Edição colaborativa por ÁREA: qualquer utilizador da organização pode atualizar
-- o DUC (etapas preenchidas por departamentos diferentes). INSERT/DELETE continuam
-- restritos ao criador.
CREATE POLICY anew_client_ducs_update
  ON public.anew_client_ducs
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS anew_client_ducs_delete ON public.anew_client_ducs;
CREATE POLICY anew_client_ducs_delete
  ON public.anew_client_ducs
  FOR DELETE
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND created_by = public.current_business_user_id()
  );

-- Bloqueio de acesso cruzado para system_admin (coerente com as tabelas CRM).
DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.anew_client_ducs;
CREATE POLICY system_admin_pii_default_deny
  ON public.anew_client_ducs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
    OR (public.is_system_admin((SELECT auth.uid())) AND public.has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT public.is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
  );

-- ---- anew_client_duc_items (via DUC pai) ------------------------------------

DROP POLICY IF EXISTS anew_client_duc_items_select ON public.anew_client_duc_items;
CREATE POLICY anew_client_duc_items_select
  ON public.anew_client_duc_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id = anew_client_duc_items.duc_id
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS anew_client_duc_items_write ON public.anew_client_duc_items;
CREATE POLICY anew_client_duc_items_write
  ON public.anew_client_duc_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id = anew_client_duc_items.duc_id
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id = anew_client_duc_items.duc_id
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

-- ============================================================
-- 5. Grants (RLS continua a ser a barreira efetiva)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anew_client_ducs      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anew_client_duc_items TO authenticated;

-- ============================================================
-- 6. Anexos (2ª fase) — metadados + Supabase Storage
-- ============================================================
-- Ficheiros que fazem parte do DUC (layout/projeto, renders, mapa de
-- necessidades, fotos da visita, registo fotográfico de obra…). O binário vive
-- no bucket privado 'duc-attachments'; os metadados nesta tabela.
-- Convenção de path no storage: <duc_id>/<uuid>-<nome_do_ficheiro>

CREATE TABLE IF NOT EXISTS public.anew_client_duc_attachments (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  duc_id           uuid        NOT NULL REFERENCES public.anew_client_ducs (id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL,
  category         text        NOT NULL DEFAULT 'other'
                     CHECK (category IN ('layout','renders','needs_map','photos_visit','site_photos','other')),
  file_path        text        NOT NULL,
  file_name        text,
  mime_type        text,
  size_bytes       bigint,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anew_client_duc_attachments_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_client_duc_attachments_duc
  ON public.anew_client_duc_attachments (duc_id, category);

ALTER TABLE public.anew_client_duc_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anew_client_duc_attachments_select ON public.anew_client_duc_attachments;
CREATE POLICY anew_client_duc_attachments_select
  ON public.anew_client_duc_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id = anew_client_duc_attachments.duc_id
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS anew_client_duc_attachments_write ON public.anew_client_duc_attachments;
CREATE POLICY anew_client_duc_attachments_write
  ON public.anew_client_duc_attachments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id = anew_client_duc_attachments.duc_id
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id = anew_client_duc_attachments.duc_id
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anew_client_duc_attachments TO authenticated;

-- ---- Storage: bucket privado + políticas (path = <duc_id>/<ficheiro>) -------

INSERT INTO storage.buckets (id, name, public)
VALUES ('duc-attachments', 'duc-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Comparação por texto (d.id::text) evita erros de cast se o path não for uuid.
DROP POLICY IF EXISTS duc_attachments_read ON storage.objects;
CREATE POLICY duc_attachments_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'duc-attachments'
    AND EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS duc_attachments_insert ON storage.objects;
CREATE POLICY duc_attachments_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'duc-attachments'
    AND EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS duc_attachments_delete ON storage.objects;
CREATE POLICY duc_attachments_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'duc-attachments'
    AND EXISTS (
      SELECT 1 FROM public.anew_client_ducs d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND d.deleted_at IS NULL
        AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

-- ============================================================
-- 7. Configuração dinâmica de etapas por organização
-- ============================================================
-- Cada organização pode personalizar as etapas/campos do DUC. O template de
-- raiz vive no frontend (ducSchema); aqui guarda-se apenas o override por org.

CREATE TABLE IF NOT EXISTS public.anew_client_duc_configs (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  config           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anew_client_duc_configs_pkey PRIMARY KEY (id),
  CONSTRAINT anew_client_duc_configs_org_unique UNIQUE (organization_id)
);

ALTER TABLE public.anew_client_duc_configs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_client_duc_configs_touch ON public.anew_client_duc_configs;
CREATE TRIGGER trg_client_duc_configs_touch
  BEFORE UPDATE ON public.anew_client_duc_configs
  FOR EACH ROW EXECUTE FUNCTION public.fn_client_duc_touch_updated_at();

DROP POLICY IF EXISTS anew_client_duc_configs_select ON public.anew_client_duc_configs;
CREATE POLICY anew_client_duc_configs_select
  ON public.anew_client_duc_configs
  FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))));

DROP POLICY IF EXISTS anew_client_duc_configs_write ON public.anew_client_duc_configs;
CREATE POLICY anew_client_duc_configs_write
  ON public.anew_client_duc_configs
  FOR ALL
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anew_client_duc_configs TO authenticated;

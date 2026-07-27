-- Merge Contacts into Leads — Phase 1 (data only, anew_contacts NOT dropped yet)
-- ============================================================
-- Product decision: "Contacto" stops existing as its own concept. A contact
-- with a quote/proposal attached (via entity_id) becomes a lead with
-- status='negotiating'; a contact without one becomes status='qualified'.
-- anew_leads.status has no CHECK constraint, so 'negotiating' is a new value,
-- not a schema change.
--
-- Already-converted-to-client contacts (converted_to_client_id IS NOT NULL,
-- 74 rows as of writing) are LEFT ALONE — they stay clients, they are not
-- turned into leads.
--
-- Scope of this migration: steps 4-7 of the agreed plan (backfill anew_leads,
-- fix anew_entity_roles, repoint deals.contact_id -> deals.lead_id, add a
-- lead_id column to client_portal_users so the mapping exists). This
-- migration does NOT touch RLS/auth logic for portal access (that requires
-- its own review since it's client-facing auth, tracked separately) and does
-- NOT drop anew_contacts (only happens after the per-row verification below
-- passes and a live E2E pass, per explicit user instruction).
--
-- Column mapping decided in conversation (only what actually carries real
-- data — verified against live data before writing this):
--   entity_id, organization_id, root_organization_id, assigned_to, notes,
--   tags, converted_to_client_id, converted_at, source_id, created_by,
--   created_at, updated_at, deleted_at, deleted_by  -> copied as-is
--   status                                          -> recomputed (qualified/negotiating), never 'inactive'
--   source_type, last_interaction_at, custom_fields,
--   position, call_center_*                         -> dropped (verified 0 real rows in all of them)
--   source_lead_id                                  -> not needed (row becomes the lead itself)

-- ============================================================
-- 0. Mapping table — contact.id -> lead.id, kept permanently as an audit
--    trail of the migration (not a throwaway temp table, so it survives
--    for the eventual anew_contacts DROP step to double-check against).
-- ============================================================
CREATE TABLE IF NOT EXISTS public._migration_contacts_to_leads_map (
  contact_id   uuid PRIMARY KEY,
  lead_id      uuid NOT NULL,
  entity_id    uuid NOT NULL,
  organization_id uuid NOT NULL,
  was_new_lead boolean NOT NULL,
  migrated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 1. Snapshot BEFORE — logged as NOTICEs so the migration log captures it.
-- ============================================================
DO $$
DECLARE
  v_contacts_total       integer;
  v_contacts_active      integer;
  v_contacts_already_client integer;
  v_leads_total          integer;
  v_roles_contact_active integer;
  v_roles_lead_active    integer;
  v_deals_with_contact   integer;
  v_portal_with_contact  integer;
BEGIN
  SELECT count(*) INTO v_contacts_total FROM public.anew_contacts;
  SELECT count(*) INTO v_contacts_active FROM public.anew_contacts WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_contacts_already_client FROM public.anew_contacts WHERE converted_to_client_id IS NOT NULL;
  SELECT count(*) INTO v_leads_total FROM public.anew_leads;
  SELECT count(*) INTO v_roles_contact_active FROM public.anew_entity_roles WHERE role = 'contact' AND status = 'active';
  SELECT count(*) INTO v_roles_lead_active FROM public.anew_entity_roles WHERE role = 'lead' AND status = 'active';
  SELECT count(*) INTO v_deals_with_contact FROM public.deals WHERE contact_id IS NOT NULL;
  SELECT count(*) INTO v_portal_with_contact FROM public.client_portal_users WHERE contact_id IS NOT NULL;

  RAISE NOTICE '=== SNAPSHOT ANTES ===';
  RAISE NOTICE 'anew_contacts total=% ativos=% ja_clientes=%', v_contacts_total, v_contacts_active, v_contacts_already_client;
  RAISE NOTICE 'anew_leads total=%', v_leads_total;
  RAISE NOTICE 'anew_entity_roles contact-active=% lead-active=%', v_roles_contact_active, v_roles_lead_active;
  RAISE NOTICE 'deals.contact_id preenchido=%', v_deals_with_contact;
  RAISE NOTICE 'client_portal_users.contact_id preenchido=%', v_portal_with_contact;
END $$;

-- ============================================================
-- 2. Backfill anew_leads for every contact that is NOT already a client.
--    Two cases: has source_lead_id (update the existing lead row) or not
--    (insert a brand-new lead row).
-- ============================================================
DO $$
DECLARE
  v_contact       public.anew_contacts;
  v_lead_id       uuid;
  v_new_status    text;
  v_has_docs      boolean;
  v_existing_lead public.anew_leads;
BEGIN
  FOR v_contact IN
    SELECT * FROM public.anew_contacts
    WHERE converted_to_client_id IS NULL
  LOOP
    -- Skip if already migrated (idempotent re-run safety)
    IF EXISTS (SELECT 1 FROM public._migration_contacts_to_leads_map WHERE contact_id = v_contact.id) THEN
      CONTINUE;
    END IF;

    -- Determine target status: negotiating if any quote/proposal references
    -- this entity_id, else qualified. Never 'inactive' (leads have no such
    -- concept — confirmed against real data before writing this).
    SELECT EXISTS (
      SELECT 1 FROM public.quotes WHERE entity_id = v_contact.entity_id
      UNION ALL
      SELECT 1 FROM public.proposals WHERE entity_id = v_contact.entity_id
    ) INTO v_has_docs;

    v_new_status := CASE WHEN v_has_docs THEN 'negotiating' ELSE 'qualified' END;

    IF v_contact.source_lead_id IS NOT NULL THEN
      SELECT * INTO v_existing_lead FROM public.anew_leads WHERE id = v_contact.source_lead_id;
    ELSE
      v_existing_lead := NULL;
    END IF;

    IF v_existing_lead.id IS NOT NULL THEN
      -- Case A: update the existing lead row in place, preserve created_at.
      UPDATE public.anew_leads
      SET    status       = v_new_status,
             assigned_to  = COALESCE(v_contact.assigned_to, v_existing_lead.assigned_to),
             notes        = COALESCE(v_contact.notes, v_existing_lead.notes),
             tags         = COALESCE(v_contact.tags, v_existing_lead.tags),
             converted_to_client_id = v_contact.converted_to_client_id,
             converted_at = v_contact.converted_at,
             deleted_at   = v_contact.deleted_at,
             deleted_by   = v_contact.deleted_by,
             updated_at   = now()
      WHERE  id = v_existing_lead.id;

      v_lead_id := v_existing_lead.id;

      INSERT INTO public._migration_contacts_to_leads_map (contact_id, lead_id, entity_id, organization_id, was_new_lead)
      VALUES (v_contact.id, v_lead_id, v_contact.entity_id, v_contact.organization_id, false);
    ELSE
      -- Case B: no originating lead — insert a brand-new lead row, dated
      -- as if it had always existed (created_at/updated_at from the contact,
      -- not from today).
      INSERT INTO public.anew_leads (
        organization_id, root_organization_id, entity_id, field_values, status,
        assigned_to, created_by, notes, tags, source_id,
        converted_to_client_id, converted_at,
        created_at, updated_at, deleted_at, deleted_by
      ) VALUES (
        v_contact.organization_id, v_contact.root_organization_id, v_contact.entity_id, '{}'::jsonb, v_new_status,
        v_contact.assigned_to, v_contact.created_by, v_contact.notes, v_contact.tags, v_contact.source_id,
        v_contact.converted_to_client_id, v_contact.converted_at,
        v_contact.created_at, v_contact.updated_at, v_contact.deleted_at, v_contact.deleted_by
      )
      RETURNING id INTO v_lead_id;

      INSERT INTO public._migration_contacts_to_leads_map (contact_id, lead_id, entity_id, organization_id, was_new_lead)
      VALUES (v_contact.id, v_lead_id, v_contact.entity_id, v_contact.organization_id, true);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 3. anew_entity_roles — deactivate 'contact' role, (re)activate 'lead' role
--    for every entity touched by the map above.
-- ============================================================
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN SELECT DISTINCT entity_id, organization_id FROM public._migration_contacts_to_leads_map LOOP
    UPDATE public.anew_entity_roles
    SET    status = 'inactive', updated_at = now(), previous_status = status
    WHERE  entity_id = v_row.entity_id
      AND  organization_id = v_row.organization_id
      AND  role = 'contact'
      AND  status = 'active';

    IF EXISTS (
      SELECT 1 FROM public.anew_entity_roles
      WHERE entity_id = v_row.entity_id AND organization_id = v_row.organization_id AND role = 'lead'
    ) THEN
      UPDATE public.anew_entity_roles
      SET    status = 'active', updated_at = now()
      WHERE  entity_id = v_row.entity_id AND organization_id = v_row.organization_id AND role = 'lead';
    ELSE
      INSERT INTO public.anew_entity_roles (organization_id, entity_id, role, status)
      VALUES (v_row.organization_id, v_row.entity_id, 'lead', 'active');
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 4. deals.contact_id -> deals.lead_id
-- ============================================================
UPDATE public.deals d
SET    lead_id = m.lead_id
FROM   public._migration_contacts_to_leads_map m
WHERE  d.contact_id = m.contact_id
  AND  d.lead_id IS NULL;

-- ============================================================
-- 5. client_portal_users — add lead_id column and populate it from the map.
--    RLS/auth logic to actually let a 'negotiating' lead log into the portal
--    is intentionally NOT part of this migration (separate, client-facing
--    auth change, needs its own review before going live).
-- ============================================================
ALTER TABLE public.client_portal_users
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.anew_leads(id);

UPDATE public.client_portal_users cpu
SET    lead_id = m.lead_id
FROM   public._migration_contacts_to_leads_map m
WHERE  cpu.contact_id = m.contact_id
  AND  cpu.lead_id IS NULL;

-- ============================================================
-- 6. Snapshot DEPOIS + verificação 1-por-1 (não agregada).
--    Percorre TODOS os anew_contacts não-cliente e confirma que cada um
--    tem uma entrada correspondente no mapa. Levanta exceção (aborta a
--    transação) se encontrar UM SÓ que falte — não avança silenciosamente.
-- ============================================================
DO $$
DECLARE
  v_missing_count integer;
  v_leads_total   integer;
  v_roles_contact_active integer;
  v_roles_lead_active    integer;
BEGIN
  SELECT count(*) INTO v_missing_count
  FROM public.anew_contacts c
  WHERE c.converted_to_client_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public._migration_contacts_to_leads_map m WHERE m.contact_id = c.id);

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Migração incompleta: % contacto(s) sem lead correspondente', v_missing_count;
  END IF;

  SELECT count(*) INTO v_leads_total FROM public.anew_leads;
  SELECT count(*) INTO v_roles_contact_active FROM public.anew_entity_roles WHERE role = 'contact' AND status = 'active';
  SELECT count(*) INTO v_roles_lead_active FROM public.anew_entity_roles WHERE role = 'lead' AND status = 'active';

  RAISE NOTICE '=== SNAPSHOT DEPOIS ===';
  RAISE NOTICE 'anew_leads total=% (era antes, ver NOTICE inicial)', v_leads_total;
  RAISE NOTICE 'anew_entity_roles contact-active=% (deve ser 0 ou so os ja-clientes) lead-active=%', v_roles_contact_active, v_roles_lead_active;
  RAISE NOTICE 'Verificacao 1-por-1: 0 contactos em falta — OK';
END $$;

-- ============================================================
-- Notas para as fases seguintes (NÃO executadas aqui):
--   - DROP TABLE anew_contacts só depois de: (a) confirmar os NOTICEs acima
--     manualmente, (b) repontar o frontend (~30 ficheiros), (c) decidir e
--     implementar a lógica de RLS/RPC do portal para 'negotiating', (d) E2E
--     ao vivo completo.
--   - deals.contact_id e client_portal_users.contact_id ficam preenchidos
--     (histórico) até essa fase final — não removidos aqui.
-- ============================================================

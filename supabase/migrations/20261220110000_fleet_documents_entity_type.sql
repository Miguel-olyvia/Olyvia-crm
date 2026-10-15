-- ============================================================================
-- 20261220110000_fleet_documents_entity_type — Frota: documentos (migração B)
-- ============================================================================
-- Depende de 20261220100000_fleet_modulo (aplicar DEPOIS dela).
-- NÃO fazer `supabase db push` sem aprovação explícita: há um só Supabase
-- (tzbfgwpckrfbqcolqxtm) e é produção.
--
-- Alarga o CHECK documents_entity_type_check para aceitar os documentos da
-- Frota. Escrito a partir do valor AO VIVO lido a 15/10/2026 (read only):
--   pg_get_constraintdef = CHECK ((entity_type = ANY (ARRAY['quote'::text,
--     'proposal'::text, 'contract'::text, 'product'::text])))
--   md5(pg_get_constraintdef) = 8ff412f3521ed3804eb82ac85d5dfb19
--   valores em uso: proposal (32), contract (44), quote (1)
-- Mantém os 4 valores atuais, pela mesma ordem, e só acrescenta os da Frota.
-- Se o CHECK ao vivo tiver mudado entretanto, a migração PÁRA (guarda abaixo)
-- em vez de apagar valores novos.
--
-- Também altera a função EXISTENTE documents_validate_entity() (gatilho
-- trg_documents_validate_entity), que fazia RAISE 'entity_type inválido' para
-- tudo o que não fosse contract/proposal/quote/product. Partiu do
-- pg_get_functiondef AO VIVO relido a 15/10/2026 (md5 do functiondef
-- e9bb2c751c6692604ddbd3ca4af48b8c, md5 do prosrc 29c0e4d694bb2311fac7f111321058db).
-- Só acrescenta o ramo entity_type = 'vehicle' (viatura existe em
-- fleet_vehicles e é da mesma organização, pelas verificações de v_org já
-- existentes). Os ramos contract/proposal/quote/product, SECURITY DEFINER,
-- search_path, dono e permissões ficam iguais (CREATE OR REPLACE mantém o
-- dono e os GRANT). Se a função ao vivo tiver mudado, a migração PÁRA.
-- Os outros tipos da Frota aceites pelo CHECK (fleet_incident, fleet_expense,
-- fleet_expense_import, fleet_assignment) continuam recusados pelo gatilho
-- até ganharem ramo próprio.
-- Texto original para rollback: C:/Olyvia/vault/frota-rollback-documents_validate_entity.sql
--
-- RLS e portal: as políticas de documents filtram por organização visível;
-- portal_user_can_see_doc só reconhece contract/proposal/quote, logo os
-- documentos da Frota nunca aparecem no portal. Mesmo assim, a app deve
-- inserir sempre visible_to_client = false (o DEFAULT da coluna é true).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.documents'::regclass
    AND c.conname = 'documents_entity_type_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'documents_entity_type_check não existe: rever antes de aplicar.';
  END IF;
  IF v_def <> 'CHECK ((entity_type = ANY (ARRAY[''quote''::text, ''proposal''::text, ''contract''::text, ''product''::text])))' THEN
    RAISE EXCEPTION 'documents_entity_type_check mudou desde 15/10/2026 (agora: %). Reescrever esta migração a partir do valor ao vivo.', v_def;
  END IF;

  ALTER TABLE public.documents DROP CONSTRAINT documents_entity_type_check;
  ALTER TABLE public.documents ADD CONSTRAINT documents_entity_type_check
    CHECK (entity_type = ANY (ARRAY[
      'quote'::text, 'proposal'::text, 'contract'::text, 'product'::text,
      'vehicle'::text, 'fleet_incident'::text, 'fleet_expense'::text,
      'fleet_expense_import'::text, 'fleet_assignment'::text]));
END $$;


DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.documents_validate_entity()'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM 'e9bb2c751c6692604ddbd3ca4af48b8c' THEN
    RAISE EXCEPTION 'documents_validate_entity() mudou desde 15/10/2026 (md5 %). Reescrever esta migração a partir do pg_get_functiondef ao vivo.', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.documents_validate_entity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org UUID;
BEGIN
  IF NEW.entity_type = 'contract' THEN
    SELECT organization_id INTO v_org FROM public.client_contracts WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'proposal' THEN
    SELECT organization_id INTO v_org FROM public.proposals WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'quote' THEN
    SELECT organization_id INTO v_org FROM public.quotes WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'vehicle' THEN
    -- Frota (20261220110000): documentos da viatura (DUA, apólice, IPO...).
    SELECT organization_id INTO v_org FROM public.fleet_vehicles WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'product' THEN
    -- Um produto pode pertencer a VÁRIAS organizações (product_organizations é
    -- N:N), por isso não há "a" organização do produto para comparar. E
    -- products.organization_id está a NULL/incoerente em produção, não serve
    -- para scoping. Valida-se PERTENÇA e sai-se já, sem passar pelos testes de
    -- v_org lá abaixo (que são só para contract/proposal/quote).
    IF NOT EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = NEW.entity_id
        AND p.is_deleted IS NOT TRUE
        AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'documents: % % não existe', NEW.entity_type, NEW.entity_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_organizations po
      WHERE po.product_id = NEW.entity_id
        AND po.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'documents: organization_id (%) não corresponde à entidade — o produto % não pertence a essa organização',
        NEW.organization_id, NEW.entity_id;
    END IF;

    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'documents: entity_type inválido %', NEW.entity_type;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'documents: % % não existe', NEW.entity_type, NEW.entity_id;
  END IF;

  IF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'documents: organization_id (%) não corresponde à entidade (%)',
      NEW.organization_id, v_org;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Só funciona se não houver documentos com tipos da Frota (apagá-los ou
-- movê-los primeiro):
--   SELECT entity_type, count(*) FROM public.documents
--   WHERE entity_type NOT IN ('quote','proposal','contract','product') GROUP BY 1;
-- BEGIN;
-- ALTER TABLE public.documents DROP CONSTRAINT documents_entity_type_check;
-- ALTER TABLE public.documents ADD CONSTRAINT documents_entity_type_check
--   CHECK (entity_type = ANY (ARRAY['quote'::text, 'proposal'::text, 'contract'::text, 'product'::text]));
-- -- e repor a função original (texto ao vivo de 15/10/2026):
-- \i C:/Olyvia/vault/frota-rollback-documents_validate_entity.sql
-- COMMIT;

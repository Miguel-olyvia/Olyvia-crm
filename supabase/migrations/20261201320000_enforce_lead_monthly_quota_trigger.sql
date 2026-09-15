-- Liga fn_check_and_consume_lead_quota (20261201300000, já com
-- deduplicação por entity_id) a um trigger em anew_leads E em
-- anew_clients -- é seguro fazer isto agora porque as duas migrations
-- anteriores já garantem que TODA organização tem uma linha em
-- plan_limits para 'leads' e em organization_subscriptions (via o plano
-- 'internal' + backfill de 20261201310000).
-- ============================================================
-- Trigger, não uma verificação só do lado da Edge Function, porque leads
-- são criados por DUAS vias diferentes: a função create-lead E um insert
-- direto do cliente a partir de src/pages/AnewLeads.tsx -- um caminho só
-- na Edge Function deixaria o segundo por fora.
--
-- Também em anew_clients, não só em anew_leads: um cliente pode ser
-- criado diretamente (sem passar por lead primeiro). A deduplicação por
-- entity_id dentro de fn_check_and_consume_lead_quota garante que uma
-- conversão lead->cliente da MESMA entidade nunca conta duas vezes --
-- ver organization_counted_entities em 20261201300000. Contactos não
-- entram nisto: não têm trigger, não são referenciados.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_lead_monthly_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.fn_check_and_consume_lead_quota(NEW.organization_id, NEW.entity_id);

  IF (v_result->>'blocked')::boolean THEN
    -- Prefixo "plan_limit_exceeded:leads" é o que
    -- src/utils/friendlyError.ts reconhece para mostrar uma mensagem
    -- amigável (ver entrada acrescentada a FRIENDLY_MAP) em vez do texto
    -- cru do Postgres.
    RAISE EXCEPTION 'plan_limit_exceeded:leads (%)', v_result->>'reason'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_lead_monthly_quota() IS
  'Trigger BEFORE INSERT em anew_leads e anew_clients -- bloqueia a criação/conversão quando fn_check_and_consume_lead_quota devolve blocked=true (sem subscrição ativa, sem plan_limits configurado, ou limite mensal/do trial já atingido). A deduplicação por NEW.entity_id garante que uma entidade que já existia como lead (ou já tinha sido contada) nunca volta a consumir quota ao virar cliente.';

DROP TRIGGER IF EXISTS trg_enforce_lead_monthly_quota ON public.anew_leads;
CREATE TRIGGER trg_enforce_lead_monthly_quota
  BEFORE INSERT ON public.anew_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_lead_monthly_quota();

DROP TRIGGER IF EXISTS trg_enforce_client_entity_quota ON public.anew_clients;
CREATE TRIGGER trg_enforce_client_entity_quota
  BEFORE INSERT ON public.anew_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_lead_monthly_quota();

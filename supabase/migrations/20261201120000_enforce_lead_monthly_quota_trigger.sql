-- Liga fn_check_and_consume_lead_quota (20261201090000) a um trigger em
-- anew_leads -- é seguro fazer isto agora porque as duas migrations
-- anteriores já garantem que TODA organização tem uma linha em
-- plan_limits para 'leads' e em organization_subscriptions (via o plano
-- 'internal' + backfill de 20261201110000).
-- ============================================================
-- Trigger, não uma verificação só do lado da Edge Function, porque leads
-- são criados por DUAS vias diferentes: a função create-lead E um insert
-- direto do cliente a partir de src/pages/AnewLeads.tsx -- um caminho só
-- na Edge Function deixaria o segundo por fora.
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
  v_result := public.fn_check_and_consume_lead_quota(NEW.organization_id);

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
  'Trigger BEFORE INSERT em anew_leads -- bloqueia a criação de um lead quando fn_check_and_consume_lead_quota devolve blocked=true (sem subscrição ativa, sem plan_limits configurado, ou limite mensal/do trial já atingido). Cobre tanto a função create-lead como o insert direto do cliente em AnewLeads.tsx, porque corre ao nível da tabela, não de um caminho de código específico.';

DROP TRIGGER IF EXISTS trg_enforce_lead_monthly_quota ON public.anew_leads;
CREATE TRIGGER trg_enforce_lead_monthly_quota
  BEFORE INSERT ON public.anew_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_lead_monthly_quota();

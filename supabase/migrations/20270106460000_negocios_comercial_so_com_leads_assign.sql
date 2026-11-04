-- ============================================================
-- 20270106460000_negocios_comercial_so_com_leads_assign
-- ============================================================
-- O que faz: mudar o comercial de um negócio (negocios.assigned_to) por escrita direta (UPDATE pela API, ex.: Pessoas ->
--   useEscritasNegocio.editar) passa a pedir leads.assign na organização do negócio (ou numa acima; o administrador de sistema passa
--   - has_anew_permission_in_org_or_ancestor). As RPCs SECURITY DEFINER (neg_atribuir_pessoa, ...) já fazem a sua verificação e
--   correm como dono da função, por isso este gatilho não lhes toca (só atua com current_user = 'authenticated').
-- Só quando o valor MUDA; tudo o resto do UPDATE fica igual (negocios_update e os outros gatilhos não mudam).
-- Base RH (4/11/2026): quem tem pessoas.edit (Super Admin, System Admin) tem leads.assign - ninguém perde a possibilidade.
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_negocios_comercial_exige_leads_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270106460000: só escritas diretas (role authenticated); INVOKER de propósito, para current_user ser quem escreve.
  IF current_user = 'authenticated'
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NOT public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'leads.assign', NEW.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para mudar o comercial do negócio (leads.assign).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocios_comercial_exige_leads_assign() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_00_negocios_comercial_leads_assign ON public.negocios;
CREATE TRIGGER trg_00_negocios_comercial_leads_assign
  BEFORE UPDATE OF assigned_to ON public.negocios
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.fn_negocios_comercial_exige_leads_assign();

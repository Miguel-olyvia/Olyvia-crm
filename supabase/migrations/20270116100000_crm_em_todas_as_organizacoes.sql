-- A página CRM (Pessoas e Negócios) aparece em todas as organizações, como na nike.
-- O ecrã deixa de depender do "interruptor" (linha em negocio_workflow_config); como as funções de negócios
-- leem desta linha as regras do fecho, cada organização passa a tê-la sempre: criada ao criar a organização
-- e semeada já nas que ainda não a têm. Regras iguais às da nike (ganho no contrato assinado); mudam-se por
-- organização na configuração dos negócios (neg_guardar_config_negocios).

CREATE OR REPLACE FUNCTION public.fn_neg_config_semear_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.negocio_workflow_config (
    organization_id, momento_ganho, conversao_ao_ganhar, recusa_proposta,
    recusa_contrato, cancelamento_no_prazo, recusa_orcamento
  )
  VALUES (NEW.id, 'contrato_assinado', 'automatica', 'perder', 'perder', 'perder', 'perder_se_ultimo')
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_config_semear_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_neg_config_semear_org ON public.anew_organizations;
CREATE TRIGGER trg_neg_config_semear_org
  AFTER INSERT ON public.anew_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_config_semear_org();

INSERT INTO public.negocio_workflow_config (
  organization_id, momento_ganho, conversao_ao_ganhar, recusa_proposta,
  recusa_contrato, cancelamento_no_prazo, recusa_orcamento
)
SELECT o.id, 'contrato_assinado', 'automatica', 'perder', 'perder', 'perder', 'perder_se_ultimo'
FROM public.anew_organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c WHERE c.organization_id = o.id)
ON CONFLICT (organization_id) DO NOTHING;

-- Negócio (29/10/2026): o contrato do negócio nasce pré-assinado pela empresa com o signatário configurado na minuta.
--
-- Na página de Contratos, a minuta (client_contract_templates.signatory_user_id, texto com o id de um anew_users, verificado por SMS
-- uma vez em Minutas de contrato) assina pela empresa: grava company_signature_date, company_signed_by_id e company_signed_by_name em
-- client_contracts, sem novo SMS (ContractBodyTab.handleCompanySignAsTemplateSignatory). O contrato do negócio da Emylia, criado pelo
-- neg_guardar_negocio ou pelo portal quando o cliente aceita a proposta, nascia sem isso.
--
-- O que muda (a base só cresce; nada se apaga):
--   Gatilho BEFORE INSERT OR UPDATE OF contract_template_id em client_contracts, depois dos que aplicam e herdam a minuta
--   (trg_contracts_05_template_pendente, trg_negocios_10_herdar). Num contrato de um negócio do fluxo da Emylia que o cliente ainda não
--   assinou:
--     · ao nascer com minuta com signatário e sem assinatura da empresa, assina pelo signatário;
--     · ao mudar de minuta, a assinatura que era automática (do signatário da minuta antiga) passa para o da nova, ou sai se a nova não
--       tem signatário; uma assinatura feita à mão (outro utilizador) nunca se toca.
--   Quem não tem signatário na minuta fica como estava. Contratos com assinatura do cliente nunca se tocam.
--
-- O que muda para a Mudelar: nada nos contratos fora do fluxo da Emylia (negocio_id nulo ou fluxo_emylia falso). Esta migration só se
-- aplica à RH.
SET lock_timeout = '5s';

-- Guarda: as colunas de que o gatilho depende existem (o plpgsql só as liga quando corre; sem isto uma em falta rebentava em cada INSERT).
DO $guarda$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
    FROM (VALUES ('negocios','fluxo_emylia'), ('anew_users','deleted_at'), ('anew_users','name'),
                 ('client_contract_templates','signatory_user_id'),
                 ('client_contracts','negocio_id'), ('client_contracts','contract_template_id'), ('client_contracts','status'),
                 ('client_contracts','deleted_at'), ('client_contracts','signature_date'), ('client_contracts','signed_by_name'),
                 ('client_contracts','signature_ip'), ('client_contracts','signature_image'),
                 ('client_contracts','company_signature_date'), ('client_contracts','company_signed_by_id'),
                 ('client_contracts','company_signed_by_name'), ('client_contracts','contract_body_frozen_html'),
                 ('client_contracts','contract_frozen_at')) AS x(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k
                      WHERE k.table_schema = 'public' AND k.table_name = x.t AND k.column_name = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas de que o gatilho depende: %', v_falta;
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.fn_neg_contrato_pre_assinar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_uuid   CONSTANT text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_novo   text;
  v_antigo text;
  v_uid    uuid;
  v_nome   text;
BEGIN
  IF NEW.negocio_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- o cliente já assinou: o documento é dele, não se toca
  IF NEW.signature_date IS NOT NULL OR NEW.signed_by_name IS NOT NULL OR NEW.signature_ip IS NOT NULL OR NEW.signature_image IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.contract_template_id IS NOT DISTINCT FROM OLD.contract_template_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = NEW.negocio_id AND n.fluxo_emylia) THEN
    RETURN NEW;
  END IF;

  SELECT lower(btrim(ct.signatory_user_id)) INTO v_novo
    FROM public.client_contract_templates ct
   WHERE ct.id = NEW.contract_template_id AND ct.organization_id = NEW.organization_id;
  IF v_novo IS NOT NULL AND v_novo !~ c_uuid THEN
    v_novo := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_novo IS NULL OR NEW.company_signature_date IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    -- mudou de minuta: um contrato já enviado ou decidido fica como está (o cliente pode já o ter visto)
    IF COALESCE(NEW.status, 'draft') <> 'draft' THEN
      RETURN NEW;
    END IF;
    -- só se mexe numa assinatura que foi automática (a do signatário da minuta antiga) ou se ainda não há nenhuma; uma com data e sem
    -- id, ou de outro utilizador, é manual e nunca se toca
    SELECT lower(btrim(ct.signatory_user_id)) INTO v_antigo
      FROM public.client_contract_templates ct
     WHERE ct.id = OLD.contract_template_id AND ct.organization_id = OLD.organization_id;
    IF NEW.company_signature_date IS NOT NULL
       AND (NEW.company_signed_by_id IS NULL
            OR NEW.company_signed_by_id IS DISTINCT FROM (CASE WHEN v_antigo ~ c_uuid THEN v_antigo::uuid END)) THEN
      RETURN NEW;
    END IF;
    -- o mesmo signatário nas duas minutas: a assinatura fica como está
    IF NEW.company_signature_date IS NOT NULL AND v_novo IS NOT DISTINCT FROM v_antigo THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_novo IS NOT NULL THEN
    v_uid := v_novo::uuid;
    SELECT u.name INTO v_nome FROM public.anew_users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
    IF FOUND THEN
      NEW.company_signature_date := now();
      NEW.company_signed_by_id   := v_uid;
      NEW.company_signed_by_name := COALESCE(NULLIF(btrim(v_nome), ''), 'Representante');
    ELSIF NEW.company_signed_by_id IS NOT NULL THEN
      -- o signatário já não existe: sai a assinatura automática, não fica a de um utilizador apagado
      NEW.company_signature_date := NULL;
      NEW.company_signed_by_id   := NULL;
      NEW.company_signed_by_name := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- a minuta nova não tem signatário: sai a assinatura automática da antiga
    NEW.company_signature_date := NULL;
    NEW.company_signed_by_id   := NULL;
    NEW.company_signed_by_name := NULL;
  END IF;

  -- assinar muda o documento (a assinatura faz parte dele): descongela-se para a leitura seguinte o reconstruir já com ela
  IF TG_OP = 'UPDATE' THEN
    NEW.contract_body_frozen_html := NULL;
    NEW.contract_frozen_at        := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_neg_contrato_pre_assinar() IS 'Negócio: gatilho BEFORE INSERT OR UPDATE OF contract_template_id em client_contracts; o contrato de um negócio do fluxo da Emylia, ainda sem assinatura do cliente, leva a assinatura da empresa do signatário configurado na minuta (e acompanha a minuta se mudar). 20270101330000.';

REVOKE ALL ON FUNCTION public.fn_neg_contrato_pre_assinar() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_negocios_30_pre_assinar ON public.client_contracts;
CREATE TRIGGER trg_negocios_30_pre_assinar
  BEFORE INSERT OR UPDATE OF contract_template_id ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_contrato_pre_assinar();

-- Verificação final: o gatilho existe, é BEFORE, por linha, em INSERT e UPDATE, e corre depois dos que aplicam a minuta e herdam o negócio.
DO $verifica$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.client_contracts'::regclass AND t.tgname = 'trg_negocios_30_pre_assinar' AND NOT t.tgisinternal
     AND (t.tgtype & 1) = 1 AND (t.tgtype & 2) = 2 AND (t.tgtype & 4) = 4 AND (t.tgtype & 16) = 16;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'O gatilho trg_negocios_30_pre_assinar não ficou como esperado (BEFORE, por linha, INSERT e UPDATE).';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.client_contracts'::regclass AND NOT t.tgisinternal AND (t.tgtype & 2) = 2
     AND t.tgname IN ('trg_contracts_05_template_pendente', 'trg_negocios_10_herdar') AND t.tgname < 'trg_negocios_30_pre_assinar';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Os gatilhos que aplicam a minuta e herdam o negócio não correm antes de trg_negocios_30_pre_assinar.';
  END IF;
END
$verifica$;

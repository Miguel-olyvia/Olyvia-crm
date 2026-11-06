-- =============================================================================
-- 20270110100000 — pôr/tirar um documento do portal do cliente pede permissão (auditoria 06/11/2026, aprovado: regra 1)
-- =============================================================================
-- documents.visible_to_client decide o que o cliente vê no portal (policy "Portal users can view their entity documents").
-- As policies de escrita de documents só pedem a organização ("Visible org members can insert/update documents"), por isso
-- qualquer membro punha ou tirava documentos do portal — no Negócio (emylia/DocumentosParaCliente), nos anexos de orçamentos e
-- propostas (shared/DocumentsTab) e nos de contratos (contracts/ContractsDocumentsView), e também pela API.
--
-- Regra: a mesma de enviar a proposta ao portal (republish_proposal_snapshot, 20270106600000): portal.manage OU
-- negocios.proposta.enviar na organização do documento, por fn_cat_pode (perfil na organização, Papel no Negócio, admin de sistema).
-- Só se verifica quando o documento FICA visível ao cliente (insert com visible_to_client = true) ou quando a visibilidade MUDA
-- (update). Anexos internos (false) e as outras colunas não mudam. Sem auth.uid() (service_role: edge functions, migrações de
-- dados) não se verifica — o mesmo critério das outras guardas.
-- Não mexe nas policies nem no DEFAULT da coluna; nenhuma tabela/coluna nova.

CREATE OR REPLACE FUNCTION public.fn_documents_portal_exige_permissao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NOT COALESCE(NEW.visible_to_client, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.visible_to_client IS NOT DISTINCT FROM OLD.visible_to_client THEN
    RETURN NEW;
  END IF;
  IF NOT (public.fn_cat_pode(NEW.organization_id, 'portal.manage')
          OR public.fn_cat_pode(NEW.organization_id, 'negocios.proposta.enviar')) THEN
    RAISE EXCEPTION 'Sem permissão para pôr ou tirar documentos do portal do cliente (requer negocios.proposta.enviar ou portal.manage)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_documents_portal_exige_permissao() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_documents_portal_exige_permissao ON public.documents;
CREATE TRIGGER trg_documents_portal_exige_permissao
  BEFORE INSERT OR UPDATE OF visible_to_client ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_documents_portal_exige_permissao();

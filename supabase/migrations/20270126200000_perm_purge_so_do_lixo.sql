-- 20270126200000 — Auditoria de permissões 23/11, C2: purge_business_entity («Eliminar definitivamente» do Lixo, deals.delete)
-- só apaga o que já está no Lixo (deleted_at não nulo) e com o âmbito do documento usado no envio para o Lixo (fn_doc_no_ambito_acao, chave deals.delete).
-- Só permissões: o que o Lixo apaga hoje não muda (verificado 23/11 na base RH: todas as contas com deals.delete × todos os registos
-- no Lixo, 308 casos, iguais antes e depois). Fica por decidir (regra de negócio, não mexida): um contrato assinado ou uma encomenda
-- de cliente que esteja no Lixo continua a poder ser eliminado definitivamente.
-- Partiu da versão viva (pg_get_functiondef, base RH, 23/11). SÓ base RH até à promoção.

CREATE OR REPLACE FUNCTION public.purge_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_live_count int;
  -- 20270126200000
  v_deleted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT entity_id, organization_id, deleted_at INTO v_entity_id, v_org_id, v_deleted_at FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT entity_id, organization_id, deleted_at INTO v_entity_id, v_org_id, v_deleted_at FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT entity_id, organization_id, deleted_at INTO v_entity_id, v_org_id, v_deleted_at FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT entity_id, organization_id, deleted_at INTO v_entity_id, v_org_id, v_deleted_at FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'deals.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270110200000: deals.delete nesta organização ou acima (a administração desce, não sobe), como purge_entity_facet
  --   (20270108100000). Antes bastava a permissão em qualquer organização e esta ser visível (as de cima também são).
  IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'deals.delete', v_org_id) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270126200000 início (auditoria de permissões 23/11, C2): «Eliminar definitivamente» é só do Lixo (Trash.tsx). Antes apagava
  --   também um orçamento vivo ou um contrato assinado vivo, chamado direto pela RPC.
  --   1. Só o que já está no Lixo (deleted_at não nulo).
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Sem permissao: so se elimina definitivamente o que ja esta no Lixo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  --   2. O âmbito do documento, o mesmo do envio para o Lixo de orçamentos e propostas (_soft_delete_business_entity_impl:
  --      fn_doc_no_ambito_acao — o "próprio" do documento: criador/responsável, o pedido/lead, o negócio, os documentos ligados;
  --      system admin e super admin na organização ou acima = ORG), com a chave desta ação (deals.delete) e pessoas.edit para o
  --      negócio. Também nos contratos e nas encomendas de cliente: inclui o dono do contrato (created_by/assigned_to, a regra do envio
  --      para o Lixo dos contratos) e ainda a cadeia do negócio, para não tirar a quem hoje elimina do Lixo com o âmbito do negócio
  --      (ex. org_admin). Os pedidos de proposta (deal) não têm âmbito no envio para o Lixo e continuam sem ele.
  IF p_kind IN ('quote', 'proposal', 'contract')
     AND NOT public.fn_doc_no_ambito_acao(p_kind, p_id, 'deals.delete', 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissao para eliminar este registo (fora do seu ambito)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270126200000 fim

  IF p_kind = 'deal' THEN
    -- bloqueio: não permitir purge se houver quotes/proposals vivos ligados
    SELECT count(*) INTO v_live_count FROM public.quotes WHERE deal_id = p_id AND deleted_at IS NULL;
    IF v_live_count > 0 THEN
      RAISE EXCEPTION 'Não é possível eliminar definitivamente: existem % orçamento(s) vivos ligados. Apague-os primeiro.', v_live_count;
    END IF;
    SELECT count(*) INTO v_live_count FROM public.proposals WHERE deal_id = p_id AND deleted_at IS NULL;
    IF v_live_count > 0 THEN
      RAISE EXCEPTION 'Não é possível eliminar definitivamente: existem % proposta(s) vivas ligadas. Apague-as primeiro.', v_live_count;
    END IF;

    -- purge filhos soft-deleted explicitamente (CASCADE trataria, mas queremos limpar tudo)
    UPDATE public.client_contracts SET proposal_id = NULL WHERE proposal_id IN (SELECT id FROM public.proposals WHERE deal_id = p_id);
    DELETE FROM public.proposals WHERE deal_id = p_id; -- CASCADE em proposal_*
    DELETE FROM public.quotes WHERE deal_id = p_id;    -- CASCADE em quote_*
    DELETE FROM public.deals WHERE id = p_id;

  ELSIF p_kind = 'quote' THEN
    -- quote_lines, quote_fees, quote_documents já têm ON DELETE CASCADE
    DELETE FROM public.quote_sends WHERE quote_id = p_id;
    DELETE FROM public.quotes WHERE id = p_id;

  ELSIF p_kind = 'proposal' THEN
    -- proposal_items, proposal_sends, proposal_access_tokens, proposal_deliveries, proposal_verification_codes têm CASCADE
    UPDATE public.client_contracts SET proposal_id = NULL WHERE proposal_id = p_id;
    DELETE FROM public.proposals WHERE id = p_id;

  ELSE -- contract
    -- contract_sends, client_contract_*, contract_documents têm CASCADE
    DELETE FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'purged', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$;

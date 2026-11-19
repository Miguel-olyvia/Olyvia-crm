-- ============================================================
-- 20270123000000 so_o_portal_aceita_e_assina
-- ============================================================
-- Auditoria de 19/11/2026, achado 1: aceitar a proposta e assinar o contrato de um negócio da Emylia só pelo portal do cliente.
--
-- O problema: numa escrita direta (PostgREST, role authenticated) o gatilho trg_negocios_21_doc_permissao
-- (fn_neg_documento_exigir_permissao, 20270106030000) só pedia negocios.contrato.editar para pôr client_contracts.status em
-- signed / active / assinado e para escrever a assinatura do cliente (signature_*, signed_by_name), e negocios.proposta.decidir para pôr
-- quotes.estado em 'aceite'. Quem tinha essas permissões aceitava e assinava pelo cliente (ex.: «Aceitar» na página Orçamentos, um
-- PATCH direto). E rpc_update_client_contract_status (SECURITY DEFINER, a mudança de estado da página Contratos) passava o contrato a
-- signed / active sem gatilho nenhum que o visse (corre como o dono).
--
-- O que muda:
--   1. fn_neg_documento_do_fluxo_emylia(negócio, adenda, orçamento) (nova, SECURITY DEFINER): o documento é de um negócio da Emylia?
--      Pelo negocio_id (negocios.fluxo_emylia), pela adenda (adendas.negocio_id) ou pelo orçamento (quotes.fluxo_emylia, ou o negócio
--      dele). Assim apanha também o contrato de suporte da venda direta (sem negocio_id, ligado ao orçamento).
--   2. Gatilho novo trg_negocios_22_so_o_portal (BEFORE INSERT OR UPDATE em quotes e em client_contracts; corre logo a seguir ao
--      trg_negocios_21_doc_permissao). Só para current_user = 'authenticated' (a escrita direta, e qualquer função INVOKER chamada por
--      ela). Num documento da Emylia recusa:
--        quotes           : passar a 'aceite' (ou nascer aceite), ou mudar accepted_at para uma data;
--        client_contracts : passar a signed / active / assinado (ou nascer assim), ou mudar signature_* / signed_by_name.
--      Não toca: service_role (o portal: Edge Function client-portal-action, que usa a chave service_role), postgres, as funções SECURITY
--      DEFINER (neg_guardar_negocio já ignora o «aceite» e o «assinado» do JSON; fn_neg_emitir_ec_se_pronta cria o contrato de suporte
--      da venda direta já assinado), anon (o gatilho de 20270106030000 também o deixa de fora) e os negócios do CRM.
--   3. rpc_update_client_contract_status: no início, troca de texto guardada sobre a definição viva. Recusa p_status signed / active /
--      assinado num contrato da Emylia (o estado de agora diferente). As outras mudanças de estado ficam como estavam.
-- O modo de teste do super admin («Aceitar / Assinar pelo cliente (teste)») continua a funcionar: src/emylia/real/modoTeste.ts chama a
--   Edge Function client-portal-action (ação simular_cliente), que escreve com o cliente service_role (createClient(url,
--   SUPABASE_SERVICE_ROLE_KEY), index.ts:40); current_user é service_role e o gatilho deixa passar.
-- O erro é 42501 (insufficient_privilege, como o de 20270106030000), com uma mensagem que o ecrã mostra tal como vem.
-- Sem tabelas nem colunas novas. Permissões, GRANTs, SECURITY DEFINER e search_path de rpc_update_client_contract_status ficam iguais
--   (o corpo novo é o pg_get_functiondef vivo com um bloco a mais).
--
-- Reversão (só como migration nova):
--   DROP TRIGGER IF EXISTS trg_negocios_22_so_o_portal ON public.quotes;
--   DROP TRIGGER IF EXISTS trg_negocios_22_so_o_portal ON public.client_contracts;
--   DROP FUNCTION IF EXISTS public.fn_neg_so_o_portal_decide();
--   tirar de rpc_update_client_contract_status o bloco entre «-- 20270123000000 início» e «-- 20270123000000 fim» (a mesma troca de
--   texto, ao contrário; ver o fim deste ficheiro) e só depois DROP FUNCTION public.fn_neg_documento_do_fluxo_emylia(uuid, uuid, uuid).
-- ============================================================
SET lock_timeout = '5s';

-- ---------------------------------------------------------------- 1. o documento é de um negócio da Emylia?
CREATE OR REPLACE FUNCTION public.fn_neg_documento_do_fluxo_emylia(p_negocio uuid, p_adenda uuid, p_quote uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270123000000: pelo negócio, pela adenda ou pelo orçamento (o contrato de suporte da venda direta não tem negocio_id)
  SELECT EXISTS (SELECT 1 FROM negocios n WHERE n.id = p_negocio AND coalesce(n.fluxo_emylia, false))
      OR EXISTS (SELECT 1 FROM adendas a JOIN negocios n ON n.id = a.negocio_id
                 WHERE a.id = p_adenda AND coalesce(n.fluxo_emylia, false))
      OR EXISTS (SELECT 1 FROM quotes q
                 WHERE q.id = p_quote
                   AND (coalesce(q.fluxo_emylia, false)
                        OR EXISTS (SELECT 1 FROM negocios n WHERE n.id = q.negocio_id AND coalesce(n.fluxo_emylia, false))))
$function$;
COMMENT ON FUNCTION public.fn_neg_documento_do_fluxo_emylia(uuid, uuid, uuid) IS 'O documento (pelo negócio, pela adenda ou pelo orçamento) é de um negócio da Emylia? Usado pelo gatilho trg_negocios_22_so_o_portal e por rpc_update_client_contract_status. 20270123000000.';
REVOKE ALL ON FUNCTION public.fn_neg_documento_do_fluxo_emylia(uuid, uuid, uuid) FROM PUBLIC, anon;
-- o gatilho é INVOKER (para ver o role de quem escreve): quem escreve precisa de a poder chamar
GRANT EXECUTE ON FUNCTION public.fn_neg_documento_do_fluxo_emylia(uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- 2. o gatilho
CREATE OR REPLACE FUNCTION public.fn_neg_so_o_portal_decide()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_novo  jsonb := to_jsonb(NEW);
  v_velho jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_o_que text;
BEGIN
  -- 20270123000000: só a escrita de quem tem sessão (role authenticated). O portal (service_role), postgres e as funções SECURITY
  -- DEFINER (current_user = dono) passam.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'client_contracts' THEN
    IF (v_novo->>'status') IN ('signed', 'active', 'assinado')
       AND (v_velho IS NULL OR (v_velho->>'status') IS DISTINCT FROM (v_novo->>'status')) THEN
      v_o_que := 'contrato';
    ELSIF EXISTS (SELECT 1 FROM jsonb_each(v_novo) c
                  WHERE (c.key LIKE 'signature\_%' OR c.key = 'signed_by_name')
                    AND c.value IS DISTINCT FROM coalesce(v_velho->c.key, 'null'::jsonb)) THEN
      v_o_que := 'assinatura';
    END IF;
  ELSE -- quotes
    IF ((v_novo->>'estado') = 'aceite' AND (v_velho IS NULL OR (v_velho->>'estado') IS DISTINCT FROM 'aceite'))
       OR ((v_novo->'accepted_at') IS DISTINCT FROM 'null'::jsonb
           AND (v_novo->'accepted_at') IS DISTINCT FROM coalesce(v_velho->'accepted_at', 'null'::jsonb)) THEN
      v_o_que := 'proposta';
    END IF;
  END IF;

  IF v_o_que IS NULL THEN
    RETURN NEW;
  END IF;

  IF coalesce((v_novo->>'fluxo_emylia')::boolean, false)
     OR coalesce((v_velho->>'fluxo_emylia')::boolean, false)
     OR public.fn_neg_documento_do_fluxo_emylia(nullif(v_novo->>'negocio_id', '')::uuid, nullif(v_novo->>'adenda_id', '')::uuid,
                                                CASE WHEN TG_TABLE_NAME = 'client_contracts' THEN nullif(v_novo->>'quote_id', '')::uuid END)
     OR (v_velho IS NOT NULL
         AND public.fn_neg_documento_do_fluxo_emylia(nullif(v_velho->>'negocio_id', '')::uuid, nullif(v_velho->>'adenda_id', '')::uuid,
                                                     CASE WHEN TG_TABLE_NAME = 'client_contracts' THEN nullif(v_velho->>'quote_id', '')::uuid END)) THEN
    RAISE EXCEPTION '%', CASE v_o_que
        WHEN 'proposta' THEN 'Só o cliente aceita a proposta, no portal: num negócio da Emylia o orçamento não passa a aceite por aqui.'
        WHEN 'contrato' THEN 'Só o cliente assina o contrato, no portal: num negócio da Emylia o contrato não passa a assinado por aqui.'
        ELSE 'Só o cliente assina o contrato, no portal: num negócio da Emylia a assinatura do cliente não se grava por aqui.' END
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.fn_neg_so_o_portal_decide() IS 'Gatilho trg_negocios_22_so_o_portal: num negócio da Emylia, a escrita com sessão (authenticated) não aceita orçamentos nem assina contratos (estado e assinatura do cliente); só o portal (service_role). 20270123000000.';
REVOKE ALL ON FUNCTION public.fn_neg_so_o_portal_decide() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_negocios_22_so_o_portal ON public.quotes;
CREATE TRIGGER trg_negocios_22_so_o_portal
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_so_o_portal_decide();

DROP TRIGGER IF EXISTS trg_negocios_22_so_o_portal ON public.client_contracts;
CREATE TRIGGER trg_negocios_22_so_o_portal
  BEFORE INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_so_o_portal_decide();

-- ---------------------------------------------------------------- 3. rpc_update_client_contract_status (SECURITY DEFINER)
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.rpc_update_client_contract_status(uuid,text)'::regprocedure), chr(13) || chr(10), chr(10));
  v_antes text := E'  SELECT * INTO v_before FROM public.client_contracts WHERE id = p_id;\n';
  n int;
BEGIN
  IF position('20270123000000' IN d) > 0 THEN
    RAISE NOTICE 'rpc_update_client_contract_status já tem o bloco 20270123000000: nada a fazer.';
    RETURN;
  END IF;
  n := (length(d) - length(replace(d, v_antes, ''))) / length(v_antes);
  IF n <> 1 THEN
    RAISE EXCEPTION 'rpc_update_client_contract_status: a linha «SELECT * INTO v_before FROM public.client_contracts WHERE id = p_id;» aparece % vez(es) (esperada 1). A função mudou desde 20261115150000: rever antes de aplicar 20270123000000.', n;
  END IF;
  d := replace(d, v_antes,
       E'  -- 20270123000000 início (auditoria 19/11): num negócio da Emylia só o cliente assina, no portal (service_role); daqui não passa\n'
    || E'  --   a signed / active / assinado. As outras mudanças de estado ficam como estavam.\n'
    || E'  IF p_status IN (''signed'', ''active'', ''assinado'') AND EXISTS (\n'
    || E'       SELECT 1 FROM public.client_contracts c\n'
    || E'       WHERE c.id = p_id AND c.status IS DISTINCT FROM p_status\n'
    || E'         AND public.fn_neg_documento_do_fluxo_emylia(c.negocio_id, c.adenda_id, c.quote_id)) THEN\n'
    || E'    RAISE EXCEPTION ''Só o cliente assina o contrato, no portal: num negócio da Emylia o contrato não passa a assinado por aqui.''\n'
    || E'      USING ERRCODE = ''insufficient_privilege'';\n'
    || E'  END IF;\n'
    || E'  -- 20270123000000 fim\n'
    || v_antes);
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- conferir
DO $c$
BEGIN
  IF position('20270123000000' IN pg_get_functiondef('public.rpc_update_client_contract_status(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: rpc_update_client_contract_status ficou sem o bloco 20270123000000';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_negocios_22_so_o_portal' AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: faltam os gatilhos trg_negocios_22_so_o_portal (quotes e client_contracts)';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.rpc_update_client_contract_status(uuid,text)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: rpc_update_client_contract_status deixou de ser SECURITY DEFINER';
  END IF;
END $c$;

-- Reversão do passo 3 (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.rpc_update_client_contract_status(uuid,text)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := regexp_replace(d, '  -- 20270123000000 início.*?  -- 20270123000000 fim\n', '');
--   EXECUTE d;
-- END $r$;

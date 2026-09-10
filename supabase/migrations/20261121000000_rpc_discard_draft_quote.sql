-- rpc_discard_draft_quote — descarte seguro de um orçamento rascunho vazio,
-- criado em silêncio pelo novo fluxo "diagnóstico primeiro" do QuoteBuilder
-- (Novo Orçamento cria logo um orçamento vazio para poder anexar o
-- diagnóstico Fase 1 antes do utilizador preencher qualquer coisa — ver
-- QuoteBuilder.tsx, criação silenciosa do rascunho).
--
-- Porque não usar soft_delete_business_entity('quote', id) nem um DELETE
-- client-side direto: ambos exigem a permissão quotes.delete (RLS
-- quotes_delete_policy), que um utilizador com quotes.create pode não ter —
-- ficaria sem forma de limpar o próprio rascunho vazio que acabou de criar.
-- Nenhum dos dois verifica também "está mesmo vazio"/"fui eu que criei
-- agora" — dependeria inteiramente do cliente só chamar isto no momento
-- certo, sem rede de segurança do lado do servidor.
--
-- Esta RPC só descarta quando TODAS as condições abaixo são verdadeiras —
-- caso contrário devolve false em silêncio (nunca apaga, nunca lança erro
-- visível ao utilizador por esta razão):
--   - o orçamento foi criado pelo próprio chamador (created_by = ator atual);
--   - ainda está em estado 'rascunho';
--   - a Fase 1 de diagnóstico nunca foi concluída (diagnostic_phase1_completed_at IS NULL);
--   - não tem nenhuma quote_line nem quote_fee associada.
-- DELETE físico (não soft-delete): é um rascunho que nunca existiu do ponto
-- de vista do utilizador, não faz sentido poluir a lixeira nem manter
-- deleted_at. quote_diagnostic_areas.quote_id tem ON DELETE CASCADE — a
-- limpeza das áreas de diagnóstico entretanto criadas é automática.

CREATE OR REPLACE FUNCTION public.rpc_discard_draft_quote(p_quote_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_quote public.quotes;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RETURN false; -- já não existe (ex.: chamada duplicada) — no-op silencioso
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_quote.organization_id) THEN
    RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_quote.created_by IS DISTINCT FROM v_actor
     OR v_quote.diagnostic_phase1_completed_at IS NOT NULL
     OR v_quote.estado IS DISTINCT FROM 'rascunho'
     OR EXISTS (SELECT 1 FROM public.quote_lines WHERE quote_id = p_quote_id)
     OR EXISTS (SELECT 1 FROM public.quote_fees WHERE quote_id = p_quote_id)
  THEN
    RETURN false; -- não é seguro descartar — sai em silêncio, não apaga
  END IF;

  DELETE FROM public.quotes WHERE id = p_quote_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_discard_draft_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_discard_draft_quote(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_discard_draft_quote(uuid) IS
  'Descarta em segurança um orçamento rascunho vazio criado em silêncio pelo fluxo "diagnóstico primeiro" (Novo Orçamento) do QuoteBuilder — só apaga quando criado pelo próprio chamador, ainda em rascunho, diagnóstico Fase 1 nunca concluído e sem quote_lines/quote_fees; caso contrário devolve false sem apagar nada.';

-- accept_proposal_atomic — contraparte de reject_proposal_atomic para a
-- aceitacao publica de propostas (link publico, template sem verificacao).
--
-- PORQUE
-- ------
-- `src/pages/PublicProposal.tsx` (handleDirectAccept) fazia o UPDATE da
-- aceitacao a partir do BROWSER, com a chave anon, e gravava literalmente
-- `acceptance_ip = 'client'`. Dois problemas:
--
--   1. `acceptance_ip` e uma coluna de trilho de auditoria — existe para provar
--      de onde veio a aceitacao. O browser NAO consegue saber o seu proprio IP
--      publico, por isso foi escrita uma constante. Uma constante com aspeto de
--      prova e pior do que campo vazio: quem le o registo nao distingue uma
--      deteccao genuina de um valor inventado.
--
--   2. Nao ha politica de RLS que permita UPDATE em `proposals` ao papel anon
--      (as duas politicas de UPDATE exigem `auth.uid()`), por isso esse UPDATE
--      nunca escrevia nada — e o erro era engolido em `console.warn`. O botao
--      "Aceitar" do link publico estava, na pratica, morto.
--
-- Esta funcao move a escrita para o servidor: SECURITY DEFINER, autorizada pelo
-- `public_token` da propria proposta, exactamente como `reject_proposal_atomic`
-- ja fazia para a recusa. O IP e passado pela edge function `accept-proposal`,
-- que o deriva dos cabecalhos do pedido (ver _shared/clientIp.ts) — nunca do
-- corpo do pedido, que o cliente controla.
--
-- NOTA SOBRE `p_acceptance_ip`
-- ---------------------------
-- Aceita NULL de propria vontade. Se o cabecalho nao vier, o campo fica vazio.
-- Nunca preencher com 'client', 'unknown' ou qualquer outro valor de enchimento.

CREATE OR REPLACE FUNCTION public.accept_proposal_atomic(
  p_proposal_id           uuid,
  p_public_token          text,
  p_acceptance_ip         text,
  p_acceptance_user_agent text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_proposal          proposals%ROWTYPE;
  v_accepted_stage_id uuid;
BEGIN
  SELECT * INTO v_proposal FROM proposals WHERE id = p_proposal_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta nao encontrada';
  END IF;

  -- Autorizacao pelo token publico da propria proposta. Ao contrario de
  -- reject_proposal_atomic, um token NULO nao abre um ramo alternativo: esta
  -- funcao so e alcancavel pela edge function `accept-proposal` (ver GRANT no
  -- fim do ficheiro, so service_role), e essa passa sempre o token. Menos um
  -- ramo e menos uma forma de o contornar.
  IF p_public_token IS NULL THEN
    RAISE EXCEPTION 'public_token obrigatorio' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.public_token IS NULL OR v_proposal.public_token != p_public_token THEN
    RAISE EXCEPTION 'Token invalido';
  END IF;
  IF v_proposal.public_link_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Link publico desativado';
  END IF;

  -- Idempotencia: um duplo-clique ou um reenvio nao pode reescrever o IP e a
  -- data de uma aceitacao que ja aconteceu — isso corromperia a prova.
  IF v_proposal.status IN ('accepted', 'rejected') THEN
    RETURN json_build_object('success', true, 'changed', false, 'reason', 'already_processed',
                             'status', v_proposal.status);
  END IF;

  IF v_proposal.status NOT IN ('draft', 'sent', 'pending') THEN
    RETURN json_build_object('success', false, 'changed', false, 'reason', 'invalid_status',
                             'status', v_proposal.status);
  END IF;

  -- Estagio "ganho" por flag, nunca por nome (ver _shared/proposalWorkflowStage.ts).
  SELECT id INTO v_accepted_stage_id FROM proposal_workflow_stages
    WHERE organization_id = v_proposal.organization_id AND is_active = true AND is_won = true
    ORDER BY stage_order LIMIT 1;
  IF v_accepted_stage_id IS NULL THEN
    SELECT id INTO v_accepted_stage_id FROM proposal_workflow_stages
      WHERE organization_id IS NULL AND is_active = true AND is_won = true
      ORDER BY stage_order LIMIT 1;
  END IF;

  UPDATE proposals SET
    status                = 'accepted',
    stage_id              = COALESCE(v_accepted_stage_id, stage_id),
    accepted_at           = now(),
    acceptance_ip         = p_acceptance_ip,          -- NULL e um valor legitimo
    acceptance_user_agent = p_acceptance_user_agent
  WHERE id = p_proposal_id;

  -- NOTA: `record_proposal_decision` (congelar o snapshot decidido) NAO e
  -- chamado aqui. E chamado a seguir, pela edge function `accept-proposal`,
  -- exactamente como `client-portal-action` ja faz depois de assinar: assim o
  -- congelamento e fail-soft (uma falha sua nunca desfaz uma aceitacao ja
  -- gravada) sem precisar de um bloco BEGIN/EXCEPTION aninhado aqui dentro.

  RETURN json_build_object('success', true, 'changed', true, 'status', 'accepted',
                           'acceptance_ip', p_acceptance_ip);
END;
$function$
;

-- 20270126100000 — C5 (permissões, 23/11/2026): só o portal recusa uma proposta por reject_proposal_atomic.
-- Antes: a função (SECURITY DEFINER) era executável por anon e authenticated; com p_public_token nulo só verificava se a organização da
-- proposta era visível, por isso qualquer funcionário (técnico, compras, assistente, outro comercial) recusava qualquer proposta.
-- Chamadores reais (código e base, 23/11): só as edge functions `reject-proposal` (portal, com o token) e `send-verification-code/verify`
-- (recusa com OTP), ambas com a chave de serviço. O CRM nunca a chama (lá a decisão é negocios.proposta.decidir, noutro caminho) e nenhuma
-- função SQL a chama (accept_proposal_atomic só a refere num comentário).
-- Agora: EXECUTE só para service_role (como accept_proposal_atomic). O corpo não muda (versão viva de 23/11, md5 827c9297…).
-- Nota: o send-verification-code passava token nulo com a chave de serviço (auth.uid() nulo -> «Autenticacao necessaria»): a recusa com
-- OTP estava partida e o ecrã dizia «Proposta recusada». A edge passa a mandar o token da própria proposta (deploy na mesma entrega).

REVOKE EXECUTE ON FUNCTION public.reject_proposal_atomic(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_proposal_atomic(uuid, text, text, text, text) TO service_role;

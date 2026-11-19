-- ============================================================
-- 20270123500000_modo_teste_simular_cliente_so_super_admin
-- ============================================================
-- Auditoria de 19/11 ao portal do cliente. O modo de teste estava aberto a todos.
--
-- O que estava mal
--   A migração 20270114200000 (11/11, «FERRAMENTAS-TESTE, remover antes da main») deixou qualquer membro ativo da organização do
--   documento, ou de uma acima dela, aceitar a proposta e assinar o contrato como o cliente (Edge Function client-portal-action,
--   ação «simular_cliente»), sem código por SMS. Um perfil normal (Comercial, Financeiro…) assinava pelo cliente.
--
-- O que muda
--   fn_modo_teste_simular_cliente_de(auth, org) passa a ser o modo de teste ligado E fn_super_admin_de(auth, org): o super admin da
--   organização do documento (ou de uma acima dela) ou o administrador de sistema. É a mesma regra dos outros botões de teste
--   (fn_modo_teste_para_mim, migração 20270110300000).
--   fn_modo_teste_simular_cliente_para_mim(org) chama a de cima, por isso o botão «TESTE: aceitar como o cliente» da página do
--   negócio deixa de aparecer a quem não é super admin. O super admin continua a ver e a usar «Aceitar a proposta como o cliente»
--   e «Assinar o contrato como o cliente».
--   A Edge Function já não pergunta a esta função (só a fn_super_admin_de). Esta migração alinha o ecrã com o servidor.
--
-- Não muda
--   app_modo_teste, fn_modo_teste, fn_super_admin_de, fn_modo_teste_para_mim e teste_fornecedor_confirmar ficam como estão.
--   As permissões das duas funções ficam iguais (a primeira só service_role, a segunda authenticated).
--
-- Reversão (só como migração nova): repor o corpo de fn_modo_teste_simular_cliente_de da migração 20270114200000.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_modo_teste_simular_cliente_de(p_auth uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270123500000: só o super admin (ou o administrador de sistema), com o modo de teste ligado. Um membro normal já não chega.
  SELECT public.fn_modo_teste() AND public.fn_super_admin_de(p_auth, p_org)
$function$;
REVOKE ALL ON FUNCTION public.fn_modo_teste_simular_cliente_de(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_modo_teste_simular_cliente_de(uuid, uuid) TO service_role;

-- fn_modo_teste_simular_cliente_para_mim não muda de texto: chama a função de cima.

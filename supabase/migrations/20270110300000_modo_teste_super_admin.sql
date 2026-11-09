-- 9/11 (Rúben: «por motivos de teste o super admin deve sempre ter botões para fazer ações pelo cliente e pelo fornecedor»).
-- O MODO DE TESTE: o super admin (ou o admin do sistema) da organização pode fazer, num negócio de teste, o que o cliente faz no portal
-- (aceitar a proposta, assinar o contrato) e o que o fornecedor faz no portal dele (confirmar a encomenda).
--
-- Fica DESLIGADO por omissão em todas as bases. Assinar por outra pessoa não pode existir em produção: só se liga numa base de teste,
-- com uma linha (no fim deste ficheiro, comentada):  UPDATE public.app_modo_teste SET ativo = true, nota = '...' WHERE id;
--
--  · app_modo_teste: uma só linha (ativo, nota); ninguém a lê nem escreve pela API.
--  · fn_modo_teste(): está ligado nesta base?
--  · fn_super_admin_de(auth, org): a pessoa é super admin (ou admin de sistema) desta organização ou de uma acima dela?
--  · fn_modo_teste_para_mim(org): o ecrã mostra os botões de teste? (ligado E super admin da organização)
--  · teste_fornecedor_confirmar(po): a confirmação da encomenda como o fornecedor a faz no portal (sp_confirm_order), em nome do
--    utilizador do portal ligado a essa encomenda, com o comentário a dizer que foi um teste.
-- O que o cliente faz (aceitar e assinar) fica na Edge Function client-portal-action, ação «simular_cliente», que pergunta a estas funções.

CREATE TABLE IF NOT EXISTS public.app_modo_teste (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ativo boolean NOT NULL DEFAULT false,
  nota text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_modo_teste (id, ativo) VALUES (true, false) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.app_modo_teste ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_modo_teste FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_modo_teste()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT t.ativo FROM public.app_modo_teste t WHERE t.id), false)
$function$;
REVOKE ALL ON FUNCTION public.fn_modo_teste() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_modo_teste() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_super_admin_de(p_auth uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_auth IS NOT NULL AND p_org IS NOT NULL AND (
    public.is_system_admin(p_auth)
    OR EXISTS (
      SELECT 1
      FROM public.anew_users u
      JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active' AND m.role_is_client IS NOT TRUE
      JOIN public.anew_roles r ON r.id = m.role_id
      WHERE u.auth_user_id = p_auth
        AND u.deleted_at IS NULL
        AND r.code IN ('super_admin', 'system_admin')
        AND m.organization_id IN (SELECT public.fn_org_e_ascendentes(p_org))
    )
  )
$function$;
REVOKE ALL ON FUNCTION public.fn_super_admin_de(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_super_admin_de(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_modo_teste_para_mim(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_modo_teste() AND public.fn_super_admin_de(auth.uid(), p_org)
$function$;
REVOKE ALL ON FUNCTION public.fn_modo_teste_para_mim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_modo_teste_para_mim(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.teste_fornecedor_confirmar(p_po_id uuid, p_promised_date date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po      public.purchase_orders;
  v_pub     public.supplier_po_publications;
  v_portal  uuid;
  v_n       integer;
BEGIN
  IF NOT public.fn_modo_teste() THEN
    RAISE EXCEPTION 'O modo de teste não está ligado nesta base.' USING ERRCODE = 'insufficient_privilege', HINT = 'modo_teste';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id AND deleted_at IS NULL;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.fn_super_admin_de(auth.uid(), v_po.organization_id) THEN
    RAISE EXCEPTION 'Só o super admin da organização pode confirmar pelo fornecedor (teste).' USING ERRCODE = 'insufficient_privilege', HINT = 'super_admin';
  END IF;

  SELECT * INTO v_pub FROM public.supplier_po_publications WHERE purchase_order_id = p_po_id AND status <> 'withdrawn' FOR UPDATE;
  IF v_pub.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Esta encomenda não está no portal do fornecedor.' USING ERRCODE = 'no_data_found', HINT = 'sem_portal';
  END IF;
  IF v_pub.status = 'confirmed' THEN
    RETURN jsonb_build_object('purchase_order_id', p_po_id, 'publication_status', v_pub.status, 'confirmed_at', v_pub.confirmed_at, 'already_confirmed', true);
  END IF;
  IF v_po.status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Esta encomenda já está fechada (%): não é possível confirmá-la', v_po.status USING ERRCODE = 'check_violation', HINT = 'order_closed';
  END IF;

  -- o utilizador do portal ligado a esta encomenda (como no portal: o acesso à ligação da publicação, não revogado)
  SELECT x.portal_user_id INTO v_portal
    FROM public.supplier_portal_user_access x
   WHERE x.link_id = v_pub.link_id AND x.revoked_at IS NULL
   ORDER BY x.portal_user_id LIMIT 1;

  UPDATE public.supplier_po_publications
     SET status = 'confirmed', confirmed_at = now(), confirmed_by = v_portal,
         viewed_at = COALESCE(viewed_at, now()), viewed_by = COALESCE(viewed_by, v_portal),
         promised_date = p_promised_date, supplier_comment = 'Confirmada em modo de teste pelo super admin.'
   WHERE purchase_order_id = p_po_id
  RETURNING * INTO v_pub;

  PERFORM public.fn_manual_audit_log('purchase_orders', p_po_id, v_po.organization_id, 'UPDATE',
    jsonb_build_object('supplier_publication', jsonb_build_object(
      'old', jsonb_build_object('status', 'sent'),
      'new', jsonb_build_object('status', 'confirmed', 'revision', v_pub.revision, 'promised_date', v_pub.promised_date,
                                'confirmed_by_portal_user', v_portal, 'modo_teste_por', auth.uid()))), 'modo_teste');

  v_n := public.fn_po_notify_supplier_confirmed(v_po, v_pub);

  RETURN jsonb_build_object('purchase_order_id', p_po_id, 'revision', v_pub.revision, 'publication_status', v_pub.status,
    'confirmed_at', v_pub.confirmed_at, 'promised_date', v_pub.promised_date, 'already_confirmed', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.teste_fornecedor_confirmar(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teste_fornecedor_confirmar(uuid, date) TO authenticated;

-- Só numa base de TESTE (nunca em produção):
-- UPDATE public.app_modo_teste SET ativo = true, nota = 'Base de teste (testarh): o super admin age pelo cliente e pelo fornecedor.', atualizado_em = now() WHERE id;

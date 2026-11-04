-- ============================================================
-- 20270106050000_ops_mensagem_permissao
-- ============================================================
-- O que faz (Lote A, item 7): rpc_ops_escrever_mensagem (SECURITY DEFINER, sem RLS) só verificava que a ordem era de uma organização
--   visível; a política INSERT ops_mensagem_escrever também só pedia a organização visível. Passam a exigir
--   operations.orders.view OU operations.orders.execute na organização da ordem (ops_pode, o helper das políticas de ops_ordem) e
--   poder ver a ordem (ops_pode_ver_ordem). A política exige ainda autor_id = utilizador da sessão (não se escreve em nome de outro).
--   A política ops_mensagem_write (ALL, operations.orders.execute) fica como está.
-- RPC construída a partir do texto VIVO (pg_get_functiondef na base RH, 4/11/2026); só se acrescenta o bloco 20270106050000.
--   Política reescrita a partir de pg_policies (viva). O ecrã só escreve pela RPC (grep src/: nenhum insert direto); hoje
--   authenticated nem tem GRANT INSERT em ops_mensagem, por isso a política é defesa em profundidade.
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rpc_ops_escrever_mensagem(p_ordem_id uuid, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.current_business_user_id();
  v_o     record;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_id    uuid;
  v_nome  text;
  r       record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_texto IS NULL THEN
    RAISE EXCEPTION 'A mensagem está vazia.';
  END IF;

  SELECT id, organization_id, codigo, titulo, responsavel_id
    INTO v_o
    FROM public.ops_ordem
   WHERE id = p_ordem_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270106050000: escrever na ordem pede operations.orders.view ou operations.orders.execute na organização da ordem
  -- (ops_pode: permissão do papel nessa organização + perfil de Operação ativo; system admin passa) e poder ver a ordem
  -- (ops_pode_ver_ordem, a mesma regra da política ops_ordem_select).
  IF NOT ((public.ops_pode(v_o.organization_id, 'operations.orders.view')
           OR public.ops_pode(v_o.organization_id, 'operations.orders.execute'))
          AND public.ops_pode_ver_ordem(auth.uid(), p_ordem_id)) THEN
    RAISE EXCEPTION 'Sem permissão para escrever nesta ordem (operations.orders.view ou operations.orders.execute).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_mensagem (ordem_id, canal, autor_id, texto)
  VALUES (p_ordem_id, 'interno', v_user, v_texto)
  RETURNING id INTO v_id;

  SELECT name INTO v_nome FROM public.anew_users WHERE id = v_user;

  -- O responsável e a equipa, sem repetições e sem quem escreveu.
  IF to_regprocedure('public.ops_notificar(uuid,uuid,text,text,text,text,uuid,text)')
     IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT p AS quem
        FROM (
          SELECT v_o.responsavel_id AS p
          UNION
          SELECT op.utilizador_id FROM public.ops_ordem_pessoa op
           WHERE op.ordem_id = p_ordem_id
        ) t(p)
       WHERE p IS NOT NULL AND p <> v_user
    LOOP
      PERFORM public.ops_notificar(
        v_o.organization_id, r.quem, 'operacoes_mensagem',
        v_o.codigo || ': mensagem nova',
        COALESCE(v_nome, 'Alguém') || ' — ' || left(v_texto, 120),
        '/operacao/ordens/' || v_o.codigo,
        p_ordem_id, 'medium'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$;

DROP POLICY IF EXISTS ops_mensagem_escrever ON public.ops_mensagem;
CREATE POLICY ops_mensagem_escrever ON public.ops_mensagem
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    canal = 'interno'::text
    AND autor_id = public.current_business_user_id()
    AND EXISTS (
      SELECT 1 FROM public.ops_ordem o
      WHERE o.id = ops_mensagem.ordem_id
        AND (public.ops_pode(o.organization_id, 'operations.orders.view'::text)
             OR public.ops_pode(o.organization_id, 'operations.orders.execute'::text))
        AND public.ops_pode_ver_ordem((SELECT auth.uid()), o.id)));

-- ============================================================
-- 20270106440100_notificacoes_link_livre
-- ============================================================
-- O que faz: no 20270106330000 (Lote D4) a política INSERT de notifications passou a exigir que o link fosse um caminho
--   interno da app. Isso não é uma permissão: retira-se SÓ essa condição. Ficam as partes de permissão:
--     - quem insere tem uma associação ativa não-cliente e o destinatário é o próprio ou de uma organização visível
--       (fn_notificacao_destino_permitido);
--     - organization_id nulo ou de uma organização visível a quem insere.
-- Texto anterior (vivo, 4/11/2026):
--   WITH CHECK (fn_notificacao_destino_permitido(user_id)
--     AND ((organization_id IS NULL) OR (organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))))
--     AND ((link IS NULL) OR ((left(link, 1) = '/') AND (left(link, 2) <> ALL (ARRAY['//', '/\'])))))
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

DROP POLICY IF EXISTS "Active members can insert notifications" ON public.notifications;
CREATE POLICY "Active members can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_notificacao_destino_permitido(user_id)
    AND (organization_id IS NULL
         OR organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
  );

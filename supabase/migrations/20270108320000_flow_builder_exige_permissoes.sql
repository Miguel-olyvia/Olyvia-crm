-- ============================================================
-- 20270108320000_flow_builder_exige_permissoes
-- ============================================================
-- O que faz (auditoria de permissões 05/11, P1.6):
--   As políticas de escrita de flow_builder_flows só pediam a organização (get_flow_user_org_ids): qualquer membro criava, editava
--   e apagava fluxos pela API, embora o ecrã (FlowBuilder.tsx:1580-1582) só mostre as ações com flow_builder.create/edit/delete.
--   Mantém-se a condição de organização e acrescenta-se a permissão NA organização do fluxo (ou numa acima; o admin de sistema
--   passa, como o isSystemAdmin do ecrã):
--     INSERT -> flow_builder.create
--     UPDATE -> flow_builder.edit OU flow_builder.create (o ecrã deixa a quem só tem «criar» largar nós, importar e carregar
--               modelos — paleta com canEdit || canCreate — e grava-os no «Voltar»; ninguém perde o que faz hoje)
--     DELETE -> flow_builder.delete
--   A leitura (SELECT) fica como estava.
-- Papéis verificados antes (05/11): só super_admin e system_admin têm flow_builder.*; ambos têm as três. Ninguém perde acesso.
-- Políticas reescritas a partir de pg_policies (vivas, 05/11/2026). Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

DROP POLICY IF EXISTS "Users can insert flows for their organization" ON public.flow_builder_flows;
CREATE POLICY "Users can insert flows for their organization" ON public.flow_builder_flows
  FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IN ( SELECT get_flow_user_org_ids(auth.uid()) AS get_flow_user_org_ids))
    AND public.has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.create', organization_id)
  );

DROP POLICY IF EXISTS "Users can update flows from their organization" ON public.flow_builder_flows;
CREATE POLICY "Users can update flows from their organization" ON public.flow_builder_flows
  FOR UPDATE TO authenticated
  USING (
    (organization_id IN ( SELECT get_flow_user_org_ids(auth.uid()) AS get_flow_user_org_ids))
    AND (public.has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.edit', organization_id)
         OR public.has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.create', organization_id))
  );

DROP POLICY IF EXISTS "Users can delete flows from their organization" ON public.flow_builder_flows;
CREATE POLICY "Users can delete flows from their organization" ON public.flow_builder_flows
  FOR DELETE TO authenticated
  USING (
    (organization_id IN ( SELECT get_flow_user_org_ids(auth.uid()) AS get_flow_user_org_ids))
    AND public.has_anew_permission_in_org_or_ancestor(( SELECT auth.uid() AS uid), 'flow_builder.delete', organization_id)
  );

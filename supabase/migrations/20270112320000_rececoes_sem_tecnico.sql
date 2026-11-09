-- ============================================================
-- 20270112320000 — rececoes_sem_tecnico
-- ============================================================
-- O que faz (auditoria de permissões, inventário F3 / correção B6): receiving_scans_select só exigia que a organização fosse
--   visível, por isso qualquer membro (ex.: técnico só com negocios.obra.executar + materiais) lia os registos de receção
--   por código (produto, quantidades, ligações a POs, encomendas de cliente e guias): s_tec.sql leu 21.
--   O único leitor no frontend é o ecrã de receção (Receiving.tsx, rota com ProtectedRoute permission="receiving.view"), que
--   relê os ids das leituras pendentes depois de rpc_receive_by_code (que exige receiving.receive). As escritas são todas por
--   RPC SECURITY DEFINER (a tabela só tem GRANT SELECT a authenticated).
--   Por isso a leitura passa a exigir, na organização da linha, receiving.view ou receiving.receive (além de a organização
--   continuar visível, como antes).
--
-- Reversão (só como migration nova): recriar receiving_scans_select com
--   USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'receiving_scans' AND policyname = 'receiving_scans_select' AND cmd = 'SELECT'
       AND md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) = 'f2dbafe54f6168753d05035ba797f9b3')
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'receiving_scans') <> 1 THEN
    RAISE EXCEPTION 'Guarda: as políticas de receiving_scans mudaram desde 9/11/2026. Rever esta migration.';
  END IF;
END $do$;

DROP POLICY receiving_scans_select ON public.receiving_scans;
CREATE POLICY receiving_scans_select ON public.receiving_scans
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND (
      organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'receiving.view'))
      OR organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'receiving.receive'))
    )
  );

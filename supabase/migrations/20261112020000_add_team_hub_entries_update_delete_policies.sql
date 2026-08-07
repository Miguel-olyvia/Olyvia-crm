-- Adiciona as políticas RLS de UPDATE e DELETE em falta em team_hub_entries.
--
-- Causa confirmada empiricamente (2026-08-07): a tabela team_hub_entries tem
-- RLS ativo desde a baseline, mas nunca teve política de UPDATE nem de DELETE
-- (apenas INSERT e SELECT existiam). Sem política que cubra o comando, o
-- Postgres nega por omissão e o UPDATE/DELETE afeta sempre 0 linhas — mesmo
-- para o próprio autor da entrada. No frontend, o UPDATE usa
-- `.select().single()`, e o PostgREST devolve o erro genérico
-- "Cannot coerce the result to a single JSON object" quando 0 linhas são
-- devolvidas, o que mascarava a causa real (falta de política, não um
-- problema de dados/organização).
--
-- Reproduzido em transação com ROLLBACK, autenticado como o próprio autor da
-- linha: `UPDATE team_hub_entries ... RETURNING` -> "UPDATE 0"; o mesmo teste
-- confirmou que `DELETE` também afeta 0 linhas pelo mesmo motivo.
--
-- Esta migration replica exatamente a regra de permissão já usada no
-- frontend (src/pages/TeamHub.tsx: canEditOrDelete = isAdmin || entry.author_id
-- === currentUserId) e no mesmo padrão de admin usado ali (anew_memberships +
-- anew_roles com os códigos system_admin/super_admin/org_admin/tenant_admin/
-- company_admin). Não introduz isolamento por organização porque a tabela
-- team_hub_entries não tem (e nunca teve) coluna organization_id — é um
-- espaço partilhado entre utilizadores autenticados, tal como a política de
-- SELECT existente (`USING (true)`) já refletia.

CREATE POLICY "Authors and admins can update team hub entries"
  ON "public"."team_hub_entries"
  FOR UPDATE
  TO "authenticated"
  USING (
    author_id IN (
      SELECT anew_users.id FROM anew_users
      WHERE anew_users.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM anew_memberships m
      JOIN anew_users u ON u.id = m.user_id
      JOIN anew_roles r ON r.id = m.role_id
      WHERE u.auth_user_id = auth.uid()
        AND m.status = 'active'
        AND r.code IN ('system_admin', 'super_admin', 'org_admin', 'tenant_admin', 'company_admin')
    )
  )
  WITH CHECK (
    author_id IN (
      SELECT anew_users.id FROM anew_users
      WHERE anew_users.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM anew_memberships m
      JOIN anew_users u ON u.id = m.user_id
      JOIN anew_roles r ON r.id = m.role_id
      WHERE u.auth_user_id = auth.uid()
        AND m.status = 'active'
        AND r.code IN ('system_admin', 'super_admin', 'org_admin', 'tenant_admin', 'company_admin')
    )
  );

CREATE POLICY "Authors and admins can delete team hub entries"
  ON "public"."team_hub_entries"
  FOR DELETE
  TO "authenticated"
  USING (
    author_id IN (
      SELECT anew_users.id FROM anew_users
      WHERE anew_users.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM anew_memberships m
      JOIN anew_users u ON u.id = m.user_id
      JOIN anew_roles r ON r.id = m.role_id
      WHERE u.auth_user_id = auth.uid()
        AND m.status = 'active'
        AND r.code IN ('system_admin', 'super_admin', 'org_admin', 'tenant_admin', 'company_admin')
    )
  );

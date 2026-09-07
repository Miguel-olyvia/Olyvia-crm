-- Da platform.pending_submissions.view ao role de sistema System Admin.
--
-- O Super Admin ja tinha esta permissao desde 20261116110000. O System Admin
-- nao -- so via as submissoes pendentes pelo atalho is_system_admin() dentro
-- da politica/RPC, ou seja por bypass, nao pela permissao a serio. Passa a
-- te-la explicitamente, para a pagina poder deixar de depender do bypass e
-- verificar sempre a permissao, como faz para toda a gente.
--
-- Porque o set_config: a tabela anew_role_permissions tem o trigger
-- protect_system_role_permissions, que recusa qualquer INSERT/UPDATE/DELETE
-- sobre permissoes de papeis de sistema -- excepto quando o papel do pedido e
-- service_role. Assumir esse papel DENTRO da transacao (nao a chave, o papel)
-- e a unica via legitima de mexer nas permissoes de um role de sistema por
-- migracao. E exactamente o que a migracao de Novembro fez para o Super Admin.
--
-- Idempotente (ON CONFLICT / NOT EXISTS) e aditiva: so acrescenta uma linha de
-- permissao a um role de sistema. Nada existente muda.

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO "public"."anew_role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'platform.pending_submissions.view'
FROM "public"."anew_roles" "r"
WHERE "r"."code" = 'system_admin'
  AND "r"."is_system" = true
  AND NOT EXISTS (
    SELECT 1 FROM "public"."anew_role_permissions" "arp"
    WHERE "arp"."role_id" = "r"."id"
      AND "arp"."permission_code" = 'platform.pending_submissions.view'
  );

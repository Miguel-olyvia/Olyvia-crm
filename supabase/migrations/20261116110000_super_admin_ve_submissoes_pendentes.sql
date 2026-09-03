-- O papel Super Admin passa a poder abrir a fila de submissões pendentes.
--
-- A permissão `platform.pending_submissions.view` foi criada em
-- 20261116100000 mas não estava atribuída a papel nenhum, portanto a página
-- /leads/pending-submissions continuava fechada a toda a gente -- incluindo a
-- quem administra a plataforma.
--
-- Liga-se ao papel global `super_admin`, que é onde vivem as restantes
-- permissões 'platform.*' (platform.dashboard.view, platform.users.view,
-- platform.organizations.view, ...). É o destino natural desta: quem já
-- administra a plataforma tem de poder ver a fila de revisão.
--
-- Isto NÃO abre dados novos a ninguém. O que cada pessoa vê dentro da página
-- continua limitado pela política de leitura de `form_submissions`
-- (20261116090000): só as submissões ligadas a leads e clientes dentro do seu
-- âmbito ORG / TEAM / OWNED. A permissão decide quem abre a porta; a política
-- decide o que está lá dentro.
--
-- ── Porquê o set_config ───────────────────────────────────────────────────
-- A tabela tem o trigger `protect_system_role_permissions`, que recusa
-- qualquer INSERT/UPDATE/DELETE sobre permissões de papéis com
-- `is_system = true` -- e o `super_admin` é um deles. A protecção existe para
-- que ninguém altere pela interface o que os papéis de sistema podem fazer.
--
-- A própria função abre UMA excepção: o `service_role`. É exactamente esse o
-- papel de uma migração da plataforma -- é assim que os papéis de sistema são
-- semeados de origem. Declara-se o papel explicitamente, e o terceiro
-- argumento `true` torna a definição LOCAL à transacção: desaparece no commit,
-- não deixa a sessão nem a base em estado alterado.
--
-- Idempotente: não duplica se já existir.

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO "public"."anew_role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'platform.pending_submissions.view'
FROM "public"."anew_roles" "r"
WHERE "r"."code" = 'super_admin'
  AND "r"."is_system" = true
  AND "r"."organization_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "public"."anew_role_permissions" "arp"
    WHERE "arp"."role_id" = "r"."id"
      AND "arp"."permission_code" = 'platform.pending_submissions.view'
  );

COMMIT;

-- form_submissions: a leitura passa a seguir o âmbito do utilizador.
--
-- Corrige a política `form_submissions_select_org`, criada na migration
-- 20261116070000. Essa resolvia o bloqueio (só administradores de sistema
-- conseguiam ler submissões), mas ficou errada em duas coisas:
--
--   1. Dava a ORGANIZAÇÃO INTEIRA a quem tivesse 'leads.view'. A página de
--      submissões existe para o comercial ver quais das SUAS leads e dos SEUS
--      clientes voltaram a preencher o formulário -- não as de toda a gente.
--      Quem tem âmbito "só as minhas" ou "a minha equipa" via na mesma tudo.
--   2. Só falava de leads. Uma submissão pode ficar ligada a um CLIENTE (a
--      classificação em entityScopedLookup.ts dá precedência cliente > contacto
--      > lead), e quem trata de clientes mas não de leads não via nada.
--
-- O critério passa a ser: a submissão é visível se o registo a que está ligada
-- for visível para este utilizador, com a permissão desse módulo e com o âmbito
-- que lhe está atribuído. Isso é exactamente o que `can_access_contact_row`
-- decide -- é a função que o CRM já usa para ORG / TEAM / OWNED, resolvendo os
-- overrides de âmbito por membership e os membros das equipas que a pessoa
-- lidera. Não se inventa aqui nenhuma regra de acesso nova: herda-se a que já
-- governa o registo de origem.
--
-- Consequência desejada: com âmbito OWNED, o comercial vê as submissões das
-- leads/clientes que lhe estão atribuídos ou que criou; com TEAM, também as da
-- equipa que lidera; com ORG, as da organização toda. Ou seja, o mesmo conjunto
-- de fichas que já vê nas listagens de Leads e de Clientes.
--
-- A política de administrador de sistema (`form_submissions_select`) não é
-- tocada: as políticas de RLS são permissivas e combinam-se por OU, portanto
-- quem via tudo continua a ver tudo.
--
-- O ramo 'contact' é mantido por causa do histórico: o módulo de Contactos foi
-- retirado do produto, mas as submissões antigas ligadas a contactos continuam
-- na tabela e não devem desaparecer de quem lhes tinha acesso.
--
-- Nada é destrutivo: só muda quem pode LER. Nenhuma linha é alterada, e
-- escrita, actualização e remoção ficam exactamente como estavam.

DROP POLICY IF EXISTS "form_submissions_select_org" ON "public"."form_submissions";

CREATE POLICY "form_submissions_select_org"
  ON "public"."form_submissions"
  FOR SELECT
  TO "authenticated"
  USING (
    "organization_id" IN (
      SELECT "public"."get_user_crm_org_ids"(( SELECT "auth"."uid"() ))
    )
    AND (
      (
        "target_type" = 'lead'
        AND EXISTS (
          SELECT 1
          FROM "public"."anew_leads" "l"
          WHERE "l"."id" = "form_submissions"."target_id"
            AND "public"."can_access_contact_row"(
                  "l"."organization_id", "l"."created_by", "l"."assigned_to", 'leads.view'
                )
        )
      )
      OR (
        "target_type" = 'client'
        AND EXISTS (
          SELECT 1
          FROM "public"."anew_clients" "c"
          WHERE "c"."id" = "form_submissions"."target_id"
            AND "public"."can_access_contact_row"(
                  "c"."organization_id", "c"."created_by", "c"."assigned_to", 'clients.view'
                )
        )
      )
      OR (
        "target_type" = 'contact'
        AND EXISTS (
          SELECT 1
          FROM "public"."anew_contacts" "ct"
          WHERE "ct"."id" = "form_submissions"."target_id"
            AND "public"."can_access_contact_row"(
                  "ct"."organization_id", "ct"."created_by", "ct"."assigned_to", 'contacts.view'
                )
        )
      )
    )
  );

COMMENT ON POLICY "form_submissions_select_org" ON "public"."form_submissions" IS
  'A submissão é visível a quem já vê o registo a que está ligada: mesma permissão do módulo (leads.view / clients.view / contacts.view) e mesmo âmbito ORG / TEAM / OWNED, via can_access_contact_row. É assim que a página de submissões mostra a cada comercial as SUAS leads e clientes que voltaram a preencher o formulário, e não os de toda a organização.';

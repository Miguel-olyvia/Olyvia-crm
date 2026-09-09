-- form_submissions: a leitura deixa de falar de contactos.
--
-- Substitui a política criada em 20261116080000, retirando-lhe o ramo
-- 'contact'. O módulo de Contactos foi retirado do produto -- o Contacto
-- fundiu-se no ciclo de vida da Lead -- e o caminho que grava submissões já só
-- conhece dois destinos: `create-lead/index.ts` declara
-- `existingTarget: { targetType: 'lead' | 'client' }`. Manter um ramo para
-- contactos era dar regra de acesso a uma coisa que não existe.
--
-- O critério fica:
--
--     organização é uma das do utilizador
--     E (
--        target_type='lead'   E can_access_contact_row(..., 'leads.view')
--     OU target_type='client' E can_access_contact_row(..., 'clients.view')
--     )
--
-- `can_access_contact_row` é a função que o CRM já usa para ORG / TEAM / OWNED.
-- A submissão é visível a quem já vê a ficha a que está ligada, nem mais nem
-- menos: é assim que a página de submissões mostra a cada comercial as SUAS
-- leads e os SEUS clientes que voltaram a preencher o formulário.
--
-- Efeito medido: no remoto existem 4 submissões com target_type='contact'
-- (contra 1 'client' e 1 'lead'). Essas quatro deixam de ser visíveis por esta
-- política. Não se perde nada: continuam na tabela, e a política de
-- administrador de sistema (`form_submissions_select`) não é tocada, portanto
-- continuam acessíveis a quem faz manutenção. São resíduo de um módulo que já
-- não tem sequer ecrã -- /contacts reencaminha para /leads.
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
    )
  );

COMMENT ON POLICY "form_submissions_select_org" ON "public"."form_submissions" IS
  'A submissão é visível a quem já vê a ficha a que está ligada: leads.view ou clients.view, com o âmbito ORG / TEAM / OWNED do utilizador, via can_access_contact_row. Só leads e clientes -- o módulo de Contactos já não existe.';

-- form_submissions: dar leitura a quem trabalha as leads da organização.
--
-- Estado antes desta migration: a tabela tinha UMA única política de SELECT,
-- `form_submissions_select`, com `USING (is_system_admin(auth.uid()))`. Ou seja,
-- só um administrador de sistema conseguia ler submissões. Qualquer outro
-- utilizador recebia `200 []` -- lista vazia, sem erro nenhum, o que torna o
-- problema invisível no ecrã.
--
-- Consequências medidas ao vivo na org nike, com o utilizador de teste:
--   * o separador "Formulários" da ficha da lead mostrava "Formulários (0)"
--     mesmo com uma submissão gravada e ligada a essa lead;
--   * a página de submissões pendentes (src/pages/PendingFormSubmissions.tsx),
--     que é a fila de revisão dos conflitos, aparecia sempre vazia para toda a
--     gente que não é administrador de sistema.
--
-- Esta migration ACRESCENTA uma segunda política de SELECT. Não mexe na que já
-- existe: as políticas de RLS são permissivas e combinam-se por OU, portanto o
-- administrador de sistema continua a ver tudo exactamente como via.
--
-- O critério é copiado da política que já governa as leads
-- (`anew_leads_select`), para que quem vê uma lead veja também as submissões
-- dessa lead, e nem mais nem menos:
--
--     has_anew_permission(auth.uid(), 'leads.view')
--     AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
--
-- As duas condições são necessárias. A permissão sozinha não chega, porque não
-- diz de que organização se trata; o âmbito de organização sozinho não chega,
-- porque daria submissões a quem não tem sequer acesso às leads. Juntas, o
-- alcance desta política nunca é maior do que o das leads a que dizem respeito.
--
-- Nada aqui é destrutivo: só se acrescenta leitura. Nenhuma linha muda, nenhuma
-- política existente é alterada ou removida, e escrita/actualização/remoção
-- continuam exactamente como estavam.

DROP POLICY IF EXISTS "form_submissions_select_org" ON "public"."form_submissions";

CREATE POLICY "form_submissions_select_org"
  ON "public"."form_submissions"
  FOR SELECT
  TO "authenticated"
  USING (
    "public"."has_anew_permission"("auth"."uid"(), 'leads.view')
    AND "organization_id" IN (
      SELECT "public"."get_user_crm_org_ids"("auth"."uid"())
    )
  );

COMMENT ON POLICY "form_submissions_select_org" ON "public"."form_submissions" IS
  'Leitura das submissões para quem já vê as leads da mesma organização: mesma permissão (leads.view) e mesmo âmbito de organização que anew_leads_select. Acrescentada porque a única política existente exigia administrador de sistema, o que deixava o separador Formulários e a fila de submissões pendentes vazios para toda a gente.';

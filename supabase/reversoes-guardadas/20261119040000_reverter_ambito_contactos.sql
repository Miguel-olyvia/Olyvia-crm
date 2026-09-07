-- ============================================================================
-- Reversao de 20261119030000 (ambito de dono nos contactos). POR APLICAR.
--
-- Repoe as doze politicas de anew_entity_emails, anew_entity_phones,
-- anew_entity_addresses e anew_addresses no texto que tinham antes da
-- correccao -- ou seja, o estado em que a base ja estava (contactos abertos a
-- organizacao inteira via is_entity_in_user_scope). E o mesmo compromisso de
-- 20261118040000: a reversao existe escrita de antemao, para nao se improvisar
-- SQL avulso contra o remoto se for preciso recuar.
--
-- Aplicar SO se, depois do db push da correccao, alguma conta com ambito ORG
-- deixar de ver contactos que via antes (bug, nao aperto), ou se um ecra
-- legitimo (proposta/contrato/org chart/membros) ficar sem contacto por causa
-- do aperto.
--
-- is_entity_contact_in_owner_scope NAO SE APAGA: fica orfa e inofensiva
-- (STABLE, SECURITY DEFINER, nao escreve nada, deixa de ser referida por
-- nenhuma politica), e mante-la evita ter de a recriar para voltar a tentar.
--
-- Texto reposto: 20261112520000 para os SELECT de email/telefone (atalho de
-- leads OR is_entity_in_user_scope); baseline 20260615130000 para tudo o
-- resto.
-- ============================================================================


-- -- anew_entity_emails -------------------------------------------------------
ALTER POLICY authenticated_select_anew_entity_emails ON public.anew_entity_emails
  USING (
    EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = anew_entity_emails.entity_id
        AND l.organization_id IN (
          SELECT get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
    OR is_entity_in_user_scope(entity_id, (SELECT auth.uid()))
  );

ALTER POLICY authenticated_update_anew_entity_emails ON public.anew_entity_emails
  USING (is_entity_in_user_scope(entity_id, auth.uid()));

ALTER POLICY authenticated_delete_anew_entity_emails ON public.anew_entity_emails
  USING (is_entity_in_user_scope(entity_id, auth.uid()));


-- -- anew_entity_phones -------------------------------------------------------
ALTER POLICY authenticated_select_anew_entity_phones ON public.anew_entity_phones
  USING (
    EXISTS (
      SELECT 1
      FROM public.anew_leads l
      WHERE l.entity_id = anew_entity_phones.entity_id
        AND l.organization_id IN (
          SELECT get_user_visible_org_ids((SELECT auth.uid()))
        )
    )
    OR is_entity_in_user_scope(entity_id, (SELECT auth.uid()))
  );

ALTER POLICY authenticated_update_anew_entity_phones ON public.anew_entity_phones
  USING (is_entity_in_user_scope(entity_id, auth.uid()));

ALTER POLICY authenticated_delete_anew_entity_phones ON public.anew_entity_phones
  USING (is_entity_in_user_scope(entity_id, auth.uid()));


-- -- anew_entity_addresses ----------------------------------------------------
ALTER POLICY authenticated_select_anew_entity_addresses ON public.anew_entity_addresses
  USING (is_entity_in_user_scope(entity_id, auth.uid()));

ALTER POLICY authenticated_update_anew_entity_addresses ON public.anew_entity_addresses
  USING (is_entity_in_user_scope(entity_id, auth.uid()));

ALTER POLICY authenticated_delete_anew_entity_addresses ON public.anew_entity_addresses
  USING (is_entity_in_user_scope(entity_id, auth.uid()));


-- -- anew_addresses -----------------------------------------------------------
ALTER POLICY authenticated_select_anew_addresses ON public.anew_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea
      WHERE ea.address_id = anew_addresses.id
        AND is_entity_in_user_scope(ea.entity_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.anew_org_addresses oa
      WHERE oa.address_id = anew_addresses.id
        AND oa.org_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

ALTER POLICY authenticated_update_anew_addresses ON public.anew_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea
      WHERE ea.address_id = anew_addresses.id
        AND is_entity_in_user_scope(ea.entity_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.anew_org_addresses oa
      WHERE oa.address_id = anew_addresses.id
        AND oa.org_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

ALTER POLICY authenticated_delete_anew_addresses ON public.anew_addresses
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea
      WHERE ea.address_id = anew_addresses.id
        AND is_entity_in_user_scope(ea.entity_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.anew_org_addresses oa
      WHERE oa.address_id = anew_addresses.id
        AND oa.org_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    )
  );

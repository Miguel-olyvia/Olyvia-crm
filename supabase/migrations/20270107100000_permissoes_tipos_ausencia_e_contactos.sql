-- ============================================================
-- 20270107100000_permissoes_tipos_ausencia_e_contactos
-- ============================================================
-- O que faz (aprovado pelo utilizador, 05/11/2026). Só permissões; nas policies só se ACRESCENTAM alternativas (OU),
-- ninguém perde acesso. Parte do texto vivo (pg_policies, 05/11/2026), não de ficheiros de migração antigos.
--
-- A) hr_ausencias_tipos_select: além de hr.ausencias.tipos.view, aceita hr.ausencias.pedir e hr.ausencias.pedir.outros.
--    Sem ver os tipos, quem pode pedir uma ausência não consegue escolher o tipo e o pedido fica impossível.
--    ALTER POLICY (não DROP/CREATE): a migração 20261207005000 verifica o nome desta policy.
--
-- B) authenticated_delete_anew_entity_emails / _phones: além do âmbito de leads.delete/clients.delete, aceita o âmbito
--    de leads.edit/clients.edit. Ao gravar a lead ou o cliente, o frontend apaga o contacto principal antigo e insere o
--    novo (src/utils/entityContactSync.ts:56,81); sem *.delete o DELETE falhava em silêncio e ficavam dois principais.
--    A policy RESTRICTIVE system_admin_pii_default_deny não se toca.
--
-- Sem tabelas, colunas, funções ou concessões novas.
-- Reversão (só como migration nova): repor o USING anterior (ver texto vivo acima citado em cada bloco).
-- ============================================================

SET lock_timeout = '5s';

-- A) Antes: ((deleted_at IS NULL) AND (SELECT has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.view', organization_id)))
ALTER POLICY hr_ausencias_tipos_select ON public.hr_ausencias_tipos
  USING (
    (deleted_at IS NULL)
    AND (
         (SELECT public.has_anew_permission_in_org((SELECT auth.uid() AS uid), 'hr.ausencias.tipos.view'::text, hr_ausencias_tipos.organization_id))
      OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid() AS uid), 'hr.ausencias.pedir'::text, hr_ausencias_tipos.organization_id))
      OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid() AS uid), 'hr.ausencias.pedir.outros'::text, hr_ausencias_tipos.organization_id))
    )
  );

COMMENT ON POLICY hr_ausencias_tipos_select ON public.hr_ausencias_tipos IS
  'Tipos de ausência visíveis (não apagados) para quem tem hr.ausencias.tipos.view, hr.ausencias.pedir ou hr.ausencias.pedir.outros na organização. Sem ver os tipos não se consegue pedir uma ausência (o tipo é obrigatório no pedido).';

-- B) Antes: is_entity_contact_in_owner_scope(entity_id, (SELECT crm_scope_keys('leads.delete')), (SELECT crm_scope_keys('clients.delete')))
ALTER POLICY authenticated_delete_anew_entity_emails ON public.anew_entity_emails
  USING (
       public.is_entity_contact_in_owner_scope(entity_id, (SELECT public.crm_scope_keys('leads.delete'::text)), (SELECT public.crm_scope_keys('clients.delete'::text)))
    OR public.is_entity_contact_in_owner_scope(entity_id, (SELECT public.crm_scope_keys('leads.edit'::text)), (SELECT public.crm_scope_keys('clients.edit'::text)))
  );

COMMENT ON POLICY authenticated_delete_anew_entity_emails ON public.anew_entity_emails IS
  'Apagar email da entidade no âmbito de leads.delete/clients.delete OU de leads.edit/clients.edit: ao gravar a lead/cliente o frontend substitui o email principal (apaga o antigo, insere o novo).';

ALTER POLICY authenticated_delete_anew_entity_phones ON public.anew_entity_phones
  USING (
       public.is_entity_contact_in_owner_scope(entity_id, (SELECT public.crm_scope_keys('leads.delete'::text)), (SELECT public.crm_scope_keys('clients.delete'::text)))
    OR public.is_entity_contact_in_owner_scope(entity_id, (SELECT public.crm_scope_keys('leads.edit'::text)), (SELECT public.crm_scope_keys('clients.edit'::text)))
  );

COMMENT ON POLICY authenticated_delete_anew_entity_phones ON public.anew_entity_phones IS
  'Apagar telefone da entidade no âmbito de leads.delete/clients.delete OU de leads.edit/clients.edit: ao gravar a lead/cliente o frontend substitui o telefone principal (apaga o antigo, insere o novo).';

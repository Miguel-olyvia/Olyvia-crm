-- Slide 9: explicit permissions for sensitive columns and export audit access.
-- Forward-only migration. Do not fold into the baseline.

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'clients.export_sensitive',
    'Exportar dados sensíveis de clientes',
    'Permite incluir email, telefone e NIF em exportações de clientes',
    'clients',
    'organization',
    false,
    true
  ),
  (
    'contacts.export_sensitive',
    'Exportar dados sensíveis de contactos',
    'Permite incluir email, telefone e NIF em exportações de contactos',
    'contacts',
    'organization',
    false,
    true
  ),
  (
    'quotes.export_sensitive',
    'Exportar dados sensíveis de orçamentos',
    'Permite incluir moradas e outros campos pessoais em exportações de orçamentos',
    'quotes',
    'organization',
    false,
    true
  ),
  (
    'exports.audit.view',
    'Consultar auditoria de exportações',
    'Permite consultar quem exportou dados, as colunas e o resultado',
    'security',
    'organization',
    false,
    true
  )
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    scope = EXCLUDED.scope,
    supports_scope = EXCLUDED.supports_scope,
    is_dangerous = EXCLUDED.is_dangerous,
    updated_at = now();

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.anew_roles role
JOIN public.anew_permissions permission
  ON permission.code = ANY (ARRAY[
    'clients.export_sensitive',
    'contacts.export_sensitive',
    'quotes.export_sensitive',
    'exports.audit.view'
  ]::text[])
WHERE role.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.anew_roles role
JOIN public.anew_permissions permission
  ON permission.code = 'exports.audit.view'
WHERE role.code = 'system_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

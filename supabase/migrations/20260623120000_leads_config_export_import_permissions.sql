-- Add leads.config, leads.export, leads.export_sensitive, leads.import permissions.
-- Forward-only migration. Do not fold into the baseline.

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'leads.config',
    'Configurar workflows e regras de IA de leads',
    'Permite aceder à configuração de workflow stages e agendamento IA na página de leads',
    'leads',
    'organization',
    false,
    false
  ),
  (
    'leads.export',
    'Exportar leads',
    'Permite exportar leads para XLSX',
    'leads',
    'organization',
    false,
    false
  ),
  (
    'leads.export_sensitive',
    'Exportar dados sensíveis de leads',
    'Permite incluir email, telefone e NIF em exportações de leads',
    'leads',
    'organization',
    false,
    true
  ),
  (
    'leads.import',
    'Importar leads via CSV',
    'Permite importar leads a partir de um ficheiro CSV',
    'leads',
    'organization',
    false,
    false
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

-- super_admin gets all four permissions
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.anew_roles role
JOIN public.anew_permissions permission
  ON permission.code = ANY (ARRAY[
    'leads.config',
    'leads.export',
    'leads.export_sensitive',
    'leads.import'
  ]::text[])
WHERE role.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- system_admin gets config (workflow/AI settings) but not PII export/import
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT role.id, permission.code
FROM public.anew_roles role
JOIN public.anew_permissions permission
  ON permission.code = 'leads.config'
WHERE role.code = 'system_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

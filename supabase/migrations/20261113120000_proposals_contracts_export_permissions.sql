-- Add proposals.export and client_contracts.export permissions for the
-- controlled export (export-data Edge Function) of the Proposals and
-- Contratos (client_contracts) modules.
--
-- Unlike clients/contacts/quotes/leads, neither module gets a matching
-- `*.export_sensitive` permission: no exported column is marked sensitive
-- (product decision — no proposal column is personal data, and the
-- contracts EMAIL column is already visible in the UI to anyone with
-- client_contracts.view, so exporting it reveals nothing new). The export
-- Edge Function config (exportConfig.ts) reuses the base permission as the
-- "sensitive" permission for both modules, since it is never actually
-- checked against a sensitive column.
--
-- Confirmed against the live anew_permissions/anew_role_permissions tables
-- before writing this migration: 'proposals.export' and
-- 'client_contracts.export' do not exist yet, and the base *.export
-- permission for the four existing controlled-export modules (clients,
-- contacts, quotes, leads) is granted to system_admin, super_admin, and
-- every org_admin/org_editor/... custom role that already has
-- 'clients.export' — so the same footprint is mirrored here instead of only
-- granting super_admin (which would leave every existing org admin unable to
-- export proposals/contracts, unlike every other export today).
--
-- Forward-only migration. Do not fold into the baseline.

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'proposals.export',
    'Exportar propostas',
    'Permite exportar propostas para XLSX',
    'proposals',
    'organization',
    false,
    false
  ),
  (
    'client_contracts.export',
    'Exportar contratos',
    'Permite exportar contratos para XLSX, incluindo o email de contacto do cliente já visível na tabela',
    'client_contracts',
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

-- Mirror the exact role footprint that 'clients.export' already has today —
-- every role (system or per-organization) holding 'clients.export' gets
-- 'proposals.export' and 'client_contracts.export' too.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT arp.role_id, 'proposals.export'
FROM public.anew_role_permissions arp
WHERE arp.permission_code = 'clients.export'
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT arp.role_id, 'client_contracts.export'
FROM public.anew_role_permissions arp
WHERE arp.permission_code = 'clients.export'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

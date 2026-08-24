-- Reconciliação de histórico: esta migration já estava aplicada na BD remota
-- (aplicada diretamente, fora deste repositório local) quando se detetou o
-- desfasamento ao tentar fazer push do fix de sincronização de
-- proposals.value. Reconstruída a partir da inspeção do estado real em
-- anew_role_permissions (o role "Org Admin" da organização "Grupo BMLar" já
-- tem estas 4 permissões `*.export_sensitive`). INSERT com
-- ON CONFLICT DO NOTHING é idempotente — não tem qualquer efeito adicional.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT 'ed68a691-4f5c-4e77-90ae-1647492629bd'::uuid, code
FROM (VALUES
  ('clients.export_sensitive'),
  ('contacts.export_sensitive'),
  ('leads.export_sensitive'),
  ('quotes.export_sensitive')
) AS v(code)
ON CONFLICT (role_id, permission_code) DO NOTHING;

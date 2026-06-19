DROP POLICY IF EXISTS "portal_users_can_read_documents" ON storage.objects;

CREATE POLICY "portal_users_can_read_documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND split_part(name, '/', 1) <> ''
  AND split_part(name, '/', 2) IN ('contract', 'proposal', 'quote')
  AND split_part(name, '/', 3) <> ''
  AND EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    WHERE cpu.auth_user_id = auth.uid()
      AND cpu.organization_id::text = split_part(name, '/', 1)
      AND (
        (
          split_part(name, '/', 2) = 'contract'
          AND cpu.contract_id::text = split_part(name, '/', 3)
        )
        OR (
          split_part(name, '/', 2) = 'proposal'
          AND cpu.proposal_id::text = split_part(name, '/', 3)
        )
        OR (
          split_part(name, '/', 2) = 'quote'
          AND cpu.quote_id::text = split_part(name, '/', 3)
        )
      )
  )
);

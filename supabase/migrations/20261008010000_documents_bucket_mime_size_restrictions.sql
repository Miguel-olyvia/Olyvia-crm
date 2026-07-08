-- Restrict the "documents" Supabase Storage bucket to an allow-list of MIME
-- types and enforce a 20MB max file size, mirroring the client-side upload
-- validation added to ContractsDocumentsView.tsx and DocumentsTab.tsx.
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ],
  file_size_limit = 20971520
WHERE id = 'documents';

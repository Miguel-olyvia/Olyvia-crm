-- Restrict the "company-logos" Supabase Storage bucket to an allow-list of
-- MIME types and enforce a 5MB max file size, mirroring the client-side
-- upload validation added to DocumentHeaderSettings.tsx and
-- ProposalTemplateEditor.tsx. Also drops image/svg+xml from the previous
-- allow-list, since SVG uploads can embed scripts and are an XSS risk.
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp'
  ],
  file_size_limit = 5242880
WHERE id = 'company-logos';

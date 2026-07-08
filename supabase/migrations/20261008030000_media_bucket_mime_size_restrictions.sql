-- Restrict the "media" Supabase Storage bucket to an allow-list of MIME
-- types and enforce a 100MB max file size, mirroring the client-side upload
-- validation added to Gallery.tsx.
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ],
  file_size_limit = 104857600
WHERE id = 'media';

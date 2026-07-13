/**
 * Server-side-safe file naming for Supabase Storage uploads.
 *
 * NEVER build a Storage path from the raw `file.name` reported by the
 * browser: it is fully attacker-controlled and can contain path traversal
 * sequences (`../../etc/passwd`), null bytes, or other special characters,
 * and can collide with existing files. Always generate the stored file name
 * here, and keep the original name only as display metadata in the DB row
 * (e.g. a `file_name` column), never as part of the Storage path.
 */

// Known-safe MIME type -> extension mapping. Extend as new upload types are
// supported. Deliberately excludes executable/markup types (html, svg, js).
const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/**
 * Resolves a safe extension for a File, derived primarily from the browser
 * reported MIME type (`file.type`), never trusted blindly from `file.name`.
 * Falls back to a heavily sanitized (alphanumeric only, capped length)
 * version of the original extension when the MIME type is not recognized.
 */
export function getSafeFileExtension(file: File): string {
  const mimeExt = MIME_TO_EXTENSION[file.type];
  if (mimeExt) return mimeExt;

  const rawExt = file.name.split(".").pop() || "";
  const sanitized = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return sanitized || "bin";
}

/**
 * Generates a random, collision-resistant, path-traversal-safe file name
 * (UUID + validated extension). Use this instead of `file.name` whenever
 * building a Supabase Storage path.
 */
export function generateSecureFileName(file: File): string {
  const ext = getSafeFileExtension(file);
  const id = crypto.randomUUID();
  return `${id}.${ext}`;
}

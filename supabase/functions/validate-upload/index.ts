import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEAD_BYTES_TO_READ = 64;

type QuarantineBucket = "documents-quarantine" | "company-logos-quarantine" | "media-quarantine";
type FinalBucket = "documents" | "company-logos" | "media";

interface ValidateUploadRequestBody {
  quarantineBucket: QuarantineBucket;
  finalBucket: FinalBucket;
  path: string;
}

const QUARANTINE_TO_FINAL_BUCKET: Record<QuarantineBucket, FinalBucket> = {
  "documents-quarantine": "documents",
  "company-logos-quarantine": "company-logos",
  "media-quarantine": "media",
};

const ALLOWED_SIGNATURES_BY_BUCKET: Record<FinalBucket, ReadonlySet<string>> = {
  documents: new Set(["pdf", "zip-office", "ole2-office", "png", "jpeg", "gif", "webp"]),
  "company-logos": new Set(["png", "jpeg", "webp"]),
  media: new Set(["png", "jpeg", "gif", "webp", "mp4", "webm", "mp3", "pdf", "zip-office", "ole2-office"]),
};

function bytesStartWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Detects the real file type from its binary signature (magic bytes), ignoring
 * whatever MIME type the client claims. Returns a signature category or null
 * when nothing recognized is found.
 */
export function detectSignature(bytes: Uint8Array): string | null {
  if (bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  if (bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip-office";
  if (bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole2-office";
  // MP4's signature lives at byte offset 4 ("ftyp"), not at byte 0.
  if (bytesStartWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "mp4";
  if (bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (
    bytesStartWith(bytes, [0xff, 0xfb]) ||
    bytesStartWith(bytes, [0xff, 0xf3]) ||
    bytesStartWith(bytes, [0xff, 0xf2]) ||
    bytesStartWith(bytes, [0x49, 0x44, 0x33])
  ) {
    return "mp3";
  }
  return null;
}

export function isSignatureAllowedForBucket(signature: string | null, finalBucket: string): boolean {
  if (!signature) return false;
  const allowed = ALLOWED_SIGNATURES_BY_BUCKET[finalBucket as FinalBucket];
  return allowed ? allowed.has(signature) : false;
}

function isValidRequestBody(body: unknown): body is ValidateUploadRequestBody {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.path !== "string" || candidate.path.length === 0) return false;
  if (typeof candidate.quarantineBucket !== "string") return false;
  if (typeof candidate.finalBucket !== "string") return false;

  const expectedFinalBucket = QUARANTINE_TO_FINAL_BUCKET[candidate.quarantineBucket as QuarantineBucket];
  return !!expectedFinalBucket && expectedFinalBucket === candidate.finalBucket;
}

/**
 * Reads only the first `byteCount` bytes of a private storage object through
 * the Storage REST API with a Range header, so a 100MB media file never has
 * to be fully downloaded just to inspect its magic bytes. Some intermediaries
 * strip Range support and reply 200 with the full body instead of 206; the
 * reader below is stopped as soon as enough bytes are collected either way,
 * so the rest of the stream is never pulled into memory.
 */
async function readObjectHeadBytes(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucket: string,
  path: string,
  byteCount: number,
): Promise<Uint8Array> {
  const objectUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
  const response = await fetch(objectUrl, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Range: `bytes=0-${byteCount - 1}`,
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to read quarantined object head bytes: ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalRead = 0;

  while (totalRead < byteCount) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalRead += value.length;
  }

  await reader.cancel().catch(() => {});

  const merged = new Uint8Array(Math.min(totalRead, byteCount));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = merged.length - offset;
    if (remaining <= 0) break;
    const slice = chunk.subarray(0, remaining);
    merged.set(slice, offset);
    offset += slice.length;
  }

  return merged;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    try {
      await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const body = await req.json();
    if (!isValidRequestBody(body)) {
      return new Response(
        JSON.stringify({ error: "quarantineBucket, finalBucket e path são obrigatórios e devem corresponder a um par válido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { quarantineBucket, finalBucket, path } = body;

    let signature: string | null;
    try {
      const headBytes = await readObjectHeadBytes(
        supabaseUrl,
        supabaseServiceKey,
        quarantineBucket,
        path,
        HEAD_BYTES_TO_READ,
      );
      signature = detectSignature(headBytes);
    } catch (error) {
      console.error("validate-upload: failed to read object head bytes:", error);
      return new Response(
        JSON.stringify({ error: "Não foi possível ler o ficheiro em quarentena." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isSignatureAllowedForBucket(signature, finalBucket)) {
      try {
        await supabase.storage.from(quarantineBucket).remove([path]);
      } catch (error) {
        console.error("validate-upload: failed to remove rejected quarantined object:", error);
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Conteúdo do ficheiro não corresponde a um tipo permitido." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The signature is confirmed valid before the full object is downloaded,
    // so bandwidth is never spent moving a file that would just be rejected.
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(quarantineBucket)
        .download(path);

      if (downloadError || !fileData) {
        throw downloadError || new Error("Empty download result");
      }

      const { error: uploadError } = await supabase.storage
        .from(finalBucket)
        .upload(path, fileData, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Only remove from quarantine after the final bucket upload succeeds,
      // so a failure here never leaves the file unreachable in either bucket.
      const { error: removeError } = await supabase.storage.from(quarantineBucket).remove([path]);
      if (removeError) {
        console.error("validate-upload: failed to clean up quarantined object after move:", removeError);
      }

      return new Response(
        JSON.stringify({ ok: true, finalPath: path }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("validate-upload: failed to move object to final bucket:", error);
      return new Response(
        JSON.stringify({ error: "Falha ao mover o ficheiro validado para o destino final." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error: unknown) {
    console.error("validate-upload error:", error);
    const message = error instanceof Error ? error.message : "Falha ao validar upload";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

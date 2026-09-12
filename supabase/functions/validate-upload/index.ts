import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, validateOrgScope } from "../_shared/auth.ts";
import { orgScoped, type OrgScopedQueryBuilder } from "../_shared/orgScopedQuery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEAD_BYTES_TO_READ = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QuarantineBucket =
  | "documents-quarantine"
  | "company-logos-quarantine"
  | "media-quarantine"
  | "hr-documentos-quarantine";
type FinalBucket = "documents" | "company-logos" | "media" | "hr-documentos";

interface ValidateUploadRequestBody {
  quarantineBucket: QuarantineBucket;
  finalBucket: FinalBucket;
  path: string;
}

const QUARANTINE_TO_FINAL_BUCKET: Record<QuarantineBucket, FinalBucket> = {
  "documents-quarantine": "documents",
  "company-logos-quarantine": "company-logos",
  "media-quarantine": "media",
  "hr-documentos-quarantine": "hr-documentos",
};

const ALLOWED_SIGNATURES_BY_BUCKET: Record<FinalBucket, ReadonlySet<string>> = {
  documents: new Set(["pdf", "zip-office", "ole2-office", "png", "jpeg", "gif", "webp"]),
  "company-logos": new Set(["png", "jpeg", "webp"]),
  media: new Set(["png", "jpeg", "gif", "webp", "mp4", "webm", "mp3", "pdf", "zip-office", "ole2-office"]),
  // Sem HEIC aqui de proposito: detectSignature nao sabe reconhecer esse
  // formato, e aceitar um mime type que a validacao binaria nunca confirma
  // deixaria esse tipo passar sem confirmacao real.
  "hr-documentos": new Set(["pdf", "png", "jpeg"]),
};

/**
 * Formata os bytes de um digest (ex.: SHA-256) como hexadecimal minusculo,
 * o mesmo formato que pessoas_documentos_ficheiro_hash_formato exige.
 */
function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
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

    // Every upload path is namespaced as `${organizationId}/...` (see DocumentsTab,
    // Gallery, DocumentHeaderSettings, ProposalTemplateEditor, ContractsDocumentsView).
    // Without this check any authenticated caller who knows/guesses another
    // organization's quarantined path could promote it into the shared final bucket.
    const pathOrgId = path.split("/")[0];
    const hasOrgScope = pathOrgId ? await validateOrgScope(supabase, caller, pathOrgId) : false;
    if (!hasOrgScope) {
      return new Response(
        JSON.stringify({ error: "Não tem permissão para validar este ficheiro." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // hr-documentos exige verificações a mais além do escopo de organização
    // genérico acima: nunca chamado por service_role/cron directamente (tem
    // de haver sempre um utilizador real por trás de um anexo de RH), a
    // permissão de documentos de RH de quem carrega, que a pessoa da 2ª pasta
    // pertença mesmo à organização da 1ª (a política de storage em
    // 20261130055000 só consegue impor a FORMA do caminho, não essa relação,
    // que só é visível a partir da tabela `pessoas`), e que o DOCUMENTO da 3ª
    // pasta exista, pertença à mesma pessoa/organização e ainda esteja à
    // espera de assinatura — confirmado ANTES de tocar no bucket final, para
    // nunca sequer tentar fazer upload por cima do ficheiro de um documento
    // já assinado (só a RPC repete esta verificação depois seria tarde
    // demais: o objecto já estaria substituído em hr-documentos).
    let documentoId: string | null = null;
    if (finalBucket === "hr-documentos") {
      if (caller.isServiceRole) {
        return new Response(
          JSON.stringify({ error: "hr-documentos exige um utilizador real, não service_role/cron." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const [orgId, pessoaId, docId] = path.split("/");
      if (!orgId || !pessoaId || !docId || !UUID_RE.test(orgId) || !UUID_RE.test(pessoaId) || !UUID_RE.test(docId)) {
        return new Response(
          JSON.stringify({ error: "Caminho inválido para hr-documentos: esperava-se organização/pessoa/documento/ficheiro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      documentoId = docId;

      const { data: hasHrPermission, error: erroPermissao } = await supabase.rpc("has_anew_permission_in_org", {
        _auth_uid: caller.authUid,
        _permission_code: "hr.pessoas.documentos.edit",
        _organization_id: orgId,
      });
      if (erroPermissao) {
        console.error("validate-upload: has_anew_permission_in_org failed:", erroPermissao);
        return new Response(
          JSON.stringify({ error: "Não foi possível confirmar a permissão." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (hasHrPermission !== true) {
        return new Response(
          JSON.stringify({ error: "Sem permissão hr.pessoas.documentos.edit nesta organização." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // REGRA CRÍTICA do projecto: toda a query com SUPABASE_SERVICE_ROLE_KEY
      // contra uma tabela com organization_id tem de filtrar explicitamente
      // por essa organização — orgScoped() rebenta em vez de devolver linhas
      // de outra organização quando o id vem vazio.
      //
      // orgScoped() espera um cliente cujo from() já devolva algo com .eq() —
      // o builder do supabase-js só ganha .eq() DEPOIS de .select(), por isso
      // a adaptação é aqui (mesmo padrão de criar-acesso-pessoa).
      const orgScopedSelect = (tabela: string, colunas: string) =>
        orgScoped(
          {
            from: (t: string) =>
              supabase.from(t).select(colunas) as unknown as OrgScopedQueryBuilder,
          },
          tabela,
          orgId,
          // deno-lint-ignore no-explicit-any
        ) as any;

      const { data: pessoaNaOrg, error: erroPessoa } = await orgScopedSelect("pessoas", "id")
        .eq("id", pessoaId)
        .is("deleted_at", null)
        .maybeSingle();

      if (erroPessoa) {
        console.error("validate-upload: falha ao confirmar organização da pessoa:", erroPessoa);
        return new Response(
          JSON.stringify({ error: "Não foi possível confirmar a organização da pessoa." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!pessoaNaOrg) {
        return new Response(
          JSON.stringify({ error: "A pessoa do caminho não pertence a esta organização." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Confirma o documento ANTES de tocar no Storage: nunca chegar a fazer
      // upload por cima do ficheiro de um documento já assinado ou anulado.
      // A RPC (chamada só depois de promover) volta a verificar isto — mas a
      // essa altura o objecto em hr-documentos já teria sido escrito.
      const { data: documento, error: erroDocumento } = await orgScopedSelect(
        "pessoas_documentos",
        "id, pessoa_id, estado",
      )
        .eq("id", documentoId)
        .is("deleted_at", null)
        .maybeSingle();

      if (erroDocumento) {
        console.error("validate-upload: falha ao confirmar o documento:", erroDocumento);
        return new Response(
          JSON.stringify({ error: "Não foi possível confirmar o documento." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!documento || documento.pessoa_id !== pessoaId) {
        return new Response(
          JSON.stringify({ error: "O documento do caminho não existe ou não pertence a esta pessoa/organização." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (documento.estado !== "a_aguardar_assinatura") {
        return new Response(
          JSON.stringify({ error: "Só se anexa ficheiro a um documento a aguardar assinatura." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

      // hr-documentos nunca faz upsert: o segmento final do caminho é sempre
      // um uuid novo gerado pelo cliente a cada upload, por isso um caminho
      // já existente só pode significar uma tentativa de escrever exactamente
      // por cima de um objecto já promovido (nomeadamente o de um documento
      // já assinado) — upsert:true aceitaria essa sobreposição silenciosamente.
      const { error: uploadError } = await supabase.storage
        .from(finalBucket)
        .upload(path, fileData, { upsert: finalBucket !== "hr-documentos" });

      if (uploadError) {
        throw uploadError;
      }

      // hr-documentos: liga o ficheiro já promovido ao registo em
      // pessoas_documentos, via a única porta de escrita que existe para essa
      // coluna (ficheiro_caminho tem UPDATE bloqueado a authenticated por
      // política). O hash é calculado aqui a partir do MESMO objecto já
      // descarregado para a cópia acima — não se lê o ficheiro uma segunda
      // vez só para o hash.
      if (finalBucket === "hr-documentos" && documentoId) {
        const hashBytes = await crypto.subtle.digest("SHA-256", await fileData.arrayBuffer());
        const hashHex = toHex(hashBytes);

        const { data: caminhoAnterior, error: anexarError } = await supabase.rpc(
          "rpc_hr_documento_anexar_ficheiro",
          {
            p_documento_id: documentoId,
            p_ficheiro_caminho: path,
            p_ficheiro_hash_sha256: hashHex,
            p_auth_uid: caller.authUid,
          },
        );

        if (anexarError) {
          console.error("validate-upload: rpc_hr_documento_anexar_ficheiro failed:", anexarError);
          // O ficheiro já está no bucket final mas sem registo ligado a ele:
          // remove-o, para não deixar um objecto órfão que ninguém consegue
          // alcançar (não há política de SELECT em hr-documentos). upsert
          // era false, por isso este objecto foi mesmo criado agora por nós
          // — removê-lo nunca apaga bytes de outro documento.
          const { error: cleanupError } = await supabase.storage.from(finalBucket).remove([path]);
          if (cleanupError) {
            console.error("validate-upload: failed to clean up orphaned hr-documentos object:", cleanupError);
          }
          return new Response(
            JSON.stringify({ error: "Não foi possível anexar o ficheiro ao documento." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Um novo anexo antes de assinar SUBSTITUI o anterior no registo; o
        // OBJECTO antigo em hr-documentos fica órfão (sem política de SELECT,
        // ninguém o alcançaria) a menos que seja apagado aqui. A RPC devolve
        // o caminho anterior (NULL na 1ª vez) exactamente para isto.
        if (typeof caminhoAnterior === "string" && caminhoAnterior && caminhoAnterior !== path) {
          const { error: erroLimpezaAntigo } = await supabase.storage.from(finalBucket).remove([caminhoAnterior]);
          if (erroLimpezaAntigo) {
            console.error("validate-upload: failed to clean up superseded hr-documentos object:", erroLimpezaAntigo);
          }
        }
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

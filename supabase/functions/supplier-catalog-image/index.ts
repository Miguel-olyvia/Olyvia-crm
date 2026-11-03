/**
 * supplier-catalog-image — fotos dos artigos do catálogo do fornecedor (Portal do Fornecedor).
 *
 * Quem chama (Authorization: Bearer <JWT>): o titular (owner) da conta do portal do fornecedor dona do
 * artigo. As regras finais são da BD, avaliadas com o JWT de quem pede (sp_catalog_image_* →
 * fn_sp_actor + role owner + artigo da própria conta). Chaves de serviço / segredo do cron são
 * recusados: tem de haver uma pessoa.
 *
 * Ações:
 *   upload  (multipart/form-data: action=upload, catalog_item_id, file)
 *     Pré-verificação (antes de escrever no bucket): artigo existe, quem pede é titular ativo da conta
 *     dele, artigo com menos de 4 fotos. Bytes ≤ 5 MB, tipo pelos magic bytes (JPEG/PNG/WEBP; HEIC e
 *     o resto recusados). Grava no bucket público supplier-catalog-images (service_role) em
 *     {supplier_account_id}/{catalog_item_id}/{uuid}.{ext} e regista com sp_catalog_image_register
 *     (JWT de quem pede; volta a validar tudo). Se o registo falhar, o objeto é apagado.
 *     200 { success, path, public_url, mime_type, size_bytes, already_registered, item }
 *   remove  (JSON { action, catalog_item_id, path })
 *     sp_catalog_image_remove (JWT de quem pede) tira a foto da lista e devolve o caminho validado; a
 *     Edge apaga o objeto (também limpa um órfão do mesmo artigo).
 *     200 { success, removed, storage_deleted, item }
 *   reorder (JSON { action, catalog_item_id, paths[] })  — permutação das fotos atuais; a 1.ª é a principal.
 *     200 { success, item }
 *
 * item = fn_sp_catalog_item_json (inclui image_paths). Erros: { error: <código>, message: <texto PT> }:
 *   401 unauthorized · 403 human_required | not_owner | no_supplier_access · 404 not_found ·
 *   400 validation | empty_file · 409 limit · 413 file_too_large · 415 file_type_not_allowed ·
 *   429 rate limit · 500 upload_failed | rpc_error | internal_error.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { resolveCallerIdentity, AuthError, getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeadersExtended } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitAttempt, rateLimitResponse } from "../_shared/rateLimit.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import {
  BUCKET,
  MAX_FILE_BYTES,
  MAX_IMAGES_PER_ITEM,
  MULTIPART_OVERHEAD_BYTES,
  buildStoragePath,
  checkImage,
  jsonActionSchema,
  isServiceCredential,
  rpcErrorBody,
  uploadFieldsSchema,
} from "./logic.ts";

initSentry();

const FN = "supplier-catalog-image";
const LIMITS = {
  upload: { maxAttempts: 120, windowMinutes: 60 },
  edit: { maxAttempts: 300, windowMinutes: 60 },
} as const;

type Json = Record<string, unknown>;

serve(async (req: Request) => {
  const cors = getCorsHeadersExtended(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (status: number, body: Json) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", message: "Método não suportado." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // deno-lint-ignore no-explicit-any
  let svc: any;
  let uploadedPath: string | null = null;

  try {
    svc = createClient(supabaseUrl, getServiceRoleKey(), { auth: { autoRefreshToken: false, persistSession: false } });

    // ── Quem chama ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (isServiceCredential(authHeader.replace("Bearer ", ""))) {
      return json(403, { error: "human_required", message: "Esta ação tem de ser feita por uma pessoa." });
    }
    let authUid = "";
    try {
      const caller = await resolveCallerIdentity(req, svc);
      if (caller.isServiceRole) {
        return json(403, { error: "human_required", message: "Esta ação tem de ser feita por uma pessoa." });
      }
      authUid = caller.authUid;
    } catch (e) {
      // Sem perfil interno (anew_users): o normal para um utilizador do portal do fornecedor.
      if (e instanceof AuthError && e.status === 403) {
        const { data, error } = await svc.auth.getUser(authHeader.replace("Bearer ", ""));
        if (error || !data?.user) return json(401, { error: "unauthorized", message: "Sessão inválida ou expirada." });
        authUid = data.user.id;
      } else if (e instanceof AuthError) {
        return json(e.status, { error: "unauthorized", message: "Sessão inválida ou expirada." });
      } else {
        throw e;
      }
    }

    // Cliente com o JWT de quem pede: as RPCs avaliam-no (fn_sp_actor).
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const limit = async (bucketKey: keyof typeof LIMITS): Promise<Response | null> => {
      const bucket = `${FN}:${bucketKey}`;
      const rl = await checkRateLimit(svc, { bucket, identifier: authUid, ...LIMITS[bucketKey] });
      if (!rl.allowed) return rateLimitResponse(rl, cors);
      await recordRateLimitAttempt(svc, bucket, authUid);
      return null;
    };

    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    // ── upload ─────────────────────────────────────────────────────────────
    if (contentType.startsWith("multipart/form-data")) {
      const declared = Number(req.headers.get("content-length") || "0");
      if (declared > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
        return json(413, { error: "file_too_large", message: "A foto tem de ter até 5 MB." });
      }
      const rl = await limit("upload");
      if (rl) return rl;

      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return json(400, { error: "validation", message: "Pedido inválido." });
      }
      const file = form.get("file");
      const parsed = uploadFieldsSchema.safeParse({
        action: form.get("action"),
        catalog_item_id: form.get("catalog_item_id"),
      });
      if (!parsed.success || !(file instanceof File)) {
        return json(400, { error: "validation", message: "Pedido inválido." });
      }
      const input = parsed.data;
      if (file.size > MAX_FILE_BYTES) {
        return json(413, { error: "file_too_large", message: "A foto tem de ter até 5 MB." });
      }

      // Pré-verificação (antes de escrever no bucket). A BD volta a validar tudo no registo.
      const notFound = () => json(404, { error: "not_found", message: "Artigo não encontrado." });
      const { data: item, error: itemErr } = await svc
        .from("supplier_catalog_items")
        .select("id, supplier_account_id, image_paths")
        .eq("id", input.catalog_item_id)
        .maybeSingle();
      if (itemErr) throw new Error("supplier_catalog_items lookup failed");
      if (!item) return notFound();
      const { data: pu, error: puErr } = await svc
        .from("supplier_portal_users")
        .select("role")
        .eq("auth_user_id", authUid)
        .eq("supplier_account_id", item.supplier_account_id)
        .eq("status", "active")
        .maybeSingle();
      if (puErr) throw new Error("supplier_portal_users lookup failed");
      if (!pu) return notFound(); // não diz que o artigo existe a quem não é da conta
      if (pu.role !== "owner") {
        return json(403, { error: "not_owner", message: "Só o utilizador principal da conta pode alterar o catálogo." });
      }
      if (Array.isArray(item.image_paths) && item.image_paths.length >= MAX_IMAGES_PER_ITEM) {
        return json(409, { error: "limit", message: `Cada artigo pode ter no máximo ${MAX_IMAGES_PER_ITEM} fotos.` });
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkImage(bytes);
      if (!check.ok) return json(check.status, { error: check.error, message: check.message });

      const path = buildStoragePath(String(item.supplier_account_id), String(item.id), crypto.randomUUID(), check.type.ext);
      const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, {
        contentType: check.type.mime,
        upsert: false,
        // Curto de propósito: uma foto removida não deve ficar meses no CDN.
        cacheControl: "3600",
      });
      if (upErr) {
        console.error(`[${FN}] upload falhou:`, upErr.message);
        return json(500, { error: "upload_failed", message: "Não foi possível guardar a foto. Tente novamente." });
      }
      uploadedPath = path;

      const { data: reg, error: regErr } = await asUser.rpc("sp_catalog_image_register", {
        p_catalog_item_id: item.id,
        p_path: path,
      });
      if (regErr) {
        await svc.storage.from(BUCKET).remove([path]).catch(() => undefined);
        uploadedPath = null;
        const r = rpcErrorBody(regErr);
        return json(r.status, r.body);
      }
      uploadedPath = null;

      const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
      return json(200, {
        success: true,
        path,
        public_url: pub?.publicUrl ?? null,
        mime_type: check.type.mime,
        size_bytes: bytes.byteLength,
        already_registered: reg?.already_registered === true,
        item: reg?.item ?? null,
      });
    }

    // ── ações JSON ─────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "validation", message: "Pedido inválido." });
    }
    const parsed = jsonActionSchema.safeParse(body);
    if (!parsed.success) {
      return json(400, { error: "validation", message: "Pedido inválido." });
    }
    const input = parsed.data;
    const rl = await limit("edit");
    if (rl) return rl;

    if (input.action === "remove") {
      const { data: res, error } = await asUser.rpc("sp_catalog_image_remove", {
        p_catalog_item_id: input.catalog_item_id,
        p_path: input.path,
      });
      if (error) {
        const r = rpcErrorBody(error);
        return json(r.status, r.body);
      }
      // A BD só devolve storage_path depois de validar o prefixo da conta/artigo de quem pede.
      let storageDeleted = false;
      const sp = typeof res?.storage_path === "string" ? res.storage_path : null;
      if (sp && sp === input.path) {
        const { error: rmErr } = await svc.storage.from(BUCKET).remove([sp]);
        if (rmErr) console.error(`[${FN}] remover objeto falhou:`, rmErr.message);
        storageDeleted = !rmErr;
      }
      return json(200, {
        success: true,
        removed: res?.removed === true,
        storage_deleted: storageDeleted,
        item: res?.item ?? null,
      });
    }

    // reorder
    const { data: res, error } = await asUser.rpc("sp_catalog_image_reorder", {
      p_catalog_item_id: input.catalog_item_id,
      p_paths: input.paths,
    });
    if (error) {
      const r = rpcErrorBody(error);
      return json(r.status, r.body);
    }
    return json(200, { success: true, item: res?.item ?? null });
  } catch (err) {
    if (uploadedPath && svc) {
      await svc.storage.from(BUCKET).remove([uploadedPath]).catch(() => undefined);
    }
    console.error(`[${FN}] erro:`, err instanceof Error ? err.message : "erro");
    await captureError(err, { function: FN });
    return json(500, { error: "internal_error", message: "Erro interno. Tente novamente." });
  }
});

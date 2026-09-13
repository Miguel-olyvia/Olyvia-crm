import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { z } from "npm:zod";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { orgScoped, type OrgScopedQueryBuilder } from "../_shared/orgScopedQuery.ts";

initSentry();

// RGPD Art. 17 — right to erasure. Step 2 of 2 (approval + execution).
//
// Only an active super_admin of the request's organization_id, or a
// system_admin, may decide a pending request — and never the requester
// themselves (mirrors approve-support-access's self-approval guard, enforced
// both here and at the storage layer via
// data_erasure_requests_no_self_review).
//
// On approval, execute_entity_erasure() runs immediately and synchronously —
// there is no separate "approved but not yet executed" window a human could
// intervene in, which keeps the audit trail simple: a request is either
// pending, rejected, or completed/failed with the outcome already recorded.
//
// HR document vault (hr-documentos / hr-documentos-quarantine): an entity can
// be the same physical person as an HR "pessoa" record — every anew_users
// account created for HR self-service login has an entity_id (see baseline's
// account-creation pipeline), and pessoas_contas links that account's pessoa
// to it. execute_entity_erasure() only ever touches anew_entities and its
// direct satellites; it has no notion of pessoas or Storage, so on its own it
// would leave that person's signed HR documents sitting in the vault forever
// after their CRM data is erased/anonymized. Storage objects are not rows —
// they live in the Storage backend behind an HTTP API, not in a table a SQL
// function can DELETE FROM — so this erasure has to happen here, in the Edge
// Function, before execute_entity_erasure() runs. That order matters: if the
// database rows were erased first and the Storage call then failed, the
// files would be orphaned with literally no trace in the database that they,
// or the person, ever existed — nobody could ever find them again to finish
// the job. Doing Storage first means a failure here leaves every database
// row untouched, so nothing is lost.

const requestSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(["approved", "rejected"]),
  rejection_reason: z.string().min(5).optional(),
});

// Every path in either vault has the form
// <organization_id>/<pessoa_id>/<documento_id>/<uuid>.<ext> (enforced by the
// storage policies in 20261130055000), so every object belonging to a pessoa
// sits under the shared prefix "<organization_id>/<pessoa_id>".
const HR_DOCUMENT_BUCKETS = ["hr-documentos", "hr-documentos-quarantine"] as const;

interface HrBucketErasureResult {
  bucket: string;
  deleted: number;
}

interface HrPessoaErasureResult {
  pessoa_id: string;
  buckets: HrBucketErasureResult[];
}

// Recursively lists every object path under `prefix` in `bucket`. Storage's
// list() is not recursive and returns sub-"folders" as entries with id ===
// null (they are common path prefixes, not real objects) — those are pushed
// back onto the stack instead of collected. Paginated defensively: a person
// could in principle have more than one page of documents.
async function listAllObjectPaths(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const stack: string[] = [prefix];
  const PAGE_SIZE = 100;

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(dir, {
        limit: PAGE_SIZE,
        offset,
      });
      if (error) {
        throw new Error(`Failed to list ${bucket}/${dir}: ${error.message}`);
      }
      if (!data || data.length === 0) break;
      for (const item of data) {
        const fullPath = `${dir}/${item.name}`;
        if (item.id === null) {
          stack.push(fullPath);
        } else {
          paths.push(fullPath);
        }
      }
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return paths;
}

// Deletes every object under <organization_id>/<pessoa_id> in both HR
// document buckets. Throws (rather than swallowing) on any listing or
// removal error, so the caller can stop before executing the database
// erasure — see the header comment on ordering.
async function erasePessoaHrDocuments(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  pessoaId: string,
): Promise<HrBucketErasureResult[]> {
  const results: HrBucketErasureResult[] = [];
  const prefix = `${organizationId}/${pessoaId}`;

  for (const bucket of HR_DOCUMENT_BUCKETS) {
    const paths = await listAllObjectPaths(supabase, bucket, prefix);
    if (paths.length === 0) {
      results.push({ bucket, deleted: 0 });
      continue;
    }

    const BATCH_SIZE = 100;
    let deleted = 0;
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = paths.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.storage.from(bucket).remove(batch);
      if (error) {
        throw new Error(
          `Failed to delete ${batch.length} object(s) from ${bucket} for pessoa ${pessoaId}: ${error.message}`,
        );
      }
      deleted += data?.length ?? batch.length;
    }
    results.push({ bucket, deleted });
  }

  return results;
}

// Resolves every HR "pessoa" whose linked user account (anew_users.entity_id
// — the authoritative column; pessoas_contas.entity_id is only a cached,
// non-authoritative copy per its own comment) is this entity, scoped to the
// request's organization so a cross-org account never causes a cross-org
// Storage deletion. Both active and revoked links are included: a revoked
// account link does not un-attach the real documents already filed under
// that pessoa_id.
async function resolveLinkedPessoaIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  entityId: string,
  organizationId: string,
): Promise<string[]> {
  const { data: linkedUsers, error: usersError } = await supabase
    .from("anew_users")
    .select("id")
    .eq("entity_id", entityId);

  if (usersError) {
    throw new Error(`Failed to resolve linked user accounts: ${usersError.message}`);
  }
  if (!linkedUsers || linkedUsers.length === 0) return [];

  // orgScoped() expects a client whose from() already returns something with
  // .eq() — supabase-js's builder only gains .eq() AFTER .select(), so the
  // adaptation is here (same pattern as criar-acesso-pessoa/validate-upload).
  const contasQuery = orgScoped(
    {
      from: (t: string) => supabase.from(t).select("pessoa_id") as unknown as OrgScopedQueryBuilder,
    },
    "pessoas_contas",
    organizationId,
    // deno-lint-ignore no-explicit-any
  ) as any;
  const { data: contas, error: contasError } = await contasQuery.in(
    "anew_user_id",
    linkedUsers.map((u: { id: string }) => u.id),
  );

  if (contasError) {
    throw new Error(`Failed to resolve linked HR person records: ${contasError.message}`);
  }

  return Array.from(new Set((contas ?? []).map((c: { pessoa_id: string }) => c.pessoa_id)));
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let caller;
  try {
    caller = await resolveCallerIdentity(req, supabase);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  if (caller.isServiceRole) {
    return new Response(
      JSON.stringify({ error: "User JWT required to decide a data erasure request" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const { request_id, action, rejection_reason } = parsed.data;

  if (action === "rejected" && !rejection_reason) {
    return new Response(
      JSON.stringify({ error: "rejection_reason is required when rejecting a request" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    // ── 1. Load the pending request ────────────────────────────────────────
    const { data: reqRow, error: fetchError } = await supabase
      .from("data_erasure_requests")
      .select("id, entity_id, organization_id, requested_by, status")
      .eq("id", request_id)
      .maybeSingle();

    if (fetchError) {
      console.error("[decide-data-erasure] fetch error:", fetchError);
      throw new Error("Failed to look up data erasure request");
    }

    if (!reqRow) {
      return new Response(
        JSON.stringify({ error: "Data erasure request not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (reqRow.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Request is no longer pending", current_status: reqRow.status }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Self-approval guard — mirrors approve-support-access.
    if (caller.anewUserId === reqRow.requested_by) {
      throw new AuthError("The requester cannot decide their own erasure request", 403);
    }

    // ── 2. Verify caller is super_admin of the org, or system_admin ─────────
    const { data: ctx, error: ctxError } = await supabase.rpc("get_user_context", {
      _auth_user_id: caller.authUid,
    });

    if (ctxError) {
      console.error("[decide-data-erasure] get_user_context error:", ctxError);
      throw new AuthError("Failed to resolve user context", 500);
    }

    const isSystemAdmin = Boolean(ctx?.is_system_admin);

    if (!isSystemAdmin) {
      const { data: roleRows } = await supabase
        .from("anew_roles")
        .select("id")
        .eq("code", "super_admin");

      const superAdminRoleIds = (roleRows || []).map((r: { id: string }) => r.id);

      if (superAdminRoleIds.length === 0) {
        throw new AuthError("super_admin role not configured", 500);
      }

      const { data: membership } = await supabase
        .from("anew_memberships")
        .select("id")
        .eq("user_id", caller.anewUserId)
        .eq("organization_id", reqRow.organization_id)
        .eq("status", "active")
        .in("role_id", superAdminRoleIds)
        .maybeSingle();

      if (!membership) {
        throw new AuthError(
          "Only an active super_admin of this organisation (or a system_admin) can decide a data erasure request",
          403
        );
      }
    }

    const now = new Date().toISOString();

    // ── 3. Rejection: single append-only update, no execution ───────────────
    if (action === "rejected") {
      const { data: updatedRows, error: updateError } = await supabase
        .from("data_erasure_requests")
        .update({
          status: "rejected",
          reviewed_at: now,
          reviewed_by: caller.anewUserId,
          rejection_reason,
        })
        .eq("id", request_id)
        .eq("status", "pending")
        .select("id");

      if (updateError) {
        console.error("[decide-data-erasure] reject update error:", updateError);
        throw new Error("Failed to record rejection");
      }

      if (!updatedRows || updatedRows.length === 0) {
        return new Response(
          JSON.stringify({ error: "Request was already decided by another reviewer" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ request_id, status: "rejected" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── 4. Approval: flip to 'approved' first (filtered on current status to
    //      avoid a phantom double-execution on concurrent decisions), then
    //      immediately invoke execute_entity_erasure() via service_role. ────
    const { data: approvedRows, error: approveError } = await supabase
      .from("data_erasure_requests")
      .update({
        status: "approved",
        reviewed_at: now,
        reviewed_by: caller.anewUserId,
      })
      .eq("id", request_id)
      .eq("status", "pending")
      .select("id");

    if (approveError) {
      console.error("[decide-data-erasure] approve update error:", approveError);
      throw new Error("Failed to record approval");
    }

    if (!approvedRows || approvedRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Request was already decided by another reviewer" }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── 4b. HR document vault first, database execution second — see the
    //      header comment for why this order is not arbitrary. A failure
    //      here stops before execute_entity_erasure ever runs, so nothing in
    //      the database is touched and the request is simply marked
    //      'failed' with the reason, exactly like an execute_entity_erasure
    //      failure already is below.
    const hrStorageResult: HrPessoaErasureResult[] = [];
    try {
      // entity_id is only ever null after a PAST hard-delete (see the column
      // comment on data_erasure_requests); a request that just reached
      // 'approved' from 'pending' cannot have one. Guarded explicitly anyway
      // — resolveLinkedPessoaIds does `.eq("entity_id", entityId)`, and a
      // null there would match every anew_users row with no linked entity at
      // all, which would erase the wrong people's real documents.
      const pessoaIds = reqRow.entity_id
        ? await resolveLinkedPessoaIds(supabase, reqRow.entity_id, reqRow.organization_id)
        : [];
      for (const pessoaId of pessoaIds) {
        const buckets = await erasePessoaHrDocuments(supabase, reqRow.organization_id, pessoaId);
        hrStorageResult.push({ pessoa_id: pessoaId, buckets });
      }
    } catch (storageErr: unknown) {
      const message = storageErr instanceof Error ? storageErr.message : "Failed to erase HR document files";
      console.error("[decide-data-erasure] hr-documentos erasure error:", storageErr);
      await captureError(storageErr, { function: "decide-data-erasure", stage: "hr_storage_erasure" });

      await supabase
        .from("data_erasure_requests")
        .update({
          status: "failed",
          executed_at: now,
          error_message: `HR document storage erasure failed before database execution: ${message}`,
        })
        .eq("id", request_id)
        .eq("status", "approved");

      return new Response(
        JSON.stringify({
          error:
            "Approval recorded, but erasing HR document files failed before the database execution ran. No database row was changed. See data_erasure_requests.error_message.",
          request_id,
          status: "failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: execResult, error: execError } = await supabase.rpc("execute_entity_erasure", {
      p_request_id: request_id,
    });

    if (execError) {
      // execute_entity_erasure() already flips the row to 'failed' with
      // error_message set inside its own EXCEPTION handler before re-raising,
      // so there is nothing further to persist here — just surface the error.
      console.error("[decide-data-erasure] execution error:", execError);
      return new Response(
        JSON.stringify({
          error: "Approval recorded, but execution failed. See data_erasure_requests.error_message.",
          request_id,
          status: "failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fold the HR storage outcome into the same persisted audit trail as
    // execResult (row counts touched, never PII values) — best-effort only:
    // the erasure itself already fully happened (both in Storage and in the
    // database) by this point, so a failure merging it into `result` must
    // not turn a completed request into an error response.
    let finalResult = execResult;
    if (hrStorageResult.length > 0) {
      finalResult = { ...execResult, hr_documentos_apagados: hrStorageResult };
      const { error: mergeError } = await supabase
        .from("data_erasure_requests")
        .update({ result: finalResult })
        .eq("id", request_id)
        .eq("status", "completed");
      if (mergeError) {
        console.error("[decide-data-erasure] failed to persist hr_documentos_apagados:", mergeError);
      }
    }

    return new Response(
      JSON.stringify({ request_id, status: "completed", result: finalResult }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return authErrorResponse(err, corsHeaders);
    }
    console.error("[decide-data-erasure] unexpected error:", err);
    await captureError(err, { function: "decide-data-erasure" });
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

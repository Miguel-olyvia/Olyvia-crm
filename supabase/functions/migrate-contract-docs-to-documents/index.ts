// One-shot migration: contract_documents (+ contract-documents bucket)
//                   -> documents       (+ documents bucket)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const report: any[] = [];
  let migrated = 0, skipped = 0, failed = 0;

  try {
    const { data: rows, error } = await supabase
      .from("contract_documents")
      .select("id, contract_id, organization_id, file_name, file_url, file_type, file_size, document_type, notes, uploaded_by, created_at");
    if (error) throw error;

    for (const r of rows || []) {
      const oldPath = r.file_url as string;
      const newPath = `${r.organization_id}/contract/${r.contract_id}/${Date.now()}_${r.file_name}`;
      try {
        // Skip se já migrado (mesmo entity_id + file_name)
        const { data: exists } = await supabase
          .from("documents")
          .select("id")
          .eq("entity_type", "contract")
          .eq("entity_id", r.contract_id)
          .eq("file_name", r.file_name)
          .maybeSingle();
        if (exists) {
          skipped++;
          report.push({ id: r.id, file_name: r.file_name, status: "skipped_already_migrated" });
          continue;
        }

        // Download do bucket antigo
        const dl = await supabase.storage.from("contract-documents").download(oldPath);
        if (dl.error || !dl.data) {
          failed++;
          report.push({ id: r.id, file_name: r.file_name, status: "download_failed", error: dl.error?.message });
          continue;
        }

        // Upload para bucket novo
        const up = await supabase.storage.from("documents").upload(newPath, dl.data, {
          contentType: r.file_type || "application/octet-stream",
          upsert: false,
        });
        if (up.error) {
          failed++;
          report.push({ id: r.id, file_name: r.file_name, status: "upload_failed", error: up.error.message });
          continue;
        }

        // Resolver uploaded_by (era auth.uid()) -> anew_users.id
        let businessUserId: string | null = null;
        if (r.uploaded_by) {
          const { data: u } = await supabase
            .from("anew_users")
            .select("id")
            .eq("auth_user_id", r.uploaded_by)
            .maybeSingle();
          businessUserId = u?.id ?? null;
        }

        // Insert no novo schema
        const ins = await supabase.from("documents").insert({
          organization_id: r.organization_id,
          entity_type: "contract",
          entity_id: r.contract_id,
          file_name: r.file_name,
          file_url: newPath,
          file_type: r.file_type,
          file_size: r.file_size,
          document_type: r.document_type || "other",
          notes: r.notes,
          uploaded_by: businessUserId,
          created_at: r.created_at,
        });
        if (ins.error) {
          // rollback do ficheiro novo
          await supabase.storage.from("documents").remove([newPath]);
          failed++;
          report.push({ id: r.id, file_name: r.file_name, status: "insert_failed", error: ins.error.message });
          continue;
        }

        // Apagar do bucket antigo
        await supabase.storage.from("contract-documents").remove([oldPath]);

        migrated++;
        report.push({ id: r.id, file_name: r.file_name, old_path: oldPath, new_path: newPath, status: "ok" });
      } catch (e: any) {
        failed++;
        report.push({ id: r.id, file_name: r.file_name, status: "exception", error: e?.message });
      }
    }

    return new Response(
      JSON.stringify({ summary: { total: (rows || []).length, migrated, skipped, failed }, report }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

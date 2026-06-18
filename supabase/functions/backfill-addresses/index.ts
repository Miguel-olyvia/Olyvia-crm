import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sanitizeAddressFields,
  isSuspiciousAddress,
  buildAddressKey,
  type SanitizedAddress,
  type AddressRow,
} from "../_shared/addressSanitization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Bucket =
  | "repair_update_in_place"
  | "repair_clone_and_repoint"
  | "skip_no_active_link"
  | "skip_no_source"
  | "skip_no_valid_source"
  | "skip_ambiguous";

interface Plan {
  bucket: Bucket;
  addrId: string;
  entityId?: string;
  linkId?: string;
  merged?: SanitizedAddress;
  curr?: AddressRow & { id: string };
  activeRefs?: number;
}

function mergeSources(sources: SanitizedAddress[]): { merged: SanitizedAddress; ambiguous: boolean } {
  const out: SanitizedAddress = {
    street: null, postal_code: null, city: null, district: null,
    hasCoreMinimum: false, hasAnyUsefulData: false,
  };
  let ambiguous = false;
  for (const f of ["street", "postal_code", "city", "district"] as const) {
    const vals = sources.map(s => s[f]).filter((v): v is string => !!v);
    const uniq = Array.from(new Set(vals.map(v => v.toLowerCase())));
    if (uniq.length === 0) { out[f] = null; continue; }
    if (uniq.length > 1) { ambiguous = true; out[f] = null; continue; }
    out[f] = vals[0];
  }
  out.hasCoreMinimum = !!(out.street && out.postal_code);
  out.hasAnyUsefulData = !!(out.street || out.postal_code || out.city || out.district);
  return { merged: out, ambiguous };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const mode: "preview" | "apply" = body.mode === "apply" ? "apply" : "preview";
    const limit: number = Math.min(Math.max(Number(body.limit) || 500, 1), 5000);

    // 1. Candidate suspicious addresses
    //    a) postal_code not matching NNNN-NNN (covers vast majority of garbage)
    //    b) street/city in known placeholder tokens (small targeted pulls)
    const TOKENS = ["-", "--", "n/a", "N/A", "NA", "null", "none", "s/n", "S/N", "sn"];

    const { data: byPostal, error: candErr } = await supabase
      .from("anew_addresses")
      .select("id, street, number, postal_code, city, district, country")
      .not("postal_code", "like", "____-___")
      .limit(limit);
    if (candErr) throw candErr;

    const { data: byStreet } = await supabase
      .from("anew_addresses")
      .select("id, street, number, postal_code, city, district, country")
      .in("street", TOKENS)
      .limit(limit);

    const { data: byCity } = await supabase
      .from("anew_addresses")
      .select("id, street, number, postal_code, city, district, country")
      .in("city", TOKENS)
      .limit(limit);

    const seen = new Set<string>();
    const all: any[] = [];
    for (const r of [...(byPostal || []), ...(byStreet || []), ...(byCity || [])]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (isSuspiciousAddress(r as AddressRow)) all.push(r);
    }

    const plans: Plan[] = [];
    const addrIds = all.map(a => a.id);
    const CHUNK = 100;

    // Batch (chunked): all active entity links for these addresses
    const linksByAddr = new Map<string, Array<{ id: string; entity_id: string }>>();
    for (let i = 0; i < addrIds.length; i += CHUNK) {
      const slice = addrIds.slice(i, i + CHUNK);
      const { data: linksAll, error: lErr } = await supabase
        .from("anew_entity_addresses")
        .select("id, entity_id, address_id")
        .in("address_id", slice)
        .is("valid_to", null);
      if (lErr) console.error("links query err", lErr.message);
      for (const l of linksAll || []) {
        const arr = linksByAddr.get(l.address_id) || [];
        arr.push({ id: l.id, entity_id: l.entity_id });
        linksByAddr.set(l.address_id, arr);
      }
    }

    // Batch (chunked): org refs for these addresses
    const orgCountByAddr = new Map<string, number>();
    for (let i = 0; i < addrIds.length; i += CHUNK) {
      const slice = addrIds.slice(i, i + CHUNK);
      const { data: orgLinks } = await supabase
        .from("anew_org_addresses")
        .select("address_id")
        .in("address_id", slice)
        .is("valid_to", null);
      for (const o of orgLinks || []) {
        orgCountByAddr.set(o.address_id, (orgCountByAddr.get(o.address_id) || 0) + 1);
      }
    }

    // Batch: all leads for the involved entities
    const allEntityIds = Array.from(new Set(
      Array.from(linksByAddr.values()).flat().map(l => l.entity_id)
    ));
    const leadsByEntity = new Map<string, any[]>();
    if (allEntityIds.length > 0) {
      // chunk to keep .in() reasonable
      const LCHUNK = 200;
      for (let i = 0; i < allEntityIds.length; i += LCHUNK) {
        const slice = allEntityIds.slice(i, i + LCHUNK);
        const { data: leads } = await supabase
          .from("anew_leads")
          .select("id, entity_id, field_values")
          .in("entity_id", slice)
          .not("field_values", "is", null);
        for (const l of leads || []) {
          const arr = leadsByEntity.get(l.entity_id) || [];
          arr.push(l);
          leadsByEntity.set(l.entity_id, arr);
        }
      }
    }

    for (const addr of all) {
      const links = linksByAddr.get(addr.id) || [];
      if (links.length === 0) {
        plans.push({ bucket: "skip_no_active_link", addrId: addr.id });
        continue;
      }
      const activeRefs = links.length + (orgCountByAddr.get(addr.id) || 0);
      const link = links[0];

      const leads = leadsByEntity.get(link.entity_id) || [];
      const sources = leads
        .map(l => sanitizeAddressFields(l.field_values as any))
        .filter(s => s.hasAnyUsefulData);

      if (sources.length === 0) {
        plans.push({ bucket: "skip_no_source", addrId: addr.id, entityId: link.entity_id, linkId: link.id });
        continue;
      }

      const { merged, ambiguous } = mergeSources(sources);
      if (ambiguous) {
        plans.push({ bucket: "skip_ambiguous", addrId: addr.id, entityId: link.entity_id, linkId: link.id });
        continue;
      }

      const applied: AddressRow = {
        street: merged.street ?? addr.street,
        postal_code: merged.postal_code ?? addr.postal_code,
        city: merged.city ?? addr.city,
        district: merged.district ?? addr.district,
        number: addr.number,
        country: addr.country ?? "PT",
      };
      if (isSuspiciousAddress(applied)) {
        plans.push({ bucket: "skip_no_valid_source", addrId: addr.id, entityId: link.entity_id, linkId: link.id });
        continue;
      }

      plans.push({
        bucket: activeRefs > 1 ? "repair_clone_and_repoint" : "repair_update_in_place",
        addrId: addr.id,
        entityId: link.entity_id,
        linkId: link.id,
        merged,
        curr: { ...(addr as AddressRow), id: addr.id },
        activeRefs,
      });
    }

    // ── PREVIEW ──
    if (mode === "preview") {
      const buckets: Record<Bucket, number> = {
        repair_update_in_place: 0, repair_clone_and_repoint: 0,
        skip_no_active_link: 0, skip_no_source: 0,
        skip_no_valid_source: 0, skip_ambiguous: 0,
      };
      const samples: Record<string, string[]> = {};
      for (const p of plans) {
        buckets[p.bucket]++;
        const arr = samples[p.bucket] = samples[p.bucket] || [];
        if (arr.length < 20) arr.push(p.addrId);
      }
      return new Response(JSON.stringify({
        mode, total_candidates: plans.length, buckets, samples,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── APPLY ──
    let repaired_in_place = 0;
    let repaired_by_repoint = 0;
    let skipped = 0;
    let ambiguous = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const p of plans) {
      try {
        if (p.bucket === "skip_ambiguous") { ambiguous++; continue; }
        if (p.bucket.startsWith("skip_")) { skipped++; continue; }
        if (!p.curr || !p.merged || !p.entityId || !p.linkId) { skipped++; continue; }

        const merged: AddressRow = {
          street: p.merged.street ?? p.curr.street,
          postal_code: p.merged.postal_code ?? p.curr.postal_code,
          city: p.merged.city ?? p.curr.city,
          district: p.merged.district ?? p.curr.district,
          number: p.curr.number,
          country: p.curr.country ?? "PT",
        };
        const newKey = buildAddressKey({
          street: merged.street, number: merged.number ?? "",
          postal_code: merged.postal_code, city: merged.city, country: merged.country ?? "PT",
        });

        if (p.bucket === "repair_update_in_place") {
          const patch: Record<string, any> = { address_key: newKey };
          if (p.merged.street) patch.street = p.merged.street;
          if (p.merged.postal_code) patch.postal_code = p.merged.postal_code;
          if (p.merged.city) patch.city = p.merged.city;
          if (p.merged.district) patch.district = p.merged.district;
          const { error } = await supabase.from("anew_addresses").update(patch).eq("id", p.curr.id);
          if (error) { errors++; errorDetails.push(`update ${p.curr.id}: ${error.message}`); continue; }
          repaired_in_place++;
        } else if (p.bucket === "repair_clone_and_repoint") {
          const newId = crypto.randomUUID();
          const { error: aErr } = await supabase.from("anew_addresses").insert({
            id: newId, address_key: newKey,
            street: merged.street, number: merged.number ?? "",
            postal_code: merged.postal_code, city: merged.city ?? "",
            district: merged.district ?? null, country: merged.country ?? "PT",
          });
          if (aErr) { errors++; errorDetails.push(`insert clone for ${p.curr.id}: ${aErr.message}`); continue; }

          const { error: nlErr } = await supabase.from("anew_entity_addresses").insert({
            entity_id: p.entityId, address_id: newId,
            address_type: "work", is_primary: true,
          });
          if (nlErr) { errors++; errorDetails.push(`insert new link for ${p.entityId}: ${nlErr.message}`); continue; }

          const { error: oErr } = await supabase.from("anew_entity_addresses")
            .update({ valid_to: new Date().toISOString(), is_primary: false })
            .eq("id", p.linkId);
          if (oErr) { errors++; errorDetails.push(`close old link ${p.linkId}: ${oErr.message}`); continue; }

          repaired_by_repoint++;
        }
      } catch (e: any) {
        errors++;
        errorDetails.push(`${p.addrId}: ${e?.message ?? String(e)}`);
      }
    }

    return new Response(JSON.stringify({
      mode, repaired_in_place, repaired_by_repoint, skipped, ambiguous, errors,
      errorDetails: errorDetails.slice(0, 50),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

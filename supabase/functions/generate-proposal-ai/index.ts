import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";
import { resolveCallerIdentity, validateOrgScope, authErrorResponse } from "../_shared/auth.ts";

import { corsHeaders } from "../_shared/cors.ts";

const requestSchema = z.object({
  entity_id: z.string(),
  organization_id: z.string(),
  extra_context: z.string().optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let caller;
    try {
      caller = await resolveCallerIdentity(req, supabase);
    } catch (e) {
      return authErrorResponse(e, corsHeaders);
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { entity_id, organization_id, extra_context } = parsed.data;

    const hasAccess = await validateOrgScope(supabase, caller, organization_id);
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para aceder a esta organização" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get entity info
    const { data: entity } = await supabase
      .from("anew_entities")
      .select("id, display_name, type")
      .eq("id", entity_id)
      .single();

    const [emailsRes, phonesRes] = await Promise.all([
      supabase.from("anew_entity_emails").select("email").eq("entity_id", entity_id),
      supabase.from("anew_entity_phones").select("phone_number").eq("entity_id", entity_id),
    ]);

    const { data: leads } = await supabase
      .from("anew_leads")
      .select("id, field_values, status, notes, tags, created_at")
      .eq("entity_id", entity_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: deals } = await supabase
      .from("deals")
      .select("id, title, value, description, created_at")
      .eq("entity_id", entity_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const dealIds = (deals || []).map(d => d.id);

    let pastProposals: any[] = [];
    if (dealIds.length > 0) {
      const { data } = await supabase
        .from("proposals")
        .select("id, title, description, value, status, notes, created_at")
        .in("deal_id", dealIds)
        .order("created_at", { ascending: false })
        .limit(20);
      pastProposals = data || [];
    }

    const proposalIds = pastProposals.map(p => p.id);
    let pastItems: any[] = [];
    if (proposalIds.length > 0) {
      const { data } = await supabase
        .from("proposal_items")
        .select("description, quantity, unit_price, vat_rate, proposal_id")
        .in("proposal_id", proposalIds);
      pastItems = data || [];
    }

    const [productsRes, servicesRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, description, sku")
        .eq("is_sellable", true)
        .eq("is_active", true)
        .eq("organization_id", organization_id)
        .limit(100),
      supabase
        .from("services")
        .select("id, name, short_desc, sku")
        .eq("is_active", true)
        .eq("organization_id", organization_id)
        .limit(50),
    ]);

    const contactInfo = {
      name: entity?.display_name || "Desconhecido",
      emails: (emailsRes.data || []).map((e: any) => e.email),
      phones: (phonesRes.data || []).map((p: any) => p.phone_number),
    };

    const historyContext = {
      leads: (leads || []).map(l => ({ field_values: l.field_values, status: l.status, notes: l.notes, tags: l.tags })),
      deals: (deals || []).map(d => ({ title: d.title, value: d.value, description: d.description })),
      past_proposals: pastProposals.map(p => ({
        title: p.title, description: p.description, value: p.value, status: p.status,
        items: pastItems.filter(i => i.proposal_id === p.id).map(i => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price })),
      })),
    };

    const catalog = {
      products: (productsRes.data || []).map((p: any) => ({ id: p.id, name: p.name })),
      services: (servicesRes.data || []).map((s: any) => ({ id: s.id, name: s.name })),
    };

    const systemPrompt = `Tu és um assistente especializado em gerar propostas comerciais personalizadas.
Analisa o histórico completo de um contacto e gera uma proposta inteligente e relevante.

CONTACTO: ${JSON.stringify(contactInfo)}
HISTÓRICO: ${JSON.stringify(historyContext)}
CATÁLOGO: ${JSON.stringify(catalog)}

Responde em JSON: { "title": "...", "description": "...", "items": [{"description":"...","quantity":1,"unit_price":0,"vat_rate":23,"reason":"..."}], "notes": "...", "analysis": "..." }`;

    const userPrompt = extra_context
      ? `Gera uma proposta personalizada. Contexto: ${extra_context}`
      : "Gera uma proposta personalizada com base no histórico completo.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    let parsedResponse;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsedResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "", description: content, items: [], notes: "", analysis: "" };
    } catch {
      parsedResponse = { title: "", description: content, items: [], notes: "", analysis: "" };
    }

    return new Response(
      JSON.stringify({ success: true, ...parsedResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Generate Proposal AI error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
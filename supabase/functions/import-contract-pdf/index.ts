import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCallerIdentity, authErrorResponse } from "../_shared/auth.ts";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripMarkdownCodeFences = (value: string) => value.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();

const requestSchema = z.object({
  fileName: z.string(),
  pdfBase64: z.string().max(10_000_000),
});

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { fileName, pdfBase64 } = parsed.data;

    const base64Payload = pdfBase64.startsWith("data:")
      ? (pdfBase64.split(",")[1] ?? "")
      : pdfBase64;

    if (!base64Payload.startsWith('JVBERi0')) {
      return new Response(
        JSON.stringify({ error: 'Invalid file type' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPdfBase64 = pdfBase64.startsWith("data:")
      ? pdfBase64
      : `data:application/pdf;base64,${pdfBase64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "És um extractor de documentos jurídicos em português. Extrai o conteúdo de PDFs de contratos e devolve apenas HTML limpo e simples para um editor rich text. Preserva títulos, parágrafos, listas numeradas e listas com bullets quando existirem. Não inventes conteúdo. Não adiciones markdown. Não adiciones explicações."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrai o texto deste contrato PDF e devolve apenas HTML válido para colar num editor. Usa <h1>, <h2>, <p>, <ol>, <ul>, <li>, <strong>, <em> quando fizer sentido. Se houver páginas sem OCR perfeito, devolve o melhor texto possível sem comentários."
              },
              {
                type: "file",
                file: {
                  filename: fileName,
                  file_data: normalizedPdfBase64,
                }
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite temporário excedido no processamento automático. Tente novamente dentro de instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "O processamento automático está temporariamente indisponível por limite de créditos." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const errorText = await response.text();
      throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content?.trim?.() || "";
    const html = stripMarkdownCodeFences(content);

    if (!html || html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length < 20) {
      throw new Error("A extracção AI não devolveu texto suficiente");
    }

    return new Response(
      JSON.stringify({ html, extractedWith: "ai" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("import-contract-pdf error:", error);

    const fallbackMessage = error?.message?.includes("AI gateway")
      ? "Não foi possível processar este PDF automaticamente neste momento."
      : error?.message || "Falha ao importar PDF";

    return new Response(
      JSON.stringify({ error: fallbackMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

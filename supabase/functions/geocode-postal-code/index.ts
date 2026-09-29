import { getCorsHeaders } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import { geocodePostalCode } from "../_shared/postcodeGeocode.ts";

initSentry();

/**
 * Geocodifica um código postal (CP7) via a API Olyvia, para a morada-base
 * de um comercial (regras 4/5 -- ver migration 20261204180000). Chamada
 * autenticada, de dentro da app (ScheduleResourceDialog), não é um endpoint
 * público de formulário.
 */
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { postalCode } = await req.json();
    if (!postalCode || typeof postalCode !== "string") {
      return new Response(JSON.stringify({ error: "postalCode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await geocodePostalCode(postalCode);
    if (!result || result.latitude === null || result.longitude === null) {
      return new Response(JSON.stringify({ error: "Postal code not found or has no coordinates" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in geocode-postal-code:", error);
    await captureError(error, { function: "geocode-postal-code" });
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

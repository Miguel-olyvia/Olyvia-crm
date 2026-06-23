import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { resolveCallerIdentity, requireAdminRole, authErrorResponse } from "../_shared/auth.ts";

const importBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get-ranges") }),
  z.object({
    action: z.literal("import-batch"),
    startPrefix: z.union([z.string(), z.number()]),
    endPrefix: z.union([z.string(), z.number()]),
    batchSize: z.number().int().min(1).max(500).optional().default(100),
  }),
  z.object({
    action: z.literal("import-specific"),
    postalCodes: z.array(z.string().regex(/^\d{4}-\d{3}$/)).min(1).max(500),
  }),
]);

import { corsHeaders } from "../_shared/cors.ts";

// Portuguese postal code ranges by district
const POSTAL_CODE_RANGES = [
  // Lisboa
  { start: 1000, end: 1998, district: 'Lisboa' },
  { start: 2500, end: 2549, district: 'Leiria' }, // Caldas, Óbidos, etc
  { start: 2550, end: 2599, district: 'Lisboa' }, // Cadaval area
  { start: 2600, end: 2699, district: 'Lisboa' }, // Sintra, Amadora, etc
  { start: 2700, end: 2799, district: 'Lisboa' }, // Cascais, Oeiras, Sintra
  // Santarém
  { start: 2000, end: 2139, district: 'Santarém' },
  { start: 2140, end: 2149, district: 'Santarém' }, // Entroncamento
  { start: 2150, end: 2399, district: 'Santarém' },
  // Leiria
  { start: 2400, end: 2499, district: 'Leiria' },
  // Setúbal
  { start: 2800, end: 2999, district: 'Setúbal' },
  // Coimbra
  { start: 3000, end: 3099, district: 'Coimbra' },
  { start: 3100, end: 3199, district: 'Coimbra' },
  { start: 3200, end: 3399, district: 'Coimbra' },
  // Aveiro
  { start: 3700, end: 3899, district: 'Aveiro' },
  // Viseu
  { start: 3400, end: 3699, district: 'Viseu' },
  // Porto
  { start: 4000, end: 4099, district: 'Porto' },
  { start: 4100, end: 4199, district: 'Porto' },
  { start: 4200, end: 4299, district: 'Porto' },
  { start: 4300, end: 4399, district: 'Porto' },
  { start: 4400, end: 4499, district: 'Porto' },
  // Aveiro/Porto
  { start: 4500, end: 4599, district: 'Aveiro' },
  // Braga
  { start: 4700, end: 4899, district: 'Braga' },
  // Viana do Castelo
  { start: 4900, end: 4999, district: 'Viana do Castelo' },
  // Vila Real
  { start: 5000, end: 5299, district: 'Vila Real' },
  // Bragança
  { start: 5300, end: 5399, district: 'Bragança' },
  // Castelo Branco
  { start: 6000, end: 6299, district: 'Castelo Branco' },
  // Guarda
  { start: 6300, end: 6499, district: 'Guarda' },
  // Portalegre
  { start: 7300, end: 7499, district: 'Portalegre' },
  // Évora
  { start: 7000, end: 7299, district: 'Évora' },
  // Beja
  { start: 7500, end: 7999, district: 'Beja' },
  // Faro
  { start: 8000, end: 8999, district: 'Faro' },
  // Madeira
  { start: 9000, end: 9499, district: 'Madeira' },
  // Açores
  { start: 9500, end: 9999, district: 'Açores' },
];

interface PostalCodeData {
  district: string;
  municipality: string;
  locality: string;
  address: {
    street: string;
    doorNo: string;
    customerLabel: string;
    addressLabel: string;
    postalLabel: string;
  };
  latitude: number;
  longitude: number;
}

async function fetchPostalCode(postalCode: string): Promise<PostalCodeData | null> {
  try {
    const response = await fetch(
      `https://fidelidadeapi.quickflowai.com/Olyvia/postcodes/${encodeURIComponent(postalCode)}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch {
    return null;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth: require admin role
    const caller = await resolveCallerIdentity(req, supabase);
    const isAdmin = await requireAdminRole(supabase, caller);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin role required" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.json();
    const parsedBody = importBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsedBody.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const parsed = parsedBody.data;
    const action = parsed.action;
    const startPrefix = action === "import-batch" ? parsed.startPrefix : undefined;
    const endPrefix = action === "import-batch" ? parsed.endPrefix : undefined;
    const batchSize = action === "import-batch" ? (parsed.batchSize ?? 100) : 100;

    if (action === 'get-ranges') {
      // Return all postal code ranges for the client to iterate
      return new Response(
        JSON.stringify({ ranges: POSTAL_CODE_RANGES }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'import-batch') {
      const start = parseInt(startPrefix);
      const end = Math.min(parseInt(endPrefix), start + batchSize - 1);
      
      let imported = 0;
      let failed = 0;
      const results: any[] = [];

      // Get district IDs
      const { data: districts } = await supabase
        .from('administrative_divisions')
        .select('id, name')
        .eq('country_code', 'PT')
        .eq('admin_level', 1);

      const districtMap = new Map(districts?.map(d => [d.name, d.id]) || []);

      for (let prefix = start; prefix <= end; prefix++) {
        // Try common extensions: 001-010, 100, 200, etc.
        const extensionsToTry = [
          '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
          '011', '012', '013', '014', '015', '016', '017', '018', '019', '020',
          '050', '100', '150', '200', '250', '300', '350', '400', '450', '500'
        ];

        for (const ext of extensionsToTry) {
          const postalCode = `${prefix.toString().padStart(4, '0')}-${ext}`;
          
          // Add small delay to avoid rate limiting
          await delay(50);
          
          const data = await fetchPostalCode(postalCode);
          
          if (data) {
            // Find district ID
            const districtId = districtMap.get(data.district);

            // Find municipality ID
            const { data: municipality } = await supabase
              .from('administrative_divisions')
              .select('id')
              .eq('country_code', 'PT')
              .eq('admin_level', 2)
              .eq('name', data.municipality)
              .single();

            // Find parish ID
            const { data: parish } = await supabase
              .from('administrative_divisions')
              .select('id')
              .eq('country_code', 'PT')
              .eq('admin_level', 3)
              .ilike('name', `%${data.locality}%`)
              .limit(1)
              .single();

            // Insert postal code
            const { error: insertError } = await supabase
              .from('postal_codes')
              .upsert({
                postal_code: prefix.toString().padStart(4, '0'),
                postal_code_extension: ext,
                locality: data.locality,
                district_id: districtId,
                municipality_id: municipality?.id,
                parish_id: parish?.id,
                street_name: data.address?.street,
                latitude: data.latitude,
                longitude: data.longitude,
                country_code: 'PT'
              }, {
                onConflict: 'postal_code,postal_code_extension',
                ignoreDuplicates: false
              });

            if (!insertError) {
              imported++;
              results.push({
                postalCode,
                locality: data.locality,
                municipality: data.municipality,
                street: data.address?.street
              });

              // Also insert street if exists
              if (data.address?.street) {
                await supabase
                  .from('streets')
                  .upsert({
                    name: data.address.street,
                    name_ascii: data.address.street.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
                    parish_id: parish?.id,
                    municipality_id: municipality?.id,
                    latitude: data.latitude,
                    longitude: data.longitude
                  }, {
                    onConflict: 'name,parish_id',
                    ignoreDuplicates: true
                  });
              }
            } else {
              failed++;
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          imported,
          failed,
          processedRange: { start, end },
          sampleResults: results.slice(0, 10)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'import-specific') {
      // Import specific postal codes — postalCodes already validated by Zod above
      const postalCodes = (parsed as any).postalCodes as string[];

      let imported = 0;
      const results: any[] = [];

      for (const postalCode of postalCodes) {
        await delay(100);
        
        const data = await fetchPostalCode(postalCode);
        
        if (data) {
          const [prefix, ext] = postalCode.split('-');
          
          const { error } = await supabase
            .from('postal_codes')
            .upsert({
              postal_code: prefix,
              postal_code_extension: ext,
              locality: data.locality,
              street_name: data.address?.street,
              latitude: data.latitude,
              longitude: data.longitude,
              country_code: 'PT'
            }, {
              onConflict: 'postal_code,postal_code_extension',
              ignoreDuplicates: false
            });

          if (!error) {
            imported++;
            results.push({ postalCode, locality: data.locality });
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, imported, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: get stats
    const { count: postalCount } = await supabase
      .from('postal_codes')
      .select('*', { count: 'exact', head: true });

    const { count: streetCount } = await supabase
      .from('streets')
      .select('*', { count: 'exact', head: true });

    return new Response(
      JSON.stringify({ 
        postalCodesCount: postalCount,
        streetsCount: streetCount,
        ranges: POSTAL_CODE_RANGES.length,
        estimatedTotal: '~350,000 códigos postais em Portugal'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const authResp = authErrorResponse(error, corsHeaders);
    if (authResp) return authResp;
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

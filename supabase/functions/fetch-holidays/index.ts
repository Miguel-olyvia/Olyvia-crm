import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map our country codes to Nager.Date country codes
const countryCodeMap: Record<string, string> = {
  'PT': 'PT',
  'ES': 'ES',
  'FR': 'FR',
  'DE': 'DE',
  'GB': 'GB',
  'IT': 'IT',
  'BR': 'BR',
  'US': 'US',
  'NL': 'NL',
  'BE': 'BE',
  'CH': 'CH',
  'AT': 'AT',
  'PL': 'PL',
  'SE': 'SE',
  'DK': 'DK',
  'NO': 'NO',
  'FI': 'FI',
  'IE': 'IE',
  'CZ': 'CZ',
  'GR': 'GR',
  'RO': 'RO',
  'HU': 'HU',
  'CA': 'CA',
  'MX': 'MX',
  'AR': 'AR',
};

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  types: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { countryCode, year } = await req.json();
    
    if (!countryCode) {
      return new Response(
        JSON.stringify({ error: 'Country code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nagerCode = countryCodeMap[countryCode] || countryCode;
    const targetYear = year || new Date().getFullYear();
    
    console.log(`Fetching holidays for ${nagerCode} in ${targetYear}`);

    // Fetch holidays from Nager.Date API (free, no API key needed)
    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${targetYear}/${nagerCode}`
    );

    if (!response.ok) {
      // Try next year if current year fails (might be end of year)
      const nextYearResponse = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${targetYear + 1}/${nagerCode}`
      );
      
      if (!nextYearResponse.ok) {
        console.error(`Nager API error: ${response.status}`);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch holidays from API', holidays: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const nextYearHolidays: NagerHoliday[] = await nextYearResponse.json();
      const formattedHolidays = nextYearHolidays.map(h => ({
        name: h.localName || h.name,
        holiday_date: h.date,
        country_code: countryCode,
        is_recurring: h.fixed,
        is_custom: false,
      }));
      
      return new Response(
        JSON.stringify({ holidays: formattedHolidays }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const holidays: NagerHoliday[] = await response.json();
    console.log(`Found ${holidays.length} holidays`);

    // Also fetch next year for display purposes
    let nextYearHolidays: NagerHoliday[] = [];
    try {
      const nextYearResponse = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${targetYear + 1}/${nagerCode}`
      );
      if (nextYearResponse.ok) {
        nextYearHolidays = await nextYearResponse.json();
      }
    } catch (e) {
      console.log('Could not fetch next year holidays');
    }

    // Combine and format holidays
    const allHolidays = [...holidays, ...nextYearHolidays];
    const formattedHolidays = allHolidays.map(h => ({
      name: h.localName || h.name,
      holiday_date: h.date,
      country_code: countryCode,
      is_recurring: h.fixed,
      is_custom: false,
    }));

    console.log(`Returning ${formattedHolidays.length} total holidays`);

    return new Response(
      JSON.stringify({ holidays: formattedHolidays }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-holidays:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, holidays: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

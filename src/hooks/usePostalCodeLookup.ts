import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PostalCodeData {
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

export interface PostalCodeWithRelations extends PostalCodeData {
  districtId?: string;
  municipalityId?: string;
  parishId?: string;
  cached?: boolean;
}

export const usePostalCodeLookup = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find matching administrative division by name
  const findAdminDivision = async (
    name: string, 
    adminLevel: number, 
    parentId?: string
  ): Promise<string | null> => {
    if (!name) return null;

    let query = supabase
      .from('administrative_divisions')
      .select('id, name')
      .eq('country_code', 'PT')
      .eq('admin_level', adminLevel);

    if (parentId) {
      query = query.eq('parent_id', parentId);
    }

    // Try exact match first
    const { data: exactMatch } = await query.ilike('name', name).limit(1);
    if (exactMatch && exactMatch.length > 0) {
      return exactMatch[0].id;
    }

    // Try partial match (for names like "Cedofeita, Santo Ildefonso..." -> "Cedofeita")
    const firstName = name.split(',')[0].trim();
    const { data: partialMatch } = await supabase
      .from('administrative_divisions')
      .select('id, name')
      .eq('country_code', 'PT')
      .eq('admin_level', adminLevel)
      .ilike('name', `%${firstName}%`)
      .limit(1);

    if (partialMatch && partialMatch.length > 0) {
      return partialMatch[0].id;
    }

    return null;
  };

  // Check if postal code exists in cache (database)
  const checkCache = async (postalCode: string): Promise<PostalCodeWithRelations | null> => {
    const [prefix, extension] = postalCode.includes('-') 
      ? postalCode.split('-') 
      : [postalCode, null];

    let query = supabase
      .from('postal_codes')
      .select(`
        postal_code,
        postal_code_extension,
        locality,
        street_name,
        latitude,
        longitude,
        district_id,
        municipality_id,
        parish_id,
        district:administrative_divisions!postal_codes_district_id_fkey(name),
        municipality:administrative_divisions!postal_codes_municipality_id_fkey(name),
        parish:administrative_divisions!postal_codes_parish_id_fkey(name)
      `)
      .eq('postal_code', prefix);

    if (extension) {
      query = query.eq('postal_code_extension', extension);
    }

    const { data, error } = await query.limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    const cached = data[0];
    
    // Type assertion for the joined data
    const districtData = cached.district as unknown as { name: string } | null;
    const municipalityData = cached.municipality as unknown as { name: string } | null;
    const parishData = cached.parish as unknown as { name: string } | null;

    return {
      district: districtData?.name || '',
      municipality: municipalityData?.name || '',
      locality: cached.locality || '',
      address: {
        street: cached.street_name || '',
        doorNo: '',
        customerLabel: '',
        addressLabel: cached.street_name || '',
        postalLabel: `${cached.postal_code}-${cached.postal_code_extension}`
      },
      latitude: cached.latitude || 0,
      longitude: cached.longitude || 0,
      districtId: cached.district_id || undefined,
      municipalityId: cached.municipality_id || undefined,
      parishId: cached.parish_id || undefined,
      cached: true
    };
  };

  // Save postal code to cache with relations
  const saveToCache = async (
    postalCode: string,
    data: PostalCodeData,
    districtId: string | null,
    municipalityId: string | null,
    parishId: string | null
  ) => {
    const [prefix, extension] = postalCode.includes('-') 
      ? postalCode.split('-') 
      : [postalCode, '001'];

    try {
      await supabase
        .from('postal_codes')
        .upsert({
          postal_code: prefix,
          postal_code_extension: extension,
          locality: data.locality,
          street_name: data.address?.street,
          latitude: data.latitude,
          longitude: data.longitude,
          district_id: districtId,
          municipality_id: municipalityId,
          parish_id: parishId,
          country_code: 'PT'
        }, {
          onConflict: 'postal_code,postal_code_extension'
        });
    } catch (e) {
      console.error('Error saving postal code to cache:', e);
    }
  };

  const lookupPostalCode = async (postalCode: string): Promise<PostalCodeWithRelations | null> => {
    if (!postalCode || postalCode.length < 4) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Check cache first
      const cached = await checkCache(postalCode);
      if (cached && cached.districtId) {
        setLoading(false);
        return cached;
      }

      // 2. Fetch from API
      const response = await fetch(
        `https://fidelidadeapi.quickflowai.com/Olyvia/postcodes/${encodeURIComponent(postalCode)}`
      );

      if (!response.ok) {
        throw new Error("Postal code not found");
      }

      const data: PostalCodeData = await response.json();

      // 3. Find matching administrative divisions
      const districtId = await findAdminDivision(data.district, 1);
      const municipalityId = await findAdminDivision(data.municipality, 2, districtId || undefined);
      const parishId = await findAdminDivision(data.locality, 3, municipalityId || undefined);

      // 4. Save to cache
      await saveToCache(postalCode, data, districtId, municipalityId, parishId);

      // 5. Return enriched data
      return {
        ...data,
        districtId: districtId || undefined,
        municipalityId: municipalityId || undefined,
        parishId: parishId || undefined,
        cached: false
      };

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lookup postal code");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Get all postal codes for a municipality
  const getPostalCodesByMunicipality = async (municipalityId: string) => {
    const { data, error } = await supabase
      .from('postal_codes')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('postal_code');

    if (error) {
      console.error('Error fetching postal codes:', error);
      return [];
    }

    return data || [];
  };

  // Get all postal codes for a parish
  const getPostalCodesByParish = async (parishId: string) => {
    const { data, error } = await supabase
      .from('postal_codes')
      .select('*')
      .eq('parish_id', parishId)
      .order('postal_code');

    if (error) {
      console.error('Error fetching postal codes:', error);
      return [];
    }

    return data || [];
  };

  return { 
    lookupPostalCode, 
    getPostalCodesByMunicipality,
    getPostalCodesByParish,
    loading, 
    error 
  };
};

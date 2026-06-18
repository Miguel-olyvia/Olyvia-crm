import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AdministrativeDivision {
  id: string;
  code: string;
  name: string;
  admin_level: number;
  parent_id: string | null;
  country_code: string;
}

export function useAdministrativeDivisions(countryCode: string) {
  const [districts, setDistricts] = useState<AdministrativeDivision[]>([]);
  const [municipalities, setMunicipalities] = useState<AdministrativeDivision[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDistricts = useCallback(async () => {
    if (!countryCode) {
      setDistricts([]);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('administrative_divisions')
        .select('id, code, name, admin_level, parent_id, country_code')
        .eq('country_code', countryCode)
        .eq('admin_level', 1)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setDistricts(data || []);
    } catch (err) {
      console.error('Error fetching districts:', err);
      setDistricts([]);
    } finally {
      setLoading(false);
    }
  }, [countryCode]);

  const fetchMunicipalities = useCallback(async (districtId: string | null) => {
    if (!districtId) {
      setMunicipalities([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('administrative_divisions')
        .select('id, code, name, admin_level, parent_id, country_code')
        .eq('parent_id', districtId)
        .eq('admin_level', 2)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setMunicipalities(data || []);
    } catch (err) {
      console.error('Error fetching municipalities:', err);
      setMunicipalities([]);
    }
  }, []);

  useEffect(() => {
    fetchDistricts();
  }, [fetchDistricts]);

  return {
    districts,
    municipalities,
    loading,
    fetchMunicipalities,
    refetchDistricts: fetchDistricts,
  };
}
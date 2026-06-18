import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Country {
  id: string;
  name: string;
  code: string;
  phone_code: string | null;
  is_active: boolean;
  sort_order: number;
}

export function useCountries(onlyActive: boolean = true) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCountries = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('countries')
        .select('*')
        .order('sort_order', { ascending: true });

      if (onlyActive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCountries(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCountries();
  }, [onlyActive]);

  return { countries, loading, error, refetch: loadCountries };
}

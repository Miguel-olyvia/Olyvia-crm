/** Os países de exemplo (uma lista curta fixa), com a mesma forma do hook real. */
export interface Country {
  id: string;
  name: string;
  code: string;
  phone_code: string | null;
  is_active: boolean;
  sort_order: number;
}

const DADOS: Array<[string, string, string]> = [
  ["PT", "Portugal", "+351"],
  ["ES", "Espanha", "+34"],
  ["FR", "França", "+33"],
  ["DE", "Alemanha", "+49"],
  ["GB", "Reino Unido", "+44"],
  ["BR", "Brasil", "+55"],
  ["AO", "Angola", "+244"],
  ["CV", "Cabo Verde", "+238"],
  ["MZ", "Moçambique", "+258"],
  ["UA", "Ucrânia", "+380"],
];

const PAISES: Country[] = DADOS.map(([code, name, phone], i) => ({
  id: `pais-${code}`,
  name,
  code,
  phone_code: phone,
  is_active: true,
  sort_order: i,
}));

export function useCountries(_onlyActive: boolean = true) {
  return { countries: PAISES, loading: false, error: null as string | null, refetch: async () => undefined };
}

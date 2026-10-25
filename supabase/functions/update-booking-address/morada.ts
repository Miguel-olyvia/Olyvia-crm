// update-booking-address: grava a morada corrigida na SUBMISSAO da visita
// (field_values, a que o get-booking le), ligada a visita por
// metadata.submission_id. Substitui a escrita em anew_leads.field_values.
// Sem imports remotos: testavel no vitest. Toda a consulta leva organizacao.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export type ResultadoMorada =
  | { ok: true }
  | { ok: false; code: 'INVALID' | 'RETRY'; error: string };

const RETRY: ResultadoMorada = {
  ok: false,
  code: 'RETRY',
  error: 'Não foi possível guardar a morada agora. Tente novamente.',
};

function objeto(v: unknown): AnyRecord {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as AnyRecord : {};
}

export async function guardarMoradaDaVisita(
  supabase: SupabaseLike,
  item: { organization_id: string; metadata?: unknown },
  morada: { morada: string; codigo_postal: string; localidade: string },
): Promise<ResultadoMorada> {
  const submissionId = objeto(item.metadata).submission_id;
  if (typeof submissionId !== 'string' || !submissionId) {
    return { ok: false, code: 'INVALID', error: 'Não foi possível encontrar os seus dados. Contacte-nos.' };
  }

  const { data, error } = await supabase
    .from('form_submissions')
    .select('field_values')
    .eq('id', submissionId)
    .eq('organization_id', item.organization_id)
    .maybeSingle();
  if (error) {
    console.error('[update-booking-address] leitura da submissao falhou:', error.message);
    return RETRY;
  }
  if (!data) {
    return { ok: false, code: 'INVALID', error: 'Não foi possível encontrar os seus dados. Contacte-nos.' };
  }

  // So as chaves de morada: preferindo a variante que ja existe, senao a canonica.
  const fv: AnyRecord = { ...objeto(data.field_values) };
  const definir = (variantes: string[], canonica: string, valor: string) => {
    const existente = variantes.find((k) => k in fv);
    fv[existente ?? canonica] = valor;
  };
  definir(['address', 'morada'], 'morada', morada.morada);
  definir(['postal_code', 'codigo_postal'], 'codigo_postal', morada.codigo_postal);
  definir(['city', 'localidade', 'cidade'], 'localidade', morada.localidade);

  const { error: erroEscrita } = await supabase
    .from('form_submissions')
    .update({ field_values: fv })
    .eq('id', submissionId)
    .eq('organization_id', item.organization_id);
  if (erroEscrita) {
    console.error('[update-booking-address] escrita da submissao falhou:', erroEscrita.message);
    return RETRY;
  }
  return { ok: true };
}

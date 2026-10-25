// Pessoa por tras de uma visita (schedule_items) para cancel-booking,
// reschedule-booking e get-booking.
//
// A visita liga-se a ENTIDADE (schedule_items.entity_id / metadata.entity_id) e
// a submissao (metadata.submission_id). A entidade e o identificador da pessoa:
// lead = entidade sem client_since. Nao ha caminho antigo (metadata.lead_id,
// anew_leads.scheduled_visit_id).
// Sem imports remotos: testavel no vitest. Toda a consulta leva organizacao.
// Uma leitura falhada NAO devolve uma pessoa vazia: devolve `erro` e o handler
// responde 503 RETRY antes de escrever.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export interface PessoaDoItem {
  /** Entidade da visita; null se o item nao a traz. */
  entityId: string | null;
  /** field_values da submissao da visita. */
  fieldValues: AnyRecord;
  displayName: string;
  /** Quem trata da pessoa: assigned_to, senao created_by. */
  ownerId: string | null;
  isClient: boolean;
  /** Mensagem da leitura que falhou; null = tudo lido. */
  erro: string | null;
}

/** Tipo de entity_type dos lembretes: cliente se tem client_since, senao lead. */
export function tipoLembrete(isClient: boolean): 'clients' | 'leads' {
  return isClient ? 'clients' : 'leads';
}

function objeto(v: unknown): AnyRecord {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as AnyRecord : {};
}

export async function resolverPessoaDoItem(
  supabase: SupabaseLike,
  item: { organization_id: string; entity_id?: string | null; metadata?: unknown },
): Promise<PessoaDoItem> {
  const organizationId = item.organization_id;
  const metadata = objeto(item.metadata);
  const entityId: string | null = item.entity_id || metadata.entity_id || null;

  const pessoa: PessoaDoItem = {
    entityId, fieldValues: {}, displayName: '', ownerId: null, isClient: false, erro: null,
  };

  if (entityId) {
    const { data: entity, error } = await supabase
      .from('anew_entities')
      .select('display_name, assigned_to, created_by, client_since')
      .eq('id', entityId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) return { ...pessoa, erro: `leitura da entidade: ${error.message}` };
    if (entity) {
      pessoa.displayName = entity.display_name || '';
      pessoa.ownerId = entity.assigned_to ?? entity.created_by ?? null;
      pessoa.isClient = !!entity.client_since;
    }
  }

  if (typeof metadata.submission_id === 'string' && metadata.submission_id) {
    const { data: sub, error } = await supabase
      .from('form_submissions')
      .select('field_values')
      .eq('id', metadata.submission_id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error) return { ...pessoa, erro: `leitura da submissao: ${error.message}` };
    pessoa.fieldValues = objeto(sub?.field_values);
  }
  return pessoa;
}

export type AlteracaoDaVisita =
  | { tipo: 'cancelada' }
  | { tipo: 'reagendada'; inicio: string; fim: string };

/**
 * O espelho da visita na submissao (field_values._meta.visita, escrito pelo
 * book-slot). Substitui o que antes se gravava em anew_leads (status,
 * callback_scheduled_at, scheduled_visit_id): a visita vive em schedule_items
 * (entity_id) e a submissao guarda o estado dela. Devolve a lista de falhas
 * (vazia = tudo certo). Leitura falhada NAO escreve (perderia o _meta).
 */
export async function atualizarVisitaDaSubmissao(
  supabase: SupabaseLike,
  p: {
    organizationId: string;
    submissionId: string | null;
    alteracao: AlteracaoDaVisita;
    agora?: string;
  },
): Promise<string[]> {
  if (!p.submissionId) return [];
  const agora = p.agora ?? new Date().toISOString();
  const { data, error } = await supabase
    .from('form_submissions')
    .select('field_values')
    .eq('id', p.submissionId)
    .eq('organization_id', p.organizationId)
    .maybeSingle();
  if (error) return [`leitura da submissao: ${error.message}`];
  if (!data) return ['submissao nao encontrada'];

  const fv = objeto(data.field_values);
  const meta = objeto(fv._meta);
  const { cancelada_em: _cancelada, ...visita } = objeto(meta.visita);
  const nova: AnyRecord = p.alteracao.tipo === 'cancelada'
    ? { ...objeto(meta.visita), estado: 'cancelada', cancelada_em: agora }
    : { ...visita, inicio: p.alteracao.inicio, fim: p.alteracao.fim, estado: 'marcada', reagendada_em: agora };

  const { error: erroEscrita } = await supabase
    .from('form_submissions')
    .update({ field_values: { ...fv, _meta: { ...meta, visita: nova } } })
    .eq('id', p.submissionId)
    .eq('organization_id', p.organizationId);
  return erroEscrita ? [`escrita da submissao: ${erroEscrita.message}`] : [];
}

/**
 * Cancela os lembretes pendentes da entidade (entity_type leads/clients), na
 * organizacao. Devolve a lista de falhas (vazia = tudo certo).
 */
export async function cancelarLembretesDaPessoa(
  supabase: SupabaseLike,
  p: { organizationId: string; entityId: string | null },
): Promise<string[]> {
  if (!p.entityId) return [];
  const { error } = await supabase
    .from('scheduled_emails')
    .update({ status: 'cancelled' })
    .in('entity_type', ['leads', 'clients'])
    .eq('entity_id', p.entityId)
    .eq('organization_id', p.organizationId)
    .eq('status', 'pending');
  return error ? [`lembretes da entidade: ${error.message}`] : [];
}

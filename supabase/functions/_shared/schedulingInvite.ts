// Convites de "terminar o agendamento" (scheduling_invites).
//
// O convite aponta a ENTIDADE (entity_id) e a SUBMISSAO que retoma
// (submission_id). Retomar pela submissao do convite -- e nao pela mais
// recente da entidade -- impede que o link continue o envio de outra pessoa
// (por exemplo, de quem submeteu o email de outrem). Nunca le anew_leads.
// Sem imports remotos: testavel no vitest. Toda a consulta leva organizacao.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export type ConviteResolvido =
  | {
    ok: true;
    form_id: string;
    step_number: number | null;
    /** Chave de continuacao que o PublicLeadForm ja usa: o id da submissao do convite. */
    lead_id: string;
    organization_id: string;
    field_values: AnyRecord;
    already_booked: false;
  }
  | { ok: false; code: 'INVALID' | 'EXPIRED' | 'USED' | 'BOOKED' | 'RETRY'; error: string; already_booked?: true };

export async function resolverConvite(params: {
  supabase: SupabaseLike;
  token: unknown;
  now?: Date;
}): Promise<ConviteResolvido> {
  const { supabase } = params;
  const now = params.now ?? new Date();
  if (!params.token || typeof params.token !== 'string') {
    return { ok: false, code: 'INVALID', error: 'Token em falta ou inválido.' };
  }

  // Erro de base nao e link morto: devolve RETRY (503), nunca INVALID.
  const falhou = (passo: string, error: { message?: string }): ConviteResolvido => {
    console.error(`[scheduling-invite] ${passo} falhou:`, error.message);
    return { ok: false, code: 'RETRY', error: 'Não foi possível carregar o pedido. Tente novamente.' };
  };

  const { data: invite, error: inviteError } = await supabase
    .from('scheduling_invites')
    .select('token, entity_id, submission_id, form_id, step_number, organization_id, expires_at, used_at')
    .eq('token', params.token)
    .maybeSingle();
  if (inviteError) return falhou('leitura do convite', inviteError);

  if (!invite) return { ok: false, code: 'INVALID', error: 'Este link não é válido.' };
  if (invite.used_at) return { ok: false, code: 'USED', error: 'Este link já foi utilizado.' };
  if (new Date(invite.expires_at).getTime() <= now.getTime()) {
    return { ok: false, code: 'EXPIRED', error: 'Este link expirou.' };
  }
  if (!invite.submission_id || !invite.entity_id) {
    return { ok: false, code: 'INVALID', error: 'Este pedido já não existe.' };
  }

  // A submissao do convite (nunca a mais recente da entidade).
  const { data: submission, error: submissionError } = await supabase
    .from('form_submissions')
    .select('field_values')
    .eq('id', invite.submission_id)
    .eq('organization_id', invite.organization_id)
    .maybeSingle();
  if (submissionError) return falhou('leitura da submissao', submissionError);
  if (!submission) return { ok: false, code: 'INVALID', error: 'Este pedido já não existe.' };

  // Visita futura e nao cancelada da entidade: nada a retomar.
  const { data: visita, error: visitaError } = await supabase
    .from('schedule_items')
    .select('id')
    .eq('entity_id', invite.entity_id)
    .eq('organization_id', invite.organization_id)
    .neq('status', 'cancelled')
    .gte('start_datetime', now.toISOString())
    .limit(1)
    .maybeSingle();
  // Sem esta leitura nao se sabe se ja ha visita: nao se deixa marcar uma segunda.
  if (visitaError) return falhou('leitura da visita', visitaError);
  if (visita) {
    return { ok: false, code: 'BOOKED', error: 'A sua visita já está agendada.', already_booked: true };
  }

  const fv = submission.field_values;
  return {
    ok: true,
    form_id: invite.form_id,
    step_number: invite.step_number ?? null,
    lead_id: invite.submission_id,
    organization_id: invite.organization_id,
    field_values: fv && typeof fv === 'object' && !Array.isArray(fv) ? fv : {},
    already_booked: false,
  };
}

/**
 * "Já não quero receber": marca o convite e cancela os emails de recuperacao
 * pendentes da entidade do convite, na organizacao do convite. Idempotente.
 */
export async function cancelarConvite(params: {
  supabase: SupabaseLike;
  token: unknown;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; code: 'INVALID' | 'RETRY'; error: string }> {
  const { supabase } = params;
  const now = params.now ?? new Date();
  if (!params.token || typeof params.token !== 'string') {
    return { ok: false, code: 'INVALID', error: 'Token inválido.' };
  }
  const falhou = (passo: string, error: { message?: string }): { ok: false; code: 'RETRY'; error: string } => {
    // Opt-out falhado nunca se confirma: a pessoa continuaria a receber emails.
    console.error(`[scheduling-invite-optout] ${passo} falhou:`, error.message);
    return { ok: false, code: 'RETRY', error: 'Não foi possível concluir o pedido. Tente novamente.' };
  };

  const { data: invite, error: readError } = await supabase
    .from('scheduling_invites')
    .select('token, entity_id, organization_id, unsubscribed_at')
    .eq('token', params.token)
    .maybeSingle();
  if (readError) return falhou('leitura do convite', readError);
  if (!invite) return { ok: false, code: 'INVALID', error: 'Link inválido.' };

  if (!invite.unsubscribed_at) {
    const { error } = await supabase
      .from('scheduling_invites')
      .update({ unsubscribed_at: now.toISOString() })
      .eq('token', params.token);
    if (error) return falhou('marcar o convite', error);
  }
  if (invite.entity_id && invite.organization_id) {
    const { error } = await supabase
      .from('scheduled_emails')
      .update({ status: 'cancelled' })
      .eq('entity_type', 'lead_scheduling_invite')
      .eq('entity_id', invite.entity_id)
      .eq('organization_id', invite.organization_id)
      .eq('status', 'pending');
    if (error) return falhou('cancelar os emails pendentes', error);
  }
  return { ok: true };
}

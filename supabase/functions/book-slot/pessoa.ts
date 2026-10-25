// book-slot: pessoa, dono e escritas depois da marcacao.
//
// O formulario trabalha sobre a ENTIDADE (anew_entities); lead/cliente
// deduz-se por client_since. A chave que o visitante traz (`lead_id`) e o id
// de uma form_submissions. Este modulo nunca le nem escreve anew_leads nem
// anew_clients, e nao tem imports remotos (testavel no vitest).
//
// Toda a consulta com service role leva o filtro de organizacao.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

export type PessoaResolvida =
  | {
    ok: true;
    entityId: string;
    submissionFieldValues: AnyRecord;
    ownerAnewUserId: string | null;
    assignedTo: string | null;
    isClient: boolean;
  }
  | { ok: false; status: number; error: string };

/** Dono da visita: quem trata da entidade (`assigned_to`), senao quem a criou. */
export function donoDaEntidade(
  entity: { assigned_to?: string | null; created_by?: string | null } | null | undefined,
): string | null {
  return entity?.assigned_to ?? entity?.created_by ?? null;
}

/** Tipo para os emails agendados: cliente se tem client_since, senao lead. */
export function tipoParaEmail(isClient: boolean): 'clients' | 'leads' {
  return isClient ? 'clients' : 'leads';
}

const naoEncontrada = (): PessoaResolvida => ({ ok: false, status: 404, error: 'Submission not found for this form' });

/**
 * A pessoa por detras de uma submissao: so conta se a submissao for desta
 * organizacao E deste formulario, e a entidade estiver viva na organizacao.
 */
export async function resolverPessoa(params: {
  supabase: SupabaseLike;
  organizationId: string;
  formId: string;
  submissionId: string;
}): Promise<PessoaResolvida> {
  const { supabase, organizationId, formId, submissionId } = params;
  const { data: sub } = await supabase
    .from('form_submissions')
    .select('id, entity_id, field_values')
    .eq('id', submissionId)
    .eq('organization_id', organizationId)
    .eq('form_id', formId)
    .maybeSingle();
  if (!sub?.entity_id) return naoEncontrada();

  const { data: entity } = await supabase
    .from('anew_entities')
    .select('id, assigned_to, created_by, client_since')
    .eq('id', sub.entity_id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!entity?.id) return naoEncontrada();

  const fv = sub.field_values && typeof sub.field_values === 'object' && !Array.isArray(sub.field_values)
    ? sub.field_values as AnyRecord
    : {};
  return {
    ok: true,
    entityId: entity.id,
    submissionFieldValues: fv,
    ownerAnewUserId: donoDaEntidade(entity),
    assignedTo: entity.assigned_to ?? null,
    isClient: !!entity.client_since,
  };
}

/** Linha de schedule_items: entity_id (as colunas lead_id e client_id ja nao existem). */
export function montarItemAgenda(p: {
  boardId: string;
  title: string;
  entityId: string;
  submissionId: string;
  formId: string;
  slotStart: string;
  slotEnd: string;
  location: string | null;
  postalCode: string | null | undefined;
  organizationId: string;
  createdBy: string;
}): AnyRecord {
  return {
    board_id: p.boardId,
    title: p.title,
    description: `Entidade: ${p.entityId} | Submissao: ${p.submissionId}`,
    entity_id: p.entityId,
    status: 'scheduled',
    origin: 'api',
    start_datetime: p.slotStart,
    end_datetime: p.slotEnd,
    location: p.location || null,
    priority: 0,
    metadata: {
      entity_id: p.entityId,
      submission_id: p.submissionId,
      form_id: p.formId,
      postal_code: p.postalCode ?? null,
      booked_via: 'public_form',
    },
    organization_id: p.organizationId,
    created_by: p.createdBy,
  };
}

/**
 * Campos activos do formulario (chave e mapeamento de contacto), para ler o
 * email, o telefone, o nome e a morada pelas chaves do formulario. Erro de
 * leitura NAO devolve lista vazia: criar a entidade sem estes campos deixava-a
 * sem contacto e a pesquisa de duplicados corria as cegas.
 */
export async function lerDefinicoesDoFormulario(
  supabase: SupabaseLike,
  formId: string,
): Promise<{ ok: true; definitions: AnyRecord[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('form_fields')
    .select('field_key, contact_field_mapping')
    .eq('form_id', formId)
    .eq('is_active', true);
  if (error) return { ok: false, error: `leitura de form_fields falhou: ${error.message}` };
  return { ok: true, definitions: (data ?? []) as AnyRecord[] };
}

function semMeta(values: AnyRecord): AnyRecord {
  const { _meta: _ignorado, ...resto } = values ?? {};
  return resto;
}

type LeituraSubmissao = { ok: true; fieldValues: AnyRecord } | { ok: false; error: string };

/**
 * Le os field_values da submissao. Uma leitura falhada (ou submissao que nao
 * existe) NAO devolve {}: quem escreve a seguir apagaria os campos e o _meta.
 */
async function lerSubmissao(
  supabase: SupabaseLike,
  organizationId: string,
  submissionId: string,
): Promise<LeituraSubmissao> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('field_values')
    .eq('id', submissionId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) return { ok: false, error: `leitura da submissao falhou: ${error.message}` };
  if (!data) return { ok: false, error: 'submissao nao encontrada' };
  const fv = data.field_values;
  return { ok: true, fieldValues: fv && typeof fv === 'object' && !Array.isArray(fv) ? fv : {} };
}

/**
 * Depois de a visita estar marcada: dono da entidade (so se estiver livre),
 * carimbo de actividade, submissao sem marcacao pendente e com a visita no
 * _meta, e convites/emails de recuperacao queimados. Best-effort por passo:
 * a marcacao ja esta feita e nao se desfaz por aqui. Devolve o nome dos
 * passos que falharam (lista vazia = tudo certo) para o chamador os reportar.
 */
export async function marcarVisitaNaEntidade(p: {
  supabase: SupabaseLike;
  organizationId: string;
  entityId: string;
  submissionId: string | null;
  scheduleItemId: string;
  assignToAnewUserId: string | null;
  slotStart: string;
  slotEnd: string;
  boardId: string;
  mergedFieldValues: AnyRecord;
}): Promise<string[]> {
  const { supabase, organizationId, entityId, submissionId } = p;
  const falhas: string[] = [];
  const passo = async (nome: string, fn: () => PromiseLike<{ error?: { message?: string } | null } | void>) => {
    try {
      const r = await fn();
      if (r && r.error) {
        falhas.push(nome);
        console.error(`[book-slot] ${nome} falhou (a continuar):`, r.error.message);
      }
    } catch (e) {
      falhas.push(nome);
      console.error(`[book-slot] ${nome} falhou (a continuar):`, e);
    }
  };

  // NUNCA por cima de um dono que ja existe.
  if (p.assignToAnewUserId) {
    await passo('atribuir dono', () =>
      supabase
        .from('anew_entities')
        .update({ assigned_to: p.assignToAnewUserId })
        .eq('id', entityId)
        .eq('organization_id', organizationId)
        .is('assigned_to', null));
  }

  await passo('carimbo de actividade', () =>
    supabase
      .from('anew_entities')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', entityId)
      .eq('organization_id', organizationId));

  if (submissionId) {
    await passo('actualizar submissao', async () => {
      const leitura = await lerSubmissao(supabase, organizationId, submissionId);
      // Leitura falhada: nao se escreve por cima (perderia o _meta e os campos).
      if (!leitura.ok) return { error: { message: leitura.error } };
      const { _meta: metaExistente, ...camposExistentes } = leitura.fieldValues;
      return supabase
        .from('form_submissions')
        .update({
          needs_manual_scheduling: false,
          field_values: {
            ...camposExistentes,
            ...semMeta(p.mergedFieldValues),
            _meta: {
              ...(metaExistente ?? {}),
              visita: {
                schedule_item_id: p.scheduleItemId,
                inicio: p.slotStart,
                fim: p.slotEnd,
                board_id: p.boardId,
                marcada_em: new Date().toISOString(),
              },
            },
          },
        })
        .eq('id', submissionId)
        .eq('organization_id', organizationId);
    });
  }

  await passo('queimar convites', () =>
    supabase
      .from('scheduling_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('entity_id', entityId)
      .eq('organization_id', organizationId)
      .is('used_at', null));

  await passo('cancelar emails de recuperacao', () =>
    supabase
      .from('scheduled_emails')
      .update({ status: 'cancelled' })
      .eq('entity_type', 'lead_scheduling_invite')
      .eq('entity_id', entityId)
      .eq('organization_id', organizationId)
      .eq('status', 'pending'));

  return falhas;
}

/**
 * O comercial da pessoa nao tem a hora livre: guarda-se a hora pedida na
 * submissao e marca-se por agendar a mao (a fila do comercial mostra-a).
 * Devolve ok:false se a leitura ou a escrita falhou (o chamador responde RETRY
 * em vez de dizer ao visitante que o pedido ficou guardado).
 */
export async function pedirMarcacaoManual(p: {
  supabase: SupabaseLike;
  organizationId: string;
  submissionId: string;
  boardId: string;
  formId: string;
  slotStart: string;
  slotEnd: string;
  districtId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, organizationId, submissionId } = p;
  try {
    const leitura = await lerSubmissao(supabase, organizationId, submissionId);
    if (!leitura.ok) {
      console.error('[book-slot] nao foi possivel guardar a hora pedida:', leitura.error);
      return { ok: false, error: leitura.error };
    }
    const { _meta: metaExistente, ...campos } = leitura.fieldValues;
    const { error } = await supabase
      .from('form_submissions')
      .update({
        needs_manual_scheduling: true,
        field_values: {
          ...campos,
          _meta: {
            ...(metaExistente ?? {}),
            agendamento_pedido: {
              inicio: p.slotStart,
              fim: p.slotEnd,
              board_id: p.boardId,
              form_id: p.formId,
              distrito_id: p.districtId,
              pedido_em: new Date().toISOString(),
            },
          },
        },
      })
      .eq('id', submissionId)
      .eq('organization_id', organizationId);
    if (error) {
      console.error('[book-slot] nao foi possivel guardar a hora pedida:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[book-slot] nao foi possivel guardar a hora pedida:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Corpos dos pedidos do formulario publico a create-lead e update-lead.
//
// A campanha e so atribuicao e e opcional: sem ela o pedido segue so com
// form_id (o servidor decide a organizacao e a campanha valida). A chave de
// continuacao entre passos e o id da submissao que o create-lead devolve.

export type StepFieldValues = Record<string, unknown>;

interface CreateLeadBodyInput {
  stepNumber: number;
  stepFieldValues: StepFieldValues;
  sourceId: string | null;
  needsManualScheduling: boolean;
  locale: string | null;
  formId?: string;
  campaignId?: string;
  tracking?: Record<string, unknown> | null;
  embedKind?: string | null;
  /** Campo armadilha (honeypot): so vai se alguem o preencheu, ou seja, um bot. */
  honeypot?: string | null;
}

export function buildCreateLeadBody(input: CreateLeadBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    step_number: input.stepNumber,
    field_values: input.stepFieldValues,
    source: 'public_form',
    source_id: input.sourceId || null,
    needs_manual_scheduling: input.needsManualScheduling,
  };
  if (input.locale) body.lang = input.locale;
  if (input.formId) body.form_id = input.formId;
  if (input.campaignId) body.campaign_id = input.campaignId;
  if (input.tracking) body.tracking = input.tracking;
  if (input.embedKind) body.embed = input.embedKind;
  if (input.honeypot && input.honeypot.trim()) body.website = input.honeypot;
  return body;
}

interface UpdateLeadBodyInput {
  targetType: 'lead' | 'contact' | 'client' | 'submission';
  leadId: string;
  formId?: string;
  campaignId?: string;
  stepNumber: number;
  stepFieldValues: StepFieldValues;
  needsManualScheduling: boolean;
  locale: string | null;
  tracking?: Record<string, unknown> | null;
}

export function buildUpdateLeadBody(input: UpdateLeadBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    target_type: input.targetType,
    target_id: input.leadId,
    lead_id: input.leadId,
    step_number: input.stepNumber,
    field_values: input.stepFieldValues,
    needs_manual_scheduling: input.needsManualScheduling,
  };
  if (input.formId) body.form_id = input.formId;
  if (input.campaignId) body.campaign_id = input.campaignId;
  if (input.locale) body.lang = input.locale;
  if (input.tracking) body.tracking = input.tracking;
  return body;
}

// Modulo puro, sem imports, para poder ser testado com vitest sem o runtime Deno.
// Resolve QUE aviso enviar quando a Agenda interna muda uma visita, e monta
// os textos (assunto, heading, intro, SMS) para esse aviso.

export type ScheduleChange = 'datetime' | 'assignee';
export type NoticeKind = 'datetime' | 'assignee' | 'both';

export interface ScheduleNotifyToggles {
  notify_client_on_reschedule: boolean;
  notify_client_on_reassign: boolean;
}

export function resolveNoticeKind(
  requested: ScheduleChange[],
  toggles: ScheduleNotifyToggles,
): NoticeKind | null {
  const wanted = new Set<ScheduleChange>();
  for (const change of requested) {
    if (change === 'datetime' && toggles.notify_client_on_reschedule) {
      wanted.add('datetime');
    } else if (change === 'assignee' && toggles.notify_client_on_reassign) {
      wanted.add('assignee');
    }
  }

  const hasDatetime = wanted.has('datetime');
  const hasAssignee = wanted.has('assignee');

  if (hasDatetime && hasAssignee) return 'both';
  if (hasDatetime) return 'datetime';
  if (hasAssignee) return 'assignee';
  return null;
}

export interface NoticeCopyInput {
  companyName: string;
  meetingDate: string;
  technicianName: string;
  manageUrl?: string;
  includeSmsLink: boolean;
}

export interface NoticeCopy {
  subject: string;
  heading: string;
  intro: string;
  sms: string;
}

function resolveCompanyName(companyName: string): string {
  return companyName && companyName.trim().length > 0 ? companyName : 'A empresa';
}

function resolveTechnicianName(technicianName: string): string {
  return technicianName && technicianName.trim().length > 0 ? technicianName : 'um novo responsável';
}

function appendSmsLink(sms: string, v: NoticeCopyInput): string {
  if (v.includeSmsLink && v.manageUrl) {
    return `${sms} Gerir: ${v.manageUrl}`;
  }
  return sms;
}

export function buildNoticeCopy(kind: NoticeKind, v: NoticeCopyInput): NoticeCopy {
  const companyName = resolveCompanyName(v.companyName);
  const { meetingDate } = v;

  if (kind === 'datetime') {
    const subject = `A sua visita foi reagendada — ${meetingDate}`;
    const heading = 'Visita reagendada';
    const intro = 'A data da sua visita foi alterada. Os novos detalhes estão abaixo.';
    const sms = appendSmsLink(
      `${companyName}: a sua visita foi reagendada para ${meetingDate}.`,
      v,
    );
    return { subject, heading, intro, sms };
  }

  if (kind === 'assignee') {
    const technicianName = resolveTechnicianName(v.technicianName);
    const subject = `Novo responsável pela sua visita — ${meetingDate}`;
    const heading = 'Novo responsável pela sua visita';
    const intro = `A sua visita passa a ser acompanhada por ${technicianName}. A data mantém-se.`;
    const sms = appendSmsLink(
      `${companyName}: a sua visita de ${meetingDate} passa a ser acompanhada por ${technicianName}.`,
      v,
    );
    return { subject, heading, intro, sms };
  }

  // both
  const technicianName = resolveTechnicianName(v.technicianName);
  const subject = `A sua visita foi atualizada — ${meetingDate}`;
  const heading = 'Visita atualizada';
  const intro = `A sua visita foi reagendada e passa a ser acompanhada por ${technicianName}. Os novos detalhes estão abaixo.`;
  const sms = appendSmsLink(
    `${companyName}: a sua visita foi reagendada para ${meetingDate} e passa a ser acompanhada por ${technicianName}.`,
    v,
  );
  return { subject, heading, intro, sms };
}

// Configuracao propria da Agenda (schedule_settings) para os canais e modelos.
export interface ScheduleNoticeChannelSettings {
  reschedule_notify_email?: boolean | null;
  reschedule_notify_sms?: boolean | null;
  reschedule_email_template_id?: string | null;
  reschedule_sms_message?: string | null;
  reassign_notify_email?: boolean | null;
  reassign_notify_sms?: boolean | null;
  reassign_email_template_id?: string | null;
  reassign_sms_message?: string | null;
}

export interface NoticeChannels {
  email: boolean;
  sms: boolean;
  templateId: string | null;
  smsMessage: string | null;
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Canais, modelo de email e texto de SMS para um tipo de aviso.
 * 'both' = uniao dos canais dos dois eventos; modelo e SMS sao os de data/hora
 * se existirem e o canal desse evento estiver ligado, senao os de comercial
 * (idem), senao null (texto fixo).
 */
export function resolveNoticeChannels(
  kind: NoticeKind,
  s: ScheduleNoticeChannelSettings,
): NoticeChannels {
  const reschedule: NoticeChannels = {
    email: s.reschedule_notify_email ?? true,
    sms: s.reschedule_notify_sms ?? false,
    templateId: nonEmpty(s.reschedule_email_template_id),
    smsMessage: nonEmpty(s.reschedule_sms_message),
  };
  const reassign: NoticeChannels = {
    email: s.reassign_notify_email ?? true,
    sms: s.reassign_notify_sms ?? false,
    templateId: nonEmpty(s.reassign_email_template_id),
    smsMessage: nonEmpty(s.reassign_sms_message),
  };

  if (kind === 'datetime') return reschedule;
  if (kind === 'assignee') return reassign;
  // Modelo e SMS so vem de um evento cujo canal correspondente esta ligado.
  const emailSources = [reschedule, reassign].filter((e) => e.email);
  const smsSources = [reschedule, reassign].filter((e) => e.sms);
  return {
    email: emailSources.length > 0,
    sms: smsSources.length > 0,
    templateId: emailSources.map((e) => e.templateId).find((v) => v !== null) ?? null,
    smsMessage: smsSources.map((e) => e.smsMessage).find((v) => v !== null) ?? null,
  };
}

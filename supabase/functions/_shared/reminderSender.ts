// Decide, per reminder target line (client or technician), which identity
// (scheduled_emails.user_id) and which explicit SMTP the row should carry.
//
// Technician line: uses the technician actually assigned to THIS visit
// (schedule_resources.user_id), never a random active member of the
// organization -- that arbitrary member is what createdBy resolves to today
// (anew_memberships ... LIMIT 1, no ORDER BY). The technician's own SMTP
// (if configured) is only honored through the form's smtp_id being absent
// on this specific row's identity; the SMTP itself always comes from the
// form (formSmtpId), so it never depends on which technician is assigned.
//
// Client line: always depends on the form's SMTP, falling back to the
// organization's default SMTP -- never on createdBy's personal SMTP, which
// would be an arbitrary member's mailbox.
export type ReminderTargetKind = 'client' | 'technician';

export interface ReminderSenderInput {
  kind: ReminderTargetKind;
  technicianUserId: string | null | undefined; // schedule_resources.user_id (anew_users.id)
  createdBy: string; // fallback, NOT NULL column
  formSmtpId: string | null | undefined; // emailCfg.email_smtp_id
  orgDefaultSmtpId: string | null | undefined; // only used for the client line
}

export interface ReminderSenderResult {
  userId: string;
  smtpId: string | null;
}

export function pickReminderSender(input: ReminderSenderInput): ReminderSenderResult {
  const technicianUserId = input.technicianUserId || null;
  const formSmtpId = input.formSmtpId || null;
  const orgDefaultSmtpId = input.orgDefaultSmtpId || null;

  if (input.kind === 'technician') {
    return {
      userId: technicianUserId || input.createdBy,
      smtpId: formSmtpId,
    };
  }

  return {
    userId: input.createdBy,
    smtpId: formSmtpId || orgDefaultSmtpId,
  };
}

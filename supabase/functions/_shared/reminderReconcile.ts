// Plano de acertos dos lembretes de UMA visita (emails e SMS), puro: sem rede,
// sem Deno. Quem o chama (reminderRunner.ts, nos processadores de lembretes)
// le as linhas da visita, a visita, os comerciais actuais e o formulario, e
// aplica as accoes devolvidas.
//
// Regras:
//  - Visita apagada, cancelada ou ja comecada: cancelar todos os lembretes
//    pendentes.
//  - Lembrete do comercial cujo comercial ja nao esta na visita: cancelar.
//  - Visita mudou de hora (a hora que o lembrete assumia difere da actual): o
//    lembrete passa a sair X horas antes da NOVA hora, com X = intervalo ACTUAL
//    do formulario (so se o formulario ja nao existir usa-se o intervalo
//    gravado: hora da visita assumida menos hora do lembrete). Se essa hora
//    nova do lembrete ja passou, NAO se envia: a linha e cancelada com motivo,
//    como a marcacao ja faz. Nunca "enviar logo".
//  - Comercial acrescentado (varios recursos, ou troca): cria-se-lhe um
//    lembrete, uma linha por comercial, com a mesma regra de hora, e so se ainda
//    ha tempo. Um comercial que ja tem lembrete pendente, enviado ou falhado
//    para esta visita nao recebe outro.

export type ReminderChannel = "email" | "sms";
export type ReminderAudience = "client" | "technician";

export interface ReminderLine {
  id: string;
  channel: ReminderChannel;
  audience: ReminderAudience | null;
  /** Email (emails) ou telefone (SMS) do destinatario. */
  recipient: string | null;
  /** pending | sent | failed | cancelled */
  status: string;
  /** ISO: quando o lembrete esta marcado para sair. */
  scheduled_for: string;
  /** ISO: hora da visita que o lembrete assumia. */
  visit_start_snapshot: string | null;
}

export interface ReminderVisit {
  status: string | null;
  /** ISO: hora actual da visita. */
  start_datetime: string;
}

export interface CurrentTechnician {
  email: string | null;
  user_id: string | null;
}

export interface ReminderFormState {
  reminder_enabled: boolean;
  reminder_hours_before: number | null;
}

export type ReminderAction =
  | { kind: "cancel"; line_id: string; channel: ReminderChannel; reason: string }
  | { kind: "move"; line_id: string; channel: ReminderChannel; scheduled_for: string; snapshot: string }
  | { kind: "create_technician"; email: string; user_id: string | null; scheduled_for: string; snapshot: string };

export interface PlanInput {
  lines: ReminderLine[];
  visit: ReminderVisit | null;
  technicians: CurrentTechnician[];
  form: ReminderFormState | null;
  now: Date;
}

export const REASON_VISIT_GONE = "Visita cancelada, apagada ou já realizada";
export const REASON_TECHNICIAN_REMOVED = "O comercial já não está na visita";
export const REASON_REMINDER_TIME_PASSED = "A hora do lembrete para a nova data da visita já passou";
export const REASON_CONTENT_UNRECOVERABLE =
  "O texto do lembrete tinha a data antiga e não foi possível refazê-lo com a data nova";

const HOUR_MS = 3_600_000;

function normEmail(e: string | null | undefined): string {
  return (e || "").trim().toLowerCase();
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  return s === "cancelled" || s === "canceled" || s === "cancelado" || s === "cancelada";
}

/** Antecedencia (ms) a usar para uma linha: a do formulario actual, senao a gravada. */
function intervalMsFor(line: ReminderLine | null, form: ReminderFormState | null): number | null {
  if (form && form.reminder_hours_before !== null && form.reminder_hours_before > 0) {
    return form.reminder_hours_before * HOUR_MS;
  }
  if (line?.visit_start_snapshot) {
    const saved = new Date(line.visit_start_snapshot).getTime() - new Date(line.scheduled_for).getTime();
    if (Number.isFinite(saved) && saved > 0) return saved;
  }
  return null;
}

/**
 * Ao reagendar pelo link: cria-se lembrete para a nova data quando a visita ja
 * nao tem nenhum lembrete PENDENTE. Um lembrete ja enviado (ou falhado, ou
 * cancelado por a hora ja ter passado) era da data anterior e nao cobre a nova.
 */
export function needsNewReminderLines(lines: readonly { status: string }[]): boolean {
  return !lines.some((l) => l.status === "pending");
}

export function planReminderActions(input: PlanInput): ReminderAction[] {
  const { lines, visit, technicians, form, now } = input;
  const nowMs = now.getTime();
  const actions: ReminderAction[] = [];
  const pending = lines.filter((l) => l.status === "pending");

  const visitMs = visit ? new Date(visit.start_datetime).getTime() : NaN;
  const visitGone = !visit || isCancelledStatus(visit.status) || !Number.isFinite(visitMs) || visitMs <= nowMs;
  if (visitGone) {
    return pending.map((l) => ({ kind: "cancel", line_id: l.id, channel: l.channel, reason: REASON_VISIT_GONE }));
  }
  const startIso = new Date(visitMs).toISOString();

  const currentEmails = new Set(technicians.map((t) => normEmail(t.email)).filter(Boolean));

  for (const line of pending) {
    // Comercial retirado da visita.
    if (line.audience === "technician" && line.channel === "email" && !currentEmails.has(normEmail(line.recipient))) {
      actions.push({ kind: "cancel", line_id: line.id, channel: line.channel, reason: REASON_TECHNICIAN_REMOVED });
      continue;
    }

    // Hora mudou: o lembrete acompanha, X horas antes da nova hora.
    if (!line.visit_start_snapshot) continue;
    const snapMs = new Date(line.visit_start_snapshot).getTime();
    if (!Number.isFinite(snapMs) || snapMs === visitMs) continue;
    const interval = intervalMsFor(line, form);
    if (interval === null) continue;
    const newFor = visitMs - interval;
    if (newFor <= nowMs) {
      actions.push({ kind: "cancel", line_id: line.id, channel: line.channel, reason: REASON_REMINDER_TIME_PASSED });
    } else {
      actions.push({
        kind: "move",
        line_id: line.id,
        channel: line.channel,
        scheduled_for: new Date(newFor).toISOString(),
        snapshot: startIso,
      });
    }
  }

  // Comerciais acrescentados: so se o formulario ainda tem lembrete ligado, a
  // visita ja tinha lembretes, e ainda ha tempo.
  const intent = lines.some((l) => l.status === "pending" || l.status === "sent");
  if (intent && form && form.reminder_enabled && form.reminder_hours_before !== null && form.reminder_hours_before > 0) {
    const newFor = visitMs - form.reminder_hours_before * HOUR_MS;
    if (newFor > nowMs) {
      const covered = new Set(
        lines
          .filter((l) =>
            l.audience === "technician" && l.channel === "email" &&
            (l.status === "pending" || l.status === "sent" || l.status === "failed")
          )
          .map((l) => normEmail(l.recipient)),
      );
      const seen = new Set<string>();
      for (const t of technicians) {
        const email = normEmail(t.email);
        if (!email || covered.has(email) || seen.has(email)) continue;
        seen.add(email);
        actions.push({
          kind: "create_technician",
          email,
          user_id: t.user_id,
          scheduled_for: new Date(newFor).toISOString(),
          snapshot: startIso,
        });
      }
    }
  }

  return actions;
}

// Decisao pura sobre uma linha de lembrete pendente (scheduled_emails) face ao
// estado ACTUAL da visita. Ainda nao esta ligada a nada: quem a chamar (o
// processador de lembretes) le a linha e a visita e aplica a accao devolvida.
//
// Accoes:
//  - cancel:   nao enviar (visita cancelada, apagada ou passada; ou o lembrete
//              e do comercial e a visita ficou sem comercial com email).
//  - move:     a visita mudou de hora; o lembrete acompanha, mantendo a mesma
//              antecedencia que tinha.
//  - retarget: mudou o comercial; o lembrete vai para o comercial actual.
//  - send:     enviar agora tal como esta (ou, se a hora nova do lembrete ja
//              passou mas a visita ainda nao, enviar de imediato).

export interface ReminderRow {
  /** ISO: quando o lembrete estava marcado para sair. */
  scheduled_for: string;
  to_email: string;
  user_id: string | null;
  /** Para quem e o lembrete. */
  kind: "client" | "technician";
  /** ISO: hora da visita quando o lembrete foi agendado. */
  visit_start_snapshot: string;
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

export type ReminderActionKind = "send" | "move" | "retarget" | "cancel";

export interface ReminderDecision {
  action: ReminderActionKind;
  /** ISO: valor a gravar em scheduled_for. */
  scheduled_for: string;
  to_email: string;
  user_id: string | null;
  /** ISO: novo visit_start_snapshot. */
  snapshot: string;
}

const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "cancelado", "cancelada"]);

function normEmail(e: string | null | undefined): string {
  return (e || "").trim().toLowerCase();
}

export function decideReminderAction(
  row: ReminderRow,
  visit: ReminderVisit | null,
  currentTechnician: CurrentTechnician | null,
  now: Date,
): ReminderDecision {
  const unchanged: ReminderDecision = {
    action: "cancel",
    scheduled_for: row.scheduled_for,
    to_email: row.to_email,
    user_id: row.user_id,
    snapshot: row.visit_start_snapshot,
  };
  const nowMs = now.getTime();

  // 1. Visita apagada, cancelada ou ja passada.
  if (!visit) return unchanged;
  if (visit.status && CANCELLED_STATUSES.has(visit.status.toLowerCase())) return unchanged;
  const visitMs = new Date(visit.start_datetime).getTime();
  if (!Number.isFinite(visitMs) || visitMs <= nowMs) return unchanged;

  const isTechnician = row.kind === "technician";

  // 2. Lembrete do comercial e a visita ficou sem comercial (ou sem email).
  if (isTechnician && (!currentTechnician || !normEmail(currentTechnician.email))) {
    return unchanged;
  }

  // Destino: o do comercial actual, se mudou.
  let toEmail = row.to_email;
  let userId = row.user_id;
  let techChanged = false;
  if (isTechnician && currentTechnician) {
    const cur = normEmail(currentTechnician.email);
    if (cur !== normEmail(row.to_email)) {
      techChanged = true;
      toEmail = cur;
      userId = currentTechnician.user_id;
    }
  }

  // 3. Hora mudou: o lembrete acompanha, com a mesma antecedencia.
  const snapshotMs = new Date(row.visit_start_snapshot).getTime();
  const scheduledMs = new Date(row.scheduled_for).getTime();
  if (Number.isFinite(snapshotMs) && Number.isFinite(scheduledMs) && snapshotMs !== visitMs) {
    const newForMs = visitMs - (snapshotMs - scheduledMs);
    const snapshot = new Date(visitMs).toISOString();
    if (newForMs <= nowMs) {
      // Lembrete ja vencido mas a visita ainda nao: sai agora.
      return { action: "send", scheduled_for: now.toISOString(), to_email: toEmail, user_id: userId, snapshot };
    }
    return {
      action: "move",
      scheduled_for: new Date(newForMs).toISOString(),
      to_email: toEmail,
      user_id: userId,
      snapshot,
    };
  }

  // 4. So o comercial mudou.
  if (techChanged) {
    return {
      action: "retarget",
      scheduled_for: row.scheduled_for,
      to_email: toEmail,
      user_id: userId,
      snapshot: row.visit_start_snapshot,
    };
  }

  // 5. Nada mudou.
  return { ...unchanged, action: "send" };
}

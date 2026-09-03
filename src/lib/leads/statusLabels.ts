/**
 * Os rótulos em português dos estados da lead, num sítio só.
 *
 * Estavam fechados dentro do LeadTimelineTab, e a reversão de cliente para lead
 * precisa exactamente dos mesmos: quem lê "a lead voltou a negotiation" não
 * percebe o que aconteceu, e duas listas separadas divergiam à primeira mudança
 * de funil.
 */
export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  contacted: "Contactado",
  visit_scheduled: "Visita Agendada",
  qualified: "Qualificado",
  negotiation: "Negociação",
  converted: "Ganho",
  rejected: "Perdido",
  lost: "Perdido",
  incomplete: "Incompleto",
  cancelled: "Cancelado",
  callback_scheduled: "Callback Agendado",
  no_answer: "Sem Resposta",
};

/**
 * Devolve o valor bruto quando não há rótulo: os funis são configuráveis por
 * organização, por isso um estado desconhecido é normal e mostrá-lo tal como
 * está na base é melhor do que esconder a informação.
 */
export const leadStatusLabel = (value: string | null | undefined): string =>
  (value && LEAD_STATUS_LABELS[value]) || value || "";

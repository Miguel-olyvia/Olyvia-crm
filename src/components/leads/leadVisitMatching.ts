import { extractLeadContactInfo } from "@/utils/leadContactInfo";

type JsonObject = Record<string, any>;

export type LeadLike = {
  id: string;
  field_values: Record<string, any> | null;
};

export type ScheduleItemLike = {
  id: string;
  title?: string | null;
  start_datetime?: string;
  end_datetime?: string;
  location?: string | null;
  status?: string;
  assignees?: any;
  description?: string | null;
  metadata?: any | null;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

const normalizePhoneDigits = (value: string) => value.replace(/\D/g, "");

const safeString = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export const findScheduleItemForLead = (
  items: ScheduleItemLike[],
  lead: LeadLike
): { item: ScheduleItemLike | null; matchReason: string } => {
  const leadInfo = extractLeadContactInfo(lead.field_values);
  const leadEmail = leadInfo.email ? normalize(leadInfo.email) : null;
  const leadPhoneDigits = leadInfo.phone ? normalizePhoneDigits(leadInfo.phone) : "";

  // 1) Exact metadata link
  const byLeadId = items.find((it) => (it.metadata as JsonObject | null)?.lead_id === lead.id);
  if (byLeadId) return { item: byLeadId, matchReason: "metadata.lead_id" };

  // 2) Email match (metadata OR description)
  if (leadEmail) {
    const byEmail = items.find((it) => {
      const md = (it.metadata as JsonObject | null) || {};
      const mdEmail = md.lead_email ? normalize(String(md.lead_email)) : "";
      const desc = normalize(safeString(it.description));
      return mdEmail === leadEmail || (!!desc && desc.includes(leadEmail));
    });
    if (byEmail) return { item: byEmail, matchReason: "lead email" };
  }

  // 3) Phone match (metadata OR description) – compare digits only
  if (leadPhoneDigits && leadPhoneDigits.length >= 7) {
    const byPhone = items.find((it) => {
      const md = (it.metadata as JsonObject | null) || {};
      const mdPhoneDigits = normalizePhoneDigits(safeString(md.lead_phone));
      const descDigits = normalizePhoneDigits(safeString(it.description));
      return (
        (mdPhoneDigits && mdPhoneDigits.includes(leadPhoneDigits)) ||
        (descDigits && descDigits.includes(leadPhoneDigits))
      );
    });
    if (byPhone) return { item: byPhone, matchReason: "lead phone" };
  }

  // 4) Conservative name match in title/description/location for legacy records without metadata.
  //    Use word-boundary matching and require at least 4 characters to avoid false positives
  //    (e.g. "Ana" matching inside "Merceana").
  const nameCandidates = [leadInfo.name, leadInfo.lastName, leadInfo.firstName]
    .map((v) => safeString(v).trim())
    .filter((v) => v.length >= 4)
    .map((v) => normalize(v));

  if (nameCandidates.length > 0) {
    const byName = items.find((it) => {
      const haystack = normalize(
        [safeString(it.title), safeString(it.description), safeString(it.location)].join(" ")
      );
      return nameCandidates.some((candidate) => {
        // Use word-boundary matching: the candidate must appear as a whole word
        const regex = new RegExp(`(?:^|\\s|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|[^a-z0-9])`);
        return regex.test(haystack);
      });
    });

    if (byName) return { item: byName, matchReason: "lead name (legacy)" };
  }

  return { item: null, matchReason: "no confident match" };
};

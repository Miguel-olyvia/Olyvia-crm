export type DucVariant = "universal" | "mudelar_obra" | "bmg_contrato";
export type DucStatus = "draft" | "in_progress" | "delivered" | "closed";
export type DucSection =
  | "scope"
  | "material"
  | "consumable"
  | "control_point"
  | "change_log"
  | "service_map";

export interface TrackingEntry {
  stage: number;
  state: "pending" | "done";
  date?: string | null;
  signed_by?: string | null;
  note?: string | null;
}

export interface DucRecord {
  id: string;
  organization_id: string;
  root_organization_id: string | null;
  client_id: string | null;
  duc_number: string | null;
  title: string | null;
  variant: DucVariant;
  current_stage: number;
  status: DucStatus;
  assigned_to: string | null;
  blocks: Record<string, Record<string, unknown>>;
  tracking: TrackingEntry[];
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface DucItem {
  id: string;
  duc_id: string;
  organization_id: string;
  section: DucSection;
  position: number;
  label: string | null;
  description: string | null;
  qty: number | null;
  unit: string | null;
  included: boolean | null;
  meta: Record<string, unknown>;
}

export interface ClientOption {
  id: string;
  entity_id: string | null;
  name: string;
  assigned_to: string | null;
  /** Data de referência do contrato (assinatura/criação) — para "dias sem DUC". */
  since?: string | null;
}

export type AttachmentCategory =
  | "layout"
  | "renders"
  | "needs_map"
  | "photos_visit"
  | "site_photos"
  | "other";

export interface DucAttachment {
  id: string;
  duc_id: string;
  organization_id: string;
  category: AttachmentCategory;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
}

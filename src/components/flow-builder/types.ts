/* ═══════════════ Dynamic Node Type System — Types ═══════════════ */

export type CustomFieldType = "text" | "number" | "dropdown" | "toggle" | "date" | "textarea";

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];       // for dropdown
  required: boolean;
  defaultValue?: string;
  order: number;
}

export type NodeBehaviorType = "trigger" | "action" | "condition" | "delay" | "end";

export interface NodeCategory {
  id: string;
  name: string;      // includes emoji e.g. "⚡ Triggers"
  order: number;
}

export interface CustomNodeType {
  id: string;
  name: string;
  emoji: string;
  color: string;            // header background
  categoryId: string;
  behaviorType: NodeBehaviorType;
  fields: CustomField[];
  description?: string;
  isDefault?: boolean;      // seed/factory node
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  createdAt: string;
  isDefault?: boolean;
}

export const BEHAVIOR_LABELS: Record<NodeBehaviorType, string> = {
  trigger: "TRIGGER",
  action: "ACÇÃO",
  condition: "CONDIÇÃO",
  delay: "ESPERAR",
  end: "FIM",
};

export const BEHAVIOR_COLORS: Record<NodeBehaviorType, string> = {
  trigger: "#7c3aed",
  action: "#2563eb",
  condition: "#d97706",
  delay: "#64748b",
  end: "#059669",
};

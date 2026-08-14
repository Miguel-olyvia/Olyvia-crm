// ToolResult helpers — CREATED but NOT adopted in Fase 0B.
// Existing handlers keep returning object literals unchanged.
// These helpers exist so Fase 1+ can migrate handlers gradually.

import type { ToolResult } from "./types.ts";

export const ok = (data: Record<string, unknown> = {}): ToolResult => ({
  success: true,
  ...data,
});

export const fail = (message: string, extra: Record<string, unknown> = {}): ToolResult => ({
  success: false,
  message,
  ...extra,
});

export const requiresConfirmation = (p: {
  message: string;
  candidate_entity_id: string;
  candidate_name: string | null;
  match_field: string;
  proposed_payload: unknown;
}): ToolResult => ({
  success: false,
  requires_confirmation: true,
  ...p,
});

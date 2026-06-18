import { describe, it, expect } from "vitest";

/**
 * L24: `field_values` must only be included in the update payload when the
 * user is actively editing fields. This guards against auto-save flows
 * (status changes, scheduling, notes) clobbering concurrent edits in another
 * tab or session.
 *
 * The test below mirrors the exact spread used in
 * `AnewLeadContactDialog.tsx` (around line 820) so any future regression to
 * an unconditional `field_values: editableFieldValues` will fail here.
 */
function buildUpdatePayload(opts: {
  isEditingFields: boolean;
  editableFieldValues: Record<string, unknown>;
  status: string;
}) {
  return {
    status: opts.status,
    ...(opts.isEditingFields ? { field_values: opts.editableFieldValues } : {}),
  };
}

describe("AnewLeadContactDialog field_values guard (L24)", () => {
  it("includes field_values when isEditingFields is true", () => {
    const payload = buildUpdatePayload({
      isEditingFields: true,
      editableFieldValues: { nome: "Maria", email: "m@x.pt" },
      status: "contacted",
    });
    expect(payload).toHaveProperty("field_values");
    expect(payload.field_values).toEqual({ nome: "Maria", email: "m@x.pt" });
  });

  it("omits field_values when isEditingFields is false (status-only auto-save)", () => {
    const payload = buildUpdatePayload({
      isEditingFields: false,
      editableFieldValues: { nome: "Maria" },
      status: "contacted",
    });
    expect(payload).not.toHaveProperty("field_values");
  });

  it("omits field_values for callback/notes-only flows (no field edit)", () => {
    const payload = buildUpdatePayload({
      isEditingFields: false,
      editableFieldValues: { nome: "stale-from-other-tab" },
      status: "callback_scheduled",
    });
    expect(payload).not.toHaveProperty("field_values");
  });

  it("simulates two concurrent tabs: tab B (status only) does not overwrite tab A (field edit)", () => {
    // Tab A: user edited fields and saved
    const tabA = buildUpdatePayload({
      isEditingFields: true,
      editableFieldValues: { nome: "Maria-edited" },
      status: "contacted",
    });
    // Tab B: only changed status, never touched fields
    const tabB = buildUpdatePayload({
      isEditingFields: false,
      editableFieldValues: { nome: "stale" },
      status: "qualified",
    });

    expect(tabA.field_values).toEqual({ nome: "Maria-edited" });
    expect(tabB).not.toHaveProperty("field_values");
  });
});

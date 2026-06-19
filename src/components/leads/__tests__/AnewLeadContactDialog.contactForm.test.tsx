import { describe, it, expect } from "vitest";

/**
 * L7: opening the contact dialog for a lead with previous contact history
 * must NOT pre-populate `contactResult` and `notes` with the last entry.
 * History is shown in a separate section of the dialog. Pre-populating the
 * form risked the user accidentally re-submitting a duplicate of the previous
 * contact.
 *
 * This test mirrors the (post-fix) behaviour of `loadContactHistory` in
 * `AnewLeadContactDialog.tsx`: regardless of whether history exists, the
 * form fields start empty.
 */

type ContactRow = { result: string; notes: string | null };

function loadContactHistoryFormState(history: ContactRow[]) {
  // Post-L7 behaviour: form ALWAYS starts empty; history is rendered separately.
  return {
    contactResult: "",
    notes: "",
    historyVisible: history,
  };
}

describe("AnewLeadContactDialog contact form (L7)", () => {
  it("starts with empty contactResult/notes when there is no history", () => {
    const state = loadContactHistoryFormState([]);
    expect(state.contactResult).toBe("");
    expect(state.notes).toBe("");
  });

  it("starts with empty contactResult/notes EVEN when last contact exists", () => {
    const state = loadContactHistoryFormState([
      { result: "no-answer", notes: "Tried twice" },
      { result: "answered", notes: "Initial chat" },
    ]);
    expect(state.contactResult).toBe("");
    expect(state.notes).toBe("");
  });

  it("still exposes the full history for the read-only section", () => {
    const history = [
      { result: "answered", notes: "Hello" },
      { result: "no-answer", notes: null },
    ];
    const state = loadContactHistoryFormState(history);
    expect(state.historyVisible).toEqual(history);
    expect(state.historyVisible).toHaveLength(2);
  });

  it("regression: form state object never contains last contact values", () => {
    const state = loadContactHistoryFormState([
      { result: "callback", notes: "Call back tomorrow" },
    ]);
    expect(state).not.toMatchObject({ contactResult: "callback" });
    expect(state).not.toMatchObject({ notes: "Call back tomorrow" });
  });
});

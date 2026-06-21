/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  canShowContactCreateActions,
  getContactDetailsVisibleTabs,
  resolveContactDetailsActiveTab,
} from "@/lib/contacts/dialogAccess";

describe("ContactDetailsDialog canEdit gating", () => {
  it("hides edit-only tabs and create actions in read-only mode", () => {
    expect(getContactDetailsVisibleTabs(false)).toEqual([
      "info",
      "deals",
      "proposals",
      "emails",
      "timeline",
      "scoring",
      "journey",
    ]);
    expect(canShowContactCreateActions(false)).toBe(false);
  });

  it("keeps edit available when canEdit is true", () => {
    expect(getContactDetailsVisibleTabs(true)).toEqual([
      "info",
      "edit",
      "lists",
      "deals",
      "proposals",
      "emails",
      "timeline",
      "scoring",
      "journey",
    ]);
    expect(canShowContactCreateActions(true)).toBe(true);
  });

  it("forces the active tab back to info when edit is no longer allowed", () => {
    expect(resolveContactDetailsActiveTab(true, "edit")).toBe("edit");
    expect(resolveContactDetailsActiveTab(false, "edit")).toBe("info");
    expect(resolveContactDetailsActiveTab(false, "timeline")).toBe("timeline");
  });
});

/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildContactScopeOrFilter,
  contactMatchesScope,
  getContactScopeUserIds,
  normalizeContactScope,
} from "../scope";

const baseContact = {
  id: "contact-1",
  entity_id: "entity-1",
  organization_id: "org-1",
  assigned_to: null,
  created_by: null,
};

describe("contact scope helpers", () => {
  it("normalizes onlyMine to OWNED without widening TEAM to ORG", () => {
    expect(normalizeContactScope("TEAM", false)).toBe("TEAM");
    expect(normalizeContactScope("ALL", false)).toBe("ORG");
    expect(normalizeContactScope("ORG", true)).toBe("OWNED");
  });

  it("keeps business, auth and team ids for mixed ownership rows", () => {
    expect(getContactScopeUserIds("biz-1", "auth-1", ["team-1", "biz-1"])).toEqual([
      "biz-1",
      "auth-1",
      "team-1",
    ]);
  });

  it("treats created_by as owned when assigned_to is empty", () => {
    expect(contactMatchesScope(
      { ...baseContact, created_by: "auth-1" },
      { scope: "OWNED", scopedUserIds: ["biz-1", "auth-1"], allowedOrgIds: ["org-1"] },
    )).toBe(true);
  });

  it("accepts TEAM rows owned by any team member but still enforces allowed orgs", () => {
    expect(contactMatchesScope(
      { ...baseContact, assigned_to: "team-2", organization_id: "org-2" },
      { scope: "TEAM", scopedUserIds: ["biz-1", "team-2"], allowedOrgIds: ["org-2"] },
    )).toBe(true);

    expect(contactMatchesScope(
      { ...baseContact, assigned_to: "team-2", organization_id: "org-3" },
      { scope: "TEAM", scopedUserIds: ["biz-1", "team-2"], allowedOrgIds: ["org-2"] },
    )).toBe(false);
  });

  it("blocks NONE scope and org rows outside the allowed org set", () => {
    expect(contactMatchesScope(
      { ...baseContact, organization_id: "org-1" },
      { scope: "NONE", scopedUserIds: ["biz-1"], allowedOrgIds: ["org-1"] },
    )).toBe(false);

    expect(contactMatchesScope(
      { ...baseContact, organization_id: "org-9" },
      { scope: "ORG", scopedUserIds: ["biz-1"], allowedOrgIds: ["org-1"] },
    )).toBe(false);
  });

  it("builds OR filters with assigned_to and created_by for every scoped id", () => {
    expect(buildContactScopeOrFilter("TEAM", ["biz-1", "auth-1", "team-1"])).toBe(
      "assigned_to.eq.biz-1,created_by.eq.biz-1,assigned_to.eq.auth-1,created_by.eq.auth-1,assigned_to.eq.team-1,created_by.eq.team-1",
    );
    expect(buildContactScopeOrFilter("ORG", ["biz-1"])).toBeNull();
  });
});

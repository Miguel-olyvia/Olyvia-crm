/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { findScopedContactByRef } from "../resolution";

const contacts = [
  {
    id: "contact-owned",
    entity_id: "entity-shared",
    organization_id: "org-visible",
    assigned_to: null,
    created_by: "auth-visible",
  },
  {
    id: "contact-hidden",
    entity_id: "entity-shared",
    organization_id: "org-hidden",
    assigned_to: "team-hidden",
    created_by: null,
  },
  {
    id: "contact-team",
    entity_id: "entity-team",
    organization_id: "org-visible",
    assigned_to: "team-2",
    created_by: null,
  },
];

describe("scoped contact resolution", () => {
  it("resolves by contact id and entity_id only inside the visible scope", () => {
    const scope = {
      scope: "OWNED" as const,
      scopedUserIds: ["biz-visible", "auth-visible"],
      allowedOrgIds: ["org-visible"],
    };

    expect(findScopedContactByRef(contacts, "contact-owned", scope)?.id).toBe("contact-owned");
    expect(findScopedContactByRef(contacts, "entity-shared", scope)?.id).toBe("contact-owned");
  });

  it("does not fall back to a globally matching but out-of-scope contact", () => {
    const scope = {
      scope: "OWNED" as const,
      scopedUserIds: ["biz-visible", "auth-visible"],
      allowedOrgIds: ["org-visible"],
    };

    expect(findScopedContactByRef(contacts, "contact-hidden", scope)).toBeNull();
  });

  it("keeps TEAM scope consistent for refs that match by entity id", () => {
    const scope = {
      scope: "TEAM" as const,
      scopedUserIds: ["biz-visible", "team-2"],
      allowedOrgIds: ["org-visible"],
    };

    expect(findScopedContactByRef(contacts, "entity-team", scope)?.id).toBe("contact-team");
  });
});

import { describe, it, expect } from "vitest";
import { computeStrictShouldBlock } from "@/lib/duplicateBlockingRule";
import type { DuplicateMatch } from "@/components/shared/DuplicateEntityDialog";

function m(partial: Partial<DuplicateMatch>): DuplicateMatch {
  return {
    id: partial.id ?? "row-1",
    entityId: partial.entityId ?? "e-1",
    displayName: partial.displayName ?? "Test",
    email: partial.email ?? null,
    phone: partial.phone ?? null,
    status: partial.status ?? "active",
    type: partial.type ?? "lead",
    createdAt: partial.createdAt ?? new Date().toISOString(),
    matchField: partial.matchField,
    matchFields: partial.matchFields,
    scope: partial.scope,
    primaryOrgId: partial.primaryOrgId ?? null,
    primaryOrgName: partial.primaryOrgName ?? null,
    ownerOrgAccessible: partial.ownerOrgAccessible ?? false,
  };
}

describe("computeStrictShouldBlock", () => {
  it("does not block when matches list is empty", () => {
    expect(computeStrictShouldBlock([]).shouldBlock).toBe(false);
  });

  it("does not block on a single same-org phone-only match", () => {
    const r = computeStrictShouldBlock([m({ matchField: "phone", scope: "same_org" })]);
    expect(r.shouldBlock).toBe(false);
    expect(r.sameOrgBlock).toBe(false);
  });

  it("does not block on a single same-org nif-only match (NIF checkbox path)", () => {
    const r = computeStrictShouldBlock([m({ matchField: "nif", scope: "same_org" })]);
    expect(r.shouldBlock).toBe(false);
  });

  it("blocks on any same-org email match", () => {
    const r = computeStrictShouldBlock([m({ matchField: "email", scope: "same_org" })]);
    expect(r.shouldBlock).toBe(true);
    expect(r.sameOrgBlock).toBe(true);
  });

  it("blocks when a same-org entity has 2+ strong field coincidences (matchFields[])", () => {
    const r = computeStrictShouldBlock([
      m({ entityId: "e-1", matchFields: ["phone", "nif"], scope: "same_org" }),
    ]);
    expect(r.shouldBlock).toBe(true);
    expect(r.sameOrgBlock).toBe(true);
  });

  it("blocks on any cross-org strong match", () => {
    const r = computeStrictShouldBlock([m({ matchField: "phone", scope: "group" })]);
    expect(r.shouldBlock).toBe(true);
    expect(r.crossOrgStrong).toBe(true);
  });

  it("blocks when every match is cross-org (no same-org reason to create here)", () => {
    const r = computeStrictShouldBlock([
      m({ id: "a", entityId: "e-1", matchField: "phone", scope: "group" }),
      m({ id: "b", entityId: "e-2", matchField: "nif", scope: "group" }),
    ]);
    expect(r.shouldBlock).toBe(true);
    expect(r.onlyCrossOrg).toBe(true);
  });

  it("does not block when same-org has only one weak-ish field (nif) and no cross-org strong", () => {
    const r = computeStrictShouldBlock([
      m({ entityId: "e-1", matchField: "nif", scope: "same_org" }),
      m({ entityId: "e-1", matchField: "phone", scope: "same_org" }),
    ]);
    // Two strong same-org fields on the same entity → block
    expect(r.shouldBlock).toBe(true);
    expect(r.sameOrgBlock).toBe(true);
  });
});

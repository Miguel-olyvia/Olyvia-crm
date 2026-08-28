/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { resolveContractsScopeUserIds } from "../scope";

describe("resolveContractsScopeUserIds", () => {
  it("ORG returns null (no restriction), regardless of team membership", () => {
    expect(resolveContractsScopeUserIds("ORG", "user-1", ["team-1", "team-2"])).toBeNull();
    expect(resolveContractsScopeUserIds("ORG", null, [])).toBeNull();
  });

  it("NONE returns an empty list, even when the viewer id is known", () => {
    expect(resolveContractsScopeUserIds("NONE", "user-1", ["team-1"])).toEqual([]);
  });

  it("OWNED returns only the viewer's own id", () => {
    expect(resolveContractsScopeUserIds("OWNED", "user-1", ["team-1", "team-2"])).toEqual(["user-1"]);
  });

  it("OWNED never includes teamMemberIds, even when the array is non-empty", () => {
    const ids = resolveContractsScopeUserIds("OWNED", "user-1", ["team-1", "team-2"]);
    expect(ids).not.toContain("team-1");
    expect(ids).not.toContain("team-2");
  });

  it("OWNED with no resolved viewer id returns an empty list (never 'everyone')", () => {
    expect(resolveContractsScopeUserIds("OWNED", null, ["team-1"])).toEqual([]);
  });

  it("TEAM returns the viewer plus every team member id", () => {
    expect(resolveContractsScopeUserIds("TEAM", "user-1", ["team-1", "team-2"])).toEqual([
      "user-1", "team-1", "team-2",
    ]);
  });

  it("TEAM with no resolved viewer id still returns the team member ids", () => {
    expect(resolveContractsScopeUserIds("TEAM", null, ["team-1"])).toEqual(["team-1"]);
  });

  it("TEAM deduplicates when the viewer id also appears in teamMemberIds", () => {
    expect(resolveContractsScopeUserIds("TEAM", "user-1", ["user-1", "team-2"])).toEqual([
      "user-1", "team-2",
    ]);
  });

  it("TEAM ignores falsy entries inside teamMemberIds", () => {
    expect(resolveContractsScopeUserIds("TEAM", "user-1", ["", "team-2"] as string[])).toEqual([
      "user-1", "team-2",
    ]);
  });

  it("defaults teamMemberIds to empty when omitted", () => {
    expect(resolveContractsScopeUserIds("TEAM", "user-1")).toEqual(["user-1"]);
    expect(resolveContractsScopeUserIds("OWNED", "user-1")).toEqual(["user-1"]);
  });
});

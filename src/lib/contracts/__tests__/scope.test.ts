/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { resolveContractsScopeUserIds, canActOnContract } from "../scope";

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

describe("canActOnContract", () => {
  it("NONE always rejects, regardless of ownership or assignment", () => {
    expect(canActOnContract("NONE", { created_by: "user-1", assigned_to: "user-1" }, "user-1")).toBe(false);
  });

  it("ORG always allows, regardless of ownership or assignment", () => {
    expect(canActOnContract("ORG", { created_by: "someone-else", assigned_to: "someone-else" }, "user-1")).toBe(true);
  });

  it("OWNED allows when the viewer created the contract", () => {
    expect(canActOnContract("OWNED", { created_by: "user-1", assigned_to: null }, "user-1")).toBe(true);
  });

  // The case that motivates the whole task: created by A, assigned to B.
  // B, with OWNED scope, must now be able to act on it.
  it("OWNED allows when the contract was created by someone else but ASSIGNED to the viewer", () => {
    expect(canActOnContract("OWNED", { created_by: "user-A", assigned_to: "user-B" }, "user-B")).toBe(true);
  });

  it("OWNED rejects when the viewer neither created nor is assigned the contract", () => {
    expect(canActOnContract("OWNED", { created_by: "user-A", assigned_to: "user-C" }, "user-B")).toBe(false);
  });

  it("OWNED rejects when the viewer id is null", () => {
    expect(canActOnContract("OWNED", { created_by: "user-1", assigned_to: "user-1" }, null)).toBe(false);
  });

  it("TEAM allows when the contract is assigned to a team member (not the creator)", () => {
    expect(
      canActOnContract("TEAM", { created_by: "user-A", assigned_to: "team-1" }, "user-leader", ["team-1", "team-2"]),
    ).toBe(true);
  });

  it("TEAM rejects when neither created_by nor assigned_to is the viewer or a team member", () => {
    expect(
      canActOnContract("TEAM", { created_by: "outsider", assigned_to: "another-outsider" }, "user-leader", ["team-1"]),
    ).toBe(false);
  });

  it("treats missing assigned_to (null/undefined) as simply not matching, without throwing", () => {
    expect(canActOnContract("OWNED", { created_by: "user-1" }, "user-1")).toBe(true);
    expect(canActOnContract("OWNED", { created_by: null, assigned_to: undefined }, "user-1")).toBe(false);
  });
});

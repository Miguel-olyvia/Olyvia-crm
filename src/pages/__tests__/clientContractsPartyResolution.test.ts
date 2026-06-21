// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveContractPartyFromProposal } from "../clientContractsPartyResolution";

describe("resolveContractPartyFromProposal", () => {
  it("allows contract creation for a contact that has an entity but is not yet a client", () => {
    expect(resolveContractPartyFromProposal({
      entity_id: "entity-1",
      _resolvedClientId: null,
    })).toEqual({
      entityId: "entity-1",
      clientId: null,
    });
  });

  it("rejects a proposal without an associated entity", () => {
    expect(() => resolveContractPartyFromProposal({
      entity_id: null,
      _resolvedEntityId: null,
      _resolvedClientId: null,
    })).toThrow("Contact not found.");
  });
});

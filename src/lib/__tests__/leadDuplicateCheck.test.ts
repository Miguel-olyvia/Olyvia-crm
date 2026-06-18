import { describe, it, expect, vi } from "vitest";
import {
  checkNameDuplicatesBeforeInsert,
  NameDupCheckClient,
} from "@/lib/leadDuplicateCheck";

function makeClient(overrides: Partial<NameDupCheckClient> = {}): NameDupCheckClient {
  return {
    searchEntitiesByName: vi.fn().mockResolvedValue([]),
    findLeadsByEntityIds: vi.fn().mockResolvedValue([]),
    findContactsByEntityIds: vi.fn().mockResolvedValue([]),
    findClientsByEntityIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("checkNameDuplicatesBeforeInsert (L2)", () => {
  it("returns no duplicates and skips queries when name is empty", async () => {
    const client = makeClient();
    const result = await checkNameDuplicatesBeforeInsert("   ", "org-1", client);
    expect(result.hasDuplicates).toBe(false);
    expect(client.searchEntitiesByName).not.toHaveBeenCalled();
  });

  it("returns no duplicates for the placeholder 'Lead sem nome'", async () => {
    const client = makeClient();
    const result = await checkNameDuplicatesBeforeInsert("Lead sem nome", "org-1", client);
    expect(result.hasDuplicates).toBe(false);
    expect(client.searchEntitiesByName).not.toHaveBeenCalled();
  });

  it("returns no duplicates when no entities match the name", async () => {
    const client = makeClient({
      searchEntitiesByName: vi.fn().mockResolvedValue([]),
    });
    const result = await checkNameDuplicatesBeforeInsert("Maria Silva", "org-1", client);
    expect(result.hasDuplicates).toBe(false);
    expect(client.findLeadsByEntityIds).not.toHaveBeenCalled();
  });

  it("returns no duplicates when entities match but no leads/contacts/clients exist in org", async () => {
    const client = makeClient({
      searchEntitiesByName: vi.fn().mockResolvedValue([{ id: "e-1" }]),
    });
    const result = await checkNameDuplicatesBeforeInsert("Maria Silva", "org-1", client);
    expect(result.hasDuplicates).toBe(false);
    expect(result.matchedEntityIds).toEqual(["e-1"]);
  });

  it("flags duplicates when a matching entity has an active lead in the same org", async () => {
    const client = makeClient({
      searchEntitiesByName: vi.fn().mockResolvedValue([{ id: "e-1" }]),
      findLeadsByEntityIds: vi.fn().mockResolvedValue([{ id: "l-1", entity_id: "e-1" }]),
    });
    const result = await checkNameDuplicatesBeforeInsert("Maria Silva", "org-1", client);
    expect(result.hasDuplicates).toBe(true);
    expect(result.leads).toHaveLength(1);
    // Critical assertion: the check happened BEFORE any entity insert would
    // have run (we never called any insert API in this helper).
  });

  it("normalises name (trim + lowercase) before searching", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const client = makeClient({ searchEntitiesByName: search });
    await checkNameDuplicatesBeforeInsert("  MARIA Silva  ", "org-1", client);
    expect(search).toHaveBeenCalledWith("maria silva", 20);
  });
});

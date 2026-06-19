/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { resolveRootOrganizationId } from "../../../supabase/functions/_shared/leadsValidation";

describe("resolveRootOrganizationId", () => {
  it("uses the SQL function parameter name from the migration contract", async () => {
    let receivedParams: Record<string, unknown> | null = null;
    const supabase = {
      rpc: async (_name: string, params: Record<string, unknown>) => {
        receivedParams = params;
        return { data: "root-org", error: null };
      },
    };

    await expect(resolveRootOrganizationId(supabase, "child-org")).resolves.toBe("root-org");
    expect(receivedParams).toEqual({ p_org_id: "child-org" });
  });
});

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getWorkflowPermissionForSourceEntity,
  resolveWorkflowOrganizationFromRecord,
} from "../_shared/leadsValidation.ts";

Deno.test("execute-workflow derives organization from the persisted record instead of the request body", () => {
  const derivedOrgId = resolveWorkflowOrganizationFromRecord("lead", {
    id: "lead-1",
    organization_id: "org-from-row",
  });

  assertEquals(derivedOrgId, "org-from-row");
});

Deno.test("execute-workflow requires the module permission for the actual source entity", () => {
  assertEquals(getWorkflowPermissionForSourceEntity("lead"), "leads.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("deal"), "deals.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("quote"), "quotes.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("proposal"), "proposals.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("contract"), "client_contracts.edit");
});

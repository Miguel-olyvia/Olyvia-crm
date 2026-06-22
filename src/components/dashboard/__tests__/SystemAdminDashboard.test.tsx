/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SystemAdminDashboard", () => {
  it("loads aggregate metrics through the dedicated RPC only", async () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/SystemAdminDashboard.tsx"),
      "utf8",
    );

    expect(source).toContain('"get_system_admin_dashboard_stats"');
    expect(source).not.toContain('.from("deals")');
    expect(source).not.toContain('.from("anew_users")');
    expect(source).not.toContain('.from("anew_memberships")');
    expect(source).not.toContain('.from("anew_organizations")');
  });
});

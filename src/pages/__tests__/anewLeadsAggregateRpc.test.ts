/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "src/pages/AnewLeads.tsx"),
  "utf8",
);

describe("AnewLeads aggregate data loading", () => {
  it("loads health data through the aggregate RPC instead of raw history rows", () => {
    expect(pageSource).toContain('.rpc("get_lead_page_health"');
    expect(pageSource).not.toContain('.from("entity_interactions")\n            .select("entity_id")');
    expect(pageSource).not.toContain('.from("deals")\n            .select("entity_id")');
  });

  it("loads distinct source options through a scoped RPC", () => {
    expect(pageSource).toContain('.rpc("get_lead_source_options"');
    expect(pageSource).not.toContain('.from("anew_leads").select("source")');
    expect(pageSource).not.toContain(".limit(5000)");
  });
});

/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/AnewLeads.tsx"),
  "utf8",
);

describe("AnewLeads initialization order", () => {
  it("declares onlyMine before the deep-link effect reads it", () => {
    const declarationIndex = source.indexOf(
      "const [onlyMine, setOnlyMine] = useState(false)",
    );
    const deepLinkEffectIndex = source.indexOf(
      "// Deep-link: ?open=<leadId>",
    );

    expect(declarationIndex).toBeGreaterThan(-1);
    expect(deepLinkEffectIndex).toBeGreaterThan(-1);
    expect(declarationIndex).toBeLessThan(deepLinkEffectIndex);
  });
});

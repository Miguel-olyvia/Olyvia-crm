import { describe, expect, it } from "vitest";
import { escapeHtml, sanitizeRichHtml } from "@/utils/sanitize";

describe("sanitize utilities", () => {
  it("removes scripts and event handlers from rich html", () => {
    const dirty = '<p>Hello</p><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeRichHtml(dirty);

    expect(clean).toContain("<p>Hello</p>");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("<img");
  });

  it("preserves tables and data-table chip attributes", () => {
    const html = '<table data-contract-manual-table="true"><thead><tr><th>A</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>' +
      '<span data-contract-table="quote_items" data-config="eyJ0Ijoxfg==" contenteditable="false">{{tabela_artigos}}</span>';
    const clean = sanitizeRichHtml(html);
    expect(clean).toContain("<table");
    expect(clean).toContain("<thead>");
    expect(clean).toContain("<td>x</td>");
    expect(clean).toContain('data-contract-manual-table="true"');
    expect(clean).toContain('data-contract-table="quote_items"');
    expect(clean).toContain('data-config="eyJ0Ijoxfg=="');
    expect(clean).toContain('contenteditable="false"');
    expect(clean).toContain("{{tabela_artigos}}");
  });

  it("escapes html special characters", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});

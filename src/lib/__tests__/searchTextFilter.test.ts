import { describe, expect, it } from "vitest";
import { applySearchTextFilter, splitSearchWords } from "@/lib/searchTextFilter";

/**
 * Fake PostgREST filter builder: records every `.ilike()` call so the tests can
 * assert on the exact filters that would be sent, without a network round trip.
 */
function fakeQuery() {
  const calls: Array<{ column: string; pattern: string }> = [];
  const q = {
    calls,
    ilike(column: string, pattern: string) {
      calls.push({ column, pattern });
      return q;
    },
  };
  return q;
}

describe("splitSearchWords", () => {
  it("splits on whitespace and lowercases", () => {
    expect(splitSearchWords("Maria SILVA")).toEqual(["maria", "silva"]);
  });

  it("collapses runs of whitespace, tabs and newlines like regexp_split_to_array(..., '\\s+')", () => {
    expect(splitSearchWords("  maria \t  da \n silva  ")).toEqual(["maria", "da", "silva"]);
  });

  it("returns no words for an empty or whitespace-only term", () => {
    expect(splitSearchWords("")).toEqual([]);
    expect(splitSearchWords("   ")).toEqual([]);
  });

  it("keeps a single word intact", () => {
    expect(splitSearchWords("Q-2026-1576")).toEqual(["q-2026-1576"]);
  });

  it("keeps accents and punctuation inside a word — search_text is matched verbatim", () => {
    expect(splitSearchWords("Renovação, WC")).toEqual(["renovação,", "wc"]);
  });

  it("does NOT escape ilike wildcards, matching the SQL predicate's own behaviour", () => {
    // get_quotes_kpi_stats builds '%' || w || '%' without escaping. Escaping
    // here would make the list and the KPI cards disagree for such a term.
    expect(splitSearchWords("50%")).toEqual(["50%"]);
    expect(splitSearchWords("a_b")).toEqual(["a_b"]);
  });
});

describe("applySearchTextFilter", () => {
  it("adds one ilike per word, all on search_text (AND between words)", () => {
    const q = applySearchTextFilter(fakeQuery(), ["maria", "silva"]);
    expect(q.calls).toEqual([
      { column: "search_text", pattern: "%maria%" },
      { column: "search_text", pattern: "%silva%" },
    ]);
  });

  it("is order-agnostic: the same words in any order produce the same filter set", () => {
    const a = applySearchTextFilter(fakeQuery(), ["maria", "silva"]).calls;
    const b = applySearchTextFilter(fakeQuery(), ["silva", "maria"]).calls;
    expect([...a].sort((x, y) => x.pattern.localeCompare(y.pattern)))
      .toEqual([...b].sort((x, y) => x.pattern.localeCompare(y.pattern)));
  });

  it("leaves the query untouched when there are no words", () => {
    expect(applySearchTextFilter(fakeQuery(), []).calls).toEqual([]);
  });

  it("matches a non-contiguous phrase: every word of the term is required, not the phrase", () => {
    // "proposta cliente X" against "Proposta para o cliente X" — the exact
    // case the single-phrase ILIKE/strpos it replaces used to miss.
    const searchText = "proposta para o cliente x";
    const words = splitSearchWords("Proposta cliente X");
    const matchesEveryWord = words.every((w) => searchText.includes(w));
    expect(matchesEveryWord).toBe(true);
    expect(searchText.includes("proposta cliente x")).toBe(false);
  });
});

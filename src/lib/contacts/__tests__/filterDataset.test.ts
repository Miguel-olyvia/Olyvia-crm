import { describe, expect, it } from "vitest";

import {
  matchesContactAttentionFilters,
  needsCompleteContactDataset,
} from "../filterDataset";

describe("needsCompleteContactDataset", () => {
  it("loads the complete dataset for filters that depend on global contact data", () => {
    expect(needsCompleteContactDataset({
      dealsFilter: "all",
      noContact7dFilter: false,
      noContact14dFilter: false,
      smartFilter: true,
    })).toBe(true);

    expect(needsCompleteContactDataset({
      dealsFilter: "all",
      noContact7dFilter: true,
      noContact14dFilter: false,
      smartFilter: false,
    })).toBe(true);
  });

  it("keeps the paginated dataset when no global filter is active", () => {
    expect(needsCompleteContactDataset({
      dealsFilter: "all",
      noContact7dFilter: false,
      noContact14dFilter: false,
      smartFilter: false,
    })).toBe(false);
  });
});

describe("matchesContactAttentionFilters", () => {
  it("keeps the no-contact filter independent from the attention health rule", () => {
    expect(matchesContactAttentionFilters({
      healthScore: 85,
      daysSinceLastContact: 10,
      noContact7dFilter: true,
      noContact14dFilter: false,
      smartFilter: false,
    })).toBe(true);
  });

  it("requires both low health and more than seven days for attention", () => {
    expect(matchesContactAttentionFilters({
      healthScore: 35,
      daysSinceLastContact: 10,
      noContact7dFilter: false,
      noContact14dFilter: false,
      smartFilter: true,
    })).toBe(true);
    expect(matchesContactAttentionFilters({
      healthScore: 75,
      daysSinceLastContact: 10,
      noContact7dFilter: false,
      noContact14dFilter: false,
      smartFilter: true,
    })).toBe(false);
  });
});

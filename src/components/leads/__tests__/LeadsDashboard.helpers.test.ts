/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildDashboardScopedRpcParams,
  deriveDashboardKpis,
  getDashboardRenderState,
  resolveDashboardDateRange,
  type LeadsDashboardQuery,
} from "../leadsDashboardHelpers";

const scopedQuery: LeadsDashboardQuery = {
  orgId: "org-1",
  isRoot: true,
  requestedScope: "TEAM",
  anewUserId: "anew-user-1",
  authUserId: "auth-user-1",
  filters: {
    search: "maria",
    status: "qualified",
    campaignId: "camp-9",
    assignedTo: "unassigned",
    contactResult: "none",
    source: "manual",
    dateFrom: "2026-06-01T00:00:00.000Z",
    dateTo: "2026-06-10T23:59:59.999Z",
  },
};

describe("buildDashboardScopedRpcParams", () => {
  it("passes scoped ids and filters to the scoped RPC contract", () => {
    const dateRange = resolveDashboardDateRange(scopedQuery.filters);
    const params = buildDashboardScopedRpcParams(scopedQuery, dateRange);

    expect(params).toMatchObject({
      p_org_id: "org-1",
      p_is_root: true,
      p_scope: "TEAM",
      p_anew_user_id: "anew-user-1",
      p_auth_user_id: "auth-user-1",
      p_search: "maria",
      p_status: "qualified",
      p_campaign_id: "camp-9",
      p_assigned_unassigned: true,
      p_contact_result_none: true,
      p_source: "manual",
    });
    expect(params.p_date_from).toBe("2026-06-01T00:00:00.000Z");
    expect(params.p_date_to).toBe("2026-06-10T23:59:59.999Z");
  });

  it("maps none-style filters without widening them into fake values", () => {
    const params = buildDashboardScopedRpcParams(
      {
        ...scopedQuery,
        filters: {
          assignedTo: "all",
          contactResult: "contacted",
          source: "none",
          status: "all",
        },
      },
      {
        from: new Date("2026-06-01T00:00:00.000Z"),
        to: new Date("2026-06-02T00:00:00.000Z"),
      },
    );

    expect(params.p_assigned_to).toBeUndefined();
    expect(params.p_assigned_unassigned).toBeUndefined();
    expect(params.p_status).toBeUndefined();
    expect(params.p_contact_result).toBe("contacted");
    expect(params.p_source_is_null).toBe(true);
    expect(params.p_source).toBeUndefined();
  });
});

describe("getDashboardRenderState", () => {
  it("requires the scoped query before rendering KPI data", () => {
    expect(getDashboardRenderState({ query: null, loading: false, error: null, stats: null })).toBe("missing_query");
  });

  it("returns loading and error modes explicitly, without pretending data exists", () => {
    expect(getDashboardRenderState({ query: scopedQuery, loading: true, error: null, stats: null })).toBe("loading");
    expect(getDashboardRenderState({ query: scopedQuery, loading: false, error: "boom", stats: null })).toBe("error");
  });

  it("only becomes ready when scoped stats exist", () => {
    expect(
      getDashboardRenderState({
        query: scopedQuery,
        loading: false,
        error: null,
        stats: { active_pipeline: 10 },
      }),
    ).toBe("ready");
  });
});

describe("deriveDashboardKpis", () => {
  it("derives KPI values from scoped RPC stats instead of paginated leads fallback", () => {
    const kpis = deriveDashboardKpis({
      stats: {
        active_pipeline: 101,
        leads_in_period: 12,
        leads_today: 4,
        contact_attempts: 9,
        visits_scheduled: 3,
        converted_in_period: 2,
        cohort_conversions: 1,
        status_counts: {
          pending: 7,
          qualified: 5,
        },
        assigned_counts: {
          "anew-user-1": 8,
        },
      },
      comparisonStats: {
        leads_in_period: 6,
      },
      dateRange: {
        from: new Date("2026-06-01T00:00:00.000Z"),
        to: new Date("2026-06-06T00:00:00.000Z"),
      },
    });

    expect(kpis.totalLeads).toBe(101);
    expect(kpis.leadsInPeriod).toBe(12);
    expect(kpis.totalGrowth).toBe(100);
    expect(kpis.totalContactAttempts).toBe(9);
    expect(kpis.pendingLeads).toBe(7);
    expect(kpis.qualifiedLeads).toBe(5);
    expect(kpis.avgLeadsPerDay).toBe(2);
    expect(kpis.conversionRate).toBe("8.3");
    expect(kpis.leadsByAssignee).toEqual({ "anew-user-1": 8 });
  });

  it("keeps unavailable metrics null instead of inventing zeroes", () => {
    const kpis = deriveDashboardKpis({
      stats: {
        active_pipeline: 20,
        leads_in_period: 0,
        status_counts: {},
      },
      comparisonStats: null,
      dateRange: {
        from: new Date("2026-06-01T00:00:00.000Z"),
        to: new Date("2026-06-30T00:00:00.000Z"),
      },
    });

    expect(kpis.totalContactAttempts).toBeNull();
    expect(kpis.visitsScheduled).toBeNull();
    expect(kpis.convertedLeads).toBeNull();
    expect(kpis.conversionRate).toBeNull();
  });
});

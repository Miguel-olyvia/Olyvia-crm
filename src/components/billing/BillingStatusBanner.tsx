import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { useBillingOverview } from "@/hooks/useBillingOverview";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { getBannerState } from "@/components/billing/billingUtils";

const P = "billing.page.banner.";
const dismissKey = (orgId: string) => `billing-banner-dismissed:${orgId}`;

function readDismissed(orgId: string): boolean {
  try {
    return window.sessionStorage.getItem(dismissKey(orgId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Global billing status strip. Shows only for past_due, expired, or a trial with
 * 7 days or fewer left. Nothing while loading and nothing when the overview fails.
 * Only the trial reminder can be dismissed (for this session); blocking states stay.
 */
export function BillingStatusBanner() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { overview } = useBillingOverview(orgId);
  // sessionStorage is the source of truth (survives navigation); this only forces a re-render.
  const [dismissedOrgs, setDismissedOrgs] = useState<string[]>([]);

  if (!orgId || !overview) return null;
  const state = getBannerState(overview);
  if (!state) return null;

  const isTrial = state.kind === "trial_ending";
  if (isTrial && (dismissedOrgs.includes(orgId) || readDismissed(orgId))) return null;

  const canManage = overview.can_manage_billing === true;
  const message =
    state.kind === "past_due"
      ? t(`${P}pastDue`)
      : state.kind === "expired"
        ? t(`${P}expired`)
        : state.days === 0
          ? t(`${P}trialLastDay`)
          : state.days === 1
            ? t(`${P}trialEndingOne`)
            : t(`${P}trialEnding`, { days: state.days ?? 0 });

  const dismiss = () => {
    setDismissedOrgs((prev) => [...prev, orgId]);
    try {
      window.sessionStorage.setItem(dismissKey(orgId), "1");
    } catch {
      // storage unavailable: dismissal lasts until the next render cycle only
    }
  };

  return (
    <div
      role={isTrial ? "status" : "alert"}
      data-testid="billing-status-banner"
      className={cn(
        "sticky top-0 z-20 shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm border-b",
        isTrial
          ? "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700"
          : "bg-red-50 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 break-words">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{message}</span>
        {canManage ? (
          <Link to="/billing" className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">
            {t(`${P}payerAction`)}
          </Link>
        ) : (
          <span className="font-medium">{t(`${P}nonPayerAction`)}</span>
        )}
      </span>
      {isTrial && (
        <button
          type="button"
          onClick={dismiss}
          aria-label={t(`${P}dismiss`)}
          className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default BillingStatusBanner;
